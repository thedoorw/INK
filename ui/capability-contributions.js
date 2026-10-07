/*
 * INK UI-B capability contribution registry.
 * UI-only metadata. It does not register Core algorithms or create a second mutation authority.
 */

export const UI_B_MENU_CONTRIBUTIONS = Object.freeze([
  { id:'file-external-open', menu:'file', section:'external', label:'開啟／匯入外部影像…', command:'external-open', authority:'P1-H format interoperability' },
  { id:'file-import-reference', menu:'file', section:'import', label:'匯入參考圖…', command:'reference-import', authority:'Reference import' },
  { id:'file-import-svg', menu:'file', section:'import', label:'匯入 SVG…', command:'svg-import', authority:'SVG import' },
  { id:'file-print', menu:'file', section:'output', label:'列印…', command:'print', authority:'Output/Artboard' },

  { id:'edit-duplicate', menu:'edit', section:'copy', label:'建立副本', command:'duplicate', shortcut:'Ctrl+D', authority:'Document object authority' },
  { id:'edit-delete', menu:'edit', section:'copy', label:'刪除', command:'delete', shortcut:'Delete', authority:'Document object authority' },
  { id:'object-skew', menu:'edit', section:'transform', label:'變形：傾斜…', command:'transform:skew', authority:'P1-C advanced transform' },
  { id:'object-distort', menu:'edit', section:'transform', label:'變形：扭曲…', command:'transform:distort', authority:'P1-C advanced transform' },
  { id:'object-perspective', menu:'edit', section:'transform', label:'變形：透視…', command:'transform:perspective', authority:'P1-C advanced transform' },
  { id:'object-warp', menu:'edit', section:'transform', label:'變形：彎曲…', command:'transform:warp', authority:'P1-C deformation' },
  { id:'help-shortcuts', menu:'edit', section:'settings', label:'鍵盤快捷鍵…', command:'keyboard-shortcuts', authority:'UI help' },
  { id:'edit-settings', menu:'edit', section:'settings', label:'偏好設定…', command:'preferences', authority:'UI settings' },

  { id:'image-mode-8', menu:'image', section:'mode', label:'模式：8-bit', command:'bit-depth:8', authority:'P1-G color management' },
  { id:'image-mode-16', menu:'image', section:'mode', label:'模式：16-bit', command:'bit-depth:16', authority:'P1-G color management' },
  { id:'image-mode-32', menu:'image', section:'mode', label:'模式：32-bit', command:'bit-depth:32', authority:'P1-G color management' },
  { id:'image-mode-rgb', menu:'image', section:'mode', label:'色彩模式：RGB', command:'color-mode:RGB', authority:'P1-G color management' },
  { id:'image-mode-cmyk', menu:'image', section:'mode', label:'色彩模式：CMYK', command:'color-mode:CMYK', authority:'P1-G color management' },
  { id:'image-mode-lab', menu:'image', section:'mode', label:'色彩模式：Lab', command:'color-mode:Lab', authority:'P1-G color management' },
  { id:'image-mode-multi', menu:'image', section:'mode', label:'色彩模式：多色版', command:'color-mode:Multichannel', authority:'P1-G color management', guarded:true },
  { id:'image-profile', menu:'image', section:'color', label:'色彩描述檔…', command:'color-profile', authority:'P1-G ICC' },
  { id:'image-adjustments', menu:'image', section:'adjustment', label:'調整…', command:'panel:adjustments', authority:'C24 adjustment stack' },
  { id:'image-crop', menu:'image', section:'raster', label:'裁切選取影像…', command:'image-crop', authority:'C22 raster image' },
  { id:'image-resize', menu:'image', section:'raster', label:'影像尺寸…', command:'image-resize', authority:'C22 raster image' },

  { id:'layer-new', menu:'layer', section:'lifecycle', label:'新增圖層', command:'layer-new', authority:'Layers' },
  { id:'layer-duplicate', menu:'layer', section:'lifecycle', label:'複製圖層', command:'layer-duplicate', authority:'Layers' },
  { id:'layer-delete', menu:'layer', section:'lifecycle', label:'刪除圖層', command:'layer-delete', authority:'Layers' },
  { id:'layer-group', menu:'layer', section:'hierarchy', label:'群組選取', command:'group', authority:'Document hierarchy' },
  { id:'layer-ungroup', menu:'layer', section:'hierarchy', label:'解散群組', command:'ungroup', authority:'Document hierarchy' },
  { id:'layer-mask-add', menu:'layer', section:'mask', label:'建立遮色片', command:'mask-add', authority:'C23 mask' },
  { id:'layer-mask-select', menu:'layer', section:'mask', label:'選取並遮住…', command:'select-and-mask', authority:'C23/P1-A refine selection' },
  { id:'layer-effects', menu:'layer', section:'effect', label:'圖層效果…', command:'layer-effects', authority:'C27 layer effects' },

  { id:'type-horizontal', menu:'type', section:'type', label:'水平／段落文字', command:'text-mode:horizontal-tb', authority:'P1-C text object' },
  { id:'type-vertical-rl', menu:'type', section:'type', label:'垂直文字（右至左）', command:'text-mode:vertical-rl', authority:'P1-C text object' },
  { id:'type-vertical-lr', menu:'type', section:'type', label:'垂直文字（左至右）', command:'text-mode:vertical-lr', authority:'P1-C text object' },
  { id:'type-path', menu:'type', section:'path', label:'文字沿路徑…', command:'text-on-path', authority:'P1-C text layout' },

  { id:'select-all', menu:'select', section:'selection', label:'全部選取', command:'select-all', shortcut:'Ctrl+A', authority:'Selection' },
  { id:'select-clear', menu:'select', section:'selection', label:'取消選取', command:'select-clear', authority:'Selection' },
  { id:'select-polygon', menu:'select', section:'raster', label:'多邊形套索', command:'tool:polygonalLasso', authority:'P1-A selection' },
  { id:'select-magnetic', menu:'select', section:'raster', label:'磁性套索', command:'tool:magneticLasso', authority:'P1-E selection' },
  { id:'select-quick', menu:'select', section:'raster', label:'快速選取', command:'tool:quickSelection', authority:'P1-A selection' },
  { id:'select-magic', menu:'select', section:'raster', label:'魔術棒', command:'tool:magicWand', authority:'P1-A selection' },
  { id:'select-object', menu:'select', section:'raster', label:'物件選取', command:'tool:objectSelection', authority:'P1-E selection' },
  { id:'select-refine', menu:'select', section:'refine', label:'選取並遮住…', command:'select-and-mask', authority:'P1-A refine selection' },

  { id:'filter-gallery', menu:'filter', section:'gallery', label:'濾鏡收藏館…', command:'filter-gallery', authority:'C25/P1-F filter stack' },
  { id:'filter-gaussian', menu:'filter', section:'blur', label:'高斯模糊…', command:'filter:gaussianBlur', authority:'C25 filter stack' },
  { id:'filter-motion', menu:'filter', section:'blur', label:'動態模糊…', command:'filter:motionBlur', authority:'P1-F filter stack' },
  { id:'filter-median', menu:'filter', section:'noise', label:'中間值…', command:'filter:median', authority:'P1-F filter stack' },
  { id:'filter-sharpen', menu:'filter', section:'sharpen', label:'銳利化', command:'filter:sharpen', authority:'C25 filter stack' },
  { id:'filter-unsharp', menu:'filter', section:'sharpen', label:'遮色片銳利化…', command:'filter:unsharpMask', authority:'P1-F filter stack' },
  { id:'filter-highpass', menu:'filter', section:'edge', label:'顏色快調…', command:'filter:highPass', authority:'C25 filter stack' },
  { id:'filter-edge', menu:'filter', section:'edge', label:'邊緣偵測…', command:'filter:edgeDetection', authority:'C25 filter stack' },
  { id:'filter-noise', menu:'filter', section:'noise', label:'雜訊／顆粒…', command:'filter:noiseGrain', authority:'C25 filter stack' },
  { id:'filter-reduce-noise', menu:'filter', section:'noise', label:'減少雜訊…', command:'filter:reduceNoise', authority:'P1-F filter stack' },
  { id:'filter-texture', menu:'filter', section:'texture', label:'紋理疊加…', command:'filter:textureOverlay', authority:'C25 filter stack' },
  { id:'filter-emboss', menu:'filter', section:'stylize', label:'浮雕…', command:'filter:emboss', authority:'P1-F filter stack' },
  { id:'filter-mosaic', menu:'filter', section:'pixelate', label:'馬賽克／像素化…', command:'filter:mosaic', authority:'P1-F filter stack' },
  { id:'filter-minimum', menu:'filter', section:'other', label:'最小值…', command:'filter:minimum', authority:'P1-F filter stack' },
  { id:'filter-maximum', menu:'filter', section:'other', label:'最大值…', command:'filter:maximum', authority:'P1-F filter stack' },
  { id:'filter-liquify', menu:'filter', section:'workspace', label:'液化…', command:'liquify', authority:'P1-F liquify' },

  { id:'object-front', menu:'object', section:'arrange', label:'移至最上', command:'arrange:front', authority:'Document hierarchy' },
  { id:'object-back', menu:'object', section:'arrange', label:'移至最下', command:'arrange:back', authority:'Document hierarchy' },
  { id:'object-group', menu:'object', section:'hierarchy', label:'群組', command:'group', shortcut:'Ctrl+G', authority:'Document hierarchy' },
  { id:'object-ungroup', menu:'object', section:'hierarchy', label:'解散群組', command:'ungroup', shortcut:'Ctrl+Shift+G', authority:'Document hierarchy' },
  { id:'object-align-left', menu:'object', section:'align', label:'對齊：靠左', command:'align:left', authority:'Existing alignSelection' },
  { id:'object-align-center-x', menu:'object', section:'align', label:'對齊：水平置中', command:'align:centerX', authority:'Existing alignSelection' },
  { id:'object-align-right', menu:'object', section:'align', label:'對齊：靠右', command:'align:right', authority:'Existing alignSelection' },
  { id:'object-align-top', menu:'object', section:'align', label:'對齊：靠上', command:'align:top', authority:'Existing alignSelection' },
  { id:'object-align-center-y', menu:'object', section:'align', label:'對齊：垂直置中', command:'align:centerY', authority:'Existing alignSelection' },
  { id:'object-align-bottom', menu:'object', section:'align', label:'對齊：靠下', command:'align:bottom', authority:'Existing alignSelection' },
  { id:'object-distribute-x', menu:'object', section:'align', label:'分布：水平等距', command:'align:distributeX', authority:'Existing alignSelection' },
  { id:'object-distribute-y', menu:'object', section:'align', label:'分布：垂直等距', command:'align:distributeY', authority:'Existing alignSelection' },
  { id:'object-frame-selection', menu:'object', section:'structure', label:'建立框架', command:'frame-selection', authority:'Existing frameSelection' },
  { id:'object-path-edit', menu:'object', section:'path', label:'路徑／節點編輯', command:'proxy:pathEditToggle', authority:'Existing Path edit endpoint' },
  { id:'object-boolean-union', menu:'object', section:'path', label:'路徑布林：聯集', command:'proxy:booleanUnion', authority:'Existing boolean authority' },
  { id:'object-boolean-difference', menu:'object', section:'path', label:'路徑布林：差集', command:'proxy:booleanDifference', authority:'Existing boolean authority' },
  { id:'object-boolean-intersection', menu:'object', section:'path', label:'路徑布林：交集', command:'proxy:booleanIntersection', authority:'Existing boolean authority' },
  { id:'object-boolean-xor', menu:'object', section:'path', label:'路徑布林：互斥', command:'proxy:booleanXor', authority:'Existing boolean authority' },
  { id:'object-repeat-radial', menu:'object', section:'repeat', label:'重複：放射', command:'proxy:repeatRadial', authority:'Existing Repeat authority' },
  { id:'object-repeat-mirror', menu:'object', section:'repeat', label:'重複：鏡射', command:'proxy:repeatMirror', authority:'Existing Repeat authority' },
  { id:'object-repeat-grid', menu:'object', section:'repeat', label:'重複：格狀', command:'proxy:repeatGrid', authority:'Existing Repeat authority' },
  { id:'object-repeat-expand', menu:'object', section:'repeat', label:'重複：展開路徑', command:'proxy:repeatExpand', authority:'Existing Repeat authority' },

  { id:'view-grid', menu:'view', section:'guide', label:'格線吸附', command:'snap:grid', authority:'page.snap' },
  { id:'view-snap', menu:'view', section:'snap', label:'吸附', command:'snap:enabled', authority:'page.snap' },
  { id:'view-snap-guides', menu:'view', section:'snap', label:'吸附至參考線', command:'snap:guides', authority:'page.snap' },
  { id:'view-snap-edges', menu:'view', section:'snap', label:'吸附至物件邊緣', command:'snap:edges', authority:'page.snap' },
  { id:'view-snap-centers', menu:'view', section:'snap', label:'吸附至物件中心', command:'snap:centers', authority:'page.snap' },
  { id:'view-snap-angle', menu:'view', section:'snap', label:'吸附至角度', command:'snap:angle', authority:'page.snap' },
  { id:'view-snap-equal', menu:'view', section:'snap', label:'吸附至等距', command:'snap:equalDistance', authority:'page.snap' },
  { id:'view-guides-show', menu:'view', section:'guide', label:'顯示／隱藏參考線', command:'guides:toggle', authority:'Document guides' },
  { id:'view-guides-lock', menu:'view', section:'guide', label:'鎖定／解鎖參考線', command:'guides:lock', authority:'Document guides' },
  { id:'view-guides-clear', menu:'view', section:'guide', label:'清除參考線', command:'guides:clear', authority:'Document guides' },
  { id:'view-workspace-layout', menu:'view', section:'workspace', label:'文件符合視窗', command:'workspace:fit-current', authority:'Workspace' },

  { id:'help-updates', menu:'help', section:'help', label:'更新', command:'updates', authority:'PWA update manager' },
  { id:'help-diagnostics', menu:'help', section:'help', label:'產品診斷', command:'panel:specialist', authority:'Product health' },
  { id:'help-pen', menu:'help', section:'help', label:'觸控筆校準…', command:'pen-calibration', authority:'Device calibration' },
  { id:'help-recovery', menu:'help', section:'recovery', label:'復原…', command:'recovery', authority:'Storage checkpoint recovery' }
]);

// Contextual fields list only parameters consumed by the existing raster adapter.
// Values remain owned by createRasterToolController.options/setOption.
export const UI_B_RASTER_OPTION_FIELDS = Object.freeze({
  polygonalLasso:['selectionMode'],
  magneticLasso:['selectionMode','edgeThreshold','searchRadius'],
  quickSelection:['selectionMode','tolerance','edgeThreshold'],
  magicWand:['selectionMode','tolerance','contiguous'],
  objectSelection:['selectionMode','tolerance','edgeThreshold'],
  paintBucket:['tolerance','contiguous','opacity'],
  cloneStamp:['radius','opacity','hardness'],
  patternStamp:['radius','opacity','hardness'],
  healingBrush:['radius','opacity','hardness'],
  spotHealing:['radius','opacity','hardness'],
  patch:['radius','opacity'],
  dodge:['radius','strength','hardness'],
  burn:['radius','strength','hardness'],
  sponge:['radius','strength','hardness','spongeMode'],
  localBlur:['radius','strength','hardness'],
  localSharpen:['radius','strength','hardness'],
  colorReplacement:['radius','strength','hardness','tolerance','replacementColor'],
  eyedropper:['sampleRadius'],colorSampler:['sampleRadius'],
  gradient:['gradientType','gradientStart','gradientEnd','opacity'],measure:[]
});

// Context routes describe existing handlers; they do not own tool/selection state.
export const UI_B_NATIVE_OPTION_ROUTES = Object.freeze({
  select:['select-all','select-clear'], lasso:['select-all','select-clear'],
  pan:['zoom-out','zoom-in','fit-content','reset-view'],
  shape:['snap-angle'], text:['text-direction'],
  blender:['paint-replay','stroke-session'], smudge:['paint-replay','stroke-session']
});

export const UI_B_TOOL_GROUPS = Object.freeze([
  { id:'draw', label:'繪圖', icon:'✎', primary:'pen', tools:[
    ['pen','鋼筆'],['pencil','鉛筆'],['marker','麥克筆'],['brush','毛筆'],['airbrush','噴筆'],['blender','混色'],['smudge','塗抹']
  ]},
  { id:'lasso', label:'套索', icon:'⌁', primary:'lasso', tools:[
    ['lasso','套索'],['polygonalLasso','多邊形套索'],['magneticLasso','磁性套索']
  ]},
  { id:'smart-selection', label:'選取', icon:'◫', primary:'quickSelection', tools:[
    ['quickSelection','快速選取'],['magicWand','魔術棒'],['objectSelection','物件選取']
  ]},
  { id:'fill', label:'填色', icon:'◩', primary:'gradient', tools:[
    ['gradient','漸層'],['paintBucket','油漆桶']
  ]},
  { id:'sampling', label:'取樣', icon:'⌖', primary:'eyedropper', tools:[
    ['eyedropper','滴管'],['colorSampler','顏色取樣'],['measure','測量']
  ]},
  { id:'clone', label:'仿製', icon:'♧', primary:'cloneStamp', tools:[
    ['cloneStamp','仿製印章'],['patternStamp','圖樣印章']
  ]},
  { id:'healing', label:'修復', icon:'✚', primary:'spotHealing', tools:[
    ['healingBrush','修復筆刷'],['spotHealing','污點修復'],['patch','修補']
  ]},
  { id:'tone', label:'明暗', icon:'◐', primary:'dodge', tools:[
    ['dodge','加亮'],['burn','加深'],['sponge','海綿']
  ]},
  { id:'detail', label:'細節', icon:'◌', primary:'localBlur', tools:[
    ['localBlur','模糊'],['localSharpen','銳利化'],['colorReplacement','顏色取代']
  ]},
  { id:'shape', label:'幾何', icon:'◇', primary:'shape:line', tools:[
    ['shape:line','直線'],['shape:arrow','箭頭'],['shape:rect','矩形'],['shape:ellipse','橢圓'],['shape:triangle','三角形']
  ]},
  { id:'text', label:'文字', icon:'T', primary:'text:horizontal-tb', tools:[
    ['text:horizontal-tb','水平／段落'],['text:vertical-rl','直排右至左'],['text:vertical-lr','直排左至右']
  ]}
]);

export const UI_B_DIALOGS = Object.freeze([
  'select-and-mask','layer-effects','filter-params','filter-gallery','liquify',
  'gradient-editor','pattern-editor','color-profile','image-size','image-crop',
  'advanced-transform','keyboard-shortcuts','pen-calibration','recovery'
]);

export const UI_B_REQUIRED_PANELS = Object.freeze([
  'properties','layers','history','navigator','pages','color','channels','adjustments',
  'libraries','reference','compose','chat','revision','specialist'
]);

export const UI_B_GAP_IDS = Object.freeze(Array.from({length:34},(_,index)=>`G-${String(index+1).padStart(2,'0')}`));
export const UI_B_PUI_IDS = Object.freeze(Array.from({length:74},(_,index)=>`PUI-${String(index+1).padStart(3,'0')}`));

export function validateUiBContributions({
  menus=UI_B_MENU_CONTRIBUTIONS,
  toolGroups=UI_B_TOOL_GROUPS,
  dialogs=UI_B_DIALOGS,
  panels=UI_B_REQUIRED_PANELS
}={}){
  const ids=new Set(),commands=new Map();
  const add=(id,type)=>{
    if(!id||ids.has(id))throw new Error(`INK_UI_B_DUPLICATE_CONTRIBUTION_ID:${id}`);
    ids.add(id);
    if(!type)throw new Error(`INK_UI_B_CONTRIBUTION_TYPE_REQUIRED:${id}`);
  };
  for(const entry of menus){
    add(entry.id,'menu');
    if(!entry.menu||!entry.command||!entry.authority)throw new Error(`INK_UI_B_MENU_CONTRIBUTION_INVALID:${entry.id}`);
    if(!commands.has(entry.command))commands.set(entry.command,[]);
    commands.get(entry.command).push(entry.id);
  }
  for(const group of toolGroups){
    add(`tool-group:${group.id}`,'tool-group');
    if(!Array.isArray(group.tools)||!group.tools.length)throw new Error(`INK_UI_B_TOOL_GROUP_EMPTY:${group.id}`);
    const local=new Set();
    for(const [tool] of group.tools){
      if(local.has(tool))throw new Error(`INK_UI_B_DUPLICATE_TOOL_IN_GROUP:${tool}`);
      local.add(tool);
    }
  }
  for(const id of dialogs)add(`dialog:${id}`,'dialog');
  for(const id of panels)add(`panel:${id}`,'panel');
  return Object.freeze({
    contributionIds:Object.freeze([...ids]),
    commands:Object.freeze([...commands.keys()]),
    menuCount:menus.length,
    toolGroupCount:toolGroups.length,
    dialogCount:dialogs.length,
    panelCount:panels.length
  });
}

export const UI_B_CONTRIBUTION_REPORT=validateUiBContributions();
