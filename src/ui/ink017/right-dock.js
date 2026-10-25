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
 const groups=[['navigator','swatches','color'],['character','paragraph','brushes','adjustments'],['layers','history','paths']];
 const labels={navigator:'導覽器',color:'顏色',swatches:'色票',character:'字元',paragraph:'段落',brushes:'筆刷',adjustments:'調整',layers:'圖層',history:'步驟記錄',paths:'路徑'};
 const active=['navigator','character','layers'];let expandedZone=null;const abort=new AbortController();
 // Photoshop geometry: one tab line in each of three stacks; the trailing menu belongs to the active panel.
 // Only the existing real expand/restore action is offered in the first menu; other PS commands follow later.
 root.innerHTML=groups.map((g,i)=>`<section class='dock-zone' data-zone='${i}'><div class='tab-row' role='tablist' aria-label='${['顏色與檢視','文字與調整','文件'][i]}'>${g.map(k=>`<button type='button' class='tab' id='tab-${k}' role='tab' aria-controls='panel-${k}' data-tab='${k}' aria-label='${labels[k]}' title='${labels[k]}'>${labels[k]}</button>`).join('')}<button type='button' class='panel-menu-trigger' data-panel-menu='${i}' aria-haspopup='menu' aria-expanded='false' aria-controls='dock-panel-menu-${i}' aria-label='${labels[active[i]]}面板選單' title='${labels[active[i]]}面板選單'><span class='ps-menu-four-bars' aria-hidden='true'></span></button></div><div class='panel-menu' id='dock-panel-menu-${i}' role='menu' aria-label='${labels[active[i]]}面板選單' hidden><button type='button' class='panel-menu-action' role='menuitem' data-expand='${i}' aria-expanded='false'>展開${labels[active[i]]}面板區</button><span class='panel-menu-note'>其餘面板選項後續補齊</span></div><div class='panel-host' role='tabpanel'></div></section>${i<2?`<div class='zone-splitter' role='separator' tabindex='0' aria-label='Resize dock zone ${i+1}' aria-orientation='horizontal' data-split='${i}'></div>`:''}`).join('');
 function activate(k){const i=groups.findIndex(g=>g.includes(k));if(i<0)return;const zone=root.querySelector(`[data-zone="${i}"]`),panel=zone.querySelector('.panel-host');if(active[i]===k&&panel.dataset.panel===k)return;modules[active[i]].unmount();active[i]=k;panel.id='panel-'+k;panel.dataset.panel=k;panel.setAttribute('aria-labelledby','tab-'+k);zone.querySelectorAll('[data-tab]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.tab===k));b.tabIndex=b.dataset.tab===k?0:-1});modules[k].mount(panel,host);zone.querySelector('[data-tab="'+k+'"]')?.scrollIntoView({block:'nearest',inline:'nearest'});const menu=zone.querySelector('.panel-menu'),trigger=zone.querySelector('[data-panel-menu]');if(menu)menu.setAttribute('aria-label',labels[k]+'面板選單');if(trigger){trigger.setAttribute('aria-label',labels[k]+'面板選單');trigger.title=labels[k]+'面板選單'}const action=zone.querySelector('[data-expand]');if(action)action.textContent=expandedZone===i?'還原三區':'展開'+labels[k]+'面板區'}
 function closePanelMenus(){root.querySelectorAll('[data-panel-menu]').forEach(button=>button.setAttribute('aria-expanded','false'));root.querySelectorAll('.panel-menu').forEach(menu=>{menu.hidden=true})}
 root.addEventListener('click',e=>{
  const trigger=e.target.closest('[data-panel-menu]'),expand=e.target.closest('[data-expand]'),tab=e.target.closest('[data-tab]');
  if(trigger&&root.contains(trigger)){const menu=root.querySelector('#dock-panel-menu-'+trigger.dataset.panelMenu),open=!!menu&&!menu.hidden;closePanelMenus();if(menu&&!open){menu.hidden=false;trigger.setAttribute('aria-expanded','true');menu.querySelector('[data-expand]')?.focus()}return}
  if(expand&&root.contains(expand)){const i=Number(expand.dataset.expand);expandedZone=expandedZone===i?null:i;root.dataset.expanded=expandedZone===null?'':String(expandedZone);root.querySelectorAll('[data-expand]').forEach(b=>{const same=Number(b.dataset.expand)===expandedZone;b.setAttribute('aria-expanded',String(same));b.textContent=same?'還原三區':'展開'+labels[active[Number(b.dataset.expand)]]+'面板區'});closePanelMenus();root.querySelector('[data-zone="'+i+'"] [data-panel-menu]')?.focus();return}
  if(tab&&root.contains(tab)){if(performance.now()<suppressTabClickUntil)return;closePanelMenus();activate(tab.dataset.tab);return}
  closePanelMenus()
 },{signal:abort.signal});
 root.addEventListener('keydown',e=>{if(e.key!=='Escape'||!root.querySelector('.panel-menu:not([hidden])'))return;e.preventDefault();const open=root.querySelector('[data-panel-menu][aria-expanded="true"]');closePanelMenus();open?.focus()},{signal:abort.signal});
 document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))closePanelMenus()},{signal:abort.signal});

 let tabGrab=null,suppressTabClickUntil=0;
 function resetTabDrag(){root.querySelectorAll('.tab-drag-source,.tab-drop-before,.tab-drop-after').forEach(b=>{b.classList.remove('tab-drag-source','tab-drop-before','tab-drop-after');b.style.transform='';});}
 function reorder(tab,target,before){if(!target||!tab||target===tab||target.closest('.tab-row')!==tab.closest('.tab-row'))return;target[before?'before':'after'](tab);tab.focus();}
 root.addEventListener('pointerdown',e=>{const t=e.target.closest('[data-tab]');if(!t||e.button!==0||!root.contains(t))return;tabGrab={tab:t,row:t.closest('.tab-row'),id:e.pointerId,x:e.clientX,active:false,target:null,before:true};t.setPointerCapture(e.pointerId);},{signal:abort.signal});
 root.addEventListener('pointermove',e=>{const g=tabGrab;if(!g||e.pointerId!==g.id)return;const dx=e.clientX-g.x;if(!g.active&&Math.abs(dx)<5)return;g.active=true;resetTabDrag();g.tab.classList.add('tab-drag-source');g.tab.style.transform='translate3d('+dx+'px,0px,0px)';const peers=[...g.row.querySelectorAll('[data-tab]')].filter(t=>t!==g.tab);let choice=null,dist=Infinity;for(const t of peers){const r=t.getBoundingClientRect(),delta=Math.abs(e.clientX-(r.left+r.width/2));if(delta<dist){dist=delta;choice=t;}}g.target=choice;if(choice){const b=choice.getBoundingClientRect();g.before=e.clientX<b.left+b.width/2;choice.classList.add(g.before?'tab-drop-before':'tab-drop-after');}},{signal:abort.signal});
 function tabDrop(e){const g=tabGrab;if(!g||e.pointerId!==g.id)return;tabGrab=null;resetTabDrag();if(g.active){reorder(g.tab,g.target,g.before);suppressTabClickUntil=performance.now()+250;}if(g.tab.hasPointerCapture(e.pointerId))g.tab.releasePointerCapture(e.pointerId);}
 root.addEventListener('pointerup',tabDrop,{signal:abort.signal});
 root.addEventListener('pointercancel',e=>{if(tabGrab?.id===e.pointerId){tabGrab=null;resetTabDrag();}},{signal:abort.signal});
 root.addEventListener('keydown',e=>{if(!e.altKey||!['ArrowLeft','ArrowRight'].includes(e.key))return;const tab=e.target.closest('[data-tab]');if(!tab)return;const a=[...tab.closest('.tab-row').querySelectorAll('[data-tab]')],i=a.indexOf(tab),j=i+(e.key==='ArrowRight'?1:-1);if(i<0||j<0||j>=a.length)return;e.preventDefault();reorder(tab,a[j],e.key==='ArrowLeft');},{signal:abort.signal});

 root.addEventListener('keydown',e=>{if(e.altKey)return;const b=e.target.closest('[data-tab]');if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const zone=b.closest('.dock-zone');if(!zone)return;const tabs=[...zone.querySelectorAll('[data-tab]')].filter(t=>getComputedStyle(t).display!=='none'&&!t.disabled);const n=tabs.indexOf(b);if(n<0||!tabs.length)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(n+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;const k=tabs[next].dataset.tab;activate(k);tabs[next].focus()},{signal:abort.signal});
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

