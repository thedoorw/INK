/* INK Foundation A geometry kernel.
 * External engines are temporary calculators only. Every public result is a
 * plain INK-owned value or Path; no external object may enter document state. */
import { Bezier } from '../vendor/bezier-js-6.1.4/bezier.js';
import { EndType, JoinType, inflatePaths } from '../vendor/clipper2-ts-2.0.1/clipper2.min.mjs';
import { fnv1a32, stableStringify } from '../core/stable-id.js';
import { createAnchor, createPath, flattenSubpath, pathMetrics } from './vector-core.js';

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const identity = () => [1, 0, 0, 1, 0, 0];
const clamp01 = value => Math.max(0, Math.min(1, Number(value)));
const finitePoint = point => point && Number.isFinite(+point.x) && Number.isFinite(+point.y);
const round = (value, digits = 9) => Number(Number(value).toFixed(digits));

function fail(code, details = {}) {
  throw Object.assign(new Error(`INK_GEOMETRY_${code}`), { code, details });
}

function assertPath(path) {
  if (!path || path.type !== 'path' || !Array.isArray(path.subpaths)) fail('PATH_REQUIRED');
  return path;
}

function matrixPoint(matrix, point) {
  const m = Array.isArray(matrix) && matrix.length === 6 ? matrix : identity();
  return { x: m[0] * point.x + m[2] * point.y + m[4], y: m[1] * point.x + m[3] * point.y + m[5] };
}

function segmentAnchors(path, subpathIndex, segmentIndex) {
  assertPath(path);
  const subpath = path.subpaths[subpathIndex];
  if (!subpath) fail('SUBPATH_NOT_FOUND', { pathId: path.id, subpathIndex });
  const count = subpath.closed ? subpath.anchors.length : Math.max(0, subpath.anchors.length - 1);
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= count) {
    fail('SEGMENT_NOT_FOUND', { pathId: path.id, subpathIndex, segmentIndex });
  }
  return { subpath, from: subpath.anchors[segmentIndex], to: subpath.anchors[(segmentIndex + 1) % subpath.anchors.length] };
}

function cubicPoints(path, subpathIndex, segmentIndex) {
  const { from, to } = segmentAnchors(path, subpathIndex, segmentIndex);
  const matrix = path.matrix || identity();
  return [
    matrixPoint(matrix, from),
    matrixPoint(matrix, { x: from.x + (from.out?.x || 0), y: from.y + (from.out?.y || 0) }),
    matrixPoint(matrix, { x: to.x + (to.in?.x || 0), y: to.y + (to.in?.y || 0) }),
    matrixPoint(matrix, to)
  ];
}

function curveFor(path, subpathIndex, segmentIndex) {
  return new Bezier(cubicPoints(path, subpathIndex, segmentIndex));
}

function parseIntersectionPair(value) {
  const [a, b] = String(value).split('/').map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [clamp01(a), clamp01(b)];
}

function dedupePairs(pairs, epsilon) {
  const sorted = pairs.filter(Boolean).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return sorted.filter((pair, index) => !sorted.slice(0, index).some(other =>
    Math.abs(pair[0] - other[0]) <= epsilon && Math.abs(pair[1] - other[1]) <= epsilon));
}

export function intersectPathSegments(pathA, refA, pathB, refB, { threshold = 0.5, epsilon = 0.004 } = {}) {
  if (!(threshold > 0) || !(epsilon > 0)) fail('INTERSECTION_OPTIONS_INVALID');
  const curveA = curveFor(pathA, refA.subpathIndex, refA.segmentIndex);
  const curveB = curveFor(pathB, refB.subpathIndex, refB.segmentIndex);
  const pairs = dedupePairs(curveA.intersects(curveB, threshold).map(parseIntersectionPair), epsilon);
  return {
    format: 'INK-GEOMETRY-INTERSECTIONS', version: '1.0',
    pathAId: pathA.id, pathBId: pathB.id,
    segmentA: { subpathIndex: refA.subpathIndex, segmentIndex: refA.segmentIndex },
    segmentB: { subpathIndex: refB.subpathIndex, segmentIndex: refB.segmentIndex },
    intersections: pairs.map(([tA, tB]) => {
      const a = curveA.get(tA), b = curveB.get(tB);
      return { tA: round(tA), tB: round(tB), x: round((a.x + b.x) / 2), y: round((a.y + b.y) / 2) };
    })
  };
}

export function projectPointToPath(path, target, { subpathIndexes = null } = {}) {
  assertPath(path);
  if (!finitePoint(target)) fail('PROJECT_POINT_INVALID');
  const allowed = subpathIndexes == null ? null : new Set(subpathIndexes.map(Number));
  const candidates = [];
  path.subpaths.forEach((subpath, subpathIndex) => {
    if (allowed && !allowed.has(subpathIndex)) return;
    const count = subpath.closed ? subpath.anchors.length : Math.max(0, subpath.anchors.length - 1);
    for (let segmentIndex = 0; segmentIndex < count; segmentIndex += 1) {
      const projected = curveFor(path, subpathIndex, segmentIndex).project({ x: +target.x, y: +target.y });
      candidates.push({ subpathIndex, segmentIndex, t: projected.t, x: projected.x, y: projected.y, distance: projected.d });
    }
  });
  if (!candidates.length) fail('PROJECT_EMPTY_PATH', { pathId: path.id });
  candidates.sort((a, b) => a.distance - b.distance || a.subpathIndex - b.subpathIndex || a.segmentIndex - b.segmentIndex || a.t - b.t);
  const result = candidates[0];
  return { format: 'INK-GEOMETRY-PROJECTION', version: '1.0', pathId: path.id, ...Object.fromEntries(Object.entries(result).map(([key, value]) => [key, Number.isFinite(value) ? round(value) : value])) };
}

export function splitPathSegmentGeometry(path, ref, t = 0.5) {
  const value = clamp01(t);
  if (value <= 0 || value >= 1) fail('SPLIT_T_OUT_OF_RANGE', { t });
  const split = curveFor(path, ref.subpathIndex, ref.segmentIndex).split(value);
  const plain = curve => curve.points.map(point => ({ x: round(point.x), y: round(point.y) }));
  return {
    format: 'INK-GEOMETRY-SPLIT', version: '1.0', pathId: path.id,
    segment: { subpathIndex: ref.subpathIndex, segmentIndex: ref.segmentIndex }, t: round(value),
    left: plain(split.left), right: plain(split.right)
  };
}

function signedArea(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function oriented(points, role) {
  const positive = signedArea(points) >= 0;
  const shouldBePositive = role !== 'hole';
  return positive === shouldBePositive ? points : [...points].reverse();
}

function validateScale(points, scale) {
  if (!Number.isSafeInteger(scale) || scale < 1 || scale > 1_000_000) fail('OFFSET_SCALE_INVALID', { scale });
  const maximum = Math.max(0, ...points.flatMap(point => [Math.abs(point.x), Math.abs(point.y)]));
  if (maximum * scale >= Number.MAX_SAFE_INTEGER / 1024) fail('OFFSET_SAFE_INTEGER_RANGE', { maximum, scale });
}

const JOIN_TYPES = { miter: JoinType.Miter, round: JoinType.Round, square: JoinType.Square, bevel: JoinType.Bevel };

export function offsetPathRobust(path, distance, { tolerance = 0.35, scale = 1000, join = 'miter', miterLimit = 2, arcTolerance = 0, resultId = null, allowEmpty = false } = {}) {
  assertPath(path);
  if (!Number.isFinite(+distance) || !Number.isFinite(+tolerance) || tolerance <= 0) fail('OFFSET_OPTIONS_INVALID');
  if (!Object.prototype.hasOwnProperty.call(JOIN_TYPES, join)) fail('OFFSET_JOIN_UNSUPPORTED', { join });
  const rings = path.subpaths.map((subpath, subpathIndex) => {
    if (subpath.closed === false) fail('OFFSET_REQUIRES_CLOSED_SUBPATH', { pathId: path.id, subpathIndex });
    const points = flattenSubpath(subpath, tolerance).map(point => matrixPoint(path.matrix, point));
    if (points.length < 3) fail('OFFSET_DEGENERATE_SUBPATH', { pathId: path.id, subpathIndex });
    return oriented(points, subpath.role || 'outer');
  });
  const allPoints = rings.flat();
  validateScale(allPoints, scale);
  const input = rings.map(ring => ring.map(point => ({ x: Math.round(point.x * scale), y: Math.round(point.y * scale) })));
  const output = inflatePaths(input, Math.round(+distance * scale), JOIN_TYPES[join], EndType.Polygon, +miterLimit, +arcTolerance * scale);
  if (!output.length && !allowEmpty) fail('OFFSET_COLLAPSED', { pathId: path.id, distance: +distance });
  const operation = { sourcePathId: path.id, distance: +distance, tolerance: +tolerance, scale, join, miterLimit: +miterLimit, arcTolerance: +arcTolerance };
  const id = resultId || `geometry-offset:${path.id}:${fnv1a32(stableStringify(operation))}`;
  const subpaths = output.map((ring, index) => {
    const points = ring.map(point => ({ x: round(point.x / scale), y: round(point.y / scale) }));
    return { id: `${id}:s${index}`, role: signedArea(points) < 0 ? 'hole' : 'outer', closed: true, anchors: points.map((point, anchorIndex) => createAnchor(point.x, point.y, null, null, { id: `${id}:s${index}:a${anchorIndex}` })) };
  });
  return createPath({
    ...clone(path), id, name: `${path.name || 'Path'} Offset`, matrix: identity(), subpaths,
    metadata: { ...clone(path.metadata || {}), geometryKernel: { operation: 'offset', version: '1.0', ...operation } }
  });
}

export function fitLine(points) {
  if (!Array.isArray(points) || points.length < 2 || !points.every(finitePoint)) fail('FIT_LINE_POINTS_INVALID');
  const mean = points.reduce((sum, point) => ({ x: sum.x + +point.x, y: sum.y + +point.y }), { x: 0, y: 0 });
  mean.x /= points.length; mean.y /= points.length;
  let xx = 0, yy = 0, xy = 0;
  for (const point of points) { const dx = point.x - mean.x, dy = point.y - mean.y; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const projected = points.map(point => (point.x - mean.x) * direction.x + (point.y - mean.y) * direction.y);
  const minimum = Math.min(...projected), maximum = Math.max(...projected);
  const residuals = points.map((point, index) => Math.hypot(point.x - (mean.x + direction.x * projected[index]), point.y - (mean.y + direction.y * projected[index])));
  const rmse = Math.sqrt(residuals.reduce((sum, value) => sum + value * value, 0) / residuals.length);
  return { format: 'INK-GEOMETRY-FIT', version: '1.0', type: 'line', parameters: { start: { x: round(mean.x + direction.x * minimum), y: round(mean.y + direction.y * minimum) }, end: { x: round(mean.x + direction.x * maximum), y: round(mean.y + direction.y * maximum) }, angleDeg: round(angle * 180 / Math.PI) }, metrics: { pointCount: points.length, rmse: round(rmse), maxResidual: round(Math.max(...residuals)) } };
}

function solve3(matrix, values) {
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < 1e-12) fail('FIT_CIRCLE_SINGULAR');
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index < 4; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < 3; row += 1) if (row !== column) { const factor = augmented[row][column]; for (let index = column; index < 4; index += 1) augmented[row][index] -= factor * augmented[column][index]; }
  }
  return augmented.map(row => row[3]);
}

export function fitCircle(points) {
  if (!Array.isArray(points) || points.length < 3 || !points.every(finitePoint)) fail('FIT_CIRCLE_POINTS_INVALID');
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0;
  for (const point of points) { const x = +point.x, y = +point.y, z = -(x * x + y * y); sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sz += z; sxz += x * z; syz += y * z; }
  const [a, b, c] = solve3([[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, points.length]], [sxz, syz, sz]);
  const center = { x: -a / 2, y: -b / 2 }, radiusSquared = center.x * center.x + center.y * center.y - c;
  if (!(radiusSquared > 0)) fail('FIT_CIRCLE_RADIUS_INVALID');
  const radius = Math.sqrt(radiusSquared), residuals = points.map(point => Math.abs(Math.hypot(point.x - center.x, point.y - center.y) - radius));
  const rmse = Math.sqrt(residuals.reduce((sum, value) => sum + value * value, 0) / residuals.length);
  return { format: 'INK-GEOMETRY-FIT', version: '1.0', type: 'circle', parameters: { center: { x: round(center.x), y: round(center.y) }, radius: round(radius) }, metrics: { pointCount: points.length, rmse: round(rmse), maxResidual: round(Math.max(...residuals)) } };
}

export function measurePathGeometry(path, { tolerance = 0.35 } = {}) {
  assertPath(path);
  const fits = path.subpaths.map((subpath, subpathIndex) => {
    const points = flattenSubpath(subpath, tolerance).map(point => matrixPoint(path.matrix, point));
    const candidates = { line: points.length >= 2 ? fitLine(points) : null, circle: null };
    if (points.length >= 3) { try { candidates.circle = fitCircle(points); } catch { candidates.circle = null; } }
    return { subpathIndex, role: subpath.role || 'outer', closed: subpath.closed !== false, pointCount: points.length, candidates };
  });
  return { format: 'INK-GEOMETRY-MEASUREMENT', version: '1.0', pathId: path.id, metrics: pathMetrics(path), fits };
}

export function applyPathGeometryResult(app, { targetPath, historyPath, resultPath, label = 'Apply geometry operation' } = {}) {
  if (!targetPath || targetPath.type !== 'path' || !resultPath || resultPath.type !== 'path') fail('MUTATION_PATH_REQUIRED');
  if (!app?.history?.pushScoped || !Array.isArray(historyPath)) fail('HISTORY_REQUIRED');
  const identityState = { id: targetPath.id, parentId: targetPath.parentId };
  app.history.pushScoped(label, [historyPath], () => {
    const replacement = clone(resultPath);
    for (const key of Object.keys(targetPath)) delete targetPath[key];
    Object.assign(targetPath, replacement, { id: identityState.id });
    if (identityState.parentId) targetPath.parentId = identityState.parentId;
    else delete targetPath.parentId;
  });
  app.spatialDirty = true;
  app.refreshAll?.();
  app.renderer?.render?.();
  return targetPath;
}
