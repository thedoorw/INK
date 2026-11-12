import { findPageObject } from '../document/hierarchy.js';
import { createTextObject, updateTextObject } from './text-object.js';
import { importSVGDocument } from '../vector/vector-core.js';
import { activeLayer, clone, editFail, finishStructuralMutation, structuralHistoryPaths } from './creative-operation-shared.js';

function executeTextCreateTask(app, task) {
  const layer = activeLayer(app);
  if (!layer) editFail('LAYER_UNAVAILABLE');
  const textObject = createTextObject(task.arguments);
  if (findPageObject(app.page(), textObject.id)) editFail('OBJECT_ID_COLLISION', { objectId: textObject.id });
  app.history.pushScoped('CHAT create Text', structuralHistoryPaths(app, []), () => {
    layer.objects.push(textObject);
  });
  finishStructuralMutation(app);
  const ref = { pageId: app.page().id, layerId: layer.id, objectId: textObject.id };
  return { createdRefs: [ref], resultRefs: [ref], objectId: textObject.id };
}
function executeTextEditTask(app, task) {
  const found = findPageObject(app.page(), task.targets[0]);
  if (!found || found.object?.type !== 'text') editFail('TEXT_REQUIRED');
  app.history.pushScoped('CHAT edit Text', structuralHistoryPaths(app, [found]), () => {
    if (!updateTextObject(found.object, task.arguments)) editFail('TEXT_REQUIRED');
  });
  finishStructuralMutation(app);
  return { resultRefs: [{ pageId: app.page().id, layerId: found.layer.id, objectId: found.object.id }] };
}
function executeTextPathSetTask(app, task) {
  const found = findPageObject(app.page(), task.targets[0]);
  if (!found || found.object?.type !== 'text') editFail('TEXT_REQUIRED');
  const pathFound = findPageObject(app.page(), task.arguments.pathRef);
  if (!pathFound || pathFound.object?.type !== 'path') editFail('PATH_REQUIRED');
  app.history.pushScoped('CHAT set Text Path', structuralHistoryPaths(app, [found]), () => {
    if (!updateTextObject(found.object, {
      pathText: { pathId: pathFound.object.id, startOffset: task.arguments.startOffset, overflow: task.arguments.overflow }
    })) editFail('TEXT_REQUIRED');
  });
  finishStructuralMutation(app);
  return {
    resultRefs: [{ pageId: app.page().id, layerId: found.layer.id, objectId: found.object.id }],
    pathRef: { pageId: app.page().id, layerId: pathFound.layer.id, objectId: pathFound.object.id },
    pathText: clone(found.object.pathText)
  };
}
function collectImportedObjects(objects, output = []) {
  for (const object of objects || []) {
    if (!object || typeof object !== 'object') continue;
    output.push(object);
    if (Array.isArray(object.children)) collectImportedObjects(object.children, output);
  }
  return output;
}
function executeSvgImportTask(app, task) {
  const layer = activeLayer(app);
  if (!layer) editFail('LAYER_UNAVAILABLE');
  const imported = importSVGDocument(task.arguments.svg, { sourceDocumentIdentity: app.doc?.id || 'document', importSessionSeed: task.taskId });
  const topLevel = Array.isArray(imported?.objects) ? imported.objects : [];
  if (!topLevel.length) editFail('SVG_NO_SUPPORTED_OBJECTS');
  const importedObjects = collectImportedObjects(topLevel);
  const importedIds = new Set();
  for (const object of importedObjects) {
    if (!object.id) editFail('SVG_OBJECT_ID_MISSING');
    if (importedIds.has(object.id) || findPageObject(app.page(), object.id)) editFail('OBJECT_ID_COLLISION', { objectId: object.id });
    importedIds.add(object.id);
  }
  app.history.pushScoped('CHAT import SVG', structuralHistoryPaths(app, []), () => { layer.objects.push(...topLevel); });
  finishStructuralMutation(app);
  const refs = importedObjects.map(object => ({ pageId: app.page().id, layerId: layer.id, objectId: object.id }));
  return { createdRefs: refs, resultRefs: refs, format: imported.format, version: imported.version, unsupported: clone(imported.unsupported || []), metadata: clone(imported.metadata || null) };
}
export function executeTextSvgOperation(app,task){
  if(task.operation==='text.create.v1')return executeTextCreateTask(app,task);
  if(task.operation==='text.edit.v1')return executeTextEditTask(app,task);
  if(task.operation==='text.path.set.v1')return executeTextPathSetTask(app,task);
  if(task.operation==='svg.import.v1')return executeSvgImportTask(app,task);
  editFail('OPERATION_NOT_ALLOWED',{operation:task.operation});
}
