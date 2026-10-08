import { INK_VERSION, BUILD_ID, FORMAT_VERSION } from './config.js';
import { installFloraActionLayer } from './flora/index.js';
import { normalizedPointToWorld, traceVectorMaskWorld, traceVectorPathWorld } from './flora/mask/vector-mask.js';
import {
  Matrix as M, boundsContains, boundsIntersect, clamp, deepClone, deg, distance,
  lerp, nowISO, pointSegmentDistance, polygonContains, rad, transformBounds,
  uid, unionBounds
} from './core/index.js';
import {
  InkStore, installRevision, activeLayer, activePage, allObjects, defaultDocument, defaultPage, defaultLayer, documentColorStateFromPayload, sanitizeDocument, inspectDocument,
  createFrame, comparePageObjectHitOrder, findPageObject, reparentPageObject, walkPageObjects,
  artboardTrimBounds, artboardBleedBounds, artboardSafeBounds, artboardExportGeometry, artboardPixelSize,
  describeArtboard, mmToWorld, normalizeArtboard, normalizeLayoutViewport, activateWorkspace, ensureWorkspace, workspaceDiagnostics, workspaceSpace, clampViewScale, thumbnailPreviewGeometry
} from './document/index.js';
import { isComponentInstance, resolveComponentInstance, registerComponentDefinition, createComponentInstance, setComponentOverride, detachComponentInstance, duplicateComponentDefinition, repairComponentReference } from './document/components.js';
import { HistoryManager } from './history/index.js';
import { InputArbiter } from './input/input-arbiter.js';
import { PenInputCalibrator, normalizePenProfile } from './input/pen-calibration.js';
import { clearStrokeSegmentStyle, deleteStrokeNodes, eraseStrokeWithCircle, insertStrokeNode, moveStrokeHandle, nearestStrokeCurveSegment, nearestStrokeNode, sampleStrokePath, sampleStrokeSegment, segmentStyleAt, setStrokeNodeMode, setStrokeSegmentStyle, simplifyStrokePoints, splitStrokeAtSegment } from './stroke/index.js';
import { PageSpatialIndex } from './spatial/index.js';
import { addRulerGuide, applyObjectMatrices, applyWorldTransformBatch, assertFinitePathGeometry, cloneInitialMatrices, collapseTransformRoots, frameWorldGeometryBounds, groupWorldGeometryBounds, installChatBoundedEdit, installChatCreativePlan, installCreativeWorkspace, installExpressiveStroke, installPathEditing, installRepaintMaterial, inspectComposition, lassoCandidates, marqueeCandidates, moveRulerGuide, nonSingularScaleComponent, normalizeSnapSettings, polygonBounds, preflightObjectMatrices, regenerateCompositionIds, removeRulerGuide, resolveCompositionSelection, resolveSnappedRotation, resolveSnappedTranslation, resizeFrameGeometry, selectionWorldGeometryBounds, setRulerGuideLocked, setRulerGuideVisibility, setSnapCategory, setSnapEnabled } from './editor/index.js';
import { LiveCanvasTileRenderer, NaturalMediaController, PersistentTileAtlas, TiledExportCancelledError, TiledExportJob, createTilePlan, paperProfileFingerprint, paperSampleAt, renderTiledCanvas } from './render/index.js';
import { canvasToPdfBlob } from './export/index.js';
import { ExternalValidationRecorder, RuntimeHealthMonitor, buildExternalDiagnosticBundle } from './release/index.js';
import { installInkPublicCreativeApi } from './agent/index.js';
import { installConfiguredRuntimeBridge } from './agent/runtime-bridge-startup.js';
import { createTextObject, updateTextObject } from './editor/text-object.js';
import { layoutTextOnPath } from './editor/text-layout.js';
import { ServiceWorkerUpdateManager } from './pwa/index.js';
import { installStudioCore } from './studio-core.js';
import { installExtraction } from './extraction/install.js';
import { installChatReferenceHandoff } from './ai/chat-reference-handoff.js';
import { drawExpressivePathStroke, flattenSubpath, moveAnchor as movePathAnchor, moveBezierHandle as movePathBezierHandle, pathBounds, pathStrokeRenderWidth, repeatTransforms, tracePath, vectorObjectToSVG } from './vector/vector-core.js';
import { resolvePathPaintAppearance } from './vector/paint-appearance.js';
import { PNGWorkerEncoder } from './export/png-worker-encoder.js';
import { BUILTIN_BRUSH_PRESETS as ENGINE_BRUSH_PRESETS } from './paint/brush-engine.js';
import { decodeFormat as decodeImageFormatCore, documentImageStateToFormatPayload, encodeFormat as encodeImageFormatCore, formatPayloadToDocumentImageState, probeFormat as probeImageFormat, webRasterImageDataToDocumentState } from './image/image-core.js';
import { installCommandAuthority } from './editor/command-authority.js';
import { installFunctionModuleComposition, bindTranslationFunctionProvider } from './editor/function-modules/composition.js';
import { createMinimalComposition } from './ui/minimal-composition.js';

const $=(s,r=document)=>r.querySelector(s);
const fileSafe=s=>(s||'INK').replace(/[\\/:*?"<>|]+/g,'_').trim()||'INK';
const escapeXML=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const hexAlpha=(hex,alpha)=>{const h=hex.replace('#','');const full=h.length===3?h.split('').map(x=>x+x).join(''):h.slice(0,6);return `rgba(${parseInt(full.slice(0,2),16)},${parseInt(full.slice(2,4),16)},${parseInt(full.slice(4,6),16)},${clamp(alpha,0,1)})`;};

const TOOL_NAMES={pen:'鋼筆',pencil:'鉛筆',marker:'麥克筆',brush:'毛筆',airbrush:'噴筆',eraser:'橡皮擦',select:'選取',lasso:'套索',shape:'幾何',text:'文字',image:'圖片',pan:'移動畫布'};
const DRAW_TOOLS=new Set(['pen','pencil','marker','brush','airbrush']);
const BRUSH_PRESETS={
  pen:[
    {id:'pen-fineliner',name:'針筆',size:2,opacity:1,smoothing:.66,pressure:.15,kind:'pen',taper:.04,preview:.32},
    {id:'pen-dynamic',name:'動態鋼筆',size:4,opacity:1,smoothing:.58,pressure:.82,kind:'pen',taper:.16,preview:.52},
    {id:'pen-bold',name:'粗鋼筆',size:10,opacity:1,smoothing:.48,pressure:.72,kind:'pen',taper:.1,preview:.84}
  ],
  pencil:[
    {id:'pencil-hb',name:'HB',size:2.2,opacity:.72,smoothing:.42,pressure:.7,kind:'pencil',grain:.42,preview:.34},
    {id:'pencil-4b',name:'4B',size:5,opacity:.64,smoothing:.35,pressure:.86,kind:'pencil',grain:.68,preview:.62},
    {id:'pencil-block',name:'碳棒',size:16,opacity:.52,smoothing:.28,pressure:.9,kind:'pencil',grain:.82,preview:.92}
  ],
  marker:[
    {id:'marker-round',name:'圓頭',size:18,opacity:.3,smoothing:.62,pressure:.08,kind:'marker',preview:.65},
    {id:'marker-wide',name:'寬頭',size:38,opacity:.24,smoothing:.55,pressure:.1,kind:'marker',preview:.92},
    {id:'marker-solid',name:'實色',size:13,opacity:.72,smoothing:.58,pressure:.22,kind:'marker',preview:.55}
  ],
  brush:[
    {id:'brush-round',name:'圓鋒',size:12,opacity:.88,smoothing:.46,pressure:.95,kind:'brush',taper:.42,flow:.82,wetness:.36,bristle:.18,preview:.65},
    {id:'brush-dry',name:'乾筆',size:24,opacity:.55,smoothing:.36,pressure:.9,kind:'drybrush',grain:.8,taper:.32,flow:.58,wetness:.08,bristle:.78,preview:.9},
    {id:'brush-letter',name:'書寫',size:8,opacity:.95,smoothing:.54,pressure:1,kind:'brush',taper:.58,flow:.94,wetness:.22,bristle:.28,preview:.5},
    {id:'brush-wet-ink',name:'濕墨',size:18,opacity:.78,smoothing:.5,pressure:.96,kind:'brush',taper:.38,flow:.72,wetness:.84,bristle:.16,grain:.18,mediaModel:'natural-v2',preview:.82}
  ],
  airbrush:[
    {id:'air-soft',name:'柔霧',size:42,opacity:.09,smoothing:.7,pressure:.55,kind:'airbrush',softness:.9,preview:.7},
    {id:'air-medium',name:'中霧',size:25,opacity:.15,smoothing:.62,pressure:.66,kind:'airbrush',softness:.7,preview:.52},
    {id:'air-detail',name:'細霧',size:11,opacity:.2,smoothing:.58,pressure:.78,kind:'airbrush',softness:.5,preview:.35}
  ]
};

function stabilizePoints(points,smoothing=.5){
  if(points.length<2)return points;
  const minStep=.35;const reduced=[points[0]];
  for(let i=1;i<points.length;i++){if(distance(points[i],reduced[reduced.length-1])>=minStep||i===points.length-1)reduced.push(points[i]);}
  if(reduced.length<3)return reduced;
  const strength=clamp(smoothing,0,.95);const alpha=lerp(.78,.16,strength);const out=[{...reduced[0]}];
  let sx=reduced[0].x,sy=reduced[0].y,sp=reduced[0].p;
  for(let i=1;i<reduced.length;i++){sx=lerp(sx,reduced[i].x,alpha);sy=lerp(sy,reduced[i].y,alpha);sp=lerp(sp,reduced[i].p,Math.max(alpha,.3));out.push({...reduced[i],x:sx,y:sy,p:sp});}
  out[out.length-1]={...reduced[reduced.length-1]};return out;
}
function strokeWidthAt(o,p,i,count){
  const influence=clamp(o.pressure??.8,0,1);const pressure=clamp(p.p??.5,.03,1);let w=o.size*((1-influence)+influence*(.18+.96*pressure));
  if(o.kind==='marker')w=o.size*((1-influence)+influence*(.8+.2*pressure));
  if(o.kind==='pencil')w*=.72+.38*pressure;
  if(o.kind==='brush'||o.kind==='drybrush'){
    const taper=o.taper??.35;const edge=Math.min(i/Math.max(1,count*.12),(count-1-i)/Math.max(1,count*.16),1);w*=lerp(1,Math.max(.12,edge),taper);
    const pts=o.points||[];if(i>0&&pts[i-1]){const dt=Math.max(1,(p.t??i*8)-(pts[i-1].t??(i-1)*8)),speed=distance(p,pts[i-1])/dt;w*=lerp(1.08,.68,clamp(speed/.9,0,1));}
  }
  return Math.max(.25,w);
}
function strokeOutline(o){
  const source=o.points||[];if(!source.length)return[];
  const pts=source.length>1?sampleStrokePath(o,Math.max(.8,(o.size||2)*.28)):source;
  const sampled={...o,points:pts};
  if(pts.length===1){const r=strokeWidthAt(sampled,pts[0],0,1)/2;return Array.from({length:16},(_,i)=>({x:pts[0].x+Math.cos(i/16*Math.PI*2)*r,y:pts[0].y+Math.sin(i/16*Math.PI*2)*r}));}
  const left=[],right=[];for(let i=0;i<pts.length;i++){const prev=pts[Math.max(0,i-1)],next=pts[Math.min(pts.length-1,i+1)];let dx=next.x-prev.x,dy=next.y-prev.y;const l=Math.hypot(dx,dy)||1;dx/=l;dy/=l;const nx=-dy,ny=dx,r=strokeWidthAt(sampled,pts[i],i,pts.length)/2;left.push({x:pts[i].x+nx*r,y:pts[i].y+ny*r});right.push({x:pts[i].x-nx*r,y:pts[i].y-ny*r});}return left.concat(right.reverse());
}
function localBounds(o,measureCtx){
  if(o.type==='stroke'){const pts=(o.points?.length>1?sampleStrokePath(o,Math.max(1,(o.size||2)*.35)):o.points)||[{x:0,y:0}],pad=(o.size||1)*.9;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const p of pts){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}return{x:minX-pad,y:minY-pad,w:maxX-minX+pad*2,h:maxY-minY+pad*2};}
  if(o.type==='shape'){
    if(o.shape==='line'||o.shape==='arrow'){const minX=Math.min(0,o.x2),minY=Math.min(0,o.y2),pad=(o.size||1)*1.5;return{x:minX-pad,y:minY-pad,w:Math.abs(o.x2)+pad*2,h:Math.abs(o.y2)+pad*2};}
    const x=Math.min(0,o.w),y=Math.min(0,o.h);return{x,y,w:Math.abs(o.w),h:Math.abs(o.h)};
  }
  if(o.type==='image')return{x:0,y:0,w:o.w||1,h:o.h||1};
  if(o.type==='text'){const size=o.fontSize||32;measureCtx.save();measureCtx.font=`${o.fontWeight||400} ${size}px ${o.fontFamily||'system-ui'}`;const lines=String(o.text||'').split('\n');const w=Math.max(1,...lines.map(s=>measureCtx.measureText(s||' ').width));measureCtx.restore();return{x:0,y:-size*.84,w,h:Math.max(size,lines.length*size*(o.lineHeight||1.25))};}
  if(o.type==='frame')return{x:0,y:0,w:Math.max(1,o.width||1),h:Math.max(1,o.height||1)};
  if(o.type==='path'){const b=pathBounds(o,M.identity()),pad=pathStrokeRenderWidth(o)/2;return{x:b.x-pad,y:b.y-pad,w:b.w+pad*2,h:b.h+pad*2};}
  return{x:0,y:0,w:1,h:1};
}
const matrixRotation=m=>Math.atan2(m?.[1]||0,m?.[0]||1);
const displayNumber=v=>Number.isFinite(v)?Number(v.toFixed(1)):'';
const layoutViewportMatrix=page=>{const viewport=normalizeLayoutViewport(page?.workspace?.layoutViewport||{});return M.multiply(M.rotate(viewport.rotation),M.multiply(M.scale(viewport.scale),M.translate(-viewport.x,-viewport.y)));};

class Renderer{
  constructor(app,canvas,wrap){this.app=app;this.canvas=canvas;this.wrap=wrap;this.ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});this.dpr=1;this.width=1;this.height=1;this.imageCache=new Map();this.paperTextureCache=new Map();this.measureCanvas=document.createElement('canvas');this.measureCtx=this.measureCanvas.getContext('2d');this.naturalMedia=new NaturalMediaController({preference:app.renderPreference||'auto',onStatusChange:()=>app.refreshRenderEngineUI?.()});this.liveTiles=new LiveCanvasTileRenderer({onReady:()=>{if(!this.app.interaction&&!this.app.draft)this.render();}});this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(wrap);this.resize();}
  resize(){const r=this.wrap.getBoundingClientRect();this.dpr=clamp(devicePixelRatio||1,1,3);this.width=Math.max(1,r.width);this.height=Math.max(1,r.height);this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr);this.canvas.style.width=`${this.width}px`;this.canvas.style.height=`${this.height}px`;this.render();}
  camera(){return activePage(this.app.doc).camera;}
  layoutViewport(page=activePage(this.app.doc)){return normalizeLayoutViewport(page?.workspace?.layoutViewport||{});}
  layoutViewportMatrix(page=activePage(this.app.doc)){return layoutViewportMatrix(page);}
  applyLayoutViewport(ctx,page=activePage(this.app.doc)){ctx.transform(...this.layoutViewportMatrix(page));}
  applyCamera(ctx=this.ctx,camera=this.camera(),width=this.width,height=this.height){ctx.translate(width/2+camera.x,height/2+camera.y);ctx.rotate(camera.rotation);ctx.scale(camera.scale,camera.scale);}
  worldToScreen(p,camera=this.camera(),width=this.width,height=this.height){const page=activePage(this.app.doc),display=this.app.spaceMode()==='layout'?M.point(this.layoutViewportMatrix(page),p):p,c=Math.cos(camera.rotation),sn=Math.sin(camera.rotation);return{x:width/2+camera.x+(display.x*c-display.y*sn)*camera.scale,y:height/2+camera.y+(display.x*sn+display.y*c)*camera.scale};}
  screenToDisplayWorld(x,y,camera=this.camera(),rect=this.wrap.getBoundingClientRect(),width=this.width,height=this.height){let px=x-rect.left-width/2-camera.x,py=y-rect.top-height/2-camera.y;const c=Math.cos(-camera.rotation),sn=Math.sin(-camera.rotation);return{x:(px*c-py*sn)/camera.scale,y:(px*sn+py*c)/camera.scale};}
  screenToWorld(x,y,camera=this.camera(),rect=this.wrap.getBoundingClientRect(),width=this.width,height=this.height){const display=this.screenToDisplayWorld(x,y,camera,rect,width,height);if(this.app.spaceMode()!=='layout')return display;const inverse=M.tryInvert(this.layoutViewportMatrix());return inverse?M.point(inverse,display):display;}
  viewportWorldBounds(camera=this.camera(),width=this.width,height=this.height){const fakeRect={left:0,top:0};const pts=[[0,0],[width,0],[width,height],[0,height]].map(([x,y])=>this.screenToWorld(x,y,camera,fakeRect,width,height));const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}
  worldScreenScale(page=activePage(this.app.doc)){return Math.max(.0001,page.camera.scale*(this.app.spaceMode()==='layout'?this.layoutViewport(page).scale:1));}
  render(){
    if(!this.ctx||!this.app.doc)return;
    const ctx=this.ctx,page=activePage(this.app.doc),fixed=this.app.spaceMode()==='layout';
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle=fixed?'#dedede':page.paper.color;ctx.fillRect(0,0,this.width,this.height);
    ctx.save();this.applyCamera(ctx);
    if(fixed){
      const trim=artboardTrimBounds(page),bleed=artboardBleedBounds(page,true),clip=page.artboard.clipContent!==false?bleed:null;
      this.drawArtboardFrameWorld(ctx,page,trim,bleed);
      const viewport=this.layoutViewport(page),scaleBucket=clamp(2**Math.round(Math.log2(Math.max(.5,page.camera.scale*viewport.scale*this.dpr))),.5,4);
      this.liveTiles.ensure(bleed,scaleBucket);
      const canUseTiles=!this.app.interaction&&!this.app.draft&&!this.app.paperPreview&&page.artboard.clipContent!==false;
      const usedTiles=canUseTiles&&this.liveTiles.draw(ctx);
      if(!usedTiles)this.renderPageWorld(ctx,page,{bounds:bleed,clipBounds:clip,useLayoutViewport:true,preferredScale:page.camera.scale*viewport.scale*this.dpr});
      if(canUseTiles&&this.liveTiles.atlas?.dirtyCount())this.scheduleLiveTiles(page,bleed,scaleBucket);
      this.drawArtboardGuidesWorld(ctx,page,trim,bleed);
    }else{
      const bounds=this.viewportWorldBounds();this.drawPaperWorld(ctx,page,bounds);
      for(const layer of page.layers){if(!layer.visible)continue;ctx.save();ctx.globalAlpha*=layer.opacity;this.drawLayerObjects(ctx,layer,page);ctx.restore();}this.drawFloraInspectionOverlay(ctx,page);
    }
    if(this.app.draft?.object)this.drawObject(ctx,this.app.draft.object,{draft:true});ctx.restore();
    if(this.app.draft?.lasso)this.drawLassoOverlay(ctx,this.app.draft.lasso);if(this.app.draft?.marquee)this.drawMarqueeOverlay(ctx,this.app.draft.marquee);this.drawGuides(ctx,(page.guides||[]).filter(guide=>guide.visible!==false).map(guide=>({axis:guide.orientation==='vertical'?'x':'y',value:guide.position,persistent:true,id:guide.id,locked:Boolean(guide.locked)})));if(this.app.draft?.guides)this.drawGuides(ctx,this.app.draft.guides);this.drawSelectionOverlay(ctx);this.drawStrokeEditOverlay(ctx);this.drawPathEditOverlay(ctx);this.drawBrushCursor(ctx);this.app.updateStatus();
  }
  drawArtboardFrameWorld(ctx,page,trim=artboardTrimBounds(page),bleed=artboardBleedBounds(page,true)){
    ctx.save();ctx.shadowColor='rgba(0,0,0,.42)';ctx.shadowBlur=18/Math.max(.05,page.camera.scale);ctx.shadowOffsetY=5/Math.max(.05,page.camera.scale);ctx.fillStyle=page.paper.color;ctx.fillRect(bleed.x,bleed.y,bleed.w,bleed.h);ctx.restore();
    ctx.save();ctx.lineWidth=1/Math.max(.05,page.camera.scale);ctx.strokeStyle='rgba(0,0,0,.58)';ctx.strokeRect(trim.x,trim.y,trim.w,trim.h);ctx.restore();
  }
  drawArtboardGuidesWorld(ctx,page,trim=artboardTrimBounds(page),bleed=artboardBleedBounds(page,true)){
    const artboard=page.artboard||{};ctx.save();ctx.lineWidth=1/Math.max(.05,page.camera.scale);ctx.setLineDash([5/Math.max(.05,page.camera.scale),4/Math.max(.05,page.camera.scale)]);
    if(artboard.showBleed!==false&&artboard.bleedMm>0){ctx.strokeStyle='rgba(221,80,72,.9)';ctx.strokeRect(bleed.x,bleed.y,bleed.w,bleed.h);}
    if(artboard.showSafeArea!==false&&artboard.safeMarginMm>0){const safe=artboardSafeBounds(page);ctx.strokeStyle='rgba(62,132,190,.88)';ctx.strokeRect(safe.x,safe.y,safe.w,safe.h);}
    if(artboard.showCenter!==false){ctx.setLineDash([3/Math.max(.05,page.camera.scale),5/Math.max(.05,page.camera.scale)]);ctx.strokeStyle='rgba(80,130,115,.58)';ctx.beginPath();ctx.moveTo(0,trim.y);ctx.lineTo(0,trim.y+trim.h);ctx.moveTo(trim.x,0);ctx.lineTo(trim.x+trim.w,0);ctx.stroke();}
    ctx.restore();
  }
  drawPaperWorld(ctx,page,bounds){
    ctx.save();ctx.beginPath();ctx.rect(bounds.x,bounds.y,bounds.w,bounds.h);ctx.clip();ctx.fillStyle=page.paper.color;ctx.fillRect(bounds.x,bounds.y,bounds.w,bounds.h);this.drawPaperTextureWorld(ctx,page,bounds);if(page.paper.type!=='blank'){const step=page.paper.gridSize;ctx.lineWidth=1/Math.max(.03,page.camera.scale);ctx.strokeStyle='rgba(83,91,88,.16)';ctx.fillStyle='rgba(83,91,88,.25)';ctx.beginPath();const startX=Math.floor(bounds.x/step)*step,startY=Math.floor(bounds.y/step)*step;if(page.paper.type==='grid'){for(let x=startX;x<=bounds.x+bounds.w+step;x+=step){ctx.moveTo(x,bounds.y-step);ctx.lineTo(x,bounds.y+bounds.h+step);}for(let y=startY;y<=bounds.y+bounds.h+step;y+=step){ctx.moveTo(bounds.x-step,y);ctx.lineTo(bounds.x+bounds.w+step,y);}ctx.stroke();}else if(page.paper.type==='ruled'){for(let y=startY;y<=bounds.y+bounds.h+step;y+=step){ctx.moveTo(bounds.x-step,y);ctx.lineTo(bounds.x+bounds.w+step,y);}ctx.stroke();}else if(page.paper.type==='dots'){const r=clamp(1.2/Math.max(.03,page.camera.scale),.3,2.2/Math.max(.03,page.camera.scale));for(let x=startX;x<=bounds.x+bounds.w+step;x+=step)for(let y=startY;y<=bounds.y+bounds.h+step;y+=step){ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,Math.PI*2);}ctx.fill();}}ctx.restore();
  }
  drawPaperTextureWorld(ctx,page,bounds){if(page.paper.textureVisible===false)return;const texture=this.paperTexture(page);ctx.save();ctx.globalCompositeOperation='multiply';ctx.globalAlpha=.34;ctx.fillStyle=ctx.createPattern(texture,'repeat');ctx.fillRect(bounds.x-texture.width,bounds.y-texture.height,bounds.w+texture.width*2,bounds.h+texture.height*2);ctx.restore();}
  renderPageWorld(ctx,page,{bounds,clipBounds=null,useLayoutViewport=false,preferredScale=null}={}){ctx.save();if(clipBounds){ctx.beginPath();ctx.rect(clipBounds.x,clipBounds.y,clipBounds.w,clipBounds.h);ctx.clip();}this.drawPaperWorld(ctx,page,bounds);ctx.save();if(useLayoutViewport)this.applyLayoutViewport(ctx,page);for(const layer of page.layers){if(!layer.visible)continue;ctx.save();ctx.globalAlpha*=layer.opacity;this.drawLayerObjects(ctx,layer,page,preferredScale?{preferredScale}:{});ctx.restore();}this.drawFloraInspectionOverlay(ctx,page);ctx.restore();ctx.restore();}
  scheduleLiveTiles(page,bounds,scale){this.liveTiles.ensure(bounds,scale);this.liveTiles.schedule(async(context,tile,plan)=>{context.setTransform(plan.scale,0,0,plan.scale,-bounds.x*plan.scale-tile.x,-bounds.y*plan.scale-tile.y);this.renderPageWorld(context,page,{bounds,clipBounds:bounds,useLayoutViewport:true,preferredScale:plan.scale*this.layoutViewport(page).scale});});}
  invalidateTiles(bounds=null){return this.liveTiles.invalidate(bounds);}
  liveTileDiagnostics(){return this.liveTiles.diagnostics();}
  paperTexture(page){const key=paperProfileFingerprint(page.paper);if(this.paperTextureCache.has(key))return this.paperTextureCache.get(key);const size=160,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const context=canvas.getContext('2d'),image=context.createImageData(size,size);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const sample=paperSampleAt(x,y,page.paper),offset=(y*size+x)*4;const shade=Math.round(118+sample.height*62);image.data[offset]=shade;image.data[offset+1]=shade;image.data[offset+2]=shade;image.data[offset+3]=Math.round((.018+sample.grain*.045+sample.fiber*.025)*255);}context.putImageData(image,0,0);this.paperTextureCache.set(key,canvas);while(this.paperTextureCache.size>12)this.paperTextureCache.delete(this.paperTextureCache.keys().next().value);return canvas;}
  drawLayerObjects(ctx,layer,page,options={}){const runKinds=new Set(['brush','drybrush','blender','smudge']);const eligible=o=>Boolean(o&&!o.floraPaint&&o.type==='stroke'&&runKinds.has(o.kind)&&!(o.segmentStyles||[]).some(style=>style&&Object.keys(style).length));for(let index=0;index<layer.objects.length;){const object=layer.objects[index];if(eligible(object)){const entries=[];let cursor=index;while(cursor<layer.objects.length&&entries.length<48){const candidate=layer.objects[cursor];if(!eligible(candidate))break;entries.push({stroke:candidate,matrix:candidate.matrix||M.identity(),opacity:candidate.opacity??1});cursor++;}if(entries.length&&this.naturalMedia.renderStrokeRun(ctx,entries,page.paper,{...options,minimumStrokes:1})){index=cursor;continue;}}this.drawObject(ctx,object,{...options,page});index++;}}
  getImage(src){if(!src)return null;if(this.imageCache.has(src))return this.imageCache.get(src);const img=new Image();img.onload=()=>this.render();img.src=src;this.imageCache.set(src,img);return img;}
  floraMaskForObject(o,page){if(!o?.floraPaint?.regionId)return null;return page?.floraHero?.masks?.find(mask=>mask.regionId===o.floraPaint.regionId||mask.maskId===o.floraPaint.maskId)||null;}
  drawObject(ctx,o,options={}){
    if(o?.visible===false)return;
    if(isComponentInstance(o)){const resolved=resolveComponentInstance(this.app.doc,o);if(resolved.geometry)this.drawObject(ctx,resolved.geometry,options);return;}
    ctx.save();
    const page=options.page||this.app.page(),mask=this.floraMaskForObject(o,page);
    if(o.floraPaint&&!mask){ctx.restore();return;}
    if(mask){ctx.beginPath();traceVectorMaskWorld(ctx,mask,page);ctx.clip(mask.excludePaths?.length?'evenodd':'nonzero');}
    if(o.blendMode&&['source-over','multiply','screen','overlay','soft-light','hard-light','darken','lighten','color-dodge','color-burn','difference','exclusion','hue','saturation','color','luminosity'].includes(o.blendMode))ctx.globalCompositeOperation=o.blendMode;
    const m=o.matrix||M.identity();ctx.transform(...m);ctx.globalAlpha*=o.opacity??1;
    if(o.type==='stroke')this.drawStroke(ctx,o);
    else if(o.type==='shape')this.drawShape(ctx,o);
    else if(o.type==='image')this.drawImage(ctx,o);
    else if(o.type==='text')this.drawText(ctx,o);
    else if(o.type==='path')this.drawVectorPath(ctx,o);
    else if(o.type==='repeat'){for(const transform of repeatTransforms(o)){ctx.save();ctx.transform(...transform);this.drawObject(ctx,o.source,{...options,page});ctx.restore();}}
    else if(o.type==='group'||o.type==='frame'){for(const child of o.children||[])this.drawObject(ctx,child,{...options,page});}
    ctx.restore();
  }
  drawVectorPath(ctx,o){
    const appearance=resolvePathPaintAppearance(o,this.app.doc);
    tracePath(ctx,o);
    if(appearance.fill&&appearance.fill!=='none'){ctx.fillStyle=appearance.fill;ctx.fill(o.fillRule==='evenodd'?'evenodd':'nonzero');}
    const expressiveDrawn=o.expressiveStroke?drawExpressivePathStroke(ctx,o):false;
    if(!expressiveDrawn&&appearance.stroke&&appearance.stroke!=='none'&&Number(o.strokeWidth)>0){tracePath(ctx,o);ctx.strokeStyle=appearance.stroke;ctx.lineWidth=Math.max(.01,Number(o.strokeWidth)||1);ctx.lineCap=o.lineCap||'round';ctx.lineJoin=o.lineJoin||'round';ctx.miterLimit=Math.max(1,Number(o.miterLimit)||4);ctx.setLineDash(Array.isArray(o.dash)?o.dash:[]);ctx.lineDashOffset=Number(o.dashOffset)||0;ctx.stroke();ctx.setLineDash([]);}
  }
  drawFloraInspectionOverlay(ctx,page){const hero=page?.floraHero,inspect=this.app.flora?.hero?.inspect;if(!hero||!inspect||!Object.values(inspect).some(Boolean))return;ctx.save();const scale=Math.max(.05,this.worldScreenScale(page));ctx.lineWidth=1.2/scale;ctx.font=`${12/scale}px ui-monospace,monospace`;ctx.textBaseline='middle';for(const region of hero.regions||[]){const mask=(hero.masks||[]).find(item=>item.regionId===region.regionId);if(inspect.structure){ctx.beginPath();traceVectorPathWorld(ctx,region.path,page);ctx.strokeStyle=region.relation==='front'?'rgba(59,95,124,.88)':'rgba(117,91,71,.72)';ctx.setLineDash([5/scale,4/scale]);ctx.stroke();}if(inspect.masks&&mask?.visible){ctx.beginPath();traceVectorMaskWorld(ctx,mask,page);ctx.fillStyle='rgba(78,145,175,.075)';ctx.fill(mask.excludePaths?.length?'evenodd':'nonzero');ctx.strokeStyle=mask.feather>0?'rgba(213,109,137,.95)':'rgba(48,122,155,.95)';ctx.setLineDash(mask.feather>0?[8/scale,4/scale]:[]);ctx.lineWidth=Math.max(1/scale,(1+mask.feather*45)/scale);ctx.stroke();}if(inspect.ids){const anchor=Number.isFinite(region.path?.[0]?.cx)?normalizedPointToWorld(page,{x:region.path[0].cx,y:region.path[0].cy}):normalizedPointToWorld(page,region.path[0]);ctx.fillStyle='rgba(28,31,32,.92)';ctx.fillText(region.regionId,anchor.x+4/scale,anchor.y-4/scale);}if(inspect.topology){const anchor=Number.isFinite(region.path?.[0]?.cx)?normalizedPointToWorld(page,{x:region.path[0].cx,y:region.path[0].cy}):normalizedPointToWorld(page,region.path[0]);ctx.fillStyle='rgba(92,63,42,.9)';ctx.fillText(`${region.relation} z${region.z}`,anchor.x+4/scale,anchor.y+10/scale);}}ctx.restore();}
  drawStroke(ctx,o){
    const source=o.points||[];if(!source.length)return;
    const styled=(o.segmentStyles||[]).some(style=>style&&Object.keys(style).length);
    if(styled&&source.length>1){
      for(let index=0;index<source.length-1;index++){
        const style=segmentStyleAt(o,index),points=sampleStrokeSegment(o,index,Math.max(.8,(style.size||o.size||2)*.25));
        const segment={...o,...style,points,segmentStyles:undefined,taper:0};
        this.drawStroke(ctx,segment);
      }
      return;
    }
    const pts=source.length>1?sampleStrokePath(o,Math.max(.8,(o.size||2)*.25)):source;
    const render={...o,points:pts,segmentStyles:undefined};
    if(this.naturalMedia.renderStroke(ctx,render))return;
    if(render.kind==='blender'||render.kind==='smudge')return;
    ctx.fillStyle=render.color;ctx.strokeStyle=render.color;ctx.lineCap='round';ctx.lineJoin='round';
    if(render.kind==='pencil'||render.kind==='drybrush'){
      const passes=render.kind==='drybrush'?Math.round(6+(render.bristle??.65)*7):4,grain=render.grain??.5;for(let pass=0;pass<passes;pass++){ctx.save();ctx.globalAlpha*=clamp(1/Math.sqrt(passes)*(.72+pass*.04)*(render.flow??1),.02,1);ctx.lineWidth=Math.max(.3,(render.size||2)*(render.kind==='drybrush'?.1:.16));ctx.beginPath();for(let i=0;i<pts.length;i++){const p=pts[i],seed=Math.sin((i+1)*12.9898+(pass+1)*78.233)*43758.5453,j=(seed-Math.floor(seed)-.5)*grain*(render.size||2)*.38;const prev=pts[Math.max(0,i-1)],next=pts[Math.min(pts.length-1,i+1)],dx=next.x-prev.x,dy=next.y-prev.y,l=Math.hypot(dx,dy)||1,x=p.x-dy/l*j,y=p.y+dx/l*j;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();ctx.restore();}
      return;
    }
    if(render.kind==='airbrush'){
      for(let i=0;i<pts.length;i++){const p=pts[i],r=strokeWidthAt(render,p,i,pts.length)/2,g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);g.addColorStop(0,hexAlpha(render.color,.95));g.addColorStop(render.softness??.75,hexAlpha(render.color,.22));g.addColorStop(1,hexAlpha(render.color,0));ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();}return;
    }
    const outline=strokeOutline(render);if(!outline.length)return;
    if(render.kind==='marker')ctx.globalCompositeOperation='multiply';
    if(render.kind==='brush'){
      const flow=clamp(render.flow??.82,.08,1),wetness=clamp(render.wetness??.3,0,1),bristle=clamp(render.bristle??.2,0,1);
      ctx.save();ctx.globalAlpha*=flow;ctx.beginPath();ctx.moveTo(outline[0].x,outline[0].y);for(let i=1;i<outline.length;i++)ctx.lineTo(outline[i].x,outline[i].y);ctx.closePath();ctx.fill();ctx.restore();
      if(wetness>.03){ctx.save();ctx.globalAlpha*=wetness*.15;ctx.shadowColor=render.color;ctx.shadowBlur=(render.size||8)*wetness*.42;ctx.beginPath();ctx.moveTo(outline[0].x,outline[0].y);for(let i=1;i<outline.length;i++)ctx.lineTo(outline[i].x,outline[i].y);ctx.closePath();ctx.fill();ctx.restore();}
      if(bristle>.04&&pts.length>2){const strands=Math.max(2,Math.round(2+bristle*8));for(let pass=0;pass<strands;pass++){ctx.save();const ratio=(pass/(strands-1)-.5),alpha=(.08+.16*bristle)*(1-Math.abs(ratio)*.55);ctx.globalAlpha*=alpha*flow;ctx.lineWidth=Math.max(.28,(render.size||8)*(.022+.016*bristle));ctx.beginPath();for(let i=0;i<pts.length;i++){const p=pts[i],prev=pts[Math.max(0,i-1)],next=pts[Math.min(pts.length-1,i+1)],dx=next.x-prev.x,dy=next.y-prev.y,l=Math.hypot(dx,dy)||1,offset=ratio*strokeWidthAt(render,p,i,pts.length)*.78;const x=p.x-dy/l*offset,y=p.y+dx/l*offset;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();ctx.restore();}}
      return;
    }
    ctx.beginPath();ctx.moveTo(outline[0].x,outline[0].y);for(let i=1;i<outline.length;i++)ctx.lineTo(outline[i].x,outline[i].y);ctx.closePath();ctx.fill();
  }
  drawShape(ctx,o){ctx.lineWidth=o.size||2;ctx.strokeStyle=o.color;ctx.fillStyle=o.fillColor||o.color;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    if(o.shape==='line'||o.shape==='arrow'){ctx.moveTo(0,0);ctx.lineTo(o.x2,o.y2);if(o.shape==='arrow'){const a=Math.atan2(o.y2,o.x2),len=Math.min(24,Math.max(8,(o.size||2)*5));ctx.moveTo(o.x2,o.y2);ctx.lineTo(o.x2-Math.cos(a-rad(28))*len,o.y2-Math.sin(a-rad(28))*len);ctx.moveTo(o.x2,o.y2);ctx.lineTo(o.x2-Math.cos(a+rad(28))*len,o.y2-Math.sin(a+rad(28))*len);}}
    else if(o.shape==='rect')ctx.rect(0,0,o.w,o.h);
    else if(o.shape==='ellipse')ctx.ellipse(o.w/2,o.h/2,Math.abs(o.w/2),Math.abs(o.h/2),0,0,Math.PI*2);
    else if(o.shape==='triangle'){ctx.moveTo(o.w/2,0);ctx.lineTo(o.w,o.h);ctx.lineTo(0,o.h);ctx.closePath();}
    if(o.fill&&o.shape!=='line'&&o.shape!=='arrow')ctx.fill();ctx.stroke();
  }
  drawImage(ctx,o){const img=this.getImage(o.src);if(img?.complete&&img.naturalWidth)ctx.drawImage(img,0,0,o.w,o.h);else{ctx.fillStyle='#ddd';ctx.fillRect(0,0,o.w,o.h);ctx.strokeStyle='#aaa';ctx.strokeRect(0,0,o.w,o.h);}}
  drawText(ctx,o){
    ctx.fillStyle=o.color;ctx.font=`${o.fontWeight||400} ${o.fontSize||32}px ${o.fontFamily||'system-ui'}`;ctx.textBaseline='alphabetic';
    if(o.pathText?.pathId){
      const textFound=this.app.findObject({objectId:o.id}),pathFound=this.app.findObject({objectId:o.pathText.pathId});
      const textParentId=textFound?.parentObject?.id||null,pathParentId=pathFound?.parentObject?.id||null;
      const sameContainer=Boolean(textFound&&pathFound&&textFound.layer?.id===pathFound.layer?.id&&textParentId===pathParentId);
      const inverse=M.tryInvert(o.matrix||M.identity());
      if(sameContainer&&pathFound.object?.type==='path'&&inverse){
        try{
          const layout=layoutTextOnPath(o,pathFound.object,{measureText:text=>ctx.measureText(text).width});
          ctx.save();
          try{
            ctx.transform(...inverse);
            for(const placement of layout.placements){
              ctx.save();
              try{ctx.translate(placement.x,placement.y);ctx.rotate(placement.angle);ctx.fillText(placement.character,-placement.advance/2,0);}
              finally{ctx.restore();}
            }
          }finally{ctx.restore();}
          return;
        }catch(error){console.warn('INK path text render fallback',error);}
      }
    }
    const lh=(o.fontSize||32)*(o.lineHeight||1.25);String(o.text||'').split('\n').forEach((line,i)=>ctx.fillText(line,0,i*lh));
  }
  objectWorldBounds(o,parent=M.identity()){if(isComponentInstance(o)){const resolved=resolveComponentInstance(this.app.doc,o);return resolved.geometry?this.objectWorldBounds(resolved.geometry,parent):groupWorldGeometryBounds({...o,children:[]},parent);}if(o.type==='group')return groupWorldGeometryBounds(o,parent,(child,groupWorld)=>this.objectWorldBounds(child,groupWorld));if(o.type==='frame')return frameWorldGeometryBounds(o,parent);if(o.type==='repeat'){const repeatWorld=M.toWorld(parent,o.matrix||M.identity());let bounds=null;for(const transform of repeatTransforms(o))bounds=unionBounds(bounds,this.objectWorldBounds(o.source,M.multiply(repeatWorld,transform)));return bounds||transformBounds({x:0,y:0,w:1,h:1},repeatWorld);}return transformBounds(localBounds(o,this.measureCtx),M.toWorld(parent,o.matrix||M.identity()));}
  objectScreenBounds(o,parent=M.identity()){const b=this.objectWorldBounds(o,parent),pts=[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}].map(p=>this.worldToScreen(p));const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}
  selectionWorldBounds(){return selectionWorldGeometryBounds(this.app.selectedObjects(),found=>this.objectWorldBounds(found.object,found.parentWorldMatrix));}
  selectionScreenBox(){const b=this.selectionWorldBounds();if(!b)return null;const pts=[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}].map(p=>this.worldToScreen(p));const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys),world:b};}
  drawSelectionOverlay(ctx){if(this.app.strokeEdit||this.app.pathEditing?.active)return;const box=this.selectionScreenBox();if(!box)return;ctx.save();ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.strokeStyle='#236b63';ctx.fillStyle='#fff';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.strokeRect(box.x,box.y,box.w,box.h);ctx.setLineDash([]);const hs=this.selectionHandles(box);for(const h of hs){if(h.name==='rotate'){ctx.beginPath();ctx.moveTo(box.x+box.w/2,box.y);ctx.lineTo(h.x,h.y);ctx.stroke();ctx.beginPath();ctx.arc(h.x,h.y,6,0,Math.PI*2);ctx.fill();ctx.stroke();}else{ctx.fillRect(h.x-5,h.y-5,10,10);ctx.strokeRect(h.x-5,h.y-5,10,10);}}ctx.restore();}
  selectionHandles(box){const x=box.x,y=box.y,w=box.w,h=box.h;return[{name:'nw',x,y},{name:'n',x:x+w/2,y},{name:'ne',x:x+w,y},{name:'e',x:x+w,y:y+h/2},{name:'se',x:x+w,y:y+h},{name:'s',x:x+w/2,y:y+h},{name:'sw',x,y:y+h},{name:'w',x,y:y+h/2},{name:'rotate',x:x+w/2,y:y-28}];}
  handleAt(sx,sy){const box=this.selectionScreenBox();if(!box)return null;for(const h of this.selectionHandles(box)){const r=h.name==='rotate'?10:9;if(Math.hypot(sx-h.x,sy-h.y)<=r)return h.name;}if(sx>=box.x&&sx<=box.x+box.w&&sy>=box.y&&sy<=box.y+box.h)return'move';return null;}
  drawLassoOverlay(ctx,lasso){if(!lasso?.length)return;ctx.save();ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.strokeStyle='#236b63';ctx.fillStyle='rgba(35,107,99,.08)';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);ctx.beginPath();lasso.forEach((p,i)=>{const s=this.worldToScreen(p);i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y);});ctx.fill();ctx.stroke();ctx.restore();}
  drawMarqueeOverlay(ctx,m){if(!m)return;const x=Math.min(m.start.x,m.current.x),y=Math.min(m.start.y,m.current.y),w=Math.abs(m.current.x-m.start.x),h=Math.abs(m.current.y-m.start.y),contain=m.current.x>=m.start.x;ctx.save();ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.strokeStyle=contain?'#236b63':'#2f718f';ctx.fillStyle=contain?'rgba(35,107,99,.09)':'rgba(47,113,143,.09)';ctx.lineWidth=1.35;ctx.setLineDash(contain?[]:[6,4]);ctx.fillRect(x,y,w,h);ctx.strokeRect(x+.5,y+.5,Math.max(0,w-1),Math.max(0,h-1));ctx.restore();}
  drawGuides(ctx,guides){if(!guides?.length)return;const view=this.viewportWorldBounds();ctx.save();ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.lineWidth=1/this.dpr;for(const g of guides){const persistent=Boolean(g.persistent);ctx.strokeStyle=persistent?'#65b7c8':'#d12fff';ctx.setLineDash(persistent?[]:[4,3]);const a=g.axis==='x'?this.worldToScreen({x:g.value,y:view.y-view.h}):this.worldToScreen({x:view.x-view.w,y:g.value}),b=g.axis==='x'?this.worldToScreen({x:g.value,y:view.y+view.h*2}):this.worldToScreen({x:view.x+view.w*2,y:g.value});ctx.beginPath();const align=v=>(Math.round(v*this.dpr)+.5)/this.dpr;ctx.moveTo(g.axis==='x'?align(a.x):a.x,g.axis==='y'?align(a.y):a.y);ctx.lineTo(g.axis==='x'?align(b.x):b.x,g.axis==='y'?align(b.y):b.y);ctx.stroke();}ctx.restore();}
  drawStrokeEditOverlay(ctx){
    const edit=this.app.strokeEdit;if(!edit)return;const found=this.app.findObject(edit.ref);if(!found||found.object.type!=='stroke')return;
    const o=found.object,world=found.worldMatrix||M.multiply(found.parentWorldMatrix||M.identity(),o.matrix||M.identity()),points=o.points||[],selected=edit.nodeIndices||new Set();ctx.save();ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    const curve=sampleStrokePath(o,3).map(point=>this.worldToScreen(M.point(world,point)));
    if(curve.length>1){ctx.strokeStyle='rgba(35,107,99,.5)';ctx.lineWidth=1.25;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(curve[0].x,curve[0].y);for(let i=1;i<curve.length;i++)ctx.lineTo(curve[i].x,curve[i].y);ctx.stroke();ctx.setLineDash([]);}
    if(Number.isInteger(edit.segmentIndex)&&points[edit.segmentIndex+1]){const selectedCurve=sampleStrokeSegment(o,edit.segmentIndex,2).map(point=>this.worldToScreen(M.point(world,point)));ctx.strokeStyle='#d08a28';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(selectedCurve[0].x,selectedCurve[0].y);for(let i=1;i<selectedCurve.length;i++)ctx.lineTo(selectedCurve[i].x,selectedCurve[i].y);ctx.stroke();}
    for(const index of selected){const point=points[index];if(!point)continue;const anchor=this.worldToScreen(M.point(world,point));for(const kind of ['in','out']){const handle=point[kind];if(!handle||(!handle.x&&!handle.y))continue;const local={x:point.x+handle.x,y:point.y+handle.y},screen=this.worldToScreen(M.point(world,local));ctx.strokeStyle='rgba(35,107,99,.62)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(anchor.x,anchor.y);ctx.lineTo(screen.x,screen.y);ctx.stroke();ctx.beginPath();ctx.arc(screen.x,screen.y,4.5,0,Math.PI*2);ctx.fillStyle=edit.handle?.index===index&&edit.handle?.kind===kind?'#d08a28':'#fffef9';ctx.strokeStyle='#236b63';ctx.fill();ctx.stroke();}}
    for(let i=0;i<points.length;i++){const screen=this.worldToScreen(M.point(world,points[i])),active=selected.has(i);ctx.beginPath();ctx.arc(screen.x,screen.y,active?5.5:4,0,Math.PI*2);ctx.fillStyle=active?'#236b63':'#fffef9';ctx.strokeStyle=active?'#174f49':'#236b63';ctx.lineWidth=1.5;ctx.fill();ctx.stroke();}
    ctx.restore();
  }
  drawPathEditOverlay(ctx){
    const edit=this.app.pathEditing;if(!edit?.active)return;let found;try{found=edit.resolve();}catch{return;}const o=found.object,world=found.worldMatrix||M.multiply(found.parentWorldMatrix||M.identity(),o.matrix||M.identity()),selected=edit.state.anchorKeys||new Set();ctx.save();ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    for(let subpathIndex=0;subpathIndex<o.subpaths.length;subpathIndex++){const sub=o.subpaths[subpathIndex],points=flattenSubpath(sub,.7).map(point=>this.worldToScreen(M.point(world,point)));if(points.length>1){ctx.strokeStyle='rgba(35,107,99,.62)';ctx.lineWidth=1.25;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);if(sub.closed)ctx.closePath();ctx.stroke();ctx.setLineDash([]);}}
    const segment=edit.state.segment;if(segment){const sub=o.subpaths[segment.subpathIndex],a=sub?.anchors?.[segment.segmentIndex],b=sub?.anchors?.[(segment.segmentIndex+1)%(sub?.anchors?.length||1)];if(a&&b){const samples=[];for(let i=0;i<=24;i++){const t=i/24,u=1-t,p0=a,p1={x:a.x+a.out.x,y:a.y+a.out.y},p2={x:b.x+b.in.x,y:b.y+b.in.y},p3=b;const local={x:u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x,y:u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y};samples.push(this.worldToScreen(M.point(world,local)));}ctx.strokeStyle='#d08a28';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(samples[0].x,samples[0].y);for(let i=1;i<samples.length;i++)ctx.lineTo(samples[i].x,samples[i].y);ctx.stroke();}}
    for(const key of selected){const [subpathIndex,anchorIndex]=key.split(':').map(Number),anchor=o.subpaths?.[subpathIndex]?.anchors?.[anchorIndex];if(!anchor)continue;const screenAnchor=this.worldToScreen(M.point(world,anchor));for(const side of ['in','out']){const handle=anchor[side];if(!handle||(!handle.x&&!handle.y))continue;const screen=this.worldToScreen(M.point(world,{x:anchor.x+handle.x,y:anchor.y+handle.y}));ctx.strokeStyle='rgba(35,107,99,.62)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(screenAnchor.x,screenAnchor.y);ctx.lineTo(screen.x,screen.y);ctx.stroke();ctx.beginPath();ctx.arc(screen.x,screen.y,4.5,0,Math.PI*2);ctx.fillStyle=edit.state.handle?.subpathIndex===subpathIndex&&edit.state.handle?.anchorIndex===anchorIndex&&edit.state.handle?.side===side?'#d08a28':'#fffef9';ctx.strokeStyle='#236b63';ctx.fill();ctx.stroke();}}
    for(let subpathIndex=0;subpathIndex<o.subpaths.length;subpathIndex++)for(let anchorIndex=0;anchorIndex<o.subpaths[subpathIndex].anchors.length;anchorIndex++){const anchor=o.subpaths[subpathIndex].anchors[anchorIndex],screen=this.worldToScreen(M.point(world,anchor)),active=selected.has(`${subpathIndex}:${anchorIndex}`);ctx.beginPath();ctx.rect(screen.x-(active?5:4),screen.y-(active?5:4),active?10:8,active?10:8);ctx.fillStyle=active?'#236b63':'#fffef9';ctx.strokeStyle=active?'#174f49':'#236b63';ctx.lineWidth=1.4;ctx.fill();ctx.stroke();}
    ctx.restore();
  }
  drawBrushCursor(ctx){const hover=this.app.hover;if(!hover||hover.pointerType==='touch'||this.app.interaction)return;const tool=this.app.tool;if(!DRAW_TOOLS.has(tool)&&tool!=='eraser')return;const settings=this.app.toolSettings[DRAW_TOOLS.has(tool)?tool:this.app.lastDrawTool];const radius=tool==='eraser'?this.app.eraserRadiusWorld()*this.worldScreenScale():Math.max(2,settings.size*this.worldScreenScale()/2);ctx.save();ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.beginPath();ctx.arc(hover.sx,hover.sy,Math.max(2,radius),0,Math.PI*2);ctx.strokeStyle=tool==='eraser'?'rgba(190,82,66,.82)':'rgba(35,107,99,.82)';ctx.fillStyle=tool==='eraser'?'rgba(190,82,66,.06)':'rgba(35,107,99,.05)';ctx.lineWidth=1;ctx.fill();ctx.stroke();ctx.restore();}
  contentBounds(page=activePage(this.app.doc),visibleOnly=true){let b=null;for(const layer of page.layers){if(visibleOnly&&!layer.visible)continue;for(const o of layer.objects)b=unionBounds(b,this.objectWorldBounds(o));}return b;}
  renderThumbnail(page,width=128,height=96){const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.fillStyle='#2b2c2e';ctx.fillRect(0,0,width,height);const fixed=true,geometry=thumbnailPreviewGeometry(page,width,height,7),b=geometry.fitBounds,pad=geometry.padding,scale=geometry.scale;ctx.save();ctx.translate(width/2,height/2);ctx.scale(scale,scale);ctx.translate(-(b.x+b.w/2),-(b.y+b.h/2));if(fixed){ctx.fillStyle=page.paper.color;ctx.fillRect(b.x,b.y,b.w,b.h);ctx.beginPath();ctx.rect(b.x,b.y,b.w,b.h);ctx.clip();}else{ctx.fillStyle=page.paper.color;ctx.fillRect(b.x,b.y,b.w,b.h);}ctx.save();this.applyLayoutViewport(ctx,page);for(const l of page.layers){if(!l.visible)continue;ctx.save();ctx.globalAlpha=l.opacity;for(const o of l.objects)this.drawObject(ctx,o);ctx.restore();}ctx.restore();ctx.restore();return c.toDataURL('image/png');}
}

class InkApp{
  constructor(){
    this.pngWorkerEncoder=new PNGWorkerEncoder();this.pngExportController=null;this.lastPNGExportReport=null;
    this.documentOpen=false;this.doc=defaultDocument();this.store=new InkStore({checkpointLimit:3});let savedHistoryLimit=30;try{savedHistoryLimit=Number(localStorage.getItem('ink-history-limit'))||30;}catch{}this.history=new HistoryManager(this,savedHistoryLimit);this.health=new RuntimeHealthMonitor();this.health.attach(window);this.externalValidation=new ExternalValidationRecorder();this.activeExportJob=null;this.exportRequestSequence=0;this.activeExportRequest=null;this.tileAtlas=null;this.updates=new ServiceWorkerUpdateManager({buildId:BUILD_ID,scriptURL:'./service-worker-runtime.js',deploymentIdentityURL:'./pages-build-identity.txt',reloadOnActivate:true,canReload:()=>!this.dirty&&!this.history?.pending&&!this.activeExportRequest&&!this.activeExportJob,onStatusChange:status=>{if(status?.buildId&&window.INK_ARCHITECTURE)window.INK_ARCHITECTURE.serviceWorkerBuildId=status.buildId;this.refreshReleaseHealthUI?.(status)}});this.input=new InputArbiter();this.pointerMap=this.input.pointers;let savedPenProfile={};try{savedPenProfile=JSON.parse(localStorage.getItem('ink-pen-profile')||'{}');}catch{}this.penInput=new PenInputCalibrator(savedPenProfile);this.selection=[];this.draft=null;this.strokeEdit=null;this.hover=null;this.spatialIndex=new PageSpatialIndex();this.spatialDirty=true;this.spatialPending=new Set();this.dirty=false;this.autosaveTimer=null;this.persistenceGeneration=0;this.mutationEpoch=0;this.autosaveBoundaryPromise=Promise.resolve(true);this.toastTimer=null;this.zoomHudTimer=null;this.spaceDown=false;this.interaction=null;this.snapAngles=true;this.smartGuides=true;this.gridSnap=false;this.fingerDraw=false;this.aspectLock=true;this.selectionMode='contain';this.eraserMode='segment';this.shapeType='line';this.shapeFill=false;this.tool='pen';this.lastDrawTool='pen';this.brushPresetCatalog={};for(const presets of Object.values(BRUSH_PRESETS))for(const preset of presets)this.brushPresetCatalog[preset.id]=deepClone(preset);this.backgroundColor='#ffffff';this.toolSettings={};for(const [tool,presets]of Object.entries(BRUSH_PRESETS))this.toolSettings[tool]=deepClone(presets[0]);this.font={family:'system-ui',size:32};this.renderPreference='auto';try{this.renderPreference=localStorage.getItem('ink-render-engine')||'auto';}catch{}if(!['auto','gpu','canvas2d'].includes(this.renderPreference))this.renderPreference='auto';this.layoutViewportPreview=null;this.flora=installFloraActionLayer(this);
    this.el={app:$('#app'),canvas:$('#stage'),wrap:$('#stageWrap'),hint:$('#emptyHint'),toast:$('#toast'),zoomHud:$('#zoomHud')};
    this.uiComposition=createMinimalComposition(this);this.textEditorPresentation=this.uiComposition.textEditorPresentation;this.uiPresentation=this.uiComposition.presentation;
    this.renderer=new Renderer(this,this.el.canvas,this.el.wrap);installCommandAuthority(this);installFunctionModuleComposition(this);this.bindInput();installStudioCore(this);bindTranslationFunctionProvider(this,this.studio?.programImporter);installExtraction(this);installChatReferenceHandoff(this);installPathEditing(this);installExpressiveStroke(this);installRepaintMaterial(this);installRevision(this,{store:this.store});installChatBoundedEdit(this);installInkPublicCreativeApi(this);this.runtimeBridgeStartup=installConfiguredRuntimeBridge(this);installChatCreativePlan(this);installCreativeWorkspace(this);this.uiComposition.mount();this.uiShell=this.uiComposition.shell;this.uiPresentation=this.uiComposition.presentation;this.refreshAll();this.loadAutosave();if(location.protocol.startsWith('http'))this.updates.register();this.healthTimer=setInterval(()=>this.captureHealthSnapshot(),30000);
  }
  page(){return activePage(this.doc)}
  layer(){return activeLayer(this.doc)}
  get snapAngles(){return normalizeSnapSettings(this.page()?.snap||{}).categories.angle}
  set snapAngles(value){if(this.page())this.page().snap=setSnapCategory(this.page().snap||{},'angle',value)}
  get smartGuides(){const c=normalizeSnapSettings(this.page()?.snap||{}).categories;return Boolean(c.guides||c.edges||c.centers||c.equalDistance)}
  set smartGuides(value){if(!this.page())return;let next=normalizeSnapSettings(this.page().snap||{});for(const category of ['guides','edges','centers','equalDistance'])next=setSnapCategory(next,category,value);this.page().snap=next}
  get gridSnap(){return normalizeSnapSettings(this.page()?.snap||{}).categories.grid}
  set gridSnap(value){if(this.page())this.page().snap=setSnapCategory(this.page().snap||{},'grid',value)}
  pageStatePath(key){const index=this.doc.pages.indexOf(this.page());if(index<0)throw new Error('INK_ACTIVE_PAGE_NOT_FOUND');return['pages',index,key]}
  addGuide(guide){let created=null;this.history.pushScoped('新增參考線',[this.pageStatePath('guides')],()=>{const next=addRulerGuide(this.page().guides||[],guide);created=next.at(-1);this.page().guides=next;});this.renderer.render();return created}
  moveGuide(id,position){this.history.pushScoped('移動參考線',[this.pageStatePath('guides')],()=>{this.page().guides=moveRulerGuide(this.page().guides||[],id,position);});this.renderer.render();return true}
  removeGuide(id){this.history.pushScoped('刪除參考線',[this.pageStatePath('guides')],()=>{this.page().guides=removeRulerGuide(this.page().guides||[],id);});this.renderer.render();return true}
  setGuideLocked(id,locked=true){this.history.pushScoped('鎖定參考線',[this.pageStatePath('guides')],()=>{this.page().guides=setRulerGuideLocked(this.page().guides||[],id,locked);});this.renderer.render();return true}
  setGuideVisible(id,visible=true){this.history.pushScoped('顯示參考線',[this.pageStatePath('guides')],()=>{this.page().guides=setRulerGuideVisibility(this.page().guides||[],id,visible);});this.renderer.render();return true}
  setSnapEnabledState(enabled){this.history.pushScoped('吸附設定',[this.pageStatePath('snap')],()=>{this.page().snap=setSnapEnabled(this.page().snap||{},enabled);});return this.page().snap}
  setSnapCategoryState(category,enabled){this.history.pushScoped('吸附設定',[this.pageStatePath('snap')],()=>{this.page().snap=setSnapCategory(this.page().snap||{},category,enabled);});return this.page().snap}
  spaceMode(){return workspaceSpace(this.page())}
  workspace(){return ensureWorkspace(this.page())}
  fullscreenElement(){return document.fullscreenElement||document.webkitFullscreenElement||null;}
  async toggleFullscreen(){
    try{
      if(this.fullscreenElement()){const exit=document.exitFullscreen||document.webkitExitFullscreen;if(exit)await exit.call(document);}
      else{const target=this.el.app,request=target.requestFullscreen||target.webkitRequestFullscreen;if(!request){this.toast('此瀏覽器不支援全螢幕');return false;}await request.call(target,{navigationUI:'hide'});}
      this.refreshFullscreenUI();setTimeout(()=>{this.renderer.resize();this.renderer.render();},80);return Boolean(this.fullscreenElement());
    }catch(error){console.warn('Fullscreen failed',error);this.toast('無法進入全螢幕');this.refreshFullscreenUI();return false;}
  }
  refreshFullscreenUI(){return this.uiPresentation?.fullscreen?.present?.(Boolean(this.fullscreenElement()))||false;}
  switchWorkspace(next,{fit=true,announce=true}={}){if(!this.documentOpen)return {changed:false,firstVisit:false,activeSpace:this.spaceMode()};const page=this.page(),result=activateWorkspace(page,next);this.renderer.invalidateTiles();if(fit&&result.firstVisit){if(result.activeSpace==='layout'){this.fitLayoutViewportToContent({commit:false,render:false});this.fitArtboard({switchSpace:false});}else this.fitContent();}else this.renderer.render();this.refreshWorkspaceUI();this.refreshArtboardUI();this.markDirty();if(announce&&result.changed)this.toast(result.activeSpace==='layout'?'已切換圖紙':'已切換手繪板');return result;}
  pagePath(page=this.page()){const index=this.doc.pages.indexOf(page);return index<0?null:['pages',index];}
  layerPath(layer=this.layer(),page=this.page()){const pagePath=this.pagePath(page),index=page.layers.indexOf(layer);return!pagePath||index<0?null:[...pagePath,'layers',index];}
  layerObjectsPath(layer=this.layer(),page=this.page()){const path=this.layerPath(layer,page);return path?[...path,'objects']:null;}
  objectPath(found){const pagePath=this.pagePath();return!found||!pagePath?null:[...pagePath,...found.path];}
  objectContainerPath(found){if(!found)return null;if(found.parentObject){const parent=this.findObject({layerId:found.layer.id,objectId:found.parentObject.id}),path=this.objectPath(parent);return path?[...path,'children']:null;}return this.layerObjectsPath(found.layer);}
  findObject(ref){return findPageObject(this.page(),ref);}
  selectedObjects(){return this.selection.map(r=>this.findObject(r)).filter(Boolean);}
  selectedTransformObjects(){return collapseTransformRoots(this.selectedObjects());}
  compositionTransformObjects(){try{return resolveCompositionSelection(this.page(),this.selection,{allowEmpty:true});}catch(error){this.toast(error?.code==='COMPOSITION_STALE_SELECTION'?'選取已失效':error?.code==='COMPOSITION_LOCKED_TARGET'?'選取物件已鎖定':error?.code==='COMPOSITION_HIDDEN_TARGET'?'選取物件已隱藏':error?.code==='COMPOSITION_SINGULAR_TARGET'?'物件轉換不可逆':'目前選取無法進行組合操作');return[];}}
  selectionHistoryTargets(){return this.selectedTransformObjects().map(found=>this.objectPath(found)).filter(Boolean);}
  selectionRefsFromItems(items,{deep=false}={}){const ids=new Set(items.map(item=>item.object.id)),kept=deep?items:items.filter(item=>!item.ancestorIds.some(id=>ids.has(id)));return kept.map(item=>({layerId:item.layer.id,objectId:item.object.id}));}
  isSelected(layerId,objectId){return this.selection.some(r=>r.layerId===layerId&&r.objectId===objectId);}
  ensureSpatialIndex(){
    const page=this.page();
    // Definition edits may affect instances on any page; avoid isolated stale bounds.
    if(this.doc.components?.definitions?.length)this.spatialDirty=true;
    if(this.spatialDirty||this.spatialIndex.pageId!==page.id){this.spatialIndex.rebuild(page,(object,entry)=>this.renderer.objectWorldBounds(object,entry.parentWorldMatrix));this.spatialDirty=false;this.spatialPending.clear();}
    else if(this.spatialPending.size){const ok=this.spatialIndex.syncObjects(page,[...this.spatialPending],(object,entry)=>this.renderer.objectWorldBounds(object,entry.parentWorldMatrix));this.spatialPending.clear();if(!ok){this.spatialIndex.rebuild(page,(object,entry)=>this.renderer.objectWorldBounds(object,entry.parentWorldMatrix));this.spatialDirty=false;}}
    return this.spatialIndex;
  }
  queueSpatialObject(refOrId){const id=typeof refOrId==='string'?refOrId:refOrId?.objectId;if(id)this.spatialPending.add(id);}
  queueSpatialSelection(){const selected=this.selectedObjects();if(selected.some(found=>found.object.type==='frame'||found.object.type==='group')){this.spatialDirty=true;this.spatialPending.clear();return;}for(const ref of this.selection)this.queueSpatialObject(ref);}
  rebuildSpatialIndex(){this.spatialDirty=true;return this.ensureSpatialIndex();}
  editableStroke(){if(!this.strokeEdit)return null;const found=this.findObject(this.strokeEdit.ref),world=found?.worldMatrix||found?.object?.matrix;return found?.object.type==='stroke'&&found.interactionExposed!==false&&M.isInvertible(world)?found:null;}
  enterStrokeEdit(ref=null){const found=ref?this.findObject(ref):this.selectedObjects().length===1?this.selectedObjects()[0]:null;if(!found||found.object.type!=='stroke'){this.toast('請先選取一筆筆畫');return false;}if(!M.isInvertible(found.worldMatrix||found.object.matrix)){this.toast('物件轉換不可逆，無法進入節點編輯');return false;}this.selection=[{layerId:found.layer.id,objectId:found.object.id}];this.strokeEdit={ref:{layerId:found.layer.id,objectId:found.object.id},nodeIndices:new Set(),segmentIndex:null,segmentT:.5,handle:null};this.setTool('select');this.refreshSelectionUI();this.revealObjectInspector();this.renderer.render();return true;}
  exitStrokeEdit(){if(!this.strokeEdit)return;this.strokeEdit=null;this.refreshSelectionUI();this.renderer.render();}
  strokeEditHit(sx,sy){
    const found=this.editableStroke();if(!found)return null;const points=found.object.points||[],world=found.worldMatrix||M.multiply(found.parentWorldMatrix||M.identity(),found.object.matrix||M.identity()),screenPoints=points.map(point=>this.renderer.worldToScreen(M.point(world,point)));
    for(const index of this.strokeEdit.nodeIndices){const point=points[index];if(!point)continue;for(const kind of ['in','out']){const handle=point[kind];if(!handle||(!handle.x&&!handle.y))continue;const screen=this.renderer.worldToScreen(M.point(world,{x:point.x+handle.x,y:point.y+handle.y}));if(Math.hypot(screen.x-sx,screen.y-sy)<=8)return{type:'handle',index,kind};}}
    const node=nearestStrokeNode(screenPoints,{x:sx,y:sy},9);if(node)return{type:'node',index:node.index};
    const inverse=M.tryInvert(world);if(!inverse)return null;const local=M.point(inverse,this.renderer.screenToWorld(sx+this.el.wrap.getBoundingClientRect().left,sy+this.el.wrap.getBoundingClientRect().top));
    const scale=Math.max(.0001,this.page().camera.scale*Math.hypot(world[0],world[1]));
    const segment=nearestStrokeCurveSegment(found.object,local,8/scale);return segment?{type:'segment',index:segment.index,t:segment.t}:null;
  }
  selectAllStrokeNodes(){const found=this.editableStroke();if(!found)return;this.strokeEdit.nodeIndices=new Set(found.object.points.map((_,index)=>index));this.strokeEdit.segmentIndex=null;this.strokeEdit.handle=null;this.refreshSelectionUI();this.renderer.render();}
  insertEditedNode(){const found=this.editableStroke(),edit=this.strokeEdit;if(!found||!Number.isInteger(edit.segmentIndex)){this.toast('請先點選一個筆畫區段');return;}let inserted=-1;this.history.pushScoped('插入筆畫節點',[this.objectPath(found)],()=>{inserted=insertStrokeNode(found.object,edit.segmentIndex,edit.segmentT);});if(inserted>=0){edit.nodeIndices=new Set([inserted]);edit.segmentIndex=null;edit.handle=null;this.queueSpatialObject(edit.ref);this.refreshSelectionUI();this.renderer.render();}}
  setEditedNodeMode(mode){const found=this.editableStroke(),indices=[...(this.strokeEdit?.nodeIndices||[])];if(!found||!indices.length){this.toast('請先選取筆畫節點');return;}this.history.pushScoped(mode==='corner'?'設為角點':mode==='symmetric'?'設為對稱節點':'設為平滑節點',[this.objectPath(found)],()=>{for(const index of indices)setStrokeNodeMode(found.object,index,mode);});this.strokeEdit.handle=null;this.queueSpatialObject(this.strokeEdit.ref);this.refreshSelectionUI();this.renderer.render();}
  changeSelectedSegmentStyle(key,value,commit=true){const found=this.editableStroke(),edit=this.strokeEdit;if(!found||!Number.isInteger(edit.segmentIndex))return;const apply=()=>setStrokeSegmentStyle(found.object,edit.segmentIndex,{[key]:value});if(commit)this.history.pushScoped('調整區段樣式',[this.objectPath(found)],apply);else apply();this.queueSpatialObject(edit.ref);this.refreshSelectionUI();this.renderer.render();}
  resetSelectedSegmentStyle(){const found=this.editableStroke(),edit=this.strokeEdit;if(!found||!Number.isInteger(edit.segmentIndex))return;this.history.pushScoped('恢復區段樣式',[this.objectPath(found)],()=>clearStrokeSegmentStyle(found.object,edit.segmentIndex));this.queueSpatialObject(edit.ref);this.refreshSelectionUI();this.renderer.render();}
  splitEditedStroke(){const found=this.editableStroke(),edit=this.strokeEdit;if(!found||!Number.isInteger(edit.segmentIndex)){this.toast('請先點選一個筆畫區段');return;}this.history.pushScoped('切割筆畫區段',[this.objectContainerPath(found)],()=>{const pieces=splitStrokeAtSegment(found.object,edit.segmentIndex,edit.segmentT,uid);if(pieces.length!==2)return;for(const piece of pieces){if(found.parentObject)piece.parentId=found.parentObject.id;else delete piece.parentId;}found.parentArray.splice(found.objectIndex,1,...pieces);this.selection=pieces.map(object=>({layerId:found.layer.id,objectId:object.id}));this.strokeEdit=null;});this.refreshAll();this.revealObjectInspector();}
  deleteEditedNodes(){const found=this.editableStroke(),indices=[...(this.strokeEdit?.nodeIndices||[])];if(!found||!indices.length){this.toast('請先選取筆畫節點');return;}this.history.pushScoped('刪除筆畫節點',[this.objectContainerPath(found)],()=>{const replacement=deleteStrokeNodes(found.object,indices);if(replacement){if(found.parentObject)replacement.parentId=found.parentObject.id;found.parentArray[found.objectIndex]=replacement;}else{found.parentArray.splice(found.objectIndex,1);this.selection=[];}this.strokeEdit=null;});this.refreshAll();}
  simplifyEditedStroke(){const found=this.editableStroke();if(!found)return;const before=found.object.points.length;this.history.pushScoped('簡化筆畫節點',[this.objectPath(found)],()=>{found.object.points=simplifyStrokePoints(found.object.points,Math.max(.5,(found.object.size||2)*.08));delete found.object.segmentStyles;});const after=found.object.points.length;this.strokeEdit.nodeIndices=new Set();this.strokeEdit.segmentIndex=null;this.strokeEdit.handle=null;this.queueSpatialObject(this.strokeEdit.ref);this.refreshSelectionUI();this.renderer.render();this.toast(`節點 ${before} → ${after}`);}
  editablePath(){if(!this.pathEditing?.active)return null;try{const found=this.pathEditing.resolve();return found?.interactionExposed===false?null:found;}catch{return null;}}
  enterPathEdit(ref=null){try{this.strokeEdit=null;this.pathEditing.enter(ref);this.setTool('select');this.refreshSelectionUI();this.revealObjectInspector();this.renderer.render();return true;}catch(error){this.toast(error?.code==='PATH_EDIT_SINGULAR_TARGET'?'物件轉換不可逆，無法編輯路徑':'請先選取可編輯 Path');return false;}}
  exitPathEdit(){if(!this.pathEditing?.active)return false;this.pathEditing.exit();this.refreshSelectionUI();this.renderer.render();return true;}
  pathEditHit(sx,sy){
    const found=this.editablePath();if(!found)return null;const path=found.object,world=found.worldMatrix||found.object.matrix;if(!M.tryInvert(world))return null;
    for(const key of this.pathEditing.state.anchorKeys){const parts=key.split(':').map(Number),subpathIndex=parts[0],anchorIndex=parts[1],anchor=path.subpaths?.[subpathIndex]?.anchors?.[anchorIndex];if(!anchor)continue;for(const side of ['in','out']){const handle=anchor[side];if(!handle||(!handle.x&&!handle.y))continue;const screen=this.renderer.worldToScreen(M.point(world,{x:anchor.x+handle.x,y:anchor.y+handle.y}));if(Math.hypot(screen.x-sx,screen.y-sy)<=8)return{type:'handle',subpathIndex,anchorIndex,side};}}
    for(let subpathIndex=0;subpathIndex<path.subpaths.length;subpathIndex++)for(let anchorIndex=0;anchorIndex<path.subpaths[subpathIndex].anchors.length;anchorIndex++){const anchor=path.subpaths[subpathIndex].anchors[anchorIndex],screen=this.renderer.worldToScreen(M.point(world,anchor));if(Math.hypot(screen.x-sx,screen.y-sy)<=9)return{type:'anchor',subpathIndex,anchorIndex};}
    let best=null;
    for(let subpathIndex=0;subpathIndex<path.subpaths.length;subpathIndex++){const sub=path.subpaths[subpathIndex],count=sub.closed?sub.anchors.length:Math.max(0,sub.anchors.length-1);for(let segmentIndex=0;segmentIndex<count;segmentIndex++){const a=sub.anchors[segmentIndex],b=sub.anchors[(segmentIndex+1)%sub.anchors.length];let previous=null;for(let step=0;step<=24;step++){const t=step/24,u=1-t,p1={x:a.x+a.out.x,y:a.y+a.out.y},p2={x:b.x+b.in.x,y:b.y+b.in.y},local={x:u*u*u*a.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*b.y},screen=this.renderer.worldToScreen(M.point(world,local));if(previous){const dx=screen.x-previous.x,dy=screen.y-previous.y,len=dx*dx+dy*dy,projection=len?clamp(((sx-previous.x)*dx+(sy-previous.y)*dy)/len,0,1):0,distanceTo=Math.hypot(sx-(previous.x+dx*projection),sy-(previous.y+dy*projection));if(distanceTo<=7&&(!best||distanceTo<best.distance))best={type:'segment',subpathIndex,segmentIndex,t:(step-1+projection)/24,distance:distanceTo};}previous=screen;}}}
    return best;
  }
  selectAllPathAnchors(){const found=this.editablePath();if(!found)return false;const refs=[];for(let subpathIndex=0;subpathIndex<found.object.subpaths.length;subpathIndex++)for(let anchorIndex=0;anchorIndex<found.object.subpaths[subpathIndex].anchors.length;anchorIndex++)refs.push({subpathIndex,anchorIndex});this.pathEditing.selectAnchors(refs);this.refreshSelectionUI();this.renderer.render();return true;}
  insertPathAnchor(){const segment=this.pathEditing?.state?.segment;if(!segment)return false;try{this.pathEditing.addAnchorOnSegment(segment.subpathIndex,segment.segmentIndex,segment.t);this.refreshSelectionUI();return true;}catch{this.toast('無法插入 Path 節點');return false;}}
  deletePathAnchors(){try{this.pathEditing.deleteSelectedAnchors();this.refreshSelectionUI();return true;}catch(error){this.toast(error?.code?.includes('MINIMUM')?'路徑至少需保留可用節點數':'無法刪除 Path 節點');return false;}}
  setPathAnchorMode(mode){try{this.pathEditing.setSelectedAnchorMode(mode);this.refreshSelectionUI();return true;}catch{this.toast('請先選取 Path 節點');return false;}}
  toggleEditedPathClosed(){const found=this.editablePath();if(!found)return false;const segment=this.pathEditing.state.segment,first=this.pathEditing.selectedAnchors()[0],subpathIndex=segment?.subpathIndex??first?.subpathIndex??0,sub=found.object.subpaths[subpathIndex];if(!sub)return false;try{this.pathEditing.setSubpathClosed(subpathIndex,!sub.closed);this.refreshSelectionUI();return true;}catch{this.toast('目前節點數不足以閉合路徑');return false;}}
  simplifyEditedPath(){try{const result=this.pathEditing.simplify({tolerance:.75,handleTolerance:.2,maxPasses:256});this.toast('Path 節點 '+result.beforeNodeCount+' → '+result.afterNodeCount);this.refreshSelectionUI();return result;}catch{this.toast('Path 簡化失敗');return null;}}
  refineEditedPath(){try{const result=this.pathEditing.refine({maxControlLength:48,maxAddedAnchors:128});this.toast('Path 新增 '+result.addedNodeCount+' 個節點');this.refreshSelectionUI();return result;}catch{this.toast('Path refine 失敗');return null;}}
  setPathExpressiveStroke(style,ref=null){try{const result=this.pathStrokeAppearance.assign(style,{ref});this.refreshSelectionUI();this.renderer.render();return result;}catch(error){this.toast(error?.code==='EXPRESSIVE_STROKE_HISTORY_BUSY'?'歷史操作進行中':error?.code==='EXPRESSIVE_STROKE_TARGET_UNAVAILABLE'?'Path 已鎖定或隱藏':'無法套用表現筆畫');return null;}}
  setPathStrokeFromBrush(presetId='ink',overrides={},ref=null){const preset=ENGINE_BRUSH_PRESETS.find(item=>item.id===presetId);if(!preset){this.toast('找不到筆刷 preset');return null;}try{const result=this.pathStrokeAppearance.assignBrushPreset(preset,overrides,{ref});this.refreshSelectionUI();this.renderer.render();return result;}catch(error){this.toast(error?.code==='EXPRESSIVE_STROKE_HISTORY_BUSY'?'歷史操作進行中':error?.code==='EXPRESSIVE_STROKE_TARGET_UNAVAILABLE'?'Path 已鎖定或隱藏':'無法套用筆刷表現');return null;}}
  clearPathExpressiveStroke(ref=null){try{const result=this.pathStrokeAppearance.remove({ref});this.refreshSelectionUI();this.renderer.render();return result;}catch(error){this.toast(error?.code==='EXPRESSIVE_STROKE_HISTORY_BUSY'?'歷史操作進行中':'無法移除表現筆畫');return null;}}
  repaintSelectedPaths(patch={},refs=null){try{const result=this.pathRepaintMaterial.repaint(patch,{refs});this.refreshSelectionUI();this.renderer.render();return result;}catch(error){this.toast(error?.code==='REPAINT_MATERIAL_HISTORY_BUSY'?'歷史操作進行中':error?.code==='REPAINT_MATERIAL_LOCKED_TARGET'?'選取物件已鎖定':error?.code==='REPAINT_MATERIAL_HIDDEN_TARGET'?'選取物件已隱藏':error?.code==='REPAINT_MATERIAL_STALE_SELECTION'?'選取已失效':'無法重新著色 Path');return null;}}
  applySelectedPathMaterial(material,refs=null){try{const result=this.pathRepaintMaterial.applyMaterial(material,{refs});this.refreshSelectionUI();this.renderer.render();return result;}catch(error){this.toast(error?.code==='REPAINT_MATERIAL_HISTORY_BUSY'?'歷史操作進行中':'無法套用 Path 材質');return null;}}
  replaceSelectedPathMaterial(material,refs=null){try{const result=this.pathRepaintMaterial.replaceMaterial(material,{refs});this.refreshSelectionUI();this.renderer.render();return result;}catch(error){this.toast(error?.code==='REPAINT_MATERIAL_HISTORY_BUSY'?'歷史操作進行中':'無法更換 Path 材質');return null;}}
  clearSelectedPathMaterial(refs=null){try{const result=this.pathRepaintMaterial.removeMaterial({refs});this.refreshSelectionUI();this.renderer.render();return result;}catch(error){this.toast(error?.code==='REPAINT_MATERIAL_HISTORY_BUSY'?'歷史操作進行中':'無法移除 Path 材質');return null;}}
  selectedPathMaterialDiagnostics(refs=null){try{return this.pathRepaintMaterial.diagnostics({refs});}catch{return[];}}
  applyPathExpressiveStrokeFromUI(options={}){const found=this.selectedObjects().length===1&&this.selectedObjects()[0]?.object.type==='path'?this.selectedObjects()[0]:null;if(!found)return null;const presetId=options.presetId||'ink',color=options.color||found.object.stroke||'#202020',baseWidth=Number(options.baseWidth??Math.max(.5,found.object.strokeWidth||1.5)),taperStart=clamp(Number(options.taperStart??0),0,1),taperEnd=clamp(Number(options.taperEnd??0),0,1),pressureInfluence=clamp(Number(options.pressureInfluence??1),0,1);return this.setPathStrokeFromBrush(presetId,{color,baseWidth,taperStart,taperEnd,pressureInfluence},{layerId:found.layer.id,objectId:found.object.id});}
  renderBrushPreview(){return null;}
  advancePersistenceGeneration({mutation=false}={}){this.persistenceGeneration=(this.persistenceGeneration||0)+1;if(mutation)this.mutationEpoch=(this.mutationEpoch||0)+1;clearTimeout(this.autosaveTimer);return this.persistenceGeneration;}
  autosaveAdmission(){return{document:this.doc,documentId:this.doc?.id||null,generation:this.persistenceGeneration,mutationEpoch:this.mutationEpoch};}
  autosaveAdmissionCurrent(admission){return Boolean(admission)&&admission.document===this.doc&&admission.documentId===(this.doc?.id||null)&&admission.generation===this.persistenceGeneration&&admission.mutationEpoch===this.mutationEpoch;}
  replaceDocument(raw,{fromHistory=false,skipSanitize=false}={}){this.advancePersistenceGeneration();this.store?.invalidate?.('autosave');const nextDocument=skipSanitize?raw:sanitizeDocument(raw);this.doc=nextDocument;if(!fromHistory)this.documentOpen=true;this.selection=[];this.draft=null;this.strokeEdit=null;this.spatialDirty=true;this.flora?.hero?.cache?.clear?.();this.studio?.reloadBrushPackages?.();this.renderer.imageCache.clear();this.renderer.studioImageCache?.clear();this.renderer.studioLayerCache?.clear();this.renderer.liveTiles.clear();this.commands?.notify?.('native-document-state');this.refreshAll();if(!fromHistory){this.history.clear();this.dirty=false;}this.renderer.render();}
  markDirty(){this.renderer?.invalidateTiles?.();this.renderer?.studioImageCache?.clear();this.renderer?.studioLayerCache?.clear();this.advancePersistenceGeneration({mutation:true});this.dirty=true;this.doc.modifiedAt=nowISO();this.scheduleAutosave();this.refreshPagesDebounced();}
  scheduleAutosave(){clearTimeout(this.autosaveTimer);const admission=this.autosaveAdmission(),snapshot=deepClone(this.doc);this.commands?.notify?.('autosave-pending');this.autosaveTimer=setTimeout(async()=>{if(!this.autosaveAdmissionCurrent(admission))return;const integrity=inspectDocument(snapshot);if(!integrity.passed){this.commands?.notify?.('autosave-error');this.health.recordError('Autosave blocked by document integrity',{source:'autosave',errors:integrity.errors.length});return;}const ok=await this.store.save('autosave',snapshot);if(!this.autosaveAdmissionCurrent(admission))return;this.commands?.notify?.(ok===true?'autosave-saved':'autosave-error');if(ok!==true)this.health.recordError('Autosave persistence unavailable',{source:'autosave-storage',storage:this.store.diagnostics?.()||null});},700);}
  async loadAutosave(){if(new URLSearchParams(location.search).has('fresh'))return false;const admission=this.autosaveAdmission();const result=await this.store.loadWithRecovery('autosave',value=>inspectDocument(value).passed);if(!this.autosaveAdmissionCurrent(admission))return false;const saved=result.value;if(saved?.modifiedAt){try{if(!this.autosaveAdmissionCurrent(admission))return false;this.replaceDocument(saved);this.toast(result.recovered?`已從 ${result.source} 備援恢復`:'已恢復上次自動儲存');return true;}catch(e){this.health.recordError(e,{source:'autosave-restore'});console.warn('Autosave restore failed',e);}}return false;}
  captureHealthSnapshot(){const integrity=inspectDocument(this.doc);return this.health.heartbeat({document:{passed:integrity.passed,stats:integrity.stats,fingerprint:integrity.fingerprint},history:this.history.stats(),render:this.renderer.naturalMedia.diagnostics(),liveTiles:this.renderer.liveTileDiagnostics(),artboard:{...this.page().artboard},storage:this.store.diagnostics(),updates:this.updates.diagnostics()});}
  async runStorageHealthCheck(){const probe=await this.store.probe();let serviceWorker=false,cache=false;try{serviceWorker=Boolean(navigator.serviceWorker);cache=Boolean(globalThis.caches);if(serviceWorker&&location.protocol.startsWith('http'))await navigator.serviceWorker.ready;}catch{}const onlineShell=location.protocol.startsWith('http');const pass=probe.ok&&probe.verified&&(!onlineShell||serviceWorker&&cache),result={storage:probe,serviceWorker,cache,onlineShell,pass};this.commands?.notify?.('native-storage-health');return result;}
  refreshReleaseHealthUI(updateStatus=this.updates.diagnostics()){if(updateStatus?.buildId&&window.INK_ARCHITECTURE)window.INK_ARCHITECTURE.serviceWorkerBuildId=updateStatus.buildId;this.commands?.notify?.('native-update-status');return updateStatus;}
  documentIntegrity(){return inspectDocument(this.doc);}
  async downloadExternalDiagnosticBundle(){const bundle=await buildExternalDiagnosticBundle({app:this,target:window,recorder:this.externalValidation,version:INK_VERSION,buildId:(this.updates?.buildId||BUILD_ID),formatVersion:FORMAT_VERSION});this.download(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}),`INK_external_diagnostics_${INK_VERSION.replace(/[^a-z0-9.-]+/gi,'_')}.json`);this.toast('外部測試診斷包已建立');return bundle;}
  async runReleaseHealthCheck(){const integrity=inspectDocument(this.doc),storage=await this.store.probe(),snapshot=this.captureHealthSnapshot(),runtime=this.health.diagnostics(),render=this.renderer.naturalMedia.diagnostics(),updates=this.updates.diagnostics(),warnings=[];if(render.forcedReason)warnings.push('gpu-fallback');if(!updates.supported||updates.state==='idle')warnings.push('update-service-unverified');const pass=integrity.passed&&storage.ok&&storage.verified&&runtime.status!=='fail'&&Boolean(render.activeBackend),result={pass,warnings,integrity,storage,runtime,render,updates,snapshot};this.commands?.notify?.('native-release-health');return result;}
  toast(message,ms=1700){const critical=/失敗|錯誤|無法|不可|未通過|unavailable|error|failed|請|至少|鎖定|取消|拒絕|停止|不支援|找不到|阻擋|需要|缺少|必須|尚未|invalid|cancel|warning|blocked|unsupported/i.test(String(message));if(!critical){this.el.toast.classList.remove('show');return;}this.el.toast.textContent=message;this.el.toast.classList.add('show');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>this.el.toast.classList.remove('show'),ms);}
  showZoomHud(){this.el.zoomHud.textContent=`${Math.round(this.page().camera.scale*100)}%`;this.el.zoomHud.classList.add('show');clearTimeout(this.zoomHudTimer);this.zoomHudTimer=setTimeout(()=>this.el.zoomHud.classList.remove('show'),750);}
  download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},800);}

  runUiCommand(commandId,args={},origin='human-ui'){const finish=response=>{if(!response?.ok&&response?.error?.code!=='NO_OP')this.toast(response?.error?.message||'功能目前不可用');return response;};const response=this.commands?.execute?.(commandId,args,origin);return response&&typeof response.then==='function'?response.then(finish):finish(response);}

  isMobile(){return Boolean(globalThis.matchMedia?.('(max-width: 820px)')?.matches);}
  toggleWorkspaceMenu(){return false;}
  runWorkspaceCommand(command){if(command==='creation'||command==='layout')this.runUiCommand('workspace.activate.v1',{space:command});else if(command==='fit-current')this.runUiCommand(this.spaceMode()==='layout'?'view.fit.artboard.v1':'view.fit.content.v1');else if(command==='reset-current')this.runUiCommand('view.reset.v1');else if(command==='fit-viewport')this.fitLayoutViewportToContent();this.toggleWorkspaceMenu(false);}
  previewLayoutViewport(values={}){const workspace=this.workspace();if(!this.layoutViewportPreview)this.layoutViewportPreview=normalizeLayoutViewport(workspace.layoutViewport);workspace.layoutViewport=normalizeLayoutViewport({...workspace.layoutViewport,...values});this.renderer.invalidateTiles();this.refreshLayoutViewportUI();this.renderer.render();}
  commitLayoutViewport(values={}){const page=this.page(),current=normalizeLayoutViewport(this.workspace().layoutViewport),before=this.layoutViewportPreview||current,next=normalizeLayoutViewport({...current,...values});this.layoutViewportPreview=null;if(JSON.stringify(before)===JSON.stringify(next)){this.refreshLayoutViewportUI();return next;}this.workspace().layoutViewport=before;this.history.pushScoped('調整版面視埠',[[...this.pagePath(page),'workspace','layoutViewport']],()=>{this.workspace().layoutViewport=next;});this.renderer.invalidateTiles();this.refreshLayoutViewportUI();this.renderer.render();return next;}
  fitLayoutViewportToContent({commit=true,render=true}={}){this.layoutViewportPreview=null;const page=this.page(),content=this.renderer.contentBounds(page),trim=artboardTrimBounds(page);if(!content){return this.resetLayoutViewport({commit,render});}const padding=.92,scale=clamp(Math.min(trim.w/Math.max(1,content.w),trim.h/Math.max(1,content.h))*padding,.01,100),next=normalizeLayoutViewport({x:content.x+content.w/2,y:content.y+content.h/2,scale,rotation:0});if(commit)this.history.pushScoped('內容符合版面視埠',[[...this.pagePath(page),'workspace','layoutViewport']],()=>{this.workspace().layoutViewport=next;});else this.workspace().layoutViewport=next;this.renderer.invalidateTiles();this.refreshLayoutViewportUI();if(render)this.renderer.render();return next;}
  resetLayoutViewport({commit=true,render=true}={}){this.layoutViewportPreview=null;const page=this.page(),next=normalizeLayoutViewport({x:0,y:0,scale:1,rotation:0});if(commit)this.history.pushScoped('重設版面視埠',[[...this.pagePath(page),'workspace','layoutViewport']],()=>{this.workspace().layoutViewport=next;});else this.workspace().layoutViewport=next;this.renderer.invalidateTiles();this.refreshLayoutViewportUI();if(render)this.renderer.render();return next;}
  refreshLayoutViewportUI(){const viewport=normalizeLayoutViewport(this.workspace().layoutViewport);this.commands?.notify?.('native-layout-viewport-state');return viewport;}
  refreshScrim(){return false;}
  toggleInspector(){return false;}
  revealObjectInspector(){this.commands?.notify?.('native-selection-state');return false;}
  toggleInspectorSize(){return false;}
  bindInspectorResize(){return false;}
  toggleBrushFamilyPopover(){return false;}
  openMobileToolSheet(){return false;}
  runSelectionAction(action){const actions={duplicate:()=>this.runUiCommand('selection.duplicate.v1'),group:()=>this.groupSelection(),front:()=>this.reorderSelection('front'),alignCenter:()=>this.runUiCommand('object.align.v1',{mode:'centerX'}),delete:()=>this.runUiCommand('selection.delete.v1')};actions[action]?.();}

  refreshAll(){this.spatialDirty=true;this.spatialPending.clear();this.refreshToolUI();this.refreshLayers();this.refreshPages();this.refreshSelectionUI();this.refreshWorkspaceUI();this.refreshArtboardUI();this.refreshPaperUI();this.refreshPenCalibrationUI();this.updateHistoryUI();this.creativeWorkspace?.refresh?.();this.renderer.render();}
  refreshToolUI(){this.updateCursor();this.commands?.notify?.('native-tool-state');this.creativeWorkspace?.refresh?.();}
  renderPresets(){return false;}
  applyPreset(tool,preset){const oldColor=this.toolSettings[tool]?.color||'#202020';this.toolSettings[tool]={...deepClone(preset),color:oldColor};this.renderer.naturalMedia.clearCaches();this.refreshToolUI();this.toast(`筆刷：${preset.name}`);}
  setTool(tool){if(tool!=='select'&&this.strokeEdit)this.exitStrokeEdit();if(tool!=='select'&&this.pathEditing?.active)this.exitPathEdit();this.tool=tool;if(DRAW_TOOLS.has(tool))this.lastDrawTool=tool;this.closeTextEditor();this.updateCursor();this.commands?.notify?.('native-tool-state');this.renderer.render();}
  updateCursor(){const cursors={pan:'grab',select:'default',lasso:'crosshair',eraser:'cell',text:'text',shape:'crosshair'};this.el.canvas.style.cursor=cursors[this.tool]||'crosshair';}
  setInspectorTab(){return false;}
  setRenderPreference(mode){if(!this.renderer.naturalMedia.setPreference(mode))return;this.renderPreference=mode;try{localStorage.setItem('ink-render-engine',mode);}catch{}this.renderer.naturalMedia.clearCaches();this.refreshRenderEngineUI();this.renderer.render();this.toast(mode==='canvas2d'?'已切換 Canvas 相容渲染':mode==='gpu'?'已優先使用 WebGL2 GPU':'已啟用自動媒材渲染');}
  runGPUValidation(){const result=this.renderer.naturalMedia.runGPUValidation();this.commands?.notify?.('native-render-validation');this.refreshRenderEngineUI();return result;}
  updatePenProfile(key,value){const profile=this.penInput.setProfile({[key]:value});try{localStorage.setItem('ink-pen-profile',JSON.stringify(profile));}catch{}this.refreshPenCalibrationUI();return profile;}
  resetPenCalibration(){const profile=this.penInput.setProfile(normalizePenProfile({}));this.penInput.resetStats();try{localStorage.setItem('ink-pen-profile',JSON.stringify(profile));}catch{}this.refreshPenCalibrationUI();this.toast('觸控筆校準已重設');return profile;}
  runPenCalibrationCheck(){const info=this.penInput.diagnostics();this.commands?.notify?.('native-pen-diagnostics');return info;}
  refreshPenCalibrationUI(){this.commands?.notify?.('native-pen-profile');}
  refreshRenderEngineUI(){this.commands?.notify?.('native-render-status');}
  updateBrushSetting(key,value){const tool=DRAW_TOOLS.has(this.tool)?this.tool:this.lastDrawTool;this.toolSettings[tool][key]=value;this.renderer.naturalMedia.clearCaches();this.renderer.render();this.commands?.notify?.('native-tool-state');}
  setColor(value,normalize=false){let v=String(value).trim();if(!v.startsWith('#'))v='#'+v;if(!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)){if(normalize)this.toast('顏色格式不正確');return;}v=v.slice(0,7).toLowerCase();const tool=DRAW_TOOLS.has(this.tool)?this.tool:this.lastDrawTool;this.toolSettings[tool].color=v;this.doc.recentColors=[v,...this.doc.recentColors.filter(c=>c.toLowerCase()!==v)].slice(0,16);this.renderer.naturalMedia.clearCaches();this.renderer.render();this.commands?.notify?.('native-tool-state');}
  renderRecentColors(){return false;}
  refreshLayers(){this.commands?.notify?.('native-layer-state');}
  refreshPagesDebounced(){clearTimeout(this.pagesRefreshTimer);this.pagesRefreshTimer=setTimeout(()=>this.refreshPages(),300);}
  refreshPages(){this.commands?.notify?.('native-page-state');}
  refreshSelectionUI(){const selected=this.selectedObjects();if(this.strokeEdit&&(!selected.some(found=>found.layer.id===this.strokeEdit.ref.layerId&&found.object.id===this.strokeEdit.ref.objectId)||!this.editableStroke()))this.strokeEdit=null;if(this.pathEditing?.active&&(!selected.some(found=>found.layer.id===this.pathEditing.state.ref.layerId&&found.object.id===this.pathEditing.state.ref.objectId)||!this.editablePath()))this.pathEditing.exit();this.commands?.notify?.('native-selection-state');this.creativeWorkspace?.refresh?.();}
  refreshPaperUI(){this.commands?.notify?.('native-paper-state');}
  setHistoryLimit(value){const limit=this.history.setLimit(value);try{localStorage.setItem('ink-history-limit',String(limit));}catch{}this.updateHistoryUI();this.toast(`歷史記錄保留 ${limit} 步`);return limit;}
  updateHistoryUI(){this.commands?.notify?.('native-history-state');}
  updateStatus(){this.commands?.notify?.('native-status-state');}
  newDocument({artboard=null}={}){if(this.dirty&&!confirm('建立新作品？未另存的修改會離開目前畫面。'))return{changed:false,cancelled:true};const document=defaultDocument();for(const page of document.pages){if(artboard)page.artboard=normalizeArtboard({...page.artboard,...artboard});page.artboard.showSafeArea=false;page.artboard.showCenter=false;activateWorkspace(page,'layout');}this.replaceDocument(document);this.history.clear();this.autosaveBoundaryPromise=Promise.resolve(this.store.remove('autosave')).then(ok=>{if(ok!==true)this.health.recordError('Autosave deletion unavailable',{source:'autosave-new-boundary',storage:this.store.diagnostics?.()||null});return ok;}).catch(error=>{this.health.recordError(error,{source:'autosave-new-boundary'});return false;});this.fitArtboard({switchSpace:false});this.toast('已建立新作品');return{changed:true,cancelled:false,artboard:deepClone(this.page().artboard)};}
  addPage(){this.history.pushScoped('新增頁面',[['pages'],['activePageId']],()=>{const p=defaultPage(this.doc.pages.length+1);this.doc.pages.push(p);this.doc.activePageId=p.id;});this.selection=[];this.refreshAll();}
  deletePage(id=this.doc.activePageId){if(this.doc.pages.length<=1){this.toast('至少需要保留一個頁面');return;}this.history.pushScoped('刪除頁面',[['pages'],['activePageId']],()=>{const i=this.doc.pages.findIndex(p=>p.id===id);this.doc.pages.splice(i,1);this.doc.activePageId=this.doc.pages[Math.max(0,i-1)].id;});this.selection=[];this.refreshAll();}
  duplicatePage(id=this.doc.activePageId){this.history.pushScoped('複製頁面',[['pages'],['activePageId']],()=>{const i=this.doc.pages.findIndex(p=>p.id===id),copy=deepClone(this.doc.pages[i]);copy.id=uid();copy.name+= ' 副本';copy.layers.forEach(l=>{l.id=uid();l.objects.forEach(o=>this.regenerateIds(o));});copy.activeLayerId=copy.layers[0].id;this.doc.pages.splice(i+1,0,copy);this.doc.activePageId=copy.id;});this.selection=[];this.refreshAll();}
  pageContextMenu(page){const action=prompt(`頁面：${page.name}\n輸入 1 重新命名、2 複製、3 刪除`,'1');if(action==='1'){const n=prompt('頁面名稱',page.name);if(n?.trim())this.runUiCommand('page.rename.v1',{pageId:page.id,name:n.trim()});}else if(action==='2')this.runUiCommand('page.duplicate.v1',{pageId:page.id});else if(action==='3')this.runUiCommand('page.delete.v1',{pageId:page.id});}
  switchPage(id){if(id===this.doc.activePageId)return;this.doc.activePageId=id;this.selection=[];this.draft=null;this.refreshAll();}
  regenerateIds(o,parentId=null){return regenerateCompositionIds(o,{parentId});}

  reorderLayer(sourceId,targetId,position='before'){const p=this.page();if(!sourceId||!targetId||sourceId===targetId)return false;const display=[...p.layers].reverse(),source=display.find(layer=>layer.id===sourceId),targetIndex=display.findIndex(layer=>layer.id===targetId);if(!source||targetIndex<0)return false;const current=display.indexOf(source);display.splice(current,1);let insertIndex=display.findIndex(layer=>layer.id===targetId);if(position==='after')insertIndex+=1;insertIndex=clamp(insertIndex,0,display.length);display.splice(insertIndex,0,source);const next=[...display].reverse();if(next.every((layer,index)=>layer===p.layers[index]))return false;this.history.pushScoped('拖曳移動圖層',[[...this.pagePath(),'layers']],()=>{p.layers.splice(0,p.layers.length,...next);});this.refreshLayers();this.renderer.render();this.markDirty();return true;}
  addLayer(){this.history.pushScoped('新增圖層',[[...this.pagePath(),'layers'],[...this.pagePath(),'activeLayerId']],()=>{const p=this.page(),l=defaultLayer(`圖層 ${p.layers.length+1}`);p.layers.push(l);p.activeLayerId=l.id;});this.refreshLayers();this.renderer.render();}
  deleteLayer(){const p=this.page(),l=this.layer();if(p.layers.length<=1){this.toast('至少需要保留一個圖層');return;}this.history.pushScoped('刪除圖層',[[...this.pagePath(),'layers'],[...this.pagePath(),'activeLayerId']],()=>{const i=p.layers.findIndex(x=>x.id===l.id);p.layers.splice(i,1);p.activeLayerId=p.layers[Math.max(0,i-1)].id;this.selection=this.selection.filter(r=>r.layerId!==l.id);});this.refreshAll();}
  duplicateLayer(){const p=this.page(),l=this.layer();this.history.pushScoped('複製圖層',[[...this.pagePath(),'layers'],[...this.pagePath(),'activeLayerId']],()=>{const i=p.layers.indexOf(l),copy=deepClone(l);copy.id=uid();copy.name+=' 副本';copy.objects.forEach(o=>this.regenerateIds(o));p.layers.splice(i+1,0,copy);p.activeLayerId=copy.id;});this.refreshAll();}
  moveLayer(direction){const p=this.page(),l=this.layer(),i=p.layers.indexOf(l),j=clamp(i+direction,0,p.layers.length-1);if(i===j)return;this.history.pushScoped('移動圖層',[[...this.pagePath(),'layers']],()=>{p.layers.splice(i,1);p.layers.splice(j,0,l);});this.refreshLayers();this.renderer.render();}
  changeLayerOpacity(value,commit){const layer=this.layer();if(this.layerOpacityStart==null)this.layerOpacityStart=layer.opacity;layer.opacity=value;this.renderer.render();if(commit){const before=this.layerOpacityStart;this.layerOpacityStart=null;if(before!==value){layer.opacity=before;this.runUiCommand('layer.opacity.set.v1',{layerId:layer.id,opacity:value});}}}
  selectOnly(layerId,objectId){this.selection=[{layerId,objectId}];this.refreshSelectionUI();this.revealObjectInspector();this.renderer.render();}
  clearSelection(){this.selection=[];this.refreshSelectionUI();this.renderer.render();}
  deleteSelection(){const found=this.selectedTransformObjects();if(!found.length)return;const targets=[...new Set(found.map(f=>JSON.stringify(this.objectContainerPath(f))).filter(Boolean))].map(x=>JSON.parse(x));this.history.pushScoped('刪除物件',targets,()=>{for(const item of [...found].sort((a,b)=>b.depth-a.depth||b.objectIndex-a.objectIndex)){const current=this.findObject({layerId:item.layer.id,objectId:item.object.id});if(current)current.parentArray.splice(current.objectIndex,1);}this.selection=[];});this.refreshAll();}
  duplicateSelection(offset=18){const found=this.compositionTransformObjects();if(!found.length)return;const targets=[...new Set(found.map(f=>JSON.stringify(this.objectContainerPath(f))).filter(Boolean))].map(x=>JSON.parse(x));this.history.pushScoped('複製物件',targets,()=>{const newSel=[];for(const original of found){const f=this.findObject({layerId:original.layer.id,objectId:original.object.id});if(!f)continue;const copy=deepClone(f.object);this.regenerateIds(copy,f.parentObject?.id||null);copy.matrix=M.multiply(M.translate(offset,offset),copy.matrix);f.parentArray.splice(f.objectIndex+1,0,copy);newSel.push({layerId:f.layer.id,objectId:copy.id});}this.selection=newSel;});this.refreshAll();}
  translateSelection(dx,dy,label='移動物件'){const selected=this.compositionTransformObjects();if(!selected.length||(!dx&&!dy))return;const t=M.translate(dx,dy);this.history.pushScoped(label,this.selectionHistoryTargets(),()=>{applyWorldTransformBatch(selected.map(f=>({found:this.findObject({layerId:f.layer.id,objectId:f.object.id}),transform:t})));});this.queueSpatialSelection();this.refreshSelectionUI();this.renderer.render();}
  applyTransformField(field,value){const selected=this.compositionTransformObjects();if(!Number.isFinite(value)||!selected.length)return;const singleFrame=selected.length===1&&selected[0].object.type==='frame'?selected[0]:null;if(singleFrame&&(field==='w'||field==='h')){if(value<=0)return;const ref={layerId:singleFrame.layer.id,objectId:singleFrame.object.id},path=this.objectPath(singleFrame);this.history.pushScoped('調整 Frame 幾何尺寸',[path],()=>{const current=this.findObject(ref);if(current)resizeFrameGeometry(current.object,{[field==='w'?'width':'height']:value,preserveAspect:this.aspectLock});});this.queueSpatialSelection();this.refreshSelectionUI();this.renderer.render();return;}const b=this.renderer.selectionWorldBounds();if(!b)return;let t=M.identity(),label='調整物件';if(field==='x')t=M.translate(value-b.x,0);else if(field==='y')t=M.translate(0,value-b.y);else if(field==='w'){if(value<=0)return;const sx=value/Math.max(.0001,b.w),sy=this.aspectLock?sx:1;t=M.around(b.x,b.y,M.scale(sx,sy));}else if(field==='h'){if(value<=0)return;const sy=value/Math.max(.0001,b.h),sx=this.aspectLock?sy:1;t=M.around(b.x,b.y,M.scale(sx,sy));}else if(field==='r'){const current=selected.length===1?matrixRotation(selected[0].worldMatrix||selected[0].object.matrix):0,delta=rad(value)-current,center={x:b.x+b.w/2,y:b.y+b.h/2};t=M.around(center.x,center.y,M.rotate(delta));label='旋轉物件';}else return;this.history.pushScoped(label,this.selectionHistoryTargets(),()=>{applyWorldTransformBatch(selected.map(f=>({found:this.findObject({layerId:f.layer.id,objectId:f.object.id}),transform:t})));});this.queueSpatialSelection();this.refreshSelectionUI();this.renderer.render();}
  alignSelection(mode){const items=this.compositionTransformObjects().map(f=>({...f,b:this.renderer.objectWorldBounds(f.object,f.parentWorldMatrix)}));if(items.length<2)return;const total=items.reduce((b,x)=>unionBounds(b,x.b),null);this.history.pushScoped('對齊物件',this.selectionHistoryTargets(),()=>{const plans=[];if(mode==='distributeX'||mode==='distributeY'){const horizontal=mode==='distributeX',sorted=[...items].sort((a,b)=>horizontal?a.b.x-b.b.x:a.b.y-b.b.y);if(sorted.length>2){const first=sorted[0].b,last=sorted.at(-1).b,totalSize=sorted.reduce((n,x)=>n+(horizontal?x.b.w:x.b.h),0),span=(horizontal?last.x+last.w-first.x:last.y+last.h-first.y),gap=(span-totalSize)/(sorted.length-1);let cursor=horizontal?first.x:first.y;for(const x of sorted){const current=horizontal?x.b.x:x.b.y,delta=cursor-current;plans.push({found:this.findObject({layerId:x.layer.id,objectId:x.object.id}),transform:M.translate(horizontal?delta:0,horizontal?0:delta)});cursor+=(horizontal?x.b.w:x.b.h)+gap;}}}else for(const x of items){let dx=0,dy=0;if(mode==='left')dx=total.x-x.b.x;else if(mode==='centerX')dx=total.x+total.w/2-(x.b.x+x.b.w/2);else if(mode==='right')dx=total.x+total.w-(x.b.x+x.b.w);else if(mode==='top')dy=total.y-x.b.y;else if(mode==='centerY')dy=total.y+total.h/2-(x.b.y+x.b.h/2);else if(mode==='bottom')dy=total.y+total.h-(x.b.y+x.b.h);plans.push({found:this.findObject({layerId:x.layer.id,objectId:x.object.id}),transform:M.translate(dx,dy)});}applyWorldTransformBatch(plans);});this.queueSpatialSelection();this.refreshSelectionUI();this.renderer.render();}
  changeObjectOpacity(value,commit){const selected=this.selectedObjects();if(!selected.length)return;if(this.objectOpacityStart==null)this.objectOpacityStart=selected.map(f=>({ref:{layerId:f.layer.id,objectId:f.object.id},value:f.object.opacity??1}));selected.forEach(f=>f.object.opacity=value);this.renderer.render();if(commit){const before=this.objectOpacityStart;this.objectOpacityStart=null;before.forEach(x=>{const f=this.findObject(x.ref);if(f)f.object.opacity=x.value;});this.history.pushScoped('調整物件透明度',this.selectionHistoryTargets(),()=>this.selectedObjects().forEach(f=>f.object.opacity=value));this.renderer.render();}}
  reorderSelection(where){const found=this.selectedTransformObjects(),byContainer=new Map();for(const f of found){if(!byContainer.has(f.parentArray))byContainer.set(f.parentArray,[]);byContainer.get(f.parentArray).push(f.object);}if(!byContainer.size)return;const targets=[...new Set(found.map(f=>JSON.stringify(this.objectContainerPath(f))).filter(Boolean))].map(x=>JSON.parse(x));this.history.pushScoped(where==='front'?'移至最上':'移至最下',targets,()=>{for(const [array,objects]of byContainer){const kept=array.filter(o=>!objects.includes(o));array.splice(0,array.length,...(where==='front'?[...kept,...objects]:[...objects,...kept]));}});this.refreshAll();}
  groupSelection(){const found=this.selectedTransformObjects();if(found.length<2){this.toast('至少選取兩個物件');return;}const parentArray=found[0].parentArray,layer=found[0].layer,parentObject=found[0].parentObject;if(found.some(f=>f.parentArray!==parentArray)){this.toast('群組物件必須位於同一容器');return;}this.history.pushScoped('群組物件',[this.objectContainerPath(found[0])],()=>{const indexes=found.map(f=>f.objectIndex).sort((a,b)=>a-b),children=indexes.map(i=>parentArray[i]);for(const child of children)child.parentId='__pending_group__';for(const child of [...children]){const index=parentArray.indexOf(child);if(index>=0)parentArray.splice(index,1);}const group={id:uid(),type:'group',name:'群組',matrix:M.identity(),opacity:1,children};if(parentObject)group.parentId=parentObject.id;for(const child of children)child.parentId=group.id;parentArray.splice(indexes[0],0,group);this.selection=[{layerId:layer.id,objectId:group.id}];});this.refreshAll();}
  ungroupSelection(){const found=this.selectedTransformObjects().filter(f=>f.object.type==='group');if(!found.length){this.toast('未選取群組');return;}const targets=[...new Set(found.map(f=>JSON.stringify(this.objectContainerPath(f))).filter(Boolean))].map(x=>JSON.parse(x));this.history.pushScoped('解散群組',targets,()=>{const newSel=[];for(const original of [...found].sort((a,b)=>b.depth-a.depth||b.objectIndex-a.objectIndex)){const f=this.findObject({layerId:original.layer.id,objectId:original.object.id});if(!f)continue;const children=f.object.children||[];for(const child of children){child.matrix=M.multiply(f.object.matrix,child.matrix);if(f.parentObject)child.parentId=f.parentObject.id;else delete child.parentId;newSel.push({layerId:f.layer.id,objectId:child.id});}f.parentArray.splice(f.objectIndex,1,...children);}this.selection=newSel;});this.refreshAll();}
  reparentObjectToFrame(objectId,frameId=null){const source=this.findObject({objectId}),target=frameId?this.findObject({objectId:frameId}):null;if(!source||frameId&&!target)return null;if(frameId&&source.layer.id!==target.layer.id){this.toast('Frame 只能包含同一圖層的物件');return null;}this.history.pushScoped(frameId?'移入 Frame':'移出 Frame',[[...this.pagePath(),'layers']],()=>reparentPageObject(this.page(),objectId,frameId,{targetLayerId:target?.layer.id||source.layer.id}));const moved=this.findObject({objectId});if(moved)this.selection=[{layerId:moved.layer.id,objectId:moved.object.id}];this.spatialDirty=true;this.refreshAll();return moved;}
  registerComponent(sourceRootId,name){return registerComponentDefinition(this,sourceRootId,name);}
  createInstance(definitionId,placement={}){return createComponentInstance(this,definitionId,{pageId:this.page().id,layerId:this.layer().id,...placement});}
  overrideInstance(instanceId,sourceNodeId,opacity){return setComponentOverride(this,instanceId,sourceNodeId,opacity);}
  detachInstance(instanceId){return detachComponentInstance(this,instanceId);}
  duplicateComponent(definitionId,name=null){return duplicateComponentDefinition(this,definitionId,name);}
  repairInstance(instanceId,definitionId){return repairComponentReference(this,instanceId,definitionId);}
  frameSelection({name='Frame',padding=12}={}){const selected=this.selectedTransformObjects();if(!selected.length)return null;const layer=selected[0].layer;if(selected.some(found=>found.layer.id!==layer.id)){this.toast('建立 Frame 時，選取物件必須位於同一圖層');return null;}let bounds=null;for(const found of selected)bounds=unionBounds(bounds,this.renderer.objectWorldBounds(found.object,found.parentWorldMatrix));const pad=Math.max(0,+padding||0),frame=createFrame({name,matrix:M.translate(bounds.x-pad,bounds.y-pad),width:Math.max(1,bounds.w+pad*2),height:Math.max(1,bounds.h+pad*2)}),ids=selected.map(found=>found.object.id);this.history.pushScoped('建立 Frame',[[...this.pagePath(),'layers']],()=>{layer.objects.push(frame);for(const id of ids)reparentPageObject(this.page(),id,frame.id,{targetLayerId:layer.id});});this.selection=[{layerId:layer.id,objectId:frame.id}];this.spatialDirty=true;this.refreshAll();return frame;}

  changeArtboard(key,value,{fit=true}={}){
    const page=this.page(),before=normalizeArtboard(page.artboard||{}),next=normalizeArtboard({...before,[key]:value});
    if(key==='orientation'||key==='preset'){
      const portrait=next.orientation==='portrait';next.widthMm=portrait?210:297;next.heightMm=portrait?297:210;next.preset='A4';
    }
    if(JSON.stringify(before)===JSON.stringify(next))return;
    this.history.pushScoped('調整畫板',[[...this.pagePath(page),'artboard']],()=>{page.artboard=next;});
    this.renderer.invalidateTiles();this.refreshArtboardUI();this.renderer.render();if(fit&&['orientation','preset'].includes(key))this.fitArtboard({switchSpace:false});
  }
  refreshWorkspaceUI(){const workspace=ensureWorkspace(this.page()),space=workspace.activeSpace;this.commands?.notify?.('native-workspace-state');this.refreshLayoutViewportUI();return space;}
  refreshArtboardUI(){const page=this.page(),artboard=normalizeArtboard(page.artboard||{});page.artboard=artboard;const pixels=artboardPixelSize(artboard,{ppi:artboard.ppi}),viewport=this.refreshLayoutViewportUI();this.commands?.notify?.('native-artboard-state');return{artboard,pixels,viewport,space:this.spaceMode(),description:describeArtboard(artboard)};}
  changePaper(key,value){const page=this.page();if(page.paper[key]===value)return;this.history.pushScoped('調整畫布',[[...this.pagePath(page),'paper']],()=>{page.paper[key]=value;});this.renderer.paperTextureCache.clear();this.renderer.naturalMedia.clearCaches();this.refreshPaperUI();this.renderer.render();}
  previewPaper(key,value){const page=this.page();if(!this.paperPreview||this.paperPreview.key!==key)this.paperPreview={key,before:page.paper[key]};page.paper[key]=value;this.renderer.invalidateTiles();this.renderer.paperTextureCache.clear();this.renderer.naturalMedia.clearCaches();this.renderer.render();}
  commitPaperPreview(key,value){const page=this.page(),before=this.paperPreview?.key===key?this.paperPreview.before:page.paper[key];this.paperPreview=null;if(before===value){this.refreshPaperUI();return;}page.paper[key]=before;return this.runUiCommand('page.paper.set.v1',{key,value});}
  resetView(){const cam=this.page().camera;cam.x=cam.y=cam.rotation=0;cam.scale=1;this.renderer.render();this.showZoomHud();}
  resetRotation(){this.page().camera.rotation=0;this.renderer.render();}
  zoomBy(factor,center={x:this.renderer.width/2,y:this.renderer.height/2}){const cam=this.page().camera,before=this.renderer.screenToWorld(center.x,center.y,cam,{left:0,top:0});cam.scale=clampViewScale(cam.scale*factor);const after=this.renderer.worldToScreen(before,cam);cam.x+=center.x-after.x;cam.y+=center.y-after.y;this.renderer.render();this.showZoomHud();}
  fitBounds(b,pad=70){if(!b){this.resetView();return;}const cam=this.page().camera;cam.rotation=0;cam.scale=clamp(Math.min((this.renderer.width-pad*2)/Math.max(1,b.w),(this.renderer.height-pad*2)/Math.max(1,b.h)),.03,12);cam.x=-(b.x+b.w/2)*cam.scale;cam.y=-(b.y+b.h/2)*cam.scale;this.renderer.render();this.showZoomHud();}
  fitContent(){if(this.spaceMode()==='layout'){this.fitArtboard({switchSpace:false});return;}const b=this.renderer.contentBounds();if(!b){this.resetView();return;}this.fitBounds(b,70);}
  fitArtboard({switchSpace=false}={}){if(switchSpace&&this.spaceMode()!=='layout'){this.switchWorkspace('layout',{fit:false,announce:false});}this.fitBounds(artboardBleedBounds(this.page(),true),56);}

  async saveProject(execution=null){execution?.assertDocumentCurrent?.();this.doc.modifiedAt=nowISO();const integrity=inspectDocument(this.doc);if(!integrity.passed){this.toast(`無法儲存：文件完整性錯誤 ${integrity.errors.length} 項`,3000);return false;}const json=JSON.stringify(this.doc,null,2);execution?.assertDocumentCurrent?.();this.download(new Blob([json],{type:'application/json'}),`${fileSafe(this.doc.title)}.ink`);this.dirty=false;this.toast('INK 專案檔已建立');return true;}
  async openProjectFile(file,execution=null){if(!file)return false;try{const text=await file.text();const doc=sanitizeDocument(JSON.parse(text));const integrity=inspectDocument(doc);if(!integrity.passed)throw new Error(`文件完整性錯誤 ${integrity.errors.length} 項`);execution?.assertDocumentCurrent?.();this.replaceDocument(doc);this.history.clear();this.dirty=false;const admission=this.autosaveAdmission(),snapshot=deepClone(this.doc);const persisted=await this.store.save('autosave',snapshot);if(this.autosaveAdmissionCurrent(admission)){this.commands?.notify?.(persisted===true?'autosave-saved':'autosave-error');if(persisted===true)this.toast('專案已開啟');else{this.health.recordError('Opened project autosave persistence unavailable',{source:'project-open-autosave',storage:this.store.diagnostics?.()||null});this.toast('專案已開啟，但自動儲存未寫入持久儲存',3000);}}return true;}catch(e){console.error(e);this.toast(`無法開啟：${e.message}`,3000);if(e?.code==='STALE_DOCUMENT')throw e;return false;}}
  imageFormatProbe(input){return probeImageFormat(input)}
  async decodeImageFormat(input,options={}){return decodeImageFormatCore(input,options)}
  async importImageFormat(input,{name='Imported image',matrix=null,...decodeOptions}={}){
    const payload=await decodeImageFormatCore(input,decodeOptions),layer=this.layer();
    if(layer.locked)throw new Error('INK_ACTIVE_LAYER_LOCKED');
    if(!this.documentOpen){this.documentOpen=true;this.refreshWorkspaceUI();}
    const rasterState=formatPayloadToDocumentImageState(payload),object={id:uid(),type:'image',name,matrix:Array.isArray(matrix)?[...matrix]:M.identity(),opacity:1,w:payload.width,h:payload.height,rasterState};
    this.history.pushScoped('匯入格式影像',[this.layerObjectsPath(layer),['colorState']],()=>{layer.objects.push(object);this.doc.colorState=documentColorStateFromPayload(payload);this.selection=[{layerId:layer.id,objectId:object.id}];});
    this.spatialDirty=true;this.refreshAll();return object;
  }
  async importWebRaster(input,{name=null,matrix=null,sourceChannel='WEB_RASTER_IMPORT'}={}){
    if(typeof this.extraction?.decode!=='function')throw new Error('INK_WEB_RASTER_DECODE_AUTHORITY_UNAVAILABLE');
    const decoded=input?.raster&&input?.source?input:await this.extraction.decode(input),layer=this.layer();
    if(layer.locked)throw new Error('INK_ACTIVE_LAYER_LOCKED');
    if(!this.documentOpen){this.documentOpen=true;this.refreshWorkspaceUI();}
    const source=decoded?.source||{},mime=String(source.mimeType||'');
    const format=mime==='image/png'?'PNG':mime==='image/jpeg'?'JPEG':mime==='image/webp'?'WEBP':'WEB_RASTER';
    const rasterState=webRasterImageDataToDocumentState(decoded.raster,{
      format,
      metadata:{sourceName:source.name||null,mimeType:mime||null,sizeBytes:source.sizeBytes??null},
      provenance:{sourceChannel:String(sourceChannel||'WEB_RASTER_IMPORT'),sourceSha256:source.sha256||null},
      capabilities:{sourceMimeType:mime||null}
    });
    const object={
      id:uid(),
      type:'image',
      name:name||source.name||'Imported image',
      matrix:Array.isArray(matrix)?[...matrix]:M.identity(),
      opacity:1,
      w:decoded.raster.width,
      h:decoded.raster.height,
      rasterState,
      metadata:{
        source:{type:'editable-web-raster',id:source.sha256||null,name:source.name||null},
        rasterImport:{
          sourceChannel:String(sourceChannel||'WEB_RASTER_IMPORT'),
          source:{name:source.name||null,mimeType:mime||null,sizeBytes:source.sizeBytes??null,sha256:source.sha256||null}
        }
      }
    };
    this.history.pushScoped('匯入可編輯影像',[this.layerObjectsPath(layer)],()=>{layer.objects.push(object);this.selection=[{layerId:layer.id,objectId:object.id}];});
    this.spatialDirty=true;this.refreshAll();return object;
  }
  exportImageFormat(format,refOrObject=null,options={}){
    const object=refOrObject?.type==='image'?refOrObject:refOrObject?this.findObject(refOrObject)?.object:this.selectedObjects().find(item=>item.object.type==='image')?.object;
    if(!object?.rasterState)throw new Error('INK_IMAGE_RASTER_STATE_REQUIRED');
    const payload=documentImageStateToFormatPayload(object.rasterState,{format});
    return encodeImageFormatCore(format,payload,options);
  }
  async importImage(file){if(!file)return;if(!file.type.startsWith('image/')){this.toast('請選擇圖片檔');return;}try{const src=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file);});const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});if(!this.documentOpen){this.documentOpen=true;this.refreshWorkspaceUI();}const max=900,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),w=img.naturalWidth*scale,h=img.naturalHeight*scale,center=this.renderer.screenToWorld(this.renderer.width/2,this.renderer.height/2,this.page().camera,{left:0,top:0});const layer=this.layer();if(layer.locked){this.toast('目前圖層已鎖定');return;}let object;this.history.pushScoped('匯入圖片',[this.layerObjectsPath(layer)],()=>{object={id:uid(),type:'image',name:file.name,matrix:M.translate(center.x-w/2,center.y-h/2),opacity:1,src,w,h};layer.objects.push(object);this.selection=[{layerId:layer.id,objectId:object.id}];});this.setTool('select');this.refreshAll();this.revealObjectInspector();}catch(e){console.error(e);this.toast('圖片載入失敗');}}

  openTextEditor(clientX,clientY,world,editing=null){const editor=$('#textEditor'),input=$('#textInput'),rect=this.el.wrap.getBoundingClientRect();editor.hidden=false;editor.style.left=`${clamp(clientX-rect.left,8,this.renderer.width-240)}px`;editor.style.top=`${clamp(clientY-rect.top,8,this.renderer.height-120)}px`;editor.dataset.worldX=world.x;editor.dataset.worldY=world.y;editor.dataset.editId=editing?.object.id||'';editor.dataset.editLayer=editing?.layer.id||'';input.value=editing?.object.text||'';setTimeout(()=>{input.focus();input.select();},0);}
  closeTextEditor(){$('#textEditor').hidden=true;$('#textInput').value='';}
  commitTextEditor(){const editor=$('#textEditor'),text=$('#textInput').value;if(editor.hidden)return;if(!text.trim()){this.closeTextEditor();return;}const editId=editor.dataset.editId,layerId=editor.dataset.editLayer;if(editId){const f=this.findObject({layerId,objectId:editId});if(f)this.history.pushScoped('編輯文字',[this.objectPath(f)],()=>{updateTextObject(f.object,{text,fontFamily:this.font.family,fontSize:this.font.size,writingMode:this.uiBTextMode||f.object.writingMode||'horizontal-tb'});});}else{const layer=this.layer();if(layer.locked){this.toast('目前圖層已鎖定');this.closeTextEditor();return;}const settings=this.toolSettings[this.lastDrawTool];let object;this.history.pushScoped('新增文字',[this.layerObjectsPath(layer)],()=>{object=createTextObject({text,x:+editor.dataset.worldX,y:+editor.dataset.worldY,opacity:1,color:settings.color,fontFamily:this.font.family,fontSize:this.font.size,lineHeight:1.25,writingMode:this.uiBTextMode||'horizontal-tb'});layer.objects.push(object);this.selection=[{layerId:layer.id,objectId:object.id}];});}this.closeTextEditor();this.refreshAll();}

  openExport(){return false;}
  refreshExportUI(){return false;}
  resolveExportRequest(input={}, {entry='native'}={}){const page=this.page(),format=String(input?.format||'png').toLowerCase(),requiresArtboard=format==='pdf'||format==='print';let scope=input?.scope||'artboard';if(requiresArtboard)scope='artboard';const scale=Number(input?.scale)||2,ppi=Number(input?.ppi)||(page.artboard?.ppi||300),includeBleed=Boolean(input?.includeBleed),cropMarks=Boolean(input?.cropMarks),background=input?.background!==false,isArtboard=scope==='artboard';const summaryGeometry=isArtboard?artboardExportGeometry(page,{ppi,includeBleed:format==='print'?false:includeBleed,cropMarks:format==='print'?false:cropMarks}):null;return{format,entry,options:{scope,scale,ppi,includeBleed,cropMarks,background},availability:{scopeLocked:requiresArtboard,artboardAvailable:true,showScale:!isArtboard,showPpi:isArtboard,showBleed:isArtboard&&format!=='print',showCropMarks:isArtboard&&format!=='print'},geometry:summaryGeometry?{scope:'artboard',width:summaryGeometry.width,height:summaryGeometry.height,widthMm:summaryGeometry.widthMm,heightMm:summaryGeometry.heightMm,ppi:summaryGeometry.ppi}:{scope}};}
  async runExport(input=null,lifecycle={}){if(!input||typeof input!=='object'||!input.format)return false;return this.runExportRequest(input,lifecycle);}
  async runExportRequest(input={},lifecycle={}){
    if(this.activeExportRequest)throw new Error('已有匯出正在進行');
    const entryPolicy=input?.entryPolicy||'native',resolved=this.resolveExportRequest(input,{entry:entryPolicy}),format=resolved.format,options=resolved.options;
    if(!['png','svg','pdf','print'].includes(format))throw new Error('不支援的匯出格式');
    const startNameBase=entryPolicy==='minimal'?fileSafe(this.doc.title)+'-'+fileSafe(this.page().name):null;
    const request={id:'export-'+(++this.exportRequestSequence),format,entryPolicy,cancelled:false,handles:{tiledJob:null,pngController:null}};
    this.activeExportRequest=request;
    const call=(name,payload)=>{try{lifecycle?.[name]?.({...payload,requestId:request.id,format});}catch(error){console.warn('INK_EXPORT_LIFECYCLE_CALLBACK_FAILED',name,error);}};
    const cancelled=()=>request.cancelled||this.activeExportRequest!==request;
    const assertCurrent=()=>{if(cancelled())throw new TiledExportCancelledError('Export cancelled',null);};
    const progress=payload=>{if(!cancelled())call('onProgress',payload);};
    call('onLifecycle',{phase:'STARTED'});
    try{
      let name=null,bytes=null;
      if(format==='png'){const blob=await this.exportPNG(options,{request,isCancelled:cancelled,onProgress:progress});assertCurrent();name=(startNameBase||fileSafe(this.doc.title)+'-'+fileSafe(this.page().name))+'.png';this.download(blob,name);bytes=blob.size||null;}
      else if(format==='svg'){assertCurrent();const blob=new Blob([this.exportSVG(options)],{type:'image/svg+xml'});assertCurrent();name=(startNameBase||fileSafe(this.doc.title)+'-'+fileSafe(this.page().name))+'.svg';this.download(blob,name);bytes=blob.size||null;}
      else if(format==='pdf'){const blob=await this.exportPDF(options,{request,isCancelled:cancelled,onProgress:progress});assertCurrent();name=(startNameBase||fileSafe(this.doc.title)+'-'+fileSafe(this.page().name))+'.pdf';this.download(blob,name);bytes=blob.size||null;}
      else{await this.printArtboard(options,{request,isCancelled:cancelled,onProgress:progress});assertCurrent();}
      const result={format,completed:true,requestId:request.id,name,bytes,downloaded:format!=='print'};call('onLifecycle',{phase:'COMPLETED',result});return result;
    }catch(error){
      if(error instanceof TiledExportCancelledError||error?.name==='TiledExportCancelledError'){call('onLifecycle',{phase:'CANCELLED'});throw error;}
      call('onLifecycle',{phase:'FAILED',error:{name:error?.name||'Error',message:error?.message||String(error)}});throw error;
    }finally{request.handles.tiledJob=null;request.handles.pngController=null;if(this.activeExportRequest===request)this.activeExportRequest=null;}
  }
  cancelExport(requestId){
    const request=this.activeExportRequest;if(!request||!requestId||request.id!==requestId)return{cancelled:false,requestId:requestId||null,reason:'request-mismatch'};
    request.cancelled=true;let nativeHandleCancelled=false;
    if(request.handles.tiledJob)nativeHandleCancelled=Boolean(request.handles.tiledJob.cancel?.())||nativeHandleCancelled;
    if(request.handles.pngController&&!request.handles.pngController.signal?.aborted){request.handles.pngController.abort();nativeHandleCancelled=true;}
    return{cancelled:true,requestId:request.id,nativeHandleCancelled};
  }
  drawCropMarksWorld(ctx,trim){const length=mmToWorld(4),offset=mmToWorld(.7);ctx.save();ctx.strokeStyle='#111';ctx.lineWidth=mmToWorld(.2);ctx.beginPath();const x1=trim.x,x2=trim.x+trim.w,y1=trim.y,y2=trim.y+trim.h;ctx.moveTo(x1-offset-length,y1);ctx.lineTo(x1-offset,y1);ctx.moveTo(x1,y1-offset-length);ctx.lineTo(x1,y1-offset);ctx.moveTo(x2+offset,y1);ctx.lineTo(x2+offset+length,y1);ctx.moveTo(x2,y1-offset-length);ctx.lineTo(x2,y1-offset);ctx.moveTo(x1-offset-length,y2);ctx.lineTo(x1-offset,y2);ctx.moveTo(x1,y2+offset);ctx.lineTo(x1,y2+offset+length);ctx.moveTo(x2+offset,y2);ctx.lineTo(x2+offset+length,y2);ctx.moveTo(x2,y2+offset);ctx.lineTo(x2,y2+offset+length);ctx.stroke();ctx.restore();}
  renderExportWorld(ctx,page,{bounds,clipBounds=null,background=true,cropMarks=false,trimBounds=null,renderScale=1,useLayoutViewport=false}={}){ctx.save();if(clipBounds){ctx.beginPath();ctx.rect(clipBounds.x,clipBounds.y,clipBounds.w,clipBounds.h);ctx.clip();}if(background)this.renderer.drawPaperWorld(ctx,page,clipBounds||bounds);ctx.save();if(useLayoutViewport)this.renderer.applyLayoutViewport(ctx,page);for(const layer of page.layers){if(!layer.visible)continue;ctx.save();ctx.globalAlpha=layer.opacity;this.renderer.drawLayerObjects(ctx,layer,page,{preferredScale:renderScale*(useLayoutViewport?normalizeLayoutViewport(page.workspace?.layoutViewport).scale:1),maxDimension:8192,maxPixels:6000000,transient:true});ctx.restore();}ctx.restore();ctx.restore();if(cropMarks&&trimBounds)this.drawCropMarksWorld(ctx,trimBounds);}
  async renderExportCanvas({scope='artboard',scale=2,ppi=300,includeBleed=false,cropMarks=false,background=true}={},lifecycle={}){
    if(lifecycle.isCancelled?.())throw new TiledExportCancelledError('Export cancelled',null);
    const page=this.page();let bounds,width,height,resolvedScale,clipBounds=null,trimBounds=null,physical=null;
    if(scope==='artboard'){
      const geometry=artboardExportGeometry(page,{ppi,includeBleed,cropMarks});bounds=geometry.outputBounds;width=geometry.width;height=geometry.height;resolvedScale=geometry.scale;clipBounds=geometry.bleedBounds;trimBounds=geometry.trimBounds;physical={widthMm:geometry.widthMm,heightMm:geometry.heightMm,ppi:geometry.ppi};
    }else if(scope==='viewport'){bounds=this.renderer.viewportWorldBounds();width=Math.round(this.renderer.width*scale);height=Math.round(this.renderer.height*scale);resolvedScale=width/bounds.w;}
    else{const content=this.renderer.contentBounds()||{x:-200,y:-150,w:400,h:300},pad=24;bounds={x:content.x-pad,y:content.y-pad,w:content.w+pad*2,h:content.h+pad*2};width=Math.max(1,Math.ceil(bounds.w*scale));height=Math.max(1,Math.ceil(bounds.h*scale));resolvedScale=scale;}
    if(width>16384||height>16384||width*height>36000000)throw new Error('輸出尺寸超過 36M pixels／16,384 單邊限制');
    const renderTile=async(ctx,tile)=>{ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,tile.width,tile.height);if(cropMarks&&background){ctx.fillStyle='#fff';ctx.fillRect(0,0,tile.width,tile.height);}ctx.restore();ctx.save();ctx.setTransform(resolvedScale,0,0,resolvedScale,-bounds.x*resolvedScale-tile.x,-bounds.y*resolvedScale-tile.y);this.renderExportWorld(ctx,page,{bounds,clipBounds,background,cropMarks,trimBounds,renderScale:resolvedScale,useLayoutViewport:scope==='artboard'});ctx.restore();};
    if(width*height>6000000){
      lifecycle.onProgress?.({phase:'TILED_PREPARE',completed:0,total:null,ratio:0});
      const job=new TiledExportJob({bounds,scale:resolvedScale,tileSize:2048,overlap:48,maxOutputPixels:36000000,maxOutputDimension:16384,renderTile,onProgress:progress=>lifecycle.onProgress?.({phase:'TILED_RENDER',completed:progress.completed,total:progress.total,ratio:progress.ratio})});
      this.activeExportJob=job;if(lifecycle.request)lifecycle.request.handles.tiledJob=job;let completed=false;
      try{const tiled=await job.run();completed=true;lifecycle.onProgress?.({phase:'TILED_DONE',completed:tiled.stats.tiles,total:tiled.stats.tiles,ratio:1});tiled.canvas.inkPhysical=physical;return tiled.canvas;}
      finally{if(this.activeExportJob===job)this.activeExportJob=null;if(lifecycle.request?.handles.tiledJob===job)lifecycle.request.handles.tiledJob=null;if(!completed&&job.outputCanvas){job.outputCanvas.width=1;job.outputCanvas.height=1;}}
    }
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=width;canvas.height=height;await renderTile(ctx,{x:0,y:0,width,height});if(lifecycle.isCancelled?.()){canvas.width=1;canvas.height=1;throw new TiledExportCancelledError('Export cancelled',null);}canvas.inkPhysical=physical;return canvas;
  }
  async exportPNG(options={},lifecycle={}){
    const canvas=await this.renderExportCanvas(options,lifecycle);if(lifecycle.isCancelled?.()){canvas.width=1;canvas.height=1;throw new TiledExportCancelledError('PNG export cancelled',null);}
    const controller=new AbortController();this.pngExportController=controller;if(lifecycle.request)lifecycle.request.handles.pngController=controller;
    try{
      if(lifecycle.isCancelled?.())controller.abort();
      const result=await this.pngWorkerEncoder.encode(canvas,{signal:controller.signal,onProgress:progress=>lifecycle.onProgress?.({phase:'PNG_'+String(progress.phase||'PROGRESS'),ratio:Number(progress.progress)||0,warning:progress.warning||null,method:progress.method||null})});
      if(lifecycle.isCancelled?.())throw new TiledExportCancelledError('PNG export cancelled',null);
      this.lastPNGExportReport={...result.report,width:canvas.width,height:canvas.height,alphaPreserved:true,colorSpace:'sRGB',completedAt:nowISO()};return result.blob;
    }finally{if(this.pngExportController===controller)this.pngExportController=null;if(lifecycle.request?.handles.pngController===controller)lifecycle.request.handles.pngController=null;canvas.width=1;canvas.height=1;}
  }
  async exportPDF(options={},lifecycle={}){const scope=options.scope||'artboard';if(scope!=='artboard')throw new Error('PDF 必須使用固定畫板範圍');const canvas=await this.renderExportCanvas({...options,scope:'artboard',background:true},lifecycle),physical=canvas.inkPhysical;try{if(!physical)throw new Error('PDF 缺少實體頁面尺寸');if(lifecycle.isCancelled?.())throw new TiledExportCancelledError('Export cancelled',null);const blob=await canvasToPdfBlob(canvas,{widthMm:physical.widthMm,heightMm:physical.heightMm,title:this.doc.title});if(lifecycle.isCancelled?.())throw new TiledExportCancelledError('Export cancelled',null);return blob;}finally{canvas.width=1;canvas.height=1;}}
  async printArtboard(options={},lifecycle={}){
    const printWindow=window.open('','INK_PRINT');if(!printWindow)throw new Error('瀏覽器阻擋列印視窗');
    let canvas=null,url=null,handedOff=false;
    try{
      canvas=await this.renderExportCanvas({...options,scope:'artboard',ppi:Math.min(300,+options.ppi||300),includeBleed:false,cropMarks:false,background:true},lifecycle);
      if(lifecycle.isCancelled?.())throw new TiledExportCancelledError('Export cancelled',null);
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('列印影像建立失敗')),'image/png'));
      if(lifecycle.isCancelled?.())throw new TiledExportCancelledError('Export cancelled',null);
      url=URL.createObjectURL(blob);const artboard=this.page().artboard;
      printWindow.document.write(`<!doctype html><html><head><title>${escapeXML(this.doc.title)}</title><style>@page{size:${artboard.widthMm}mm ${artboard.heightMm}mm;margin:0}html,body{margin:0;padding:0;background:#fff}img{display:block;width:${artboard.widthMm}mm;height:${artboard.heightMm}mm;object-fit:fill}</style></head><body><img src="${url}" onload="setTimeout(()=>window.print(),80)"></body></html>`);
      printWindow.document.close();handedOff=true;const releaseUrl=url;url=null;setTimeout(()=>URL.revokeObjectURL(releaseUrl),60000);
    }finally{
      if(canvas){canvas.width=1;canvas.height=1;}
      if(url){try{URL.revokeObjectURL(url);}catch{}}
      if(!handedOff){try{printWindow.close();}catch{}}
    }
  }
  exportSVG({scope='artboard',background=true,includeBleed=false,cropMarks=false}={}){
    const page=this.page();let b,width,height,clip=null,trim=null;if(scope==='artboard'){const geometry=artboardExportGeometry(page,{ppi:page.artboard.ppi,includeBleed,cropMarks});b=geometry.outputBounds;clip=geometry.bleedBounds;trim=geometry.trimBounds;width=`${geometry.widthMm}mm`;height=`${geometry.heightMm}mm`;}else{if(scope==='viewport')b=this.renderer.viewportWorldBounds();else{b=this.renderer.contentBounds()||{x:-200,y:-150,w:400,h:300};const pad=20;b={x:b.x-pad,y:b.y-pad,w:b.w+pad*2,h:b.h+pad*2};}width=Math.ceil(b.w);height=Math.ceil(b.h);}const body=[],defs=[];if(clip){defs.push(`<clipPath id="artboardClip"><rect x="${clip.x}" y="${clip.y}" width="${clip.w}" height="${clip.h}"/></clipPath>`);if(background)body.push(`<rect x="${clip.x}" y="${clip.y}" width="${clip.w}" height="${clip.h}" fill="${page.paper.color}"/>`);}else if(background)body.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${page.paper.color}"/>`);const layers=[];for(const layer of page.layers){if(!layer.visible)continue;const items=layer.objects.map(o=>this.objectToSVG(o,defs)).join('');layers.push(`<g opacity="${layer.opacity}">${items}</g>`);}const layerBody=scope==='artboard'?`<g transform="${M.svg(layoutViewportMatrix(page))}">${layers.join('')}</g>`:layers.join('');body.push(clip?`<g clip-path="url(#artboardClip)">${layerBody}</g>`:layerBody);if(cropMarks&&trim){const length=mmToWorld(4),offset=mmToWorld(.7),x1=trim.x,x2=trim.x+trim.w,y1=trim.y,y2=trim.y+trim.h;body.push(`<path d="M${x1-offset-length} ${y1}H${x1-offset} M${x1} ${y1-offset-length}V${y1-offset} M${x2+offset} ${y1}H${x2+offset+length} M${x2} ${y1-offset-length}V${y1-offset} M${x1-offset-length} ${y2}H${x1-offset} M${x1} ${y2+offset}V${y2+offset+length} M${x2+offset} ${y2}H${x2+offset+length} M${x2} ${y2+offset}V${y2+offset+length}" fill="none" stroke="#111" stroke-width="${mmToWorld(.2)}"/>`);}return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${width}" height="${height}">${defs.length?`<defs>${defs.join('')}</defs>`:''}${body.join('')}</svg>`;
  }
  objectToSVG(o,defs=[]){if(o.visible===false)return'';if(isComponentInstance(o)){const resolved=resolveComponentInstance(this.doc,o);return resolved.geometry?this.objectToSVG(resolved.geometry,defs):'';}const tr=` transform="${M.svg(o.matrix||M.identity())}" opacity="${o.opacity??1}"`;if(o.type==='repeat')return vectorObjectToSVG(o,defs);if(o.type==='frame')return `<g${tr} data-ink-type="frame" data-frame-width="${o.width||1}" data-frame-height="${o.height||1}">${(o.children||[]).map(x=>this.objectToSVG(x,defs)).join('')}</g>`;if(o.type==='group')return `<g${tr}>${(o.children||[]).map(x=>this.objectToSVG(x,defs)).join('')}</g>`;if(o.type==='path')return vectorObjectToSVG(o,defs);if(o.type==='stroke'){if((o.segmentStyles||[]).some(style=>style&&Object.keys(style).length)){return (o.points||[]).slice(0,-1).map((_,index)=>{const style=segmentStyleAt(o,index),points=sampleStrokeSegment(o,index,Math.max(.8,(style.size||o.size||2)*.25));return this.objectToSVG({...o,...style,points,segmentStyles:undefined,taper:0});}).join('');}if(o.kind==='pencil'||o.kind==='drybrush'){const d=sampleStrokePath(o,Math.max(1,(o.size||2)*.3)).map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');return `<path${tr} d="${d}" fill="none" stroke="${o.color}" stroke-width="${o.size}" stroke-linecap="round" stroke-linejoin="round" opacity="${(o.opacity??1)*.7}"/>`;}const pts=strokeOutline(o).map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');return `<polygon${tr} points="${pts}" fill="${o.color}"/>`;}
    if(o.type==='shape'){const common=`${tr} fill="${o.fill?o.fillColor||o.color:'none'}" stroke="${o.color}" stroke-width="${o.size}" stroke-linecap="round" stroke-linejoin="round"`;if(o.shape==='line')return `<line${common} x1="0" y1="0" x2="${o.x2}" y2="${o.y2}"/>`;if(o.shape==='arrow'){const a=Math.atan2(o.y2,o.x2),len=Math.min(24,Math.max(8,(o.size||2)*5)),p1={x:o.x2-Math.cos(a-rad(28))*len,y:o.y2-Math.sin(a-rad(28))*len},p2={x:o.x2-Math.cos(a+rad(28))*len,y:o.y2-Math.sin(a+rad(28))*len};return `<path${common} d="M0 0 L${o.x2} ${o.y2} M${o.x2} ${o.y2} L${p1.x} ${p1.y} M${o.x2} ${o.y2} L${p2.x} ${p2.y}"/>`;}if(o.shape==='rect')return `<rect${common} x="${Math.min(0,o.w)}" y="${Math.min(0,o.h)}" width="${Math.abs(o.w)}" height="${Math.abs(o.h)}"/>`;if(o.shape==='ellipse')return `<ellipse${common} cx="${o.w/2}" cy="${o.h/2}" rx="${Math.abs(o.w/2)}" ry="${Math.abs(o.h/2)}"/>`;if(o.shape==='triangle')return `<polygon${common} points="${o.w/2},0 ${o.w},${o.h} 0,${o.h}"/>`;}
    if(o.type==='image')return `<image${tr} width="${o.w}" height="${o.h}" href="${o.src}"/>`;if(o.type==='text'){const lines=String(o.text||'').split('\n'),spans=lines.map((s,i)=>`<tspan x="0" dy="${i?o.fontSize*(o.lineHeight||1.25):0}">${escapeXML(s)}</tspan>`).join('');return `<text${tr} fill="${o.color}" font-family="${escapeXML(o.fontFamily||'system-ui')}" font-size="${o.fontSize}">${spans}</text>`;}return'';
  }

  bindInput(){
    const c=this.el.canvas;c.addEventListener('pointerdown',e=>this.onPointerDown(e));c.addEventListener('pointermove',e=>this.onPointerMove(e));c.addEventListener('pointerleave',()=>{if(!this.interaction){this.hover=null;this.renderer.render();}});c.addEventListener('pointerup',e=>this.onPointerUp(e));c.addEventListener('pointercancel',e=>this.onPointerUp(e,true));c.addEventListener('contextmenu',e=>e.preventDefault());c.addEventListener('dblclick',e=>this.onDoubleClick(e));
    c.addEventListener('wheel',e=>this.onWheel(e),{passive:false});window.addEventListener('keydown',e=>this.onKeyDown(e));window.addEventListener('keyup',e=>{if(e.code==='Space'){this.spaceDown=false;this.updateCursor();}});
  }
  eventData(e,predicted=false){const rect=this.el.wrap.getBoundingClientRect(),sx=e.clientX-rect.left,sy=e.clientY-rect.top,world=this.renderer.screenToWorld(e.clientX,e.clientY),calibrated=this.penInput.normalizeEvent(e,{predicted});if(e.pointerType==='pen')this.externalValidation.recordPenSample(calibrated);return{clientX:e.clientX,clientY:e.clientY,sx,sy,world,p:clamp(calibrated.pressure,.02,1),rawPressure:calibrated.rawPressure,tiltX:calibrated.tiltX,tiltY:calibrated.tiltY,altitude:calibrated.altitude,azimuth:calibrated.azimuth,twist:calibrated.twist,predicted:calibrated.predicted,latencyMs:calibrated.latencyMs,time:e.timeStamp||performance.now(),pointerType:e.pointerType,buttons:e.buttons};}
  onPointerDown(e){
    if(!this.documentOpen)return;
    if(this.penInput.shouldReject(e)){e.preventDefault?.();return;}this.el.canvas.focus({preventScroll:true});this.toggleBrushFamilyPopover(false);this.el.canvas.setPointerCapture?.(e.pointerId);const d=this.eventData(e);const decision=this.input.register(e,d,{fingerDraw:this.fingerDraw,spaceDown:this.spaceDown,tool:this.tool,drawTools:DRAW_TOOLS});
    if(decision.role==='gesture'){this.beginGesture();return;}
    if(decision.role==='navigate'){this.interaction={type:'pan',pointerId:e.pointerId,last:{x:d.sx,y:d.sy},touch:e.pointerType==='touch'};this.el.canvas.style.cursor='grabbing';return;}
    if(DRAW_TOOLS.has(this.tool)){this.beginStroke(d,e.pointerId);return;}
    if(this.tool==='shape'){this.beginShape(d,e.pointerId,e);return;}
    if(this.tool==='eraser'){this.beginEraser(d,e.pointerId);return;}
    if(this.tool==='select'){this.beginSelection(d,e.pointerId,e);return;}
    if(this.tool==='lasso'){this.draft={lasso:[d.world]};this.interaction={type:'lasso',pointerId:e.pointerId};return;}
    if(this.tool==='text'){const hit=this.hitTest(d.world);if(hit?.object.type==='text')this.openTextEditor(e.clientX,e.clientY,d.world,hit);else this.openTextEditor(e.clientX,e.clientY,d.world);return;}
  }
  onPointerMove(e){
    if(this.penInput.shouldReject(e)){e.preventDefault?.();return;}const d=this.eventData(e);this.hover=d;if(!this.pointerMap.has(e.pointerId)){this.renderer.render();return;}this.input.update(e,d);
    if(this.interaction?.type==='gesture'){this.updateGesture();return;}
    const it=this.interaction;if(!it||it.pointerId!==e.pointerId)return;
    if(it.type==='pan'){const cam=this.page().camera;cam.x+=d.sx-it.last.x;cam.y+=d.sy-it.last.y;it.last={x:d.sx,y:d.sy};this.renderer.render();return;}
    if(it.type==='stroke'){it.object.points=it.object.points.filter(point=>!point.predicted);const events=this.penInput.eventBatch(e);for(const item of events){const q=this.eventData(item.event,item.predicted),origin=it.origin;it.object.points.push({x:q.world.x-origin.x,y:q.world.y-origin.y,p:q.p,tiltX:q.tiltX,tiltY:q.tiltY,altitude:q.altitude,azimuth:q.azimuth,twist:q.twist,predicted:q.predicted,t:q.time-it.startTime});}if(it.object.points.length>1800)it.object.points=it.object.points.filter((_,i)=>i%2===0||i===it.object.points.length-1);this.renderer.render();return;}
    if(it.type==='shape'){this.updateShape(d,e);return;}
    if(it.type==='stroke-node-move'){const found=this.strokeEdit?this.findObject(this.strokeEdit.ref):null,inverse=found?.object?.type==='stroke'?M.tryInvert(found.worldMatrix||found.object.matrix):null;if(!found||found.interactionExposed===false||!inverse){this.rejectSingularInteraction(it,'物件轉換不可逆，節點移動已取消');return;}const local=M.point(inverse,d.world),dx=local.x-it.startLocal.x,dy=local.y-it.startLocal.y;found.object.points=it.initialPoints.map((point,index)=>it.indices.has(index)?{...point,x:point.x+dx,y:point.y+dy}:{...point});this.queueSpatialObject(this.strokeEdit.ref);this.refreshSelectionUI();this.renderer.render();return;}
    if(it.type==='stroke-handle-move'){const found=this.strokeEdit?this.findObject(this.strokeEdit.ref):null,inverse=found?.object?.type==='stroke'?M.tryInvert(found.worldMatrix||found.object.matrix):null;if(!found||found.interactionExposed===false||!inverse){this.rejectSingularInteraction(it,'物件轉換不可逆，切線調整已取消');return;}const local=M.point(inverse,d.world);found.object.points=deepClone(it.initialPoints);moveStrokeHandle(found.object,it.index,it.kind,local);this.strokeEdit.handle={index:it.index,kind:it.kind};this.queueSpatialObject(this.strokeEdit.ref);this.renderer.render();return;}
    if(it.type==='path-anchor-move'){const found=this.editablePath(),inverse=found?M.tryInvert(found.worldMatrix||found.object.matrix):null;if(!found||!inverse){this.rejectSingularInteraction(it,'物件轉換不可逆，Path 節點移動已取消');return;}const local=M.point(inverse,d.world),dx=local.x-it.startLocal.x,dy=local.y-it.startLocal.y;found.object.subpaths=deepClone(it.initialSubpaths);for(const ref of it.refs){const anchor=found.object.subpaths[ref.subpathIndex]?.anchors?.[ref.anchorIndex];if(anchor)movePathAnchor(found.object,ref.subpathIndex,ref.anchorIndex,anchor.x+dx,anchor.y+dy);}assertFinitePathGeometry(found.object);this.queueSpatialObject(this.pathEditing.state.ref);this.refreshSelectionUI();this.renderer.render();return;}
    if(it.type==='path-handle-move'){const found=this.editablePath(),inverse=found?M.tryInvert(found.worldMatrix||found.object.matrix):null;if(!found||!inverse){this.rejectSingularInteraction(it,'物件轉換不可逆，Path 切線調整已取消');return;}const local=M.point(inverse,d.world);found.object.subpaths=deepClone(it.initialSubpaths);const anchor=found.object.subpaths[it.subpathIndex]?.anchors?.[it.anchorIndex];if(anchor)movePathBezierHandle(found.object,it.subpathIndex,it.anchorIndex,it.side,local.x-anchor.x,local.y-anchor.y);assertFinitePathGeometry(found.object);this.pathEditing.state.handle={subpathIndex:it.subpathIndex,anchorIndex:it.anchorIndex,side:it.side};this.queueSpatialObject(this.pathEditing.state.ref);this.renderer.render();return;}
    if(it.type==='eraser'){it.changed=this.eraseAt(d.world,it.radius)||it.changed;this.renderer.render();return;}
    if(it.type==='lasso'){if(distance(this.draft.lasso.at(-1),d.world)>2/this.page().camera.scale)this.draft.lasso.push(d.world);this.renderer.render();return;}
    if(it.type==='marquee'){this.draft.marquee.current={x:d.sx,y:d.sy};this.selectionMode=d.sx>=it.startScreen.x?'contain':'intersect';this.refreshSelectionUI();this.renderer.render();return;}
    if(it.type==='move'||it.type==='scale'||it.type==='rotate')this.updateSelectionTransform(d,e);
  }
  onPointerUp(e,cancelled=false){
    this.input.release(e.pointerId);this.penInput.release(e.pointerId);const it=this.interaction;
    if(it?.type==='gesture'){if(this.pointerMap.size<2){this.interaction=null;this.updateCursor();}return;}
    if(!it||it.pointerId!==e.pointerId)return;
    if(it.type==='stroke'){it.object.points=it.object.points.filter(point=>!point.predicted);if(cancelled||it.object.points.length<1){this.history.cancel();this.draft=null;}else{it.object.points=stabilizePoints(it.object.points,it.object.smoothing);if(it.object.points.length===1)it.object.points.push({...it.object.points[0],x:it.object.points[0].x+.01});this.layer().objects.push(it.object);this.draft=null;this.history.commit();this.queueSpatialObject(it.object.id);}}
    else if(it.type==='shape'){if(cancelled||this.shapeTooSmall(it.object)){this.history.cancel();this.draft=null;}else{this.layer().objects.push(it.object);this.draft=null;this.history.commit();this.queueSpatialObject(it.object.id);this.selection=[{layerId:this.layer().id,objectId:it.object.id}];this.revealObjectInspector();}}
    else if(it.type==='eraser'){it.changed?this.history.commit():this.history.cancel();}
    else if(it.type==='lasso'){if(!cancelled)this.finishLasso();this.draft=null;}
    else if(it.type==='marquee'){if(!cancelled)this.finishMarquee(it);this.draft=null;}
    else if(it.type==='stroke-node-move'||it.type==='stroke-handle-move'){const found=this.editableStroke();if(cancelled&&found){found.object.points=it.initialPoints;this.history.cancel();}else this.history.commit();if(this.strokeEdit)this.queueSpatialObject(this.strokeEdit.ref);}
    else if(it.type==='path-anchor-move'||it.type==='path-handle-move'){const found=this.editablePath();if(cancelled&&found){found.object.subpaths=deepClone(it.initialSubpaths);this.history.cancel();}else if(found){assertFinitePathGeometry(found.object);this.history.commit();}else this.history.cancel();if(this.pathEditing?.active)this.queueSpatialObject(this.pathEditing.state.ref);}
    else if(['move','scale','rotate'].includes(it.type)){cancelled?this.restoreMatrices(it.initial):this.history.commit();if(!cancelled)this.queueSpatialSelection();this.draft=null;}
    this.uiPresentation?.snapFeedback?.clear?.();this.interaction=null;this.updateCursor();this.refreshLayers();this.refreshSelectionUI();this.renderer.render();
  }
  beginGesture(){
    if(this.interaction?.type==='stroke'||this.interaction?.type==='shape'){this.history.cancel();this.draft=null;}
    const pts=this.input.firstTwo(),a=pts[0],b=pts[1],mid={x:(a.sx+b.sx)/2,y:(a.sy+b.sy)/2},cam=this.page().camera;this.interaction={type:'gesture',dist:Math.max(1,Math.hypot(a.sx-b.sx,a.sy-b.sy)),angle:Math.atan2(b.sy-a.sy,b.sx-a.sx),scale:cam.scale,rotation:cam.rotation,worldMid:this.renderer.screenToWorld(mid.x,mid.y,cam,{left:0,top:0})};
  }
  updateGesture(){const pts=this.input.firstTwo();if(pts.length<2)return;const a=pts[0],b=pts[1],it=this.interaction,mid={x:(a.sx+b.sx)/2,y:(a.sy+b.sy)/2},cam=this.page().camera;cam.scale=clampViewScale(it.scale*Math.hypot(a.sx-b.sx,a.sy-b.sy)/it.dist);cam.rotation=it.rotation+(Math.atan2(b.sy-a.sy,b.sx-a.sx)-it.angle);const mapped=this.renderer.worldToScreen(it.worldMid,cam);cam.x+=mid.x-mapped.x;cam.y+=mid.y-mapped.y;this.renderer.render();this.showZoomHud();}

  beginStroke(d,pointerId){const layer=this.layer();if(layer.locked){this.toast('目前圖層已鎖定');return;}const s=deepClone(this.toolSettings[this.tool]);s.color=s.color||'#202020';const o={id:uid(),type:'stroke',name:TOOL_NAMES[this.tool],matrix:M.translate(d.world.x,d.world.y),opacity:s.opacity,color:s.color,size:s.size,kind:s.kind,smoothing:s.smoothing,pressure:s.pressure,taper:s.taper||0,grain:s.grain||0,softness:s.softness||.7,flow:s.flow??1,wetness:s.wetness??0,bristle:s.bristle??0,mediaModel:(s.kind==='brush'||s.kind==='drybrush'||s.kind==='airbrush')?'natural-v2':undefined,points:[{x:0,y:0,p:d.p,tiltX:d.tiltX,tiltY:d.tiltY,altitude:d.altitude,azimuth:d.azimuth,twist:d.twist,t:0}]};this.history.begin(`繪製${TOOL_NAMES[this.tool]}`,{targets:[this.layerObjectsPath(layer)]});this.draft={object:o};this.interaction={type:'stroke',pointerId,object:o,origin:d.world,startTime:d.time};this.setColor(s.color);}
  beginShape(d,pointerId,e){if(this.layer().locked){this.toast('目前圖層已鎖定');return;}const s=this.toolSettings[this.lastDrawTool],o={id:uid(),type:'shape',name:'幾何',matrix:M.translate(d.world.x,d.world.y),opacity:s.opacity,shape:this.shapeType,color:s.color||'#202020',fillColor:s.color||'#202020',size:Math.max(1,s.size*.55),fill:this.shapeFill,x2:0,y2:0,w:0,h:0};this.history.begin('繪製幾何',{targets:[this.layerObjectsPath(this.layer())]});this.draft={object:o};this.interaction={type:'shape',pointerId,object:o,start:d.world};this.updateShape(d,e);}
  updateShape(d,e){const it=this.interaction,o=it.object;let dx=d.world.x-it.start.x,dy=d.world.y-it.start.y;if((o.shape==='line'||o.shape==='arrow')&&(this.snapAngles||e.shiftKey)){const len=Math.hypot(dx,dy),a=Math.round(Math.atan2(dy,dx)/rad(15))*rad(15);dx=Math.cos(a)*len;dy=Math.sin(a)*len;}if(['rect','ellipse','triangle'].includes(o.shape)&&e.shiftKey){const s=Math.max(Math.abs(dx),Math.abs(dy));dx=Math.sign(dx||1)*s;dy=Math.sign(dy||1)*s;}o.x2=dx;o.y2=dy;o.w=dx;o.h=dy;this.renderer.render();}
  shapeTooSmall(o){return o.shape==='line'||o.shape==='arrow'?Math.hypot(o.x2,o.y2)<1:Math.abs(o.w)<1||Math.abs(o.h)<1;}

  eraserRadiusWorld(){return Math.max(3,this.toolSettings[this.lastDrawTool].size*.9)/2;}
  beginEraser(d,pointerId){if(this.layer().locked&&this.eraserMode==='object'){this.toast('目前圖層已鎖定');return;}const radius=this.eraserRadiusWorld();this.history.begin(this.eraserMode==='object'?'擦除物件':'局部擦除',{targets:[[...this.pagePath(),'layers']]});const it={type:'eraser',pointerId,radius,changed:false};this.interaction=it;if(this.eraserMode==='object'){const hit=this.hitTest(d.world);if(hit){hit.parentArray.splice(hit.objectIndex,1);this.selection=this.selection.filter(r=>r.objectId!==hit.object.id);it.changed=true;this.spatialDirty=true;}}else{it.changed=this.eraseAt(d.world,radius)||it.changed;}this.renderer.render();}
  eraseAt(world,radius){let changed=false;const index=this.ensureSpatialIndex(),area={x:world.x-radius,y:world.y-radius,w:radius*2,h:radius*2},candidates=index.query(area).filter(item=>item.object.type==='stroke'&&item.interactionExposed!==false&&item.effectiveVisible&&!item.effectiveLocked).sort((a,b)=>comparePageObjectHitOrder(a,b,{deep:true}));for(const item of candidates){const found=this.findObject({layerId:item.layer.id,objectId:item.object.id});if(!found)continue;const object=found.object,worldMatrix=found.worldMatrix||object.matrix,inv=M.tryInvert(worldMatrix);if(!inv)continue;const localCenter=M.point(inv,world),scale=Math.hypot(worldMatrix[0],worldMatrix[1])||1,localRadius=radius/scale,result=eraseStrokeWithCircle(object,localCenter,localRadius,uid);if(!result.changed)continue;for(const fragment of result.fragments){if(found.parentObject)fragment.parentId=found.parentObject.id;else delete fragment.parentId;}found.parentArray.splice(found.objectIndex,1,...result.fragments);this.selection=this.selection.filter(ref=>ref.objectId!==object.id);changed=true;}if(changed)this.spatialDirty=true;return changed;}

  beginSelection(d,pointerId,e){
    if(this.pathEditing?.active){
      const rawFound=this.findObject(this.pathEditing.state.ref),pathWorld=rawFound?.worldMatrix||rawFound?.object?.matrix,pathInverse=rawFound?.object?.type==='path'&&rawFound.interactionExposed!==false?M.tryInvert(pathWorld):null;
      if(rawFound?.object?.type==='path'&&!pathInverse){this.interaction=null;this.draft=null;this.toast('物件轉換不可逆，無法編輯 Path');return;}
      const editHit=this.pathEditHit(d.sx,d.sy),found=this.editablePath();
      if(editHit?.type==='handle'&&found){this.pathEditing.selectHandle(editHit.subpathIndex,editHit.anchorIndex,editHit.side);this.history.begin('調整 Path 切線',{targets:[this.objectPath(found)]});this.interaction={type:'path-handle-move',pointerId,subpathIndex:editHit.subpathIndex,anchorIndex:editHit.anchorIndex,side:editHit.side,initialSubpaths:deepClone(found.object.subpaths)};this.refreshSelectionUI();this.renderer.render();return;}
      if(editHit?.type==='anchor'&&found){
        const key=editHit.subpathIndex+':'+editHit.anchorIndex;
        if(e.shiftKey)this.pathEditing.selectAnchor(editHit.subpathIndex,editHit.anchorIndex,{toggle:true});
        else if(!this.pathEditing.state.anchorKeys.has(key))this.pathEditing.selectAnchor(editHit.subpathIndex,editHit.anchorIndex);
        const refs=this.pathEditing.selectedAnchors();if(!refs.length){this.refreshSelectionUI();this.renderer.render();return;}
        const startLocal=M.point(pathInverse,d.world);this.history.begin('移動 Path 節點',{targets:[this.objectPath(found)]});this.interaction={type:'path-anchor-move',pointerId,startLocal,refs,initialSubpaths:deepClone(found.object.subpaths)};this.refreshSelectionUI();this.renderer.render();return;
      }
      if(editHit?.type==='segment'){this.pathEditing.selectSegment(editHit.subpathIndex,editHit.segmentIndex,editHit.t);this.refreshSelectionUI();this.renderer.render();return;}
      this.exitPathEdit();
    }
    if(this.strokeEdit){
      const rawFound=this.findObject(this.strokeEdit.ref);
      const strokeWorld=rawFound?.worldMatrix||rawFound?.object?.matrix;
      const strokeInverse=rawFound?.object?.type==='stroke'&&rawFound.interactionExposed!==false?M.tryInvert(strokeWorld):null;
      if(rawFound?.object?.type==='stroke'&&!strokeInverse){
        this.interaction=null;this.draft=null;
        this.toast('物件轉換不可逆，無法編輯節點');
        return;
      }
      const editHit=this.strokeEditHit(d.sx,d.sy),found=this.editableStroke();
      if(editHit?.type==='handle'&&found){
        this.history.begin('調整筆畫切線',{targets:[this.objectPath(found)]});
        this.strokeEdit.handle={index:editHit.index,kind:editHit.kind};
        this.interaction={type:'stroke-handle-move',pointerId,index:editHit.index,kind:editHit.kind,initialPoints:deepClone(found.object.points)};
        this.refreshSelectionUI();this.renderer.render();return;
      }
      if(editHit?.type==='node'&&found){
        if(e.shiftKey){if(this.strokeEdit.nodeIndices.has(editHit.index))this.strokeEdit.nodeIndices.delete(editHit.index);else this.strokeEdit.nodeIndices.add(editHit.index);}
        else if(!this.strokeEdit.nodeIndices.has(editHit.index))this.strokeEdit.nodeIndices=new Set([editHit.index]);
        this.strokeEdit.segmentIndex=null;this.strokeEdit.handle=null;
        const startLocal=M.point(strokeInverse,d.world);
        this.history.begin('移動筆畫節點',{targets:[this.objectPath(found)]});
        this.interaction={type:'stroke-node-move',pointerId,startLocal,indices:new Set(this.strokeEdit.nodeIndices),initialPoints:deepClone(found.object.points)};
        this.refreshSelectionUI();this.renderer.render();return;
      }
      if(editHit?.type==='segment'){this.strokeEdit.segmentIndex=editHit.index;this.strokeEdit.segmentT=editHit.t;this.strokeEdit.nodeIndices=new Set();this.strokeEdit.handle=null;this.refreshSelectionUI();this.renderer.render();return;}
      this.exitStrokeEdit();
    }
    const handle=this.renderer.handleAt(d.sx,d.sy);if(handle&&this.selection.length){this.startSelectionTransform(handle,d,pointerId);return;}
    const hit=this.hitTest(d.world,{deep:e.altKey});if(!hit){const base=e.shiftKey?[...this.selection]:[];this.draft={marquee:{start:{x:d.sx,y:d.sy},current:{x:d.sx,y:d.sy}}};this.interaction={type:'marquee',pointerId,startScreen:{x:d.sx,y:d.sy},baseSelection:base};if(!e.shiftKey)this.selection=[];this.refreshSelectionUI();this.renderer.render();return;}
    if(e.shiftKey){if(this.isSelected(hit.layer.id,hit.object.id))this.selection=this.selection.filter(r=>r.objectId!==hit.object.id);else this.selection.push({layerId:hit.layer.id,objectId:hit.object.id});}
    else if(!this.isSelected(hit.layer.id,hit.object.id))this.selection=[{layerId:hit.layer.id,objectId:hit.object.id}];
    this.refreshSelectionUI();if(this.selection.length)this.revealObjectInspector();this.renderer.render();if(this.selection.length)this.startSelectionTransform('move',d,pointerId);
  }
  finishMarquee(it){const m=this.draft?.marquee;if(!m)return;const box={x:Math.min(m.start.x,m.current.x),y:Math.min(m.start.y,m.current.y),w:Math.abs(m.current.x-m.start.x),h:Math.abs(m.current.y-m.start.y)};if(box.w<3&&box.h<3){this.selection=it.baseSelection||[];return;}const corners=[{x:box.x,y:box.y},{x:box.x+box.w,y:box.y},{x:box.x+box.w,y:box.y+box.h},{x:box.x,y:box.y+box.h}].map(point=>this.renderer.screenToWorld(point.x,point.y,this.page().camera,{left:0,top:0})),worldBox=polygonBounds(corners),contain=m.current.x>=m.start.x,candidates=marqueeCandidates(this.ensureSpatialIndex(),worldBox,box,contain?'contain':'intersect',(object,item)=>this.renderer.objectScreenBounds(object,item.parentWorldMatrix)).filter(item=>item.interactionExposed!==false&&!item.effectiveLocked),found=this.selectionRefsFromItems(candidates),merged=[...(it.baseSelection||[])];for(const ref of found)if(!merged.some(x=>x.layerId===ref.layerId&&x.objectId===ref.objectId))merged.push(ref);this.selection=merged;this.selectionMode=contain?'contain':'intersect';if(this.selection.length)this.revealObjectInspector();}
  startSelectionTransform(handle,d,pointerId){
    const selected=this.compositionTransformObjects();if(!selected.length)return false;
    const initial=cloneInitialMatrices(selected);
    try{preflightObjectMatrices(initial,ref=>this.findObject(ref));}
    catch(error){
      if(error?.code!=='NON_INVERTIBLE_PARENT'&&error?.code!=='NON_FINITE_MATRIX')throw error;
      this.interaction=null;this.draft=null;
      this.toast('選取物件的父層轉換不可逆，無法開始變形');
      return false;
    }
    const box=this.renderer.selectionWorldBounds();if(!box)return false;
    const center={x:box.x+box.w/2,y:box.y+box.h/2};
    if(!this.history.begin(handle==='move'?'移動物件':handle==='rotate'?'旋轉物件':'縮放物件',{targets:this.selectionHistoryTargets()})){this.interaction=null;this.draft=null;return false;}
    this.interaction={type:handle==='move'?'move':handle==='rotate'?'rotate':'scale',handle,pointerId,start:d.world,initial,box,center,startAngle:Math.atan2(d.world.y-center.y,d.world.x-center.x)};
    this.el.canvas.style.cursor=handle==='move'?'grabbing':handle==='rotate'?'grabbing':'nwse-resize';
    return true;
  }
  restoreMatrices(initial){for(const x of initial){const f=this.findObject(x.ref);if(f)f.object.matrix=[...x.matrix];}this.history.cancel();}
  rejectSingularInteraction(it,message){
    if(Array.isArray(it?.initial))for(const x of it.initial){const f=this.findObject(x.ref);if(f)f.object.matrix=[...x.matrix];}
    if(Array.isArray(it?.initialPoints)&&this.strokeEdit){const found=this.findObject(this.strokeEdit.ref);if(found?.object?.type==='stroke')found.object.points=deepClone(it.initialPoints);}
    if(Array.isArray(it?.initialSubpaths)&&this.pathEditing?.active){const found=this.findObject(this.pathEditing.state.ref);if(found?.object?.type==='path')found.object.subpaths=deepClone(it.initialSubpaths);}
    this.history.cancel();
    this.interaction=null;this.draft=null;
    if(this.strokeEdit)this.strokeEdit.handle=null;
    this.updateCursor();this.refreshLayers();this.refreshSelectionUI();this.renderer.render();
    this.toast(message);
    return false;
  }
  snapMove(dx,dy,it,{bypass=false}={}){
    const selectedIds=new Set(it.initial.map(entry=>entry.ref.objectId)),peers=[];
    for(const item of this.ensureSpatialIndex().items){if(selectedIds.has(item.object.id)||item.ancestorIds.some(id=>selectedIds.has(id)))continue;peers.push(item.bounds);}
    const result=resolveSnappedTranslation({movingBounds:it.box,delta:{x:dx,y:dy},peerBounds:peers,guides:this.page().guides||[],gridSize:this.page().paper.gridSize||32,snapSettings:this.page().snap||{},cameraScale:this.page().camera.scale,previousEvidence:it.snapEvidence||null,bypass});
    it.snapEvidence=result.evidence;
    const guides=Object.values(result.evidence||{}).filter(Boolean).flatMap(evidence=>evidence.line?[evidence.line]:[]);
    return{dx:result.delta.x,dy:result.delta.y,guides,evidence:result.evidence};
  }
  updateSelectionTransform(d,e){const it=this.interaction;try{if(it.type==='move'){let dx=d.world.x-it.start.x,dy=d.world.y-it.start.y;const snapped=this.snapMove(dx,dy,it,{bypass:e.altKey});dx=snapped.dx;dy=snapped.dy;this.draft={guides:snapped.guides};this.uiPresentation?.snapFeedback?.show?.(snapped.evidence,{clientX:d.clientX,clientY:d.clientY});applyObjectMatrices(it.initial,ref=>this.findObject(ref),matrix=>M.multiply(M.translate(dx,dy),matrix));}
    else if(it.type==='rotate'){let delta=Math.atan2(d.world.y-it.center.y,d.world.x-it.center.x)-it.startAngle;delta=resolveSnappedRotation(delta,{snapSettings:this.page().snap||{},bypass:e.altKey,force:e.shiftKey}).angle;const t=M.around(it.center.x,it.center.y,M.rotate(delta));applyObjectMatrices(it.initial,ref=>this.findObject(ref),matrix=>M.multiply(t,matrix));}
    else{const b=it.box,h=it.handle;let anchor={x:b.x+b.w/2,y:b.y+b.h/2};if(h.includes('w'))anchor.x=b.x+b.w;else if(h.includes('e'))anchor.x=b.x;else anchor.x=b.x+b.w/2;if(h.includes('n'))anchor.y=b.y+b.h;else if(h.includes('s'))anchor.y=b.y;else anchor.y=b.y+b.h/2;const startDx=it.start.x-anchor.x,startDy=it.start.y-anchor.y;let sx=h==='n'||h==='s'?1:(d.world.x-anchor.x)/(Math.abs(startDx)<1e-4?1:startDx),sy=h==='e'||h==='w'?1:(d.world.y-anchor.y)/(Math.abs(startDy)<1e-4?1:startDy);sx=clamp(sx,-100,100);sy=clamp(sy,-100,100);if(e.shiftKey||this.aspectLock){const uni=Math.abs(sx)>Math.abs(sy)?sx:sy;sx=h==='n'||h==='s'?1:uni;sy=h==='e'||h==='w'?1:uni;}sx=nonSingularScaleComponent(sx);sy=nonSingularScaleComponent(sy);const t=M.around(anchor.x,anchor.y,M.scale(sx,sy));applyObjectMatrices(it.initial,ref=>this.findObject(ref),matrix=>M.multiply(t,matrix));}
    this.refreshSelectionUI();this.renderer.render();}catch(error){if(error?.code==='NON_INVERTIBLE_PARENT'||error?.code==='NON_FINITE_MATRIX'){this.rejectSingularInteraction(it,'選取物件的父層轉換不可逆，變形已取消');return;}throw error;}}

  hitTest(world,{deep=false}={}){const tolerance=12/Math.max(.03,this.page().camera.scale),candidates=this.ensureSpatialIndex().query({x:world.x-tolerance,y:world.y-tolerance,w:tolerance*2,h:tolerance*2}).filter(item=>item.interactionExposed!==false&&item.effectiveVisible&&!item.effectiveLocked).sort((a,b)=>comparePageObjectHitOrder(a,b,{deep}));for(const item of candidates){const found=this.findObject({layerId:item.layer.id,objectId:item.object.id});if(found&&this.hitObject(found.object,world,found.parentWorldMatrix))return found;}return null;}
  hitObject(o,world,parent=M.identity()){const effective=M.toWorld(parent,o.matrix||M.identity());if(o.type==='group'||o.type==='frame'||o.type==='repeat'||isComponentInstance(o)){const b=this.renderer.objectWorldBounds(o,parent);return world.x>=b.x&&world.x<=b.x+b.w&&world.y>=b.y&&world.y<=b.y+b.h;}const inv=M.tryInvert(effective);if(!inv)return false;const p=M.point(inv,world),b=localBounds(o,this.renderer.measureCtx),tol=6/this.page().camera.scale;if(o.type==='stroke'){const pts=o.points?.length>1?sampleStrokePath(o,Math.max(1,(o.size||2)*.3)):(o.points||[]);for(let i=1;i<pts.length;i++)if(pointSegmentDistance(p,pts[i-1],pts[i])<Math.max(tol,(o.size||2)*.75))return true;return pts.length===1&&distance(p,pts[0])<(o.size||2);}if(o.type==='path'){let filled=false;const strokeHitWidth=Math.max(1,pathStrokeRenderWidth(o));for(const sub of o.subpaths||[]){const pts=flattenSubpath(sub,.8);for(let i=1;i<pts.length;i++)if(pointSegmentDistance(p,pts[i-1],pts[i])<Math.max(tol,strokeHitWidth*.75))return true;if(sub.closed&&pts.length>2&&polygonContains(p,pts))filled=!filled;}return Boolean(o.fill)&&filled;}if(o.type==='shape'&&(o.shape==='line'||o.shape==='arrow'))return pointSegmentDistance(p,{x:0,y:0},{x:o.x2,y:o.y2})<Math.max(tol,(o.size||2)*1.5);return p.x>=b.x-tol&&p.x<=b.x+b.w+tol&&p.y>=b.y-tol&&p.y<=b.y+b.h+tol;}
  finishLasso(){const poly=this.draft?.lasso||[];if(poly.length<3){this.clearSelection();return;}const candidates=lassoCandidates(this.ensureSpatialIndex(),poly,polygonBounds(poly),(object,item)=>this.renderer.objectWorldBounds(object,item.parentWorldMatrix)).filter(item=>item.interactionExposed!==false&&!item.effectiveLocked),selected=this.selectionRefsFromItems(candidates);this.selection=selected;this.refreshSelectionUI();if(selected.length)this.revealObjectInspector();}
  onDoubleClick(e){if(!this.documentOpen)return;const d=this.eventData(e),hit=this.hitTest(d.world,{deep:e.altKey});if(hit?.object.type==='text')this.openTextEditor(e.clientX,e.clientY,d.world,hit);else if(hit?.object.type==='stroke'&&this.tool==='select'){this.selectOnly(hit.layer.id,hit.object.id);this.enterStrokeEdit({layerId:hit.layer.id,objectId:hit.object.id});}else if(hit?.object.type==='path'&&this.tool==='select'){this.selectOnly(hit.layer.id,hit.object.id);this.enterPathEdit({layerId:hit.layer.id,objectId:hit.object.id});}else if(hit&&this.tool==='select'){this.selectOnly(hit.layer.id,hit.object.id);}}

  onWheel(e){e.preventDefault();if(!this.documentOpen)return;const rect=this.el.wrap.getBoundingClientRect(),sx=e.clientX-rect.left,sy=e.clientY-rect.top,cam=this.page().camera;if(e.altKey){const before=this.renderer.screenToWorld(e.clientX,e.clientY),delta=clamp(e.deltaY,-100,100)*-.002;cam.rotation+=delta;const after=this.renderer.worldToScreen(before);cam.x+=sx-after.x;cam.y+=sy-after.y;}else if(e.shiftKey){cam.x-=e.deltaY;cam.y-=e.deltaX;}else{const before=this.renderer.screenToWorld(e.clientX,e.clientY),factor=Math.exp(-e.deltaY*.0015);cam.scale=clampViewScale(cam.scale*factor);const after=this.renderer.worldToScreen(before);cam.x+=sx-after.x;cam.y+=sy-after.y;}this.renderer.render();this.showZoomHud();}
  requestProjectOpen(){return this.uiPresentation?.openProject?.()||false;}
  onKeyDown(e){const target=e.target;if(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement)return;const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();if(!this.documentOpen){if(mod&&key==='n'){e.preventDefault();this.runUiCommand('document.new.v1');}else if(mod&&key==='o'){e.preventDefault();this.requestProjectOpen();}return;}if(e.code==='Space'){e.preventDefault();this.spaceDown=true;this.updateCursor();return;}if(mod&&key==='1'){e.preventDefault();this.runUiCommand('workspace.activate.v1',{space:'creation'});return;}if(mod&&key==='2'){e.preventDefault();this.runUiCommand('workspace.activate.v1',{space:'layout'});return;}if(mod&&key==='z'){e.preventDefault();this.runUiCommand(e.shiftKey?'history.redo.v1':'history.undo.v1');return;}if(mod&&key==='y'){e.preventDefault();this.runUiCommand('history.redo.v1');return;}if(mod&&e.shiftKey&&key==='f'){e.preventDefault();this.toggleFullscreen();return;}if(mod&&key==='s'){e.preventDefault();this.runUiCommand('document.save.v1');return;}if(mod&&key==='o'){e.preventDefault();this.requestProjectOpen();return;}if(mod&&key==='n'){e.preventDefault();this.runUiCommand('document.new.v1');return;}if(mod&&key==='a'){e.preventDefault();if(this.pathEditing?.active){this.selectAllPathAnchors();return;}this.selection=[];for(const l of this.page().layers)if(l.visible&&!l.locked)for(const o of l.objects)this.selection.push({layerId:l.id,objectId:o.id});this.refreshSelectionUI();this.revealObjectInspector();this.renderer.render();return;}if(mod&&key==='d'){e.preventDefault();this.runUiCommand('selection.duplicate.v1');return;}if(mod&&key==='g'){e.preventDefault();e.shiftKey?this.ungroupSelection():this.groupSelection();return;}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&this.selection.length){e.preventDefault();const step=e.shiftKey?10:1,dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;if(this.pathEditing?.active&&this.pathEditing.state.anchorKeys.size){try{this.pathEditing.moveSelectedAnchors(dx,dy);}catch{}this.refreshSelectionUI();return;}this.runUiCommand('object.translate.v1',{dx,dy});return;}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(this.pathEditing?.active&&this.pathEditing.state.anchorKeys.size){this.deletePathAnchors();return;}this.runUiCommand('selection.delete.v1');return;}if(e.key==='Escape'){this.toggleBrushFamilyPopover(false);this.toggleWorkspaceMenu(false);this.closeTextEditor();this.draft=null;if(this.strokeEdit){this.exitStrokeEdit();return;}if(this.pathEditing?.active){this.exitPathEdit();return;}this.runUiCommand('selection.clear.v1');return;}if(e.key==='+'||e.key==='='){this.runUiCommand('view.zoom.by.v1',{factor:1.2});return;}if(e.key==='-'){this.runUiCommand('view.zoom.by.v1',{factor:1/1.2});return;}if(key==='f'){this.runUiCommand('view.fit.content.v1');return;}if(key==='0'){this.resetRotation();return;}if(key==='w'){this.toggleBrushFamilyPopover();return;}if(e.key==='['){const settings=this.toolSettings[this.lastDrawTool];this.runUiCommand('tool.setting.set.v1',{tool:this.lastDrawTool,key:'size',value:clamp(settings.size*.85,.5,120)});return;}if(e.key===']'){const settings=this.toolSettings[this.lastDrawTool];this.runUiCommand('tool.setting.set.v1',{tool:this.lastDrawTool,key:'size',value:clamp(settings.size*1.18,.5,120)});return;}const shortcuts={b:'pen',n:'pencil',m:'marker',i:'brush',a:'airbrush',e:'eraser',v:'select',l:'lasso',s:'shape',t:'text',h:'pan',p:null};if(key==='p'){this.commands?.notify?.('pages-shortcut-unavailable');return;}if(shortcuts[key])this.runUiCommand('tool.activate.v1',{tool:shortcuts[key]});}
}

window.INK_ARCHITECTURE={version:INK_VERSION,buildId:BUILD_ID,formatVersion:FORMAT_VERSION,moduleMode:'ESM',inventory:'partial-runtime-capability-tags',complete:false,note:'Partial active runtime capability tags; not an exhaustive source-module inventory.',modules:['core','document','storage-v3-checkpointed','history-target-scoped-id-aware','history-panel-step-navigation','input','stroke-bezier','spatial-incremental','selection','frame-hierarchy','transform','path-editing-core','expressive-stroke-core','multi-contour-composition','repaint-material-core','chat-bounded-edit-loop','render-contract','paper-profile','multi-channel-ink','natural-media-webgl2','natural-media-mrt','gpu-resource-budget','dirty-region','persistent-tile-atlas-core','live-canvas-tile-renderer','dual-workspace','layout-model-viewport','fullscreen-shell','layer-drag-reorder','a4-artboard','pdf-output','resumable-tiled-export','pen-calibration','canvas2d-fallback','canvas2d-multichannel','document-integrity','runtime-health','external-diagnostics','service-worker-update','flora-action-layer','flora-hero-structure-mask','flora-region-painting','shared-command-authority','modular-ui-host','minimal-test-shell']};

function qaBridgeRequested(){
  if(globalThis.__INK_ENABLE_TEST_BRIDGE__===true)return true;
  try{return new URL(globalThis.location?.href||'http://ink.local/').searchParams.get('ink-qa')==='1';}
  catch{return false;}
}

async function loadRuntimeQaBridge(app){
  try {
    const module=await import('../qa/runtime-test-bridge.js');
    return module.installRuntimeQaBridge(app);
  } catch(error) {
    console.error('INK_QA_BRIDGE_LOAD_FAILED',error);
    return null;
  }
}

function signalRuntimeReady(app){
  const detail={app,version:INK_VERSION,buildId:(window.INK_ARCHITECTURE?.buildId||BUILD_ID)};
  globalThis.dispatchEvent(new CustomEvent('ink:runtime-ready',{detail}));
  return detail;
}

function bootInk(){
  if(window.INK_APP)return window.INK_APP;
  const app=new InkApp();
  window.INK_APP=app;
  if(qaBridgeRequested()){
    window.INK_QA_BRIDGE_READY=loadRuntimeQaBridge(app).finally(()=>signalRuntimeReady(app));
  }else signalRuntimeReady(app);
  return app;
}

if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',bootInk,{once:true});
else bootInk();
