import {esc} from '../shared-controls.js';
import {mountToolbarCustomizer} from './toolbar-customizer.js';
import {UI_B_RASTER_TOOL_IDS} from '../../../../ui/capability-raster-tools.js';
import {TOOL_GROUPS,toolAvailability,activeToolContext,activateToolContext,rasterGeometryAvailable} from './registry.js';
import {renderDev1Options,mountDev1Options} from './dev1/options.js';
import {mountDev2SafetyGuard,dev2OptionsMarkup,mountDev2Options} from './dev2/index.mjs';
import {dev3OptionsMarkup,mountDev3Options} from './dev3/tools-context-dev3.mjs';
import {mountCompletionTools,completionOptionsMarkup,mountCompletionOptions} from './completion-tools.js';

// One Native Popover presenter for all tool groups. This replaces the former
// drawing-only presenter; Native tool/selection/raster owners remain unchanged.
export function mountToolsWorkbench(root,host,feedback,signal){
 const rail=root.querySelector('.tool-area'),bar=root.querySelector('.context-float');
 const identity=root.querySelector('#contextIdentity'),controls=root.querySelector('#contextControls'),toggle=root.querySelector('#contextToggle');
 const rt=host.app?.uiComposition?.rasterTools;
 let disposed=false,frame=0,mount=null,optionAbort=null,signature='',viewContext=null,lastNativeTool=host.getSnapshot().tool;
 let hold=null,suppressClick=false,opener=null,menuGroup=null;
 const remembered=new Map(),buttons=new Map();
 rail.innerHTML=TOOL_GROUPS.map(g=>'<div class="tool-cell'+(g.items.length>1?' tool-group-cell':'')+'"><button type="button" class="tool-button" data-group="'+g.id+'" aria-label="'+esc(g.label)+'"'+(g.items.length>1?' aria-haspopup="menu" aria-expanded="false" aria-controls="toolGroupMenu"':'')+'>'+g.items[0].icon+'</button></div>').join('');
 const menu=document.createElement('div');menu.id='toolGroupMenu';menu.className='drawing-tool-menu';menu.setAttribute('popover','manual');menu.setAttribute('role','menu');root.append(menu);
 for(const button of rail.querySelectorAll('[data-group]'))buttons.set(button.dataset.group,button);
 controls.innerHTML='<div id="contextToolOptions"></div><div id="transformControls" hidden></div>';
 const options=controls.querySelector('#contextToolOptions');
 bar.classList.add('tools-context');
 let expanded=false;
 const schedule=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(()=>{frame=0;render()})};
 const toolbarCustomization=mountToolbarCustomizer(root,TOOL_GROUPS,{signal,onLayoutChanged:schedule,feedback});
 const completion=mountCompletionTools(root,host,feedback,signal,schedule);
 // DEV2 guard is installed before any activation, using existing cancellation
 // owner. It intercepts unsafe canvas events even before owner notifications.
 const safety=rt?mountDev2SafetyGuard(host,{eventTarget:window,onStop:schedule}):null;
 const guardGeometry=event=>{
  if(!safety||!UI_B_RASTER_TOOL_IDS.has(rt?.activeTool?.())||rasterGeometryAvailable(host))return;
  const result=safety.disarm('HIDDEN_OR_INVALID_GEOMETRY');
  const canvas=host.app?.el?.canvas;
  if(event&&(event.target===canvas||event.composedPath?.().includes(canvas))){event.preventDefault();event.stopImmediatePropagation();}
  return result;
 };
 for(const name of ['pointerdown','pointermove','pointerup','pointercancel'])window.addEventListener(name,guardGeometry,{capture:true,signal});
 const clearHold=()=>{if(hold!==null)clearTimeout(hold);hold=null};
 const closeMenu=(restore=false)=>{if(menu.matches(':popover-open'))menu.hidePopover();opener?.setAttribute('aria-expanded','false');if(restore)opener?.focus();menuGroup=null};
 // An auto popover opened while a pointer is held can be light-dismissed by
 // that same outside pointer release. Keep one shared Native presenter, and
 // dismiss on the next outside press instead of consuming the opening gesture.
 window.addEventListener('pointerdown',event=>{if(menu.matches(':popover-open')&&!menu.contains(event.target)&&!opener?.contains(event.target))closeMenu()},{capture:true,signal});
 function position(pop,button){const box=button.getBoundingClientRect();pop.style.left=Math.min(Math.max(8,box.right+6),Math.max(8,innerWidth-190))+'px';pop.style.top=Math.max(8,box.top)+'px';}
 function openMenu(group,button,index=0){
  closeMenu();menuGroup=group;opener=button;
  menu.setAttribute('aria-label',group.label);
  const active=activeToolContext(host);
  menu.innerHTML=group.items.map(t=>{const a=toolAvailability(host,group,t);return '<button type="button" class="drawing-tool-option" role="menuitemradio" data-variant="'+t.id+'" aria-checked="'+String(active?.group.id===group.id&&active.item?.id===t.id)+'"'+(a.available?'':' disabled')+' title="'+esc(a.available?t.label:a.reason||'Unavailable')+'">'+t.icon+'<span>'+esc(t.label)+'</span></button>'}).join('');
  position(menu,button);menu.showPopover();menu.style.top=Math.min(parseFloat(menu.style.top),Math.max(8,innerHeight-menu.getBoundingClientRect().height-8))+'px';button.setAttribute('aria-expanded','true');
  const items=[...menu.querySelectorAll('button:not(:disabled)')];items[(index+items.length)%items.length]?.focus();
 }
 function disarm(){
  if(!UI_B_RASTER_TOOL_IDS.has(rt?.activeTool?.()))return;
  const result=rt.activate('select');if(result?.ok===false||UI_B_RASTER_TOOL_IDS.has(rt.activeTool?.()))throw Error('Finish the current raster interaction');
 }
 function choose(group,item){
  try{
   // A command-only context must not leave an unrelated raster brush armed.
   if(group.owner!==2)disarm();
   const result=activateToolContext(host,group,item);if(result?.ok===false)throw Error(result.error?.message||result.error||'Tool unavailable');
   remembered.set(group.id,item.id);
   viewContext=['crop','guide','zoom'].includes(group.id)?{group,item,identity:targetKey(),nativeTool:host.getSnapshot().tool}:null;
   lastNativeTool=host.getSnapshot().tool;signature='';schedule();
  }catch(error){feedback(error.message)}
 }
 const targetKey=()=>JSON.stringify(host.target());
 rail.addEventListener('click',event=>{const b=event.target.closest('[data-group]');if(!b)return;if(suppressClick){suppressClick=false;event.preventDefault();return}const g=TOOL_GROUPS.find(g=>g.id===b.dataset.group);choose(g,g.items.find(t=>t.id===remembered.get(g.id))||g.items.find(t=>toolAvailability(host,g,t).available)||g.items[0])},{signal});
 rail.addEventListener('contextmenu',event=>{const b=event.target.closest('[data-group]'),g=TOOL_GROUPS.find(g=>g.id===b?.dataset.group);if(g?.items.length>1){event.preventDefault();clearHold();openMenu(g,b)}},{signal});
 rail.addEventListener('pointerdown',event=>{const b=event.target.closest('[data-group]'),g=TOOL_GROUPS.find(g=>g.id===b?.dataset.group);if(event.button!==0||!g||g.items.length<2||b.disabled)return;clearHold();suppressClick=false;hold=setTimeout(()=>{hold=null;suppressClick=true;openMenu(g,b)},450)},{signal});
 for(const name of ['pointerup','pointercancel','pointerleave'])rail.addEventListener(name,clearHold,{signal});
 rail.addEventListener('keydown',event=>{const b=event.target.closest('[data-group]'),g=TOOL_GROUPS.find(g=>g.id===b?.dataset.group);if(g?.items.length>1&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openMenu(g,b,event.key==='ArrowUp'?-1:0)}},{signal});
 menu.addEventListener('click',event=>{const b=event.target.closest('[data-variant]');if(!b||b.disabled||!menuGroup)return;const g=menuGroup,item=g.items.find(t=>t.id===b.dataset.variant);closeMenu(true);choose(g,item)},{signal});
 menu.addEventListener('keydown',event=>{const items=[...menu.querySelectorAll('button:not(:disabled)')],index=items.indexOf(document.activeElement);if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu(true);return}if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const at=event.key==='Home'?0:event.key==='End'?items.length-1:index+(event.key==='ArrowDown'?1:-1);items[(at+items.length)%items.length]?.focus()}},{signal});
 menu.addEventListener('toggle',()=>{if(!menu.matches(':popover-open')){opener?.setAttribute('aria-expanded','false');menuGroup=null}},{signal});
 // Extra parameters stay in the same delegated event root when moved into a
 // Native Popover. No copied input values or second parameter state owner.
 function arrangeOptions(){
  if(!expanded||!options.firstElementChild)return;
  const fields=[...options.querySelectorAll('label.field-row,span.field-row[role=status],button[data-dev1-action],button[data-dev2-action],button[data-dev3-action],button[data-completion-action]')];
  if(!fields.length||bar.scrollWidth<=bar.clientWidth+1)return;
  const extra=document.createElement('div');extra.className='context-more-menu';extra.id='toolOptionsMore';extra.setAttribute('popover','auto');extra.setAttribute('role','group');extra.setAttribute('aria-label','更多工具選項');
  const more=document.createElement('button');more.type='button';more.className='context-drawing-more';more.textContent='更多';more.setAttribute('aria-expanded','false');more.setAttribute('aria-controls',extra.id);
  options.append(more,extra);
  // Measure the real labels and controls, including the More button itself.
  // Shrink to content; move trailing fields only until the bounded row fits.
  for(const field of fields.slice().reverse()){
   if(bar.scrollWidth<=bar.clientWidth+1)break;
   if(field.closest('fieldset:disabled')){if(field.matches('button,input,select'))field.disabled=true;field.querySelectorAll('input,select,button').forEach(el=>el.disabled=true)}
   extra.prepend(field);
  }
  more.addEventListener('click',()=>{if(extra.matches(':popover-open')){extra.hidePopover();return}const box=more.getBoundingClientRect();extra.style.left=Math.min(box.left,Math.max(8,innerWidth-276))+'px';extra.style.top='8px';extra.showPopover();extra.style.top=Math.max(8,box.top-extra.getBoundingClientRect().height-6)+'px';more.setAttribute('aria-expanded','true');extra.querySelector('input:not(:disabled),select:not(:disabled),button:not(:disabled)')?.focus()},{signal:optionAbort.signal});
  extra.addEventListener('toggle',()=>more.setAttribute('aria-expanded',String(extra.matches(':popover-open'))),{signal:optionAbort.signal});
  extra.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();extra.hidePopover();more.focus()}},{signal:optionAbort.signal});
 }
 function stopOptions(){options.querySelector('[popover]')?.hidePopover?.();mount?.dispose?.();mount=null;optionAbort?.abort();optionAbort=null;options.replaceChildren();}
 // Slice subscriptions are centralized here to preserve in-progress input and
 // captured targets, rather than three independent repaint authorities.
 
 function paintOptions(context,s){
  stopOptions();optionAbort=new AbortController();options.dataset.nativeTarget=JSON.stringify(host.target());
  if(!s.docs.length){options.textContent='No document';return}
  if(!context){options.textContent='No applicable tool options';return}
  const {group,item}=context;
  if(group.owner===4){options.innerHTML=completionOptionsMarkup(completion);mountCompletionOptions(options,completion,feedback,optionAbort.signal);}
  else if(group.owner===1){options.innerHTML=renderDev1Options(s,host);mountDev1Options(options,host,optionAbort.signal);}
  else if(group.owner===2)mount=mountDev2Options(options,host,item.id,{subscribeUpdates:false,onFeedback:feedback,onCancel:()=>{viewContext=null;choose(TOOL_GROUPS[0],TOOL_GROUPS[0].items[0])},onApplied:()=>{viewContext=null;signature='';schedule()}});
  else{mount=mountDev3Options(options,host,feedback,{subscribeUpdates:false});mount.render(group.id,item.id);}
  arrangeOptions();
 }
 function setExpanded(value){expanded=value;bar.classList.toggle('expanded',value);toggle.setAttribute('aria-expanded',String(value));toggle.setAttribute('aria-label',value?'收合工具選項':'展開工具選項');toggle.title=toggle.getAttribute('aria-label');signature='';schedule();toggle.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="'+(value?'M6 9l6 6 6-6':'M6 15l6-6 6 6')+'" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';}
 toggle.addEventListener('click',()=>setExpanded(!expanded),{signal});
 options.addEventListener('focusout',schedule,{signal});
 const observer=new ResizeObserver(()=>{signature='';schedule()});observer.observe(bar);observer.observe(root);
 function render(){
  if(disposed)return;
  const s=host.getSnapshot();
  guardGeometry();
  safety?.check();
  if(viewContext&&(viewContext.identity!==targetKey()||viewContext.nativeTool!==s.tool))viewContext=null;
  if(lastNativeTool!==s.tool){closeMenu();lastNativeTool=s.tool;}
  const active=activeToolContext(host),context=viewContext||active;
  if(active)remembered.set(active.group.id,active.item.id);
  for(const g of TOOL_GROUPS){
   const button=buttons.get(g.id),item=g.items.find(t=>t.id===remembered.get(g.id))||g.items.find(t=>toolAvailability(host,g,t).available)||g.items[0];
   button.innerHTML=item.icon;button.title=item.label+(g.items.length>1?'（按住或右鍵展開）':'');button.setAttribute('aria-label',item.label);button.disabled=!g.items.some(t=>toolAvailability(host,g,t).available);button.setAttribute('aria-pressed',String(context?.group.id===g.id));button.classList.toggle('active',context?.group.id===g.id);
  }
  identity.textContent=context?.item?.label||'工具';toggle.disabled=!s.docs.length;
  const completed=completion.snapshot();
  const next=JSON.stringify([context?.group.id,context?.item.id,completed.id,completed.count,completed.pixels,completed.options,completed.selection?.source,completed.selection?.bounds,targetKey(),s.object,s.docs[0]?.guides,s.docs[0]?.camera,s.toolOptions,host.select('tool.options'),host.select('tool.settings',{tool:s.tool}),rt?.rasterOptions?.(),rt?.sourceInfo?.(),host.select('path.current'),host.app?.strokeEdit?.nodeIndices?.size]);
  if(next!==signature){
   const focused=options.contains(document.activeElement)&&document.activeElement?.matches('input,select,textarea');
   if(focused&&options.dataset.nativeTarget===JSON.stringify(host.target()))return;
   signature=next;paintOptions(context,s);
  }
 }
 const offHost=host.subscribe(schedule),offRaster=rt?.subscribe?.(schedule);
 setExpanded(true);render();
 function dispose(){if(disposed)return;disposed=true;if(frame)cancelAnimationFrame(frame);clearHold();closeMenu();observer.disconnect();stopOptions();toolbarCustomization.dispose();offHost?.();offRaster?.();safety?.dispose();menu.remove();}
 signal.addEventListener('abort',dispose,{once:true});
 return {render:schedule,expand(value){setExpanded(value);schedule();},dispose};
}

