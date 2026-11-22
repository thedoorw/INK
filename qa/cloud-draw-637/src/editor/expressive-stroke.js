import { Matrix } from '../core/index.js';
import { findPageObject } from '../document/hierarchy.js';
import { assertFinitePathGeometry } from './path-edit.js';
import {
  expressiveStrokeFromBrushPreset,
  normalizeExpressiveStroke,
  pathGeometryFingerprint
} from '../vector/stroke-appearance.js';

const fail = (code, details = {}) => {
  throw Object.assign(new Error(`INK_EXPRESSIVE_STROKE_${code}`), { code: `EXPRESSIVE_STROKE_${code}`, ...details });
};
const stable = value => JSON.stringify(value ?? null);
const metadataFingerprint = path => stable(path?.metadata ?? {});

function selectedCandidate(app, ref = null) {
  if (ref) return findPageObject(app.page(), ref);
  const selected = typeof app.selectedObjects === 'function'
    ? app.selectedObjects()
    : (app.selection || []).map(item => findPageObject(app.page(), item)).filter(Boolean);
  return selected.length === 1 ? selected[0] : null;
}

function mergeStyle(current, changes = {}) {
  return {
    ...(current || {}),
    ...changes,
    profile: { ...(current?.profile || {}), ...(changes.profile || {}) },
    media: { ...(current?.media || {}), ...(changes.media || {}) }
  };
}

export class PathStrokeAppearanceController {
  constructor(app) {
    this.app = app;
  }

  resolve(ref = null, { requireHistoryIdle = false } = {}) {
    if (requireHistoryIdle && this.app.history?.pending) fail('HISTORY_BUSY');
    const found = selectedCandidate(this.app, ref);
    if (!found || found.object?.type !== 'path') fail('PATH_NOT_FOUND');
    if (found.effectiveLocked || found.effectiveVisible === false || found.interactionExposed === false) fail('TARGET_UNAVAILABLE');
    if (!Matrix.isInvertible(found.worldMatrix || found.object.matrix || Matrix.identity())) fail('SINGULAR_TARGET');
    assertFinitePathGeometry(found.object);
    return found;
  }

  current(ref = null) {
    const found = this.resolve(ref);
    return found.object.expressiveStroke ? normalizeExpressiveStroke(found.object.expressiveStroke, {
      color: found.object.stroke, width: found.object.strokeWidth
    }) : null;
  }

  mutate(label, ref, nextStyle) {
    const found = this.resolve(ref, { requireHistoryIdle: true });
    if (!this.app.history?.pushScoped || typeof this.app.objectPath !== 'function') fail('HISTORY_UNAVAILABLE');
    const path = found.object;
    const identity = path.id;
    const geometryBefore = pathGeometryFingerprint(path);
    const metadataBefore = metadataFingerprint(path);
    const normalized = nextStyle == null ? null : normalizeExpressiveStroke(nextStyle, {
      color: path.stroke, width: path.strokeWidth
    });
    const previous = path.expressiveStroke == null ? null : normalizeExpressiveStroke(path.expressiveStroke, {
      color: path.stroke, width: path.strokeWidth
    });
    if (stable(previous) === stable(normalized)) {
      return { changed: false, pathId: identity, style: previous, geometryFingerprint: geometryBefore };
    }
    const target = this.app.objectPath(found);
    if (!target) fail('HISTORY_TARGET_UNAVAILABLE');
    this.app.history.pushScoped(label, [target], () => {
      if (normalized == null) delete path.expressiveStroke;
      else path.expressiveStroke = normalized;
      assertFinitePathGeometry(path);
      if (path.id !== identity) fail('IDENTITY_CHANGED');
      if (pathGeometryFingerprint(path) !== geometryBefore) fail('GEOMETRY_CHANGED');
      if (metadataFingerprint(path) !== metadataBefore) fail('METADATA_CHANGED');
    });
    this.app.queueSpatialObject?.({ layerId: found.layer.id, objectId: identity });
    this.app.refreshAll?.();
    return { changed: true, pathId: identity, style: normalized, geometryFingerprint: geometryBefore };
  }

  assign(style, { ref = null, label = '套用表現筆畫' } = {}) {
    return this.mutate(label, ref, style);
  }

  replace(style, options = {}) {
    return this.assign(style, { ...options, label: options.label || '更換表現筆畫' });
  }

  patch(changes = {}, { ref = null, label = '調整表現筆畫' } = {}) {
    const found = this.resolve(ref, { requireHistoryIdle: true });
    const current = found.object.expressiveStroke || normalizeExpressiveStroke({}, {
      color: found.object.stroke, width: found.object.strokeWidth
    });
    return this.mutate(label, { layerId: found.layer.id, objectId: found.object.id }, mergeStyle(current, changes));
  }

  remove({ ref = null, label = '移除表現筆畫' } = {}) {
    return this.mutate(label, ref, null);
  }

  assignBrushPreset(preset, overrides = {}, { ref = null, label = '套用筆刷表現' } = {}) {
    const mapped = expressiveStrokeFromBrushPreset(preset, overrides);
    const result = this.mutate(label, ref, mapped.style);
    return { ...result, bridge: mapped.diagnostics };
  }
}

export function installExpressiveStroke(app) {
  const controller = new PathStrokeAppearanceController(app);
  app.pathStrokeAppearance = controller;
  return controller;
}
