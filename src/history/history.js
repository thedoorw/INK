import { deepClone } from '../core/index.js';
import { applyPatches, createPatchPair, patchByteSize, patchObjectIds } from './diff.js';

const cloneMaybe = value => value === undefined ? undefined : deepClone(value);

function historyValueAt(root, path) {
  let value = root;
  for (const key of path) {
    if (value == null || !Object.prototype.hasOwnProperty.call(Object(value), key)) return { exists: false, value: undefined };
    value = value[key];
  }
  return { exists: true, value };
}

function comparePath(a, b) {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index++) {
    const av = String(a[index]);
    const bv = String(b[index]);
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return a.length - b.length;
}

function pathContains(parent, child) {
  return parent.length <= child.length && parent.every((key, index) => key === child[index]);
}

function normalizeTargets(targets) {
  if (!Array.isArray(targets) || !targets.length) return null;
  const unique = [];
  const seen = new Set();
  for (const target of targets) {
    const path = Array.isArray(target) ? target : target?.path;
    if (!Array.isArray(path)) throw new TypeError('History target must be a path array or { path } descriptor');
    const normalized = [...path];
    const key = JSON.stringify(normalized);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(normalized);
    }
  }
  unique.sort(comparePath);
  return unique.filter((path, index) => !unique.slice(0, index).some(parent => pathContains(parent, path)));
}

function prefixPatch(patch, prefix) {
  if (!prefix.length) return patch;
  return { ...patch, path: [...prefix, ...patch.path] };
}

function snapshotTargets(root, targets) {
  return targets.map(path => {
    const result = historyValueAt(root, path);
    return { path, exists: result.exists, value: cloneMaybe(result.value) };
  });
}

function scopedPatchPair(beforeTargets, root) {
  const forward = [];
  const inverse = [];
  for (const snapshot of beforeTargets) {
    const current = historyValueAt(root, snapshot.path);
    const before = snapshot.exists ? snapshot.value : undefined;
    const after = current.exists ? current.value : undefined;
    const pair = createPatchPair(before, after);
    forward.push(...pair.forward.map(patch => prefixPatch(patch, snapshot.path)));
    inverse.unshift(...pair.inverse.map(patch => prefixPatch(patch, snapshot.path)));
  }
  return { forward, inverse };
}

function snapshotByteSize(snapshot) {
  try {
    return new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
  } catch {
    return 0;
  }
}

export class HistoryManager {
  constructor(app, limit = 30) {
    this.app = app;
    this.limit = this.normalizeLimit(limit);
    this.undoStack = [];
    this.redoStack = [];
    this.pending = null;
    this.metrics = {
      scopedBegins: 0,
      fullBegins: 0,
      scopedCapturedBytes: 0,
      fullCapturedBytes: 0,
      inPlaceApplies: 0
    };
  }

  normalizeLimit(limit) {
    const numeric = Number(limit);
    return [20, 30, 50].includes(numeric) ? numeric : 30;
  }

  timeline() {
    return {
      entries: [...this.undoStack, ...[...this.redoStack].reverse()],
      applied: this.undoStack.length,
      limit: this.limit
    };
  }

  setLimit(limit) {
    this.limit = this.normalizeLimit(limit);
    if (this.undoStack.length > this.limit) {
      this.undoStack.splice(0, this.undoStack.length - this.limit);
    }
    const redoCapacity = Math.max(0, this.limit - this.undoStack.length);
    if (this.redoStack.length > redoCapacity) {
      this.redoStack = redoCapacity ? this.redoStack.slice(-redoCapacity) : [];
    }
    this.app.updateHistoryUI?.();
    return this.limit;
  }

  jumpTo(appliedCount) {
    if (this.pending) this.commit();
    const timeline = this.timeline();
    const target = Math.max(0, Math.min(timeline.entries.length, Math.trunc(Number(appliedCount) || 0)));
    if (target === timeline.applied) return false;
    let document = this.app.doc;
    if (target < timeline.applied) {
      for (let index = timeline.applied - 1; index >= target; index--) {
        document = applyPatches(document, timeline.entries[index].inverse);
      }
    } else {
      for (let index = timeline.applied; index < target; index++) {
        document = applyPatches(document, timeline.entries[index].forward);
      }
    }
    this.undoStack = timeline.entries.slice(0, target);
    this.redoStack = timeline.entries.slice(target).reverse();
    this.metrics.inPlaceApplies++;
    this.app.replaceDocument?.(document, { fromHistory: true, skipSanitize: true });
    const label = target ? timeline.entries[target - 1]?.label : '歷史起點';
    this.app.toast?.(`歷史：${label}`);
    this.app.updateHistoryUI?.();
    return true;
  }

  begin(label = '變更', { targets = null } = {}) {
    if (this.pending) return false;
    const normalizedTargets = normalizeTargets(targets);
    if (normalizedTargets) {
      const beforeTargets = snapshotTargets(this.app.doc, normalizedTargets);
      const capturedBytes = snapshotByteSize(beforeTargets);
      this.pending = { label, mode: 'scoped', targets: normalizedTargets, beforeTargets, capturedBytes };
      this.metrics.scopedBegins++;
      this.metrics.scopedCapturedBytes += capturedBytes;
    } else {
      const before = deepClone(this.app.doc);
      const capturedBytes = snapshotByteSize(before);
      this.pending = { label, mode: 'full', before, capturedBytes };
      this.metrics.fullBegins++;
      this.metrics.fullCapturedBytes += capturedBytes;
    }
    return true;
  }

  commit() {
    if (!this.pending) return false;
    const pending = this.pending;
    const pair = pending.mode === 'scoped'
      ? scopedPatchPair(pending.beforeTargets, this.app.doc)
      : createPatchPair(pending.before, this.app.doc);
    const { forward, inverse } = pair;
    this.pending = null;
    if (!forward.length) {
      this.app.updateHistoryUI?.();
      return false;
    }
    this.undoStack.push({
      label: pending.label,
      forward,
      inverse,
      captureMode: pending.mode,
      capturedBytes: pending.capturedBytes,
      targetCount: pending.mode === 'scoped' ? pending.targets.length : 1,
      patchCount: forward.length,
      storedBytes: patchByteSize(forward) + patchByteSize(inverse),
      objectIds: patchObjectIds([...forward, ...inverse])
    });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.app.markDirty?.();
    this.app.updateHistoryUI?.();
    return true;
  }

  applyEntryPatches(patches) {
    const document = applyPatches(this.app.doc, patches);
    this.metrics.inPlaceApplies++;
    this.app.replaceDocument?.(document, { fromHistory: true, skipSanitize: true });
  }

  cancel({ restore = false } = {}) {
    if (restore && this.pending) {
      if (this.pending.mode === 'scoped') {
        const { inverse } = scopedPatchPair(this.pending.beforeTargets, this.app.doc);
        this.applyEntryPatches(inverse);
      } else {
        this.app.replaceDocument?.(this.pending.before, { fromHistory: true });
      }
    }
    this.pending = null;
    this.app.updateHistoryUI?.();
  }

  push(label, operation, options = {}) {
    this.begin(label, options);
    try {
      operation();
      this.commit();
    } catch (error) {
      this.cancel({ restore: true });
      throw error;
    }
  }

  pushScoped(label, targets, operation) {
    return this.push(label, operation, { targets });
  }

  undo() {
    if (this.pending) this.commit();
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.applyEntryPatches(entry.inverse);
    this.redoStack.push(entry);
    this.app.toast?.(`復原：${entry.label}`);
    this.app.updateHistoryUI?.();
    return true;
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.applyEntryPatches(entry.forward);
    this.undoStack.push(entry);
    this.app.toast?.(`重做：${entry.label}`);
    this.app.updateHistoryUI?.();
    return true;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.pending = null;
    this.app.updateHistoryUI?.();
  }

  stats() {
    const entries = [...this.undoStack, ...this.redoStack];
    const scopedEntries = entries.filter(entry => entry.captureMode === 'scoped').length;
    const fullEntries = entries.filter(entry => entry.captureMode !== 'scoped').length;
    return {
      undo: this.undoStack.length,
      redo: this.redoStack.length,
      limit: this.limit,
      patchCount: entries.reduce((sum, entry) => sum + entry.patchCount, 0),
      storedBytes: entries.reduce((sum, entry) => sum + entry.storedBytes, 0),
      capturedBytes: entries.reduce((sum, entry) => sum + (entry.capturedBytes || 0), 0),
      scopedEntries,
      fullEntries,
      scopedRatio: entries.length ? scopedEntries / entries.length : 0,
      metrics: { ...this.metrics },
      mode: 'hybrid-target-scoped-id-aware-patches'
    };
  }
}
