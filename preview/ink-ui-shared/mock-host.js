// #765 Design-time fixture adapter. Zero access to Native app, renderer,
// Document, History, local storage, service workers, or Google Drive.
// All operations below are in-memory previews, never real document mutations.
import {mountToolbarCustomizer} from '../../src/ui/ink017/tool-slices/toolbar-customizer.js';
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const ok=()=>({ok:true,changed:true,mock:true});
const target=()=>({documentId:'mock-a4',pageId:'mock-page',generation:1,refs:[]});

function makeState(fixture){
 const active=fixture!=='empty',selection=['selection','image','text','shape','locked','history'].includes(fixture);
 const isImage=fixture==='image',isText=fixture==='text',isShape=fixture==='shape',locked=fixture==='locked';
 const layers=[
  {id:'mock-layer-1',name:isText?'標題文字':isImage?'照片':'圖層 1',type:isText?'text':isImage?'image':'path',visible:true,locked:false,opacity:100,preview:null},
  ...(locked?[{id:'mock-layer-2',name:'背景',type:'shape',visible:true,locked:true,opacity:100,preview:null}]:[])
 ];
 const doc=active?{id:'mock-a4',name:'A4 · MOCK',title:'A4 · MOCK',width:210,height:297,ppi:300,units:'mm',artboard:{widthMm:210,heightMm:297,ppi:300,unit:'mm'},selection:locked?'mock-layer-2':'mock-layer-1',layers,camera:{zoom:100,x:0,y:0},guides:[],canvasMode:'document'}:null;
 return{kind:'MOCK',docs:doc?[doc]:[],activeDoc:doc?.id||null,
  object:selection?{id:'mock-object',objectId:'mock-object',type:isImage?'image':isText?'text':isShape?'shape':'path',locked,x:35,y:40,w:80,h:90,rotate:0,fill:'#d7eafa',blendMode:'source-over',adjustments:[],raster:isImage?{width:800,height:1200}:null,font:'Arial',weight:400,size:32,leading:40,tracking:0,textColor:'#202020',text:'INK UI',align:'left',paragraph:{align:'left',indentLeft:0},target:target()}:null,
  target:target(),tool:isImage?'brush':isText?'text':isShape?'line':'pen',paint:{foreground:'#000000',background:'#ffffff',alpha:100},
  mockShapeOptions:{shapeType:'line',shapeFill:false},
  swatches:[{id:'recent',name:'Recent colors',open:true,colors:['#202020','#ffffff','#b63c36','#d18b2f','#d7c64b','#3d875d','#2f718f','#594f9a']}],
  swatchSelection:'recent',toolOptions:{'brush.size':12,'select.aspect':0},
  guides:{show:true,lock:false,snap:true},layout:1,adjustmentEditorId:null,
  capabilities:{foreground:active,background:active}};
}

// The real tool registry belongs to the Native workbench. This lightweight
// fixture supplies display metadata only to the canonical Public presenters;
// tool activation semantics are deliberately not represented as Native PASS.
// Fixed display-only snapshot of Native TOOL_GROUPS. No registry import is safe:
// that import graph reaches the real raster/vector Core. The anti-drift verifier
// MUST fail whenever any of these source blobs changes, until this snapshot has
// been explicitly regenerated and compared with Real's live 20-group rail.
const NATIVE_TOOL_SOURCE_BLOBS=Object.freeze({
 'tool-slices/registry.js':'09de57b58474cd0b101a1e60c9a96ddbd5bfcac1',
 'tool-slices/completion-tools.js':'231ee540ef7a9849b4bbb255fe0626d0e681a8ff',
 'tool-slices/dev1/catalog.js':'2a445686f3dff82336c3d984eba0ada252a58cb6',
 'tool-slices/dev2/index.mjs':'920d96506e06217d3d7de78a26e768ec1d2b4811',
 'tool-slices/dev3/tools-context-dev3.mjs':'3db1fbfa2d337c54eafff055f5369026b6e60234'
});
const icon=(body,styled=false)=>'<svg viewBox="0 0 24 24"'+(styled?' fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"':'')+' aria-hidden="true">'+(body.startsWith('<')?body:'<path d="'+body+'"/>')+'</svg>';
const row=(id,label,shape,variants,styled=false)=>({id,label,items:variants.map(([itemId,itemLabel,body=shape])=>({id:itemId,label:itemLabel,icon:icon(body,styled)}))});
const fixtures=[
 row('select','選取／移動','<path d="M5 4l7 15 2.2-6 5.8-2z"/>',[['select','選取／移動']],true),
 row('marquee','像素選框','',[
  ['rectangleMarquee','矩形像素選框','<rect x="4" y="5" width="16" height="14" stroke-dasharray="3 2"/>'],
  ['ellipseMarquee','橢圓像素選框','<ellipse cx="12" cy="12" rx="8" ry="7" stroke-dasharray="3 2"/>']
 ],true),
 row('lasso','套索','',[
  ['lasso','物件套索','<path d="M18 15c7-9-12-14-14-5-1 5 12 8 14 3M6 14v5l3 2"/>'],
  ['polygonalLasso','多邊形像素套索','<path d="m4 5 15 2-4 13-11-4z" stroke-dasharray="3 2"/>'],
  ['magneticLasso','磁性像素套索','<path d="M5 5v8a7 7 0 0 0 14 0V5h-4v8a3 3 0 0 1-6 0V5zM5 9h4M15 9h4"/>']
 ],true),
 row('wand','魔術棒','<path d="m5 19 13-13M16 3v4M20 7h-4M18 11v4M12 3l2 2"/>',[['magicWand','魔術棒']],true),
 row('crop','影像裁切','<path d="M7 3v14a2 2 0 0 0 2 2h12M3 7h14a2 2 0 0 1 2 2v12"/>',[['crop','影像裁切']]),
 row('eyedropper','滴管','<path d="M14 5l5 5M7 17l10-10 3 3-10 10H7zM5 19h5"/>',[['eyedropper','滴管']]),
 row('drawing','繪圖','',[
  ['pen','手繪筆','<path d="M4 19l4-1 11-11-3-3L5 15zM14 6l3 3M4 20h7"/>'],
  ['pencil','鉛筆','<path d="M4 20l4-1 12-12-4-4L4 15zM14 5l4 4M5 15l4 4"/>'],
  ['marker','麥克筆','<path d="M4 19l5-1 11-11-4-4L5 14zM12 7l4 4M3 21h9"/>'],
  ['brush','筆刷','<path d="M4 20c5 0 6-2 6-5l8-8-3-3-8 8c-3 0-5 1-5 6 0 1 1 2 2 2z"/>'],
  ['airbrush','噴槍','<path d="M4 10h10l4-3v9l-4-3H4zM10 13v5h4M20 6h1M21 10h1M20 14h1M19 18h1"/>']
 ],true),
 row('healing','修復','',[
  ['spotHealing','污點修復','<path d="M4 18 18 4l3 3L7 21H4zM14 4v4M12 6h4"/>'],
  ['healingBrush','修復筆刷','<path d="m5 19 11-11 3 3L8 22H5zM11 9l5 5M17 3v3M15 5h4"/>'],
  ['patch','修補','<path d="M5 7 12 4l7 3v10l-7 3-7-3zM8 12h8" stroke-dasharray="2 2"/>']
 ]),
 row('stamp','印章','',[
  ['cloneStamp','仿製印章','<path d="M9 4h6v7l4 4v4H5v-4l4-4zM4 22h16"/>'],
  ['patternStamp','圖樣印章','<path d="M8 4h8v8l3 3v4H5v-4l3-3zM5 19h14M9 16h1M14 16h1"/>']
 ]),
 row('eraser','橡皮擦','<path d="M4 16l8-10 8 7-6 7H8z"/>',[['eraser','橡皮擦']],true),
 row('fill','填色','',[
  ['gradient','漸層','<path d="M4 5h16v14H4zM4 19 20 5M9 16l8-8"/>'],
  ['paintBucket','油漆桶','<path d="m5 13 7-8 8 7-7 8zM3 21h18M18 7v4"/>']
 ]),
 row('local','局部處理','',[
  ['localBlur','模糊','<path d="M5 8h14M4 12h16M5 16h14" stroke-dasharray="1 3"/>'],
  ['localSharpen','銳利化','<path d="M4 18 12 5l8 13zM7 16h10"/>'],
  ['smudge','塗抹','<path d="M5 16c3-8 5-9 7-7l-2 6 5-5c3-2 5 1 2 4l-5 7H7z"/>']
 ]),
 row('tone','明暗／色彩','',[
  ['dodge','加亮','<path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6"/>'],
  ['burn','加深','<path d="M5 6a7 7 0 1 0 13 12A8 8 0 0 1 5 6z"/>'],
  ['sponge','海綿','<path d="M5 9 9 5l9 2 2 8-6 5-9-4zM9 10h1M14 12h1M10 16h1"/>']
 ]),
 row('vector-pen','向量鋼筆','<path d="m4 20 3-10 9-6 4 4-6 9-10 3 8-8M7 10l7 7"/><circle cx="13" cy="11" r="1.5"/>',[['vector-pen','向量鋼筆']],true),
 row('text','文字','M4 5h16M12 5v14M8 19h8',[
  ['horizontal-tb','水平文字'],['vertical-rl','垂直文字','M5 4v16M5 12h14M19 8v8']
 ]),
 row('nodes','節點編輯','M5 18L12 5L19 18M5 18h14M4 18h2M11 4h2M18 18h2',[
  ['path','路徑節點'],['stroke','筆畫節點']
 ]),
 row('shape','形狀','M4 4h16v16H4z',[
  ['line','直線','M4 20L20 4'],['arrow','箭頭','M4 20L20 4M10 4h10v10'],
  ['rect','矩形','M4 4h16v16H4z'],['ellipse','橢圓','M20 12a8 8 0 1 1-16 0a8 8 0 0 1 16 0'],
  ['triangle','三角形','M12 4l9 16H3z']
 ]),
 row('guide','參考線','M4 7h16M7 4v16M4 17h16',[['guide','參考線']]),
 row('pan','手形／平移','M7 11V7a2 2 0 014 0v3-5a2 2 0 014 0v5-3a2 2 0 014 0v7c0 5-3 8-7 8H9c-2 0-3-1-4-3l-2-4',[['pan','手形／平移']]),
 row('zoom','縮放','M15 15l5 5M17 10a7 7 0 11-14 0a7 7 0 0114 0M10 7v6M7 10h6',[['zoom','縮放']])
];
if(fixtures.length!==20||new Set(fixtures.map(g=>g.id)).size!==20)throw Error('MOCK_NATIVE_TOOL_CATALOG_DRIFT');

export function createMockHost(){
 let state=makeState('a4'),index=0,entries=[{index:0,label:'History start'}],historyLimit=30;
 const supportedFixtures=new Set(['a4','empty','selection','image','text','shape','locked','history']);
 const subscribers=new Set(),receipts=new Set();
 const notify=()=>subscribers.forEach(fn=>fn(clone(state)));
 const getSnapshot=()=>clone(state);
 const getHistory=()=>({index,limit:historyLimit,entries:clone(entries)});
 const emitReceipt=(command,result)=>receipts.forEach(fn=>fn({...command,result}));
 const setFixture=fixture=>{
  if(!supportedFixtures.has(fixture))fixture='a4';
  state=makeState(fixture);index=0;entries=[{index:0,label:'History start'}];
  if(fixture==='selection'){
   entries.push({index:1,label:'繪製幾何'});
   index=1;
  }
  if(fixture==='history'){
   entries.push({index:1,label:'Mock stroke 1'},{index:2,label:'Mock stroke 2'},{index:3,label:'Mock layer update'});
   index=3;
  }
  notify();return fixture;
 };
 const select=(name)=>{
  const d=state.docs[0];
  if(name==='session.list')return d?[{sessionId:'mock-session',title:d.name,active:true,dirty:false}]:[];
  if(name==='session.transfer')return{ready:false};
  if(name==='document.current')return{open:!!d,title:d?.name||'',width:d?.width,height:d?.height};
  if(name==='page.preview')return null;
  if(name==='path.list')return{paths:[]};
  if(name==='tool.presets')return{status:'AVAILABLE',tool:'brush',selected:null,presets:[]};
  if(name==='tool.settings')return !state.docs.length
   ?{size:12,opacity:.88,flow:.82,smoothing:.46,pressure:.95,taper:.42,wetness:.36,bristle:.18}
   :{size:2,opacity:1,smoothing:.66,pressure:.15,taper:.04,...state.mockDrawingSettings};
  if(name==='tool.options')return{...state.mockShapeOptions};
  return null;
 };
 const record=label=>{entries=entries.slice(0,index+1);index++;entries.push({index,label});notify()};
 const dispatch=command=>{
  const c=command||{};let result=ok(),d=state.docs[0];
  if(c.type==='history.undo')index=Math.max(0,index-1);
  else if(c.type==='history.redo')index=Math.min(entries.length-1,index+1);
  else if(c.type==='history.jump')index=Math.max(0,Math.min(entries.length-1,Number(c.index)||0));
  else if(c.type==='tool.set'){state.tool=String(c.value||'select');}
  else if(c.type==='tool.option'){
   state.toolOptions[c.key]=c.value;
   const match=/^(?:pen|pencil|marker|brush|airbrush)\.(size|opacity|flow|smoothing|pressure|taper|wetness|grain|bristle|softness)$/.exec(String(c.key));
   if(match){state.mockDrawingSettings??={};state.mockDrawingSettings[match[1]]=Number(c.value);}
   if(c.key==='shape:type')state.mockShapeOptions.shapeType=String(c.value);
   else if(c.key==='shape:defaultFill')state.mockShapeOptions.shapeFill=c.value==='On';
   else if(state.object?.type==='shape'&&['shape:w','shape:h','shape:rotate','shape:fill'].includes(c.key))
    state.object[c.key.slice(6)]=c.key==='shape:fill'?String(c.value):Number(c.value);
  }
  else if(c.type==='paint.reset'){state.paint.foreground='#000000';state.paint.background='#ffffff'}
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
 const shellApi={selectedRasterInfo:()=>null,requireSelection:()=>{throw Error('Mock has no Native selection')},snapState:()=>({enabled:true,categories:{}}),preferences:()=>({historyLimit}),applyPreferences:patch=>{
  if(![20,30,50].includes(patch?.historyLimit))return{ok:false,mock:true};
  historyLimit=patch.historyLimit;notify();return{ok:true,mock:true};
 },exportArtboard:async()=>({completed:false}),openDrivePanel:async()=>({ok:false,code:'MOCK_DRIVE_DISABLED'}),disposePageBridge:()=>{}};
 const menuHost={getSnapshot,getHistory,select,subscribe:fn=>{subscribers.add(fn);return()=>subscribers.delete(fn)},menuApi:{selectedRasterInfo:shellApi.selectedRasterInfo,snapState:shellApi.snapState,canInvokeWorkTools:()=>false,driveAvailable:()=>false,isCurrentRuntime:()=>false,notify:message=>console.info('Mock menu:',message)}};
 const mountMenuUi=(factory,options)=>factory({...options,host:menuHost});
 function mountToolsWorkbench(root,feedback,signal,presentation){
  const rail=root.querySelector('.tool-area'),controls=root.querySelector('#contextControls'),bar=root.querySelector('.context-float');
  const identity=root.querySelector('#contextIdentity'),toggle=root.querySelector('#contextToggle');
  let expanded=true,lastOptions='',layoutAbort=null;
  const grouped=fixtures,byId=new Map(grouped.map(g=>[g.id,g]));
  rail.innerHTML=presentation.renderToolRail(grouped);
  controls.innerHTML='<div id="contextToolOptions"></div><div id="transformControls" hidden></div>';
  const optionRoot=controls.querySelector('#contextToolOptions');
  const menu=document.createElement('div');menu.id='toolGroupMenu';menu.className='drawing-tool-menu';menu.setAttribute('popover','manual');menu.setAttribute('role','menu');root.append(menu);
  root.dataset.uiToolsOwner='public';bar.classList.add('tools-context');
  const current=()=>grouped.find(g=>g.id===state.tool||g.items.some(t=>t.id===state.tool))||null;
  const currentItem=g=>g?.items.find(t=>t.id===state.tool)||g?.items[0];
  const available=g=>{
   if(!state.docs.length)return false;
   if(['crop','eyedropper','healing','stamp','fill','local','tone'].includes(g.id))return state.object?.type==='image'&&!state.object.locked;
   if(['marquee','wand'].includes(g.id))return state.object?.type==='image'&&!state.object.locked;
   if(g.id==='nodes')return ['path','stroke'].includes(state.object?.type)&&!state.object?.locked;
   return true;
  };
  const selectTool=(g,item)=>{if(!available(g))return;dispatch({type:'tool.set',value:item.id})};
  const closeMenu=(restore=false)=>{if(menu.matches(':popover-open'))menu.hidePopover();if(restore)menu.opener?.focus();menu.opener?.setAttribute('aria-expanded','false')};
  const openMenu=(g,button)=>{
   if(!g||g.items.length<2||!available(g))return;
   closeMenu();menu.opener=button;menu.setAttribute('aria-label',g.label);
   const items=g.items.map(item=>({...item,available:true,active:currentItem(current())?.id===item.id,reason:''}));
   menu.innerHTML=presentation.renderToolMenu(g,items);
   const box=button.getBoundingClientRect();menu.style.left=Math.min(Math.max(8,box.right+6),Math.max(8,innerWidth-190))+'px';
   menu.style.top=Math.max(8,box.top)+'px';menu.showPopover();button.setAttribute('aria-expanded','true');
   menu.style.top=Math.min(parseFloat(menu.style.top),Math.max(8,innerHeight-menu.getBoundingClientRect().height-8))+'px';
   menu.querySelector('button:not(:disabled)')?.focus();
  };
  const setExpanded=value=>{
   expanded=!!value;bar.classList.toggle('expanded',expanded);toggle.disabled=!state.docs.length;
   toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-label',expanded?'收合工具選項':'展開工具選項');
   toggle.title=toggle.getAttribute('aria-label');
   toggle.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="'+(expanded?'M6 9l6 6 6-6':'M6 15l6-6 6 6')+'" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  };
  const optionMarkup=()=>{
   if(!state.docs.length)return 'No document';
   const g=current(),item=currentItem(g);
   if(!g||!item)return 'No applicable tool options';
   if(item.id==='select'&&!state.object)return '<div data-dev1-options-tool="select"><div class="context-parameter-group" role="group" aria-label="Object transform"><span class="field-row" role="status"><span>Object selection</span><output>No selection</output></span></div></div>';
   if(item.id==='select'&&state.object)return '<div data-dev1-options-tool="select"><div class="context-parameter-group" role="group" aria-label="Object transform"><span class="field-row" role="status"><span>Object selection</span><output>Mock selected object</output></span></div></div>';
   if(g.id==='drawing')return '<div data-dev1-options-tool="'+item.id+'">'+presentation.renderDev1DrawingOptions(item.label,select('tool.settings'))+'</div>';
   if(g.id==='shape')return presentation.renderDev3ShapeOptions(select('tool.options'),state.object?.type==='shape'?state.object:null);
   return 'No applicable tool options';
  };
  const update=()=>{
   const context=current(),item=currentItem(context);
   for(const button of rail.querySelectorAll('[data-group]')){
    const group=byId.get(button.dataset.group);
    presentation.updateToolRailButton(button,{group,item:currentItem(group),available:available(group),active:group===context});
   }
   toggle.disabled=!state.docs.length;
   presentation.updateToolContextIdentity(identity,{groupId:context?.id||null,itemId:item?.id||null,label:item?.label||'工具'});
   const html=optionMarkup();
   if(html!==lastOptions){
    layoutAbort?.abort();layoutAbort=new AbortController();
    optionRoot.innerHTML=html;lastOptions=html;
    presentation.arrangeToolOptions(optionRoot,bar,layoutAbort.signal,{expanded});
   }
   if(state.docs.length&&context&&item){optionRoot.dataset.uiPresentation='public';optionRoot.dataset.uiGroup=context.id;optionRoot.dataset.uiItem=item.id;}
   else{delete optionRoot.dataset.uiPresentation;delete optionRoot.dataset.uiGroup;delete optionRoot.dataset.uiItem;}
   optionRoot.dataset.nativeTarget=JSON.stringify(target());
  };
  rail.addEventListener('click',event=>{
   const button=event.target.closest('[data-group]');if(!button||button.disabled)return;
   const g=byId.get(button.dataset.group);selectTool(g,currentItem(g));
  },{signal});
  rail.addEventListener('contextmenu',event=>{const button=event.target.closest('[data-group]'),g=byId.get(button?.dataset.group);if(g?.items.length>1){event.preventDefault();openMenu(g,button)}},{signal});
  rail.addEventListener('keydown',event=>{const button=event.target.closest('[data-group]'),g=byId.get(button?.dataset.group);if(g?.items.length>1&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openMenu(g,button)}},{signal});
  let hold=null,suppressClick=false;
  rail.addEventListener('pointerdown',event=>{const button=event.target.closest('[data-group]'),g=byId.get(button?.dataset.group);if(event.button!==0||!g||g.items.length<2||button.disabled)return;clearTimeout(hold);suppressClick=false;hold=setTimeout(()=>{hold=null;suppressClick=true;openMenu(g,button)},450)},{signal});
  for(const name of ['pointerup','pointercancel','pointerleave'])rail.addEventListener(name,()=>{clearTimeout(hold);hold=null},{signal});
  rail.addEventListener('click',event=>{if(suppressClick){suppressClick=false;event.preventDefault();event.stopImmediatePropagation()}},{capture:true,signal});
  menu.addEventListener('click',event=>{const button=event.target.closest('[data-variant]');if(!button)return;const g=byId.get(menu.opener?.dataset.group),item=g?.items.find(t=>t.id===button.dataset.variant);if(g&&item)selectTool(g,item);closeMenu(true)},{signal});
  menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu(true)}},{signal});
  toggle.addEventListener('click',()=>{setExpanded(!expanded);lastOptions='';update()},{signal});
  // Only an in-memory Mock command is dispatched; the exact Public renderer
  // supplies field IDs/markup while Real Native owns validation and commands.
  optionRoot.addEventListener('change',event=>{
   const input=event.target.closest('[data-key]');
   if(!input||!optionRoot.contains(input))return;
   const fullKey=input.dataset.key;
   if(fullKey.startsWith('shape:')){
    dispatch({type:'tool.option',key:fullKey,value:input.value});
    return;
   }
   if(!fullKey.startsWith('dev1:'))return;
   const key=fullKey.slice(5),value=Number(input.value);
   if(!Number.isFinite(value)||value<(key==='size'?1:0)||value>(key==='size'?300:100))return;
   const item=currentItem(current());if(!item)return;
   dispatch({type:'tool.option',key:item.id+'.'+key,value:key==='size'?value:value/100});
  },{signal});
  // The exact Native UI-owned renderer is safe in Mock with a private memory
  // store. File preset IO is disabled; nothing reaches browser storage.
  const memory={value:null,getItem(){return this.value},setItem(_key,value){this.value=value}};
  const customizer=mountToolbarCustomizer(root,grouped,{
   signal,onLayoutChanged:update,feedback,storage:memory,allowPresetFiles:false
  });
  const unsub=()=>subscribers.delete(update);subscribers.add(update);signal.addEventListener('abort',unsub,{once:true});
  setExpanded(true);update();
  return{render:update,expand:setExpanded,dispose:()=>{unsub();clearTimeout(hold);layoutAbort?.abort();customizer.dispose();menu.remove()}};
 }
 const host={kind:'MOCK',setFixture,getSnapshot,getHistory,select,execute,dispatch,target,subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn)},subscribeCommands(fn){receipts.add(fn);return()=>receipts.delete(fn)},mountMenuUi,mountToolsWorkbench,shellApi,navigator:null,dispose(){subscribers.clear();receipts.clear()}};
 return host;
}
