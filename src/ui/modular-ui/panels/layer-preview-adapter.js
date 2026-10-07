import { assertBoundedUiAdapter } from '../contract.js';

function activePage(app){return app?.page?.()||app?.doc?.pages?.find?.(page=>page.id===app?.doc?.activePageId)||null;}
function finiteBounds(bounds){return Boolean(bounds&&Number.isFinite(Number(bounds.x))&&Number.isFinite(Number(bounds.y))&&Number.isFinite(Number(bounds.w))&&Number.isFinite(Number(bounds.h))&&Number(bounds.w)>0&&Number(bounds.h)>0);}
function transformBounds(bounds,matrix){
  if(!finiteBounds(bounds)||!Array.isArray(matrix)||matrix.length<6||!matrix.slice(0,6).every(Number.isFinite))return null;
  const [a,b,c,d,e,f]=matrix,pts=[
    [bounds.x,bounds.y],[bounds.x+bounds.w,bounds.y],[bounds.x+bounds.w,bounds.y+bounds.h],[bounds.x,bounds.y+bounds.h]
  ].map(([x,y])=>({x:a*x+c*y+e,y:b*x+d*y+f}));
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
  return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
}
function clearCanvas(context,canvas){
  const width=Math.max(1,Number(canvas?.width)||28),height=Math.max(1,Number(canvas?.height)||24);
  try{context?.setTransform?.(1,0,0,1,0,0);context?.clearRect?.(0,0,width,height);}catch{}
  return {width,height};
}

export function createUiCLayerPreviewAdapter(app){
  return assertBoundedUiAdapter({
    id:'ui-c.layer-preview.v2',owner:'C',kind:'native-owner',
    render(canvas,layerId){
      const page=activePage(app),renderer=app?.renderer,context=canvas?.getContext?.('2d');
      const layer=page?.layers?.find?.(item=>String(item.id)===String(layerId));
      if(!page||!layer||!context||typeof renderer?.contentBounds!=='function'||typeof renderer?.drawLayerObjects!=='function')return false;
      const size=clearCanvas(context,canvas);
      if(!Array.isArray(layer.objects)||layer.objects.length===0)return false;
      const previewPage={...page,layers:[{...layer,visible:true}]};
      let worldBounds=null;
      try{worldBounds=renderer.contentBounds(previewPage,false);}catch{return false;}
      if(!finiteBounds(worldBounds))return false;
      const layout=app?.spaceMode?.()==='layout';
      let layoutMatrix=null,displayBounds=worldBounds;
      if(layout){
        if(typeof renderer.layoutViewportMatrix!=='function')return false;
        try{layoutMatrix=renderer.layoutViewportMatrix(page);}catch{return false;}
        displayBounds=transformBounds(worldBounds,layoutMatrix);
        if(!finiteBounds(displayBounds))return false;
      }
      const scale=Math.max(.0001,Math.min((size.width-4)/displayBounds.w,(size.height-4)/displayBounds.h));
      const tx=size.width/2-(displayBounds.x+displayBounds.w/2)*scale;
      const ty=size.height/2-(displayBounds.y+displayBounds.h/2)*scale;
      const beforeAlpha=context.globalAlpha;
      try{
        context.save?.();
        context.setTransform?.(scale,0,0,scale,tx,ty);
        if(layout&&layoutMatrix)context.transform?.(...layoutMatrix);
        context.globalAlpha=Number.isFinite(Number(layer.opacity))?Number(layer.opacity):1;
        renderer.drawLayerObjects(context,layer,page,{preferredScale:scale});
        return true;
      }catch{
        clearCanvas(context,canvas);
        return false;
      }finally{
        context.globalAlpha=beforeAlpha??1;
        try{context.restore?.();}catch{}
      }
    }
  });
}
