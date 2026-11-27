// UI-only toolbar arrangement; never alters Native tool registration or document state.
const KEY = 'ink.ui.toolbar.arrangement.v1';
const MAX_PRESET_BYTES = 16384;

export function normalizeToolbarArrangement(value,groups){
 const ids=groups.map(group=>group.id),allowed=new Set(ids),seen=new Set();
 if(!value||typeof value!=='object'||value.version!==1||!Array.isArray(value.visible)||!Array.isArray(value.extra))return {version:1,visible:[...ids],extra:[]};
 const take=items=>items.filter(id=>typeof id==='string'&&allowed.has(id)&&!seen.has(id)&&seen.add(id));
 const visible=take(value.visible),extra=take(value.extra);
 for(const id of ids)if(!seen.has(id))visible.push(id); // New groups stay discoverable on product upgrades.
 if(!visible.length&&extra.length)visible.push(extra.shift());
 return {version:1,visible,extra};
}

// `storage` and `allowPresetFiles` are optional UI-only Host seams. Native
// keeps its existing browser persistence/export behavior by default. The
// isolated Mock Preview injects an in-memory store and disables file IO.
export function mountToolbarCustomizer(root,groups,{signal,onLayoutChanged,feedback,storage,allowPresetFiles=true,presentation}={}){
 if(typeof presentation?.createDialog!=='function'||
    typeof presentation?.createRow!=='function'||
    typeof presentation?.status!=='function')throw Error('INK_PUBLIC_TOOLBAR_VIEW_REQUIRED');
 const store=storage??{
  getItem:key=>localStorage.getItem(key),
  setItem:(key,value)=>localStorage.setItem(key,value)
 };
 const rail=root.querySelector('.tool-area'),button=root.querySelector('#railCustomize');
 if(!rail||!button)throw Error('Toolbar customizer requires the existing rail and launcher');
 const cells=new Map([...rail.querySelectorAll('[data-group]')].map(el=>[el.dataset.group,el.closest('.tool-cell')]));
 const byId=new Map(groups.map(group=>[group.id,Object.freeze({
  id:group.id,label:group.label,icon:String(group.items?.[0]?.icon||'')
 })]));
 let state=normalizeToolbarArrangement(null,groups),draft=null,origin=null;
 try{state=normalizeToolbarArrangement(JSON.parse(store.getItem(KEY)||'null'),groups);}catch{ /* Storage unavailable: retain defaults. */ }

 const dialog=presentation.createDialog(document);
 if(dialog?.tagName!=='DIALOG')throw Error('INK_PUBLIC_TOOLBAR_DIALOG_CONTRACT');
 const fileInput=document.createElement('input');
 fileInput.type='file';fileInput.accept='.json,application/json';fileInput.hidden=true;
 dialog.append(fileInput);root.append(dialog);
 if(!allowPresetFiles){
  for(const control of dialog.querySelectorAll('[data-tb-action=save],[data-tb-action=load]')){
   control.disabled=true;
   control.title='Mock Preview: file presets are disabled';
  }
  fileInput.disabled=true;
 }

 function arrange(value){
  for(const id of [...value.visible,...value.extra]){const cell=cells.get(id);if(!cell)continue;cell.hidden=!value.visible.includes(id);rail.append(cell);}
  onLayoutChanged?.();
 }
 function message(value){dialog.querySelector('[role=status]').textContent=value;}
 function close(){if(dialog.open)dialog.close();draft=null;origin?.focus?.();}
 const row=(id,kind,index)=>presentation.createRow(document,{
  group:byId.get(id),kind,index,visibleLength:draft.visible.length
 });
 function repaint(){
  for(const kind of ['visible','extra']){
   const list=dialog.querySelector('[data-tb-list='+kind+']');
   list.replaceChildren(...draft[kind].map((id,i)=>row(id,kind,i)));
   if(!draft[kind].length)list.textContent=kind==='visible'?'尚無工具':'沒有輔助工具';
  }
  message(presentation.status(draft));
 }
 function open(){
  if(dialog.open)return;
  origin=document.activeElement;draft=normalizeToolbarArrangement(state,groups);
  repaint();dialog.showModal();dialog.querySelector('[data-tb-action=apply]').focus();
 }
 function move(action,id){
  const src=action==='show'?draft.extra:draft.visible,at=src.indexOf(id);
  if(at<0)return;
  if(action==='up'&&at>0){[src[at-1],src[at]]=[src[at],src[at-1]];}
  else if(action==='down'&&at<src.length-1){[src[at+1],src[at]]=[src[at],src[at+1]];}
  else if(action==='hide'&&draft.visible.length>1){src.splice(at,1);draft.extra.push(id);}
  else if(action==='show'){src.splice(at,1);draft.visible.push(id);}
  else return;
  repaint();
  dialog.querySelector('[data-tb-id='+id+']')?.focus();
 }
 function apply(){
  const next=normalizeToolbarArrangement(draft,groups);
  try{store.setItem(KEY,JSON.stringify(next));}
  catch{message('無法儲存工具列設定。檢查瀏覽器儲存權限後再試。');return;}
  state=next;arrange(state);close();feedback?.('工具列已更新');
 }
 function save(){
  if(!allowPresetFiles){message('Mock Preview does not save files.');return;}
  const data=JSON.stringify(normalizeToolbarArrangement(draft,groups),null,2);
  const url=URL.createObjectURL(new Blob([data],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download='INK-toolbar-preset.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),0);message('已產生工具列預設 JSON；可在其他瀏覽器載入。');
 }
 function onAction(event){
  const target=event.target.closest('button[data-tb-action]');if(!target)return;
  const action=target.dataset.tbAction;
  if(['up','down','hide','show'].includes(action))return move(action,target.dataset.tbId);
  if(action==='cancel')return close();
  if(action==='apply')return apply();
  if(action==='reset'){draft=normalizeToolbarArrangement(null,groups);repaint();return;}
  if(action==='save')return save();
  if(action==='load'){
   if(!allowPresetFiles){message('Mock Preview does not open files.');return;}
   return fileInput.click();
  }
 }
 async function onFileChange(){
  if(!allowPresetFiles)return;
  const file=fileInput.files?.[0];fileInput.value='';if(!file)return;
  if(!file.size||file.size>MAX_PRESET_BYTES){message('預設檔必須是 16KB 以下的 JSON。');return;}
  try{
   const parsed=JSON.parse(await file.text());
   if(!parsed||parsed.version!==1||!Array.isArray(parsed.visible)||!Array.isArray(parsed.extra))throw Error('檔案格式不正確');
   if(!parsed.visible.every(id=>typeof id==='string')||!parsed.extra.every(id=>typeof id==='string'))throw Error('工具 ID 格式不正確');
   draft=normalizeToolbarArrangement(parsed,groups);repaint();message('預設已載入草稿；按「完成」才套用。');
  }catch(error){message('載入失敗：'+(error.message||'無效的預設檔'));}
 }
 button.addEventListener('click',open,{signal});
 dialog.addEventListener('click',onAction,{signal});
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();},{signal});
 fileInput.addEventListener('change',onFileChange,{signal});
 signal?.addEventListener('abort',()=>{if(dialog.open)dialog.close();dialog.remove();},{once:true});
 arrange(state);
 return {dispose(){if(dialog.open)dialog.close();dialog.remove();}};
}
