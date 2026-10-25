import {lifecycle,drag} from '../shared-controls.js';
const clamp=n=>Math.max(0,Math.min(1,n));
export function hsv(h,s,v){
 h=((h%360)+360)%360;s=clamp(s);v=clamp(v);
 const c=v*s,x=c*(1-Math.abs(h/60%2-1)),m=v-c;
 const a=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
 return '#'+a.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('');
}
export function hexToHsv(hex,fallbackHue=0){
 const m=/^#([0-9a-f]{6})$/i.exec(hex||'');
 if(!m)return {h:fallbackHue,s:0,v:0};
 const n=parseInt(m[1],16),rr=((n>>16)&255)/255,g=((n>>8)&255)/255,b=(n&255)/255,max=Math.max(rr,g,b),min=Math.min(rr,g,b),d=max-min;
 let h=fallbackHue;
 if(d)h=max===rr?60*(((g-b)/d+6)%6):max===g?60*((b-rr)/d+2):60*((rr-g)/d+4);
 return {h,s:max===0?0:d/max,v:max};
}
let preferredHue=0; // Preview memory only; Native paint remains canonical.
export default lifecycle('color',s=>{
 const c=hexToHsv(s.paint.foreground,preferredHue),available=!!s.capabilities?.foreground;
 if(c.s>0)preferredHue=c.h;
 const hue=Math.round(c.h),enabled=available?'':' disabled';
 return '<div class="ps-color-visual-row" aria-label="顏色">' +
  '<div class="ps-color-chips"><div class="panel-color-chips">' +
  '<input type="color" aria-label="Background" title="背景色" value="'+s.paint.background+'"'+(s.capabilities?.background?'':' disabled')+'>' +
  '<input type="color" aria-label="Foreground" title="前景色" value="'+s.paint.foreground+'"'+enabled+'></div></div>' +
  '<div class="ps-native-color-gradient"><div class="color-plane" role="group" tabindex="'+(available?0:-1)+'" aria-disabled="'+(!available)+'" aria-label="Color spectrum saturation and value" aria-description="左右調整飽和度，上下調整明度"><span class="color-plane-marker" aria-hidden="true"></span></div>' +
  '<div class="ps-native-hue" role="slider" tabindex="'+(available?0:-1)+'" aria-disabled="'+(!available)+'" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="360" aria-valuenow="'+hue+'" aria-label="Hue" title="拖曳色相箭頭或色條"><span class="ps-native-hue-indicator" aria-hidden="true"></span></div></div></div>';
},(r,h,signal)=>{
 const available=!!h.getSnapshot().capabilities?.foreground;
 const plane=r.querySelector('.color-plane'),point=r.querySelector('.color-plane-marker'),track=r.querySelector('.ps-native-hue'),indicator=track.querySelector('.ps-native-hue-indicator');
 const initial=hexToHsv(h.getSnapshot().paint.foreground,preferredHue);
 let pending=null,previewHue=initial.h;
 const patch=color=>h.dispatch({type:'paint.patch',patch:{foreground:color},source:'color'});
 const current=()=>hexToHsv(h.getSnapshot().paint.foreground,preferredHue);
 function updateHue(hue){previewHue=((hue%360)+360)%360;preferredHue=previewHue;plane.style.setProperty('--hue','hsl('+previewHue+' 100% 50%)');const height=track.getBoundingClientRect().height,indicatorHalf=indicator.getBoundingClientRect().height/2||8.5;indicator.style.top=height>0?(Math.min(indicatorHalf,height/2)+(1-previewHue/360)*Math.max(0,height-2*indicatorHalf))+'px':((1-previewHue/360)*100)+'%';track.setAttribute('aria-valuenow',String(Math.round(previewHue)));}
 function preview(s,v,color){pending=color;point.style.left=(s*100)+'%';point.style.top=((1-v)*100)+'%';point.style.background=color;const input=r.querySelector('[aria-label="Foreground"]');if(input)input.value=color;}
 function commitPending(){if(pending){const color=pending;pending=null;patch(color)}}
 updateHue(initial.h);
 preview(initial.s,initial.v,h.getSnapshot().paint.foreground);
 pending=null;
 r.addEventListener('change',e=>{
  const kind=e.target.getAttribute('aria-label');if(kind!=='Foreground'&&kind!=='Background')return;
  const color=String(e.target.value).trim().toLowerCase();if(!/^#[0-9a-f]{6}$/.test(color))return;
  if(kind==='Background'&&h.getSnapshot().capabilities?.background)h.dispatch({type:'paint.patch',patch:{background:color},source:'color'});
  else if(kind==='Foreground'&&available)patch(color);
 },{signal});
 if(available){
  drag(plane,(e,b)=>{const s=clamp((e.clientX-b.left)/b.width),v=1-clamp((e.clientY-b.top)/b.height);preview(s,v,hsv(previewHue,s,v));},commitPending,signal);
  // The indicator extends left of the hue strip, but is a child: pointer capture
  // on the shared track makes both direct-indicator and strip drags work.
  drag(track,(e,b)=>{const hue=Math.round(360*(1-clamp((e.clientY-b.top)/b.height))),c=current();updateHue(hue);preview(c.s,c.v,hsv(previewHue,c.s,c.v));},commitPending,signal);
 }
 plane.addEventListener('keydown',e=>{
  if(!available||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
  e.preventDefault();const c=current(),step=e.shiftKey ? 0.1 : 0.01;
  const s=clamp(c.s+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0)),v=clamp(c.v+(e.key==='ArrowUp'?step:e.key==='ArrowDown'?-step:0));
  patch(hsv(c.h,s,v));
 },{signal});
 track.addEventListener('keydown',e=>{
  if(!available||!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
  e.preventDefault();const c=current();
  const n=e.key==='Home'?0:e.key==='End'?360:Math.max(0,Math.min(360,Math.round(previewHue)+(e.key==='ArrowUp'?1:-1)*(e.shiftKey?10:1)));
  updateHue(n);patch(hsv(n,c.s,c.v));
 },{signal});
});
