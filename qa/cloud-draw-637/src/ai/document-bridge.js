export const AI_DOCUMENT_BRIDGE_SCHEMA = 'INK-AI-DOCUMENT-BRIDGE';
export const AI_DOCUMENT_BRIDGE_VERSION = 1;
export const AI_DOCUMENT_BRIDGE_FINGERPRINT_ALGORITHM = 'fnv1a32-canonical-json';

const DEFAULT_LIMITS = Object.freeze({ maxObjects: 96, maxRelationships: 192, maxBytes: 96 * 1024 });
const HARD_LIMITS = Object.freeze({ maxObjects: 512, maxRelationships: 1024, maxBytes: 512 * 1024 });
const MAX_TEXT = 160;
const MAX_LIST = 32;
const RELATION_KEYS = Object.freeze(['attachedTo', 'surrounds', 'overlaps', 'occludes', 'behind']);

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;

export class AIDocumentBridgeError extends Error {
  constructor(code, details = {}) {
    super(`INK_AI_DOCUMENT_BRIDGE_${code}`);
    this.name = 'AIDocumentBridgeError';
    this.code = `AI_DOCUMENT_BRIDGE_${code}`;
    Object.assign(this, details);
  }
}

function fail(code, details = {}) {
  throw new AIDocumentBridgeError(code, details);
}

function boundedText(value, field, { required = false, max = MAX_TEXT } = {}) {
  if (value == null || value === '') {
    if (required) fail('FIELD_REQUIRED', { field });
    return null;
  }
  if (typeof value !== 'string') fail('FIELD_INVALID', { field });
  const text = value.trim();
  if ((required && !text) || text.length > max) fail('FIELD_INVALID', { field });
  return text || null;
}

function boundedList(values, field, { max = MAX_LIST } = {}) {
  if (values == null) return [];
  if (!Array.isArray(values)) fail('FIELD_INVALID', { field });
  const normalized = values.map((value, index) => boundedText(value, `${field}[${index}]`, { required: true }));
  return [...new Set(normalized)].sort((a, b) => a.localeCompare(b)).slice(0, max);
}

function normalizeLimit(value, fallback, hardMax, field) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > hardMax) fail('LIMIT_INVALID', { field, value });
  return number;
}

function normalizeLimits(raw = {}) {
  if (!record(raw)) fail('LIMITS_INVALID');
  return {
    maxObjects: normalizeLimit(raw.maxObjects, DEFAULT_LIMITS.maxObjects, HARD_LIMITS.maxObjects, 'maxObjects'),
    maxRelationships: normalizeLimit(raw.maxRelationships, DEFAULT_LIMITS.maxRelationships, HARD_LIMITS.maxRelationships, 'maxRelationships'),
    maxBytes: normalizeLimit(raw.maxBytes, DEFAULT_LIMITS.maxBytes, HARD_LIMITS.maxBytes, 'maxBytes')
  };
}

function canonicalize(value, seen = new WeakSet()) {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') fail('NON_JSON_VALUE');
  if (Array.isArray(value)) return value.map(item => canonicalize(item, seen));
  if (!record(value)) fail('NON_JSON_VALUE');
  if (seen.has(value)) fail('CYCLIC_INPUT');
  seen.add(value);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key], seen);
  seen.delete(value);
  return out;
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function fingerprint(value) {
  return `fnv1a32:${fnv1a32(stableStringify(value))}`;
}

function utf8Bytes(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).byteLength;
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function activePage(document) {
  return document.pages.find(page => page.id === document.activePageId) || null;
}

function validateDocument(document) {
  if (!record(document)) fail('DOCUMENT_INVALID');
  if (document.format !== 'INK') fail('DOCUMENT_FORMAT_UNSUPPORTED', { actual: document.format ?? null });
  if (Number(document.formatVersion) !== 4) fail('FORMAT_VERSION_UNSUPPORTED', { actual: document.formatVersion ?? null, expected: 4 });
  boundedText(document.id, 'document.id', { required: true });
  if (!Array.isArray(document.pages) || !document.pages.length) fail('DOCUMENT_PAGES_INVALID');
  const pageIds = new Set();
  for (const [pageIndex, page] of document.pages.entries()) {
    if (!record(page)) fail('PAGE_INVALID', { pageIndex });
    const pageId = boundedText(page.id, `pages[${pageIndex}].id`, { required: true });
    if (pageIds.has(pageId)) fail('DUPLICATE_PAGE_ID', { pageId });
    pageIds.add(pageId);
    if (!Array.isArray(page.layers) || !page.layers.length) fail('PAGE_LAYERS_INVALID', { pageId });
    const layerIds = new Set();
    for (const [layerIndex, layer] of page.layers.entries()) {
      if (!record(layer)) fail('LAYER_INVALID', { pageId, layerIndex });
      const layerId = boundedText(layer.id, `pages[${pageIndex}].layers[${layerIndex}].id`, { required: true });
      if (layerIds.has(layerId)) fail('DUPLICATE_LAYER_ID', { layerId });
      layerIds.add(layerId);
      if (!Array.isArray(layer.objects)) fail('LAYER_OBJECTS_INVALID', { layerId });
    }
    if (!layerIds.has(page.activeLayerId)) fail('ACTIVE_LAYER_MISSING', { pageId, activeLayerId: page.activeLayerId ?? null });
  }
  if (!pageIds.has(document.activePageId)) fail('ACTIVE_PAGE_MISSING', { activePageId: document.activePageId ?? null });
  return activePage(document);
}

function collectPageObjects(page) {
  const entries = [];
  const objectIds = new Set();
  const visited = new WeakSet();
  const active = new WeakSet();
  let renderOrder = 0;

  const walk = (objects, layer, parent = null, ancestors = [], inherited = { visible: true, locked: false, opacity: 1 }) => {
    for (const object of objects) {
      if (!record(object)) fail('OBJECT_INVALID', { layerId: layer.id });
      if (active.has(object)) fail('HIERARCHY_CYCLE', { objectId: object.id ?? null });
      if (visited.has(object)) fail('DUPLICATE_OWNERSHIP', { objectId: object.id ?? null });
      visited.add(object);
      active.add(object);

      const objectId = boundedText(object.id, 'object.id', { required: true });
      const type = boundedText(object.type, `object.${objectId}.type`, { required: true, max: 80 });
      if (objectIds.has(objectId)) fail('DUPLICATE_OBJECT_ID', { objectId });
      objectIds.add(objectId);
      if (object.matrix !== undefined && (!Array.isArray(object.matrix) || object.matrix.length !== 6 || object.matrix.some(value => !Number.isFinite(Number(value))))) {
        fail('OBJECT_MATRIX_INVALID', { objectId });
      }
      if (parent && object.parentId != null && object.parentId !== parent.id) fail('PARENT_ID_MISMATCH', { objectId, expected: parent.id, actual: object.parentId });
      if (!parent && object.parentId != null) fail('TOP_LEVEL_PARENT_ID_INVALID', { objectId, actual: object.parentId });

      const opacity = finite(object.opacity) ?? 1;
      const effectiveVisible = inherited.visible && object.visible !== false;
      const effectiveLocked = inherited.locked || Boolean(object.locked);
      const effectiveOpacity = Math.max(0, Math.min(1, inherited.opacity * Math.max(0, Math.min(1, opacity))));
      const groupAncestors = ancestors.filter(item => item.type === 'group');
      entries.push({
        object,
        layer,
        parent,
        depth: ancestors.length,
        ancestorIds: ancestors.map(item => item.id),
        renderOrder: renderOrder++,
        effectiveVisible,
        effectiveLocked,
        effectiveOpacity,
        interactionExposed: groupAncestors.length === 0
      });

      if (type === 'group' || type === 'frame') {
        if (!Array.isArray(object.children)) fail('STRUCTURAL_CHILDREN_INVALID', { objectId });
        walk(object.children, layer, object, [...ancestors, { id: objectId, type }], {
          visible: effectiveVisible,
          locked: effectiveLocked,
          opacity: effectiveOpacity
        });
      }
      active.delete(object);
    }
  };

  for (const layer of page.layers) walk(layer.objects, layer, null, [], {
    visible: layer.visible !== false,
    locked: Boolean(layer.locked),
    opacity: Math.max(0, Math.min(1, finite(layer.opacity) ?? 1))
  });
  return entries;
}

function geometrySummary(object) {
  const kind = object.type || 'unknown';
  const reference = { objectId: object.id, kind };
  if (kind === 'path') {
    const subpaths = Array.isArray(object.subpaths) ? object.subpaths : [];
    const summary = {
      kind,
      reference,
      subpathCount: subpaths.length,
      anchorCount: subpaths.reduce((sum, subpath) => sum + (Array.isArray(subpath?.anchors) ? subpath.anchors.length : 0), 0),
      closedSubpathCount: subpaths.filter(subpath => subpath?.closed).length
    };
    return { ...summary, fingerprint: fingerprint(summary) };
  }
  if (kind === 'stroke') return { kind, reference, pointCount: Array.isArray(object.points) ? object.points.length : 0 };
  if (kind === 'frame') return { kind, reference, width: finite(object.width), height: finite(object.height), childCount: object.children?.length || 0 };
  if (kind === 'group') return { kind, reference, childCount: object.children?.length || 0 };
  if (kind === 'repeat') return { kind, reference, instanceCount: Array.isArray(object.instances) ? object.instances.length : 0 };
  if (kind === 'image' || kind === 'reference') return { kind, reference, width: finite(object.width ?? object.w), height: finite(object.height ?? object.h) };
  if (kind === 'text') return { kind, reference, characterCount: String(object.text || '').length };
  return { kind, reference };
}

function semanticSummary(object) {
  const semantic = record(object.semantic) ? object.semantic : {};
  const metadata = record(object.metadata) ? object.metadata : {};
  const role = boundedText(semantic.role ?? metadata.semanticLabel ?? metadata.role, `object.${object.id}.semantic.role`, { required: false, max: 120 });
  const editableParameters = record(semantic.editableParameters) ? semantic.editableParameters : {};
  return {
    role,
    protectedProperties: boundedList(semantic.protectedProperties ?? metadata.protectedProperties ?? [], `object.${object.id}.semantic.protectedProperties`),
    editableParameterKeys: Object.keys(editableParameters).sort().slice(0, MAX_LIST),
    dependencyIds: boundedList(semantic.dependencyIds ?? [], `object.${object.id}.semantic.dependencyIds`),
    constraintIds: boundedList(semantic.constraintIds ?? [], `object.${object.id}.semantic.constraintIds`)
  };
}

function objectSummary(page, entry) {
  const { object, layer, parent } = entry;
  const semantic = semanticSummary(object);
  const objectProtected = Boolean(object.metadata?.protected);
  return {
    ref: { pageId: page.id, layerId: layer.id, objectId: object.id },
    type: object.type,
    name: boundedText(object.name, `object.${object.id}.name`, { required: false }),
    parentId: parent?.id || null,
    depth: entry.depth,
    renderOrder: entry.renderOrder,
    structure: {
      ancestorIds: entry.ancestorIds.slice(0, MAX_LIST),
      effectiveVisible: entry.effectiveVisible,
      effectiveLocked: entry.effectiveLocked,
      effectiveOpacity: entry.effectiveOpacity,
      interactionExposed: entry.interactionExposed
    },
    geometry: geometrySummary(object),
    semantic,
    editability: {
      editable: !entry.effectiveLocked && entry.interactionExposed && !objectProtected,
      objectProtected,
      protectedProperties: semantic.protectedProperties
    }
  };
}

function normalizeSelection(document, explicit) {
  const raw = explicit ?? document.ai?.selection ?? [];
  if (!Array.isArray(raw)) fail('SELECTION_INVALID');
  const ids = raw.map((item, index) => {
    if (typeof item === 'string') return boundedText(item, `selection[${index}]`, { required: true });
    if (record(item)) return boundedText(item.objectId ?? item.id, `selection[${index}].objectId`, { required: true });
    fail('SELECTION_INVALID', { index });
  });
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

function normalizeFocus(raw) {
  if (raw == null) return null;
  if (!Array.isArray(raw) || !raw.length) fail('FOCUS_INVALID');
  return [...new Set(raw.map((value, index) => boundedText(value, `objectIds[${index}]`, { required: true })))]
    .sort((a, b) => a.localeCompare(b));
}

function normalizedRelationshipEdge(edge, index) {
  if (!record(edge)) fail('RELATIONSHIP_EDGE_INVALID', { index });
  return {
    from: boundedText(edge.from, `relationshipGraph.edges[${index}].from`, { required: true }),
    type: boundedText(edge.type, `relationshipGraph.edges[${index}].type`, { required: true, max: 80 }),
    to: boundedText(edge.to, `relationshipGraph.edges[${index}].to`, { required: true })
  };
}

function semanticEdgesFromObjects(entries) {
  const edges = [];
  for (const { object } of entries) {
    if (!record(object.semantic)) continue;
    const semantic = object.semantic;
    if (semantic.parent) edges.push({ from: boundedText(semantic.parent, `object.${object.id}.semantic.parent`, { required: true }), type: 'parent-of', to: object.id });
    if (semantic.group) edges.push({ from: boundedText(semantic.group, `object.${object.id}.semantic.group`, { required: true }), type: 'groups', to: object.id });
    for (const relation of RELATION_KEYS) {
      for (const target of boundedList(semantic[relation] ?? [], `object.${object.id}.semantic.${relation}`)) edges.push({ from: object.id, type: relation, to: target });
    }
    for (const child of boundedList(semantic.children ?? [], `object.${object.id}.semantic.children`)) edges.push({ from: object.id, type: 'parent-of', to: child });
  }
  return edges;
}

function uniqueSortedEdges(edges) {
  const map = new Map();
  for (const edge of edges) map.set(`${edge.from}\u0000${edge.type}\u0000${edge.to}`, edge);
  return [...map.values()].sort((a, b) => a.from.localeCompare(b.from) || a.type.localeCompare(b.type) || a.to.localeCompare(b.to));
}

function relationshipProjection(document, entries, includedIds, limit) {
  const graph = document.semanticModel?.relationshipGraph;
  let source = 'object.semantic';
  let rawEdges;
  if (record(graph) && Array.isArray(graph.edges) && graph.edges.length) {
    source = 'semanticModel.relationshipGraph';
    rawEdges = graph.edges.map(normalizedRelationshipEdge);
  } else {
    rawEdges = semanticEdgesFromObjects(entries);
  }
  const relevant = uniqueSortedEdges(rawEdges).filter(edge => includedIds.has(edge.from) || includedIds.has(edge.to));
  return {
    source,
    edges: relevant.slice(0, limit),
    totalAvailable: relevant.length,
    truncated: relevant.length > limit
  };
}

function normalizeRevisionId(document, explicit) {
  const candidate = explicit ?? document.revisionId ?? document.ai?.revisionId ?? null;
  return boundedText(candidate, 'revisionId', { required: false, max: 220 });
}

function basePayload(document, page, selectedIds, focusIds, objectSummaries, relationships, limits, totalObjects, unresolvedSelection) {
  const layer = page.layers.find(item => item.id === page.activeLayerId);
  return {
    schema: AI_DOCUMENT_BRIDGE_SCHEMA,
    version: AI_DOCUMENT_BRIDGE_VERSION,
    fingerprintAlgorithm: AI_DOCUMENT_BRIDGE_FINGERPRINT_ALGORITHM,
    document: {
      id: document.id,
      title: boundedText(document.title, 'document.title', { required: false, max: 240 }),
      format: document.format,
      formatVersion: Number(document.formatVersion),
      appVersion: boundedText(document.appVersion, 'document.appVersion', { required: false, max: 80 }),
      pageCount: document.pages.length
    },
    active: {
      page: { id: page.id, name: boundedText(page.name, 'page.name', { required: false }) },
      layer: { id: layer.id, name: boundedText(layer.name, 'layer.name', { required: false }) }
    },
    selection: {
      objectIds: selectedIds.filter(id => objectSummaries.some(item => item.ref.objectId === id)),
      unresolvedObjectIds: unresolvedSelection
    },
    focus: { objectIds: focusIds || [] },
    objects: objectSummaries,
    relationships,
    bounds: {
      limits,
      objects: { totalAvailable: totalObjects, returned: objectSummaries.length, truncated: objectSummaries.length < totalObjects && !focusIds },
      relationships: { totalAvailable: relationships.totalAvailable, returned: relationships.edges.length, truncated: relationships.truncated },
      outputBytes: null
    }
  };
}

function finalize(payload, revisionId, maxBytes, requiredIds) {
  const required = new Set(requiredIds);
  const working = canonicalize({ ...payload, revision: { revisionId } });

  const refresh = () => {
    working.bounds.objects.returned = working.objects.length;
    working.bounds.relationships.returned = working.relationships.edges.length;
    working.bounds.relationships.truncated = working.relationships.edges.length < working.relationships.totalAvailable;
    working.bounds.objects.truncated = working.bounds.objects.truncated || working.objects.length < working.bounds.objects.totalAvailable;
    const hashPayload = canonicalize({ ...working, contextFingerprint: undefined, bounds: { ...working.bounds, outputBytes: null } });
    working.contextFingerprint = fingerprint(hashPayload);
    working.bounds.outputBytes = 0;
    for (let pass = 0; pass < 4; pass += 1) {
      const measured = utf8Bytes(stableStringify(working));
      if (measured === working.bounds.outputBytes) break;
      working.bounds.outputBytes = measured;
    }
    return utf8Bytes(stableStringify(working));
  };

  let bytes = refresh();
  while (bytes > maxBytes && working.relationships.edges.length) {
    working.relationships.edges.pop();
    bytes = refresh();
  }
  while (bytes > maxBytes) {
    let removableIndex = -1;
    for (let index = working.objects.length - 1; index >= 0; index -= 1) {
      if (!required.has(working.objects[index].ref.objectId)) { removableIndex = index; break; }
    }
    if (removableIndex < 0) break;
    working.objects.splice(removableIndex, 1);
    const kept = new Set(working.objects.map(item => item.ref.objectId));
    working.relationships.edges = working.relationships.edges.filter(edge => kept.has(edge.from) || kept.has(edge.to));
    working.selection.objectIds = working.selection.objectIds.filter(id => kept.has(id));
    bytes = refresh();
  }
  if (bytes > maxBytes) fail('OUTPUT_BOUNDS_EXCEEDED', { maxBytes, actualBytes: bytes, requiredObjectIds: [...required].sort() });
  return working;
}

export function buildAIDocumentBridge(document, options = {}) {
  if (!record(options)) fail('OPTIONS_INVALID');
  const page = validateDocument(document);
  const limits = normalizeLimits(options.limits || {});
  const entries = collectPageObjects(page);
  const byId = new Map(entries.map(entry => [entry.object.id, entry]));
  const selectedIds = normalizeSelection(document, options.selectedObjectIds);
  const focusIds = normalizeFocus(options.objectIds);

  if (selectedIds.length > limits.maxObjects && !focusIds) fail('SELECTION_BOUNDS_EXCEEDED', { selectedCount: selectedIds.length, maxObjects: limits.maxObjects });
  if (focusIds && focusIds.length > limits.maxObjects) fail('FOCUS_BOUNDS_EXCEEDED', { focusCount: focusIds.length, maxObjects: limits.maxObjects });
  if (focusIds) {
    const missing = focusIds.filter(id => !byId.has(id));
    if (missing.length) fail('FOCUS_TARGET_MISSING', { objectIds: missing });
  }

  const unresolvedSelection = selectedIds.filter(id => !byId.has(id));
  const orderedEntries = [...entries].sort((a, b) => a.object.id.localeCompare(b.object.id));
  const requiredIds = focusIds || selectedIds.filter(id => byId.has(id));
  const requiredSet = new Set(requiredIds);
  let selectedEntries;
  if (focusIds) selectedEntries = focusIds.map(id => byId.get(id));
  else selectedEntries = [
    ...requiredIds.map(id => byId.get(id)),
    ...orderedEntries.filter(entry => !requiredSet.has(entry.object.id))
  ].slice(0, limits.maxObjects);

  const summaries = selectedEntries.map(entry => objectSummary(page, entry))
    .sort((a, b) => a.ref.objectId.localeCompare(b.ref.objectId));
  const includedIds = new Set(summaries.map(item => item.ref.objectId));
  const relationships = relationshipProjection(document, entries, includedIds, limits.maxRelationships);
  const payload = basePayload(document, page, selectedIds, focusIds, summaries, relationships, limits, focusIds ? focusIds.length : entries.length, unresolvedSelection);
  return finalize(payload, normalizeRevisionId(document, options.revisionId), limits.maxBytes, requiredIds);
}

export function createAIDocumentBridgeAdapter({ getDocument, getSelectedObjectIds = null, getRevisionId = null } = {}) {
  if (typeof getDocument !== 'function') fail('ADAPTER_DOCUMENT_PROVIDER_REQUIRED');
  if (getSelectedObjectIds != null && typeof getSelectedObjectIds !== 'function') fail('ADAPTER_SELECTION_PROVIDER_INVALID');
  if (getRevisionId != null && typeof getRevisionId !== 'function') fail('ADAPTER_REVISION_PROVIDER_INVALID');
  return Object.freeze({
    read(options = {}) {
      const document = getDocument();
      const next = { ...options };
      if (!own(next, 'selectedObjectIds') && getSelectedObjectIds) next.selectedObjectIds = getSelectedObjectIds();
      if (!own(next, 'revisionId') && getRevisionId) next.revisionId = getRevisionId();
      return buildAIDocumentBridge(document, next);
    }
  });
}
