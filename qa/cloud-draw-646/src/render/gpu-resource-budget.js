import { clamp, unionBounds } from '../core/index.js';

export function estimateTextureBytes(width, height, { channels = 4, bytesPerChannel = 1, mipmapped = false, attachments = 1 } = {}) {
  const w = Math.max(0, Math.ceil(Number(width) || 0));
  const h = Math.max(0, Math.ceil(Number(height) || 0));
  const base = w * h * Math.max(1, channels) * Math.max(1, bytesPerChannel) * Math.max(1, attachments);
  return Math.ceil(base * (mipmapped ? 4 / 3 : 1));
}

export class GPUResourceBudget {
  constructor({ budgetBytes = 128 * 1024 * 1024 } = {}) {
    this.budgetBytes = Math.max(4 * 1024 * 1024, Number(budgetBytes) || 0);
    this.resources = new Map();
    this.clock = 0;
    this.stats = { allocations: 0, releases: 0, evictions: 0, rejected: 0, peakBytes: 0 };
  }

  get usedBytes() {
    let total = 0;
    for (const item of this.resources.values()) total += item.bytes;
    return total;
  }

  touch(id) {
    const item = this.resources.get(id);
    if (!item) return false;
    item.lastUsed = ++this.clock;
    return true;
  }

  reserve(id, bytes, { pinned = false, dispose = null, type = 'texture' } = {}) {
    const size = Math.max(0, Math.ceil(Number(bytes) || 0));
    if (!id || !size || size > this.budgetBytes) {
      this.stats.rejected++;
      return false;
    }
    if (this.resources.has(id)) this.release(id);
    this.evictToFit(size);
    if (this.usedBytes + size > this.budgetBytes) {
      this.stats.rejected++;
      return false;
    }
    this.resources.set(id, { id, bytes: size, pinned: Boolean(pinned), dispose, type, lastUsed: ++this.clock });
    this.stats.allocations++;
    this.stats.peakBytes = Math.max(this.stats.peakBytes, this.usedBytes);
    return true;
  }

  release(id, { evicted = false } = {}) {
    const item = this.resources.get(id);
    if (!item) return false;
    this.resources.delete(id);
    try { item.dispose?.(); } catch {}
    this.stats.releases++;
    if (evicted) this.stats.evictions++;
    return true;
  }

  evictToFit(incomingBytes = 0) {
    const candidates = [...this.resources.values()].filter(item => !item.pinned).sort((a, b) => a.lastUsed - b.lastUsed);
    for (const item of candidates) {
      if (this.usedBytes + incomingBytes <= this.budgetBytes) break;
      this.release(item.id, { evicted: true });
    }
  }

  clear() {
    for (const id of [...this.resources.keys()]) this.release(id);
  }

  diagnostics() {
    const usedBytes = this.usedBytes;
    return {
      ...this.stats,
      budgetBytes: this.budgetBytes,
      usedBytes,
      availableBytes: Math.max(0, this.budgetBytes - usedBytes),
      utilization: usedBytes / this.budgetBytes,
      resources: this.resources.size,
      byType: [...this.resources.values()].reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + item.bytes;
        return acc;
      }, {})
    };
  }
}

export function createTilePlan(bounds, scale = 1, options = {}) {
  const tileSize = clamp(Math.floor(options.tileSize || 2048), 256, 8192);
  const overlap = clamp(Math.floor(options.overlap ?? 32), 0, Math.floor(tileSize / 4));
  const maxTiles = Math.max(1, Math.floor(options.maxTiles || 4096));
  const width = Math.max(1, Math.ceil(Math.max(0, Number(bounds?.w) || 0) * scale));
  const height = Math.max(1, Math.ceil(Math.max(0, Number(bounds?.h) || 0) * scale));
  const step = Math.max(1, tileSize - overlap * 2);
  const columns = Math.ceil(width / step);
  const rows = Math.ceil(height / step);
  if (columns * rows > maxTiles) throw new Error(`Tile plan exceeds ${maxTiles} tiles`);
  const tiles = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const coreX = column * step;
      const coreY = row * step;
      const coreW = Math.min(step, width - coreX);
      const coreH = Math.min(step, height - coreY);
      const x = Math.max(0, coreX - overlap);
      const y = Math.max(0, coreY - overlap);
      const right = Math.min(width, coreX + coreW + overlap);
      const bottom = Math.min(height, coreY + coreH + overlap);
      tiles.push({
        index: tiles.length,
        row,
        column,
        x,
        y,
        width: right - x,
        height: bottom - y,
        coreX,
        coreY,
        coreWidth: coreW,
        coreHeight: coreH,
        cropX: coreX - x,
        cropY: coreY - y
      });
    }
  }
  return { width, height, scale, tileSize, overlap, step, columns, rows, tiles };
}

export class DirtyRegionTracker {
  constructor({ mergeGap = 8, maxRegions = 64 } = {}) {
    this.mergeGap = Math.max(0, mergeGap);
    this.maxRegions = Math.max(1, maxRegions);
    this.regions = [];
    this.full = false;
  }

  add(bounds) {
    if (!bounds || bounds.w <= 0 || bounds.h <= 0 || this.full) return;
    let next = { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h };
    const kept = [];
    for (const region of this.regions) {
      const expanded = {
        x: region.x - this.mergeGap,
        y: region.y - this.mergeGap,
        w: region.w + this.mergeGap * 2,
        h: region.h + this.mergeGap * 2
      };
      const overlaps = !(next.x + next.w < expanded.x || expanded.x + expanded.w < next.x || next.y + next.h < expanded.y || expanded.y + expanded.h < next.y);
      if (overlaps) next = unionBounds(next, region);
      else kept.push(region);
    }
    kept.push(next);
    this.regions = kept;
    if (this.regions.length > this.maxRegions) {
      this.regions = [this.regions.reduce((acc, region) => unionBounds(acc, region), null)];
      this.full = true;
    }
  }

  consume() {
    const result = this.regions.map(region => ({ ...region }));
    this.clear();
    return result;
  }

  clear() {
    this.regions = [];
    this.full = false;
  }

  diagnostics() {
    return { regions: this.regions.length, full: this.full, bounds: this.regions.reduce((acc, region) => unionBounds(acc, region), null) };
  }
}
