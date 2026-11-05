import { deepClone } from '../core/index.js';
import { applyPatches, createPatchPair, patchByteSize, patchObjectIds } from './diff.js';
import { collectLinkedRepeatDependencies, synchronizeLinkedRepeatDependencies } from './repeat-source-sync.js';
import { inspectDocument, documentFingerprint } from '../document/integrity.js';
import { sanitizeDocument } from '../document/migration.js';
import { packPortableStates, unpackPortableStates, PORTABLE_HISTORY_V2 } from './portable-codec.js';
import { encodePortableHistoryBundle, decodePortableHistoryBundle } from './portable-lz4.js';

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

  exportPortable(document = this.app.doc) {
    if (this.pending) throw new Error('INK_HISTORY_BUSY');
    const clean = value => { const copy=deepClone(value);delete copy.inkSessionHistory;delete copy.inkSessionLink;return copy; };
    let past=clean(document),future=clean(document);
    const states=[past];
    for(let i=this.undoStack.length-1;i>=0;i--){past=applyPatches(deepClone(past),this.undoStack[i].inverse);states.unshift(past);}
    for(const entry of [...this.redoStack].reverse()){future=applyPatches(deepClone(future),entry.forward);states.push(future);}
    let payload={schema:'INK_NATIVE_HISTORY_CHECKPOINTS_V1',documentId:document.id,applied:this.undoStack.length,
      // Keep transport checkpoints in their actual validated Native shape.
      // Normalization happens inside portableEntries, before safe patch regeneration;
      // eagerly normalizing every snapshot may multiply source rasters/path defaults
      // beyond the same 8 MiB network/storage ceiling without adding fidelity.
      limit:this.limit,labels:this.timeline().entries.map(x=>String(x.label).slice(0,256)),states};
    // Keep old V1 checkpoints for small Native files. Raster-heavy documents
    // are losslessly compacted into explicitly versioned V2 when necessary,
    // without raising the 8 MiB portable transport limit.
    const uncompressedBytes=new TextEncoder().encode(JSON.stringify(payload)).byteLength;
    if(uncompressedBytes>8*1024*1024){
      payload.schema=PORTABLE_HISTORY_V2;
      const packed=packPortableStates(states);payload.states=packed.states;payload.keyTable=packed.keyTable;
      if(new TextEncoder().encode(JSON.stringify(payload)).byteLength>8*1024*1024){
        // A second, deterministic lossless block layer is necessary for
        // large vector documents after the normal migration of path defaults.
        payload.compressedStates=encodePortableHistoryBundle(packed);
        payload.states=[];delete payload.keyTable;
      }
    }
    // Validate exports through the exact same bounded parser used for remote input.
    this.portableEntries(payload,document);
    return payload;
  }

  portableEntries(payload,document=this.app.doc) {
    const fail=()=>{throw new Error('INK_HISTORY_CHECKPOINT_INVALID');};
    if(!payload||new TextEncoder().encode(JSON.stringify(payload)).byteLength>8*1024*1024)fail();
    let nodes=0;
    // Count only traversable containers: large Native RGBA byte arrays consist of
    // scalar pixels, already bounded by the 8 MiB serialized payload check.
    // Preserve the 200k object/array node and depth limits for hostile structures.
    const safe=(value,depth=0)=>{if(value===null||typeof value!=='object')return;if(++nodes>(payload.schema===PORTABLE_HISTORY_V2?400000:200000)||depth>64)fail();for(const [key,item]of Object.entries(value)){if(['__proto__','prototype','constructor','inkSessionHistory'].includes(key))fail();safe(item,depth+1);}};
    safe(payload);
    const {labels,applied}=payload;
    const compressed=payload.schema===PORTABLE_HISTORY_V2&&payload.compressedStates;
    if(compressed&&(payload.states?.length!==0||payload.keyTable!==undefined))fail();
    const bundle=compressed?decodePortableHistoryBundle(payload.compressedStates):null;
    const states=bundle?bundle.states:payload.states;
    const keyTable=bundle?bundle.keyTable:payload.keyTable;
    if(!['INK_NATIVE_HISTORY_CHECKPOINTS_V1',PORTABLE_HISTORY_V2].includes(payload.schema)||payload.documentId!==document?.id||
      ![20,30,50].includes(payload.limit)||!Array.isArray(states)||states.length<1||states.length>payload.limit+1||
      !Array.isArray(labels)||labels.length!==states.length-1||labels.some(s=>typeof s!=='string'||s.length>256)||
      !Number.isSafeInteger(applied)||applied<0||applied>=states.length)fail();
    // Preserve bounded original Native state shapes for patch reconstruction.
    // Eagerly migrating every historical checkpoint expands raster-derived
    // defaults and makes a valid <8 MiB saved History fail on the very next
    // autosave after reopen. Boundary fingerprints are still compared after
    // canonical migration; all source states independently pass integrity.
    const decodedStates=payload.schema===PORTABLE_HISTORY_V2?unpackPortableStates(states,keyTable):states;
    const normalized=decodedStates.map(value=>{if(value?.id!==document.id||!inspectDocument(value).passed)fail();return deepClone(value);});
    const current=deepClone(document);delete current.inkSessionHistory;delete current.inkSessionLink;
    if(documentFingerprint(sanitizeDocument(normalized[applied]))!==documentFingerprint(sanitizeDocument(current)))fail();
    // Diff the current boundary against the actual live document shape. Migration
    // may add derived semantic nodes absent in an older/raw current document.
    normalized[applied]=current;
    return normalized.slice(1).map((value,i)=>{
      const pair=createPatchPair(normalized[i],value);
      return{label:labels[i],...pair,captureMode:'full',capturedBytes:0,targetCount:1,patchCount:pair.forward.length,
        storedBytes:patchByteSize(pair.forward)+patchByteSize(pair.inverse),objectIds:patchObjectIds([...pair.forward,...pair.inverse])};
    });
  }

  restorePortable(payload,{document=this.app.doc}={}) {
    if(this.pending)throw new Error('INK_HISTORY_BUSY');
    const entries=this.portableEntries(payload,document);
    // Only native-generated patches enter this HistoryManager, never remote patches.
    this.undoStack=entries.slice(0,payload.applied);
    this.redoStack=entries.slice(payload.applied).reverse();
    this.limit=payload.limit;
    this.app.updateHistoryUI?.();
    return true;
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
    const requestedTargets = normalizeTargets(targets);
    const linkedRepeats = collectLinkedRepeatDependencies(this.app.doc, requestedTargets);
    // Capture both original source and linked generator in a single Undo/Redo.
    const normalizedTargets = requestedTargets
      ? normalizeTargets([...requestedTargets, ...linkedRepeats.map(pair => pair.repeatPath)])
      : null;
    if (normalizedTargets) {
      const beforeTargets = snapshotTargets(this.app.doc, normalizedTargets);
      const capturedBytes = snapshotByteSize(beforeTargets);
      this.pending = { label, mode: 'scoped', targets: normalizedTargets, beforeTargets, capturedBytes, linkedRepeats };
      this.metrics.scopedBegins++;
      this.metrics.scopedCapturedBytes += capturedBytes;
    } else {
      const before = deepClone(this.app.doc);
      const capturedBytes = snapshotByteSize(before);
      this.pending = { label, mode: 'full', before, capturedBytes, linkedRepeats };
      this.metrics.fullBegins++;
      this.metrics.fullCapturedBytes += capturedBytes;
    }
    return true;
  }

  commit() {
    if (!this.pending) return false;
    const pending = this.pending;
    synchronizeLinkedRepeatDependencies(this.app.doc, pending.linkedRepeats, this.app);
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
