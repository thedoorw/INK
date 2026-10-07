export const UI_SHELL_CONTRACT_VERSION = 2;
export const UI_PREFERENCE_SCHEMA_VERSION = 1;

export const UI_THEME_TOKENS = Object.freeze({
  fontFamily:'system-ui,-apple-system,"Segoe UI",sans-serif',
  fontSize:12,
  fontSizeSecondary:11,
  fontSizeMicro:10,
  fontWeight:400,
  fontWeightEmphasis:600,
  lineHeight:1.25,
  surfaceApp:'#ededed',
  surfacePanel:'#ededed',
  surfaceControl:'#f5f5f5',
  surfaceSelected:'#cfd9e6',
  surfaceDisabled:'#e1e1e1',
  workspaceBackground:'#b8b8b8',
  textPrimary:'#242424',
  textSecondary:'#666666',
  textDisabled:'#8a8a8a',
  dividerNormal:'#bbbbbb',
  dividerMajor:'#aaaaaa',
  splitter:'#9f9f9f',
  focusOrAccent:'#4b6f95',
  shadow:'rgba(0,0,0,.14)',
  controlHeight:22,
  optionsControlHeight:21,
  panelRowHeight:35,
  compactRowHeight:26
});

export const UI_REGION_GEOMETRY = Object.freeze({
  menuHeight:25,
  optionsHeight:36,
  statusHeight:22,
  toolsCollapsed:40,
  toolsExpanded:73,
  panelsCollapsed:39,
  panelsExpanded:252,
  desktopCompact:1120,
  mobile:760
});

export const UI_SLOT_CONTRACT = Object.freeze({
  topLevel:Object.freeze(['menu','options','tools','canvas','panels','status','dialogs']),
  panelGroups:Object.freeze(['panels.group-a','panels.group-b','panels.group-c']),
  panels:Object.freeze([
    'panels.group-a.navigator','panels.group-a.swatches','panels.group-a.color',
    'panels.group-b.character','panels.group-b.paragraph',
    'panels.group-c.layers','panels.group-c.history'
  ]),
  canvas:Object.freeze(['canvas.chrome','canvas.viewport']),
  dialogs:Object.freeze(['dialogs.content'])
});

export const UI_PACKAGE_OWNERS = Object.freeze({
  shell:'A', lifecycle:'A', preferences:'A', dialogPresentation:'A', layout:'A', status:'A',
  menu:'B', tools:'B', options:'B', dialogContent:'B',
  panels:'C', layers:'C', history:'C', selectedObjectSettings:'C',
  canvasChrome:'D', navigator:'D', view:'D', guides:'D'
});

export const UI_CONTROL_MAPPING_OWNERS = Object.freeze({
  B:Object.freeze(['application-menu','tools','options','dialog-content']),
  C:Object.freeze(['swatches','color','character','paragraph','layers','history','selected-object-settings']),
  D:Object.freeze(['canvas-chrome','navigator','view','guides'])
});

export const UI_SLOT_OWNERS = Object.freeze({
  menu:'B', options:'B', tools:'B', canvas:'A', panels:'A', status:'A', dialogs:'A',
  'canvas.chrome':'D', 'canvas.viewport':'D',
  'panels.group-a':'A', 'panels.group-b':'A', 'panels.group-c':'A',
  'panels.group-a.navigator':'D', 'panels.group-a.swatches':'C', 'panels.group-a.color':'C',
  'panels.group-b.character':'C', 'panels.group-b.paragraph':'C',
  'panels.group-c.layers':'C', 'panels.group-c.history':'C',
  'dialogs.content':'B'
});

const ownerVerify='OWNER_BIND_AND_VERIFY';
export const UI_FOUNDATION_ROUTE_MATRIX = Object.freeze([
  Object.freeze({surface:'shell',commands:Object.freeze([]),selectors:Object.freeze([]),owner:'A',availability:'FOUNDATION_IMPLEMENTED'}),
  Object.freeze({surface:'file-edit',commands:Object.freeze(['document.new.v1','document.open.v1','document.save.v1','export.png.v1','history.undo.v1','history.redo.v1','history.jump.v1']),selectors:Object.freeze(['document.current','history.summary']),owner:'B',availability:ownerVerify}),
  Object.freeze({surface:'tools-options',commands:Object.freeze(['tool.activate.v1','tool.setting.set.v1','tool.color.set.v1','tool.shape.set.v1','tool.shape.fill.set.v1','tool.text.setting.set.v1']),selectors:Object.freeze(['tool.current','tool.settings','tool.options']),owner:'B',availability:ownerVerify}),
  Object.freeze({surface:'panels-layers',commands:Object.freeze(['layer.activate.v1','layer.create.v1','layer.duplicate.v1','layer.delete.v1','layer.reorder.v1','layer.opacity.set.v1','layer.visibility.set.v1','layer.lock.set.v1']),selectors:Object.freeze(['layer.active','layer.list','history.summary']),owner:'C',availability:ownerVerify}),
  Object.freeze({surface:'canvas-view',commands:Object.freeze(['view.zoom.by.v1','view.zoom.set.v1','view.pan.v1','view.reset.v1','view.fit.content.v1','view.fit.artboard.v1','workspace.activate.v1']),selectors:Object.freeze(['view.current','workspace.current']),owner:'D',availability:ownerVerify}),
  Object.freeze({surface:'guides',commands:Object.freeze(['guide.add.v1','guide.move.v1','guide.remove.v1','guide.lock.set.v1','guide.visibility.set.v1']),selectors:Object.freeze(['page.active']),owner:'D',availability:ownerVerify})
]);

const ADAPTER_KINDS=new Set(['ui-file-picker','ui-stage-lease','ui-focus','ui-dialog-presentation','native-owner']);

export function assertBoundedUiAdapter(adapter) {
  if(!adapter||typeof adapter!=='object'||!adapter.id||!adapter.owner||!ADAPTER_KINDS.has(adapter.kind)) {
    throw new TypeError('INK_UI_BOUNDED_ADAPTER_INVALID');
  }
  if(adapter.app||adapter.rawApp||adapter.executeAnything) throw new Error('INK_UI_RAW_APP_ADAPTER_FORBIDDEN');
  return Object.freeze({...adapter});
}

export function createReadOnlyUiPorts(commandAuthority) {
  if(!commandAuthority?.execute||!commandAuthority?.select||!commandAuthority?.subscribe) throw new TypeError('INK_UI_COMMAND_AUTHORITY_REQUIRED');
  const commands=Object.freeze({
    schema:'INK-UI-COMMAND-PORT',version:1,
    execute:(id,args={})=>commandAuthority.execute(String(id),args,'human-ui'),
    has:id=>commandAuthority.has(String(id)),
    list:()=>commandAuthority.list().map(item=>Object.freeze({...item}))
  });
  const selectors=Object.freeze({
    schema:'INK-UI-SELECTOR-PORT',version:1,
    get:(id,args={})=>commandAuthority.select(String(id),args),
    subscribe:listener=>commandAuthority.subscribe(listener)
  });
  return Object.freeze({commands,selectors});
}

export function applyShellTokens(shell) {
  if(!shell?.style?.setProperty)return shell;
  const t=UI_THEME_TOKENS,g=UI_REGION_GEOMETRY;
  const vars={
    '--ink-ui-font-family':t.fontFamily,
    '--ink-ui-font-size':t.fontSize+'px',
    '--ink-ui-font-size-secondary':t.fontSizeSecondary+'px',
    '--ink-ui-font-size-micro':t.fontSizeMicro+'px',
    '--ink-ui-font-weight':String(t.fontWeight),
    '--ink-ui-font-weight-emphasis':String(t.fontWeightEmphasis),
    '--ink-ui-line-height':String(t.lineHeight),
    '--ink-ui-surface-app':t.surfaceApp,
    '--ink-ui-surface-panel':t.surfacePanel,
    '--ink-ui-surface-control':t.surfaceControl,
    '--ink-ui-surface-selected':t.surfaceSelected,
    '--ink-ui-surface-disabled':t.surfaceDisabled,
    '--ink-ui-workspace':t.workspaceBackground,
    '--ink-ui-text':t.textPrimary,
    '--ink-ui-text-secondary':t.textSecondary,
    '--ink-ui-text-disabled':t.textDisabled,
    '--ink-ui-divider':t.dividerNormal,
    '--ink-ui-divider-major':t.dividerMajor,
    '--ink-ui-splitter':t.splitter,
    '--ink-ui-focus-accent':t.focusOrAccent,
    '--ink-ui-shadow':t.shadow,
    '--ink-ui-control-h':t.controlHeight+'px',
    '--ink-ui-options-control-h':t.optionsControlHeight+'px',
    '--ink-ui-panel-row-h':t.panelRowHeight+'px',
    '--ink-ui-compact-row-h':t.compactRowHeight+'px',
    '--ink-ui-menu-h':g.menuHeight+'px',
    '--ink-ui-options-h':g.optionsHeight+'px',
    '--ink-ui-status-h':g.statusHeight+'px',
    '--ink-ui-tools-collapsed':g.toolsCollapsed+'px',
    '--ink-ui-tools-expanded':g.toolsExpanded+'px',
    '--ink-ui-panels-collapsed':g.panelsCollapsed+'px',
    '--ink-ui-panels-expanded':g.panelsExpanded+'px'
  };
  for(const [key,value] of Object.entries(vars))shell.style.setProperty(key,value);
  return shell;
}
