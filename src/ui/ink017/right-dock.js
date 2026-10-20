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
import {drag} from './shared-controls.js';
export function mountDock(root,host){
 const modules={navigator,color,swatches,adjustments,character,paragraph,layers,history,brushes,paths};
 const groups=[['navigator','color','swatches'],['character','paragraph','brushes','adjustments'],['layers','history','paths']];
 const active=['navigator','character','layers'];let expandedZone=null;const abort=new AbortController();
 root.innerHTML=groups.map((g,i)=>`<section class="dock-zone" data-zone="${i}"><div class="tab-row" role="tablist" aria-label="${['Color and view','Selection','Document'][i]}">${g.map(k=>`<button class="tab" id="tab-${k}" role="tab" aria-controls="panel-${k}" data-tab="${k}" aria-label="${k[0].toUpperCase()+k.slice(1)}" title="${k[0].toUpperCase()+k.slice(1)}">${k==='adjustments'?'Adjust':k[0].toUpperCase()+k.slice(1)}</button>`).join('')}<button class="zone-expand" data-expand="${i}" aria-label="Expand ${['Color and view','Selection','Document'][i]} panel" aria-expanded="false" title="Expand panel">↕</button></div><div class="panel-host" role="tabpanel"></div></section>${i<2?`<div class="zone-splitter" role="separator" tabindex="0" aria-label="Resize dock zone ${i+1}" aria-orientation="horizontal" data-split="${i}"></div>`:''}`).join('');
 function activate(k){const i=groups.findIndex(g=>g.includes(k));if(i<0)return;modules[active[i]].unmount();active[i]=k;const zone=root.querySelector(`[data-zone="${i}"]`),panel=zone.querySelector('.panel-host');panel.id='panel-'+k;panel.dataset.panel=k;panel.setAttribute('aria-labelledby','tab-'+k);zone.querySelectorAll('[data-tab]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.tab===k));b.tabIndex=b.dataset.tab===k?0:-1});modules[k].mount(panel,host);zone.querySelector('[data-tab="'+k+'"]')?.scrollIntoView({block:'nearest',inline:'nearest'})}
 root.addEventListener('click',e=>{if(e.target.dataset.expand!==undefined){const i=Number(e.target.dataset.expand);expandedZone=expandedZone===i?null:i;root.dataset.expanded=expandedZone===null?'':String(expandedZone);root.querySelectorAll('[data-expand]').forEach(b=>{b.setAttribute('aria-expanded',String(Number(b.dataset.expand)===expandedZone));b.title=Number(b.dataset.expand)===expandedZone?'Restore three panels':'Expand panel'})}if(e.target.dataset.tab)activate(e.target.dataset.tab)},{signal:abort.signal});
 root.addEventListener('keydown',e=>{const b=e.target.closest('[data-tab]');if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const zone=b.closest('.dock-zone');if(!zone)return;const tabs=[...zone.querySelectorAll('[data-tab]')].filter(t=>getComputedStyle(t).display!=='none'&&!t.disabled);const n=tabs.indexOf(b);if(n<0||!tabs.length)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(n+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;const k=tabs[next].dataset.tab;activate(k);tabs[next].focus()},{signal:abort.signal});
 root.querySelectorAll('[data-split]').forEach(el=>{let start;drag(el,e=>{if(!start)start={y:e.clientY,top:root.querySelector('[data-zone="0"]').offsetHeight,mid:root.querySelector('[data-zone="1"]').offsetHeight};const n=Number(el.dataset.split),value=Math.max(n===0?168:96,Math.min(root.clientHeight-240,(n===0?start.top:start.mid)+e.clientY-start.y));root.style.setProperty(n===0?'--zone-top':'--zone-middle',value+'px')},()=>{start=null},abort.signal);el.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const n=Number(el.dataset.split),zone=root.querySelector(`[data-zone="${n}"]`);root.style.setProperty(n===0?'--zone-top':'--zone-middle',Math.max(n===0?168:96,Math.min(root.clientHeight-240,zone.offsetHeight+(e.key==='ArrowDown'?8:-8)))+'px')}},{signal:abort.signal})});active.slice().forEach(activate);
 return {activate,unmount(){abort.abort();Object.values(modules).forEach(m=>m.unmount());root.replaceChildren()}};
}

