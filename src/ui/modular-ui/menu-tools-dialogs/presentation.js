const tool=(label,icon)=>Object.freeze({label,icon});

export const UI_B_TOOL_PRESENTATION=Object.freeze({
  select:tool('移動／選取','i-move'),
  lasso:tool('套索','i-lasso'),polygonalLasso:tool('多邊形套索','i-lasso'),magneticLasso:tool('磁性套索','i-spark'),
  quickSelection:tool('快速選取','i-quick-selection'),magicWand:tool('魔術棒','i-spark'),objectSelection:tool('物件選取','i-object-select'),
  eyedropper:tool('滴管','i-eyedropper'),colorSampler:tool('顏色取樣','i-select'),measure:tool('測量','i-layout'),
  spotHealing:tool('污點修復','i-healing'),healingBrush:tool('修復筆刷','i-brush'),patch:tool('修補','i-mask'),
  pen:tool('鋼筆','i-pen'),pencil:tool('鉛筆','i-pencil'),marker:tool('麥克筆','i-marker'),brush:tool('毛筆','i-brush'),airbrush:tool('噴筆','i-airbrush'),blender:tool('混色','i-sliders'),smudge:tool('塗抹','i-brush'),
  cloneStamp:tool('仿製印章','i-clone-stamp'),patternStamp:tool('圖樣印章','i-layout'),eraser:tool('橡皮擦','i-eraser'),
  gradient:tool('漸層','i-fill'),paintBucket:tool('油漆桶','i-fill'),localBlur:tool('模糊','i-blur'),localSharpen:tool('銳利化','i-spark'),colorReplacement:tool('顏色取代','i-eyedropper'),
  dodge:tool('加亮','i-dodge'),burn:tool('加深','i-dodge'),sponge:tool('海綿','i-blur'),
  'shape:line':tool('直線','i-shape'),'shape:arrow':tool('箭頭','i-shape'),'shape:rect':tool('矩形','i-frame'),'shape:ellipse':tool('橢圓','i-shape'),'shape:triangle':tool('三角形','i-shape'),
  'text:horizontal-tb':tool('水平／段落文字','i-text'),'text:vertical-rl':tool('直排文字（右至左）','i-text'),'text:vertical-lr':tool('直排文字（左至右）','i-text'),
  'image-import':tool('匯入圖片','i-image'),pan:tool('手形／平移','i-pan')
});

export function toolPresentation(id,{label='工具',icon='i-select'}={}){
  return UI_B_TOOL_PRESENTATION[id]||Object.freeze({label,icon});
}

export const UI_B_SELECTION_MODE_LABELS=Object.freeze({new:'新增選取範圍',add:'加入選取範圍',subtract:'減去選取範圍',intersect:'交集選取範圍'});
export const UI_B_SHAPE_LABELS=Object.freeze({line:'直線',arrow:'箭頭',rect:'矩形',ellipse:'橢圓',triangle:'三角形'});
export const UI_B_TEXT_DIRECTION_LABELS=Object.freeze({'horizontal-tb':'水平','vertical-rl':'垂直（右至左）','vertical-lr':'垂直（左至右）'});

export const UI_B_FILTER_LABELS=Object.freeze({
  gaussianBlur:'高斯模糊',sharpen:'銳利化',highPass:'高反差保留',edgeDetection:'邊緣偵測',noiseGrain:'雜訊顆粒',textureOverlay:'紋理覆蓋',
  motionBlur:'動態模糊',median:'中間值',unsharpMask:'遮色片銳利化',emboss:'浮雕',mosaic:'馬賽克',minimum:'最小值',maximum:'最大值',reduceNoise:'減少雜訊',liquify:'液化'
});
export const UI_B_FILTER_GROUP_LABELS=Object.freeze({blur:'模糊',noise:'雜訊',sharpen:'銳利化',stylize:'風格化',pixelate:'像素化',other:'其他'});
export const UI_B_FILTER_FIELD_LABELS=Object.freeze({radius:'半徑',amount:'程度',distance:'距離',angle:'角度',size:'尺寸',strength:'強度',preserveEdges:'保留邊緣',scale:'縮放',threshold:'臨界值',opacity:'透明度'});
export const UI_B_FILTER_FIELD_UNITS=Object.freeze({radius:'px',distance:'px',angle:'°',size:'px',strength:'%',preserveEdges:'%',scale:'×',threshold:''});

export function filterLabel(id,fallback='濾鏡'){return UI_B_FILTER_LABELS[id]||fallback;}
export function filterGroupLabel(id){return UI_B_FILTER_GROUP_LABELS[id]||'其他';}
export function filterFieldLabel(id){return UI_B_FILTER_FIELD_LABELS[id]||'參數';}
export function filterFieldUnit(id){return UI_B_FILTER_FIELD_UNITS[id]??'';}
