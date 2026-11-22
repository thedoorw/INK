import { Canvas2DNaturalMediaRenderer } from './canvas2d/natural-media-canvas2d.js';
import { Canvas2DMultiChannelInkRenderer } from './canvas2d/multi-channel-ink-canvas2d.js';
import { WebGLNaturalMediaRenderer } from './webgl/natural-media-webgl.js';
import { WebGLMultiChannelInkRenderer } from './webgl/multi-channel-ink-webgl.js';
import { isNaturalMediaMixerStroke, isNaturalMediaStroke } from './natural-media-utils.js';
import { supportsNaturalMediaRun } from './natural-media-run-utils.js';

export const NATURAL_MEDIA_RENDER_MODES = Object.freeze(['auto', 'gpu', 'canvas2d']);

export class NaturalMediaController {
  constructor({ preference = 'auto', onStatusChange = null, webglOptions = {}, multiChannelOptions = {} } = {}) {
    this.preference = NATURAL_MEDIA_RENDER_MODES.includes(preference) ? preference : 'auto';
    // Canvas 2D is the deterministic FLORA reference renderer. Explicit GPU mode remains available for comparison/acceleration.
    this.floraReferenceBackend = 'canvas2d';
    this.onStatusChange = onStatusChange;this.canvas2d = new Canvas2DNaturalMediaRenderer();
    this.multiChannelCanvas2d = new Canvas2DMultiChannelInkRenderer(multiChannelOptions.canvas2d || {});
    this.webgl = new WebGLNaturalMediaRenderer({ ...webglOptions, onStatusChange: () => this.emitStatus() });
    this.multiChannelWebgl = new WebGLMultiChannelInkRenderer({ ...(multiChannelOptions.webgl || {}), onStatusChange: () => this.emitStatus() });
    this.forcedReason = null;this.lastBackend = 'canvas2d';this.fallbacks = 0;this.batchFallbacks = 0;this.mixingRuns = 0;
    if (this.preference !== 'canvas2d') { this.webgl.initialize();this.multiChannelWebgl.initialize(); }
  }
  supports(stroke) { return isNaturalMediaStroke(stroke); }
  supportsRun(entries, options = {}) { return supportsNaturalMediaRun(entries, { ...options, includeMixers: true }); }
  setFrequencyVisibility(value = {}) {
    const result = this.canvas2d.setFrequencyVisibility(value);
    this.emitStatus();
    return result;
  }
  setPreference(preference) {
    if (!NATURAL_MEDIA_RENDER_MODES.includes(preference)) return false;
    this.preference = preference;this.forcedReason = null;
    if (preference !== 'canvas2d') { this.webgl.retry();this.multiChannelWebgl.retry(); }
    this.emitStatus();return true;
  }
  renderStroke(ctx, stroke) {
    if (!this.supports(stroke)) return false;
    const floraReference = Boolean(stroke?.floraPaint) && this.preference === 'auto';
    const mayUseGPU = this.preference !== 'canvas2d' && !floraReference && !this.forcedReason;
    if (mayUseGPU) {
      try {
        const raster = this.webgl.render(stroke);
        if (raster?.canvas) {
          ctx.drawImage(raster.canvas, raster.x, raster.y, raster.w, raster.h);
          this.lastBackend = 'webgl2';return true;
        }
      } catch (error) {
        this.forcedReason = error instanceof Error ? error.message : String(error);this.fallbacks++;
      }
    }
    this.lastBackend = 'canvas2d';this.canvas2d.render(ctx, stroke);return true;
  }
  renderStrokeRun(ctx, entries, paper = {}, options = {}) {
    const minimumStrokes = Math.max(1, Math.trunc(options.minimumStrokes ?? 2));
    if (!this.supportsRun(entries, { minimum: minimumStrokes })) return false;
    const hasMixers = entries.some(entry => isNaturalMediaMixerStroke(entry?.stroke || entry));
    if (hasMixers) this.mixingRuns++;
    const mayUseGPU = !hasMixers && this.preference !== 'canvas2d' && !this.forcedReason;
    if (mayUseGPU) {
      try {
        const raster = this.multiChannelWebgl.render(entries, paper, options);
        if (raster?.canvas) {
          ctx.drawImage(raster.canvas, raster.x, raster.y, raster.w, raster.h);
          this.lastBackend = 'webgl2-multichannel';return true;
        }
      } catch (error) {
        this.forcedReason = error instanceof Error ? error.message : String(error);this.batchFallbacks++;
      }
    }
    const fallback = this.multiChannelCanvas2d.render(entries, paper, options);
    if (fallback?.canvas) {
      ctx.drawImage(fallback.canvas, fallback.x, fallback.y, fallback.w, fallback.h);
      this.lastBackend = 'canvas2d-multichannel';return true;
    }
    this.batchFallbacks++;return false;
  }
  forceFallback(reason = 'manual') { this.forcedReason = reason;this.lastBackend = 'canvas2d';this.fallbacks++;this.emitStatus(); }
  retryGPU() { this.forcedReason = null;const strokeAvailable = this.webgl.retry(), multiAvailable = this.multiChannelWebgl.retry();this.emitStatus();return strokeAvailable || multiAvailable; }
  runGPUValidation() {
    const single=this.webgl.selfTest();
    const multi=this.multiChannelWebgl.selfTest();
    const passed=Boolean(single?.passed&&multi?.passed);
    if(!passed&&this.preference==='gpu')this.forcedReason=single?.error||multi?.error||'GPU validation failed';
    this.emitStatus();
    return{passed,single,multi};
  }
  loseGPUContextForTest(){const single=this.webgl.loseContextForTest(),multi=this.multiChannelWebgl.loseContextForTest();return single||multi;}
  restoreGPUContextForTest(){const single=this.webgl.restoreContextForTest(),multi=this.multiChannelWebgl.restoreContextForTest();return single||multi;}
  clearCaches() { this.webgl.clearCache();this.multiChannelWebgl.clearCache();this.multiChannelCanvas2d.clearCache(); }
  emitStatus() { this.onStatusChange?.(this.diagnostics()); }
  diagnostics() {
    const gpu = this.webgl.diagnostics(), multiGpu = this.multiChannelWebgl.diagnostics();
    return {
      preference: this.preference,
      floraReferenceBackend: this.floraReferenceBackend,
      activeBackend: this.lastBackend,
      gpuAvailable: gpu.available || multiGpu.available,
      gpuState: multiGpu.available ? multiGpu.state : gpu.state,
      forcedReason: this.forcedReason,
      fallbacks: this.fallbacks,
      batchFallbacks: this.batchFallbacks,
      mixingRuns: this.mixingRuns,
      webgl: gpu,
      multiChannelWebgl: multiGpu,
      multiChannelCanvas2d: this.multiChannelCanvas2d.diagnostics(),
      canvas2d: this.canvas2d.diagnostics()
    };
  }
  dispose() { this.webgl.dispose();this.multiChannelWebgl.dispose(); }
}
