import { CREATIVE_OPERATION_FAMILY_COMMANDS } from './creative-operation-contract.js';

const finite=value=>Number.isFinite(Number(value));

const meta=(history,invalidation,extra={})=>({
  history,invalidation,
  validation:extra.validation||'INLINE',
  resultContract:'INK_COMMAND_RESULT_V1',
  mutationScope:extra.mutationScope||'NATIVE_SERVICE',
  transaction:extra.transaction||history,
  async:Boolean(extra.async),
  documentPolicy:extra.documentPolicy||'SAME_DOCUMENT',
  governance:extra.governance||'SHARED_COMMAND',
  ...extra
});
const moduleBase=(id,version,servicePort,providedCommands,providedSelectors,requiredCapabilities,stateOwners,initialize,providedCapabilities=[`function.${id}`])=>Object.freeze({
  id,implementationVersion:version,hostContractVersion:1,commandContractVersion:1,servicePort,
  providedCommands:Object.freeze(providedCommands),providedSelectors:Object.freeze(providedSelectors),
  providedCapabilities:Object.freeze(providedCapabilities),requiredCapabilities:Object.freeze(requiredCapabilities),
  optionalCapabilities:Object.freeze([]),stateOwners:Object.freeze(stateOwners),initialize,dispose(){return true;}
});

export const FUNCTION_MODULE_COMMANDS=Object.freeze({
  'history-control':['history.undo.v1','history.redo.v1','history.jump.v1'],
  'document-io':['document.new.v1','document.open.v1','document.save.v1','export.png.v1'],
  'page-layout':['page.create.v1','page.duplicate.v1','page.delete.v1','page.activate.v1','page.rename.v1','guide.add.v1','guide.move.v1','guide.remove.v1','guide.lock.set.v1','guide.visibility.set.v1','page.snap.set.v1','page.paper.set.v1','page.artboard.set.v1'],
  'layer-management':['layer.activate.v1','layer.create.v1','layer.duplicate.v1','layer.delete.v1','layer.reorder.v1','layer.opacity.set.v1','layer.visibility.set.v1','layer.lock.set.v1'],
  'selection-transform':['selection.clear.v1','selection.delete.v1','selection.duplicate.v1','object.translate.v1','object.align.v1','object.resize.v1','object.rotate.v1'],
  'tools-view':['tool.activate.v1','tool.setting.set.v1','tool.color.set.v1','tool.shape.set.v1','tool.shape.fill.set.v1','tool.text.setting.set.v1','view.zoom.by.v1','view.zoom.set.v1','view.pan.v1','view.reset.v1','view.fit.content.v1','view.fit.artboard.v1','workspace.activate.v1']
});

export function createHistoryControlModule(version='1.0.0'){
  return moduleBase('history-control',version,'historyControl',FUNCTION_MODULE_COMMANDS['history-control'],['history.summary'],['native.history'],['HistoryManager','RevisionStore'],ctx=>{
    const p=ctx.services;
    ctx.command('history.undo.v1',{...meta('NONE','FULL_RENDER'),run:()=>p.undo()});
    ctx.command('history.redo.v1',{...meta('NONE','FULL_RENDER'),run:()=>p.redo()});
    ctx.command('history.jump.v1',{...meta('NONE','FULL_RENDER'),validate:args=>{if(!Number.isInteger(Number(args.applied)))throw Object.assign(new Error('History index required'),{code:'ARGUMENTS_INVALID'});},run:args=>p.jump(args.applied)});
    ctx.selector('history.summary',()=>p.summary());
  });
}
export function createDocumentIOModule(version='1.0.0'){
  return moduleBase('document-io',version,'documentIO',FUNCTION_MODULE_COMMANDS['document-io'],['document.current'],['native.document','native.persistence','native.export'],['Document','InkStore','Renderer'],ctx=>{
    const p=ctx.services;
    ctx.command('document.new.v1',{...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER',{documentPolicy:'MAY_REPLACE_DOCUMENT'}),run:(args,envelope,execution)=>p.newDocument(args,execution)});
    ctx.command('document.open.v1',{...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER',{async:true,documentPolicy:'MAY_REPLACE_DOCUMENT'}),validate:args=>{if(!args.file)throw Object.assign(new Error('File required'),{code:'ARGUMENTS_INVALID'});},run:(args,envelope,execution)=>p.open(args.file,execution)});
    ctx.command('document.save.v1',{...meta('NONE','OUTPUT_ONLY',{async:true}),run:(args,envelope,execution)=>p.save(execution)});
    ctx.command('export.png.v1',{...meta('NONE','OUTPUT_ONLY',{async:true}),run:(args,envelope,execution)=>p.exportPNG(args,execution)});
    ctx.selector('document.current',()=>p.current());
  });
}
export function createPageLayoutModule(version='1.0.0'){
  return moduleBase('page-layout',version,'pageLayout',FUNCTION_MODULE_COMMANDS['page-layout'],['page.active','page.preview','page.byId','page.list'],['native.document','native.history','native.precision-layout'],['Document','HistoryManager'],ctx=>{
    const p=ctx.services;
    ctx.command('page.create.v1',{...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER'),run:()=>p.create()});
    ctx.command('page.duplicate.v1',{...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER'),validate:args=>p.requirePage(args.pageId),run:args=>p.duplicate(args.pageId)});
    ctx.command('page.delete.v1',{...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER'),validate:args=>p.requirePage(args.pageId),run:args=>p.delete(args.pageId)});
    ctx.command('page.activate.v1',{...meta('NONE','FULL_RENDER'),validate:args=>p.requirePage(args.pageId),run:args=>p.activate(args.pageId)});
    ctx.command('page.rename.v1',{...meta('JOIN_ACTIVE_TRANSACTION','UI_REFRESH'),run:args=>p.rename(args.pageId,args.name)});
    ctx.command('guide.add.v1',{...meta('PRESERVE_EXISTING_ROUTE','OVERLAY'),run:args=>p.guideAdd(args)});
    ctx.command('guide.move.v1',{...meta('PRESERVE_EXISTING_ROUTE','OVERLAY'),run:args=>p.guideMove(args.guideId,args.position)});
    ctx.command('guide.remove.v1',{...meta('PRESERVE_EXISTING_ROUTE','OVERLAY'),run:args=>p.guideRemove(args.guideId)});
    ctx.command('guide.lock.set.v1',{...meta('PRESERVE_EXISTING_ROUTE','OVERLAY'),run:args=>p.guideLock(args.guideId,args.locked)});
    ctx.command('guide.visibility.set.v1',{...meta('PRESERVE_EXISTING_ROUTE','OVERLAY'),run:args=>p.guideVisibility(args.guideId,args.visible)});
    ctx.command('page.snap.set.v1',{...meta('PRESERVE_EXISTING_ROUTE','OVERLAY'),run:args=>p.snap(args.key,args.value)});
    ctx.command('page.paper.set.v1',{...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER'),run:args=>p.paper(args.key,args.value)});
    ctx.command('page.artboard.set.v1',{...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER'),run:args=>p.artboard(args.key,args.value)});
    ctx.selector('page.active',()=>p.active());
    ctx.selector('page.preview',args=>p.preview(args.width,args.height));
    ctx.selector('page.byId',args=>p.byId(args.pageId));
    ctx.selector('page.list',()=>p.list());
  });
}
export function createLayerManagementModule(version='1.0.0'){
  return moduleBase('layer-management',version,'layerManagement',FUNCTION_MODULE_COMMANDS['layer-management'],['layer.active','layer.list'],['native.document','native.history','native.renderer'],['Document','HistoryManager','Renderer'],ctx=>{
    const p=ctx.services;
    ctx.command('layer.activate.v1',{...meta('NONE','UI_REFRESH'),validate:args=>p.requireLayer(args.layerId),run:args=>p.activate(args.layerId)});
    ctx.command('layer.create.v1',{...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER'),run:()=>p.create()});
    ctx.command('layer.duplicate.v1',{...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER'),run:args=>p.duplicate(args.layerId)});
    ctx.command('layer.delete.v1',{...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER'),run:args=>p.delete(args.layerId)});
    ctx.command('layer.reorder.v1',{...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER'),validate:args=>{p.requireLayer(args.sourceId);p.requireLayer(args.targetId);},run:args=>p.reorder(args.sourceId,args.targetId,args.position||'before')});
    ctx.command('layer.opacity.set.v1',{...meta('JOIN_ACTIVE_TRANSACTION','FULL_RENDER'),run:args=>p.opacity(args.layerId,args.opacity)});
    ctx.command('layer.visibility.set.v1',{...meta('JOIN_ACTIVE_TRANSACTION','FULL_RENDER'),validate:args=>p.requireLayer(args.layerId),run:args=>p.visibility(args.layerId,args.visible)});
    ctx.command('layer.lock.set.v1',{...meta('JOIN_ACTIVE_TRANSACTION','UI_REFRESH'),validate:args=>p.requireLayer(args.layerId),run:args=>p.lock(args.layerId,args.locked)});
    ctx.selector('layer.active',()=>p.active());
    ctx.selector('layer.list',()=>p.list());
  });
}
export function createSelectionTransformModule(version='1.0.0'){
  return moduleBase('selection-transform',version,'selectionTransform',FUNCTION_MODULE_COMMANDS['selection-transform'],['selection.current'],['native.selection','native.history'],['Document.selection','HistoryManager'],ctx=>{
    const p=ctx.services;
    ctx.command('selection.clear.v1',{...meta('NONE','OVERLAY'),run:()=>p.clear()});
    ctx.command('selection.delete.v1',{...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER'),run:()=>p.delete()});
    ctx.command('selection.duplicate.v1',{...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER'),run:args=>p.duplicate(args.offset)});
    ctx.command('object.translate.v1',{...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER'),validate:args=>{if(!finite(args.dx)||!finite(args.dy))throw Object.assign(new Error('dx/dy required'),{code:'ARGUMENTS_INVALID'});},run:args=>p.translate(args.dx,args.dy,args.targetRefs)});
    ctx.command('object.align.v1',{...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER'),run:args=>p.align(args.mode,args.targetRefs)});
    ctx.command('object.resize.v1',{...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER'),run:args=>p.resize(args.width,args.height,args.preserveAspect,args.targetRefs)});
    ctx.command('object.rotate.v1',{...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER'),run:args=>p.rotate(args.degrees,args.center,args.targetRefs)});
    ctx.selector('selection.current',()=>p.current());
  });
}
export function createToolsViewModule(version='1.0.0'){
  return moduleBase('tools-view',version,'toolsView',FUNCTION_MODULE_COMMANDS['tools-view'],['tool.current','tool.settings','tool.options','view.current','view.contract','workspace.current'],['native.tools','native.view','native.renderer'],['ToolState','Page.camera','Page.workspace','Renderer'],ctx=>{
    const p=ctx.services;
    ctx.command('tool.activate.v1',{...meta('NONE','UI_REFRESH'),validate:args=>{if(!args.tool)throw Object.assign(new Error('Tool required'),{code:'ARGUMENTS_INVALID'});},run:args=>p.activateTool(args.tool)});
    ctx.command('tool.setting.set.v1',{...meta('NONE','UI_REFRESH'),validate:args=>{if(!args.key)throw Object.assign(new Error('Setting key required'),{code:'ARGUMENTS_INVALID'});},run:args=>p.setToolSetting(args.tool,args.key,args.value)});
    ctx.command('tool.color.set.v1',{...meta('NONE','FULL_RENDER'),validate:args=>{if(!/^#[0-9a-f]{6}$/i.test(String(args.color||'')))throw Object.assign(new Error('Hex color required'),{code:'ARGUMENTS_INVALID'});},run:args=>p.setColor(args.color)});
    ctx.command('tool.shape.set.v1',{...meta('NONE','UI_REFRESH'),validate:args=>{if(!['line','arrow','rect','ellipse','triangle'].includes(args.shape))throw Object.assign(new Error('Shape invalid'),{code:'ARGUMENTS_INVALID'});},run:args=>p.setShape(args.shape)});
    ctx.command('tool.shape.fill.set.v1',{...meta('NONE','UI_REFRESH'),run:args=>p.setShapeFill(args.fill)});
    ctx.command('tool.text.setting.set.v1',{...meta('NONE','UI_REFRESH'),validate:args=>{if(!['family','size'].includes(args.key))throw Object.assign(new Error('Text setting invalid'),{code:'ARGUMENTS_INVALID'});if(args.key==='size'&&(!finite(args.value)||Number(args.value)<4||Number(args.value)>512))throw Object.assign(new Error('Text size invalid'),{code:'ARGUMENTS_INVALID'});},run:args=>p.setTextSetting(args.key,args.value)});
    ctx.command('view.zoom.by.v1',{...meta('NONE','FULL_RENDER'),validate:args=>{if(!finite(args.factor)||Number(args.factor)<=0)throw Object.assign(new Error('Zoom factor required'),{code:'ARGUMENTS_INVALID'});},run:args=>p.zoomBy(args.factor)});
    ctx.command('view.zoom.set.v1',{...meta('NONE','FULL_RENDER'),validate:args=>{if(!finite(args.scale)||Number(args.scale)<=0)throw Object.assign(new Error('Zoom scale required'),{code:'ARGUMENTS_INVALID'});},run:args=>p.zoomSet(args.scale)});
    ctx.command('view.pan.v1',{...meta('NONE','FULL_RENDER'),validate:args=>{if(!finite(args.dx)||!finite(args.dy))throw Object.assign(new Error('Pan dx/dy required'),{code:'ARGUMENTS_INVALID'});},run:args=>p.pan(args.dx,args.dy)});
    ctx.command('view.reset.v1',{...meta('NONE','FULL_RENDER'),run:()=>p.reset()});
    ctx.command('view.fit.content.v1',{...meta('NONE','FULL_RENDER'),run:()=>p.fitContent()});
    ctx.command('view.fit.artboard.v1',{...meta('NONE','FULL_RENDER'),run:()=>p.fitArtboard()});
    ctx.command('workspace.activate.v1',{...meta('NONE','FULL_RENDER'),validate:args=>{if(!['creation','layout'].includes(args.space))throw Object.assign(new Error('Workspace invalid'),{code:'ARGUMENTS_INVALID'});},run:args=>p.activateWorkspace(args.space)});
    ctx.selector('tool.current',()=>p.currentTool());
    ctx.selector('tool.settings',args=>p.toolSettings(args.tool));
    ctx.selector('tool.options',()=>p.toolOptions());
    ctx.selector('view.current',()=>p.view());
    ctx.selector('view.contract',()=>p.viewContract());
    ctx.selector('workspace.current',()=>p.workspace());
  });
}


const CREATIVE_FAMILY_PORTS=Object.freeze({
  'vector-path-stroke':'vectorPathStroke',
  'structure-repeat-layout-components':'structureRepeatLayoutComponents',
  'text-svg':'textSvg',
  'raster-image':'rasterImage',
  'materials-appearance':'materialsAppearance',
  'recipe-invocation':'recipeInvocation'
});

const CREATIVE_FAMILY_STATE_OWNERS=Object.freeze({
  'vector-path-stroke':Object.freeze(['Document','HistoryManager','Renderer','PathEditController','VectorStrokeAuthorities']),
  'structure-repeat-layout-components':Object.freeze(['Document','HistoryManager','Renderer','HierarchyLayoutComponentAuthorities']),
  'text-svg':Object.freeze(['Document','HistoryManager','Renderer','TextObjectAuthority','SVGImportAuthority']),
  'raster-image':Object.freeze(['Document','HistoryManager','Renderer','PaintSessionAuthority','ImageCoreAuthority']),
  'materials-appearance':Object.freeze(['Document','HistoryManager','Renderer','MaterialLibraryAuthority','RepaintMaterialAuthority']),
  'recipe-invocation':Object.freeze(['Document','HistoryManager','Renderer','StudioRecipeEngine'])
});

function createCreativeFamilyModule(familyId,version='1.0.0'){
  const commands=CREATIVE_OPERATION_FAMILY_COMMANDS[familyId];
  const servicePort=CREATIVE_FAMILY_PORTS[familyId];
  if(!commands||!servicePort)throw new Error('INK_CREATIVE_FAMILY_UNKNOWN:'+familyId);
  const base=moduleBase(
    'creative-'+familyId,
    version,
    servicePort,
    commands,
    [],
    ['native.document','native.history','native.renderer'],
    CREATIVE_FAMILY_STATE_OWNERS[familyId],
    ctx=>{
      const p=ctx.services;
      for(const operation of commands){
        ctx.command(operation,{
          ...meta('PRESERVE_EXISTING_ROUTE','FULL_RENDER',{governance:'SHARED_COMMAND / CHAT_APPROVAL_AT_CALLER'}),
          run:args=>{
            const {targetRefs,...nativeArguments}=args||{};
            return p.execute(operation,nativeArguments,targetRefs);
          }
        });
      }
    },
    ['creative.'+familyId]
  );
  return Object.freeze({...base,optional:true});
}

export function createFirstPartyFunctionModules(){
  return [
    createHistoryControlModule(),
    createDocumentIOModule(),
    createPageLayoutModule(),
    createLayerManagementModule(),
    createSelectionTransformModule(),
    createToolsViewModule(),
    createCreativeFamilyModule('vector-path-stroke'),
    createCreativeFamilyModule('structure-repeat-layout-components'),
    createCreativeFamilyModule('text-svg'),
    createCreativeFamilyModule('raster-image'),
    createCreativeFamilyModule('materials-appearance'),
    createCreativeFamilyModule('recipe-invocation')
  ];
}
