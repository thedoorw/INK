// #559 Illustrator Core: independent import module, same INK Native authority.
// Browser Illustrator private source is admitted by exact pinned package.
// Initial browser compatibility bridge supports Deflate only; zstd is NOT_PROVEN.
export const ILLUSTRATOR_CORE_MODULE = Object.freeze({
 schema:'INK_ADOBE_CORE_MODULE_V1',id:'illustrator-core',formats:Object.freeze(['ai']),
 engines:Object.freeze([
  Object.freeze({id:'ink-ai-pdf-display-v2',implementation:'existing-ink-pdf-display',source:'product/source/src/artwork-import/ai-document.js',deployed:true,qualification:'BOUNDED_PDF_COMPATIBLE_DISPLAY_ONLY'}),
  Object.freeze({id:'@create-design/ai@0.0.17',implementation:'browser-lazy-native-parser-with-pako-deflate',version:'0.0.17',license:'MPL-2.0',deployed:true,qualification:'BOUNDED_BROWSER_PRIVATE_SOURCE_DEFLATE'}),
  Object.freeze({id:'inkai',implementation:'external-upstream',deployed:false,license:'GPL_REVIEW_REQUIRED',qualification:'QA_ONLY_NO_PRODUCT_BUNDLE'}),
   Object.freeze({id:'vectorcraft-ai-0.22.0',implementation:'trusted-optional-local-CLI-private-data',version:'0.22.0',license:'MIT OR Apache-2.0',deployed:false,qualification:'PENDING_REAL_ORIGINAL_AND_RUNTIME_QA'})
 ])
});
export function chooseIllustratorCore({isPdfCompatible=false,illustratorEngine=null,optionalNodeEnabled=false,optionalBrowserEnabled=false}={}){
 if(optionalNodeEnabled===true&&illustratorEngine?.schema==='INK_ADOBE_NATIVE_ENGINE_V1'&&
     illustratorEngine.id==='vectorcraft-ai-0.22.0'&&typeof illustratorEngine.decode==='function')return 'vectorcraft-ai-0.22.0';
  if(optionalNodeEnabled===true&&illustratorEngine?.schema==='INK_ADOBE_NATIVE_ENGINE_V1'&&
    illustratorEngine.id==='create-design-ai-0.0.17'&&typeof illustratorEngine.decode==='function')return 'create-design-ai-0.0.17';
 if(isPdfCompatible&&optionalBrowserEnabled===true)return 'create-design-ai-browser-0.0.17';
 return isPdfCompatible?'ink-ai-pdf-display-v2':null;
}

/** Source AST-only trace: a TextFrame is not editable text without a matched
 * AI11 story containing content, position, and size. This never synthesizes
 * story fields from PDF display text or raw PostScript substrings. */
function tracePrivateTextFrames(source) {
 const frames=[];
 for (const layer of source.layers||[]) {
  const visit=(children,depth)=>{
   if(depth>24||!Array.isArray(children))return;
   for(const node of children){
    if(node?.kind==='text'){
     if(frames.length>=256)throw Object.assign(
      new Error('INK_AI_TEXT_TRACE_LIMIT'),{code:'INK_AI_TEXT_TRACE_LIMIT'});
     const story=node.story,span=node.span;
     const hasContent=typeof story?.text==='string'&&story.text.trim().length>0;
     const hasPosition=Number.isFinite(story?.position?.x)&&Number.isFinite(story?.position?.y);
     const hasSize=Number.isFinite(story?.size)&&story.size>0;
     frames.push({layer:layer.name,storyIndex:node.storyIndex,frameIndex:node.frameIndex,
      span:span&&{start:span.start,end:span.end,line:span.line},
      storyMatched:!!story,contentVerified:hasContent,
      positionVerified:hasPosition,typographySizeVerified:hasSize,
      eligibleForTypedText:hasContent&&hasPosition&&hasSize});
    }
    if(Array.isArray(node?.children))visit(node.children,depth+1);
   }
  };
  visit(layer.children,0);
 }
 return frames;
}

export async function decodeIllustratorCore(bytes,{engine,illustratorEngine,...options}={}){
  if(engine==='vectorcraft-ai-0.22.0'){
    if(illustratorEngine?.id!=='vectorcraft-ai-0.22.0'||typeof illustratorEngine.decode!=='function')throw new Error('INK_VECTORCRAFT_TRUSTED_ENGINE_REQUIRED');
    const model=await illustratorEngine.decode(bytes);
    const {vectorcraftToInkNative}=await import('./vectorcraft-native.js');
    return vectorcraftToInkNative(model,{uid:options.uid});
  }
 if(engine==='create-design-ai-browser-0.0.17'||engine==='create-design-ai-0.0.17'){
  // The browser path loads the actual installed npm package, NOT an injected mock.
  // The startup builder emits a local ESM module with the bounded pako Deflate shim.
  let parsed;
  if(engine==='create-design-ai-browser-0.0.17'){
   const parser=await import('../../dist/startup/parsers/create-design-ai.mjs');
   parsed=parser.importAdobeIllustrator(bytes);
   // CC2015 can store private PostScript as individually PDF-Flate-filtered
   // AIPrivateDataN blocks, not as a marker-based single Deflate stream.
   // Pass recovered original PostScript back through the pinned package.
   if(parsed?.ok!==true && parsed?.diagnostics?.some(d=>
       d.stage==='container'&&d.code==='ai.import.private-source-corrupt')){
    const {recoverFilteredIllustratorSource}=await import('./ai-filtered-private.js');
    const {inflateSync}=await import('./browser-zlib-shim.js');
    const recovered=recoverFilteredIllustratorSource(bytes,(part,remaining)=>
      inflateSync(part,{maxOutputLength:remaining,strictStream:true}));
    if(recovered){
     // The exact pinned package's own typed parser/lowerer remains authoritative.
     // Some CC2015 originals have private HiResBoundingBox + AI5 layers but
     // omit (ArtboardArray), which 0.0.17 currently treats as fatal.
     const typed=parser.parseIllustratorSource(
       new TextDecoder('latin1').decode(recovered.bytes));
     let artboardRecovery='NATIVE_SOURCE_ARTBOARDS';
     let lowerSource=typed;
     const onlyArtboardError=typed.diagnostics.some(d=>
       d.code==='ai.source.no-artboards'&&d.severity==='error')&&
       typed.diagnostics.every(d=>
        d.severity!=='error'||d.code==='ai.source.no-artboards');
     const bounds=typed.bounds;
     if(onlyArtboardError&&typed.artboards.length===0&&typed.layers.length>0){
      const {artboardsFromPrivateGuideRectangles}=await import('./ai-private-guide-artboards.js');
      const guideRects=artboardsFromPrivateGuideRectangles(
       typed.rawSource,typed.stats?.unknownOperators?.['*']??null);
      let boards=guideRects;
      if(boards.length){
       artboardRecovery='INFERRED_FROM_PRIVATE_AI5_GUIDE_RECTS';
      }else if(bounds&&[bounds.left,bounds.right,bounds.top,bounds.bottom].every(n=>
          Number.isFinite(n)&&Math.abs(n)<1e7)&&
         bounds.right>bounds.left&&bounds.top>bounds.bottom){
       artboardRecovery='VISUAL_APPROX_FROM_PRIVATE_HIRES_BOUNDS';
       boards=[{name:'Recovered source bounds (approximate artboard)',
        left:bounds.left,top:bounds.top,right:bounds.right,bottom:bounds.bottom,
        rawProperties:{derivedFrom:'Private HiResBoundingBox'},
        span:{start:0,end:0,line:1,column:1}}];
      }
      if(boards.length){
       lowerSource={...typed,artboards:boards,
        diagnostics:typed.diagnostics.filter(d=>d.code!=='ai.source.no-artboards')};
      }
     }
     parsed=parser.lowerIllustratorSource(lowerSource);
     if(parsed?.ok!==true){
      const error=Object.assign(new Error('INK_AI_FILTERED_PRIVATE_AST_REJECTED'),
       {code:'INK_AI_FILTERED_PRIVATE_AST_REJECTED',diagnostics:parsed?.diagnostics||[]});
      throw error;
     }
     parsed={...parsed,privateSourceRecovery:{
      compression:recovered.compression,sourceBlocks:recovered.sourceBlocks,
      inflatedBytes:recovered.inflatedBytes,sourceFidelity:recovered.sourceFidelity,
      artboardRecovery,sourceAstLayers:typed.layers.length,
      sourceAstPaths:typed.stats?.paths??null,
      sourceAstTextFrames:typed.stats?.textFrames??null,
      sourceTextFrameTrace:tracePrivateTextFrames(typed),
      sourceTextResourceStories:typed.resources?.text?.stories?.length??0,
      sourceAstUnknownOperators:typed.stats?.unknownOperators??{}}};
    }
   }
  }else parsed=await illustratorEngine.decode(bytes);
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
