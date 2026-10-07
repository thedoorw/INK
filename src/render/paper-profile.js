import { clamp } from '../core/index.js';

export const DEFAULT_PAPER_PROFILE = Object.freeze({
  absorbency: .58,
  roughness: .42,
  fiberStrength: .36,
  fiberAngle: 0,
  sizing: .28,
  granulation: .32,
  seed: 1337,
  textureVisible: true
});

export function normalizePaperProfile(paper = {}) {
  return {
    absorbency: clamp(Number.isFinite(+paper.absorbency) ? +paper.absorbency : DEFAULT_PAPER_PROFILE.absorbency, 0, 1),
    roughness: clamp(Number.isFinite(+paper.roughness) ? +paper.roughness : DEFAULT_PAPER_PROFILE.roughness, 0, 1),
    fiberStrength: clamp(Number.isFinite(+paper.fiberStrength) ? +paper.fiberStrength : DEFAULT_PAPER_PROFILE.fiberStrength, 0, 1),
    fiberAngle: Number.isFinite(+paper.fiberAngle) ? +paper.fiberAngle : DEFAULT_PAPER_PROFILE.fiberAngle,
    sizing: clamp(Number.isFinite(+paper.sizing) ? +paper.sizing : DEFAULT_PAPER_PROFILE.sizing, 0, 1),
    granulation: clamp(Number.isFinite(+paper.granulation) ? +paper.granulation : DEFAULT_PAPER_PROFILE.granulation, 0, 1),
    seed: Number.isFinite(+paper.seed) ? Math.trunc(+paper.seed) : DEFAULT_PAPER_PROFILE.seed,
    textureVisible: paper.textureVisible !== false
  };
}

function hash2(x, y, seed) {
  let h = Math.imul(Math.trunc(x), 374761393) ^ Math.imul(Math.trunc(y), 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(t) { return t * t * (3 - 2 * t); }
function paperLerp(a, b, t) { return a + (b - a) * t; }

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = smoothstep(x - x0), ty = smoothstep(y - y0);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return paperLerp(paperLerp(a, b, tx), paperLerp(c, d, tx), ty);
}

export function paperSampleAt(worldX, worldY, paper = {}) {
  const profile = normalizePaperProfile(paper);
  const angle = profile.fiberAngle * Math.PI / 180;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const along = worldX * ca + worldY * sa;
  const across = -worldX * sa + worldY * ca;
  const coarse = valueNoise(worldX * .018, worldY * .018, profile.seed);
  const fine = valueNoise(worldX * .075, worldY * .075, profile.seed + 97);
  const fiberLow = valueNoise(across * .014, along * .008, profile.seed + 211);
  const fiberMid = valueNoise(across * .041, along * .016, profile.seed + 419);
  const fiberFine = valueNoise(across * .093, along * .027, profile.seed + 613);
  const ridge = 1 - Math.abs(fiberLow * 2 - 1);
  const fiber = clamp((ridge * .46 + fiberMid * .38 + fiberFine * .16) * profile.fiberStrength, 0, 1);
  const height = clamp(coarse * .58 + fine * .42, 0, 1);
  const absorbency = clamp(profile.absorbency * (1 - profile.sizing * .58) * (.72 + height * .38 + fiber * .22), 0, 1);
  const resistance = clamp(profile.sizing * .72 + (1 - height) * profile.roughness * .35, 0, 1);
  const grain = clamp((1 - height) * profile.granulation + fiber * .32, 0, 1);
  return { height, fiber, absorbency, resistance, grain };
}

export function buildPaperField(width, height, {
  paper = {}, originX = 0, originY = 0, scale = 1
} = {}) {
  const size = Math.max(1, Math.trunc(width) * Math.trunc(height));
  const absorbency = new Float32Array(size);
  const resistance = new Float32Array(size);
  const grain = new Float32Array(size);
  const fiber = new Float32Array(size);
  const safeScale = Math.max(.0001, scale);
  let minAbsorbency = 1, maxAbsorbency = 0, sumAbsorbency = 0;
  for (let y = 0, index = 0; y < height; y++) {
    const worldY = originY + (y + .5) / safeScale;
    for (let x = 0; x < width; x++, index++) {
      const worldX = originX + (x + .5) / safeScale;
      const sample = paperSampleAt(worldX, worldY, paper);
      absorbency[index] = sample.absorbency;
      resistance[index] = sample.resistance;
      grain[index] = sample.grain;
      fiber[index] = sample.fiber;
      minAbsorbency = Math.min(minAbsorbency, sample.absorbency);
      maxAbsorbency = Math.max(maxAbsorbency, sample.absorbency);
      sumAbsorbency += sample.absorbency;
    }
  }
  return {
    width, height, absorbency, resistance, grain, fiber,
    stats: { minAbsorbency, maxAbsorbency, meanAbsorbency: sumAbsorbency / size }
  };
}

export function paperProfileFingerprint(paper = {}) {
  const profile = normalizePaperProfile(paper);
  return [profile.absorbency, profile.roughness, profile.fiberStrength, profile.fiberAngle,
    profile.sizing, profile.granulation, profile.seed, profile.textureVisible ? 1 : 0]
    .map(value => typeof value === 'number' ? Math.round(value * 1000) : value).join(':');
}
