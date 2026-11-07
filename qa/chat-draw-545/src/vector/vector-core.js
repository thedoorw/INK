/* INK editable vector core. Paths remain structured geometry; Boolean uses
 * polygon clipping after deterministic Bezier flattening and never rasterizes. */
import '../vendor/polygon-clipping.umd.min.js';
import { reconcileRepeatInstances } from '../repeat/repeat-identity.js';
import { normalizeSemantic } from '../semantic/semantic-model.js';
import { stableCompositeId } from '../core/stable-id.js';
import { normalizeSvgIds } from './svg-id-normalizer.js';
import { expressiveStrokeMaxWidth, expressiveStrokeOpacityAt, expressiveStrokeWidthAt, normalizeExpressiveStroke } from './stroke-appearance.js';
import { normalizePathMaterialAppearance, resolvePathPaintAppearance } from './paint-appearance.js';

const pc = globalThis.polygonClipping;
const ID = () => `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
const clone = value => JSON.parse(JSON.stringify(value));
const identity = () => [1, 0, 0, 1, 0, 0];
const point = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const multiply = (a, b) => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const rotateAt = (angle, c={x:0,y:0}) => { const a=angle*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a); return [cs,sn,-sn,cs,c.x-cs*c.x+sn*c.y,c.y-sn*c.x-cs*c.y]; };
const translate = (x=0,y=0) => [1,0,0,1,x,y];
const reflect = (axis='x', c={x:0,y:0}) => axis==='y' ? [-1,0,0,1,2*c.x,0] : [1,0,0,-1,0,2*c.y];
const finite = value => Number.isFinite(+value) ? +value : 0;


function cloneRepeatSource(source, instanceId, { rootId = instanceId } = {}) {
  const output = clone(source), idMap = new Map();
  const collect = (value, path = 'source', isRoot = false) => {
    if (Array.isArray(value)) return value.forEach((item, index) => collect(item, `${path}.${index}`, false));
    if (!value || typeof value !== 'object') return;
    if (typeof value.id === 'string' && value.id) idMap.set(value.id, isRoot ? rootId : stableCompositeId(instanceId, [value.id, path]));
    for (const [key, item] of Object.entries(value)) if (key !== 'id') collect(item, `${path}.${key}`, false);
  };
  const rewrite = value => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (!value || typeof value !== 'object') return typeof value === 'string' && idMap.has(value) ? idMap.get(value) : value;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'id' && typeof item === 'string' && idMap.has(item)) value[key] = idMap.get(item);
      else value[key] = rewrite(item);
    }
    return value;
  };
  collect(output, 'source', true);
  rewrite(output);
  output.repeatInstance = { ...(output.repeatInstance || {}), instanceId, generatedSourceId: output.id };
  return output;
}

export function createAnchor(x, y, incoming=null, outgoing=null, options={}) {
  return { id:options.id||ID(), x:finite(x), y:finite(y), in:incoming ? {x:finite(incoming.x),y:finite(incoming.y)} : {x:0,y:0}, out:outgoing ? {x:finite(outgoing.x),y:finite(outgoing.y)} : {x:0,y:0}, mode:options.mode||'corner' };
}

export function createPath({id=ID(),name='Path',subpaths=[],fill='#d9828b',stroke='#5d3138',strokeWidth=1.5,fillRule='evenodd',gradient=null,matrix=identity(),opacity=1,blendMode='source-over',dash=[],dashOffset=0,lineCap='round',lineJoin='round',miterLimit=4,clipPath=null,mask=null,expressiveStroke=null,materialAppearance=null,metadata={}}={}) {
  const normalizedMaterial=normalizePathMaterialAppearance(materialAppearance,{fill,stroke});
  return { id, type:'path', name, matrix:[...matrix], opacity, blendMode, fill, stroke, strokeWidth, fillRule, gradient:gradient?clone(gradient):null, dash:[...dash], dashOffset:finite(dashOffset), lineCap, lineJoin, miterLimit:Math.max(1,finite(miterLimit)||4), clipPath:clipPath?clone(clipPath):null, mask:mask?clone(mask):null, expressiveStroke:normalizeExpressiveStroke(expressiveStroke,{color:stroke,width:strokeWidth}), ...(normalizedMaterial?{materialAppearance:normalizedMaterial}:{}), subpaths:subpaths.map((s,index)=>({id:s.id||`${id}_s${index}`,closed:s.closed!==false,role:s.role||'outer',anchors:(s.anchors||[]).map(a=>createAnchor(a.x,a.y,a.in,a.out,{id:a.id,mode:a.mode}))})), metadata:clone(metadata) };
}

export function addAnchor(path,subpathIndex,index,anchor){const sub=path?.subpaths?.[subpathIndex];if(!sub)throw new Error('INK_VECTOR_SUBPATH_NOT_FOUND');const next=createAnchor(anchor.x,anchor.y,anchor.in,anchor.out,{id:anchor.id,mode:anchor.mode});sub.anchors.splice(Math.max(0,Math.min(sub.anchors.length,index)),0,next);return next;}
export function deleteAnchor(path,subpathIndex,index){const sub=path?.subpaths?.[subpathIndex];if(!sub||!sub.anchors[index])throw new Error('INK_VECTOR_ANCHOR_NOT_FOUND');if(sub.closed&&sub.anchors.length<=3)throw new Error('INK_VECTOR_CLOSED_PATH_MINIMUM_ANCHORS');return sub.anchors.splice(index,1)[0];}
export function moveAnchor(path,subpathIndex,index,x,y){const anchor=path?.subpaths?.[subpathIndex]?.anchors?.[index];if(!anchor)throw new Error('INK_VECTOR_ANCHOR_NOT_FOUND');anchor.x=finite(x);anchor.y=finite(y);return anchor;}
export function setAnchorMode(path,subpathIndex,index,mode='corner'){const anchor=path?.subpaths?.[subpathIndex]?.anchors?.[index];if(!anchor)throw new Error('INK_VECTOR_ANCHOR_NOT_FOUND');if(!['corner','smooth','symmetric'].includes(mode))throw new Error(`INK_VECTOR_ANCHOR_MODE_UNSUPPORTED:${mode}`);anchor.mode=mode;if(mode!=='corner'){const out=Math.hypot(anchor.out.x,anchor.out.y),inn=Math.hypot(anchor.in.x,anchor.in.y),angle=Math.atan2(anchor.out.y,anchor.out.x);anchor.out={x:Math.cos(angle)*(out||inn||10),y:Math.sin(angle)*(out||inn||10)};anchor.in={x:-Math.cos(angle)*(mode==='symmetric'?(out||inn||10):(inn||out||10)),y:-Math.sin(angle)*(mode==='symmetric'?(out||inn||10):(inn||out||10))};}return anchor;}
export function moveBezierHandle(path,subpathIndex,index,side,x,y){const anchor=path?.subpaths?.[subpathIndex]?.anchors?.[index];if(!anchor||!['in','out'].includes(side))throw new Error('INK_VECTOR_HANDLE_NOT_FOUND');anchor[side]={x:finite(x),y:finite(y)};if(anchor.mode!=='corner'){const opposite=side==='in'?'out':'in',length=anchor.mode==='symmetric'?Math.hypot(x,y):Math.hypot(anchor[opposite].x,anchor[opposite].y),angle=Math.atan2(y,x)+Math.PI;anchor[opposite]={x:Math.cos(angle)*length,y:Math.sin(angle)*length};}return anchor;}

const cubic = (p0,p1,p2,p3,t) => { const u=1-t,uu=u*u,tt=t*t; return {x:uu*u*p0.x+3*uu*t*p1.x+3*u*tt*p2.x+tt*t*p3.x,y:uu*u*p0.y+3*uu*t*p1.y+3*u*tt*p2.y+tt*t*p3.y}; };

export function flattenSubpath(subpath, tolerance=0.75) {
  const anchors=subpath?.anchors||[]; if(!anchors.length) return [];
  const result=[{x:anchors[0].x,y:anchors[0].y}], count=subpath.closed?anchors.length:anchors.length-1;
  for(let i=0;i<count;i++){
    const a=anchors[i], b=anchors[(i+1)%anchors.length];
    const p0={x:a.x,y:a.y},p1={x:a.x+(a.out?.x||0),y:a.y+(a.out?.y||0)},p2={x:b.x+(b.in?.x||0),y:b.y+(b.in?.y||0)},p3={x:b.x,y:b.y};
    const curve=Math.hypot(p1.x-p0.x,p1.y-p0.y)+Math.hypot(p2.x-p1.x,p2.y-p1.y)+Math.hypot(p3.x-p2.x,p3.y-p2.y);
    const steps=Math.max(1,Math.min(96,Math.ceil(curve/Math.max(.2,tolerance*5))));
    for(let step=1;step<=steps;step++) result.push(cubic(p0,p1,p2,p3,step/steps));
  }
  if(subpath.closed&&result.length>1){const first=result[0],last=result[result.length-1];if(Math.hypot(first.x-last.x,first.y-last.y)<1e-8)result.pop();}
  return result;
}

export function tracePath(ctx,path){
  ctx.beginPath();
  for(const sub of path.subpaths||[]){const a=sub.anchors||[];if(!a.length)continue;ctx.moveTo(a[0].x,a[0].y);const count=sub.closed?a.length:a.length-1;for(let i=0;i<count;i++){const from=a[i],to=a[(i+1)%a.length],o=from.out||{x:0,y:0},inn=to.in||{x:0,y:0};if(o.x||o.y||inn.x||inn.y)ctx.bezierCurveTo(from.x+o.x,from.y+o.y,to.x+inn.x,to.y+inn.y,to.x,to.y);else ctx.lineTo(to.x,to.y);}if(sub.closed)ctx.closePath();}
}

export function pathBounds(path, matrix=path.matrix||identity()){
  const pts=(path.subpaths||[]).flatMap(s=>flattenSubpath(s).map(p=>point(matrix,p))); if(!pts.length)return{x:0,y:0,w:1,h:1};
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
}

const signedArea=ring=>ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p.x*q.y-q.x*p.y;},0)/2;
const ringArray=ring=>{const r=ring.map(p=>[+p.x.toFixed(6),+p.y.toFixed(6)]);if(r.length){const f=r[0],l=r[r.length-1];if(f[0]!==l[0]||f[1]!==l[1])r.push([...f]);}return r;};

export function pathToMultiPolygon(path,tolerance=.75){
  const m=path.matrix||identity(), outers=[], holes=[];
  for(const sub of path.subpaths||[]){const ring=flattenSubpath(sub,tolerance).map(p=>point(m,p));if(ring.length<3)continue;(sub.role==='hole'?holes:outers).push(ring);}
  if(!outers.length&&holes.length)outers.push(holes.shift());
  const result=outers.map(r=>[ringArray(r)]);
  for(const hole of holes){const c=hole[0];let target=result.findIndex(poly=>pointInRing(c,poly[0].slice(0,-1).map(([x,y])=>({x,y}))));if(target<0)target=0;if(result[target])result[target].push(ringArray(hole));}
  return result;
}

export function pointInRing(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(((a.y>p.y)!==(b.y>p.y))&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y||1e-12)+a.x)inside=!inside;}return inside;}

const segmentDistance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));};
function simplifyOpen(points,tolerance){if(points.length<=2)return points;let max=0,index=0;for(let i=1;i<points.length-1;i++){const d=segmentDistance(points[i],points[0],points.at(-1));if(d>max){max=d;index=i;}}if(max<=tolerance)return[points[0],points.at(-1)];const left=simplifyOpen(points.slice(0,index+1),tolerance),right=simplifyOpen(points.slice(index),tolerance);return[...left.slice(0,-1),...right];}
function fitBooleanRing(raw,{fitTolerance=.85,maxAnchors=96}={}){let points=raw.map(([x,y])=>({x,y}));if(points.length>1&&Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y)<1e-8)points.pop();if(points.length<4)return{anchors:points.map(p=>createAnchor(p.x,p.y)),error:0,inputCount:points.length};const closed=[...points,points[0]],simplified=simplifyOpen(closed,fitTolerance).slice(0,-1);while(simplified.length>maxAnchors){for(let i=simplified.length-2;i>=0&&simplified.length>maxAnchors;i-=2)simplified.splice(i,1);}const anchors=simplified.map((p,i)=>{const prev=simplified[(i-1+simplified.length)%simplified.length],next=simplified[(i+1)%simplified.length],v1={x:p.x-prev.x,y:p.y-prev.y},v2={x:next.x-p.x,y:next.y-p.y},turn=Math.abs(Math.atan2(v1.x*v2.y-v1.y*v2.x,v1.x*v2.x+v1.y*v2.y));if(turn>.32)return createAnchor(p.x,p.y);const tangent={x:next.x-prev.x,y:next.y-prev.y},len=Math.hypot(tangent.x,tangent.y)||1,hin=Math.hypot(v1.x,v1.y)/3,hout=Math.hypot(v2.x,v2.y)/3;return createAnchor(p.x,p.y,{x:-tangent.x/len*hin,y:-tangent.y/len*hin},{x:tangent.x/len*hout,y:tangent.y/len*hout},{mode:'smooth'});});let error=0;for(const p of points)error=Math.max(error,Math.min(...simplified.map((q,i)=>segmentDistance(p,q,simplified[(i+1)%simplified.length]))));return{anchors,error,inputCount:points.length};}

export function multiPolygonToPath(multi,{name='Boolean Result',fill='#d9828b',stroke='#5d3138',strokeWidth=1.5,operation='union',fitTolerance=.85,maxAnchors=96}={}){
  const subpaths=[],fits=[];for(const polygon of multi||[])for(let i=0;i<polygon.length;i++){const raw=polygon[i]||[];if(raw.length<4)continue;const fit=fitBooleanRing(raw,{fitTolerance,maxAnchors});if(fit.anchors.length<3)continue;subpaths.push({role:i===0?'outer':'hole',closed:true,anchors:fit.anchors});fits.push({inputAnchors:fit.inputCount,outputAnchors:fit.anchors.length,maxError:fit.error});}
  return createPath({name,subpaths,fill,stroke,strokeWidth,metadata:{booleanOperation:operation,editable:true,topology:subpaths.map(s=>s.role),bezierRefit:{fitTolerance,maxAnchors,paths:fits,maximumError:Math.max(0,...fits.map(x=>x.maxError)),passed:fits.every(x=>x.outputAnchors<=maxAnchors&&x.maxError<=fitTolerance*1.05)}}});
}

export function booleanPaths(paths,operation='union',options={}){
  if(!pc)throw new Error('INK_VECTOR_BOOLEAN_UNAVAILABLE');if(!Array.isArray(paths)||paths.length<2)throw new Error('INK_VECTOR_BOOLEAN_REQUIRES_TWO_PATHS');
  const geometries=paths.map(p=>pathToMultiPolygon(p,options.tolerance||.65));let output;
  if(operation==='union')output=pc.union(...geometries);else if(operation==='difference')output=pc.difference(geometries[0],...geometries.slice(1));else if(operation==='intersection')output=pc.intersection(...geometries);else if(operation==='xor')output=pc.xor(...geometries);else throw new Error(`INK_VECTOR_BOOLEAN_UNSUPPORTED:${operation}`);
  return multiPolygonToPath(output,{...options,operation,fill:options.fill||paths[0].fill,stroke:options.stroke||paths[0].stroke,strokeWidth:options.strokeWidth||paths[0].strokeWidth});
}

export function dividePaths(paths,options={}){
  if(!Array.isArray(paths)||paths.length<2)throw new Error('INK_VECTOR_DIVIDE_REQUIRES_TWO_PATHS');let pieces=[clone(paths[0])];
  for(const cutter of paths.slice(1)){const next=[];for(const piece of pieces){for(const [op,suffix] of [['difference','outside'],['intersection','inside']]){const result=booleanPaths([piece,cutter],op,{...options,name:`${piece.name||'Path'} ${suffix}`});if(result.subpaths.length){result.metadata={...result.metadata,divideSourceIds:paths.map(p=>p.id),divideRole:suffix};next.push(result);}}}const cutterOutside=booleanPaths([cutter,paths[0]],'difference',{...options,name:`${cutter.name||'Path'} outside`});if(cutterOutside.subpaths.length){cutterOutside.metadata={...cutterOutside.metadata,divideSourceIds:paths.map(p=>p.id),divideRole:'cutter-outside'};next.push(cutterOutside);}pieces=next;}
  return{id:ID(),type:'group',name:options.name||'Divide Result',matrix:identity(),opacity:1,children:pieces,metadata:{booleanOperation:'divide',editable:true,sourceIds:paths.map(p=>p.id)}};
}

export function createVectorGroup(children=[],{id=ID(),name='Group',matrix=identity(),opacity=1,blendMode='source-over',clipPath=null,mask=null}={}){return{id,type:'group',name,matrix:[...matrix],opacity,blendMode,children:children.map(clone),clipPath:clone(clipPath),mask:clone(mask)};}
export function createVectorLayer(objects=[],{id=ID(),name='Vector Layer',visible=true,locked=false,opacity=1,blendMode='source-over'}={}){return{id,type:'vector-layer',name,visible,locked,opacity,blendMode,objects:objects.map(clone)};}
export function transformVectorObject(object,matrix,{bake=false}={}){if(!Array.isArray(matrix)||matrix.length!==6)throw new Error('INK_VECTOR_TRANSFORM_INVALID');if(!bake){object.matrix=multiply(matrix,object.matrix||identity());return object;}if(object.type==='path'){for(const sub of object.subpaths||[])for(const anchor of sub.anchors||[]){const position=point(matrix,anchor),incoming={x:matrix[0]*anchor.in.x+matrix[2]*anchor.in.y,y:matrix[1]*anchor.in.x+matrix[3]*anchor.in.y},outgoing={x:matrix[0]*anchor.out.x+matrix[2]*anchor.out.y,y:matrix[1]*anchor.out.x+matrix[3]*anchor.out.y};anchor.x=position.x;anchor.y=position.y;anchor.in=incoming;anchor.out=outgoing;}object.matrix=identity();}else for(const child of object.children||[])transformVectorObject(child,matrix,{bake:true});return object;}

export class PenPathSession{
  constructor(options={}){this.path=createPath({...options,subpaths:options.subpaths||[{closed:false,role:'outer',anchors:[]}]});this.activeSubpath=0;this.closed=false;}
  add(x,y,{incoming=null,outgoing=null,mode='corner'}={}){if(this.closed)throw new Error('INK_PEN_PATH_CLOSED');return addAnchor(this.path,this.activeSubpath,this.path.subpaths[this.activeSubpath].anchors.length,createAnchor(x,y,incoming,outgoing,{mode}));}
  close(){const sub=this.path.subpaths[this.activeSubpath];if(sub.anchors.length<3)throw new Error('INK_PEN_CLOSE_REQUIRES_THREE_ANCHORS');sub.closed=true;this.closed=true;return this.path;}
  openSubpath(role='outer'){this.path.subpaths.push({id:`${this.path.id}_s${this.path.subpaths.length}`,closed:false,role,anchors:[]});this.activeSubpath=this.path.subpaths.length-1;this.closed=false;return this.activeSubpath;}
  finish(){if(!this.path.subpaths.some(sub=>sub.anchors.length>=2))throw new Error('INK_PEN_PATH_EMPTY');return clone(this.path);}
}

export function repeatTransforms(repeat){
  const mode=repeat.mode||'radial',count=Math.max(1,Math.floor(repeat.count||2)),center=repeat.center||{x:0,y:0},out=[];
  if(mode==='radial'){const sweep=finite(repeat.sweep||360),start=finite(repeat.startAngle||0);for(let i=0;i<count;i++)out.push(rotateAt(start+(count===1?0:i*sweep/count),center));}
  else if(mode==='mirror'){out.push(identity(),reflect(repeat.axis||'y',center));}
  else if(mode==='grid'){const columns=Math.max(1,Math.floor(repeat.columns||count)),rows=Math.max(1,Math.floor(repeat.rows||1));for(let row=0;row<rows;row++)for(let column=0;column<columns;column++)out.push(translate(finite(repeat.dx)*column,finite(repeat.dy)*row));}
  else for(let i=0;i<count;i++)out.push(translate(finite(repeat.dx)*i,finite(repeat.dy)*i));return out;
}

export function refreshRepeatInstances(repeat){
  const transforms=repeatTransforms(repeat);
  repeat.instances=reconcileRepeatInstances(repeat,transforms);
  repeat.identityRule=repeat.identityRule||{format:'repeat:{generatorId}:{ringIndex}:{instanceIndex}:{role}:{recipeVersion}:{sourceObjectId}',version:'1.0'};
  return repeat.instances;
}

export function createRepeat(source,{id=ID(),name='Repeat',mode='radial',count=8,center={x:0,y:0},sweep=360,startAngle=0,axis='y',dx=0,dy=0,columns=count,rows=1,linked=true,matrix=identity(),ringIndex=0,semanticRole='instance',recipeVersion='1',sourceObjectId=null,templateId=null,templateVersion=null,sourceMaterialInstanceId=null}={}){
  const repeat={id,type:'repeat',name,matrix:[...matrix],opacity:1,source:clone(source),mode,count,center:{...center},sweep,startAngle,axis,dx,dy,columns,rows,linked,expanded:false,ringIndex,semanticRole,recipeVersion:String(recipeVersion),sourceObjectId:sourceObjectId||source?.id||'source',templateId:templateId||source?.materialInstance?.templateId||null,templateVersion:templateVersion||source?.materialInstance?.templateVersion||null,sourceMaterialInstanceId:sourceMaterialInstanceId||source?.materialInstance?.instanceId||null,instances:[],semantic:{role:semanticRole},metadata:{semanticLabel:semanticRole}};
  normalizeSemantic(repeat);
  refreshRepeatInstances(repeat);
  return repeat;
}

export function updateRepeatCount(repeat,count){
  const numeric=Math.max(1,Math.floor(Number(count)||1));
  repeat.count=numeric;
  if(repeat.mode==='grid'&&repeat.columns===undefined)repeat.columns=numeric;
  refreshRepeatInstances(repeat);
  return repeat;
}

export function updateRepeatParameters(repeat,changes={}){
  for(const key of ['mode','center','sweep','startAngle','axis','dx','dy','columns','rows','ringIndex','semanticRole','recipeVersion','templateId','templateVersion'])if(changes[key]!==undefined)repeat[key]=clone(changes[key]);
  if(changes.count!==undefined)repeat.count=Math.max(1,Math.floor(Number(changes.count)||1));
  refreshRepeatInstances(repeat);
  return repeat;
}

export function expandRepeat(repeat){
  const transforms=repeatTransforms(repeat);const instances=reconcileRepeatInstances(repeat,transforms);repeat.instances=instances;return {id:`${repeat.id}:expanded`,type:'group',name:`${repeat.name||'Repeat'} Expanded`,matrix:[...(repeat.matrix||identity())],opacity:repeat.opacity??1,expandedFrom:repeat.id,children:transforms.map((m,i)=>{const child=cloneRepeatSource(repeat.source,instances[i].instanceId);child.name=`${repeat.source.name||'Path'} ${i+1}`;child.matrix=multiply(m,child.matrix||identity());child.instanceIndex=i;child.ringIndex=instances[i].ringIndex;child.repeatInstance=clone(instances[i]);return child;})};
}

export function alignObjects(objects,mode='left'){if(!objects?.length)return[];const bounds=objects.map(o=>pathBounds(o)),target={left:Math.min(...bounds.map(b=>b.x)),right:Math.max(...bounds.map(b=>b.x+b.w)),top:Math.min(...bounds.map(b=>b.y)),bottom:Math.max(...bounds.map(b=>b.y+b.h)),centerX:bounds.reduce((s,b)=>s+b.x+b.w/2,0)/bounds.length,centerY:bounds.reduce((s,b)=>s+b.y+b.h/2,0)/bounds.length};objects.forEach((o,i)=>{const b=bounds[i];let dx=0,dy=0;if(mode==='left')dx=target.left-b.x;else if(mode==='right')dx=target.right-b.x-b.w;else if(mode==='center')dx=target.centerX-b.x-b.w/2;else if(mode==='top')dy=target.top-b.y;else if(mode==='bottom')dy=target.bottom-b.y-b.h;else if(mode==='middle')dy=target.centerY-b.y-b.h/2;else throw new Error(`INK_VECTOR_ALIGN_UNSUPPORTED:${mode}`);o.matrix=multiply(translate(dx,dy),o.matrix||identity());});return objects;}
export function distributeObjects(objects,axis='x'){if(!objects||objects.length<3)return objects||[];const sorted=[...objects].sort((a,b)=>{const aa=pathBounds(a),bb=pathBounds(b);return axis==='x'?aa.x-bb.x:aa.y-bb.y;}),first=pathBounds(sorted[0]),last=pathBounds(sorted.at(-1)),start=axis==='x'?first.x:first.y,end=axis==='x'?last.x+last.w:last.y+last.h,total=sorted.reduce((s,o)=>s+(axis==='x'?pathBounds(o).w:pathBounds(o).h),0),gap=(end-start-total)/(sorted.length-1);let cursor=start;for(const o of sorted){const b=pathBounds(o),delta=cursor-(axis==='x'?b.x:b.y);o.matrix=multiply(axis==='x'?translate(delta,0):translate(0,delta),o.matrix||identity());cursor+=(axis==='x'?b.w:b.h)+gap;}return objects;}
export function snapPoint(value,{grid=1,guides=[],threshold=4}={}){let out={x:Math.round(value.x/grid)*grid,y:Math.round(value.y/grid)*grid},bestX=Math.abs(out.x-value.x),bestY=Math.abs(out.y-value.y);for(const guide of guides){if(Number.isFinite(guide.x)&&Math.abs(guide.x-value.x)<Math.min(threshold,bestX)){out.x=guide.x;bestX=Math.abs(guide.x-value.x);}if(Number.isFinite(guide.y)&&Math.abs(guide.y-value.y)<Math.min(threshold,bestY)){out.y=guide.y;bestY=Math.abs(guide.y-value.y);}}return out;}
function lineIntersection(a,b,c,d){const x1=a.x,y1=a.y,x2=b.x,y2=b.y,x3=c.x,y3=c.y,x4=d.x,y4=d.y,den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);if(Math.abs(den)<1e-8)return{x:(b.x+c.x)/2,y:(b.y+c.y)/2};return{x:((x1*y2-y1*x2)*(x3-x4)-(x1-x2)*(x3*y4-y3*x4))/den,y:((x1*y2-y1*x2)*(y3-y4)-(y1-y2)*(x3*y4-y3*x4))/den};}
function offsetRing(points,distance){const area=signedArea(points),sign=area>=0?1:-1,lines=points.map((p,i)=>{const q=points[(i+1)%points.length],dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy)||1,n={x:sign*dy/len*distance,y:-sign*dx/len*distance};return[{x:p.x+n.x,y:p.y+n.y},{x:q.x+n.x,y:q.y+n.y}];});return lines.map((line,i)=>lineIntersection(lines[(i-1+lines.length)%lines.length][0],lines[(i-1+lines.length)%lines.length][1],line[0],line[1]));}
export function offsetPath(path,distance,{name=`${path.name||'Path'} Offset`}={}){const subpaths=(path.subpaths||[]).map(sub=>{const pts=flattenSubpath(sub,.45),amount=sub.role==='hole'?-distance:distance;return{role:sub.role,closed:true,anchors:offsetRing(pts,amount).map(p=>createAnchor(p.x,p.y))};});return createPath({...clone(path),id:ID(),name,matrix:identity(),subpaths,metadata:{...clone(path.metadata||{}),offsetSource:path.id,offsetDistance:distance}});}
export function outlineStroke(path,{width=path.strokeWidth||1,name=`${path.name||'Path'} Outline`}={}){const outer=offsetPath(path,width/2),inner=offsetPath(path,-width/2),subpaths=[];for(const sub of outer.subpaths)subpaths.push({...sub,role:sub.role==='hole'?'hole':'outer'});for(const sub of inner.subpaths)subpaths.push({...sub,role:sub.role==='hole'?'outer':'hole'});return createPath({name,fill:path.stroke||'#000',stroke:'none',fillRule:'evenodd',subpaths,metadata:{outlineSource:path.id,outlineWidth:width,editable:true}});}

export function drawExpressivePathStroke(ctx,path){const style=normalizeExpressiveStroke(path?.expressiveStroke,{color:path?.stroke,width:path?.strokeWidth});if(!style)return false;let drawn=false,ordinal=0;const baseAlpha=ctx.globalAlpha;ctx.save();ctx.strokeStyle=style.color;ctx.lineCap=path.lineCap||'round';ctx.lineJoin=path.lineJoin||'round';ctx.miterLimit=Math.max(1,finite(path.miterLimit)||4);ctx.setLineDash?.([]);for(const subpath of path.subpaths||[]){const points=flattenSubpath(subpath,.5);if(points.length<2)continue;const sequence=subpath.closed?[...points,points[0]]:points,lengths=[0];for(let i=1;i<sequence.length;i++)lengths[i]=lengths[i-1]+Math.hypot(sequence[i].x-sequence[i-1].x,sequence[i].y-sequence[i-1].y);const total=Math.max(1e-8,lengths.at(-1));for(let i=1;i<sequence.length;i++){const from=sequence[i-1],to=sequence[i],t=((lengths[i-1]+lengths[i])*.5)/total;ctx.globalAlpha=baseAlpha*expressiveStrokeOpacityAt(style,ordinal);ctx.lineWidth=expressiveStrokeWidthAt(style,t);ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();drawn=true;ordinal++;}}ctx.restore();return drawn;}
export function pathStrokeRenderWidth(path){return path?.expressiveStroke?expressiveStrokeMaxWidth(path.expressiveStroke):Math.max(0,finite(path?.strokeWidth));}

export function drawVectorObject(ctx,object,{drawObject,document=null}={}){
  if(object.type==='path'){
    const appearance=resolvePathPaintAppearance(object,document);tracePath(ctx,object);let fill=appearance.fill;
    if(!appearance.material&&object.gradient?.stops?.length){const g=object.gradient.type==='radial'?ctx.createRadialGradient(object.gradient.x1||0,object.gradient.y1||0,0,object.gradient.x2||0,object.gradient.y2||0,object.gradient.r||100):ctx.createLinearGradient(object.gradient.x1||0,object.gradient.y1||0,object.gradient.x2||100,object.gradient.y2||0);for(const s of object.gradient.stops)g.addColorStop(Math.max(0,Math.min(1,+s.offset)),s.color);fill=g;}
    if(fill&&fill!=='none'){ctx.fillStyle=fill;ctx.fill(object.fillRule||'evenodd');}const expressiveDrawn=object.expressiveStroke?drawExpressivePathStroke(ctx,object):false;if(!expressiveDrawn&&appearance.stroke&&appearance.stroke!=='none'&&(object.strokeWidth||0)>0){tracePath(ctx,object);ctx.strokeStyle=appearance.stroke;ctx.lineWidth=object.strokeWidth;ctx.lineJoin=object.lineJoin||'round';ctx.lineCap=object.lineCap||'round';ctx.miterLimit=object.miterLimit||4;ctx.setLineDash?.(object.dash||[]);ctx.lineDashOffset=object.dashOffset||0;ctx.stroke();}return true;
  }
  if(object.type==='repeat'){for(const m of repeatTransforms(object)){ctx.save();ctx.transform(...m);drawObject?.(ctx,object.source);ctx.restore();}return true;}return false;
}

const esc=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const matrixSVG=m=>`matrix(${(m||identity()).map(v=>+v.toFixed(6)).join(' ')})`;
export function pathData(path){return (path.subpaths||[]).map(sub=>{const a=sub.anchors||[];if(!a.length)return'';let d=`M${a[0].x} ${a[0].y}`;const count=sub.closed?a.length:a.length-1;for(let i=0;i<count;i++){const p=a[i],q=a[(i+1)%a.length],o=p.out||{x:0,y:0},inn=q.in||{x:0,y:0};d+=(o.x||o.y||inn.x||inn.y)?` C${p.x+o.x} ${p.y+o.y} ${q.x+inn.x} ${q.y+inn.y} ${q.x} ${q.y}`:` L${q.x} ${q.y}`;}return d+(sub.closed?' Z':'');}).join(' ');}

export function vectorObjectToSVG(object,defs=[]){
  if(object.type==='path'){const appearance=resolvePathPaintAppearance(object);let fill=appearance.fill||'none';if(!appearance.material&&object.gradient?.stops?.length){const gid=object.gradient.id||`grad_${object.id.replace(/[^a-z0-9_-]/gi,'_')}`,radial=object.gradient.type==='radial';defs.push(`<${radial?'radialGradient':'linearGradient'} id="${gid}" ${radial?`cx="${object.gradient.x2??.5}" cy="${object.gradient.y2??.5}" r="${object.gradient.r??.5}"`:`x1="${object.gradient.x1??0}" y1="${object.gradient.y1??0}" x2="${object.gradient.x2??1}" y2="${object.gradient.y2??0}"`} gradientUnits="${object.gradient.units||'objectBoundingBox'}"${object.gradient.matrix?` gradientTransform="${matrixSVG(object.gradient.matrix)}"`:''}>${object.gradient.stops.map(s=>`<stop offset="${s.offset}" stop-color="${esc(s.color)}"${s.opacity==null?'':` stop-opacity="${s.opacity}"`}/>`).join('')}</${radial?'radialGradient':'linearGradient'}>`);fill=`url(#${gid})`;}
    let clip='';if(object.clipPath?.path){const cid=`clip_${object.id.replace(/[^a-z0-9_-]/gi,'_')}`;defs.push(`<clipPath id="${cid}">${vectorObjectToSVG(object.clipPath.path,defs)}</clipPath>`);clip=` clip-path="url(#${cid})"`;}if(object.mask?.path){const mid=`mask_${object.id.replace(/[^a-z0-9_-]/gi,'_')}`;defs.push(`<mask id="${mid}">${vectorObjectToSVG({...object.mask.path,fill:'#fff'},defs)}</mask>`);clip+=` mask="url(#${mid})"`;}
    const expressive=object.expressiveStroke==null?null:normalizeExpressiveStroke(object.expressiveStroke,{color:appearance.stroke,width:object.strokeWidth}),svgStroke=expressive?.fallback?.color||appearance.stroke||'none',svgWidth=expressive?.fallback?.width??object.strokeWidth??0,expressiveAttrs=expressive?` data-ink-expressive-stroke="${expressive.format}@${expressive.version}" data-ink-expressive-fallback="ordinary-vector" data-ink-profile-samples="${expressive.profile.samples.length}"`:'',materialAttrs=appearance.material?` data-ink-material-ref="${esc(appearance.material.templateId)}" data-ink-material-version="${esc(appearance.material.templateVersion||'')}" data-ink-material-fallback="ordinary-vector"`:'';
    const blend=object.blendMode&&object.blendMode!=='source-over'&&object.blendMode!=='normal'?` style="mix-blend-mode:${esc(object.blendMode)}"`:``;return `<path id="${esc(object.id)}" data-ink-id="${esc(object.id)}" data-ink-type="path" data-ink-topology="${(object.subpaths||[]).map(s=>s.role).join(',')}"${expressiveAttrs}${materialAttrs} transform="${matrixSVG(object.matrix)}" opacity="${object.opacity??1}"${blend} fill="${esc(fill)}" fill-rule="${object.fillRule||'evenodd'}" stroke="${esc(svgStroke)}" stroke-width="${svgWidth}" stroke-linecap="${object.lineCap||'round'}" stroke-linejoin="${object.lineJoin||'round'}" stroke-miterlimit="${object.miterLimit||4}"${!expressive&&object.dash?.length?` stroke-dasharray="${object.dash.join(' ')}"`:''}${!expressive&&object.dashOffset?` stroke-dashoffset="${object.dashOffset}"`:''}${clip} d="${pathData(object)}"/>`;
  }
  if(object.type==='repeat'){const transforms=repeatTransforms(object),descriptors=reconcileRepeatInstances(object,transforms);object.instances=descriptors;const instances=transforms.map((m,i)=>{const geometryId=stableCompositeId(descriptors[i].instanceId,['geometry']),source=cloneRepeatSource(object.source,descriptors[i].instanceId,{rootId:geometryId});return `<g id="${esc(descriptors[i].instanceId)}" data-ink-id="${esc(descriptors[i].instanceId)}" data-instance="${i}" data-ring-index="${descriptors[i].ringIndex}" data-generated-by="${esc(object.id)}" transform="${matrixSVG(m)}">${vectorObjectToSVG(source,defs)}</g>`;}).join('');return `<g id="${esc(object.id)}" data-ink-id="${esc(object.id)}" data-ink-type="repeat" data-repeat-mode="${object.mode}" data-repeat-count="${object.count}" data-identity-rule="${esc(object.identityRule?.format||'repeat-stable-v1')}" transform="${matrixSVG(object.matrix)}">${instances}</g>`;}
  if(object.type==='group'){if(object.visible===false)return'';const blend=object.blendMode&&object.blendMode!=='source-over'&&object.blendMode!=='normal'?` style="mix-blend-mode:${esc(object.blendMode)}"`:'';return `<g id="${esc(object.id)}" data-ink-id="${esc(object.id)}" data-ink-type="group" transform="${matrixSVG(object.matrix)}" opacity="${object.opacity??1}"${blend}>${(object.children||[]).map(c=>vectorObjectToSVG(c,defs)).join('')}</g>`;}
  if(object.type==='frame'){if(object.visible===false)return'';return `<g id="${esc(object.id)}" data-ink-id="${esc(object.id)}" data-ink-type="frame" data-frame-width="${finite(object.width)||1}" data-frame-height="${finite(object.height)||1}" transform="${matrixSVG(object.matrix)}" opacity="${object.opacity??1}">${(object.children||[]).map(c=>vectorObjectToSVG(c,defs)).join('')}</g>`;}
  if(object.type==='text')return `<text id="${esc(object.id)}" transform="${matrixSVG(object.matrix)}" x="${finite(object.x)}" y="${finite(object.y)}" fill="${esc(object.fill||'#000')}" font-family="${esc(object.fontFamily||'sans-serif')}" font-size="${finite(object.fontSize)||16}">${esc(object.text||'')}</text>`;return'';
}

const tokens=d=>(String(d).match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)||[]);
function arcCubics(from,rx,ry,rotation,largeArc,sweep,to){rx=Math.abs(rx);ry=Math.abs(ry);if(!rx||!ry||Math.hypot(to.x-from.x,to.y-from.y)<1e-10)return[{c1:{...from},c2:{...to},to:{...to}}];const phi=rotation*Math.PI/180,cos=Math.cos(phi),sin=Math.sin(phi),dx=(from.x-to.x)/2,dy=(from.y-to.y)/2,xp=cos*dx+sin*dy,yp=-sin*dx+cos*dy;let lambda=xp*xp/(rx*rx)+yp*yp/(ry*ry);if(lambda>1){const s=Math.sqrt(lambda);rx*=s;ry*=s;}const sign=largeArc===sweep?-1:1,coef=sign*Math.sqrt(Math.max(0,(rx*rx*ry*ry-rx*rx*yp*yp-ry*ry*xp*xp)/(rx*rx*yp*yp+ry*ry*xp*xp||1))),cxp=coef*rx*yp/ry,cyp=-coef*ry*xp/rx,cx=cos*cxp-sin*cyp+(from.x+to.x)/2,cy=sin*cxp+cos*cyp+(from.y+to.y)/2,angle=(u,v)=>Math.atan2(u.x*v.y-u.y*v.x,u.x*v.x+u.y*v.y),start=angle({x:1,y:0},{x:(xp-cxp)/rx,y:(yp-cyp)/ry});let delta=angle({x:(xp-cxp)/rx,y:(yp-cyp)/ry},{x:(-xp-cxp)/rx,y:(-yp-cyp)/ry});if(!sweep&&delta>0)delta-=Math.PI*2;if(sweep&&delta<0)delta+=Math.PI*2;const count=Math.ceil(Math.abs(delta)/(Math.PI/2)),step=delta/count,map=(x,y)=>({x:cx+rx*(cos*x-sin*y),y:cy+ry*(sin*x+cos*y)}),out=[];for(let i=0;i<count;i++){const a=start+i*step,b=a+step,k=4/3*Math.tan((b-a)/4),p0={x:Math.cos(a),y:Math.sin(a)},p3={x:Math.cos(b),y:Math.sin(b)};out.push({c1:map(p0.x-k*p0.y,p0.y+k*p0.x),c2:map(p3.x+k*p3.y,p3.y-k*p3.x),to:map(p3.x,p3.y)});}return out;}
export function parsePathData(d){
  const t=tokens(d),subs=[];let i=0,cmd='',cur={x:0,y:0},start={x:0,y:0},sub=null,last=null,lastCubic=null,lastQuad=null;const num=()=>+t[i++],ensure=()=>{if(!sub){sub={role:'outer',closed:false,anchors:[]};subs.push(sub);}};
  while(i<t.length){if(/[a-zA-Z]/.test(t[i]))cmd=t[i++];if(!cmd)throw new Error('INK_SVG_PATH_COMMAND_MISSING');const rel=cmd===cmd.toLowerCase(),op=cmd.toUpperCase(),abs=(x,y)=>({x:rel?cur.x+x:x,y:rel?cur.y+y:y});if(op==='M'){const p=abs(num(),num());cur=p;sub={role:subs.length?'hole':'outer',closed:false,anchors:[createAnchor(cur.x,cur.y)]};subs.push(sub);start={...cur};cmd=rel?'l':'L';last=sub.anchors[0];lastCubic=lastQuad=null;}else if(op==='L'||op==='H'||op==='V'){ensure();let p;if(op==='L')p=abs(num(),num());else if(op==='H')p={x:rel?cur.x+num():num(),y:cur.y};else p={x:cur.x,y:rel?cur.y+num():num()};cur=p;last=createAnchor(p.x,p.y);sub.anchors.push(last);lastCubic=lastQuad=null;}else if(op==='C'||op==='S'){ensure();let c1,c2,p;if(op==='C'){c1=abs(num(),num());c2=abs(num(),num());p=abs(num(),num());}else{c1=lastCubic?{x:2*cur.x-lastCubic.x,y:2*cur.y-lastCubic.y}:{...cur};c2=abs(num(),num());p=abs(num(),num());}if(last)last.out={x:c1.x-cur.x,y:c1.y-cur.y};const a=createAnchor(p.x,p.y,{x:c2.x-p.x,y:c2.y-p.y},null,{mode:'smooth'});sub.anchors.push(a);last=a;cur=p;lastCubic=c2;lastQuad=null;}else if(op==='Q'||op==='T'){ensure();let q,p;if(op==='Q'){q=abs(num(),num());p=abs(num(),num());}else{q=lastQuad?{x:2*cur.x-lastQuad.x,y:2*cur.y-lastQuad.y}:{...cur};p=abs(num(),num());}const c1={x:cur.x+2/3*(q.x-cur.x),y:cur.y+2/3*(q.y-cur.y)},c2={x:p.x+2/3*(q.x-p.x),y:p.y+2/3*(q.y-p.y)};if(last)last.out={x:c1.x-cur.x,y:c1.y-cur.y};const a=createAnchor(p.x,p.y,{x:c2.x-p.x,y:c2.y-p.y},null,{mode:'smooth'});sub.anchors.push(a);last=a;cur=p;lastQuad=q;lastCubic=null;}else if(op==='A'){ensure();const rx=num(),ry=num(),rot=num(),large=Boolean(num()),sweep=Boolean(num()),p=abs(num(),num());for(const arc of arcCubics(cur,rx,ry,rot,large,sweep,p)){if(last)last.out={x:arc.c1.x-cur.x,y:arc.c1.y-cur.y};const a=createAnchor(arc.to.x,arc.to.y,{x:arc.c2.x-arc.to.x,y:arc.c2.y-arc.to.y},null,{mode:'smooth'});sub.anchors.push(a);last=a;cur=arc.to;}lastCubic=lastQuad=null;}else if(op==='Z'){if(sub){sub.closed=true;const first=sub.anchors[0],closing=sub.anchors.at(-1);if(first&&closing!==first&&Math.hypot(closing.x-first.x,closing.y-first.y)<1e-8){first.in={...closing.in};sub.anchors.pop();last=first;}}cur={...start};cmd='';lastCubic=lastQuad=null;}else throw new Error(`INK_SVG_PATH_COMMAND_UNSUPPORTED:${op}`);
  }return subs;
}

const attr=(text,name)=>{const m=text.match(new RegExp(`(?:^|\\s)${name.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\s*=\\s*["']([^"']*)["']`,'i'));return m?.[1]};
const parseStyle=text=>Object.fromEntries(String(text||'').split(';').map(x=>x.split(':').map(v=>v.trim())).filter(x=>x.length===2));
export function parseSVGTransform(text=''){let m=identity();for(const part of String(text).matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi)){const op=part[1].toLowerCase(),v=part[2].trim().split(/[ ,]+/).map(Number);let n=identity();if(op==='matrix'&&v.length>=6)n=v.slice(0,6);else if(op==='translate')n=translate(v[0]||0,v[1]||0);else if(op==='scale')n=[v[0]??1,0,0,v[1]??v[0]??1,0,0];else if(op==='rotate')n=rotateAt(v[0]||0,{x:v[1]||0,y:v[2]||0});else if(op==='skewx')n=[1,0,Math.tan((v[0]||0)*Math.PI/180),1,0,0];else if(op==='skewy')n=[1,Math.tan((v[0]||0)*Math.PI/180),0,1,0,0];m=multiply(m,n);}return m;}
function svgShapePath(tag){const name=(tag.match(/^<\s*([\w:-]+)/)||[])[1]?.toLowerCase();if(name==='path')return attr(tag,'d');if(name==='rect'){const x=+attr(tag,'x')||0,y=+attr(tag,'y')||0,w=+attr(tag,'width')||0,h=+attr(tag,'height')||0;return`M${x} ${y}H${x+w}V${y+h}H${x}Z`;}if(name==='line')return`M${+attr(tag,'x1')||0} ${+attr(tag,'y1')||0}L${+attr(tag,'x2')||0} ${+attr(tag,'y2')||0}`;if(name==='polyline'||name==='polygon'){const pts=(attr(tag,'points')||'').trim().split(/[ ,]+/);return pts.length>=4?`M${pts[0]} ${pts[1]} `+pts.slice(2).reduce((s,v,i)=>s+(i%2?' ': 'L')+v,'')+(name==='polygon'?' Z':''):null;}if(name==='circle'||name==='ellipse'){const cx=+attr(tag,'cx')||0,cy=+attr(tag,'cy')||0,rx=name==='circle'?+attr(tag,'r')||0:+attr(tag,'rx')||0,ry=name==='circle'?rx:+attr(tag,'ry')||0;return`M${cx-rx} ${cy}A${rx} ${ry} 0 1 0 ${cx+rx} ${cy}A${rx} ${ry} 0 1 0 ${cx-rx} ${cy}Z`;}return null;}
export function importSVGDocument(svg,options={}){const normalized=normalizeSvgIds(svg,options),source=normalized.svg,css={};for(const block of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))for(const rule of block[1].matchAll(/([^{}]+)\{([^{}]+)\}/g))for(const selector of rule[1].split(','))css[selector.trim()]=parseStyle(rule[2]);const gradients={};for(const g of source.matchAll(/<(linearGradient|radialGradient)\b([^>]*)>([\s\S]*?)<\/\1>/gi)){const id=attr(g[2],'id');if(!id)continue;gradients[id]={id,type:g[1].toLowerCase().startsWith('radial')?'radial':'linear',x1:+(attr(g[2],'x1')||0),y1:+(attr(g[2],'y1')||0),x2:+(attr(g[2],g[1].toLowerCase().startsWith('radial')?'cx':'x2')||1),y2:+(attr(g[2],g[1].toLowerCase().startsWith('radial')?'cy':'y2')||0),r:+(attr(g[2],'r')||.5),units:attr(g[2],'gradientUnits')||'objectBoundingBox',matrix:parseSVGTransform(attr(g[2],'gradientTransform')),stops:[...g[3].matchAll(/<stop\b[^>]*>/gi)].map(s=>{const st=parseStyle(attr(s[0],'style'));return{offset:parseFloat(attr(s[0],'offset')||0)/(String(attr(s[0],'offset')).includes('%')?100:1),color:attr(s[0],'stop-color')||st['stop-color']||'#000',opacity:+(attr(s[0],'stop-opacity')||st['stop-opacity']||1)};})};}const defsById={};for(const match of source.matchAll(/<(path|rect|circle|ellipse|polygon|polyline|line)\b[^>]*>/gi)){const id=attr(match[0],'id');if(id)defsById[id]=match[0];}const maskDefs={},clipDefs={};for(const block of source.matchAll(/<(clipPath|mask)\b([^>]*)>([\s\S]*?)<\/\1>/gi)){const id=attr(block[2],'id'),tag=block[3].match(/<(path|rect|circle|ellipse|polygon|polyline|line)\b[^>]*>/i)?.[0],d=tag&&svgShapePath(tag);if(id&&d){const value=createPath({id:`${id}_path`,subpaths:parsePathData(d),fill:'#fff',stroke:'none',matrix:parseSVGTransform(attr(tag,'transform'))});(block[1].toLowerCase()==='mask'?maskDefs:clipDefs)[id]=value;}}const paths=[],texts=[],unsupported=[];const addTag=(tag,instance={})=>{const d=svgShapePath(tag);if(!d)return;const id=instance.id||attr(tag,'id')||attr(tag,'data-ink-id')||ID(),classes=(attr(tag,'class')||'').split(/\s+/).map(x=>`.${x}`),style={...(css[classes.find(x=>css[x])]||{}),...parseStyle(attr(tag,'style'))},fill=instance.fill||attr(tag,'fill')||style.fill||'#000000',gradientMatch=String(fill).match(/^url\(#([^)]+)\)$/),clipRef=String(attr(tag,'clip-path')||'').match(/url\(#([^)]+)\)/)?.[1],maskRef=String(attr(tag,'mask')||'').match(/url\(#([^)]+)\)/)?.[1],path=createPath({id,name:id,subpaths:parsePathData(d),fill:gradientMatch?'none':fill,stroke:attr(tag,'stroke')||style.stroke||'none',strokeWidth:+(attr(tag,'stroke-width')||style['stroke-width']||1),fillRule:attr(tag,'fill-rule')||style['fill-rule']||'evenodd',matrix:multiply(instance.matrix||identity(),parseSVGTransform(attr(tag,'transform'))),opacity:+(attr(tag,'opacity')||style.opacity||1),dash:String(attr(tag,'stroke-dasharray')||style['stroke-dasharray']||'').split(/[ ,]+/).filter(Boolean).map(Number),dashOffset:+(attr(tag,'stroke-dashoffset')||0),lineCap:attr(tag,'stroke-linecap')||'round',lineJoin:attr(tag,'stroke-linejoin')||'round',miterLimit:+(attr(tag,'stroke-miterlimit')||4),gradient:gradientMatch?clone(gradients[gradientMatch[1]]||null):null,clipPath:clipRef&&clipDefs[clipRef]?{id:clipRef,path:clipDefs[clipRef]}:null,mask:maskRef&&maskDefs[maskRef]?{id:maskRef,path:maskDefs[maskRef]}:null,metadata:{svgId:attr(tag,'id')||id,svgClass:attr(tag,'class')||null,clipRef:clipRef||null,maskRef:maskRef||null}});path.subpaths.forEach((subpath,subpathIndex)=>{subpath.id=`${id}:s${subpathIndex}`;subpath.anchors.forEach((anchor,anchorIndex)=>{anchor.id=`${id}:s${subpathIndex}:a${anchorIndex}`;});});const roles=(attr(tag,'data-ink-topology')||'').split(',');roles.forEach((role,i)=>{if(path.subpaths[i]&&['outer','hole'].includes(role))path.subpaths[i].role=role;});paths.push(path);};const definitionRanges=[...source.matchAll(/<(defs|clipPath|mask)\b[^>]*>[\s\S]*?<\/\1>/gi)].map(m=>[m.index,m.index+m[0].length]);for(const match of source.matchAll(/<(path|rect|circle|ellipse|polygon|polyline|line)\b[^>]*>/gi))if(!definitionRanges.some(([a,b])=>match.index>=a&&match.index<b))addTag(match[0]);for(const use of source.matchAll(/<use\b[^>]*>/gi)){const href=attr(use[0],'href')||attr(use[0],'xlink:href'),tag=href?.startsWith('#')?defsById[href.slice(1)]:null;if(tag)addTag(tag,{id:attr(use[0],'id')||stableCompositeId('svg-use',[options.sourceDocumentIdentity||'document',options.importSessionSeed||'0']),matrix:multiply(translate(+attr(use[0],'x')||0,+attr(use[0],'y')||0),parseSVGTransform(attr(use[0],'transform')))});else unsupported.push({element:'use',reason:'unresolved-reference',href});}for(const text of source.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi))texts.push({id:attr(text[1],'id')||stableCompositeId('svg-text',[options.sourceDocumentIdentity||'document',options.importSessionSeed||'0',texts.length]),type:'text',text:text[2].replace(/<[^>]+>/g,''),x:+attr(text[1],'x')||0,y:+attr(text[1],'y')||0,fill:attr(text[1],'fill')||'#000',fontFamily:attr(text[1],'font-family')||'sans-serif',fontSize:+attr(text[1],'font-size')||16,matrix:parseSVGTransform(attr(text[1],'transform'))});let objects=[...paths,...texts];for(const groupMatch of source.matchAll(/<g\b([^>]*)>([\s\S]*?)<\/g>/gi)){const groupId=attr(groupMatch[1],'id');if(!groupId)continue;const childIds=[...groupMatch[2].matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map(x=>x[1]),children=objects.filter(o=>childIds.includes(o.id));if(children.length){objects=objects.filter(o=>!children.includes(o));objects.push({id:groupId,type:'group',name:groupId,matrix:parseSVGTransform(attr(groupMatch[1],'transform')),opacity:+(attr(groupMatch[1],'opacity')||1),children});}}return{format:'INK-SVG',version:1,objects,paths,texts,gradients,unsupported,metadata:{idsPreserved:true,groupsPreserved:objects.some(x=>x.type==='group'),cssRules:Object.keys(css).length,idNormalization:normalized.report,originalSvg:normalized.report.normalizedOccurrenceCount||normalized.report.generatedIdCount?String(svg):null,normalizedSvg:source}};}
export function importSVGPaths(svg){return importSVGDocument(svg).paths;}

export function pathMetrics(path){
  const matrix=path.matrix||identity(),rings=(path.subpaths||[]).map(s=>({role:s.role,points:flattenSubpath(s).map(p=>point(matrix,p))}));const pts=rings.flatMap(r=>r.points),bounds=pathBounds(path,matrix);let area=0,cx=0,cy=0,curvature=0,segments=0;
  for(const r of rings){const a=Math.abs(signedArea(r.points))*(r.role==='hole'?-1:1);area+=a;const local=r.points.reduce((s,p)=>({x:s.x+p.x,y:s.y+p.y}),{x:0,y:0});cx+=local.x/Math.max(1,r.points.length)*a;cy+=local.y/Math.max(1,r.points.length)*a;for(let i=1;i<r.points.length-1;i++){const p=r.points[i-1],q=r.points[i],n=r.points[i+1],a1=Math.atan2(q.y-p.y,q.x-p.x),a2=Math.atan2(n.y-q.y,n.x-q.x);curvature+=Math.abs(Math.atan2(Math.sin(a2-a1),Math.cos(a2-a1)));segments++;}}
  const centroid=Math.abs(area)>1e-9?{x:cx/area,y:cy/area}:{x:bounds.x+bounds.w/2,y:bounds.y+bounds.h/2};const outer=pts.length?pts: [{x:0,y:0}],mx=outer.reduce((s,p)=>s+p.x,0)/outer.length,my=outer.reduce((s,p)=>s+p.y,0)/outer.length;let xx=0,yy=0,xy=0;for(const p of outer){xx+=(p.x-mx)**2;yy+=(p.y-my)**2;xy+=(p.x-mx)*(p.y-my);}return{bounds,area:Math.abs(area),signedArea:area,centroid,orientation:.5*Math.atan2(2*xy,xx-yy)*180/Math.PI,curvature:curvature/Math.max(1,segments),subpaths:rings.length,holes:rings.filter(r=>r.role==='hole').length};
}
