import { Matrix } from '../core/index.js';
import { findPageObject } from '../document/hierarchy.js';
import { PathEditController } from './path-edit.js';
import { createPathProjectiveDeformationPlan, createWarpDeformationPlan } from './transform-advanced.js';
import { applyNonDestructiveDeformation, deformationReport } from '../vector/deformation.js';
import { createAnchor, createPath } from '../vector/vector-core.js';
import { eraseStrokeWithCircle } from '../stroke/edit.js';
import {
  CHAT_MIXER_STROKE_KIND_SET,
  CHAT_NATURAL_MEDIA_STROKE_KIND_SET,
  activeLayer,
  chatStateFingerprint,
  clone,
  editFail,
  finishStructuralMutation,
  structuralHistoryPaths
} from './creative-operation-shared.js';

function executePathEditTask(app, task) {
  if (app.pathEditing?.active) editFail('EDIT_MODE_BUSY', { operation: task.operation });
  const ref = task.targets[0];
  const editor = new PathEditController(app);
  editor.enter({ layerId: ref.layerId, objectId: ref.objectId }, { syncSelection: false });
  try {
    if (task.operation === 'path.simplify.v1') return editor.simplify(task.arguments);
    if (task.operation === 'path.refine.v1') return editor.refine(task.arguments);
    if (task.operation === 'path.edit.v1') {
      const args = task.arguments;
      if (args.action === 'move-anchor') return editor.moveAnchorTo(args.subpathIndex, args.anchorIndex, args.x, args.y);
      if (args.action === 'move-handle') {
        editor.selectHandle(args.subpathIndex, args.anchorIndex, args.side);
        return editor.moveSelectedHandle(args.x, args.y);
      }
      if (args.action === 'set-anchor-mode') {
        editor.selectAnchor(args.subpathIndex, args.anchorIndex);
        return editor.setSelectedAnchorMode(args.mode);
      }
      if (args.action === 'add-anchor') return editor.addAnchorOnSegment(args.subpathIndex, args.segmentIndex, args.t);
      if (args.action === 'delete-anchors') {
        editor.selectAnchors(args.anchors);
        return editor.deleteSelectedAnchors();
      }
      if (args.action === 'set-subpath-closed') return editor.setSubpathClosed(args.subpathIndex, args.closed);
    }
    editFail('OPERATION_NOT_ALLOWED', { operation: task.operation });
  } finally {
    editor.exit();
  }
}

function pathForCreate(args) {
  let subpaths;
  if (args.shape === 'path') {
    subpaths = args.subpaths;
  } else if (args.shape === 'ellipse' || args.shape === 'circle') {
    const k = 0.5522847498307936;
    subpaths = [{
      role: 'outer', closed: true,
      anchors: [
        createAnchor(args.cx + args.rx, args.cy, { x: 0, y: -args.ry * k }, { x: 0, y: args.ry * k }, { mode: 'smooth' }),
        createAnchor(args.cx, args.cy + args.ry, { x: args.rx * k, y: 0 }, { x: -args.rx * k, y: 0 }, { mode: 'smooth' }),
        createAnchor(args.cx - args.rx, args.cy, { x: 0, y: args.ry * k }, { x: 0, y: -args.ry * k }, { mode: 'smooth' }),
        createAnchor(args.cx, args.cy - args.ry, { x: -args.rx * k, y: 0 }, { x: args.rx * k, y: 0 }, { mode: 'smooth' })
      ]
    }];
  } else if (args.shape === 'rectangle') {
    subpaths = [{
      role: 'outer', closed: true,
      anchors: [
        createAnchor(args.x, args.y),
        createAnchor(args.x + args.width, args.y),
        createAnchor(args.x + args.width, args.y + args.height),
        createAnchor(args.x, args.y + args.height)
      ]
    }];
  } else {
    subpaths = [{
      role: 'outer',
      closed: args.shape === 'polygon',
      anchors: args.points.map(point => createAnchor(point.x, point.y))
    }];
  }
  return createPath({
    ...(args.objectId ? { id: args.objectId } : {}),
    name: args.name,
    subpaths,
    fill: args.fill,
    stroke: args.stroke,
    strokeWidth: args.strokeWidth,
    opacity: args.opacity
  });
}

function executePathCreateTask(app, task) {
  const layer = activeLayer(app);
  if (!layer) editFail('LAYER_UNAVAILABLE');
  const path = pathForCreate(task.arguments);
  if (findPageObject(app.page(), path.id)) editFail('OBJECT_ID_COLLISION', { objectId: path.id });
  app.history.pushScoped('CHAT create Path', structuralHistoryPaths(app, []), () => { layer.objects.push(path); });
  finishStructuralMutation(app);
  const ref = { pageId: app.page().id, layerId: layer.id, objectId: path.id };
  return { createdRefs: [ref], resultRefs: [ref], objectId: path.id, shape: task.arguments.shape };
}

function executeStrokeCreateTask(app, task) {
  const layer = activeLayer(app);
  if (!layer) editFail('LAYER_UNAVAILABLE');
  if (layer.locked) editFail('TARGET_LOCKED', { layerId: layer.id });
  const args = task.arguments;
  const strokeId = args.objectId || `chat-stroke-${chatStateFingerprint({
    taskId: task.taskId, name: args.name, kind: args.kind, color: args.color, size: args.size,
    opacity: args.opacity, smoothing: args.smoothing, pressure: args.pressure, taper: args.taper,
    grain: args.grain, softness: args.softness, flow: args.flow, wetness: args.wetness,
    bristle: args.bristle, blend: args.blend, smudge: args.smudge, drag: args.drag, samples: args.samples
  }).replace(':', '-')}`;
  if (findPageObject(app.page(), strokeId)) editFail('OBJECT_ID_COLLISION', { objectId: strokeId });
  const origin = args.samples[0], firstTimestamp = origin.timestamp;
  const points = args.samples.map(sample => ({
    x: sample.x-origin.x, y: sample.y-origin.y, p: sample.pressure, tiltX: sample.tiltX, tiltY: sample.tiltY,
    altitude: sample.altitude, azimuth: sample.azimuth, twist: sample.twist, predicted: false, t: sample.timestamp-firstTimestamp
  }));
  const object = {
    id:strokeId,type:'stroke',name:args.name,matrix:Matrix.translate(origin.x,origin.y),opacity:args.opacity,
    color:args.color,size:args.size,kind:args.kind,smoothing:args.smoothing,pressure:args.pressure,taper:args.taper,
    grain:args.grain,softness:args.softness,flow:args.flow,wetness:args.wetness,bristle:args.bristle,
    ...(CHAT_MIXER_STROKE_KIND_SET.has(args.kind)?{blend:args.blend,smudge:args.smudge,drag:args.drag}:{}),
    ...(CHAT_NATURAL_MEDIA_STROKE_KIND_SET.has(args.kind)?{mediaModel:'natural-v2'}:{}),
    points
  };
  app.history.pushScoped('CHAT create Stroke', structuralHistoryPaths(app, []), () => { layer.objects.push(object); });
  finishStructuralMutation(app);
  const ref={pageId:app.page().id,layerId:layer.id,objectId:object.id};
  return {createdRefs:[ref],resultRefs:[ref],objectId:object.id,kind:object.kind,pointCount:object.points.length,mediaModel:object.mediaModel||null};
}

function executeStrokeEraseCircleTask(app, task) {
  const page=app.page();
  const foundItems=task.targets.map(ref=>findPageObject(page,ref));
  if(foundItems.some(found=>!found||found.object?.type!=='stroke'))editFail('STROKE_REQUIRED');
  const args=task.arguments;
  const prepared=foundItems.map((found,targetIndex)=>{
    const worldMatrix=found.worldMatrix||found.object.matrix||Matrix.identity();
    const inverse=Matrix.tryInvert(worldMatrix);
    if(!inverse)editFail('TARGET_SINGULAR',{objectId:found.object.id});
    const localCenter=Matrix.point(inverse,{x:args.x,y:args.y});
    const scale=Math.hypot(worldMatrix[0],worldMatrix[1])||1;
    const localRadius=args.radius/scale;
    let fragmentIndex=0;
    const result=eraseStrokeWithCircle(found.object,localCenter,localRadius,()=>`chat-erase-${chatStateFingerprint({taskId:task.taskId,sourceObjectId:found.object.id,targetIndex,fragmentIndex:fragmentIndex++}).replace(':','-')}`);
    return {found,result};
  });
  if(!prepared.some(item=>item.result.changed))editFail('NO_OP',{operation:task.operation});
  const targetIds=new Set(foundItems.map(found=>found.object.id)),generatedIds=new Set();
  for(const item of prepared){
    if(!item.result.changed)continue;
    for(const fragment of item.result.fragments){
      if(generatedIds.has(fragment.id))editFail('OBJECT_ID_COLLISION',{objectId:fragment.id});
      generatedIds.add(fragment.id);
      const collision=findPageObject(page,fragment.id);
      if(collision&&!targetIds.has(fragment.id))editFail('OBJECT_ID_COLLISION',{objectId:fragment.id});
    }
  }
  const resultRefs=[],removedRefs=[];let fragmentCount=0;
  app.history.pushScoped('CHAT erase Stroke',structuralHistoryPaths(app,foundItems),()=>{
    for(let index=0;index<prepared.length;index+=1){
      const {found,result}=prepared[index],originalRef=task.targets[index];
      if(!result.changed){resultRefs.push(clone(originalRef));continue;}
      const objectIndex=found.parentArray.indexOf(found.object);
      if(objectIndex<0)editFail('TARGET_MISSING',{objectId:found.object.id});
      for(const fragment of result.fragments){if(found.parentObject)fragment.parentId=found.parentObject.id;else delete fragment.parentId;}
      found.parentArray.splice(objectIndex,1,...result.fragments);
      removedRefs.push(clone(originalRef));fragmentCount+=result.fragments.length;
      for(const fragment of result.fragments)resultRefs.push({pageId:page.id,layerId:found.layer.id,objectId:fragment.id});
    }
    if(Array.isArray(app.selection)&&removedRefs.length){
      const removedIds=new Set(removedRefs.map(ref=>ref.objectId));
      app.selection=app.selection.filter(ref=>!removedIds.has(ref.objectId));
    }
  });
  finishStructuralMutation(app);
  return {changed:true,removedRefs,resultRefs,erasedTargetCount:removedRefs.length,fragmentCount,circle:{x:args.x,y:args.y,radius:args.radius}};
}

function pathLocalAnchorBounds(path) {
  const points=(path?.subpaths||[]).flatMap(subpath=>(subpath.anchors||[]).map(anchor=>({x:anchor.x,y:anchor.y})));
  if(!points.length)editFail('PATH_GEOMETRY_EMPTY',{objectId:path?.id||null});
  const xs=points.map(point=>point.x),ys=points.map(point=>point.y);
  return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
}
function executePathDeformationTask(app, task) {
  const ref=task.targets[0],found=findPageObject(app.page(),ref);
  if(!found||found.object?.type!=='path')editFail('PATH_REQUIRED',{objectId:found?.object?.id||null});
  const object=found.object;
  const bounds=pathLocalAnchorBounds({...object,subpaths:object.deformation?.baseSubpaths||object.subpaths});
  let mode=null,parameters=null;
  if(task.operation==='path.warp.v1'){
    const plan=createWarpDeformationPlan(bounds,task.arguments);
    if(!plan.parameters.bend)editFail('NO_OP',{operation:task.operation});
    mode=plan.mode;parameters={...plan.normalized,bend:plan.parameters.bend};
    app.history.pushScoped('CHAT warp Path',[app.objectPath(found)],()=>{applyNonDestructiveDeformation(object,{bend:plan.parameters.bend});});
  }else{
    mode=task.operation==='path.distort.v1'?'distort':'perspective';
    const plan=createPathProjectiveDeformationPlan(bounds,task.arguments,mode);
    parameters={projective:plan};
    app.history.pushScoped(`CHAT ${mode} Path`,[app.objectPath(found)],()=>{applyNonDestructiveDeformation(object,parameters);});
  }
  app.spatialDirty=true;app.refreshAll?.();app.renderer?.render?.();
  return {resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:object.id}],mode,parameters,deformation:deformationReport(object)};
}

export function executeVectorPathStrokeOperation(app,task){
  if(task.operation==='path.simplify.v1'||task.operation==='path.refine.v1'||task.operation==='path.edit.v1')return executePathEditTask(app,task);
  if(task.operation==='path.create.v1')return executePathCreateTask(app,task);
  if(task.operation==='stroke.create.v1')return executeStrokeCreateTask(app,task);
  if(task.operation==='stroke.erase.circle.v1')return executeStrokeEraseCircleTask(app,task);
  if(task.operation==='path.warp.v1'||task.operation==='path.distort.v1'||task.operation==='path.perspective.v1')return executePathDeformationTask(app,task);
  editFail('OPERATION_NOT_ALLOWED',{operation:task.operation});
}
