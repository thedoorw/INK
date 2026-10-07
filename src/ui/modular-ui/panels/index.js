import { installUiCPanelStyles } from './styles.js';
import { UI_REGION_GEOMETRY } from '../contract.js';
export { createUiCLayerPreviewAdapter } from './layer-preview-adapter.js';

export const UI_C_PACKAGE_VERSION='2.2.0';

export const UI_C_PANEL_GROUPS=Object.freeze({
  'group-a':Object.freeze([
    Object.freeze({id:'navigator',label:'導覽器',labelEn:'Navigator',owner:'D'}),
    Object.freeze({id:'swatches',label:'色票',labelEn:'Swatches',owner:'C'}),
    Object.freeze({id:'color',label:'顏色',labelEn:'Color',owner:'C'})
  ]),
  'group-b':Object.freeze([
    Object.freeze({id:'character',label:'字元',labelEn:'Character',owner:'C'}),
    Object.freeze({id:'paragraph',label:'段落',labelEn:'Paragraph',owner:'C'})
  ]),
  'group-c':Object.freeze([
    Object.freeze({id:'layers',label:'圖層',labelEn:'Layers',owner:'C'}),
    Object.freeze({id:'history',label:'步驟記錄',labelEn:'History',owner:'C'})
  ])
});

export const UI_C_OPTIONAL_PANEL_ACTIONS=Object.freeze(['layer-mask','layer-effects','layer-filter']);

export const UI_C_CONTROL_MATRIX=Object.freeze([
  Object.freeze({surface:'panel-tabs',route:'A layout.setPanelGroupTab',availability:'SUPPORTED',owner:'C presentation / A state'}),
  Object.freeze({surface:'panel-local-menu',route:'A layout.setPanelGroupTab + A layout.setPanelsExpanded',availability:'SUPPORTED',owner:'C presentation / A state'}),
  Object.freeze({surface:'panel-collapse-expand',route:'A layout.setPanelsExpanded',availability:'SUPPORTED',owner:'C presentation / A state'}),
  Object.freeze({surface:'panel-width-resize',route:'A layout.setPanelWidth',availability:'SUPPORTED',owner:'C gesture / A state'}),
  Object.freeze({surface:'panel-splitters',route:'A layout.setPanelGroupHeight',availability:'SUPPORTED',owner:'C gesture / A state'}),
  Object.freeze({surface:'navigator',route:'panels.group-a.navigator',availability:'D_SUPPLIED',owner:'D body / C registration'}),
  Object.freeze({surface:'swatches-tool-foreground',route:'tool.color.set.v1 + services.uiBTools.colors/subscribe',availability:'SUPPORTED_SHARED_NATIVE_AUTHORITY',owner:'B native authority / C home'}),
  Object.freeze({surface:'swatches-selected-text',route:'text.edit.v1 + selection.current + page.byId',availability:'SUPPORTED_WHEN_SINGLE_UNLOCKED_TEXT_SELECTED',owner:'C'}),
  Object.freeze({surface:'color-tool-colors',route:'tool.color.set.v1 + services.uiBTools colors/setBackgroundColor/swapColors/resetColors',availability:'SUPPORTED_SHARED_NATIVE_AUTHORITY',owner:'B native authority / C home'}),
  Object.freeze({surface:'color-selected-text',route:'text.edit.v1 + selection.current + page.byId',availability:'SUPPORTED_WHEN_SINGLE_UNLOCKED_TEXT_SELECTED',owner:'C'}),
  Object.freeze({surface:'color-selected-nontext',route:null,availability:'DEFERRED_NO_GOVERNED_SELECTED_OBJECT_COLOR_ROUTE',owner:'C'}),
  Object.freeze({surface:'character-selected-text',route:'text.edit.v1 + selection.current + page.byId',availability:'SUPPORTED_WHEN_SINGLE_UNLOCKED_TEXT_SELECTED',owner:'C'}),
  Object.freeze({surface:'paragraph-selected-text',route:'text.edit.v1 + selection.current + page.byId',availability:'SUPPORTED_WHEN_SINGLE_UNLOCKED_TEXT_SELECTED',owner:'C'}),
  Object.freeze({surface:'layers',route:'layer.activate/create/duplicate/delete/reorder/opacity/visibility/lock.v1 + layer.list/layer.active',availability:'SUPPORTED',owner:'C'}),
  Object.freeze({surface:'layer-name-filter',route:'layer.list local presentation filter',availability:'SUPPORTED_PRESENTATION_ONLY_NO_FILTERSTACK',owner:'C'}),
  Object.freeze({surface:'layer-context-actions',route:'services.adapters.panelActions',availability:'OPTIONAL_ALLOWLIST_MASK_EFFECTS_FILTER',owner:'B action / C home / MR composition'}),
  Object.freeze({surface:'layer-blend',route:null,availability:'VISIBLE_DISABLED_NO_LAYER_BLEND_ROUTE',owner:'C'}),
  Object.freeze({surface:'layer-fill',route:null,availability:'OMITTED_NO_LAYER_FILL_ROUTE',owner:'C'}),
  Object.freeze({surface:'history',route:'history.undo/redo/jump.v1 + history.summary',availability:'SUPPORTED',owner:'C'}),
  Object.freeze({surface:'panel-open-contract',route:'createUiCPanelAccess',availability:'SUPPORTED',owner:'C seam / A layout'})
]);

export const UI_C_INSTALLATION_MANIFEST=Object.freeze({
  package:'INK-UI-C-002',version:UI_C_PACKAGE_VERSION,
  requires:Object.freeze({hostContract:2,preferences:'INK-UI-PREFERENCES v1',layout:'INK-UI-LAYOUT v1',toolColors:'uiBTools v2'}),
  groupSlots:Object.freeze(['panels.group-a','panels.group-b','panels.group-c']),
  cOwnedPanelSlots:Object.freeze(['panels.group-a.swatches','panels.group-a.color','panels.group-b.character','panels.group-b.paragraph','panels.group-c.layers','panels.group-c.history']),
  externalPanelSlots:Object.freeze(['panels.group-a.navigator']),
  sharedChokePoints:Object.freeze(['src/ui/modular-ui/index.js','src/ui/modular-ui/modules.js','styles.css','shell.template.html','generated Web/Portable HTML']),
  sharedChokePointOwner:'MR',generatedDeliveryMutation:false,nativePatchRequired:false,
  optionalNativeAdapters:Object.freeze(['ui-c.layer-preview.v2']),
  optionalSiblingAdapters:Object.freeze(['ui-c.panel-actions.v1']),
  panelSettings:Object.freeze(['swatches']),
  rollback:'capture A group subtrees; restore all groups on install failure/dispose',
  reinstall:'dispose then reinstall same C package through host'
});

const DEFAULT_SWATCHES=Object.freeze(['#202020','#ffffff','#6d6d6d','#b8b8b8','#c24b4b','#d88a3d','#d6c34a','#67a35d','#3e8c8c','#4f73b8','#7b5eaa','#b85b8e']);
const HEX=/^#[0-9a-f]{6}$/i;
const sameRef=(a,b)=>Boolean(a&&b&&String(a.pageId||'')===String(b.pageId||'')&&String(a.layerId||'')===String(b.layerId||'')&&String(a.objectId||'')===String(b.objectId||''));

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function safeSelect(ctx,id,args={}){try{return ctx.selectors.get(id,args);}catch{return null;}}
function commandAvailable(ctx,id){try{return Boolean(ctx.commands.has(id));}catch{return false;}}
function report(ctx,message){ctx.services.report?.(String(message||''));}
function run(ctx,id,args={}){
  if(!commandAvailable(ctx,id)){report(ctx,`${id} unavailable`);return null;}
  try{
    const result=ctx.commands.execute(id,args);
    if(result&&typeof result.then==='function')return result.then(value=>{if(value?.ok===false)report(ctx,value?.error?.message||id);return value;}).catch(error=>{report(ctx,error?.message||id);return null;});
    if(result?.ok===false)report(ctx,result?.error?.message||id);
    return result;
  }catch(error){report(ctx,error?.message||id);return null;}
}
function findObjectById(objects,objectId){for(const object of objects||[]){if(String(object?.id)===String(objectId))return object;const nested=findObjectById(object?.children,objectId);if(nested)return nested;}return null;}
function refToken(ref){try{return encodeURIComponent(JSON.stringify({pageId:ref?.pageId||null,layerId:ref?.layerId||null,objectId:ref?.objectId||null}));}catch{return '';}}
function parseRefToken(token){try{const value=JSON.parse(decodeURIComponent(String(token||'')));return value&&value.pageId&&value.objectId?value:null;}catch{return null;}}
function currentFocusKey(root){const active=globalThis.document?.activeElement;if(!active||!root?.contains?.(active))return null;return active.dataset?.focusKey||null;}
function restoreFocusKey(root,key){if(!key)return false;for(const node of root?.querySelectorAll?.('[data-focus-key]')||[]){if(node.dataset?.focusKey===key&&typeof node.focus==='function'){try{node.focus({preventScroll:true});return true;}catch{}}}return false;}
function requestFocus(node){if(!node?.focus)return;const call=()=>{try{node.focus({preventScroll:true});}catch{}};if(typeof globalThis.requestAnimationFrame==='function')globalThis.requestAnimationFrame(call);else Promise.resolve().then(call);}

export function resolveSelectedObjectSnapshot(selectors){
  const get=(id,args={})=>{try{return selectors?.get?.(id,args)??null;}catch{return null;}};
  const selection=get('selection.current');
  if(!Array.isArray(selection)||selection.length!==1)return Object.freeze({kind:Array.isArray(selection)&&selection.length>1?'multiple':'none',ref:null,object:null,layer:null});
  const activePage=get('page.active'),rawRef=selection[0]||{};
  const ref={pageId:rawRef.pageId||activePage?.id||null,layerId:rawRef.layerId||null,objectId:rawRef.objectId||null};
  if(!ref.pageId||!ref.objectId)return Object.freeze({kind:'unresolved',ref:Object.freeze(ref),object:null,layer:null});
  const page=get('page.byId',{pageId:ref.pageId});
  if(!page)return Object.freeze({kind:'unresolved',ref:Object.freeze(ref),object:null,layer:null});
  const layer=(page.layers||[]).find(item=>ref.layerId&&String(item.id)===String(ref.layerId))||null;
  const sourceObjects=ref.layerId?(layer?.objects||[]):(page.layers||[]).flatMap(item=>item.objects||[]);
  const object=findObjectById(sourceObjects,ref.objectId);
  if(!object)return Object.freeze({kind:'unresolved',ref:Object.freeze(ref),object:null,layer:layer?Object.freeze({id:layer.id,locked:Boolean(layer.locked)}):null});
  const summary={id:object.id,type:object.type||'unknown',name:object.name||null,color:object.color||null,fontFamily:object.fontFamily||null,fontSize:object.fontSize??null,lineHeight:object.lineHeight??null,fontWeight:object.fontWeight??null,paragraphAlign:object.paragraphAlign||'left',writingMode:object.writingMode||'horizontal-tb'};
  return Object.freeze({kind:summary.type==='text'?'text':'other',ref:Object.freeze(ref),object:Object.freeze(summary),layer:layer?Object.freeze({id:layer.id,locked:Boolean(layer.locked)}):null});
}

function resolveRefSnapshot(ctx,ref){
  if(!ref?.pageId||!ref?.objectId)return null;
  const activePage=safeSelect(ctx,'page.active');
  if(!activePage||String(activePage.id)!==String(ref.pageId))return null;
  const page=safeSelect(ctx,'page.byId',{pageId:ref.pageId});if(!page)return null;
  const layer=(page.layers||[]).find(item=>ref.layerId&&String(item.id)===String(ref.layerId))||null;
  if(ref.layerId&&!layer)return null;
  const object=findObjectById(ref.layerId?(layer?.objects||[]):(page.layers||[]).flatMap(item=>item.objects||[]),ref.objectId);
  return object?{ref,page,layer,object}:null;
}
function selectedText(ctx){const snapshot=resolveSelectedObjectSnapshot(ctx.selectors);return snapshot.kind==='text'?snapshot:null;}
function textPanelState(ctx){const snapshot=selectedText(ctx),editable=Boolean(snapshot&&!snapshot.layer?.locked&&commandAvailable(ctx,'text.edit.v1'));return {snapshot,editable};}
function validateDisplayedTextTarget(ctx,token){
  if(!commandAvailable(ctx,'text.edit.v1')){report(ctx,'Text editing is unavailable.');return null;}
  const ref=parseRefToken(token),current=resolveSelectedObjectSnapshot(ctx.selectors),resolved=resolveRefSnapshot(ctx,ref);
  if(!ref||!resolved||resolved.object?.type!=='text'){report(ctx,'Text target changed; edit cancelled.');return null;}
  if(resolved.layer?.locked){report(ctx,'Text target is on a locked layer; edit cancelled.');return null;}
  if(current.kind!=='text'||!sameRef(current.ref,ref)){report(ctx,'Selection changed; edit cancelled.');return null;}
  return resolved;
}
function editDisplayedText(ctx,token,patch){const target=validateDisplayedTextTarget(ctx,token);return target?run(ctx,'text.edit.v1',{...patch,targetRefs:[target.ref]}):null;}
function swatchPalette(ctx,settings=null){const values=settings?.swatches??ctx.services.panelSettings?.swatches;const valid=Array.isArray(values)?values.filter(value=>HEX.test(String(value))).slice(0,64):[];return valid.length?valid:DEFAULT_SWATCHES;}

function toolColorState(ctx){
  let colors=null;
  try{colors=ctx.services.uiBTools?.colors?.()||null;}catch{}
  const foreground=HEX.test(String(colors?.foreground||''))?String(colors.foreground).toLowerCase():'#202020';
  const background=HEX.test(String(colors?.background||''))?String(colors.background).toLowerCase():'#ffffff';
  return {foreground,background};
}
function setToolForeground(ctx,color){
  if(!HEX.test(String(color||''))){report(ctx,'前景色格式無效。');return null;}
  return run(ctx,'tool.color.set.v1',{color:String(color).toLowerCase()});
}
function setToolBackground(ctx,color){
  if(!HEX.test(String(color||''))){report(ctx,'背景色格式無效。');return null;}
  try{return ctx.services.uiBTools?.setBackgroundColor?.(String(color).toLowerCase())??null;}catch(error){report(ctx,error?.message||'背景色不可用');return null;}
}
function bindToolColorRerender(ctx,queue){
  let cleanup=null;
  try{cleanup=ctx.services.uiBTools?.subscribe?.(queue)||null;}catch{}
  if(cleanup)ctx.cleanup(cleanup);
}

function focusedEditorStillAvailable(ctx,active){
  const token=active?.dataset?.targetRef;
  if(token){
    const ref=parseRefToken(token),current=resolveSelectedObjectSnapshot(ctx.selectors),resolved=resolveRefSnapshot(ctx,ref);
    return Boolean(commandAvailable(ctx,'text.edit.v1')&&ref&&resolved?.object?.type==='text'&&!resolved.layer?.locked&&current.kind==='text'&&sameRef(current.ref,ref));
  }
  if(active?.matches?.('[data-layer-opacity]')){
    const layerId=active.dataset?.layerTarget,layer=resolveLayer(ctx,layerId),current=safeSelect(ctx,'layer.active');
    return Boolean(commandAvailable(ctx,'layer.opacity.set.v1')&&layer&&current&&String(current.id)===String(layerId));
  }
  return true;
}
function bindSelectorRerender(ctx,render){
  let queued=false,dirty=false,disposed=false,frameId=0;
  const flush=()=>{
    queued=false;if(disposed)return;
    const active=globalThis.document?.activeElement;
    if(active&&ctx.root.contains?.(active)&&active.matches?.('input,select,textarea,[contenteditable="true"]')){
      dirty=true;
      if(!focusedEditorStillAvailable(ctx,active)){try{active.disabled=true;active.setAttribute?.('aria-invalid','true');}catch{}}
      return;
    }
    const key=currentFocusKey(ctx.root);dirty=false;render();restoreFocusKey(ctx.root,key);
  };
  const queue=()=>{dirty=true;if(queued)return;queued=true;if(typeof globalThis.requestAnimationFrame==='function')frameId=globalThis.requestAnimationFrame(()=>{frameId=0;flush();});else Promise.resolve().then(flush);};
  ctx.selectors.subscribe(queue);ctx.listen(ctx.root,'focusout',()=>{if(dirty)queue();},true);
  ctx.cleanup(()=>{disposed=true;queued=false;if(frameId&&typeof globalThis.cancelAnimationFrame==='function')globalThis.cancelAnimationFrame(frameId);frameId=0;});
  return queue;
}

function iconSvg(id){
  const paths={
    navigator:'<circle cx="9" cy="9" r="6"/><path d="M11.8 6.2 10 10 6.2 11.8 8 8z"/>',
    swatches:'<rect x="3" y="3" width="5" height="5"/><rect x="10" y="3" width="5" height="5"/><rect x="3" y="10" width="5" height="5"/><rect x="10" y="10" width="5" height="5"/>',
    color:'<circle cx="9" cy="9" r="6"/><path d="M9 3a6 6 0 0 1 0 12z"/>',
    character:'<path d="M4 4h10M9 4v10M6.5 14h5"/>',
    paragraph:'<path d="M11 3v12M8 3v12M8 3h-1a4 4 0 0 0 0 8h1"/>',
    layers:'<path d="m9 3 6 3-6 3-6-3zM3 9l6 3 6-3M3 12l6 3 6-3"/>',
    history:'<path d="M4 6V3L2 5l2 2V6a6 6 0 1 1-.2 5"/>',
    collapse:'<path d="m11 5-4 4 4 4M15 5l-4 4 4 4"/>',
    expand:'<path d="m7 5 4 4-4 4M3 5l4 4-4 4"/>',
    menu:'<path d="M3 5h12M3 9h12M3 13h12"/>',
    eye:'<path d="M2.5 9s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4S2.5 9 2.5 9z"/><circle cx="9" cy="9" r="1.8"/>',
    'eye-off':'<path d="M3 3l12 12M4.1 6.1C3 7.2 2.5 9 2.5 9s2.4 4 6.5 4c1 0 1.9-.2 2.7-.6M7 5.3A7.8 7.8 0 0 1 9 5c4.1 0 6.5 4 6.5 4s-.7 1.2-2 2.3"/>',
    lock:'<rect x="4.5" y="8" width="9" height="7" rx=".5"/><path d="M6.5 8V6.3a2.5 2.5 0 0 1 5 0V8"/>',
    unlock:'<rect x="4.5" y="8" width="9" height="7" rx=".5"/><path d="M11.5 8V6.3a2.5 2.5 0 0 0-4.7-1.2"/>',
    add:'<path d="M9 4v10M4 9h10"/>',
    duplicate:'<rect x="5" y="5" width="8" height="8"/><path d="M3 11V3h8"/>',
    delete:'<path d="M4 5h10M7 5V3h4v2M6 7v7h6V7"/>',
    filter:'<path d="M3 4h12l-4.5 5v4l-3 1V9z"/>',
    mask:'<rect x="3" y="4" width="12" height="10"/><circle cx="9" cy="9" r="3"/>'
  };
  return `<svg class="ink-ui-c-panel-icon" viewBox="0 0 18 18" aria-hidden="true">${paths[id]||paths.layers}</svg>`;
}

function panelSlot(groupId,panelId){return `panels.${groupId}.${panelId}`;}
function panelBudget(state,groupId){
  const budget=Number(state?.bounds?.panelHeightBudget),heights=state?.groupHeights||{};
  if(!Number.isFinite(budget))return {min:0,max:1000};
  const other=groupId==='group-a'?Number(heights['group-b'])||0:Number(heights['group-a'])||0;
  return {min:0,max:Math.max(0,budget-Math.max(0,other))};
}
function clamp(value,min,max){return Math.min(max,Math.max(min,Number(value)||0));}
function releasePointer(node,pointerId){try{if(node?.hasPointerCapture?.(pointerId))node.releasePointerCapture(pointerId);}catch{}}

export function createUiCPanelAccess(layout,{focusPanel=null}={}){
  if(!layout?.state||!layout?.setPanelGroupTab||!layout?.setPanelsExpanded)throw new TypeError('INK_UI_C_LAYOUT_REQUIRED');
  const assertPanel=(groupId,panelId)=>{const panels=UI_C_PANEL_GROUPS[groupId];if(!panels||!panels.some(item=>item.id===panelId))throw new Error('INK_UI_C_PANEL_UNKNOWN');};
  const homes=Object.freeze(Object.entries(UI_C_PANEL_GROUPS).flatMap(([groupId,panels])=>panels.map(panel=>Object.freeze({groupId,panelId:panel.id,label:panel.label,owner:panel.owner}))));
  return Object.freeze({
    schema:'INK-UI-C-PANEL-ACCESS',version:1,
    state:()=>layout.state(),
    homes:()=>homes,
    open(groupId,panelId,{expand=true,focus=true}={}){assertPanel(groupId,panelId);layout.setPanelGroupTab(groupId,panelId);if(expand)layout.setPanelsExpanded(true);if(focus)focusPanel?.(groupId,panelId);return layout.state();},
    selectTab(groupId,panelId,{focus=true}={}){return this.open(groupId,panelId,{expand:false,focus});},
    close(){layout.setPanelsExpanded(false);return layout.state();},
    toggle(){const state=layout.state();layout.setPanelsExpanded(!state.panelsExpanded);return layout.state();},
    setWidth(width){layout.setPanelWidth?.(Number(width));return layout.state();}
  });
}

export function createUiCPanelGroupModule(groupId){
  const tabs=UI_C_PANEL_GROUPS[groupId];if(!tabs)throw new Error('INK_UI_C_PANEL_GROUP_UNKNOWN:'+groupId);
  const slot=`panels.${groupId}`;
  return Object.freeze({id:`ui-c.${groupId}.presentation.v3`,slot,mount(ctx){
    installUiCPanelStyles(ctx.root?.ownerDocument||globalThis.document);
    const canResize=groupId!=='group-c';
    ctx.root.innerHTML=`<section class="ink-ui-c-panel-group" data-group="${groupId}">
      <div class="ink-ui-c-panel-tabs" role="tablist" aria-label="面板群組">${tabs.map(tab=>`<button type="button" class="ink-ui-c-panel-tab" role="tab" data-panel-tab="${tab.id}" data-focus-key="tab-${tab.id}" aria-selected="false">${escapeHtml(tab.label)}</button>`).join('')}<button type="button" class="ink-ui-c-panel-menu-trigger" data-panel-menu-trigger aria-haspopup="menu" aria-expanded="false" aria-label="面板選項">${iconSvg('menu')}</button>${groupId==='group-a'?`<button type="button" class="ink-ui-c-panel-collapse" data-panel-collapse aria-label="收合右側面板">${iconSvg('collapse')}</button>`:''}</div>
      <div class="ink-ui-c-panel-menu" data-panel-menu role="menu" aria-label="面板選項" hidden>${tabs.map(tab=>`<button type="button" role="menuitemradio" aria-checked="false" data-panel-menu-tab="${tab.id}">${escapeHtml(tab.label)}</button>`).join('')}<div class="ink-ui-c-panel-menu-separator" role="separator"></div><button type="button" role="menuitem" data-panel-menu-collapse>收合面板</button></div>
      <div class="ink-ui-c-panel-body">${tabs.map(tab=>`<div class="ink-ui-c-panel-slot" data-panel-slot="${tab.id}" hidden></div>`).join('')}</div>
      <div class="ink-ui-c-dock" aria-label="收合面板列">${groupId==='group-a'?`<button type="button" class="ink-ui-c-dock-expand" data-panel-expand aria-label="展開右側面板">${iconSvg('expand')}</button>`:''}${tabs.map(tab=>`<button type="button" class="ink-ui-c-dock-button" data-panel-dock="${tab.id}" data-focus-key="dock-${tab.id}" aria-label="${escapeHtml(tab.label)}" aria-pressed="false">${iconSvg(tab.id)}</button>`).join('')}</div>
      ${canResize?'<div class="ink-ui-c-splitter" data-panel-splitter role="separator" aria-orientation="horizontal" aria-label="調整面板群組高度"></div>':''}${groupId==='group-a'?'<div class="ink-ui-c-width-resizer" data-panel-width-resizer role="separator" aria-orientation="vertical" aria-label="調整面板寬度"></div>':''}
    </section>`;
    for(const tab of tabs)ctx.slots.register(panelSlot(groupId,tab.id),ctx.root.querySelector(`[data-panel-slot="${tab.id}"]`));
    const state=()=>ctx.services.layout?.state?.()||ctx.services.preferences?.get?.()||{};
    const menu=ctx.root.querySelector('[data-panel-menu]'),menuTrigger=ctx.root.querySelector('[data-panel-menu-trigger]');
    const setMenuOpen=(open,{focusFirst=false,returnFocus=false}={})=>{
      if(!menu||!menuTrigger)return;
      menu.hidden=!open;menuTrigger.setAttribute('aria-expanded',String(open));
      if(open&&focusFirst)requestFocus(menu.querySelector('[role="menuitemradio"],[role="menuitem"]'));
      if(!open&&returnFocus)requestFocus(menuTrigger);
    };
    const update=()=>{
      const current=state(),active=current.groupTabs?.[groupId]||tabs[0].id,expanded=current.panelsExpanded!==false;
      for(const tab of tabs){
        const on=tab.id===active,tabButton=ctx.root.querySelector(`[data-panel-tab="${tab.id}"]`),dockButton=ctx.root.querySelector(`[data-panel-dock="${tab.id}"]`),body=ctx.root.querySelector(`[data-panel-slot="${tab.id}"]`),menuButton=ctx.root.querySelector(`[data-panel-menu-tab="${tab.id}"]`);
        tabButton?.setAttribute('aria-selected',String(on));tabButton?.setAttribute('tabindex',on?'0':'-1');dockButton?.setAttribute('aria-pressed',String(on));menuButton?.setAttribute('aria-checked',String(on));if(body)body.hidden=!on;
      }
      if(!expanded){ctx.root.style.height='';ctx.root.style.alignSelf='start';}
      else if(groupId==='group-c'){ctx.root.style.alignSelf='stretch';ctx.root.style.height='100%';}
      else{ctx.root.style.alignSelf='stretch';const height=Number(current.groupHeights?.[groupId]);ctx.root.style.height=Number.isFinite(height)?`${Math.max(0,height)}px`:'';}
    };
    const prefCleanup=ctx.services.preferences?.subscribe?.(update);if(prefCleanup)ctx.cleanup(prefCleanup);
    ctx.listen(ctx.root,'click',event=>{
      if(event.target.closest?.('[data-panel-menu-trigger]')){setMenuOpen(Boolean(menu?.hidden),{focusFirst:Boolean(menu?.hidden)});return;}
      const menuTab=event.target.closest?.('[data-panel-menu-tab]')?.dataset.panelMenuTab;
      if(menuTab){ctx.services.layout?.setPanelGroupTab?.(groupId,menuTab);setMenuOpen(false);update();requestFocus(ctx.root.querySelector(`[data-panel-tab="${menuTab}"]`));return;}
      if(event.target.closest?.('[data-panel-menu-collapse]')){setMenuOpen(false);ctx.services.layout?.setPanelsExpanded?.(false);update();return;}
      if(event.target.closest?.('[data-panel-collapse]')){const active=state().groupTabs?.[groupId]||tabs[0].id;setMenuOpen(false);ctx.services.layout?.setPanelsExpanded?.(false);update();requestFocus(ctx.root.querySelector(`[data-panel-dock="${active}"]`));return;}
      if(event.target.closest?.('[data-panel-expand]')){ctx.services.layout?.setPanelsExpanded?.(true);update();requestFocus(ctx.root.querySelector(`[data-panel-tab="${state().groupTabs?.[groupId]||tabs[0].id}"]`));return;}
      const tabId=event.target.closest?.('[data-panel-tab]')?.dataset.panelTab,dockId=event.target.closest?.('[data-panel-dock]')?.dataset.panelDock,next=tabId||dockId;if(!next)return;
      setMenuOpen(false);ctx.services.layout?.setPanelGroupTab?.(groupId,next);if(dockId)ctx.services.layout?.setPanelsExpanded?.(true);update();requestFocus(ctx.root.querySelector(`[data-panel-tab="${next}"]`));
    });
    ctx.listen(ctx.root,'keydown',event=>{
      const trigger=event.target.closest?.('[data-panel-menu-trigger]');
      if(trigger&&['Enter',' ','ArrowDown'].includes(event.key)){event.preventDefault?.();setMenuOpen(true,{focusFirst:true});return;}
      const menuItem=event.target.closest?.('[role="menuitemradio"],[role="menuitem"]');
      if(menuItem&&menu?.contains?.(menuItem)){
        const items=[...menu.querySelectorAll('[role="menuitemradio"],[role="menuitem"]')],index=items.indexOf(menuItem);
        if(event.key==='Escape'){event.preventDefault?.();setMenuOpen(false,{returnFocus:true});return;}
        let next=index;if(event.key==='ArrowDown')next=(index+1)%items.length;else if(event.key==='ArrowUp')next=(index-1+items.length)%items.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=items.length-1;else return;
        event.preventDefault?.();requestFocus(items[next]);return;
      }
      const current=event.target.closest?.('[data-panel-tab]');if(!current)return;const index=tabs.findIndex(tab=>tab.id===current.dataset.panelTab);if(index<0)return;
      let next=index;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index-1+tabs.length)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;
      event.preventDefault?.();const id=tabs[next].id;ctx.services.layout?.setPanelGroupTab?.(groupId,id);update();requestFocus(ctx.root.querySelector(`[data-panel-tab="${id}"]`));
    });
    ctx.listen(globalThis.document,'click',event=>{if(!ctx.root.contains?.(event.target))setMenuOpen(false);});
    let splitDrag=null,widthDrag=null;const splitter=ctx.root.querySelector('[data-panel-splitter]'),widthResizer=ctx.root.querySelector('[data-panel-width-resizer]');
    const splitMove=event=>{if(!splitDrag||event.pointerId!==splitDrag.pointerId)return;const budget=panelBudget(state(),groupId),next=clamp(splitDrag.height+(Number(event.clientY)||0)-splitDrag.y,budget.min,budget.max);ctx.root.style.height=`${next}px`;splitDrag.preview=next;};
    const splitFinish=(event,cancel=false)=>{if(!splitDrag||event.pointerId!==splitDrag.pointerId)return;const drag=splitDrag;splitDrag=null;releasePointer(splitter,drag.pointerId);if(cancel){update();return;}ctx.services.layout?.setPanelGroupHeight?.(groupId,drag.preview??drag.height);update();};
    if(canResize)ctx.listen(splitter,'pointerdown',event=>{if(splitDrag||event.isPrimary===false||(event.button!=null&&event.button!==0))return;const current=state(),height=Number(current.groupHeights?.[groupId]);splitDrag={pointerId:event.pointerId,y:Number(event.clientY)||0,height:Number.isFinite(height)?height:Math.max(0,ctx.root.getBoundingClientRect?.().height||0),preview:Number.isFinite(height)?height:0};try{splitter.setPointerCapture?.(event.pointerId);}catch{}event.preventDefault?.();});
    const widthMove=event=>{if(!widthResizer||!widthDrag||event.pointerId!==widthDrag.pointerId)return;const current=state(),max=Number(current.bounds?.panelMax),next=clamp(widthDrag.width+(widthDrag.x-(Number(event.clientX)||0)),UI_REGION_GEOMETRY.panelsCollapsed,Number.isFinite(max)?max:UI_REGION_GEOMETRY.panelsExpanded);ctx.services.layout?.setPanelWidth?.(next);widthDrag.preview=next;};
    const widthFinish=(event,cancel=false)=>{if(!widthDrag||event.pointerId!==widthDrag.pointerId)return;const drag=widthDrag;widthDrag=null;releasePointer(widthResizer,drag.pointerId);if(cancel)ctx.services.layout?.setPanelWidth?.(drag.width);update();};
    if(widthResizer)ctx.listen(widthResizer,'pointerdown',event=>{if(widthDrag||event.isPrimary===false||(event.button!=null&&event.button!==0)||state().panelsExpanded===false)return;const current=state(),width=Number(current.panelWidth)||252;widthDrag={pointerId:event.pointerId,x:Number(event.clientX)||0,width,preview:width};try{widthResizer.setPointerCapture?.(event.pointerId);}catch{}event.preventDefault?.();});
    ctx.listen(globalThis.document,'pointermove',event=>{splitMove(event);widthMove(event);});ctx.listen(globalThis.document,'pointerup',event=>{splitFinish(event,false);widthFinish(event,false);});ctx.listen(globalThis.document,'pointercancel',event=>{splitFinish(event,true);widthFinish(event,true);});
    ctx.cleanup(()=>{if(splitDrag){releasePointer(splitter,splitDrag.pointerId);splitDrag=null;}if(widthDrag){ctx.services.layout?.setPanelWidth?.(widthDrag.width);releasePointer(widthResizer,widthDrag.pointerId);widthDrag=null;}});
    update();
  }});
}

export function createUiCSwatchesModule({panelSettings=null}={}){return Object.freeze({id:'ui-c.swatches.v3',slot:'panels.group-a.swatches',mount(ctx){
  let targetMode='foreground';
  const render=()=>{
    const {snapshot,editable}=textPanelState(ctx),token=refToken(snapshot?.ref),palette=swatchPalette(ctx,panelSettings),colors=toolColorState(ctx),foregroundAvailable=commandAvailable(ctx,'tool.color.set.v1');
    if(targetMode==='text'&&!editable)targetMode='foreground';
    ctx.root.innerHTML=`<div class="ink-ui-c-panel-content">
      <div class="ink-ui-c-panel-toolbar ink-ui-c-swatch-toolbar"><label><span>套用至</span><select data-swatch-target data-focus-key="swatch-target"><option value="foreground" ${targetMode==='foreground'?'selected':''}>前景色</option><option value="text" ${targetMode==='text'?'selected':''} ${editable?'':'disabled'}>選取文字</option></select></label><span class="ink-ui-c-color-pair" aria-label="目前前景與背景色"><i style="--ink-ui-c-chip-color:${escapeHtml(colors.foreground)}"></i><i style="--ink-ui-c-chip-color:${escapeHtml(colors.background)}"></i></span></div>
      <div class="ink-ui-c-swatches" role="group" aria-label="色票">${palette.map(color=>`<button type="button" class="ink-ui-c-swatch" data-swatch="${color}" data-target-ref="${token}" data-focus-key="swatch-${color}" aria-label="${color}" ${(targetMode==='text'?!editable:!foregroundAvailable)?'disabled':''} style="--ink-ui-c-swatch-color:${color}"><span aria-hidden="true"></span></button>`).join('')}</div>
    </div>`;
  };
  ctx.listen(ctx.root,'change',event=>{if(event.target.matches?.('[data-swatch-target]')){targetMode=event.target.value==='text'?'text':'foreground';render();}});
  ctx.listen(ctx.root,'click',event=>{const button=event.target.closest?.('[data-swatch]');if(!button)return;if(targetMode==='text')editDisplayedText(ctx,button.dataset.targetRef,{color:button.dataset.swatch});else setToolForeground(ctx,button.dataset.swatch);});
  const queue=bindSelectorRerender(ctx,render);bindToolColorRerender(ctx,queue);render();
}});}

export function createUiCColorModule(){return Object.freeze({id:'ui-c.color.v3',slot:'panels.group-a.color',mount(ctx){
  const render=()=>{
    const {snapshot,editable}=textPanelState(ctx),colors=toolColorState(ctx),textColor=snapshot?.object?.color&&HEX.test(snapshot.object.color)?snapshot.object.color:colors.foreground,token=refToken(snapshot?.ref),foregroundAvailable=commandAvailable(ctx,'tool.color.set.v1'),backgroundAvailable=typeof ctx.services.uiBTools?.setBackgroundColor==='function';
    ctx.root.innerHTML=`<div class="ink-ui-c-panel-content">
      <div class="ink-ui-c-field-list">
        <label class="ink-ui-c-field"><span>前景色</span><span class="ink-ui-c-color-control"><input type="color" data-tool-color="foreground" data-focus-key="foreground-color" value="${escapeHtml(colors.foreground)}" ${foregroundAvailable?'':'disabled'}><output>${escapeHtml(colors.foreground.toUpperCase())}</output></span></label>
        <label class="ink-ui-c-field"><span>背景色</span><span class="ink-ui-c-color-control"><input type="color" data-tool-color="background" data-focus-key="background-color" value="${escapeHtml(colors.background)}" ${backgroundAvailable?'':'disabled'}><output>${escapeHtml(colors.background.toUpperCase())}</output></span></label>
        <div class="ink-ui-c-field"><span>色彩工具</span><span class="ink-ui-c-button-group"><button type="button" data-color-action="swap" ${typeof ctx.services.uiBTools?.swapColors==='function'?'':'disabled'}>交換</button><button type="button" data-color-action="reset" ${typeof ctx.services.uiBTools?.resetColors==='function'?'':'disabled'}>預設</button></span></div>
        <label class="ink-ui-c-field"><span>文字顏色</span><span class="ink-ui-c-color-control"><input type="color" data-selected-text-color data-target-ref="${token}" data-focus-key="text-color" value="${escapeHtml(textColor)}" ${editable?'':'disabled'}><output>${editable?escapeHtml(textColor.toUpperCase()):'—'}</output></span></label>
      </div>
    </div>`;
  };
  ctx.listen(ctx.root,'change',event=>{
    if(event.target.matches?.('[data-tool-color="foreground"]'))setToolForeground(ctx,event.target.value);
    else if(event.target.matches?.('[data-tool-color="background"]'))setToolBackground(ctx,event.target.value);
    else if(event.target.matches?.('[data-selected-text-color]'))editDisplayedText(ctx,event.target.dataset.targetRef,{color:event.target.value});
  });
  ctx.listen(ctx.root,'click',event=>{const action=event.target.closest?.('[data-color-action]')?.dataset.colorAction;if(action==='swap')ctx.services.uiBTools?.swapColors?.();else if(action==='reset')ctx.services.uiBTools?.resetColors?.();});
  const queue=bindSelectorRerender(ctx,render);bindToolColorRerender(ctx,queue);render();
}});}

export function createUiCCharacterModule(){return Object.freeze({id:'ui-c.character.v3',slot:'panels.group-b.character',mount(ctx){
  const render=()=>{
    const {snapshot,editable}=textPanelState(ctx),object=snapshot?.object,token=refToken(snapshot?.ref),weight=object?.fontWeight??'';
    ctx.root.innerHTML=`<div class="ink-ui-c-panel-content"><div class="ink-ui-c-field-list">
      <label class="ink-ui-c-field"><span>字型</span><input data-text-field="fontFamily" data-target-ref="${token}" data-focus-key="font-family" type="text" value="${escapeHtml(object?.fontFamily||'')}" placeholder="—" ${editable?'':'disabled'}></label>
      <label class="ink-ui-c-field"><span>大小</span><span class="ink-ui-c-number-unit"><input data-text-field="fontSize" data-target-ref="${token}" data-focus-key="font-size" type="number" min="4" max="512" step="1" value="${object?Number(object.fontSize)||32:''}" placeholder="—" ${editable?'':'disabled'}><small>px</small></span></label>
      <label class="ink-ui-c-field"><span>字重</span><select data-text-field="fontWeight" data-target-ref="${token}" data-focus-key="font-weight" ${editable?'':'disabled'}><option value="" ${weight===''?'selected':''}>預設</option>${[300,400,500,600,700].map(value=>`<option value="${value}" ${String(weight)===String(value)?'selected':''}>${value}</option>`).join('')}</select></label>
    </div></div>`;
  };
  ctx.listen(ctx.root,'change',event=>{const key=event.target.dataset?.textField;if(!key)return;let value=event.target.value;if(key==='fontSize'){value=Number(value);if(!Number.isFinite(value)||value<4||value>512){report(ctx,'文字大小必須介於 4–512。');return;}}else if(key==='fontWeight')value=value===''?null:Number(value);editDisplayedText(ctx,event.target.dataset.targetRef,{[key]:value});});
  bindSelectorRerender(ctx,render);render();
}});}

export function createUiCParagraphModule(){return Object.freeze({id:'ui-c.paragraph.v3',slot:'panels.group-b.paragraph',mount(ctx){
  const render=()=>{
    const {snapshot,editable}=textPanelState(ctx),object=snapshot?.object,token=refToken(snapshot?.ref),align=object?.paragraphAlign||'left',writing=object?.writingMode||'horizontal-tb';
    ctx.root.innerHTML=`<div class="ink-ui-c-panel-content"><div class="ink-ui-c-field-list">
      <label class="ink-ui-c-field"><span>對齊</span><select data-paragraph-field="paragraphAlign" data-target-ref="${token}" data-focus-key="paragraph-align" ${editable?'':'disabled'}><option value="left" ${align==='left'?'selected':''}>靠左</option><option value="center" ${align==='center'?'selected':''}>置中</option><option value="right" ${align==='right'?'selected':''}>靠右</option></select></label>
      <label class="ink-ui-c-field"><span>行距</span><input data-paragraph-field="lineHeight" data-target-ref="${token}" data-focus-key="line-height" type="number" min="0.1" max="10" step="0.05" value="${object?Number(object.lineHeight)||1.25:''}" placeholder="—" ${editable?'':'disabled'}></label>
      <label class="ink-ui-c-field"><span>書寫方向</span><select data-paragraph-field="writingMode" data-target-ref="${token}" data-focus-key="writing-mode" ${editable?'':'disabled'}><option value="horizontal-tb" ${writing==='horizontal-tb'?'selected':''}>水平</option><option value="vertical-rl" ${writing==='vertical-rl'?'selected':''}>直排（右至左）</option><option value="vertical-lr" ${writing==='vertical-lr'?'selected':''}>直排（左至右）</option></select></label>
    </div></div>`;
  };
  ctx.listen(ctx.root,'change',event=>{const key=event.target.dataset?.paragraphField;if(!key)return;let value=event.target.value;if(key==='lineHeight'){value=Number(value);if(!Number.isFinite(value)||value<.1||value>10){report(ctx,'行距必須介於 0.1–10。');return;}}editDisplayedText(ctx,event.target.dataset.targetRef,{[key]:value});});
  bindSelectorRerender(ctx,render);render();
}});}

function layerRows(ctx,query=''){
  const layers=[...(safeSelect(ctx,'layer.list')||[])].reverse(),needle=String(query||'').trim().toLowerCase();if(!layers.length)return '<div class="ink-ui-c-empty">目前沒有圖層。</div>';
  const shown=layers.filter(layer=>!needle||String(layer.name||'圖層').toLowerCase().includes(needle));if(!shown.length)return '<div class="ink-ui-c-empty">沒有符合名稱篩選的圖層。</div>';
  return shown.map(layer=>`<div class="ink-ui-c-layer-row" role="option" tabindex="-1" draggable="true" data-layer-id="${escapeHtml(layer.id)}" data-layer-name="${escapeHtml(layer.name||'圖層')}" data-focus-key="layer-${escapeHtml(layer.id)}" data-active="${layer.active?'true':'false'}" data-visible="${layer.visible?'true':'false'}" data-locked="${layer.locked?'true':'false'}" aria-selected="${layer.active?'true':'false'}"><button type="button" class="ink-ui-c-layer-state" data-layer-action="visibility" data-focus-key="visibility-${escapeHtml(layer.id)}" aria-label="${layer.visible?'隱藏圖層':'顯示圖層'}" ${commandAvailable(ctx,'layer.visibility.set.v1')?'':'disabled'}>${iconSvg(layer.visible?'eye':'eye-off')}</button><span class="ink-ui-c-layer-thumb" data-layer-action="activate" tabindex="0" data-focus-key="thumb-${escapeHtml(layer.id)}"><canvas width="28" height="24" data-layer-preview="${escapeHtml(layer.id)}" aria-label="圖層預覽"></canvas><span data-layer-preview-fallback>${Number(layer.objectCount)||0}</span></span><button type="button" class="ink-ui-c-layer-name" data-layer-action="activate" data-focus-key="name-${escapeHtml(layer.id)}">${escapeHtml(layer.name||'圖層')}</button><button type="button" class="ink-ui-c-layer-state" data-layer-action="lock" data-focus-key="lock-${escapeHtml(layer.id)}" aria-label="${layer.locked?'解除圖層鎖定':'鎖定圖層'}" aria-pressed="${layer.locked?'true':'false'}" ${commandAvailable(ctx,'layer.lock.set.v1')?'':'disabled'}>${iconSvg(layer.locked?'lock':'unlock')}</button></div>`).join('');
}
function resolveLayer(ctx,id){return (safeSelect(ctx,'layer.list')||[]).find(item=>String(item.id)===String(id))||null;}
function validatePendingLayer(ctx,id,command,{mustBeActive=false}={}){if(!commandAvailable(ctx,command)){report(ctx,`${command} unavailable`);return null;}const layer=resolveLayer(ctx,id),active=safeSelect(ctx,'layer.active');if(!layer){report(ctx,'圖層目標已變更，操作已取消。');return null;}if(mustBeActive&&(!active||String(active.id)!==String(id))){report(ctx,'作用中圖層已變更，操作已取消。');return null;}return layer;}
function panelActionAvailable(ctx,id){if(!UI_C_OPTIONAL_PANEL_ACTIONS.includes(id))return false;try{return Boolean(ctx.services.adapters?.panelActions?.has?.(id));}catch{return false;}}
function openPanelAction(ctx,id,layerId){if(!panelActionAvailable(ctx,id)){report(ctx,`${id} panel action unavailable`);return false;}const active=safeSelect(ctx,'layer.active');if(!active||String(active.id)!==String(layerId)){report(ctx,'作用中圖層已變更，面板動作已取消。');return false;}try{return ctx.services.adapters.panelActions.open(id,{layerId:active.id})!==false;}catch(error){report(ctx,error?.message||id);return false;}}

export function createUiCLayersModule({panelActions=null,layerPreview=null}={}){return Object.freeze({id:'ui-c.layers.v3',slot:'panels.group-c.layers',mount(ctx){
  let dragId=null,searchQuery='';
  const actions=panelActions||ctx.services.adapters?.panelActions||null;
  const preview=layerPreview||ctx.services.adapters?.layerPreview||null;
  const actionAvailable=id=>{if(!UI_C_OPTIONAL_PANEL_ACTIONS.includes(id))return false;try{return Boolean(actions?.has?.(id));}catch{return false;}};
  const openAction=(id,layerId)=>{
    if(!actionAvailable(id)){report(ctx,`${id} panel action unavailable`);return false;}
    const active=safeSelect(ctx,'layer.active');
    if(!active||String(active.id)!==String(layerId)){report(ctx,'作用中圖層已變更，面板動作已取消。');return false;}
    try{return actions.open(id,{layerId:active.id})!==false;}catch(error){report(ctx,error?.message||id);return false;}
  };
  const renderLayerPreviews=()=>{
    for(const canvas of ctx.root.querySelectorAll?.('[data-layer-preview]')||[]){
      let rendered=false;
      try{rendered=Boolean(preview?.render?.(canvas,canvas.dataset.layerPreview));}catch{}
      const fallback=canvas.parentElement?.querySelector?.('[data-layer-preview-fallback]');
      canvas.hidden=!rendered;if(fallback)fallback.hidden=rendered;
    }
  };
  const render=()=>{
    const active=safeSelect(ctx,'layer.active'),opacity=Math.round(Number(active?.opacity??1)*100),activeId=active?.id||'',locked=Boolean(active?.locked);
    const key=currentFocusKey(ctx.root);
    ctx.root.innerHTML=`<div class="ink-ui-c-panel-content">
      <div class="ink-ui-c-panel-toolbar ink-ui-c-layer-filter-row"><label><span>篩選</span><input class="ink-ui-c-layer-search" type="search" data-layer-search data-focus-key="layer-search" value="${escapeHtml(searchQuery)}" placeholder="依名稱篩選" aria-label="依圖層名稱篩選"></label></div>
      <div class="ink-ui-c-panel-toolbar ink-ui-c-layer-appearance-row"><label class="ink-ui-c-layer-blend"><span>混合</span><select disabled aria-label="混合模式目前沒有可用的圖層指令"><option>未提供</option></select></label><label class="ink-ui-c-layer-opacity"><span>不透明度</span><input data-layer-opacity data-layer-target="${escapeHtml(activeId)}" data-focus-key="layer-opacity" type="range" min="0" max="100" step="1" value="${Number.isFinite(opacity)?opacity:100}" ${active&&commandAvailable(ctx,'layer.opacity.set.v1')?'':'disabled'}><output>${Number.isFinite(opacity)?opacity:100}%</output></label></div>
      <div class="ink-ui-c-panel-toolbar ink-ui-c-layer-lock-row"><span>鎖定</span><button type="button" data-layer-active-lock data-layer-target="${escapeHtml(activeId)}" data-focus-key="layer-active-lock" aria-pressed="${locked?'true':'false'}" aria-label="${locked?'解除作用中圖層鎖定':'鎖定作用中圖層'}" ${active&&commandAvailable(ctx,'layer.lock.set.v1')?'':'disabled'}>${iconSvg(locked?'lock':'unlock')}</button></div>
      <div class="ink-ui-c-layer-list" role="listbox" aria-label="圖層">${layerRows(ctx,searchQuery)}</div>
      <div class="ink-ui-c-panel-footer" role="toolbar" aria-label="圖層動作">
        <button type="button" data-layer-panel-action="layer-mask" data-layer-target="${escapeHtml(activeId)}" aria-label="圖層遮色片" ${active&&actionAvailable('layer-mask')?'':'disabled'}>${iconSvg('mask')}</button>
        <button type="button" class="ink-ui-c-fx-button" data-layer-panel-action="layer-effects" data-layer-target="${escapeHtml(activeId)}" aria-label="圖層效果" ${active&&actionAvailable('layer-effects')?'':'disabled'}>fx</button>
        <button type="button" data-layer-panel-action="layer-filter" data-layer-target="${escapeHtml(activeId)}" aria-label="濾鏡" ${active&&actionAvailable('layer-filter')?'':'disabled'}>${iconSvg('filter')}</button>
        <span class="ink-ui-c-footer-spacer"></span>
        <button type="button" data-layer-footer="create" data-focus-key="layer-create" aria-label="新增圖層" ${commandAvailable(ctx,'layer.create.v1')?'':'disabled'}>${iconSvg('add')}</button>
        <button type="button" data-layer-footer="duplicate" data-focus-key="layer-duplicate" aria-label="複製圖層" ${active&&commandAvailable(ctx,'layer.duplicate.v1')?'':'disabled'}>${iconSvg('duplicate')}</button>
        <button type="button" data-layer-footer="delete" data-focus-key="layer-delete" aria-label="刪除圖層" ${active&&commandAvailable(ctx,'layer.delete.v1')?'':'disabled'}>${iconSvg('delete')}</button>
      </div>
    </div>`;
    renderLayerPreviews();restoreFocusKey(ctx.root,key);
  };
  const clearDrop=()=>ctx.root.querySelectorAll?.('[data-drop-position]').forEach?.(node=>node.removeAttribute('data-drop-position'));
  ctx.listen(ctx.root,'click',event=>{
    const panelButton=event.target.closest?.('[data-layer-panel-action]');
    if(panelButton){openAction(panelButton.dataset.layerPanelAction,panelButton.dataset.layerTarget);return;}
    const activeLock=event.target.closest?.('[data-layer-active-lock]');
    if(activeLock){const id=activeLock.dataset.layerTarget,layer=validatePendingLayer(ctx,id,'layer.lock.set.v1',{mustBeActive:true});if(layer)run(ctx,'layer.lock.set.v1',{layerId:id,locked:!layer.locked});return;}
    const footer=event.target.closest?.('[data-layer-footer]')?.dataset.layerFooter,active=safeSelect(ctx,'layer.active');
    if(footer==='create')run(ctx,'layer.create.v1');
    else if(footer==='duplicate'&&active)run(ctx,'layer.duplicate.v1',{layerId:active.id});
    else if(footer==='delete'&&active)run(ctx,'layer.delete.v1',{layerId:active.id});
    if(footer)return;
    const row=event.target.closest?.('[data-layer-id]');if(!row)return;
    const action=event.target.closest?.('[data-layer-action]')?.dataset.layerAction||'activate';
    const layer=resolveLayer(ctx,row.dataset.layerId);if(!layer)return;
    if(action==='activate')run(ctx,'layer.activate.v1',{layerId:layer.id});
    else if(action==='visibility')run(ctx,'layer.visibility.set.v1',{layerId:layer.id,visible:!layer.visible});
    else if(action==='lock')run(ctx,'layer.lock.set.v1',{layerId:layer.id,locked:!layer.locked});
  });
  ctx.listen(ctx.root,'keydown',event=>{
    const row=event.target.closest?.('[data-layer-id]');if(!row||!['Enter',' '].includes(event.key))return;
    event.preventDefault?.();run(ctx,'layer.activate.v1',{layerId:row.dataset.layerId});
  });
  ctx.listen(ctx.root,'input',event=>{
    if(event.target.matches?.('[data-layer-search]')){searchQuery=String(event.target.value||'');render();return;}
    if(event.target.matches?.('[data-layer-opacity]')){const out=event.target.parentElement?.querySelector?.('output');if(out)out.value=`${event.target.value}%`;}
  });
  ctx.listen(ctx.root,'change',event=>{
    if(!event.target.matches?.('[data-layer-opacity]'))return;
    const id=event.target.dataset.layerTarget;
    if(!validatePendingLayer(ctx,id,'layer.opacity.set.v1',{mustBeActive:true}))return;
    run(ctx,'layer.opacity.set.v1',{layerId:id,opacity:Number(event.target.value)/100});
  });
  ctx.listen(ctx.root,'dragstart',event=>{
    const row=event.target.closest?.('[data-layer-id]');if(!row)return;
    dragId=row.dataset.layerId;row.dataset.dragging='true';event.dataTransfer?.setData?.('text/plain',dragId);
  });
  ctx.listen(ctx.root,'dragend',event=>{event.target.closest?.('[data-layer-id]')?.removeAttribute?.('data-dragging');dragId=null;clearDrop();});
  ctx.listen(ctx.root,'dragover',event=>{
    const row=event.target.closest?.('[data-layer-id]');if(!row)return;
    event.preventDefault?.();clearDrop();
    const rect=row.getBoundingClientRect?.()||{top:0,height:0};
    row.dataset.dropPosition=(Number(event.clientY)||0)<rect.top+rect.height/2?'before':'after';
  });
  ctx.listen(ctx.root,'drop',event=>{
    const row=event.target.closest?.('[data-layer-id]');if(!row)return;
    event.preventDefault?.();
    const source=event.dataTransfer?.getData?.('text/plain')||dragId,target=row.dataset.layerId,position=row.dataset.dropPosition||'before';
    clearDrop();dragId=null;
    if(source&&target&&source!==target&&validatePendingLayer(ctx,source,'layer.reorder.v1'))run(ctx,'layer.reorder.v1',{sourceId:source,targetId:target,position});
  });
  bindSelectorRerender(ctx,render);render();
}});}

const HISTORY_FILTER_LABELS=Object.freeze({gaussianBlur:'高斯模糊',sharpen:'銳利化',highPass:'高反差保留',edgeDetection:'邊緣偵測',noiseGrain:'雜訊顆粒',textureOverlay:'紋理覆蓋',motionBlur:'動態模糊',median:'中間值',unsharpMask:'遮色片銳利化',emboss:'浮雕',mosaic:'馬賽克',minimum:'最小值',maximum:'最大值',reduceNoise:'減少雜訊',liquify:'液化'});
function historyPresentationLabel(value){
  const raw=String(value||'變更').trim();
  const filter=raw.match(/^Add Filter:\s*(.+)$/i);if(filter)return '新增濾鏡：'+(HISTORY_FILTER_LABELS[filter[1]]||filter[1]);
  return raw;
}
function historyRows(ctx){
  const history=safeSelect(ctx,'history.summary')||{entries:[],applied:0},entries=Array.isArray(history.entries)?history.entries:[];
  const jumpAvailable=commandAvailable(ctx,'history.jump.v1');
  const start=`<button type="button" class="ink-ui-c-history-row" data-history-index="0" data-focus-key="history-0" data-active="${Number(history.applied)===0?'true':'false'}" ${jumpAvailable?'':'disabled'}><span>起始狀態</span><small>0</small></button>`;
  return start+entries.map((entry,index)=>`<button type="button" class="ink-ui-c-history-row" data-history-index="${index+1}" data-focus-key="history-${index+1}" data-active="${Number(history.applied)===index+1?'true':'false'}" ${jumpAvailable?'':'disabled'}><span>${escapeHtml(historyPresentationLabel(entry.label))}</span><small>${index<Number(history.applied)?'已套用':'可重做'}</small></button>`).join('');
}

export function createUiCHistoryModule(){return Object.freeze({id:'ui-c.history.v3',slot:'panels.group-c.history',mount(ctx){
  const render=()=>{
    const key=currentFocusKey(ctx.root),history=safeSelect(ctx,'history.summary')||{};
    ctx.root.innerHTML=`<div class="ink-ui-c-panel-content"><div class="ink-ui-c-history-actions">
      <button type="button" data-history-action="undo" data-focus-key="history-undo" ${history.canUndo&&commandAvailable(ctx,'history.undo.v1')?'':'disabled'}>撤銷</button>
      <button type="button" data-history-action="redo" data-focus-key="history-redo" ${history.canRedo&&commandAvailable(ctx,'history.redo.v1')?'':'disabled'}>重做</button>
    </div><div class="ink-ui-c-history-list" aria-label="步驟記錄">${historyRows(ctx)}</div></div>`;
    restoreFocusKey(ctx.root,key);
  };
  ctx.listen(ctx.root,'click',event=>{
    const action=event.target.closest?.('[data-history-action]')?.dataset.historyAction;
    if(action==='undo')run(ctx,'history.undo.v1');else if(action==='redo')run(ctx,'history.redo.v1');if(action)return;
    const index=event.target.closest?.('[data-history-index]')?.dataset.historyIndex;if(index!=null)run(ctx,'history.jump.v1',{applied:Number(index)});
  });
  bindSelectorRerender(ctx,render);render();
}});}

export function createUiCPanelModules(options={}){
  return Object.freeze({
    groups:Object.freeze([createUiCPanelGroupModule('group-a'),createUiCPanelGroupModule('group-b'),createUiCPanelGroupModule('group-c')]),
    panels:Object.freeze([
      createUiCSwatchesModule({panelSettings:options.panelSettings||null}),
      createUiCColorModule(),createUiCCharacterModule(),createUiCParagraphModule(),
      createUiCLayersModule({panelActions:options.panelActions||null,layerPreview:options.layerPreview||null}),
      createUiCHistoryModule()
    ])
  });
}

function restoreGroupSnapshots(host,snapshots){
  for(const slot of [...UI_C_INSTALLATION_MANIFEST.groupSlots].reverse()){try{host.unmount?.(slot);}catch{}}
  for(const snapshot of snapshots){if(snapshot)host.restoreSubtree(snapshot);}
}
function focusInstalledPanel(host,groupId,panelId){
  let root=null;try{root=host.slot?.(`panels.${groupId}`);}catch{}
  requestFocus(root?.querySelector?.(`[data-panel-tab="${panelId}"]`));
}

export function installUiCPanelPackage(host,{navigatorModule=null,panelSettings=null,panelActions=null,layerPreview=null}={}){
  if(!host?.swap||!host?.mount||!host?.captureSubtree||!host?.restoreSubtree)throw new TypeError('INK_UI_C_HOST_REQUIRED');
  const snapshots=UI_C_INSTALLATION_MANIFEST.groupSlots.map(slot=>host.captureSubtree(slot));
  const modules=createUiCPanelModules({panelSettings,panelActions,layerPreview});
  const options={navigatorModule,panelSettings,panelActions,layerPreview};
  try{
    for(const group of modules.groups)host.swap(group.slot,group);
    for(const panel of modules.panels)host.mount(panel);
    if(navigatorModule){if(navigatorModule.slot!=='panels.group-a.navigator')throw new Error('INK_UI_C_NAVIGATOR_SLOT_MISMATCH');host.mount(navigatorModule);}
  }catch(error){restoreGroupSnapshots(host,snapshots);throw error;}
  let active=true;
  const access=createUiCPanelAccess(host.services.layout,{focusPanel:(groupId,panelId)=>focusInstalledPanel(host,groupId,panelId)});
  const receipt={
    manifest:UI_C_INSTALLATION_MANIFEST,groups:modules.groups.map(item=>item.id),panels:modules.panels.map(item=>item.id),navigatorMounted:Boolean(navigatorModule),access,
    get active(){return active;},
    dispose(){if(!active)return false;restoreGroupSnapshots(host,snapshots);active=false;return true;},
    reinstall(){if(active)receipt.dispose();return installUiCPanelPackage(host,options);}
  };
  return Object.freeze(receipt);
}
