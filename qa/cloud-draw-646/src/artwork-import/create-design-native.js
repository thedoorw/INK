// Maps @create-design/ai's validated DesignDocument into existing INK Native.
// No second document authority; unmatched Illustrator features are loss receipts.
import {createPath} from '../vector/vector-core.js';
import {createTextObject} from '../editor/text-object.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const safe=(v)=>Number.isFinite(v)&&Math.abs(v)<1e7;
const rgb=(s)=>{if(s?.space==='rgb')return [s.r,s.g,s.b];if(s?.space==='cmyk'){
 const k=Math.min(1,Math.max(0,s.k/100));
 return [255*(1-Math.min(1,Math.max(0,s.c/100)))*(1-k),
 255*(1-Math.min(1,Math.max(0,s.m/100)))*(1-k),255*(1-Math.min(1,Math.max(0,s.y/100)))*(1-k)];
 }return null;};
const hex=channels=>channels?'#'+channels.map(n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0')).join(''):null;
export function createDesignToInkNative(result,{uid}={}){
 if(typeof uid!=='function')fail('INK_AI_ID_FACTORY_REQUIRED');
 if(result?.ok!==true||result.document?.format!=='create-design.document'){
  const error=Object.assign(new Error('INK_CREATE_DESIGN_IMPORT_FAILED'),{code:'INK_CREATE_DESIGN_IMPORT_FAILED'});
  error.diagnostics=Array.isArray(result?.diagnostics)?result.diagnostics.map(d=>({code:d.code,severity:d.severity,stage:d.stage})).slice(0,24):[];
  throw error;
 }
 const doc=result.document;
 if(!Array.isArray(doc.objects)||!Array.isArray(doc.groups)||!Array.isArray(doc.layers)||
  !Array.isArray(doc.swatches)||doc.objects.length>10000||doc.groups.length>2000||doc.layers.length>512)
   fail('INK_CREATE_DESIGN_BUDGET_OR_SCHEMA');
 const omap=new Map(doc.objects.map(o=>[o.id,o]));
 const gmap=new Map(doc.groups.map(g=>[g.id,g]));
 const smap=new Map(doc.swatches.map(s=>[s.id,s]));
 if(omap.size!==doc.objects.length||gmap.size!==doc.groups.length)fail('INK_CREATE_DESIGN_DUPLICATE_ID');
 let mapped=0,clippedPaths=0,totalAnchors=0;
 const mappings=[],losses=[],used=new Set();
 const checkContours=g=>{
  if(!Array.isArray(g?.contours)||g.contours.length>2000)
   fail('INK_CREATE_DESIGN_CONTOUR_BUDGET');
  for(const contour of g.contours){
   if(!Array.isArray(contour?.points)||contour.points.length>10000)
    fail('INK_CREATE_DESIGN_POINT_BUDGET');
   totalAnchors+=contour.points.length;
   if(totalAnchors>160000)fail('INK_CREATE_DESIGN_ANCHOR_BUDGET');
  }
 };
 const paint=ref=>{if(!ref)return null;const value=smap.get(ref.swatchId);const color=rgb(value?.source);
  if(value?.source?.space==='cmyk')losses.push({code:'CMYK_APPROXIMATED_TO_RGB',swatchId:ref.swatchId});
  return hex(color);};
 const clipFrom=(source)=>{
  const g=source?.geometry;
  if(g?.kind!=='path')return null;
  checkContours(g);
  const subpaths=(g.contours||[]).map((contour,i)=>({
   id:uid(),closed:contour.closed===true,
   role:i&&g.fillRule==='evenodd'?'hole':'outer',
   anchors:(contour.points||[]).map(p=>{
    if(!safe(p.x)||!safe(p.y)||
      (p.incoming&&(!safe(p.incoming.x)||!safe(p.incoming.y)))||
      (p.outgoing&&(!safe(p.outgoing.x)||!safe(p.outgoing.y))))
      fail('INK_CREATE_DESIGN_CLIP_POINT_INVALID');
    return {id:uid(),x:p.x,y:p.y,mode:p.mode==='soft'?'smooth':'corner',
      in:p.incoming?{x:p.incoming.x-p.x,y:p.incoming.y-p.y}:{x:0,y:0},
      out:p.outgoing?{x:p.outgoing.x-p.x,y:p.outgoing.y-p.y}:{x:0,y:0}};
   })
  }));
  return createPath({id:uid(),name:'Illustrator clipping path',subpaths,
   fill:'#ffffff',stroke:'none',fillRule:g.fillRule==='nonzero'?'nonzero':'evenodd',
   metadata:{sourceIllustratorClipId:source.id}});
 };
 const applyClip=(node,source,groupId)=>{
  if(node.type==='path'){
   if(node.clipPath){
    losses.push({code:'AI_NESTED_CLIP_COMPOSITION_UNSUPPORTED',sourceId:groupId});return;
   }
   const mask=clipFrom(source);
   if(!mask){losses.push({code:'AI_CLIPPING_SOURCE_NOT_PATH',sourceId:groupId});return;}
   node.clipPath={id:uid(),path:mask};
   mappings.push({sourceId:source.id,nativeObjectId:mask.id,nativeType:'clipPath',
    nativeHostId:node.id,qualification:'native_editable_nested_clip_geometry'});
   clippedPaths++;
  }else if(node.type==='group'){
   for(const child of node.children)applyClip(child,source,groupId);
  }else losses.push({code:'AI_CLIPPING_ON_NONPATH_UNSUPPORTED',
      sourceId:groupId,nativeType:node.type});
 };
 const toObject=(ref,depth=0)=>{
  if(depth>24||!ref||!['object','group'].includes(ref.kind))fail('INK_CREATE_DESIGN_SCENE_INVALID');
  const key=ref.kind+':'+ref.id;
  if(used.has(key))fail('INK_CREATE_DESIGN_DUPLICATED_OR_CYCLIC_NODE');used.add(key);
  if(ref.kind==='group'){
   const original=gmap.get(ref.id);
   if(!original||!Array.isArray(original.children))fail('INK_CREATE_DESIGN_GROUP_MISSING');
   const id=uid(),maskId=original.clippingPathId;
   const children=original.children.filter(c=>!(maskId&&c.kind==='object'&&c.id===maskId))
    .map(c=>toObject(c,depth+1));
   const group={id,type:'group',name:original.name||'AI group',matrix:[1,0,0,1,0,0],
    opacity:safe(original.opacity)?Math.max(0,Math.min(1,original.opacity)):1,
    visible:original.hidden!==true,locked:original.locked===true,children};
   for(const c of children)c.parentId=id;
   if(maskId){
    const mask=omap.get(maskId);
    if(mask?.geometry?.kind==='path'){
     for(const child of children)applyClip(child,mask,ref.id);
     if(!children.length)losses.push({code:'AI_CLIP_GROUP_EMPTY',sourceId:ref.id});
    }else losses.push({code:'AI_CLIPPING_SOURCE_NOT_PATH',sourceId:ref.id});
   }
   mappings.push({sourceId:ref.id,nativeObjectId:id,nativeType:'group'});return group;
  }
  const o=omap.get(ref.id);if(!o)fail('INK_CREATE_DESIGN_OBJECT_MISSING');
  if(o.geometry?.kind==='path'){
   const g=o.geometry;
   checkContours(g);
   const subpaths=(g.contours||[]).map((c,i)=>({
    id:uid(),closed:c.closed===true,role:i&&g.fillRule==='evenodd'?'hole':'outer',
    anchors:(c.points||[]).map(p=>{
      if(!safe(p.x)||!safe(p.y)||
        (p.incoming&&(!safe(p.incoming.x)||!safe(p.incoming.y)))||
        (p.outgoing&&(!safe(p.outgoing.x)||!safe(p.outgoing.y))))
       fail('INK_CREATE_DESIGN_POINT_INVALID');
      return {id:uid(),x:p.x,y:p.y,mode:p.mode==='soft'||p.mode==='smooth'?'smooth':'corner',
       in:p.incoming?{x:p.incoming.x-p.x,y:p.incoming.y-p.y}:{x:0,y:0},
       out:p.outgoing?{x:p.outgoing.x-p.x,y:p.outgoing.y-p.y}:{x:0,y:0}};
    })
   }));
   const fill=paint(o.appearance?.fill),stroke=paint(o.appearance?.stroke);
   const path=createPath({id:uid(),name:o.name||'AI path',subpaths,
    fill:fill||'none',stroke:stroke||'none',strokeWidth:o.appearance?.stroke?.width??0,
    fillRule:g.fillRule==='nonzero'?'nonzero':'evenodd',
    dash:o.appearance?.stroke?.dashArray||[],dashOffset:o.appearance?.stroke?.dashOffset||0,
    lineCap:o.appearance?.stroke?.cap||'butt',lineJoin:o.appearance?.stroke?.join||'miter',
    metadata:{sourceIllustratorObjectId:ref.id}});
   path.locked=o.locked===true;path.visible=o.hidden!==true;
   if(safe(o.opacity))path.opacity=Math.max(0,Math.min(1,o.opacity));
   mappings.push({sourceId:ref.id,nativeObjectId:path.id,nativeType:'path'});
   mapped++;return path;
  }
  if(o.geometry?.kind==='text'){
   const t=o.geometry,ty=t.typography||{};
   const native=createTextObject({id:uid(),text:t.text||'',x:t.x||0,y:t.y||0,
    fontFamily:ty.font?.family||'sans-serif',fontSize:ty.size||16,
    color:paint(o.appearance?.fill)||'#000000'});
   native.name=o.name||'AI text';native.locked=o.locked===true;
   native.visible=o.hidden!==true;
   mappings.push({sourceId:ref.id,nativeObjectId:native.id,nativeType:'text'});
   losses.push({code:'AI_TEXT_METRICS_AND_FONT_AVAILABILITY_UNQUALIFIED',sourceId:ref.id});
   mapped++;return native;
  }
  fail('INK_CREATE_DESIGN_GEOMETRY_UNMAPPED');
 };
 const layers=doc.layers.map(layer=>{
  const objects=(layer.children||[]).map(ref=>toObject(ref)),id=uid();
  return {id,name:layer.name||'AI layer',visible:layer.hidden!==true,locked:layer.locked===true,opacity:1,objects};
 }); // Preserve named, hidden, locked, and empty Illustrator layers.
 if(!layers.length||!mapped)fail('INK_CREATE_DESIGN_NO_NATIVE_OBJECTS');
 const guides=[];
 for(const g of doc.guides||[]){
  if(['horizontal','vertical'].includes(g?.orientation)&&safe(g.position)){
   guides.push({id:uid(),orientation:g.orientation,position:g.position,
    locked:g.locked===true,visible:g.hidden!==true});
  }else losses.push({code:'AI_SOURCE_GUIDE_NOT_NATIVE',sourceId:g?.id||null});
 }
 for(const item of result.diagnostics||[])if(item.severity!=='info')losses.push({code:item.code||'AI_DIAGNOSTIC',detail:item.message||''});
 losses.push({code:'AI_PRIVATE_EFFECTS_GRADIENTS_AND_RENDER_PARITY_NOT_VERIFIED'});
 if(!guides.length)losses.push({code:'AI_GUIDES_UNAVAILABLE_IN_SOURCE_MODEL'});
 const recovery=result.privateSourceRecovery;
 if(recovery?.artboardRecovery==='INFERRED_FROM_PRIVATE_AI5_GUIDE_RECTS')
  losses.push({code:'AI_ARTBOARDS_INFERRED_FROM_PRIVATE_GUIDE_RECTANGLES',
   detail:'Names and geometry from private guide outlines, not native ArtboardArray metadata'});
 if(recovery?.artboardRecovery==='VISUAL_APPROX_FROM_PRIVATE_HIRES_BOUNDS')
  losses.push({code:'AI_ARTBOARD_APPROX_FROM_PRIVATE_HIRES_BOUNDS',
   detail:'Private PostScript bounds are not actual Illustrator artboard metadata'});
 const sourceText=Number(recovery?.sourceAstTextFrames)||0;
 const nativeText=doc.objects.filter(o=>o.geometry?.kind==='text').length;
 const textTrace=Array.isArray(recovery?.sourceTextFrameTrace)?recovery.sourceTextFrameTrace:[];
 const sourceGuideRectangles=recovery?.artboardRecovery==='INFERRED_FROM_PRIVATE_AI5_GUIDE_RECTS'
  ?doc.artboards?.length||0:0;
 if(sourceText>nativeText)
  losses.push({code:'AI_TEXT_FRAMES_NOT_LOWERED',count:sourceText-nativeText,
   sourceFrameTrace:textTrace,qualification:'source_ast_only_not_editable_native_text'});
 if(recovery?.sourceAstUnknownOperators&&
    Object.keys(recovery.sourceAstUnknownOperators).length)
  losses.push({code:'AI_UNKNOWN_SOURCE_OPERATORS_RETAINED_IN_AST_ONLY',
   operatorCounts:recovery.sourceAstUnknownOperators});
 return {layers,guides,receipt:{schema:'INK_CREATE_DESIGN_NATIVE_FIDELITY_V1',status:'PARTIAL',family:'AI_PRIVATE_SOURCE',
  engine:'@create-design/ai@0.0.17',sourceRecovery:result.privateSourceRecovery||null,
  sourceArtboardCount:doc.artboards?.length||0,
  sourceArtboards:(doc.artboards||[]).slice(0,256).map(a=>({name:a.name,x:a.x,y:a.y,
   width:a.width,height:a.height,
   qualification:result.privateSourceRecovery?.artboardRecovery===
    'INFERRED_FROM_PRIVATE_AI5_GUIDE_RECTS'
    ?'inferred_from_private_guide_rectangles'
    :result.privateSourceRecovery?.artboardRecovery===
    'VISUAL_APPROX_FROM_PRIVATE_HIRES_BOUNDS'
    ?'approximate_from_private_bounds':'preserved_source_only'})),
  nativeClippedPaths:clippedPaths,nativeGuides:guides.length,
  sourceGuideRectangles,sourceGuideRectangleQualification:'SOURCE_LAYER_RECTANGLE_OUTLINES_NOT_NATIVE_GUIDES',
  sourceTextFrameCount:sourceText,nativeTextObjectCount:nativeText,
  sourceTextResourceStoryCount:recovery?.sourceTextResourceStories??null,
  sourceTextFrameTrace:textTrace,
  textFidelityStatus:sourceText>nativeText?'TEXT_FRAME_SOURCE_SEMANTICS_BLOCKED':
   nativeText>0?'BOUNDED_TYPED_TEXT_EDITABLE':'NO_SOURCE_TEXT_FRAMES',
  sourceLayers:doc.layers.length,sourceObjects:doc.objects.length,nativeObjects:mapped,
  mappings,losses,fullFidelity:false}};
}
