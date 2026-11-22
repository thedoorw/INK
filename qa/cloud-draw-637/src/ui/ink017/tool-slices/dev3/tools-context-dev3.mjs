// DEV3 isolated tool slice for UR2 assembly. No shell, menu, History or document owner.
import {esc, field} from '../../shared-controls.js';
import {navigatorZoomText} from '../../panels/navigator-zoom-curve.mjs';

const SHAPES = Object.freeze(['line','arrow','rect','ellipse','triangle']);
const MODES = Object.freeze(['horizontal-tb','vertical-rl']);
const ZOOM_MIN = 0.03, ZOOM_MAX = 128;
const failure = message => { throw new Error(message); };
const ok = response => {
  if (!response || response.ok === false) failure(response?.error?.message || response?.error || 'Native command unavailable');
  return response;
};
const required = (host, id, args={}) => {
  if (host.app?.commands?.has && !host.app.commands.has(id)) failure('Native command unavailable: '+id);
  return ok(host.execute(id,args));
};
const targetIdentity = target => {
  if (!target || typeof target.documentId !== 'string' || typeof target.pageId !== 'string') failure('No active document');
  return target;
};
const current = host => host.getSnapshot();
const doc = state => state.docs?.[0] || null;
const numberIn = (value,min,max) => {
  const n = Number(value);
  if (value == null || value === '' || !Number.isFinite(n) || n < min || n > max) failure('Value out of range');
  return n;
};
const withBounds = (html,min,max) => html.replace('step="any"','step="any" min="'+min+'" max="'+max+'"');
const numeric = (key,label,value,min,max) => withBounds(field(key,label,value),min,max);
const action = (key,title,disabled=false) => '<button type="button" data-dev3-action="'+esc(key)+'"'+(disabled?' disabled':'')+'>'+esc(title)+'</button>';
const group = (label,body) => '<div class="context-parameter-group" role="group" aria-label="'+esc(label)+'">'+body+'</div>';
const textDirection = host => MODES.includes(host.app?.uiBTextMode) ? host.app.uiBTextMode : 'horizontal-tb';
const nodeEligible = (host,s) => {
  if (!doc(s) || s.target?.refs?.length !== 1 || !['path','stroke'].includes(s.object?.type) || s.object.locked) return false;
  const found=host.app?.selectedObjects?.();
  if(Array.isArray(found)){
   if(found.length!==1 || found[0].effectiveLocked || found[0].effectiveVisible===false || found[0].interactionExposed===false || found[0].layer?.locked || found[0].object?.locked)return false;
  }
  return true;
};
const nodeKind = (host,s) => {
  if (!nodeEligible(host,s)) return null;
  const path = host.select('path.current');
  if (s.object?.type === 'path' && path?.active && path?.status === 'AVAILABLE') return 'path';
  if (s.object?.type === 'stroke' && host.app?.strokeEdit && host.app.editableStroke?.()) return 'stroke';
  return null;
};
const pathArgs = target => {
  targetIdentity(target);
  if (!Array.isArray(target.refs) || target.refs.length !== 1) failure('Select exactly one path');
  return {documentId:target.documentId,pageId:target.pageId,...target.refs[0]};
};
const selected = (host,target,type) => {
  host.provider.requireSelection(target,{single:true,...(type?{type}:{})});
  const s = current(host);
  if (s.object?.locked || s.target?.refs?.length !== 1 || (type && s.object.type !== type)) failure('Selection unavailable or locked');
  return s;
};
const format = navigatorZoomText;

export const DEV3_GAP_VECTOR_PEN = Object.freeze({
 id:'vector-pen',status:'SHARED_COMPLETION_RECEIVER',expose:false,
 reason:'Primary home is completion-tools.js: PenPathSession canvas gestures commit through path.create.v1. Do not duplicate its button in the DEV3 slice.'
});
export const DEV3_TOOL_GROUPS = Object.freeze([
 {id:'text',label:'文字',icon:'M4 5h16M12 5v14M8 19h8',variants:[{id:'horizontal-tb',label:'水平文字'},{id:'vertical-rl',label:'垂直文字'}],mode:'native-tool'},
 {id:'nodes',label:'節點編輯',icon:'M5 18L12 5L19 18M5 18h14M4 18h2M11 4h2M18 18h2',variants:[{id:'path',label:'路徑節點'},{id:'stroke',label:'筆畫節點'}],mode:'native-editor'},
 {id:'shape',label:'形狀',icon:'M4 4h16v16H4z',variants:SHAPES.map(id=>({id,label:({line:'直線',arrow:'箭頭',rect:'矩形',ellipse:'橢圓',triangle:'三角形'})[id]})),mode:'native-tool'},
 {id:'guide',label:'參考線',icon:'M4 7h16M7 4v16M4 17h16',variants:[],mode:'native-commands-only'},
 {id:'pan',label:'手形／平移',icon:'M7 11V7a2 2 0 014 0v3-5a2 2 0 014 0v5-3a2 2 0 014 0v7c0 5-3 8-7 8H9c-2 0-3-1-4-3l-2-4',variants:[],mode:'native-tool'},
 {id:'zoom',label:'縮放',icon:'M15 15l5 5M17 10a7 7 0 11-14 0a7 7 0 0114 0M10 7v6M7 10h6',variants:[],mode:'native-commands-only'}
]);
export function describeDev3Tools(host) {
 const s=current(host), open=Boolean(doc(s)), refs=s.target?.refs?.length||0;
 return DEV3_TOOL_GROUPS.map(item=>({
  ...item,enabled:open && (item.id!=='nodes' || nodeEligible(host,s)),
  active: item.id==='text'?s.tool==='text':item.id==='shape'?s.tool==='shape':item.id==='pan'?s.tool==='pan':item.id==='nodes'?Boolean(nodeKind(host,s)):false,
  activeVariant:item.id==='shape'?(host.select('tool.options')?.shapeType||'line'):item.id==='text'?textDirection(host):item.id==='nodes'?nodeKind(host,s):null
 }));
}
export function activateDev3Tool(host,id,variant) {
 const s=current(host), t=host.target();host.provider.requireDocument(t);
 if (id==='text') {
  const direction=variant || textDirection(host);
  if(!MODES.includes(direction)) failure('Unsupported text direction');
  const result=required(host,'tool.activate.v1',{tool:'text'});
  // Text direction lives in the existing app owner used by commitTextEditor; never mutate selected text here.
  if (host.app) {host.app.uiBTextMode=direction;host.app.commands?.notify?.('text-direction');}
  return result;
 }
 if (id==='shape') {
  const shape=variant || host.select('tool.options')?.shapeType || 'line';
  if(!SHAPES.includes(shape)) failure('Unsupported shape');
  required(host,'tool.shape.set.v1',{shape});
  return required(host,'tool.activate.v1',{tool:'shape'});
 }
 if (id==='nodes') {
  selected(host,t,variant==='path'?'path':variant==='stroke'?'stroke':null);
  const type=variant||s.object?.type;
  if(type==='path')return required(host,'path.edit.enter.v1',pathArgs(t));
  if(type==='stroke'){
   if(!host.app?.enterStrokeEdit) failure('Stroke node receiver unavailable');
   const ref=t.refs[0],success=host.app.enterStrokeEdit({layerId:ref.layerId,objectId:ref.objectId});
   if(!success || !host.app.strokeEdit) failure('Stroke node editor failed to enter');
   return {ok:true,changed:false,result:{editor:'stroke'}};
  }
  failure('Select exactly one path or stroke');
 }
 if (id==='pan')return required(host,'tool.activate.v1',{tool:'pan'});
 if (id==='zoom')return required(host,'view.zoom.by.v1',{factor:1.25});
 if (id==='guide')return {ok:true,changed:false,result:{mode:'guide-commands-only'}}; // no fake canvas placement mode
 failure('Tool not installed: '+id);
}
export function dev3OptionsMarkup(host,id,variant='') {
 const s=current(host),d=doc(s);if(!d)return '';
 const o=host.select('tool.options') || {},obj=s.target?.refs?.length===1?s.object:null,editable=obj&&!obj.locked;
 if(id==='text'){
  const text=obj?.type==='text'?obj:null,locked=Boolean(text?.locked),dir=text?null:textDirection(host);
  let body='';
  if(!text)body+=field('text:direction','Direction',dir,'text',MODES);
  body+=field(text?'text:font':'text:family','Font',text?.font||o.font?.family||'system-ui','text');
  body+=numeric(text?'text:size':'text:defaultSize','Size px',text?.size||o.font?.size||32,text?0.01:4,text?4096:512);
  if(text)body+=numeric('text:weight','Weight',text.weight||400,100,900)+numeric('text:leading','Leading px',text.leading||text.size*1.25,Math.max(0.01,Number(text.size||32)*0.01),4096)+numeric('text:tracking','Tracking',text.tracking||0,-1000,1000)+field('text:color','Color',text.textColor||'#202020','color')+field('text:align','Align',text.align||'left','text',['left','center','right','justify']);
  return '<fieldset'+(locked?' disabled':'')+'>'+group(text?'Selected text':'New text defaults',body)+'</fieldset>';
 }
 if(id==='shape'){
  const selectedShape=obj?.type==='shape'?obj:null;
  let body=field('shape:type','Shape',o.shapeType||'line','text',SHAPES)+field('shape:defaultFill','Fill new',o.shapeFill?'On':'Off','text',['Off','On']);
  if(selectedShape)body+='<fieldset'+(selectedShape.locked?' disabled':'')+'>'+numeric('shape:w','W',selectedShape.w,0.001,10000000)+numeric('shape:h','H',selectedShape.h,0.001,10000000)+numeric('shape:rotate','Rotate °',selectedShape.rotate,-360000,360000)+field('shape:fill','Object fill',selectedShape.fill||'#202020','color')+'</fieldset>';
  return group('Shape defaults and selected object',body);
 }
 if(id==='nodes'){
  const active=nodeKind(host,s);
  if(!active)return group('Node editor', '<span class="capability-empty">Select one unlocked Path or Stroke and enter node mode</span>');
  const path=active==='path'?host.select('path.current'):null;
  const selectedCount=active==='path'?(path?.anchors?.length||0):host.app.strokeEdit?.nodeIndices?.size||0;
  const hasSegment=active==='path'?Boolean(path?.segment):Number.isInteger(host.app.strokeEdit?.segmentIndex);
  let body=action('node:all','Select all nodes')+action('node:add','Insert node',!hasSegment)+action('node:delete','Delete node',!selectedCount);
  body+=action('node:corner','Corner',!selectedCount)+action('node:smooth','Smooth',!selectedCount)+action('node:symmetric','Symmetric',!selectedCount);
  if(active==='path')body+=action('node:close','Toggle closed')+action('node:simplify','Simplify')+action('node:refine','Refine');
  if(active==='stroke')body+=action('node:simplify','Simplify stroke');
  body+=action('node:exit','Exit node edit');
  return group(active==='path'?'Path nodes':'Stroke nodes',body);
 }
 if(id==='guide'){
  const guides=d.guides||[],guideId=guides.some(x=>x.id===variant)?variant:(guides[0]?.id||''),g=guides.find(x=>x.id===guideId);
  const choices=guides.map(x=>x.id);
  let body=field('guide:orientation','New guide','horizontal','text',['horizontal','vertical'])+numeric('guide:position','Position',g?.position??0,-10000000,10000000);
  body+=action('guide:add','Add guide');
  if(choices.length)body+=field('guide:target','Guide',guideId,'text',choices)+action('guide:move','Move',g?.locked)+action('guide:delete','Delete')+action('guide:lock',g?.locked?'Unlock':'Lock')+action('guide:visible',g?.visible===false?'Show':'Hide');
  const snap=host.app?.page?.()?.snap?.categories?.guides;
  body+=action('guide:snap',snap?'Snap guides: on':'Snap guides: off');
  return group('Native guide commands',body);
 }
 if(id==='pan'||id==='zoom'){
  const camera=d.camera||{},contract=host.select('view.contract')||{minScale:ZOOM_MIN,maxScale:ZOOM_MAX};
  const min=contract.minScale*100,max=contract.maxScale*100;
  let body='';
  if(id==='zoom')body+=action('view:minus','−');
  body+=numeric('view:zoom','Zoom %',format(camera.zoom??100),min,max);
  if(id==='zoom')body+=action('view:plus','+');
  body+=action('view:fit','Fit content')+action('view:artboard','Fit artboard')+action('view:100','100%');
  return group(id==='pan'?'Pan and view':'Zoom commands',body);
 }
 return '';
}
export function dev3Perform(host,id,key,value,target,guideId) {
 const t=targetIdentity(target);host.provider.requireDocument(t);
 if(key.startsWith('view:')){
  if(key==='view:zoom')return required(host,'view.zoom.set.v1',{scale:numberIn(value,ZOOM_MIN*100,ZOOM_MAX*100)/100});
  const defs={'view:minus':['view.zoom.by.v1',{factor:.8}],'view:plus':['view.zoom.by.v1',{factor:1.25}],'view:fit':['view.fit.content.v1',{}],'view:artboard':['view.fit.artboard.v1',{}],'view:100':['view.zoom.set.v1',{scale:1}]};
  const route=defs[key];if(!route)failure('Unsupported view action');return required(host,route[0],route[1]);
 }
 if(id==='shape'){
  if(key==='shape:type'){if(!SHAPES.includes(value))failure('Unsupported shape');return required(host,'tool.shape.set.v1',{shape:value});}
  if(key==='shape:defaultFill'){if(!['On','Off'].includes(value))failure('Unsupported fill default');return required(host,'tool.shape.fill.set.v1',{fill:value==='On'});}
  if(key==='shape:fill'){selected(host,t,'shape');if(!/^#[0-9a-f]{6}$/i.test(value))failure('Invalid object fill');return ok(host.dispatch({type:'fill.set',target:t,color:value,source:'dev3.shape'}));}
  const prop={'shape:w':'w','shape:h':'h','shape:rotate':'rotate'}[key];
  if(prop){selected(host,t,'shape');return ok(host.dispatch({type:'layer.patch',target:t,patch:{[prop]:numberIn(value,prop==='rotate'?-360000:0.001,prop==='rotate'?360000:10000000)},source:'dev3.shape'}));}
 }
 if(id==='text'){
  if(key==='text:direction'){if(!MODES.includes(value))failure('Unsupported direction'); if(!host.app)failure('Text direction runtime missing');host.app.uiBTextMode=value;host.app.commands?.notify?.('text-direction');return{ok:true,changed:false,result:{direction:value}};}
  if(key==='text:family')return required(host,'tool.text.setting.set.v1',{key:'family',value:String(value).slice(0,200)});
  if(key==='text:defaultSize')return required(host,'tool.text.setting.set.v1',{key:'size',value:numberIn(value,4,512)});
  const prop={'text:font':'font','text:size':'size','text:weight':'weight','text:leading':'leading','text:tracking':'tracking','text:color':'textColor','text:align':'align'}[key];
  if(prop){selected(host,t,'text');const v=['size','weight','leading','tracking'].includes(prop)?numberIn(value,prop==='weight'?100:prop==='tracking'?-1000:0.01,prop==='weight'?900:prop==='tracking'?1000:4096):String(value);if(prop==='textColor'&&!/^#[0-9a-f]{6}$/i.test(v))failure('Invalid text color');if(prop==='align'&&!['left','center','right','justify'].includes(v))failure('Invalid alignment');return ok(host.dispatch({type:'layer.patch',target:t,patch:{[prop]:v},source:'dev3.text'}));}
 }
 if(id==='guide'){
  const d=doc(current(host)),guides=d?.guides||[],g=guides.find(x=>x.id===guideId);
  if(key==='guide:add'){
   const v=value||{};if(!['horizontal','vertical'].includes(v.orientation))failure('Invalid guide orientation');
   return required(host,'guide.add.v1',{orientation:v.orientation,position:numberIn(v.position,-10000000,10000000)});
  }
  if(key==='guide:snap'){const snap=host.app?.page?.()?.snap?.categories?.guides;return required(host,'page.snap.set.v1',{key:'guides',value:!Boolean(snap)});}
  if(!g)failure('Selected guide unavailable');
  if(key==='guide:move'){if(g.locked)failure('Guide locked');return required(host,'guide.move.v1',{guideId:g.id,position:numberIn(value,-10000000,10000000)});}
  if(key==='guide:delete')return required(host,'guide.remove.v1',{guideId:g.id});
  if(key==='guide:lock')return required(host,'guide.lock.set.v1',{guideId:g.id,locked:!g.locked});
  if(key==='guide:visible')return required(host,'guide.visibility.set.v1',{guideId:g.id,visible:g.visible===false});
 }
 if(id==='nodes'){
  const s=selected(host,t),type=nodeKind(host,s);
  if(!type)failure('Node edit mode inactive or stale');
  const path=type==='path'?host.select('path.current'):null,st=host.app?.strokeEdit;
  if(key==='node:exit'){if(type==='path')return required(host,'path.edit.exit.v1');host.app.exitStrokeEdit();return{ok:true,changed:false};}
  if(key==='node:all'){if(type==='path')host.app.selectAllPathAnchors();else host.app.selectAllStrokeNodes();return{ok:true,changed:false};}
  if(key==='node:add'){if(type==='path'){if(!path?.segment)failure('Select path segment');if(!host.app.insertPathAnchor())failure('Path insert failed');}else{if(!Number.isInteger(st?.segmentIndex))failure('Select stroke segment');host.app.insertEditedNode();}return{ok:true,changed:true};}
  if(key==='node:delete'){if(type==='path'){if(!path?.anchors?.length)failure('Select path node');if(!host.app.deletePathAnchors())failure('Path delete failed');}else{if(!st?.nodeIndices?.size)failure('Select stroke node');host.app.deleteEditedNodes();}return{ok:true,changed:true};}
  const mode=key.slice(5);
  if(['corner','smooth','symmetric'].includes(mode)){if(type==='path'){if(!path?.anchors?.length)failure('Select path node');if(!host.app.setPathAnchorMode(mode))failure('Path mode change failed');}else{if(!st?.nodeIndices?.size)failure('Select stroke node');host.app.setEditedNodeMode(mode);}return{ok:true,changed:true};}
  if(key==='node:close'&&type==='path'){const sub=path?.segment?.subpathIndex??0,found=host.app.editablePath?.(),closed=found?.object?.subpaths?.[sub]?.closed;if(typeof closed!=='boolean')failure('Path subpath unavailable');return required(host,'path.closed.set.v1',{...pathArgs(t),subpathIndex:sub,closed:!closed});}
  if(key==='node:simplify'){if(type==='path')return required(host,'path.edit.simplify.v1',{...pathArgs(t),options:{tolerance:.75,handleTolerance:.2,maxPasses:256}});host.app.simplifyEditedStroke();return{ok:true,changed:true};}
  if(key==='node:refine'&&type==='path')return required(host,'path.edit.refine.v1',{...pathArgs(t),options:{maxControlLength:48,maxAddedAnchors:128}});
 }
 failure('No Native receiver for '+id+'/'+key);
}
export function mountDev3Options(root,host,feedback=()=>{},{subscribeUpdates=true}={}) {
 let activeId='',activeVariant='',guideId='',disposed=false;
 const ac=new AbortController(),signal=ac.signal;
 const paint=()=>{
  if(disposed)return;
  const snapshot=current(host),guides=doc(snapshot)?.guides||[];
  if(!guides.some(g=>g.id===guideId))guideId=guides[0]?.id||'';
  root.innerHTML=dev3OptionsMarkup(host,activeId,activeId==='guide'?guideId:activeVariant);
  root.dataset.nativeTarget=JSON.stringify(host.target());
  root.dataset.dev3Tool=activeId;
 };
 const emit=callback=>{try{callback()}catch(error){feedback(error.message||String(error));paint()}};
 const update=e=>{
  const el=e.target?.closest?.('[data-key]');if(!el||!root.contains(el))return;
  const key=el.dataset.key,value=el.value;
  if(key==='guide:target'){guideId=value;paint();return;}
  if(key==='guide:orientation'||key==='guide:position')return; // committed by Add / Move action
  emit(()=>{if(!el.checkValidity?.())return el.reportValidity?.();const t=JSON.parse(root.dataset.nativeTarget);dev3Perform(host,activeId,key,value,t,guideId);});
 };
 const click=e=>{
  const b=e.target?.closest?.('[data-dev3-action]');if(!b||b.disabled||!root.contains(b))return;
  emit(()=>{
   const key=b.dataset.dev3Action,t=JSON.parse(root.dataset.nativeTarget);
   let value;
   if(key==='guide:add')value={orientation:root.querySelector('[data-key="guide:orientation"]').value,position:root.querySelector('[data-key="guide:position"]').value};
   if(key==='guide:move')value=root.querySelector('[data-key="guide:position"]').value;
   const response=dev3Perform(host,activeId,key,value,t,guideId);
   if(key==='guide:add'&&response.result?.guide?.id)guideId=response.result.guide.id;
   if(key==='guide:delete')guideId='';
   paint();
  });
 };
 root.addEventListener('change',update,{signal});root.addEventListener('click',click,{signal});
 const unsubscribe=subscribeUpdates?(host.subscribe?.(paint)||(()=>{})):(()=>{});
 return {
  render(id,variant=''){if(disposed)return;activeId=id;activeVariant=variant;paint();},
  dispose(){if(disposed)return;disposed=true;ac.abort();unsubscribe();root.replaceChildren();},
  getActive(){return {group:activeId,variant:activeVariant,guideId}}
 };
}


