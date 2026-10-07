import { ModularUIHost } from './module-host.js';
import { UI_THEME_TOKENS, UI_REGION_GEOMETRY, applyShellTokens, createReadOnlyUiPorts, assertBoundedUiAdapter } from './contract.js';
import { createUiPreferenceService } from './preferences.js';
import { createDialogPresentationService } from './dialog-presentation.js';
import {
  createCanvasShellModule, createCanvasChromeModuleForSlot,
  createPanelsShellModule, createLayersModuleForSlot, createStatusModule, createDialogsModule
} from './modules.js';
import { createUiB002MenuModule, createUiB002ToolsModule, createUiB002OptionsModule, UI_B_002_CSS } from './menu-tools-dialogs/index.js';
import { createUiB002ToolsAdapter } from '../../editor/function-modules/ui-b-002-tools-adapter.js';
import { createUiB002ImageAdapter } from '../../editor/function-modules/ui-b-002-image-adapter.js';
import { installUiCPanelPackage, createUiCLayersModule, createUiCLayerPreviewAdapter } from './panels/index.js';
import { createCanvasChromeModule, createCanvasViewportModule, createNavigatorModule, installStatusBandContribution } from './canvas-view/index.js';
import { UI_D_CSS } from './canvas-view/styles.js';
import { createUiB002NativeAppAdapter } from '../../editor/function-modules/ui-b-002-native-app-adapter.js';
import { createUiEntryCompletion003Adapter } from '../../editor/function-modules/ui-entry-completion-003-adapter.js';
import { createEntryFilterGalleryDialogModule } from './menu-tools-dialogs/entry-dialogs.js';
import { createSnapFeedbackPresentation } from './snap-feedback-presentation.js';
import { createRevocablePresentationPort } from '../presentation-port.js';

const STYLE_ID='ink-modular-ui-styles-v2';
const SHELL_ID='inkModularShell';

export function modularUiRequested() {
  if (globalThis.__INK_MODULAR_UI__ === true) return true;
  try {
    const url=new URL(globalThis.location?.href || 'http://ink.local/');
    return url.searchParams.get('ui') === 'modular' || url.searchParams.get('ink-ui') === 'modular';
  } catch { return false; }
}

function installStyles() {
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    #app.ink-modular-ui-active{position:relative;display:block!important;width:100%!important;height:100%!important;min-height:100vh!important;overflow:hidden;background:transparent;color:inherit;font-family:inherit}
    html[data-ink-ui-boot="modular-ready"] body>.svg-sprite{position:absolute!important;width:0!important;height:0!important;overflow:hidden!important;pointer-events:none!important}
    .ink-modular-shell{position:absolute;inset:0;width:100%;height:100%;min-height:0;z-index:400;display:grid;grid-template-rows:var(--ink-ui-menu-h) var(--ink-ui-options-h) minmax(0,1fr) var(--ink-ui-status-h);background:var(--ink-ui-workspace);color:var(--ink-ui-text);font-family:var(--ink-ui-font-family);font-size:var(--ink-ui-font-size);font-weight:var(--ink-ui-font-weight);line-height:var(--ink-ui-line-height);--ink-ui-tools-width:var(--ink-ui-tools-collapsed);--ink-ui-panels-width:var(--ink-ui-panels-collapsed);--ink-ui-panels-current-expanded:var(--ink-ui-panels-expanded)}
    .ink-modular-shell *{box-sizing:border-box}
    .ink-modular-slot-menu{grid-row:1;border-bottom:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-surface-panel);min-width:0}
    .ink-modular-slot-options{grid-row:2;border-bottom:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-surface-disabled);min-width:0}
    .ink-modular-shell[data-tools-expanded="true"]{--ink-ui-tools-width:var(--ink-ui-tools-expanded)}
    .ink-modular-shell[data-panels-expanded="true"]{--ink-ui-panels-width:var(--ink-ui-panels-current-expanded)}
    .ink-modular-body{grid-row:3;display:grid;grid-template-columns:var(--ink-ui-tools-width) minmax(0,1fr) var(--ink-ui-panels-width);min-height:0;min-width:0;overflow:hidden}
    .ink-modular-slot-tools{border-right:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-surface-panel);min-height:0;overflow:auto}
    .ink-modular-slot-canvas{min-width:0;min-height:0;background:var(--ink-ui-workspace);overflow:hidden}
    .ink-modular-slot-panels{border-left:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-surface-panel);min-width:0;min-height:0;overflow:hidden}
    .mui-panels-shell{height:100%;display:grid;grid-template-rows:auto auto minmax(0,1fr);min-height:0}
    .mui-panel-group-shell{min-height:0;overflow:hidden;border-bottom:1px solid var(--ink-ui-splitter)}
    .mui-panel-slot{min-height:0;overflow:auto}
    .mui-panel-slot:empty{display:none}
    .ink-modular-shell[data-panels-expanded="false"] .mui-panel-slot{visibility:hidden;pointer-events:none}
    .ink-modular-shell[data-tools-expanded="false"] .mui-tools button{grid-template-columns:1fr;padding:0}
    .ink-modular-shell[data-tools-expanded="false"] .mui-tools button>span:last-child{display:none}
    .mui-canvas-shell{height:100%;display:grid;grid-template-rows:auto minmax(0,1fr);min-height:0}
    .mui-canvas-chrome-slot{min-height:0}
    .mui-canvas-viewport-slot{min-height:0;overflow:hidden}
    .ink-modular-slot-status{grid-row:4;border-top:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-surface-panel)}
    @media(min-width:761px){.ink-modular-slot-status{margin-left:var(--ink-ui-tools-width);margin-right:var(--ink-ui-panels-width)}}
    .ink-modular-slot-dialogs{position:absolute;z-index:100;inset:calc(var(--ink-ui-menu-h) + var(--ink-ui-options-h)) 0 var(--ink-ui-status-h);pointer-events:none}
    .mui-dialog-layer .ink-ui-module{pointer-events:auto}
    .ink-ui-module{min-width:0;min-height:0;height:100%}
    .mui-menu-brand{height:var(--ink-ui-menu-h);display:flex;align-items:center;gap:7px;padding:0 9px;border-right:1px solid var(--ink-ui-divider)}
    .ink-ui-module--menu-common-v1{display:flex;align-items:stretch}
    .mui-menu-brand span{font-size:var(--ink-ui-font-size-micro);color:var(--ink-ui-text-secondary)}
    .mui-menu-groups{display:flex;align-items:stretch;min-width:0}
    .mui-menu-group{display:flex;align-items:center;border-right:1px solid var(--ink-ui-divider)}
    .mui-menu-group>span{padding:0 6px;color:var(--ink-ui-text-secondary);font-size:var(--ink-ui-font-size-secondary)}
    .mui-menu-group button,.mui-options button,.mui-canvas-toolbar button,.mui-layer-toolbar button,.mui-inline-actions button,.mui-panel-head button{height:var(--ink-ui-control-h);border:1px solid transparent;border-radius:0;background:transparent;color:var(--ink-ui-text);padding:0 7px;font:inherit}
    .mui-menu-group button:hover,.mui-canvas-toolbar button:hover,.mui-layer-toolbar button:hover,.mui-inline-actions button:hover,.mui-panel-head button:hover{background:var(--ink-ui-surface-selected);border-color:var(--ink-ui-divider)}
    .mui-options{height:var(--ink-ui-options-h);display:flex;align-items:center;gap:10px;padding:0 8px;white-space:nowrap;overflow:auto}
    .mui-options-label{min-width:44px;font-weight:var(--ink-ui-font-weight-emphasis)}
    .mui-options label{display:flex;align-items:center;gap:5px}
    .mui-options input[type="range"]{width:90px}
    .mui-options input[type="number"]{width:58px;height:var(--ink-ui-options-control-h)}
    .mui-options input[type="color"]{width:27px;height:var(--ink-ui-options-control-h);padding:1px;border:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-surface-control)}
    .mui-options select{height:var(--ink-ui-options-control-h);border:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-surface-control)}
    .mui-options output{min-width:32px;text-align:right;color:var(--ink-ui-text-secondary)}
    .mui-options-note{color:var(--ink-ui-text-secondary)}
    .mui-tools{display:flex;flex-direction:column;padding:4px;gap:2px}
    .mui-tools button{height:37px;display:grid;grid-template-columns:22px 1fr;align-items:center;gap:3px;border:1px solid transparent;background:transparent;text-align:left;padding:0 4px;font:inherit}
    .mui-tools button:hover{background:var(--ink-ui-surface-disabled)}.mui-tools button.active{background:var(--ink-ui-surface-selected);border-color:var(--ink-ui-divider-major)}
    .mui-tool-glyph{display:grid;place-items:center;width:20px;height:20px;border:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-surface-control);font-size:var(--ink-ui-font-size-micro)}
    .ink-ui-module--canvas-chrome-v1{display:grid;grid-template-rows:28px minmax(0,1fr)}
    .mui-canvas-toolbar{display:flex;align-items:center;gap:3px;padding:2px 6px;border-bottom:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-surface-panel)}
    .mui-canvas-toolbar button{height:var(--ink-ui-control-h)}.mui-icon-btn{min-width:24px}.mui-canvas-spacer{flex:1}
    .mui-stage-host{position:relative;min-height:0;min-width:0;overflow:hidden;background:var(--ink-ui-workspace)}
    .mui-stage-host>#stageWrap{position:absolute!important;inset:0!important;width:auto!important;height:auto!important;min-width:0!important;min-height:0!important;grid-area:auto!important}
    .mui-panel-head{height:30px;display:flex;align-items:center;gap:7px;padding:0 7px;border-bottom:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-surface-disabled)}
    .mui-panel-head>span{color:var(--ink-ui-text-secondary);font-size:var(--ink-ui-font-size-micro)}.mui-panel-head>button{margin-left:auto}
    .mui-layer-toolbar{padding:5px 6px;border-bottom:1px solid var(--ink-ui-divider);display:flex;align-items:center;gap:3px;flex-wrap:wrap}
    .mui-layer-toolbar label{display:flex;align-items:center;gap:4px;width:100%;padding-top:3px}
    .mui-layer-toolbar input{flex:1;min-width:60px}.mui-layer-toolbar output{width:34px;text-align:right}
    .mui-layer-list{min-height:74px;max-height:32vh;overflow:auto;border-bottom:1px solid var(--ink-ui-divider)}
    .mui-layer-row{height:var(--ink-ui-panel-row-h);display:grid;grid-template-columns:27px minmax(0,1fr) 27px;align-items:center;border-bottom:1px solid var(--ink-ui-divider);background:var(--ink-ui-surface-panel)}
    .mui-layer-row.compact{height:var(--ink-ui-compact-row-h)}.mui-layer-row.active{background:var(--ink-ui-surface-selected)}
    .mui-layer-row>button{height:100%;border:0;border-radius:0;background:transparent;font:inherit;color:var(--ink-ui-text)}
    .mui-layer-name{display:flex!important;min-width:0;flex-direction:column;align-items:flex-start;justify-content:center;overflow:hidden}
    .mui-layer-name strong,.mui-page-row strong{font-weight:var(--ink-ui-font-weight)}
    .mui-layer-name strong,.mui-layer-name small{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mui-layer-name small{color:var(--ink-ui-text-secondary);font-size:var(--ink-ui-font-size-micro)}
    .mui-panel-section{border-bottom:1px solid var(--ink-ui-divider-major)}.mui-panel-section summary{height:25px;display:flex;align-items:center;gap:6px;padding:0 7px;background:var(--ink-ui-surface-disabled);cursor:pointer;font-weight:var(--ink-ui-font-weight-emphasis)}
    .mui-panel-section summary small{margin-left:auto;color:var(--ink-ui-text-secondary);font-weight:var(--ink-ui-font-weight)}
    .mui-pages,.mui-history{max-height:22vh;overflow:auto}.mui-page-row,.mui-history-row{width:100%;min-height:28px;border:0;border-bottom:1px solid var(--ink-ui-divider);background:var(--ink-ui-surface-panel);display:flex;align-items:center;justify-content:space-between;text-align:left;padding:3px 7px;font:inherit}
    .mui-page-row.active,.mui-history-row.active{background:var(--ink-ui-surface-selected)}.mui-page-row small,.mui-history-row small{color:var(--ink-ui-text-secondary);font-size:var(--ink-ui-font-size-micro)}
    .mui-inline-actions{display:flex;gap:3px;padding:4px 6px;border-top:1px solid var(--ink-ui-divider)}
    .mui-status{height:var(--ink-ui-status-h);display:flex;align-items:center;gap:12px;padding:0 7px;white-space:nowrap;overflow:hidden;color:var(--ink-ui-text-secondary)}
    .mui-status span+span{padding-left:9px;border-left:1px solid var(--ink-ui-divider)}.mui-status-message{margin-left:auto;border-left:0!important;color:var(--ink-ui-text-secondary)}
    .mui-dialog-layer{pointer-events:none}
    @media(max-width:${UI_REGION_GEOMETRY.desktopCompact}px){
      .ink-modular-shell{--ink-ui-panels-current-expanded:236px}
      .mui-menu-group>span{display:none}.mui-menu-group button{padding:0 5px}.mui-tools button{grid-template-columns:20px 1fr;font-size:var(--ink-ui-font-size-secondary)}
      .mui-options{gap:6px}.mui-options input[type="range"]{width:64px}
    }
    @media(max-width:${UI_REGION_GEOMETRY.mobile}px){
      .ink-modular-shell{grid-template-rows:var(--ink-ui-menu-h) var(--ink-ui-options-h) minmax(0,1fr) var(--ink-ui-status-h)}
      .ink-modular-body{grid-template-columns:var(--ink-ui-tools-width) minmax(0,1fr) 0}
      .ink-modular-slot-panels{position:absolute;right:0;top:calc(var(--ink-ui-menu-h) + var(--ink-ui-options-h));bottom:var(--ink-ui-status-h);width:min(280px,76vw);z-index:5;box-shadow:-3px 0 10px var(--ink-ui-shadow)}
      .ink-modular-shell[data-panels-expanded="false"] .ink-modular-slot-panels{display:none}
      .mui-tools button{grid-template-columns:1fr;height:34px}.mui-tools button>span:last-child{display:none}
      .mui-menu-group:nth-of-type(n+3){display:none}
    }
  `+UI_B_002_CSS+UI_D_CSS+`
    .ink-modular-shell .ink-d-stage-host>#stageWrap{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;grid-area:auto!important}
    .ink-modular-shell .ink-d-scrollbar-horizontal{height:17px;min-height:0}
    .ink-modular-shell .ink-d-scrollbar-vertical{width:17px;min-width:0;height:100%}
    .ink-modular-shell .ink-d-scrollbar::-webkit-slider-runnable-track{background:var(--ink-ui-surface-disabled);border:0;border-radius:0}
    .ink-modular-shell .ink-d-scrollbar::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;border:0;border-radius:0;background:var(--ink-ui-divider-major)}
    .ink-modular-shell .ink-d-scrollbar-horizontal::-webkit-slider-runnable-track{height:6px}
    .ink-modular-shell .ink-d-scrollbar-horizontal::-webkit-slider-thumb{width:30px;height:17px;margin-top:-5.5px}
    .ink-modular-shell .ink-d-scrollbar-vertical::-webkit-slider-runnable-track{width:6px;height:100%}
    .ink-modular-shell .ink-d-scrollbar-vertical::-webkit-slider-thumb{width:17px;height:30px;margin-left:-5.5px}
    .ink-modular-shell .ink-d-scrollbar::-moz-range-track{background:var(--ink-ui-surface-disabled);border:0;border-radius:0}
    .ink-modular-shell .ink-d-scrollbar::-moz-range-thumb{border:0;border-radius:0;background:var(--ink-ui-divider-major)}
    .ink-modular-shell .ink-d-scrollbar-horizontal::-moz-range-thumb{width:30px;height:17px}
    .ink-modular-shell .ink-d-scrollbar-vertical::-moz-range-thumb{width:17px;height:30px}
  `;
  document.head.append(style);
}

function stableSnapshot(commands) {
  return {
    document:commands.select('document.current'),
    page:commands.select('page.active'),
    layers:commands.select('layer.list'),
    selection:commands.select('selection.current'),
    view:commands.select('view.current'),
    history:commands.select('history.summary')
  };
}

export function installModularUIShell(app) {
  if (!app || !modularUiRequested()) return null;
  const existing=globalThis.INK_MODULAR_UI;
  if(existing?.host && existing.host.diagnostics?.().disposed!==true)return existing;
  if(existing?.host?.diagnostics?.().disposed===true){
    try{delete globalThis.INK_MODULAR_UI;}catch{}
  }
  const root=app.el?.app || document.querySelector('#app');
  const stage=app.el?.wrap || document.querySelector('#stageWrap');
  if(!root||!stage)throw new Error('INK_MODULAR_UI_ROOT_UNAVAILABLE');
  document.getElementById('inkModularBootFailure')?.remove();
  document.documentElement.dataset.inkUiBoot='modular-transition';
  installStyles();

  const originalRootState={
    hadActiveClass:root.classList.contains('ink-modular-ui-active'),
    uiShell:root.dataset.uiShell ?? null,
    space:root.dataset.space ?? null
  };
  const residualLegacy=[...root.children].filter(child=>child!==stage);
  if(residualLegacy.length)throw new Error('INK_MODULAR_UI_LEGACY_PREBOOT_RESIDUAL:'+residualLegacy.map(node=>node.id||node.className||node.tagName).join(','));
  root.classList.add('ink-modular-ui-active');
  root.dataset.uiShell='modular-v2';

  const originalStage={parent:stage.parentNode,next:stage.nextSibling};
  const shell=document.createElement('div');
  shell.id=SHELL_ID;
  shell.className='ink-modular-shell';
  shell.innerHTML=`
    <div class="ink-modular-slot-menu" data-slot="menu"></div>
    <div class="ink-modular-slot-options" data-slot="options"></div>
    <div class="ink-modular-body">
      <aside class="ink-modular-slot-tools" data-slot="tools"></aside>
      <main class="ink-modular-slot-canvas" data-slot="canvas"></main>
      <aside class="ink-modular-slot-panels" data-slot="panels"></aside>
    </div>
    <div class="ink-modular-slot-status" data-slot="status"></div>
    <div class="ink-modular-slot-dialogs" data-slot="dialogs"></div>`;
  root.append(shell);
  applyShellTokens(shell);
  const preferences=createUiPreferenceService({transientExpansion:true});
  let preferenceState=preferences.get();

  const projectInput=document.createElement('input');
  projectInput.type='file';projectInput.accept='.ink,.json,application/json';projectInput.hidden=true;
  shell.append(projectInput);
  const snapFeedback=createSnapFeedbackPresentation({document});

  const statusListeners=new Set();
  let hostRef=null;
  let api=null;
  let disposed=false;
  let resizeFrame=0;
  let dialogPresenter=null;
  let panelsReceipt=null;
  let documentVisibilityCleanup=null;
  const focusSharedCanvas=()=>app.el?.canvas||null;
  const restoreFocusFromRegion=selector=>{
    const active=globalThis.document?.activeElement;
    const region=shell.querySelector?.(selector);
    if(!active||!region?.contains?.(active))return false;
    const target=focusSharedCanvas();
    try{target?.focus?.({preventScroll:true});return Boolean(target);}catch{return false;}
  };
  const scheduleRendererResize=()=>{
    if(resizeFrame)return;
    resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;app.renderer?.resize?.();});
  };
  const applyLayoutState=state=>{
    const previous=preferenceState;
    preferenceState=state;
    shell.dataset.toolsExpanded=state.toolsExpanded?'true':'false';
    shell.dataset.panelsExpanded=state.panelsExpanded?'true':'false';
    shell.dataset.rulersVisible=state.rulersVisible!==false?'true':'false';
    shell.style.setProperty('--ink-ui-panels-current-expanded',Math.max(UI_REGION_GEOMETRY.panelsCollapsed,Number(state.panelWidth)||UI_REGION_GEOMETRY.panelsExpanded)+'px');
    const width=Number(globalThis.innerWidth)||1280;
    shell.dataset.responsive=width<=UI_REGION_GEOMETRY.mobile?'mobile':width<=UI_REGION_GEOMETRY.desktopCompact?'compact':'desktop';
    if(previous?.panelsExpanded===true&&state.panelsExpanded===false)restoreFocusFromRegion('[data-slot="panels"]');
    if(previous?.toolsExpanded===true&&state.toolsExpanded===false)restoreFocusFromRegion('[data-slot="tools"]');
    scheduleRendererResize();
  };
  const preferenceCleanup=preferences.subscribe(applyLayoutState);
  const layout=Object.freeze({
    schema:'INK-UI-LAYOUT',version:1,
    state:()=>Object.freeze({...preferenceState,bounds:preferences.bounds(),responsive:shell.dataset.responsive}),
    setToolsExpanded:value=>preferences.set({toolsExpanded:Boolean(value)}),
    setPanelsExpanded:value=>preferences.set({panelsExpanded:Boolean(value)}),
    setPanelWidth:value=>preferences.set({panelWidth:Number(value)}),
    setPanelGroupTab:(groupId,tabId)=>preferences.setGroupTab(groupId,tabId),
    setPanelGroupHeight:(groupId,height)=>preferences.setGroupHeight(groupId,height),
    focusFallback:focusSharedCanvas,
    toggleTools:()=>preferences.set({toolsExpanded:!preferenceState.toolsExpanded}),
    togglePanels:()=>preferences.set({panelsExpanded:!preferenceState.panelsExpanded}),
    reset:()=>preferences.reset()
  });
  applyLayoutState(preferenceState);
  const onViewportResize=()=>{preferences.reclamp();};
  globalThis.addEventListener?.('resize',onViewportResize);
  const report=message=>{
    for(const listener of statusListeners){try{listener(String(message||''));}catch{}}
    app.toast?.(String(message||''),1800);
  };
  const adapters=Object.freeze({
    filePicker:assertBoundedUiAdapter({id:'ui.file-picker.v1',owner:'A',kind:'ui-file-picker',open(){if(disposed||!shell.isConnected||!projectInput.isConnected)return false;projectInput.value='';projectInput.click();return true;}}),
    stageLease:assertBoundedUiAdapter({id:'ui.stage-lease.v1',owner:'A',kind:'ui-stage-lease',attach(host){host.append(stage);return()=>{if(originalStage.parent?.isConnected){if(originalStage.next?.parentNode===originalStage.parent)originalStage.parent.insertBefore(stage,originalStage.next);else originalStage.parent.append(stage);}}}}),
    focus:assertBoundedUiAdapter({id:'ui.focus.v1',owner:'A',kind:'ui-focus',target:focusSharedCanvas})
  });
  const dialogsProxy=Object.freeze({
    present:module=>dialogPresenter?.present(module),
    close:()=>dialogPresenter?.close()||false,
    isOpen:()=>Boolean(dialogPresenter?.isOpen())
  });
  const uiBTools=createUiB002ToolsAdapter(app,{commands:app.commands,notify:reason=>app.commands.notify('ui-b-002:'+reason)});
  const uiBImage=createUiB002ImageAdapter(app);
  const uiEntry=createUiEntryCompletion003Adapter(app,{uiBTools});
  const panelActions=Object.freeze({
    has:id=>id==='layer-filter'&&uiEntry.has('layer-filter'),
    open(id,{layerId}={}){if(id!=='layer-filter'||!uiEntry.has('layer-filter'))return false;dialogsProxy.present(createEntryFilterGalleryDialogModule({target:'layer',layerId}));return true;}
  });
  const nativeAdapter=createUiB002NativeAppAdapter(app,{preferences});
  const uiBNative=nativeAdapter;
  const panelOpen=(panelId,detail={})=>{
    const groups={navigator:'group-a',swatches:'group-a',color:'group-a',character:'group-b',paragraph:'group-b',layers:'group-c',history:'group-c'};
    if(groups[panelId]&&panelsReceipt){panelsReceipt.access.open(groups[panelId],panelId);return{opened:true,panelId};}
    return{opened:false,panelId,reason:'PANEL_UNAVAILABLE'};
  };
  const canOpenPanel=panelId=>['navigator','swatches','color','character','paragraph','layers','history'].includes(panelId);
  const services={
    report,
    bindStatus(listener){statusListeners.add(listener);return()=>statusListeners.delete(listener);},
    preferences,layout,adapters,dialogs:dialogsProxy,uiBTools,uiBImage,uiEntry,uiBNative,panelOpen,canOpenPanel,
    openProject(){return adapters.filePicker.open();},
    takeStage(host){return adapters.stageLease.attach(host);},
    focusFallback(){return adapters.focus.target();},
    swapLayers(variant){return hostRef?.swap('panels.group-c.layers',createUiCLayersModule({panelActions,layerPreview:createUiCLayerPreviewAdapter(app)}));}
  };
  const presentFullscreen=active=>{
    if(disposed||!shell.isConnected)return false;
    const value=Boolean(active);
    shell.classList.toggle('fullscreen-active',value);
    root.classList.toggle('fullscreen-active',value);
    for(const button of shell.querySelectorAll?.('[data-workstation-fullscreen]')||[]){
      button.setAttribute('aria-pressed',String(value));
      button.setAttribute('aria-label',value?'退出全螢幕':'進入全螢幕');
      button.title=value?'退出全螢幕 Esc':'進入全螢幕 Ctrl+Shift+F';
      button.dataset.active=value?'true':'false';
    }
    return true;
  };
  const rawPresentation=Object.freeze({
    openProject:()=>disposed?false:services.openProject(),
    snapFeedback:Object.freeze({
      show:(evidence,point)=>disposed?false:snapFeedback.show(evidence,point),
      clear:()=>disposed?false:snapFeedback.clear()
    }),
    fullscreen:Object.freeze({present:presentFullscreen})
  });
  const presentationPort=createRevocablePresentationPort();
  const presentation=presentationPort.presentation;
  const onFullscreenChange=()=>disposed?false:presentFullscreen(Boolean(document.fullscreenElement||document.webkitFullscreenElement));
  document.addEventListener('fullscreenchange',onFullscreenChange);
  document.addEventListener('webkitfullscreenchange',onFullscreenChange);
  const onProjectInputChange=()=>{
    if(disposed)return false;
    const file=projectInput.files?.[0];
    if(file)app.commands.execute('document.open.v1',{file},'human-ui');
    return Boolean(file);
  };
  projectInput.addEventListener('change',onProjectInputChange);

  const slots={};
  shell.querySelectorAll('[data-slot]').forEach(node=>slots[node.dataset.slot]=node);
  const host=new ModularUIHost({
    root:shell,slots,commands:app.commands,selectors:(id,args)=>app.commands.select(id,args),
    tokens:UI_THEME_TOKENS,services
  });
  hostRef=host;
  const syncDocumentVisibility=()=>{root.dataset.documentActive=String(Boolean(app.commands.select('document.current')?.open));let workspace=null;try{workspace=app.commands.select('workspace.current');}catch{}const space=workspace?.activeSpace||workspace?.space||workspace?.mode;if(space)root.dataset.space=space;};
  documentVisibilityCleanup=app.commands.subscribe(syncDocumentVisibility);
  syncDocumentVisibility();


  const teardown=()=>{
    if(disposed)return false;
    presentationPort.revoke();
    disposed=true;
    document.documentElement.dataset.inkUiBoot='modular-transition';
    if(resizeFrame){cancelAnimationFrame(resizeFrame);resizeFrame=0;}
    projectInput.removeEventListener('change',onProjectInputChange);
    document.removeEventListener('fullscreenchange',onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange',onFullscreenChange);
    globalThis.removeEventListener?.('resize',onViewportResize);
    preferenceCleanup?.();
    documentVisibilityCleanup?.();
    try{uiBTools.dispose();}catch{}
    try{dialogPresenter?.dispose?.();}catch{}
    try{app.textEditorPresentation?.dispose?.();}catch{}
    try{snapFeedback.dispose();}catch{}
    statusListeners.clear();
    try{host.dispose();}catch(error){console.warn('INK_MODULAR_UI_HOST_DISPOSE_FAILED',error);}
    projectInput.remove();
    if(stage.parentNode!==root)root.insertBefore(stage,shell);
    shell.remove();
    if(originalRootState.hadActiveClass)root.classList.add('ink-modular-ui-active');else root.classList.remove('ink-modular-ui-active');
    if(originalRootState.uiShell==null)delete root.dataset.uiShell;else root.dataset.uiShell=originalRootState.uiShell;
    if(originalRootState.space==null)delete root.dataset.space;else root.dataset.space=originalRootState.space;
    hostRef=null;
    if(api&&globalThis.INK_MODULAR_UI===api){
      try{delete globalThis.INK_MODULAR_UI;}catch{}
    }
    app.commands.notify('modular-ui-disposed');
    try{app.renderer?.resize?.();}catch{}
    return true;
  };

  try{
    app.textEditorPresentation?.mount?.();
    host.mount(createUiB002MenuModule());
    host.mount(createUiB002ToolsModule());
    host.mount(createUiB002OptionsModule());
    host.mount(createCanvasShellModule());
    host.mount(createCanvasChromeModule());
    host.mount(createCanvasViewportModule());
    snapFeedback.mount();
    host.mount(createPanelsShellModule());
    panelsReceipt=installUiCPanelPackage(host,{navigatorModule:createNavigatorModule(),panelActions,layerPreview:createUiCLayerPreviewAdapter(app)});
    host.mount({id:'status.composed.v2',slot:'status',mount(ctx){installStatusBandContribution(ctx,ctx.root);}});
    host.mount(createDialogsModule());
  }catch(error){
    teardown();
    document.documentElement.dataset.inkUiBoot='modular-failed';
    const failure=document.createElement('div');
    failure.id='inkModularBootFailure';
    failure.setAttribute('role','alert');
    failure.textContent='模組化介面啟動失敗。舊版介面已保持封鎖。';
    document.body.append(failure);
    throw error;
  }
  dialogPresenter=createDialogPresentationService({host,slot:'dialogs.content',focusFallback:()=>adapters.focus.target()});
  globalThis.INK_BRANDING_SETTINGS?.reapply?.();
  presentFullscreen(Boolean(document.fullscreenElement||document.webkitFullscreenElement));
  presentationPort.bind(rawPresentation);
  const ports=createReadOnlyUiPorts(app.commands);

  api={
    version:'2.0',
    contractVersion:2,
    host,
    commands:app.commands,
    ports,preferences,layout,dialogs:dialogsProxy,panels:panelsReceipt.access,snapFeedback,presentation,
    get disposed(){return disposed;},
    dispose:teardown,
    swapLayers:variant=>services.swapLayers(variant),
    state:()=>({shell:'modular-v2',disposed,presentation:presentationPort.diagnostics(),layout:layout.state(),preferences:preferences.diagnostics(),...host.diagnostics(),snapshot:stableSnapshot(app.commands)}),
    qa:{
      swapLayersRoundTrip(count=3){
        const before=stableSnapshot(app.commands);
        const diagnosticsBefore=host.diagnostics();
        for(let index=0;index<Math.max(1,Number(count)||1);index++){
          services.swapLayers('compact');
          services.swapLayers('standard');
        }
        const after=stableSnapshot(app.commands);
        const diagnosticsAfter=host.diagnostics();
        return {
          pass:JSON.stringify(before)===JSON.stringify(after)
            &&diagnosticsBefore.activeListeners===diagnosticsAfter.activeListeners
            &&diagnosticsBefore.activeResources===diagnosticsAfter.activeResources,
          count:Math.max(1,Number(count)||1),
          before,after,
          listenersBefore:diagnosticsBefore.activeListeners,listenersAfter:diagnosticsAfter.activeListeners,
          resourcesBefore:diagnosticsBefore.activeResources,resourcesAfter:diagnosticsAfter.activeResources,
          host:diagnosticsAfter
        };
      },
      failureRecovery(){
        const before=host.diagnostics();
        let error=null;
        try{
          host.swap('panels.group-c.layers',{
            id:'layers.failure-injection.v1',
            slot:'panels.group-c.layers',
            mount(ctx){
              ctx.selectors.subscribe(()=>{});
              ctx.listen(ctx.root,'click',()=>{});
              const timer=setTimeout(()=>{},30000);
              ctx.cleanup(()=>clearTimeout(timer));
              ctx.root.textContent='partial mount';
              throw new Error('INK_QA_INJECTED_MOUNT_FAILURE');
            }
          });
        }catch(caught){error=caught;}
        const after=host.diagnostics();
        const panelId=host.slot('panels.group-c.layers').querySelector('[data-module-id]')?.dataset.moduleId||null;
        return {
          pass:Boolean(error)
            &&panelId==='ui-c.layers.v3'
            &&before.activeListeners===after.activeListeners
            &&before.activeResources===after.activeResources
            &&after.failedMounts===before.failedMounts+1
            &&after.failedSwaps===before.failedSwaps+1
            &&after.recoveries===before.recoveries+1,
          error:error?.message||null,panelId,before,after
        };
      },
      legacyIsolation(){
        const activeLegacy=[...root.children].filter(node=>node!==shell&&node!==stage);
        const retiredIds=['pagesPanel','brushFamilyPopover','panelScrim','inspector','mobileToolSheet','canvasSettings','brandingSettingsDialog','exportDialog','documentStatusStrip','projectInput','imageInput','svgStudioInput','recipeStudioInput','programAssetInput','drawingWorkflowInput','calibrationProfileInput','referenceEvidenceInput','creativeWorkspace','quickControls','selectionBar'];
        const present=retiredIds.filter(id=>document.getElementById(id));
        return{pass:document.getElementById('inkLegacyRuntimeHomes')===null&&activeLegacy.length===0&&present.length===0&&!document.getElementById('inkLegacyStylesheet'),hidden:0,quarantineId:null,activeLegacyCount:activeLegacy.length,present,preboot:globalThis.__INK_MODULAR_PREBOOT__?.diagnostics?.()||null,webShellDisabled:globalThis.INK_WEB_SHELL?.disabledFor==='modular-ui'};
      }
    },
    nestedSubtreeRecovery(){
      const before=host.diagnostics();
      let error=null;
      try{host.swap('panels',{id:'panels.failure-injection.v2',slot:'panels',mount(){throw new Error('INK_QA_INJECTED_PANEL_SHELL_FAILURE');}});}catch(caught){error=caught;}
      const after=host.diagnostics();
      const active=new Map(after.active.map(item=>[item.slot,item.id]));
      return {pass:Boolean(error)&&active.get('panels')==='panels.shell.v2'&&active.get('panels.group-c.layers')==='ui-c.layers.v3'&&after.recoveries===before.recoveries+1,error:error?.message||null,before,after};
    },
    ownershipRejection(){
      let error=null;
      try{host.mount({id:'qa.ownership-rejection.v1',slot:'panels.group-a.navigator',mount(ctx){ctx.slots.register('qa.foreign-slot',shell.querySelector('[data-slot="status"]'));}});}catch(caught){error=caught;}
      return {pass:Boolean(error)&&String(error.message).includes('SLOT_OUTSIDE_OWNER')&&!host.diagnostics().active.some(item=>item.slot==='panels.group-a.navigator'),error:error?.message||null,host:host.diagnostics()};
    },
    dispose:teardown,
    reinstall(){
      const before=stableSnapshot(app.commands);
      teardown();
      const next=installModularUIShell(app);
      return {api:next,before,after:next?stableSnapshot(app.commands):null};
    }
  };
  Object.defineProperty(globalThis,'INK_MODULAR_UI',{value:api,configurable:true});
  app.commands.notify('modular-ui-installed');
  document.documentElement.dataset.inkUiBoot='modular-ready';
  resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;app.renderer?.resize?.();});
  return api;
}
