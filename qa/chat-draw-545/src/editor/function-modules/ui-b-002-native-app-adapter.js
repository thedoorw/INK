export function createUiB002NativeAppAdapter(app,{preferences=null}={}){
  if(!app)throw new TypeError('INK_UI_B_002_APP_REQUIRED');
  const selectedFound=predicate=>app.selectedObjects?.().find(item=>predicate(item.object,item))||null;
  const studio=()=>globalThis.INK_STUDIO;
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const fileSafe=value=>String(value||'INK').replace(/[\\/:*?"<>|]+/g,'-').trim()||'INK';
  const run=(id,args={})=>{const result=app.commands?.execute?.(id,args,'human-ui');if(!result)throw new Error('功能目前不可用');if(result?.ok===false)throw new Error(result.error?.message||'操作失敗');return result;};
  const readRulers=()=>preferences?.get?.().rulersVisible!==false;
  const setRulersVisible=value=>{const visible=Boolean(value);preferences?.set?.({rulersVisible:visible});app.commands?.notify?.('ui-rulers-visible');return visible;};
  const readToolbarLayout=()=>preferences?.get?.().toolsExpanded?'dual':'single';
  const setToolbarLayout=value=>{const mode=value==='dual'?'dual':'single';preferences?.set?.({toolsExpanded:mode==='dual'});app.commands?.notify?.('ui-toolbar-layout');return mode;};
  const enterPathEdit=()=>{const found=selectedFound(object=>object?.type==='path');if(!found)throw Object.assign(new Error('請先選取 Path'),{code:'TARGET_NOT_FOUND'});app.enterPathEdit?.({layerId:found.layer?.id||found.layerId,objectId:found.object.id});return{changed:false,result:{objectId:found.object.id}};};
  const enterStrokeEdit=()=>{const found=selectedFound(object=>object?.type==='stroke');if(!found)throw Object.assign(new Error('請先選取 Stroke'),{code:'TARGET_NOT_FOUND'});app.enterStrokeEdit?.({layerId:found.layer?.id||found.layerId,objectId:found.object.id});return{changed:false,result:{objectId:found.object.id}};};
  const frameSelection=()=>{const before=app.selection?.length||0;if(!before)throw Object.assign(new Error('請先選取物件'),{code:'TARGET_NOT_FOUND'});app.frameSelection?.();return{changed:true,result:{selectionCount:app.selection?.length||0}};};
  const importImage=async file=>{const before=app.history?.undoStack?.length||0;await app.importImage?.(file);return{changed:(app.history?.undoStack?.length||0)>before,result:{name:file?.name||null}};};
  const importSvg=async file=>{const api=studio();if(!api?.importSVGFile)throw new Error('SVG 匯入功能目前不可用');const result=await api.importSVGFile(file);return{changed:Boolean(result?.count),result:{count:result?.count||0}};};
  const importReference=async(file,{threshold=128}={})=>{if(!file)throw new Error('請選擇參考圖');const api=app.extraction;if(!api?.decode||!api?.extract)throw new Error('參考圖擷取功能目前不可用');const reference=await api.decode(file);const result=await api.extract({...reference,parameters:{threshold:Number(threshold)||128}},{referenceSrc:reference.referenceSrc});const first=result.paths?.[0];if(first){const found=app.findObject?.({objectId:first.id});if(found)app.selectOnly?.(found.layer.id,first.id);}app.fitContent?.();return{changed:Boolean(result.paths?.length),result:{count:result.paths?.length||0,batchId:result.batchId||null}};};
  const requireStudio=()=>{const api=studio();if(!api)throw new Error('Studio 功能目前不可用');return api;};
  const booleanOperation=operation=>{requireStudio().boolean(operation);return{changed:true,result:{operation}};};
  const repeatOperation=mode=>{requireStudio().repeat(mode);return{changed:true,result:{mode}};};
  const expandRepeat=()=>{requireStudio().expandRepeat();return{changed:true,result:{mode:'expand'}};};
  const vectorMask=()=>{const api=requireStudio();if(typeof api.vectorMask!=='function')throw new Error('Path 向量遮色片目前不可用');api.vectorMask();return{changed:true,result:{mask:'vector'}};};
  const normalizeExportOptions=options=>({format:options?.format||'png',scope:options?.scope||'artboard',scale:Number(options?.scale)||2,ppi:Number(options?.ppi)||300,includeBleed:Boolean(options?.includeBleed),cropMarks:Boolean(options?.cropMarks),background:options?.background!==false});
  const resolveExportRequest=options=>app.resolveExportRequest?.(normalizeExportOptions(options),{entry:'modular'})||null;
  const exportDocument=async(options,lifecycle={})=>{const run=app.runExportRequest||app.runExport;if(typeof run!=='function')throw new Error('匯出功能目前不可用');const result=await run.call(app,{...normalizeExportOptions(options),entryPolicy:'modular'},lifecycle);return{changed:false,result};};
  const cancelExport=requestId=>app.cancelExport?.(requestId)||{cancelled:false,requestId:requestId||null,reason:'unavailable'};
  const toggleFullscreen=()=>app.toggleFullscreen?.();

  const penProfile=()=>clone(app.penInput?.profile||{});
  const preferencesSnapshot=()=>{
    const page=app.page?.()||{},paper=clone(page.paper||{}),artboard=clone(page.artboard||{}),workspace=clone(page.workspace||{}),snap=clone(page.snap||{}),categories=snap.categories||{},guides=clone(page.guides||[]);
    return{
      historyLimit:app.history?.limit||30,renderPreference:app.renderPreference||'auto',fingerDraw:Boolean(app.fingerDraw),
      paper,artboard,layoutViewport:clone(workspace.layoutViewport||{}),snap,
      smartGuides:Boolean(categories.guides||categories.edges||categories.centers||categories.equalDistance),
      guidesVisible:guides.some(guide=>guide.visible!==false),guideCount:guides.length,rulersVisible:readRulers(),toolbarLayout:readToolbarLayout(),
      penProfile:penProfile(),pen:app.penInput?.diagnostics?.()||null,
      renderer:app.renderer?.naturalMedia?.diagnostics?.()||null,updates:app.updates?.diagnostics?.()||null
    };
  };
  const setValue=(key,value)=>{
    const page=app.page?.();if(!page)throw new Error('Page unavailable');
    if(key==='historyLimit'){app.setHistoryLimit?.(Number(value));return;}
    if(key==='renderPreference'){app.setRenderPreference?.(String(value));return;}
    if(key==='fingerDraw'){app.fingerDraw=Boolean(value);app.commands?.notify?.('native-finger-draw');return;}
    if(key==='rulersVisible'){setRulersVisible(value);return;}
    if(key==='toolbarLayout'){setToolbarLayout(value);return;}
    if(key==='guidesVisible'){for(const guide of page.guides||[])run('guide.visibility.set.v1',{guideId:guide.id,visible:Boolean(value)});return;}
    if(key==='smartGuides'){for(const category of ['guides','edges','centers','equalDistance'])run('page.snap.set.v1',{key:category,value:Boolean(value)});return;}
    if(key.startsWith('snap.')){run('page.snap.set.v1',{key:key.slice(5),value:Boolean(value)});return;}
    if(key.startsWith('paper.')){run('page.paper.set.v1',{key:key.slice(6),value});return;}
    if(key.startsWith('artboard.')){run('page.artboard.set.v1',{key:key.slice(9),value});return;}
    if(key.startsWith('viewport.')){const prop=key.slice(9),next={[prop]:prop==='rotation'?Number(value)*Math.PI/180:Number(value)};app.commitLayoutViewport?.(next);return;}
    if(key.startsWith('pen.')){app.updatePenProfile?.(key.slice(4),value);return;}
    throw new Error('未知偏好設定：'+key);
  };
  const applyPreferences=values=>{for(const [key,value] of Object.entries(values||{}))if(value!==undefined)setValue(key,value);app.commands?.notify?.('native-preferences');return preferencesSnapshot();};
  const preferenceAction=async action=>{
    if(action==='reset-view')return run('view.reset.v1');
    if(action==='fit-artboard')return run('view.fit.artboard.v1');
    if(action==='fit-viewport')return app.fitLayoutViewportToContent?.();
    if(action==='reset-viewport')return app.resetLayoutViewport?.();
    if(action==='pen-check')return app.runPenCalibrationCheck?.();
    if(action==='pen-reset')return app.resetPenCalibration?.();
    if(action==='gpu-check')return app.runGPUValidation?.();
    if(action==='release-health')return await app.runReleaseHealthCheck?.();
    if(action==='storage-health')return await app.runStorageHealthCheck?.();
    if(action==='download-diagnostics')return await app.downloadExternalDiagnosticBundle?.();
    if(action==='check-update'){const result=await app.updates?.checkForUpdate?.();app.refreshReleaseHealthUI?.(result);return result;}
    if(action==='activate-update')return{activated:Boolean(app.updates?.activateUpdate?.())};
    throw new Error('未知偏好設定動作：'+action);
  };
  const penDiagnostics=()=>app.penInput?.diagnostics?.()||null;
  const resetPenCalibration=()=>{app.resetPenCalibration?.();return penDiagnostics();};
  const diagnostics=()=>({document:app.documentIntegrity?.(),renderer:app.renderer?.naturalMedia?.diagnostics?.(),storage:app.store?.diagnostics?.(),updates:app.updates?.diagnostics?.(),pen:penDiagnostics()});
  return Object.freeze({schema:'INK-UI-B-002-NATIVE-APP',version:4,enterPathEdit,enterStrokeEdit,frameSelection,importImage,importSvg,importReference,resolveExportRequest,exportDocument,cancelExport,toggleFullscreen,preferencesSnapshot,applyPreferences,preferenceAction,penDiagnostics,resetPenCalibration,diagnostics,vectorMask,booleanUnion:()=>booleanOperation('union'),booleanDifference:()=>booleanOperation('difference'),booleanIntersection:()=>booleanOperation('intersection'),booleanXor:()=>booleanOperation('xor'),repeatRadial:()=>repeatOperation('radial'),repeatMirror:()=>repeatOperation('mirror'),repeatGrid:()=>repeatOperation('grid'),repeatExpand:expandRepeat});
}
