// #765 Design-time fixture adapter. Zero access to Native app, renderer,
// Document, History, local storage, service workers, or Google Drive.
// All operations below are in-memory previews, never real document mutations.
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const ok=()=>({ok:true,changed:true,mock:true});
const target=()=>({documentId:'mock-a4',pageId:'mock-page',generation:1,refs:[]});

function makeState(fixture){
 const active=fixture!=='empty',selection=fixture==='selection';
 const layers=[
  {id:'mock-layer-1',name:'圖層 1',type:'path',visible:true,locked:false,opacity:100,preview:null},
  {id:'mock-layer-2',name:'背景',type:'shape',visible:true,locked:true,opacity:100,preview:null}
 ];
 const doc=active?{id:'mock-a4',name:'A4 · MOCK',title:'A4 · MOCK',width:210,height:297,ppi:300,units:'mm',artboard:{widthMm:210,heightMm:297,ppi:300,unit:'mm'},selection:'mock-layer-1',layers,camera:{zoom:100,x:0,y:0},guides:[],canvasMode:'document'}:null;
 return{kind:'MOCK',docs:doc?[doc]:[],activeDoc:doc?.id||null,
  object:selection?{id:'mock-object',objectId:'mock-object',type:'path',locked:false,x:35,y:40,w:80,h:90,rotate:0,fill:'#d7eafa',blendMode:'source-over',adjustments:[],target:target()}:null,
  target:target(),tool:'select',paint:{foreground:'#202020',background:'#ffffff',alpha:100},
  swatches:[{id:'recent',name:'Recent colors',open:true,colors:['#202020','#d7eafa','#db7171']}],
  swatchSelection:'recent',toolOptions:{'brush.size':24,'select.aspect':0},
  guides:{show:true,lock:false,snap:true},layout:1,adjustmentEditorId:null,
  capabilities:{foreground:active,background:active}};
}

// The real tool registry belongs to the Native workbench. This lightweight
// fixture supplies display metadata only to the canonical Public presenters;
// tool activation semantics are deliberately not represented as Native PASS.
const icon=path=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';
const fixtures=[
 ['move','移動','M3 12h18M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4',['select','move']],
 ['selection','選取','M4 4h6M14 4h6v6M20 14v6h-6M10 20H4v-6',['rect','lasso']],
 ['crop','裁切','M6 2v16h16M2 6h16v16',['crop']],
 ['brush','筆刷','M4 20c4 0 5-3 5-5L19 3l2 2-12 12c0 2-3 3-5 3',['brush','pencil']],
 ['erase','橡皮擦','M4 14L14 4l6 6-10 10H4z',['eraser']],
 ['clone','仿製','M5 5h14v14H5zM9 9h6v6H9z',['clone']],
 ['gradient','漸層','M3 4h18v16H3zM6 4v16M10 4v16M14 4v16',['gradient']],
 ['pen','鋼筆','M12 2l8 8-8 12L4 10z',['pen']],
 ['text','文字','M4 5h16M12 5v15M8 20h8',['text','vertical-rl']],
 ['shape','形狀','M4 5h16v14H4z',['rect','ellipse','line']],
 ['hand','手掌','M12 20V8M9 16V7M15 16V8M18 17v-7',['hand']],
 ['zoom','縮放','M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6',['zoom']]
].map(([id,label,shape,variants])=>({id,label,items:variants.map(item=>({id:item,label:item,icon:icon(shape)}))}));

export function createMockHost(){
 let state=makeState('a4'),index=0,entries=[{index:0,label:'History start'}];
 const subscribers=new Set(),receipts=new Set();
 const notify=()=>subscribers.forEach(fn=>fn(clone(state)));
 const getSnapshot=()=>clone(state);
 const getHistory=()=>({index,limit:30,entries:clone(entries)});
 const emitReceipt=(command,result)=>receipts.forEach(fn=>fn({...command,result}));
 const setFixture=fixture=>{if(!['a4','selection','empty'].includes(fixture))fixture='a4';state=makeState(fixture);index=0;entries=[{index:0,label:'History start'}];notify()};
 const select=(name)=>{
  const d=state.docs[0];
  if(name==='session.list')return d?[{sessionId:'mock-session',title:d.name,active:true,dirty:false}]:[];
  if(name==='session.transfer')return{ready:false};
  if(name==='document.current')return{open:!!d,title:d?.name||'',width:d?.width,height:d?.height};
  if(name==='page.preview')return null;
  if(name==='path.list')return{paths:[]};
  if(name==='tool.presets')return{status:'AVAILABLE',tool:'brush',selected:null,presets:[]};
  if(name==='tool.settings')return{size:24,opacity:1,flow:1,smoothing:.5,pressure:1,taper:0,wetness:0,grain:0,bristle:0};
  return null;
 };
 const record=label=>{entries=entries.slice(0,index+1);index++;entries.push({index,label});notify()};
 const dispatch=command=>{
  const c=command||{};let result=ok(),d=state.docs[0];
  if(c.type==='history.undo')index=Math.max(0,index-1);
  else if(c.type==='history.redo')index=Math.min(entries.length-1,index+1);
  else if(c.type==='history.jump')index=Math.max(0,Math.min(entries.length-1,Number(c.index)||0));
  else if(c.type==='tool.set'){state.tool=String(c.value||'select');}
  else if(c.type==='tool.option')state.toolOptions[c.key]=c.value;
  else if(c.type==='paint.reset'){state.paint.foreground='#202020';state.paint.background='#ffffff'}
  else if(c.type==='paint.swap'){const p=state.paint;[p.foreground,p.background]=[p.background,p.foreground]}
  else if(c.type==='paint.patch')Object.assign(state.paint,c.patch);
  else if(c.type==='camera.patch'&&d)Object.assign(d.camera,c.patch);
  else if(c.type==='layer.select'&&d)d.selection=c.targetId;
  else if(c.type==='layer.lock'&&d){const l=d.layers.find(l=>l.id===c.targetId);if(l)l.locked=!!c.value}
  else if(c.type==='layer.visible'&&d){const l=d.layers.find(l=>l.id===c.targetId);if(l)l.visible=!!c.value}
  else if(c.type==='layer.patch'&&d){const l=d.layers.find(l=>l.id===c.targetId);if(l)Object.assign(l,c.patch)}
  else if(c.type==='layer.add'&&d){const id='mock-layer-'+(d.layers.length+1);d.layers.unshift({id,name:'新圖層（Mock）',type:'path',visible:true,locked:false,opacity:100});d.selection=id}
  else if(c.type==='swatch.toggle'||c.type==='adjustment.select')state.adjustmentEditorId=c.id||null;
  else result={ok:false,mock:true,error:{code:'MOCK_UNSUPPORTED',message:'Not simulated in the Mock Host'}};
  emitReceipt(c,result);notify();return result;
 };
 const execute=async (id,args={})=>{
  let result;
  if(id==='history.undo.v1')result=dispatch({type:'history.undo'});
  else if(id==='history.redo.v1')result=dispatch({type:'history.redo'});
  else if(id==='view.zoom.set.v1'||id==='view.zoom.by.v1')result=dispatch({type:'camera.patch',patch:{zoom:id==='view.zoom.set.v1'?(args.scale||1)*100:Math.round((state.docs[0]?.camera.zoom||100)*(args.factor||1))}});
  else result={ok:false,mock:true,error:{code:'MOCK_NO_NATIVE',message:'Preview only; Native commands are disabled'}};
  return result;
 };
 const shellApi={selectedRasterInfo:()=>null,requireSelection:()=>{throw Error('Mock has no Native selection')},snapState:()=>({enabled:true,categories:{}}),preferences:()=>({historyLimit:30}),applyPreferences:()=>({ok:false}),exportArtboard:async()=>({completed:false}),openDrivePanel:async()=>({ok:false,code:'MOCK_DRIVE_DISABLED'}),disposePageBridge:()=>{}};
 const menuHost={getSnapshot,getHistory,select,subscribe:fn=>{subscribers.add(fn);return()=>subscribers.delete(fn)},menuApi:{selectedRasterInfo:shellApi.selectedRasterInfo,snapState:shellApi.snapState,canInvokeWorkTools:()=>false,driveAvailable:()=>false,isCurrentRuntime:()=>false,notify:message=>console.info('Mock menu:',message)}};
 const mountMenuUi=(factory,options)=>factory({...options,host:menuHost});
 function mountToolsWorkbench(root,feedback,signal,presentation){
  const rail=root.querySelector('.tool-area'),controls=root.querySelector('#contextControls'),bar=root.querySelector('.context-float');
  const identity=root.querySelector('#contextIdentity'),toggle=root.querySelector('#contextToggle');
  let expanded=false;const grouped=fixtures;
  rail.innerHTML=presentation.renderToolRail(grouped);
  controls.innerHTML='<div id="contextToolOptions"></div><div id="transformControls" hidden></div>';
  const menu=document.createElement('div');menu.id='toolGroupMenu';menu.className='drawing-tool-menu';menu.setAttribute('popover','manual');menu.setAttribute('role','menu');root.append(menu);
  const update=()=>{
   for(const button of rail.querySelectorAll('[data-group]')){
    const group=grouped.find(g=>g.id===button.dataset.group),item=group.items[0];
    presentation.updateToolRailButton(button,{group,item,available:!!state.docs.length,active:state.tool===group.id});
   }
   presentation.updateToolContextIdentity(identity,{label:state.tool});
  };
  rail.addEventListener('click',event=>{
   const button=event.target.closest('[data-group]');if(!button||button.disabled)return;
   const group=grouped.find(g=>g.id===button.dataset.group);if(!group)return;
   const items=group.items.map(item=>({...item,available:true,active:state.tool===group.id,reason:''}));
   if(group.items.length>1){menu.innerHTML=presentation.renderToolMenu(group,items);menu.style.left=(button.getBoundingClientRect().right+6)+'px';menu.style.top=(button.getBoundingClientRect().top)+'px';menu.showPopover();}
   else dispatch({type:'tool.set',value:group.id});
  },{signal});
  menu.addEventListener('click',event=>{const button=event.target.closest('[data-variant]');if(!button)return;dispatch({type:'tool.set',value:button.dataset.variant});if(menu.matches(':popover-open'))menu.hidePopover()},{signal});
  toggle.addEventListener('click',()=>{expanded=!expanded;bar.classList.toggle('expanded',expanded);toggle.setAttribute('aria-expanded',String(expanded))},{signal});
  root.querySelector('#railCustomize').addEventListener('click',()=>feedback('Mock preview: Native toolbar customization unavailable'),{signal});
  const unsub=()=>subscribers.delete(update);subscribers.add(update);signal.addEventListener('abort',unsub,{once:true});update();
  return{render:update,expand:expanded=>{bar.classList.toggle('expanded',expanded);toggle.setAttribute('aria-expanded',String(expanded))},dispose:()=>{unsub();menu.remove()}};
 }
 const host={kind:'MOCK',setFixture,getSnapshot,getHistory,select,execute,dispatch,target,subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn)},subscribeCommands(fn){receipts.add(fn);return()=>receipts.delete(fn)},mountMenuUi,mountToolsWorkbench,shellApi,navigator:null,dispose(){subscribers.clear();receipts.clear()}};
 return host;
}
