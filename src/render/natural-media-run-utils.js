import { clamp, Matrix } from '../core/index.js';
import { buildNaturalMediaStamps, isNaturalMediaRunStroke, isNaturalMediaStroke } from './natural-media-utils.js';

export function normalizeNaturalMediaRunEntry(entry) {
  const stroke = entry?.stroke || entry;
  return { stroke, matrix: entry?.matrix || stroke?.matrix || Matrix.identity(), opacity: clamp(entry?.opacity ?? stroke?.opacity ?? 1, 0, 1) };
}

export function transformNaturalMediaStamp(stamp, matrix) {
  const point = Matrix.point(matrix, stamp);
  const ca = Math.cos(stamp.angle || 0), sa = Math.sin(stamp.angle || 0);
  const vx = matrix[0] * ca + matrix[2] * sa;
  const vy = matrix[1] * ca + matrix[3] * sa;
  const scaleX = Math.hypot(matrix[0], matrix[1]);
  const scaleY = Math.hypot(matrix[2], matrix[3]);
  const scale = Math.max(.0001, (scaleX + scaleY) * .5);
  return { ...stamp, x: point.x, y: point.y, angle: Math.atan2(vy, vx), radiusX: stamp.radiusX * scale, radiusY: stamp.radiusY * scale };
}

export function supportsNaturalMediaRun(entries, { minimum = 2, includeAirbrush = false, includeMixers = false } = {}) {
  const kinds = includeAirbrush ? new Set(['brush', 'drybrush', 'airbrush']) : new Set(['brush', 'drybrush']);
  if (includeMixers) { kinds.add('blender');kinds.add('smudge'); }
  if (!Array.isArray(entries) || entries.length < minimum) return false;
  let depositorCount = 0;
  for (const raw of entries) {
    const stroke = raw?.stroke || raw;
    if (!isNaturalMediaRunStroke(stroke) || !kinds.has(stroke.kind) || (stroke.segmentStyles || []).some(style => style && Object.keys(style).length)) return false;
    if (isNaturalMediaStroke(stroke)) depositorCount++;
  }
  return depositorCount > 0;
}

export function prepareNaturalMediaRun(entries, { maxStampsPerStroke = 4096 } = {}) {
  const prepared = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const rawEntry of entries) {
    const entry = normalizeNaturalMediaRunEntry(rawEntry), stroke = entry.stroke;
    const local = buildNaturalMediaStamps(stroke, { maxStamps: maxStampsPerStroke });
    if (!local.stamps.length) continue;
    const stamps = local.stamps.map(stamp => transformNaturalMediaStamp(stamp, entry.matrix));
    for (const stamp of stamps) {
      const radius = Math.max(stamp.radiusX, stamp.radiusY) * (1.22 + (stroke.wetness ?? 0) * .32);
      minX = Math.min(minX, stamp.x - radius);minY = Math.min(minY, stamp.y - radius);
      maxX = Math.max(maxX, stamp.x + radius);maxY = Math.max(maxY, stamp.y + radius);
    }
    prepared.push({ ...entry, stroke, stamps });
  }
  if (!prepared.length) return { strokes: [], bounds: null };
  return { strokes: prepared, bounds: { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) } };
}
