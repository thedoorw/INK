// UR2 P1 — transient crop gesture only. Native ui017.image.crop.v1 owns every pixel
// mutation and History operation; this overlay never modifies Document or Storage.
import {Matrix as M} from '../../../../core/index.js';
import {nativeViewportMatrix} from '../completion-overlay.js';

const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const handles=Object.freeze(['nw','n','ne','e','se','s','sw','w']);
const finite=v=>Number.isFinite(v);
// Avoid 1px crop drift when inverse camera transforms yield 9.999999999999998.
const snapNearPixel=v=>{const n=Math.round(v);return Math.abs(v-n)<=1e-6?n:v};
const near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const handlePoints=r=>({
 nw:[r.x,r.y],n:[r.x+r.w/2,r.y],ne:[r.x+r.w,r.y],
 e:[r.x+r.w,r.y+r.h/2],se:[r.x+r.w,r.y+r.h],
 s:[r.x+r.w/2,r.y+r.h],sw:[r.x,r.y+r.h],w:[r.x,r.y+r.h/2]
});
const escapeNumber=v=>Number(v.toFixed(3));

export function mountDev2CropInteraction(root,host,{onFeedback=()=>{}}={}){
 const app=host.app,canvas=app?.el?.canvas,selection=app?.selectedObjects?.();
 if(!canvas||selection?.length!==1)throw Error('Crop requires one selected image');
 const found=selection[0],object=found.object,raster=object?.rasterState?.colorRaster;
 if(object?.type!=='image'||!raster?.width||!raster?.height)throw Error('Crop requires an RGB8 image');
 const width=raster.width,height=raster.height,token=host.target();
 const abort=new AbortController(),{signal}=abort;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('aria-hidden','true');
 svg.setAttribute('data-ur2-crop-overlay','');
 Object.assign(svg.style,{position:'fixed',pointerEvents:'none',zIndex:'42',overflow:'visible'});
 document.body.append(svg);
 let draft={x:0,y:0,w:width,h:height},created=false,gesture=null,frame=0,disposed=false;

 function requireLease(){
  if(disposed)throw Error('Crop interaction ended');
  host.provider.requireSelection(token,{single:true,type:'image'});
  const a=app.selectedObjects?.()||[],f=a[0];
  if(a.length!==1||f.object!==object||f.layer!==found.layer||f.object.rasterState?.colorRaster?.width!==width||f.object.rasterState?.colorRaster?.height!==height)throw Error('Crop target changed');
  if(f.effectiveLocked||f.effectiveVisible===false||f.layer?.locked||f.layer?.visible===false)throw Error('Crop target unavailable');
  return f;
 }
 function geometry(){
  const f=requireLease(),worldMatrix=f.worldMatrix||f.object.matrix;
  if(!worldMatrix||!finite(f.object.w)||!finite(f.object.h)||f.object.w<=0||f.object.h<=0)throw Error('Invalid crop geometry');
  const inverse=M.tryInvert(worldMatrix),rect=canvas.getBoundingClientRect();
  const view=nativeViewportMatrix(app,rect);
  if(!inverse||!view||rect.width<=0||rect.height<=0)throw Error('Non-invertible crop viewport');
  const pixelToScreen=M.multiply(view,M.multiply(worldMatrix,[f.object.w/width,0,0,f.object.h/height,0,0]));
  return {inverse,rect,pixelToScreen,worldMatrix};
 }
 function point(event,g,clip=true){
  const local=M.point(g.inverse,app.eventData(event).world);
  const x=snapNearPixel(local.x/object.w*width),y=snapNearPixel(local.y/object.h*height);
  return {x:clip?clamp(x,0,width):x,y:clip?clamp(y,0,height):y};
 }
 function validRect(v){
  return Object.values(v).every(finite)&&v.x>=0&&v.y>=0&&v.w>=1&&v.h>=1&&v.x+v.w<=width&&v.y+v.h<=height;
 }
 function syncForm(){
  if(disposed)return;
  for(const [key,value] of Object.entries(draft)){
   const el=root.querySelector('[data-key="'+key+'"]');
   if(el)el.value=String(value);
  }
 }
 function reset(){draft={x:0,y:0,w:width,h:height};created=false;gesture=null;syncForm();schedule();}
 function updateFromForm(){
  const next={};
  for(const k of ['x','y','w','h'])next[k]=Number(root.querySelector('[data-key="'+k+'"]')?.value);
  if(!validRect(next)){onFeedback('Crop rectangle must be inside the selected image');syncForm();return false}
  draft=next;created=true;schedule();return true;
 }
 function draw(){
  frame=0;if(disposed)return;
  let g;try{g=geometry()}catch{svg.replaceChildren();return;}
  Object.assign(svg.style,{left:g.rect.left+'px',top:g.rect.top+'px',width:g.rect.width+'px',height:g.rect.height+'px'});
  svg.setAttribute('viewBox','0 0 '+g.rect.width+' '+g.rect.height);
  const r=draft,[x,y,w,h]=[r.x,r.y,r.w,r.h],transform='matrix('+g.pixelToScreen.join(' ')+')';
  let detail='';
  if(created){
   detail='<path fill-rule="evenodd" fill="rgba(20,20,20,.30)" d="M0 0H'+width+'V'+height+'H0Z M'+x+' '+y+'H'+(x+w)+'V'+(y+h)+'H'+x+'Z"/>'+
   '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="none" stroke="#fff" stroke-dasharray="5 3" vector-effect="non-scaling-stroke" stroke-width="1.5"/>'+
   '<path d="M'+(x+w/3)+' '+y+'v'+h+' M'+(x+2*w/3)+' '+y+'v'+h+' M'+x+' '+(y+h/3)+'h'+w+' M'+x+' '+(y+2*h/3)+'h'+w+'" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="1" vector-effect="non-scaling-stroke"/>';
  }else{
   detail='<rect x="0" y="0" width="'+width+'" height="'+height+'" fill="none" stroke="#0d99ff" stroke-dasharray="6 5" stroke-width="1.5" vector-effect="non-scaling-stroke"/>';
  }
  let html='<g transform="'+transform+'">'+detail+'</g>';
  if(created)for(const [key,[px,py]] of Object.entries(handlePoints(r))){
   const s=M.point(g.pixelToScreen,{x:px,y:py});
   if(finite(s.x)&&finite(s.y))html+='<rect data-crop-handle="'+key+'" x="'+escapeNumber(s.x-4)+'" y="'+escapeNumber(s.y-4)+'" width="8" height="8" fill="#fff" stroke="#333" stroke-width="1"/>';
  }
  svg.innerHTML=html;
 }
 function schedule(){if(!disposed&&!frame)frame=requestAnimationFrame(draw)}
 function hit(pos,g){
  if(created){
   const cursor=M.point(g.pixelToScreen,pos),pts=handlePoints(draft);
   for(const key of handles){
    const [x,y]=pts[key];
    if(near(cursor,M.point(g.pixelToScreen,{x,y}))<=7)return key;
   }
   if(pos.x>=draft.x&&pos.x<=draft.x+draft.w&&pos.y>=draft.y&&pos.y<=draft.y+draft.h)return 'move';
  }
  return 'new';
 }
 function resize(start,kind,p){
  let l=start.x,t=start.y,r=start.x+start.w,b=start.y+start.h;
  if(kind.includes('w'))l=clamp(Math.floor(p.x),0,r-1);
  if(kind.includes('e'))r=clamp(Math.ceil(p.x),l+1,width);
  if(kind.includes('n'))t=clamp(Math.floor(p.y),0,b-1);
  if(kind.includes('s'))b=clamp(Math.ceil(p.y),t+1,height);
  return{x:l,y:t,w:r-l,h:b-t};
 }
 function onDown(e){
  if(e.button!==0||app.spaceDown||gesture||e.defaultPrevented)return;
  let g,p;try{g=geometry();p=point(e,g,false)}catch{return;}
  if(p.x<0||p.y<0||p.x>width||p.y>height)return;
  const mode=hit(p,g);
  e.preventDefault();e.stopImmediatePropagation();
  const start=point(e,g);
  gesture={id:e.pointerId,mode,start,rect:{...draft}};
  try{canvas.setPointerCapture(e.pointerId)}catch{}
  if(mode==='new'){created=true;draft={x:Math.min(width-1,Math.floor(start.x)),y:Math.min(height-1,Math.floor(start.y)),w:1,h:1};}
  syncForm();schedule();
 }
 function onMove(e){
  if(!gesture||e.pointerId!==gesture.id)return;
  e.preventDefault();e.stopImmediatePropagation();
  let p;try{p=point(e,geometry())}catch{gesture=null;schedule();return;}
  const {mode,start,rect}=gesture;
  if(mode==='move'){
   draft={...rect,x:clamp(Math.round(rect.x+p.x-start.x),0,width-rect.w),y:clamp(Math.round(rect.y+p.y-start.y),0,height-rect.h)};
  }else if(mode==='new'){
   const x1=clamp(Math.floor(Math.min(start.x,p.x)),0,width-1),y1=clamp(Math.floor(Math.min(start.y,p.y)),0,height-1);
   const x2=clamp(Math.ceil(Math.max(start.x,p.x)),x1+1,width),y2=clamp(Math.ceil(Math.max(start.y,p.y)),y1+1,height);
   draft={x:x1,y:y1,w:x2-x1,h:y2-y1};
  }else draft=resize(rect,mode,p);
  syncForm();schedule();
 }
 function onEnd(e){
  if(!gesture||e.pointerId!==gesture.id)return;
  e.preventDefault();e.stopImmediatePropagation();
  gesture=null;try{canvas.releasePointerCapture(e.pointerId)}catch{}
  schedule();
 }
 canvas.addEventListener('pointerdown',onDown,{capture:true,signal});
 window.addEventListener('pointermove',onMove,{capture:true,signal});
 window.addEventListener('pointerup',onEnd,{capture:true,signal});
 window.addEventListener('pointercancel',onEnd,{capture:true,signal});
 const observer=new ResizeObserver(schedule);observer.observe(canvas);
 window.addEventListener('wheel',schedule,{capture:true,signal,passive:true});
 window.addEventListener('resize',schedule,{signal});
 window.addEventListener('scroll',schedule,{capture:true,signal});
 const unsubscribe=host.subscribe?.(schedule)||(()=>{});
 schedule();
 return{reset,syncForm,updateFromForm,values:()=>({...draft}),dispose(){
  if(disposed)return;disposed=true;abort.abort();observer.disconnect();unsubscribe();
  if(frame)cancelAnimationFrame(frame);
  if(gesture)try{canvas.releasePointerCapture(gesture.id)}catch{}
  svg.remove();
 }};
}
