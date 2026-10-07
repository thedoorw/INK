import { INK_VERSION, BUILD_ID, FORMAT_VERSION } from '../src/config.js';
import { Matrix as M, uid } from '../src/core/index.js';
import {
  defaultDocument, inspectDocument, walkPageObjects,
  artboardTrimBounds, artboardBleedBounds, artboardExportGeometry, artboardPixelSize,
  normalizeArtboard, normalizeLayoutViewport, workspaceDiagnostics
} from '../src/document/index.js';
import { inspectComposition } from '../src/editor/index.js';
import { PersistentTileAtlas, createTilePlan } from '../src/render/index.js';
import { buildExternalDiagnosticBundle } from '../src/release/index.js';

/**
 * Browser Runtime QA bridge.
 *
 * This module is never part of normal bootstrap. src/ink.js loads it only when
 * the explicit QA boundary is enabled by ?ink-qa=1 or __INK_ENABLE_TEST_BRIDGE__.
 */
export function installRuntimeQaBridge(app, target = globalThis) {
  if (target.INK_TEST) return target.INK_TEST;
  const bridge={
    version:INK_VERSION,
    app,
    fresh(){app.replaceDocument(defaultDocument());app.history.clear();return true;},
    addDemo(){const p=app.page(),l=app.layer();app.history.pushScoped('測試內容',[app.layerObjectsPath(l)],()=>{l.objects.push({id:uid(),type:'stroke',matrix:M.translate(-130,-35),opacity:1,color:'#202020',size:12,kind:'brush',smoothing:.5,pressure:.9,taper:.5,points:[{x:0,y:0,p:.2},{x:35,y:-35,p:.8},{x:90,y:15,p:1},{x:145,y:-25,p:.65},{x:220,y:10,p:.25}]},{id:uid(),type:'shape',shape:'ellipse',matrix:M.translate(-80,45),opacity:1,color:'#2f718f',fillColor:'#2f718f',fill:true,size:3,w:160,h:90},{id:uid(),type:'text',matrix:M.translate(-62,95),opacity:1,text:'INK v0.1',color:'#fffef9',fontFamily:'system-ui',fontSize:26,lineHeight:1.2});});app.refreshAll();return l.objects.length;},
    summary(){const p=app.page();return{title:app.doc.title,pages:app.doc.pages.length,layers:p.layers.length,objects:p.layers.reduce((n,l)=>n+l.objects.length,0),tool:app.tool,selection:app.selection.length,undo:app.history.undoStack.length,redo:app.history.redoStack.length,historyLimit:app.history.limit,historyMode:app.history.stats().mode,inputPointers:app.input.size};},
    workspace(){return workspaceDiagnostics(app.page());},
    fullscreen(){return{supported:Boolean((app.el.app.requestFullscreen||app.el.app.webkitRequestFullscreen)&&(document.exitFullscreen||document.webkitExitFullscreen)),active:Boolean(app.fullscreenElement())};},
    reorderLayer(sourceId,targetId,position='before'){return app.reorderLayer(sourceId,targetId,position);},
    layoutViewport(){return normalizeLayoutViewport(app.workspace().layoutViewport);},
    fitLayoutViewport(){return app.fitLayoutViewportToContent({commit:false});},
    setLayoutViewport(values={}){app.workspace().layoutViewport=normalizeLayoutViewport({...app.workspace().layoutViewport,...values});app.renderer.invalidateTiles();app.refreshArtboardUI();app.renderer.render();return this.layoutViewport();},
    eraserMetrics(){const radiusWorld=app.eraserRadiusWorld(),screenScale=app.renderer.worldScreenScale();return{radiusWorld,diameterWorld:radiusWorld*2,screenScale,radiusScreen:radiusWorld*screenScale,diameterScreen:radiusWorld*2*screenScale};},
    switchWorkspace(space='creation'){return app.switchWorkspace(space,{fit:false,announce:false});},
    artboard(){const page=app.page();return{...page.artboard,pixels:artboardPixelSize(page,{ppi:page.artboard.ppi}),trim:artboardTrimBounds(page),bleed:artboardBleedBounds(page,true)};},
    setArtboard(values={}){app.page().artboard=normalizeArtboard({...app.page().artboard,...values});app.renderer.invalidateTiles();app.refreshArtboardUI();app.fitArtboard();return this.artboard();},
    exportGeometry(options={}){return artboardExportGeometry(app.page(),options);},
    async renderA4Export(ppi=300){const canvas=await app.renderExportCanvas({scope:'artboard',ppi,includeBleed:false,cropMarks:false,background:true});const result={width:canvas.width,height:canvas.height,physical:canvas.inkPhysical||null,tiled:Boolean(app.activeExportJob),job:app.activeExportJob?.diagnostics?.()||null};canvas.width=1;canvas.height=1;app.activeExportJob=null;return result;},
    async pdfInfo(ppi=150){const blob=await app.exportPDF({scope:'artboard',ppi,includeBleed:false,cropMarks:false,background:true});const bytes=new Uint8Array(await blob.slice(0,8).arrayBuffer());return{size:blob.size,type:blob.type,header:String.fromCharCode(...bytes)};},
    liveTiles(){app.renderer.render();return app.renderer.liveTileDiagnostics();},
    selectAll(){app.selection=[];for(const l of app.page().layers)for(const o of l.objects)app.selection.push({layerId:l.id,objectId:o.id});app.refreshSelectionUI();app.renderer.render();return app.selection.length;},
    bounds(){return app.renderer.selectionWorldBounds();},
    align(mode){app.alignSelection(mode);return this.bounds();},
    nudge(dx,dy){app.translateSelection(dx,dy,'測試微移');return this.bounds();},
    exportSVG(){return app.exportSVG({scope:'content',background:true});},
    undo(){app.history.undo();return this.summary();},redo(){app.history.redo();return this.summary();},historyTimeline(){return app.history.timeline();},jumpHistory(position){app.history.jumpTo(position);return this.summary();},setHistoryLimit(limit){return app.setHistoryLimit(limit);},
    addEditableStroke(){const layer=app.layer();let object;app.history.pushScoped('新增可編輯筆畫',[app.layerObjectsPath(layer)],()=>{object={id:uid(),type:'stroke',name:'測試筆畫',matrix:M.translate(-180,0),opacity:1,color:'#202020',size:9,kind:'pen',smoothing:.5,pressure:.8,taper:.1,points:[{x:0,y:0,p:.3,t:0},{x:55,y:-45,p:.7,t:20},{x:115,y:30,p:1,t:45},{x:180,y:-15,p:.65,t:70},{x:250,y:20,p:.3,t:95}]};layer.objects.push(object);app.selection=[{layerId:layer.id,objectId:object.id}];});app.refreshAll();return{layerId:layer.id,objectId:object.id,points:object.points.length};},
    enterStrokeEdit(){return app.enterStrokeEdit();},
    selectStrokeSegment(index=1,t=.5){const found=app.editableStroke();if(!found)return false;app.strokeEdit.segmentIndex=Math.max(0,Math.min(found.object.points.length-2,index));app.strokeEdit.segmentT=t;app.strokeEdit.nodeIndices=new Set();app.refreshSelectionUI();app.renderer.render();return true;},
    splitStroke(){app.splitEditedStroke();return this.summary();},
    selectStrokeNode(index=1){const found=app.editableStroke();if(!found)return false;app.strokeEdit.nodeIndices=new Set([Math.max(0,Math.min(found.object.points.length-1,index))]);app.strokeEdit.segmentIndex=null;app.refreshSelectionUI();app.renderer.render();return true;},
    moveSelectedNodes(dx=20,dy=-10){const found=app.editableStroke();if(!found)return false;app.history.pushScoped('測試移動節點',[app.objectPath(found)],()=>{for(const index of app.strokeEdit.nodeIndices){found.object.points[index].x+=dx;found.object.points[index].y+=dy;}});app.spatialDirty=true;app.refreshAll();return true;},
    eraseAt(x=0,y=0,radius=20){app.history.begin('測試局部擦除',{targets:app.page().layers.map(layer=>app.layerObjectsPath(layer))});const changed=app.eraseAt({x,y},radius);changed?app.history.commit():app.history.cancel();app.refreshAll();return{changed,objects:app.page().layers.reduce((n,l)=>n+l.objects.length,0)};},
    addManyStrokes(count=1000){const layer=app.layer(),columns=Math.max(1,Math.ceil(Math.sqrt(count)));app.history.pushScoped('建立空間索引測試',[app.layerObjectsPath(layer)],()=>{for(let index=0;index<count;index++){const col=index%columns,row=Math.floor(index/columns);layer.objects.push({id:uid(),type:'stroke',name:'索引測試',matrix:M.translate(col*24-columns*12,row*18-columns*9),opacity:1,color:'#2d2d29',size:2,kind:'pen',smoothing:.4,pressure:.2,taper:0,points:[{x:0,y:0,p:.5,t:0},{x:12,y:6,p:.5,t:10}]});}});app.refreshAll();return app.rebuildSpatialIndex().stats();},
    loadStress(count=10000){app.replaceDocument(defaultDocument());const layer=app.layer(),columns=Math.max(1,Math.ceil(Math.sqrt(count))),started=performance.now();for(let index=0;index<count;index++){const col=index%columns,row=Math.floor(index/columns);layer.objects.push({id:`stress-${index}`,type:'stroke',name:'壓力測試',matrix:M.translate(col*18-columns*9,row*14-columns*7),opacity:1,color:'#2d2d29',size:1.5,kind:'pen',smoothing:.4,pressure:.2,taper:0,points:[{x:0,y:0,p:.5,t:0},{x:10,y:4,p:.5,t:10}]});}app.spatialDirty=true;const buildStart=performance.now(),stats=app.ensureSpatialIndex().stats(),buildMs=performance.now()-buildStart,queryStart=performance.now(),candidates=app.ensureSpatialIndex().query({x:-50,y:-50,w:100,h:100}).length,queryMs=performance.now()-queryStart;return{count,createMs:buildStart-started,buildMs,queryMs,candidates,stats};},
    spatial(){return app.rebuildSpatialIndex().stats();},
    spatialQuery(bounds={x:-50,y:-50,w:100,h:100}){return app.ensureSpatialIndex().query(bounds).map(item=>item.object.id);},
    incrementalMove(dx=200,dy=0){const found=app.selectedObjects()[0];if(!found)return null;app.ensureSpatialIndex();found.object.matrix=M.multiply(M.translate(dx,dy),found.object.matrix);app.queueSpatialObject({objectId:found.object.id});return app.ensureSpatialIndex().stats();},
    insertStrokeNode(){app.insertEditedNode();const found=app.editableStroke();return found?{points:found.object.points.length,selected:[...app.strokeEdit.nodeIndices]}:null;},
    setStrokeNodeMode(mode='smooth'){app.setEditedNodeMode(mode);const found=app.editableStroke(),index=[...(app.strokeEdit?.nodeIndices||[])][0];return found&&Number.isInteger(index)?found.object.points[index]:null;},
    setSegmentStyle(color='#b63c36',size=18){app.changeSelectedSegmentStyle('color',color,true);app.changeSelectedSegmentStyle('size',size,true);const found=app.editableStroke();return found?.object.segmentStyles?.[app.strokeEdit.segmentIndex]||null;},
    addNaturalMediaShowcase(){app.replaceDocument(defaultDocument());const layer=app.layer();const strokes=[
      {kind:'brush',color:'#202020',size:28,flow:.78,wetness:.82,bristle:.18,grain:.14,y:-80},
      {kind:'drybrush',color:'#5d3f2d',size:34,flow:.64,wetness:.06,bristle:.88,grain:.86,y:0},
      {kind:'airbrush',color:'#2f718f',size:48,flow:.35,wetness:0,bristle:0,grain:.05,softness:.9,y:80}
    ];for(const spec of strokes)layer.objects.push({id:uid(),type:'stroke',name:'GPU 媒材測試',matrix:M.translate(-260,spec.y),opacity:1,color:spec.color,size:spec.size,kind:spec.kind,smoothing:.48,pressure:.92,taper:.28,flow:spec.flow,wetness:spec.wetness,bristle:spec.bristle,grain:spec.grain,softness:spec.softness??.72,mediaModel:'natural-v2',points:[{x:0,y:0,p:.2,t:0},{x:80,y:-32,p:.75,t:20},{x:170,y:24,p:1,t:45},{x:270,y:-18,p:.72,t:70},{x:390,y:12,p:.25,t:100}]});app.spatialDirty=true;app.renderer.naturalMedia.clearCaches();app.resetView();app.fitContent();app.renderer.render();app.refreshAll();return layer.objects.length;},
    addWetInteractionShowcase(){app.replaceDocument(defaultDocument());const page=app.page(),layer=app.layer();Object.assign(page.paper,{absorbency:.68,roughness:.54,fiberStrength:.46,fiberAngle:18,sizing:.2,granulation:.48,textureVisible:true});const specs=[{id:'wet-black',color:'#202020',y:-12,wetness:.9,flow:.74,size:34},{id:'wet-blue',color:'#2f718f',y:12,wetness:.82,flow:.62,size:30}];for(const spec of specs)layer.objects.push({id:spec.id,type:'stroke',name:'濕墨互動',matrix:M.translate(-220,spec.y),opacity:1,color:spec.color,size:spec.size,kind:'brush',smoothing:.5,pressure:.94,taper:.28,flow:spec.flow,wetness:spec.wetness,bristle:.16,grain:.22,softness:.72,mediaModel:'natural-v2',points:[{x:0,y:0,p:.25,t:0},{x:90,y:-28,p:.72,t:20},{x:190,y:22,p:1,t:48},{x:300,y:-12,p:.7,t:72},{x:430,y:8,p:.28,t:100}]});app.spatialDirty=true;app.renderer.paperTextureCache.clear();app.renderer.naturalMedia.clearCaches();app.fitContent();app.renderer.render();app.refreshAll();return{objects:layer.objects.length,paper:{...page.paper},render:app.renderer.naturalMedia.diagnostics()};},
    paperProfile(){return{...app.page().paper};},
    setPaperProfile(profile={}){for(const[key,value]of Object.entries(profile))if(key in app.page().paper)app.page().paper[key]=value;app.renderer.paperTextureCache.clear();app.renderer.naturalMedia.clearCaches();app.refreshPaperUI();app.renderer.render();return{...app.page().paper};},
    setRenderMode(mode='auto'){app.setRenderPreference(mode);return app.renderer.naturalMedia.diagnostics();},
    renderEngine(){app.renderer.render();app.refreshRenderEngineUI();return app.renderer.naturalMedia.diagnostics();},
    forceRenderFallback(reason='test'){app.renderer.naturalMedia.forceFallback(reason);app.renderer.render();app.refreshRenderEngineUI();return app.renderer.naturalMedia.diagnostics();},
    retryGPU(){const result=app.renderer.naturalMedia.retryGPU();app.renderer.render();app.refreshRenderEngineUI();return{result,...app.renderer.naturalMedia.diagnostics()};},
    gpuValidation(){return app.runGPUValidation();},
    penCalibration(){return app.penInput.diagnostics();},
    setPenProfile(profile={}){const result=app.penInput.setProfile(profile);app.refreshPenCalibrationUI();return result;},
    simulatePenSample(sample={}){return app.penInput.normalizeEvent({pointerId:sample.pointerId??91,pointerType:'pen',pressure:sample.pressure??.5,tiltX:sample.tiltX??0,tiltY:sample.tiltY??0,twist:sample.twist??0,timeStamp:sample.timeStamp??performance.now()});},
    tilePlan(width=5000,height=3000,scale=2){return createTilePlan({x:0,y:0,w:width,h:height},scale,{tileSize:2048,overlap:48});},
    storageHealth(){return app.runStorageHealthCheck();},
    documentIntegrity(){return inspectDocument(app.doc);},
    runtimeHealth(){return app.health.diagnostics();},
    releaseHealth(){return app.runReleaseHealthCheck();},
    updateStatus(){return app.updates.diagnostics();},
    externalDiagnostics(){return buildExternalDiagnosticBundle({app,target,recorder:app.externalValidation,version:INK_VERSION,buildId:BUILD_ID,formatVersion:FORMAT_VERSION});},
    createTileAtlas(width=4096,height=3072,scale=1){app.tileAtlas?.clear?.();app.tileAtlas=new PersistentTileAtlas({bounds:{x:0,y:0,w:width,h:height},scale,tileSize:1024,overlap:32,budgetBytes:32*1024*1024});return app.tileAtlas.diagnostics();},
    tileAtlas(){return app.tileAtlas?.diagnostics?.()||null;},
    frameSelection(options={}){const frame=app.frameSelection(options);return frame?{id:frame.id,width:frame.width,height:frame.height,children:frame.children.map(child=>child.id)}:null;},
    hierarchy(){return walkPageObjects(app.page()).map(item=>({id:item.object.id,type:item.object.type,layerId:item.layer.id,parentId:item.parentObject?.id||null,depth:item.depth,worldMatrix:item.worldMatrix}));},
    composition(){return inspectComposition(app.page());},
    reparent(objectId,frameId=null){const moved=app.reparentObjectToFrame(objectId,frameId);return moved?{id:moved.object.id,parentId:moved.parentObject?.id||null,worldMatrix:moved.worldMatrix}:null;},
    hitAt(x=0,y=0,deep=false){const hit=app.hitTest({x,y},{deep});return hit?{id:hit.object.id,type:hit.object.type,parentId:hit.parentObject?.id||null}:null;},
    architecture(){return{version:INK_VERSION,buildId:BUILD_ID,formatVersion:FORMAT_VERSION,inventory:'partial-runtime-capability-tags',complete:false,note:'Partial active runtime capability tags; not an exhaustive source-module inventory.',modules:['core','document','storage-v3-checkpointed','history-target-scoped-id-aware','history-panel-step-navigation','input','stroke-bezier','spatial-incremental','selection','frame-hierarchy','transform','path-editing-core','expressive-stroke-core','render-contract','paper-profile','multi-channel-ink','natural-media-webgl2','natural-media-mrt','gpu-resource-budget','dirty-region','persistent-tile-atlas-core','live-canvas-tile-renderer','dual-workspace','layout-model-viewport','fullscreen-shell','layer-drag-reorder','a4-artboard','pdf-output','resumable-tiled-export','pen-calibration','canvas2d-fallback','canvas2d-multichannel','document-integrity','runtime-health','external-diagnostics','service-worker-update','flora-action-layer','flora-hero-structure-mask','flora-region-painting'],render:app.renderer.naturalMedia.diagnostics(),liveTiles:app.renderer.liveTileDiagnostics(),workspace:workspaceDiagnostics(app.page()),artboard:{...app.page().artboard},history:app.history.stats(),inputArbiter:app.input.constructor.name,spatial:app.ensureSpatialIndex().stats()};}
  };
  target.INK_TEST = bridge;
  return bridge;
}
