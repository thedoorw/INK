import { Matrix } from '../core/index.js';
import { createFrame, findPageObject, reparentPageObject } from '../document/hierarchy.js';
import { setFrameLayout, setChildLayoutItem } from '../document/layout.js';
import {
  registerComponentDefinition, createComponentInstance, setComponentOverride,
  detachComponentInstance, duplicateComponentDefinition, repairComponentReference
} from '../document/components.js';
import { cloneCompositionObject } from './composition.js';
import { applyWorldTransformBatch } from './transform.js';
import { booleanPaths, createRepeat, createVectorGroup, dividePaths } from '../vector/vector-core.js';
import { activeLayer, clone, editFail, finishStructuralMutation, structuralHistoryPaths } from './creative-operation-shared.js';

function executeCloneTask(app, task) {
  const source=findPageObject(app.page(),task.targets[0]);
  if(!source)editFail('TARGET_MISSING');
  const cloneObject=cloneCompositionObject(source.object,{parentId:source.parentObject?.id||null});
  if(task.arguments.dx||task.arguments.dy)cloneObject.matrix=Matrix.multiply(Matrix.translate(task.arguments.dx,task.arguments.dy),cloneObject.matrix||Matrix.identity());
  const sourceIndex=source.parentArray.indexOf(source.object);
  if(sourceIndex<0)editFail('TARGET_MISSING');
  app.history.pushScoped('CHAT clone object',structuralHistoryPaths(app,[source]),()=>{source.parentArray.splice(sourceIndex+1,0,cloneObject);});
  finishStructuralMutation(app);
  const ref={pageId:app.page().id,layerId:source.layer.id,objectId:cloneObject.id};
  return {createdRefs:[ref],resultRefs:[ref],sourceObjectId:source.object.id};
}
function executeRepeatRadialTask(app,task){
  const source=findPageObject(app.page(),task.targets[0]);if(!source)editFail('TARGET_MISSING');
  const parentWorld=source.parentWorldMatrix||Matrix.identity(),inverseParentWorld=Matrix.tryInvert(parentWorld);
  if(!inverseParentWorld)editFail('SINGULAR_TARGET',{objectId:source.object.id});
  const nativeCenter=Matrix.point(inverseParentWorld,task.arguments.center);
  const repeat=createRepeat(source.object,{mode:'radial',count:task.arguments.count,center:nativeCenter,sweep:task.arguments.sweep,startAngle:task.arguments.startAngle,linked:task.arguments.linked,sourceObjectId:source.object.id});
  if(source.parentObject?.id)repeat.parentId=source.parentObject.id;
  const sourceIndex=source.parentArray.indexOf(source.object);
  app.history.pushScoped('CHAT create radial Repeat',structuralHistoryPaths(app,[source]),()=>{source.parentArray.splice(sourceIndex+1,0,repeat);});
  finishStructuralMutation(app);
  const ref={pageId:app.page().id,layerId:source.layer.id,objectId:repeat.id};
  return {createdRefs:[ref],resultRefs:[ref],sourceObjectId:source.object.id,count:repeat.count,center:{...task.arguments.center},nativeCenter};
}
function assertSameStructuralParent(foundItems,operation){
  if(!foundItems.length||foundItems.some(found=>!found))editFail('TARGET_MISSING',{operation});
  const first=foundItems[0];
  if(foundItems.some(found=>found.layer.id!==first.layer.id||found.parentArray!==first.parentArray))editFail('STRUCTURAL_PARENT_MISMATCH',{operation});
  return first;
}
function executeBooleanTask(app,task){
  const foundItems=task.targets.map(ref=>findPageObject(app.page(),ref)),first=assertSameStructuralParent(foundItems,task.operation);
  const paths=foundItems.map(found=>found.object),operation=task.arguments.operation;
  const result=operation==='divide'?dividePaths(paths,{name:task.arguments.name||'CHAT Divide',tolerance:task.arguments.tolerance}):booleanPaths(paths,operation,{name:task.arguments.name||`CHAT ${operation}`,tolerance:task.arguments.tolerance});
  const created=result.type==='group'?result.children:[result],indexes=foundItems.map(found=>first.parentArray.indexOf(found.object)),insertionIndex=Math.min(...indexes),parentId=first.parentObject?.id||null;
  for(const object of created){if(parentId)object.parentId=parentId;else delete object.parentId;}
  app.history.pushScoped(`CHAT boolean ${operation}`,structuralHistoryPaths(app,foundItems),()=>{
    const selected=new Set(paths);
    first.parentArray.splice(0,first.parentArray.length,...first.parentArray.filter(object=>!selected.has(object)));
    first.parentArray.splice(Math.max(0,Math.min(insertionIndex,first.parentArray.length)),0,...created);
  });
  finishStructuralMutation(app);
  const refs=created.map(object=>({pageId:app.page().id,layerId:first.layer.id,objectId:object.id}));
  return {createdRefs:refs,resultRefs:refs,operation,sourceObjectIds:paths.map(path=>path.id)};
}
function executeGroupTask(app,task){
  const foundItems=task.targets.map(ref=>findPageObject(app.page(),ref)),first=assertSameStructuralParent(foundItems,task.operation),objects=foundItems.map(found=>found.object);
  const indexes=foundItems.map(found=>first.parentArray.indexOf(found.object)),insertionIndex=Math.min(...indexes),group=createVectorGroup(objects,{name:task.arguments.name});
  if(first.parentObject?.id)group.parentId=first.parentObject.id;for(const child of group.children)child.parentId=group.id;
  app.history.pushScoped('CHAT create Group',structuralHistoryPaths(app,foundItems),()=>{
    const selected=new Set(objects);
    first.parentArray.splice(0,first.parentArray.length,...first.parentArray.filter(object=>!selected.has(object)));
    first.parentArray.splice(Math.max(0,Math.min(insertionIndex,first.parentArray.length)),0,group);
  });
  finishStructuralMutation(app);
  const ref={pageId:app.page().id,layerId:first.layer.id,objectId:group.id};
  return {createdRefs:[ref],resultRefs:[ref],childObjectIds:group.children.map(child=>child.id)};
}
function executeReparentTask(app,task){
  const found=findPageObject(app.page(),task.targets[0]);if(!found)editFail('TARGET_MISSING');
  app.history.pushScoped('CHAT reparent object',structuralHistoryPaths(app,[found]),()=>{reparentPageObject(app.page(),found.object.id,task.arguments.parentObjectId,{targetLayerId:task.arguments.targetLayerId,index:task.arguments.index});});
  finishStructuralMutation(app);
  const after=findPageObject(app.page(),{layerId:found.layer.id,objectId:found.object.id});if(!after)editFail('TARGET_MISSING',{objectId:found.object.id});
  return {resultRefs:[{pageId:app.page().id,layerId:after.layer.id,objectId:after.object.id}],parentObjectId:task.arguments.parentObjectId};
}
function executeFrameCreateTask(app,task){
  const layer=activeLayer(app);if(!layer)editFail('LAYER_UNAVAILABLE');
  const frame=createFrame({name:task.arguments.name,matrix:Matrix.translate(task.arguments.x,task.arguments.y),width:task.arguments.width,height:task.arguments.height,opacity:task.arguments.opacity});
  if(findPageObject(app.page(),frame.id))editFail('OBJECT_ID_COLLISION',{objectId:frame.id});
  app.history.pushScoped('CHAT create Frame',structuralHistoryPaths(app,[]),()=>{layer.objects.push(frame);});
  finishStructuralMutation(app);
  const ref={pageId:app.page().id,layerId:layer.id,objectId:frame.id};
  return {createdRefs:[ref],resultRefs:[ref],width:frame.width,height:frame.height};
}
function executeScaleTask(app,task){
  const foundItems=task.targets.map(ref=>findPageObject(app.page(),ref));if(!foundItems.length||foundItems.some(found=>!found))editFail('TARGET_MISSING');
  let center=task.arguments.center;
  if(!center){const matrices=foundItems.map(found=>found.worldMatrix||found.object.matrix||Matrix.identity());center={x:matrices.reduce((sum,matrix)=>sum+matrix[4],0)/matrices.length,y:matrices.reduce((sum,matrix)=>sum+matrix[5],0)/matrices.length};}
  const transform=Matrix.around(center.x,center.y,Matrix.scale(task.arguments.sx,task.arguments.sy));
  app.history.pushScoped('CHAT scale objects',structuralHistoryPaths(app,foundItems),()=>{applyWorldTransformBatch(foundItems.map(found=>({found,transform})));});
  finishStructuralMutation(app);return {sx:task.arguments.sx,sy:task.arguments.sy,center};
}
function executeOrderTask(app,task){
  const foundItems=task.targets.map(ref=>findPageObject(app.page(),ref)),first=assertSameStructuralParent(foundItems,task.operation),selected=new Set(foundItems.map(found=>found.object));
  const orderedSelected=first.parentArray.filter(object=>selected.has(object)),kept=first.parentArray.filter(object=>!selected.has(object));
  app.history.pushScoped(task.arguments.action==='front'?'CHAT move to front':'CHAT move to back',structuralHistoryPaths(app,foundItems),()=>{
    first.parentArray.splice(0,first.parentArray.length,...(task.arguments.action==='front'?[...kept,...orderedSelected]:[...orderedSelected,...kept]));
  });
  finishStructuralMutation(app);
  return {resultRefs:orderedSelected.map(object=>({pageId:app.page().id,layerId:first.layer.id,objectId:object.id})),action:task.arguments.action};
}
function repeatDefaultWorldCenter(app,found){
  if(typeof app?.renderer?.objectWorldBounds==='function'){const bounds=app.renderer.objectWorldBounds(found.object,found.parentWorldMatrix);if(bounds&&[bounds.x,bounds.y,bounds.w,bounds.h].every(Number.isFinite))return{x:bounds.x+bounds.w/2,y:bounds.y+bounds.h/2};}
  const matrix=found.worldMatrix||found.object?.matrix||Matrix.identity();return{x:Number(matrix[4])||0,y:Number(matrix[5])||0};
}
function insertRepeatAdjacent(app,source,repeat,label){
  if(source.parentObject?.id)repeat.parentId=source.parentObject.id;const sourceIndex=source.parentArray.indexOf(source.object);
  app.history.pushScoped(label,structuralHistoryPaths(app,[source]),()=>{source.parentArray.splice(sourceIndex+1,0,repeat);});
  finishStructuralMutation(app);const ref={pageId:app.page().id,layerId:source.layer.id,objectId:repeat.id};return{createdRefs:[ref],resultRefs:[ref]};
}
function executeRepeatMirrorTask(app,task){
  const source=findPageObject(app.page(),task.targets[0]);if(!source)editFail('TARGET_MISSING');
  const parentWorld=source.parentWorldMatrix||Matrix.identity(),inverseParentWorld=Matrix.tryInvert(parentWorld);if(!inverseParentWorld)editFail('SINGULAR_TARGET',{objectId:source.object.id});
  const worldCenter=task.arguments.center||repeatDefaultWorldCenter(app,source),nativeCenter=Matrix.point(inverseParentWorld,worldCenter);
  const repeat=createRepeat(source.object,{mode:'mirror',count:2,axis:task.arguments.axis,center:nativeCenter,linked:task.arguments.linked,sourceObjectId:source.object.id});
  const result=insertRepeatAdjacent(app,source,repeat,'CHAT create mirror Repeat');return{...result,sourceObjectId:source.object.id,axis:repeat.axis,center:worldCenter,nativeCenter};
}
function executeRepeatGridTask(app,task){
  const source=findPageObject(app.page(),task.targets[0]);if(!source)editFail('TARGET_MISSING');
  const count=task.arguments.columns*task.arguments.rows,repeat=createRepeat(source.object,{mode:'grid',count,columns:task.arguments.columns,rows:task.arguments.rows,dx:task.arguments.dx,dy:task.arguments.dy,linked:task.arguments.linked,sourceObjectId:source.object.id});
  const result=insertRepeatAdjacent(app,source,repeat,'CHAT create grid Repeat');
  return{...result,sourceObjectId:source.object.id,columns:repeat.columns,rows:repeat.rows,dx:repeat.dx,dy:repeat.dy,count};
}
function executeFrameLayoutTask(app,task,remove=false){
  const found=findPageObject(app.page(),task.targets[0]);if(!found||found.object?.type!=='frame')editFail('FRAME_REQUIRED');
  setFrameLayout(app,found.object.id,remove?null:task.arguments);app.renderer?.render?.();
  return{resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:found.object.id}],layout:clone(found.object.layout??null)};
}
function executeLayoutItemTask(app,task,remove=false){
  const found=findPageObject(app.page(),task.targets[0]);if(!found)editFail('TARGET_MISSING');if(!found.parentObject||found.parentObject.type!=='frame')editFail('LAYOUT_ITEM_FRAME_PARENT_REQUIRED');
  setChildLayoutItem(app,found.object.id,remove?null:task.arguments);app.renderer?.render?.();
  return{resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:found.object.id}],layoutItem:clone(found.object.layoutItem??null)};
}
function documentObjectRef(app,objectId){for(const page of app.doc?.pages||[]){const found=findPageObject(page,objectId);if(found)return{pageId:page.id,layerId:found.layer.id,objectId:found.object.id};}return null;}
function executeComponentRegisterTask(app,task){
  const found=findPageObject(app.page(),task.targets[0]);if(!found)editFail('TARGET_MISSING');const definition=registerComponentDefinition(app,found.object.id,task.arguments.name);app.renderer?.render?.();
  return{resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:found.object.id}],definitionId:definition.id,sourceRootId:definition.sourceRootId,name:definition.name};
}
function executeComponentInstanceCreateTask(app,task){
  if(task.arguments.pageId!==app.page().id)editFail('ACTIVE_PAGE_REQUIRED',{pageId:task.arguments.pageId});
  const placement={pageId:task.arguments.pageId,layerId:task.arguments.layerId,...(task.arguments.parentId?{parentId:task.arguments.parentId}:{}),...(task.arguments.matrix?{matrix:task.arguments.matrix}:{})};
  const instance=createComponentInstance(app,task.arguments.definitionId,placement),ref=documentObjectRef(app,instance.id);if(!ref)editFail('TARGET_MISSING',{objectId:instance.id});app.renderer?.render?.();
  return{createdRefs:[ref],resultRefs:[ref],definitionId:instance.definitionId};
}
function executeComponentOverrideTask(app,task,reset=false){
  const found=findPageObject(app.page(),task.targets[0]);if(!found||found.object?.type!=='component-instance')editFail('COMPONENT_INSTANCE_REQUIRED');
  const result=setComponentOverride(app,found.object.id,task.arguments.sourceNodeId,reset?null:task.arguments.opacity);app.renderer?.render?.();
  return{resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:found.object.id}],sourceNodeId:task.arguments.sourceNodeId,opacity:reset?null:task.arguments.opacity,overrides:clone(result.overrides||{})};
}
function executeComponentDetachTask(app,task){
  const found=findPageObject(app.page(),task.targets[0]);if(!found||found.object?.type!=='component-instance')editFail('COMPONENT_INSTANCE_REQUIRED');
  const detachedFrom=found.object.id,ordinary=detachComponentInstance(app,detachedFrom),ref=documentObjectRef(app,ordinary.id);if(!ref)editFail('TARGET_MISSING',{objectId:ordinary.id});app.renderer?.render?.();
  return{createdRefs:[ref],resultRefs:[ref],detachedFrom,detachedObjectId:ordinary.id,detachedType:ordinary.type};
}
function executeComponentDefinitionDuplicateTask(app,task){
  const definition=duplicateComponentDefinition(app,task.arguments.definitionId,task.arguments.name),sourceRef=documentObjectRef(app,definition.sourceRootId);if(!sourceRef)editFail('TARGET_MISSING',{objectId:definition.sourceRootId});app.renderer?.render?.();
  return{createdRefs:[sourceRef],resultRefs:[sourceRef],definitionId:definition.id,sourceRootId:definition.sourceRootId,name:definition.name};
}
function executeComponentReferenceRepairTask(app,task){
  const found=findPageObject(app.page(),task.targets[0]);if(!found||found.object?.type!=='component-instance')editFail('COMPONENT_INSTANCE_REQUIRED');
  const instance=repairComponentReference(app,found.object.id,task.arguments.definitionId);app.renderer?.render?.();
  return{resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:found.object.id}],definitionId:instance.definitionId};
}

export function executeStructureRepeatLayoutComponentsOperation(app,task){
  if(task.operation==='object.clone.v1')return executeCloneTask(app,task);
  if(task.operation==='repeat.radial.v1')return executeRepeatRadialTask(app,task);
  if(task.operation==='boolean.apply.v1')return executeBooleanTask(app,task);
  if(task.operation==='group.create.v1')return executeGroupTask(app,task);
  if(task.operation==='object.reparent.v1')return executeReparentTask(app,task);
  if(task.operation==='frame.create.v1')return executeFrameCreateTask(app,task);
  if(task.operation==='object.scale.v1')return executeScaleTask(app,task);
  if(task.operation==='object.order.v1')return executeOrderTask(app,task);
  if(task.operation==='repeat.mirror.v1')return executeRepeatMirrorTask(app,task);
  if(task.operation==='repeat.grid.v1')return executeRepeatGridTask(app,task);
  if(task.operation==='layout.frame.set.v1')return executeFrameLayoutTask(app,task,false);
  if(task.operation==='layout.frame.remove.v1')return executeFrameLayoutTask(app,task,true);
  if(task.operation==='layout.item.set.v1')return executeLayoutItemTask(app,task,false);
  if(task.operation==='layout.item.remove.v1')return executeLayoutItemTask(app,task,true);
  if(task.operation==='component.register.v1')return executeComponentRegisterTask(app,task);
  if(task.operation==='component.instance.create.v1')return executeComponentInstanceCreateTask(app,task);
  if(task.operation==='component.override.set.v1')return executeComponentOverrideTask(app,task,false);
  if(task.operation==='component.override.reset.v1')return executeComponentOverrideTask(app,task,true);
  if(task.operation==='component.instance.detach.v1')return executeComponentDetachTask(app,task);
  if(task.operation==='component.definition.duplicate.v1')return executeComponentDefinitionDuplicateTask(app,task);
  if(task.operation==='component.reference.repair.v1')return executeComponentReferenceRepairTask(app,task);
  editFail('OPERATION_NOT_ALLOWED',{operation:task.operation});
}
