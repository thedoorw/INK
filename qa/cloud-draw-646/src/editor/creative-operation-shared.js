// Shared pure/scoped helpers for creative family executors.
// No operation dispatch or cross-family native imports belong here.

export const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
}
export function stableChatStringify(value){return JSON.stringify(stableValue(value));}
export function chatStateFingerprint(value){
  const valueText=stableChatStringify(value);let hash=0x811c9dc5;
  for(let index=0;index<valueText.length;index+=1){hash^=valueText.charCodeAt(index);hash=Math.imul(hash,0x01000193);}
  return `fnv1a32:${(hash>>>0).toString(16).padStart(8,'0')}`;
}
function fnvByte(hash,value){hash^=value&0xff;return Math.imul(hash,0x01000193);}
function fnvText(hash,value){const valueText=String(value??'');for(let index=0;index<valueText.length;index+=1)hash=fnvByte(hash,valueText.charCodeAt(index)&0xff);return hash;}
function fnvRasterSamples(hash,values,bitDepth){
  if(!values)return fnvText(hash,'null');
  hash=fnvText(hash,values.length);
  if(bitDepth===8){for(let index=0;index<values.length;index+=1)hash=fnvByte(hash,Number(values[index])||0);return hash;}
  if(bitDepth===16){for(let index=0;index<values.length;index+=1){const value=Number(values[index])||0;hash=fnvByte(hash,value);hash=fnvByte(hash,value>>>8);}return hash;}
  const buffer=new ArrayBuffer(4),view=new DataView(buffer);
  for(let index=0;index<values.length;index+=1){view.setFloat32(0,Number(values[index])||0,true);for(let byte=0;byte<4;byte+=1)hash=fnvByte(hash,view.getUint8(byte));}
  return hash;
}
export function rasterMaskFingerprint(mask){
  if(!mask)return null;
  let hash=0x811c9dc5;
  for(const value of [mask.type,mask.width,mask.height,mask.invert,mask.feather,mask.expand,mask.enabled])hash=fnvText(hash,value);
  hash=fnvRasterSamples(hash,mask.alpha,8);
  return `fnv1a32:${(hash>>>0).toString(16).padStart(8,'0')}`;
}
export function artboardFingerprint(page){return chatStateFingerprint(clone(page?.artboard||null));}
export function chatObjectRef(pageId,found){
  return {pageId:pageId||null,layerId:found?.layer?.id||null,objectId:found?.object?.id||null};
}

export const CHAT_MIXER_STROKE_KIND_SET=new Set(['blender','smudge']);
export const CHAT_NATURAL_MEDIA_STROKE_KIND_SET=new Set(['brush','drybrush','airbrush','blender','smudge']);

export function editFail(code,details={}){
  throw Object.assign(new Error(`INK_CHAT_EDIT_${code}`),{code:`CHAT_EDIT_${code}`,...details});
}
export function activeLayer(app){
  const page=app.page();
  return page.layers.find(layer=>layer.id===page.activeLayerId)||app.layer?.()||page.layers[0]||null;
}
export function structuralHistoryPaths(app,foundItems=[]){
  const layers=new Map();
  for(const found of foundItems)if(found?.layer?.id)layers.set(found.layer.id,found.layer);
  if(!layers.size){const layer=activeLayer(app);if(layer?.id)layers.set(layer.id,layer);}
  const paths=[...layers.values()].map(layer=>app.layerObjectsPath?.(layer)).filter(Array.isArray);
  if(!paths.length)editFail('HISTORY_REQUIRED');
  return paths;
}
export function finishStructuralMutation(app){
  app.spatialDirty=true;
  app.refreshAll?.();
  app.renderer?.render?.();
}
