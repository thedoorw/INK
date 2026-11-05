/* INK Path expressive stroke appearance contract v0.1.
 * Path geometry remains authoritative; this module stores and evaluates appearance only. */

export const EXPRESSIVE_STROKE_FORMAT = 'INK-PATH-STROKE-APPEARANCE';
export const EXPRESSIVE_STROKE_VERSION = 1;
export const EXPRESSIVE_STROKE_MAX_PROFILE_SAMPLES = 64;
export const EXPRESSIVE_STROKE_EXTENSION = 'ink.path-expressive-stroke.v1';

const KNOWN_ENGINES = new Set(['generic','pencil','ink','marker','opaque','soft','watercolor','oil','dry','texture']);
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value, min)));
const text = (value, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;

function normalizeSample(sample = {}, fallbackT = 0) {
  return {
    t: clamp(sample.t ?? sample.offset ?? fallbackT, 0, 1),
    width: clamp(sample.width ?? sample.widthScale ?? 1, .02, 8),
    pressure: clamp(sample.pressure ?? 1, 0, 1)
  };
}

function normalizeProfile(raw = {}) {
  const source = Array.isArray(raw.samples) ? raw.samples.slice(0, EXPRESSIVE_STROKE_MAX_PROFILE_SAMPLES) : [];
  let samples = source.map((sample, index) => normalizeSample(sample, source.length > 1 ? index / (source.length - 1) : 0))
    .sort((a, b) => a.t - b.t);
  const deduped = [];
  for (const sample of samples) {
    if (deduped.length && Math.abs(deduped.at(-1).t - sample.t) < 1e-8) deduped[deduped.length - 1] = sample;
    else deduped.push(sample);
  }
  samples = deduped;
  if (!samples.length) samples = [{ t: 0, width: 1, pressure: 1 }, { t: 1, width: 1, pressure: 1 }];
  else {
    if (samples[0].t > 0) samples.unshift({ ...samples[0], t: 0 });
    if (samples.at(-1).t < 1) samples.push({ ...samples.at(-1), t: 1 });
  }
  if (samples.length === 1) samples.push({ ...samples[0], t: 1 });
  if (samples.length > EXPRESSIVE_STROKE_MAX_PROFILE_SAMPLES) {
    const last = samples.at(-1);
    samples = samples.slice(0, EXPRESSIVE_STROKE_MAX_PROFILE_SAMPLES - 1);
    samples.push(last);
  }
  return {
    scope: 'subpath',
    interpolation: 'linear',
    pressureInfluence: clamp(raw.pressureInfluence ?? .7, 0, 1),
    taperStart: clamp(raw.taperStart ?? 0, 0, 1),
    taperEnd: clamp(raw.taperEnd ?? 0, 0, 1),
    samples
  };
}

function normalizeMedia(raw = {}) {
  const sourceEngine = text(raw.engine, 'generic').toLowerCase();
  const engine = KNOWN_ENGINES.has(sourceEngine) ? sourceEngine : 'generic';
  return {
    model: 'deterministic-vector-approximation',
    presetId: raw.presetId == null ? null : text(String(raw.presetId), null),
    engine,
    flow: clamp(raw.flow ?? 1, 0, 1),
    grain: clamp(raw.grain ?? 0, 0, 1),
    wetness: clamp(raw.wetness ?? 0, 0, 1),
    bristle: clamp(raw.bristle ?? 0, 0, 1),
    softness: clamp(raw.softness ?? 0, 0, 1),
    seed: Math.trunc(finite(raw.seed, 1)) >>> 0
  };
}

export function normalizeExpressiveStroke(raw = {}, fallback = {}) {
  if (raw == null || raw === false) return null;
  const baseWidth = clamp(raw.baseWidth ?? raw.width ?? fallback.width ?? 1.5, .05, 512);
  const color = text(raw.color, text(fallback.color, '#202020'));
  return {
    format: EXPRESSIVE_STROKE_FORMAT,
    version: EXPRESSIVE_STROKE_VERSION,
    color,
    baseWidth,
    opacity: clamp(raw.opacity ?? 1, 0, 1),
    profile: normalizeProfile(raw.profile || raw),
    media: normalizeMedia(raw.media || {}),
    fallback: {
      mode: 'ordinary-vector',
      color,
      width: baseWidth
    }
  };
}

export function validateExpressiveStroke(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { valid: false, errors: ['style'], normalized: null };
  if (raw.format !== EXPRESSIVE_STROKE_FORMAT) errors.push('format');
  if (raw.version !== EXPRESSIVE_STROKE_VERSION) errors.push('version');
  if (typeof raw.color !== 'string' || !raw.color) errors.push('color');
  if (!Number.isFinite(+raw.baseWidth) || +raw.baseWidth < .05 || +raw.baseWidth > 512) errors.push('baseWidth');
  if (!Number.isFinite(+raw.opacity) || +raw.opacity < 0 || +raw.opacity > 1) errors.push('opacity');
  const profile = raw.profile;
  if (!profile || profile.scope !== 'subpath' || profile.interpolation !== 'linear') errors.push('profile');
  const samples = profile?.samples;
  if (!Array.isArray(samples) || samples.length < 2 || samples.length > EXPRESSIVE_STROKE_MAX_PROFILE_SAMPLES) errors.push('profile.samples');
  else {
    let previous = -Infinity;
    for (let index = 0; index < samples.length; index++) {
      const sample = samples[index];
      if (!Number.isFinite(+sample?.t) || +sample.t < 0 || +sample.t > 1 || +sample.t < previous) errors.push(`profile.samples.${index}.t`);
      if (!Number.isFinite(+sample?.width) || +sample.width < .02 || +sample.width > 8) errors.push(`profile.samples.${index}.width`);
      if (!Number.isFinite(+sample?.pressure) || +sample.pressure < 0 || +sample.pressure > 1) errors.push(`profile.samples.${index}.pressure`);
      previous = +sample?.t;
    }
  }
  for (const key of ['pressureInfluence','taperStart','taperEnd']) {
    if (!Number.isFinite(+profile?.[key]) || +profile[key] < 0 || +profile[key] > 1) errors.push(`profile.${key}`);
  }
  const media = raw.media;
  if (!media || media.model !== 'deterministic-vector-approximation' || !KNOWN_ENGINES.has(media.engine)) errors.push('media');
  for (const key of ['flow','grain','wetness','bristle','softness']) {
    if (!Number.isFinite(+media?.[key]) || +media[key] < 0 || +media[key] > 1) errors.push(`media.${key}`);
  }
  if (!Number.isInteger(media?.seed) || media.seed < 0) errors.push('media.seed');
  if (raw.fallback?.mode !== 'ordinary-vector') errors.push('fallback');
  return { valid: errors.length === 0, errors: [...new Set(errors)], normalized: normalizeExpressiveStroke(raw) };
}

function interpolateSample(samples, t) {
  if (t <= samples[0].t) return samples[0];
  if (t >= samples.at(-1).t) return samples.at(-1);
  let right = 1;
  while (right < samples.length && samples[right].t < t) right++;
  const a = samples[right - 1], b = samples[right];
  const span = Math.max(1e-8, b.t - a.t), amount = (t - a.t) / span;
  return {
    t,
    width: a.width + (b.width - a.width) * amount,
    pressure: a.pressure + (b.pressure - a.pressure) * amount
  };
}

const smooth = value => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export function expressiveStrokeWidthAt(raw, position) {
  const style = normalizeExpressiveStroke(raw);
  if (!style) return 0;
  const t = clamp(position, 0, 1), sample = interpolateSample(style.profile.samples, t);
  const pressure = (1 - style.profile.pressureInfluence) + sample.pressure * style.profile.pressureInfluence;
  const startTaper = 1 - style.profile.taperStart * (1 - smooth(t / .18));
  const endTaper = 1 - style.profile.taperEnd * (1 - smooth((1 - t) / .18));
  return Math.max(.01, style.baseWidth * sample.width * pressure * startTaper * endTaper);
}

export function expressiveStrokeMaxWidth(raw) {
  const style = normalizeExpressiveStroke(raw);
  if (!style) return 0;
  const maxScale = Math.max(...style.profile.samples.map(sample => sample.width));
  return style.baseWidth * maxScale;
}

function mix32(value) {
  let x = value >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

export function expressiveStrokeOpacityAt(raw, index = 0) {
  const style = normalizeExpressiveStroke(raw);
  if (!style) return 0;
  const unit = mix32((style.media.seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0) / 4294967295;
  const engineFactor = ({ pencil:.9, marker:.84, watercolor:.76, dry:.72, texture:.78, soft:.82, oil:.96, opaque:.98, ink:1 })[style.media.engine] ?? 1;
  const textureStrength = clamp(style.media.grain * .7 + style.media.bristle * .3, 0, 1);
  const textureFactor = 1 - textureStrength * (.05 + unit * .17);
  const softnessFactor = 1 - style.media.softness * .06;
  const wetnessFactor = 1 + style.media.wetness * .035;
  return clamp(style.opacity * (.35 + style.media.flow * .65) * engineFactor * textureFactor * softnessFactor * wetnessFactor, 0, 1);
}

export function pathGeometryFingerprint(path) {
  const geometry = (path?.subpaths || []).map(subpath => ({
    id: subpath.id || null,
    closed: subpath.closed !== false,
    role: subpath.role || 'outer',
    anchors: (subpath.anchors || []).map(anchor => ({
      id: anchor.id || null,
      x: finite(anchor.x), y: finite(anchor.y),
      in: { x: finite(anchor.in?.x), y: finite(anchor.in?.y) },
      out: { x: finite(anchor.out?.x), y: finite(anchor.out?.y) },
      mode: anchor.mode || 'corner'
    }))
  }));
  const serialized = JSON.stringify(geometry);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index++) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function expressiveStrokeFromBrushPreset(preset = {}, overrides = {}) {
  const parameters = preset.parameters || preset.settings || {};
  const dynamics = preset.dynamics || {};
  const sourceEngine = text(preset.engine, 'generic').toLowerCase();
  const engine = KNOWN_ENGINES.has(sourceEngine) ? sourceEngine : 'generic';
  const degraded = [];
  if (engine === 'generic' && sourceEngine !== 'generic') degraded.push(`engine:${sourceEngine}`);
  for (const key of ['scatter','rotation','texture','dualTip','buildUp','smudge','blend','paintLoad','glaze','drying','pigmentAccumulation','canvasInteraction','diffusion','edgeBackrun','thickness','drag','paletteKnife','brokenCoverage']) {
    if (Number(parameters[key])) degraded.push(key);
  }
  const style = normalizeExpressiveStroke({
    color: overrides.color ?? '#202020',
    baseWidth: overrides.baseWidth ?? parameters.size ?? 1.5,
    opacity: overrides.opacity ?? parameters.opacity ?? 1,
    profile: {
      samples: overrides.samples,
      pressureInfluence: overrides.pressureInfluence ?? dynamics.pressureSize ?? .7,
      taperStart: overrides.taperStart ?? 0,
      taperEnd: overrides.taperEnd ?? 0
    },
    media: {
      presetId: preset.id || null,
      engine,
      flow: overrides.flow ?? parameters.flow ?? 1,
      grain: overrides.grain ?? parameters.grain ?? 0,
      wetness: overrides.wetness ?? parameters.wetness ?? 0,
      bristle: overrides.bristle ?? parameters.bristle ?? 0,
      softness: overrides.softness ?? parameters.edgeSoftness ?? 0,
      seed: overrides.seed ?? preset.fixedSeed ?? 1
    }
  }, overrides);
  return {
    style,
    diagnostics: {
      sourcePresetId: preset.id || null,
      sourceEngine,
      mapped: ['size','opacity','pressureSize','flow','grain','wetness','bristle','edgeSoftness','fixedSeed'],
      degraded: [...new Set(degraded)].sort(),
      rendererModel: 'deterministic-vector-approximation',
      fallback: 'ordinary-vector'
    }
  };
}

export function cloneExpressiveStroke(style) {
  return clone(normalizeExpressiveStroke(style));
}
