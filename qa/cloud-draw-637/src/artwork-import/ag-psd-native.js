// Optional ag-psd 34.1.0 -> the existing INK Native layer/object model.
// Parser dependency is built with the private candidate, not pulled from a CDN.
// Source semantics with no live INK equivalent are reported, never represented as lossless.
import {createNormalizedPayload} from '../image/formats/normalized-payload.js';
import {formatPayloadToDocumentImageState} from '../image/format-interoperability.js';
import {createTextObject} from '../editor/text-object.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const finite=(v,defaultValue=0)=>Number.isFinite(Number(v))?Number(v):defaultValue;
function raster(image,layer,bitDepth,uid){
 const width=image?.width,height=image?.height,rgba=image?.data;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>4*1024*1024||
  !rgba||rgba.length!==width*height*4||![8,16].includes(bitDepth))fail('INK_AGPSD_LAYER_IMAGE_INVALID');
 const Type=bitDepth===16?Uint16Array:Uint8Array;
 if(bitDepth===8?!(rgba instanceof Uint8Array)&&!(rgba instanceof Uint8ClampedArray):!(rgba instanceof Type))
  fail('INK_AGPSD_CHANNEL_DEPTH_MISMATCH');
 const color=new Type(width*height*3),alpha=new Type(width*height);
 for(let p=0;p<width*height;p++){for(let c=0;c<3;c++)color[p*3+c]=rgba[p*4+c];alpha[p]=rgba[p*4+3];}
 const payload=createNormalizedPayload({format:'PSD',width,height,bitDepth,colorMode:'RGB',data:color,alpha,
  provenance:{engine:'ag-psd@34.1.0',sourceLayerName:layer.name||''}});
 return {id:uid(),type:'image',name:layer.name||'Photoshop raster',
  matrix:[1,0,0,1,finite(layer.left),finite(layer.top)],opacity:1,visible:true,locked:false,
  w:width,h:height,rasterState:formatPayloadToDocumentImageState(payload)};
}
export async function decodeAgPsdNative(input,{uid,maxBytes=32*1024*1024,maxPixels=4*1024*1024}={}){
 if(typeof uid!=='function')fail('INK_PSD_ID_FACTORY_REQUIRED');
 const bytes=input instanceof Uint8Array?new Uint8Array(input):new Uint8Array(input);
 if(!bytes.length||bytes.length>Math.min(32*1024*1024,maxBytes))fail('INK_AGPSD_INPUT_BUDGET');
 const agPsdModule=await import('../../dist/startup/parsers/ag-psd.mjs');
 // ag-psd's npm browser entry is CommonJS. Node ESM and esbuild code-split
 // interop place exports on different namespace surfaces.
 const readPsd=agPsdModule.readPsd??agPsdModule.default?.readPsd;
 if(typeof readPsd!=='function')fail('INK_AGPSD_EXPORT_UNAVAILABLE');
 const psd=readPsd(bytes,{useImageData:true,skipCompositeImageData:true,skipThumbnail:true,
  totalMemoryLimit:128*1024*1024,throwForMissingFeatures:false});
 const bitDepth=psd.bitsPerChannel,format=bytes[5]===2?'PSB':'PSD';
 if(![8,16].includes(bitDepth)||psd.colorMode!==3)fail('INK_AGPSD_COLOR_MODE_UNMAPPED');
 if(!Number.isSafeInteger(psd.width)||!Number.isSafeInteger(psd.height)||psd.width*psd.height>maxPixels||
    !Array.isArray(psd.children)||!psd.children.length)fail('INK_AGPSD_STRUCTURE_UNSUPPORTED');
 let nodes=0,pixels=0;const mappings=[],losses=[],nativeLayers=[];
 const mapNode=(layer,depth=0)=>{
  if(depth>24||++nodes>512)fail('INK_AGPSD_COMPLEXITY_BUDGET');
  const isGroup=Array.isArray(layer.children),id=uid(),name=String(layer.name||'Adobe layer').slice(0,255);
  const visible=layer.hidden!==true,locked=!!(layer.protected?.all||layer.locked),
    opacity=Math.max(0,Math.min(1,finite(layer.opacity,1)));
  if(isGroup){
   const children=layer.children.slice().reverse().map(c=>mapNode(c,depth+1));
   const group={id,type:'group',name,matrix:[1,0,0,1,0,0],opacity,visible,locked,children};
   for(const c of children)c.parentId=id;
   mappings.push({sourceName:name,nativeObjectId:id,nativeType:'group'});
   if(layer.effects||layer.vectorMask)losses.push({sourceName:name,code:'GROUP_EFFECT_OR_VECTOR_MASK_NOT_LIVE'});
   return group;
  }
  const children=[];
  if(layer.imageData){
   pixels+=layer.imageData.width*layer.imageData.height;
   if(pixels>6*1024*1024)fail('INK_AGPSD_TOTAL_PIXEL_BUDGET');
   children.push(raster(layer.imageData,layer,bitDepth,uid));
  }
  if(typeof layer.text?.text==='string'&&layer.text.text.length){
   const style=layer.text.style||{};
   const live=createTextObject({id:uid(),text:layer.text.text,
    x:finite(layer.left),y:finite(layer.top)+Math.max(1,finite(style.fontSize,16)),
    fontSize:Math.max(1,finite(style.fontSize,16)),
    fontFamily:String(style.font?.name||style.fontFamily||'sans-serif').slice(0,128)});
   live.name=name+' / live text';live.visible=children.length===0;
   live.locked=false;
   if(children.length)losses.push({sourceName:name,code:'LIVE_TEXT_HIDDEN_UNDER_ORIGINAL_RASTER_PREVIEW'});
   children.push(live);
   mappings.push({sourceName:name,nativeObjectId:live.id,nativeType:'text',editable:true});
  }
  if(layer.mask)losses.push({sourceName:name,code:'BITMAP_MASK_SOURCE_PARSED_NOT_LIVE_APPLIED'});
  if(layer.effects)losses.push({sourceName:name,code:'LIVE_LAYER_EFFECTS_UNMAPPED'});
  if(layer.vectorMask)losses.push({sourceName:name,code:'VECTOR_MASK_UNMAPPED'});
  if(layer.placedLayer)losses.push({sourceName:name,code:'SMART_OBJECT_UNMAPPED'});
  if(layer.blendMode&&layer.blendMode!=='normal')losses.push({sourceName:name,code:'BLEND_MODE_UNMAPPED',sourceBlend:layer.blendMode});
  if(!children.length){
   // Preserve unpainted/adjustment source hierarchy as an editable empty group.
   // It is not rendered as an effect: report the missing live source semantics.
   losses.push({sourceName:name,code:'SOURCE_EMPTY_OR_ADJUSTMENT_LAYER_NOT_LIVE'});
   return {id,type:'group',name,matrix:[1,0,0,1,0,0],opacity,
    visible,locked,children:[],metadata:{sourceAdobeLayer:'AGPSD_UNMAPPED_ADJUSTMENT_OR_EMPTY'}};
  }
  if(children.length===1){const object=children[0];object.visible=visible;object.locked=locked;object.opacity=opacity;
   mappings.push({sourceName:name,nativeObjectId:object.id,nativeType:object.type});return object;}
  const group={id,type:'group',name,matrix:[1,0,0,1,0,0],opacity,visible,locked,children};
  for(const c of children)c.parentId=id;
  mappings.push({sourceName:name,nativeObjectId:id,nativeType:'group'});
  return group;
 };
 for(const root of psd.children.slice().reverse()){
  const object=mapNode(root),id=uid();
  nativeLayers.push({id,name:object.name,visible:object.visible!==false,locked:!!object.locked,opacity:1,objects:[object]});
  mappings.push({sourceName:object.name,nativeLayerId:id,nativeObjectId:object.id,nativeType:object.type});
 }
 losses.push({code:'ICC_COMPOSITING_ARTBOARDS_AND_OTHER_PRIVATE_SEMANTICS_NOT_VERIFIED'});
 return {layers:nativeLayers,receipt:{schema:'INK_AGPSD_NATIVE_FIDELITY_V1',status:'PARTIAL',format,
  sourceBytes:bytes.length,sourceBitDepth:bitDepth,nativeBitDepth:bitDepth,sourceLayers:nodes,nativeLayers:nativeLayers.length,
  mappings,losses,fullFidelity:false,engine:'ag-psd@34.1.0'}};
}
