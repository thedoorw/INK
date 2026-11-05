import { walkPageObjects } from '../document/hierarchy.js';
import { createMaterialInstance, createMaterialTemplate } from '../material/material-library.js';
import { chatObjectRef, editFail, structuralHistoryPaths } from './creative-operation-shared.js';

function executeMaterialTemplateCreateTask(app,task){
  let created=null;
  app.history.pushScoped('CHAT create Material template',[['materialLibrary']],()=>{created=createMaterialTemplate(app.doc,task.arguments.template,{replace:false});});
  app.refreshAll?.();app.renderer?.render?.();
  return {changed:true,template:{templateId:created.templateId,templateVersion:created.templateVersion,materialType:created.materialType,semanticRole:created.semanticRole}};
}
function executeMaterialInstanceCreateTask(app,task){
  let created=null;
  app.history.pushScoped('CHAT create Material instance',structuralHistoryPaths(app,[]),()=>{
    created=createMaterialInstance(app.doc,task.arguments.templateId,{
      instanceId:task.arguments.instanceId,instanceKey:task.arguments.instanceKey,name:task.arguments.name,
      parameterOverrides:task.arguments.parameterOverrides,transform:task.arguments.transform,
      layerId:task.arguments.layerId,semanticRole:task.arguments.semanticRole
    });
  });
  app.spatialDirty=true;app.refreshAll?.();app.renderer?.render?.();
  const found=walkPageObjects(app.page()).find(item=>item.object?.id===created?.id)||null;
  return {changed:true,instanceId:created?.id||null,templateId:task.arguments.templateId,templateVersion:task.arguments.templateVersion,resultRefs:found?[chatObjectRef(app.page().id,found)]:[]};
}
function executeAppearanceTask(app,task){
  const controller=app.pathRepaintMaterial;
  if(!controller)editFail('CONTROLLER_UNAVAILABLE',{operation:task.operation});
  const refs=task.targets.map(ref=>({layerId:ref.layerId,objectId:ref.objectId}));
  if(task.operation==='path.repaint.v1')return controller.repaint(task.arguments,{refs,label:'CHAT repaint Path'});
  if(task.operation==='path.material.apply.v1')return controller.applyMaterial(task.arguments,{refs,label:'CHAT apply Path material'});
  if(task.operation==='path.material.remove.v1')return controller.removeMaterial({refs,label:'CHAT remove Path material'});
  editFail('OPERATION_NOT_ALLOWED',{operation:task.operation});
}
export function executeMaterialsAppearanceOperation(app,task){
  if(task.operation==='material.template.create.v1')return executeMaterialTemplateCreateTask(app,task);
  if(task.operation==='material.instance.create.v1')return executeMaterialInstanceCreateTask(app,task);
  if(task.operation==='path.repaint.v1'||task.operation==='path.material.apply.v1'||task.operation==='path.material.remove.v1')return executeAppearanceTask(app,task);
  editFail('OPERATION_NOT_ALLOWED',{operation:task.operation});
}
