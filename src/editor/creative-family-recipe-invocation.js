import { findPageObject, walkPageObjects } from '../document/hierarchy.js';
import { chatObjectRef, clone, editFail } from './creative-operation-shared.js';

function compactRecipeReceipt(report){
  if(!report)return null;
  return {
    format:report.format||null,version:report.version??null,id:report.id||null,
    recipeId:report.recipeId||null,recipeVersion:report.recipeVersion??null,status:report.status||null,
    input:clone(report.input||null),warnings:clone(report.warnings||[]),errors:clone(report.errors||[]),
    states:clone(report.states||[]),
    checkpoints:(report.checkpoints||[]).map(item=>({step:item.step??null,hash:item.hash||null})),
    result:clone(report.result||null),replayDiff:clone(report.replayDiff||null),rolledBack:Boolean(report.rolledBack)
  };
}
function executeStudioRecipeTask(app,task){
  const engine=app?.studio?.engine;
  const recipe=engine.describe(task.arguments.recipeId);
  const page=app.page();
  const resolved=task.targets.map((ref,index)=>{
    const found=findPageObject(page,ref);
    if(!found||found.object?.type!=='path')editFail('PATH_REQUIRED',{objectId:ref.objectId});
    const role=task.arguments.roles[index];
    return {id:found.object.id,role,path:found.object,metadata:{...(clone(found.object.metadata||{})),role}};
  });
  if(!app.history?.begin?.(`CHAT Recipe · ${recipe.name||recipe.id}`))editFail('HISTORY_BUSY');
  try{
    const report=engine.execute(task.arguments.recipeId,{document:app.doc,inputs:resolved,parameters:task.arguments.parameters});
    const committed=app.history.commit();
    if(!committed||report?.replayDiff?.changed!==true)editFail('NO_OP');
    app.spatialDirty=true;app.refreshAll?.();app.renderer?.render?.();
    const resultRefs=task.targets.map(ref=>{
      const found=walkPageObjects(app.page()).find(item=>item.object?.id===ref.objectId);
      return found?chatObjectRef(app.page().id,found):null;
    }).filter(Boolean);
    return {
      changed:true,recipeId:recipe.id,recipeVersion:String(recipe.version),
      executionReceipt:compactRecipeReceipt(report),replayReceipt:compactRecipeReceipt(engine.replayReport(report.id)),resultRefs
    };
  }catch(error){
    if(app.history?.pending)app.history.cancel({restore:false});
    throw error;
  }
}
export function executeRecipeInvocationOperation(app,task){
  if(task.operation==='recipe.studio.execute.v1')return executeStudioRecipeTask(app,task);
  editFail('OPERATION_NOT_ALLOWED',{operation:task.operation});
}
