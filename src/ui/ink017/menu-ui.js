// INK Menu UI 001. Presentation-only menu: Native commands and selectors remain authoritative.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const groups={
 file:[
  [{label:'New…',key:'new'},{label:'Open…',key:'open'}],
  [{label:'Close…',key:'close'},{label:'Save',key:'save'},{label:'Import image…',key:'import-image'},{label:'Export',children:[{label:'PNG…',key:'export:png'},{label:'SVG…',key:'export:svg'},{label:'PDF…',key:'export:pdf'}]}]
 ],
 edit:[
  [{label:'Undo',key:'undo',shortcut:'Ctrl+Z'},{label:'Redo',key:'redo',shortcut:'Ctrl+Shift+Z'}],
  [{label:'Copy selected',key:'copy'},{label:'Paste',key:'paste'},{label:'Duplicate selection',key:'duplicate'},{label:'Delete selection',key:'delete'},{label:'Object transform…',key:'transform'}],
  [{label:'Preferences',children:[{label:'Branding…',key:'branding'},{label:'History…',key:'history-limit'}]}]
 ],
 image:[
  [{label:'Adjustments',key:'adjustments'}],
  [{label:'Resize selected image…',key:'image-size'},{label:'Canvas Size…',key:'canvas-size'},{label:'Resize Whole Artwork…',key:'artwork'},{label:'Output Resolution…',key:'ppi'},{label:'Crop selected image…',key:'crop'}]
 ],
 view:[[{label:'Fit content',key:'fit'},{label:'100%',key:'100'}]],
 window:[['navigator','color','swatches','character','paragraph','brushes','adjustments','layers','history','paths'].map(p=>({label:p[0].toUpperCase()+p.slice(1),key:'panel:'+p}))],
 help:[[{label:'About INK',key:'about'},{label:'Document tools…',key:'native-tools'}]]
};
export function mountMenuUi({menu,logo,host,invoke,signal}){
 let category='file',submenu=null,wasOpen=false;
 const state=()=>{
  const s=host.getSnapshot(),h=host.getHistory(),doc=host.select('document.current')||{},transfer=host.select('session.transfer')||{},sessions=host.select('session.list')||[];
  const active=sessions.find(x=>x.active);
  return {s,h,doc,transfer,active,hasDoc:!!s.docs.length&&doc.open!==false};
 };
 const enabled=(key,v)=>{
  if(!key)return false;
  if(['new','open','about','branding','native-tools'].includes(key)||key.startsWith('panel:'))return true;
  if(!v.hasDoc)return false;
  if(key==='undo')return v.h.index>0;
  if(key==='redo')return v.h.index<v.h.entries.length-1;
  if(['copy','duplicate','delete','transform'].includes(key))return !!v.s.object&&!v.s.object.locked;
  if(key==='paste')return v.transfer.ready===true;
  if(['image-size','crop'].includes(key))return !!v.s.object?.raster&&!v.s.object.locked;
  return true;
 };
 const renderRow=(item,v,sub=false)=>{
  const children=item.children,valid=children?children.some(x=>enabled(x.key,v)):enabled(item.key,v);
  const expanded=children&&submenu===item.label;
  return `<div class="menu-item-host"><button type="button" class="menu-row" role="menuitem" ${children?'data-submenu="'+esc(item.label)+'" aria-haspopup="menu" aria-expanded="'+Boolean(expanded)+'"':'data-command="'+esc(item.key)+'"'} ${valid?'':'disabled aria-disabled="true"'}><span class="menu-label">${esc(item.label)}</span>${item.shortcut?'<span class="menu-shortcut">'+esc(item.shortcut)+'</span>':''}${children?'<span class="menu-chevron" aria-hidden="true">›</span>':''}</button>${children&&expanded?'<div class="menu-submenu" role="menu" aria-label="'+esc(item.label)+'">'+children.map(x=>renderRow(x,v,true)).join('')+'</div>':''}</div>`;
 };
 const render=()=>{
  if(menu.hidden)return;
  const v=state();
  menu.innerHTML=`<div class="menu-grid"><nav class="menu-categories" role="tablist" aria-orientation="vertical" aria-label="Application menu categories">${Object.keys(groups).map(k=>'<button class="menu-category'+(category===k?' active':'')+'" role="tab" data-category="'+k+'" aria-selected="'+(category===k)+'">'+k[0].toUpperCase()+k.slice(1)+'</button>').join('')}</nav><div class="menu-panes"><div class="menu-pane" role="menu" aria-label="${esc(category)}">${groups[category].map(group=>'<div class="menu-group">'+group.map(item=>renderRow(item,v)).join('')+'</div>').join('')}</div></div></div>`;
 };
 const close=(restore=false)=>{menu.hidden=true;logo.setAttribute('aria-expanded','false');submenu=null;wasOpen=false;if(restore)logo.focus();};
 const open=()=>{menu.hidden=false;logo.setAttribute('aria-expanded','true');wasOpen=true;render();menu.querySelector('[data-category="'+category+'"]')?.focus();};
 const selectCategory=key=>{category=key;submenu=null;render();};
 logo.setAttribute('aria-haspopup','true');logo.setAttribute('aria-expanded','false');logo.setAttribute('aria-controls',menu.id);
 logo.addEventListener('click',()=>menu.hidden?open():close(),{signal});
 menu.addEventListener('click',e=>{
  const tab=e.target.closest('[data-category]'),parent=e.target.closest('[data-submenu]'),command=e.target.closest('[data-command]');
  if(tab){selectCategory(tab.dataset.category);menu.querySelector('[data-category="'+category+'"]')?.focus();return;}
  if(parent&&!parent.disabled){const label=parent.dataset.submenu;submenu=submenu===label?null:label;render();menu.querySelector('[data-submenu="'+CSS.escape(label)+'"]')?.focus();return;}
  if(command&&!command.disabled){const key=command.dataset.command;close();Promise.resolve(invoke(key)).catch(error=>host.app?.toast?.(error.message||String(error))); }
 },{signal});
 menu.addEventListener('pointerover',e=>{
  const tab=e.target.closest('[data-category]');if(tab&&tab.dataset.category!==category){selectCategory(tab.dataset.category);return;}
  const parent=e.target.closest('[data-submenu]');if(parent&&!parent.disabled&&submenu!==parent.dataset.submenu){submenu=parent.dataset.submenu;render();}
 },{signal});
 menu.addEventListener('keydown',e=>{
  const target=e.target.closest('button');if(!target)return;
  const tabs=[...menu.querySelectorAll('[data-category]')],all=[...menu.querySelectorAll('.menu-pane .menu-row:not(:disabled)')],child=target.closest('.menu-submenu'),list=child?[...child.querySelectorAll('.menu-row:not(:disabled)')]:target.matches('[data-category]')?tabs:all.filter(x=>!x.closest('.menu-submenu'));
  const pos=list.indexOf(target),move=(i)=>list[(i+list.length)%list.length]?.focus();
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
  if(e.key==='Home'||e.key==='End'){e.preventDefault();(e.key==='Home'?list[0]:list.at(-1))?.focus();return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();move(pos+(e.key==='ArrowDown'?1:-1));return;}
  if(e.key==='ArrowRight'){
   e.preventDefault();
   if(target.matches('[data-category]')){all[0]?.focus();return;}
   if(target.matches('[data-submenu]')){submenu=target.dataset.submenu;render();menu.querySelector('.menu-submenu .menu-row:not(:disabled)')?.focus();return;}
   if(child)return;
   tabs[(tabs.findIndex(x=>x.dataset.category===category)+1)%tabs.length]?.click();
   menu.querySelector('.menu-pane .menu-row:not(:disabled)')?.focus();
  }
  if(e.key==='ArrowLeft'){
   e.preventDefault();
   if(child){const parentName=submenu;submenu=null;render();menu.querySelector('[data-submenu="'+CSS.escape(parentName)+'"]')?.focus();return;}
   if(target.matches('[data-category]')){tabs[(tabs.indexOf(target)-1+tabs.length)%tabs.length]?.click();return;}
   menu.querySelector('[data-category="'+category+'"]')?.focus();
  }
  if(e.key==='Enter'||e.key===' '){e.preventDefault();target.click();}
 },{signal});
 document.addEventListener('pointerdown',e=>{if(wasOpen&&!menu.contains(e.target)&&!logo.contains(e.target))close();},{signal});
 const subscription=host.subscribe(()=>{if(!menu.hidden){const focus=document.activeElement?.dataset.command||document.activeElement?.dataset.submenu||document.activeElement?.dataset.category;render();if(focus)menu.querySelector('[data-command="'+CSS.escape(focus)+'"],[data-submenu="'+CSS.escape(focus)+'"],[data-category="'+CSS.escape(focus)+'"]')?.focus();}});
 signal.addEventListener('abort',subscription,{once:true});
 return {render,close,open};
}
