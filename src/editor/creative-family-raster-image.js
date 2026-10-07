import { Matrix } from '../core/index.js';
import { findPageObject } from '../document/hierarchy.js';
import { createAnchor, createPath } from '../vector/vector-core.js';
import { BrushPresetRegistry, StrokeSessionRecorder, replayStrokeSession } from '../paint/paint-core.js';
import {
  burn, cloneStamp, colorRasterToRgba8, colorReplacementBrush, createAdjustment, createColorRaster,
  createFilter, createLayerEffect, createLiquifyFilter, deserializeColorRaster, dodge, healingBrush,
  localBlur, localSharpen, maskBounds, paintBucketFill, patchRaster, rasterizePathMask,
  serializeColorRaster, sponge, spotHealing
} from '../image/image-core.js';
import {
  activeLayer, chatStateFingerprint, clone, editFail, finishStructuralMutation,
  rasterMaskFingerprint, structuralHistoryPaths
} from './creative-operation-shared.js';

function executePaintSessionCreateTask(app, task) {
  const layer=activeLayer(app);if(!layer)editFail('LAYER_UNAVAILABLE');if(layer.locked)editFail('TARGET_LOCKED',{layerId:layer.id});
  const args=task.arguments,registry=new BrushPresetRegistry();
  const sessionId=args.objectId||`chat-paint-${chatStateFingerprint({taskId:task.taskId,seed:args.seed,name:args.name,strokes:args.strokes.map(stroke=>({brushId:stroke.brushId,color:stroke.color,seed:stroke.seed,samples:stroke.samples}))}).replace(':','-')}`;
  if(findPageObject(app.page(),sessionId))editFail('OBJECT_ID_COLLISION',{objectId:sessionId});
  const recorder=new StrokeSessionRecorder({id:sessionId,name:args.name,seed:args.seed,registry,layerState:[{id:layer.id,visible:layer.visible!==false,locked:Boolean(layer.locked),opacity:layer.opacity??1}],metadata:{source:'CHAT_BOUNDED_EDIT',operation:task.operation,taskId:task.taskId}});
  for(const [strokeIndex,spec] of args.strokes.entries()){
    recorder.beginStroke({...spec.id?{id:spec.id}:{},brushId:spec.brushId,color:spec.color,seed:spec.seed,layerId:layer.id,metadata:{source:'CHAT_BOUNDED_EDIT',strokeIndex}});
    for(const sample of spec.samples)recorder.addSample(sample);
    recorder.endStroke();
  }
  const session=recorder.finish({source:'CHAT_BOUNDED_EDIT',taskId:task.taskId}),replay=replayStrokeSession(session,{registry,fixedSeed:true});
  if(replay?.report?.status!=='COMPLETED')editFail('PAINT_REPLAY_FAILED',{status:replay?.report?.status||null});
  const object={id:sessionId,type:'paint-session',name:args.name,matrix:Matrix.identity(),opacity:args.opacity,session,replay};
  app.history.pushScoped('CHAT create Paint Session',structuralHistoryPaths(app,[]),()=>{layer.objects.push(object);});
  finishStructuralMutation(app);
  const ref={pageId:app.page().id,layerId:layer.id,objectId:object.id};
  return{createdRefs:[ref],resultRefs:[ref],objectId:object.id,strokeCount:session.strokes.length,sampleCount:args.sampleCount,brushIds:[...new Set(session.strokes.map(stroke=>stroke.brushId))],replayHash:replay.replayHash||replay.report?.replayHash||null};
}
function rgbaImageDataToSerializedColorRaster(imageData){
  const pixels=imageData.width*imageData.height,rgb=new Uint8Array(pixels*3),alpha=new Uint8Array(pixels);
  for(let index=0;index<pixels;index+=1){const source=index*4,target=index*3;rgb[target]=imageData.data[source];rgb[target+1]=imageData.data[source+1];rgb[target+2]=imageData.data[source+2];alpha[index]=imageData.data[source+3];}
  return serializeColorRaster(createColorRaster({width:imageData.width,height:imageData.height,bitDepth:8,colorMode:'RGB',data:rgb,alpha}));
}
function rasterTarget(app,task){
  const found=findPageObject(app.page(),task.targets[0]);
  if(!found||found.object?.type!=='image'||!found.object?.rasterState?.colorRaster)editFail('RASTER_IMAGE_REQUIRED',{objectId:found?.object?.id||null});
  return found;
}
function rgbaPreview(found){
  const object=found.object,raster=deserializeColorRaster(object.rasterState.colorRaster);
  if(raster.bitDepth!==8||raster.colorMode!=='RGB')editFail('RASTER_FORMAT_UNSUPPORTED',{bitDepth:raster.bitDepth,colorMode:raster.colorMode});
  const preview=colorRasterToRgba8(object.rasterState.colorRaster,{icc:object.rasterState.icc||null});
  if(preview.status!=='ok')editFail('RASTER_RENDER_UNSUPPORTED',{reason:preview.reason||preview.status});
  return{object,raster,preview};
}
function changeCounts(before,after){
  let changedChannels=0,changedPixels=0;
  for(let index=0;index<after.data.length;index+=4){let pixelChanged=false;for(let channel=0;channel<4;channel+=1){if(after.data[index+channel]!==before.data[index+channel]){changedChannels+=1;pixelChanged=true;}}if(pixelChanged)changedPixels+=1;}
  return{changedChannels,changedPixels};
}
function commitRaster(app,found,nextColorRaster,label){
  const object=found.object;
  app.history.pushScoped(label,[app.objectPath(found)],()=>{object.rasterState.colorRaster=nextColorRaster;object.rasterState.source={...(object.rasterState.source||{}),format:'INK',chatEdited:true};});
  app.spatialDirty=true;app.renderer?.studioImageCache?.clear?.();app.renderer?.studioLayerCache?.clear?.();app.refreshAll?.();app.renderer?.render?.();
}
function executeImageRasterPaintBucketTask(app,task){
  const found=rasterTarget(app,task),{object,raster,preview}=rgbaPreview(found),{width,height}=preview.imageData;
  if(task.arguments.x>=width||task.arguments.y>=height)editFail('ARGUMENT_OUT_OF_RANGE',{field:'arguments.x/y',width,height});
  const result=paintBucketFill(preview.imageData,task.arguments),counts=changeCounts(preview.imageData,result);
  if(!counts.changedPixels)editFail('NO_OP',{operation:task.operation});
  commitRaster(app,found,rgbaImageDataToSerializedColorRaster(result),'CHAT raster Paint Bucket');
  return{changed:true,resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:object.id}],rasterEdit:{type:'paintBucket',x:task.arguments.x,y:task.arguments.y,color:task.arguments.color,tolerance:task.arguments.tolerance,contiguous:task.arguments.contiguous,opacity:task.arguments.opacity,...counts,selectionBounds:clone(result.selection?.bounds||null)}};
}
function executeImageRasterSpotHealTask(app,task){
  const found=rasterTarget(app,task),{object,preview}=rgbaPreview(found),{width,height}=preview.imageData,args=task.arguments;
  if(args.x>=width||args.y>=height)editFail('ARGUMENT_OUT_OF_RANGE',{field:'arguments.x/y',width,height});
  const result=spotHealing(preview.imageData,{targetPoint:{x:args.x,y:args.y},radius:args.radius,opacity:args.opacity,hardness:args.hardness,neighborRadius:args.neighborRadius}),counts=changeCounts(preview.imageData,result);
  if(!counts.changedPixels)editFail('NO_OP',{operation:task.operation});
  object.rasterState=object.rasterState||{};commitRaster(app,found,rgbaImageDataToSerializedColorRaster(result),'CHAT raster Spot Healing');
  return{changed:true,resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:object.id}],rasterEdit:{type:'spotHealing',x:args.x,y:args.y,radius:args.radius,opacity:args.opacity,hardness:args.hardness,neighborRadius:args.neighborRadius,...counts}};
}
function executeImageRasterLocalRetouchTask(app,task){
  const found=rasterTarget(app,task),{object,preview}=rgbaPreview(found),args=task.arguments,{width,height}=preview.imageData;
  if(args.x>=width||args.y>=height)editFail('ARGUMENT_OUT_OF_RANGE',{field:'arguments.x/y',width,height});
  const targetPoint={x:args.x,y:args.y};let result=null;
  if(args.type==='dodge')result=dodge(preview.imageData,{targetPoint,radius:args.radius,strength:args.strength,hardness:args.hardness});
  else if(args.type==='burn')result=burn(preview.imageData,{targetPoint,radius:args.radius,strength:args.strength,hardness:args.hardness});
  else if(args.type==='sponge')result=sponge(preview.imageData,{targetPoint,radius:args.radius,strength:args.strength,mode:args.mode,hardness:args.hardness});
  else if(args.type==='localBlur')result=localBlur(preview.imageData,{targetPoint,brushRadius:args.radius,radius:args.kernelRadius,strength:args.strength,hardness:args.hardness});
  else if(args.type==='localSharpen')result=localSharpen(preview.imageData,{targetPoint,brushRadius:args.radius,radius:args.kernelRadius,amount:args.amount,hardness:args.hardness});
  else if(args.type==='colorReplacement')result=colorReplacementBrush(preview.imageData,{targetPoint,radius:args.radius,hardness:args.hardness,strength:args.strength,tolerance:args.tolerance,replacementColor:args.replacementColor,...(args.referenceColor?{referenceColor:args.referenceColor}:{})});
  else editFail('ARGUMENT_INVALID',{field:'arguments.type'});
  const counts=changeCounts(preview.imageData,result);if(!counts.changedPixels)editFail('NO_OP',{operation:task.operation});
  commitRaster(app,found,rgbaImageDataToSerializedColorRaster(result),`CHAT raster local retouch: ${args.type}`);
  return{changed:true,resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:object.id}],rasterEdit:{type:args.type,x:args.x,y:args.y,radius:args.radius,...counts}};
}
function executeImageRasterSourceRetouchTask(app,task){
  const found=rasterTarget(app,task),{object,preview}=rgbaPreview(found),args=task.arguments,{width,height}=preview.imageData;let result=null,receipt=null;
  if(args.type==='cloneStamp'||args.type==='healingBrush'){
    if(args.sourceX>=width||args.sourceY>=height)editFail('ARGUMENT_OUT_OF_RANGE',{field:'arguments.sourceX/sourceY',width,height});
    if(args.targetX>=width||args.targetY>=height)editFail('ARGUMENT_OUT_OF_RANGE',{field:'arguments.targetX/targetY',width,height});
    const options={sourcePoint:{x:args.sourceX,y:args.sourceY},targetPoint:{x:args.targetX,y:args.targetY},radius:args.radius,opacity:args.opacity,hardness:args.hardness};
    result=args.type==='cloneStamp'?cloneStamp(preview.imageData,options):healingBrush(preview.imageData,options);
    receipt={type:args.type,...options};
  }else if(args.type==='patch'){
    const inside=region=>region.x+region.width<=width&&region.y+region.height<=height;
    if(!inside(args.sourceRegion))editFail('ARGUMENT_OUT_OF_RANGE',{field:'arguments.sourceRegion',width,height});
    if(!inside(args.targetRegion))editFail('ARGUMENT_OUT_OF_RANGE',{field:'arguments.targetRegion',width,height});
    result=patchRaster(preview.imageData,{sourceRegion:args.sourceRegion,targetRegion:args.targetRegion,opacity:args.opacity,feather:args.feather});
    receipt={type:args.type,sourceRegion:clone(args.sourceRegion),targetRegion:clone(args.targetRegion),opacity:args.opacity,feather:args.feather};
  }else editFail('ARGUMENT_INVALID',{field:'arguments.type'});
  const counts=changeCounts(preview.imageData,result);if(!counts.changedPixels)editFail('NO_OP',{operation:task.operation});
  commitRaster(app,found,rgbaImageDataToSerializedColorRaster(result),`CHAT raster source retouch: ${args.type}`);
  return{changed:true,resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:object.id}],rasterEdit:{...receipt,...counts}};
}
function executeImageRasterMaskTask(app,task){
  const found=rasterTarget(app,task),object=found.object,raster=deserializeColorRaster(object.rasterState.colorRaster),args=task.arguments;
  if(args.x+args.width>raster.width||args.y+args.height>raster.height)editFail('ARGUMENT_OUT_OF_RANGE',{field:'arguments.rectangle',width:raster.width,height:raster.height});
  const path=createPath({id:`chat-mask-path-${task.taskId}`,name:'CHAT Raster Mask Rectangle',fill:'#000000',stroke:'none',subpaths:[{role:'outer',closed:true,anchors:[createAnchor(args.x,args.y),createAnchor(args.x+args.width,args.y),createAnchor(args.x+args.width,args.y+args.height),createAnchor(args.x,args.y+args.height)]}]});
  const baseMask=rasterizePathMask(path,raster.width,raster.height,{supersample:1});
  const nextMask={...baseMask,id:`chat-rmask-${chatStateFingerprint({taskId:task.taskId,rectangle:args}).replace(':','-')}`,invert:args.invert,feather:args.feather,expand:args.expand,enabled:true};
  if(rasterMaskFingerprint(object.rasterMask)===rasterMaskFingerprint(nextMask))editFail('NO_OP',{operation:task.operation});
  app.history.pushScoped('CHAT set raster mask',[app.objectPath(found)],()=>{object.rasterMask=nextMask;});
  app.spatialDirty=true;app.renderer?.studioImageCache?.clear?.();app.renderer?.studioLayerCache?.clear?.();app.refreshAll?.();app.renderer?.render?.();
  return{changed:true,resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:object.id}],rasterMask:{id:nextMask.id,type:nextMask.type,width:nextMask.width,height:nextMask.height,invert:nextMask.invert,feather:nextMask.feather,expand:nextMask.expand,enabled:nextMask.enabled,bounds:maskBounds(nextMask.alpha,nextMask.width,nextMask.height),fingerprint:rasterMaskFingerprint(nextMask)}};
}
function executeImageAdjustmentTask(app,task){
  const found=rasterTarget(app,task),object=found.object;if((object.adjustments?.length||0)>=64)editFail('STACK_LIMIT',{operation:task.operation});let stackItem=null;
  app.history.pushScoped(`CHAT add image adjustment: ${task.arguments.type}`,[app.objectPath(found)],()=>{object.adjustments=object.adjustments||[];stackItem=createAdjustment(task.arguments.type,task.arguments.params,{opacity:task.arguments.opacity});object.adjustments.push(stackItem);});
  app.spatialDirty=true;app.refreshAll?.();app.renderer?.render?.();
  return{resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:object.id}],stackItemId:stackItem?.id||null,stackItemType:stackItem?.type||null,adjustmentCount:object.adjustments?.length||0};
}
function executeImageFilterTask(app,task){
  const found=rasterTarget(app,task),object=found.object;if((object.filterStack?.length||0)>=64)editFail('STACK_LIMIT',{operation:task.operation});let stackItem=null;
  app.history.pushScoped(`CHAT add image filter: ${task.arguments.type}`,[app.objectPath(found)],()=>{object.filterStack=object.filterStack||[];stackItem=createFilter(task.arguments.type,task.arguments.params,{opacity:task.arguments.opacity});object.filterStack.push(stackItem);});
  app.spatialDirty=true;app.refreshAll?.();app.renderer?.render?.();
  return{resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:object.id}],stackItemId:stackItem?.id||null,stackItemType:stackItem?.type||null,filterCount:object.filterStack?.length||0};
}
function executeImageBlendTask(app,task){
  const found=rasterTarget(app,task),object=found.object;
  app.history.pushScoped(`CHAT set image blend: ${task.arguments.mode}`,[app.objectPath(found)],()=>{object.blendMode=task.arguments.mode;});
  app.spatialDirty=true;app.refreshAll?.();app.renderer?.render?.();
  return{resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:object.id}],blendMode:object.blendMode};
}
function executeImageEffectTask(app,task){
  const found=rasterTarget(app,task),object=found.object;if((object.effects?.length||0)>=64)editFail('STACK_LIMIT',{operation:task.operation});let stackItem=null;
  app.history.pushScoped(`CHAT add image effect: ${task.arguments.type}`,[app.objectPath(found)],()=>{object.effects=object.effects||[];stackItem=createLayerEffect(task.arguments.type,task.arguments.params,{opacity:task.arguments.opacity});object.effects.push(stackItem);});
  app.spatialDirty=true;app.refreshAll?.();app.renderer?.render?.();
  return{resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:object.id}],stackItemId:stackItem?.id||null,stackItemType:stackItem?.type||null,effectCount:object.effects?.length||0};
}
function executeImageLiquifyTask(app,task){
  const found=rasterTarget(app,task),object=found.object;if((object.filterStack?.length||0)>=64)editFail('STACK_LIMIT',{operation:task.operation});let stackItem=null;
  app.history.pushScoped('CHAT add image Liquify',[app.objectPath(found)],()=>{object.filterStack=object.filterStack||[];stackItem=createLiquifyFilter(task.arguments.operations,{opacity:task.arguments.opacity,maxWork:task.arguments.maxWork});object.filterStack.push(stackItem);});
  app.spatialDirty=true;app.refreshAll?.();app.renderer?.render?.();
  return{resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:object.id}],stackItemId:stackItem?.id||null,stackItemType:stackItem?.type||null,operationCount:task.arguments.operations.length,filterCount:object.filterStack?.length||0};
}
export function executeRasterImageOperation(app,task){
  if(task.operation==='paint.session.create.v1')return executePaintSessionCreateTask(app,task);
  if(task.operation==='image.adjustment.add.v1')return executeImageAdjustmentTask(app,task);
  if(task.operation==='image.filter.add.v1')return executeImageFilterTask(app,task);
  if(task.operation==='image.blend.set.v1')return executeImageBlendTask(app,task);
  if(task.operation==='image.effect.add.v1')return executeImageEffectTask(app,task);
  if(task.operation==='image.liquify.add.v1')return executeImageLiquifyTask(app,task);
  if(task.operation==='image.raster.paintBucket.v1')return executeImageRasterPaintBucketTask(app,task);
  if(task.operation==='image.mask.raster.set.v1')return executeImageRasterMaskTask(app,task);
  if(task.operation==='image.raster.spotHeal.v1')return executeImageRasterSpotHealTask(app,task);
  if(task.operation==='image.raster.localRetouch.v1')return executeImageRasterLocalRetouchTask(app,task);
  if(task.operation==='image.raster.sourceRetouch.v1')return executeImageRasterSourceRetouchTask(app,task);
  editFail('OPERATION_NOT_ALLOWED',{operation:task.operation});
}
