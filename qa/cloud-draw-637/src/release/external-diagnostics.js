import { nowISO } from '../core/index.js';

function safeCall(fn, fallback = null) {
  try { return fn(); } catch { return fallback; }
}

function webglParameters(gl) {
  if (!gl) return { available: false };
  const parameter = name => safeCall(() => gl.getParameter(gl[name]), null);
  const extensions = safeCall(() => gl.getSupportedExtensions(), []) || [];
  const debug = extensions.includes('WEBGL_debug_renderer_info') ? safeCall(() => gl.getExtension('WEBGL_debug_renderer_info'), null) : null;
  return {
    available: true,
    version: parameter('VERSION'),
    shadingLanguageVersion: parameter('SHADING_LANGUAGE_VERSION'),
    vendor: parameter('VENDOR'),
    renderer: parameter('RENDERER'),
    unmaskedVendor: debug ? safeCall(() => gl.getParameter(debug.UNMASKED_VENDOR_WEBGL), null) : null,
    unmaskedRenderer: debug ? safeCall(() => gl.getParameter(debug.UNMASKED_RENDERER_WEBGL), null) : null,
    maxTextureSize: parameter('MAX_TEXTURE_SIZE'),
    maxRenderbufferSize: parameter('MAX_RENDERBUFFER_SIZE'),
    maxCombinedTextureImageUnits: parameter('MAX_COMBINED_TEXTURE_IMAGE_UNITS'),
    maxColorAttachments: gl.MAX_COLOR_ATTACHMENTS ? parameter('MAX_COLOR_ATTACHMENTS') : null,
    maxDrawBuffers: gl.MAX_DRAW_BUFFERS ? parameter('MAX_DRAW_BUFFERS') : null,
    extensions
  };
}

export function probeWebGLCapabilities({ canvasFactory = null } = {}) {
  const factory = canvasFactory || (() => globalThis.document?.createElement?.('canvas'));
  const canvas = safeCall(factory, null);
  if (!canvas?.getContext) return { webgl2: { available: false }, webgl1: { available: false }, error: 'canvas-unavailable' };
  const webgl2 = safeCall(() => canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false }), null);
  const webgl1 = webgl2 ? null : safeCall(() => canvas.getContext('webgl', { alpha: true }), null);
  return {
    webgl2: webglParameters(webgl2),
    webgl1: webglParameters(webgl1),
    contextAttributes: safeCall(() => (webgl2 || webgl1)?.getContextAttributes?.(), null),
    error: null
  };
}

export function collectPlatformCapabilities(target = globalThis, options = {}) {
  const navigator = target.navigator || {};
  const location = target.location || {};
  const screen = target.screen || {};
  const storage = navigator.storage;
  return {
    capturedAt: nowISO(),
    origin: location.origin || null,
    protocol: location.protocol || null,
    secureContext: Boolean(target.isSecureContext),
    online: navigator.onLine ?? null,
    userAgent: navigator.userAgent || null,
    platform: navigator.platform || null,
    language: navigator.language || null,
    languages: Array.isArray(navigator.languages) ? [...navigator.languages] : [],
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemoryGB: navigator.deviceMemory || null,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    screen: {
      width: Number(screen.width) || null,
      height: Number(screen.height) || null,
      colorDepth: Number(screen.colorDepth) || null,
      pixelDepth: Number(screen.pixelDepth) || null,
      devicePixelRatio: Number(target.devicePixelRatio) || 1
    },
    apis: {
      pointerEvent: typeof target.PointerEvent === 'function',
      coalescedEvents: typeof target.PointerEvent?.prototype?.getCoalescedEvents === 'function',
      predictedEvents: typeof target.PointerEvent?.prototype?.getPredictedEvents === 'function',
      indexedDB: Boolean(target.indexedDB),
      cacheStorage: Boolean(target.caches),
      serviceWorker: Boolean(navigator.serviceWorker),
      offscreenCanvas: typeof target.OffscreenCanvas === 'function',
      createImageBitmap: typeof target.createImageBitmap === 'function',
      fileSystemAccess: typeof target.showSaveFilePicker === 'function',
      compressionStream: typeof target.CompressionStream === 'function',
      webShare: typeof navigator.share === 'function',
      storageEstimate: typeof storage?.estimate === 'function',
      storagePersist: typeof storage?.persist === 'function'
    },
    webgl: options.skipWebGL ? null : probeWebGLCapabilities(options)
  };
}

export class ExternalValidationRecorder {
  constructor({ maxSamples = 500, maxEvents = 200, clock = () => Date.now() } = {}) {
    this.maxSamples = Math.max(10, maxSamples);
    this.maxEvents = Math.max(20, maxEvents);
    this.clock = clock;
    this.startedAt = nowISO();
    this.penSamples = [];
    this.events = [];
    this.gates = new Map();
  }

  recordPenSample(sample = {}) {
    const normalized = {
      at: this.clock(),
      pointerType: sample.pointerType || 'unknown',
      pressure: Number(sample.pressure) || 0,
      rawPressure: Number(sample.rawPressure ?? sample.pressure) || 0,
      tiltX: Number(sample.tiltX) || 0,
      tiltY: Number(sample.tiltY) || 0,
      altitude: Number(sample.altitude) || 0,
      azimuth: Number(sample.azimuth) || 0,
      twist: Number(sample.twist) || 0,
      latencyMs: Number(sample.latencyMs) || 0,
      predicted: Boolean(sample.predicted)
    };
    this.penSamples.push(normalized);
    if (this.penSamples.length > this.maxSamples) this.penSamples.splice(0, this.penSamples.length - this.maxSamples);
    return normalized;
  }

  recordEvent(type, details = {}) {
    const event = { at: this.clock(), type: String(type || 'event'), details: { ...details } };
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
    return event;
  }

  setGate(id, status, details = {}) {
    if (!['pass', 'warn', 'fail', 'not-run'].includes(status)) throw new TypeError(`Invalid gate status: ${status}`);
    const gate = { id: String(id), status, at: nowISO(), details: { ...details } };
    this.gates.set(gate.id, gate);
    return gate;
  }

  summarizePenSamples() {
    if (!this.penSamples.length) return { count: 0 };
    const values = key => this.penSamples.map(sample => Number(sample[key]) || 0);
    const summary = key => {
      const list = values(key);
      return { min: Math.min(...list), max: Math.max(...list), average: list.reduce((sum, value) => sum + value, 0) / list.length };
    };
    return {
      count: this.penSamples.length,
      pressure: summary('pressure'),
      rawPressure: summary('rawPressure'),
      tiltX: summary('tiltX'),
      tiltY: summary('tiltY'),
      latencyMs: summary('latencyMs'),
      predicted: this.penSamples.filter(sample => sample.predicted).length,
      pointerTypes: [...new Set(this.penSamples.map(sample => sample.pointerType))]
    };
  }

  diagnostics() {
    return {
      startedAt: this.startedAt,
      pen: this.summarizePenSamples(),
      penSamples: this.penSamples.slice(),
      events: this.events.slice(),
      gates: [...this.gates.values()]
    };
  }
}

export async function buildExternalDiagnosticBundle({
  app = null,
  target = globalThis,
  recorder = null,
  version = null,
  buildId = null,
  formatVersion = null,
  notes = []
} = {}) {
  const capabilities = collectPlatformCapabilities(target);
  const storageEstimate = await safeCall(async () => target.navigator?.storage?.estimate?.(), null);
  const persistent = await safeCall(async () => target.navigator?.storage?.persisted?.(), null);
  const releaseHealth = app?.runReleaseHealthCheck ? await safeCall(() => app.runReleaseHealthCheck(), { error: 'release-health-failed' }) : null;
  return {
    schema: 'INK_EXTERNAL_DIAGNOSTIC_BUNDLE_V1',
    capturedAt: nowISO(),
    product: 'INK',
    version,
    buildId,
    formatVersion,
    capabilities,
    storage: { estimate: storageEstimate, persistent },
    app: app ? {
      document: safeCall(() => app.documentIntegrity?.() || null, null),
      history: safeCall(() => app.history?.stats?.(), null),
      renderer: safeCall(() => app.renderer?.naturalMedia?.diagnostics?.(), null),
      pen: safeCall(() => app.penInput?.diagnostics?.(), null),
      runtime: safeCall(() => app.health?.diagnostics?.(), null),
      updates: safeCall(() => app.updates?.diagnostics?.(), null),
      releaseHealth
    } : null,
    validation: recorder?.diagnostics?.() || null,
    notes: Array.isArray(notes) ? notes.map(String) : [String(notes)]
  };
}
