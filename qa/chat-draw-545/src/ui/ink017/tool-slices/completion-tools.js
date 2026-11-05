// Three real tool homes: existing raster selection owner and PenPathSession → path.create.v1.
import {field,esc} from '../shared-controls.js';
import {PenPathSession} from '../../../vector/vector-core.js';
import {createUiEntryCompletion003Adapter} from '../../../editor/function-modules/ui-entry-completion-003-adapter.js';
import {inspectDev1RasterTarget} from './dev1/raster-session.js';
import {mountCompletionOverlay} from './completion-overlay.js';

const instances=new WeakMap();
const PIXEL=new Set(['rectangleMarquee','ellipseMarquee','magicWand','polygonalLasso','magneticLasso']);
const icon=body=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+body+'</svg>';
export const COMPLETION_GROUPS=Object.freeze([
 {id:'marquee',row:2,label:'像素選框',owner:4,items:[{id:'rectangleMarquee',label:'矩形像素選框',icon:icon('<rect x="4" y="5" width="16" height="14" stroke-dasharray="3 2"/>')},{id:'ellipseMarquee',label:'橢圓像素選框',icon:icon('<ellipse cx="12" cy="12" rx="8" ry="7" stroke-dasharray="3 2"/>')}]},
 {id:'lasso',row:3,label:'套索',owner:4,items:[{id:'lasso',label:'物件套索',icon:icon('<path d="M18 15c7-9-12-14-14-5-1 5 12 8 14 3M6 14v5l3 2"/>')},{id:'polygonalLasso',label:'多邊形像素套索',icon:icon('<path d="m4 5 15 2-4 13-11-4z" stroke-dasharray="3 2"/>')},{id:'magneticLasso',label:'磁性像素套索',icon:icon('<path d="M5 5v8a7 7 0 0 0 14 0V5h-4v8a3 3 0 0 1-6 0V5zM5 9h4M15 9h4"/>')}]},
 {id:'wand',row:4,label:'魔術棒',owner:4,items:[{id:'magicWand',label:'魔術棒',icon:icon('<path d="m5 19 13-13M16 3v4M20 7h-4M18 11v4M12 3l2 2"/>')}]},
 {id:'vector-pen',row:14,label:'向量鋼筆',owner:4,items:[{id:'vector-pen',label:'向量鋼筆',icon:icon('<path d="m4 20 3-10 9-6 4 4-6 9-10 3 8-8M7 10l7 7"/><circle cx="13" cy="11" r="1.5"/>')}]}
]);
export const completionFor=host=>instances.get(host)||null;
const checked=response=>{if(!response||response.ok===false)throw Error(response?.error?.message||'Native command failed');return response;};
const anchorList=pen=>pen?.path.subpaths[0].anchors||[];

export function createCompletionSession(host,{onChange=()=>{}}={}){
 const app=host.app,rt=app.uiComposition?.rasterTools;
 const masks=createUiEntryCompletion003Adapter(app,{uiBTools:rt});
 let active=false,pen=null,captured=null,layer=null,drag=null,cursor=null,internal=false,pointerLease=null,lastMask=null,lastPixels=0,removed=[],reconciling=false;
 const options={closed:false,fill:'none',stroke:'#202020',strokeWidth:1.5};
 const changed=()=>onChange();
 function availability(id){
  if(!host.getSnapshot().docs.length)return{available:false,reason:'No document'};
  try{host.provider.requireDocument(host.target())}catch(e){return{available:false,reason:e.message}}
  if(PIXEL.has(id)){
   const s=inspectDev1RasterTarget(host);
   return s.ok&&typeof rt.clearRasterSelection==='function'?{available:true}:{available:false,reason:s.reason||'Raster selection receiver unavailable'};
  }
  if(id==='lasso')return {available:true};
  if(id!=='vector-pen')return{available:false,reason:'Unknown tool'};
  const l=app.layer?.();
  return l&&!l.locked&&l.visible!==false&&app.commands.has('path.create.v1')?{available:true}:{available:false,reason:'Choose an unlocked visible layer'};
 }
 function validatePen(){
  host.provider.requireDocument(captured);
  if(!active||app.layer()!==layer||layer.locked||layer.visible===false||app.tool!=='select')throw Error('Path draft target changed');
 }
 function reset(){if(pointerLease!==null)try{app.el.canvas.releasePointerCapture?.(pointerLease)}catch{}pointerLease=null;pen=null;drag=null;cursor=null;removed=[];changed();}
 function deactivate(){if(active||pen){active=false;reset()}return true;}
 function reconcile(event){
  if(reconciling)return;
  reconciling=true;
  try{
  // Reading validates the existing controller-owned selection lease after Undo/document changes.
  rt?.rasterSelection?.();
  if(active&&!internal){if((event?.type==='command'&&event.commandId==='tool.activate.v1')||(event?.type==='state'&&event.reason==='native-tool-state'))deactivate();else try{validatePen()}catch{deactivate()}}
  if(PIXEL.has(rt?.activeTool?.())&&!inspectDev1RasterTarget(host).ok){rt.clearRasterSelection();rt.activate('select');}
  }finally{reconciling=false}
 }
 function activate(id){
  const a=availability(id);if(!a.available)throw Error(a.reason);
  deactivate();
  internal=true;
  try{
   if(app.pathEditing?.active)app.exitPathEdit?.();
   if(app.strokeEdit)app.exitStrokeEdit?.();
   if(PIXEL.has(id)||id==='lasso')checked(rt.activate(id));
   else{
    checked(rt.activate('select'));
    captured=host.target();layer=app.layer();active=true;
    options.stroke=host.select('tool.color')?.color||'#202020';
    app.el.canvas.style.cursor='crosshair';
   }
  }finally{internal=false;changed()}
  return{ok:true,changed:true};
 }
 const activeId=()=>active?'vector-pen':PIXEL.has(rt?.activeTool?.())?rt.activeTool():app.tool==='lasso'?'lasso':null;
 function begin(point){validatePen();if(!pen)pen=new PenPathSession({name:'Pen Path',fill:options.fill,stroke:options.stroke,strokeWidth:options.strokeWidth});if(anchorList(pen).length>=4096)throw Error('Path anchor limit reached');removed=[];const anchor=pen.add(point.x,point.y);drag={anchor};cursor=point;changed();return anchor;}
 function move(point,held=false){cursor=point;if(held&&drag){const a=drag.anchor,dx=point.x-a.x,dy=point.y-a.y;a.in={x:-dx,y:-dy};a.out={x:dx,y:dy};a.mode=dx||dy?'symmetric':'corner';}return true;}
 function end(cancelled=false){if(cancelled&&drag){const list=anchorList(pen);if(list.at(-1)===drag.anchor)list.pop();}drag=null;changed();}
 function finish(close=options.closed){
  validatePen();if(drag)end();
  if(!pen)throw Error('Add at least two anchors');
  if(close&&anchorList(pen).length<3)throw Error('A closed path needs three anchors');
  const path=pen.finish();path.subpaths[0].closed=Boolean(close);
  internal=true;
  try{
   const result=checked(host.execute('path.create.v1',{shape:'path',name:'Pen Path',subpaths:path.subpaths,fill:options.fill,stroke:options.stroke,strokeWidth:options.strokeWidth}));
   const refs=result.result?.createdRefs;
   if(refs?.length){app.selection=refs.map(({layerId,objectId})=>({layerId,objectId}));app.refreshSelectionUI?.();app.renderer?.render?.();}
   app.markDirty?.();
   reset();return result;
  }finally{internal=false}
 }
 function applyMask(){
  const id=activeId();if(!PIXEL.has(id))throw Error('Activate a pixel selection tool');
  const a=availability(id);if(!a.available)throw Error(a.reason);
  host.provider.requireSelection(host.target(),{single:true,type:'image'});
  const s=rt.rasterSelection();if(!s?.alpha?.some(x=>x>0))throw Error('Create a nonempty selection');
  const token=masks.captureTarget('raster-mask');masks.createRasterMask(token);
  app.markDirty?.();rt.clearRasterSelection();checked(rt.activate(id));app.commands.notify('ui017-selection-mask');
  return{ok:true,changed:true};
 }
 function setOption(key,value){
  if(key==='selectionMode'){if(!['new','add','subtract','intersect'].includes(value))throw Error('Unsupported selection mode');rt.setRasterOption(key,value);}
  else if(key==='tolerance'){const n=Number(value);if(value===''||!Number.isInteger(n)||n<0||n>255)throw Error('Tolerance must be 0–255');rt.setRasterOption(key,n);}
  else if(key==='contiguous'){if(!['On','Off'].includes(value))throw Error('Invalid adjacency');rt.setRasterOption(key,value==='On');}
  else if(['searchRadius','edgeThreshold'].includes(key)){const n=Number(value),max=key==='searchRadius'?64:255;if(value===''||!Number.isInteger(n)||n<1||n>max)throw Error('Invalid magnetic setting');rt.setRasterOption(key,n);}
  else if(key==='closed'){if(!['On','Off'].includes(value))throw Error('Invalid closure option');options.closed=value==='On';}
  else if(key==='strokeWidth'){const n=Number(value);if(value===''||!Number.isFinite(n)||n<=0||n>300)throw Error('Stroke width must be greater than 0 and at most 300');options.strokeWidth=n;}
  else if(key==='stroke'){if(!/^#[0-9a-f]{6}$/i.test(value))throw Error('Invalid stroke color');options.stroke=value;}
  else if(key==='fill'){if(value!=='none'&&!/^#[0-9a-f]{6}$/i.test(value))throw Error('Use none or a six-digit hex color');options.fill=value;}
  else throw Error('Unsupported option');
  changed();
 }
 const snapshot=()=>{const selection=rt?.rasterSelection?.()||null;if(selection!==lastMask){lastMask=selection;lastPixels=selection?.alpha?.reduce((n,a)=>n+(a>0?1:0),0)||0;}return{id:activeId(),count:PIXEL.has(activeId())?(rt.rasterSelectionPreview?.()?.points?.length||0):anchorList(pen).length,redo:removed.length,options:{...options},selection,pixels:lastPixels};};
 return{activate,availability,activeId,reconcile,deactivate,reset,begin,move,end,finish,finishPixel:()=>rt.finishRasterSelection(),removePixelPoint:()=>rt.removeRasterSelectionPoint(),applyMask,setOption,snapshot,captureTarget:()=>host.target(),requireTarget:t=>host.provider.requireSelection(t,{single:true,type:'image'}),
  draft:()=>({pen,cursor,dragging:!!drag}),capturePointer(id){pointerLease=id},removeLast(){const a=anchorList(pen).pop();if(a)removed.push(a);drag=null;changed()},redoLast(){if(removed.length&&pen)anchorList(pen).push(removed.pop());changed()},clearSelection:()=>rt.clearRasterSelection(),runtime:rt};
}

export function completionOptionsMarkup(session){
 const s=session.snapshot(),o=s.options,rt=session.runtime,opts=rt.rasterOptions();
 const f=(key,label,value,type='number',choices)=>field('complete:'+key,label,value,type,choices);
 const b=(key,label,disabled=false)=>'<button type="button" data-completion-action="'+key+'"'+(disabled?' disabled':'')+'>'+esc(label)+'</button>';
 if(s.id==='vector-pen')return f('closed','閉合',o.closed?'On':'Off','text',['On','Off'])+f('stroke','線色',o.stroke,'color')+f('strokeWidth','線寬',o.strokeWidth)+f('fill','填色',o.fill,'text')+'<span class="field-row" role="status">節點 '+s.count+'</span>'+b('finish','完成',s.count<(o.closed?3:2))+b('cancel','取消',!s.count);
 if(s.id==='lasso')return '<span class="context-readout">拖曳圈選物件；Shift 加入選取。</span>';
 if(!PIXEL.has(s.id))return '';
 const count=s.pixels;
 return f('selectionMode','選區',opts.selectionMode,'text',['new','add','subtract','intersect'])+
  (s.id==='magicWand'?f('tolerance','容差',opts.tolerance)+f('contiguous','相鄰',opts.contiguous?'On':'Off','text',['On','Off']):'')+
  (['polygonalLasso','magneticLasso'].includes(s.id)?(s.id==='magneticLasso'?f('searchRadius','吸附半徑 px',opts.searchRadius)+f('edgeThreshold','邊緣靈敏度',opts.edgeThreshold):'')+'<span class="context-readout">節點 '+s.count+'</span>'+b('finish-pixel','完成選區',s.count<3)+b('remove-pixel','移除末點',!s.count):'')+
  '<span class="field-row" role="status">'+count+' px</span>'+b('mask','套用遮色片',!count)+b('clear','取消選取',!s.selection);
}

export function mountCompletionTools(root,host,feedback,signal,onChange){
 const session=createCompletionSession(host,{onChange});instances.set(host,session);
 const canvas=host.app.el.canvas;
 const overlay=mountCompletionOverlay(host,session,signal);
 let pointer=null,closing=false;
 const consume=e=>{e.preventDefault();e.stopImmediatePropagation()};
 const safe=fn=>{try{return fn()}catch(e){feedback(e.message);return null}};
 canvas.addEventListener('pointerdown',e=>{
  if(session.activeId()!=='vector-pen'||e.button!==0||host.app.spaceDown)return;
  consume(e);safe(()=>{
   const world=host.app.eventData(e).world,first=session.draft().pen?.path.subpaths[0].anchors[0];
   closing=!!first&&session.snapshot().count>=3&&Math.hypot(first.x-world.x,first.y-world.y)*(host.app.page().camera.scale||1)<7;
   pointer=e.pointerId;session.capturePointer(pointer);canvas.setPointerCapture?.(pointer);
   if(!closing)session.begin(world);canvas.focus?.();overlay.schedule();
  });
 },{capture:true,signal});
 window.addEventListener('pointermove',e=>{
  if(session.activeId()==='vector-pen'&&!host.app.spaceDown&&(e.target===canvas||pointer===e.pointerId)){consume(e);safe(()=>session.move(host.app.eventData(e).world,pointer===e.pointerId));}
  overlay.schedule();
 },{capture:true,signal});
 for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,e=>{
  if(session.activeId()!=='vector-pen'||pointer!==e.pointerId)return;consume(e);pointer=null;
  safe(()=>{session.end(type==='pointercancel');if(closing&&type!=='pointercancel')session.finish(true);closing=false;canvas.releasePointerCapture?.(e.pointerId);overlay.schedule()});
 },{capture:true,signal});
 canvas.addEventListener('dblclick',e=>{
  if(['polygonalLasso','magneticLasso'].includes(session.activeId())){consume(e);if(session.snapshot().count>=3)safe(()=>session.finishPixel());overlay.schedule();return;}
  if(session.activeId()!=='vector-pen')return;consume(e);safe(()=>{
   const list=session.draft().pen?.path.subpaths[0].anchors||[];
   if(list.length>1&&Math.hypot(list.at(-1).x-list.at(-2).x,list.at(-1).y-list.at(-2).y)*(host.app.page().camera.scale||1)<7)session.removeLast();
   session.finish();overlay.schedule();
  });
 },{capture:true,signal});
 window.addEventListener('keydown',e=>{
  if(e.target?.closest?.('input,select,textarea,[contenteditable="true"]'))return;
  const s=session.snapshot();
  if(s.id==='vector-pen'&&(e.ctrlKey||e.metaKey)&&((e.key.toLowerCase()==='z'&&(s.count||s.redo))||(e.key.toLowerCase()==='y'&&s.redo))){consume(e);safe(()=>e.shiftKey||e.key.toLowerCase()==='y'?session.redoLast():session.removeLast());overlay.schedule();return;}
  if(session.activeId()==='vector-pen'&&['Escape','Enter','Backspace','Delete'].includes(e.key)){
   consume(e);safe(()=>e.key==='Escape'?session.reset():e.key==='Enter'?session.finish():session.removeLast());overlay.schedule();
  }else if(['polygonalLasso','magneticLasso'].includes(s.id)&&['Enter','Backspace','Delete'].includes(e.key)){consume(e);safe(()=>e.key==='Enter'?session.finishPixel():session.removePixelPoint());overlay.schedule();}
  else if(PIXEL.has(session.activeId())&&e.key==='Escape'){consume(e);session.clearSelection();overlay.schedule();}
 },{capture:true,signal});
 const off=host.subscribe(()=>{session.reconcile();overlay.schedule()});
 const offCommands=host.app.commands.subscribe(event=>{session.reconcile(event);overlay.schedule()});
 signal.addEventListener('abort',()=>{off();offCommands();session.deactivate();instances.delete(host)},{once:true});
 return session;
}

export function mountCompletionOptions(options,session,feedback,signal){
 const token=JSON.stringify(session.activeId()),target=session.captureTarget();
 const run=fn=>{try{if(JSON.stringify(session.activeId())!==token)throw Error('Tool changed');if(PIXEL.has(session.activeId()))session.requireTarget(target);fn()}catch(e){feedback(e.message)}};
 options.addEventListener('change',e=>{const el=e.target.closest('[data-key^="complete:"]');if(el)run(()=>session.setOption(el.dataset.key.slice(9),el.value))},{signal});
 options.addEventListener('click',e=>{const b=e.target.closest('[data-completion-action]');if(!b||b.disabled)return;run(()=>({'finish-pixel':()=>session.finishPixel(),'remove-pixel':()=>session.removePixelPoint(),finish:()=>session.finish(),cancel:()=>session.reset(),mask:()=>session.applyMask(),clear:()=>session.clearSelection()})[b.dataset.completionAction]?.())},{signal});
}
