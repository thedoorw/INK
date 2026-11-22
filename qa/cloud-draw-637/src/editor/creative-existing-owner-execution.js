import { Matrix } from '../core/index.js';
import { findPageObject } from '../document/hierarchy.js';
import { applyWorldTransformBatch } from './transform.js';
import { resizeFrameGeometry } from './bounds.js';
import { paperProfileFingerprint } from '../render/paper-profile.js';
import { artboardFingerprint, clone, editFail, finishStructuralMutation, structuralHistoryPaths } from './creative-operation-shared.js';

function executeTranslateTask(app,task){
  const page=app.page();if(!page?.id)editFail('PAGE_MISSING');
  if(task.targets.some(ref=>ref.pageId!==page.id))editFail('TARGET_PAGE_MISMATCH',{activePageId:page.id});
  const foundItems=task.targets.map(ref=>findPageObject(page,ref));
  if(!foundItems.length||foundItems.some(found=>!found))editFail('TARGET_MISSING');
  const transform=Matrix.translate(task.arguments.dx,task.arguments.dy);
  app.history.pushScoped('CHAT translate objects',structuralHistoryPaths(app,foundItems),()=>{applyWorldTransformBatch(foundItems.map(found=>({found,transform})));});
  finishStructuralMutation(app);
  return{dx:task.arguments.dx,dy:task.arguments.dy,resultRefs:task.targets.map(clone)};
}
function executeRotateTask(app,task){
  const foundItems=task.targets.map(ref=>findPageObject(app.page(),ref));if(foundItems.some(found=>!found))editFail('TARGET_MISSING');
  let center=task.arguments.center;
  if(!center){const translations=foundItems.map(found=>found.worldMatrix||found.object.matrix||Matrix.identity());center={x:translations.reduce((sum,matrix)=>sum+matrix[4],0)/translations.length,y:translations.reduce((sum,matrix)=>sum+matrix[5],0)/translations.length};}
  const radians=task.arguments.degrees*Math.PI/180,transform=Matrix.around(center.x,center.y,Matrix.rotate(radians));
  app.history.pushScoped('CHAT rotate objects',structuralHistoryPaths(app,foundItems),()=>{applyWorldTransformBatch(foundItems.map(found=>({found,transform})));});
  finishStructuralMutation(app);return{degrees:task.arguments.degrees,center};
}
function executeResizeTask(app,task){
  const found=findPageObject(app.page(),task.targets[0]);if(!found)editFail('TARGET_MISSING');const args=task.arguments;
  if(found.object.type==='frame'){
    app.history.pushScoped('CHAT resize Frame',structuralHistoryPaths(app,[found]),()=>{if(!resizeFrameGeometry(found.object,{width:args.width,height:args.height,preserveAspect:args.preserveAspect}))editFail('RESIZE_INVALID');});
    finishStructuralMutation(app);return{resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:found.object.id}],width:found.object.width,height:found.object.height};
  }
  if(typeof app?.renderer?.objectWorldBounds!=='function')editFail('BOUNDS_AUTHORITY_UNAVAILABLE');
  const bounds=app.renderer.objectWorldBounds(found.object,found.parentWorldMatrix);
  if(!bounds||!Number.isFinite(bounds.w)||!Number.isFinite(bounds.h)||bounds.w<=0||bounds.h<=0)editFail('BOUNDS_INVALID');
  let sx=args.width==null?1:args.width/bounds.w,sy=args.height==null?1:args.height/bounds.h;
  if(args.preserveAspect&&args.width!=null&&args.height==null)sy=sx;if(args.preserveAspect&&args.height!=null&&args.width==null)sx=sy;
  if(!Number.isFinite(sx)||!Number.isFinite(sy)||Math.abs(sx)<1e-6||Math.abs(sy)<1e-6)editFail('SINGULAR_SCALE');
  const transform=Matrix.around(bounds.x,bounds.y,Matrix.scale(sx,sy));
  app.history.pushScoped('CHAT resize object',structuralHistoryPaths(app,[found]),()=>{applyWorldTransformBatch([{found,transform}]);});
  finishStructuralMutation(app);
  return{resultRefs:[{pageId:app.page().id,layerId:found.layer.id,objectId:found.object.id}],width:args.width,height:args.height,preserveAspect:args.preserveAspect};
}
function executeObjectAlignTask(app,task){
  const mode=task.arguments.mode,distribution=mode==='distributeX'||mode==='distributeY';
  if(distribution&&task.targets.length<3)editFail('TARGET_COUNT_INVALID',{expectedMinimum:3,actual:task.targets.length,mode});
  const page=app.page();if(!page?.id)editFail('PAGE_MISSING');if(task.targets.some(ref=>ref.pageId!==page.id))editFail('TARGET_PAGE_MISMATCH',{activePageId:page.id});
  const foundItems=task.targets.map(ref=>findPageObject(page,ref));if(!foundItems.length||foundItems.some(found=>!found))editFail('TARGET_MISSING');
  const items=foundItems.map((found,index)=>{const bounds=app.renderer?.objectWorldBounds?.(found.object,found.parentWorldMatrix);if(!bounds)editFail('BOUNDS_AUTHORITY_UNAVAILABLE');return{found,ref:clone(task.targets[index]),b:clone(bounds),matrix:clone(found.object?.matrix||null)};});
  const union=items.reduce((bounds,item)=>{if(!bounds)return clone(item.b);const x1=Math.min(bounds.x,item.b.x),y1=Math.min(bounds.y,item.b.y),x2=Math.max(bounds.x+bounds.w,item.b.x+item.b.w),y2=Math.max(bounds.y+bounds.h,item.b.y+item.b.h);return{x:x1,y:y1,w:x2-x1,h:y2-y1};},null);
  app.history.pushScoped('CHAT align objects',structuralHistoryPaths(app,foundItems),()=>{
    const plans=[];
    if(distribution){
      const horizontal=mode==='distributeX',sorted=[...items].sort((a,b)=>horizontal?a.b.x-b.b.x:a.b.y-b.b.y),first=sorted[0].b,last=sorted.at(-1).b,totalSize=sorted.reduce((sum,item)=>sum+(horizontal?item.b.w:item.b.h),0),span=horizontal?last.x+last.w-first.x:last.y+last.h-first.y,gap=(span-totalSize)/(sorted.length-1);let cursor=horizontal?first.x:first.y;
      for(const item of sorted){const current=horizontal?item.b.x:item.b.y,delta=cursor-current;plans.push({found:item.found,transform:Matrix.translate(horizontal?delta:0,horizontal?0:delta)});cursor+=(horizontal?item.b.w:item.b.h)+gap;}
    }else{
      for(const item of items){let dx=0,dy=0;if(mode==='left')dx=union.x-item.b.x;else if(mode==='centerX')dx=union.x+union.w/2-(item.b.x+item.b.w/2);else if(mode==='right')dx=union.x+union.w-(item.b.x+item.b.w);else if(mode==='top')dy=union.y-item.b.y;else if(mode==='centerY')dy=union.y+union.h/2-(item.b.y+item.b.h/2);else if(mode==='bottom')dy=union.y+union.h-(item.b.y+item.b.h);plans.push({found:item.found,transform:Matrix.translate(dx,dy)});}
    }
    applyWorldTransformBatch(plans);
  });
  finishStructuralMutation(app);
  const after=task.targets.map(ref=>{const found=findPageObject(app.page(),ref);return{ref:clone(ref),matrix:clone(found?.object?.matrix||null),bounds:found?clone(app.renderer?.objectWorldBounds?.(found.object,found.parentWorldMatrix)||null):null};});
  const changedRefs=items.filter((item,index)=>JSON.stringify(item.matrix)!==JSON.stringify(after[index]?.matrix)).map(item=>clone(item.ref));
  return{changed:changedRefs.length>0,mode,targetCount:task.targets.length,changedTargetCount:changedRefs.length,changedRefs,resultRefs:task.targets.map(clone),beforeBounds:items.map(item=>({ref:item.ref,bounds:item.b})),afterBounds:after.map(item=>({ref:item.ref,bounds:item.bounds}))};
}
export function executeSelectionTransformTargetOperation(app,task){
  if(task.operation==='object.translate.v1')return executeTranslateTask(app,task);
  if(task.operation==='object.align.v1')return executeObjectAlignTask(app,task);
  if(task.operation==='object.resize.v1')return executeResizeTask(app,task);
  if(task.operation==='object.rotate.v1')return executeRotateTask(app,task);
  editFail('OPERATION_NOT_ALLOWED',{operation:task.operation});
}
export function executePageSurfaceOperation(app,task){
  if(task.operation==='page.paper.set.v1'){
    app.changePaper(task.arguments.key,task.arguments.value);
    return{pageId:app.page().id,paper:clone(app.page().paper),paperProfileFingerprint:paperProfileFingerprint(app.page().paper)};
  }
  if(task.operation==='page.artboard.set.v1'){
    const page=app.page(),before=clone(page.artboard);app.changeArtboard(task.arguments.key,task.arguments.value);
    return{changed:true,pageId:page.id,key:task.arguments.key,value:clone(page.artboard?.[task.arguments.key]),before,artboard:clone(page.artboard),artboardFingerprint:artboardFingerprint(page)};
  }
  editFail('OPERATION_NOT_ALLOWED',{operation:task.operation});
}
