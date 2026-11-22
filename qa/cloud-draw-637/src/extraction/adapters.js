import { requireValue, checkAbort } from './core.js';
export function binaryRaster({ raster, mask, parameters = {} }) {
  const threshold = parameters.threshold ?? 128;
  requireValue(Number.isFinite(threshold) && threshold >= 0 && threshold <= 255, 'EXTRACTION_THRESHOLD');
  const data = new Uint8ClampedArray(raster.data.length);
  for (let i=0;i<raster.width*raster.height;i++) {
    const o=i*4, dark=raster.data[o]*.2126+raster.data[o+1]*.7152+raster.data[o+2]*.0722 < threshold;
    const foreground=mask ? mask.data[i] === 255 : dark && raster.data[o+3] > 0;
    data[o]=data[o+1]=data[o+2]=foreground?0:255; data[o+3]=255;
  }
  return { width:raster.width,height:raster.height,data };
}
function usableTracePath(path) {
  const segments=path?.segments||[];
  const points=segments.length?[[segments[0].x1,segments[0].y1],...segments.map(s=>s.hasOwnProperty('x3')?[s.x3,s.y3]:[s.x2,s.y2])]:[];
  if(points.length>1&&points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1])points.pop();
  return new Set(points.map(p=>`${p[0]},${p[1]}`)).size>=3;
}

function filterTraceLayers(trace,{includeLayer=()=>true}={}) {
  let omitted=0;
  trace.layers=trace.layers.map((layer,i)=>{
    if(!includeLayer(trace.palette?.[i],i))return[];
    const kept=layer.map((path,index)=>({path,index})).filter(({path})=>usableTracePath(path)||(omitted++,false));
    const remap=new Map(kept.map((entry,index)=>[entry.index,index]));
    return kept.map(({path})=>({...path,holechildren:(path.holechildren||[]).filter(index=>remap.has(index)).map(index=>remap.get(index))}));
  });
  return omitted;
}

export const COLOR_TRACE_MAX_PIXELS=64_000;
export const COLOR_TRACE_MAX_DIMENSION=320;

export function boundedColorTraceRaster(source,{
  maxPixels=COLOR_TRACE_MAX_PIXELS,
  maxDimension=COLOR_TRACE_MAX_DIMENSION
}={}) {
  requireValue(source&&Number.isInteger(source.width)&&source.width>0&&Number.isInteger(source.height)&&source.height>0,'EXTRACTION_COLOR_RASTER_SIZE');
  requireValue(source.data?.length===source.width*source.height*4,'EXTRACTION_COLOR_RGBA_REQUIRED');
  requireValue(Number.isInteger(maxPixels)&&maxPixels>=16_384&&maxPixels<=COLOR_TRACE_MAX_PIXELS,'EXTRACTION_COLOR_TRACE_PIXEL_BOUND');
  requireValue(Number.isInteger(maxDimension)&&maxDimension>=128&&maxDimension<=COLOR_TRACE_MAX_DIMENSION,'EXTRACTION_COLOR_TRACE_DIMENSION_BOUND');
  const sourcePixels=source.width*source.height;
  const scale=Math.min(1,maxDimension/source.width,maxDimension/source.height,Math.sqrt(maxPixels/sourcePixels));
  const width=Math.max(1,Math.floor(source.width*scale));
  const height=Math.max(1,Math.floor(source.height*scale));
  requireValue(width*height<=maxPixels&&width<=maxDimension&&height<=maxDimension,'EXTRACTION_COLOR_TRACE_BOUND_FAILED');
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++){
    const sy=Math.min(source.height-1,Math.floor((y+.5)*source.height/height));
    for(let x=0;x<width;x++){
      const sx=Math.min(source.width-1,Math.floor((x+.5)*source.width/width));
      const src=(sy*source.width+sx)*4,dst=(y*width+x)*4;
      data[dst]=source.data[src];
      data[dst+1]=source.data[src+1];
      data[dst+2]=source.data[src+2];
      data[dst+3]=source.data[src+3];
    }
  }
  return {
    width,height,data,
    sourceWidth:source.width,sourceHeight:source.height,sourcePixels,
    pixels:width*height,
    scaleX:source.width/width,scaleY:source.height/height,
    downsampled:width!==source.width||height!==source.height
  };
}

export function imageTracerAdapter(tracer) {
  return { id:'imagetracerjs',version:'1.2.6',async extract(input) {
    requireValue(typeof tracer?.imagedataToTracedata === 'function','EXTRACTION_IMAGETRACER_UNAVAILABLE');
    checkAbort(input.signal);
    const colorRegions=input.parameters?.mode==='color-regions';
    if(colorRegions){
      const numberOfColors=Number(input.parameters?.numberOfColors??8);
      requireValue(Number.isInteger(numberOfColors)&&numberOfColors>=2&&numberOfColors<=16,'EXTRACTION_COLOR_COUNT');
      const maxPixels=Number(input.parameters?.traceMaxPixels??COLOR_TRACE_MAX_PIXELS);
      const maxDimension=Number(input.parameters?.traceMaxDimension??COLOR_TRACE_MAX_DIMENSION);
      const options={
        ltres:1,qtres:1,pathomit:Math.max(0,Number(input.parameters?.pathOmit??8)||0),linefilter:true,
        colorsampling:2,colorquantcycles:1,numberofcolors:numberOfColors,scale:1,roundcoords:3,layering:0
      };
      const work=boundedColorTraceRaster(input.raster,{maxPixels,maxDimension});
      const trace=tracer.imagedataToTracedata({width:work.width,height:work.height,data:work.data},options);
      const omitted=filterTraceLayers(trace);
      return {
        svg:tracer.getsvgstring(trace,options),
        coordinateScale:{x:work.scaleX,y:work.scaleY},
        traceRaster:{
          width:work.width,height:work.height,pixels:work.pixels,
          sourceWidth:work.sourceWidth,sourceHeight:work.sourceHeight,sourcePixels:work.sourcePixels,
          downsampled:work.downsampled,maxPixels,maxDimension
        },
        warnings:['Quantized color-region trace on deterministic bounded work raster; no semantic labeling or centerline tracing.',...(omitted?[String(omitted)+' degenerate traced contour(s) omitted.']:[])]
      };
    }
    const options={ltres:1,qtres:1,pathomit:8,linefilter:true,colorsampling:0,colorquantcycles:1,numberofcolors:2,
      pal:[{r:0,g:0,b:0,a:255},{r:255,g:255,b:255,a:255}],scale:1,roundcoords:3,layering:0};
    const trace=tracer.imagedataToTracedata(binaryRaster(input),options);
    const omitted=filterTraceLayers(trace,{includeLayer:palette=>palette?.r<128});
    return { svg:tracer.getsvgstring(trace,options),warnings:['Binary luminance/explicit mask boundary; not semantic segmentation.',...(omitted?[`${omitted} degenerate traced contour(s) omitted.`]:[])] };
  }};
}
export function openCVAdapter(cv, version) {
  requireValue(typeof version==='string' && version.length>0,'EXTRACTION_OPENCV_VERSION');
  return { id:'opencvjs-contours',version,extract(input) {
    requireValue(cv?.Mat && cv?.findContours,'EXTRACTION_OPENCV_UNAVAILABLE');
    checkAbort(input.signal);
    const raster=binaryRaster(input),resources=[];
    const own=x=>(resources.push(x),x);
    try {
      const mat=own(cv.matFromImageData(raster)),gray=own(new cv.Mat()),mask=own(new cv.Mat());
      const contours=own(new cv.MatVector()),hierarchy=own(new cv.Mat());
      cv.cvtColor(mat,gray,cv.COLOR_RGBA2GRAY);cv.threshold(gray,mask,127,255,cv.THRESH_BINARY_INV);
      cv.findContours(mask,contours,hierarchy,cv.RETR_TREE,cv.CHAIN_APPROX_SIMPLE);
      const output=[]; const epsilon=input.parameters?.epsilon ?? 1;
      requireValue(Number.isFinite(epsilon) && epsilon>=0 && epsilon<=20,'EXTRACTION_EPSILON');
      // Keep hierarchy indexes intact; fail on degenerate rings rather than silently relink holes.
      for(let i=0;i<contours.size();i++) {
        const contour=contours.get(i),approx=new cv.Mat();
        try {cv.approxPolyDP(contour,approx,epsilon,true); const points=[];
          for(let j=0;j<approx.data32S.length;j+=2)points.push([approx.data32S[j],approx.data32S[j+1]]);
          output.push({parent:hierarchy.data32S[i*4+3],points});
        } finally {contour.delete();approx.delete();}
      }
      // Omit degenerate nodes and all descendants; reindex remaining parent references.
      const keep=output.map((c,i)=>{let j=i;while(j!==-1){if(output[j].points.length<3)return false;j=output[j].parent;}return true;});
      const remap=new Map();output.forEach((c,i)=>{if(keep[i])remap.set(i,remap.size);});
      return {contours:output.filter((c,i)=>keep[i]).map(c=>({...c,parent:c.parent===-1?-1:remap.get(c.parent)})),warnings:['Threshold mask; degenerate contours omitted.']};
    } finally {for(const value of resources.reverse())value.delete();}
  }};
}
// Inject a verified WASM/native bridge. No model/network acquisition in shared core.
export function vTracerAdapter(convert, version) {
  return {id:'vtracer',version,async extract(input) {
    requireValue(typeof convert==='function','EXTRACTION_VTRACER_UNAVAILABLE');
    checkAbort(input.signal);const svg=await convert(binaryRaster(input),{colormode:'binary',mode:'spline',filter_speckle:4});
    checkAbort(input.signal);return {svg};
  }};
}
