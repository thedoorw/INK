import { applyShellTokens } from '../contract.js';

export function escapeText(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}

export function runCommand(ctx,id,args={}){
  if(!ctx.commands.has(id)){ctx.services.report?.(`Unavailable: ${id}`);return Promise.resolve({ok:false,error:{code:'CAPABILITY_UNAVAILABLE'}});}
  const result=ctx.commands.execute(id,args);
  return Promise.resolve(result).then(value=>{if(!value?.ok)ctx.services.report?.(value?.error?.message||id);return value;});
}

function editable(node){return Boolean(node?.matches?.('input,select,textarea,[contenteditable="true"]'));}
function focusKey(root,node){
  if(!node||!root?.contains?.(node))return null;
  for(const attr of ['data-option-key','data-core-option','data-option','data-special-option','data-tool-color','name']){
    const key=attr==='name'?node.getAttribute?.('name'):node.getAttribute?.(attr);if(key!=null)return{attr,key};
  }
  return null;
}
function refocus(root,descriptor){
  if(!descriptor)return;const value=String(descriptor.key).replace(/(["\\])/g,'\\$1');const selector=descriptor.attr==='name'?`[name="${value}"]`:`[${descriptor.attr}="${value}"]`;
  try{root.querySelector?.(selector)?.focus?.({preventScroll:true});}catch{}
}

export function stateRerender(ctx,render){
  let frame=0,dirty=false,disposed=false;
  const flush=()=>{frame=0;if(disposed)return;const active=globalThis.document?.activeElement;if(active&&ctx.root.contains?.(active)&&editable(active)){dirty=true;return;}const descriptor=focusKey(ctx.root,active);dirty=false;render();refocus(ctx.root,descriptor);};
  const queue=()=>{dirty=true;if(frame||disposed)return;frame=requestAnimationFrame(flush);};
  const off=ctx.selectors.subscribe(queue);ctx.listen(ctx.root,'focusout',()=>{if(dirty)queue();},true);ctx.cleanup(()=>{disposed=true;off?.();if(frame)cancelAnimationFrame(frame);frame=0;});return queue;
}

export function createBodyPopover(ctx,{className='mui-b-popover',role='menu'}={}){
  const node=document.createElement('div');node.className=className;node.setAttribute('role',role);node.hidden=true;document.body.appendChild(node);
  applyShellTokens(node);Object.assign(node.style,{boxSizing:'border-box',fontFamily:'var(--ink-ui-font-family)',fontSize:'var(--ink-ui-font-size)',fontWeight:'400',color:'var(--ink-ui-text)'});
  let anchor=null;
  const focusables=()=>[...node.querySelectorAll('button:not([disabled]),[role="menuitem"]:not([aria-disabled="true"]),input:not([disabled]),select:not([disabled])')].filter(item=>!item.closest?.('[hidden]'));
  const close=({returnFocus=false}={})=>{if(node.hidden)return false;node.hidden=true;node.replaceChildren();const previous=anchor;previous?.setAttribute?.('aria-expanded','false');anchor=null;if(returnFocus)try{previous?.focus?.({preventScroll:true});}catch{}return true;};
  const open=(target,html,{focus=true}={})=>{
    if(anchor&&anchor!==target)anchor.setAttribute?.('aria-expanded','false');anchor=target;anchor?.setAttribute?.('aria-expanded','true');node.innerHTML=html;node.hidden=false;
    const rect=target.getBoundingClientRect(),width=Math.max(176,node.getBoundingClientRect?.().width||176);const left=Math.max(4,Math.min((globalThis.innerWidth||1280)-width-4,rect.left));
    node.style.left=`${left}px`;node.style.top=`${Math.min((globalThis.innerHeight||800)-8,rect.bottom+1)}px`;if(focus)queueMicrotask(()=>{try{focusables()[0]?.focus?.({preventScroll:true});}catch{}});return node;
  };
  ctx.listen(document,'pointerdown',event=>{if(node.hidden)return;if(node.contains(event.target)||anchor?.contains?.(event.target))return;close();},true);
  ctx.listen(node,'keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();close({returnFocus:true});return;}if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    const items=focusables();if(!items.length)return;event.preventDefault();const current=Math.max(0,items.indexOf(document.activeElement));const next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowDown'?(current+1)%items.length:(current-1+items.length)%items.length;items[next]?.focus?.({preventScroll:true});
  });
  ctx.cleanup(()=>{close();node.remove();});return Object.freeze({node,open,close,isOpen:()=>!node.hidden,anchor:()=>anchor,focusables});
}
