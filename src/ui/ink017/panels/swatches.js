import {lifecycle,esc} from '../shared-controls.js';
// UI-only disclosure state; swatch colors and selection remain Native-owned.
let recentExpanded=true;
// These preset RGB UI swatches reproduce the observed PS-色票段落.png palette colors.
// They are real foreground-color choices; they do not claim to persist Photoshop CMYK modes.
const psNeutral=['#ffffff','#eeeeee','#dddddd','#cccccc','#bbbbbb','#aaaaaa','#999999','#777777','#555555','#333333','#111111','#000000','#cee1f2','#dbe8f3'];
const psCMYK24=['#e50313','#eb6007','#f29700','#fbc600','#ffef00','#ceda00','#8ec227','#1fab3b','#009845','#009a6b','#009d96','#009fc0','#00a0e7','#0086d0','#0068b5','#00479b','#1f2186','#601b84','#920c82','#be007f','#e4007d','#e40068','#e5004f','#e50032'];
let presetExpanded={rgb:false,cmyk:true};

export default lifecycle('swatches',s=>{
 const recent=s.swatches?.find(g=>g.id==='recent')?.colors||[];
 const colors=recent.filter(c=>/^#[0-9a-f]{6}$/i.test(c));
 const presetGrid=(colors)=>colors.map(c=>`<button type="button" class="chip" data-color="${c}" aria-label="Set foreground to ${c}" title="${c}" aria-pressed="${s.paint?.foreground?.toLowerCase()===c}" ${s.capabilities?.foreground?'':'disabled'}></button>`).join('');
 return `<div class="swatch-groups ps-swatches"><div class="ps-swatches-quick" aria-label="基本色票">${presetGrid(psNeutral)}</div>
 <section class="swatch-group"><button type="button" class="swatch-group-toggle" data-swatch-disclosure data-swatch-preset-toggle="rgb" aria-expanded="${presetExpanded.rgb}"><span class="swatch-disclosure" aria-hidden="true"></span><span>RGB</span></button><div class="swatch-grid" ${presetExpanded.rgb?'':'hidden'}>${presetGrid(psNeutral)}</div></section>
 <section class="swatch-group"><button type="button" class="swatch-group-toggle" data-swatch-disclosure data-swatch-preset-toggle="cmyk" aria-expanded="${presetExpanded.cmyk}"><span class="swatch-disclosure" aria-hidden="true"></span><span>CMYK-24</span></button><div class="swatch-grid" ${presetExpanded.cmyk?'':'hidden'}>${presetGrid(psCMYK24)}</div></section>
 <section class="swatch-group"><button type="button" class="swatch-group-toggle" data-swatch-disclosure aria-expanded="${recentExpanded}" aria-controls="swatch-recent-grid"><span class="swatch-disclosure" aria-hidden="true"></span><span>Recent colors</span><span class="swatch-count">${colors.length}</span></button><div class="swatch-grid" id="swatch-recent-grid" ${recentExpanded?'':'hidden'}>${colors.map(c=>`<button type="button" class="chip" data-color="${esc(c)}" aria-label="Set foreground to ${esc(c)}" title="${esc(c)}" aria-pressed="${s.paint?.foreground?.toLowerCase()===c.toLowerCase()}" ${s.capabilities?.foreground?'':'disabled'}></button>`).join('')||'<p class="capability-empty">No recent colors</p>'}</div></section></div>`;
},(r,h,signal,repaint)=>{
 r.querySelectorAll('[data-color]').forEach(b=>b.style.background=b.dataset.color);
 r.addEventListener('click',e=>{
  const disclosure=e.target.closest('[data-swatch-disclosure]');
  if(disclosure){const key=disclosure.dataset.swatchPresetToggle;if(key)presetExpanded[key]=!presetExpanded[key];else recentExpanded=!recentExpanded;repaint();return}
  const b=e.target.closest('[data-color]');
  if(b&&!b.disabled)h.dispatch({type:'paint.patch',patch:{foreground:b.dataset.color},source:'swatches'});
 },{signal});
});
