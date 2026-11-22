// Read-only bounded bridge from the existing Document/selection authority.
// Does not mutate selection, Document, History, Recipe, or native object IDs.
import {artboardTrimBounds} from '../document/artboard.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const objectId=x=>typeof x==='string'?x:x?.objectId??x?.id??null;
const MAX_SELECTION=64,MAX_VISIT=20000,MAX_DEPTH=32;
function boundsOfPath(object){
  const points=[];
  const matrix=Array.isArray(object.matrix)&&object.matrix.length===6?
    object.matrix:[1,0,0,1,0,0];
  for(const sub of object.subpaths||[]){
    for(const anchor of sub.anchors||[]){
      const x=anchor?.x,y=anchor?.y;
      if(!finite(x)||!finite(y))fail('INK_PROGRAM_SELECTION_GEOMETRY_INVALID');
      points.push([matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);
      if(points.length>MAX_VISIT)fail('INK_PROGRAM_SELECTION_SIZE_LIMIT');
    }
  }
  if(!points.length)fail('INK_PROGRAM_SELECTION_NO_GEOMETRY');
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  return [Math.min(...xs),Math.max(...ys),Math.max(...xs),Math.min(...ys)];
}
function collectDocumentObjects(doc){
  const found=new Map();let visited=0;
  const walk=(item,pageId,layerId,depth)=>{
    if(++visited>MAX_VISIT||depth>MAX_DEPTH)fail('INK_PROGRAM_DOCUMENT_INSPECTION_BUDGET');
    const id=item?.id;
    if(typeof id==='string'){
      if(found.has(id))fail('INK_PROGRAM_SELECTION_AMBIGUOUS_ID');
      found.set(id,{item,pageId,layerId});
    }
    for(const child of item?.children||[])walk(child,pageId,layerId,depth+1);
  };
  for(const page of doc?.pages||[]){
    for(const layer of page?.layers||[]){
      for(const item of layer?.objects||[])walk(item,page.id,layer.id,0);
    }
  }
  return found;
}
function inputItem(object,depth=0){
  if(depth>MAX_DEPTH)fail('INK_PROGRAM_SELECTION_NESTING_LIMIT');
  if(object.type==='path')return {
    typename:'PathItem',
    geometricBounds:boundsOfPath(object),
    pageItems:[],pathItems:[]
  };
  if(object.type==='group'){
    const children=(object.children||[]).map(o=>inputItem(o,depth+1));
    return {typename:'GroupItem',pageItems:children,pathItems:children.filter(c=>c.typename==='PathItem')};
  }
  if(object.type==='compoundPath'){
    const children=(object.children||[]).map(o=>inputItem(o,depth+1));
    return {typename:'CompoundPathItem',pageItems:children,pathItems:children.filter(c=>c.typename==='PathItem')};
  }
  fail('INK_PROGRAM_SELECTION_ITEM_TYPE_UNSUPPORTED');
}
export function snapshotBoundedProgramHost(app){
  const doc=app?.doc;
  if(!doc?.id||!Array.isArray(doc.pages))fail('INK_PROGRAM_DOCUMENT_REQUIRED');
  const page=doc.pages.find(x=>x.id===doc.activePageId)||doc.pages[0];
  if(!page)fail('INK_PROGRAM_ACTIVE_PAGE_REQUIRED');
  const bounds=artboardTrimBounds(page);
  const selected=Array.isArray(app.selection)?app.selection:[];
  if(selected.length>MAX_SELECTION)fail('INK_PROGRAM_SELECTION_SIZE_LIMIT');
  const ids=selected.map(objectId);
  if(ids.some(x=>typeof x!=='string'||!x))fail('INK_PROGRAM_SELECTION_REFERENCE_INVALID');
  if(new Set(ids).size!==ids.length)fail('INK_PROGRAM_SELECTION_AMBIGUOUS_ID');
  const registry=collectDocumentObjects(doc);
  const items=selected.map((ref,i)=>{
    const located=registry.get(ids[i]);
    if(!located||located.pageId!==page.id||
      (typeof ref==='object'&&ref?.pageId&&ref.pageId!==located.pageId)||
      (typeof ref==='object'&&ref?.layerId&&ref.layerId!==located.layerId))
      fail('INK_PROGRAM_SELECTION_STALE');
    return inputItem(located.item);
  });
  const snapshot={
    documentId:doc.id,pageId:page.id,
    selection:items,
    document:{
      width:Math.round(bounds.w*1000000)/1000000,
      height:Math.round(bounds.h*1000000)/1000000,
      colorSpace:doc.colorState?.colorMode==='CMYK'?'CMYK':'RGB'
    }
  };
  return JSON.parse(JSON.stringify(snapshot));
}
