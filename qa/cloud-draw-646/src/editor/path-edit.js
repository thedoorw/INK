import { Matrix } from '../core/index.js';
import { findPageObject } from '../document/hierarchy.js';
import { addAnchor, createAnchor, deleteAnchor, moveAnchor, moveBezierHandle, setAnchorMode } from '../vector/vector-core.js';

const ANCHOR_MODES = new Set(['corner', 'smooth', 'symmetric']);
const HANDLE_SIDES = new Set(['in', 'out']);

const fail = (code, details = {}) => {
  const error = Object.assign(new Error(`INK_PATH_EDIT_${code}`), { code: `PATH_EDIT_${code}`, ...details });
  throw error;
};

const keyForAnchor = (subpathIndex, anchorIndex) => `${subpathIndex}:${anchorIndex}`;

function finiteNumber(value, code = 'NON_FINITE_INPUT') {
  if (!Number.isFinite(value)) fail(code);
  return value;
}

function metadataFingerprint(path) {
  return JSON.stringify(path?.metadata ?? {});
}

function selectedCandidate(app, ref = null) {
  if (ref) return findPageObject(app.page(), ref);
  const selected = typeof app.selectedObjects === 'function'
    ? app.selectedObjects()
    : (app.selection || []).map(item => findPageObject(app.page(), item)).filter(Boolean);
  return selected.length === 1 ? selected[0] : null;
}

function validateAnchorRef(path, subpathIndex, anchorIndex) {
  if (!Number.isInteger(subpathIndex) || !Number.isInteger(anchorIndex)) fail('ANCHOR_REF_INVALID');
  const subpath = path?.subpaths?.[subpathIndex];
  const anchor = subpath?.anchors?.[anchorIndex];
  if (!anchor) fail('ANCHOR_NOT_FOUND', { subpathIndex, anchorIndex });
  return { subpath, anchor };
}

export function assertFinitePathGeometry(path) {
  if (!path || path.type !== 'path' || !Array.isArray(path.subpaths)) fail('PATH_INVALID');
  for (let subpathIndex = 0; subpathIndex < path.subpaths.length; subpathIndex += 1) {
    const subpath = path.subpaths[subpathIndex];
    if (!subpath || !Array.isArray(subpath.anchors)) fail('SUBPATH_INVALID', { subpathIndex });
    if (!['outer', 'hole'].includes(subpath.role || 'outer')) fail('SUBPATH_ROLE_INVALID', { subpathIndex });
    for (let anchorIndex = 0; anchorIndex < subpath.anchors.length; anchorIndex += 1) {
      const anchor = subpath.anchors[anchorIndex];
      const values = [anchor?.x, anchor?.y, anchor?.in?.x, anchor?.in?.y, anchor?.out?.x, anchor?.out?.y];
      if (!values.every(Number.isFinite)) fail('NON_FINITE_GEOMETRY', { subpathIndex, anchorIndex });
      if (!ANCHOR_MODES.has(anchor.mode || 'corner')) fail('ANCHOR_MODE_INVALID', { subpathIndex, anchorIndex });
    }
  }
  return true;
}

function validateSegmentRef(path, subpathIndex, segmentIndex) {
  if (!Number.isInteger(subpathIndex) || !Number.isInteger(segmentIndex)) fail('SEGMENT_REF_INVALID');
  const subpath = path?.subpaths?.[subpathIndex];
  const anchors = subpath?.anchors;
  if (!subpath || !Array.isArray(anchors) || anchors.length < 2) fail('SEGMENT_NOT_FOUND', { subpathIndex, segmentIndex });
  const count = subpath.closed ? anchors.length : anchors.length - 1;
  if (segmentIndex < 0 || segmentIndex >= count) fail('SEGMENT_NOT_FOUND', { subpathIndex, segmentIndex });
  return {
    subpath,
    from: anchors[segmentIndex],
    to: anchors[(segmentIndex + 1) % anchors.length],
    insertIndex: segmentIndex + 1
  };
}

const lerpPoint = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function splitPathSegment(path, subpathIndex, segmentIndex, t = 0.5) {
  if (!Number.isFinite(t) || t <= 0 || t >= 1) fail('SEGMENT_T_INVALID');
  const { from, to, insertIndex } = validateSegmentRef(path, subpathIndex, segmentIndex);
  const p0 = { x: from.x, y: from.y };
  const p1 = { x: from.x + from.out.x, y: from.y + from.out.y };
  const p2 = { x: to.x + to.in.x, y: to.y + to.in.y };
  const p3 = { x: to.x, y: to.y };
  const p01 = lerpPoint(p0, p1, t);
  const p12 = lerpPoint(p1, p2, t);
  const p23 = lerpPoint(p2, p3, t);
  const p012 = lerpPoint(p01, p12, t);
  const p123 = lerpPoint(p12, p23, t);
  const p = lerpPoint(p012, p123, t);

  from.out = { x: p01.x - p0.x, y: p01.y - p0.y };
  to.in = { x: p23.x - p3.x, y: p23.y - p3.y };
  const inserted = createAnchor(
    p.x,
    p.y,
    { x: p012.x - p.x, y: p012.y - p.y },
    { x: p123.x - p.x, y: p123.y - p.y },
    { mode: 'smooth' }
  );
  const result = addAnchor(path, subpathIndex, insertIndex, inserted);
  return { anchor: result, anchorIndex: insertIndex };
}

function requireSubpathViable(subpath, remaining) {
  const minimum = subpath.closed ? 3 : 2;
  if (remaining < minimum) fail(subpath.closed ? 'CLOSED_PATH_MINIMUM_ANCHORS' : 'OPEN_PATH_MINIMUM_ANCHORS', { minimum, remaining });
}

const handleLength = handle => Math.hypot(handle?.x || 0, handle?.y || 0);

function segmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function pathNodeCount(path) {
  return (path.subpaths || []).reduce((sum, subpath) => sum + (subpath.anchors?.length || 0), 0);
}

function removableLinearAnchor(subpath, index, tolerance, handleTolerance) {
  const anchors = subpath.anchors;
  const count = anchors.length;
  if (count <= (subpath.closed ? 3 : 2)) return false;
  if (!subpath.closed && (index === 0 || index === count - 1)) return false;
  const previous = anchors[(index - 1 + count) % count];
  const current = anchors[index];
  const next = anchors[(index + 1) % count];
  const handles = [previous.out, current.in, current.out, next.in];
  if (handles.some(handle => handleLength(handle) > handleTolerance)) return false;
  return segmentDistance(current, previous, next) <= tolerance;
}

function simplifyPathGeometry(path, { tolerance, handleTolerance, maxPasses }) {
  let removed = 0;
  let passes = 0;
  while (passes < maxPasses) {
    let changed = false;
    for (let subpathIndex = 0; subpathIndex < path.subpaths.length && !changed; subpathIndex += 1) {
      const subpath = path.subpaths[subpathIndex];
      const start = subpath.closed ? 0 : 1;
      const end = subpath.closed ? subpath.anchors.length : subpath.anchors.length - 1;
      for (let index = start; index < end; index += 1) {
        if (!removableLinearAnchor(subpath, index, tolerance, handleTolerance)) continue;
        deleteAnchor(path, subpathIndex, index);
        removed += 1;
        changed = true;
        break;
      }
    }
    passes += 1;
    if (!changed) break;
  }
  return { removed, passes };
}

function segmentControlLength(path, subpathIndex, segmentIndex) {
  const { from, to } = validateSegmentRef(path, subpathIndex, segmentIndex);
  const p0 = { x: from.x, y: from.y };
  const p1 = { x: from.x + from.out.x, y: from.y + from.out.y };
  const p2 = { x: to.x + to.in.x, y: to.y + to.in.y };
  const p3 = { x: to.x, y: to.y };
  return Math.hypot(p1.x - p0.x, p1.y - p0.y)
    + Math.hypot(p2.x - p1.x, p2.y - p1.y)
    + Math.hypot(p3.x - p2.x, p3.y - p2.y);
}

function firstLongSegment(path, maxControlLength) {
  for (let subpathIndex = 0; subpathIndex < path.subpaths.length; subpathIndex += 1) {
    const subpath = path.subpaths[subpathIndex];
    const segmentCount = subpath.closed ? subpath.anchors.length : Math.max(0, subpath.anchors.length - 1);
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      if (segmentControlLength(path, subpathIndex, segmentIndex) > maxControlLength) return { subpathIndex, segmentIndex };
    }
  }
  return null;
}

function refinePathGeometry(path, { maxControlLength, maxAddedAnchors }) {
  let added = 0;
  while (added < maxAddedAnchors) {
    const target = firstLongSegment(path, maxControlLength);
    if (!target) break;
    splitPathSegment(path, target.subpathIndex, target.segmentIndex, 0.5);
    added += 1;
  }
  return { added, truncated: Boolean(firstLongSegment(path, maxControlLength)) };
}

export class PathEditController {
  constructor(app) {
    this.app = app;
    this.state = null;
  }

  get active() {
    return Boolean(this.state);
  }

  enter(ref = null, { syncSelection = true } = {}) {
    if (this.app.history?.pending) fail('HISTORY_BUSY');
    const found = selectedCandidate(this.app, ref);
    if (!found || found.object?.type !== 'path') fail('PATH_NOT_FOUND');
    if (found.effectiveLocked || found.effectiveVisible === false || found.interactionExposed === false) fail('TARGET_UNAVAILABLE');
    if (!Matrix.isInvertible(found.worldMatrix || found.object.matrix || Matrix.identity())) fail('SINGULAR_TARGET');
    assertFinitePathGeometry(found.object);
    this.state = {
      documentId: this.app.doc?.id || null,
      pageId: this.app.page()?.id || null,
      ref: { layerId: found.layer.id, objectId: found.object.id },
      anchorKeys: new Set(),
      handle: null,
      segment: null
    };
    if (syncSelection) this.app.selection = [{ ...this.state.ref }];
    return this.snapshot();
  }

  exit() {
    const hadState = Boolean(this.state);
    this.state = null;
    return hadState;
  }

  resolve({ requireHistoryIdle = false } = {}) {
    const state = this.state;
    if (!state) fail('MODE_INACTIVE');
    if (state.documentId !== (this.app.doc?.id || null) || state.pageId !== (this.app.page()?.id || null)) fail('STALE_TARGET');
    if (requireHistoryIdle && this.app.history?.pending) fail('HISTORY_BUSY');
    const found = findPageObject(this.app.page(), state.ref);
    if (!found || found.object?.type !== 'path') fail('STALE_TARGET');
    if (found.effectiveLocked || found.effectiveVisible === false) fail('TARGET_UNAVAILABLE');
    if (!Matrix.isInvertible(found.worldMatrix || found.object.matrix || Matrix.identity())) fail('SINGULAR_TARGET');
    assertFinitePathGeometry(found.object);
    return found;
  }

  clearSelection() {
    this.resolve();
    this.state.anchorKeys.clear();
    this.state.handle = null;
    this.state.segment = null;
    return this.snapshot();
  }

  selectAnchor(subpathIndex, anchorIndex, { add = false, toggle = false } = {}) {
    const found = this.resolve();
    validateAnchorRef(found.object, subpathIndex, anchorIndex);
    const key = keyForAnchor(subpathIndex, anchorIndex);
    if (!add && !toggle) this.state.anchorKeys.clear();
    if (toggle && this.state.anchorKeys.has(key)) this.state.anchorKeys.delete(key);
    else this.state.anchorKeys.add(key);
    this.state.handle = null;
    this.state.segment = null;
    return this.snapshot();
  }

  selectAnchors(refs = [], { add = false } = {}) {
    const found = this.resolve();
    if (!Array.isArray(refs)) fail('ANCHOR_SELECTION_INVALID');
    if (!add) this.state.anchorKeys.clear();
    for (const ref of refs) {
      validateAnchorRef(found.object, ref?.subpathIndex, ref?.anchorIndex);
      this.state.anchorKeys.add(keyForAnchor(ref.subpathIndex, ref.anchorIndex));
    }
    this.state.handle = null;
    this.state.segment = null;
    return this.snapshot();
  }

  selectHandle(subpathIndex, anchorIndex, side) {
    const found = this.resolve();
    validateAnchorRef(found.object, subpathIndex, anchorIndex);
    if (!HANDLE_SIDES.has(side)) fail('HANDLE_SIDE_INVALID');
    this.state.anchorKeys.clear();
    this.state.anchorKeys.add(keyForAnchor(subpathIndex, anchorIndex));
    this.state.handle = { subpathIndex, anchorIndex, side };
    this.state.segment = null;
    return this.snapshot();
  }

  selectSegment(subpathIndex, segmentIndex, t = 0.5) {
    const found = this.resolve();
    validateSegmentRef(found.object, subpathIndex, segmentIndex);
    if (!Number.isFinite(t) || t < 0 || t > 1) fail('SEGMENT_T_INVALID');
    this.state.anchorKeys.clear();
    this.state.handle = null;
    this.state.segment = { subpathIndex, segmentIndex, t };
    return this.snapshot();
  }

  selectedAnchors() {
    const found = this.resolve();
    const refs = [];
    for (const key of this.state.anchorKeys) {
      const [subpathIndex, anchorIndex] = key.split(':').map(Number);
      validateAnchorRef(found.object, subpathIndex, anchorIndex);
      refs.push({ subpathIndex, anchorIndex });
    }
    return refs.sort((a, b) => a.subpathIndex - b.subpathIndex || a.anchorIndex - b.anchorIndex);
  }

  mutate(label, operation) {
    const found = this.resolve({ requireHistoryIdle: true });
    const target = this.app.objectPath?.(found);
    if (!Array.isArray(target) || !this.app.history?.pushScoped) fail('HISTORY_REQUIRED');
    const objectId = found.object.id;
    const metadataBefore = metadataFingerprint(found.object);
    let result;
    this.app.history.pushScoped(label, [target], () => {
      result = operation(found.object, found);
      assertFinitePathGeometry(found.object);
      if (found.object.id !== objectId) fail('IDENTITY_CHANGED');
      if (metadataFingerprint(found.object) !== metadataBefore) fail('METADATA_CHANGED');
    });
    this.app.queueSpatialObject?.(this.state.ref);
    this.app.spatialDirty = true;
    this.app.refreshAll?.();
    this.app.renderer?.render?.();
    return result;
  }

  moveSelectedAnchors(dx, dy) {
    finiteNumber(dx);
    finiteNumber(dy);
    const refs = this.selectedAnchors();
    if (!refs.length) fail('ANCHOR_SELECTION_EMPTY');
    this.mutate('Move Path anchors', path => {
      for (const ref of refs) {
        const { anchor } = validateAnchorRef(path, ref.subpathIndex, ref.anchorIndex);
        moveAnchor(path, ref.subpathIndex, ref.anchorIndex, anchor.x + dx, anchor.y + dy);
      }
    });
    return this.snapshot();
  }

  moveAnchorTo(subpathIndex, anchorIndex, x, y) {
    finiteNumber(x);
    finiteNumber(y);
    this.resolve();
    validateAnchorRef(this.resolve().object, subpathIndex, anchorIndex);
    this.mutate('Reshape Path anchor', path => moveAnchor(path, subpathIndex, anchorIndex, x, y));
    this.state.anchorKeys.clear();
    this.state.anchorKeys.add(keyForAnchor(subpathIndex, anchorIndex));
    this.state.handle = null;
    this.state.segment = null;
    return this.snapshot();
  }

  moveSelectedHandle(x, y) {
    finiteNumber(x);
    finiteNumber(y);
    const selected = this.state?.handle;
    if (!selected) fail('HANDLE_SELECTION_EMPTY');
    this.mutate('Move Path Bézier handle', path => {
      validateAnchorRef(path, selected.subpathIndex, selected.anchorIndex);
      moveBezierHandle(path, selected.subpathIndex, selected.anchorIndex, selected.side, x, y);
    });
    return this.snapshot();
  }

  setSelectedAnchorMode(mode) {
    if (!ANCHOR_MODES.has(mode)) fail('ANCHOR_MODE_INVALID');
    const refs = this.selectedAnchors();
    if (!refs.length) fail('ANCHOR_SELECTION_EMPTY');
    this.mutate('Set Path anchor mode', path => {
      for (const ref of refs) setAnchorMode(path, ref.subpathIndex, ref.anchorIndex, mode);
    });
    this.state.handle = null;
    this.state.segment = null;
    return this.snapshot();
  }

  addAnchorOnSegment(subpathIndex, segmentIndex, t = 0.5) {
    finiteNumber(t, 'SEGMENT_T_INVALID');
    const found = this.resolve();
    validateSegmentRef(found.object, subpathIndex, segmentIndex);
    let inserted;
    this.mutate('Add Path anchor', path => {
      inserted = splitPathSegment(path, subpathIndex, segmentIndex, t);
    });
    this.state.anchorKeys.clear();
    this.state.anchorKeys.add(keyForAnchor(subpathIndex, inserted.anchorIndex));
    this.state.handle = null;
    this.state.segment = null;
    return { ...this.snapshot(), insertedAnchorId: inserted.anchor.id };
  }

  deleteSelectedAnchors() {
    const refs = this.selectedAnchors();
    if (!refs.length) fail('ANCHOR_SELECTION_EMPTY');
    const found = this.resolve();
    const counts = new Map();
    for (const ref of refs) counts.set(ref.subpathIndex, (counts.get(ref.subpathIndex) || 0) + 1);
    for (const [subpathIndex, count] of counts) {
      const subpath = found.object.subpaths[subpathIndex];
      requireSubpathViable(subpath, subpath.anchors.length - count);
    }
    const descending = [...refs].sort((a, b) => b.subpathIndex - a.subpathIndex || b.anchorIndex - a.anchorIndex);
    this.mutate('Delete Path anchors', path => {
      for (const ref of descending) deleteAnchor(path, ref.subpathIndex, ref.anchorIndex);
    });
    this.state.anchorKeys.clear();
    this.state.handle = null;
    this.state.segment = null;
    return this.snapshot();
  }

  setSubpathClosed(subpathIndex, closed) {
    if (typeof closed !== 'boolean') fail('CLOSED_STATE_INVALID');
    const found = this.resolve();
    const subpath = found.object.subpaths?.[subpathIndex];
    if (!subpath) fail('SUBPATH_INVALID', { subpathIndex });
    if (closed && subpath.anchors.length < 3) fail('CLOSE_REQUIRES_THREE_ANCHORS');
    if (!closed && subpath.anchors.length < 2) fail('OPEN_REQUIRES_TWO_ANCHORS');
    this.mutate(closed ? 'Close Path subpath' : 'Open Path subpath', path => {
      const target = path.subpaths[subpathIndex];
      if (target.closed !== closed) target.closed = closed;
    });
    return { subpathIndex, closed: this.resolve().object.subpaths[subpathIndex].closed };
  }

  simplify({ tolerance = 0.75, handleTolerance = Math.max(0.05, tolerance * 0.25), maxPasses = 256 } = {}) {
    finiteNumber(tolerance, 'SIMPLIFY_SETTINGS_INVALID');
    finiteNumber(handleTolerance, 'SIMPLIFY_SETTINGS_INVALID');
    finiteNumber(maxPasses, 'SIMPLIFY_SETTINGS_INVALID');
    if (tolerance < 0 || handleTolerance < 0 || !Number.isInteger(maxPasses) || maxPasses < 1 || maxPasses > 4096) fail('SIMPLIFY_SETTINGS_INVALID');
    const found = this.resolve();
    const beforeNodeCount = pathNodeCount(found.object);
    let operation = { removed: 0, passes: 0 };
    this.mutate('Simplify Path', path => {
      operation = simplifyPathGeometry(path, { tolerance, handleTolerance, maxPasses });
    });
    this.state.anchorKeys.clear();
    this.state.handle = null;
    this.state.segment = null;
    const afterNodeCount = pathNodeCount(this.resolve().object);
    return {
      operation: 'simplify',
      pathId: this.state.ref.objectId,
      settings: { tolerance, handleTolerance, maxPasses },
      beforeNodeCount,
      afterNodeCount,
      removedNodeCount: operation.removed,
      passes: operation.passes
    };
  }

  refine({ maxControlLength = 48, maxAddedAnchors = 128 } = {}) {
    finiteNumber(maxControlLength, 'REFINE_SETTINGS_INVALID');
    finiteNumber(maxAddedAnchors, 'REFINE_SETTINGS_INVALID');
    if (maxControlLength <= 0 || !Number.isInteger(maxAddedAnchors) || maxAddedAnchors < 1 || maxAddedAnchors > 4096) fail('REFINE_SETTINGS_INVALID');
    const found = this.resolve();
    const beforeNodeCount = pathNodeCount(found.object);
    let operation = { added: 0, truncated: false };
    this.mutate('Refine Path', path => {
      operation = refinePathGeometry(path, { maxControlLength, maxAddedAnchors });
    });
    this.state.anchorKeys.clear();
    this.state.handle = null;
    this.state.segment = null;
    const afterNodeCount = pathNodeCount(this.resolve().object);
    return {
      operation: 'refine',
      pathId: this.state.ref.objectId,
      settings: { maxControlLength, maxAddedAnchors },
      beforeNodeCount,
      afterNodeCount,
      addedNodeCount: operation.added,
      truncated: operation.truncated
    };
  }

  snapshot() {
    if (!this.state) return { active: false, ref: null, anchors: [], handle: null, segment: null };
    return {
      active: true,
      ref: { ...this.state.ref },
      anchors: [...this.state.anchorKeys].sort(),
      handle: this.state.handle ? { ...this.state.handle } : null,
      segment: this.state.segment ? { ...this.state.segment } : null
    };
  }
}

export function installPathEditing(app) {
  if (!app || typeof app !== 'object') fail('APP_REQUIRED');
  if (app.pathEditing instanceof PathEditController) return app.pathEditing;
  app.pathEditing = new PathEditController(app);
  return app.pathEditing;
}
