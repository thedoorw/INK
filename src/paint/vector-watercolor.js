import { stableCompositeId, stableHash } from '../core/stable-id.js';
import { createAnchor, createPath, createVectorGroup } from '../vector/vector-core.js';
import { DeterministicRandom } from '../program-import/expression-ir.js';
const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const round6 = value => +Number(value||0).toFixed(6);
const hexToRgb = color => { const text=String(color||'#000000').replace('#',''); const full=text.length===3?text.split('').map(x=>x+x).join(''):text.padEnd(6,'0').slice(0,6); return {r:parseInt(full.slice(0,2),16)||0,g:parseInt(full.slice(2,4),16)||0,b:parseInt(full.slice(4,6),16)||0}; };
const rgbToHex = ({r,g,b}) => `#${[r,g,b].map(value=>clamp(Math.round(value),0,255).toString(16).padStart(2,'0')).join('')}`;
const varyColor = (color, amount=0) => { const rgb=hexToRgb(color); return rgbToHex({r:rgb.r+amount,g:rgb.g+amount*.58,b:rgb.b+amount*.82}); };
const profile = (value, fallback) => Array.isArray(value)&&value.length?value.map(Number):fallback;
const scaleLocalMatrix = (matrix,sx=1,sy=1,dx=0,dy=0) => { const m=Array.isArray(matrix)&&matrix.length===6?matrix:[1,0,0,1,0,0]; return [m[0]*sx,m[1]*sx,m[2]*sy,m[3]*sy,m[4]+dx,m[5]+dy]; };


export const VECTOR_BRUSH_LIBRARY_FORMAT = 'INK-VECTOR-BRUSH-LIBRARY';
export function ensureVectorBrushLibrary(document) { document.vectorBrushLibrary ||= { format:VECTOR_BRUSH_LIBRARY_FORMAT,version:'1.0',materials:[] }; return document.vectorBrushLibrary; }
export function createVectorBrushMaterial(raw = {}) {
  if (!raw.brushId) throw new Error('INK_VECTOR_BRUSH_ID_REQUIRED');
  const material = {
    brushId:raw.brushId,
    brushVersion:String(raw.brushVersion||'2.0.0'),
    brushType:raw.brushType||'generic-vector-path-brush',
    sourceType:raw.sourceType||'procedural-vector',
    sourceAsset:raw.sourceAsset||null,
    brushArtwork:clone(raw.brushArtwork||{type:'INK_PROCEDURAL_BRUSH_ARTWORK',profile:'soft-irregular'}),
    brushMask:clone(raw.brushMask||{type:'VECTOR_EDGE_MASK',enabled:true}),
    edgeProfile:profile(raw.edgeProfile,[.18,.42,.72,1,.68,.36,.14]),
    opacityProfile:profile(raw.opacityProfile,[.18,.32,.52,.68,.48,.25]),
    pigmentDensityProfile:profile(raw.pigmentDensityProfile,[.22,.36,.72,1,.58,.28]),
    strokeVariation:clamp(Number(raw.strokeVariation??.26),0,1),
    widthVariation:clamp(Number(raw.widthVariation??.24),0,1),
    rotationVariation:clamp(Number(raw.rotationVariation??.04),0,1),
    spacingVariation:clamp(Number(raw.spacingVariation??.2),0,1),
    colorVariation:clamp(Number(raw.colorVariation??.12),0,1),
    grainReference:clone(raw.grainReference||null),
    assetLicense:clone(raw.assetLicense||{id:'INK-PROJECT-ORIGINAL',redistributable:true}),
    assetHash:raw.assetHash||null,
    renderMode:['VECTOR','RASTER','HYBRID'].includes(raw.renderMode)?raw.renderMode:'VECTOR',
    strokeWidth:Number(raw.strokeWidth??10),
    scale:Number(raw.scale??1),
    spacing:Number(raw.spacing??.18),
    direction:raw.direction||'along-path',
    opacity:clamp(Number(raw.opacity??.28),0,1),
    blendMode:raw.blendMode||'multiply',
    colorization:raw.colorization||'tint',
    color:raw.color||'#bf5973',
    seed:Number(raw.seed??1),
    dependencies:clone(raw.dependencies||[]),
    validationState:raw.validationState||'VALIDATION REQUIRED',
    layerCount:Math.max(2,Math.round(raw.layerCount??7)),
    jitter:Number(raw.jitter??1.8),
    enabledVariation:raw.enabledVariation!==false,
    metadata:clone(raw.metadata||{})
  };
  material.materialHash = stableHash({ ...material, materialHash:undefined }); return material;
}
export function registerVectorBrushMaterial(document, raw) { const lib=ensureVectorBrushLibrary(document),material=createVectorBrushMaterial(raw),index=lib.materials.findIndex(item=>item.brushId===material.brushId&&item.brushVersion===material.brushVersion); if(index>=0)lib.materials[index]=material;else lib.materials.push(material); return clone(material); }
export function getVectorBrushMaterial(document, brushId, version = null) { const values=ensureVectorBrushLibrary(document).materials.filter(item=>item.brushId===brushId); const material=version?values.find(item=>item.brushVersion===String(version)):values.at(-1); if(!material)throw new Error(`INK_VECTOR_BRUSH_NOT_FOUND:${brushId}`);return clone(material); }

function offsetMatrix(matrix,dx,dy){const value=Array.isArray(matrix)&&matrix.length===6?matrix:[1,0,0,1,0,0];return[value[0],value[1],value[2],value[3],value[4]+dx,value[5]+dy];}
function layerPath(source, groupId, material, index, random, overrides={}) {
  const dx=(random.next()-.5)*material.jitter*2,dy=(random.next()-.5)*material.jitter*2,width=material.strokeWidth*material.scale*(1+(random.next()-.5)*2*material.widthVariation),opacity=clamp(material.opacity*(.72+random.next()*.56),0,1);
  return createPath({ ...clone(source),id:stableCompositeId(groupId,['stroke-layer',index]),name:`${source.name||'Path'} · Watercolor ${index+1}`,fill:'none',stroke:overrides.color||material.color,strokeWidth:width,opacity,lineCap:'round',lineJoin:'round',matrix:offsetMatrix(source.matrix,dx,dy),blendMode:overrides.blendMode||material.blendMode,metadata:{...clone(source.metadata||{}),watercolorLayer:index,brushId:material.brushId,brushVersion:material.brushVersion,seed:material.seed} });
}

export function createPathWatercolorStroke(sourcePath, material, options={}) {
  if (!sourcePath || sourcePath.type!=='path') throw new Error('INK_WATERCOLOR_PATH_REQUIRED');
  const brush=createVectorBrushMaterial({ ...material,...options,brushId:material.brushId||options.brushId }),id=options.id||stableCompositeId(sourcePath.id,['vector-watercolor',brush.brushId,brush.brushVersion,options.semanticRole||'stroke']),random=new DeterministicRandom(options.seed??brush.seed),layers=Array.from({length:brush.layerCount},(_,index)=>layerPath(sourcePath,id,brush,index,random,options));
  const group=createVectorGroup(layers,{id,name:options.name||`${sourcePath.name||'Path'} · Vector Watercolor`,opacity:options.groupOpacity??1,blendMode:brush.blendMode});
  group.vectorBrushInstance={format:'INK-VECTOR-BRUSH-INSTANCE',version:'1.0',instanceId:id,brushId:brush.brushId,brushVersion:brush.brushVersion,sourcePathId:sourcePath.id,editablePath:clone(sourcePath),parameterOverrides:clone(options),seed:options.seed??brush.seed,deterministic:true,localRecompute:true};
  group.metadata={semanticRole:options.semanticRole||'watercolor-stroke',renderer:'INK_VECTOR_WATERCOLOR_V1'}; return group;
}

export function createWatercolorPetal(sourcePath, material, options={}) {
  const id=options.id||stableCompositeId(sourcePath.id,['watercolor-petal']),baseLayers=Array.from({length:4},(_,index)=>createPath({ ...clone(sourcePath),id:stableCompositeId(id,['wash',index]),fill:options.color||material.color,stroke:'none',opacity:.07+index*.025,matrix:offsetMatrix(sourcePath.matrix,(index-1.5)*.55,(1.5-index)*.35),blendMode:options.blendMode||material.blendMode,metadata:{...clone(sourcePath.metadata||{}),watercolorWash:index} }));
  const edge=createPathWatercolorStroke({ ...clone(sourcePath),fill:'none' },material,{...options,id:stableCompositeId(id,['edge']),strokeWidth:(options.strokeWidth||material.strokeWidth)*.45,layerCount:4,opacity:(options.opacity||material.opacity)*.72});
  const group=createVectorGroup([...baseLayers,edge],{id,name:options.name||'Watercolor Petal',blendMode:options.blendMode||material.blendMode}); group.metadata={semanticRole:options.semanticRole||'watercolor-petal',structure:'editable-vector-composite'}; return group;
}

export function createWatercolorWash({id='watercolor-wash',x=60,y=80,width=674,height=940,color='#df91a8',opacity=.08,blendMode='multiply'}={}) { const path=createPath({id:`${id}:path`,name:'Watercolor Wash',subpaths:[{closed:true,role:'outer',anchors:[createAnchor(x,y),createAnchor(x+width,y+20),createAnchor(x+width-10,y+height),createAnchor(x+15,y+height-15)]}],fill:color,stroke:'none',opacity,blendMode,metadata:{semanticRole:'wash-layer'}}); return createVectorGroup([path],{id,name:'Watercolor Wash Layer',blendMode}); }
export function createVectorSplatter({id='vector-splatter',count=24,center={x:397,y:480},radius=250,color='#9f4162',seed=1,opacity=.24}={}) { const random=new DeterministicRandom(seed),children=[]; for(let index=0;index<count;index++){const angle=random.bounded(0,Math.PI*2),distance=Math.sqrt(random.next())*radius,r=random.bounded(1.2,5.2),cx=center.x+Math.cos(angle)*distance,cy=center.y+Math.sin(angle)*distance,k=.5522847498;children.push(createPath({id:stableCompositeId(id,['drop',index]),name:`Splatter ${index+1}`,subpaths:[{closed:true,role:'outer',anchors:[createAnchor(cx+r,cy,{x:0,y:-r*k},{x:0,y:r*k}),createAnchor(cx,cy+r,{x:r*k,y:0},{x:-r*k,y:0}),createAnchor(cx-r,cy,{x:0,y:r*k},{x:0,y:-r*k}),createAnchor(cx,cy-r,{x:-r*k,y:0},{x:r*k,y:0})]}],fill:color,stroke:'none',opacity:opacity*random.bounded(.6,1),blendMode:'multiply',metadata:{semanticRole:'splatter'}}));} return createVectorGroup(children,{id,name:'Vector Watercolor Splatter',blendMode:'multiply'}); }
export function createPaperTextureReference({id='paper-reference',sourceAsset=null}={}) { return { id,type:'group',name:'Paper Texture Reference',matrix:[1,0,0,1,0,0],opacity:1,blendMode:'source-over',children:[],paperTextureReference:{sourceAsset,hybrid:true,rendered:false,reason:'RASTER_ASSET_REQUIRED'},metadata:{semanticRole:'paper-texture-reference',validationState:'RESEARCH'} }; }
export function vectorWatercolorReport(document) { const lib=ensureVectorBrushLibrary(document),objects=[];const walk=object=>{objects.push(object);for(const child of object.children||[])walk(child);if(object.source)walk(object.source);};for(const page of document.pages)for(const layer of page.layers)for(const object of layer.objects||[])walk(object);const instances=objects.filter(object=>object.vectorBrushInstance),hybrid=objects.filter(object=>object.paperTextureReference);return {format:'INK-VECTOR-WATERCOLOR-REPORT',version:'1.0',brushMaterials:lib.materials.length,instances:instances.length,deterministic:instances.every(item=>item.vectorBrushInstance.deterministic),hybridDependencies:hybrid.length}; }


function openCenterStroke(sourcePath,{id,color,opacity,width,offset=0,blendMode='multiply',dash=[]}={}) {
  const sub=sourcePath.subpaths?.[0], anchors=sub?.anchors||[];
  if (!anchors.length) return null;
  const ys=anchors.map(a=>a.y), xs=anchors.map(a=>a.x), minY=Math.min(...ys), maxY=Math.max(...ys), centerX=(Math.min(...xs)+Math.max(...xs))/2;
  const a0=createAnchor(centerX,minY+(maxY-minY)*.12,null,{x:offset,y:-(maxY-minY)*.18},{id:`${id}:a0`,mode:'smooth'});
  const a1=createAnchor(centerX+offset,maxY-(maxY-minY)*.08,{x:-offset,y:(maxY-minY)*.18},null,{id:`${id}:a1`,mode:'smooth'});
  return createPath({id,name:'Pigment concentration stroke',subpaths:[{closed:false,role:'outer',anchors:[a0,a1]}],fill:'none',stroke:color,strokeWidth:width,opacity,blendMode,dash,lineCap:'round',matrix:clone(sourcePath.matrix),metadata:{semanticRole:'pigment-concentration',sourcePathId:sourcePath.id}});
}

function irregularStrokeLayer(source,groupId,material,index,random,options={}) {
  const enabled=material.enabledVariation!==false;
  const variation=enabled?material.strokeVariation:0;
  const edge=material.edgeProfile[index%material.edgeProfile.length]??.5;
  const opacityProfile=material.opacityProfile[index%material.opacityProfile.length]??.5;
  const widthNoise=enabled?(random.next()-.5)*2*material.widthVariation:0;
  const dx=enabled?(random.next()-.5)*material.jitter*2:0;
  const dy=enabled?(random.next()-.5)*material.jitter*2:0;
  const rotation=enabled?(random.next()-.5)*material.rotationVariation:0;
  const colorShift=enabled?(random.next()-.5)*2*material.colorVariation*38:0;
  const base=material.strokeWidth*material.scale;
  const width=Math.max(.25,base*(.58+edge*.74)*(1+widthNoise));
  const opacity=clamp(material.opacity*(.35+opacityProfile*.8)*(1+(enabled?(random.next()-.5)*variation:0)),0,1);
  const dashBase=Math.max(2.5,base*(1.2+edge*2.1));
  const gap=Math.max(1.5,dashBase*(.2+(enabled?random.next()*material.spacingVariation:.1)));
  const dash=index%3===0?[]:[round6(dashBase),round6(gap),round6(dashBase*.45),round6(gap*.72)];
  const m=source.matrix||[1,0,0,1,0,0],cs=Math.cos(rotation),sn=Math.sin(rotation);
  const rotated=[m[0]*cs+m[2]*sn,m[1]*cs+m[3]*sn,m[2]*cs-m[0]*sn,m[3]*cs-m[1]*sn,m[4]+dx,m[5]+dy];
  return createPath({...clone(source),id:stableCompositeId(groupId,['irregular-layer',index]),name:`${source.name||'Path'} · Irregular Watercolor ${index+1}`,fill:'none',stroke:options.color||varyColor(material.color,colorShift),strokeWidth:round6(width),opacity:round6(opacity),lineCap:'round',lineJoin:'round',dash,dashOffset:round6(enabled?random.bounded(0,dashBase):0),matrix:rotated,blendMode:options.blendMode||material.blendMode,metadata:{...clone(source.metadata||{}),watercolorV2Layer:index,brushId:material.brushId,brushVersion:material.brushVersion,seed:options.seed??material.seed,edgeProfile:round6(edge),renderMode:material.renderMode}});
}

export function createPathWatercolorStrokeV2(sourcePath, material, options={}) {
  if (!sourcePath || sourcePath.type!=='path') throw new Error('INK_WATERCOLOR_PATH_REQUIRED');
  const brush=createVectorBrushMaterial({...material,...options,brushId:material.brushId||options.brushId,brushVersion:material.brushVersion||'2.0.0'});
  const id=options.id||stableCompositeId(sourcePath.id,['vector-watercolor-v2',brush.brushId,brush.brushVersion,options.semanticRole||'stroke']);
  const random=new DeterministicRandom(options.seed??brush.seed);
  const layers=Array.from({length:brush.layerCount},(_,index)=>irregularStrokeLayer(sourcePath,id,brush,index,random,options));
  const group=createVectorGroup(layers,{id,name:options.name||`${sourcePath.name||'Path'} · Watercolor Brush v2`,opacity:options.groupOpacity??1,blendMode:options.blendMode||brush.blendMode});
  group.vectorBrushInstance={format:'INK-VECTOR-BRUSH-INSTANCE',version:'2.0',instanceId:id,brushId:brush.brushId,brushVersion:brush.brushVersion,sourcePathId:sourcePath.id,editablePath:clone(sourcePath),parameterOverrides:clone(options),seed:options.seed??brush.seed,variationEnabled:brush.enabledVariation,deterministic:true,localRecompute:true,renderMode:brush.renderMode,assetHash:brush.assetHash};
  group.metadata={semanticRole:options.semanticRole||'watercolor-stroke-v2',renderer:'INK_VECTOR_WATERCOLOR_V2',materialHash:brush.materialHash};
  return group;
}

export function createWatercolorPetalV2(sourcePath, material, options={}) {
  if (!sourcePath || sourcePath.type!=='path') throw new Error('INK_WATERCOLOR_PATH_REQUIRED');
  const brush=createVectorBrushMaterial({...material,...options,brushId:material.brushId||options.brushId});
  const id=options.id||stableCompositeId(sourcePath.id,['watercolor-petal-v2']);
  const random=new DeterministicRandom(options.seed??brush.seed);
  const baseColor=options.color||brush.color;
  const fills=[];
  const layerCount=Math.max(4,Math.round(options.fillLayers??6));
  for(let index=0;index<layerCount;index++){
    const sx=1+(random.next()-.5)*brush.widthVariation*.24, sy=1+(random.next()-.5)*brush.strokeVariation*.12;
    const dx=(random.next()-.5)*brush.jitter*1.6,dy=(random.next()-.5)*brush.jitter*1.6;
    const color=varyColor(baseColor,(random.next()-.5)*brush.colorVariation*52);
    const density=brush.pigmentDensityProfile[index%brush.pigmentDensityProfile.length]??.5;
    fills.push(createPath({...clone(sourcePath),id:stableCompositeId(id,['transparent-fill',index]),name:`Watercolor pigment layer ${index+1}`,fill:color,stroke:'none',opacity:round6(clamp(brush.opacity*(.15+density*.27),.018,.28)),blendMode:options.blendMode||brush.blendMode,matrix:scaleLocalMatrix(sourcePath.matrix,sx,sy,dx,dy),gradient:{id:stableCompositeId(id,['gradient',index]),type:'linear',x1:0,y1:0,x2:0,y2:1,units:'objectBoundingBox',stops:[{offset:0,color:varyColor(color,-18),opacity:.7},{offset:.42,color,opacity:.48},{offset:1,color:varyColor(color,18),opacity:.12}]},metadata:{...clone(sourcePath.metadata||{}),semanticRole:'watercolor-pigment-layer',watercolorV2Fill:index,brushId:brush.brushId,seed:options.seed??brush.seed}}));
  }
  const centerColor=varyColor(baseColor,-34);
  const concentration=[];
  for(let index=0;index<3;index++){
    const stroke=openCenterStroke(sourcePath,{id:stableCompositeId(id,['concentration',index]),color:varyColor(centerColor,index*5),opacity:.13+index*.035,width:brush.strokeWidth*(.38-index*.07),offset:(index-1)*2.6,blendMode:options.blendMode||brush.blendMode,dash:index===2?[8,5]:[]});
    if(stroke) concentration.push(stroke);
  }
  const edge=createPathWatercolorStrokeV2({...clone(sourcePath),fill:'none'},brush,{...options,id:stableCompositeId(id,['broken-edge']),strokeWidth:(options.strokeWidth||brush.strokeWidth)*.34,layerCount:Math.max(5,Math.min(9,brush.layerCount)),opacity:brush.opacity*.62,color:baseColor,semanticRole:'watercolor-petal-edge-v2'});
  const group=createVectorGroup([...fills,...concentration,edge],{id,name:options.name||'Watercolor Petal v2',blendMode:options.blendMode||brush.blendMode});
  group.metadata={semanticRole:options.semanticRole||'watercolor-petal-v2',structure:'editable-vector-watercolor-v2',sourcePathId:sourcePath.id,brushId:brush.brushId,seed:options.seed??brush.seed};
  group.watercolorComposite={format:'INK-WATERCOLOR-COMPOSITE',version:'2.0',type:'PETAL',editable:true,deterministic:true,localRecompute:true};
  return group;
}

export function createWatercolorLeafV2(sourcePath, material, options={}) {
  const brush=createVectorBrushMaterial({...material,...options,brushId:material.brushId||options.brushId,color:options.color||material.color||'#5f9467'});
  const id=options.id||stableCompositeId(sourcePath.id,['watercolor-leaf-v2']);
  const petal=createWatercolorPetalV2(sourcePath,brush,{...options,id,color:options.color||brush.color,semanticRole:'watercolor-leaf-v2',fillLayers:5});
  const vein=openCenterStroke(sourcePath,{id:stableCompositeId(id,['vein']),color:varyColor(options.color||brush.color,-42),opacity:.32,width:Math.max(.7,brush.strokeWidth*.14),blendMode:'multiply',dash:[10,3]});
  if(vein){ vein.name='Watercolor leaf vein'; vein.metadata={...(vein.metadata||{}),semanticRole:'leaf-vein'}; petal.children.push(vein); }
  petal.name=options.name||'Watercolor Leaf v2';petal.watercolorComposite.type='LEAF';
  return petal;
}

export function createWatercolorStemV2(sourcePath, material, options={}) {
  const brush=createVectorBrushMaterial({...material,...options,brushId:material.brushId||options.brushId,color:options.color||material.color||'#4f7d55',layerCount:Math.max(5,material.layerCount||6)});
  const id=options.id||stableCompositeId(sourcePath.id,['watercolor-stem-v2']);
  const main=createPathWatercolorStrokeV2(sourcePath,brush,{...options,id,color:options.color||brush.color,semanticRole:'watercolor-stem-v2'});
  const highlight=createPath({...clone(sourcePath),id:stableCompositeId(id,['highlight']),fill:'none',stroke:varyColor(options.color||brush.color,28),strokeWidth:Math.max(.45,brush.strokeWidth*.16),opacity:.22,blendMode:'screen',dash:[18,8],dashOffset:3,metadata:{semanticRole:'stem-highlight',sourcePathId:sourcePath.id}});
  main.children.push(highlight);main.name=options.name||'Watercolor Stem v2';main.watercolorComposite={format:'INK-WATERCOLOR-COMPOSITE',version:'2.0',type:'STEM',editable:true,deterministic:true,localRecompute:true};
  return main;
}

function irregularBlobPath({id,cx,cy,rx,ry,points=12,seed=1,color='#df91a8',opacity=.08,blendMode='multiply',rotation=0,gradient=true}={}){
  const random=new DeterministicRandom(seed),anchors=[];
  for(let i=0;i<points;i++){const angle=rotation+i/points*Math.PI*2,radius=1+(random.next()-.5)*.28,localRx=rx*radius,localRy=ry*(1+(random.next()-.5)*.24),x=cx+Math.cos(angle)*localRx,y=cy+Math.sin(angle)*localRy,k=.34;anchors.push(createAnchor(x,y,{x:Math.sin(angle)*localRx*k,y:-Math.cos(angle)*localRy*k},{x:-Math.sin(angle)*localRx*k,y:Math.cos(angle)*localRy*k},{id:`${id}:a${i}`,mode:'smooth'}));}
  return createPath({id,name:'Irregular Watercolor Wash',subpaths:[{closed:true,role:'outer',anchors}],fill:color,stroke:'none',opacity,blendMode,gradient:gradient?{id:`${id}:gradient`,type:'radial',x2:.48,y2:.52,r:.62,units:'objectBoundingBox',stops:[{offset:0,color:varyColor(color,-14),opacity:.58},{offset:.56,color,opacity:.38},{offset:1,color:varyColor(color,18),opacity:.04}]}:null,metadata:{semanticRole:'non-rectangular-wash',seed}});
}

export function createWatercolorWashV2({id='watercolor-wash-v2',center={x:397,y:540},width=620,height=720,color='#df91a8',opacity=.09,blendMode='multiply',seed=1,lobes=4}={}) {
  const random=new DeterministicRandom(seed),children=[];
  for(let index=0;index<lobes;index++) children.push(irregularBlobPath({id:stableCompositeId(id,['lobe',index]),cx:center.x+(random.next()-.5)*width*.24,cy:center.y+(random.next()-.5)*height*.22,rx:width*(.28+random.next()*.16),ry:height*(.22+random.next()*.15),points:10+index%3*2,seed:seed+index*103,color:varyColor(color,(random.next()-.5)*18),opacity:opacity*(.42+random.next()*.38),blendMode,rotation:random.bounded(-.35,.35)}));
  const group=createVectorGroup(children,{id,name:'Non-rectangular Watercolor Wash v2',blendMode});group.metadata={semanticRole:'watercolor-wash-v2',seed,editable:true};group.watercolorComposite={format:'INK-WATERCOLOR-COMPOSITE',version:'2.0',type:'WASH',deterministic:true,localRecompute:true};return group;
}

function splatterBlob(id,cx,cy,r,random,color,opacity,blendMode,index){const points=5+Math.floor(random.next()*4),anchors=[];for(let p=0;p<points;p++){const angle=p/points*Math.PI*2,rr=r*(.58+random.next()*.72),x=cx+Math.cos(angle)*rr,y=cy+Math.sin(angle)*rr,k=.22;anchors.push(createAnchor(x,y,{x:Math.sin(angle)*rr*k,y:-Math.cos(angle)*rr*k},{x:-Math.sin(angle)*rr*k,y:Math.cos(angle)*rr*k},{id:`${id}:a${p}`,mode:'smooth'}));}return createPath({id,name:`Natural splatter ${index+1}`,subpaths:[{closed:true,role:'outer',anchors}],fill:color,stroke:'none',opacity,blendMode,metadata:{semanticRole:'natural-splatter-drop',distributionIndex:index}});}
export function createNaturalSplatter({id='natural-splatter',count=42,center={x:397,y:500},radius=300,color='#9f4162',seed=1,opacity=.24,blendMode='multiply'}={}) { const random=new DeterministicRandom(seed),children=[];for(let index=0;index<count;index++){const angle=random.bounded(0,Math.PI*2),u=random.next(),distance=Math.pow(u,.72)*radius,r=Math.max(.7,Math.pow(random.next(),2.1)*8.8+1),cx=center.x+Math.cos(angle)*distance*(.72+random.next()*.35),cy=center.y+Math.sin(angle)*distance*(.72+random.next()*.35),shift=(random.next()-.5)*22;children.push(splatterBlob(stableCompositeId(id,['drop',index]),cx,cy,r,random,varyColor(color,shift),opacity*(.35+random.next()*.65),blendMode,index));}const group=createVectorGroup(children,{id,name:'Natural Watercolor Splatter v2',blendMode});group.metadata={semanticRole:'natural-splatter-field',seed,count,deterministic:true};group.watercolorComposite={format:'INK-WATERCOLOR-COMPOSITE',version:'2.0',type:'SPLATTER',deterministic:true,localRecompute:true};return group; }

export function createPaperOverlayMaterial({id='paper-overlay-v2',width=794,height=1123,seed=1,intensity=.16,sourceAsset=null,assetLicense={id:'INK-PROJECT-ORIGINAL',redistributable:true},assetHash=null,enabled=true}={}) { const random=new DeterministicRandom(seed),children=[];if(enabled){for(let index=0;index<72;index++){const y=random.bounded(0,height),x=random.bounded(0,width),length=random.bounded(45,210),angle=random.bounded(-.12,.12),cs=Math.cos(angle),sn=Math.sin(angle);children.push(createPath({id:stableCompositeId(id,['fiber',index]),name:`Paper fiber ${index+1}`,subpaths:[{closed:false,role:'outer',anchors:[createAnchor(0,0,null,{x:length*.32,y:(random.next()-.5)*6},{id:`${id}:fiber:${index}:a0`,mode:'smooth'}),createAnchor(length,0,{x:-length*.32,y:(random.next()-.5)*6},null,{id:`${id}:fiber:${index}:a1`,mode:'smooth'})]}],fill:'none',stroke:index%4===0?'#c8bfae':'#eee8db',strokeWidth:random.bounded(.35,1.15),opacity:intensity*random.bounded(.16,.52),blendMode:'multiply',matrix:[cs,sn,-sn,cs,x,y],dash:index%3===0?[random.bounded(8,24),random.bounded(5,16)]:[],metadata:{semanticRole:'paper-fiber'}}));}for(let index=0;index<110;index++){const x=random.bounded(0,width),y=random.bounded(0,height),r=random.bounded(.25,1.1);children.push(splatterBlob(stableCompositeId(id,['grain',index]),x,y,r,random,index%5===0?'#b9ad98':'#f7f2e8',intensity*random.bounded(.08,.28),'multiply',index));}}
  const group=createVectorGroup(children,{id,name:'Paper Overlay Material',blendMode:'multiply'});group.paperTextureReference={sourceAsset,assetLicense:clone(assetLicense),assetHash,renderMode:'VECTOR',overlay:true,interaction:false,enabled,deterministic:true};group.metadata={semanticRole:'paper-overlay',validationState:'VALIDATION REQUIRED',claim:'OVERLAY_ONLY'};return group; }

export function watercolorV2Report(document) { const base=vectorWatercolorReport(document),objects=[];const walk=object=>{objects.push(object);for(const child of object.children||[])walk(child);if(object.source)walk(object.source);};for(const page of document.pages||[])for(const layer of page.layers||[])for(const object of layer.objects||[])walk(object);return {...base,version:'2.0',v2Instances:objects.filter(o=>o.vectorBrushInstance?.version==='2.0').length,composites:objects.filter(o=>o.watercolorComposite?.version==='2.0').length,paperOverlays:objects.filter(o=>o.paperTextureReference?.overlay).length,renderModes:[...new Set(objects.map(o=>o.vectorBrushInstance?.renderMode||o.paperTextureReference?.renderMode).filter(Boolean))]}; }
