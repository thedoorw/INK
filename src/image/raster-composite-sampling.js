// Exact Native renderer composite sampling, in selected raster pixel coordinates.
import { Matrix as M } from '../core/index.js';
import { sampleRasterColor } from './raster-selection-tools.js';
const bounds=points=>({x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),
 w:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),
 h:Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))});
export function sampleVisibleRasterComposite(renderer,page,found,image,point,radius=0,{canvasFactory=()=>document.createElement('canvas')}={}){
 const w=image?.width,h=image?.height,m=found?.worldMatrix||found?.object?.matrix,o=found?.object;
 if(!renderer||typeof renderer.drawPaperWorld!=='function'||typeof renderer.drawLayerObjects!=='function'||!Array.isArray(page?.layers)||!w||!h
    ||!o?.w||!o?.h||!m||m.length!==6||!Number.isFinite(point?.x)||!Number.isFinite(point?.y))
   throw Error('INK_COMPOSITE_SAMPLE_UNAVAILABLE');
 const inv=M.tryInvert(m);if(!inv)throw Error('INK_COMPOSITE_SAMPLE_SINGULAR');
 const x=Math.max(0,Math.min(w-1,Math.floor(point.x))),y=Math.max(0,Math.min(h-1,Math.floor(point.y)));
 const r=Math.max(0,Math.min(32,Math.round(Number(radius)||0)));
 const left=Math.max(0,x-r),top=Math.max(0,y-r),right=Math.min(w-1,x+r),bottom=Math.min(h-1,y+r);
 const c=canvasFactory();c.width=right-left+1;c.height=bottom-top+1;
 const ctx=c.getContext?.('2d',{willReadFrequently:true});if(!ctx)throw Error('INK_COMPOSITE_CANVAS_UNAVAILABLE');
 const sx=w/o.w,sy=h/o.h;
 const corners=[[left,top],[right+1,top],[right+1,bottom+1],[left,bottom+1]]
   .map(([px,py])=>M.point(m,{x:px/sx,y:py/sy}));
 const worldBounds=bounds(corners);
 ctx.setTransform(sx*inv[0],sy*inv[1],sx*inv[2],sy*inv[3],sx*inv[4]-left,sy*inv[5]-top);
 // Match Native renderPageWorld's visible layer stack but exclude transient flora,
 // guide, selection and other inspection overlays from document color.
 ctx.save();
 renderer.drawPaperWorld(ctx,page,worldBounds);
 for(const layer of page.layers){
   if(layer.visible===false)continue;
   ctx.save();ctx.globalAlpha*=layer.opacity;
   renderer.drawLayerObjects(ctx,layer,page,{preferredScale:Math.max(sx,sy)});
   ctx.restore();
 }
 ctx.restore();
 const pixels=ctx.getImageData(0,0,c.width,c.height);
 return sampleRasterColor(pixels,{x:x-left,y:y-top,radius:r});
}
