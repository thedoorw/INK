import { Matrix } from '../core/index.js';
import {
  ARTBOARD_MAX_MM, ARTBOARD_MIN_MM, ARTBOARD_PPI_MAX, ARTBOARD_PPI_MIN, ARTBOARD_UNITS,
  MM_PER_INCH, deriveArtboardOrientation, isA4Dimensions, mmToWorld, normalizeArtboard,
  validateArtboardOutputSize
} from './artboard.js';
import { normalizeLayoutViewport } from './workspace.js';

export const DOCUMENT_SIZE_ANCHORS = Object.freeze([
  'top-left','top','top-right','left','center','right','bottom-left','bottom','bottom-right'
]);

const fail=(message,code='ARGUMENTS_INVALID',details={})=>{throw Object.assign(new Error(message),{code,details});};
const round4=value=>Math.round(Number(value)*10000)/10000;
const finite=value=>Number.isFinite(Number(value));

export function normalizeDocumentUnit(value='mm'){
  const unit=String(value||'mm').toLowerCase();
  if(!ARTBOARD_UNITS.includes(unit))fail('Document units invalid');
  return unit;
}
export function normalizeDocumentPpi(value){
  const ppi=Number(value);
  if(!Number.isFinite(ppi)||ppi<ARTBOARD_PPI_MIN||ppi>ARTBOARD_PPI_MAX)
    fail(`Document PPI must be between ${ARTBOARD_PPI_MIN} and ${ARTBOARD_PPI_MAX}`);
  return ppi;
}
export function dimensionToMm(value,unit='mm',ppi=300,{delta=false}={}){
  let number=Number(value);
  if(!Number.isFinite(number))fail('Document dimension must be finite');
  const resolvedUnit=normalizeDocumentUnit(unit),resolvedPpi=normalizeDocumentPpi(ppi);
  if(resolvedUnit==='px')number=Math.round(number);
  if(!delta&&number<=0)fail('Document dimension must be positive');
  if(resolvedUnit==='mm')return number;
  if(resolvedUnit==='cm')return number*10;
  if(resolvedUnit==='in')return number*MM_PER_INCH;
  return number*MM_PER_INCH/resolvedPpi;
}
export function mmToDimension(value,unit='mm',ppi=300){
  const mm=Number(value),resolvedUnit=normalizeDocumentUnit(unit),resolvedPpi=normalizeDocumentPpi(ppi);
  if(!Number.isFinite(mm))fail('Document dimension must be finite');
  if(resolvedUnit==='mm')return round4(mm);
  if(resolvedUnit==='cm')return round4(mm/10);
  if(resolvedUnit==='in')return round4(mm/MM_PER_INCH);
  return Math.round(mm*resolvedPpi/MM_PER_INCH);
}

export function validateDocumentMm(widthMm,heightMm,ppi){
  if(!finite(widthMm)||!finite(heightMm)||Number(widthMm)<ARTBOARD_MIN_MM||Number(heightMm)<ARTBOARD_MIN_MM||
     Number(widthMm)>ARTBOARD_MAX_MM||Number(heightMm)>ARTBOARD_MAX_MM)
    fail(`Document dimensions must stay between ${ARTBOARD_MIN_MM} and ${ARTBOARD_MAX_MM} mm`);
  return validateArtboardOutputSize(Number(widthMm),Number(heightMm),normalizeDocumentPpi(ppi));
}
export function normalizeNewDocumentSizeRequest(args={}){
  if(args==null||typeof args!=='object'||Array.isArray(args))fail('New document arguments invalid');
  if(!Object.keys(args).length)return null;
  const unit=normalizeDocumentUnit(args.units??args.unit??'mm');
  const ppi=normalizeDocumentPpi(args.ppi??300);
  let width=Number(args.width),height=Number(args.height);
  if(!finite(width)||!finite(height))fail('Document dimensions invalid');
  if(unit==='px'){width=Math.round(width);height=Math.round(height);}
  const widthMm=dimensionToMm(width,unit,ppi),heightMm=dimensionToMm(height,unit,ppi);
  const pixels=validateDocumentMm(widthMm,heightMm,ppi);
  const orientation=deriveArtboardOrientation(widthMm,heightMm,args.orientation);
  const preset=String(args.preset||'custom')==='A4'&&isA4Dimensions(widthMm,heightMm)?'A4':'custom';
  return Object.freeze({
    preset,sourceUnits:unit,width:round4(width),height:round4(height),ppi,orientation,pixels:Object.freeze(pixels),
    artboard:Object.freeze({preset,orientation,widthMm:round4(widthMm),heightMm:round4(heightMm),ppi,unit})
  });
}
export function normalizeDocumentAnchor(value='center'){
  const anchor=String(value||'center');
  if(!DOCUMENT_SIZE_ANCHORS.includes(anchor))fail('Document anchor invalid');
  return anchor;
}
function anchorFraction(anchor){
  const resolved=normalizeDocumentAnchor(anchor);
  return {
    x:resolved.includes('left')?-.5:resolved.includes('right')?.5:0,
    y:resolved.includes('top')?-.5:resolved.includes('bottom')?.5:0
  };
}
function anchorPoint(widthMm,heightMm,anchor){
  const f=anchorFraction(anchor);
  return {x:mmToWorld(widthMm)*f.x,y:mmToWorld(heightMm)*f.y};
}
function layoutMatrix(page){
  const v=normalizeLayoutViewport(page?.workspace?.layoutViewport||{});
  return Matrix.multiply(Matrix.rotate(v.rotation),Matrix.multiply(Matrix.scale(v.scale),Matrix.translate(-v.x,-v.y)));
}
function conjugateDisplayTransform(page,displayTransform){
  const layout=layoutMatrix(page),inverse=Matrix.tryInvert(layout);
  if(!inverse)fail('Layout viewport cannot be inverted','CAPABILITY_UNAVAILABLE');
  return Matrix.multiply(inverse,Matrix.multiply(displayTransform,layout));
}
function pagePath(app,page,key){
  const base=app.pagePath?.(page);
  if(!Array.isArray(base))fail('Active page path unavailable','CAPABILITY_UNAVAILABLE');
  return key?[...base,key]:base;
}
function assertMutationReady(app,execution,page){
  execution?.assertDocumentCurrent?.();
  app.sessions?.assertIdle?.(execution?.sessionOperation||null);
  if(!page||page!==app.page?.())fail('Active page changed','STALE_PAGE');
}
function refreshAfterSizeMutation(app){
  app.spatialDirty=true;
  app.renderer?.invalidateTiles?.();
  app.refreshArtboardUI?.();
  app.renderer?.render?.();
}
function applyRootMatrix(page,transform){
  let count=0;
  for(const layer of page.layers||[])for(const object of layer.objects||[]){
    object.matrix=Matrix.multiply(transform,Array.isArray(object.matrix)?object.matrix:Matrix.identity());
    count++;
  }
  return count;
}
function nextArtboard(current,{widthMm,heightMm,unit,ppi=current.ppi,preset=null}){
  const resolvedPreset=preset||(current.preset==='A4'&&isA4Dimensions(widthMm,heightMm)?'A4':'custom');
  return normalizeArtboard({...current,widthMm,heightMm,ppi,unit,preset:resolvedPreset,
    orientation:deriveArtboardOrientation(widthMm,heightMm,current.orientation)});
}

function normalizeCanvasTarget(page,args={}){
  const current=normalizeArtboard(page.artboard||{});
  const unit=normalizeDocumentUnit(args.units??args.unit??current.unit??'mm');
  const ppi=current.ppi,relative=Boolean(args.relative);
  let widthMm,heightMm;
  if(relative){
    widthMm=current.widthMm+dimensionToMm(args.width??0,unit,ppi,{delta:true});
    heightMm=current.heightMm+dimensionToMm(args.height??0,unit,ppi,{delta:true});
  }else{
    widthMm=dimensionToMm(args.width,unit,ppi);
    heightMm=dimensionToMm(args.height,unit,ppi);
  }
  validateDocumentMm(widthMm,heightMm,ppi);
  return {current,unit,ppi,relative,widthMm:round4(widthMm),heightMm:round4(heightMm)};
}
export function canvasSizePreview(page,args={}){
  const target=normalizeCanvasTarget(page,args),anchor=normalizeDocumentAnchor(args.anchor);
  const beforeAnchor=anchorPoint(target.current.widthMm,target.current.heightMm,anchor);
  const afterAnchor=anchorPoint(target.widthMm,target.heightMm,anchor);
  const displayDelta={x:afterAnchor.x-beforeAnchor.x,y:afterAnchor.y-beforeAnchor.y};
  return Object.freeze({
    before:Object.freeze({...target.current}),
    after:Object.freeze(nextArtboard(target.current,target)),
    unit:target.unit,relative:target.relative,anchor,
    displayDelta:Object.freeze(displayDelta),
    output:Object.freeze(validateArtboardOutputSize(target.widthMm,target.heightMm,target.ppi))
  });
}
export function applyCanvasSize(app,args={},execution=null){
  const page=app.page?.();assertMutationReady(app,execution,page);
  const preview=canvasSizePreview(page,args),before=normalizeArtboard(page.artboard||{});
  if(preview.after.widthMm===before.widthMm&&preview.after.heightMm===before.heightMm&&preview.after.unit===before.unit)
    fail('Canvas size unchanged','NO_OP');
  const nativeTransform=conjugateDisplayTransform(page,Matrix.translate(preview.displayDelta.x,preview.displayDelta.y));
  const paths=[pagePath(app,page,'artboard')];
  if(Math.abs(preview.displayDelta.x)>1e-12||Math.abs(preview.displayDelta.y)>1e-12)paths.push(pagePath(app,page,'layers'));
  let rootCount=0;
  app.history.pushScoped('調整畫布尺寸',paths,()=>{
    page.artboard=preview.after;
    if(paths.length>1)rootCount=applyRootMatrix(page,nativeTransform);
  });
  refreshAfterSizeMutation(app);
  return {changed:true,pageId:page.id,before,after:{...preview.after},anchor:preview.anchor,relative:preview.relative,
    rootObjectsCompensated:rootCount,displayDelta:{...preview.displayDelta},outsideContentPreserved:true,contentScaled:false};
}
export function applyOutputPpi(app,args={},execution=null){
  const page=app.page?.();assertMutationReady(app,execution,page);
  const before=normalizeArtboard(page.artboard||{}),ppi=normalizeDocumentPpi(args.ppi);
  const output=validateDocumentMm(before.widthMm,before.heightMm,ppi);
  if(ppi===before.ppi)fail('Output PPI unchanged','NO_OP');
  const after=nextArtboard(before,{widthMm:before.widthMm,heightMm:before.heightMm,unit:before.unit,ppi,preset:before.preset});
  app.history.pushScoped('調整輸出解析度',[pagePath(app,page,'artboard')],()=>{page.artboard=after;});
  refreshAfterSizeMutation(app);
  return {changed:true,pageId:page.id,beforePpi:before.ppi,ppi,output,geometryPreserved:true,rasterSourcePreserved:true};
}

function normalizeArtworkTarget(page,args={}){
  const current=normalizeArtboard(page.artboard||{});
  const unit=normalizeDocumentUnit(args.units??args.unit??current.unit??'mm');
  let widthMm=dimensionToMm(args.width,unit,current.ppi),heightMm=dimensionToMm(args.height,unit,current.ppi);
  if(args.preserveAspect){
    const ratio=current.widthMm/current.heightMm,primary=args.primary==='height'?'height':'width';
    if(primary==='height')widthMm=heightMm*ratio;else heightMm=widthMm/ratio;
  }
  validateDocumentMm(widthMm,heightMm,current.ppi);
  return {current,unit,widthMm:round4(widthMm),heightMm:round4(heightMm)};
}
export function artworkResizePreview(page,args={}){
  const target=normalizeArtworkTarget(page,args),anchor=normalizeDocumentAnchor(args.anchor);
  const beforeAnchor=anchorPoint(target.current.widthMm,target.current.heightMm,anchor);
  const afterAnchor=anchorPoint(target.widthMm,target.heightMm,anchor);
  const sx=target.widthMm/target.current.widthMm,sy=target.heightMm/target.current.heightMm;
  return Object.freeze({
    before:Object.freeze({...target.current}),
    after:Object.freeze(nextArtboard(target.current,target)),
    unit:target.unit,anchor,preserveAspect:Boolean(args.preserveAspect),sx,sy,
    beforeAnchor:Object.freeze(beforeAnchor),afterAnchor:Object.freeze(afterAnchor),
    output:Object.freeze(validateArtboardOutputSize(target.widthMm,target.heightMm,target.current.ppi))
  });
}
export function applyArtworkResize(app,args={},execution=null){
  const page=app.page?.();assertMutationReady(app,execution,page);
  const preview=artworkResizePreview(page,args),before=normalizeArtboard(page.artboard||{});
  if(Math.abs(preview.sx-1)<1e-12&&Math.abs(preview.sy-1)<1e-12)fail('Artwork size unchanged','NO_OP');
  const displayTransform=Matrix.multiply(
    Matrix.translate(preview.afterAnchor.x,preview.afterAnchor.y),
    Matrix.multiply(Matrix.scale(preview.sx,preview.sy),Matrix.translate(-preview.beforeAnchor.x,-preview.beforeAnchor.y))
  );
  const nativeTransform=conjugateDisplayTransform(page,displayTransform);
  let rootCount=0;
  app.history.pushScoped('縮放整份作品',[pagePath(app,page,'artboard'),pagePath(app,page,'layers')],()=>{
    page.artboard=preview.after;
    rootCount=applyRootMatrix(page,nativeTransform);
  });
  refreshAfterSizeMutation(app);
  return {changed:true,pageId:page.id,before,after:{...preview.after},anchor:preview.anchor,sx:preview.sx,sy:preview.sy,
    rootObjectsScaled:rootCount,hierarchyScaledOnce:true,localStrokeAndFontValuesPreserved:true,rasterSourcePixelsPreserved:true,
    lockedAndHiddenIncluded:true,layoutViewportPreserved:true,guidesPreserved:true};
}
