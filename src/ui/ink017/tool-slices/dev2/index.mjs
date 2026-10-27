// INK #419 / DEV2: source-only tool definitions and contextual option slice.
// Native Document, selection, raster controller and History are owned elsewhere.
// UR2 owns rail grouping, activation delegation and assembled context presentation.
import {esc,field} from '../../shared-controls.js';
import {UI_B_RASTER_TOOL_IDS} from '../../../../../ui/capability-raster-tools.js';
import {mountDev2CropInteraction} from './crop-interaction.js';

export const DEV2_SUBTOOL_ICONS=Object.freeze({
 crop:'<path d="M7 3v14a2 2 0 0 0 2 2h12M3 7h14a2 2 0 0 1 2 2v12"/>',
 eyedropper:'<path d="M14 5l5 5M7 17l10-10 3 3-10 10H7zM5 19h5"/>',
 smudge:'<path d="M5 16c3-8 5-9 7-7l-2 6 5-5c3-2 5 1 2 4l-5 7H7z"/>',
 spotHealing:'<path d="M4 18 18 4l3 3L7 21H4zM14 4v4M12 6h4"/>',
 healingBrush:'<path d="m5 19 11-11 3 3L8 22H5zM11 9l5 5M17 3v3M15 5h4"/>',
 patch:'<path d="M5 7 12 4l7 3v10l-7 3-7-3zM8 12h8" stroke-dasharray="2 2"/>',
 cloneStamp:'<path d="M9 4h6v7l4 4v4H5v-4l4-4zM4 22h16"/>',
 patternStamp:'<path d="M8 4h8v8l3 3v4H5v-4l3-3zM5 19h14M9 16h1M14 16h1"/>',
 gradient:'<path d="M4 5h16v14H4zM4 19 20 5M9 16l8-8"/>',
 paintBucket:'<path d="m5 13 7-8 8 7-7 8zM3 21h18M18 7v4"/>',
 localBlur:'<path d="M5 8h14M4 12h16M5 16h14" stroke-dasharray="1 3"/>',
 localSharpen:'<path d="M4 18 12 5l8 13zM7 16h10"/>',
 dodge:'<path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6"/>',
 burn:'<path d="M5 6a7 7 0 1 0 13 12A8 8 0 0 1 5 6z"/>',
 sponge:'<path d="M5 9 9 5l9 2 2 8-6 5-9-4zM9 10h1M14 12h1M10 16h1"/>'
});

const row=(id,n,title,icon,items)=>Object.freeze({
 id,row:n,title,icon,items:Object.freeze(items.map(([key,label,native=key])=>Object.freeze({id:key,label,native,icon:DEV2_SUBTOOL_ICONS[key]||icon})))
});
export const DEV2_TOOL_GROUPS=Object.freeze([
 row('crop',5,'影像裁切','<path d="M7 3v14a2 2 0 0 0 2 2h12M3 7h14a2 2 0 0 1 2 2v12"/>',[['crop','影像裁切',null]]),
 row('eyedropper',6,'滴管','<path d="M14 5l5 5M7 17l10-10 3 3-10 10H7zM5 19h5"/>',[['eyedropper','滴管']]),
 row('healing',8,'修復','<path d="M5 17 17 5l3 3L8 20H5zM9 10l5 5M4 6h4M6 4v4"/>',[
  ['spotHealing','污點修復'],['healingBrush','修復筆刷'],['patch','修補']
 ]),
 row('stamp',9,'印章','<path d="M8 11V7a4 4 0 0 1 8 0v4l4 5v3H4v-3zM4 21h16"/>',[
  ['cloneStamp','仿製印章'],['patternStamp','圖樣印章']
 ]),
 row('fill',11,'填色','<path d="M4 5h16v14H4zM4 19 20 5"/>',[
  ['gradient','漸層'],['paintBucket','油漆桶']
 ]),
 row('local',12,'局部處理','<path d="M4 12c3-5 5 5 8 0s5-5 8 0M4 17c3-5 5 5 8 0s5-5 8 0"/>',[
  ['localBlur','模糊'],['localSharpen','銳利化'],['smudge','塗抹']
 ]),
 row('tone',13,'明暗／色彩','<path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10"/>',[
  ['dodge','加亮'],['burn','加深'],['sponge','海綿']
 ])
]);
export const DEV2_GAPS=Object.freeze([
 {row:5,id:'crop-preview',reason:'UI direct-crop overlay candidate is present, but Chrome Web/Portable, target lease and History verification remains outstanding.'},
 {row:6,id:'all-layers-sampling',reason:'Raster eyedropper samples only the selected 8-bit RGB image, not a composited all-layers surface.'},
 {row:11,id:'gradient-stops',reason:'Raster gradient controller uses exactly two endpoint colors and pointer drag; arbitrary color-stop editing and preview are absent.'},
 {row:13,id:'tone-range',reason:'Dodge and Burn do not expose independent Shadows/Midtones/Highlights ranges or exposure parameters.'},
]);

// Source modes use the controller-owned target lease and explicit source reset.
export const DEV2_WITHHELD_TOOLS=Object.freeze([]);
const SOURCE_WITHHELD=new Set(DEV2_WITHHELD_TOOLS);
const TOOL_IDS=new Set(DEV2_TOOL_GROUPS.flatMap(group=>group.items.map(item=>item.id)));
const MUTATING_IDS=new Set([...TOOL_IDS].filter(id=>id!=='crop'&&id!=='eyedropper'));
const guards=new WeakMap();
const NATIVE_IDS=new Set([...TOOL_IDS].filter(id=>id!=='crop'));
const pct=(key,label)=>({key,label,type:'number',min:0,max:100,scale:100});
const num=(key,label,min,max,step=1)=>({key,label,type:'number',min,max,step});
const choice=(key,label,values)=>({key,label,type:'choice',values});
const color=(key,label)=>({key,label,type:'color'});
const brushFields=[num('radius','半徑（物件單位）',1,300),pct('opacity','不透明度 %'),pct('hardness','硬度 %')];
export const DEV2_FIELD_SCHEMAS=Object.freeze({
 crop:[num('x','X px',0,8191),num('y','Y px',0,8191),num('w','寬度 px',1,8192),num('h','高度 px',1,8192)],
 eyedropper:[num('sampleRadius','取樣半徑 px',0,32)],
 spotHealing:brushFields,healingBrush:brushFields,patch:[pct('opacity','不透明度 %'),num('feather','邊緣羽化 px',0,100)],
 smudge:[num('radius','半徑（物件單位）',1,300),pct('strength','強度 %'),pct('hardness','硬度 %')],
 cloneStamp:brushFields,patternStamp:brushFields,
 gradient:[choice('gradientType','類型',['linear','radial']),color('gradientStart','起始色'),color('gradientEnd','結束色'),pct('opacity','不透明度 %')],
 paintBucket:[num('tolerance','容差',0,255),choice('contiguous','相鄰區域',['On','Off']),pct('opacity','不透明度 %')],
 localBlur:[num('radius','半徑（物件單位）',1,300),pct('strength','強度 %'),pct('hardness','硬度 %')],
 localSharpen:[num('radius','半徑（物件單位）',1,300),pct('strength','強度 %'),pct('hardness','硬度 %')],
 dodge:[num('radius','半徑（物件單位）',1,300),pct('strength','強度 %'),pct('hardness','硬度 %')],
 burn:[num('radius','半徑（物件單位）',1,300),pct('strength','強度 %'),pct('hardness','硬度 %')],
 sponge:[num('radius','半徑（物件單位）',1,300),pct('strength','強度 %'),pct('hardness','硬度 %'),choice('spongeMode','飽和度模式',['saturate','desaturate'])]
});
const runtime=host=>host?.app?.uiComposition?.rasterTools||null;
const current=host=>host?.getSnapshot?.()||{docs:[],object:null};
const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code})};
const findItem=id=>DEV2_TOOL_GROUPS.flatMap(g=>g.items).find(x=>x.id===id)||null;
const selected=host=>{
 const s=current(host),found=host?.app?.selectedObjects?.()||[];
 if(!s.docs?.length||!s.activeDoc)return {ok:false,reason:'NO_DOCUMENT'};
 if(found.length===0||!s.object)return {ok:false,reason:'NO_SELECTION'};
 if(found.length!==1||s.object.type==='selection')return {ok:false,reason:'MULTI_SELECTION'};
 const f=found[0];
 if(f.effectiveLocked||f.layer?.locked||f.object?.locked||f.ancestors?.some(o=>o.locked)||s.object.locked)return {ok:false,reason:'TARGET_LOCKED'};
 if(f.object?.type!=='image'||!f.object.rasterState?.colorRaster)return {ok:false,reason:'IMAGE_RASTER_REQUIRED'};
 const r=f.object.rasterState.colorRaster;
 if(r.bitDepth!==8||r.colorMode!=='RGB')return {ok:false,reason:'RGB8_REQUIRED'};
 if(!Number.isInteger(r.width)||!Number.isInteger(r.height)||r.width<1||r.height<1)return {ok:false,reason:'RASTER_DIMENSIONS_INVALID'};
 return {ok:true,width:r.width,height:r.height,found:f,objectId:f.object.id,docId:s.activeDoc};
};
export function dev2Availability(host,id){
 if(SOURCE_WITHHELD.has(id))return {available:false,reason:'SOURCE_RESET_UNAVAILABLE'};
 if(['cloneStamp','healingBrush'].includes(id)&&(!runtime(host)?.sourceInfo||!runtime(host)?.resetRasterSource))return {available:false,reason:'SOURCE_RESET_UNAVAILABLE'};
 if(!TOOL_IDS.has(id))return {available:false,reason:'UNKNOWN_TOOL'};
 const s=selected(host);
 if(!s.ok)return {available:false,reason:s.reason};
 if(!host?.provider?.requireSelection||!host?.target)return {available:false,reason:'TARGET_PROVIDER_MISSING'};
 if(id==='crop'&&!host?.execute)return {available:false,reason:'CROP_COMMAND_MISSING'};
 const rt=runtime(host);
 if(id!=='crop'&&(!rt||typeof rt.activate!=='function'||typeof rt.activeTool!=='function'||typeof rt.setRasterOption!=='function'))return {available:false,reason:'RASTER_RUNTIME_MISSING'};
 if(MUTATING_IDS.has(id)&&typeof rt.rasterSelection!=='function')return {available:false,reason:'RASTER_SELECTION_RECEIVER_MISSING'};
 if(MUTATING_IDS.has(id)&&rt.selectionClipping!==true&&rt.rasterSelection()?.alpha)return {available:false,reason:'RASTER_SELECTION_MASK_UNSUPPORTED'};
 if(id!=='crop'&&!guards.has(host))return {available:false,reason:'SAFETY_GUARD_REQUIRED'};
 return {available:true,reason:'READY',width:s.width,height:s.height};
}
function requireTarget(host,id,token){
 const status=dev2Availability(host,id);
 if(!status.available)fail(status.reason);
 // Native provider owns generation, single-selection, effective locks and History-busy checks.
 host.provider.requireSelection(token,{single:true,type:'image'});
 const again=selected(host);
 if(!again.ok)fail(again.reason);
 return again;
}
// Only a view lease: no independent selected-object, raster or History state.
const sameTarget=(a,b)=>Boolean(a&&b&&a.documentId===b.documentId&&a.pageId===b.pageId&&a.generation===b.generation
 &&Array.isArray(a.refs)&&Array.isArray(b.refs)&&a.refs.length===b.refs.length
 &&a.refs.every((ref,i)=>ref.layerId===b.refs[i].layerId&&ref.objectId===b.refs[i].objectId));
const WATCHED_IDS=new Set([...NATIVE_IDS,...SOURCE_WITHHELD]);
export function mountDev2SafetyGuard(host,{eventTarget=typeof window!=='undefined'?window:null,onStop=()=>{}}={}){
 if(!host?.target||!host?.getSnapshot||!host?.subscribe||!host?.app)throw Error('DEV2_GUARD_HOST_REQUIRED');
 if(!eventTarget?.addEventListener||!eventTarget?.removeEventListener)throw Error('DEV2_GUARD_CAPTURE_REQUIRED');
 if(guards.has(host))throw Error('DEV2_GUARD_DUPLICATE');
 const rt=runtime(host);
 if(!rt?.activate||!rt?.activeTool||!rt?.subscribe)throw Error('DEV2_GUARD_RUNTIME_REQUIRED');
 let lease=null,blocked=false,stopping=false,disposed=false;
 function stop(reason='TARGET_CHANGED'){
  if(disposed||stopping)return {stopped:false,reason};
  if(!lease&&!blocked)return {stopped:false,reason};
  lease=null;blocked=true;stopping=true;
  let error=null;
  try{const r=rt.activate('select');if(r?.ok===false)error=r.error?.message||r.error||'DISARM_FAILED'}
  catch(e){error=e.message}
  finally{stopping=false;if(!WATCHED_IDS.has(rt.activeTool?.()))blocked=false}
  try{onStop({reason,disarmed:!blocked,error})}catch{}
  return {stopped:true,reason,disarmed:!blocked,error};
 }
 function check(){
  if(disposed)return {ok:false,reason:'SLICE_DISPOSED'};
  if(stopping)return {ok:false,reason:'DISARMING'};
  if(blocked){if(!WATCHED_IDS.has(rt.activeTool?.()))blocked=false;else return {ok:false,reason:'DISARM_FAILED'}}
  if(!lease){
   if(WATCHED_IDS.has(rt.activeTool?.())){blocked=true;stop('UNLEASED_RASTER_MODE');return {ok:false,reason:'UNLEASED_RASTER_MODE'}}
   return {ok:true,id:null};
  }
  let reason='TARGET_CHANGED';
  try{
   if(rt.activeTool()!==lease.id){lease=null;return check()}
   const info=selected(host);
   if(!info.ok)reason=info.reason;
   else if(!sameTarget(host.target(),lease.token)||info.found.object!==lease.object||info.found.layer!==lease.layer)reason='TARGET_CHANGED';
   else if(MUTATING_IDS.has(lease.id)&&rt.selectionClipping!==true&&rt.rasterSelection?.()?.alpha)reason='RASTER_SELECTION_MASK_UNSUPPORTED';
   else return {ok:true,id:lease.id};
  }catch(e){reason=e.code||'TARGET_CHANGED'}
  stop(reason);return {ok:false,reason};
 }
 const onPointer=event=>{
  const result=check();
  if(result.ok)return;
  const canvas=host.app?.el?.canvas;
  const onCanvas=!!canvas&&(event.target===canvas||canvas.contains?.(event.target)||event.composedPath?.().includes(canvas));
  if(onCanvas){event.preventDefault?.();event.stopImmediatePropagation?.()}
 };
 for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])eventTarget.addEventListener(type,onPointer,true);
 const offHost=host.subscribe(check),offRaster=rt.subscribe(check);
 const guard=Object.freeze({
  arm(id,token){
   if(disposed)fail('SLICE_DISPOSED');
   if(blocked)fail('DISARM_FAILED');
   if(!NATIVE_IDS.has(id))fail('TOOL_UNAVAILABLE');
   if(lease){stop('TOOL_SWITCH');if(blocked)fail('DISARM_FAILED')}
   const info=selected(host);
   if(!info.ok)fail(info.reason);
   if(!sameTarget(host.target(),token))fail('TARGET_STALE');
   if(MUTATING_IDS.has(id)&&rt.selectionClipping!==true&&rt.rasterSelection?.()?.alpha)fail('RASTER_SELECTION_MASK_UNSUPPORTED');
   lease={id,token,object:info.found.object,layer:info.found.layer};
  },
  check,
  matches(id,token){const v=check();return v.ok&&lease?.id===id&&sameTarget(lease.token,token)},
  disarm:stop,
  dispose(){
   if(disposed)return false;
   check(); // includes an unleased direct Raster mode that must not outlive this interception
   if(lease||blocked)stop('SLICE_DISPOSED');
   // A failed Native cancellation must keep window-capture protection installed.
   if(blocked)return false;
   disposed=true;lease=null;
   offHost?.();offRaster?.();
   for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])eventTarget.removeEventListener(type,onPointer,true);
   guards.delete(host);return true;
  }
 });
 guards.set(host,guard);
 check();return guard;
}

export function dev2ActiveId(host){
 const value=runtime(host)?.activeTool?.();
 return NATIVE_IDS.has(value)&&guards.get(host)?.matches(value,host.target())?value:null;
}
export function dev2Projection(host){
 const id=dev2ActiveId(host),availability={};
 for(const group of DEV2_TOOL_GROUPS)availability[group.id]=group.items.map(item=>({id:item.id,label:item.label,...dev2Availability(host,item.id),active:item.id===id}));
 return {activeId:id,groups:availability};
}
export function activateDev2Tool(host,id,{target=host?.target?.()}={}){
 const guard=guards.get(host);
 try{
  requireTarget(host,id,target);
  const rt=runtime(host);
  if(id==='crop'){
   const stopped=guard?.disarm('CROP_CONTEXT');
   if(stopped?.stopped&&!stopped.disarmed)fail('DISARM_FAILED');
   if(UI_B_RASTER_TOOL_IDS.has(rt?.activeTool?.())){
    const result=rt.activate('select');
    if(result?.ok===false||UI_B_RASTER_TOOL_IDS.has(rt.activeTool?.()))fail('DISARM_FAILED');
   }
   return {ok:true,changed:false,contextOnly:true};
  }
  if(!guard)fail('SAFETY_GUARD_REQUIRED');
  guard.arm(id,target);
  const result=rt.activate(id);
  if(result?.ok===false)fail(result.error?.code||'ACTIVATION_FAILED',result.error?.message||'Activation failed');
  if(!guard.matches(id,target))fail('TARGET_CHANGED_DURING_ACTIVATION');
  return {ok:true,changed:!!result?.changed,activeId:dev2ActiveId(host),result:result?.result};
 }catch(error){
  if(guard&&id!=='crop')guard.disarm('ACTIVATION_FAILED');
  return {ok:false,changed:false,error:{code:error.code||'CAPABILITY_UNAVAILABLE',message:error.message}}
 }
}
function specFor(id,key){return DEV2_FIELD_SCHEMAS[id]?.find(x=>x.key===key)||null}
function normalize(spec,value){
 if(spec.type==='choice'){
  if(spec.key==='contiguous'){if(value!=='On'&&value!=='Off')fail('SETTING_OUT_OF_RANGE');return value==='On'}
  if(!spec.values.includes(value))fail('SETTING_OUT_OF_RANGE');return value;
 }
 if(spec.type==='color'){if(!/^#[0-9a-f]{6}$/i.test(String(value)))fail('SETTING_OUT_OF_RANGE');return String(value).toLowerCase()}
 const n=Number(value);
 if(value===''||!Number.isFinite(n)||n<spec.min||n>spec.max)fail('SETTING_OUT_OF_RANGE');
 if(spec.scale)return n/spec.scale;
 if(spec.step===1&&!Number.isInteger(n))fail('SETTING_OUT_OF_RANGE');
 return n;
}
export function setDev2Option(host,id,key,value,{target=host?.target?.()}={}){
 try{
  if(id==='crop')fail('CROP_DRAFT_ONLY');
  const spec=specFor(id,key);if(!spec)fail('SETTING_UNSUPPORTED');
  requireTarget(host,id,target);
  const rt=runtime(host);
  if(!guards.get(host)?.matches(id,target))fail('SAFETY_LEASE_EXPIRED');
  if(rt.activeTool()!==id)fail('TOOL_NOT_ACTIVE');
  const next=normalize(spec,value),before=rt.rasterOptions?.()[key];
  if(before===next)return {ok:true,changed:false,value:next};
  const result=rt.setRasterOption(key,next);
  if(result[key]!==next)fail('OPTION_RECEIVER_MISMATCH');
  // Options are controller state; they are not document mutations or History entries.
  return {ok:true,changed:true,value:next};
 }catch(error){return {ok:false,changed:false,error:{code:error.code||'CAPABILITY_UNAVAILABLE',message:error.message}}}
}
export async function applyDev2Crop(host,draft,{target=host?.target?.()}={}){
 try{
  const selectedImage=requireTarget(host,'crop',target),rect={};
  for(const k of ['x','y','w','h']){const spec=specFor('crop',k);rect[k]=normalize(spec,draft?.[k])}
  if(rect.x+rect.w>selectedImage.width||rect.y+rect.h>selectedImage.height)fail('CROP_OUT_OF_BOUNDS');
  const guard=guards.get(host),rt=runtime(host);
  if(guard){
   const result=guard.disarm('CROP_APPLY');
   if(result.stopped&&!result.disarmed)fail('DISARM_FAILED');
  }
  if(UI_B_RASTER_TOOL_IDS.has(rt?.activeTool?.()))fail('RASTER_TOOL_STILL_ACTIVE');
  // Installed Native handler validates target again and owns history push/refresh.
  const response=await host.execute('ui017.image.crop.v1',{...rect,target});
  if(response?.ok===false)fail(response.error?.code||'NATIVE_CROP_FAILED',response.error?.message||String(response.error));
  return {ok:true,changed:!!response?.changed,result:response?.result};
 }catch(error){return {ok:false,changed:false,error:{code:error.code||'CAPABILITY_UNAVAILABLE',message:error.message}}}
}
function formField(spec,value){
 const displayed=spec.type==='choice'&&spec.key==='contiguous'?(value?'On':'Off'):spec.scale?Math.round(Number(value||0)*spec.scale):value;
 if(spec.type==='choice')return field(spec.key,spec.label,displayed,'text',spec.values);
 if(spec.type==='color')return field(spec.key,spec.label,displayed||'#000000','color');
 return field(spec.key,spec.label,displayed??spec.min,'number').replace('step="any"','step="'+(spec.step||1)+'" min="'+spec.min+'" max="'+spec.max+'"');
}
export function dev2OptionsMarkup(host,id){
 const item=findItem(id);if(!item)return '';
 const availability=dev2Availability(host,id),s=selected(host),rt=runtime(host),opts=rt?.rasterOptions?.()||{};
 const values=id==='crop'?{x:0,y:0,w:s.width||1,h:s.height||1}:opts;
 const html=(DEV2_FIELD_SCHEMAS[id]||[]).map(spec=>formField(spec,values[spec.key])).join('');
 const explain=({
  crop:'在畫布上拖曳建立裁切框，拖曳八點控制柄或移動框；Apply 經原生裁切與 History，Cancel 不修改文件。',
  eyedropper:'從選取影像取色（不支援合成所有圖層）。',
  healingBrush:'Alt/Option 點擊影像設定來源，再在目標處刷過。',
  patch:'先建立像素選區，從選區內拖曳到來源區域；放開後修補。',
  cloneStamp:'Alt/Option 點擊來源，再刷至目標；來源綁定目前影像，切換後需重新取樣。',
  patternStamp:'先載入圖樣，再在目標影像刷過；圖樣尚未寫入文件。',
  gradient:'在影像上拖曳起點與終點；目前只有兩個色標。',
  paintBucket:'點擊影像色域填色；顏色來自現有前景色。',
  localBlur:'在影像刷過模糊；遵從目前像素選區。',
  localSharpen:'在影像刷過銳化；遵從目前像素選區。',
  dodge:'在影像刷過加亮；尚無高光／中間調／陰影範圍。',
  burn:'在影像刷過加深；尚無高光／中間調／陰影範圍。',
  smudge:'按住拖曳將顏色推向移動方向；遵從目前像素選區。',
  sponge:'在影像刷過增加或降低飽和度。'
 })[id]||'按目前已安裝的 Raster 互動操作。';
 const controls=id==='crop'?'<button type="button" data-dev2-action="crop-reset">重新框選</button><button type="button" data-dev2-action="apply">Apply</button><button type="button" data-dev2-action="cancel">Cancel</button>':'';
 const pattern=id==='patternStamp'?'<label class="field-row"><span>圖樣影像</span><input type="file" data-dev2-pattern accept="image/*" aria-label="載入圖樣影像"></label><span class="context-readout">'+esc(rt?.patternInfo?.().name||'尚未載入圖樣')+'</span>':'';
 const source=['cloneStamp','healingBrush'].includes(id)?'<span class="context-readout">來源 '+esc(rt?.sourceInfo?.()?Math.round(rt.sourceInfo().x)+', '+Math.round(rt.sourceInfo().y):'尚未取樣')+'</span><button type="button" data-dev2-action="source-clear">清除來源</button>':'';
 const readout=id==='eyedropper'?'<span class="context-readout">前景色 '+esc(current(host).paint?.foreground||'—')+'</span>':'';
 return '<div data-dev2-options="'+esc(id)+'" class="context-parameter-group" role="group" aria-label="'+esc(item.label)+' 選項"><fieldset'+(availability.available?'':' disabled')+'>'+html+source+pattern+readout+controls+'</fieldset><span class="capability-empty">'+esc(availability.available?explain:availability.reason)+'</span></div>';
}
async function loadPattern(host,file,token,isDisposed){
 if(!file||!String(file.type||'').startsWith('image/')||file.size>16777216)fail('PATTERN_FILE_INVALID');
 if(typeof createImageBitmap!=='function'||typeof document==='undefined')fail('PATTERN_DECODER_UNAVAILABLE');
 requireTarget(host,'patternStamp',token);
 const bitmap=await createImageBitmap(file);
 try{
  if(isDisposed())fail('SLICE_DISPOSED');
  requireTarget(host,'patternStamp',token);
  if(runtime(host)?.activeTool?.()!=='patternStamp')fail('TOOL_NOT_ACTIVE');
  const scale=Math.min(1,256/Math.max(bitmap.width,bitmap.height));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bitmap.width*scale));c.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=c.getContext('2d',{willReadFrequently:true});if(!context)fail('PATTERN_CANVAS_UNAVAILABLE');
  context.drawImage(bitmap,0,0,c.width,c.height);
  requireTarget(host,'patternStamp',token);
  runtime(host).setPatternImage(context.getImageData(0,0,c.width,c.height),file.name||'Pattern');
  return {ok:true,changed:true};
 }finally{bitmap.close?.()}
}
export function mountDev2Options(root,host,id,{onFeedback=()=>{},onCancel=()=>{},onApplied=()=>{},subscribeUpdates=true}={}){
 if(!root?.addEventListener||!TOOL_IDS.has(id))throw Error('DEV2_MOUNT_INVALID');
 let disposed=false,busy=false,crop=null;
 const abort=new AbortController(),{signal}=abort;
 const paint=()=>{if(disposed)return;root.innerHTML=dev2OptionsMarkup(host,id);root.dataset.nativeTarget=JSON.stringify(host.target());crop?.syncForm()};
 const notify=error=>onFeedback(error?.message||String(error));
 const change=async event=>{
  if(disposed||busy)return;
  const el=event.target,token=JSON.parse(root.dataset.nativeTarget||'null');
  if(el?.hasAttribute?.('data-dev2-pattern')){
   busy=true;
   try{await loadPattern(host,el.files?.[0],token,()=>disposed);if(!disposed)paint()}
   catch(error){if(!disposed)notify(error)}
   finally{busy=false}
   return;
  }
  if(!el?.dataset?.key)return;
  if(id==='crop'){crop?.updateFromForm();return;}
  const value=el.value;
  const result=setDev2Option(host,id,el.dataset.key,value,{target:token});
  if(!result.ok)notify(result.error);
  paint();
 };
 const click=async event=>{
  if(disposed||busy)return;
  const action=event.target?.closest?.('[data-dev2-action]')?.dataset.dev2Action;
  if(!action)return;
  event.preventDefault();
  if(action==='source-clear'){runtime(host)?.resetRasterSource?.();paint();return;}
  if(id!=='crop')return;
  if(action==='crop-reset'){crop?.reset();return;}
  if(action==='cancel'){onCancel();if(!disposed)root.replaceChildren();return}
  const values={};
  for(const el of root.querySelectorAll('[data-key]'))values[el.dataset.key]=el.value;
  const token=JSON.parse(root.dataset.nativeTarget||'null');
  busy=true;
  try{const result=await applyDev2Crop(host,values,{target:token});if(!result.ok)notify(result.error);else onApplied(result);if(!disposed)paint()}
  finally{busy=false}
 };
 root.addEventListener('change',change,{signal});root.addEventListener('click',click,{signal});
 const unsubscribe=subscribeUpdates?(host.subscribe?.(()=>{if(!busy)paint()})||(()=>{})):(()=>{});
 paint();
 if(id==='crop'&&dev2Availability(host,'crop').available)try{crop=mountDev2CropInteraction(root,host,{onFeedback:notify})}
 catch(error){notify(error)} // Numeric crop remains usable if no interactive canvas.
 return {render:paint,dispose(){if(disposed)return;disposed=true;abort.abort();crop?.dispose();unsubscribe();root.replaceChildren()}};
}
