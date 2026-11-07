// #559 Illustrator Core: independent import module, same INK Native authority.
// Browser Illustrator private source is admitted by exact pinned package.
// Initial browser compatibility bridge supports Deflate only; zstd is NOT_PROVEN.
export const ILLUSTRATOR_CORE_MODULE = Object.freeze({
 schema:'INK_ADOBE_CORE_MODULE_V1',id:'illustrator-core',formats:Object.freeze(['ai']),
 engines:Object.freeze([
  Object.freeze({id:'ink-ai-pdf-display-v2',implementation:'existing-ink-pdf-display',source:'product/source/src/artwork-import/ai-document.js',deployed:true,qualification:'BOUNDED_PDF_COMPATIBLE_DISPLAY_ONLY'}),
  Object.freeze({id:'@create-design/ai@0.0.17',implementation:'browser-lazy-native-parser-with-pako-deflate',version:'0.0.17',license:'MPL-2.0',deployed:true,qualification:'BOUNDED_BROWSER_PRIVATE_SOURCE_DEFLATE'}),
  Object.freeze({id:'inkai',implementation:'external-upstream',deployed:false,license:'GPL_REVIEW_REQUIRED',qualification:'QA_ONLY_NO_PRODUCT_BUNDLE'})
 ])
});
export function chooseIllustratorCore({isPdfCompatible=false,illustratorEngine=null,optionalNodeEnabled=false,optionalBrowserEnabled=false}={}){
 if(optionalNodeEnabled===true&&illustratorEngine?.schema==='INK_ADOBE_NATIVE_ENGINE_V1'&&
    illustratorEngine.id==='create-design-ai-0.0.17'&&typeof illustratorEngine.decode==='function')return 'create-design-ai-0.0.17';
 if(isPdfCompatible&&optionalBrowserEnabled===true)return 'create-design-ai-browser-0.0.17';
 return isPdfCompatible?'ink-ai-pdf-display-v2':null;
}
export async function decodeIllustratorCore(bytes,{engine,illustratorEngine,...options}={}){
 if(engine==='create-design-ai-browser-0.0.17'||engine==='create-design-ai-0.0.17'){
  // The browser path loads the actual installed npm package, NOT an injected mock.
  // The startup builder emits a local ESM module with the bounded pako Deflate shim.
  const parsed=engine==='create-design-ai-browser-0.0.17'
    ? (await import('../../dist/startup/parsers/create-design-ai.mjs')).importAdobeIllustrator(bytes)
    : await illustratorEngine.decode(bytes);
  if(parsed?.ok!==true){
   // Preserve previously supported PDF-compatible AI when the private Illustrator
   // container cannot be recovered. Record the downgrade, never call it private fidelity.
   const pdf=String.fromCharCode(...bytes.subarray(0,5))==='%PDF-';
   if(!pdf){const e=Object.assign(new Error('INK_CREATE_DESIGN_PRIVATE_SOURCE_UNAVAILABLE'),
    {code:'INK_CREATE_DESIGN_PRIVATE_SOURCE_UNAVAILABLE',diagnostics:parsed?.diagnostics||[]});throw e;}
   const {decodeAiDocumentAsync}=await import('./ai-document.js');
   const result=await decodeAiDocumentAsync(bytes,options);
   result.receipt.actualEngine='ink-ai-pdf-display-v2';
   result.receipt.losses.push({code:'AI_PRIVATE_SOURCE_UNAVAILABLE_PDF_DISPLAY_FALLBACK',
    parserCodes:(parsed.diagnostics||[]).map(d=>d.code).slice(0,24)});
   return result;
  }
  const {createDesignToInkNative}=await import('./create-design-native.js');
  return createDesignToInkNative(parsed,{uid:options.uid});
 }
 if(engine!=='ink-ai-pdf-display-v2')
  throw Object.assign(new Error('INK_ILLUSTRATOR_CORE_ENGINE_UNAVAILABLE'),{code:'INK_ILLUSTRATOR_CORE_ENGINE_UNAVAILABLE'});
 const {decodeAiDocumentAsync}=await import('./ai-document.js');
 return decodeAiDocumentAsync(bytes,options);
}
