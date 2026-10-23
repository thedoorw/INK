const fail=(code,message)=>{const error=new Error(message);error.code=code;throw error;};
const selected=(app,predicate=()=>true)=>(app.selectedObjects?.()||[]).find(item=>predicate(item.object,item))||null;
const selectedRaster=app=>selected(app,object=>object?.type==='image'&&object?.rasterState?.colorRaster);
const selectedPath=app=>selected(app,object=>object?.type==='path');
const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const FILTER_DEFAULTS=Object.freeze({motionBlur:{distance:4,angle:0},median:{radius:2},unsharpMask:{radius:2,amount:100,threshold:0},emboss:{strength:1,angle:135},mosaic:{size:8},minimum:{radius:1},maximum:{radius:1},reduceNoise:{radius:1,strength:50,preserveEdges:24}});

function objectBoundsLocal(object){
  if(object?.type==='path'){
    const points=(object.subpaths||[]).flatMap(sub=>(sub.anchors||[]).map(anchor=>({x:anchor.x,y:anchor.y})));
    if(points.length){const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}
  }
  return{x:0,y:0,w:Math.max(1,num(object?.w??object?.width,100)),h:Math.max(1,num(object?.h??object?.height,100))};
}
export function createUiEntryCompletion003Runtime(app,api,{uiBTools=null}={}){
  if(!app||!api)throw new TypeError('INK_UI_ENTRY_003_RUNTIME_REQUIRED');
  const refresh=()=>{app.spatialDirty=true;app.refreshAll?.();app.renderer?.render?.();};
  const mutate=(label,found,fn)=>{
    if(!found)fail('TARGET_NOT_FOUND','Target unavailable');
    const target=app.objectPath?.(found);if(!target)fail('TARGET_NOT_FOUND','Target path unavailable');
    app.history?.pushScoped?.(label,[target],()=>fn(found.object));refresh();return{changed:true};
  };
  const rasterSelection=()=>uiBTools?.rasterSelection?.()||null;
  const currentPage=()=>app.page?.()||null;
  const stackSignature=object=>JSON.stringify(object?.filterStack||[]);
  const objectToken=(found,{stack=false}={})=>Object.freeze({kind:'object',documentRef:app.doc||null,documentId:app.doc?.id??null,pageRef:currentPage(),pageId:currentPage()?.id??null,layerRef:found.layer,layerId:found.layer?.id??null,objectRef:found.object,objectId:found.object?.id??null,objectType:found.object?.type??null,stackSignature:stack?stackSignature(found.object):null});
  const layerToken=layer=>Object.freeze({kind:'layer',documentRef:app.doc||null,documentId:app.doc?.id??null,pageRef:currentPage(),pageId:currentPage()?.id??null,layerRef:layer,layerId:layer?.id??null});
  const assertDocumentToken=token=>{const page=currentPage();if(!token||token.documentRef!==(app.doc||null)||token.pageRef!==page||String(token.documentId??'')!==String(app.doc?.id??'')||String(token.pageId??'')!==String(page?.id??''))fail('TARGET_STALE','Document or page changed; action cancelled');};
  const resolveObjectToken=(token,predicate=()=>true,{stack=false}={})=>{assertDocumentToken(token);const found=app.findObject?.({layerId:token.layerId,objectId:token.objectId});if(!found||found.layer!==token.layerRef||found.object!==token.objectRef||!predicate(found.object,found))fail('TARGET_STALE','Target object changed; action cancelled');const active=(app.selectedObjects?.()||[]).some(item=>item.layer===token.layerRef&&item.object===token.objectRef);if(!active)fail('TARGET_STALE','Selection changed; action cancelled');if(stack&&token.stackSignature!==stackSignature(found.object))fail('TARGET_STALE','Filter stack changed; action cancelled');return found;};
  const resolveLayerToken=token=>{assertDocumentToken(token);const layer=app.layer?.();if(!layer||layer!==token.layerRef||String(layer.id)!==String(token.layerId))fail('TARGET_STALE','Active layer changed; action cancelled');return layer;};
  function captureTarget(kind,{layerId=null}={}){
    if(['icc','select-mask','raster-mask','liquify','image-stack','filter-image'].includes(kind)){const found=selectedRaster(app);if(!found)fail('TARGET_NOT_FOUND','Select a Raster image first');return objectToken(found,{stack:kind==='image-stack'});}
    if(kind==='transform'){const found=selected(app);if(!found)fail('TARGET_NOT_FOUND','Select an object first');return objectToken(found);}
    if(kind==='vector-gradient'){const found=selectedPath(app);if(!found)fail('TARGET_NOT_FOUND','Select a Path first');return objectToken(found);}
    if(kind==='vector-pattern')fail('CAPABILITY_UNAVAILABLE','No registered vector pattern resource is available');
    if(kind==='filter-auto'){const found=selectedRaster(app);if(found)return objectToken(found);const layer=app.layer?.();if(!layer)fail('TARGET_NOT_FOUND','Filter target unavailable');return layerToken(layer);}
    if(kind==='layer-filter'||kind==='filter-layer'){const layer=app.layer?.();if(!layer)fail('TARGET_NOT_FOUND','Layer target unavailable');if(layerId!=null&&String(layer.id)!==String(layerId))fail('TARGET_STALE','Active layer changed; action cancelled');return layerToken(layer);}
    fail('ARGUMENTS_INVALID','Unknown target kind');
  }
  const capability={
    'external-import':()=>typeof app.importImageFormat==='function',
    'icc-profile':()=>Boolean(selectedRaster(app)),
    'select-and-mask':()=>Boolean(selectedRaster(app)&&rasterSelection()),
    'raster-mask':()=>Boolean(selectedRaster(app)&&rasterSelection()),
    'liquify':()=>Boolean(selectedRaster(app)),
    'advanced-transform':()=>Boolean(selected(app)),
    'text-on-path':()=>{const all=app.selectedObjects?.()||[];return all.some(x=>x.object?.type==='text')&&all.some(x=>x.object?.type==='path');},
    'vector-gradient':()=>Boolean(selectedPath(app)),
    'vector-pattern':()=>false,
    'recovery':()=>Boolean(app.store?.loadRecord&&app.replaceDocument),
    'filter-gallery':()=>Boolean(selectedRaster(app)||app.layer?.()),
    'image-stack':()=>Boolean(selectedRaster(app)),
    'layer-filter':()=>Boolean(app.layer?.()),
    'select-all':()=>Boolean(app.documentOpen&&app.page?.()),
    'selection-group':()=>Boolean((app.selectedObjects?.()||[]).length>=2&&app.groupSelection),
    'selection-ungroup':()=>Boolean((app.selectedObjects?.()||[]).some(x=>x.object?.type==='group')&&app.ungroupSelection),
    'selection-arrange':()=>Boolean((app.selectedObjects?.()||[]).length&&app.reorderSelection),
    'selection-align':()=>Boolean((app.selectedObjects?.()||[]).length>=2&&app.alignSelection),
    'snap':()=>Boolean(app.page?.()),
    'guides':()=>Boolean(app.page?.()?.guides),
    'multichannel':()=>false,'layer-mask':()=>false,'layer-effects':()=>false,'blender':()=>false,'smudge':()=>false
  };
  const has=id=>Boolean(capability[id]?.());
  const availability=id=>{const available=has(id);return Object.freeze({id,available,reason:available?'AVAILABLE':id==='vector-pattern'?'NO_REGISTERED_PATTERN_RESOURCE':(['multichannel','layer-mask','layer-effects','blender','smudge'].includes(id)?'CORE_GAP_OR_NO_DIRECT_RECEIVER':'PREREQUISITE_UNMET')});};
  async function importExternal(file){
    if(!file)fail('ARGUMENTS_INVALID','File required');if(typeof app.importImageFormat!=='function')fail('CAPABILITY_UNAVAILABLE','External format import unavailable');
    const bytes=new Uint8Array(await file.arrayBuffer());const result=await app.importImageFormat(bytes,{name:file.name});return{changed:result?.changed!==false,result};
  }
  async function assignIcc(file,token=null,guard=null){
    const bound=token||captureTarget('icc');resolveObjectToken(bound,object=>object?.type==='image'&&object?.rasterState?.colorRaster);if(!file)fail('ARGUMENTS_INVALID','ICC file required');
    const bytes=new Uint8Array(await file.arrayBuffer());if(guard&&!guard())fail('DIALOG_DISPOSED','Dialog closed before ICC assignment');const found=resolveObjectToken(bound,object=>object?.type==='image'&&object?.rasterState?.colorRaster),profile=api.parseIccProfile(bytes),inspection=api.inspectIccProfile(profile);
    mutate('Assign ICC Profile',found,object=>{object.rasterState.icc={bytes:Array.from(bytes),inspection};});return{changed:true,result:inspection};
  }
  function refineMask({smooth=0,feather=0,expand=0}={},token=null){
    const bound=token||captureTarget('select-mask'),found=resolveObjectToken(bound,object=>object?.type==='image'&&object?.rasterState?.colorRaster);if(!uiBTools?.refineSelection)fail('CAPABILITY_UNAVAILABLE','Raster selection receiver unavailable');
    const selection=uiBTools.refineSelection({smooth:num(smooth),feather:num(feather),expand:num(expand)});if(!selection?.alpha)fail('SELECTION_REQUIRED','Raster selection required');
    resolveObjectToken(bound,object=>object?.type==='image'&&object?.rasterState?.colorRaster);mutate('Select and Mask',found,object=>{object.rasterMask=api.createRasterMask(selection.width,selection.height,selection.alpha,{feather:num(feather),expand:num(expand)});});
    return{changed:true,result:{width:selection.width,height:selection.height}};
  }
  function createRasterMask(token=null){
    const bound=token||captureTarget('raster-mask'),found=resolveObjectToken(bound,object=>object?.type==='image'&&object?.rasterState?.colorRaster),selection=rasterSelection();if(!selection?.alpha)fail('SELECTION_REQUIRED','Raster selection required');
    const raster=api.deserializeColorRaster(found.object.rasterState.colorRaster);if(selection.width!==raster.width||selection.height!==raster.height)fail('SELECTION_DIMENSION_MISMATCH','Selection size does not match Raster target');
    mutate('Create Raster Mask',found,object=>{object.rasterMask=api.createRasterMask(raster.width,raster.height,selection.alpha);});return{changed:true};
  }
  function addLiquify({type='forwardWarp',radius=80,strength=.4,dx=12,dy=0,freezeSelection=false}={},token=null){
    const bound=token||captureTarget('liquify'),found=resolveObjectToken(bound,object=>object?.type==='image'&&object?.rasterState?.colorRaster),raster=api.deserializeColorRaster(found.object.rasterState.colorRaster),selection=freezeSelection?rasterSelection():null;
    const filter=api.createLiquifyFilter([{type,x:raster.width/2,y:raster.height/2,radius:num(radius,80),strength:num(strength,.4),dx:num(dx,12),dy:num(dy,0)}],{freezeMask:selection?.alpha||null,maxWork:Math.max(4096,raster.width*raster.height*2)});
    mutate('Liquify',found,object=>{object.filterStack=object.filterStack||[];object.filterStack.push(filter);});return{changed:true};
  }
  function advancedTransform(mode,{a=10,b=0}={},token=null){
    const bound=token||captureTarget('transform'),found=resolveObjectToken(bound),av=num(a,10),bv=num(b,0);
    if(mode==='skew'){
      const bounds=app.renderer?.objectWorldBounds?.(found.object,found.parentWorldMatrix);if(!bounds)fail('TARGET_NOT_FOUND','Object bounds unavailable');
      const pivot={x:bounds.x+bounds.w/2,y:bounds.y+bounds.h/2},matrix=api.createSkewMatrix({xDegrees:av,yDegrees:bv,pivot});
      app.history.pushScoped('Skew',[app.objectPath(found)],()=>{const current=app.findObject?.({layerId:found.layer.id,objectId:found.object.id});if(current?.object===found.object)current.object.matrix=api.M.multiply(matrix,current.object.matrix||api.M.identity());else fail('TARGET_STALE','Target object changed; action cancelled');});refresh();return{changed:true};
    }
    if(found.object.type!=='path')fail('TARGET_TYPE_UNSUPPORTED',mode==='warp'?'Warp requires Path':'Distort/Perspective requires Path');
    if(mode==='warp'){const plan=api.createWarpDeformationPlan(objectBoundsLocal(found.object),{strength:clamp(av/100,-1,1),maxDisplacement:clamp(Math.abs(bv||.5),0,.5)});return mutate('Warp',found,object=>api.applyNonDestructiveDeformation(object,{bend:plan.parameters.bend}));}
    if(!['distort','perspective'].includes(mode))fail('ARGUMENTS_INVALID','Unsupported transform mode');
    const bounds=objectBoundsLocal(found.object),source=[{x:bounds.x,y:bounds.y},{x:bounds.x+bounds.w,y:bounds.y},{x:bounds.x+bounds.w,y:bounds.y+bounds.h},{x:bounds.x,y:bounds.y+bounds.h}],dest=source.map(point=>({...point}));
    dest[0].x+=av;dest[1].y+=bv;dest[2].x-=av;dest[3].y-=bv;const matrix=api.createProjectiveTransform(source,dest);
    return mutate(mode==='distort'?'Distort':'Perspective',found,object=>{for(const sub of object.subpaths||[])for(const anchor of sub.anchors||[]){const center=api.mapProjectivePoint(matrix,{x:anchor.x,y:anchor.y}),incoming=api.mapProjectivePoint(matrix,{x:anchor.x+(anchor.in?.x||0),y:anchor.y+(anchor.in?.y||0)}),outgoing=api.mapProjectivePoint(matrix,{x:anchor.x+(anchor.out?.x||0),y:anchor.y+(anchor.out?.y||0)});anchor.x=center.x;anchor.y=center.y;anchor.in={x:incoming.x-center.x,y:incoming.y-center.y};anchor.out={x:outgoing.x-center.x,y:outgoing.y-center.y};}});
  }
  function textOnPath(){
    const all=app.selectedObjects?.()||[],text=all.find(item=>item.object?.type==='text'),path=all.find(item=>item.object?.type==='path');if(!text||!path)fail('TARGET_NOT_FOUND','Select Text and Path together');
    return mutate('Text on Path',text,object=>api.updateTextObject(object,{pathText:{pathId:path.object.id,startOffset:0}}));
  }
  function vectorFill(kind,{start='#202020',end='#ffffff',opacity=1}={},token=null){
    if(kind==='pattern')fail('CAPABILITY_UNAVAILABLE','No registered vector pattern resource is available');if(kind!=='gradient')fail('ARGUMENTS_INVALID','Unknown vector fill');
    const bound=token||captureTarget('vector-gradient'),found=resolveObjectToken(bound,object=>object?.type==='path'),alpha=clamp(num(opacity,1),0,1);
    const descriptor=api.normalizeGradientFill({type:'linear',start:{x:0,y:0},end:{x:1,y:0},center:{x:.5,y:.5},radius:.5,stops:[{offset:0,color:start,opacity:alpha},{offset:1,color:end,opacity:alpha}]});
    return mutate('Vector Gradient',found,object=>object.fillAppearance=descriptor);
  }
  function filterDescriptors(){return (api.FILTER_GALLERY||[]).map(entry=>({id:entry.id||entry.type||entry.name,name:entry.name||entry.id||entry.type,group:entry.group||entry.category||'Filter'}));}
  function addFilter(type,params=null,target='auto',token=null){
    const bound=token||captureTarget(target==='layer'?'layer-filter':target==='image'?'filter-image':'filter-auto');let object,path,useImage,found=null,layer=null;
    if(bound.kind==='object'){if(target==='layer')fail('TARGET_STALE','Filter target changed; action cancelled');found=resolveObjectToken(bound,object=>object?.type==='image'&&object?.rasterState?.colorRaster);object=found.object;path=app.objectPath(found);useImage=true;}
    else{if(target==='image')fail('TARGET_STALE','Filter target changed; action cancelled');layer=resolveLayerToken(bound);object=layer;path=app.layerPath?.(layer);useImage=false;}
    if(!path)fail('TARGET_NOT_FOUND','Filter target path unavailable');
    app.history.pushScoped('Add Filter: '+type,[path],()=>{object.filterStack=object.filterStack||[];object.filterStack.push(api.createFilter(type,params??FILTER_DEFAULTS[type]??{}));});refresh();return{changed:true,target:useImage?'image':'layer',targetToken:useImage?objectToken(found):layerToken(layer)};
  }
  function layerFilter(layerId,type,params=null,token=null){const bound=token||captureTarget('layer-filter',{layerId}),layer=resolveLayerToken(bound);if(String(layer.id)!==String(layerId))fail('TARGET_STALE','Active layer changed; filter cancelled');return addFilter(type,params,'layer',bound);}
  function imageStack(token=null){const bound=token||captureTarget('image-stack'),found=resolveObjectToken(bound,object=>object?.type==='image'&&object?.rasterState?.colorRaster,{stack:true});return{target:{documentId:bound.documentId,pageId:bound.pageId,layerId:found.layer.id,objectId:found.object.id},filters:clone(found.object.filterStack||[]),effects:clone(found.object.effects||[]),targetToken:bound};}
  function mutateImageFilterStack(action,index,delta=0,token=null){
    const bound=token||captureTarget('image-stack'),found=resolveObjectToken(bound,object=>object?.type==='image'&&object?.rasterState?.colorRaster,{stack:true}),before=found.object.filterStack||[];const i=Math.trunc(num(index,-1));if(i<0||i>=before.length)fail('TARGET_STALE','Filter stack changed; action cancelled');
    mutate(action==='remove'?'Remove Filter':'Reorder Filter',found,object=>{object.filterStack=object.filterStack||[];if(i>=object.filterStack.length)fail('TARGET_STALE','Filter stack changed; action cancelled');if(action==='remove')object.filterStack.splice(i,1);else{const target=clamp(i+Math.trunc(num(delta,0)),0,object.filterStack.length-1);if(target!==i){const [item]=object.filterStack.splice(i,1);object.filterStack.splice(target,0,item);}}});
    return{changed:true,targetToken:objectToken(found,{stack:true})};
  }
  function recoveryState(source,record){
    const storage=api.verifyStorageRecord(record);if(!storage?.valid||!storage.value)return{source,valid:false,verified:false,legacy:false,reason:storage?.reason||'invalid-storage-record',fingerprint:null,token:null,value:null};
    let integrity;try{integrity=api.inspectDocument(storage.value);}catch(error){return{source,valid:false,verified:Boolean(storage.verified),legacy:Boolean(storage.legacy||!storage.verified),reason:'document-integrity-error',fingerprint:null,token:null,value:null};}
    const valid=Boolean(integrity?.passed&&integrity?.fingerprint),fingerprint=integrity?.fingerprint||null;return{source,valid,verified:Boolean(storage.verified),legacy:Boolean(storage.legacy||!storage.verified),reason:valid?null:'document-integrity',fingerprint,token:valid?source+':'+fingerprint:null,value:storage.value};
  }
  async function recoveryList(){
    if(!has('recovery'))return[];const records=[],current=await app.store.loadRecord('autosave'),previous=await app.store.loadRecord('autosave:previous'),checkpoints=await app.store.loadRecord('autosave:checkpoints');
    if(current)records.push({source:'current',record:current});if(previous)records.push({source:'previous',record:previous});for(const [index,record] of (Array.isArray(checkpoints)?checkpoints:[]).entries())records.push({source:'checkpoint-'+(index+1),record});
    return records.map(({source,record})=>{const {value,...publicState}=recoveryState(source,record);return publicState;});
  }
  async function restoreRecovery(source,token){
    const list=await recoveryList(),candidate=list.find(item=>item.source===source);if(!candidate?.valid)fail('RECOVERY_INVALID','Recovery candidate invalid');if(candidate.token!==token)fail('TARGET_STALE','Recovery candidate changed; restore cancelled');
    const key=source==='current'?'autosave':source==='previous'?'autosave:previous':'autosave:checkpoints';let record=await app.store.loadRecord(key);if(source.startsWith('checkpoint-'))record=(Array.isArray(record)?record:[])[Math.max(0,Number(source.split('-')[1])-1)];const state=recoveryState(source,record);
    if(!state.valid||state.token!==token)fail('TARGET_STALE','Recovery candidate changed or failed document validation; restore cancelled');app.replaceDocument(state.value);app.history?.clear?.();app.dirty=false;refresh();return{changed:true,source,verified:state.verified,fingerprint:state.fingerprint};
  }
  function selectAll(){if(!has('select-all'))fail('CAPABILITY_UNAVAILABLE','Document unavailable');app.selection=[];for(const layer of app.page().layers||[])if(layer.visible&&!layer.locked)for(const object of layer.objects||[])app.selection.push({layerId:layer.id,objectId:object.id});app.refreshSelectionUI?.();app.renderer?.render?.();return{changed:true,count:app.selection.length};}
  function selectionAction(action,arg=null){
    if(action==='group'){if(!has('selection-group'))fail('PREREQUISITE_UNMET','Select at least two objects');app.groupSelection();return{changed:true};}
    if(action==='ungroup'){if(!has('selection-ungroup'))fail('PREREQUISITE_UNMET','Select a group');app.ungroupSelection();return{changed:true};}
    if(action==='front'||action==='back'){if(!has('selection-arrange'))fail('PREREQUISITE_UNMET','Select an object');app.reorderSelection(action);return{changed:true};}
    if(action==='align'){if(!has('selection-align'))fail('PREREQUISITE_UNMET','Select at least two objects');app.alignSelection(arg);return{changed:true};}
    fail('ARGUMENTS_INVALID','Unknown selection action');
  }
  function toggleSnap(key){const page=app.page?.();if(!page)fail('TARGET_NOT_FOUND','Page unavailable');const current=key==='enabled'?page.snap?.enabled!==false:Boolean(page.snap?.categories?.[key]);return app.commands?.execute?.('page.snap.set.v1',{key,value:!current},'human-ui');}
  function guideAction(action){
    const page=app.page?.();if(!page)fail('TARGET_NOT_FOUND','Page unavailable');const guides=[...(page.guides||[])];if(!guides.length)return{changed:false,count:0};
    if(action==='toggle'){const makeVisible=!guides.every(g=>g.visible!==false);for(const guide of guides)app.commands.execute('guide.visibility.set.v1',{guideId:guide.id,visible:makeVisible},'human-ui');return{changed:true,count:guides.length};}
    if(action==='lock'){const lock=!guides.every(g=>g.locked===true);for(const guide of guides)app.commands.execute('guide.lock.set.v1',{guideId:guide.id,locked:lock},'human-ui');return{changed:true,count:guides.length};}
    if(action==='clear'){for(const guide of guides)app.commands.execute('guide.remove.v1',{guideId:guide.id},'human-ui');return{changed:true,count:guides.length};}
    fail('ARGUMENTS_INVALID','Unknown guide action');
  }
  return Object.freeze({schema:'INK-UI-ENTRY-COMPLETION-003',version:1,has,availability,captureTarget,importExternal,assignIcc,refineMask,createRasterMask,addLiquify,advancedTransform,textOnPath,vectorFill,filterDescriptors,addFilter,layerFilter,imageStack,mutateImageFilterStack,recoveryList,restoreRecovery,selectAll,selectionAction,toggleSnap,guideAction});
}
