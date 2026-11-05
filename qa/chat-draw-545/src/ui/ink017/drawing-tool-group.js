// View-only drawing group: Native app.tool and app.lastDrawTool remain authoritative.
// HTML Popover provides browser light-dismiss / Escape; no new global menu controller.
export const drawingTools=[
 ['pen','手繪筆','<path d="M4 19l4-1 11-11-3-3L5 15zM14 6l3 3M4 20h7"/>'],
 ['pencil','鉛筆','<path d="M4 20l4-1 12-12-4-4L4 15zM14 5l4 4M5 15l4 4"/>'],
 ['marker','麥克筆','<path d="M4 19l5-1 11-11-4-4L5 14zM12 7l4 4M3 21h9"/>'],
 ['brush','筆刷','<path d="M4 20c5 0 6-2 6-5l8-8-3-3-8 8c-3 0-5 1-5 6 0 1 1 2 2 2z"/>'],
 ['airbrush','噴槍','<path d="M4 10h10l4-3v9l-4-3H4zM10 13v5h4M20 6h1M21 10h1M20 14h1M19 18h1"/>']
];
const toolMap=new Map(drawingTools.map(([key,label,paths])=>[key,{label,paths}]));
const vector=tool=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+toolMap.get(tool).paths+'</svg>';
export function mountDrawingToolGroup(root,host,feedback,signal){
 const trigger=root.querySelector('[data-drawing-primary]'),menu=root.querySelector('#drawingToolMenu');
 if(!trigger||!menu)throw Error('Drawing group markup missing');
 menu.innerHTML=drawingTools.map(([tool,label])=>'<button type="button" class="drawing-tool-option" role="menuitemradio" data-drawing-tool="'+tool+'" aria-checked="false">'+vector(tool)+'<span>'+label+'</span></button>').join('');
 const items=[...menu.querySelectorAll('[data-drawing-tool]')];
 let pressTimer=null,suppressClick=false;
 const clearPress=()=>{if(pressTimer!==null){clearTimeout(pressTimer);pressTimer=null}};
 const open=(focusIndex=0)=>{
  if(!menu.matches(':popover-open')){
   const box=trigger.getBoundingClientRect();
   menu.style.left=Math.min(Math.max(8,box.right+6),Math.max(8,innerWidth-170))+'px';
   menu.style.top=Math.max(8,box.top)+'px';
   menu.showPopover();
   menu.style.top=Math.min(Math.max(8,box.top),Math.max(8,innerHeight-menu.getBoundingClientRect().height-8))+'px';
  }
  trigger.setAttribute('aria-expanded','true');
  if(focusIndex!==null)items[(focusIndex+items.length)%items.length]?.focus();
 };
 const close=(restore=false)=>{if(menu.matches(':popover-open'))menu.hidePopover();trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus()};
 const activate=tool=>{
  if(!toolMap.has(tool))return;
  const result=host.dispatch({type:'tool.set',value:tool,source:'rail.drawing-group'});
  if(result?.ok===false)feedback(result.error?.message||result.error||'Tool unavailable');
 };
 trigger.addEventListener('click',event=>{
  if(suppressClick){event.preventDefault();suppressClick=false;return}
  const current=host.getSnapshot().tool;
  activate(toolMap.has(current)?current:(toolMap.has(host.app.lastDrawTool)?host.app.lastDrawTool:'pen'));
 },{signal});
 trigger.addEventListener('contextmenu',event=>{event.preventDefault();clearPress();open(null)},{signal});
 trigger.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  clearPress();suppressClick=false;
  pressTimer=setTimeout(()=>{pressTimer=null;suppressClick=true;open(null)},450);
 },{signal});
 for(const name of ['pointerup','pointercancel','pointerleave'])trigger.addEventListener(name,clearPress,{signal});
 trigger.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();open(event.key==='ArrowDown'?0:items.length-1);
  }
  if(event.key==='Escape'&&menu.matches(':popover-open')){event.preventDefault();close(true)}
 },{signal});
 menu.addEventListener('click',event=>{
  const item=event.target.closest('[data-drawing-tool]');
  if(!item)return;
  close();activate(item.dataset.drawingTool);trigger.focus();
 },{signal});
 menu.addEventListener('keydown',event=>{
  const at=items.indexOf(document.activeElement);
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();
   const index=event.key==='Home'?0:event.key==='End'?items.length-1:at+(event.key==='ArrowDown'?1:-1);
   items[(index+items.length)%items.length].focus();
  }
  if(event.key==='Enter'||event.key===' '){event.preventDefault();document.activeElement?.click()}
 },{signal});
 menu.addEventListener('toggle',()=>trigger.setAttribute('aria-expanded',String(menu.matches(':popover-open'))),{signal});
 signal.addEventListener('abort',()=>{clearPress();close()}, {once:true});
 const render=s=>{
  const selected=toolMap.has(s.tool)?s.tool:(toolMap.has(host.app.lastDrawTool)?host.app.lastDrawTool:'pen');
  const active=toolMap.has(s.tool);
  const info=toolMap.get(selected);
  trigger.innerHTML=vector(selected);
  trigger.dataset.drawingActive=selected;
  trigger.setAttribute('aria-label',info.label);
  trigger.title=info.label+'（按住或右鍵展開）';
  trigger.classList.toggle('active',active);
  trigger.setAttribute('aria-pressed',String(active));
  for(const item of items)item.setAttribute('aria-checked',String(item.dataset.drawingTool===s.tool));
 };
 render(host.getSnapshot());
 return {render,dispose:()=>{clearPress();close()}};
}
