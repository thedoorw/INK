import { Matrix, uid } from '../core/index.js';

const finitePositive = (value, fallback) => Number.isFinite(+value) && +value > 0 ? +value : fallback;
const finiteOpacity = value => Math.max(0, Math.min(1, Number.isFinite(+value) ? +value : 1));

export function createFrame({
  id = uid(),
  name = 'Frame',
  matrix = Matrix.identity(),
  width = 320,
  height = 240,
  opacity = 1,
  visible = true,
  locked = false,
  children = []
} = {}) {
  const frame = {
    id,
    type: 'frame',
    name: String(name || 'Frame'),
    matrix: Array.isArray(matrix) && matrix.length === 6 ? [...matrix] : Matrix.identity(),
    width: finitePositive(width, 320),
    height: finitePositive(height, 240),
    opacity: finiteOpacity(opacity),
    visible: visible !== false,
    locked: Boolean(locked),
    children: Array.isArray(children) ? children : []
  };
  for (const child of frame.children) if (child && typeof child === 'object') child.parentId = frame.id;
  return frame;
}

export function isFrame(object) {
  return object?.type === 'frame';
}

export function isGroup(object) {
  return object?.type === 'group';
}

export function isStructuralContainer(object) {
  return isFrame(object) || isGroup(object);
}

export function structuralContainerRole(object) {
  return isFrame(object) ? 'frame' : isGroup(object) ? 'group' : null;
}

export function walkPageObjects(page) {
  const output = [];
  let renderOrder = 0;
  const visited = new WeakSet();
  const walk = ({
    objects,
    layer,
    layerIndex,
    parentObject = null,
    parentWorldMatrix = Matrix.identity(),
    pathPrefix,
    ancestorIds = [],
    ancestorTypes = [],
    groupAncestorIds = [],
    depth = 0,
    rootObjectIndex = null,
    inheritedVisible = true,
    inheritedLocked = false,
    inheritedOpacity = 1
  }) => {
    for (let objectIndex = 0; objectIndex < (objects?.length || 0); objectIndex += 1) {
      const object = objects[objectIndex];
      if (!object || typeof object !== 'object') continue;
      if (visited.has(object)) throw Object.assign(new Error('INK_HIERARCHY_DUPLICATE_OWNERSHIP_OR_CYCLE'), { code: 'HIERARCHY_DUPLICATE_OWNERSHIP_OR_CYCLE' });
      visited.add(object);
      const worldMatrix = Matrix.toWorld(parentWorldMatrix, object.matrix || Matrix.identity());
      const path = [...pathPrefix, objectIndex];
      const effectiveVisible = inheritedVisible && object.visible !== false;
      const effectiveLocked = inheritedLocked || Boolean(object.locked);
      const effectiveOpacity = finiteOpacity(inheritedOpacity) * finiteOpacity(object.opacity);
      const entry = {
        layer,
        layerIndex,
        object,
        objectIndex,
        index: objectIndex,
        rootObjectIndex: rootObjectIndex ?? objectIndex,
        parentObject,
        parentArray: objects,
        parentWorldMatrix: [...parentWorldMatrix],
        worldMatrix,
        path,
        ancestorIds: [...ancestorIds],
        ancestorTypes: [...ancestorTypes],
        groupAncestorIds: [...groupAncestorIds],
        depth,
        renderOrder: renderOrder++,
        structuralRole: structuralContainerRole(object),
        interactionExposed: groupAncestorIds.length === 0,
        effectiveVisible,
        effectiveLocked,
        effectiveOpacity
      };
      output.push(entry);
      if (isStructuralContainer(object) && Array.isArray(object.children)) {
        walk({
          objects: object.children,
          layer,
          layerIndex,
          parentObject: object,
          parentWorldMatrix: worldMatrix,
          pathPrefix: [...path, 'children'],
          ancestorIds: [...ancestorIds, object.id],
          ancestorTypes: [...ancestorTypes, object.type],
          groupAncestorIds: isGroup(object) ? [...groupAncestorIds, object.id] : [...groupAncestorIds],
          depth: depth + 1,
          rootObjectIndex: rootObjectIndex ?? objectIndex,
          inheritedVisible: effectiveVisible,
          inheritedLocked: effectiveLocked,
          inheritedOpacity: effectiveOpacity
        });
      }
    }
  };

  for (let layerIndex = 0; layerIndex < (page?.layers?.length || 0); layerIndex += 1) {
    const layer = page.layers[layerIndex];
    walk({
      objects: layer.objects,
      layer,
      layerIndex,
      pathPrefix: ['layers', layerIndex, 'objects'],
      inheritedVisible: layer.visible !== false,
      inheritedLocked: Boolean(layer.locked),
      inheritedOpacity: finiteOpacity(layer.opacity)
    });
  }
  return output;
}

export function comparePageObjectHitOrder(a, b, { deep = false } = {}) {
  const layerDelta = (b?.layerIndex ?? 0) - (a?.layerIndex ?? 0);
  if (layerDelta) return layerDelta;
  const rootDelta = (b?.rootObjectIndex ?? 0) - (a?.rootObjectIndex ?? 0);
  if (rootDelta) return rootDelta;
  if (!deep) {
    if (b?.ancestorIds?.includes(a?.object?.id)) return -1;
    if (a?.ancestorIds?.includes(b?.object?.id)) return 1;
  }
  const renderDelta = (b?.renderOrder ?? 0) - (a?.renderOrder ?? 0);
  if (renderDelta) return renderDelta;
  const depthDelta = (b?.depth ?? 0) - (a?.depth ?? 0);
  if (depthDelta) return depthDelta;
  return (b?.objectIndex ?? 0) - (a?.objectIndex ?? 0);
}

export function findPageObject(page, refOrId) {
  const objectId = typeof refOrId === 'string' ? refOrId : refOrId?.objectId;
  const layerId = typeof refOrId === 'object' ? refOrId?.layerId : null;
  if (!objectId) return null;
  return walkPageObjects(page).find(entry => entry.object.id === objectId && (!layerId || entry.layer.id === layerId)) || null;
}

export function hierarchyWorldMatrix(page, refOrId) {
  return findPageObject(page, refOrId)?.worldMatrix || null;
}

export function hierarchyLocalMatrix(parentWorldMatrix, worldMatrix) {
  const local = Matrix.toLocal(parentWorldMatrix || Matrix.identity(), worldMatrix || Matrix.identity());
  if (!local) {
    throw Object.assign(new Error('INK_HIERARCHY_NON_INVERTIBLE_PARENT'), {
      code: 'HIERARCHY_NON_INVERTIBLE_PARENT'
    });
  }
  return local;
}

export function reparentPageObject(page, objectId, parentFrameId = null, { targetLayerId = null, index = null } = {}) {
  const source = findPageObject(page, objectId);
  if (!source) throw Object.assign(new Error(`INK_HIERARCHY_OBJECT_NOT_FOUND:${objectId}`), { code: 'HIERARCHY_OBJECT_NOT_FOUND', objectId });
  if (parentFrameId === objectId) throw Object.assign(new Error('INK_HIERARCHY_CYCLE'), { code: 'HIERARCHY_CYCLE', objectId, parentFrameId });

  const target = parentFrameId ? findPageObject(page, parentFrameId) : null;
  if (parentFrameId && (!target || !isFrame(target.object))) {
    throw Object.assign(new Error(`INK_HIERARCHY_FRAME_NOT_FOUND:${parentFrameId}`), { code: 'HIERARCHY_FRAME_NOT_FOUND', parentFrameId });
  }
  if (target?.ancestorIds?.includes(objectId)) {
    throw Object.assign(new Error('INK_HIERARCHY_CYCLE'), { code: 'HIERARCHY_CYCLE', objectId, parentFrameId });
  }
  if (target && target.layer.id !== source.layer.id) {
    throw Object.assign(new Error('INK_HIERARCHY_CROSS_LAYER_REPARENT'), {
      code: 'HIERARCHY_CROSS_LAYER_REPARENT',
      objectId,
      parentFrameId,
      sourceLayerId: source.layer.id,
      targetLayerId: target.layer.id
    });
  }

  const requestedLayer = targetLayerId ? page.layers.find(layer => layer.id === targetLayerId) : null;
  if (!target && targetLayerId && !requestedLayer) {
    throw Object.assign(new Error('INK_HIERARCHY_LAYER_NOT_FOUND'), { code: 'HIERARCHY_LAYER_NOT_FOUND', targetLayerId });
  }
  if (!target && requestedLayer && requestedLayer.id !== source.layer.id) {
    throw Object.assign(new Error('INK_HIERARCHY_CROSS_LAYER_REPARENT'), {
      code: 'HIERARCHY_CROSS_LAYER_REPARENT',
      objectId,
      sourceLayerId: source.layer.id,
      targetLayerId: requestedLayer.id
    });
  }

  const sourceWorld = [...source.worldMatrix];
  let targetArray;
  let targetParentWorld = Matrix.identity();
  let targetParentId = null;
  let targetLayer;

  if (target) {
    targetArray = target.object.children;
    targetParentWorld = target.worldMatrix;
    targetParentId = target.object.id;
    targetLayer = target.layer;
  } else {
    targetLayer = requestedLayer || source.layer;
    if (!targetLayer) throw Object.assign(new Error('INK_HIERARCHY_LAYER_NOT_FOUND'), { code: 'HIERARCHY_LAYER_NOT_FOUND' });
    targetArray = targetLayer.objects;
  }

  const oldIndex = source.parentArray.indexOf(source.object);
  if (oldIndex < 0) throw Object.assign(new Error('INK_HIERARCHY_SOURCE_DETACHED'), { code: 'HIERARCHY_SOURCE_DETACHED', objectId });

  const nextLocalMatrix = hierarchyLocalMatrix(targetParentWorld, sourceWorld);

  source.parentArray.splice(oldIndex, 1);
  source.object.matrix = nextLocalMatrix;
  if (targetParentId) source.object.parentId = targetParentId;
  else delete source.object.parentId;

  const requested = Number.isInteger(index) ? index : targetArray.length;
  const insertIndex = Math.max(0, Math.min(targetArray.length, requested));
  targetArray.splice(insertIndex, 0, source.object);

  return findPageObject(page, { layerId: targetLayer.id, objectId });
}
