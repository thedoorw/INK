import { clamp } from '../core/index.js';
import { PersistentTileAtlas } from './tile-atlas.js';

const defaultLiveTileCanvasFactory = () => document.createElement('canvas');
const boundsKey = bounds => [bounds.x, bounds.y, bounds.w, bounds.h].map(value => Number(value).toFixed(3)).join(':');

export class LiveCanvasTileRenderer {
  constructor({
    canvasFactory = defaultLiveTileCanvasFactory,
    tileSize = 1024,
    overlap = 32,
    budgetBytes = 96 * 1024 * 1024,
    onReady = null
  } = {}) {
    this.canvasFactory = canvasFactory;
    this.tileSize = tileSize;
    this.overlap = overlap;
    this.budgetBytes = budgetBytes;
    this.onReady = onReady;
    this.atlas = null;
    this.key = '';
    this.updating = false;
    this.pending = false;
    this.lastError = null;
    this.stats = { schedules: 0, completed: 0, fallbacks: 0, draws: 0, invalidations: 0 };
  }

  ensure(bounds, scale = 1) {
    const resolvedScale = clamp(Number(scale) || 1, 0.5, 4);
    const key = `${boundsKey(bounds)}@${resolvedScale.toFixed(3)}`;
    if (this.atlas && this.key === key) return false;
    this.atlas?.clear?.();
    this.atlas = new PersistentTileAtlas({
      bounds,
      scale: resolvedScale,
      tileSize: this.tileSize,
      overlap: this.overlap,
      budgetBytes: this.budgetBytes,
      resourceType: 'live-canvas-tile'
    });
    this.key = key;
    this.lastError = null;
    return true;
  }

  invalidate(bounds = null) {
    if (!this.atlas) return 0;
    this.stats.invalidations++;
    return bounds ? this.atlas.markDirty(bounds) : this.atlas.markAllDirty();
  }

  isReady() {
    return Boolean(this.atlas && this.atlas.dirtyCount() === 0 && [...this.atlas.records.values()].every(record => record.resource));
  }

  draw(ctx) {
    if (!this.isReady()) {
      this.stats.fallbacks++;
      return false;
    }
    const { bounds, scale, plan } = this.atlas;
    for (const tile of plan.tiles) {
      const resource = this.atlas.getTile(tile.index);
      if (!resource) return false;
      ctx.drawImage(
        resource,
        tile.cropX,
        tile.cropY,
        tile.coreWidth,
        tile.coreHeight,
        bounds.x + tile.coreX / scale,
        bounds.y + tile.coreY / scale,
        tile.coreWidth / scale,
        tile.coreHeight / scale
      );
    }
    this.stats.draws++;
    return true;
  }

  async schedule(renderTile) {
    if (!this.atlas || typeof renderTile !== 'function') return false;
    if (this.updating) {
      this.pending = true;
      return false;
    }
    if (this.atlas.dirtyCount() === 0) return true;
    this.updating = true;
    this.pending = false;
    this.stats.schedules++;
    try {
      await this.atlas.updateDirty({
        resourceFactory: async tile => {
          const canvas = this.canvasFactory();
          canvas.width = tile.width;
          canvas.height = tile.height;
          canvas.dispose = canvas.dispose || (() => {});
          return { resource: canvas, bytes: tile.width * tile.height * 4 };
        },
        renderTile: async (canvas, tile, plan) => {
          const context = canvas.getContext?.('2d');
          if (!context) throw new Error('Live tile Canvas 2D unavailable');
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.clearRect(0, 0, canvas.width, canvas.height);
          await renderTile(context, tile, plan);
        }
      });
      this.stats.completed++;
      this.lastError = null;
      this.onReady?.();
      return true;
    } catch (error) {
      this.lastError = String(error?.message || error);
      return false;
    } finally {
      this.updating = false;
      if (this.pending && this.atlas?.dirtyCount()) queueMicrotask(() => this.schedule(renderTile));
    }
  }

  clear() {
    this.atlas?.clear?.();
    this.atlas = null;
    this.key = '';
  }

  diagnostics() {
    return {
      ready: this.isReady(),
      updating: this.updating,
      pending: this.pending,
      key: this.key,
      error: this.lastError,
      stats: { ...this.stats },
      atlas: this.atlas?.diagnostics?.() || null
    };
  }
}
