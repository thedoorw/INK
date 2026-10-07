import { deepClone, nowISO } from '../core/index.js';
import { documentFingerprint, fnv1a32, inspectDocument, stableStringify } from './integrity.js';
import { inspectInkFileEnvelope, unwrapInkFile, wrapInkFile } from './file-envelope.js';
import { walkPageObjects } from './hierarchy.js';

export const REVISION_RECORD_SCHEMA = 'INK-REVISION-RECORD';
export const REVISION_RECORD_VERSION = 1;
export const REVISION_COMPARISON_SCHEMA = 'INK-REVISION-COMPARISON';
export const REVISION_COMPARISON_VERSION = 1;
export const REVISION_INDEX_SCHEMA = 'INK-REVISION-INDEX';
export const REVISION_INDEX_VERSION = 1;
export const REVISION_INTEGRITY_ALGORITHM = 'fnv1a32-canonical-json';

const MAX_COMPARISON_IDS = 256;
const DEFAULT_INDEX_LIMIT = 200;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validString = value => typeof value === 'string' && value.trim().length > 0;
const validTimestamp = value => validString(value) && Number.isFinite(Date.parse(value));
const nullableString = value => value == null || validString(value);
const fail = (code, details = {}) => { throw Object.assign(new Error(code), { code, ...details }); };
const fingerprintValue = value => `fnv1a32:${fnv1a32(stableStringify(value))}`;

function boundedText(value, fallback, max = 240) {
  const text = String(value == null ? fallback : value).trim();
  if (!text || text.length > max) fail('revision-invalid-metadata');
  return text;
}

function finiteOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function objectStructureFacet(page, found) {
  return {
    id: found.object?.id || null,
    type: found.object?.type || null,
    pageId: page?.id || null,
    layerId: found.layer?.id || null,
    parentId: found.parentObject?.id || null,
    depth: Number.isFinite(found.depth) ? found.depth : 0,
    renderOrder: Number.isFinite(found.renderOrder) ? found.renderOrder : 0
  };
}

function pathGeometryFacet(path) {
  return {
    subpaths: (path?.subpaths || []).map(subpath => ({
      id: subpath?.id || null,
      closed: Boolean(subpath?.closed),
      role: subpath?.role || 'outer',
      anchors: (subpath?.anchors || []).map(anchor => ({
        id: anchor?.id || null,
        x: finiteOrNull(anchor?.x),
        y: finiteOrNull(anchor?.y),
        mode: anchor?.mode || null,
        in: anchor?.in ? { x: finiteOrNull(anchor.in.x), y: finiteOrNull(anchor.in.y) } : null,
        out: anchor?.out ? { x: finiteOrNull(anchor.out.x), y: finiteOrNull(anchor.out.y) } : null
      }))
    }))
  };
}

function objectGeometryFacet(object) {
  const base = {
    id: object?.id || null,
    type: object?.type || null,
    matrix: Array.isArray(object?.matrix) ? [...object.matrix] : null
  };
  if (object?.type === 'path') return { ...base, ...pathGeometryFacet(object) };
  if (object?.type === 'stroke') return {
    ...base,
    points: (object.points || []).map(point => ({
      x: finiteOrNull(point?.x),
      y: finiteOrNull(point?.y),
      p: finiteOrNull(point?.p),
      tiltX: finiteOrNull(point?.tiltX),
      tiltY: finiteOrNull(point?.tiltY),
      mode: point?.mode || null,
      in: point?.in ? { x: finiteOrNull(point.in.x), y: finiteOrNull(point.in.y) } : null,
      out: point?.out ? { x: finiteOrNull(point.out.x), y: finiteOrNull(point.out.y) } : null
    }))
  };
  if (object?.type === 'frame') return { ...base, width: finiteOrNull(object.width), height: finiteOrNull(object.height) };
  if (object?.type === 'image' || object?.type === 'reference') {
    return {
      ...base,
      width: finiteOrNull(object.width ?? object.w),
      height: finiteOrNull(object.height ?? object.h)
    };
  }
  if (object?.type === 'text') return { ...base, text: String(object.text || '') };
  return base;
}

function objectAppearanceFacet(object) {
  return {
    id: object?.id || null,
    type: object?.type || null,
    visible: object?.visible !== false,
    locked: Boolean(object?.locked),
    opacity: finiteOrNull(object?.opacity) ?? 1,
    fill: object?.fill ?? null,
    stroke: object?.stroke ?? null,
    strokeWidth: finiteOrNull(object?.strokeWidth),
    color: object?.color ?? null,
    expressiveStroke: object?.expressiveStroke == null ? null : deepClone(object.expressiveStroke),
    materialAppearance: object?.materialAppearance == null ? null : deepClone(object.materialAppearance)
  };
}

function documentRevisionState(document) {
  if (document == null) {
    return {
      documentFingerprint: null,
      objectStates: new Map(),
      objectCount: 0,
      structureFingerprint: null,
      geometryFingerprint: null,
      appearanceFingerprint: null
    };
  }
  const inspection = inspectDocument(document);
  if (!inspection.passed) fail('revision-document-invalid', { inspection });

  const structure = [];
  const geometry = [];
  const appearance = [];
  const objectStates = new Map();

  for (const [pageIndex, page] of (document.pages || []).entries()) {
    structure.push({
      kind: 'page',
      index: pageIndex,
      id: page.id || null,
      activeLayerId: page.activeLayerId || null
    });
    for (const [layerIndex, layer] of (page.layers || []).entries()) {
      structure.push({
        kind: 'layer',
        pageId: page.id || null,
        index: layerIndex,
        id: layer.id || null,
        visible: layer.visible !== false,
        locked: Boolean(layer.locked),
        opacity: finiteOrNull(layer.opacity) ?? 1
      });
    }
    for (const found of walkPageObjects(page)) {
      const object = found.object;
      if (!validString(object?.id)) continue;
      const structureFacet = objectStructureFacet(page, found);
      const geometryFacet = objectGeometryFacet(object);
      const appearanceFacet = objectAppearanceFacet(object);
      const state = {
        full: fingerprintValue(object),
        structure: fingerprintValue(structureFacet),
        geometry: fingerprintValue(geometryFacet),
        appearance: fingerprintValue(appearanceFacet)
      };
      objectStates.set(object.id, state);
      structure.push(structureFacet);
      geometry.push(geometryFacet);
      appearance.push(appearanceFacet);
    }
  }

  return {
    documentFingerprint: inspection.fingerprint || documentFingerprint(document),
    objectStates,
    objectCount: objectStates.size,
    structureFingerprint: fingerprintValue(structure),
    geometryFingerprint: fingerprintValue(geometry),
    appearanceFingerprint: fingerprintValue(appearance)
  };
}

function boundedIdList(ids) {
  const full = [...new Set(ids)].sort((a, b) => String(a).localeCompare(String(b)));
  return {
    ids: full.slice(0, MAX_COMPARISON_IDS),
    count: full.length,
    truncated: full.length > MAX_COMPARISON_IDS
  };
}

export function compareRevisionDocuments(beforeDocument, afterDocument) {
  const before = documentRevisionState(beforeDocument);
  const after = documentRevisionState(afterDocument);
  const beforeIds = new Set(before.objectStates.keys());
  const afterIds = new Set(after.objectStates.keys());
  const added = [];
  const removed = [];
  const changed = [];

  for (const id of afterIds) {
    if (!beforeIds.has(id)) added.push(id);
    else if (before.objectStates.get(id)?.full !== after.objectStates.get(id)?.full) changed.push(id);
  }
  for (const id of beforeIds) if (!afterIds.has(id)) removed.push(id);

  const touched = boundedIdList([...added, ...removed, ...changed]);
  const addedList = boundedIdList(added);
  const removedList = boundedIdList(removed);
  const changedList = boundedIdList(changed);
  const equivalent = before.documentFingerprint !== null
    && before.documentFingerprint === after.documentFingerprint;

  return {
    schema: REVISION_COMPARISON_SCHEMA,
    version: REVISION_COMPARISON_VERSION,
    beforeDocumentFingerprint: before.documentFingerprint,
    afterDocumentFingerprint: after.documentFingerprint,
    equivalent,
    objectCounts: {
      before: before.objectCount,
      after: after.objectCount,
      added: addedList.count,
      removed: removedList.count,
      changed: changedList.count,
      touched: touched.count
    },
    addedObjectIds: addedList.ids,
    removedObjectIds: removedList.ids,
    changedObjectIds: changedList.ids,
    touchedObjectIds: touched.ids,
    truncated: {
      added: addedList.truncated,
      removed: removedList.truncated,
      changed: changedList.truncated,
      touched: touched.truncated
    },
    fingerprints: {
      structure: { before: before.structureFingerprint, after: after.structureFingerprint },
      geometry: { before: before.geometryFingerprint, after: after.geometryFingerprint },
      appearance: { before: before.appearanceFingerprint, after: after.appearanceFingerprint }
    }
  };
}

export function inspectRevisionComparison(comparison) {
  const errors = [];
  const add = code => errors.push({ code });
  if (!record(comparison)) return { valid: false, errors: [{ code: 'revision-comparison-invalid' }] };
  if (comparison.schema !== REVISION_COMPARISON_SCHEMA || comparison.version !== REVISION_COMPARISON_VERSION) add('revision-comparison-unsupported-schema');
  if (!nullableString(comparison.beforeDocumentFingerprint) || !validString(comparison.afterDocumentFingerprint)) add('revision-comparison-invalid-document-fingerprint');
  if (typeof comparison.equivalent !== 'boolean') add('revision-comparison-invalid-equivalent');
  const counts = comparison.objectCounts;
  for (const key of ['before', 'after', 'added', 'removed', 'changed', 'touched']) {
    if (!Number.isSafeInteger(counts?.[key]) || counts[key] < 0) add('revision-comparison-invalid-counts');
  }
  for (const key of ['addedObjectIds', 'removedObjectIds', 'changedObjectIds', 'touchedObjectIds']) {
    if (!Array.isArray(comparison[key])
        || comparison[key].length > MAX_COMPARISON_IDS
        || comparison[key].some(id => !validString(id))) add('revision-comparison-invalid-ids');
  }
  for (const facet of ['structure', 'geometry', 'appearance']) {
    if (!nullableString(comparison.fingerprints?.[facet]?.before)
        || !validString(comparison.fingerprints?.[facet]?.after)) add('revision-comparison-invalid-fingerprints');
  }
  return { valid: errors.length === 0, errors };
}

export function revisionRecordFingerprint(revision) {
  if (!record(revision)) fail('revision-invalid-record');
  const { integrity, ...payload } = revision;
  return fingerprintValue(payload);
}

export function deriveRevisionId({
  documentId,
  parentRevisionId = null,
  sequence = 1,
  documentFingerprint: fingerprint
} = {}) {
  if (!validString(documentId) || !nullableString(parentRevisionId)) fail('revision-invalid-identity');
  if (!Number.isSafeInteger(sequence) || sequence < 1 || !validString(fingerprint)) fail('revision-invalid-identity');
  const documentKey = fnv1a32(documentId);
  const relationKey = fnv1a32(stableStringify({
    documentId,
    parentRevisionId: parentRevisionId || null,
    sequence,
    documentFingerprint: fingerprint
  }));
  return `ink-rev:${documentKey}:r${sequence}:${relationKey}:${fingerprint.split(':').at(-1)}`;
}

export function inspectRevisionRecord(revision) {
  const errors = [];
  const add = (code, details = {}) => errors.push({ code, ...details });
  if (!record(revision)) return { valid: false, errors: [{ code: 'revision-invalid-record' }] };
  if (revision.schema !== REVISION_RECORD_SCHEMA || revision.version !== REVISION_RECORD_VERSION) add('revision-unsupported-schema');
  if (!validString(revision.revisionId) || !validString(revision.documentId)) add('revision-invalid-identity');
  if (!Number.isSafeInteger(revision.sequence) || revision.sequence < 1) add('revision-invalid-sequence');
  if (!nullableString(revision.parentRevisionId) || !nullableString(revision.baseRevisionId)) add('revision-invalid-relation');
  if (!validTimestamp(revision.createdAt)) add('revision-invalid-created-at');
  if (!validString(revision.reason) || !validString(revision.label)) add('revision-invalid-metadata');
  if (!validString(revision.documentFingerprint)) add('revision-invalid-document-fingerprint');

  const comparisonInspection = revision.comparison == null
    ? { valid: true, errors: [] }
    : inspectRevisionComparison(revision.comparison);
  if (!comparisonInspection.valid) add('revision-invalid-comparison', { inspection: comparisonInspection });

  const envelopeInspection = inspectInkFileEnvelope(revision.envelope);
  if (!envelopeInspection.valid) add('revision-envelope-invalid', { inspection: envelopeInspection });
  const document = revision.envelope?.document;
  const documentInspection = document ? inspectDocument(document) : { passed: false, errors: [{ code: 'missing-document' }] };
  if (!documentInspection.passed) add('revision-document-invalid', { inspection: documentInspection });
  if (document?.id !== revision.documentId) add('revision-document-id-mismatch');
  if (revision.envelope?.revision !== revision.sequence) add('revision-sequence-mismatch');
  if (revision.envelope?.revisionId !== revision.revisionId) add('revision-envelope-id-mismatch');
  const actualDocumentFingerprint = document ? documentFingerprint(document) : null;
  if (actualDocumentFingerprint !== revision.documentFingerprint) add('revision-document-fingerprint-mismatch', { actualDocumentFingerprint });
  if (revision.comparison && revision.comparison.afterDocumentFingerprint !== actualDocumentFingerprint) {
    add('revision-comparison-document-mismatch');
  }

  let actualRecordFingerprint = null;
  try { actualRecordFingerprint = revisionRecordFingerprint(revision); }
  catch (error) { add('revision-record-not-serializable', { cause: String(error) }); }
  if (revision.integrity?.algorithm !== REVISION_INTEGRITY_ALGORITHM
      || revision.integrity?.fingerprint !== actualRecordFingerprint) {
    add('revision-record-fingerprint-mismatch', { actualRecordFingerprint });
  }

  return {
    valid: errors.length === 0,
    errors,
    actualDocumentFingerprint,
    actualRecordFingerprint,
    documentInspection,
    envelopeInspection,
    comparisonInspection
  };
}

export function createRevisionRecord(document, {
  parentRecord = null,
  baseRevisionId = null,
  createdAt = nowISO(),
  reason = 'manual',
  label = 'Revision',
  revisionId = null,
  comparison = undefined
} = {}) {
  const documentInspection = inspectDocument(document);
  if (!documentInspection.passed) fail('revision-document-invalid', { inspection: documentInspection });
  if (!validTimestamp(createdAt)) fail('revision-invalid-created-at');

  let parent = null;
  if (parentRecord != null) {
    const parentInspection = inspectRevisionRecord(parentRecord);
    if (!parentInspection.valid) fail('revision-parent-invalid', { inspection: parentInspection });
    parent = parentRecord;
    if (parent.documentId !== document.id) fail('revision-parent-document-mismatch');
  }

  const parentRevisionId = parent?.revisionId || null;
  const sequence = parent ? parent.sequence + 1 : 1;
  const fingerprint = documentInspection.fingerprint || documentFingerprint(document);
  const resolvedBase = baseRevisionId == null
    ? (parent?.baseRevisionId || parent?.revisionId || null)
    : baseRevisionId;
  if (!nullableString(resolvedBase)) fail('revision-invalid-base-revision');

  const resolvedComparison = comparison === undefined
    ? compareRevisionDocuments(parent?.envelope?.document || null, document)
    : deepClone(comparison);
  const comparisonInspection = inspectRevisionComparison(resolvedComparison);
  if (!comparisonInspection.valid) fail('revision-invalid-comparison', { inspection: comparisonInspection });
  if (resolvedComparison.afterDocumentFingerprint !== fingerprint) fail('revision-comparison-document-mismatch');

  const resolvedRevisionId = revisionId || deriveRevisionId({
    documentId: document.id,
    parentRevisionId,
    sequence,
    documentFingerprint: fingerprint
  });
  if (!validString(resolvedRevisionId)) fail('revision-invalid-identity');

  const snapshotEnvelope = wrapInkFile(document, {
    fileId: document.id,
    revision: sequence,
    revisionId: resolvedRevisionId,
    savedAt: createdAt
  });

  const revision = {
    schema: REVISION_RECORD_SCHEMA,
    version: REVISION_RECORD_VERSION,
    revisionId: resolvedRevisionId,
    documentId: document.id,
    sequence,
    parentRevisionId,
    baseRevisionId: resolvedBase,
    createdAt,
    reason: boundedText(reason, 'manual', 120),
    label: boundedText(label, 'Revision', 240),
    documentFingerprint: fingerprint,
    envelope: snapshotEnvelope,
    comparison: resolvedComparison
  };
  revision.integrity = {
    algorithm: REVISION_INTEGRITY_ALGORITHM,
    fingerprint: revisionRecordFingerprint(revision)
  };
  return revision;
}

export function cloneRevisionRecord(revision) {
  const inspection = inspectRevisionRecord(revision);
  if (!inspection.valid) fail('revision-invalid-record', { inspection });
  return deepClone(revision);
}

export function restoreRevisionDocument(revision) {
  const inspection = inspectRevisionRecord(revision);
  if (!inspection.valid) fail('revision-restore-validation-failed', { inspection });
  const document = unwrapInkFile(revision.envelope);
  const documentInspection = inspectDocument(document);
  if (!documentInspection.passed) fail('revision-restore-document-invalid', { inspection: documentInspection });
  const fingerprint = documentInspection.fingerprint || documentFingerprint(document);
  if (fingerprint !== revision.documentFingerprint) {
    fail('revision-restore-fingerprint-mismatch', {
      expected: revision.documentFingerprint,
      actual: fingerprint
    });
  }
  return deepClone(document);
}

function snapshotHistoryState(history) {
  if (!history) return null;
  return {
    undoStack: deepClone(Array.isArray(history.undoStack) ? history.undoStack : []),
    redoStack: deepClone(Array.isArray(history.redoStack) ? history.redoStack : []),
    pending: history.pending == null ? null : deepClone(history.pending)
  };
}

function restoreHistoryState(history, snapshot) {
  if (!history || !snapshot) return;
  history.undoStack = deepClone(snapshot.undoStack);
  history.redoStack = deepClone(snapshot.redoStack);
  history.pending = snapshot.pending == null ? null : deepClone(snapshot.pending);
  history.app?.updateHistoryUI?.();
}

function revisionSummary(revision) {
  return {
    revisionId: revision.revisionId,
    sequence: revision.sequence,
    parentRevisionId: revision.parentRevisionId,
    baseRevisionId: revision.baseRevisionId,
    createdAt: revision.createdAt,
    reason: revision.reason,
    label: revision.label,
    documentFingerprint: revision.documentFingerprint
  };
}

function inspectRevisionIndex(index, documentId) {
  if (!record(index)
      || index.schema !== REVISION_INDEX_SCHEMA
      || index.version !== REVISION_INDEX_VERSION
      || index.documentId !== documentId
      || !nullableString(index.headRevisionId)
      || !Array.isArray(index.items)) return false;
  return index.items.every(item =>
    record(item)
    && validString(item.revisionId)
    && Number.isSafeInteger(item.sequence)
    && item.sequence > 0
    && validTimestamp(item.createdAt)
    && validString(item.documentFingerprint));
}

export class RevisionController {
  constructor(app, {
    store = app?.store || null,
    indexLimit = DEFAULT_INDEX_LIMIT
  } = {}) {
    this.app = app;
    this.store = store;
    this.indexLimit = Math.max(1, Math.min(2000, Math.trunc(indexLimit) || DEFAULT_INDEX_LIMIT));
    this.records = new Map();
    this.indexes = new Map();
    this.currentDocumentId = null;
    this.currentRevisionId = null;
  }

  recordKey(documentId, revisionId) {
    return `revision:${documentId}:${revisionId}`;
  }

  indexKey(documentId) {
    return `revision-index:${documentId}`;
  }

  revisionIdFor(documentId = this.app?.doc?.id) {
    return documentId && documentId === this.currentDocumentId ? this.currentRevisionId : null;
  }

  cacheKey(documentId, revisionId) {
    return `${documentId}\u0000${revisionId}`;
  }

  async loadIndex(documentId) {
    if (!validString(documentId)) fail('revision-invalid-document-id');
    const cached = this.indexes.get(documentId);
    if (cached && inspectRevisionIndex(cached, documentId)) return deepClone(cached);

    if (this.store?.loadWithRecovery) {
      const result = await this.store.loadWithRecovery(
        this.indexKey(documentId),
        value => inspectRevisionIndex(value, documentId)
      );
      if (result.value) {
        this.indexes.set(documentId, deepClone(result.value));
        return deepClone(result.value);
      }
    }

    const empty = {
      schema: REVISION_INDEX_SCHEMA,
      version: REVISION_INDEX_VERSION,
      documentId,
      headRevisionId: null,
      items: []
    };
    this.indexes.set(documentId, empty);
    return deepClone(empty);
  }

  async saveIndex(index) {
    if (!inspectRevisionIndex(index, index?.documentId)) fail('revision-index-invalid');
    this.indexes.set(index.documentId, deepClone(index));
    if (this.store?.save) {
      const saved = await this.store.save(this.indexKey(index.documentId), index);
      if (saved !== true) fail('revision-index-persist-failed');
    }
    return deepClone(index);
  }

  async loadRecord(revisionId, { documentId = this.app?.doc?.id || this.currentDocumentId } = {}) {
    if (!validString(documentId) || !validString(revisionId)) fail('revision-invalid-identity');
    const key = this.cacheKey(documentId, revisionId);
    const cached = this.records.get(key);
    if (cached) return cloneRevisionRecord(cached);

    if (this.store?.loadWithRecovery) {
      const result = await this.store.loadWithRecovery(
        this.recordKey(documentId, revisionId),
        value => inspectRevisionRecord(value).valid
          && value.documentId === documentId
          && value.revisionId === revisionId
      );
      if (result.value) {
        this.records.set(key, deepClone(result.value));
        return cloneRevisionRecord(result.value);
      }
    }
    return null;
  }

  async persistRecord(revision) {
    const inspection = inspectRevisionRecord(revision);
    if (!inspection.valid) fail('revision-invalid-record', { inspection });
    const key = this.cacheKey(revision.documentId, revision.revisionId);

    if (this.store?.save) {
      const saved = await this.store.save(this.recordKey(revision.documentId, revision.revisionId), revision);
      if (saved !== true) fail('revision-persist-failed');
    }
    this.records.set(key, deepClone(revision));

    const index = await this.loadIndex(revision.documentId);
    const items = index.items.filter(item => item.revisionId !== revision.revisionId);
    items.push(revisionSummary(revision));
    items.sort((a, b) => a.sequence - b.sequence || a.revisionId.localeCompare(b.revisionId));
    index.items = items.slice(-this.indexLimit);
    index.headRevisionId = revision.revisionId;
    await this.saveIndex(index);
    return cloneRevisionRecord(revision);
  }

  async capture({
    parentRevisionId = undefined,
    baseRevisionId = null,
    createdAt = nowISO(),
    reason = 'manual',
    label = 'Revision'
  } = {}) {
    const document = this.app?.doc;
    if (!document) fail('revision-document-unavailable');
    if (this.app?.history?.pending) fail('revision-history-busy');
    const documentInspection = inspectDocument(document);
    if (!documentInspection.passed) fail('revision-document-invalid', { inspection: documentInspection });

    const documentId = document.id;
    const resolvedParentId = parentRevisionId === undefined
      ? this.revisionIdFor(documentId)
      : parentRevisionId;
    if (!nullableString(resolvedParentId)) fail('revision-invalid-parent-id');

    let parent = null;
    if (resolvedParentId) {
      parent = await this.loadRecord(resolvedParentId, { documentId });
      if (!parent) fail('revision-parent-not-found', { revisionId: resolvedParentId });
    }

    const comparison = compareRevisionDocuments(parent?.envelope?.document || null, document);
    if (parent && comparison.equivalent) {
      this.currentDocumentId = documentId;
      this.currentRevisionId = parent.revisionId;
      return {
        created: false,
        equivalent: true,
        persisted: Boolean(this.store?.save),
        record: cloneRevisionRecord(parent),
        comparison: deepClone(comparison)
      };
    }

    const revision = createRevisionRecord(document, {
      parentRecord: parent,
      baseRevisionId,
      createdAt,
      reason,
      label,
      comparison
    });
    await this.persistRecord(revision);
    this.currentDocumentId = documentId;
    this.currentRevisionId = revision.revisionId;
    return {
      created: true,
      equivalent: false,
      persisted: Boolean(this.store?.save),
      record: cloneRevisionRecord(revision),
      comparison: deepClone(comparison)
    };
  }

  async restore(revisionOrId, { documentId = this.app?.doc?.id || this.currentDocumentId } = {}) {
    if (this.app?.history?.pending) fail('revision-history-busy');

    const revision = typeof revisionOrId === 'string'
      ? await this.loadRecord(revisionOrId, { documentId })
      : cloneRevisionRecord(revisionOrId);
    if (!revision) fail('revision-not-found', { revisionId: String(revisionOrId || '') });

    const candidate = restoreRevisionDocument(revision);
    if (documentId && revision.documentId !== documentId) {
      fail('revision-document-mismatch', { expected: documentId, actual: revision.documentId });
    }

    const app = this.app;
    if (!app) fail('revision-app-unavailable');
    const before = {
      document: deepClone(app.doc),
      selection: deepClone(Array.isArray(app.selection) ? app.selection : []),
      draft: app.draft == null ? null : deepClone(app.draft),
      strokeEdit: app.strokeEdit == null ? null : deepClone(app.strokeEdit),
      dirty: Boolean(app.dirty),
      history: snapshotHistoryState(app.history),
      currentDocumentId: this.currentDocumentId,
      currentRevisionId: this.currentRevisionId
    };

    try {
      if (typeof app.replaceDocument === 'function') {
        app.replaceDocument(candidate, { skipSanitize: true });
      } else {
        app.doc = candidate;
      }
      app.history?.clear?.();
      app.dirty = false;

      const appliedInspection = inspectDocument(app.doc);
      const appliedFingerprint = appliedInspection.passed
        ? (appliedInspection.fingerprint || documentFingerprint(app.doc))
        : null;
      if (!appliedInspection.passed || appliedFingerprint !== revision.documentFingerprint) {
        fail('revision-restore-postcondition-failed', {
          inspection: appliedInspection,
          expected: revision.documentFingerprint,
          actual: appliedFingerprint
        });
      }

      this.currentDocumentId = revision.documentId;
      this.currentRevisionId = revision.revisionId;
      return {
        restored: true,
        revisionId: revision.revisionId,
        documentId: revision.documentId,
        documentFingerprint: revision.documentFingerprint,
        historyBoundary: 'RESET_TO_REVISION',
        structuredDocument: true
      };
    } catch (error) {
      try {
        if (typeof app.replaceDocument === 'function') {
          app.replaceDocument(deepClone(before.document), { fromHistory: true, skipSanitize: true });
        } else {
          app.doc = deepClone(before.document);
        }
      } catch (_) {
        app.doc = deepClone(before.document);
      }

      app.selection = deepClone(before.selection);
      app.draft = before.draft == null ? null : deepClone(before.draft);
      app.strokeEdit = before.strokeEdit == null ? null : deepClone(before.strokeEdit);
      app.dirty = before.dirty;
      restoreHistoryState(app.history, before.history);
      this.currentDocumentId = before.currentDocumentId;
      this.currentRevisionId = before.currentRevisionId;
      app.refreshAll?.();
      app.renderer?.render?.();

      fail('revision-restore-failed', {
        cause: error?.code || String(error),
        revisionId: revision.revisionId
      });
    }
  }

  async reopen(revisionId, options = {}) {
    return this.restore(revisionId, options);
  }

  async list(documentId = this.app?.doc?.id) {
    const index = await this.loadIndex(documentId);
    return deepClone(index.items);
  }

  diagnostics() {
    return {
      documentId: this.currentDocumentId,
      revisionId: this.currentRevisionId,
      cachedRecords: this.records.size,
      cachedIndexes: this.indexes.size,
      indexLimit: this.indexLimit,
      persistence: this.store?.save ? 'browser-local-store' : 'memory'
    };
  }
}

export function installRevision(app, options = {}) {
  const controller = new RevisionController(app, options);
  app.revisions = controller;
  return controller;
}
