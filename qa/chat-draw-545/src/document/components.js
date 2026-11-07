import { Matrix, deepClone, uid } from '../core/index.js';
import { isStructuralContainer, walkPageObjects } from './hierarchy.js';

// Optional format-4 extension. Definitions reference existing ordinary geometry;
// resolved geometry is a disposable view, never part of the native document.
export const COMPONENT_SCHEMA = 'INK-COMPONENTS-1';
export const isComponentInstance = object => object?.type === 'component-instance';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const reservedKey = value => ['__proto__', 'constructor', 'prototype'].includes(value);
const validId = value => typeof value === 'string' && value.trim().length > 0;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const diagnostic = (code, details = {}) => ({ code, ...details });

function entries(document) {
  return (document.pages || []).flatMap((page, pageIndex) =>
    walkPageObjects(page).map(entry => ({ ...entry, page, path: ['pages', pageIndex, ...entry.path] })));
}

function registry(document) {
  if (document.components === undefined) return [];
  if (document.components?.schema !== COMPONENT_SCHEMA || !Array.isArray(document.components.definitions)) fail('component-invalid-registry');
  return document.components.definitions;
}

function sourceEntries(root) {
  return walkPageObjects({ layers: [{ id: 'component-view', objects: [root] }] });
}

// Inspect embedded payloads too: a Repeat source must not hide a nested instance.
function embeddedInstances(root) {
  const found = [], seen = new WeakSet();
  const scan = value => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (isComponentInstance(value)) found.push(value);
    for (const child of Object.values(value)) scan(child);
  };
  scan(root);
  return found;
}

function definitionSource(document, definitionId) {
  const matches = registry(document).filter(item => item?.id === definitionId);
  if (!matches.length) fail('component-missing-definition');
  if (matches.length !== 1) fail('component-duplicate-definition-id');
  const definition = matches[0];
  if (!validId(definition.id) || typeof definition.name !== 'string' || !definition.name.trim()) fail('component-invalid-definition');
  const roots = entries(document).filter(entry => entry.object.id === definition.sourceRootId);
  if (roots.length !== 1 || !isStructuralContainer(roots[0]?.object)) fail('component-invalid-source-root');
  const source = roots[0];
  // No recursive component evaluation in v0.1, even for acyclic nesting.
  if (embeddedInstances(source.object).length) fail('component-nested-instance-unsupported');
  const nodes = sourceEntries(source.object);
  const ids = nodes.map(entry => entry.object.id);
  if (ids.some(id => !validId(id)) || new Set(ids).size !== ids.length) fail('component-ambiguous-source-node-id');
  return { definition, source, nodes };
}

function overrideIssues(instance, nodeIds = null) {
  const issues = [];
  if (!record(instance.overrides)) return [diagnostic('component-invalid-overrides')];
  for (const [sourceNodeId, properties] of Object.entries(instance.overrides)) {
    if (nodeIds && !nodeIds.has(sourceNodeId)) issues.push(diagnostic('component-stale-override-target', { sourceNodeId }));
    if (reservedKey(sourceNodeId) || !record(properties) || Object.keys(properties).some(key => key !== 'opacity') ||
        (Object.hasOwn(properties || {}, 'opacity') && (typeof properties.opacity !== 'number' || !Number.isFinite(properties.opacity) || properties.opacity < 0 || properties.opacity > 1))) {
      issues.push(diagnostic('component-invalid-override-property', { sourceNodeId }));
    }
  }
  return issues;
}

export function resolveComponentInstance(document, instance) {
  const diagnostics = [];
  try {
    if (!isComponentInstance(instance) || instance.componentSchema !== COMPONENT_SCHEMA || !validId(instance.definitionId)) fail('component-invalid-instance');
    if (Object.hasOwn(instance, 'children')) fail('component-instance-owned-children');
    const { definition, source, nodes } = definitionSource(document, instance.definitionId);
    diagnostics.push(...overrideIssues(instance, new Set(nodes.map(entry => entry.object.id))));
    const geometry = deepClone(source.object);
    // Source canvas placement and its ancestors are not definition geometry.
    geometry.matrix = Matrix.identity();
    delete geometry.parentId;
    const ignored = new Set(diagnostics.filter(item => item.code === 'component-invalid-override-property').map(item => item.sourceNodeId));
    for (const { object } of sourceEntries(geometry)) {
      const properties = record(instance.overrides) && Object.hasOwn(instance.overrides, object.id) ? instance.overrides[object.id] : null;
      if (properties && !ignored.has(object.id) && Object.hasOwn(properties, 'opacity')) object.opacity = properties.opacity;
    }
    const view = {
      id: instance.id, type: 'group', name: instance.name || definition.name,
      matrix: [...instance.matrix], opacity: instance.opacity ?? 1,
      visible: instance.visible !== false, locked: Boolean(instance.locked),
      ...(instance.blendMode ? { blendMode: instance.blendMode } : {}), children: [geometry]
    };
    // Namespace all derived IDs, including Repeat/gradient payloads, deterministically.
    remapGeometryIds(geometry, id => `component-view:${encodeURIComponent(instance.id)}:${encodeURIComponent(id)}`);
    geometry.parentId = view.id;
    return { status: diagnostics.length ? 'linked-with-diagnostics' : 'linked', diagnostics, geometry: view };
  } catch (error) {
    return { status: 'broken', diagnostics: [diagnostic(error.code || 'component-resolution-failed')], geometry: null };
  }
}

// Clone identity/reference remapping, not a geometry or hierarchy engine.
function remapGeometryIds(root, makeId) {
  const ids = new Map(), seen = new WeakSet();
  const visit = (value, operation) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value); operation(value);
    Object.values(value).forEach(child => visit(child, operation));
  };
  visit(root, value => { if (validId(value.id) && !ids.has(value.id)) ids.set(value.id, makeId(value.id)); });
  const rewrite = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'string' && (key === 'id' || key.endsWith('Id')) && ids.has(child)) value[key] = ids.get(child);
      else if (child && typeof child === 'object') rewrite(child);
    }
    // Generated descriptors are rebuilt by the existing Repeat identity code.
    if (value.type === 'repeat') value.instances = [];
  };
  rewrite(root);
}

export function inspectComponents(document) {
  const diagnostics = [];
  let definitions, objects;
  try { definitions = registry(document); objects = entries(document); }
  catch (error) { return [diagnostic(error.code || 'component-invalid-structure')]; }
  const counts = new Map();
  definitions.forEach(definition => counts.set(definition?.id, (counts.get(definition?.id) || 0) + 1));
  const edges = new Map();
  for (const definition of definitions) {
    const definitionId = definition?.id;
    if (counts.get(definitionId) > 1) diagnostics.push(diagnostic('component-duplicate-definition-id', { definitionId }));
    try { definitionSource(document, definitionId); }
    catch (error) { diagnostics.push(diagnostic(error.code || 'component-invalid-definition', { definitionId })); }
    const roots = objects.filter(entry => entry.object.id === definition?.sourceRootId);
    edges.set(definitionId, roots.flatMap(entry => embeddedInstances(entry.object).map(instance => instance.definitionId)));
  }
  const active = new Set(), done = new Set();
  const visit = id => {
    if (active.has(id)) { diagnostics.push(diagnostic('component-cycle', { definitionId: id })); return; }
    if (done.has(id)) return;
    active.add(id);
    for (const target of edges.get(id) || []) visit(target);
    active.delete(id); done.add(id);
  };
  for (const id of edges.keys()) visit(id);
  for (const { object } of objects.filter(entry => isComponentInstance(entry.object))) {
    const result = resolveComponentInstance(document, object);
    diagnostics.push(...result.diagnostics.map(item => ({ ...item, instanceId: object.id })));
  }
  return diagnostics;
}

function transaction(app, label, targets, operation) {
  if (!app.history || app.history.pending) fail('component-history-busy');
  let result;
  app.history.pushScoped(label, targets, () => { result = operation(); });
  app.spatialDirty = true;
  app.refreshAll?.();
  return result;
}

function findEntry(document, objectId) {
  const matches = entries(document).filter(entry => entry.object.id === objectId);
  if (matches.length !== 1) fail('component-object-not-unique');
  return matches[0];
}

export function registerComponentDefinition(app, sourceRootId, name) {
  const definitions = registry(app.doc);
  const source = findEntry(app.doc, sourceRootId);
  if (!isStructuralContainer(source.object) || embeddedInstances(source.object).length) fail('component-invalid-source-root');
  if (typeof name !== 'string' || !name.trim()) fail('component-invalid-name');
  const definition = { id: uid(), name: name.trim(), sourceRootId };
  return transaction(app, 'Register Component', [['components']], () => {
    app.doc.components = { schema: COMPONENT_SCHEMA, definitions: [...definitions, definition] };
    return definition;
  });
}

function destination(document, { pageId, layerId, parentId = null }) {
  const pageIndex = document.pages.findIndex(page => page.id === pageId);
  const page = document.pages[pageIndex];
  const layerIndex = page?.layers.findIndex(layer => layer.id === layerId);
  if (!page || layerIndex < 0) fail('component-invalid-destination');
  const layer = page.layers[layerIndex];
  if (!parentId) return { array: layer.objects, path: ['pages', pageIndex, 'layers', layerIndex, 'objects'], parentId: null };
  const parent = findEntry(document, parentId);
  if (parent.page !== page || parent.layer !== layer || !isStructuralContainer(parent.object)) fail('component-invalid-destination');
  // Creating inside any definition would introduce unsupported nested Instances.
  if (registry(document).some(def => def.sourceRootId === parentId || parent.ancestorIds.includes(def.sourceRootId))) fail('component-nested-instance-unsupported');
  return { array: parent.object.children, path: [...parent.path, 'children'], parentId };
}

export function createComponentInstance(app, definitionId, placement) {
  definitionSource(app.doc, definitionId);
  const target = destination(app.doc, placement);
  const matrix = placement.matrix || Matrix.identity();
  if (!Array.isArray(matrix) || matrix.length !== 6 || !matrix.every(Number.isFinite)) fail('component-invalid-matrix');
  const instance = { id: uid(), type: 'component-instance', componentSchema: COMPONENT_SCHEMA, definitionId,
    matrix: [...matrix], opacity: 1, visible: true, locked: false, overrides: {} };
  if (target.parentId) instance.parentId = target.parentId;
  return transaction(app, 'Create Instance', [target.path], () => { target.array.push(instance); return instance; });
}

export function setComponentOverride(app, instanceId, sourceNodeId, opacity) {
  const entry = findEntry(app.doc, instanceId), instance = entry.object;
  if (!isComponentInstance(instance) || !validId(sourceNodeId)) fail('component-invalid-instance');
  // Reset is permitted even for a broken reference or malformed legacy envelope.
  if (opacity !== null) {
    if (reservedKey(sourceNodeId)) fail('component-invalid-override-target');
    const { nodes } = definitionSource(app.doc, instance.definitionId);
    if (!nodes.some(entry => entry.object.id === sourceNodeId)) fail('component-stale-override-target');
    if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) fail('component-invalid-override-property');
  }
  const overrides = record(instance.overrides) ? deepClone(instance.overrides) : {};
  if (opacity === null) delete overrides[sourceNodeId];
  else Object.defineProperty(overrides, sourceNodeId, { value: { opacity }, enumerable: true, writable: true, configurable: true });
  return transaction(app, opacity === null ? 'Reset Component Override' : 'Override Component Opacity', [[...entry.path, 'overrides']], () => { instance.overrides = overrides; return instance; });
}

export function detachComponentInstance(app, instanceId) {
  const entry = findEntry(app.doc, instanceId);
  const resolved = resolveComponentInstance(app.doc, entry.object);
  if (!resolved.geometry) fail('component-broken-detach-rejected');
  const ordinary = resolved.geometry;
  remapGeometryIds(ordinary, () => uid());
  if (entry.parentObject) ordinary.parentId = entry.parentObject.id;
  return transaction(app, 'Detach Component Instance', [entry.path.slice(0, -1)], () => {
    entry.parentArray[entry.objectIndex] = ordinary;
    return ordinary;
  });
}

export function duplicateComponentDefinition(app, definitionId, name = null) {
  const { definition, source } = definitionSource(app.doc, definitionId);
  const copy = deepClone(source.object);
  remapGeometryIds(copy, () => uid());
  if (source.parentObject) copy.parentId = source.parentObject.id;
  else delete copy.parentId;
  const duplicate = { id: uid(), name: name === null ? `${definition.name} Copy` : name, sourceRootId: copy.id };
  if (typeof duplicate.name !== 'string' || !duplicate.name.trim()) fail('component-invalid-name');
  return transaction(app, 'Duplicate Component Definition', [['components'], source.path.slice(0, -1)], () => {
    source.parentArray.splice(source.objectIndex + 1, 0, copy);
    app.doc.components.definitions.push(duplicate);
    return duplicate;
  });
}

// Explicit user-driven repair. Never invoked by load, migration, or rendering.
export function repairComponentReference(app, instanceId, definitionId) {
  const entry = findEntry(app.doc, instanceId);
  if (!isComponentInstance(entry.object)) fail('component-invalid-instance');
  definitionSource(app.doc, definitionId);
  if (registry(app.doc).some(def => entry.ancestorIds.includes(def.sourceRootId))) fail('component-nested-instance-unsupported');
  return transaction(app, 'Repair Component Reference', [[...entry.path, 'definitionId']], () => {
    entry.object.definitionId = definitionId;
    return entry.object;
  });
}
