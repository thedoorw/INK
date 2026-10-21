import {lifecycle,activeDoc,esc} from '../shared-controls.js';
import {NAVIGATOR_ZOOM_MIN,NAVIGATOR_ZOOM_MAX,NAVIGATOR_SLIDER_MAX,navigatorZoomFromPosition,navigatorPositionFromZoom,navigatorZoomText} from './navigator-zoom-curve.mjs';

export default lifecycle('navigator',(s,h)=>{
 const d=activeDoc(s),preview=d?h.select('page.preview',{width:220,height:150}):null;
 const zoom=d?d.camera.zoom:100;
 const position=navigatorPositionFromZoom(zoom);
 const displayedZoom=navigatorZoomText(zoom);
 return `<div class="navigator-preview ${preview?'':'empty-preview'}" aria-label="Document preview">${preview?.dataUrl?`<img src="${esc(preview.dataUrl)}" alt="Current document preview">`:d?'Preview unavailable':'No document'}</div><div class="navigator-controls"><label class="navigator-zoom-field"><input type="number" aria-label="Zoom percent" title="Zoom percent" min="${NAVIGATOR_ZOOM_MIN}" max="${NAVIGATOR_ZOOM_MAX}" step="any" value="${displayedZoom}" ${d?'':'disabled'}><span aria-hidden="true">%</span></label><button data-zoom="minus" aria-label="Zoom out" ${d?'':'disabled'}>−</button><input class="shared-slider" type="range" aria-label="Navigator zoom" aria-valuetext="${displayedZoom}%" min="0" max="${NAVIGATOR_SLIDER_MAX}" step="1" value="${position}" ${d?'':'disabled'}><button data-zoom="plus" aria-label="Zoom in" ${d?'':'disabled'}>+</button></div><div class="navigator-actions"><button data-zoom="fit" ${d?'':'disabled'}>Fit content</button><button data-zoom="artboard" ${d?'':'disabled'}>Fit artboard</button><button data-zoom="actual" ${d?'':'disabled'}>100%</button></div>`;
},(r,h,signal,repaint)=>{
 const slider=r.querySelector('[aria-label="Navigator zoom"]');
 const number=r.querySelector('[aria-label="Zoom percent"]');
 let pendingZoom=null,frame=0;
 const commit=zoom=>h.dispatch({type:'camera.patch',patch:{zoom},source:'navigator'});
 const flush=()=>{
  if(frame){cancelAnimationFrame(frame);frame=0}
  if(pendingZoom===null)return;
  const zoom=pendingZoom;
  pendingZoom=null;
  commit(zoom);
 };
 const schedule=zoom=>{
  pendingZoom=zoom;
  if(frame)return;
  frame=requestAnimationFrame(()=>{frame=0;flush()});
 };
 const finish=()=>{
  if(r.dataset.navigatorScrubbing!=='true')return;
  flush();
  r.dataset.navigatorScrubbing='false';
  repaint();
 };
 // Native emits state changes while zooming. Keep the same range element alive
 // during pointer drag so the pointer stays captured, then repaint at release.
 slider.addEventListener('pointerdown',()=>{r.dataset.navigatorScrubbing='true'},{signal});
 slider.addEventListener('pointerup',finish,{signal});
 slider.addEventListener('pointercancel',finish,{signal});
 slider.addEventListener('input',()=>{
  const zoom=navigatorZoomFromPosition(slider.value);
  const percent=navigatorZoomText(zoom);
  number.value=percent;
  slider.setAttribute('aria-valuetext',percent+'%');
  schedule(zoom);
 },{signal});
 slider.addEventListener('change',()=>{
  flush();
  const zoom=navigatorZoomFromPosition(slider.value);
  const current=activeDoc(h.getSnapshot())?.camera.zoom;
  // Direct change (keyboard/automation) is a valid action even without a prior input.
  if(!Number.isFinite(current)||Math.abs(current-zoom)>0.0001)commit(zoom);
  finish();
 },{signal});
 signal.addEventListener('abort',()=>{if(frame)cancelAnimationFrame(frame);frame=0},{once:true});
 number.addEventListener('change',e=>{
  const value=Number(e.target.value);
  if(e.target.value===''||!Number.isFinite(value)||value<NAVIGATOR_ZOOM_MIN||value>NAVIGATOR_ZOOM_MAX){
   e.target.value=navigatorZoomText(activeDoc(h.getSnapshot())?.camera.zoom||100);
   return;
  }
  h.dispatch({type:'camera.patch',patch:{zoom:value},source:'navigator'});
 },{signal});
 r.addEventListener('click',e=>{
  const button=e.target.closest('[data-zoom]');
  if(!button||button.disabled)return;
  const key=button.dataset.zoom;
  if(key==='fit')h.execute('view.fit.content.v1');
  else if(key==='artboard')h.execute('view.fit.artboard.v1');
  else if(key==='actual')h.execute('view.zoom.set.v1',{scale:1});
  else if(key==='plus'||key==='minus')h.execute('view.zoom.by.v1',{factor:key==='plus'?1.2:1/1.2});
 },{signal});
},r=>r.dataset.navigatorScrubbing==='true');
