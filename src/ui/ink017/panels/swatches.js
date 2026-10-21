import {lifecycle,esc} from '../shared-controls.js';
// UI-only disclosure state; swatch colors and selection remain Native-owned.
let recentExpanded=true;
export default lifecycle('swatches',s=>{
 const recent=s.swatches?.find(g=>g.id==='recent')?.colors||[];
 const colors=recent.filter(c=>/^#[0-9a-f]{6}$/i.test(c));
 return `<div class="swatch-groups"><section class="swatch-group"><button type="button" class="swatch-group-toggle" data-swatch-disclosure aria-expanded="${recentExpanded}" aria-controls="swatch-recent-grid"><span class="swatch-disclosure" aria-hidden="true"></span><span>Recent colors</span><span class="swatch-count">${colors.length}</span></button><div class="swatch-grid" id="swatch-recent-grid" ${recentExpanded?'':'hidden'}>${colors.map(c=>`<button type="button" class="chip" data-color="${esc(c)}" aria-label="Set foreground to ${esc(c)}" title="${esc(c)}" aria-pressed="${s.paint?.foreground?.toLowerCase()===c.toLowerCase()}" ${s.capabilities?.foreground?'':'disabled'}></button>`).join('')||'<p class="capability-empty">No recent colors</p>'}</div></section></div>`;
},(r,h,signal,repaint)=>{
 r.querySelectorAll('[data-color]').forEach(b=>b.style.background=b.dataset.color);
 r.addEventListener('click',e=>{
  const disclosure=e.target.closest('[data-swatch-disclosure]');
  if(disclosure){recentExpanded=!recentExpanded;repaint();return}
  const b=e.target.closest('[data-color]');
  if(b&&!b.disabled)h.dispatch({type:'paint.patch',patch:{foreground:b.dataset.color},source:'swatches'});
 },{signal});
});
