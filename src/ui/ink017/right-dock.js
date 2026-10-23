import navigator from './panels/navigator.js';
import color from './panels/color.js';
import swatches from './panels/swatches.js';
import adjustments from './panels/adjustments.js';
import character from './panels/character.js';
import paragraph from './panels/paragraph.js';
import layers from './panels/layers.js';
import history from './panels/history.js';
import brushes from './panels/brushes.js';
import paths from './panels/paths.js';
import {drag,icon} from './shared-controls.js';
export function mountDock(root,host){
 const modules={navigator,color,swatches,adjustments,character,paragraph,layers,history,brushes,paths};
 const groups=[['navigator','color','swatches'],['character','paragraph','brushes','adjustments'],['layers','history','paths']];
 const labels={navigator:'Navigator',color:'Color',swatches:'Swatches',character:'Character',paragraph:'Paragraph',brushes:'Brushes',adjustments:'Adjustments',layers:'Layers',history:'History',paths:'Paths'};const active=['navigator','character','layers'];let expandedZone=null;const abort=new AbortController();
 root.innerHTML=groups.map((g,i)=>`<section class="dock-zone" data-zone="${i}"><div class="tab-row" role="tablist" aria-label="${['Color and view','Selection','Document'][i]}">${g.map(k=>`<button class="tab" id="tab-${k}" role="tab" aria-controls="panel-${k}" data-tab="${k}" aria-label="${k[0].toUpperCase()+k.slice(1)}" title="${k[0].toUpperCase()+k.slice(1)}">${labels[k]}</button>`).join('')}<button class="zone-expand" data-expand="${i}" aria-label="Expand ${['Color and view','Selection','Document'][i]} panel" aria-expanded="false" title="Expand panel">${icon('expand')}</button></div><div class="panel-host" role="tabpanel"></div></section>${i<2?`<div class="zone-splitter" role="separator" tabindex="0" aria-label="Resize dock zone ${i+1}" aria-orientation="horizontal" data-split="${i}"></div>`:''}`).join('');
 function activate(k){const i=groups.findIndex(g=>g.includes(k));if(i<0)return;const zone=root.querySelector(`[data-zone="${i}"]`),panel=zone.querySelector('.panel-host');if(active[i]===k&&panel.dataset.panel===k)return;modules[active[i]].unmount();active[i]=k;panel.id='panel-'+k;panel.dataset.panel=k;panel.setAttribute('aria-labelledby','tab-'+k);zone.querySelectorAll('[data-tab]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.tab===k));b.tabIndex=b.dataset.tab===k?0:-1});modules[k].mount(panel,host);zone.querySelector('[data-tab="'+k+'"]')?.scrollIntoView({block:'nearest',inline:'nearest'})}
 root.addEventListener('click',e=>{const expand=e.target.closest('[data-expand]'),tab=e.target.closest('[data-tab]');if(expand&&root.contains(expand)){const i=Number(expand.dataset.expand);expandedZone=expandedZone===i?null:i;root.dataset.expanded=expandedZone===null?'':String(expandedZone);root.querySelectorAll('[data-expand]').forEach(b=>{b.setAttribute('aria-expanded',String(Number(b.dataset.expand)===expandedZone));b.title=Number(b.dataset.expand)===expandedZone?'Restore three panels':'Expand panel'})}if(tab&&root.contains(tab))activate(tab.dataset.tab)},{signal:abort.signal});
 root.addEventListener('keydown',e=>{const b=e.target.closest('[data-tab]');if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const zone=b.closest('.dock-zone');if(!zone)return;const tabs=[...zone.querySelectorAll('[data-tab]')].filter(t=>getComputedStyle(t).display!=='none'&&!t.disabled);const n=tabs.indexOf(b);if(n<0||!tabs.length)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(n+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;const k=tabs[next].dataset.tab;activate(k);tabs[next].focus()},{signal:abort.signal});
 const zoneHeights=()=>[...root.querySelectorAll('.dock-zone')].map(z=>z.getBoundingClientRect().height);
 const minZone=[168,96,104];
 function resizeSplit(n,heights,delta){
  if(expandedZone!==null)return;
  // A separator redistributes only its two adjoining regions.
  const pair=heights[n]+heights[n+1],lo=minZone[n],hi=pair-minZone[n+1];
  if(hi<lo)return;
  const next=Math.max(lo,Math.min(hi,heights[n]+delta));
  if(n===0){
   root.style.setProperty('--zone-top',next+'px');
   root.style.setProperty('--zone-middle',(pair-next)+'px');
  }else root.style.setProperty('--zone-middle',next+'px');
  root.querySelector('[data-split="'+n+'"]')?.setAttribute('aria-valuenow',String(Math.round(100*next/pair)));
 }
 root.querySelectorAll('[data-split]').forEach(el=>{
  const n=Number(el.dataset.split);let start=null;
  drag(el,e=>{
   if(!start)start={y:e.clientY,heights:zoneHeights()};
   resizeSplit(n,start.heights,e.clientY-start.y);
  },()=>{start=null},abort.signal);
  el.addEventListener('keydown',e=>{
   if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key)||expandedZone!==null)return;
   e.preventDefault();
   const heights=zoneHeights(),pair=heights[n]+heights[n+1];
   const next=e.key==='Home'?minZone[n]:e.key==='End'?pair-minZone[n+1]:heights[n]+(e.key==='ArrowDown'?8:-8);
   resizeSplit(n,heights,next-heights[n]);
  },{signal:abort.signal});
 });
active.slice().forEach(activate);
 return {activate,unmount(){abort.abort();Object.values(modules).forEach(m=>m.unmount());root.replaceChildren()}};
}

