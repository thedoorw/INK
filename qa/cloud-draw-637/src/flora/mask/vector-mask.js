import { artboardTrimBounds } from '../../document/artboard.js';

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const stableString = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.keys(item).sort().reduce((out, name) => (out[name] = item[name], out), {})
  : item);
const floraMaskFnv1a = text => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};
const floraMaskFnv1aBytes = bytes => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export function vectorPathHash(path) {
  return floraMaskFnv1a(stableString(path));
}

export function vectorMaskHash(mask) {
  return floraMaskFnv1a(stableString({ path: mask?.path || [], excludePaths: mask?.excludePaths || [] }));
}

export function createVectorMask(region, { feather = 0 } = {}) {
  if (!region?.regionId || !Array.isArray(region.path)) throw new Error('invalid region');
  if (!Number.isFinite(feather) || feather < 0 || feather > .1) throw new Error('feather out of range');
  return {
    maskId: `mask:${region.regionId}`,
    regionId: region.regionId,
    path: structuredClone(region.path),
    feather,
    visible: true,
    cacheKey: null,
    cacheRevision: 0,
    vectorHash: vectorMaskHash({ path: region.path, excludePaths: [] })
  };
}

export function vectorPathBounds(path) {
  if (!Array.isArray(path) || !path.length) throw new Error('invalid vector path');
  const first = path[0];
  if (Number.isFinite(first.cx) && Number.isFinite(first.cy) && Number.isFinite(first.rx) && Number.isFinite(first.ry)) {
    return { x: first.cx - first.rx, y: first.cy - first.ry, w: first.rx * 2, h: first.ry * 2 };
  }
  const points = path.filter(finitePoint);
  if (!points.length) throw new Error('invalid polygon path');
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

function floraMaskPolygonContains(path, point) {
  let inside = false;
  for (let index = 0, previous = path.length - 1; index < path.length; previous = index, index += 1) {
    const a = path[index], b = path[previous];
    const intersects = ((a.y > point.y) !== (b.y > point.y)) &&
      point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || Number.EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function vectorPathContains(path, point) {
  if (!Array.isArray(path) || !path.length || !finitePoint(point)) return false;
  const first = path[0];
  if (Number.isFinite(first.cx)) {
    const rx = Math.max(Number.EPSILON, first.rx), ry = Math.max(Number.EPSILON, first.ry);
    const dx = (point.x - first.cx) / rx, dy = (point.y - first.cy) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return floraMaskPolygonContains(path, point);
}

function segmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (!length2) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2));
  const x = a.x + dx * t, y = a.y + dy * t;
  return Math.hypot(point.x - x, point.y - y);
}

export function vectorPathEdgeDistance(path, point) {
  if (!Array.isArray(path) || !path.length || !finitePoint(point)) return 0;
  const first = path[0];
  if (Number.isFinite(first.cx)) {
    const rx = Math.max(Number.EPSILON, first.rx), ry = Math.max(Number.EPSILON, first.ry);
    const normalized = Math.hypot((point.x - first.cx) / rx, (point.y - first.cy) / ry);
    return Math.abs(1 - normalized) * Math.min(rx, ry);
  }
  let minimum = Infinity;
  for (let index = 0; index < path.length; index += 1) minimum = Math.min(minimum, segmentDistance(point, path[index], path[(index + 1) % path.length]));
  return Number.isFinite(minimum) ? minimum : 0;
}

export function maskAlphaAt(mask, x, y) {
  if (!mask || !vectorPathContains(mask.path, { x, y })) return 0;
  if ((mask.excludePaths || []).some(path => vectorPathContains(path, { x, y }))) return 0;
  const feather = Number(mask.feather) || 0;
  if (feather <= 0) return 1;
  return clamp01(vectorPathEdgeDistance(mask.path, { x, y }) / feather);
}

export function normalizedPointToWorld(page, point) {
  const trim = artboardTrimBounds(page);
  return { x: trim.x + point.x * trim.w, y: trim.y + point.y * trim.h };
}

export function worldPointToNormalized(page, point) {
  const trim = artboardTrimBounds(page);
  return { x: (point.x - trim.x) / trim.w, y: (point.y - trim.y) / trim.h };
}

export function traceVectorPathWorld(ctx, path, page) {
  if (!ctx || !Array.isArray(path) || !path.length) return false;
  const trim = artboardTrimBounds(page), first = path[0];
  if (Number.isFinite(first.cx)) {
    ctx.ellipse(trim.x + first.cx * trim.w, trim.y + first.cy * trim.h, Math.abs(first.rx * trim.w), Math.abs(first.ry * trim.h), 0, 0, Math.PI * 2);
    return true;
  }
  const points = path.map(point => normalizedPointToWorld(page, point));
  if (!points.length) return false;
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
  ctx.closePath();
  return true;
}

export function traceVectorMaskWorld(ctx, mask, page) {
  if (!ctx || !mask || !traceVectorPathWorld(ctx, mask.path, page)) return false;
  for (const path of mask.excludePaths || []) traceVectorPathWorld(ctx, path, page);
  return true;
}

export function rasterizeVectorMask(mask, width = 128, height = 181) {
  if (!mask?.maskId || !Array.isArray(mask.path)) throw new Error('invalid mask');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8 || width > 2048 || height > 2048) throw new Error('invalid raster size');
  const alpha = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x + .5) / width, ny = (y + .5) / height;
      alpha[y * width + x] = Math.round(maskAlphaAt(mask, nx, ny) * 255);
    }
  }
  const alphaHash = floraMaskFnv1aBytes(alpha);
  return { width, height, alpha, alphaHash, maskId: mask.maskId, vectorHash: vectorMaskHash(mask), feather: mask.feather, excludeCount: (mask.excludePaths || []).length };
}

export class RasterMaskCache {
  constructor() { this.cache = new Map(); this.builds = 0; this.invalidations = 0; }
  key(mask, width, height) {
    return `${mask.maskId}:${mask.cacheRevision || 0}:${vectorMaskHash(mask)}:${mask.feather}:${width}x${height}`;
  }
  get(mask, width, height) { return this.cache.get(this.key(mask, width, height)); }
  set(mask, width, height, value) {
    const key = this.key(mask, width, height);
    this.cache.set(key, value);
    mask.cacheKey = key;
    return value;
  }
  getOrCreate(mask, width = 128, height = 181) {
    const existing = this.get(mask, width, height);
    if (existing) return existing;
    this.builds += 1;
    return this.set(mask, width, height, rasterizeVectorMask(mask, width, height));
  }
  invalidate(identifier = null) {
    if (!identifier) {
      const count = this.cache.size;
      this.cache.clear();
      this.invalidations += count ? 1 : 0;
      return count;
    }
    let removed = 0;
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(`${identifier}:`) || key.startsWith(`mask:${identifier}:`) || key.includes(`:${identifier}:`)) {
        this.cache.delete(key);
        removed += 1;
      }
    }
    if (removed) this.invalidations += 1;
    return removed;
  }
  clear() { return this.invalidate(); }
  snapshot() { return { cache: new Map([...this.cache.entries()].map(([key, value]) => [key, structuredClone(value)])), builds: this.builds, invalidations: this.invalidations }; }
  restore(snapshot) {
    if (!snapshot || !(snapshot.cache instanceof Map)) throw new Error('invalid mask cache snapshot');
    this.cache = new Map([...snapshot.cache.entries()].map(([key, value]) => [key, structuredClone(value)]));
    this.builds = snapshot.builds; this.invalidations = snapshot.invalidations;
  }
  diagnostics() { return { entries: this.cache.size, builds: this.builds, invalidations: this.invalidations, keys: [...this.cache.keys()] }; }
}
