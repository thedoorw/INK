export const CANVAS_EDGE_SIZE = 17;
export const CSS_PPI = 96;
export const MM_PER_INCH = 25.4;

const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,finite(value,min)));

export function normalizeViewContract(contract={}){
  const minScale=Number(contract.minScale),maxScale=Number(contract.maxScale);
  if(!Number.isFinite(minScale)||!Number.isFinite(maxScale)||minScale<=0||maxScale<=minScale){
    throw new TypeError('INK_D_VIEW_CONTRACT_REQUIRED');
  }
  return {minScale,maxScale};
}

export function clampViewScale(scale,contract){
  const bounds=normalizeViewContract(contract);
  return clamp(scale,bounds.minScale,bounds.maxScale);
}

export function normalizeCamera(camera={}){
  return {
    x:finite(camera.x,0),
    y:finite(camera.y,0),
    scale:Math.max(Number.EPSILON,finite(camera.scale,1)),
    rotation:finite(camera.rotation,0)
  };
}

export function normalizeLayoutViewport(workspace={}){
  const source=workspace?.layoutViewport||{};
  return {
    x:finite(source.x,0),
    y:finite(source.y,0),
    scale:clamp(finite(source.scale,1),0.01,100),
    rotation:finite(source.rotation,0)
  };
}

function rotate(point,angle){
  const c=Math.cos(angle),s=Math.sin(angle);
  return {x:point.x*c-point.y*s,y:point.x*s+point.y*c};
}

function inverseRotate(point,angle){
  const c=Math.cos(angle),s=Math.sin(angle);
  return {x:point.x*c+point.y*s,y:-point.x*s+point.y*c};
}

export function nativeToScreen(point,{camera={},workspace={},width=1,height=1}={}){
  const cam=normalizeCamera(camera);
  let display={x:finite(point?.x,0),y:finite(point?.y,0)};
  if(workspace?.activeSpace==='layout'){
    const viewport=normalizeLayoutViewport(workspace);
    display=rotate({
      x:(display.x-viewport.x)*viewport.scale,
      y:(display.y-viewport.y)*viewport.scale
    },viewport.rotation);
  }
  const cameraPoint=rotate(display,cam.rotation);
  return {
    x:finite(width,1)/2+cam.x+cameraPoint.x*cam.scale,
    y:finite(height,1)/2+cam.y+cameraPoint.y*cam.scale
  };
}

export function screenToNative(point,{camera={},workspace={},width=1,height=1}={}){
  const cam=normalizeCamera(camera);
  const centered={
    x:(finite(point?.x,0)-finite(width,1)/2-cam.x)/cam.scale,
    y:(finite(point?.y,0)-finite(height,1)/2-cam.y)/cam.scale
  };
  let native=inverseRotate(centered,cam.rotation);
  if(workspace?.activeSpace==='layout'){
    const viewport=normalizeLayoutViewport(workspace);
    native=inverseRotate(native,viewport.rotation);
    native={x:native.x/viewport.scale+viewport.x,y:native.y/viewport.scale+viewport.y};
  }
  return native;
}

export function effectiveViewScale(camera={},workspace={}){
  const cam=normalizeCamera(camera);
  return cam.scale*(workspace?.activeSpace==='layout'?normalizeLayoutViewport(workspace).scale:1);
}

export function chooseRulerStep(camera={},workspace={},targetPixels=80){
  const scale=Math.max(1e-9,effectiveViewScale(camera,workspace));
  const raw=Math.max(1e-9,finite(targetPixels,80)/scale);
  const power=Math.pow(10,Math.floor(Math.log10(raw)));
  const normalized=raw/power;
  const unit=normalized<=1?1:normalized<=2?2:normalized<=5?5:10;
  return unit*power;
}

export function buildRulerTicks({orientation='horizontal',camera={},workspace={},width=1,height=1,maxTicks=180}={}){
  const horizontal=orientation==='horizontal';
  const span=Math.max(1,finite(horizontal?width:height,1));
  const cross=Math.max(1,finite(horizontal?height:width,1))/2;
  const startPoint=screenToNative(horizontal?{x:0,y:cross}:{x:cross,y:0},{camera,workspace,width,height});
  const endPoint=screenToNative(horizontal?{x:span,y:cross}:{x:cross,y:span},{camera,workspace,width,height});
  const start=horizontal?startPoint.x:startPoint.y,end=horizontal?endPoint.x:endPoint.y;
  const min=Math.min(start,end),max=Math.max(start,end);
  const majorStep=chooseRulerStep(camera,workspace,82);
  const majorPixels=majorStep*Math.max(1e-9,effectiveViewScale(camera,workspace));
  const divisions=majorPixels>=100?10:majorPixels>=56?4:2;
  const minorStep=majorStep/divisions;
  let value=Math.ceil(min/minorStep)*minorStep;
  const ticks=[],safeMax=Math.max(1,Math.floor(finite(maxTicks,180)));
  while(value<=max+minorStep*1e-7&&ticks.length<safeMax){
    const ratio=value/majorStep;
    const major=Math.abs(ratio-Math.round(ratio))<1e-6;
    const half=Math.abs(ratio*2-Math.round(ratio*2))<1e-6;
    const level=major?'major':half?'mid':'minor';
    const origin=Math.abs(value)<minorStep*1e-6;
    const anchor=horizontal?{x:value,y:(startPoint.y+endPoint.y)/2}:{x:(startPoint.x+endPoint.x)/2,y:value};
    const screen=nativeToScreen(anchor,{camera,workspace,width,height});
    const pixel=horizontal?screen.x:screen.y;
    if(Number.isFinite(pixel)&&pixel>=-1&&pixel<=span+1){
      ticks.push({value,pixel,major,level,origin,label:major?formatRulerValue(value):''});
    }
    value+=minorStep;
  }
  ticks.sort((a,b)=>a.pixel-b.pixel);
  return ticks;
}

export function formatRulerValue(value){
  const abs=Math.abs(value),digits=abs>=100?0:abs>=10?1:2;
  return Number(value.toFixed(digits)).toString();
}

export function artboardWorldBounds(artboard={}){
  const widthMm=Math.max(1,finite(artboard.widthMm,210)),heightMm=Math.max(1,finite(artboard.heightMm,297));
  const w=widthMm*CSS_PPI/MM_PER_INCH,h=heightMm*CSS_PPI/MM_PER_INCH;
  return {x:-w/2,y:-h/2,w,h};
}

export function viewportNativeBounds({camera={},workspace={},width=1,height=1}={}){
  const points=[
    screenToNative({x:0,y:0},{camera,workspace,width,height}),
    screenToNative({x:width,y:0},{camera,workspace,width,height}),
    screenToNative({x:width,y:height},{camera,workspace,width,height}),
    screenToNative({x:0,y:height},{camera,workspace,width,height})
  ];
  const xs=points.map(point=>point.x),ys=points.map(point=>point.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  return {x:minX,y:minY,w:maxX-minX,h:maxY-minY,points};
}

function normalizeRect(rect={},name='RECT'){
  const x=finite(rect.x,NaN),y=finite(rect.y,NaN),w=finite(rect.w,NaN),h=finite(rect.h,NaN);
  if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)throw new TypeError('INK_D_'+name+'_REQUIRED');
  return {x,y,w,h};
}

export function normalizeThumbnailPreview(preview={}){
  const width=Math.max(1,finite(preview.width,NaN)),height=Math.max(1,finite(preview.height,NaN));
  const padding=Math.max(0,finite(preview.padding,0)),scale=finite(preview.scale,NaN);
  const layoutMatrix=Array.isArray(preview.layoutMatrix)?preview.layoutMatrix.map(Number):[];
  if(!Number.isFinite(width)||!Number.isFinite(height)||!Number.isFinite(scale)||scale<=0)throw new TypeError('INK_D_PREVIEW_GEOMETRY_REQUIRED');
  if(layoutMatrix.length!==6||!layoutMatrix.every(Number.isFinite))throw new TypeError('INK_D_PREVIEW_LAYOUT_MATRIX_REQUIRED');
  const determinant=layoutMatrix[0]*layoutMatrix[3]-layoutMatrix[1]*layoutMatrix[2];
  if(!Number.isFinite(determinant)||Math.abs(determinant)<=1e-12)throw new TypeError('INK_D_PREVIEW_LAYOUT_MATRIX_SINGULAR');
  return {
    width,height,padding,scale,
    fitBounds:normalizeRect(preview.fitBounds,'PREVIEW_FIT_BOUNDS'),
    trimBounds:normalizeRect(preview.trimBounds,'PREVIEW_TRIM_BOUNDS'),
    layoutMatrix
  };
}

function affinePoint(matrix,point){
  return {
    x:matrix[0]*finite(point?.x)+matrix[2]*finite(point?.y)+matrix[4],
    y:matrix[1]*finite(point?.x)+matrix[3]*finite(point?.y)+matrix[5]
  };
}

function invertAffine(matrix){
  const determinant=matrix[0]*matrix[3]-matrix[1]*matrix[2];
  return [
    matrix[3]/determinant,
    -matrix[1]/determinant,
    -matrix[2]/determinant,
    matrix[0]/determinant,
    (matrix[2]*matrix[5]-matrix[3]*matrix[4])/determinant,
    (matrix[1]*matrix[4]-matrix[0]*matrix[5])/determinant
  ];
}

function fitNativeToBitmap(point,preview){
  const centerX=preview.fitBounds.x+preview.fitBounds.w/2,centerY=preview.fitBounds.y+preview.fitBounds.h/2;
  return {
    x:preview.width/2+(finite(point?.x)-centerX)*preview.scale,
    y:preview.height/2+(finite(point?.y)-centerY)*preview.scale
  };
}

function bitmapToFitNative(point,preview){
  const centerX=preview.fitBounds.x+preview.fitBounds.w/2,centerY=preview.fitBounds.y+preview.fitBounds.h/2;
  return {
    x:centerX+(finite(point?.x)-preview.width/2)/preview.scale,
    y:centerY+(finite(point?.y)-preview.height/2)/preview.scale
  };
}

function bitmapToDisplay(point,model){
  return {x:finite(point?.x)*model.boxWidth/model.preview.width,y:finite(point?.y)*model.boxHeight/model.preview.height};
}

function displayToBitmap(point,model){
  return {x:finite(point?.x)*model.preview.width/model.boxWidth,y:finite(point?.y)*model.preview.height/model.boxHeight};
}

export function navigatorSurfacePointToDisplay(point,model){
  if(!model?.preview)throw new TypeError('INK_D_NAVIGATOR_MODEL_REQUIRED');
  return bitmapToDisplay(fitNativeToBitmap(point,model.preview),model);
}

export function navigatorArtworkPointToDisplay(point,model){
  if(!model?.preview)throw new TypeError('INK_D_NAVIGATOR_MODEL_REQUIRED');
  const transformed=affinePoint(model.preview.layoutMatrix,point);
  return bitmapToDisplay(fitNativeToBitmap(transformed,model.preview),model);
}

function pointsBounds(points=[]){
  const xs=points.map(point=>point.x),ys=points.map(point=>point.y);
  return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
}

export function navigatorModel({preview,camera={},workspace={},viewportWidth=1,viewportHeight=1,boxWidth=220,boxHeight=150}={}){
  const normalizedPreview=normalizeThumbnailPreview(preview);
  const model={
    preview:normalizedPreview,
    boxWidth:Math.max(1,finite(boxWidth,220)),
    boxHeight:Math.max(1,finite(boxHeight,150))
  };
  const trim=normalizedPreview.trimBounds;
  const trimStart=navigatorSurfacePointToDisplay({x:trim.x,y:trim.y},model);
  const trimEnd=navigatorSurfacePointToDisplay({x:trim.x+trim.w,y:trim.y+trim.h},model);
  const visible=viewportNativeBounds({camera,workspace,width:viewportWidth,height:viewportHeight});
  const viewportPoints=visible.points.map(point=>navigatorArtworkPointToDisplay(point,model));
  return {
    ...model,
    artboard:trim,
    artboardRect:{x:trimStart.x,y:trimStart.y,w:trimEnd.x-trimStart.x,h:trimEnd.y-trimStart.y},
    viewportPoints,
    viewportRect:pointsBounds(viewportPoints),
    visible
  };
}

export function navigatorPointToNative(point,model){
  if(!model?.preview)throw new TypeError('INK_D_NAVIGATOR_MODEL_REQUIRED');
  const bitmap=displayToBitmap(point,model);
  const transformed=bitmapToFitNative(bitmap,model.preview);
  return affinePoint(invertAffine(model.preview.layoutMatrix),transformed);
}

export function panDeltaToCenter(nativePoint,{camera={},workspace={},width=1,height=1}={}){
  const screen=nativeToScreen(nativePoint,{camera,workspace,width,height});
  return {dx:finite(width,1)/2-screen.x,dy:finite(height,1)/2-screen.y};
}

export function axisScrollbarModel(camera={},viewportExtent=1,axis='x'){
  const cam=normalizeCamera(camera),value=axis==='y'?cam.y:cam.x;
  const base=Math.max(2000,finite(viewportExtent,1)*8),span=Math.max(base,Math.abs(value)*1.25+100);
  return {min:-span,max:span,value:clamp(value,-span,span),step:1,range:span*2};
}

export function scrollbarThumbSize(model={},trackExtent=1,viewportExtent=1,minPx=30){
  const track=Math.max(1,finite(trackExtent,1));
  const viewport=Math.max(1,finite(viewportExtent,1));
  const range=Math.max(viewport,finite(model.range,finite(model.max)-finite(model.min)));
  const proportional=track*viewport/(range+viewport);
  return clamp(proportional,Math.min(track,Math.max(16,finite(minPx,30))),Math.max(16,track*.75));
}

export function horizontalScrollbarModel(camera={},viewportWidth=1){return axisScrollbarModel(camera,viewportWidth,'x');}
export function verticalScrollbarModel(camera={},viewportHeight=1){return axisScrollbarModel(camera,viewportHeight,'y');}
export function horizontalScrollbarPanDelta(value,camera={}){return finite(value,0)-normalizeCamera(camera).x;}
export function verticalScrollbarPanDelta(value,camera={}){return finite(value,0)-normalizeCamera(camera).y;}
