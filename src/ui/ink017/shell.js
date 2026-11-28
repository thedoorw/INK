import {mountDock} from './right-dock.js';
import {esc,selected,field,iconButton,drag} from './shared-controls.js';
import {toolbarCustomizerPresentation} from './toolbar-customizer-view.js';

// Public presentation of the existing Native-owned tool registry. These
// callbacks receive detached display metadata only; Core chooses tools and
// computes availability in the compiled Workbench.
export function renderToolRail(groups){
 return groups.map(g=>'<div class="tool-cell'+(g.items.length>1?' tool-group-cell':'')+'"><button type="button" class="tool-button" data-group="'+g.id+'" aria-label="'+esc(g.label)+'"'+(g.items.length>1?' aria-haspopup="menu" aria-expanded="false" aria-controls="toolGroupMenu"':'')+'>'+g.items[0].icon+'</button></div>').join('');
}
export function updateToolRailButton(button,{group,item,available,active}){
 button.innerHTML=item.icon;
 button.title=item.label+(group.items.length>1?'（按住或右鍵展開）':'');
 button.setAttribute('aria-label',item.label);
 button.disabled=!available;
 button.setAttribute('aria-pressed',String(active));
 button.classList.toggle('active',active);
}

// The Public UI may adjust the complete visible Tools rail, popover and
// options layout. Core retains the commands, availability and event handlers.
// Keep data-group, data-variant, data-action and input identifiers intact.
export function renderToolMenu(group,items){
 return items.map(item=>'<button type="button" class="drawing-tool-option" data-ui-presentation="public" role="menuitemradio" data-variant="'+item.id+'" aria-checked="'+String(item.active)+'"'+(item.available?'':' disabled')+' title="'+esc(item.available?item.label:item.reason||'Unavailable')+'">'+item.icon+'<span>'+esc(item.label)+'</span></button>').join('');
}
export function updateToolContextIdentity(element,{label}){element.textContent=label;}
export function decorateToolOptions(element,{groupId,itemId}){
 element.dataset.uiPresentation='public';
 element.dataset.uiGroup=groupId;
 element.dataset.uiItem=itemId;
}
export function decorateToolWorkbench(root){root.dataset.uiToolsOwner='public';}
export function createToolGroupMenu(root){
 const menu=document.createElement('div');
 menu.id='toolGroupMenu';menu.className='drawing-tool-menu';
 menu.setAttribute('popover','manual');menu.setAttribute('role','menu');
 root.append(menu);return menu;
}
export function renderToolOptionsContainers(){
 return '<div id="contextToolOptions"></div><div id="transformControls" hidden></div>';
}
export function createMoreToolOptions(){
 const extra=document.createElement('div');extra.className='context-more-menu';extra.id='toolOptionsMore';
 extra.setAttribute('popover','auto');extra.setAttribute('role','group');extra.setAttribute('aria-label','更多工具選項');
 const more=document.createElement('button');more.type='button';more.className='context-drawing-more';
 more.textContent='更多';more.setAttribute('aria-expanded','false');more.setAttribute('aria-controls',extra.id);
 return {extra,more};
}
export function updateContextToggle(toggle,expanded){
 toggle.setAttribute('aria-label',expanded?'收合工具選項':'展開工具選項');
 toggle.title=toggle.getAttribute('aria-label');
 toggle.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="'+
  (expanded?'M6 9l6 6 6-6':'M6 15l6-6 6 6')+'" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
}

// Public-owned presentation depends on the narrow adapter supplied by the
// compiled Core entry; never construct or import a second Native host here.
export async function mountNativeShell(host,root){
 // External Public-owned UI uses the same canonical source in preview and Runtime.
 const {mountMenuUi}=await import(new URL('./menu-ui.js',import.meta.url).href);
 if(typeof mountMenuUi!=='function')throw Error('INK_UI_MENU_MODULE_CONTRACT');
 const $=s=>root.querySelector(s),dock=mountDock($('#rightDock'),host),abort=new AbortController(),{signal}=abort;
 const menu=$('#mainMenu'),overlay=$('#overlay');let dialogAbort,importTarget,menuUi=null,dialogReturnFocus=null;
 const feedback=message=>{const toast=$('#ui017Toast');toast.textContent=message;clearTimeout(feedback.timer);feedback.timer=setTimeout(()=>toast.textContent='',4000)};
 const run=async(id,args={})=>{const r=await host.execute(id,args);if(!r.ok)feedback(r.error.message);return r};
 host.subscribeCommands(e=>{if(!e.result.ok)feedback(e.result.error)});
 const close=()=>{dialogAbort?.abort();const wasOpen=!overlay.hidden;overlay.hidden=true;overlay.replaceChildren();if(wasOpen){const focus=dialogReturnFocus;dialogReturnFocus=null;focus?.focus?.()}};
 function dialog(title,content,apply){close();dialogReturnFocus=document.activeElement;dialogAbort=new AbortController();overlay.hidden=false;overlay.innerHTML=`<section class="dialog dialog-compact" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="dialog-header"><strong>${esc(title)}</strong><button class="dialog-close" aria-label="Close">×</button></header><div class="dialog-body">${content}</div><p class="dialog-status" data-dialog-status role="status"></p><footer class="dialog-footer"><button type="button" data-cancel>Cancel</button><button type="button" class="primary" data-apply>Apply</button></footer></section>`;
  const sig=dialogAbort.signal;overlay.querySelector('.dialog-close').addEventListener('click',close,{signal:sig});overlay.querySelector('[data-cancel]').addEventListener('click',close,{signal:sig});
  overlay.querySelector('[data-apply]').addEventListener('click',async()=>{const args=Object.fromEntries([...overlay.querySelectorAll('[data-key]')].map(e=>[e.dataset.key,e.type==='number'?Number(e.value):e.value]));const button=overlay.querySelector('[data-apply]'),status=overlay.querySelector('[data-dialog-status]');if(button.disabled)return;button.disabled=true;status.textContent='';try{const r=await apply(args);if(r?.ok)close();else status.textContent=r?.error?.message||'Unable to apply changes.'}catch(e){status.textContent=e.message||String(e);feedback(e.message)}finally{button.disabled=false}},{signal:sig});
  (overlay.querySelector('.dialog-body input,.dialog-body select')||overlay.querySelector('[data-apply]'))?.focus();overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}if(e.key==='Tab'){const els=[...overlay.querySelectorAll('button,input,select')].filter(e=>!e.disabled),i=els.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();els.at(-1).focus()}else if(!e.shiftKey&&i===els.length-1){e.preventDefault();els[0].focus()}}},{signal:sig});
  drag(overlay.querySelector('.dialog-header'),e=>{if(e.target.closest('button'))return;const d=overlay.querySelector('.dialog');d.style.transform=`translate(${e.clientX-innerWidth/2}px,${e.clientY-innerHeight/2}px)`},()=>{},sig);
 }
 function imageDialog(kind){const s=host.getSnapshot(),t=host.target(),o=s.object,d=s.docs[0];if(kind!=='canvas-size'&&(!o?.raster||o.locked)){feedback('Select an unlocked image');return}
  const canvas=kind==='canvas-size',crop=kind==='crop',w=canvas?d.width:o.raster.width,h=canvas?d.height:o.raster.height;
  const selectedImage=!canvas&&!crop;
  const rasterInfo=host.shellApi.selectedRasterInfo();
  if(!canvas&&(rasterInfo?.bitDepth!==8||rasterInfo?.colorMode!=='RGB')){feedback('Resize and crop require an 8-bit RGB raster');return}
  const imageInfo=selectedImage?`<p class="dialog-copy">Selected raster: ${esc(w)} × ${esc(h)} px. Only nearest-neighbor pixel resampling is available; document and artwork dimensions are unchanged.</p>`:'';
  const aspectLock=selectedImage?'<label class="field-row"><span>Lock aspect ratio</span><input type="checkbox" data-image-aspect-lock checked aria-label="Lock selected image aspect ratio"></label>':'';
  dialog(canvas?'Canvas Size':crop?'Crop':'Resize Selected Image',`${imageInfo}${crop?field('x','X',0)+field('y','Y',0):''}<div class="pair-grid">${field(crop?'w':'width','Width',w)}${field(crop?'h':'height','Height',h)}</div>${aspectLock}${canvas?field('units','Units','mm','text',['mm','px','in','cm'])+field('anchor','Anchor','center','text',['top-left','top','top-right','left','center','right','bottom-left','bottom','bottom-right']):crop?'':field('resampling','Resampling','nearest','text',['nearest'])}`,a=>run(canvas?'ui017.canvas.resize.v1':crop?'ui017.image.crop.v1':'ui017.image.resize.v1',{...a,target:t}));
  if(selectedImage){
   const width=overlay.querySelector('[data-key="width"]'),height=overlay.querySelector('[data-key="height"]'),lock=overlay.querySelector('[data-image-aspect-lock]');
   const sync=(source,other,factor)=>{const value=Number(source.value);if(lock.checked&&Number.isFinite(value)&&value>0)other.value=String(Math.max(1,Math.round(value*factor)));};
   width.addEventListener('input',()=>sync(width,height,h/w),{signal:dialogAbort.signal});
   height.addEventListener('input',()=>sync(height,width,w/h),{signal:dialogAbort.signal});
  }
 }

 // Keep the existing size-dialog implementation and state owner in minimal.state.v1.
 // Only surface its native modal; the full Document tools host stays diagnostic-only.
 let sizeRouteCleanup=null;
 function openSizeRoute(kind){
  const panel=$('#nativeFunctionDialog'),opener=panel?.querySelector('[data-size-open="'+kind+'"]');
  const modal=panel?.querySelector('dialog[data-size-dialog="'+kind+'"]');
  if(!opener||!modal){feedback('Size dialog not available');return}
  if(panel.querySelector('dialog[open]')){feedback('Finish the open size dialog first');return}
  sizeRouteCleanup?.();
  const returnFocus=document.activeElement;
  panel.hidden=false;panel.classList.add('size-route-active');
  const detach=()=>{modal.removeEventListener('close',finish);if(sizeRouteCleanup===detach)sizeRouteCleanup=null};
  const finish=()=>{if(modal.open)return;detach();if(panel.querySelector('dialog[open]'))return;panel.classList.remove('size-route-active');panel.hidden=true;returnFocus?.focus?.({preventScroll:true})};
  sizeRouteCleanup=detach;
  modal.addEventListener('close',finish);
  opener.click();
  if(!modal.open)finish();
 }
 function closeDocumentDialog(){
  const sessions=host.select('session.list')||[],active=sessions.find(item=>item.active);
  if(!active){feedback('No active document');return}
  if(!active.dirty)return run('session.close.v1',{sessionId:active.sessionId,decision:'discard'});
  const name=esc(active.title||'Untitled'),sessionId=active.sessionId;
  dialog('Close Document','<p class="dialog-copy">Save changes to <strong>'+name+'</strong> before closing?</p>',async()=>({ok:false}));
  const footer=overlay.querySelector('.dialog-footer');
  footer.innerHTML='<button type="button" data-close-choice="cancel">Cancel</button><button type="button" data-close-choice="discard">Don’t Save</button><button type="button" class="primary" data-close-choice="save">Save</button>';
  footer.addEventListener('click',async e=>{
   const button=e.target.closest('[data-close-choice]');if(!button)return;
   const decision=button.dataset.closeChoice;
   if(decision==='cancel'){close();return}
   if((host.select('session.list')||[]).find(x=>x.active)?.sessionId!==sessionId){feedback('Active document changed');return}
   [...footer.querySelectorAll('button')].forEach(b=>b.disabled=true);
   try{const r=await run('session.close.v1',{sessionId,decision});if(r?.ok===true)close();}
   finally{if(!overlay.hidden)[...footer.querySelectorAll('button')].forEach(b=>b.disabled=false);}
  },{signal:dialogAbort.signal});
  footer.querySelector('[data-close-choice="save"]').focus();
 }
 function exportDialog(format='png'){
  const doc=host.select('document.current')||{};
  if(!doc.open){feedback('Open a document before export');return}
  dialog('Export','<label class="field-row"><span>Format</span><select data-key="format"><option value="png">PNG</option><option value="svg">SVG</option><option value="pdf">PDF</option></select></label><p class="dialog-copy">Artboard · background included</p>',async ({format})=>{
   const result=await host.shellApi.exportArtboard(format);
   if(!result?.completed)throw Error('Export did not complete');
   feedback('Exported '+result.name);return {ok:true};
  });
  overlay.querySelector('[data-key="format"]').value=format;
  overlay.querySelector('[data-apply]').textContent='Export';
 }
 const command=async (key,{filename}={})=>{
  menuUi?.close(menu.contains(document.activeElement));const s=host.getSnapshot();
  if(key==='native-tools'){const panel=root.querySelector('#nativeFunctionDialog');panel.hidden=false;(panel.querySelector('[data-recovery-key]')||panel.querySelector('button'))?.focus();return}
  if(key==='recover')return command('native-tools');
  if(['drive-save','drive-recover','drive-save-revision'].includes(key)){
   // Only route into the existing first-party INK Drive service. The menu
   // opens its visible dialog; GIS auth and Native IO remain on the original
   // buttons requiring an actual user click, never on the menu dispatch.
   const intent=key==='drive-recover'?'recover':key==='drive-save-revision'?'save-revision':'save';
   const result=await host.shellApi.openDrivePanel(intent,{filename});
   if(result?.code==='INK_DRIVE_FIRST_PARTY_NOT_READY'){
    // Show the existing first-party diagnostic (SDK/config not available)
    // in the same top-layer dialog rather than leave it clipped offscreen.
    feedback(result.status==='AUTH_CONFIGURATION_REQUIRED'?'INK Google Drive 授權尚未設定':'INK Google Drive 尚未就緒');
    return result;
   }
   return result;
  }
  if(/^view:[124]$/.test(key))return run('session.view.layout.v1',{layout:Number(key.slice(5))});
  if(key.startsWith('session:'))return run('session.activate.v1',{sessionId:key.slice(8)});
  if(key==='undo'||key==='redo')return run('history.'+key+'.v1');
  if(key==='open-location'||key==='save-location'){
   const opening=key==='open-location';
   const title=opening?'開啟':'另存為';
   const name=opening?'':'<label class="field-row"><span>名稱</span><input data-key="filename" maxlength="180" value="'+esc(host.select('document.current')?.title||s.docs[0]?.title||'INK')+'"></label>';
   dialog(title,'<label class="field-row"><span>位置</span><select data-key="location"><option value="local">這台裝置</option><option value="drive">Google Drive</option></select></label>'+name,({location,filename})=>{
    if(!opening&&!filename?.trim())return {ok:false,error:{message:'請輸入名稱。'}};
    close();
    const target=location==='drive'?(opening?'drive-recover':'drive-save-revision'):(opening?'open':'save');
    return command(target,{filename});
   });
   overlay.querySelector('[data-cancel]').textContent='取消';
   overlay.querySelector('[data-apply]').textContent=title;
   return;
  }
  if(key==='new')return openSizeRoute('new');
  if(key==='open')return $('#openFile').click();if(key==='import-image'){importTarget={target:host.target(),layerId:s.docs[0]?.selection};return $('#importImageFile').click()}
  if(key==='close')return closeDocumentDialog();
  if(key==='save')return run('document.save.v1',filename?{filename}:undefined);if(key.startsWith('export:'))return exportDialog(key.slice(7));
  if(key==='copy'||key==='paste')return run('session.'+key+'.v1');
  if(key==='branding'){globalThis.dispatchEvent(new Event('ink:branding-open'));return}
  if(key==='ppi'||key==='artwork'||key==='canvas-size')return openSizeRoute(key==='canvas-size'?'canvas':key);
  if(key==='fit-artboard')return run('view.fit.artboard.v1');
  if(key==='zoom-in'||key==='zoom-out')return run('view.zoom.by.v1',{factor:key==='zoom-in'?1.2:1/1.2});
  if(key==='fit')return run('view.fit.content.v1');if(key==='100')return run('view.zoom.set.v1',{scale:1});
  if(key==='200')return run('view.zoom.set.v1',{scale:2});
  if(key==='view:snap'){const enabled=host.shellApi.snapState().enabled!==false;return run('page.snap.set.v1',{key:'enabled',value:!enabled});}
  if(key.startsWith('view:snap:')){const category=key.slice(10);if(!['guides','edges','centers','equalDistance'].includes(category))return;const enabled=host.shellApi.snapState().categories?.[category]===true;return run('page.snap.set.v1',{key:category,value:!enabled});}
  if(key==='adjustments')return dock.activate('adjustments');
  if(['image-size','crop'].includes(key))return imageDialog(key);
  if(key.startsWith('image-mode:')||key.startsWith('image-depth:')){const target=host.target(),info=host.shellApi.selectedRasterInfo();if(!info){feedback('Select an unlocked raster image');return}const mode=key.startsWith('image-mode:');const value=mode?key.slice(11):Number(key.slice(12));if(mode?info.colorMode===value:info.bitDepth===value)return{ok:true,changed:false};return run(mode?'ui017.image.mode.v1':'ui017.image.depth.v1',{target,...(mode?{mode:value}:{depth:value})});}
  if(key==='transform'){host.dispatch({type:'tool.set',value:'select',source:'menu.transform'});contextToolbar.expand(true);return}
  if(key==='duplicate'||key==='delete')return host.dispatch({type:'layer.'+key,object:true,target:host.target(),source:'context'});
  if(key==='align'){const t=host.target();if(t.refs.length<2){feedback('Select at least two objects');return}return dialog('Align',field('mode','Align','left','text',['left','centerX','right','top','centerY','bottom','distributeX','distributeY']),a=>{host.shellApi.requireSelection(t);return run('object.align.v1',{...a,targetRefs:t.refs.map(r=>({...r,pageId:t.pageId}))})})}
  if(key==='history-limit'){const value=host.shellApi.preferences().historyLimit;return dialog('History limit',field('historyLimit','Retained steps',String(value),'text',['20','30','50']),async a=>{const limit=Number(a.historyLimit);if(![20,30,50].includes(limit))throw Error('Choose 20, 30 or 50 steps');host.shellApi.applyPreferences({historyLimit:limit});return{ok:true}})}
  if(key==='about')return dialog('INK','<p>INK</p>',async()=>({ok:true}));
  if(key.startsWith('panel:'))return dock.activate(key.slice(6));
 };
 menuUi=host.mountMenuUi(mountMenuUi,{menu,logo:$('#logoButton'),invoke:command,signal});
 $('#quickUndo').addEventListener('click',()=>command('undo'),{signal});$('#quickRedo').addEventListener('click',()=>command('redo'),{signal});$('#railToggle').addEventListener('click',()=>root.classList.toggle('rail-double'),{signal});
 $('#colorState').addEventListener('click',()=>dock.activate('color'),{signal});$('#resetColors').addEventListener('click',()=>host.dispatch({type:'paint.reset',source:'rail'}),{signal});$('#swapColors').addEventListener('click',()=>host.dispatch({type:'paint.swap',source:'rail'}),{signal});
 $('#openFile').accept='.ink,.json,.psd,.psb,.ai';$('#openFile').addEventListener('change',e=>{const file=e.target.files[0];if(file)run('document.open.v1',{file});e.target.value=''},{signal});
 $('#importImageFile').addEventListener('change',e=>{const file=e.target.files[0],s=host.getSnapshot();if(file)run('ui017.image.import.v1',{file,...importTarget});e.target.value=''},{signal});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&(!overlay.hidden||!menu.hidden)){e.preventDefault();e.stopPropagation();close();if(!menu.hidden)menuUi.close(true)}if(e.target.closest('input,textarea,select,[contenteditable], [role="textbox"]')||!overlay.hidden||!menu.hidden)return;if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&['c','v'].includes(e.key.toLowerCase())){const key=e.key.toLowerCase()==='c'?'copy':'paste',s=host.getSnapshot();if(key==='copy'?!!s.object&&!s.object.locked:host.select('session.transfer')?.ready===true){e.preventDefault();e.stopPropagation();command(key)}return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopPropagation();command(e.shiftKey?'redo':'undo')}},{signal});
 // One geometry authority: the visible Dock width and resize hit-area track the same CSS variable.
 const dockResizer=$('#dockResizer');
 const dockMinWidth=Number.parseFloat(getComputedStyle(root).getPropertyValue('--dock-min-width'))||240;
 const dockMaxWidth=400;
 const clampDockWidth=width=>Math.max(dockMinWidth,Math.min(dockMaxWidth,width));
 const setDockWidth=width=>{
  const next=clampDockWidth(width);
  root.style.setProperty('--dock-width',next+'px');
  dockResizer.setAttribute('aria-valuenow',String(next));
 };
 dockResizer.setAttribute('aria-valuemin',String(dockMinWidth));
 dockResizer.setAttribute('aria-valuemax',String(dockMaxWidth));
 dockResizer.setAttribute('aria-valuenow',String(clampDockWidth(Number.parseFloat(getComputedStyle(root).getPropertyValue('--dock-width'))||dockMinWidth)));
 drag(dockResizer,e=>setDockWidth(root.getBoundingClientRect().right-e.clientX),()=>{},signal);
 dockResizer.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();
  const current=Number.parseFloat(getComputedStyle(root).getPropertyValue('--dock-width'))||dockMinWidth;
  setDockWidth(e.key==='Home'?dockMinWidth:e.key==='End'?dockMaxWidth:current+(e.key==='ArrowLeft'?8:-8));
 },{signal});
 function render(s){const h=host.getHistory(),o=s.object;$('#quickUndo').disabled=h.index===0;$('#quickRedo').disabled=h.index===h.entries.length-1;
  $('#colorState .fg').style.background=s.paint.foreground;$('#colorState .bg').hidden=false;$('#colorState .bg').style.background=s.paint.background;$('#resetColors').disabled=$('#swapColors').disabled=!s.docs.length;
  contextToolbar.render(s);
 }
 const contextToolbar=host.mountToolsWorkbench(root,feedback,signal,{renderToolRail,updateToolRailButton,renderToolMenu,updateToolContextIdentity,decorateToolOptions,decorateToolWorkbench,createToolGroupMenu,renderToolOptionsContainers,createMoreToolOptions,updateContextToggle,toolbarCustomizer:toolbarCustomizerPresentation});
 const syncBrandName=()=>{
  const name=globalThis.INK_BRANDING?.getName?.()||'INK';
  $('#logoButton').title=name;
  $('#logoButton').setAttribute('aria-label',name+' application menu');
 };
 globalThis.addEventListener('ink:branding-changed',syncBrandName,{signal});
 syncBrandName();
 globalThis.dispatchEvent(new Event('ink:ui-shell-mounted'));
 const unsubscribe=host.subscribe(render);render(host.getSnapshot());
 return{host,dock,command,dispose(){host.shellApi.disposePageBridge();sizeRouteCleanup?.();unsubscribe();abort.abort();close();contextToolbar.dispose();dock.unmount();host.dispose()}};
}



