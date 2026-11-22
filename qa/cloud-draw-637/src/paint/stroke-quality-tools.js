import { migrateUnifiedStroke, strokeHash } from './stroke-model.js';

const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const distance = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);

export class PressureCurveEditor {
  constructor(points = [[0, 0], [.18, .07], [.5, .46], [.82, .88], [1, 1]]) { this.setPoints(points); }
  setPoints(points) {
    if (!Array.isArray(points) || points.length < 2) throw new Error('INK_PRESSURE_CURVE_REQUIRES_TWO_POINTS');
    this.points = points.map(([x, y]) => [clamp(x), clamp(y)]).sort((a, b) => a[0] - b[0]);
    if (this.points[0][0] !== 0 || this.points.at(-1)[0] !== 1) throw new Error('INK_PRESSURE_CURVE_ENDPOINTS_REQUIRED');
    return this;
  }
  evaluate(value) {
    const input = clamp(value);
    for (let index = 1; index < this.points.length; index += 1) {
      const a = this.points[index - 1], b = this.points[index];
      if (input <= b[0]) { const ratio = (input - a[0]) / Math.max(.000001, b[0] - a[0]); return clamp(a[1] + (b[1] - a[1]) * ratio); }
    }
    return this.points.at(-1)[1];
  }
  export() { return { format: 'INK-PRESSURE-CURVE', schemaVersion: 1, points: clone(this.points) }; }
}

function perpendicularDistance(point, start, end) {
  const dx = end.position.x - start.position.x, dy = end.position.y - start.position.y;
  const denominator = Math.hypot(dx, dy) || 1;
  return Math.abs(dy * point.position.x - dx * point.position.y + end.position.x * start.position.y - end.position.y * start.position.x) / denominator;
}

function simplifyRdp(samples, tolerance) {
  if (samples.length <= 2) return samples;
  let maxDistance = 0, split = 0;
  for (let index = 1; index < samples.length - 1; index += 1) { const current = perpendicularDistance(samples[index], samples[0], samples.at(-1)); if (current > maxDistance) { maxDistance = current; split = index; } }
  if (maxDistance <= tolerance) return [samples[0], samples.at(-1)];
  return [...simplifyRdp(samples.slice(0, split + 1), tolerance).slice(0, -1), ...simplifyRdp(samples.slice(split), tolerance)];
}

function cornerIndices(samples, thresholdRadians) {
  const corners = new Set([0, samples.length - 1]);
  for (let index = 1; index < samples.length - 1; index += 1) {
    const a = samples[index - 1].position, b = samples[index].position, c = samples[index + 1].position;
    const first = Math.atan2(b.y - a.y, b.x - a.x), second = Math.atan2(c.y - b.y, c.x - b.x);
    const delta = Math.abs(Math.atan2(Math.sin(second - first), Math.cos(second - first)));
    if (delta >= thresholdRadians) corners.add(index);
  }
  return corners;
}

export function processProfessionalStroke(rawStroke, options = {}) {
  const source = migrateUnifiedStroke(rawStroke), samples = clone(source.samples);
  const curve = options.pressureCurve instanceof PressureCurveEditor ? options.pressureCurve : new PressureCurveEditor(options.pressureCurve);
  const startLength = Math.max(1, Math.min(samples.length - 1, options.lowPressureStartSamples ?? Math.ceil(samples.length * .12)));
  const endLength = Math.max(1, Math.min(samples.length - 1, options.taperedEndingSamples ?? Math.ceil(samples.length * .16)));
  const corners = cornerIndices(samples, options.cornerThresholdRadians ?? .72);
  const smoothingBase = clamp(options.velocitySmoothing ?? .34, 0, .92);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index], startFactor = clamp(index / startLength), endFactor = clamp((samples.length - 1 - index) / endLength);
    sample.pressure = curve.evaluate(sample.pressure) * (.08 + .92 * startFactor) * (.04 + .96 * endFactor);
    sample.size *= .42 + .58 * Math.sqrt(clamp(sample.pressure));
    if (index > 0 && !corners.has(index)) {
      const previous = samples[index - 1], speed = clamp(sample.velocity * 9), smoothing = smoothingBase * (.45 + speed * .55);
      const directional = clamp(options.directionSensitiveStabilization ?? .42, 0, .9) * (1 - Math.abs(Math.sin(sample.direction - previous.direction)));
      const weight = clamp(smoothing + directional * .25, 0, .9);
      sample.position.x = sample.position.x * (1 - weight) + previous.position.x * weight;
      sample.position.y = sample.position.y * (1 - weight) + previous.position.y * weight;
    }
  }
  const tolerance = Math.max(.05, Number(options.simplificationTolerance ?? .42));
  let simplified = simplifyRdp(samples, tolerance);
  for (const index of corners) { const item = samples[index]; if (item && !simplified.some(sample => sample.timestamp === item.timestamp)) simplified.push(item); }
  simplified.sort((a, b) => a.timestamp - b.timestamp);
  if (options.overlapReduction !== false) simplified = simplified.filter((sample, index, all) => index === 0 || index === all.length - 1 || distance(sample, all[index - 1]) >= Math.max(.08, sample.size * .035));
  const result = migrateUnifiedStroke({ ...source, samples: simplified, metadata: { ...source.metadata, qualityProcessing: { pressureCurve: curve.export(), lowPressureStart: true, taperedEnding: true, velocitySensitiveSmoothing: true, directionSensitiveStabilization: true, cornerPreservation: true, overlapReduction: options.overlapReduction !== false, adaptiveLineWeight: true, simplificationTolerance: tolerance } } });
  result.contentHash = strokeHash({ ...result, contentHash: undefined });
  return result;
}

export function editLocalStroke(session, strokeId, edit) {
  const index = session.strokes.findIndex(stroke => stroke.id === strokeId);
  if (index < 0) throw new Error(`INK_STROKE_NOT_FOUND:${strokeId}`);
  const original = session.strokes[index], next = typeof edit === 'function' ? edit(clone(original)) : { ...clone(original), ...clone(edit) };
  session.strokes[index] = migrateUnifiedStroke(next);
  session.deterministicHash = strokeHash({ seed: session.seed, strokes: session.strokes });
  return { changedStrokeId: strokeId, replayScope: [strokeId], unaffectedStrokeCount: session.strokes.length - 1, fullDocumentReplay: false };
}
