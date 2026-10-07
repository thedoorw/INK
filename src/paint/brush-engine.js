/* Deterministic professional brush engine.
 * Natural-media outputs are declared approximation models; no preset claims
 * physical equivalence with laboratory pigment or commercial paint engines. */
import { migrateUnifiedStroke, strokeHash } from './stroke-model.js';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, finite(value)));
const seeded = seed => { let x = (seed || 1) >>> 0; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; };

export const BRUSH_PRESET_FORMAT = 'INK-BRUSH-PRESET';
export const BRUSH_PRESET_VERSION = 2;
export const BRUSH_PACKAGE_FORMAT = 'INK-BRUSH-PACKAGE';
export const BRUSH_PACKAGE_VERSION = 1;
export const NATURAL_MEDIA_DISCLOSURE = 'APPROXIMATION_MODEL_NOT_PHYSICAL_EQUIVALENCE';

const dynamics = (overrides = {}) => ({
  pressureSize: .7, pressureOpacity: .2, pressureFlow: .25,
  tiltSize: .12, tiltRotation: .1, velocitySize: .08, velocityOpacity: .06,
  directionalRotation: 1, sizeJitter: 0, opacityJitter: 0, flowJitter: 0,
  positionJitter: 0, rotationJitter: 0, spacingJitter: 0, ...overrides
});

const parameters = (overrides = {}) => ({
  size: 18, opacity: 1, flow: .8, spacing: .1, scatter: 0, rotation: 0,
  texture: .05, dualTip: 0, grain: .05, edgeSoftness: .05, buildUp: .6,
  smudge: 0, blend: 0, wetness: 0, paintLoad: 1, glaze: 0, drying: .15,
  pigmentAccumulation: .5, canvasInteraction: .35, bristle: .1,
  diffusion: 0, edgeBackrun: 0, thickness: 0, drag: 0, paletteKnife: 0,
  brokenCoverage: 0, ...overrides
});

function preset(id, name, category, engine, params, dynamic = {}, metadata = {}) {
  return {
    format: BRUSH_PRESET_FORMAT, schemaVersion: BRUSH_PRESET_VERSION, id, name,
    category, engine, description: metadata.description || name,
    parameters: parameters(params), dynamics: dynamics(dynamic),
    tip: { kind: metadata.tip || 'procedural-round', assetId: metadata.tipAsset || null },
    texture: { kind: metadata.textureKind || 'procedural', assetId: metadata.textureAsset || null, strength: parameters(params).texture },
    grain: { kind: metadata.grainKind || 'procedural', assetId: metadata.grainAsset || null, strength: parameters(params).grain },
    blendMode: metadata.blendMode || (engine === 'eraser' ? 'destination-out' : engine === 'marker' ? 'multiply' : 'source-over'),
    dependencies: clone(metadata.dependencies || []),
    assets: clone(metadata.assets || []),
    license: clone(metadata.license || { spdx: 'LicenseRef-INK-BuiltIn' }),
    compatibleVersion: '>=1.3.0',
    preview: { kind: 'sample-stroke', seed: metadata.previewSeed || 2301 },
    exampleStroke: { points: [[.08, .72, .2], [.32, .3, .75], [.62, .62, 1], [.92, .28, .35]], normalized: true },
    fixedSeed: metadata.fixedSeed || 2301,
    recipeParameters: [...Object.keys(parameters(params)), ...Object.keys(dynamics(dynamic))],
    knownLimits: clone(metadata.knownLimits || []),
    approximation: ['watercolor', 'oil', 'dry'].includes(engine) ? NATURAL_MEDIA_DISCLOSURE : null,
    favorite: false,
    tags: clone(metadata.tags || [category, engine])
  };
}

export const BUILTIN_BRUSH_PRESETS = Object.freeze([
  preset('pencil', 'Pencil', 'drawing', 'pencil', { size: 4, opacity: .76, flow: .42, spacing: .055, texture: .58, grain: .64, brokenCoverage: .18, canvasInteraction: .72 }, { pressureSize: .58, pressureOpacity: .48, velocityOpacity: .14 }),
  preset('ink', 'Ink', 'inking', 'ink', { size: 8, opacity: 1, flow: 1, spacing: .028, edgeSoftness: .01, buildUp: 1 }, { pressureSize: .84, pressureOpacity: .05, directionalRotation: .5 }),
  preset('marker', 'Marker', 'drawing', 'marker', { size: 24, opacity: .62, flow: .68, spacing: .07, edgeSoftness: .04, buildUp: .35 }, { pressureSize: .15, pressureOpacity: .08, tiltRotation: .55 }, { blendMode: 'multiply' }),
  preset('opaque-paint', 'Opaque Paint', 'paint', 'opaque', { size: 34, opacity: .96, flow: .88, spacing: .085, texture: .1, buildUp: .92, paintLoad: 1, thickness: .18, canvasInteraction: .42 }, { pressureSize: .72, pressureFlow: .48, tiltRotation: .25 }),
  preset('soft-paint', 'Soft Paint', 'paint', 'soft', { size: 52, opacity: .45, flow: .32, spacing: .065, edgeSoftness: .82, buildUp: .24, blend: .22 }, { pressureSize: .35, pressureOpacity: .38, velocityOpacity: .18 }),
  preset('watercolor', 'Watercolor', 'natural-media', 'watercolor', { size: 42, opacity: .38, flow: .25, spacing: .06, texture: .28, grain: .36, wetness: .88, paintLoad: .52, blend: .46, glaze: .34, drying: .16, diffusion: .62, edgeBackrun: .48, pigmentAccumulation: .58, canvasInteraction: .82 }, { pressureSize: .46, pressureFlow: .54, velocityOpacity: .12 }, { knownLimits: ['Fluid diffusion and backruns are deterministic visual approximations.'] }),
  preset('oil-like', 'Oil-like', 'natural-media', 'oil', { size: 38, opacity: .92, flow: .74, spacing: .075, texture: .38, grain: .2, wetness: .48, paintLoad: .94, smudge: .24, blend: .34, glaze: .1, drying: .08, pigmentAccumulation: .78, thickness: .8, drag: .64, paletteKnife: .12, canvasInteraction: .72, bristle: .56 }, { pressureSize: .66, pressureFlow: .52, tiltRotation: .7, directionalRotation: .9 }, { knownLimits: ['Impasto height and pigment mixing are appearance-oriented approximations.'] }),
  preset('dry-brush', 'Dry Brush', 'natural-media', 'dry', { size: 30, opacity: .72, flow: .36, spacing: .115, scatter: .07, texture: .92, grain: .9, wetness: .01, paintLoad: .42, brokenCoverage: .74, canvasInteraction: .94, bristle: .84 }, { pressureSize: .7, pressureFlow: .65, velocityOpacity: .4, directionalRotation: .8, positionJitter: .08 }, { knownLimits: ['Broken coverage is based on seeded paper-height sampling.'] }),
  preset('texture-brush', 'Texture Brush', 'effects', 'texture', { size: 44, opacity: .58, flow: .46, spacing: .16, scatter: .26, rotation: .45, texture: 1, grain: .72, dualTip: .36 }, { pressureSize: .45, rotationJitter: .8, positionJitter: .22, spacingJitter: .24 }),
  preset('blender', 'Blender', 'mixing', 'blender', { size: 46, opacity: .52, flow: .4, spacing: .07, paintLoad: 0, smudge: .58, blend: .92, edgeSoftness: .38, drag: .32 }, { pressureSize: .52, pressureFlow: .38, directionalRotation: .55 }),
  preset('smudge', 'Smudge', 'mixing', 'smudge', { size: 40, opacity: .68, flow: .56, spacing: .055, paintLoad: 0, smudge: .94, blend: .48, drag: .82, canvasInteraction: .86 }, { pressureSize: .58, pressureFlow: .62, directionalRotation: 1 }),
  preset('eraser', 'Eraser', 'utility', 'eraser', { size: 28, opacity: 1, flow: 1, spacing: .045, paintLoad: 0, edgeSoftness: .08, buildUp: 1 }, { pressureSize: .66, pressureOpacity: .1 }, { blendMode: 'destination-out' })
]);

export function migrateBrushPreset(raw = {}) {
  if (raw.format === BRUSH_PRESET_FORMAT && raw.schemaVersion === BRUSH_PRESET_VERSION) return normalizeBrushPreset(raw);
  const settings = raw.parameters || raw.settings || {};
  return normalizeBrushPreset({
    ...raw,
    format: BRUSH_PRESET_FORMAT,
    schemaVersion: BRUSH_PRESET_VERSION,
    category: raw.category || 'imported',
    engine: raw.engine || 'opaque',
    parameters: settings,
    dynamics: raw.dynamics || Object.fromEntries(Object.entries(settings).filter(([key]) => /pressure|tilt|velocity|direction|jitter/i.test(key))),
    compatibleVersion: raw.compatibleVersion || '>=1.0.0',
    knownLimits: [...(raw.knownLimits || []), ...(raw.version && raw.version < 2 ? ['Migrated from legacy brush preset.'] : [])]
  });
}

export function normalizeBrushPreset(raw = {}) {
  const normalized = {
    ...clone(raw), format: BRUSH_PRESET_FORMAT, schemaVersion: BRUSH_PRESET_VERSION,
    id: String(raw.id || ''), name: String(raw.name || raw.id || ''), category: raw.category || 'imported',
    engine: raw.engine || 'opaque', parameters: parameters(raw.parameters || raw.settings),
    dynamics: dynamics(raw.dynamics), tip: clone(raw.tip || { kind: 'procedural-round', assetId: null }),
    texture: clone(raw.texture || { kind: 'procedural', assetId: null, strength: finite(raw.parameters?.texture) }),
    grain: clone(raw.grain || { kind: 'procedural', assetId: null, strength: finite(raw.parameters?.grain) }),
    dependencies: clone(raw.dependencies || []), assets: clone(raw.assets || []),
    license: clone(raw.license || { spdx: 'NOASSERTION' }), compatibleVersion: raw.compatibleVersion || '>=1.3.0',
    preview: clone(raw.preview || { kind: 'sample-stroke', seed: raw.fixedSeed || 1 }),
    exampleStroke: clone(raw.exampleStroke || { points: [], normalized: true }),
    fixedSeed: Math.trunc(finite(raw.fixedSeed, 1)) >>> 0,
    recipeParameters: clone(raw.recipeParameters || [...Object.keys(parameters()), ...Object.keys(dynamics())]),
    knownLimits: clone(raw.knownLimits || []), favorite: Boolean(raw.favorite), tags: clone(raw.tags || [])
  };
  normalized.blendMode = raw.blendMode || (normalized.engine === 'eraser' ? 'destination-out' : 'source-over');
  normalized.approximation = ['watercolor', 'oil', 'dry'].includes(normalized.engine) ? NATURAL_MEDIA_DISCLOSURE : raw.approximation || null;
  return normalized;
}

export function validateBrushPreset(raw, { availableAssets = [] } = {}) {
  const preset = migrateBrushPreset(raw);
  const errors = [], warnings = [];
  if (!preset.id) errors.push('BRUSH_ID_REQUIRED');
  if (!BUILTIN_BRUSH_PRESETS.some(item => item.engine === preset.engine) && !['pencil','ink','marker','opaque','soft','watercolor','oil','dry','texture','blender','smudge','eraser'].includes(preset.engine)) errors.push('BRUSH_ENGINE_UNSUPPORTED');
  for (const [key, value] of Object.entries(preset.parameters)) if (!Number.isFinite(Number(value))) errors.push(`PARAMETER_INVALID:${key}`);
  const assetIds = new Set(availableAssets.map(item => typeof item === 'string' ? item : item.id));
  const missingDependencies = preset.dependencies.filter(item => item.required !== false && item.assetId && !assetIds.has(item.assetId));
  if (missingDependencies.length) warnings.push(...missingDependencies.map(item => `DEPENDENCY_MISSING:${item.assetId}`));
  const unsafeAssets = preset.assets.filter(item => item.executable || /javascript|html|svg/i.test(item.mimeType || '') || /\.m?js$/i.test(item.name || ''));
  if (unsafeAssets.length) errors.push(...unsafeAssets.map(item => `UNTRUSTED_EXECUTABLE_ASSET:${item.name || item.id}`));
  if (!preset.license?.spdx) warnings.push('LICENSE_MISSING');
  return { valid: errors.length === 0, errors, warnings, missingDependencies, unsafeAssets, preset };
}

export class BrushPresetRegistry {
  constructor(presets = BUILTIN_BRUSH_PRESETS) { this.presets = new Map(); for (const value of presets) this.register(value); }
  register(value, options = {}) { const result = validateBrushPreset(value, options); if (!result.valid) throw new Error(`INK_BRUSH_PRESET_INVALID:${result.errors.join(',')}`); this.presets.set(result.preset.id, result.preset); return clone(result.preset); }
  get(id) { const value = this.presets.get(id); if (!value) throw new Error(`INK_BRUSH_PRESET_NOT_FOUND:${id}`); return clone(value); }
  list({ category, favorite, search } = {}) { return [...this.presets.values()].filter(item => !category || item.category === category).filter(item => favorite == null || item.favorite === favorite).filter(item => !search || `${item.name} ${item.id} ${item.tags.join(' ')}`.toLowerCase().includes(String(search).toLowerCase())).map(clone); }
  export(id) { return JSON.stringify(this.get(id), null, 2); }
  import(value, options = {}) { return this.register(typeof value === 'string' ? JSON.parse(value) : value, options); }
  duplicate(id, nextId = `${id}-copy`) { const value = this.get(id); return this.register({ ...value, id: nextId, name: `${value.name} Copy`, favorite: false }); }
  modify(id, changes) { const value = this.get(id); return this.register({ ...value, ...clone(changes), id, parameters: { ...value.parameters, ...(changes.parameters || {}) }, dynamics: { ...value.dynamics, ...(changes.dynamics || {}) } }); }
  favorite(id, state = true) { return this.modify(id, { favorite: Boolean(state) }); }
  remove(id) { return this.presets.delete(id); }
}

function dynamicValue(base, sample, preset, key, rng) {
  const d = preset.dynamics, pressure = sample.pressure, velocity = clamp(sample.velocity * 10), tilt = clamp((90 - sample.altitude) / 90);
  if (key === 'size') return Math.max(.05, base * (1 - d.pressureSize + d.pressureSize * pressure) * (1 + d.tiltSize * tilt) * (1 - d.velocitySize * velocity) * (1 + (rng() - .5) * 2 * d.sizeJitter));
  if (key === 'opacity') return clamp(base * (1 - d.pressureOpacity + d.pressureOpacity * pressure) * (1 - d.velocityOpacity * velocity) * (1 + (rng() - .5) * 2 * d.opacityJitter));
  if (key === 'flow') return clamp(base * (1 - d.pressureFlow + d.pressureFlow * pressure) * (1 + (rng() - .5) * 2 * d.flowJitter));
  return base;
}

function behaviorFor(engine, sample, preset, rng, index) {
  const p = preset.parameters, pressure = sample.pressure, speed = clamp(sample.velocity * 12), paper = .5 + .5 * Math.sin((sample.position.x * 12.9898 + sample.position.y * 78.233 + preset.fixedSeed) * .017);
  const common = { coverage: 1, softness: p.edgeSoftness, texture: p.texture, grain: p.grain, thickness: p.thickness, wetness: p.wetness, pigment: p.paintLoad, blend: p.blend, smudge: p.smudge, glaze: p.glaze, drying: p.drying, canvasInteraction: p.canvasInteraction };
  if (engine === 'pencil') return { ...common, coverage: clamp((.45 + pressure * .45) * (1 - p.brokenCoverage * paper * .45)), graphite: clamp(.28 + pressure * .72), grainContact: clamp(p.grain * (.5 + pressure * .5)), mode: 'graphite-grain' };
  if (engine === 'ink') return { ...common, coverage: 1, softness: .01, cap: pressure < .16 ? 'low-pressure-taper' : index > 0 && speed > .65 ? 'velocity-taper' : 'round', adaptiveLineWeight: .45 + pressure * .55, cornerPreservation: true, overlapReduction: true, mode: 'solid-ink' };
  if (engine === 'marker') return { ...common, coverage: clamp(.62 + pressure * .18), overlapDarkening: p.buildUp, solventEdge: .18, mode: 'translucent-marker' };
  if (engine === 'opaque') return { ...common, coverage: clamp(.68 + p.buildUp * pressure), thickness: p.thickness * pressure, bristleTracks: p.bristle, mode: 'opaque-build-up' };
  if (engine === 'soft') return { ...common, coverage: clamp(.22 + pressure * .4), softness: Math.max(.5, p.edgeSoftness), feather: .4 + p.edgeSoftness * .5, mode: 'soft-deposit' };
  if (engine === 'watercolor') { const sampleWetness=Number.isFinite(sample.wetness)&&sample.wetness>0?sample.wetness:p.wetness,localWetness=clamp(sampleWetness*(1-index*p.drying*.002)),sampleLoad=Number.isFinite(sample.paintLoad)?sample.paintLoad:p.paintLoad,backrun=p.edgeBackrun*localWetness*(1-sampleLoad*.35),deposit=p.pigmentAccumulation*(1-localWetness*.28+paper*.22); return { ...common, coverage:clamp(.16+sampleLoad*pressure*.58),wetness:localWetness,dryingMap:clamp(index*p.drying*.002),pigmentDensity:clamp(deposit*sampleLoad*(.45+pressure*.55)),diffusion:p.diffusion*(.38+localWetness*.48+paper*.14),edgeBackrun:backrun,edgeAccumulation:clamp(backrun*.65+deposit*.28),pigmentDeposit:deposit,granulation:clamp(p.grain*paper*(.35+sampleLoad*.55)),paperAbsorption:clamp(p.canvasInteraction||.62),wetIntoWet:localWetness>.7,wetOnDry:localWetness>.12&&localWetness<=.7,dryOnDry:localWetness<=.12,glazeLayer:sample.glaze>0,localMaskedWash:Boolean(sample.maskId),preserveWhite:Boolean(sample.preserveWhite),edgeType:backrun>.32?'BACKRUN_EDGE':localWetness<.34?'HARD_EDGE':'SOFT_EDGE',selectiveEdgeSharpening:localWetness<.4,modelClass:'APPROXIMATED',mode:'watercolor-diffusion-approximation' }; }
  if (engine === 'oil') { const sampleLoad=Number.isFinite(sample.paintLoad)?sample.paintLoad:p.paintLoad,thickness=p.thickness*sampleLoad*(.3+pressure*.7),pickup=clamp((sample.smudge||p.smudge)*(1-sampleLoad)*(.4+pressure*.6)),deposit=clamp(sampleLoad*(.3+pressure*.7)); return { ...common,coverage:clamp(.5+sampleLoad*pressure*.46),paintLoad:sampleLoad,thickness,impastoHeight:thickness,pickup,deposit,dirtyBrushMixing:clamp((sample.blend||p.blend)*(.3+paper*.45)),drag:p.drag*(1-speed*.35),localSmear:clamp((sample.smudge||p.smudge)*pressure),paletteKnife:p.paletteKnife,paletteKnifeApproximation:p.paletteKnife>0,scrape:sample.scrape||false,bristleDirection:sample.direction,directionalBristle:p.bristle,strokeDirectionField:sample.direction,localPile:p.pigmentAccumulation*pressure,glaze:sample.glaze||p.glaze,brokenColor:clamp(p.grain*(.2+paper*.7)),canvasReveal:clamp(1-deposit*pressure),materialResponse:'OIL_LIKE',thicknessAwareComposite:true,wetState:sample.wetness>p.drying?'wet':'tacky',modelClass:'APPROXIMATED',mode:sample.scrape?'scrape':'impasto-mixing-approximation' }; }
  if (engine === 'dry') return { ...common, coverage: clamp(pressure * (1 - p.brokenCoverage * (.35 + paper * .65)) * (1 - speed * .32)), broken: rng() < p.brokenCoverage * (.25 + paper * .75), roughness: p.canvasInteraction, directionality: Math.cos(sample.direction) * p.bristle, mode: 'dry-broken-coverage-approximation' };
  if (engine === 'texture') return { ...common, coverage: clamp(.35 + pressure * .4), stampIndex: Math.floor(rng() * 65535), dualTipOffset: p.dualTip * (rng() - .5), mode: 'dual-tip-texture-stamp' };
  if (engine === 'blender') return { ...common, coverage: 0, pigment: 0, blend: p.blend * pressure, pickup: p.smudge * .45, mode: 'color-blender' };
  if (engine === 'smudge') return { ...common, coverage: 0, pigment: 0, smudge: p.smudge * pressure, drag: p.drag, transportDirection: sample.direction, mode: 'pigment-transport' };
  if (engine === 'eraser') return { ...common, coverage: pressure, pigment: 0, mode: 'alpha-removal' };
  return { ...common, mode: 'generic' };
}

export function compileBrushStroke(rawStroke, rawPreset, overrides = {}) {
  const stroke = migrateUnifiedStroke(rawStroke);
  const preset = migrateBrushPreset(rawPreset);
  const seed = Math.trunc(finite(overrides.seed, stroke.seed ?? preset.fixedSeed)) >>> 0;
  const rng = seeded(seed);
  const dabs = [];
  const source = stroke.samples;
  for (let index = 0; index < source.length; index += 1) {
    const sample = source[index], p = preset.parameters;
    const size = dynamicValue(p.size * sample.size, sample, preset, 'size', rng);
    const opacity = dynamicValue(p.opacity * sample.opacity * stroke.opacity, sample, preset, 'opacity', rng);
    const flow = dynamicValue(p.flow * sample.flow, sample, preset, 'flow', rng);
    const rotation = p.rotation + sample.rotation * preset.dynamics.directionalRotation + sample.azimuth * preset.dynamics.tiltRotation + (rng() - .5) * Math.PI * 2 * preset.dynamics.rotationJitter;
    const scatter = size * p.scatter * (rng() - .5) * 2;
    const normal = { x: -Math.sin(rotation), y: Math.cos(rotation) };
    const behavior = behaviorFor(preset.engine, sample, preset, rng, index);
    if (behavior.broken) continue;
    dabs.push({
      index, x: sample.position.x + normal.x * scatter, y: sample.position.y + normal.y * scatter,
      size, opacity, flow, spacing: Math.max(.001, p.spacing * sample.spacing * (1 + (rng() - .5) * 2 * preset.dynamics.spacingJitter)),
      rotation, color: overrides.color || stroke.color, textureCoordinates: clone(sample.textureCoordinates),
      ...behavior
    });
  }
  const result = {
    format: 'INK-BRUSH-REPLAY', schemaVersion: 2, strokeId: stroke.id, brushId: preset.id,
    engine: preset.engine, seed, color: overrides.color || stroke.color, blendMode: preset.blendMode,
    approximation: preset.approximation, dependencies: clone(preset.dependencies), dabs,
    // v1.2 compatibility: public replay consumers read `points`; keep it as the
    // same compiled dab sequence while `dabs` remains the canonical v2 name.
    points: dabs,
    behaviorSignature: strokeHash(dabs.map(dab => [dab.mode, dab.coverage, dab.thickness, dab.diffusion, dab.smudge])),
    sourceHash: stroke.contentHash
  };
  result.replayHash = strokeHash(result);
  return result;
}

export function createBrushPackage({ id = 'ink-brush-package', name = 'INK Brush Package', presets = BUILTIN_BRUSH_PRESETS, assets = [], license = { spdx: 'LicenseRef-INK-BuiltIn' }, compatibleVersion = '>=1.3.0', metadata = {} } = {}) {
  const packageValue = {
    format: BRUSH_PACKAGE_FORMAT, schemaVersion: BRUSH_PACKAGE_VERSION, id, name,
    metadata: clone(metadata), presets: presets.map(migrateBrushPreset), assets: clone(assets),
    dependencies: [...new Map(presets.flatMap(item => item.dependencies || []).map(item => [item.assetId || JSON.stringify(item), clone(item)])).values()],
    license: clone(license), compatibleVersion, knownLimits: [...new Set(presets.flatMap(item => item.knownLimits || []))],
    security: { executableAssetsAllowed: false, scanned: true }
  };
  packageValue.packageHash = strokeHash({ ...packageValue, packageHash: undefined });
  return packageValue;
}

export function importBrushPackage(raw, registry = new BrushPresetRegistry()) {
  const value = typeof raw === 'string' ? JSON.parse(raw) : clone(raw);
  if (value?.format !== BRUSH_PACKAGE_FORMAT) throw new Error('INK_BRUSH_PACKAGE_INVALID');
  const unsafePackageAssets = (value.assets || []).filter(item => item.executable || /javascript|html/i.test(item.mimeType || '') || /\.m?js$/i.test(item.name || ''));
  if (unsafePackageAssets.length) return { status: 'REJECTED', errors: unsafePackageAssets.map(item => `UNTRUSTED_EXECUTABLE_ASSET:${item.name || item.id}`), warnings: [], imported: [] };
  const results = value.presets.map(item => validateBrushPreset(item, { availableAssets: value.assets || [] }));
  const errors = results.flatMap(item => item.errors), warnings = results.flatMap(item => item.warnings);
  if (errors.length) return { status: 'REJECTED', errors, warnings, imported: [] };
  const imported = results.map(item => registry.register(item.preset, { availableAssets: value.assets || [] }));
  return { status: warnings.length ? 'PARTIAL' : 'DIRECT', errors: [], warnings, imported, packageHash: value.packageHash };
}

export function exportBrushPackage(registry, ids = registry.list().map(item => item.id), options = {}) {
  return createBrushPackage({ ...options, presets: ids.map(id => registry.get(id)) });
}
