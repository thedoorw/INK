import { executeSelectionTransformTargetOperation, executePageSurfaceOperation } from '../creative-existing-owner-execution.js';
import { executeVectorPathStrokeOperation } from '../creative-family-vector-path-stroke.js';
import { executeStructureRepeatLayoutComponentsOperation } from '../creative-family-structure-repeat-layout-components.js';
import { executeTextSvgOperation } from '../creative-family-text-svg.js';
import { executeRasterImageOperation } from '../creative-family-raster-image.js';
import { executeMaterialsAppearanceOperation } from '../creative-family-materials-appearance.js';
import { executeRecipeInvocationOperation } from '../creative-family-recipe-invocation.js';
import { createUiB002DocumentAdapter } from './ui-b-002-document-adapter.js';
import { VIEW_ZOOM_CONTRACT } from '../../document/workspace.js';
import { thumbnailPreviewGeometry } from '../../document/artboard.js';
import { applyArtworkResize, applyCanvasSize, applyOutputPpi } from '../../document/size.js';

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const finite=value=>Number.isFinite(Number(value));
const safeName=value=>String(value||'INK').replace(/[\\/:*?"<>|]+/g,'_').trim()||'INK';

function activePage(app){return app?.page?.()||app?.doc?.pages?.find(page=>page.id===app?.doc?.activePageId)||null;}
function layerById(app,id){return activePage(app)?.layers?.find(layer=>layer.id===id)||null;}
function activeLayer(app){const page=activePage(app);return layerById(app,page?.activeLayerId);}
function requirePage(app,id){const page=app?.doc?.pages?.find(item=>item.id===id);if(!page)throw Object.assign(new Error('Page not found'),{code:'TARGET_NOT_FOUND'});return page;}
function requireLayer(app,id){const layer=layerById(app,id);if(!layer)throw Object.assign(new Error('Layer not found'),{code:'TARGET_NOT_FOUND'});return layer;}
function historySummary(app){
  const history=app?.history;
  if(!history)return{applied:0,retainedCount:0,limit:0,canUndo:false,canRedo:false,entries:[]};
  const timeline=typeof history.timeline==='function'?history.timeline():{entries:[...(history.undoStack||[]),...[...(history.redoStack||[])].reverse()],applied:history.undoStack?.length||0,limit:history.limit||0};
  return{applied:timeline.applied,retainedCount:timeline.entries?.length||0,limit:timeline.limit,canUndo:Boolean(history.undoStack?.length),canRedo:Boolean(history.redoStack?.length),entries:(timeline.entries||[]).map((entry,index)=>({index,label:entry.label||'變更',applied:index<timeline.applied,patchCount:entry.patchCount??null,captureMode:entry.captureMode||null}))};
}
function mutateScoped(app,label,targets,operation){if(app.history?.pending){operation();return{joined:true};}app.history.pushScoped(label,targets,operation);return{joined:false};}
function assertPageCurrent(app,pageAtStart){
  const current=activePage(app),idAtStart=pageAtStart?.id??null;
  if(current!==pageAtStart||(idAtStart!=null&&current?.id!==idAtStart))throw Object.assign(new Error('Page changed during asynchronous command'),{code:'STALE_PAGE'});
  return true;
}

export function createNativeFunctionServicePorts(app){
  if(!app)throw new TypeError('INK native function service ports require app');
  const uiB002Document=createUiB002DocumentAdapter(app);
  return Object.freeze({
    historyControl:Object.freeze({
      undo:()=>({changed:Boolean(app.history?.undo?.()),result:{history:historySummary(app)}}),
      redo:()=>({changed:Boolean(app.history?.redo?.()),result:{history:historySummary(app)}}),
      jump:applied=>({changed:Boolean(app.history?.jumpTo?.(Number(applied))),result:{history:historySummary(app)}}),
      summary:()=>historySummary(app)
    }),
    documentIO:Object.freeze({
      current:()=>({id:app?.doc?.id||null,title:app?.doc?.title||'未命名作品',modifiedAt:app?.doc?.modifiedAt||null,open:Boolean(app?.documentOpen),dirty:Boolean(app?.dirty)}),
      newDocument:(args,execution)=>uiB002Document.newDocument(args,execution),
      open:async(file,execution)=>{
        execution?.assertDocumentCurrent?.();
        const opened=await app.openProjectFile?.(file,execution);
        if(opened===false)throw Object.assign(new Error('Project open failed'),{code:'COMMAND_FAILED'});
        return{changed:true,result:{documentId:app.doc?.id||null,title:app.doc?.title||null}};
      },
      save:async execution=>{
        execution?.assertDocumentCurrent?.();
        const saved=await app.saveProject?.(execution);
        if(saved===false)throw Object.assign(new Error('Project save failed'),{code:'COMMAND_FAILED'});
        execution?.assertDocumentCurrent?.();
        return{changed:false,result:{saved:true}};
      },
      exportPNG:async(args={},execution)=>{
        execution?.assertDocumentCurrent?.();
        const pageAtStart=activePage(app);
        if(!pageAtStart)throw Object.assign(new Error('Page unavailable'),{code:'CAPABILITY_UNAVAILABLE'});
        const outputName=`${safeName(app.doc?.title)}-${safeName(pageAtStart.name)}.png`;
        const options={scope:'artboard',ppi:pageAtStart.artboard?.ppi||300,background:true,...(args.options||{})};
        const blob=await app.exportPNG?.(options);
        if(!blob)throw Object.assign(new Error('PNG export unavailable'),{code:'CAPABILITY_UNAVAILABLE'});
        execution?.assertDocumentCurrent?.();
        assertPageCurrent(app,pageAtStart);
        if(args.download!==false)app.download?.(blob,outputName);
        return{changed:false,result:{type:'image/png',bytes:blob.size||null}};
      }
    }),
    pageLayout:Object.freeze({
      active:()=>{const page=activePage(app);return page?{id:page.id,name:page.name,activeLayerId:page.activeLayerId,artboard:page.artboard,paper:page.paper,camera:page.camera,workspace:page.workspace,guides:clone(page.guides||[])}:null;},
      preview:(width=220,height=150)=>{const page=activePage(app);if(!page)return null;const w=Math.max(48,Math.min(512,Math.round(Number(width)||220))),h=Math.max(36,Math.min(384,Math.round(Number(height)||150))),geometry=thumbnailPreviewGeometry(page,w,h,7),layoutMatrix=app.renderer?.layoutViewportMatrix?.(page),dataUrl=app.renderer?.renderThumbnail?.(page,w,h);return dataUrl&&Array.isArray(layoutMatrix)?{pageId:page.id,...geometry,layoutMatrix:clone(layoutMatrix),dataUrl}:null;},
      byId:id=>clone(app?.doc?.pages?.find(item=>item.id===id)||null),
      list:()=>clone((app?.doc?.pages||[]).map(item=>({id:item.id,name:item.name,active:item.id===app?.doc?.activePageId,layerCount:item.layers?.length||0,objectCount:(item.layers||[]).reduce((sum,current)=>sum+(current.objects?.length||0),0)}))),
      requirePage:id=>requirePage(app,id),
      create:()=>{
        const before=new Set((app.doc?.pages||[]).map(page=>page.id));app.addPage?.();
        const created=(app.doc?.pages||[]).find(page=>!before.has(page.id))||activePage(app);
        return{changed:true,result:{pageId:created?.id||null,createdPageIds:created?.id?[created.id]:[],activePageId:app.doc?.activePageId||null,page:created?{id:created.id,name:created.name||null}:null}};
      },
      duplicate:id=>{
        requirePage(app,id);const before=new Set((app.doc?.pages||[]).map(page=>page.id));app.duplicatePage?.(id);
        const created=(app.doc?.pages||[]).find(page=>!before.has(page.id));
        if(!created)throw Object.assign(new Error('Page duplicate failed'),{code:'COMMAND_FAILED'});
        return{changed:true,result:{sourcePageId:id,pageId:created.id,createdPageIds:[created.id],activePageId:app.doc?.activePageId||null,page:{id:created.id,name:created.name||null}}};
      },
      delete:id=>{
        const target=requirePage(app,id);if((app.doc?.pages||[]).length<=1)throw Object.assign(new Error('Minimum page required'),{code:'CAPABILITY_UNAVAILABLE'});
        const deletedPage={id:target.id,name:target.name||null};app.deletePage?.(id);
        return{changed:true,result:{deletedPageId:id,deletedPage,activePageId:app.doc?.activePageId||null}};
      },
      activate:id=>{
        requirePage(app,id);if(app.doc?.activePageId===id)throw Object.assign(new Error('Already active'),{code:'NO_OP'});
        app.switchPage?.(id);return{changed:true,result:{pageId:id,activePageId:app.doc?.activePageId||null,historyEntryCreated:false}};
      },
      rename:(id,name)=>{
        const page=requirePage(app,id),oldName=page.name||null,next=String(name||'').trim();
        if(!next)throw Object.assign(new Error('Name required'),{code:'ARGUMENTS_INVALID'});
        if(page.name===next)throw Object.assign(new Error('No change'),{code:'NO_OP'});
        mutateScoped(app,'重新命名頁面',[app.pagePath(page)],()=>{page.name=next;});app.refreshAll?.();
        return{changed:true,result:{pageId:page.id,oldName,name:page.name,activePageId:app.doc?.activePageId||null}};
      },
      guideAdd:args=>{const guide=app.addGuide?.(args);return{changed:true,result:{pageId:activePage(app)?.id,guide:clone(guide),guides:clone(activePage(app)?.guides||[])}};},
      guideMove:(id,position)=>{app.moveGuide?.(id,position);return{changed:true,result:{pageId:activePage(app)?.id,guideId:id,guides:clone(activePage(app)?.guides||[])}};},
      guideRemove:id=>{app.removeGuide?.(id);return{changed:true,result:{pageId:activePage(app)?.id,guideId:id,guides:clone(activePage(app)?.guides||[])}};},
      guideLock:(id,locked)=>{app.setGuideLocked?.(id,locked);return{changed:true,result:{pageId:activePage(app)?.id,guideId:id,guides:clone(activePage(app)?.guides||[])}};},
      guideVisibility:(id,visible)=>{app.setGuideVisible?.(id,visible);return{changed:true,result:{pageId:activePage(app)?.id,guideId:id,guides:clone(activePage(app)?.guides||[])}};},
      snap:(key,value)=>{const snap=key==='enabled'?app.setSnapEnabledState?.(value):app.setSnapCategoryState?.(key,value);return{changed:true,result:{pageId:activePage(app)?.id,snap:clone(snap)}};},
      paper:(key,value)=>executePageSurfaceOperation(app,{operation:'page.paper.set.v1',arguments:{key,value},targets:[]}),
      artboard:(key,value)=>executePageSurfaceOperation(app,{operation:'page.artboard.set.v1',arguments:{key,value},targets:[]}),
      canvasResize:(args,execution)=>applyCanvasSize(app,args,execution),
      outputPpi:(args,execution)=>applyOutputPpi(app,args,execution),
      artworkResize:(args,execution)=>applyArtworkResize(app,args,execution)
    }),
    layerManagement:Object.freeze({
      active:()=>{const layer=activeLayer(app);return layer?{id:layer.id,name:layer.name,opacity:layer.opacity,visible:layer.visible!==false,locked:Boolean(layer.locked),objectCount:layer.objects?.length||0}:null;},
      list:()=>{const page=activePage(app);return clone((page?.layers||[]).map(item=>({id:item.id,name:item.name,opacity:item.opacity,visible:item.visible!==false,locked:Boolean(item.locked),active:item.id===page?.activeLayerId,objectCount:item.objects?.length||0})));},
      requireLayer:id=>requireLayer(app,id),
      activate:id=>{requireLayer(app,id);const page=activePage(app),changed=page.activeLayerId!==id;page.activeLayerId=id;app.refreshLayers?.();return{changed,result:{layerId:id}};},
      create:()=>{const before=new Set((activePage(app)?.layers||[]).map(layer=>layer.id));app.addLayer?.();const created=(activePage(app)?.layers||[]).find(layer=>!before.has(layer.id))||activeLayer(app);return{changed:true,result:{layerId:created?.id||null}};},
      duplicate:id=>{if(id&&activePage(app)?.activeLayerId!==id){requireLayer(app,id);activePage(app).activeLayerId=id;}const before=new Set((activePage(app)?.layers||[]).map(layer=>layer.id));app.duplicateLayer?.();const created=(activePage(app)?.layers||[]).find(layer=>!before.has(layer.id));return{changed:Boolean(created),result:{layerId:created?.id||null}};},
      delete:id=>{if((activePage(app)?.layers||[]).length<=1)throw Object.assign(new Error('Minimum layer required'),{code:'CAPABILITY_UNAVAILABLE'});if(id)requireLayer(app,id);if(id)activePage(app).activeLayerId=id;const deleted=activeLayer(app)?.id||null;app.deleteLayer?.();return{changed:true,result:{deletedLayerId:deleted,activeLayerId:activePage(app)?.activeLayerId||null}};},
      reorder:(sourceId,targetId,position='before')=>{requireLayer(app,sourceId);requireLayer(app,targetId);return{changed:Boolean(app.reorderLayer?.(sourceId,targetId,position)),result:{sourceId,targetId,position}};},
      opacity:(id,opacity)=>{const layer=requireLayer(app,id),value=Number(opacity);if(!finite(value)||value<0||value>1)throw Object.assign(new Error('Opacity out of range'),{code:'ARGUMENTS_INVALID'});if(layer.opacity===value)return{changed:false,result:{layerId:layer.id,opacity:value}};mutateScoped(app,'調整圖層透明度',[app.layerPath(layer)],()=>{layer.opacity=value;});app.refreshLayers?.();app.renderer?.render?.();return{changed:true,result:{layerId:layer.id,opacity:value}};},
      visibility:(id,visible)=>{const layer=requireLayer(app,id),value=Boolean(visible);if((layer.visible!==false)===value)return{changed:false,result:{layerId:layer.id,visible:value}};mutateScoped(app,value?'顯示圖層':'隱藏圖層',[app.layerPath(layer)],()=>{layer.visible=value;});app.spatialDirty=true;app.refreshLayers?.();app.renderer?.render?.();return{changed:true,result:{layerId:layer.id,visible:value}};},
      lock:(id,locked)=>{const layer=requireLayer(app,id),value=Boolean(locked);if(Boolean(layer.locked)===value)return{changed:false,result:{layerId:layer.id,locked:value}};mutateScoped(app,value?'鎖定圖層':'解除圖層鎖定',[app.layerPath(layer)],()=>{layer.locked=value;});app.spatialDirty=true;app.refreshLayers?.();return{changed:true,result:{layerId:layer.id,locked:value}};}
    }),
    selectionTransform:Object.freeze({
      current:()=>clone(app?.selection||[]),
      clear:()=>{const changed=Boolean(app.selection?.length);app.clearSelection?.();return{changed,result:{selection:clone(app.selection||[])}};},
      delete:()=>{const changed=Boolean(app.selection?.length);app.deleteSelection?.();return{changed,result:{selection:clone(app.selection||[])}};},
      duplicate:offset=>{const changed=Boolean(app.selection?.length);app.duplicateSelection?.(offset??18);return{changed,result:{selection:clone(app.selection||[])}};},
      translate:(dx,dy,targetRefs)=>{if(Array.isArray(targetRefs)&&targetRefs.length)return executeSelectionTransformTargetOperation(app,{operation:'object.translate.v1',arguments:{dx:Number(dx),dy:Number(dy)},targets:clone(targetRefs)});const x=Number(dx),y=Number(dy);if(!finite(x)||!finite(y))throw Object.assign(new Error('dx/dy required'),{code:'ARGUMENTS_INVALID'});const changed=Boolean(app.selection?.length)&&(x!==0||y!==0);app.translateSelection?.(x,y);return{changed,result:{selection:clone(app.selection||[])}};},
      align:(mode,targetRefs)=>{if(Array.isArray(targetRefs)&&targetRefs.length)return executeSelectionTransformTargetOperation(app,{operation:'object.align.v1',arguments:{mode},targets:clone(targetRefs)});const changed=(app.selection?.length||0)>1;app.alignSelection?.(mode);return{changed,result:{mode,selection:clone(app.selection||[])}};},
      resize:(width,height,preserveAspect,targetRefs)=>{if(Array.isArray(targetRefs)&&targetRefs.length)return executeSelectionTransformTargetOperation(app,{operation:'object.resize.v1',arguments:{width,height,preserveAspect:Boolean(preserveAspect)},targets:clone(targetRefs)});if(finite(width))app.applyTransformField?.('w',Number(width));if(finite(height))app.applyTransformField?.('h',Number(height));return{changed:true,result:{selection:clone(app.selection||[])}};},
      rotate:(degrees,center,targetRefs)=>{if(Array.isArray(targetRefs)&&targetRefs.length)return executeSelectionTransformTargetOperation(app,{operation:'object.rotate.v1',arguments:{degrees:Number(degrees),center:center||null},targets:clone(targetRefs)});app.applyTransformField?.('r',Number(degrees));return{changed:true,result:{selection:clone(app.selection||[])}};}
    }),
    vectorPathStroke:Object.freeze({execute:(operation,args={},targetRefs=[])=>executeVectorPathStrokeOperation(app,{operation,arguments:args||{},targets:Array.isArray(targetRefs)?clone(targetRefs):[]})}),
    structureRepeatLayoutComponents:Object.freeze({execute:(operation,args={},targetRefs=[])=>executeStructureRepeatLayoutComponentsOperation(app,{operation,arguments:args||{},targets:Array.isArray(targetRefs)?clone(targetRefs):[]})}),
    textSvg:Object.freeze({execute:(operation,args={},targetRefs=[])=>executeTextSvgOperation(app,{operation,arguments:args||{},targets:Array.isArray(targetRefs)?clone(targetRefs):[]})}),
    rasterImage:Object.freeze({execute:(operation,args={},targetRefs=[])=>executeRasterImageOperation(app,{operation,arguments:args||{},targets:Array.isArray(targetRefs)?clone(targetRefs):[]})}),
    materialsAppearance:Object.freeze({execute:(operation,args={},targetRefs=[])=>executeMaterialsAppearanceOperation(app,{operation,arguments:args||{},targets:Array.isArray(targetRefs)?clone(targetRefs):[]})}),
    recipeInvocation:Object.freeze({execute:(operation,args={},targetRefs=[])=>executeRecipeInvocationOperation(app,{operation,arguments:args||{},targets:Array.isArray(targetRefs)?clone(targetRefs):[]})}),
    toolsView:Object.freeze({
      currentTool:()=>app?.tool||null,
      toolSettings:tool=>clone(app?.toolSettings?.[tool||app?.tool||app?.lastDrawTool]||null),
      toolOptions:()=>clone({shapeType:app?.shapeType||'line',shapeFill:Boolean(app?.shapeFill),font:app?.font||{family:'system-ui',size:32},selectionMode:app?.selectionMode||'contain'}),
      activateTool:tool=>{const before=app.tool;app.setTool?.(tool);return{changed:before!==app.tool,result:{tool:app.tool}};},
      setToolSetting:(tool,key,value)=>{const resolved=tool||app.tool||app.lastDrawTool,before=app.toolSettings?.[resolved]?.[key];app.updateBrushSetting?.(key,value);return{changed:before!==app.toolSettings?.[resolved]?.[key],result:{tool:resolved,key,value:app.toolSettings?.[resolved]?.[key]}};},
      setColor:color=>{const value=String(color).toLowerCase(),before=app.toolSettings?.[app.tool]?.color;app.setColor?.(value,true);return{changed:before!==value,result:{color:value}};},
      setShape:shape=>{const before=app.shapeType;app.shapeType=shape;app.refreshToolUI?.();return{changed:before!==app.shapeType,result:{shapeType:app.shapeType}};},
      setShapeFill:fill=>{const before=Boolean(app.shapeFill);app.shapeFill=Boolean(fill);app.refreshToolUI?.();return{changed:before!==app.shapeFill,result:{shapeFill:app.shapeFill}};},
      setTextSetting:(key,value)=>{const before=app.font?.[key];if(!app.font)app.font={family:'system-ui',size:32};app.font[key]=key==='size'?Number(value):String(value||'system-ui');app.refreshToolUI?.();return{changed:before!==app.font[key],result:{font:clone(app.font)}};},
      viewContract:()=>clone(VIEW_ZOOM_CONTRACT),
      view:()=>clone(activePage(app)?.camera||null),
      zoomBy:factor=>{app.zoomBy?.(Number(factor));return{changed:true,result:{camera:clone(activePage(app)?.camera)}};},
      zoomSet:scale=>{const current=Math.max(.0001,Number(activePage(app)?.camera?.scale)||1);app.zoomBy?.(Number(scale)/current);return{changed:true,result:{camera:clone(activePage(app)?.camera)}};},
      pan:(dx,dy)=>{const camera=activePage(app)?.camera;if(!camera)throw Object.assign(new Error('Camera unavailable'),{code:'CAPABILITY_UNAVAILABLE'});camera.x+=Number(dx);camera.y+=Number(dy);app.renderer?.render?.();return{changed:true,result:{camera:clone(camera)}};},
      reset:()=>{app.resetView?.();return{changed:true,result:{camera:clone(activePage(app)?.camera)}};},
      fitContent:()=>{app.fitContent?.();return{changed:true,result:{camera:clone(activePage(app)?.camera)}};},
      fitArtboard:()=>{app.fitArtboard?.({switchSpace:false});return{changed:true,result:{camera:clone(activePage(app)?.camera)}};},
      workspace:()=>clone(activePage(app)?.workspace||null),
      activateWorkspace:space=>{const before=app.spaceMode?.();app.switchWorkspace?.(space,{fit:false});return{changed:before!==app.spaceMode?.(),result:{space:app.spaceMode?.()}};}
    })
  });
}
