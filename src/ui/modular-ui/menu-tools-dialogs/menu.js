import { UI_B_002_MENU_ITEMS, UI_B_002_MENU_LABELS } from './control-matrix.js';
import { createBodyPopover, escapeText, runCommand } from './module-utils.js';
import {
  createImportImageDialogModule, createImageAdjustmentDialogModule, createImageCropDialogModule,
  createImageFilterDialogModule, createImageSizeDialogModule, createNewDocumentDialogModule,
  createExportDialogModule, createImportSvgDialogModule, createReferenceImportDialogModule, createPreferencesDialogModule, createDiagnosticsDialogModule
} from './dialogs.js';
import {
  createEntryAdvancedTransformDialogModule, createEntryExternalImportDialogModule, createEntryFilterGalleryDialogModule,
  createEntryIccDialogModule, createEntryImageStackDialogModule, createEntryLiquifyDialogModule,
  createEntryRecoveryDialogModule, createEntrySelectMaskDialogModule, createEntryShortcutsDialogModule,
  createEntryVectorFillDialogModule
} from './entry-dialogs.js';

const SHORTCUTS=Object.freeze({
  'file.new':'Ctrl+N','file.open-project':'Ctrl+O','file.save':'Ctrl+S','edit.undo':'Ctrl+Z','edit.redo':'Ctrl+Shift+Z',
  'edit.duplicate':'Ctrl+D','edit.delete':'Delete','edit.clear-selection':'Ctrl+Shift+A','view.zoom100':'Ctrl+1','window.fullscreen':'Ctrl+Shift+F'
});
const DIVIDER_BEFORE=new Set(['file.save','file.export-png','edit.duplicate','edit.preferences','image.bit8','image.adjustment.brightness','filter.gallery','object.transform-skew','view.creation','view.snap','view.guides-toggle','help.pen','help.diagnostics']);
const SUBMENUS=Object.freeze({
  'image.mode':Object.freeze({label:'模式',menu:'image',ids:Object.freeze(['image.bit8','image.bit16','image.bit32','image.rgb','image.cmyk','image.lab','image.multichannel'])}),
  'view.snap':Object.freeze({label:'吸附',menu:'view',ids:Object.freeze(['view.snap','view.snap-grid','view.snap-guides','view.snap-edges','view.snap-centers','view.snap-angle','view.snap-equal'])})
});
const SUBMENU_BY_ITEM=new Map(Object.entries(SUBMENUS).flatMap(([id,group])=>group.ids.map(item=>[item,id])));

function dialogFor(id,args){
  if(id==='new-document')return createNewDocumentDialogModule();
  if(id==='import-image')return createImportImageDialogModule();
  if(id==='image-adjustment')return createImageAdjustmentDialogModule(args);
  if(id==='image-filter')return createImageFilterDialogModule(args);
  if(id==='image-size')return createImageSizeDialogModule(args);
  if(id==='image-crop')return createImageCropDialogModule(args);
  if(id==='export')return createExportDialogModule();
  if(id==='import-svg')return createImportSvgDialogModule();
  if(id==='reference-import')return createReferenceImportDialogModule();
  if(id==='preferences')return createPreferencesDialogModule(args);
  if(id==='diagnostics')return createDiagnosticsDialogModule();
  if(id==='entry-external-import')return createEntryExternalImportDialogModule();
  if(id==='entry-icc')return createEntryIccDialogModule();
  if(id==='entry-select-mask')return createEntrySelectMaskDialogModule();
  if(id==='entry-raster-mask')return createEntrySelectMaskDialogModule({createOnly:true});
  if(id==='entry-liquify')return createEntryLiquifyDialogModule();
  if(id==='entry-transform')return createEntryAdvancedTransformDialogModule(args);
  if(id==='entry-vector-fill')return createEntryVectorFillDialogModule(args);
  if(id==='entry-filter-gallery')return createEntryFilterGalleryDialogModule(args);
  if(id==='entry-image-stack')return createEntryImageStackDialogModule();
  if(id==='entry-shortcuts')return createEntryShortcutsDialogModule();
  if(id==='entry-recovery')return createEntryRecoveryDialogModule();
  return null;
}
function available(ctx,item){
  if(item.route==='submenu')return true;
  if(item.requires?.startsWith?.('uiEntry:'))return Boolean(ctx.services.uiEntry?.has?.(item.requires.slice('uiEntry:'.length)));
  if(item.requires==='uiBImage')return Boolean(ctx.services.uiBImage);
  if(item.requires==='panelOpen')return Boolean(ctx.services.canOpenPanel?.(item.panel,{intent:item.intent||null,id:item.id}));
  if(item.route==='command')return ctx.commands.has(item.command);
  if(item.route==='native')return typeof ctx.services.uiBNative?.[item.action]==='function';
  if(item.route==='image')return typeof ctx.services.uiBImage?.[item.action]==='function';
  if(item.route==='entry'||item.route==='entry-dialog')return Boolean(ctx.services.uiEntry);
  return true;
}
function checked(ctx,item){
  const info=ctx.services.uiBImage?.selectedInfo?.();
  if(item.id?.startsWith('image.bit'))return Number(info?.bitDepth)===Number(item.id.slice('image.bit'.length));
  if(item.id==='image.rgb')return info?.colorMode==='RGB';
  if(item.id==='image.cmyk')return info?.colorMode==='CMYK';
  if(item.id==='image.lab')return info?.colorMode==='Lab';
  if(item.id==='view.creation'||item.id==='view.layout'){
    const space=ctx.selectors.get('workspace.current');const id=item.id==='view.creation'?'creation':'layout';
    return (space?.activeSpace||space?.id||space?.space||space)===id;
  }
  return false;
}
function invokeEntry(ctx,item){
  const service=ctx.services.uiEntry;if(!service)return false;
  if(item.action==='selectionAction')return service.selectionAction(item.args?.action,item.args?.arg);
  if(item.action==='toggleSnap')return service.toggleSnap(item.args?.key);
  if(item.action==='guideAction')return service.guideAction(item.args?.action);
  if(item.action==='unavailable')return false;
  return service[item.action]?.(item.args||{});
}
function groupedItems(menu){
  const source=UI_B_002_MENU_ITEMS[menu]||[],seen=new Set(),out=[];
  for(const item of source){
    const submenuId=SUBMENU_BY_ITEM.get(item.id);
    if(!submenuId){out.push(item);continue;}
    if(seen.has(submenuId))continue;seen.add(submenuId);
    const group=SUBMENUS[submenuId];out.push({id:`submenu.${submenuId}`,label:group.label,route:'submenu',submenu:submenuId});
  }
  return out;
}
function itemMarkup(ctx,item){
  const enabled=available(ctx,item),isChecked=checked(ctx,item),shortcut=SHORTCUTS[item.id]||'',submenu=item.route==='submenu';
  const disabled=enabled?'':' disabled aria-disabled="true"';
  return `<button type="button" role="menuitem${isChecked?'checkbox':''}" data-menu-item="${escapeText(item.id)}"${submenu?` data-submenu="${escapeText(item.submenu)}" aria-haspopup="menu"`:''}${isChecked?' aria-checked="true"':''}${disabled}><span class="mui-b-menu-check" aria-hidden="true">${isChecked?'✓':''}</span><span class="mui-b-menu-label">${escapeText(item.label)}</span>${shortcut?`<kbd>${escapeText(shortcut)}</kbd>`:''}<span class="mui-b-menu-arrow" aria-hidden="true">${submenu?'<svg viewBox="0 0 5 7"><path d="m1 1 3 2.5L1 6"/></svg>':''}</span></button>`;
}

export function createUiB002MenuModule(){
  return {id:'ui-b-002.menu.v3',slot:'menu',mount(ctx){
    const popover=createBodyPopover(ctx,{className:'mui-b-menu-popover'});
    const byId=new Map(Object.values(UI_B_002_MENU_ITEMS).flat().map(item=>[item.id,item]));
    let activeMenu=null,parentMenu=null;
    const renderItems=(items,label)=>`<div class="mui-b-menu-items" aria-label="${escapeText(label)}">${items.map((item,index)=>`${index&&DIVIDER_BEFORE.has(item.id)?'<span class="mui-b-menu-separator" role="separator"></span>':''}${itemMarkup(ctx,item)}`).join('')}</div>`;
    const renderMenu=(menu,anchor,{focus=true}={})=>{
      activeMenu=menu;parentMenu=null;popover.open(anchor,renderItems(groupedItems(menu),UI_B_002_MENU_LABELS[menu]),{focus});
    };
    const renderSubmenu=(submenuId,{focus=true}={})=>{
      const group=SUBMENUS[submenuId];if(!group)return;parentMenu=group.menu;
      const items=group.ids.map(id=>byId.get(id)).filter(Boolean);
      const anchor=popover.anchor();popover.open(anchor,renderItems(items,group.label),{focus});
    };
    ctx.root.innerHTML=`<div class="mui-b-menu-brand"><img data-brand-logo src="assets/INK_MARK_SOURCE_W-300.jpg?v=0.1" alt="INK"></div><nav class="mui-b-menu" aria-label="主選單">${Object.keys(UI_B_002_MENU_ITEMS).map(menu=>`<button type="button" data-menu="${menu}" aria-haspopup="menu" aria-expanded="false">${escapeText(UI_B_002_MENU_LABELS[menu])}</button>`).join('')}</nav>`;
    ctx.listen(ctx.root,'click',event=>{
      const button=event.target.closest?.('[data-menu]');if(!button)return;
      if(popover.isOpen()&&popover.anchor()===button){popover.close({returnFocus:true});activeMenu=null;parentMenu=null;return;}
      renderMenu(button.dataset.menu,button);
    });
    ctx.listen(ctx.root,'keydown',event=>{
      const button=event.target.closest?.('[data-menu]');if(!button)return;
      if(['Enter',' ','ArrowDown'].includes(event.key)){event.preventDefault();renderMenu(button.dataset.menu,button);return;}
      if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
      const buttons=[...ctx.root.querySelectorAll('[data-menu]')],index=buttons.indexOf(button),delta=event.key==='ArrowRight'?1:-1,next=buttons[(index+delta+buttons.length)%buttons.length];
      event.preventDefault();next?.focus?.({preventScroll:true});
    });
    ctx.listen(popover.node,'click',async event=>{
      const submenu=event.target.closest?.('[data-submenu]')?.dataset.submenu;if(submenu){renderSubmenu(submenu);return;}
      const id=event.target.closest?.('[data-menu-item]')?.dataset.menuItem;if(!id)return;const item=byId.get(id);if(!item||!available(ctx,item))return;
      popover.close({returnFocus:true});activeMenu=null;parentMenu=null;
      if(item.route==='command')return runCommand(ctx,item.command,item.args||{});
      if(item.route==='file-picker')return ctx.services.openProject?.();
      if(item.route==='dialog'||item.route==='entry-dialog'){const module=dialogFor(item.dialog,item.args||{});if(module)return ctx.services.dialogs?.present(module);}
      if(item.route==='native')return ctx.services.uiBNative?.[item.action]?.(item.args||{});
      if(item.route==='image')return ctx.services.uiBImage?.[item.action]?.(item.args||{});
      if(item.route==='global-event'&&item.event==='ink:branding-open')return ctx.services.openPreferences?.(item.args||{});
      if(item.route==='global-event')return globalThis.dispatchEvent?.(new CustomEvent(item.event,{detail:item.args||{}}));
      if(item.route==='panel')return ctx.services.panelOpen?.(item.panel,{intent:item.intent||null,id:item.id});
      if(item.route==='tool')return ctx.services.uiBTools?.activate?.(item.tool);
      if(item.route==='entry')return invokeEntry(ctx,item);
    });
    ctx.listen(popover.node,'keydown',event=>{
      if(event.key==='ArrowLeft'){
        if(parentMenu){event.preventDefault();renderMenu(parentMenu,popover.anchor());return;}
        const buttons=[...ctx.root.querySelectorAll('[data-menu]')],anchor=popover.anchor(),index=buttons.indexOf(anchor),previous=buttons[(index-1+buttons.length)%buttons.length];
        if(previous){event.preventDefault();renderMenu(previous.dataset.menu,previous);}
        return;
      }
      if(event.key==='ArrowRight'){
        const submenu=event.target.closest?.('[data-submenu]')?.dataset.submenu;if(submenu){event.preventDefault();renderSubmenu(submenu);return;}
        if(parentMenu)return;
        const buttons=[...ctx.root.querySelectorAll('[data-menu]')],anchor=popover.anchor(),index=buttons.indexOf(anchor),next=buttons[(index+1+buttons.length)%buttons.length];
        if(next){event.preventDefault();renderMenu(next.dataset.menu,next);}
      }
      if(event.key==='Escape'){activeMenu=null;parentMenu=null;}
    });
  }};
}
