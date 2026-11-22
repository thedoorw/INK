// #559 Photoshop Core: a replaceable Native-facing engine module. This module
// does not parse PSD bytes, reimplement Adobe codecs or own Document/History.
// The existing deployed RGB8 decoder and the optional trusted PhotoshopAPI
// service are the only admitted paths; unqualified external packages stay QA-only.
export const PHOTOSHOP_CORE_MODULE = Object.freeze({
 schema:'INK_ADOBE_CORE_MODULE_V1',id:'photoshop-core',formats:Object.freeze(['psd','psb']),
 engines:Object.freeze([
  Object.freeze({id:'ink-psd-layered-rgb8-v1',implementation:'existing-ink-rgb8',source:'product/source/src/image/formats/psd-layered.js',deployed:true,qualification:'BOUNDED_SUBSET'}),
  Object.freeze({id:'photoshopapi-0.9.1-rgb16',implementation:'trusted-runtime-binding',upstream:'PhotoshopAPI',version:'0.9.1',license:'BSD-3-Clause',deployed:false,qualification:'RUNTIME_DEPENDENT'}),
  Object.freeze({id:'ag-psd@31.0.2',implementation:'external-upstream',formats:Object.freeze(['psd']),version:'31.0.2',license:'MIT',deployed:false,qualification:'QA_ONLY_PSB_UNSUPPORTED_NO_NATIVE_BUNDLE'}),
  Object.freeze({id:'ag-psd@34.1.0',implementation:'product-lazy-parser',version:'34.1.0',license:'MIT',deployed:true,qualification:'PRODUCT_NATIVE_ADAPTER_PARTIAL_REAL_SOURCE_QA_PENDING'}),
  Object.freeze({id:'@webtoon/psd@0.4.0',implementation:'external-upstream',version:'0.4.0',license:'MIT',deployed:false,qualification:'QA_ONLY_NOT_NATIVE_BUNDLED'})
 ])
});
export function choosePhotoshopCore({bitDepth,colorMode,nativeEngine,optionalHostEnabled=true,agPsdEnabled=true,preferExtended=false}={}){
 if(colorMode!==3)return null;
 if(agPsdEnabled===true&&preferExtended===true&&bitDepth===8)return 'ag-psd@34.1.0';
 if(bitDepth===8)return 'ink-psd-layered-rgb8-v1';
 if(optionalHostEnabled===true&&bitDepth===16&&colorMode===3&&nativeEngine?.schema==='INK_ADOBE_NATIVE_ENGINE_V1'&&
  nativeEngine.id==='photoshopapi-0.9.1'&&typeof nativeEngine.decode==='function')
  return 'photoshopapi-0.9.1-rgb16';
 if(agPsdEnabled===true&&bitDepth===16)return 'ag-psd@34.1.0';
 return null;
}
export async function decodePhotoshopCore(bytes,{engine,nativeEngine,plan,...options}={}){
 if(engine==='ink-psd-layered-rgb8-v1'){
  const {decodeLayeredPsdAsync}=await import('../image/formats/psd-layered.js');
  return decodeLayeredPsdAsync(bytes,options);
 }
 if(engine==='ag-psd@34.1.0'){
  const {decodeAgPsdNative}=await import('./ag-psd-native.js');
  return decodeAgPsdNative(bytes,options);
 }
 if(engine==='photoshopapi-0.9.1-rgb16'){
  const {decodePsapiNative}=await import('./psapi-native.js');
  return decodePsapiNative(bytes,{uid:options.uid,nativeEngine,plan});
 }
 throw Object.assign(new Error('INK_PHOTOSHOP_CORE_ENGINE_UNAVAILABLE'),{code:'INK_PHOTOSHOP_CORE_ENGINE_UNAVAILABLE'});
}
