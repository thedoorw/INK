import { Matrix, uid } from '../core/index.js';
import { findPageObject } from '../document/hierarchy.js';
import { defaultLayer } from '../document/model.js';
import { moveAnchor } from '../vector/vector-core.js';
import { executeExtraction, normalizePaths, requireValue, checkAbort, sha256, validateRaster } from './core.js';
import { radialEvidence, sectorMask, reconstructRadial } from './structure.js';
const copy=value=>JSON.parse(JSON.stringify(value));
export const REFERENCE_IMPORT_SCHEMA='INK-REFERENCE-IMPORT/1';
const REFERENCE_MIME_TYPES=new Set(['image/png','image/jpeg','image/webp']);

function referenceImportSourceType(sourceChannel) {
  return sourceChannel==='CHAT_ATTACHMENT_HANDOFF'?'chat-attachment':'reference';
}

export function importReferenceIntoDocument(app, decoded, {
  matrix=Matrix.identity(),
  actor={type:'user',id:'local'},
  sourceChannel='REFERENCE_IMPORT',
  operation='reference.import'
}={}) {
  const doc=app?.doc,page=app?.page?.(),layer=app?.layer?.();
  const source=decoded?.source,raster=decoded?.raster,referenceSrc=decoded?.referenceSrc;
  requireValue(doc&&page&&layer&&!app.history?.pending&&!layer.locked&&layer.visible!==false,'REFERENCE_IMPORT_TARGET_UNAVAILABLE');
  requireValue(Matrix.isInvertible(matrix),'REFERENCE_IMPORT_SINGULAR_TRANSFORM');
  validateRaster(raster);
  requireValue(source&&typeof source.name==='string'&&source.name.trim()&&/^[a-f0-9]{64}$/.test(source.sha256||''),'REFERENCE_IMPORT_SOURCE_IDENTITY');
  requireValue(REFERENCE_MIME_TYPES.has(source.mimeType),'REFERENCE_IMPORT_MIME_TYPE');
  requireValue(Number(source.width)===raster.width&&Number(source.height)===raster.height,'REFERENCE_IMPORT_DIMENSIONS');
  requireValue(typeof referenceSrc==='string'&&referenceSrc.startsWith(`data:${source.mimeType};base64,`),'REFERENCE_IMPORT_EMBEDDED_REFERENCE_REQUIRED');
  requireValue(actor&&typeof actor==='object'&&!Array.isArray(actor)&&typeof actor.type==='string','REFERENCE_IMPORT_ACTOR_REQUIRED');
  requireValue(typeof sourceChannel==='string'&&sourceChannel.trim()&&typeof operation==='string'&&operation.trim(),'REFERENCE_IMPORT_OPERATION_REQUIRED');

  const referenceObjectId=`${uid()}-reference`;
  const provenanceSource={type:referenceImportSourceType(sourceChannel),id:source.sha256,name:source.name};
  const referenceImport={
    schema:REFERENCE_IMPORT_SCHEMA,
    operation,
    actor:copy(actor),
    sourceChannel,
    source:copy(source),
    width:raster.width,
    height:raster.height
  };
  const image={
    id:referenceObjectId,
    type:'image',
    name:source.name,
    src:referenceSrc,
    w:raster.width,
    h:raster.height,
    matrix:[...matrix],
    opacity:0.5,
    locked:true,
    metadata:{
      source:provenanceSource,
      referenceImport,
      extractionReference:{
        schema:REFERENCE_IMPORT_SCHEMA,
        source:copy(source),
        width:raster.width,
        height:raster.height,
        actor:copy(actor),
        sourceChannel,
        operation
      }
    }
  };
  const target=app.layerObjectsPath?.(layer);
  requireValue(Array.isArray(target),'REFERENCE_IMPORT_TARGET_PATH');
  const label=sourceChannel==='CHAT_ATTACHMENT_HANDOFF'?'Reference import · CHAT attachment':'Reference import';
  app.history.pushScoped(label,[target],()=>layer.objects.push(image));
  app.selection=[{layerId:layer.id,objectId:referenceObjectId}];
  app.spatialDirty=true;
  app.refreshAll?.();
  return {
    schema:REFERENCE_IMPORT_SCHEMA,
    operation,
    actor:copy(actor),
    sourceChannel,
    documentId:doc.id,
    pageId:page.id,
    layerId:layer.id,
    referenceObjectId,
    source:copy(source),
    width:raster.width,
    height:raster.height,
    historyLabel:label
  };
}


export const REFERENCE_DECOMPOSITION_SCHEMA='INK-REFERENCE-DECOMPOSITION/1';
export const REFERENCE_DECOMPOSITION_OPERATION='reference.decompose.line-color';

function referenceEmbeddedFile(reference) {
  requireValue(reference?.type==='image'&&typeof reference.src==='string','REFERENCE_DECOMPOSITION_REFERENCE_IMAGE_REQUIRED');
  const match=reference.src.match(/^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/);
  requireValue(match&&typeof File!=='undefined'&&typeof atob==='function','REFERENCE_DECOMPOSITION_EMBEDDED_SOURCE_REQUIRED');
  let binary;
  try { binary=atob(match[2]); } catch { requireValue(false,'REFERENCE_DECOMPOSITION_BASE64_INVALID'); }
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const storedSource=reference.metadata?.referenceImport?.source||reference.metadata?.extractionReference?.source||{};
  const name=String(storedSource.name||reference.name||'reference').trim()||'reference';
  return new File([bytes],name,{type:match[1]});
}

function rekeyDecompositionPath(path,id,name) {
  path.id=id; path.name=name;
  for(const [subpathIndex,subpath] of (path.subpaths||[]).entries()){
    subpath.id=`${id}-s${subpathIndex}`;
    for(const [anchorIndex,anchor] of (subpath.anchors||[]).entries())anchor.id=`${subpath.id}-n${anchorIndex}`;
  }
  return path;
}

function paletteSummary(paths) {
  const counts=new Map();
  for(const path of paths){
    const color=typeof path.fill==='string'?path.fill.trim():null;
    if(!color||color==='none')continue;
    counts.set(color,(counts.get(color)||0)+1);
  }
  return [...counts.entries()].map(([color,regions])=>({color,regions})).sort((a,b)=>b.regions-a.regions||a.color.localeCompare(b.color));
}

export async function decomposeReferenceIntoLayers(app, referenceObjectId, adapter, {
  numberOfColors=8,
  pathOmit=8,
  lineStroke='#202020',
  lineStrokeWidth=1,
  actor={type:'chat',id:'chat'},
  sourceChannel='CHAT_REFERENCE_DECOMPOSITION',
  signal
}={}) {
  const doc=app?.doc,page=app?.page?.();
  const found=referenceObjectId?findPageObject(page,referenceObjectId):null;
  const reference=found?.object;
  requireValue(doc&&page&&!app.history?.pending,'REFERENCE_DECOMPOSITION_TARGET_UNAVAILABLE');
  requireValue(reference?.type==='image'&&reference.metadata?.extractionReference,'REFERENCE_DECOMPOSITION_REFERENCE_REQUIRED');
  requireValue(Number.isInteger(Number(numberOfColors))&&Number(numberOfColors)>=2&&Number(numberOfColors)<=16,'REFERENCE_DECOMPOSITION_COLOR_COUNT');
  requireValue(Number.isFinite(Number(lineStrokeWidth))&&Number(lineStrokeWidth)>0&&Number(lineStrokeWidth)<=100,'REFERENCE_DECOMPOSITION_LINE_WIDTH');
  requireValue(typeof lineStroke==='string'&&lineStroke.trim()&&lineStroke!=='none','REFERENCE_DECOMPOSITION_LINE_STROKE');
  requireValue(typeof sourceChannel==='string'&&sourceChannel.trim(),'REFERENCE_DECOMPOSITION_SOURCE_CHANNEL');
  const before=JSON.stringify(doc),pageId=page.id;
  const file=referenceEmbeddedFile(reference);
  const decoded=await decodeReferenceFile(file);
  checkAbort(signal);
  const storedSource=reference.metadata?.referenceImport?.source||reference.metadata?.extractionReference?.source||{};
  if(storedSource.sha256)requireValue(decoded.source.sha256===storedSource.sha256,'REFERENCE_DECOMPOSITION_SOURCE_SHA_MISMATCH');
  const result=await executeExtraction({
    raster:decoded.raster,
    source:decoded.source,
    parameters:{
      mode:'color-regions',
      numberOfColors:Number(numberOfColors),
      pathOmit:Number(pathOmit),
      traceMaxPixels:64_000,
      traceMaxDimension:320
    }
  },adapter,{signal});
  await new Promise(resolve=>setTimeout(resolve,0)); checkAbort(signal);
  requireValue(app.doc===doc&&app.page().id===pageId&&JSON.stringify(doc)===before&&!app.history.pending,'REFERENCE_DECOMPOSITION_STALE_DOCUMENT');

  const batchId=uid();
  const referenceMatrix=Array.isArray(reference.matrix)&&reference.matrix.length===6?reference.matrix:Matrix.identity();
  const sourceLink=copy(reference.metadata?.source||{
    type:'reference',
    id:decoded.source.sha256,
    name:decoded.source.name
  });
  const colorPaths=result.paths.filter(path=>typeof path.fill==='string'&&path.fill.trim()&&path.fill!=='none').map((path,index)=>{
    const out=copy(path);
    rekeyDecompositionPath(out,`${batchId}-color-p${index}`,`Color region ${index+1}`);
    out.matrix=Matrix.multiply(referenceMatrix,out.matrix);
    out.stroke=null; out.strokeWidth=0;
    out.metadata={
      ...(out.metadata||{}),
      source:copy(sourceLink),
      decomposition:{
        schema:REFERENCE_DECOMPOSITION_SCHEMA,
        operation:REFERENCE_DECOMPOSITION_OPERATION,
        role:'color-region',
        referenceObjectId,
        sourceSha256:decoded.source.sha256,
        batchId,
        actor:copy(actor),
        sourceChannel
      }
    };
    return out;
  });
  requireValue(colorPaths.length>0,'REFERENCE_DECOMPOSITION_NO_COLOR_REGIONS');

  const linePaths=colorPaths.map((colorPath,index)=>{
    const out=copy(colorPath);
    rekeyDecompositionPath(out,`${batchId}-line-p${index}`,`Boundary line ${index+1}`);
    out.fill=null;
    out.gradient=null;
    out.stroke=lineStroke;
    out.strokeWidth=Number(lineStrokeWidth);
    delete out.materialAppearance;
    delete out.expressiveStroke;
    out.metadata={
      ...(out.metadata||{}),
      source:copy(sourceLink),
      decomposition:{
        ...copy(out.metadata?.decomposition||{}),
        role:'boundary-line',
        sourceColorObjectId:colorPath.id
      }
    };
    return out;
  });

  const colorLayer=defaultLayer('Color'),lineLayer=defaultLayer('Line');
  colorLayer.objects.push(...colorPaths);
  lineLayer.objects.push(...linePaths);
  const pagePath=app.pagePath?.(page);
  requireValue(Array.isArray(pagePath),'REFERENCE_DECOMPOSITION_PAGE_PATH');
  const layersPath=[...pagePath,'layers'],activeLayerPath=[...pagePath,'activeLayerId'];
  app.history.pushScoped('Reference → Color + Line layers',[layersPath,activeLayerPath],()=>{
    page.layers.push(colorLayer,lineLayer);
    page.activeLayerId=lineLayer.id;
  });
  app.selection=linePaths.length?[{layerId:lineLayer.id,objectId:linePaths[0].id}]:[];
  app.spatialDirty=true; app.refreshAll?.();

  return {
    schema:REFERENCE_DECOMPOSITION_SCHEMA,
    operation:REFERENCE_DECOMPOSITION_OPERATION,
    batchId,
    documentId:doc.id,
    pageId:page.id,
    referenceObjectId,
    source:{
      name:decoded.source.name,
      mimeType:decoded.source.mimeType,
      sha256:decoded.source.sha256,
      width:decoded.source.width,
      height:decoded.source.height,
      sizeBytes:decoded.source.sizeBytes
    },
    colorLayerId:colorLayer.id,
    lineLayerId:lineLayer.id,
    colorObjectIds:colorPaths.map(path=>path.id),
    lineObjectIds:linePaths.map(path=>path.id),
    colorCount:colorPaths.length,
    lineCount:linePaths.length,
    palette:paletteSummary(colorPaths),
    historyLabel:'Reference → Color + Line layers',
    provenance:{
      source:copy(sourceLink),
      referenceObjectId,
      generatedObjectIds:[...colorPaths.map(path=>path.id),...linePaths.map(path=>path.id)]
    },
    diagnostics:copy(result.diagnostics)
  };
}

export async function extractIntoDocument(app, request, adapter, { referenceSrc, matrix=Matrix.identity(), signal }={}) {
  const doc=app.doc,page=app.page(),layer=app.layer();
  requireValue(!app.history.pending && !layer.locked && layer.visible!==false,'EXTRACTION_TARGET_UNAVAILABLE');
  requireValue(Matrix.isInvertible(matrix),'EXTRACTION_SINGULAR_TRANSFORM');
  requireValue(typeof referenceSrc==='string' && /^data:image\/(png|jpeg|webp);base64,/.test(referenceSrc),'EXTRACTION_EMBEDDED_REFERENCE_REQUIRED');
  const before=JSON.stringify(doc),pageId=page.id,layerId=layer.id;
  const result=await executeExtraction(request,adapter,{signal});
  // Give queued cancel/document-switch actions a chance before the atomic commit.
  await new Promise(resolve=>setTimeout(resolve,0));checkAbort(signal);
  requireValue(app.doc===doc && app.page().id===pageId && app.layer().id===layerId && JSON.stringify(doc)===before && !app.history.pending,'EXTRACTION_STALE_DOCUMENT');
  const batchId=uid(),referenceId=`${batchId}-reference`;
  const paths=normalizePaths(result.paths,batchId,result.provenance).paths;
  const image={id:referenceId,type:'image',name:request.source.name,src:referenceSrc,w:request.raster.width,h:request.raster.height,
    matrix:[...matrix],opacity:0.5,locked:true,metadata:{extractionReference:{schema:result.schema,source:copy(request.source),pixelSha256:result.provenance.pixelSha256}}};
  for(const path of paths) {
    path.matrix=Matrix.multiply(matrix,path.matrix);path.fill=null;path.stroke='#b3261e';path.strokeWidth=1;
    path.metadata.extraction={...path.metadata.extraction,referenceObjectId:referenceId,batchId};
  }
  const targets=[app.layerObjectsPath(layer)];requireValue(Array.isArray(targets[0]),'EXTRACTION_TARGET_PATH');
  // The original image is embedded in its existing image object. No new asset store.
  app.history.pushScoped('Reference → editable Path',targets,()=>layer.objects.push(image,...paths));
  app.selection=paths.map(object=>({layerId:layer.id,objectId:object.id}));
  app.spatialDirty=true;app.refreshAll?.();
  return {...result,paths,referenceObjectId:referenceId,batchId};
}
export async function reconstructStructureIntoDocument(app, request, adapter, {
  referenceObjectId = null,
  matrix = Matrix.identity(),
  count = null,
  threshold = 128,
  signal
} = {}) {
  const doc=app.doc,page=app.page(),layer=app.layer();
  requireValue(!app.history.pending && !layer.locked && layer.visible!==false,'EXTRACTION_TARGET_UNAVAILABLE');
  requireValue(Matrix.isInvertible(matrix),'EXTRACTION_SINGULAR_TRANSFORM');
  requireValue(referenceObjectId && findPageObject(page,referenceObjectId)?.object?.metadata?.extractionReference,'EXTRACTION_STRUCTURE_REFERENCE_REQUIRED');
  validateRaster(request?.raster);
  const before=JSON.stringify(doc),pageId=page.id,layerId=layer.id;
  const evidence=radialEvidence(request.raster,{threshold});
  const selectedCount=Number.isInteger(count)?count:evidence.candidates[0]?.count;
  requireValue(Number.isInteger(selectedCount)&&evidence.candidates.some(item=>item.count===selectedCount),'EXTRACTION_STRUCTURE_COUNT');
  const mask=sectorMask(request.raster,request.source,evidence,{count:selectedCount,sector:0,threshold});
  const prototypeResult=await executeExtraction({
    ...request,
    mask,
    parameters:{...(request.parameters||{}),threshold,structureAware:true,radialCount:selectedCount,sector:0}
  },adapter,{signal});
  await new Promise(resolve=>setTimeout(resolve,0));checkAbort(signal);
  requireValue(app.doc===doc && app.page().id===pageId && app.layer().id===layerId && JSON.stringify(doc)===before && !app.history.pending,'EXTRACTION_STALE_DOCUMENT');

  const batchId=uid();
  for(const path of prototypeResult.paths){
    path.matrix=Matrix.multiply(matrix,path.matrix);
    path.fill=null;path.stroke='#2f718f';path.strokeWidth=1;
    path.metadata.extraction={...path.metadata.extraction,referenceObjectId,batchId,structureAware:true,radialCount:selectedCount,sector:0};
  }
  const repeat=reconstructRadial(prototypeResult.paths,evidence,{
    count:selectedCount,
    id:`${batchId}-structure-repeat`,
    prototypeSetId:`${batchId}-structure-prototype`
  });
  repeat.metadata={
    ...repeat.metadata,
    extraction:{...(repeat.metadata?.extraction||{}),referenceObjectId,batchId,structureAware:true,radialCount:selectedCount},
    structureAware:{
      schema:'INK-STRUCTURE-AWARE-WORKSPACE/1',
      radialCount:selectedCount,
      prototypePathCount:prototypeResult.paths.length,
      effectiveInstanceCount:selectedCount,
      referenceObjectId,
      source:copy(request.source)
    }
  };
  const targets=[app.layerObjectsPath(layer)];requireValue(Array.isArray(targets[0]),'EXTRACTION_TARGET_PATH');
  app.history.pushScoped('Structure-Aware radial reconstruction',targets,()=>layer.objects.push(repeat));
  app.selection=[{layerId:layer.id,objectId:repeat.id}];
  app.spatialDirty=true;app.refreshAll?.();
  const candidate=evidence.candidates.find(item=>item.count===selectedCount);
  return {
    schema:'INK-STRUCTURE-AWARE-WORKSPACE/1',
    batchId,
    repeat,
    repeatId:repeat.id,
    referenceObjectId,
    radialCount:selectedCount,
    maskIoU:candidate?.maskIoU??null,
    prototypePaths:prototypeResult.paths,
    prototypeDiagnostics:copy(prototypeResult.diagnostics),
    evidence:copy(evidence)
  };
}

export function correctExtractionAnchor(app,{objectId,subpath=0,node=0,x,y,maxDistance=32}) {
  const found=findPageObject(app.page(),objectId);
  requireValue(found?.object.type==='path' && found.object.metadata?.extraction,'EXTRACTION_PATH_NOT_FOUND');
  requireValue(!app.history.pending && !found.effectiveLocked && found.effectiveVisible!==false && Matrix.isInvertible(found.worldMatrix),'EXTRACTION_TARGET_UNAVAILABLE');
  const anchor=found.object.subpaths[subpath]?.anchors[node];
  requireValue(anchor && [x,y,maxDistance].every(Number.isFinite) && maxDistance>0 && maxDistance<=128 && Math.hypot(x-anchor.x,y-anchor.y)<=maxDistance,'EXTRACTION_CORRECTION_BOUND');
  app.history.pushScoped('Correct extracted node',[app.objectPath(found)],()=>moveAnchor(found.object,subpath,node,x,y));
  app.spatialDirty=true;app.refreshAll?.();
}
export function setReferenceOverlay(app,referenceObjectId,opacity) {
  const found=findPageObject(app.page(),referenceObjectId);
  requireValue(found?.object.type==='image' && found.object.metadata?.extractionReference && Number.isFinite(opacity) && opacity>=0 && opacity<=1 && !app.history.pending,'EXTRACTION_OVERLAY_INVALID');
  app.history.pushScoped('Reference overlay',[app.objectPath(found)],()=>{found.object.opacity=opacity;});
  app.refreshAll?.();
}
export async function decodeReferenceFile(file) {
  requireValue(file && REFERENCE_MIME_TYPES.has(file.type) && file.size<=16_000_000,'EXTRACTION_IMAGE_FILE');
  const bytes=new Uint8Array(await file.arrayBuffer()),sha=await sha256(bytes);
  const bitmap=await createImageBitmap(file);
  try {
    requireValue(bitmap.width*bitmap.height<=4_000_000,'EXTRACTION_RASTER_SIZE');
    const source={name:file.name,mimeType:file.type,sizeBytes:file.size,sha256:sha,width:bitmap.width,height:bitmap.height};
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);
    const raster=ctx.getImageData(0,0,bitmap.width,bitmap.height);validateRaster(raster);
    const referenceSrc=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
    return {source,raster,referenceSrc};
  } finally {bitmap.close();}
}
