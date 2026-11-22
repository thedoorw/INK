import { clamp, deepClone, distance, pointSegmentDistance } from '../core/index.js';

const copyPoint = point => ({ ...point, in: point?.in ? { ...point.in } : undefined, out: point?.out ? { ...point.out } : undefined });
const vector = (a, b) => ({ x: b.x - a.x, y: b.y - a.y });
const add = (point, handle) => ({ x: point.x + (handle?.x || 0), y: point.y + (handle?.y || 0) });
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export function interpolateStrokePoint(a, b, t) {
  const value = (key, fallback = 0) => {
    const av = Number.isFinite(a[key]) ? a[key] : fallback;
    const bv = Number.isFinite(b[key]) ? b[key] : av;
    return av + (bv - av) * t;
  };
  return {
    x: value('x'),
    y: value('y'),
    p: value('p', .5),
    tiltX: value('tiltX'),
    tiltY: value('tiltY'),
    t: value('t'),
    mode: 'smooth'
  };
}

export function segmentControls(stroke, segmentIndex) {
  const points = stroke?.points || [];
  const p0 = points[segmentIndex];
  const p3 = points[segmentIndex + 1];
  if (!p0 || !p3) return null;
  return {
    p0,
    p1: add(p0, p0.out),
    p2: add(p3, p3.in),
    p3
  };
}

export function cubicPoint(controls, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: controls.p0.x * mt2 * mt + 3 * controls.p1.x * mt2 * t + 3 * controls.p2.x * mt * t2 + controls.p3.x * t2 * t,
    y: controls.p0.y * mt2 * mt + 3 * controls.p1.y * mt2 * t + 3 * controls.p2.y * mt * t2 + controls.p3.y * t2 * t
  };
}

export function cubicDerivative(controls, t) {
  const mt = 1 - t;
  return {
    x: 3 * mt * mt * (controls.p1.x - controls.p0.x) + 6 * mt * t * (controls.p2.x - controls.p1.x) + 3 * t * t * (controls.p3.x - controls.p2.x),
    y: 3 * mt * mt * (controls.p1.y - controls.p0.y) + 6 * mt * t * (controls.p2.y - controls.p1.y) + 3 * t * t * (controls.p3.y - controls.p2.y)
  };
}

export function sampleStrokeSegment(stroke, segmentIndex, maxStep = 6) {
  const controls = segmentControls(stroke, segmentIndex);
  if (!controls) return [];
  const estimate = distance(controls.p0, controls.p1) + distance(controls.p1, controls.p2) + distance(controls.p2, controls.p3);
  const steps = Math.max(2, Math.min(96, Math.ceil(estimate / Math.max(.5, maxStep))));
  const output = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const base = interpolateStrokePoint(controls.p0, controls.p3, t);
    const point = cubicPoint(controls, t);
    output.push({ ...base, x: point.x, y: point.y, segmentIndex, segmentT: t });
  }
  return output;
}

export function sampleStrokePath(stroke, maxStep = 6) {
  const points = stroke?.points || [];
  if (points.length < 2) return points.map(copyPoint);
  const output = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const segment = sampleStrokeSegment(stroke, index, maxStep);
    if (index) segment.shift();
    output.push(...segment);
  }
  return output;
}

export function closestPointOnSegment(point, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lengthSquared = vx * vx + vy * vy;
  if (!lengthSquared) return { point: copyPoint(a), t: 0, distance: distance(point, a) };
  const t = clamp(((point.x - a.x) * vx + (point.y - a.y) * vy) / lengthSquared, 0, 1);
  const projected = interpolateStrokePoint(a, b, t);
  return { point: projected, t, distance: distance(point, projected) };
}

export function nearestStrokeNode(points, point, tolerance = 8) {
  let best = null;
  for (let index = 0; index < points.length; index += 1) {
    const d = distance(points[index], point);
    if (d <= tolerance && (!best || d < best.distance)) best = { index, distance: d };
  }
  return best;
}

export function nearestStrokeSegment(points, point, tolerance = 8) {
  let best = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const hit = closestPointOnSegment(point, points[index], points[index + 1]);
    if (hit.distance <= tolerance && (!best || hit.distance < best.distance)) {
      best = { index, t: hit.t, point: hit.point, distance: hit.distance };
    }
  }
  return best;
}

export function nearestStrokeCurveSegment(stroke, point, tolerance = 8) {
  let best = null;
  const points = stroke?.points || [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const sampled = sampleStrokeSegment(stroke, index, Math.max(2, tolerance * .45));
    for (let sampleIndex = 0; sampleIndex < sampled.length - 1; sampleIndex += 1) {
      const hit = closestPointOnSegment(point, sampled[sampleIndex], sampled[sampleIndex + 1]);
      if (hit.distance > tolerance || (best && hit.distance >= best.distance)) continue;
      const a = sampled[sampleIndex].segmentT;
      const b = sampled[sampleIndex + 1].segmentT;
      best = { index, t: a + (b - a) * hit.t, point: hit.point, distance: hit.distance };
    }
  }
  return best;
}

export function simplifyStrokePoints(points, tolerance = 1.2) {
  if (points.length <= 2) return points.map(copyPoint);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const visit = (start, end) => {
    let maxDistance = 0;
    let maxIndex = -1;
    for (let index = start + 1; index < end; index += 1) {
      const d = pointSegmentDistance(points[index], points[start], points[end]);
      if (d > maxDistance) {
        maxDistance = d;
        maxIndex = index;
      }
    }
    if (maxIndex >= 0 && maxDistance > tolerance) {
      keep[maxIndex] = 1;
      visit(start, maxIndex);
      visit(maxIndex, end);
    }
  };
  visit(0, points.length - 1);
  return points.filter((_, index) => keep[index]).map(point => ({ ...copyPoint(point), in: undefined, out: undefined, mode: 'corner' }));
}

export function segmentStyleAt(stroke, segmentIndex) {
  return { ...(stroke?.segmentStyles?.[segmentIndex] || {}) };
}

export function setStrokeSegmentStyle(stroke, segmentIndex, style) {
  const count = Math.max(0, (stroke?.points?.length || 0) - 1);
  if (segmentIndex < 0 || segmentIndex >= count) return stroke;
  const styles = Array.from({ length: count }, (_, index) => ({ ...(stroke.segmentStyles?.[index] || {}) }));
  styles[segmentIndex] = { ...styles[segmentIndex], ...style };
  stroke.segmentStyles = styles;
  return stroke;
}

export function clearStrokeSegmentStyle(stroke, segmentIndex) {
  if (!stroke?.segmentStyles) return stroke;
  stroke.segmentStyles[segmentIndex] = {};
  if (stroke.segmentStyles.every(style => !style || !Object.keys(style).length)) delete stroke.segmentStyles;
  return stroke;
}

export function setStrokeNodeMode(stroke, index, mode = 'smooth') {
  const points = stroke?.points || [];
  const point = points[index];
  if (!point) return false;
  point.mode = mode;
  if (mode === 'corner') {
    point.in = { x: 0, y: 0 };
    point.out = { x: 0, y: 0 };
    return true;
  }
  const previous = points[index - 1] || point;
  const next = points[index + 1] || point;
  const direction = vector(previous, next);
  const length = Math.hypot(direction.x, direction.y) || 1;
  const ux = direction.x / length;
  const uy = direction.y / length;
  const inLength = Math.max(0, distance(previous, point) / 3);
  const outLength = Math.max(0, distance(point, next) / 3);
  point.in = { x: -ux * inLength, y: -uy * inLength };
  point.out = { x: ux * outLength, y: uy * outLength };
  if (mode === 'symmetric') {
    const shared = Math.max(inLength, outLength);
    point.in = { x: -ux * shared, y: -uy * shared };
    point.out = { x: ux * shared, y: uy * shared };
  }
  return true;
}

export function moveStrokeHandle(stroke, index, kind, position) {
  const point = stroke?.points?.[index];
  if (!point || !['in', 'out'].includes(kind)) return false;
  const handle = { x: position.x - point.x, y: position.y - point.y };
  point[kind] = handle;
  const opposite = kind === 'in' ? 'out' : 'in';
  const mode = point.mode || 'smooth';
  if (mode === 'symmetric') point[opposite] = { x: -handle.x, y: -handle.y };
  else if (mode === 'smooth') {
    const oppositeLength = Math.hypot(point[opposite]?.x || 0, point[opposite]?.y || 0);
    const handleLength = Math.hypot(handle.x, handle.y) || 1;
    point[opposite] = { x: -handle.x / handleLength * oppositeLength, y: -handle.y / handleLength * oppositeLength };
  }
  return true;
}

export function insertStrokeNode(stroke, segmentIndex, t = .5) {
  const points = stroke?.points || [];
  if (points.length < 2 || segmentIndex < 0 || segmentIndex >= points.length - 1) return -1;
  t = clamp(t, .02, .98);
  const controls = segmentControls(stroke, segmentIndex);
  const a = mix(controls.p0, controls.p1, t);
  const b = mix(controls.p1, controls.p2, t);
  const c = mix(controls.p2, controls.p3, t);
  const d = mix(a, b, t);
  const e = mix(b, c, t);
  const f = mix(d, e, t);
  const newPoint = { ...interpolateStrokePoint(controls.p0, controls.p3, t), x: f.x, y: f.y, in: vector(f, d), out: vector(f, e), mode: 'smooth' };
  controls.p0.out = vector(controls.p0, a);
  controls.p3.in = vector(controls.p3, c);
  points.splice(segmentIndex + 1, 0, newPoint);
  const sourceStyle = { ...(stroke.segmentStyles?.[segmentIndex] || {}) };
  const styles = Array.from({ length: points.length - 2 }, (_, index) => ({ ...(stroke.segmentStyles?.[index] || {}) }));
  styles.splice(segmentIndex, 1, { ...sourceStyle }, { ...sourceStyle });
  if (styles.some(style => Object.keys(style).length)) stroke.segmentStyles = styles;
  return segmentIndex + 1;
}

export function splitStrokeAtSegment(stroke, segmentIndex, t = .5, makeId = () => crypto.randomUUID()) {
  const working = deepClone(stroke);
  const insertedIndex = insertStrokeNode(working, segmentIndex, t);
  if (insertedIndex < 1) return [];
  const leftPoints = working.points.slice(0, insertedIndex + 1).map(copyPoint);
  const rightPoints = working.points.slice(insertedIndex).map(copyPoint);
  if (leftPoints.length < 2 || rightPoints.length < 2) return [];
  const leftStyles = working.segmentStyles?.slice(0, insertedIndex).map(style => ({ ...style }));
  const rightStyles = working.segmentStyles?.slice(insertedIndex).map(style => ({ ...style }));
  return [
    { ...working, id: makeId(), points: leftPoints, ...(leftStyles?.some(style => Object.keys(style).length) ? { segmentStyles: leftStyles } : { segmentStyles: undefined }) },
    { ...working, id: makeId(), points: rightPoints, ...(rightStyles?.some(style => Object.keys(style).length) ? { segmentStyles: rightStyles } : { segmentStyles: undefined }) }
  ];
}

function sampleStroke(points, maxStep) {
  if (points.length < 2) return points.map(copyPoint);
  const output = [copyPoint(points[0])];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const count = Math.max(1, Math.ceil(distance(a, b) / maxStep));
    for (let step = 1; step <= count; step += 1) output.push(interpolateStrokePoint(a, b, step / count));
  }
  return output;
}

export function eraseStrokeWithCircle(stroke, center, radius, makeId = () => crypto.randomUUID()) {
  const source = sampleStrokePath(stroke, Math.max(.75, radius * .35));
  if (source.length < 2 || radius <= 0) return { changed: false, fragments: [stroke] };
  const sampled = sampleStroke(source, Math.max(.75, radius * .35));
  const parts = [];
  let current = [];
  let removed = false;
  for (const point of sampled) {
    if (distance(point, center) > radius) current.push(point);
    else {
      removed = true;
      if (current.length > 1) parts.push(current);
      current = [];
    }
  }
  if (current.length > 1) parts.push(current);
  if (!removed) return { changed: false, fragments: [stroke] };
  const tolerance = Math.max(.35, radius * .08);
  const fragments = parts.map(part => ({
    ...deepClone(stroke),
    id: makeId(),
    points: simplifyStrokePoints(part, tolerance),
    segmentStyles: undefined
  })).filter(fragment => fragment.points.length > 1);
  return { changed: true, fragments };
}

export function deleteStrokeNodes(stroke, indices) {
  const selected = new Set(indices);
  const points = (stroke.points || []).filter((_, index) => !selected.has(index)).map(copyPoint);
  if (points.length < 2) return null;
  const replacement = { ...deepClone(stroke), points };
  delete replacement.segmentStyles;
  return replacement;
}
