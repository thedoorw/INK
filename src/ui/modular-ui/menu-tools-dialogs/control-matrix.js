export const UI_B_002_MENU_ITEMS=Object.freeze({
  file:Object.freeze([
    {id:'file.new',label:'新增…',route:'dialog',dialog:'new-document',home:'primary'},
    {id:'file.open-project',label:'開啟 INK…',route:'file-picker',home:'primary'},
    {id:'file.import-image',label:'匯入影像…',route:'dialog',dialog:'import-image',home:'primary'},
    {id:'file.external-import',label:'開啟／匯入外部影像…',route:'entry-dialog',dialog:'entry-external-import',capability:'external-import',requires:'uiEntry:external-import',home:'contextual'},
    {id:'file.reference',label:'匯入參考圖…',route:'dialog',dialog:'reference-import',home:'contextual'},
    {id:'file.import-svg',label:'匯入 SVG…',route:'dialog',dialog:'import-svg',home:'contextual'},
    {id:'file.save',label:'儲存',route:'command',command:'document.save.v1',home:'primary'},
    {id:'file.export',label:'匯出／列印…',route:'dialog',dialog:'export',home:'primary'},
    {id:'file.export-png',label:'快速匯出 PNG',route:'command',command:'export.png.v1',args:{download:true},home:'contextual'}
  ]),
  edit:Object.freeze([
    {id:'edit.undo',label:'復原',route:'command',command:'history.undo.v1'},
    {id:'edit.redo',label:'重做',route:'command',command:'history.redo.v1'},
    {id:'edit.duplicate',label:'建立副本',route:'command',command:'selection.duplicate.v1'},
    {id:'edit.delete',label:'刪除',route:'command',command:'selection.delete.v1'},
    {id:'edit.clear-selection',label:'取消選取',route:'command',command:'selection.clear.v1'},
    {id:'edit.preferences',label:'偏好設定／Branding…',route:'dialog',dialog:'preferences',home:'primary'}
  ]),
  image:Object.freeze([
    {id:'image.resize',label:'影像尺寸…',route:'dialog',dialog:'image-size',requires:'uiBImage'},
    {id:'image.crop',label:'裁切選取影像…',route:'dialog',dialog:'image-crop',requires:'uiBImage'},
    {id:'image.bit8',label:'模式：8-bit',route:'image',action:'setBitDepth',args:{depth:8},requires:'uiBImage'},
    {id:'image.bit16',label:'模式：16-bit',route:'image',action:'setBitDepth',args:{depth:16},requires:'uiBImage'},
    {id:'image.bit32',label:'模式：32-bit',route:'image',action:'setBitDepth',args:{depth:32},requires:'uiBImage'},
    {id:'image.rgb',label:'色彩模式：RGB',route:'image',action:'setColorMode',args:{mode:'RGB'},requires:'uiBImage'},
    {id:'image.cmyk',label:'色彩模式：CMYK',route:'image',action:'setColorMode',args:{mode:'CMYK'},requires:'uiBImage'},
    {id:'image.lab',label:'色彩模式：Lab',route:'image',action:'setColorMode',args:{mode:'Lab'},requires:'uiBImage'},
    {id:'image.multichannel',label:'色彩模式：多色版',route:'entry',action:'unavailable',capability:'multichannel',requires:'uiEntry:multichannel'},
    {id:'image.profile',label:'色彩描述檔…',route:'entry-dialog',dialog:'entry-icc',capability:'icc-profile',requires:'uiEntry:icc-profile'},
    {id:'image.filter-stack',label:'影像 Filter Stack…',route:'entry-dialog',dialog:'entry-image-stack',capability:'image-stack',requires:'uiEntry:image-stack'},
    {id:'image.brightness-contrast',label:'亮度／對比…',route:'dialog',dialog:'image-adjustment',args:{type:'brightnessContrast'}},
    {id:'image.hue-saturation',label:'色相／飽和度…',route:'dialog',dialog:'image-adjustment',args:{type:'hueSaturation'}},
    {id:'image.adjustments-panel',label:'調整…',route:'dialog',dialog:'image-adjustment',args:{type:'brightnessContrast'}}
  ]),
  select:Object.freeze([
    {id:'select.all',label:'全部選取',route:'entry',action:'selectAll',capability:'select-all',requires:'uiEntry:select-all'},
    {id:'select.clear',label:'取消選取',route:'command',command:'selection.clear.v1'},
    {id:'select.polygonal',label:'多邊形套索',route:'tool',tool:'polygonalLasso'},
    {id:'select.magnetic',label:'磁性套索',route:'tool',tool:'magneticLasso'},
    {id:'select.quick',label:'快速選取',route:'tool',tool:'quickSelection'},
    {id:'select.magic',label:'魔術棒',route:'tool',tool:'magicWand'},
    {id:'select.object',label:'物件選取',route:'tool',tool:'objectSelection'},
    {id:'select.refine',label:'選取並遮住…',route:'entry-dialog',dialog:'entry-select-mask',capability:'select-and-mask',requires:'uiEntry:select-and-mask'},
    {id:'select.raster-mask',label:'從選取建立 Raster 遮色片…',route:'entry-dialog',dialog:'entry-raster-mask',capability:'raster-mask',requires:'uiEntry:raster-mask'}
  ]),
  filter:Object.freeze([
    {id:'filter.gallery',label:'濾鏡收藏館…',route:'entry-dialog',dialog:'entry-filter-gallery',capability:'filter-gallery',requires:'uiEntry:filter-gallery'},
    {id:'filter.gaussian',label:'高斯模糊…',route:'dialog',dialog:'image-filter',args:{type:'gaussianBlur'}},
    {id:'filter.motion',label:'動態模糊…',route:'dialog',dialog:'image-filter',args:{type:'motionBlur'}},
    {id:'filter.median',label:'中間值…',route:'dialog',dialog:'image-filter',args:{type:'median'}},
    {id:'filter.sharpen',label:'銳利化…',route:'dialog',dialog:'image-filter',args:{type:'sharpen'}},
    {id:'filter.unsharp',label:'遮色片銳利化…',route:'dialog',dialog:'image-filter',args:{type:'unsharpMask'}},
    {id:'filter.highpass',label:'高反差保留…',route:'dialog',dialog:'image-filter',args:{type:'highPass'}},
    {id:'filter.edge',label:'邊緣偵測…',route:'dialog',dialog:'image-filter',args:{type:'edgeDetection'}},
    {id:'filter.noise',label:'雜訊／顆粒…',route:'dialog',dialog:'image-filter',args:{type:'noiseGrain'}},
    {id:'filter.reduce-noise',label:'減少雜訊…',route:'dialog',dialog:'image-filter',args:{type:'reduceNoise'}},
    {id:'filter.texture',label:'紋理疊加…',route:'dialog',dialog:'image-filter',args:{type:'textureOverlay'}},
    {id:'filter.emboss',label:'浮雕…',route:'dialog',dialog:'image-filter',args:{type:'emboss'}},
    {id:'filter.mosaic',label:'馬賽克…',route:'dialog',dialog:'image-filter',args:{type:'mosaic'}},
    {id:'filter.minimum',label:'最小值…',route:'dialog',dialog:'image-filter',args:{type:'minimum'}},
    {id:'filter.maximum',label:'最大值…',route:'dialog',dialog:'image-filter',args:{type:'maximum'}},
    {id:'filter.liquify',label:'液化…',route:'entry-dialog',dialog:'entry-liquify',capability:'liquify',requires:'uiEntry:liquify'}
  ]),
  object:Object.freeze([
    {id:'object.path-edit',label:'路徑／節點編輯',route:'native',action:'enterPathEdit'},
    {id:'object.path-vector-mask',label:'Path 向量遮色片',route:'native',action:'vectorMask'},
    {id:'object.stroke-edit',label:'筆畫節點編輯',route:'native',action:'enterStrokeEdit'},
    {id:'object.frame',label:'建立框架',route:'native',action:'frameSelection'},
    {id:'object.front',label:'移至最上',route:'entry',action:'selectionAction',args:{action:'front'},capability:'selection-arrange',requires:'uiEntry:selection-arrange'},
    {id:'object.back',label:'移至最下',route:'entry',action:'selectionAction',args:{action:'back'},capability:'selection-arrange',requires:'uiEntry:selection-arrange'},
    {id:'object.group',label:'群組',route:'entry',action:'selectionAction',args:{action:'group'},capability:'selection-group',requires:'uiEntry:selection-group'},
    {id:'object.ungroup',label:'解散群組',route:'entry',action:'selectionAction',args:{action:'ungroup'},capability:'selection-ungroup',requires:'uiEntry:selection-ungroup'},
    {id:'object.align-left',label:'對齊：靠左',route:'command',command:'object.align.v1',args:{mode:'left'}},
    {id:'object.align-center-x',label:'對齊：水平置中',route:'command',command:'object.align.v1',args:{mode:'centerX'}},
    {id:'object.align-center-y',label:'對齊：垂直置中',route:'command',command:'object.align.v1',args:{mode:'centerY'}},
    {id:'object.align-right',label:'對齊：靠右',route:'entry',action:'selectionAction',args:{action:'align',arg:'right'},capability:'selection-align',requires:'uiEntry:selection-align'},
    {id:'object.align-top',label:'對齊：靠上',route:'entry',action:'selectionAction',args:{action:'align',arg:'top'},capability:'selection-align',requires:'uiEntry:selection-align'},
    {id:'object.align-bottom',label:'對齊：靠下',route:'entry',action:'selectionAction',args:{action:'align',arg:'bottom'},capability:'selection-align',requires:'uiEntry:selection-align'},
    {id:'object.distribute-x',label:'分布：水平等距',route:'entry',action:'selectionAction',args:{action:'align',arg:'distributeX'},capability:'selection-align',requires:'uiEntry:selection-align'},
    {id:'object.distribute-y',label:'分布：垂直等距',route:'entry',action:'selectionAction',args:{action:'align',arg:'distributeY'},capability:'selection-align',requires:'uiEntry:selection-align'},
    {id:'object.transform-skew',label:'變形：傾斜…',route:'entry-dialog',dialog:'entry-transform',args:{mode:'skew'},capability:'advanced-transform',requires:'uiEntry:advanced-transform'},
    {id:'object.transform-distort',label:'變形：扭曲…',route:'entry-dialog',dialog:'entry-transform',args:{mode:'distort'},capability:'advanced-transform',requires:'uiEntry:advanced-transform'},
    {id:'object.transform-perspective',label:'變形：透視…',route:'entry-dialog',dialog:'entry-transform',args:{mode:'perspective'},capability:'advanced-transform',requires:'uiEntry:advanced-transform'},
    {id:'object.transform-warp',label:'變形：彎曲…',route:'entry-dialog',dialog:'entry-transform',args:{mode:'warp'},capability:'advanced-transform',requires:'uiEntry:advanced-transform'},
    {id:'object.vector-gradient',label:'向量漸層…',route:'entry-dialog',dialog:'entry-vector-fill',args:{kind:'gradient'},capability:'vector-gradient',requires:'uiEntry:vector-gradient'},
    {id:'object.vector-pattern',label:'向量圖樣…',route:'entry-dialog',dialog:'entry-vector-fill',args:{kind:'pattern'},capability:'vector-pattern',requires:'uiEntry:vector-pattern'},
    {id:'object.boolean-union',label:'路徑布林：聯集',route:'native',action:'booleanUnion'},
    {id:'object.boolean-difference',label:'路徑布林：差集',route:'native',action:'booleanDifference'},
    {id:'object.boolean-intersection',label:'路徑布林：交集',route:'native',action:'booleanIntersection'},
    {id:'object.boolean-xor',label:'路徑布林：互斥',route:'native',action:'booleanXor'},
    {id:'object.repeat-radial',label:'重複：放射',route:'native',action:'repeatRadial'},
    {id:'object.repeat-mirror',label:'重複：鏡射',route:'native',action:'repeatMirror'},
    {id:'object.repeat-grid',label:'重複：格狀',route:'native',action:'repeatGrid'},
    {id:'object.repeat-expand',label:'重複：展開路徑',route:'native',action:'repeatExpand'}
  ]),
  layer:Object.freeze([
    {id:'layer.panel',label:'圖層面板',route:'panel',panel:'layers',intent:'layers',requires:'panelOpen'},
    {id:'layer.mask',label:'圖層遮色片',route:'entry',action:'unavailable',capability:'layer-mask',requires:'uiEntry:layer-mask'},
    {id:'layer.effects',label:'圖層效果…',route:'entry',action:'unavailable',capability:'layer-effects',requires:'uiEntry:layer-effects'}
  ]),
  type:Object.freeze([
    {id:'type.horizontal',label:'水平／段落文字',route:'tool',tool:'text:horizontal-tb'},
    {id:'type.vertical-rl',label:'垂直文字（右至左）',route:'tool',tool:'text:vertical-rl'},
    {id:'type.vertical-lr',label:'垂直文字（左至右）',route:'tool',tool:'text:vertical-lr'},
    {id:'type.path',label:'文字沿路徑',route:'entry',action:'textOnPath',capability:'text-on-path',requires:'uiEntry:text-on-path'}
  ]),
  view:Object.freeze([
    {id:'view.fit',label:'符合內容',route:'command',command:'view.fit.content.v1'},
    {id:'view.zoom100',label:'100%',route:'command',command:'view.zoom.set.v1',args:{scale:1}},
    {id:'view.creation',label:'創作工作區',route:'command',command:'workspace.activate.v1',args:{space:'creation'}},
    {id:'view.layout',label:'圖紙工作區',route:'command',command:'workspace.activate.v1',args:{space:'layout'}},
    {id:'view.snap',label:'吸附',route:'entry',action:'toggleSnap',args:{key:'enabled'},capability:'snap',requires:'uiEntry:snap'},
    {id:'view.snap-grid',label:'格線吸附',route:'entry',action:'toggleSnap',args:{key:'grid'},capability:'snap',requires:'uiEntry:snap'},
    {id:'view.snap-guides',label:'吸附至參考線',route:'entry',action:'toggleSnap',args:{key:'guides'},capability:'snap',requires:'uiEntry:snap'},
    {id:'view.snap-edges',label:'吸附至物件邊緣',route:'entry',action:'toggleSnap',args:{key:'edges'},capability:'snap',requires:'uiEntry:snap'},
    {id:'view.snap-centers',label:'吸附至物件中心',route:'entry',action:'toggleSnap',args:{key:'centers'},capability:'snap',requires:'uiEntry:snap'},
    {id:'view.snap-angle',label:'吸附至角度',route:'entry',action:'toggleSnap',args:{key:'angle'},capability:'snap',requires:'uiEntry:snap'},
    {id:'view.snap-equal',label:'吸附至等距',route:'entry',action:'toggleSnap',args:{key:'equalDistance'},capability:'snap',requires:'uiEntry:snap'},
    {id:'view.guides-toggle',label:'顯示／隱藏參考線',route:'entry',action:'guideAction',args:{action:'toggle'},capability:'guides',requires:'uiEntry:guides'},
    {id:'view.guides-lock',label:'鎖定／解鎖參考線',route:'entry',action:'guideAction',args:{action:'lock'},capability:'guides',requires:'uiEntry:guides'},
    {id:'view.guides-clear',label:'清除參考線',route:'entry',action:'guideAction',args:{action:'clear'},capability:'guides',requires:'uiEntry:guides'}
  ]),
  window:Object.freeze([
    {id:'window.navigator',label:'導覽器',route:'panel',panel:'navigator',intent:'navigator',requires:'panelOpen'},
    {id:'window.swatches',label:'色票',route:'panel',panel:'swatches',intent:'swatches',requires:'panelOpen'},
    {id:'window.color',label:'顏色',route:'panel',panel:'color',intent:'color',requires:'panelOpen'},
    {id:'window.character',label:'字元',route:'panel',panel:'character',intent:'character',requires:'panelOpen'},
    {id:'window.paragraph',label:'段落',route:'panel',panel:'paragraph',intent:'paragraph',requires:'panelOpen'},
    {id:'window.layers',label:'圖層',route:'panel',panel:'layers',intent:'layers',requires:'panelOpen'},
    {id:'window.history',label:'步驟記錄',route:'panel',panel:'history',intent:'history',requires:'panelOpen'},
    {id:'window.fullscreen',label:'全螢幕',route:'native',action:'toggleFullscreen',home:'primary'},
    {id:'window.preferences',label:'偏好設定…',route:'dialog',dialog:'preferences',home:'primary'}
  ]),
  help:Object.freeze([
    {id:'help.shortcuts',label:'鍵盤快捷鍵…',route:'entry-dialog',dialog:'entry-shortcuts'},
    {id:'help.pen',label:'觸控筆校準…',route:'dialog',dialog:'preferences',args:{category:'tools'}},
    {id:'help.updates',label:'更新／儲存狀態…',route:'dialog',dialog:'preferences',args:{category:'storage'}},
    {id:'help.recovery',label:'復原…',route:'entry-dialog',dialog:'entry-recovery',capability:'recovery',requires:'uiEntry:recovery'},
    {id:'help.diagnostics',label:'產品診斷',route:'dialog',dialog:'diagnostics'}
  ])
});

export const UI_B_002_MENU_LABELS=Object.freeze({file:'檔案',edit:'編輯',image:'影像',select:'選取',filter:'濾鏡',object:'物件',layer:'圖層',type:'文字',view:'檢視',window:'視窗',help:'說明'});

export const UI_B_002_FIXED_TOOLS=Object.freeze({
  select:{id:'select',label:'移動／選取',shortcut:'V',icon:'i-move'},
  eraser:{id:'eraser',label:'橡皮擦',shortcut:'E',icon:'i-eraser'},
  image:{id:'image-import',label:'匯入圖片',shortcut:'',icon:'i-image',route:'dialog',dialog:'import-image'},
  pan:{id:'pan',label:'手形／平移',shortcut:'H',icon:'i-pan'}
});

export const UI_B_002_TOOL_GROUPS=Object.freeze([
  {id:'lasso',label:'套索',icon:'i-lasso',primary:'lasso',tools:[['lasso','套索'],['polygonalLasso','多邊形套索'],['magneticLasso','磁性套索']]},
  {id:'smart-selection',label:'選取',icon:'i-quick-selection',primary:'quickSelection',tools:[['quickSelection','快速選取'],['magicWand','魔術棒'],['objectSelection','物件選取']]},
  {id:'sampling',label:'取樣',icon:'i-eyedropper',primary:'eyedropper',tools:[['eyedropper','滴管'],['colorSampler','顏色取樣'],['measure','測量']]},
  {id:'healing',label:'修復',icon:'i-healing',primary:'spotHealing',tools:[['spotHealing','污點修復'],['healingBrush','修復筆刷'],['patch','修補']]},
  {id:'draw',label:'繪圖',icon:'i-pen',primary:'pen',tools:[['pen','鋼筆'],['pencil','鉛筆'],['marker','麥克筆'],['brush','毛筆'],['airbrush','噴筆'],['blender','混色',{route:'panel',panel:'specialist',intent:'blender'}],['smudge','塗抹',{route:'panel',panel:'specialist',intent:'smudge'}]]},
  {id:'clone',label:'仿製',icon:'i-clone-stamp',primary:'cloneStamp',tools:[['cloneStamp','仿製印章'],['patternStamp','圖樣印章']]},
  {id:'fill',label:'填色',icon:'i-fill',primary:'gradient',tools:[['gradient','漸層'],['paintBucket','油漆桶']]},
  {id:'detail',label:'細節',icon:'i-blur',primary:'localBlur',tools:[['localBlur','模糊'],['localSharpen','銳利化'],['colorReplacement','顏色取代']]},
  {id:'tone',label:'明暗',icon:'i-dodge',primary:'dodge',tools:[['dodge','加亮'],['burn','加深'],['sponge','海綿']]},
  {id:'shape',label:'幾何',icon:'i-shape',primary:'shape:line',tools:[['shape:line','直線'],['shape:arrow','箭頭'],['shape:rect','矩形'],['shape:ellipse','橢圓'],['shape:triangle','三角形']]},
  {id:'text',label:'文字',icon:'i-text',primary:'text:horizontal-tb',tools:[['text:horizontal-tb','水平／段落'],['text:vertical-rl','直排右至左'],['text:vertical-lr','直排左至右']]}
]);

export const UI_B_002_TOOL_LAYOUT=Object.freeze([
  ['fixed','select'],['group','lasso'],['group','smart-selection'],['group','sampling'],['group','healing'],['group','draw'],['group','clone'],['fixed','eraser'],['group','fill'],['group','detail'],['group','tone'],['group','shape'],['group','text'],['fixed','image'],['fixed','pan']
]);

export const UI_B_002_RASTER_OPTIONS=Object.freeze({
  polygonalLasso:['selectionMode'],magneticLasso:['selectionMode','edgeThreshold','searchRadius'],
  quickSelection:['selectionMode','tolerance','edgeThreshold'],magicWand:['selectionMode','tolerance','contiguous'],
  objectSelection:['selectionMode','tolerance','edgeThreshold'],paintBucket:['tolerance','contiguous','opacity'],
  cloneStamp:['radius','opacity','hardness'],patternStamp:['radius','opacity','hardness'],
  healingBrush:['radius','opacity','hardness'],spotHealing:['radius','opacity','hardness'],patch:['radius','opacity'],
  dodge:['radius','strength','hardness'],burn:['radius','strength','hardness'],sponge:['radius','strength','hardness','spongeMode'],
  localBlur:['radius','strength','hardness'],localSharpen:['radius','strength','hardness'],
  colorReplacement:['radius','strength','hardness','tolerance','replacementColor'],
  eyedropper:['sampleRadius'],colorSampler:['sampleRadius'],gradient:['gradientType','gradientStart','gradientEnd','opacity'],measure:[]
});

export const UI_B_002_SOURCE_PINNED_DISPOSITION=Object.freeze([
  {family:'file-interoperability',source:'UI_B_MENU_CONTRIBUTIONS file-external-open/reference/svg/print',home:'File menu',status:'IMPLEMENTED',implemented:['image import','reference extraction dialog','Studio SVG service','native export/print'],owner:'B bounded adapters + existing extraction/Studio/export authorities'},
  {family:'preferences-branding',source:'edit-settings + branding-settings.js',home:'Edit > Preferences/Branding',status:'IMPLEMENTED',owner:'B modular Preferences + existing branding persistence service'},
  {family:'image-mode-color',source:'image-mode-* / image color-mode-*',home:'Image menu',status:'IMPLEMENTED',owner:'B image adapter + image-core + History'},
  {family:'image-raster-size-crop',source:'image-resize/image-crop',home:'Image dialogs',status:'IMPLEMENTED',owner:'B image adapter + image-core + History'},
  {family:'adjustment-filter-stack',source:'image-adjustments/filter-*',home:'Image/Filter menus',status:'MIXED',implemented:'existing image.adjustment.add.v1/image.filter.add.v1',dependencies:['C:adjustments panel','C:specialist liquify']},
  {family:'selection-raster',source:'select-*',home:'Select menu + tool groups',status:'IMPLEMENTED',owner:'existing raster controller'},
  {family:'path-frame-object',source:'object-path-edit/object-frame-selection/object-align-*',home:'Object menu',status:'IMPLEMENTED_OR_BOUNDED_NATIVE',owner:'existing InkApp endpoints/shared object.align command'},
  {family:'boolean-repeat-transform',source:'object boolean/repeat/skew/distort/perspective/warp',home:'Object menu + bounded dialogs',status:'IMPLEMENTED',owner:'B native adapter -> existing Studio/vector authorities',reason:'direct semantic calls; no hidden proxy or duplicate authority'},
  {family:'layers-effects-masks',source:'layer-*',home:'C Layers / optional dialogs',status:'SIBLING_DEPENDENCY',dependencies:['C:layers','B dialogs via A host']},
  {family:'type',source:'type-*',home:'Text tool flyout / C Character/Paragraph',status:'MIXED',implemented:'writing direction tool subtype',dependencies:['C:character/paragraph','path-text existing command family']},
  {family:'view-guides-snap',source:'view-*',home:'View menu + D canvas/navigator',status:'SIBLING_DEPENDENCY',implemented:['fit/100%/workspace'],dependencies:['D:guides/snap/navigator']},
  {family:'diagnostics-help-recovery',source:'help-*',home:'modular dialogs',status:'IMPLEMENTED_OR_EXISTING_OWNER',owner:'B diagnostics dialog + existing recovery/update owners'},
  {family:'blender-smudge',source:'UI_B_TOOL_GROUPS draw',home:'Draw flyout when panelOpen service exists',status:'SIBLING_DEPENDENCY',dependencies:['C:specialist'],reason:'not counted as executable raster controller tools'}
]);

const menuOwner=item=>{
  if(item.route==='command')return'SHARED_COMMAND';
  if(item.route==='native')return'B_BOUNDED_NATIVE_EXISTING_INKAPP';
  if(item.route==='image')return'B_IMAGE_ADAPTER_IMAGE_CORE_HISTORY';
  if(item.route==='file-picker')return'A_FILE_PICKER';
  if(item.route==='global-event')return'EXISTING_SETTINGS_BRANDING';
  if(item.route==='panel')return'C_OPTIONAL_PANEL_SEAM';
  if(item.route==='tool')return'B_TOOL_RUNTIME';
  if(item.route==='dialog')return'B_DIALOG_CONTENT';
  if(item.route==='entry'||item.route==='entry-dialog')return'UI_ENTRY_COMPLETION_003_BOUNDED_ADAPTER';
  return'B_UI';
};
const menuDependency=item=>item.route==='panel'?'C':item.id.startsWith('view.')?'D_COMMAND_SEAM':item.requires==='panelOpen'?'C':null;
const menuPrerequisite=item=>item.requires||((item.id.includes('adjustment')||item.id.startsWith('filter.'))?'selected-raster-target':null);

export const UI_B_002_CONTROL_LEDGER=Object.freeze([
  ...Object.entries(UI_B_002_MENU_ITEMS).flatMap(([menu,items])=>items.map(item=>Object.freeze({
    kind:'menu',id:item.id,home:`${menu}:${item.home||'primary'}`,route:item.route,args:item.args||null,
    availability:item.requires||'route-present',default:null,prerequisites:menuPrerequisite(item),
    nativeOwner:menuOwner(item),integrationDependency:menuDependency(item)
  }))),
  ...Object.values(UI_B_002_FIXED_TOOLS).map(tool=>Object.freeze({
    kind:'fixed-tool',id:tool.id,home:'tools:primary',route:tool.route||'native-tool',args:null,
    availability:'always',default:tool.id==='select',prerequisites:tool.route==='dialog'?'dialog-host':null,
    nativeOwner:tool.route==='dialog'?'B_DIALOG_CONTENT':'SHARED_TOOL_COMMAND',integrationDependency:null
  })),
  ...UI_B_002_TOOL_GROUPS.flatMap(group=>group.tools.map(([id,label,meta])=>Object.freeze({
    kind:'grouped-tool',id,home:`tools:${group.id}`,route:meta?.route||'tool-runtime',args:null,
    availability:meta?.panel?'panelOpen':'always',default:id===group.primary,prerequisites:id==='patternStamp'?'pattern-image':(['cloneStamp','healingBrush','patch'].includes(id)?'source-point':null),
    nativeOwner:meta?.panel?'EXISTING_SPECIALIST_ENGINE':(id.includes(':')?'SHARED_NATIVE_TOOL+B_SUBTYPE':'B_TOOL_RUNTIME/EXISTING_RASTER_OR_NATIVE'),
    integrationDependency:meta?.panel?'C':null,label
  })))
]);

export const UI_B_002_CONTROL_REPORT=Object.freeze({
  menuItemCount:Object.values(UI_B_002_MENU_ITEMS).reduce((sum,items)=>sum+items.length,0),
  fixedToolCount:Object.keys(UI_B_002_FIXED_TOOLS).length,
  toolGroupCount:UI_B_002_TOOL_GROUPS.length,
  groupedToolCount:UI_B_002_TOOL_GROUPS.reduce((sum,group)=>sum+group.tools.length,0),
  sourceDispositionFamilies:UI_B_002_SOURCE_PINNED_DISPOSITION.length,
  ledgerCount:UI_B_002_CONTROL_LEDGER.length,
  integrationDependentCount:UI_B_002_CONTROL_LEDGER.filter(item=>item.integrationDependency).length
});
