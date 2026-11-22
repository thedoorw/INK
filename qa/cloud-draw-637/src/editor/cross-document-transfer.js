// Serializable bounded transfer through the existing native History/Document authority.
import { deepClone, uid } from '../core/index.js';
import { findPageObject, inspectDocument } from '../document/index.js';

const reject=code=>{throw Object.assign(new Error(code),{code});};
const serialize=value=>JSON.parse(JSON.stringify(value));
const forbidden=['assetId','assetRef','linkedAsset','referenceSrc','imageSrc','dataUrl','floraPaint','mask','componentId','definitionId'];
function unsupportedDependency(value){
  if(!value||typeof value!=='object')return false;
  if(Array.isArray(value))return value.some(unsupportedDependency);
  if(Object.keys(value).some(key=>forbidden.includes(key)&&value[key]!=null))return true;
  return Object.values(value).some(item=>typeof item==='object'&&unsupportedDependency(item));
}
function referencedMaterial(object,document){
  const id=object.materialAppearance?.templateId||object.materialAppearance?.materialRef?.templateId;
  if(!id)return null;
  const matches=(document.materialLibrary?.templates||[]).filter(x=>x.templateId===id);
  if(matches.length!==1)reject('INK_TRANSFER_MATERIAL_DEPENDENCY_UNRESOLVED');
  const template=serialize(matches[0]);
  if(unsupportedDependency(template))reject('INK_TRANSFER_UNSUPPORTED_MATERIAL_ASSET');
  return template;
}
export function serializeCrossDocumentSelection(registry,sourceSessionId){
  const session=registry.get(sourceSessionId);
  if(!session||session.state!=='OPEN')reject('INK_TRANSFER_SOURCE_UNAVAILABLE');
  if(registry.activeId===sourceSessionId)registry.capture(session);
  const page=session.doc.pages.find(x=>x.id===session.doc.activePageId);
  if(!page)reject('INK_TRANSFER_SOURCE_PAGE_STALE');
  const selected=session.values.selection||[];
  if(!selected.length)reject('INK_TRANSFER_EMPTY_SELECTION');
  const objects=[],materials=new Map();
  for(const ref of selected){
    const found=findPageObject(page,ref);
    if(!found||!found.object||found.object.type!=='path'||found.parentObject)reject('INK_TRANSFER_UNSUPPORTED_OBJECT');
    if(unsupportedDependency(found.object))reject('INK_TRANSFER_UNSUPPORTED_LINKED_ASSET');
    objects.push(serialize(found.object));
    const template=referencedMaterial(found.object,session.doc);
    if(template)materials.set(template.templateId,template);
  }
  const ids=objects.map(x=>x.id);
  if(new Set(ids).size!==ids.length)reject('INK_TRANSFER_AMBIGUOUS_IDS');
  return Object.freeze({schema:'INK_CROSS_DOCUMENT_TRANSFER_V1',source:registry.current().sessionId===sourceSessionId?registry.current():{sessionId:session.sessionId,documentId:session.documentId,generation:session.generation,pageId:page.id},objects:serialize(objects),materials:serialize([...materials.values()])});
}
export function pasteCrossDocumentSelection(app,transfer){
  if(transfer?.schema!=='INK_CROSS_DOCUMENT_TRANSFER_V1')reject('INK_TRANSFER_INVALID_PACKAGE');
  const registry=app.sessions,source=registry.assertTarget(transfer.source),target=registry.active();
  if(source.sessionId===target.sessionId)reject('INK_TRANSFER_SAME_SESSION');
  if(app.history?.pending)reject('INK_TRANSFER_HISTORY_BUSY');
  const page=app.page(),layer=app.layer();
  if(!page||!layer||layer.locked||layer.visible===false)reject('INK_TRANSFER_TARGET_UNAVAILABLE');
  if(!Array.isArray(transfer.objects)||!transfer.objects.length||!Array.isArray(transfer.materials))reject('INK_TRANSFER_INVALID_PACKAGE');
  if(transfer.objects.length>1000)reject('INK_TRANSFER_CAP_EXCEEDED');
  const objects=serialize(transfer.objects),templates=serialize(transfer.materials);
  if(objects.some(x=>x.type!=='path'||unsupportedDependency(x)))reject('INK_TRANSFER_UNSUPPORTED_OBJECT');
  if(templates.some(x=>!x.templateId||unsupportedDependency(x)))reject('INK_TRANSFER_UNSUPPORTED_MATERIAL');
  const materialMap=new Map();
  for(const template of templates){
    if(materialMap.has(template.templateId))reject('INK_TRANSFER_AMBIGUOUS_MATERIAL');
    materialMap.set(template.templateId,uid());
  }
  for(const object of objects){
    object.id=uid();
    for(const sub of object.subpaths||[]){if(sub.id)sub.id=uid();for(const anchor of sub.anchors||[])if(anchor.id)anchor.id=uid();}
    if(object.materialAppearance){
      const oldId=object.materialAppearance.templateId||object.materialAppearance.materialRef?.templateId;
      if(!materialMap.has(oldId))reject('INK_TRANSFER_MATERIAL_DEPENDENCY_UNRESOLVED');
      object.materialAppearance.templateId=materialMap.get(oldId);
      if(object.materialAppearance.materialRef)object.materialAppearance.materialRef.templateId=materialMap.get(oldId);
    }
  }
  for(const template of templates)template.templateId=materialMap.get(template.templateId);
  const priorSource=JSON.stringify(source.doc),priorTarget=JSON.stringify(app.doc),priorApplied=app.history.undoStack.length;
  const priorEntry=app.history.undoStack.at(-1);
  const paths=[app.layerObjectsPath(layer),['materialLibrary']];
  app.history.pushScoped('跨文件貼上 Path',paths,()=>{
    layer.objects.push(...objects);
    if(templates.length){
      if(!app.doc.materialLibrary)app.doc.materialLibrary={templates:[]};
      if(!Array.isArray(app.doc.materialLibrary.templates))reject('INK_TRANSFER_TARGET_MATERIAL_INVALID');
      app.doc.materialLibrary.templates.push(...templates);
    }
    if(!inspectDocument(app.doc).passed)reject('INK_TRANSFER_INTEGRITY_FAILED');
    registry.assertTarget({sessionId:target.sessionId,documentId:target.documentId,generation:target.generation},{active:true});
  });
  // Native commit truncates Redo and evicts the oldest entry at the configured cap.
  // Verify the new applied entry, not a +1 total timeline-length assumption.
  if(app.history.undoStack.length!==Math.min(app.history.limit,priorApplied+1)||
     app.history.redoStack.length!==0||
     app.history.undoStack.at(-1)===priorEntry||
     app.history.undoStack.at(-1)?.label!=='跨文件貼上 Path')reject('INK_TRANSFER_HISTORY_NOT_ATOMIC');
  if(JSON.stringify(source.doc)!==priorSource)reject('INK_TRANSFER_SOURCE_MUTATED');
  if(priorTarget===JSON.stringify(app.doc))reject('INK_TRANSFER_NO_OP');
  app.selection=objects.map(object=>({layerId:layer.id,objectId:object.id}));
  app.spatialDirty=true;app.refreshAll();
  return Object.freeze({changed:true,count:objects.length,sourceSessionId:source.sessionId,targetSessionId:target.sessionId,objectIds:objects.map(x=>x.id)});
}
