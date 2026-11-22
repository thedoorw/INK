import { nowISO } from '../core/index.js';

export class RuntimeHealthMonitor {
  constructor({ clock = () => globalThis.performance?.now?.() ?? Date.now(), maxErrors = 50, longFrameMs = 50 } = {}) {
    this.clock = clock;
    this.maxErrors = maxErrors;
    this.longFrameMs = longFrameMs;
    this.startedAt = this.clock();
    this.startedISO = nowISO();
    this.errors = [];
    this.longFrames = 0;
    this.frames = 0;
    this.totalFrameMs = 0;
    this.operations = new Map();
    this.operationSamples = [];
    this.lastHeartbeat = null;
    this.attached = false;
    this.detachHandlers = [];
  }

  attach(target = globalThis) {
    if (this.attached || !target?.addEventListener) return false;
    const onError = event => this.recordError(event?.error || event?.message || 'Runtime error', { source: 'error' });
    const onRejection = event => this.recordError(event?.reason || 'Unhandled rejection', { source: 'unhandledrejection' });
    target.addEventListener('error', onError);
    target.addEventListener('unhandledrejection', onRejection);
    this.detachHandlers = [() => target.removeEventListener('error', onError), () => target.removeEventListener('unhandledrejection', onRejection)];
    this.attached = true;
    return true;
  }

  detach() {
    for (const dispose of this.detachHandlers.splice(0)) dispose();
    this.attached = false;
  }

  recordError(error, metadata = {}) {
    const message = error instanceof Error ? error.message : String(error);
    this.errors.push({ at: nowISO(), message, stack: error instanceof Error ? error.stack || null : null, ...metadata });
    if (this.errors.length > this.maxErrors) this.errors.splice(0, this.errors.length - this.maxErrors);
    return this.errors[this.errors.length - 1];
  }

  recordFrame(durationMs) {
    const value = Number(durationMs);
    if (!Number.isFinite(value) || value < 0) return false;
    this.frames++;
    this.totalFrameMs += value;
    if (value >= this.longFrameMs) this.longFrames++;
    return true;
  }

  beginOperation(name) {
    const token = `${name}:${this.clock()}:${Math.random().toString(36).slice(2)}`;
    this.operations.set(token, { name, startedAt: this.clock() });
    return token;
  }

  endOperation(token, metadata = {}) {
    const operation = this.operations.get(token);
    if (!operation) return null;
    this.operations.delete(token);
    const sample = { name: operation.name, durationMs: Math.max(0, this.clock() - operation.startedAt), ...metadata };
    this.operationSamples.push(sample);
    if (this.operationSamples.length > 100) this.operationSamples.shift();
    return sample;
  }

  heartbeat(snapshot = {}) {
    const memory = globalThis.performance?.memory;
    this.lastHeartbeat = {
      at: nowISO(),
      uptimeMs: Math.max(0, this.clock() - this.startedAt),
      visibility: globalThis.document?.visibilityState || 'unknown',
      online: globalThis.navigator?.onLine ?? null,
      memory: memory ? {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit
      } : null,
      ...snapshot
    };
    return this.lastHeartbeat;
  }

  assess({ warningErrorCount = 1, failureErrorCount = 10, warningLongFrameRatio = .08 } = {}) {
    const longFrameRatio = this.frames ? this.longFrames / this.frames : 0;
    const errorCount = this.errors.length;
    let status = 'pass';
    const reasons = [];
    if (errorCount >= failureErrorCount) { status = 'fail'; reasons.push('runtime-errors'); }
    else if (errorCount >= warningErrorCount) { status = 'warn'; reasons.push('runtime-errors'); }
    if (longFrameRatio > warningLongFrameRatio && status === 'pass') { status = 'warn'; reasons.push('long-frame-ratio'); }
    if (this.operations.size && status === 'pass') { status = 'warn'; reasons.push('unfinished-operations'); }
    return { status, reasons, errorCount, longFrameRatio, unfinishedOperations: this.operations.size };
  }

  diagnostics() {
    const assessment = this.assess();
    return {
      startedAt: this.startedISO,
      uptimeMs: Math.max(0, this.clock() - this.startedAt),
      attached: this.attached,
      frames: this.frames,
      averageFrameMs: this.frames ? this.totalFrameMs / this.frames : 0,
      longFrames: this.longFrames,
      operations: this.operationSamples.slice(-20),
      errors: this.errors.slice(),
      heartbeat: this.lastHeartbeat,
      ...assessment
    };
  }
}
