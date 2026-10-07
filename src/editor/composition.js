import { Matrix, deepClone, uid } from '../core/index.js';
import { findPageObject, walkPageObjects } from '../document/hierarchy.js';
import { collapseTransformRoots } from './bounds.js';

const fail = (code, details = {}) => {
  throw Object.assign(new Error(`INK_COMPOSITION_${code}`), { code: `COMPOSITION_${code}`, ...details });
};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;

export function pathSourceIdentity(path) {
  if (path?.type !== 'path') return null;
  const metadata = record(path.metadata) ? path.metadata : {};
  const extraction = record(metadata.extraction) ? metadata.extraction : null;
  if (extraction) {
    const referenceObjectId = text(extraction.referenceObjectId);
    const batchId = text(extraction.batchId);
    const sourceSha256 = text(extraction.source?.sha256) || text(extraction.pixelSha256);
    const key = referenceObjectId || batchId || sourceSha256;
    return key ? { kind: 'extraction', key, referenceObjectId, batchId, sourceSha256 } : { kind: 'extraction', key: null, referenceObjectId: null, batchId: null, sourceSha256: null };
  }
  const source = metadata.source;
  if (typeof source === 'string' && source.trim()) return { kind: 'metadata', key: source.trim() };
  if (record(source)) {
    const key = text(source.id) || text(source.sha256) || text(source.name);
    if (key) return { kind: 'metadata', key };
  }
  const lineage = record(metadata.composition) ? text(metadata.composition.sourceObjectId) : null;
  return lineage ? { kind: 'composition-lineage', key: lineage } : null;
}

export function pathIdentityRecord(path) {
  if (path?.type !== 'path') fail('PATH_REQUIRED');
  return {
    objectId: path.id || null,
    subpathIds: (path.subpaths || []).map(subpath => subpath?.id || null),
    anchorIds: (path.subpaths || []).flatMap(subpath => (subpath?.anchors || []).map(anchor => anchor?.id || null)),
    source: pathSourceIdentity(path)
  };
}

function freshId(factory) {
  const value = factory();
  if (typeof value !== 'string' || !value) fail('INVALID_ID_FACTORY');
  return value;
}

export function regenerateCompositionIds(object, { idFactory = uid, parentId = null, lineageRootId = null, duplicatedFromObjectId = null } = {}) {
  if (!object || typeof object !== 'object') fail('OBJECT_REQUIRED');
  const previousId = object.id || null;
  object.id = freshId(idFactory);
  if (parentId) object.parentId = parentId;
  else delete object.parentId;

  if (object.materialInstance && typeof object.materialInstance === 'object') {
    object.materialInstance.instanceId = object.id;
  }

  if (object.type === 'path') {
    object.metadata = record(object.metadata) ? object.metadata : {};
    const priorComposition = record(object.metadata.composition) ? object.metadata.composition : {};
    object.metadata.composition = {
      ...priorComposition,
      sourceObjectId: text(priorComposition.sourceObjectId) || lineageRootId || previousId || object.id,
      duplicatedFromObjectId: duplicatedFromObjectId || previousId || null
    };
    for (const subpath of object.subpaths || []) {
      if (!subpath || typeof subpath !== 'object') continue;
      subpath.id = freshId(idFactory);
      for (const anchor of subpath.anchors || []) {
        if (anchor && typeof anchor === 'object') anchor.id = freshId(idFactory);
      }
    }
  }

  if (object.type === 'group' || object.type === 'frame') {
    for (const child of object.children || []) {
      const childRoot = child?.type === 'path'
        ? (text(child?.metadata?.composition?.sourceObjectId) || child?.id || null)
        : null;
      regenerateCompositionIds(child, {
        idFactory,
        parentId: object.id,
        lineageRootId: childRoot,
        duplicatedFromObjectId: child?.id || null
      });
    }
  }
  return object;
}

export function cloneCompositionObject(object, { idFactory = uid, parentId = null } = {}) {
  if (!object || typeof object !== 'object') fail('OBJECT_REQUIRED');
  const originalId = object.id || null;
  const copy = deepClone(object);
  return regenerateCompositionIds(copy, {
    idFactory,
    parentId,
    lineageRootId: text(object?.metadata?.composition?.sourceObjectId) || originalId,
    duplicatedFromObjectId: originalId
  });
}

export function resolveCompositionSelection(page, refs = [], { allowEmpty = false } = {}) {
  if (!Array.isArray(refs)) fail('SELECTION_INVALID');
  if (!refs.length) {
    if (allowEmpty) return [];
    fail('SELECTION_EMPTY');
  }
  const found = [];
  for (const ref of refs) {
    const item = findPageObject(page, ref);
    if (!item) fail('STALE_SELECTION', { ref });
    found.push(item);
  }
  const roots = collapseTransformRoots(found);
  for (const item of roots) {
    if (item.effectiveLocked) fail('LOCKED_TARGET', { objectId: item.object.id });
    if (item.effectiveVisible === false) fail('HIDDEN_TARGET', { objectId: item.object.id });
    if (item.interactionExposed === false) fail('UNEXPOSED_TARGET', { objectId: item.object.id });
    if (!Matrix.isInvertible(item.worldMatrix || item.object.matrix || Matrix.identity())) fail('SINGULAR_TARGET', { objectId: item.object.id });
  }
  return roots;
}

export function inspectComposition(page) {
  const pathEntries = walkPageObjects(page).filter(item => item.object?.type === 'path');
  const pathNodeIds = new Set();
  const duplicatePathNodeIds = new Set();
  const missingPathNodeIds = [];
  const sourceKeys = new Set();
  let extractedPaths = 0;
  let expressivePaths = 0;

  for (const entry of pathEntries) {
    const path = entry.object;
    const source = pathSourceIdentity(path);
    if (source?.key) sourceKeys.add(`${source.kind}:${source.key}`);
    if (source?.kind === 'extraction') extractedPaths += 1;
    if (path.expressiveStroke != null) expressivePaths += 1;
    for (const [subpathIndex, subpath] of (path.subpaths || []).entries()) {
      const ids = [
        { id: subpath?.id, kind: 'subpath', subpathIndex },
        ...(subpath?.anchors || []).map((anchor, anchorIndex) => ({ id: anchor?.id, kind: 'anchor', subpathIndex, anchorIndex }))
      ];
      for (const item of ids) {
        if (!text(item.id)) {
          missingPathNodeIds.push({ pathId: path.id || null, ...item, id: null });
          continue;
        }
        if (pathNodeIds.has(item.id)) duplicatePathNodeIds.add(item.id);
        else pathNodeIds.add(item.id);
      }
    }
  }

  return {
    pathCount: pathEntries.length,
    extractedPaths,
    expressivePaths,
    sourceIdentityCount: sourceKeys.size,
    pathNodeIdentityCount: pathNodeIds.size,
    duplicatePathNodeIds: [...duplicatePathNodeIds].sort(),
    missingPathNodeIds,
    valid: duplicatePathNodeIds.size === 0 && missingPathNodeIds.length === 0
  };
}
