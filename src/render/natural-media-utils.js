import { clamp } from '../core/index.js';
import { sampleStrokePath } from '../stroke/index.js';

export const NATURAL_MEDIA_KINDS = Object.freeze(['brush', 'drybrush', 'airbrush']);
export const NATURAL_MEDIA_MIXER_KINDS = Object.freeze(['blender', 'smudge']);
export const NATURAL_MEDIA_RUN_KINDS = Object.freeze([...NATURAL_MEDIA_KINDS, ...NATURAL_MEDIA_MIXER_KINDS]);
export const NATURAL_MEDIA_SURFACE_REVISION = 'WP8A-2';
const NATURAL_MEDIA_KIND_SET = new Set(NATURAL_MEDIA_KINDS);
const NATURAL_MEDIA_MIXER_KIND_SET = new Set(NATURAL_MEDIA_MIXER_KINDS);
const NATURAL_MEDIA_RUN_KIND_SET = new Set(NATURAL_MEDIA_RUN_KINDS);
const TAU = Math.PI * 2;

export function isNaturalMediaStroke(stroke) {
  return Boolean(stroke && stroke.type === 'stroke' && NATURAL_MEDIA_KIND_SET.has(stroke.kind));
}

export function isNaturalMediaMixerStroke(stroke) {
  return Boolean(stroke && stroke.type === 'stroke' && NATURAL_MEDIA_MIXER_KIND_SET.has(stroke.kind));
}

export function isNaturalMediaRunStroke(stroke) {
  return Boolean(stroke && stroke.type === 'stroke' && NATURAL_MEDIA_RUN_KIND_SET.has(stroke.kind));
}

export function strokeWidthForMedia(stroke, point, index, count) {
  const pressure = clamp(point?.p ?? .5, .02, 1);
  const pressureInfluence = clamp(stroke.pressure ?? .8, 0, 1);
  let width = Math.max(.25, stroke.size || 2) * ((1 - pressureInfluence) + pressure * pressureInfluence);
  const taper = clamp(stroke.taper ?? 0, 0, 1);
  if (taper > 0 && count > 1) {
    const position = index / Math.max(1, count - 1);
    const endFactor = Math.min(1, position * 7, (1 - position) * 7);
    width *= 1 - taper * (1 - endFactor) * .82;
  }
  return Math.max(.25, width);
}

function naturalMediaFnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mix32(value) {
  let x = value >>> 0;
  x ^= x >>> 16;x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

export function naturalMediaSeed(strokeOrSeed = 0) {
  if (Number.isFinite(+strokeOrSeed)) return Math.trunc(+strokeOrSeed) >>> 0;
  const stroke = strokeOrSeed || {};
  if (Number.isFinite(+stroke.seed)) return Math.trunc(+stroke.seed) >>> 0;
  return naturalMediaFnv1a32(`${stroke.id || ''}|${stroke.kind || ''}|${stroke.color || ''}`);
}

export function deterministicNaturalMediaUnit(seed, index = 0, salt = 0) {
  return mix32((naturalMediaSeed(seed) + Math.imul(index + 1, 0x9e3779b1) + Math.imul(salt + 17, 0x85ebca6b)) >>> 0) / 4294967295;
}

function mediaSmoothstep(value) { return value * value * (3 - 2 * value); }
function mediaLerp(a, b, t) { return a + (b - a) * t; }
function mediaHashGrid(x, y, seed) { return deterministicNaturalMediaUnit(seed, Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663), 97); }
function mediaValueNoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = mediaSmoothstep(x - x0), ty = mediaSmoothstep(y - y0);
  const a = mediaHashGrid(x0, y0, seed), b = mediaHashGrid(x0 + 1, y0, seed);
  const c = mediaHashGrid(x0, y0 + 1, seed), d = mediaHashGrid(x0 + 1, y0 + 1, seed);
  return mediaLerp(mediaLerp(a, b, tx), mediaLerp(c, d, tx), ty);
}

/** Continuous canvas-coordinate field. It never restarts at an individual stamp. */
export function naturalMediaGrainAt(worldX, worldY, seed = 0) {
  const low = mediaValueNoise(worldX * .018, worldY * .018, seed + 31);
  const mid = mediaValueNoise(worldX * .061, worldY * .061, seed + 97);
  const high = mediaValueNoise(worldX * .143, worldY * .143, seed + 211);
  return clamp(low * .52 + mid * .34 + high * .14, 0, 1);
}

export function removeDuplicateNaturalMediaPoints(points = [], epsilon = .02) {
  const result = [];
  for (const raw of points) {
    if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) continue;
    const point = { ...raw, p: clamp(Number.isFinite(raw.p) ? raw.p : .5, .02, 1) };
    const previous = result[result.length - 1];
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) <= epsilon) {
      result[result.length - 1] = { ...previous, ...point, x: previous.x, y: previous.y };
      continue;
    }
    result.push(point);
  }
  return result;
}

function interpolateNaturalMediaPoint(a, b, t) {
  const number = (key, fallback = 0) => {
    const av = Number.isFinite(a?.[key]) ? a[key] : fallback;
    const bv = Number.isFinite(b?.[key]) ? b[key] : av;
    return mediaLerp(av, bv, t);
  };
  return { x: number('x'), y: number('y'), p: number('p', .5), tiltX: number('tiltX'), tiltY: number('tiltY'), t: number('t') };
}

function naturalMediaCumulativeLengths(points) {
  const cumulative = new Float64Array(points.length);
  for (let index = 1; index < points.length; index++) cumulative[index] = cumulative[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  return cumulative;
}

function naturalMediaPointAtDistance(points, cumulative, distance) {
  const total = cumulative[cumulative.length - 1] || 0;
  const target = clamp(distance, 0, total);
  let low = 0, high = cumulative.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (cumulative[middle] < target) low = middle; else high = middle;
  }
  const start = cumulative[low], end = cumulative[high];
  const ratio = end > start ? (target - start) / (end - start) : 0;
  return interpolateNaturalMediaPoint(points[low], points[high], ratio);
}

function naturalMediaTangentAtDistance(points, cumulative, distance, radius) {
  const total = cumulative[cumulative.length - 1] || 0;
  const a = naturalMediaPointAtDistance(points, cumulative, Math.max(0, distance - radius));
  const b = naturalMediaPointAtDistance(points, cumulative, Math.min(total, distance + radius));
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
}

function naturalMediaAngleBetween(a, b) {
  return Math.acos(clamp(a.x * b.x + a.y * b.y, -1, 1));
}

export function resampleNaturalMediaPath(stroke, {
  maxSamples = 8192,
  minimumSpacing = .42,
  maximumSpacing = null
} = {}) {
  if (!isNaturalMediaRunStroke(stroke) || !stroke.points?.length) return [];
  const size = Math.max(.25, stroke.size || 2);
  const denseStep = Math.max(.32, Math.min(2.2, size * .055));
  const dense = removeDuplicateNaturalMediaPoints(stroke.points.length > 1 ? sampleStrokePath(stroke, denseStep) : stroke.points);
  if (dense.length <= 1) return dense.map((point, index) => ({ ...point, arcLength: 0, tangentX: 1, tangentY: 0, curvature: 0, speed: 0, sourceIndex: index }));
  const cumulative = naturalMediaCumulativeLengths(dense), total = cumulative[cumulative.length - 1];
  if (total <= .0001) return [{ ...dense[0], arcLength: 0, tangentX: 1, tangentY: 0, curvature: 0, speed: 0, sourceIndex: 0 }];
  const seed = naturalMediaSeed(stroke);
  const baseFactor = stroke.kind === 'airbrush' ? .145 : stroke.kind === 'drybrush' ? .105 : .115;
  const maxSpacing = maximumSpacing ?? Math.max(1.1, size * .34);
  const result = [];
  let distance = 0, guard = 0;
  while (distance < total && result.length < maxSamples && guard++ < maxSamples * 3) {
    const point = naturalMediaPointAtDistance(dense, cumulative, distance);
    const width = strokeWidthForMedia(stroke, point, Math.round(distance / total * 1000), 1001);
    const probe = Math.max(.7, width * .34);
    const before = naturalMediaTangentAtDistance(dense, cumulative, distance - probe, probe * .65);
    const after = naturalMediaTangentAtDistance(dense, cumulative, distance + probe, probe * .65);
    const tangent = naturalMediaTangentAtDistance(dense, cumulative, distance, probe * .55);
    const curvature = naturalMediaAngleBetween(before, after) / Math.PI;
    const previous = result[result.length - 1];
    const dt = previous && Number.isFinite(point.t) && Number.isFinite(previous.t) ? Math.max(.1, point.t - previous.t) : 1;
    const segmentDistance = previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0;
    const speed = segmentDistance / dt;
    result.push({ ...point, arcLength: distance, tangentX: tangent.x, tangentY: tangent.y, curvature, speed, sourceIndex: result.length });
    const pressureFactor = mediaLerp(1.12, .88, clamp(point.p ?? .5, .02, 1));
    const speedFactor = clamp(.94 + Math.min(1, speed / Math.max(.5, size)) * .16, .9, 1.12);
    // At sharp turns increase separation slightly so overlapping elliptical tips do not create dark knots.
    const turnFactor = 1 + curvature * .72;
    const jitter = mediaLerp(.88, 1.12, deterministicNaturalMediaUnit(seed, result.length, 13));
    const spacing = clamp(width * baseFactor * pressureFactor * speedFactor * turnFactor * jitter, minimumSpacing, maxSpacing);
    distance += Math.max(minimumSpacing, spacing);
  }
  const last = dense[dense.length - 1];
  if (!result.length || Math.hypot(result[result.length - 1].x - last.x, result[result.length - 1].y - last.y) > minimumSpacing * .58) {
    const tangent = naturalMediaTangentAtDistance(dense, cumulative, total, Math.max(.6, size * .18));
    result.push({ ...last, arcLength: total, tangentX: tangent.x, tangentY: tangent.y, curvature: 0, speed: 0, sourceIndex: result.length });
  }
  return result;
}

export function buildBristleClusters(stroke, { maximum = 26 } = {}) {
  const bristle = clamp(stroke?.bristle ?? (stroke?.kind === 'drybrush' ? .72 : .18), 0, 1);
  const width = Math.max(.25, stroke?.size || 2);
  const count = clamp(Math.round(2 + Math.sqrt(width) * (1.1 + bristle * 1.8)), 2, maximum);
  const seed = naturalMediaSeed(stroke);
  const clusters = [];
  for (let index = 0; index < count; index++) {
    // Sum two uniforms to cluster around the center without equal spacing.
    const centered = (deterministicNaturalMediaUnit(seed, index, 211) + deterministicNaturalMediaUnit(seed, index, 223) - 1) * .5;
    const dropout = clamp(.06 + bristle * .22 + deterministicNaturalMediaUnit(seed, index, 227) * .18, 0, .46);
    clusters.push({
      offset: centered,
      widthScale: mediaLerp(.012, .038, deterministicNaturalMediaUnit(seed, index, 229)) * (1.15 - bristle * .35),
      opacity: mediaLerp(.055, .19, deterministicNaturalMediaUnit(seed, index, 233)),
      phase: deterministicNaturalMediaUnit(seed, index, 239) * TAU,
      waviness: mediaLerp(.012, .08, deterministicNaturalMediaUnit(seed, index, 241)),
      dropout,
      seed: deterministicNaturalMediaUnit(seed, index, 251)
    });
  }
  return clusters.sort((a, b) => a.offset - b.offset);
}

export function sourceOverCoverage(previous, added) {
  const a = clamp(previous, 0, 1), b = clamp(added, 0, 1);
  return a + b * (1 - a);
}

export function premultiplyMediaRGBA(rgba) {
  const alpha = clamp(rgba?.[3] ?? 1, 0, 1);
  return [clamp(rgba?.[0] ?? 0, 0, 1) * alpha, clamp(rgba?.[1] ?? 0, 0, 1) * alpha, clamp(rgba?.[2] ?? 0, 0, 1) * alpha, alpha];
}

export function buildNaturalMediaStamps(stroke, { maxStamps = 8192 } = {}) {
  const points = resampleNaturalMediaPath(stroke, { maxSamples: maxStamps });
  if (!points.length) return { stamps: [], bounds: null };
  const bristle = clamp(stroke.bristle ?? (stroke.kind === 'drybrush' ? .72 : .18), 0, 1);
  const wetness = clamp(stroke.wetness ?? 0, 0, 1);
  const softness = clamp(stroke.softness ?? .72, .05, 1);
  const seedBase = naturalMediaSeed(stroke);
  const stamps = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const width = strokeWidthForMedia(stroke, point, index, points.length);
    const tilt = Math.min(1, Math.hypot(point.tiltX || 0, point.tiltY || 0) / 90);
    const shapeA = deterministicNaturalMediaUnit(seedBase, index, 311), shapeB = deterministicNaturalMediaUnit(seedBase, index, 313);
    const rotation = (deterministicNaturalMediaUnit(seedBase, index, 317) - .5) * (.035 + bristle * .075);
    const longAxis = width * (.50 + bristle * .13 + tilt * .1) * mediaLerp(.91, 1.09, shapeA);
    const shortAxis = width * (stroke.kind === 'airbrush' ? .54 : .43 - bristle * .075) * mediaLerp(.9, 1.1, shapeB);
    const radiusX = Math.max(.35, longAxis), radiusY = Math.max(.28, shortAxis);
    const stamp = {
      x: point.x,
      y: point.y,
      radiusX,
      radiusY,
      angle: Math.atan2(point.tangentY || 0, point.tangentX || 1) + rotation,
      pressure: clamp(point.p ?? .5, .02, 1),
      seed: deterministicNaturalMediaUnit(seedBase, index, 331),
      strokeSeed: seedBase,
      wetness,
      grain: clamp(stroke.grain ?? (stroke.kind === 'drybrush' ? .78 : .12), 0, 1),
      bristle,
      softness: clamp(softness * mediaLerp(.9, 1.08, deterministicNaturalMediaUnit(seedBase, index, 337)), .05, 1),
      opacity: mediaLerp(.82, 1, deterministicNaturalMediaUnit(seedBase, index, 347)),
      coverage: mediaLerp(.78, 1, deterministicNaturalMediaUnit(seedBase, index, 349)),
      curvature: point.curvature || 0,
      arcLength: point.arcLength || 0
    };
    stamps.push(stamp);
    const radius = Math.max(radiusX, radiusY) * (1.18 + wetness * .22);
    minX = Math.min(minX, point.x - radius);minY = Math.min(minY, point.y - radius);
    maxX = Math.max(maxX, point.x + radius);maxY = Math.max(maxY, point.y + radius);
  }
  return { stamps, points, bounds: { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) } };
}

export function naturalMediaRasterScale(bounds, preferred = 2, maxDimension = 3072) {
  if (!bounds) return 1;
  const longest = Math.max(1, bounds.w, bounds.h);
  return clamp(Math.min(preferred, maxDimension / longest), .25, preferred);
}

export function normalizeMediaHex(hex = '#202020') {
  const raw = String(hex).replace('#', '').trim();
  const full = raw.length === 3 ? raw.split('').map(char => char + char).join('') : raw.slice(0, 6).padEnd(6, '0');
  return `#${full.toLowerCase()}`;
}

export function mediaHexToRGBA(hex, alpha = 1) {
  const normalized = normalizeMediaHex(hex).slice(1);
  return [
    parseInt(normalized.slice(0, 2), 16) / 255,
    parseInt(normalized.slice(2, 4), 16) / 255,
    parseInt(normalized.slice(4, 6), 16) / 255,
    clamp(alpha, 0, 1)
  ];
}

function fnv1a(text) { return naturalMediaFnv1a32(text).toString(16).padStart(8, '0'); }

export function naturalMediaFingerprint(stroke, scale = 1) {
  const points = (stroke.points || []).map(point => [
    Math.round((point.x || 0) * 20), Math.round((point.y || 0) * 20),
    Math.round((point.p ?? .5) * 100), Math.round(point.tiltX || 0), Math.round(point.tiltY || 0),
    point.mode || '', point.in ? [Math.round(point.in.x * 20), Math.round(point.in.y * 20)] : null,
    point.out ? [Math.round(point.out.x * 20), Math.round(point.out.y * 20)] : null
  ]);
  return fnv1a(JSON.stringify({
    rendererRevision: NATURAL_MEDIA_SURFACE_REVISION,
    id: stroke.id || '', kind: stroke.kind, color: normalizeMediaHex(stroke.color), size: stroke.size,
    opacity: stroke.opacity, pressure: stroke.pressure, taper: stroke.taper, grain: stroke.grain,
    softness: stroke.softness, flow: stroke.flow, wetness: stroke.wetness, bristle: stroke.bristle,
    blend: stroke.blend, smudge: stroke.smudge, drag: stroke.drag,
    seed: stroke.seed ?? null, segmentStyles: stroke.segmentStyles || null, scale: Math.round(scale * 100), points
  }));
}
