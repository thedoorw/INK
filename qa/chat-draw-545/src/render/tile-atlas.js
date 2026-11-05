import { clamp } from '../core/index.js';
import { createTilePlan, estimateTextureBytes, GPUResourceBudget } from './gpu-resource-budget.js';

const tileAtlasNow = () => Number(globalThis.performance?.now?.() ?? Date.now());
const intersects = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);

function normalizeAtlasBounds(bounds) {
  return {
    x: Number(bounds?.x) || 0,
    y: Number(bounds?.y) || 0,
    w: Math.max(1, Number(bounds?.w) || 1),
    h: Math.max(1, Number(bounds?.h) || 1)
  };
}

function tileAtlasAbortError(message = 'Tile atlas update cancelled') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export class PersistentTileAtlas {
  constructor({
    bounds = { x: 0, y: 0, w: 1, h: 1 },
    scale = 1,
    tileSize = 2048,
    overlap = 32,
    maxTiles = 4096,
    budget = null,
    budgetBytes = 128 * 1024 * 1024,
    channels = 4,
    bytesPerChannel = 1,
    attachments = 1,
    resourceType = 'tile-atlas'
  } = {}) {
    this.budget = budget || new GPUResourceBudget({ budgetBytes });
    this.channels = Math.max(1, Math.floor(channels));
    this.bytesPerChannel = Math.max(1, Math.floor(bytesPerChannel));
    this.attachments = Math.max(1, Math.floor(attachments));
    this.resourceType = resourceType;
    this.generation = 0;
    this.clock = 0;
    this.stats = {
      configured: 0,
      dirtyMarks: 0,
      fullInvalidations: 0,
      renders: 0,
      cacheHits: 0,
      allocations: 0,
      evictions: 0,
      failedAllocations: 0,
      cancelledUpdates: 0,
      durationMs: 0
    };
    this.configure({ bounds, scale, tileSize, overlap, maxTiles });
  }

  configure({ bounds = this.bounds, scale = this.scale, tileSize = this.tileSize, overlap = this.overlap, maxTiles = this.maxTiles } = {}) {
    const nextBounds = normalizeAtlasBounds(bounds);
    const nextScale = clamp(Number(scale) || 1, 0.01, 64);
    const nextPlan = createTilePlan(nextBounds, nextScale, { tileSize, overlap, maxTiles });
    this.clear();
    this.bounds = nextBounds;
    this.scale = nextScale;
    this.tileSize = nextPlan.tileSize;
    this.overlap = nextPlan.overlap;
    this.maxTiles = Math.max(1, Math.floor(maxTiles || 4096));
    this.plan = nextPlan;
    this.generation++;
    this.records = new Map(nextPlan.tiles.map(tile => [tile.index, {
      tile,
      dirty: true,
      resource: null,
      bytes: 0,
      version: 0,
      lastUsed: 0,
      renderedAt: 0,
      error: null
    }]));
    this.stats.configured++;
    this.stats.fullInvalidations++;
    return this.plan;
  }

  tilePixelBounds(tile) {
    return { x: tile.coreX, y: tile.coreY, w: tile.coreWidth, h: tile.coreHeight };
  }

  worldToPixelBounds(bounds) {
    const b = normalizeAtlasBounds(bounds);
    return {
      x: (b.x - this.bounds.x) * this.scale,
      y: (b.y - this.bounds.y) * this.scale,
      w: b.w * this.scale,
      h: b.h * this.scale
    };
  }

  tilesForBounds(bounds, { pixelSpace = false } = {}) {
    const target = pixelSpace ? normalizeAtlasBounds(bounds) : this.worldToPixelBounds(bounds);
    return this.plan.tiles.filter(tile => intersects(this.tilePixelBounds(tile), target));
  }

  markDirty(bounds = null, options = {}) {
    if (!bounds) return this.markAllDirty();
    const tiles = this.tilesForBounds(bounds, options);
    for (const tile of tiles) {
      const record = this.records.get(tile.index);
      if (record) record.dirty = true;
    }
    this.stats.dirtyMarks += tiles.length;
    return tiles.length;
  }

  markAllDirty() {
    for (const record of this.records.values()) record.dirty = true;
    this.stats.fullInvalidations++;
    this.stats.dirtyMarks += this.records.size;
    return this.records.size;
  }

  resourceId(index) {
    return `${this.resourceType}:${this.generation}:${index}`;
  }

  releaseRecord(record, { evicted = false } = {}) {
    if (!record?.resource) return false;
    const id = this.resourceId(record.tile.index);
    const released = this.budget.release(id, { evicted });
    if (!released) {
      try { record.resource.dispose?.(); } catch {}
    }
    record.resource = null;
    record.bytes = 0;
    if (evicted) this.stats.evictions++;
    return true;
  }

  async ensureResource(record, resourceFactory) {
    if (record.resource) {
      this.budget.touch(this.resourceId(record.tile.index));
      record.lastUsed = ++this.clock;
      this.stats.cacheHits++;
      return record.resource;
    }
    if (typeof resourceFactory !== 'function') throw new TypeError('resourceFactory callback is required');
    const created = await resourceFactory(record.tile, this.plan);
    if (!created) throw new Error(`Tile ${record.tile.index} resource allocation returned no resource`);
    const resource = created.resource ?? created;
    const bytes = Math.max(1, Math.ceil(created.bytes || estimateTextureBytes(record.tile.width, record.tile.height, {
      channels: this.channels,
      bytesPerChannel: this.bytesPerChannel,
      attachments: this.attachments
    })));
    const id = this.resourceId(record.tile.index);
    const reserved = this.budget.reserve(id, bytes, {
      type: this.resourceType,
      dispose: () => {
        try { resource.dispose?.(); } catch {}
        if (record.resource === resource) {
          record.resource = null;
          record.bytes = 0;
          record.dirty = true;
        }
      }
    });
    if (!reserved) {
      this.stats.failedAllocations++;
      try { resource.dispose?.(); } catch {}
      throw new Error(`Tile atlas budget rejected ${bytes} bytes for tile ${record.tile.index}`);
    }
    record.resource = resource;
    record.bytes = bytes;
    record.lastUsed = ++this.clock;
    this.stats.allocations++;
    return resource;
  }

  async updateDirty({ resourceFactory, renderTile, signal = null, maxTiles = Infinity, onProgress = null } = {}) {
    if (typeof renderTile !== 'function') throw new TypeError('renderTile callback is required');
    const dirty = [...this.records.values()].filter(record => record.dirty).sort((a, b) => a.tile.index - b.tile.index);
    const limit = Math.min(dirty.length, Math.max(0, Math.floor(maxTiles)));
    const started = tileAtlasNow();
    let completed = 0;
    try {
      for (let index = 0; index < limit; index++) {
        if (signal?.aborted) throw tileAtlasAbortError();
        const record = dirty[index];
        const resource = await this.ensureResource(record, resourceFactory);
        if (signal?.aborted) throw tileAtlasAbortError();
        try {
          await renderTile(resource, record.tile, this.plan, { version: record.version + 1, generation: this.generation });
          record.version++;
          record.dirty = false;
          record.error = null;
          record.renderedAt = Date.now();
          record.lastUsed = ++this.clock;
          this.budget.touch(this.resourceId(record.tile.index));
          this.stats.renders++;
        } catch (error) {
          record.error = String(error?.message || error);
          record.dirty = true;
          throw error;
        }
        completed++;
        onProgress?.({ completed, total: limit, remaining: dirty.length - completed, ratio: limit ? completed / limit : 1, tile: record.tile });
        if (index % 4 === 3) await new Promise(resolve => setTimeout(resolve, 0));
      }
    } catch (error) {
      if (error?.name === 'AbortError') this.stats.cancelledUpdates++;
      throw error;
    } finally {
      const elapsed = tileAtlasNow() - started;
      this.stats.durationMs += elapsed;
    }
    return { completed, total: limit, remaining: this.dirtyCount(), generation: this.generation };
  }

  getTile(index, { touch = true } = {}) {
    const record = this.records.get(index);
    if (!record?.resource) return null;
    if (touch) {
      record.lastUsed = ++this.clock;
      this.budget.touch(this.resourceId(index));
      this.stats.cacheHits++;
    }
    return record.resource;
  }

  dirtyCount() {
    let count = 0;
    for (const record of this.records.values()) if (record.dirty) count++;
    return count;
  }

  clear() {
    if (!this.records) return;
    for (const record of this.records.values()) this.releaseRecord(record);
    this.records.clear();
  }

  diagnostics() {
    const allocated = [...this.records.values()].filter(record => record.resource).length;
    const errors = [...this.records.values()].filter(record => record.error).map(record => ({ tile: record.tile.index, error: record.error }));
    return {
      generation: this.generation,
      bounds: { ...this.bounds },
      scale: this.scale,
      tiles: this.records.size,
      allocated,
      dirty: this.dirtyCount(),
      clean: this.records.size - this.dirtyCount(),
      errors,
      stats: { ...this.stats },
      budget: this.budget.diagnostics()
    };
  }
}
