import { createTilePlan } from './gpu-resource-budget.js';

const defaultTiledCanvasFactory = () => document.createElement('canvas');
const tiledExportNow = () => Number(globalThis.performance?.now?.() ?? Date.now());

export class TiledExportCancelledError extends Error {
  constructor(message, checkpoint, canvas = null) {
    super(message || 'Tiled export cancelled');
    this.name = 'TiledExportCancelledError';
    this.checkpoint = checkpoint;
    this.canvas = canvas;
  }
}

function planFingerprint(plan) {
  return [plan.width, plan.height, plan.scale, plan.tileSize, plan.overlap, plan.columns, plan.rows, plan.tiles.length].join(':');
}

export function createTiledExportCheckpoint(plan, nextTileIndex, { completedTiles = nextTileIndex, startedAt = Date.now() } = {}) {
  return {
    schema: 'INK_TILED_EXPORT_CHECKPOINT_V1',
    planFingerprint: planFingerprint(plan),
    nextTileIndex: Math.max(0, Math.min(plan.tiles.length, Math.floor(nextTileIndex || 0))),
    completedTiles: Math.max(0, Math.floor(completedTiles || 0)),
    totalTiles: plan.tiles.length,
    startedAt
  };
}

export function validateTiledExportCheckpoint(checkpoint, plan) {
  if (!checkpoint || checkpoint.schema !== 'INK_TILED_EXPORT_CHECKPOINT_V1') return { valid: false, reason: 'invalid-schema' };
  if (checkpoint.planFingerprint !== planFingerprint(plan)) return { valid: false, reason: 'plan-mismatch' };
  if (!Number.isInteger(checkpoint.nextTileIndex) || checkpoint.nextTileIndex < 0 || checkpoint.nextTileIndex > plan.tiles.length) return { valid: false, reason: 'invalid-index' };
  return { valid: true, reason: null };
}

function checkCancelled(signal, isCancelled, checkpoint, canvas) {
  if (signal?.aborted || isCancelled?.()) throw new TiledExportCancelledError('Tiled export cancelled', checkpoint, canvas);
}

export async function renderTiledCanvas({
  bounds,
  scale = 1,
  tileSize = 2048,
  overlap = 32,
  maxOutputPixels = 36_000_000,
  maxOutputDimension = 16384,
  canvasFactory = defaultTiledCanvasFactory,
  renderTile,
  onProgress = null,
  onCheckpoint = null,
  signal = null,
  isCancelled = null,
  checkpoint = null,
  outputCanvas = null,
  yieldEvery = 4
} = {}) {
  if (typeof renderTile !== 'function') throw new TypeError('renderTile callback is required');
  const plan = createTilePlan(bounds, scale, { tileSize, overlap });
  if (plan.width > maxOutputDimension || plan.height > maxOutputDimension || plan.width * plan.height > maxOutputPixels) {
    throw new Error(`Tiled export exceeds ${maxOutputDimension}px / ${maxOutputPixels} pixel limit`);
  }
  const resume = checkpoint ? validateTiledExportCheckpoint(checkpoint, plan) : { valid: true };
  if (!resume.valid) throw new Error(`Invalid tiled export checkpoint: ${resume.reason}`);
  const startTileIndex = checkpoint?.nextTileIndex || 0;
  const startedAt = checkpoint?.startedAt || Date.now();
  const output = outputCanvas || canvasFactory();
  if (output.width !== plan.width) output.width = plan.width;
  if (output.height !== plan.height) output.height = plan.height;
  const outputContext = output.getContext?.('2d');
  if (!outputContext) throw new Error('Output Canvas 2D unavailable');
  const tileCanvas = canvasFactory();
  const started = tiledExportNow();
  let peakTilePixels = 0;
  let completed = startTileIndex;
  let currentCheckpoint = createTiledExportCheckpoint(plan, startTileIndex, { completedTiles: startTileIndex, startedAt });
  checkCancelled(signal, isCancelled, currentCheckpoint, output);
  try {
    for (let index = startTileIndex; index < plan.tiles.length; index++) {
      const tile = plan.tiles[index];
      checkCancelled(signal, isCancelled, currentCheckpoint, output);
      tileCanvas.width = tile.width;
      tileCanvas.height = tile.height;
      const tileContext = tileCanvas.getContext?.('2d');
      if (!tileContext) throw new Error('Tile Canvas 2D unavailable');
      tileContext.setTransform(1, 0, 0, 1, 0, 0);
      tileContext.clearRect(0, 0, tile.width, tile.height);
      await renderTile(tileContext, tile, plan, { signal, index, checkpoint: currentCheckpoint });
      checkCancelled(signal, isCancelled, currentCheckpoint, output);
      outputContext.drawImage(
        tileCanvas,
        tile.cropX,
        tile.cropY,
        tile.coreWidth,
        tile.coreHeight,
        tile.coreX,
        tile.coreY,
        tile.coreWidth,
        tile.coreHeight
      );
      peakTilePixels = Math.max(peakTilePixels, tile.width * tile.height);
      completed = index + 1;
      currentCheckpoint = createTiledExportCheckpoint(plan, completed, { completedTiles: completed, startedAt });
      onProgress?.({ completed, total: plan.tiles.length, ratio: completed / plan.tiles.length, tile, checkpoint: currentCheckpoint });
      onCheckpoint?.(currentCheckpoint);
      if (yieldEvery > 0 && completed % yieldEvery === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (error) {
    if (error instanceof TiledExportCancelledError) throw error;
    if (signal?.aborted || isCancelled?.()) throw new TiledExportCancelledError('Tiled export cancelled', currentCheckpoint, output);
    error.checkpoint = currentCheckpoint;
    error.canvas = output;
    throw error;
  }
  return {
    canvas: output,
    plan,
    checkpoint: currentCheckpoint,
    stats: {
      tiles: plan.tiles.length,
      completed,
      resumedFrom: startTileIndex,
      peakTilePixels,
      outputPixels: plan.width * plan.height,
      durationMs: tiledExportNow() - started,
      complete: completed === plan.tiles.length
    }
  };
}

export class TiledExportJob {
  constructor(options = {}) {
    this.options = { ...options };
    this.controller = new AbortController();
    this.state = 'idle';
    this.checkpoint = options.checkpoint || null;
    this.outputCanvas = options.outputCanvas || null;
    this.result = null;
    this.error = null;
    this.startedAt = null;
    this.finishedAt = null;
  }

  cancel() {
    if (this.state === 'running') {
      this.state = 'cancelling';
      this.controller.abort();
      return true;
    }
    return false;
  }

  async run(overrides = {}) {
    if (this.state === 'running' || this.state === 'cancelling') throw new Error('Tiled export job is already running');
    this.state = 'running';
    this.error = null;
    this.startedAt = Date.now();
    const externalProgress = overrides.onProgress || this.options.onProgress;
    try {
      const result = await renderTiledCanvas({
        ...this.options,
        ...overrides,
        signal: this.controller.signal,
        checkpoint: overrides.checkpoint || this.checkpoint,
        outputCanvas: overrides.outputCanvas || this.outputCanvas,
        onProgress: progress => {
          this.checkpoint = progress.checkpoint;
          externalProgress?.(progress);
        },
        onCheckpoint: checkpoint => {
          this.checkpoint = checkpoint;
          (overrides.onCheckpoint || this.options.onCheckpoint)?.(checkpoint);
        }
      });
      this.result = result;
      this.outputCanvas = result.canvas;
      this.checkpoint = result.checkpoint;
      this.state = 'completed';
      return result;
    } catch (error) {
      this.error = error;
      if (error instanceof TiledExportCancelledError) {
        this.checkpoint = error.checkpoint;
        this.outputCanvas = error.canvas;
        this.state = 'cancelled';
      } else {
        this.checkpoint = error.checkpoint || this.checkpoint;
        this.outputCanvas = error.canvas || this.outputCanvas;
        this.state = 'failed';
      }
      throw error;
    } finally {
      this.finishedAt = Date.now();
    }
  }

  resume(overrides = {}) {
    if (!this.checkpoint || !this.outputCanvas) throw new Error('No resumable tiled export state available');
    this.controller = new AbortController();
    return this.run({ ...overrides, checkpoint: this.checkpoint, outputCanvas: this.outputCanvas });
  }

  diagnostics() {
    return {
      state: this.state,
      checkpoint: this.checkpoint ? { ...this.checkpoint } : null,
      hasOutputCanvas: Boolean(this.outputCanvas),
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      durationMs: this.startedAt ? (this.finishedAt || Date.now()) - this.startedAt : 0,
      error: this.error ? String(this.error.message || this.error) : null
    };
  }
}
