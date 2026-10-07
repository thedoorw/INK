import { createUnifiedStroke, editUnifiedStroke, migrateUnifiedStroke, strokeHash, transformUnifiedStroke } from './stroke-model.js';
import { BrushPresetRegistry, compileBrushStroke } from './brush-engine.js';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const now = () => new Date().toISOString();

export const STROKE_SESSION_FORMAT = 'INK-STROKE-SESSION';
export const STROKE_SESSION_VERSION = 2;

export function createStrokeSession(options = {}) {
  const seed = Number(options.seed ?? 1) >>> 0;
  return {
    format: STROKE_SESSION_FORMAT, schemaVersion: STROKE_SESSION_VERSION,
    id: String(options.id || `session-${strokeHash({ seed, name: options.name || 'Stroke Session' })}`),
    name: options.name || 'Stroke Session', seed, status: options.status || 'idle',
    createdAt: options.createdAt || now(), finishedAt: options.finishedAt || null,
    documentState: clone(options.documentState || {}), layerState: clone(options.layerState || []),
    brushState: clone(options.brushState || { brushId: 'ink' }), colorState: clone(options.colorState || { color: '#202020' }),
    strokes: (options.strokes || []).map((stroke, index) => migrateUnifiedStroke({ ...stroke, index })),
    events: clone(options.events || []), masks: clone(options.masks || []), blendState: clone(options.blendState || {}),
    dependencies: clone(options.dependencies || []), intermediateStates: clone(options.intermediateStates || []),
    finalOutput: clone(options.finalOutput || null), breakpoints: clone(options.breakpoints || []),
    cursor: Number(options.cursor || 0), timing: clone(options.timing || { elapsedMs: 0, pauses: [] }),
    history: clone(options.history || { undo: [], redo: [] }), metadata: clone(options.metadata || {})
  };
}

export function migrateStrokeSession(raw = {}) {
  if (raw.format !== STROKE_SESSION_FORMAT) throw new Error('INK_STROKE_SESSION_INVALID');
  const migrated = createStrokeSession({
    ...raw, schemaVersion: STROKE_SESSION_VERSION,
    strokes: raw.strokes || [],
    events: raw.events || [],
    metadata: { ...(raw.metadata || {}), ...(raw.schemaVersion === STROKE_SESSION_VERSION ? {} : { migratedFrom: raw.schemaVersion || 1 }) }
  });
  migrated.status = raw.status || 'complete';
  migrated.deterministicHash = strokeHash({ seed: migrated.seed, strokes: migrated.strokes, events: migrated.events.filter(event => event.type !== 'pause' && event.type !== 'resume') });
  return migrated;
}

function event(session, type, data = {}) {
  const item = { sequence: session.events.length, type, timestamp: Number(data.timestamp ?? session.timing.elapsedMs), ...clone(data) };
  session.events.push(item);
  session.cursor = session.events.length;
  return item;
}

function snapshot(session, label) {
  const value = { label, eventIndex: session.events.length, strokeCount: session.strokes.length, hash: strokeHash(session.strokes), state: { brushState: clone(session.brushState), colorState: clone(session.colorState), layerState: clone(session.layerState), blendState: clone(session.blendState) } };
  session.intermediateStates.push(value);
  return value;
}

export class StrokeSessionRecorder {
  constructor(options = {}) {
    this.registry = options.registry || new BrushPresetRegistry();
    this.session = createStrokeSession({ ...options, status: 'recording' });
    this.active = null;
    this.startedAt = Number(options.clockStart || 0);
    event(this.session, 'recording-start', { timestamp: 0 });
  }
  record(type, data = {}) { return event(this.session, type, data); }
  pause(timestamp = this.session.timing.elapsedMs) { if (this.session.status !== 'recording') throw new Error('INK_SESSION_NOT_RECORDING'); this.session.status = 'paused'; this.session.timing.pauses.push({ start: timestamp, end: null }); return this.record('pause', { timestamp }); }
  resume(timestamp = this.session.timing.elapsedMs) { if (this.session.status !== 'paused') throw new Error('INK_SESSION_NOT_PAUSED'); this.session.status = 'recording'; const pause = this.session.timing.pauses.at(-1); if (pause) pause.end = timestamp; return this.record('resume', { timestamp }); }
  setBrush(brushId, timestamp) { this.registry.get(brushId); this.session.brushState.brushId = brushId; return this.record('brush-change', { brushId, timestamp }); }
  setColor(color, timestamp) { this.session.colorState.color = color; return this.record('color-change', { color, timestamp }); }
  setLayer(layerId, state = {}, timestamp) { this.session.layerState = this.session.layerState.filter(layer => layer.id !== layerId).concat({ id: layerId, ...clone(state) }); return this.record('layer-state', { layerId, state, timestamp }); }
  setMask(mask, timestamp) { this.session.masks.push(clone(mask)); return this.record('mask', { maskId: mask.id, state: clone(mask), timestamp }); }
  setBlend(blendMode, opacity = 1, timestamp) { this.session.blendState = { blendMode, opacity }; return this.record('blend', { blendMode, opacity, timestamp }); }
  checkpoint(label = `state-${this.session.intermediateStates.length + 1}`) { return snapshot(this.session, label); }
  beginStroke(options = {}) {
    if (this.session.status !== 'recording') throw new Error('INK_SESSION_NOT_RECORDING');
    if (this.active) throw new Error('INK_STROKE_ALREADY_ACTIVE');
    const brushId = options.brushId || this.session.brushState.brushId || 'ink'; this.registry.get(brushId);
    const id = options.id || `${this.session.id}-stroke-${String(this.session.strokes.length + 1).padStart(5, '0')}`;
    this.active = { ...options, id, brushId, layerId: options.layerId || this.session.layerState.at(-1)?.id || 'layer-1', color: options.color || this.session.colorState.color || '#202020', seed: options.seed ?? (this.session.seed + this.session.strokes.length), samples: [] };
    this.record('stroke-begin', { strokeId: id, brushId, layerId: this.active.layerId, color: this.active.color, timestamp: options.timestamp });
    return id;
  }
  addSample(sample) { if (!this.active) throw new Error('INK_STROKE_NOT_ACTIVE'); this.active.samples.push(clone(sample)); this.session.timing.elapsedMs = Math.max(this.session.timing.elapsedMs, Number(sample.timestamp ?? sample.time ?? sample.t ?? 0)); return sample; }
  endStroke(options = {}) {
    if (!this.active) throw new Error('INK_STROKE_NOT_ACTIVE');
    if (this.active.samples.length < 2) throw new Error('INK_STROKE_REQUIRES_TWO_SAMPLES');
    const stroke = createUnifiedStroke({ ...this.active, replayMetadata: { sourceFormat: 'INK_SESSION', sessionId: this.session.id, eventRange: [this.session.events.length - 1, this.session.events.length] } });
    this.session.strokes.push(stroke); this.record('stroke-end', { strokeId: stroke.id, sampleCount: stroke.samples.length, timestamp: options.timestamp ?? stroke.samples.at(-1).timestamp });
    this.active = null; return clone(stroke);
  }
  erase(data = {}) { return this.record('erase', data); }
  smudge(data = {}) { return this.record('smudge', data); }
  transform(strokeIds, matrix, timestamp) { return this.record('transform', { strokeIds: [...strokeIds], matrix: [...matrix], timestamp }); }
  undo(timestamp) { return this.record('undo', { timestamp }); }
  redo(timestamp) { return this.record('redo', { timestamp }); }
  finish(metadata = {}) {
    if (this.active) this.endStroke();
    if (this.session.status === 'paused') this.resume(this.session.timing.elapsedMs);
    this.session.status = 'complete'; this.session.finishedAt = now(); this.session.metadata = { ...this.session.metadata, ...clone(metadata) };
    snapshot(this.session, 'final'); this.record('recording-end', { timestamp: this.session.timing.elapsedMs });
    this.session.deterministicHash = strokeHash({ seed: this.session.seed, strokes: this.session.strokes, events: this.session.events.filter(item => !['pause','resume'].includes(item.type)) });
    return clone(this.session);
  }
}

function makeReport(session, compiled, options, started, state) {
  const sourceHash = session.deterministicHash || strokeHash({ seed: session.seed, strokes: session.strokes });
  const replayHash = strokeHash(compiled.map(item => item.replayHash));
  return {
    format: 'INK-STROKE-REPLAY-REPORT', schemaVersion: 2, id: `${session.id}-replay-${replayHash}`,
    sessionId: session.id, status: 'COMPLETED', speed: options.speed || 1,
    fromStroke: options.fromStroke || null, toStroke: options.toStroke || null,
    strokeCount: compiled.length, sampleCount: compiled.reduce((sum, item) => sum + item.dabs.length, 0),
    sourceHash, replayHash, deterministic: options.fixedSeed !== false,
    substitutions: { brush: clone(options.brushOverrides || {}), color: clone(options.colorOverrides || {}) },
    partial: Boolean(options.strokeIds || options.fromStroke || options.toStroke), elapsedMs: Date.now() - started,
    rollback: { attempted: false, succeeded: null }, state
  };
}

export function replayStrokeSession(rawSession, options = {}) {
  const session = migrateStrokeSession(rawSession), registry = options.registry || new BrushPresetRegistry(), started = Date.now();
  const ids = options.strokeIds ? new Set(options.strokeIds) : null;
  const start = options.fromStroke ? Math.max(0, session.strokes.findIndex(stroke => stroke.id === options.fromStroke)) : 0;
  const endFound = options.toStroke ? session.strokes.findIndex(stroke => stroke.id === options.toStroke) : session.strokes.length - 1;
  const end = endFound < 0 ? session.strokes.length - 1 : endFound;
  const breakpoint = options.breakpoint || null;
  const compiled = [], state = { brushId: null, color: null, eventIndex: 0 };
  try {
    for (let index = start; index <= end; index += 1) {
      const stroke = session.strokes[index]; if (ids && !ids.has(stroke.id)) continue;
      if (breakpoint && (breakpoint === stroke.id || breakpoint === index)) break;
      const brushId = options.brushOverrides?.[stroke.id] || options.brushOverrides?.[stroke.brushId] || stroke.brushId;
      const color = options.colorOverrides?.[stroke.id] || options.colorOverrides?.[stroke.color] || stroke.color;
      const compiledStroke = compileBrushStroke(stroke, registry.get(brushId), { color, seed: options.fixedSeed === false ? (stroke.seed + Date.now()) >>> 0 : stroke.seed });
      compiled.push(compiledStroke); state.brushId = brushId; state.color = color; state.eventIndex++;
      if (typeof options.onStroke === 'function') options.onStroke(compiledStroke, index);
      if (options.failAtStroke === index || options.failAtStroke === stroke.id) throw new Error(`INK_REPLAY_INJECTED_FAILURE:${stroke.id}`);
    }
    const report = makeReport(session, compiled, options, started, state);
    return { format: 'INK-STROKE-REPLAY', schemaVersion: 2, sessionId: session.id, strokes: compiled, report, replayHash: report.replayHash };
  } catch (error) {
    const report = makeReport(session, compiled, options, started, state);
    report.status = 'EXECUTION FAILED'; report.error = String(error.message || error); report.rollback = { attempted: true, succeeded: true, restoredHash: strokeHash(session.strokes) };
    if (options.throwOnFailure !== false) { const failure = new Error(report.error); failure.report = report; throw failure; }
    return { format: 'INK-STROKE-REPLAY', schemaVersion: 2, sessionId: session.id, strokes: [], report, replayHash: null };
  }
}

function mutation(session, label, apply) {
  session.history = session.history || { undo: [], redo: [] };
  session.history.undo.push({ label, strokes: clone(session.strokes), eventsLength: session.events.length });
  session.history.redo.length = 0; apply(); event(session, label); session.deterministicHash = strokeHash({ seed: session.seed, strokes: session.strokes }); return session;
}

export function selectSessionStrokes(session, predicate) { const ids = []; session.strokes.forEach(stroke => { stroke.selected = typeof predicate === 'function' ? Boolean(predicate(stroke)) : Array.isArray(predicate) ? predicate.includes(stroke.id) : Boolean(predicate); if (stroke.selected) ids.push(stroke.id); }); return ids; }
export function deleteSessionStrokes(session, ids) { const set = new Set(ids), before = session.strokes.length; mutation(session, 'stroke-delete', () => { session.strokes = session.strokes.filter(stroke => !set.has(stroke.id)); }); return before - session.strokes.length; }
export function recolorSessionStrokes(session, ids, color) { const set = new Set(ids); return mutation(session, 'stroke-recolor', () => session.strokes.forEach(stroke => { if (set.has(stroke.id)) editUnifiedStroke(stroke, { color }); })); }
export function setSessionStrokeOpacity(session, ids, opacity) { const set = new Set(ids); return mutation(session, 'stroke-opacity', () => session.strokes.forEach(stroke => { if (set.has(stroke.id)) editUnifiedStroke(stroke, { opacity }); })); }
export function replaceSessionStrokeBrush(session, ids, brushId) { const set = new Set(ids); return mutation(session, 'stroke-brush-replace', () => session.strokes.forEach(stroke => { if (set.has(stroke.id)) editUnifiedStroke(stroke, { brushId }); })); }
export function transformSessionStrokes(session, ids, matrix) { const set = new Set(ids); return mutation(session, 'stroke-transform', () => session.strokes.forEach(stroke => { if (set.has(stroke.id)) transformUnifiedStroke(stroke, matrix); })); }
export function undoSessionEdit(session) { const item = session.history?.undo?.pop(); if (!item) return false; session.history.redo.push({ label: item.label, strokes: clone(session.strokes), eventsLength: session.events.length }); session.strokes = item.strokes; session.events.length = item.eventsLength; session.deterministicHash = strokeHash({ seed: session.seed, strokes: session.strokes }); return true; }
export function redoSessionEdit(session) { const item = session.history?.redo?.pop(); if (!item) return false; session.history.undo.push({ label: item.label, strokes: clone(session.strokes), eventsLength: session.events.length }); session.strokes = item.strokes; session.events.length = item.eventsLength; session.deterministicHash = strokeHash({ seed: session.seed, strokes: session.strokes }); return true; }

