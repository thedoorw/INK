import { clamp, lerp } from '../core/index.js';

export const DEFAULT_PEN_PROFILE = Object.freeze({
  pressureMin: 0.02,
  pressureMax: 1,
  pressureGamma: 1,
  pressureSmoothing: 0.16,
  tiltSensitivity: 1,
  tiltDeadzone: 1.5,
  azimuthOffset: 0,
  useCoalescedEvents: true,
  usePredictedEvents: false,
  palmRejection: true,
  palmRadiusThreshold: 18,
  penTouchGuardMs: 420
});

export function normalizePenProfile(input = {}) {
  const profile = { ...DEFAULT_PEN_PROFILE, ...(input || {}) };
  profile.pressureMin = clamp(Number(profile.pressureMin) || 0, 0, .95);
  profile.pressureMax = clamp(Number(profile.pressureMax) || 1, profile.pressureMin + .01, 1);
  profile.pressureGamma = clamp(Number(profile.pressureGamma) || 1, .25, 4);
  profile.pressureSmoothing = clamp(Number(profile.pressureSmoothing) || 0, 0, .95);
  profile.tiltSensitivity = clamp(Number(profile.tiltSensitivity) || 1, 0, 2);
  profile.tiltDeadzone = clamp(Number(profile.tiltDeadzone) || 0, 0, 20);
  profile.azimuthOffset = ((Number(profile.azimuthOffset) || 0) % 360 + 360) % 360;
  profile.useCoalescedEvents = profile.useCoalescedEvents !== false;
  profile.usePredictedEvents = profile.usePredictedEvents === true;
  profile.palmRejection = profile.palmRejection !== false;
  profile.palmRadiusThreshold = clamp(Number(profile.palmRadiusThreshold) || 18, 6, 80);
  profile.penTouchGuardMs = clamp(Number(profile.penTouchGuardMs) || 420, 0, 2000);
  return profile;
}

export function applyPressureCurve(rawPressure, profile = DEFAULT_PEN_PROFILE) {
  const p = normalizePenProfile(profile);
  const raw = clamp(Number(rawPressure) || 0, 0, 1);
  const normalized = clamp((raw - p.pressureMin) / Math.max(.0001, p.pressureMax - p.pressureMin), 0, 1);
  return clamp(Math.pow(normalized, p.pressureGamma), 0, 1);
}

export function tiltToOrientation(tiltX = 0, tiltY = 0, profile = DEFAULT_PEN_PROFILE, twist = 0) {
  const p = normalizePenProfile(profile);
  let x = clamp(Number(tiltX) || 0, -90, 90) * p.tiltSensitivity;
  let y = clamp(Number(tiltY) || 0, -90, 90) * p.tiltSensitivity;
  if (Math.abs(x) < p.tiltDeadzone) x = 0;
  if (Math.abs(y) < p.tiltDeadzone) y = 0;
  const magnitude = clamp(Math.hypot(x, y), 0, 90);
  const altitude = clamp(90 - magnitude, 0, 90);
  const azimuth = ((Math.atan2(y, x) * 180 / Math.PI + 360 + p.azimuthOffset) % 360);
  return { tiltX: x, tiltY: y, altitude, azimuth, twist: ((Number(twist) || 0) % 360 + 360) % 360 };
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  const index = clamp((sorted.length - 1) * ratio, 0, sorted.length - 1);
  const low = Math.floor(index), high = Math.ceil(index);
  return lerp(sorted[low], sorted[high], index - low);
}

function eventTimestampToNow(event, now) {
  const stamp = Number(event?.timeStamp);
  if (!Number.isFinite(stamp)) return 0;
  const timeOrigin = Number(globalThis.performance?.timeOrigin) || 0;
  const absolute = stamp > 1e12 ? stamp : timeOrigin + stamp;
  const absoluteNow = timeOrigin + now;
  return clamp(absoluteNow - absolute, 0, 5000);
}

export class PenInputCalibrator {
  constructor(profile = {}, { clock = () => Number(globalThis.performance?.now?.() ?? Date.now()) } = {}) {
    this.profile = normalizePenProfile(profile);
    this.clock = clock;
    this.pointerState = new Map();
    this.lastPenActivity = -Infinity;
    this.stats = this.createStats();
  }

  createStats() {
    return {
      rawEvents: 0,
      coalescedEvents: 0,
      predictedEvents: 0,
      rejectedTouches: 0,
      penSamples: 0,
      touchSamples: 0,
      mouseSamples: 0,
      pressureMin: 1,
      pressureMax: 0,
      tiltMax: 0,
      latencySamples: []
    };
  }

  setProfile(profile = {}) {
    this.profile = normalizePenProfile({ ...this.profile, ...profile });
    this.pointerState.clear();
    return { ...this.profile };
  }

  resetStats() {
    this.stats = this.createStats();
  }

  eventBatch(event) {
    const batch = [];
    const coalesced = this.profile.useCoalescedEvents && typeof event?.getCoalescedEvents === 'function'
      ? event.getCoalescedEvents() : [];
    const base = coalesced?.length ? coalesced : [event];
    for (const item of base) batch.push({ event: item, predicted: false });
    this.stats.coalescedEvents += Math.max(0, base.length - 1);
    if (this.profile.usePredictedEvents && typeof event?.getPredictedEvents === 'function') {
      const predicted = event.getPredictedEvents() || [];
      for (const item of predicted) batch.push({ event: item, predicted: true });
      this.stats.predictedEvents += predicted.length;
    }
    return batch;
  }

  shouldReject(event, now = this.clock()) {
    if (!this.profile.palmRejection || event?.pointerType !== 'touch') return false;
    const width = Number(event.width) || 0;
    const height = Number(event.height) || 0;
    const largeContact = Math.max(width, height) >= this.profile.palmRadiusThreshold;
    const guardedByPen = now - this.lastPenActivity <= this.profile.penTouchGuardMs;
    if (largeContact || guardedByPen) {
      this.stats.rejectedTouches++;
      return true;
    }
    return false;
  }

  normalizeEvent(event, { predicted = false } = {}) {
    const now = this.clock();
    const pointerType = event?.pointerType || 'mouse';
    if (pointerType === 'pen') this.lastPenActivity = now;
    const id = Number(event?.pointerId) || 0;
    const rawPressure = pointerType === 'pen' && Number(event?.pressure) > 0
      ? Number(event.pressure)
      : pointerType === 'mouse' ? .55 : .5;
    let pressure = applyPressureCurve(rawPressure, this.profile);
    const previous = this.pointerState.get(id);
    if (previous && this.profile.pressureSmoothing > 0) {
      pressure = lerp(pressure, previous.pressure, this.profile.pressureSmoothing);
    }
    const orientation = tiltToOrientation(event?.tiltX, event?.tiltY, this.profile, event?.twist);
    this.pointerState.set(id, { pressure, time: now, pointerType });
    this.stats.rawEvents++;
    if (pointerType === 'pen') this.stats.penSamples++;
    else if (pointerType === 'touch') this.stats.touchSamples++;
    else this.stats.mouseSamples++;
    this.stats.pressureMin = Math.min(this.stats.pressureMin, pressure);
    this.stats.pressureMax = Math.max(this.stats.pressureMax, pressure);
    this.stats.tiltMax = Math.max(this.stats.tiltMax, 90 - orientation.altitude);
    this.stats.latencySamples.push(eventTimestampToNow(event, now));
    if (this.stats.latencySamples.length > 512) this.stats.latencySamples.splice(0, this.stats.latencySamples.length - 512);
    return {
      pressure: clamp(pressure, .001, 1),
      rawPressure: clamp(rawPressure, 0, 1),
      ...orientation,
      predicted,
      pointerType,
      latencyMs: this.stats.latencySamples.at(-1) || 0
    };
  }

  release(pointerId) {
    this.pointerState.delete(Number(pointerId) || 0);
  }

  diagnostics() {
    const latency = [...this.stats.latencySamples].sort((a, b) => a - b);
    return {
      profile: { ...this.profile },
      samples: this.stats.rawEvents,
      penSamples: this.stats.penSamples,
      touchSamples: this.stats.touchSamples,
      mouseSamples: this.stats.mouseSamples,
      coalescedEvents: this.stats.coalescedEvents,
      predictedEvents: this.stats.predictedEvents,
      rejectedTouches: this.stats.rejectedTouches,
      pressureRange: this.stats.rawEvents ? [this.stats.pressureMin, this.stats.pressureMax] : [0, 0],
      tiltMax: this.stats.tiltMax,
      latency: {
        medianMs: percentile(latency, .5),
        p95Ms: percentile(latency, .95),
        maxMs: latency.at(-1) || 0
      },
      activePointers: this.pointerState.size
    };
  }
}
