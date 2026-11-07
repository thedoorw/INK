import { clamp } from '../../core/index.js';
import { buildNaturalMediaStamps, mediaHexToRGBA, naturalMediaFingerprint, naturalMediaRasterScale } from '../natural-media-utils.js';
import { MultiChannelInkSurface } from '../multi-channel-ink.js';
import { paperProfileFingerprint } from '../paper-profile.js';
import { normalizeNaturalMediaRunEntry, prepareNaturalMediaRun, supportsNaturalMediaRun } from '../natural-media-run-utils.js';

const multiChannelCanvasFactory = () => document.createElement('canvas');

export class Canvas2DMultiChannelInkRenderer {
  constructor({ canvasFactory = multiChannelCanvasFactory, cacheLimit = 20, maxDimension = 1536, maxPixels = 1250000 } = {}) {
    this.canvasFactory = canvasFactory;this.cacheLimit = cacheLimit;this.maxDimension = maxDimension;this.maxPixels = maxPixels;
    this.cache = new Map();this.stats = { backend: 'canvas2d-multichannel', runs: 0, strokes: 0, mixingStrokes: 0, stamps: 0, mixerStamps: 0, transportedPigment: 0, pixels: 0, cacheHits: 0, cacheMisses: 0, preparations: 0, preparationSkips: 0, evictions: 0, skipped: 0 };
  }

  supports(entries, { minimum = 2 } = {}) {
    return supportsNaturalMediaRun(entries, { minimum, includeMixers: true });
  }

  render(entries, paper = {}, options = {}) {
    const minimumStrokes = Math.max(1, Math.trunc(options.minimumStrokes ?? 2));
    if (!this.supports(entries, { minimum: minimumStrokes })) { this.stats.skipped++;return null; }
    const preferredScale = clamp(options.preferredScale ?? 1.35, .18, 6);
    const maxDimension = Math.max(128, options.maxDimension ?? this.maxDimension);
    const maxPixels = Math.max(65536, options.maxPixels ?? this.maxPixels);
    const cacheable = options.transient !== true;
    const normalizedEntries = cacheable ? entries.map(normalizeNaturalMediaRunEntry) : null;
    const key = cacheable
      ? `${paperProfileFingerprint(paper)}|request:${preferredScale}:${maxDimension}:${maxPixels}|${normalizedEntries.map(entry => `${naturalMediaFingerprint(entry.stroke, 1)}:${JSON.stringify([entry.stroke.points || [], entry.matrix, entry.opacity])}`).join('|')}`
      : null;
    if (cacheable && this.cache.has(key)) {
      const result = this.cache.get(key);this.cache.delete(key);this.cache.set(key, result);this.stats.cacheHits++;this.stats.preparationSkips++;return result;
    }
    this.stats.cacheMisses++;this.stats.preparations++;
    const run = prepareNaturalMediaRun(entries);if (!run.bounds) return null;
    let scale = naturalMediaRasterScale(run.bounds, preferredScale, maxDimension);
    const projectedPixels = run.bounds.w * scale * run.bounds.h * scale;
    if (projectedPixels > maxPixels) scale *= Math.sqrt(maxPixels / projectedPixels);
    scale = clamp(scale, .18, preferredScale);
    const width = Math.max(1, Math.ceil(run.bounds.w * scale)), height = Math.max(1, Math.ceil(run.bounds.h * scale));
    const surface = new MultiChannelInkSurface(width, height, { paper, originX: run.bounds.x, originY: run.bounds.y, scale });
    for (const entry of run.strokes) {
      const stroke = entry.stroke;
      if (stroke.kind === 'blender' || stroke.kind === 'smudge') {
        const mode = stroke.kind;
        const strength = mode === 'blender' ? (stroke.blend ?? .92) : (stroke.smudge ?? .94);
        for (const stamp of entry.stamps) surface.transportStamp(stamp, {
          mode, strength, drag: stroke.drag ?? (mode === 'smudge' ? .82 : .32), opacity: entry.opacity
        });
        if (mode === 'smudge') surface.simulate({ steps: 1, diffusion: .04, evaporation: .012, deposition: .025 });
        continue;
      }
      const rgba = mediaHexToRGBA(stroke.color || '#202020', entry.opacity);
      for (const stamp of entry.stamps) surface.depositStamp(stamp, rgba, {
        flow: stroke.flow ?? .82, wetness: stroke.wetness ?? .35,
        granulation: stroke.grain ?? (stroke.kind === 'drybrush' ? .82 : .18), opacity: entry.opacity
      });
      surface.simulate({ steps: stroke.wetness > .7 ? 2 : 1, diffusion: .12 + (stroke.wetness ?? 0) * .16, evaporation: .018 + (1 - (stroke.wetness ?? 0)) * .045, deposition: .08 + (paper.absorbency ?? .58) * .08 });
    }
    surface.simulate({ steps: 2, diffusion: .17, evaporation: .025, deposition: .12 });
    const canvas = this.canvasFactory();canvas.width = width;canvas.height = height;
    const context = canvas.getContext?.('2d');if (!context) return null;
    const bytes = surface.compositeRGBA();
    const imageData = context.createImageData ? context.createImageData(width, height) : null;
    if (!imageData) return null;imageData.data.set(bytes);context.putImageData(imageData, 0, 0);
    const result = { canvas, x: run.bounds.x, y: run.bounds.y, w: run.bounds.w, h: run.bounds.h, scale, strokes: run.strokes.length, stamps: surface.stats.stamps, backend: 'canvas2d-multichannel', diagnostics: surface.diagnostics() };
    if (cacheable) { this.cache.set(key, result);this.trimCache(); }this.stats.runs++;this.stats.strokes += run.strokes.length;this.stats.mixingStrokes += run.strokes.filter(entry => ['blender','smudge'].includes(entry.stroke.kind)).length;this.stats.stamps += surface.stats.stamps;this.stats.mixerStamps += surface.stats.mixerStamps;this.stats.transportedPigment += surface.stats.transportedPigment;this.stats.pixels += width * height;
    return result;
  }

  trimCache() { while (this.cache.size > this.cacheLimit) { const key = this.cache.keys().next().value;this.cache.delete(key);this.stats.evictions++; } }
  clearCache() { this.cache.clear(); }
  diagnostics() { return { ...this.stats, cacheEntries: this.cache.size }; }
}
