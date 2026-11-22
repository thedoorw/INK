// Reuses the installed UI-B rasterTools adapter. This file owns NO raster mask,
// selection, History, pointer algorithm, or persistent app state.
// A lifecycle-only capture guards the UI session against selection/document drift.
export const DEV1_RASTER_NATIVE_IDS=Object.freeze({
 polygon:'polygonalLasso', magnetic:'magneticLasso', wand:'magicWand'
});
const rasterIdSet=new Set(Object.values(DEV1_RASTER_NATIVE_IDS));
const guardByHost=new WeakMap();
const fail=(code,message=code)=>({ok:false,changed:false,error:{code,message}});
const targetIdentity=token=>JSON.stringify({
 documentId:token?.documentId,pageId:token?.pageId,
 generation:token?.generation,refs:token?.refs
});
const liveRuntime=host=>host?.app?.uiComposition?.rasterTools||null;
export function dev1RasterRuntime(host){return liveRuntime(host)}
export function dev1RasterNativeActive(host){
 const id=liveRuntime(host)?.activeTool?.();
 return rasterIdSet.has(id)?id:null;
}
export function dev1RasterActiveKey(host){
 const current=dev1RasterNativeActive(host);
 return Object.keys(DEV1_RASTER_NATIVE_IDS).find(key=>DEV1_RASTER_NATIVE_IDS[key]===current)||null;
}
export function inspectDev1RasterTarget(host,token=host?.target?.()){
 const snapshot=host?.getSnapshot?.();
 if(!snapshot?.docs?.length||!snapshot?.activeDoc)return{ok:false,reason:'NO_DOCUMENT'};
 if(!host?.provider?.requireSelection||!host?.target)return{ok:false,reason:'TARGET_PROVIDER_MISSING'};
 if(!token||targetIdentity(token)!==targetIdentity(host.target()))return{ok:false,reason:'TARGET_STALE'};
 try{host.provider.requireSelection(token,{single:true,type:'image'})}
 catch(error){return{ok:false,reason:error.code||error.message||'TARGET_STALE'}}
 const found=host?.app?.selectedObjects?.()||[];
 if(found.length!==1)return{ok:false,reason:found.length?'MULTI_SELECTION':'NO_SELECTION'};
 const item=found[0];
 if(item.effectiveVisible===false||item.layer?.visible===false)return{ok:false,reason:'TARGET_HIDDEN'};
 if(item.effectiveLocked||item.layer?.locked||item.object?.locked||item.ancestors?.some(x=>x.locked)||snapshot.object?.locked)return{ok:false,reason:'TARGET_LOCKED'};
 const object=item.object,raster=object?.rasterState?.colorRaster;
 if(object?.type!=='image'||!raster)return{ok:false,reason:'IMAGE_RASTER_REQUIRED'};
 if(raster.bitDepth!==8||raster.colorMode!=='RGB')return{ok:false,reason:'RGB8_REQUIRED'};
 if(!Number.isInteger(raster.width)||!Number.isInteger(raster.height)||raster.width<1||raster.height<1)return{ok:false,reason:'RASTER_DIMENSIONS_INVALID'};
 if(!(object.w>0&&object.h>0))return{ok:false,reason:'IMAGE_GEOMETRY_INVALID'};
 const matrix=item.worldMatrix||object.matrix;
 if(!matrix||matrix.length<6||Array.from(matrix).some(v=>!Number.isFinite(v))||Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2])<1e-12)return{ok:false,reason:'IMAGE_TRANSFORM_SINGULAR'};
 if(host.app?.history?.pending||host.app?.interaction)return{ok:false,reason:'INTERACTION_BUSY'};
 const rt=liveRuntime(host);
 if(!rt||typeof rt.activate!=='function'||typeof rt.activeTool!=='function'||
    typeof rt.rasterOptions!=='function'||typeof rt.setRasterOption!=='function'||
    typeof rt.rasterSelection!=='function')return{ok:false,reason:'RASTER_RUNTIME_MISSING'};
 return{ok:true,reason:'READY',token,runtime:rt,width:raster.width,height:raster.height};
}
export function dev1RasterAvailability(host,key){
 if(!Object.hasOwn(DEV1_RASTER_NATIVE_IDS,key))return{available:false,reason:'UNKNOWN_RASTER_TOOL'};
 const check=inspectDev1RasterTarget(host);
 if(!check.ok)return{available:false,reason:check.reason};
 if(!guardByHost.has(host))return{available:false,reason:'RASTER_GUARD_NOT_MOUNTED'};
 return{available:true,reason:'READY'};
}
export function activateDev1RasterTool(host,key){
 const availability=dev1RasterAvailability(host,key);
 if(!availability.available)return fail(availability.reason);
 const token=host.target(),guard=guardByHost.get(host),rt=liveRuntime(host);
 if(!guard||guard.disposed)return fail('RASTER_GUARD_NOT_MOUNTED');
 try{
  // Native selection alpha is global to this controller. Never combine old image masks.
  // No clear-mask receiver exists: force 'new' until an alpha mask is observed for this exact target.
  if(guard.maskToken!==targetIdentity(token))rt.setRasterOption('selectionMode','new');
  guard.token=targetIdentity(token);
  const result=rt.activate(DEV1_RASTER_NATIVE_IDS[key]);
  if(result?.ok===false)throw Error(result.error?.message||'RASTER_ACTIVATION_FAILED');
  guard.check();
  if(rt.activeTool()!==DEV1_RASTER_NATIVE_IDS[key])return fail('RASTER_ACTIVATION_LOST');
  return{ok:true,changed:!!result?.changed,result:result?.result,activeKey:key};
 }catch(error){
  guard.token=null;
  try{if(rasterIdSet.has(rt?.activeTool?.()))rt.activate('select')}catch{}
  return fail(error.code||'RASTER_ACTIVATION_FAILED',error.message);
 }
}
const selectionModes=new Set(['new','add','subtract','intersect']);
export function dev1RasterMaskScope(host){
 const guard=host&&guardByHost.get(host),rt=liveRuntime(host),mask=rt?.rasterSelection?.();
 if(!mask?.alpha)return 'empty';
 return guard?.maskToken===targetIdentity(host.target())?'current':'unbound';
}
export const DEV1_RASTER_OPTION_FIELDS=Object.freeze({
 polygon:Object.freeze(['selectionMode']),
 magnetic:Object.freeze(['selectionMode','searchRadius','edgeThreshold']),
 wand:Object.freeze(['selectionMode','tolerance','contiguous'])
});
export function normalizeDev1RasterOption(key,value){
 if(key==='selectionMode')return selectionModes.has(value)?value:null;
 if(key==='contiguous')return value==='On'?true:value==='Off'?false:null;
 if(value===null||value===undefined||String(value).trim()==='')return null;
 const num=Number(value);
 if(!Number.isInteger(num))return null;
 if(key==='tolerance'||key==='edgeThreshold')return num>=0&&num<=255?num:null;
 if(key==='searchRadius')return num>=1&&num<=64?num:null;
 return null;
}
export function setDev1RasterOption(host,key,option,value,{target=host?.target?.()}={}){
 if(!Object.hasOwn(DEV1_RASTER_NATIVE_IDS,key))return fail('UNKNOWN_RASTER_TOOL');
 if(!DEV1_RASTER_OPTION_FIELDS[key]?.includes(option))return fail('RASTER_OPTION_UNSUPPORTED');
 const status=inspectDev1RasterTarget(host,target);
 if(!status.ok)return fail(status.reason);
 const guard=guardByHost.get(host);
 if(!guard||guard.disposed||guard.token!==targetIdentity(target))return fail('RASTER_SESSION_STALE');
 const rt=status.runtime;
 if(rt.activeTool()!==DEV1_RASTER_NATIVE_IDS[key])return fail('RASTER_TOOL_NOT_ACTIVE');
 const parsed=normalizeDev1RasterOption(option,value);
 if(parsed===null)return fail('RASTER_OPTION_OUT_OF_RANGE');
 if(option==='selectionMode'&&parsed!=='new'&&guard.maskToken!==targetIdentity(target))return fail('RASTER_MASK_NOT_SCOPED');
 const prior=rt.rasterOptions()[option];
 if(prior===parsed)return{ok:true,changed:false,value:parsed};
 try{
  const updated=rt.setRasterOption(option,parsed);
  if(updated?.[option]!==parsed)return fail('RASTER_OPTION_NOT_APPLIED');
  return{ok:true,changed:true,value:parsed};
 }catch(error){return fail(error.code||'RASTER_OPTION_FAILED',error.message)}
}
export function mountDev1RasterGuard(host,signal,{onChange=()=>{}}={}){
 if(!host?.subscribe||!host?.app?.uiComposition?.rasterTools?.subscribe||!signal)throw TypeError('DEV1_RASTER_GUARD_HOST_REQUIRED');
 if(guardByHost.has(host))throw Error('DEV1_RASTER_GUARD_ALREADY_MOUNTED');
 const rt=liveRuntime(host);
 let checking=false;
 const guard={
  token:null,maskToken:null,maskRef:rt.rasterSelection?.()||null,disposed:false,
  check(){
   if(this.disposed||checking)return;
   checking=true;
   try{
    const id=rt.activeTool();
    const latestMask=rt.rasterSelection?.()||null;
    if(latestMask!==this.maskRef){
     this.maskRef=latestMask;
     this.maskToken=rasterIdSet.has(id)&&this.token===targetIdentity(host.target())?this.token:null;
    }
    if(!rasterIdSet.has(id)){this.token=null;return}
    const t=host.target(),valid=this.token&&this.token===targetIdentity(t)&&inspectDev1RasterTarget(host,t).ok;
    if(!valid){
     // Existing runtime cancels unfinished polygons/strokes and clears its active mode.
     // The alpha selection mask is NOT cleared; it lacks an installed clear consumer.
     this.token=null;this.maskToken=null;
     rt.activate('select');
    }
   }finally{checking=false;onChange()}
  },
  dispose(){
   if(this.disposed)return;
   this.disposed=true;
   guardByHost.delete(host);
   offHost?.();offRaster?.();
   if(rasterIdSet.has(rt.activeTool?.()))try{rt.activate('select')}catch{}
  }
 };
 guardByHost.set(host,guard);
 const offHost=host.subscribe(()=>guard.check());
 const offRaster=rt.subscribe(()=>guard.check());
 signal.addEventListener('abort',()=>guard.dispose(),{once:true});
 guard.check();
 return guard;
}
