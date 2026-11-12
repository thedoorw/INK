import { strokeHash } from './stroke-model.js';

const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const variance = values => { const average = mean(values); return mean(values.map(value => (value - average) ** 2)); };

function distances(samples) {
  const values = [];
  for (let index = 1; index < samples.length; index += 1) values.push(Math.hypot(samples[index].position.x - samples[index - 1].position.x, samples[index].position.y - samples[index - 1].position.y));
  return values;
}

export function evaluateStrokeQuality(session, replay, performance = {}) {
  const source = session?.strokes || [], compiled = replay?.strokes || [];
  const sourceSamples = source.flatMap(stroke => stroke.samples || []), dabs = compiled.flatMap(stroke => stroke.dabs || []);
  const gaps = source.flatMap(stroke => distances(stroke.samples || []));
  const pressure = sourceSamples.map(sample => sample.pressure), tilt = sourceSamples.map(sample => Math.hypot(sample.tiltX, sample.tiltY));
  const brushPreserved = source.length ? source.filter((stroke, index) => compiled[index]?.brushId === stroke.brushId).length / source.length : 0;
  const replayConsistency = replay?.report?.deterministic && replay.report.replayHash === replay.replayHash ? 1 : 0;
  const metrics = {
    strokeContinuity: clamp(1 - Math.max(0, Math.sqrt(variance(gaps)) - mean(gaps)) / Math.max(1, mean(gaps))),
    strokeSmoothness: clamp(1 / (1 + Math.sqrt(variance(gaps)))),
    pressurePreservation: pressure.length && dabs.length ? clamp(1 - Math.abs(mean(pressure) - mean(dabs.map(dab => dab.opacity))) * .45) : 0,
    tiltPreservation: tilt.length && dabs.length ? clamp(compiled.some(stroke => stroke.dabs.some(dab => Number.isFinite(dab.rotation))) ? 1 : 0) : 0,
    brushParameterPreservation: brushPreserved,
    edgeStability: clamp(1 - Math.sqrt(variance(dabs.map(dab => dab.softness || 0)))),
    textureConsistency: clamp(1 - Math.sqrt(variance(dabs.map(dab => dab.texture || 0)))),
    colorMixingStability: clamp(1 - Math.sqrt(variance(dabs.map(dab => dab.blend || 0))) * .5),
    layerPreservation: source.every(stroke => stroke.layerId) ? 1 : 0,
    replayConsistency,
    fixedSeedDeterminism: replayConsistency,
    memoryUseBytes: Number(performance.memoryUseBytes || JSON.stringify(session || {}).length * 2),
    frameTimeMs: Number(performance.frameTimeMs || 0),
    inputLatencyMs: Number(performance.inputLatencyMs || 0)
  };
  return {
    format: 'INK-HAND-DRAWING-QUALITY-REPORT', schemaVersion: 1,
    sessionId: session?.id || null, automated: metrics,
    automatedHash: strokeHash(metrics),
    manual: {
      strokeNaturalness: 'USER VALIDATION REQUIRED', edgeControl: 'USER VALIDATION REQUIRED',
      colorMixing: 'USER VALIDATION REQUIRED', compositionCompleteness: 'USER VALIDATION REQUIRED',
      petalShape: 'USER VALIDATION REQUIRED', leafShape: 'USER VALIDATION REQUIRED',
      lightAndShadow: 'USER VALIDATION REQUIRED', naturalMediaCredibility: 'USER VALIDATION REQUIRED',
      physicalStylusFeel: 'USER VALIDATION REQUIRED', professionalArtworkCompleteness: 'USER VALIDATION REQUIRED'
    }
  };
}

export function compareStrokeReplays(reference, candidate) {
  const a = reference?.strokes || [], b = candidate?.strokes || [], count = Math.max(a.length, b.length, 1);
  let matched = 0, pathError = 0, pressure = 0, brush = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const sa = a[index], sb = b[index]; matched++;
    const da = sa.dabs || [], db = sb.dabs || [], n = Math.min(da.length, db.length);
    for (let point = 0; point < n; point += 1) pathError += Math.hypot(da[point].x - db[point].x, da[point].y - db[point].y);
    pressure += n ? mean(Array.from({ length: n }, (_, point) => Math.abs((da[point].opacity || 0) - (db[point].opacity || 0)))) : 1;
    brush += sa.behaviorSignature === sb.behaviorSignature ? 1 : 0;
  }
  const result = {
    strokeCountPreservation: 1 - Math.abs(a.length - b.length) / count,
    strokePathDeviation: matched ? pathError / Math.max(1, a.flatMap(item => item.dabs || []).length) : Infinity,
    pressurePreservation: matched ? 1 - pressure / matched : 0,
    brushParameterPreservation: matched ? brush / matched : 0,
    sessionReplayConsistency: reference?.replayHash === candidate?.replayHash ? 1 : 0,
    compositeImageSimilarity: null
  };
  const exact = result.sessionReplayConsistency === 1;
  result.decision = exact ? 'EQUIVALENT' : result.strokeCountPreservation === 1 && result.strokePathDeviation < 1 ? 'ACCEPTABLE DIFFERENCE' : result.strokeCountPreservation > .8 ? 'APPROXIMATED' : 'STRUCTURALLY DIFFERENT';
  return { format: 'INK-STROKE-DIFFERENCE-REPORT', schemaVersion: 1, ...result };
}

