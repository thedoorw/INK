import { Matrix } from '../core/index.js';
import { findPageObject } from '../document/hierarchy.js';
import { assertFinitePathGeometry } from './path-edit.js';
import { normalizeExpressiveStroke, pathGeometryFingerprint } from '../vector/stroke-appearance.js';
import {
  normalizePathMaterialAppearance,
  normalizePathRepaint,
  pathAppearanceState,
  resolvePathPaintAppearance
} from '../vector/paint-appearance.js';

const fail = (code, details = {}) => {
  throw Object.assign(new Error(`INK_REPAINT_MATERIAL_${code}`), { code: `REPAINT_MATERIAL_${code}`, ...details });
};
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const stable = value => JSON.stringify(value ?? null);

function invariant(path) {
  return {
    id: path.id || null,
    parentId: path.parentId || null,
    matrix: clone(path.matrix || Matrix.identity()),
    geometry: pathGeometryFingerprint(path),
    metadata: stable(path.metadata || {})
  };
}

function sameInvariant(before, path) {
  return before.id === (path.id || null)
    && before.parentId === (path.parentId || null)
    && stable(before.matrix) === stable(path.matrix || Matrix.identity())
    && before.geometry === pathGeometryFingerprint(path)
    && before.metadata === stable(path.metadata || {});
}

function applyState(path, state) {
  path.fill = state.fill;
  path.stroke = state.stroke;
  path.opacity = state.opacity;
  if (state.expressiveStroke == null) delete path.expressiveStroke;
  else path.expressiveStroke = clone(state.expressiveStroke);
  if (state.materialAppearance == null) delete path.materialAppearance;
  else path.materialAppearance = clone(state.materialAppearance);
}

function refsFor(app, refs) {
  if (refs == null) return Array.isArray(app.selection) ? app.selection : [];
  return Array.isArray(refs) ? refs : [refs];
}

export class PathRepaintMaterialController {
  constructor(app) {
    this.app = app;
  }

  resolve(refs = null, { requireHistoryIdle = false } = {}) {
    if (requireHistoryIdle && this.app.history?.pending) fail('HISTORY_BUSY');
    const requested = refsFor(this.app, refs);
    if (!requested.length) fail('SELECTION_EMPTY');
    const output = [];
    const seen = new Set();
    for (const ref of requested) {
      const found = findPageObject(this.app.page(), ref);
      if (!found) fail('STALE_SELECTION', { ref });
      if (found.object?.type !== 'path') fail('PATH_REQUIRED', { objectId: found.object?.id || null });
      if (seen.has(found.object.id)) continue;
      if (found.effectiveLocked) fail('LOCKED_TARGET', { objectId: found.object.id });
      if (found.effectiveVisible === false) fail('HIDDEN_TARGET', { objectId: found.object.id });
      if (found.interactionExposed === false) fail('UNEXPOSED_TARGET', { objectId: found.object.id });
      if (!Matrix.isInvertible(found.worldMatrix || found.object.matrix || Matrix.identity())) fail('SINGULAR_TARGET', { objectId: found.object.id });
      assertFinitePathGeometry(found.object);
      seen.add(found.object.id);
      output.push(found);
    }
    return output;
  }

  mutate(label, refs, planner) {
    const found = this.resolve(refs, { requireHistoryIdle: true });
    if (!this.app.history?.pushScoped || typeof this.app.objectPath !== 'function') fail('HISTORY_UNAVAILABLE');

    const planned = found.map(item => {
      const path = item.object;
      const before = pathAppearanceState(path);
      const after = planner(path, clone(before));
      return {
        found: item,
        before,
        after,
        invariant: invariant(path),
        changed: stable(before) !== stable(after)
      };
    });
    const changed = planned.filter(item => item.changed);
    if (!changed.length) {
      return {
        changed: false,
        changedCount: 0,
        pathIds: found.map(item => item.object.id),
        appearances: found.map(item => ({ pathId: item.object.id, ...pathAppearanceState(item.object) }))
      };
    }

    const targets = changed.map(item => this.app.objectPath(item.found));
    if (targets.some(target => !target)) fail('HISTORY_TARGET_UNAVAILABLE');

    this.app.history.pushScoped(label, targets, () => {
      for (const item of changed) {
        applyState(item.found.object, item.after);
        assertFinitePathGeometry(item.found.object);
        if (!sameInvariant(item.invariant, item.found.object)) fail('STRUCTURE_CHANGED', { objectId: item.found.object.id });
      }
    });

    for (const item of changed) this.app.queueSpatialObject?.({ layerId: item.found.layer.id, objectId: item.found.object.id });
    this.app.refreshAll?.();
    return {
      changed: true,
      changedCount: changed.length,
      pathIds: found.map(item => item.object.id),
      changedPathIds: changed.map(item => item.found.object.id),
      appearances: found.map(item => ({ pathId: item.object.id, ...pathAppearanceState(item.object) }))
    };
  }

  repaint(patch = {}, { refs = null, label = '重新著色 Path' } = {}) {
    return this.mutate(label, refs, (path, current) => {
      const normalized = normalizePathRepaint(patch, {
        fill: current.fill,
        stroke: current.stroke,
        expressiveStrokeColor: current.expressiveStroke?.color || current.stroke
      });
      if (Object.prototype.hasOwnProperty.call(normalized, 'fill')) current.fill = normalized.fill;
      if (Object.prototype.hasOwnProperty.call(normalized, 'stroke')) current.stroke = normalized.stroke;
      if (Object.prototype.hasOwnProperty.call(normalized, 'opacity')) current.opacity = normalized.opacity;
      if (Object.prototype.hasOwnProperty.call(normalized, 'expressiveStrokeColor') && current.expressiveStroke) {
        current.expressiveStroke = normalizeExpressiveStroke({
          ...current.expressiveStroke,
          color: normalized.expressiveStrokeColor
        }, { color: normalized.expressiveStrokeColor, width: path.strokeWidth });
      }
      if (current.materialAppearance && (
        Object.prototype.hasOwnProperty.call(normalized, 'fill')
        || Object.prototype.hasOwnProperty.call(normalized, 'stroke')
      )) {
        current.materialAppearance = normalizePathMaterialAppearance({
          ...current.materialAppearance,
          fallback: {
            ...current.materialAppearance.fallback,
            fill: current.fill,
            stroke: current.stroke
          }
        }, { fill: current.fill, stroke: current.stroke });
      }
      return current;
    });
  }

  applyMaterial(material, { refs = null, label = '套用 Path 材質' } = {}) {
    return this.mutate(label, refs, (path, current) => {
      current.materialAppearance = normalizePathMaterialAppearance(material, {
        fill: current.fill,
        stroke: current.stroke
      });
      return current;
    });
  }

  replaceMaterial(material, options = {}) {
    return this.applyMaterial(material, { ...options, label: options.label || '更換 Path 材質' });
  }

  removeMaterial({ refs = null, label = '移除 Path 材質' } = {}) {
    return this.mutate(label, refs, (_path, current) => {
      current.materialAppearance = null;
      return current;
    });
  }

  diagnostics({ refs = null } = {}) {
    return this.resolve(refs).map(item => ({
      pathId: item.object.id,
      materialAppearance: clone(item.object.materialAppearance || null),
      ...resolvePathPaintAppearance(item.object, this.app.doc).diagnostics
    }));
  }
}

export function installRepaintMaterial(app) {
  const controller = new PathRepaintMaterialController(app);
  app.pathRepaintMaterial = controller;
  return controller;
}
