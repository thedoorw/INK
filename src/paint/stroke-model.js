/* INK unified stroke model v2.
 * The model keeps source pointer evidence separate from derived brush dabs so
 * edits and deterministic replays never destroy the recorded input signal. */

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, finite(value)));

export const STROKE_MODEL_FORMAT = 'INK-STROKE';
export const STROKE_MODEL_VERSION = 2;
export const IDENTITY_TRANSFORM = Object.freeze([1, 0, 0, 1, 0, 0]);

export const STROKE_SAMPLE_FIELDS = Object.freeze([
  'position', 'timestamp', 'pressure', 'tiltX', 'tiltY', 'azimuth', 'altitude',
  'velocity', 'direction', 'size', 'opacity', 'flow', 'spacing', 'scatter',
  'rotation', 'textureCoordinates', 'wetness', 'paintLoad', 'smudge', 'blend',
  'glaze', 'seed'
]);

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function strokeHash(value) {
  let hash = 2166136261;
  for (const character of stable(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function normalizeStrokeTransform(value = IDENTITY_TRANSFORM) {
  return Array.isArray(value) && value.length === 6
    ? value.map((entry, index) => finite(entry, IDENTITY_TRANSFORM[index]))
    : [...IDENTITY_TRANSFORM];
}

export function normalizeStrokeSample(sample = {}, previous = null, index = 0, defaults = {}) {
  const position = sample.position || sample;
  const x = finite(position.x);
  const y = finite(position.y);
  const timestamp = finite(sample.timestamp ?? sample.time ?? sample.t, index * 16);
  const dt = Math.max(1, timestamp - finite(previous?.timestamp, timestamp - 16));
  const dx = x - finite(previous?.position?.x, x);
  const dy = y - finite(previous?.position?.y, y);
  const distance = Math.hypot(dx, dy);
  const tiltX = clamp(sample.tiltX, -90, 90);
  const tiltY = clamp(sample.tiltY, -90, 90);
  const tiltMagnitude = clamp(Math.hypot(tiltX, tiltY), 0, 90);
  const direction = Number.isFinite(Number(sample.direction)) ? Number(sample.direction) : Math.atan2(dy, dx);
  const azimuth = Number.isFinite(Number(sample.azimuth)) ? Number(sample.azimuth) : Math.atan2(tiltY, tiltX);
  return {
    position: { x, y },
    timestamp,
    pressure: clamp(sample.pressure ?? sample.p ?? defaults.pressure ?? .5),
    tiltX,
    tiltY,
    azimuth,
    altitude: clamp(sample.altitude ?? 90 - tiltMagnitude, 0, 90),
    velocity: Math.max(0, finite(sample.velocity, distance / dt)),
    direction,
    size: Math.max(.01, finite(sample.size, defaults.size ?? 1)),
    opacity: clamp(sample.opacity ?? defaults.opacity ?? 1),
    flow: clamp(sample.flow ?? defaults.flow ?? 1),
    spacing: Math.max(.001, finite(sample.spacing, defaults.spacing ?? .1)),
    scatter: clamp(sample.scatter ?? defaults.scatter ?? 0),
    rotation: finite(sample.rotation, direction),
    textureCoordinates: {
      u: finite(sample.textureCoordinates?.u ?? sample.textureU, index),
      v: finite(sample.textureCoordinates?.v ?? sample.textureV, 0)
    },
    wetness: clamp(sample.wetness ?? defaults.wetness ?? 0),
    paintLoad: clamp(sample.paintLoad ?? defaults.paintLoad ?? 1),
    smudge: clamp(sample.smudge ?? defaults.smudge ?? 0),
    blend: clamp(sample.blend ?? defaults.blend ?? 0),
    glaze: clamp(sample.glaze ?? defaults.glaze ?? 0),
    seed: Math.trunc(finite(sample.seed, finite(defaults.seed, 1) + index)) >>> 0,
    pointerType: sample.pointerType || defaults.pointerType || 'pen',
    predicted: Boolean(sample.predicted),
    coalesced: Boolean(sample.coalesced)
    ,preserveWhite: Boolean(sample.preserveWhite)
    ,maskId: sample.maskId || null
    ,scrape: Boolean(sample.scrape)
  };
}

export function strokeBoundingBox(samples = [], transform = IDENTITY_TRANSFORM, padding = 0) {
  const [a, b, c, d, e, f] = normalizeStrokeTransform(transform);
  if (!samples.length) return { x: e, y: f, width: 0, height: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const sample of samples) {
    const point = sample.position || sample;
    const x = a * finite(point.x) + c * finite(point.y) + e;
    const y = b * finite(point.x) + d * finite(point.y) + f;
    const radius = Math.max(0, finite(sample.size, padding * 2) / 2, padding);
    minX = Math.min(minX, x - radius); minY = Math.min(minY, y - radius);
    maxX = Math.max(maxX, x + radius); maxY = Math.max(maxY, y + radius);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function createUnifiedStroke(options = {}) {
  const id = String(options.id || `stroke-${strokeHash({ seed: options.seed ?? 1, index: options.index ?? 0, first: options.samples?.[0] || null })}`);
  const transform = normalizeStrokeTransform(options.transform);
  let previous = null;
  const defaults = {
    pressure: options.pressure, size: options.size, opacity: options.opacity,
    flow: options.flow, spacing: options.spacing, scatter: options.scatter,
    wetness: options.wetness, paintLoad: options.paintLoad, smudge: options.smudge,
    blend: options.blend, glaze: options.glaze, seed: options.seed,
    pointerType: options.pointerType
  };
  const samples = (options.samples || options.points || []).map((sample, index) => {
    const normalized = normalizeStrokeSample(sample, previous, index, defaults);
    previous = normalized;
    return normalized;
  });
  const stroke = {
    format: STROKE_MODEL_FORMAT,
    schemaVersion: STROKE_MODEL_VERSION,
    id,
    brushId: String(options.brushId || options.kind || 'ink'),
    layerId: String(options.layerId || 'layer-1'),
    pointerType: options.pointerType || samples[0]?.pointerType || 'pen',
    color: String(options.color || '#202020'),
    opacity: clamp(options.opacity ?? 1),
    seed: Math.trunc(finite(options.seed, 1)) >>> 0,
    transform,
    samples,
    boundingBox: strokeBoundingBox(samples, transform, finite(options.padding)),
    dependencies: Array.isArray(options.dependencies) ? clone(options.dependencies) : [],
    replayMetadata: {
      deterministic: options.replayMetadata?.deterministic !== false,
      sourceFormat: options.replayMetadata?.sourceFormat || 'INK',
      sourceStrokeId: options.replayMetadata?.sourceStrokeId || id,
      startSample: Math.max(0, Math.trunc(finite(options.replayMetadata?.startSample, 0))),
      endSample: Math.max(0, Math.trunc(finite(options.replayMetadata?.endSample, Math.max(0, samples.length - 1)))),
      ...clone(options.replayMetadata || {})
    },
    selected: Boolean(options.selected),
    metadata: clone(options.metadata || {})
  };
  stroke.contentHash = strokeHash({ ...stroke, contentHash: undefined, selected: undefined });
  return stroke;
}

export function migrateUnifiedStroke(raw = {}, { layerId = 'layer-1' } = {}) {
  if (raw.format === STROKE_MODEL_FORMAT && raw.schemaVersion === STROKE_MODEL_VERSION) return createUnifiedStroke(raw);
  return createUnifiedStroke({
    ...raw,
    id: raw.id,
    brushId: raw.brushId || raw.kind || raw.presetId,
    layerId: raw.layerId || layerId,
    samples: raw.samples || raw.points || [],
    transform: raw.transform || raw.matrix,
    replayMetadata: { sourceFormat: raw.format || 'LEGACY_INK_STROKE', migratedFrom: raw.schemaVersion || 0, ...(raw.replayMetadata || {}) }
  });
}

export function validateUnifiedStroke(stroke) {
  const errors = [];
  if (stroke?.format !== STROKE_MODEL_FORMAT) errors.push('format');
  if (stroke?.schemaVersion !== STROKE_MODEL_VERSION) errors.push('schemaVersion');
  for (const key of ['id', 'brushId', 'layerId', 'pointerType']) if (!stroke?.[key]) errors.push(key);
  if (!Array.isArray(stroke?.samples) || stroke.samples.length < 2) errors.push('samples');
  else stroke.samples.forEach((sample, index) => {
    for (const key of STROKE_SAMPLE_FIELDS) if (sample[key] == null) errors.push(`samples.${index}.${key}`);
  });
  if (!Array.isArray(stroke?.transform) || stroke.transform.length !== 6) errors.push('transform');
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

export function transformUnifiedStroke(stroke, matrix) {
  const [a, b, c, d, e, f] = normalizeStrokeTransform(matrix);
  const [oa, ob, oc, od, oe, of] = normalizeStrokeTransform(stroke.transform);
  stroke.transform = [a * oa + c * ob, b * oa + d * ob, a * oc + c * od, b * oc + d * od, a * oe + c * of + e, b * oe + d * of + f];
  stroke.boundingBox = strokeBoundingBox(stroke.samples, stroke.transform);
  stroke.contentHash = strokeHash({ ...stroke, contentHash: undefined, selected: undefined });
  return stroke;
}

export function editUnifiedStroke(stroke, changes = {}) {
  if (changes.color != null) stroke.color = String(changes.color);
  if (changes.opacity != null) stroke.opacity = clamp(changes.opacity);
  if (changes.brushId != null) stroke.brushId = String(changes.brushId);
  if (changes.layerId != null) stroke.layerId = String(changes.layerId);
  if (changes.transform) transformUnifiedStroke(stroke, changes.transform);
  if (changes.sampleRange) {
    const start = Math.max(0, Math.trunc(finite(changes.sampleRange.start, 0)));
    const end = Math.min(stroke.samples.length - 1, Math.trunc(finite(changes.sampleRange.end, stroke.samples.length - 1)));
    for (let index = start; index <= end; index += 1) Object.assign(stroke.samples[index], clone(changes.sampleRange.values || {}));
  }
  stroke.boundingBox = strokeBoundingBox(stroke.samples, stroke.transform);
  stroke.contentHash = strokeHash({ ...stroke, contentHash: undefined, selected: undefined });
  return stroke;
}

export function cloneUnifiedStroke(stroke, id) {
  return createUnifiedStroke({ ...clone(stroke), id: id || `${stroke.id}-copy`, replayMetadata: { ...stroke.replayMetadata, clonedFrom: stroke.id } });
}
