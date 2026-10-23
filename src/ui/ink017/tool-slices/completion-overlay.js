// Transient interaction overlay only; the Native renderer still owns all document pixels.
import {Matrix as M} from '../../../core/index.js';
import {pathData} from '../../../vector/vector-core.js';

export function selectionOutline(mask,maxSegments=20000){
 const {width:w,height:h,alpha}=mask,parts=[];
 const inside=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&alpha[y*w+x]>127;
 for(let y=0;y<=h;y++)for(let x=0;x<w;){if(inside(x,y-1)===inside(x,y)){x++;continue}const start=x++;while(x<w&&inside(x,y-1)!==inside(x,y))x++;parts.push('M'+start+' '+y+'H'+x);if(parts.length>maxSegments)return '';}
 for(let x=0;x<=w;x++)for(let y=0;y<h;){if(inside(x-1,y)===inside(x,y)){y++;continue}const start=y++;while(y<h&&inside(x-1,y)!==inside(x,y))y++;parts.push('M'+x+' '+start+'V'+y);if(parts.length>maxSegments)return '';}
 return parts.join('');
}

export function nativeViewportMatrix(app,rect){
 const at=(x,y)=>app.eventData({clientX:rect.left+x,clientY:rect.top+y,pointerType:'mouse',pressure:.5}).world;
 const o=at(0,0),u=at(1,0),v=at(0,1),a=u.x-o.x,b=v.x-o.x,c=u.y-o.y,d=v.y-o.y,det=a*d-b*c;
 if(!Number.isFinite(det)||Math.abs(det)<1e-15)return null;
 return[d/det,-c/det,-b/det,a/det,(b*o.y-d*o.x)/det,(c*o.x-a*o.y)/det];
}
const matrixAttr=m=>'matrix('+m.join(' ')+')';
const edges=d=>'<path class="completion-edge-dark" d="'+d+'"/><path class="completion-edge-light" d="'+d+'"/>';

export function mountCompletionOverlay(host,session,signal){
 const app=host.app,canvas=app.el.canvas,svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.classList.add('completion-overlay');svg.setAttribute('aria-hidden','true');document.body.append(svg);
 let frame=0,disposed=false,cachedMask=null,cachedImage='',cachedOutline='';
 function maskImage(mask){
  if(mask===cachedMask)return;
  cachedMask=mask;cachedOutline=selectionOutline(mask);
  const c=document.createElement('canvas');c.width=mask.width;c.height=mask.height;
  const ctx=c.getContext('2d'),data=ctx.createImageData(c.width,c.height);
  const swatch=document.createElement('canvas').getContext('2d');swatch.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--accent')||'Highlight';swatch.fillRect(0,0,1,1);const rgb=swatch.getImageData(0,0,1,1).data;
  for(let i=0;i<mask.alpha.length;i++){const j=i*4;data.data[j]=rgb[0];data.data[j+1]=rgb[1];data.data[j+2]=rgb[2];data.data[j+3]=Math.round(mask.alpha[i]*.24);}
  ctx.putImageData(data,0,0);cachedImage=c.toDataURL('image/png');
 }
 function draw(){
  frame=0;if(disposed)return;
  const rect=canvas.getBoundingClientRect(),view=nativeViewportMatrix(app,rect);
  if(!view||!host.getSnapshot().docs.length||rect.width<=0||rect.height<=0){svg.innerHTML='';return}
  Object.assign(svg.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});svg.setAttribute('viewBox','0 0 '+rect.width+' '+rect.height);
  const rt=session.runtime,mask=rt?.rasterSelection?.(),preview=rt?.rasterSelectionPreview?.(),found=app.selectedObjects?.()[0];let html='';
  if(!mask){cachedMask=null;cachedImage='';cachedOutline='';}
  if(found&&(mask||preview)){
   const o=found.object,w=mask?.width||preview.width,h=mask?.height||preview.height;
   const transform=M.multiply(view,M.multiply(found.worldMatrix||o.matrix,[o.w/w,0,0,o.h/h,0,0]));
   let content='';
   if(mask){maskImage(mask);content+='<image width="'+w+'" height="'+h+'" href="'+cachedImage+'"/>'+edges(cachedOutline);}
   if(preview){const x=Math.min(preview.start.x,preview.current.x),y=Math.min(preview.start.y,preview.current.y),ww=Math.abs(preview.start.x-preview.current.x),hh=Math.abs(preview.start.y-preview.current.y);content+=preview.ellipse?'<ellipse class="completion-preview" cx="'+(x+ww/2)+'" cy="'+(y+hh/2)+'" rx="'+ww/2+'" ry="'+hh/2+'"/>':'<rect class="completion-preview" x="'+x+'" y="'+y+'" width="'+ww+'" height="'+hh+'"/>';}
   html+='<g transform="'+matrixAttr(transform)+'">'+content+'</g>';
  }
  const draft=session.draft();
  if(draft.pen){
   const anchors=draft.pen.path.subpaths[0].anchors.map(a=>{const p=M.point(view,a);return{...a,...p,in:{x:view[0]*a.in.x+view[2]*a.in.y,y:view[1]*a.in.x+view[3]*a.in.y},out:{x:view[0]*a.out.x+view[2]*a.out.y,y:view[1]*a.out.x+view[3]*a.out.y}}});
   html+='<path class="completion-preview" d="'+pathData({subpaths:[{closed:false,anchors}]})+'"/>';
   if(anchors.length&&draft.cursor&&!draft.dragging){const p=M.point(view,draft.cursor),last=anchors.at(-1);html+='<path class="completion-preview" d="M'+last.x+' '+last.y+'L'+p.x+' '+p.y+'"/>';}
   for(const a of anchors){for(const side of ['in','out']){const v=a[side];if(v.x||v.y)html+='<path class="completion-handle" d="M'+a.x+' '+a.y+'L'+(a.x+v.x)+' '+(a.y+v.y)+'"/><circle class="completion-anchor" r="2" cx="'+(a.x+v.x)+'" cy="'+(a.y+v.y)+'"/>';}html+='<circle class="completion-anchor" r="3" cx="'+a.x+'" cy="'+a.y+'"/>';}
  }
  svg.innerHTML=html;
 }
 const schedule=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(draw)};
 const resize=new ResizeObserver(schedule);resize.observe(canvas);window.addEventListener('resize',schedule,{signal});window.addEventListener('scroll',schedule,{capture:true,signal});
 signal.addEventListener('abort',()=>{disposed=true;resize.disconnect();if(frame)cancelAnimationFrame(frame);svg.remove()},{once:true});schedule();
 return{schedule};
}
