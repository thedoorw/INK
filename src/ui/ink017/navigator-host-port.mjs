// UI-only read/command adapter. Panels must not reach into the Native Renderer.
// The Renderer and camera remain owned by the existing INK app.
export function createNavigatorHostPort(renderer,dispatch){
 const read=({width,height,fitBounds,scale})=>{
  if(!renderer?.camera||!renderer?.screenToDisplayWorld||!(width>0&&height>0&&scale>0)||!fitBounds)return null;
  const camera=renderer.camera(),midpoint=[width/2,height/2];
  const origin={x:fitBounds.x+fitBounds.w/2,y:fitBounds.y+fitBounds.h/2};
  const corners=[[0,0],[renderer.width,0],[renderer.width,renderer.height],[0,renderer.height]];
  const projected=corners.map(([x,y])=>{
   const point=renderer.screenToDisplayWorld(x,y,camera,{left:0,top:0});
   return [midpoint[0]+(point.x-origin.x)*scale,midpoint[1]+(point.y-origin.y)*scale];
  });
  const left=(width-fitBounds.w*scale)/2,top=(height-fitBounds.h*scale)/2;
  const paper=[[left,top],[width-left,top],[width-left,height-top],[left,height-top]];
  const fullPage=paper.every(([x,y])=>projected.every(([ax,ay],i)=>{
   const [bx,by]=projected[(i+1)%projected.length];
   return (bx-ax)*(y-ay)-(by-ay)*(x-ax)>=-0.01;
  }));
  return fullPage?paper:projected;
 };
 const pan=({offsetX,offsetY,originX,originY,scale})=>{
  if(!renderer?.camera||!(scale>0)||![offsetX,offsetY,originX,originY].every(Number.isFinite))
   return {ok:false,error:{message:'Navigator viewport unavailable'}};
  const world={x:originX+offsetX/scale,y:originY+offsetY/scale},camera=renderer.camera();
  const cos=Math.cos(camera.rotation),sin=Math.sin(camera.rotation);
  const dx=-camera.x-(world.x*cos-world.y*sin)*camera.scale;
  const dy=-camera.y-(world.x*sin+world.y*cos)*camera.scale;
  return dispatch({type:'camera.patch',patch:{x:dx,y:dy},source:'navigator'});
 };
 return Object.freeze({read,pan});
}
