import { createRasterMask, modifyRasterMask } from './image-core.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clampByte = value => clamp(Math.round(Number(value) || 0), 0, 255);
const cloneAlpha = alpha => Uint8ClampedArray.from(alpha || []);

function assertImageData(imageData) {
  const width = Math.floor(Number(imageData?.width));
  const height = Math.floor(Number(imageData?.height));
  if (!(width > 0 && height > 0) || !imageData?.data || imageData.data.length !== width * height * 4) {
    throw new Error('INK_RASTER_IMAGE_DATA_INVALID');
  }
  return { width, height, data: imageData.data };
}

function assertDimensions(width, height) {
  width = Math.floor(Number(width));
  height = Math.floor(Number(height));
  if (!(width > 0 && height > 0)) throw new Error('INK_RASTER_SELECTION_DIMENSIONS_INVALID');
  return { width, height };
}

function selectionBounds(alpha, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!alpha[y * width + x]) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return maxX < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function makeSelection(source, width, height, alpha, metadata = {}) {
  return {
    type: 'selection', source, width, height,
    alpha: Array.from(alpha),
    bounds: selectionBounds(alpha, width, height),
    metadata: { ...metadata }
  };
}

function pointOnSegment(point, a, b) {
  const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
  if (Math.abs(cross) > 1e-9) return false;
  const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
  if (dot < 0) return false;
  const lengthSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot <= lengthSq;
}

function evenOddContains(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (pointOnSegment(point, a, b)) return true;
    if (((a.y > point.y) !== (b.y > point.y)) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y || 1e-12) + a.x) inside = !inside;
  }
  return inside;
}

function normalizePolygon(points, width, height) {
  if (!Array.isArray(points) || points.length < 3) throw new Error('INK_POLYGON_SELECTION_REQUIRES_THREE_POINTS');
  return points.map(point => ({
    x: clamp(Number(point?.x) || 0, 0, width),
    y: clamp(Number(point?.y) || 0, 0, height)
  }));
}

export function polygonalLassoSelection(width, height, points) {
  ({ width, height } = assertDimensions(width, height));
  const polygon = normalizePolygon(points, width, height);
  const alpha = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (evenOddContains({ x: x + 0.5, y: y + 0.5 }, polygon)) alpha[y * width + x] = 255;
  }
  return makeSelection('polygonal-lasso', width, height, alpha, { fillRule: 'evenodd', polygon });
}

export function rgbaDistance(a, b) {
  let sum = 0;
  for (let channel = 0; channel < 4; channel++) {
    const delta = (a[channel] || 0) - (b[channel] || 0);
    sum += delta * delta;
  }
  return Math.sqrt(sum / 4);
}

export function colorMatchesTolerance(a, b, tolerance = 0) {
  return rgbaDistance(a, b) <= clamp(Number(tolerance) || 0, 0, 255);
}

function pixelRgba(data, index) {
  const offset = index * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

function normalizeSeed(x, y, width, height) {
  const sx = Math.floor(Number(x));
  const sy = Math.floor(Number(y));
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx < 0 || sy < 0 || sx >= width || sy >= height) {
    throw new Error('INK_RASTER_SELECTION_SEED_OUT_OF_BOUNDS');
  }
  return { x: sx, y: sy, index: sy * width + sx };
}

function contiguousRegion(imageData, seed, tolerance, { edgeThreshold = 255, maxVisited = null } = {}) {
  const { width, height, data } = assertImageData(imageData);
  const limit = maxVisited == null ? width * height : Math.max(1, Math.floor(Number(maxVisited) || 0));
  const reference = pixelRgba(data, seed.index);
  const selected = new Uint8ClampedArray(width * height);
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0, visited = 0;
  queue[tail++] = seed.index;
  seen[seed.index] = 1;
  while (head < tail) {
    if (++visited > limit) throw new Error('INK_QUICK_SELECTION_WORK_LIMIT');
    const index = queue[head++];
    const current = pixelRgba(data, index);
    if (!colorMatchesTolerance(current, reference, tolerance)) continue;
    selected[index] = 255;
    const x = index % width, y = Math.floor(index / width);
    const neighbors = [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1];
    for (const next of neighbors) {
      if (next < 0 || seen[next]) continue;
      seen[next] = 1;
      if (rgbaDistance(current, pixelRgba(data, next)) <= edgeThreshold) queue[tail++] = next;
    }
  }
  return { alpha: selected, visited };
}

export function magicWandSelection(imageData, { x, y, tolerance = 0, contiguous = true } = {}) {
  const { width, height, data } = assertImageData(imageData);
  tolerance = clamp(Number(tolerance) || 0, 0, 255);
  const seed = normalizeSeed(x, y, width, height);
  let alpha, visited;
  if (contiguous) {
    ({ alpha, visited } = contiguousRegion(imageData, seed, tolerance, { edgeThreshold: 255, maxVisited: width * height }));
  } else {
    const reference = pixelRgba(data, seed.index);
    alpha = new Uint8ClampedArray(width * height);
    visited = width * height;
    for (let index = 0; index < alpha.length; index++) if (colorMatchesTolerance(pixelRgba(data, index), reference, tolerance)) alpha[index] = 255;
  }
  return makeSelection('magic-wand', width, height, alpha, { tolerance, contiguous: Boolean(contiguous), visited });
}

export function quickSelection(imageData, { samples = [], tolerance = 32, edgeThreshold = 255, maxVisited = null, initialSelection = null } = {}) {
  const { width, height } = assertImageData(imageData);
  if (!Array.isArray(samples) || !samples.length) throw new Error('INK_QUICK_SELECTION_REQUIRES_SAMPLES');
  const result = initialSelection?.alpha ? cloneAlpha(initialSelection.alpha) : new Uint8ClampedArray(width * height);
  if (result.length !== width * height) throw new Error('INK_QUICK_SELECTION_INITIAL_SIZE_MISMATCH');
  const hardLimit = maxVisited == null ? width * height * samples.length : Math.max(1, Math.floor(Number(maxVisited) || 0));
  let totalVisited = 0;
  for (const sample of samples) {
    const seed = normalizeSeed(sample.x, sample.y, width, height);
    const remaining = hardLimit - totalVisited;
    if (remaining <= 0) throw new Error('INK_QUICK_SELECTION_WORK_LIMIT');
    const region = contiguousRegion(imageData, seed, clamp(sample.tolerance ?? tolerance, 0, 255), {
      edgeThreshold: clamp(sample.edgeThreshold ?? edgeThreshold, 0, 255),
      maxVisited: remaining
    });
    totalVisited += region.visited;
    const mode = sample.mode === 'subtract' ? 'subtract' : 'add';
    for (let index = 0; index < result.length; index++) if (region.alpha[index]) result[index] = mode === 'subtract' ? 0 : 255;
  }
  return makeSelection('quick-selection', width, height, result, {
    tolerance: clamp(tolerance, 0, 255), edgeThreshold: clamp(edgeThreshold, 0, 255), visited: totalVisited
  });
}

export function refineRasterSelection(selectionOrMask, { smooth = 0, feather = 0, expand = 0, contract = 0 } = {}) {
  const width = Math.floor(Number(selectionOrMask?.width));
  const height = Math.floor(Number(selectionOrMask?.height));
  const alpha = selectionOrMask?.alpha;
  if (!(width > 0 && height > 0) || !alpha || alpha.length !== width * height) throw new Error('INK_SELECTION_REFINEMENT_INVALID_MASK');
  let mask = createRasterMask(width, height, alpha);
  const smoothRadius = Math.max(0, Math.round(Number(smooth) || 0));
  if (smoothRadius) {
    const softened = modifyRasterMask(mask, { feather: smoothRadius });
    const thresholded = Uint8ClampedArray.from(softened.alpha, value => value >= 128 ? 255 : 0);
    mask = createRasterMask(width, height, thresholded);
  }
  const delta = Math.round(Number(expand) || 0) - Math.round(Number(contract) || 0);
  if (delta) mask = modifyRasterMask(mask, { expand: delta });
  const featherRadius = Math.max(0, Math.round(Number(feather) || 0));
  if (featherRadius) mask = modifyRasterMask(mask, { feather: featherRadius });
  return mask;
}

export function sampleRasterColor(imageData, { x, y, radius = 0 } = {}) {
  const { width, height, data } = assertImageData(imageData);
  const center = normalizeSeed(x, y, width, height);
  radius = clamp(Math.round(Number(radius) || 0), 0, Math.max(width, height));
  const minX = Math.max(0, center.x - radius), maxX = Math.min(width - 1, center.x + radius);
  const minY = Math.max(0, center.y - radius), maxY = Math.min(height - 1, center.y + radius);
  const sums = [0, 0, 0, 0];
  let count = 0;
  for (let yy = minY; yy <= maxY; yy++) for (let xx = minX; xx <= maxX; xx++) {
    const rgba = pixelRgba(data, yy * width + xx);
    for (let channel = 0; channel < 4; channel++) sums[channel] += rgba[channel];
    count++;
  }
  const rgba = sums.map(value => clampByte(value / Math.max(1, count)));
  return { r: rgba[0], g: rgba[1], b: rgba[2], a: rgba[3], rgba, x: center.x, y: center.y, radius, count };
}


function normalizeRasterPathPoint(point, width, height) {
  const x = Math.floor(Number(point?.x));
  const y = Math.floor(Number(point?.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('INK_MAGNETIC_LASSO_POINT_INVALID');
  return { x: clamp(x, 0, width - 1), y: clamp(y, 0, height - 1) };
}

function rasterLuminance(data, index) {
  const offset = index * 4;
  return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
}

function edgeStrengthAt(imageData, x, y) {
  const { width, height, data } = imageData;
  const sampleIndex = (xx, yy) => clamp(yy, 0, height - 1) * width + clamp(xx, 0, width - 1);
  const li = sampleIndex(x - 1, y), ri = sampleIndex(x + 1, y);
  const ui = sampleIndex(x, y - 1), di = sampleIndex(x, y + 1);
  const colorX = rasterLuminance(data, ri) - rasterLuminance(data, li);
  const colorY = rasterLuminance(data, di) - rasterLuminance(data, ui);
  const alphaX = data[ri * 4 + 3] - data[li * 4 + 3];
  const alphaY = data[di * 4 + 3] - data[ui * 4 + 3];
  const color = Math.min(255, Math.hypot(colorX, colorY) / Math.SQRT2);
  const alpha = Math.min(255, Math.hypot(alphaX, alphaY) / Math.SQRT2);
  return Math.max(color, alpha);
}

function distanceToSegment(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return Math.hypot(x - a.x, y - a.y);
  const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / lengthSq, 0, 1);
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
}

function rasterLine(a, b) {
  const points = [];
  let x0 = a.x, y0 = a.y;
  const x1 = b.x, y1 = b.y;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    points.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * error;
    if (e2 >= dy) { error += dy; x0 += sx; }
    if (e2 <= dx) { error += dx; y0 += sy; }
  }
  return points;
}

class MinHeap {
  constructor(compare) { this.items = []; this.compare = compare; }
  push(item) {
    const items = this.items;
    items.push(item);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(items[parent], item) <= 0) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = item;
  }
  pop() {
    const items = this.items;
    if (!items.length) return null;
    const root = items[0];
    const tail = items.pop();
    if (items.length) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1, right = left + 1;
        if (left >= items.length) break;
        let child = left;
        if (right < items.length && this.compare(items[right], items[left]) < 0) child = right;
        if (this.compare(items[child], tail) >= 0) break;
        items[index] = items[child];
        index = child;
      }
      items[index] = tail;
    }
    return root;
  }
  get size() { return this.items.length; }
}

function magneticSegment(imageData, start, goal, options, budget) {
  const { width, height } = imageData;
  const radius = Math.max(1, Math.round(Number(options.searchRadius ?? options.corridorRadius ?? 8) || 8));
  const edgeSensitivity = clamp(Number(options.edgeSensitivity ?? 20) || 0, 0, 255);
  const edgeWeight = Math.max(0, Number(options.edgeWeight ?? 2) || 0);
  const continuityWeight = Math.max(0, Number(options.continuityWeight ?? options.directionWeight ?? 0.7) || 0);
  const minX = Math.max(0, Math.min(start.x, goal.x) - radius);
  const maxX = Math.min(width - 1, Math.max(start.x, goal.x) + radius);
  const minY = Math.max(0, Math.min(start.y, goal.y) - radius);
  const maxY = Math.min(height - 1, Math.max(start.y, goal.y) + radius);
  const inCorridor = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY &&
    (distanceToSegment(x, y, start, goal) <= radius + 1e-9 || (x === start.x && y === start.y) || (x === goal.x && y === goal.y));

  let peakEdge = 0;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (!inCorridor(x, y)) continue;
    if (++budget.count > budget.limit) throw new Error('INK_MAGNETIC_LASSO_WORK_LIMIT');
    peakEdge = Math.max(peakEdge, edgeStrengthAt(imageData, x, y));
  }
  if (peakEdge < edgeSensitivity) {
    return { path: rasterLine(start, goal), visited: 0, peakEdge, fallback: true };
  }

  const total = width * height;
  const startIndex = start.y * width + start.x, goalIndex = goal.y * width + goal.x;
  const gScore = new Float64Array(total); gScore.fill(Infinity);
  const previous = new Int32Array(total); previous.fill(-1);
  const closed = new Uint8Array(total);
  const compare = (a, b) => a.f - b.f || a.g - b.g || a.index - b.index;
  const heap = new MinHeap(compare);
  const heuristic = (x, y) => Math.max(Math.abs(goal.x - x), Math.abs(goal.y - y));
  gScore[startIndex] = 0;
  heap.push({ index: startIndex, g: 0, f: heuristic(start.x, start.y) });
  const neighbors = [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]];
  let visited = 0;

  while (heap.size) {
    const current = heap.pop();
    if (!current || closed[current.index] || current.g !== gScore[current.index]) continue;
    closed[current.index] = 1;
    visited++;
    if (++budget.count > budget.limit) throw new Error('INK_MAGNETIC_LASSO_WORK_LIMIT');
    if (current.index === goalIndex) break;
    const x = current.index % width, y = Math.floor(current.index / width);
    for (const [dx, dy] of neighbors) {
      const nx = x + dx, ny = y + dy;
      if (!inCorridor(nx, ny)) continue;
      const next = ny * width + nx;
      if (closed[next]) continue;
      const edge = edgeStrengthAt(imageData, nx, ny);
      const edgePenalty = (255 - edge) / 255 * edgeWeight * 16;
      const deviationPenalty = distanceToSegment(nx, ny, start, goal) * continuityWeight;
      const stepCost = (dx && dy ? Math.SQRT2 : 1) + edgePenalty + deviationPenalty;
      const nextG = current.g + stepCost;
      if (nextG + 1e-12 < gScore[next]) {
        gScore[next] = nextG;
        previous[next] = current.index;
        heap.push({ index: next, g: nextG, f: nextG + heuristic(nx, ny) });
      }
    }
  }

  if (!Number.isFinite(gScore[goalIndex])) {
    return { path: rasterLine(start, goal), visited, peakEdge, fallback: true };
  }
  const reversed = [];
  for (let index = goalIndex; index >= 0; index = previous[index]) {
    reversed.push({ x: index % width, y: Math.floor(index / width) });
    if (index === startIndex) break;
  }
  if (!reversed.length || reversed[reversed.length - 1].x !== start.x || reversed[reversed.length - 1].y !== start.y) {
    return { path: rasterLine(start, goal), visited, peakEdge, fallback: true };
  }
  reversed.reverse();
  return { path: reversed, visited, peakEdge, fallback: false };
}

export function magneticLassoSelection(imageData, { points = null, anchors = null, close = true, searchRadius = 8, corridorRadius = null, edgeSensitivity = 20, edgeWeight = 2, continuityWeight = 0.7, directionWeight = null, maxWork = null, maxVisited = null } = {}) {
  const { width, height } = assertImageData(imageData);
  const rawPoints = Array.isArray(points) ? points : anchors;
  if (!Array.isArray(rawPoints) || rawPoints.length < 2) throw new Error('INK_MAGNETIC_LASSO_REQUIRES_TWO_POINTS');
  const normalized = rawPoints.map(point => normalizeRasterPathPoint(point, width, height));
  const radius = corridorRadius == null ? searchRadius : corridorRadius;
  const segmentCount = normalized.length - 1 + (close ? 1 : 0);
  const defaultLimit = Math.max(width * height * Math.max(2, segmentCount) * 4, 64);
  const limitValue = maxWork ?? maxVisited;
  const budget = { count: 0, limit: limitValue == null ? defaultLimit : Math.max(1, Math.floor(Number(limitValue) || 0)) };
  const resolved = [];
  const segmentEvidence = [];
  const options = { searchRadius: radius, edgeSensitivity, edgeWeight, continuityWeight: directionWeight ?? continuityWeight };

  const appendSegment = (a, b) => {
    const result = magneticSegment(imageData, a, b, options, budget);
    if (resolved.length && result.path.length) result.path.shift();
    resolved.push(...result.path);
    segmentEvidence.push({ from: { ...a }, to: { ...b }, visited: result.visited, peakEdge: +result.peakEdge.toFixed(6), fallback: result.fallback });
  };
  for (let i = 0; i < normalized.length - 1; i++) appendSegment(normalized[i], normalized[i + 1]);
  if (close) appendSegment(normalized[normalized.length - 1], normalized[0]);

  const alpha = new Uint8ClampedArray(width * height);
  if (close && resolved.length >= 3) {
    const polygon = resolved.length > 1 && resolved[0].x === resolved[resolved.length - 1].x && resolved[0].y === resolved[resolved.length - 1].y
      ? resolved.slice(0, -1) : resolved;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (evenOddContains({ x: x + 0.5, y: y + 0.5 }, polygon)) alpha[y * width + x] = 255;
    }
  } else {
    for (const point of resolved) alpha[point.y * width + point.x] = 255;
  }
  const fallbackSegments = segmentEvidence.filter(item => item.fallback).length;
  return makeSelection('magnetic-lasso', width, height, alpha, {
    source: 'magnetic-lasso',
    closed: Boolean(close),
    path: resolved,
    anchors: normalized,
    searchRadius: Math.max(1, Math.round(Number(radius) || 8)),
    edgeSensitivity: clamp(Number(edgeSensitivity) || 0, 0, 255),
    edgeWeight: Math.max(0, Number(edgeWeight) || 0),
    continuityWeight: Math.max(0, Number(directionWeight ?? continuityWeight) || 0),
    work: budget.count,
    fallbackSegments,
    segmentEvidence
  });
}

function normalizeObjectRoi(roi, width, height) {
  if (Array.isArray(roi)) {
    const polygon = normalizePolygon(roi, width, height);
    return { kind: 'polygon', polygon };
  }
  if (Array.isArray(roi?.points)) {
    const polygon = normalizePolygon(roi.points, width, height);
    return { kind: 'polygon', polygon };
  }
  const x = clamp(Math.floor(Number(roi?.x) || 0), 0, width);
  const y = clamp(Math.floor(Number(roi?.y) || 0), 0, height);
  const w = Math.max(0, Math.floor(Number(roi?.w ?? roi?.width ?? width) || 0));
  const h = Math.max(0, Math.floor(Number(roi?.h ?? roi?.height ?? height) || 0));
  const x2 = clamp(x + w, 0, width), y2 = clamp(y + h, 0, height);
  return { kind: 'rect', x, y, x2, y2 };
}

function objectRoiMask(roi, width, height) {
  const mask = new Uint8Array(width * height);
  let minX = width, minY = height, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const inside = roi.kind === 'polygon'
      ? evenOddContains({ x: x + 0.5, y: y + 0.5 }, roi.polygon)
      : x >= roi.x && x < roi.x2 && y >= roi.y && y < roi.y2;
    if (!inside) continue;
    const index = y * width + x;
    mask[index] = 1; count++;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { mask, count, bounds: count ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : { x: 0, y: 0, w: 0, h: 0 } };
}

function rgbDistance(a, b) {
  const dr = (a[0] || 0) - (b[0] || 0), dg = (a[1] || 0) - (b[1] || 0), db = (a[2] || 0) - (b[2] || 0);
  return Math.sqrt((dr * dr + dg * dg + db * db) / 3);
}

function collectObjectComponents(candidate, roiMask, width, height, minSize, consumeWork) {
  const seen = new Uint8Array(candidate.length), components = [];
  const queue = new Int32Array(candidate.length);
  for (let start = 0; start < candidate.length; start++) {
    if (!candidate[start] || seen[start]) continue;
    let head = 0, tail = 0;
    queue[tail++] = start; seen[start] = 1;
    const indices = [];
    while (head < tail) {
      consumeWork();
      const index = queue[head++]; indices.push(index);
      const x = index % width, y = Math.floor(index / width);
      const neighbors = [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1];
      for (const next of neighbors) {
        if (next < 0 || seen[next] || !roiMask[next] || !candidate[next]) continue;
        seen[next] = 1; queue[tail++] = next;
      }
    }
    if (indices.length >= minSize) components.push(indices);
  }
  return components;
}

function seededObjectRegion(imageData, roiMask, seed, colorThreshold, alphaThreshold, consumeWork) {
  const { width, height, data } = imageData;
  const selected = new Uint8Array(width * height), seen = new Uint8Array(width * height), queue = new Int32Array(width * height);
  const reference = pixelRgba(data, seed.index);
  let head = 0, tail = 0;
  queue[tail++] = seed.index; seen[seed.index] = 1;
  const indices = [];
  while (head < tail) {
    consumeWork();
    const index = queue[head++], current = pixelRgba(data, index);
    if (rgbDistance(current, reference) > colorThreshold || Math.abs(current[3] - reference[3]) > Math.max(alphaThreshold, colorThreshold)) continue;
    selected[index] = 1; indices.push(index);
    const x = index % width, y = Math.floor(index / width);
    const neighbors = [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1];
    for (const next of neighbors) {
      if (next < 0 || seen[next] || !roiMask[next]) continue;
      seen[next] = 1; queue[tail++] = next;
    }
  }
  return indices;
}

export function objectSelection(imageData, { roi = null, hintRegion = null, seed = null, colorThreshold = 32, edgeThreshold = 20, alphaThreshold = 16, minComponentSize = 1, maxWork = null, maxVisited = null } = {}) {
  const source = assertImageData(imageData);
  const { width, height, data } = source;
  const region = normalizeObjectRoi(roi ?? hintRegion ?? { x: 0, y: 0, w: width, h: height }, width, height);
  const roiInfo = objectRoiMask(region, width, height);
  const alpha = new Uint8ClampedArray(width * height);
  const minimum = Math.max(1, Math.floor(Number(minComponentSize) || 1));
  colorThreshold = clamp(Number(colorThreshold) || 0, 0, 255);
  edgeThreshold = clamp(Number(edgeThreshold) || 0, 0, 255);
  alphaThreshold = clamp(Number(alphaThreshold) || 0, 0, 255);
  const defaultLimit = Math.max(roiInfo.count * 6, 64);
  const limitValue = maxWork ?? maxVisited;
  const work = { count: 0, limit: limitValue == null ? defaultLimit : Math.max(1, Math.floor(Number(limitValue) || 0)) };
  const consumeWork = () => { if (++work.count > work.limit) throw new Error('INK_OBJECT_SELECTION_WORK_LIMIT'); };
  if (!roiInfo.count) return makeSelection('object-selection', width, height, alpha, {
    source: 'object-selection', roi: region, visited: 0, candidateCount: 0, confidence: 0, evidence: { insufficientEvidence: true, reason: 'empty-roi' }
  });

  const boundary = [];
  for (let index = 0; index < roiInfo.mask.length; index++) {
    if (!roiInfo.mask[index]) continue;
    consumeWork();
    const x = index % width, y = Math.floor(index / width);
    const outside = x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
      !roiInfo.mask[index - 1] || !roiInfo.mask[index + 1] || !roiInfo.mask[index - width] || !roiInfo.mask[index + width];
    if (outside) boundary.push(index);
  }
  const background = [0,0,0,0];
  const samples = boundary.length ? boundary : Array.from({ length: roiInfo.mask.length }, (_, i) => i).filter(i => roiInfo.mask[i]);
  for (const index of samples) {
    const rgba = pixelRgba(data, index);
    for (let c = 0; c < 4; c++) background[c] += rgba[c];
  }
  for (let c = 0; c < 4; c++) background[c] /= Math.max(1, samples.length);

  const candidate = new Uint8Array(width * height);
  const contrast = new Float64Array(width * height);
  const alphaContrast = new Float64Array(width * height);
  const edgeEvidence = new Float64Array(width * height);
  for (let index = 0; index < roiInfo.mask.length; index++) {
    if (!roiInfo.mask[index]) continue;
    consumeWork();
    const rgba = pixelRgba(data, index);
    const x = index % width, y = Math.floor(index / width);
    const colorDelta = rgbDistance(rgba, background);
    const alphaDelta = Math.abs(rgba[3] - background[3]);
    const edge = edgeStrengthAt(source, x, y);
    contrast[index] = colorDelta;
    alphaContrast[index] = alphaDelta;
    edgeEvidence[index] = edge;
    if (colorDelta >= colorThreshold || alphaDelta >= alphaThreshold) candidate[index] = 1;
  }

  let normalizedSeed = null;
  if (seed != null) {
    normalizedSeed = normalizeSeed(seed.x, seed.y, width, height);
    if (!roiInfo.mask[normalizedSeed.index]) throw new Error('INK_OBJECT_SELECTION_SEED_OUTSIDE_ROI');
  }
  let components = collectObjectComponents(candidate, roiInfo.mask, width, height, minimum, consumeWork);
  let selected = null, seedFallback = false;
  if (normalizedSeed) selected = components.find(component => component.includes(normalizedSeed.index)) || null;
  if (normalizedSeed && !selected) {
    const seeded = seededObjectRegion(source, roiInfo.mask, normalizedSeed, colorThreshold, alphaThreshold, consumeWork);
    if (seeded.length >= minimum) { selected = seeded; seedFallback = true; }
  }

  const centerX = roiInfo.bounds.x + (roiInfo.bounds.w - 1) / 2, centerY = roiInfo.bounds.y + (roiInfo.bounds.h - 1) / 2;
  const diagonal = Math.max(1, Math.hypot(roiInfo.bounds.w, roiInfo.bounds.h));
  const summarize = indices => {
    let sumContrast = 0, sumAlpha = 0, sumEdge = 0, sumX = 0, sumY = 0, minIndex = Infinity;
    for (const index of indices) {
      sumContrast += contrast[index]; sumAlpha += alphaContrast[index]; sumEdge += edgeEvidence[index];
      sumX += index % width; sumY += Math.floor(index / width); minIndex = Math.min(minIndex, index);
    }
    const area = indices.length, cx = sumX / area, cy = sumY / area;
    const meanContrast = sumContrast / area, meanAlphaContrast = sumAlpha / area, meanEdge = sumEdge / area;
    const centerDistance = Math.hypot(cx - centerX, cy - centerY) / diagonal;
    const areaRatio = area / Math.max(1, roiInfo.count);
    const score = areaRatio * 0.55 + Math.min(1, Math.max(meanContrast, meanAlphaContrast) / 255) * 0.30 + Math.max(0, 1 - centerDistance) * 0.10 + Math.min(1, meanEdge / 255) * 0.05;
    return { indices, area, cx, cy, meanContrast, meanAlphaContrast, meanEdge, centerDistance, score, minIndex };
  };
  const summaries = components.map(summarize).sort((a, b) => b.score - a.score || b.area - a.area || b.meanContrast - a.meanContrast || a.centerDistance - b.centerDistance || a.minIndex - b.minIndex);
  if (!selected && summaries.length) selected = summaries[0].indices;
  if (selected) for (const index of selected) alpha[index] = 255;
  const selectedSummary = selected ? summarize(selected) : null;
  const confidence = selectedSummary ? clamp(selectedSummary.score, 0, 1) : 0;
  const insufficient = !selectedSummary || (selectedSummary.meanContrast < colorThreshold && selectedSummary.meanAlphaContrast < alphaThreshold && selectedSummary.meanEdge < edgeThreshold);
  if (insufficient && !normalizedSeed) alpha.fill(0);

  return makeSelection('object-selection', width, height, alpha, {
    source: 'object-selection',
    roi: region,
    roiPixels: roiInfo.count,
    seed: normalizedSeed ? { x: normalizedSeed.x, y: normalizedSeed.y } : null,
    visited: work.count,
    candidateCount: components.length,
    confidence: +confidence.toFixed(6),
    evidence: {
      background: background.map(value => +value.toFixed(6)),
      boundarySamples: boundary.length,
      selectedArea: insufficient && !normalizedSeed ? 0 : selectedSummary?.area || 0,
      meanColorContrast: +(selectedSummary?.meanContrast || 0).toFixed(6),
      meanAlphaContrast: +(selectedSummary?.meanAlphaContrast || 0).toFixed(6),
      meanEdge: +(selectedSummary?.meanEdge || 0).toFixed(6),
      seedUsed: Boolean(normalizedSeed),
      seedFallback,
      insufficientEvidence: Boolean(insufficient && !normalizedSeed)
    }
  });
}
