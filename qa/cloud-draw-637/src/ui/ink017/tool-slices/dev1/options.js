// DEV1 tool-specific option projection. Uses the existing host and shared field primitive.
// No app-owned state, new menu controller, CSS width family, or raster algorithm here.
import {field,esc} from '../../shared-controls.js';
import {getDev1Tool,getDev1Availability,dev1ActiveKey,DEV1_RASTER_KEYS} from './catalog.js';
import {setDev1RasterOption,dev1RasterRuntime,dev1RasterMaskScope,DEV1_RASTER_OPTION_FIELDS} from './raster-session.js';

const PERCENT=['opacity','flow','smoothing','pressure','taper','wetness','grain','bristle','softness'];
const LABELS=Object.freeze({
 size:'Size px',opacity:'Opacity %',flow:'Flow %',smoothing:'Smoothing %',
 pressure:'Pressure %',taper:'Taper %',wetness:'Wetness %',grain:'Grain %',
 bristle:'Bristle %',softness:'Softness %'
});
const DRAW=new Set(['pen','pencil','marker','brush','airbrush']);
export function validateDev1Setting(key,value){
 if(key!=='size'&&!PERCENT.includes(key))return null;
 if(value===null||value===undefined||String(value).trim()==='')return null;
 const n=Number(value);
 if(!Number.isFinite(n))return null;
 if(key==='size')return n>=1&&n<=300?n:null;
 return n>=0&&n<=100?n/100:null;
}
const numberField=(key,label,value,min,max)=>{
 const f=field('dev1:'+key,label,value,'number');
 return f.replace('step="any"','step="any" min="'+min+'" max="'+max+'"');
};
const row=(key,value)=>numberField(key,LABELS[key],key==='size'?value:Math.round(value*10000)/100,key==='size'?1:0,key==='size'?300:100);
const readout=(label,value)=>'<span class="field-row" role="status"><span>'+esc(label)+'</span><output>'+esc(value)+'</output></span>';
const btn=(key,label,disabled=false)=>'<button type="button" data-dev1-action="'+key+'"'+(disabled?' disabled':'')+'>'+esc(label)+'</button>';
export function renderDev1Options(snapshot,host){
 const tool=dev1ActiveKey(snapshot,host)||String(snapshot?.tool||'');
 const cfg=getDev1Tool(tool);
 if(!cfg||!snapshot?.docs?.length||!getDev1Availability(tool,host,snapshot).available)return '';
 const target=snapshot.target||{refs:[]},count=target.refs?.length||0;
 const object=snapshot.object,locked=!!object?.locked;
 let html='';
 if(tool==='select'){
  const applicable=count>0&&!!object;
  html='<div class="context-parameter-group" role="group" aria-label="Object transform">'+
   (applicable?'<fieldset'+(locked?' disabled':'')+'>'+
     numberField('x','X',object.x,-1e7,1e7)+numberField('y','Y',object.y,-1e7,1e7)+
     (count===1?numberField('w','W',object.w,0.001,1e7)+numberField('h','H',object.h,0.001,1e7)+numberField('rotate','Rotate °',object.rotate,-1e7,1e7)+
      btn('aspect',snapshot.toolOptions?.['select.aspect']?'Unlock ratio':'Lock ratio')+
      (['path','shape'].includes(object.type)?field('dev1:fill','Fill',/^#[0-9a-f]{6}$/i.test(object.fill)?object.fill:'#202020','color'):''):'')+
     '</fieldset>':
     readout('Object selection','No selection'))+
   (applicable?'<div class="context-actions" role="group" aria-label="Selected object actions">'+
     btn('duplicate','Duplicate',locked)+btn('delete','Delete',locked)+
     (count>1?btn('alignX','Align centers',locked):'')+'</div>':'')+'</div>';
 }else if(tool==='lasso'){
  html=readout('Selection','Freeform objects')+
   readout('Pixel feather','Not available');
 }else if(DEV1_RASTER_KEYS.includes(tool)){
  const rt=dev1RasterRuntime(host),opts=rt?.rasterOptions?.()||{},mask=rt?.rasterSelection?.();
  const maskScope=dev1RasterMaskScope(host);
  const mode=field('dev1:selectionMode','Mask combination',maskScope==='current'?(opts.selectionMode||'new'):'new','text',maskScope==='current'?['new','add','subtract','intersect']:['new']);
  const optional=DEV1_RASTER_OPTION_FIELDS[tool].filter(key=>key!=='selectionMode').map(key=>{
   if(key==='contiguous')return field('dev1:contiguous','Adjacent region',opts.contiguous?'On':'Off','text',['On','Off']);
   if(key==='tolerance'||key==='edgeThreshold')return numberField(key,key==='tolerance'?'Tolerance':'Edge threshold',opts[key],0,255);
   if(key==='searchRadius')return numberField(key,'Edge search radius',opts[key],1,64);
   return '';
  }).join('');
  const instruction=tool==='wand'?'Click inside a selected RGB8 image.':
   'Click image to add anchors; double-click to finish.';
  html='<div class="context-parameter-group" role="group" aria-label="Temporary raster selection options">'+
   mode+optional+readout('Raster mask',maskScope==='current'?'Temporary (controller only)':maskScope==='unbound'?'Unbound previous mask (not reused)':'None')+
   '<span class="capability-empty">'+esc(instruction)+' Mask has no verified canvas overlay, consumer, clear action or Document/History persistence.</span></div>';
 }else if(DRAW.has(tool)){
  const settings=host.select?.('tool.settings',{tool})||null;
  if(!settings)return '';
  const keys=['size','opacity','flow','smoothing','pressure','taper','wetness','grain','bristle','softness']
   .filter(key=>Number.isFinite(settings[key]));
  html='<div class="context-parameter-group" role="group" aria-label="'+esc(cfg.label)+' parameters">'+
   keys.map(key=>row(key,settings[key])).join('')+'</div>';
 }else if(tool==='eraser'){
  const last=host.app?.lastDrawTool,settings=last?host.select?.('tool.settings',{tool:last}):null;
  if(!Number.isFinite(settings?.size))return '';
  // InkApp.eraserRadiusWorld(): max(3, lastDrawTool.size * .9) / 2.
  // This is a derived diameter, NOT an independently editable eraser size.
  const diameter=Math.max(3,settings.size*.9);
  html=readout('Effective eraser diameter',Math.round(diameter*100)/100+' world units')+
       readout('Size source',last+' · '+settings.size+' px')+
       readout('Eraser mode',host.app?.eraserMode==='object'?'Object':'Stroke segments');
 }
 return html?'<div data-dev1-options-tool="'+esc(tool)+'">'+html+'</div>':'';
}
function ensureValid(root,host,{selection=false}={}){
 const snapshot=host.getSnapshot(),tool=root.querySelector('[data-dev1-options-tool]')?.dataset.dev1OptionsTool;
 if(!snapshot.docs.length||dev1ActiveKey(snapshot,host)!==tool)throw Error('DEV1_TARGET_STALE');
 const captured=JSON.parse(root.dataset.nativeTarget||'null');
 if(!captured||!host.provider?.requireDocument)throw Error('DEV1_TARGET_UNVERIFIED');
 if(selection||DEV1_RASTER_KEYS.includes(tool))host.provider.requireSelection(captured,{single:DEV1_RASTER_KEYS.includes(tool),type:DEV1_RASTER_KEYS.includes(tool)?'image':null});
 else host.provider.requireDocument(captured);
 if(host.app?.history?.pending||host.app?.interaction)throw Error('DEV1_INTERACTION_BUSY');
 return {snapshot,tool,captured};
}
function requireOk(result){
 if(!result||result.ok===false)throw Error(result?.error?.message||result?.error||'DEV1_NATIVE_UNAVAILABLE');
 return result;
}
export function commitDev1Option(root,host,key,raw){
 const selectionKey=['x','y','w','h','rotate','fill'].includes(key);
 const actionKey=['duplicate','delete','alignX','aspect'].includes(key);
 const {snapshot,tool,captured}=ensureValid(root,host,{selection:selectionKey||actionKey});
 if(DEV1_RASTER_KEYS.includes(tool))return requireOk(setDev1RasterOption(host,tool,key,raw,{target:captured}));
 if(DRAW.has(tool)&&LABELS[key]){
  const value=validateDev1Setting(key,raw);
  if(value===null)throw Error('DEV1_PARAMETER_OUT_OF_RANGE');
  if(!Number.isFinite(host.select?.('tool.settings',{tool})?.[key]))throw Error('DEV1_PARAMETER_NOT_SUPPORTED');
  return requireOk(host.dispatch({type:'tool.option',key:tool+'.'+key,value,source:'context.dev1'}));
 }
 if(tool!=='select')throw Error('DEV1_TOOL_MISMATCH');
 const count=captured.refs?.length||0,single=count===1;
 if(key==='aspect'){
  if(!single||snapshot.object?.locked)throw Error('DEV1_SELECTION_INAPPLICABLE');
  return requireOk(host.dispatch({type:'tool.option',key:'select.aspect',value:snapshot.toolOptions?.['select.aspect']?0:1,source:'context.dev1'}));
 }
 if(!count||snapshot.object?.locked)throw Error('DEV1_SELECTION_INAPPLICABLE');
 if(selectionKey){
  if(key==='fill'){
   if(!single||!['path','shape'].includes(snapshot.object?.type)||!/^#[0-9a-f]{6}$/i.test(raw))throw Error('DEV1_SELECTION_INAPPLICABLE');
   return requireOk(host.dispatch({type:'fill.set',color:raw,target:captured,source:'context.dev1'}));
  }
  if(['w','h','rotate'].includes(key)&&!single)throw Error('DEV1_SINGLE_OBJECT_REQUIRED');
  if(raw===null||raw===undefined||String(raw).trim()==='')throw Error('DEV1_PARAMETER_OUT_OF_RANGE');
  const value=Number(raw);
  if(!Number.isFinite(value)||Math.abs(value)>1e7||(['w','h'].includes(key)&&value<.001))throw Error('DEV1_PARAMETER_OUT_OF_RANGE');
  return requireOk(host.dispatch({type:'layer.patch',patch:{[key]:value},target:captured,source:'context.dev1'}));
 }
 if(key==='duplicate'||key==='delete')return requireOk(host.dispatch({type:'layer.'+key,object:true,target:captured,source:'context.dev1'}));
 if(key==='alignX'){
  if(count<2)throw Error('DEV1_MULTI_OBJECT_REQUIRED');
  return requireOk(host.execute('object.align.v1',{mode:'centerX',targetRefs:captured.refs.map(ref=>({...ref,pageId:captured.pageId}))}));
 }
 throw Error('DEV1_OPTION_UNSUPPORTED');
}
// Caller supplies the same AbortSignal used by the existing lifecycle.
// A mount is scoped to one rendered snapshot; UR rerenders on Native host changes.
export function mountDev1Options(root,host,signal){
 if(!root||!host||!signal)throw TypeError('DEV1_MOUNT_REQUIRES_HOST_AND_SIGNAL');
 if(!root.dataset.nativeTarget)root.dataset.nativeTarget=JSON.stringify(host.target());
 const handle=(key,value)=>{try{commitDev1Option(root,host,key,value)}catch(error){host.app?.toast?.(error.message)}};
 root.addEventListener('change',event=>{
  const control=event.target?.closest?.('[data-key^="dev1:"]');
  if(!control||!root.contains(control))return;
  if(!control.checkValidity()){control.reportValidity();return}
  handle(control.dataset.key.slice(5),control.value);
 },{signal});
 root.addEventListener('click',event=>{
  const button=event.target?.closest?.('[data-dev1-action]');
  if(!button||button.disabled||!root.contains(button))return;
  handle(button.dataset.dev1Action,null);
 },{signal});
 return {dispose:()=>{ /* Listeners are owned and aborted by the shared lifecycle. */ }};
}
