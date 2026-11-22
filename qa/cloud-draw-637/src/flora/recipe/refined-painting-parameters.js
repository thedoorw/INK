export const REFINED_PAINTING_PARAMETERS_VERSION = '0.3';
export const SURFACE_RECOVERY_PARAMETERS_VERSION = '0.2';
export const LEGACY_REFINED_PAINTING_PARAMETERS_VERSION = '0.1';

export const REFINEMENT_FIELDS = new Set([
  'schemaVersion', 'colorFieldInterpolation', 'strokeLengthVariation', 'strokeDensityFalloff',
  'opacityFalloff', 'curvatureFollowing', 'localEdgeHardness', 'localGlazeAccumulation',
  'overlapShadowFalloff', 'regionInteriorSmoothing', 'silhouetteProtection',
  'textureSuppression', 'deterministicVariation',
  'multiBandColorField', 'localWarmCoolShift', 'glazeAccumulationMap', 'edgeTranslucency',
  'strokeClustering', 'strokeDropout', 'nonuniformTextureSuppression', 'centerOcclusionMap',
  'leafCrossSectionField', 'backgroundLowFrequencyField',
  'frequencyLayers', 'pigmentMass'
]);

export const COLOR_FIELD_FIELDS = new Set(['mode', 'strength', 'bias']);
export const STROKE_LENGTH_FIELDS = new Set(['minScale', 'maxScale', 'shortMix']);
export const FALLOFF_FIELDS = new Set(['root', 'tip', 'edge']);
export const CURVATURE_FIELDS = new Set(['strength', 'bend']);
export const EDGE_HARDNESS_FIELDS = new Set(['interior', 'edge', 'tip']);
export const GLAZE_FIELDS = new Set(['root', 'mid', 'tip']);
export const OVERLAP_FALLOFF_FIELDS = new Set(['width', 'softness', 'intensity']);
export const MULTI_BAND_FIELDS = new Set(['bands', 'ridgeAmplitude', 'valleyAmplitude', 'lateralInfluence', 'phase']);
export const WARM_COOL_FIELDS = new Set(['root', 'tip', 'left', 'right']);
export const GLAZE_MAP_FIELDS = new Set(['root', 'midLeft', 'midRight', 'tip']);
export const EDGE_TRANSLUCENCY_FIELDS = new Set(['left', 'right', 'tip']);
export const CLUSTERING_FIELDS = new Set(['count', 'spread', 'strength']);
export const NONUNIFORM_TEXTURE_FIELDS = new Set(['interior', 'edge', 'tip']);
export const CENTER_OCCLUSION_FIELDS = new Set(['occlusion', 'irregularity', 'transition']);
export const LEAF_CROSS_SECTION_FIELDS = new Set(['ridge', 'leftShadow', 'rightLight', 'twist']);
export const BACKGROUND_FIELD_FIELDS = new Set(['amplitude', 'scale', 'phase', 'diagonalBias']);
export const FREQUENCY_LAYER_FIELDS = new Set(['low', 'mid', 'high']);
export const PIGMENT_MASS_FIELDS = new Set([
  'pigmentLoad', 'depositRate', 'strokeBodyCoverage', 'glazeAccumulation', 'localColorDensity',
  'wetOverDryResponse', 'opacityFloor', 'opacityCeiling', 'saturationRetention',
  'valueRetention', 'edgeRetention'
]);

const refinedClamp = (value, min, max) => Math.max(min, Math.min(max, value));
const refinedObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const refinedFinite = value => typeof value === 'number' && Number.isFinite(value);
const refinedRange = (value, min, max) => refinedFinite(value) && value >= min && value <= max;

function refinedUnsupported(value, fields, prefix, errors) {
  for (const key of Object.keys(value || {})) if (!fields.has(key)) errors.push({ code: 'UNSUPPORTED_FIELD', path: `${prefix}.${key}` });
}
function refinedValidateObject(value, fields, prefix, errors, ranges = {}) {
  if (!refinedObject(value)) { errors.push({ code: 'REFINEMENT_OBJECT', path: prefix }); return; }
  refinedUnsupported(value, fields, prefix, errors);
  for (const key of fields) {
    const [min, max] = ranges[key] || [0, 1];
    if (!refinedRange(value[key], min, max)) errors.push({ code: 'REFINEMENT_RANGE', path: `${prefix}.${key}` });
  }
}
function refinedValidateTriple(value, fields, prefix, errors, min = 0, max = 1) {
  refinedValidateObject(value, fields, prefix, errors, Object.fromEntries([...fields].map(key => [key, [min, max]])));
}

function recoveryDefaults(component) {
  const common = {
    multiBandColorField: { bands: 3, ridgeAmplitude: .16, valleyAmplitude: .10, lateralInfluence: .16, phase: .18 },
    localWarmCoolShift: { root: -.08, tip: .06, left: -.07, right: .08 },
    glazeAccumulationMap: { root: 1.18, midLeft: .88, midRight: 1.04, tip: .72 },
    edgeTranslucency: { left: .70, right: .58, tip: .64 },
    strokeClustering: { count: 3, spread: .38, strength: .46 },
    strokeDropout: .38,
    nonuniformTextureSuppression: { interior: .995, edge: .970, tip: .985 },
    centerOcclusionMap: { occlusion: 0, irregularity: 0, transition: .5 },
    leafCrossSectionField: { ridge: 0, leftShadow: 0, rightLight: 0, twist: 0 },
    backgroundLowFrequencyField: { amplitude: 0, scale: .5, phase: 0, diagonalBias: 0 }
  };
  if (component === 'center') {
    common.multiBandColorField = { bands: 4, ridgeAmplitude: .12, valleyAmplitude: .18, lateralInfluence: .12, phase: .37 };
    common.localWarmCoolShift = { root: -.12, tip: .10, left: -.05, right: .09 };
    common.centerOcclusionMap = { occlusion: .38, irregularity: .58, transition: .68 };
    common.strokeClustering = { count: 4, spread: .34, strength: .66 };
    common.strokeDropout = .34;
  } else if (component === 'stem') {
    common.multiBandColorField = { bands: 2, ridgeAmplitude: .08, valleyAmplitude: .06, lateralInfluence: .24, phase: .11 };
    common.localWarmCoolShift = { root: -.03, tip: .04, left: -.06, right: .07 };
    common.edgeTranslucency = { left: .88, right: .82, tip: .90 };
    common.strokeClustering = { count: 2, spread: .18, strength: .32 };
    common.strokeDropout = .12;
  } else if (component === 'leaf') {
    common.multiBandColorField = { bands: 3, ridgeAmplitude: .10, valleyAmplitude: .08, lateralInfluence: .30, phase: .24 };
    common.localWarmCoolShift = { root: -.05, tip: .07, left: -.10, right: .08 };
    common.leafCrossSectionField = { ridge: .74, leftShadow: .64, rightLight: .58, twist: .28 };
    common.strokeClustering = { count: 3, spread: .28, strength: .50 };
    common.strokeDropout = .20;
  } else if (component === 'background') {
    common.multiBandColorField = { bands: 2, ridgeAmplitude: .035, valleyAmplitude: .025, lateralInfluence: .06, phase: .43 };
    common.localWarmCoolShift = { root: -.02, tip: .02, left: -.025, right: .03 };
    common.glazeAccumulationMap = { root: .86, midLeft: .96, midRight: .90, tip: .82 };
    common.edgeTranslucency = { left: .94, right: .94, tip: .96 };
    common.strokeClustering = { count: 2, spread: .42, strength: .20 };
    common.strokeDropout = .52;
    common.nonuniformTextureSuppression = { interior: .995, edge: .985, tip: .99 };
    common.backgroundLowFrequencyField = { amplitude: .14, scale: .66, phase: .31, diagonalBias: .22 };
  }
  const massProfiles = {
    crown: {
      frequencyLayers: { low: 1, mid: .88, high: .14 },
      pigmentMass: { pigmentLoad: .92, depositRate: .82, strokeBodyCoverage: .90, glazeAccumulation: .78, localColorDensity: .86, wetOverDryResponse: .62, opacityFloor: .085, opacityCeiling: .62, saturationRetention: .94, valueRetention: .90, edgeRetention: .82 }
    },
    center: {
      frequencyLayers: { low: .94, mid: .92, high: .12 },
      pigmentMass: { pigmentLoad: .96, depositRate: .86, strokeBodyCoverage: .88, glazeAccumulation: .84, localColorDensity: .90, wetOverDryResponse: .68, opacityFloor: .09, opacityCeiling: .64, saturationRetention: .95, valueRetention: .88, edgeRetention: .86 }
    },
    stem: {
      frequencyLayers: { low: 1, mid: .72, high: .08 },
      pigmentMass: { pigmentLoad: .84, depositRate: .78, strokeBodyCoverage: .94, glazeAccumulation: .68, localColorDensity: .82, wetOverDryResponse: .52, opacityFloor: .095, opacityCeiling: .56, saturationRetention: .91, valueRetention: .88, edgeRetention: .90 }
    },
    leaf: {
      frequencyLayers: { low: 1, mid: .78, high: .10 },
      pigmentMass: { pigmentLoad: .88, depositRate: .80, strokeBodyCoverage: .93, glazeAccumulation: .72, localColorDensity: .84, wetOverDryResponse: .56, opacityFloor: .09, opacityCeiling: .58, saturationRetention: .92, valueRetention: .89, edgeRetention: .88 }
    },
    background: {
      frequencyLayers: { low: .64, mid: .22, high: .025 },
      pigmentMass: { pigmentLoad: .40, depositRate: .42, strokeBodyCoverage: .78, glazeAccumulation: .34, localColorDensity: .40, wetOverDryResponse: .20, opacityFloor: .009, opacityCeiling: .14, saturationRetention: .72, valueRetention: .96, edgeRetention: .32 }
    }
  };
  return { ...common, ...(massProfiles[component] || massProfiles.crown) };
}

export function defaultRefinedPaintingParameters(component = 'generic') {
  const componentProfiles = {
    crown: {
      colorFieldInterpolation: { mode: 'axis', strength: .86, bias: -.08 },
      strokeLengthVariation: { minScale: .42, maxScale: 1.34, shortMix: .34 },
      strokeDensityFalloff: { root: .94, tip: .70, edge: .54 },
      opacityFalloff: { root: .98, tip: .66, edge: .48 },
      curvatureFollowing: { strength: .84, bend: .34 },
      localEdgeHardness: { interior: .78, edge: .40, tip: .56 },
      localGlazeAccumulation: { root: 1.22, mid: .94, tip: .62 },
      overlapShadowFalloff: { width: .034, softness: .84, intensity: .92 },
      regionInteriorSmoothing: .84, silhouetteProtection: .95, textureSuppression: .975, deterministicVariation: .38
    },
    center: {
      colorFieldInterpolation: { mode: 'radial', strength: .90, bias: -.12 },
      strokeLengthVariation: { minScale: .34, maxScale: 1.06, shortMix: .58 },
      strokeDensityFalloff: { root: .98, tip: .70, edge: .58 },
      opacityFalloff: { root: 1, tip: .68, edge: .54 },
      curvatureFollowing: { strength: .68, bend: .26 },
      localEdgeHardness: { interior: .74, edge: .34, tip: .50 },
      localGlazeAccumulation: { root: 1.24, mid: 1.04, tip: .68 },
      overlapShadowFalloff: { width: .028, softness: .86, intensity: .88 },
      regionInteriorSmoothing: .86, silhouetteProtection: .96, textureSuppression: .985, deterministicVariation: .34
    },
    stem: {
      colorFieldInterpolation: { mode: 'axis', strength: .82, bias: -.02 },
      strokeLengthVariation: { minScale: .74, maxScale: 1.16, shortMix: .14 },
      strokeDensityFalloff: { root: .94, tip: .90, edge: .68 },
      opacityFalloff: { root: .94, tip: .86, edge: .62 },
      curvatureFollowing: { strength: .88, bend: .10 },
      localEdgeHardness: { interior: .82, edge: .58, tip: .66 },
      localGlazeAccumulation: { root: 1.02, mid: .98, tip: .88 },
      overlapShadowFalloff: { width: .018, softness: .82, intensity: .76 },
      regionInteriorSmoothing: .90, silhouetteProtection: .98, textureSuppression: .9982, deterministicVariation: .16
    },
    leaf: {
      colorFieldInterpolation: { mode: 'axis', strength: .84, bias: -.05 },
      strokeLengthVariation: { minScale: .54, maxScale: 1.34, shortMix: .28 },
      strokeDensityFalloff: { root: .96, tip: .68, edge: .56 },
      opacityFalloff: { root: .98, tip: .64, edge: .48 },
      curvatureFollowing: { strength: .90, bend: .34 },
      localEdgeHardness: { interior: .80, edge: .46, tip: .74 },
      localGlazeAccumulation: { root: 1.12, mid: .94, tip: .64 },
      overlapShadowFalloff: { width: .026, softness: .80, intensity: .80 },
      regionInteriorSmoothing: .88, silhouetteProtection: .98, textureSuppression: .985, deterministicVariation: .32
    },
    background: {
      colorFieldInterpolation: { mode: 'axis', strength: .68, bias: .06 },
      strokeLengthVariation: { minScale: .82, maxScale: 1.48, shortMix: .12 },
      strokeDensityFalloff: { root: .72, tip: .70, edge: .68 },
      opacityFalloff: { root: .78, tip: .74, edge: .70 },
      curvatureFollowing: { strength: .32, bend: .22 },
      localEdgeHardness: { interior: .52, edge: .24, tip: .30 },
      localGlazeAccumulation: { root: .82, mid: .88, tip: .78 },
      overlapShadowFalloff: { width: .040, softness: .94, intensity: .42 },
      regionInteriorSmoothing: .95, silhouetteProtection: .99, textureSuppression: .998, deterministicVariation: .18
    }
  };
  const profileName = componentProfiles[component] ? component : 'crown';
  return { schemaVersion: REFINED_PAINTING_PARAMETERS_VERSION, ...componentProfiles[profileName], ...recoveryDefaults(profileName) };
}

function validateRecoveryFields(value, path, errors) {
  refinedValidateObject(value.multiBandColorField, MULTI_BAND_FIELDS, `${path}.multiBandColorField`, errors, {
    bands: [1, 8], ridgeAmplitude: [0, .5], valleyAmplitude: [0, .5], lateralInfluence: [0, .6], phase: [0, 1]
  });
  if (refinedObject(value.multiBandColorField) && !Number.isInteger(value.multiBandColorField.bands)) errors.push({ code: 'REFINEMENT_INTEGER', path: `${path}.multiBandColorField.bands` });
  refinedValidateObject(value.localWarmCoolShift, WARM_COOL_FIELDS, `${path}.localWarmCoolShift`, errors, Object.fromEntries([...WARM_COOL_FIELDS].map(key => [key, [-.5, .5]])));
  refinedValidateObject(value.glazeAccumulationMap, GLAZE_MAP_FIELDS, `${path}.glazeAccumulationMap`, errors, Object.fromEntries([...GLAZE_MAP_FIELDS].map(key => [key, [0, 2]])));
  refinedValidateObject(value.edgeTranslucency, EDGE_TRANSLUCENCY_FIELDS, `${path}.edgeTranslucency`, errors);
  refinedValidateObject(value.strokeClustering, CLUSTERING_FIELDS, `${path}.strokeClustering`, errors, { count: [1, 8], spread: [0, 1], strength: [0, 1] });
  if (refinedObject(value.strokeClustering) && !Number.isInteger(value.strokeClustering.count)) errors.push({ code: 'REFINEMENT_INTEGER', path: `${path}.strokeClustering.count` });
  if (!refinedRange(value.strokeDropout, 0, .9)) errors.push({ code: 'REFINEMENT_RANGE', path: `${path}.strokeDropout` });
  refinedValidateObject(value.nonuniformTextureSuppression, NONUNIFORM_TEXTURE_FIELDS, `${path}.nonuniformTextureSuppression`, errors);
  refinedValidateObject(value.centerOcclusionMap, CENTER_OCCLUSION_FIELDS, `${path}.centerOcclusionMap`, errors);
  refinedValidateObject(value.leafCrossSectionField, LEAF_CROSS_SECTION_FIELDS, `${path}.leafCrossSectionField`, errors);
  refinedValidateObject(value.backgroundLowFrequencyField, BACKGROUND_FIELD_FIELDS, `${path}.backgroundLowFrequencyField`, errors, {
    amplitude: [0, .5], scale: [.1, 2], phase: [0, 1], diagonalBias: [-1, 1]
  });
}

function validatePainterlyMassFields(value, path, errors) {
  refinedValidateObject(value.frequencyLayers, FREQUENCY_LAYER_FIELDS, `${path}.frequencyLayers`, errors, { low: [0, 1], mid: [0, 1], high: [0, .35] });
  refinedValidateObject(value.pigmentMass, PIGMENT_MASS_FIELDS, `${path}.pigmentMass`, errors, {
    pigmentLoad: [0, 1.5], depositRate: [0, 1.5], strokeBodyCoverage: [0, 1], glazeAccumulation: [0, 1.5],
    localColorDensity: [0, 1.5], wetOverDryResponse: [0, 1], opacityFloor: [0, .4], opacityCeiling: [.02, 1],
    saturationRetention: [0, 1.2], valueRetention: [0, 1.2], edgeRetention: [0, 1]
  });
  if (refinedObject(value.pigmentMass) && refinedFinite(value.pigmentMass.opacityFloor) && refinedFinite(value.pigmentMass.opacityCeiling) && value.pigmentMass.opacityFloor > value.pigmentMass.opacityCeiling) {
    errors.push({ code: 'REFINEMENT_ORDER', path: `${path}.pigmentMass.opacityFloor` });
  }
}

export function validateRefinedPaintingParameters(value, path = '$.refinement') {
  const errors = [];
  if (!refinedObject(value)) return { ok: false, errors: [{ code: 'REFINEMENT', path }] };
  refinedUnsupported(value, REFINEMENT_FIELDS, path, errors);
  const legacy = value.schemaVersion === LEGACY_REFINED_PAINTING_PARAMETERS_VERSION;
  const surfaceRecovery = value.schemaVersion === SURFACE_RECOVERY_PARAMETERS_VERSION;
  if (!legacy && !surfaceRecovery && value.schemaVersion !== REFINED_PAINTING_PARAMETERS_VERSION) errors.push({ code: 'REFINEMENT_SCHEMA_VERSION', path: `${path}.schemaVersion` });
  if (!refinedObject(value.colorFieldInterpolation)) errors.push({ code: 'COLOR_FIELD_INTERPOLATION', path: `${path}.colorFieldInterpolation` });
  else {
    refinedUnsupported(value.colorFieldInterpolation, COLOR_FIELD_FIELDS, `${path}.colorFieldInterpolation`, errors);
    if (!['axis', 'radial', 'contour'].includes(value.colorFieldInterpolation.mode)) errors.push({ code: 'COLOR_FIELD_MODE', path: `${path}.colorFieldInterpolation.mode` });
    if (!refinedRange(value.colorFieldInterpolation.strength, 0, 1)) errors.push({ code: 'REFINEMENT_RANGE', path: `${path}.colorFieldInterpolation.strength` });
    if (!refinedRange(value.colorFieldInterpolation.bias, -1, 1)) errors.push({ code: 'REFINEMENT_RANGE', path: `${path}.colorFieldInterpolation.bias` });
  }
  if (!refinedObject(value.strokeLengthVariation)) errors.push({ code: 'STROKE_LENGTH_VARIATION', path: `${path}.strokeLengthVariation` });
  else {
    refinedUnsupported(value.strokeLengthVariation, STROKE_LENGTH_FIELDS, `${path}.strokeLengthVariation`, errors);
    if (!refinedRange(value.strokeLengthVariation.minScale, .2, 1.5)) errors.push({ code: 'REFINEMENT_RANGE', path: `${path}.strokeLengthVariation.minScale` });
    if (!refinedRange(value.strokeLengthVariation.maxScale, .2, 2)) errors.push({ code: 'REFINEMENT_RANGE', path: `${path}.strokeLengthVariation.maxScale` });
    if (refinedFinite(value.strokeLengthVariation.minScale) && refinedFinite(value.strokeLengthVariation.maxScale) && value.strokeLengthVariation.minScale > value.strokeLengthVariation.maxScale) errors.push({ code: 'REFINEMENT_ORDER', path: `${path}.strokeLengthVariation` });
    if (!refinedRange(value.strokeLengthVariation.shortMix, 0, 1)) errors.push({ code: 'REFINEMENT_RANGE', path: `${path}.strokeLengthVariation.shortMix` });
  }
  refinedValidateTriple(value.strokeDensityFalloff, FALLOFF_FIELDS, `${path}.strokeDensityFalloff`, errors);
  refinedValidateTriple(value.opacityFalloff, FALLOFF_FIELDS, `${path}.opacityFalloff`, errors);
  refinedValidateTriple(value.curvatureFollowing, CURVATURE_FIELDS, `${path}.curvatureFollowing`, errors);
  refinedValidateTriple(value.localEdgeHardness, EDGE_HARDNESS_FIELDS, `${path}.localEdgeHardness`, errors);
  refinedValidateTriple(value.localGlazeAccumulation, GLAZE_FIELDS, `${path}.localGlazeAccumulation`, errors, 0, 2);
  if (!refinedObject(value.overlapShadowFalloff)) errors.push({ code: 'OVERLAP_SHADOW_FALLOFF', path: `${path}.overlapShadowFalloff` });
  else {
    refinedUnsupported(value.overlapShadowFalloff, OVERLAP_FALLOFF_FIELDS, `${path}.overlapShadowFalloff`, errors);
    if (!refinedRange(value.overlapShadowFalloff.width, .002, .2)) errors.push({ code: 'REFINEMENT_RANGE', path: `${path}.overlapShadowFalloff.width` });
    if (!refinedRange(value.overlapShadowFalloff.softness, 0, 1)) errors.push({ code: 'REFINEMENT_RANGE', path: `${path}.overlapShadowFalloff.softness` });
    if (!refinedRange(value.overlapShadowFalloff.intensity, 0, 2)) errors.push({ code: 'REFINEMENT_RANGE', path: `${path}.overlapShadowFalloff.intensity` });
  }
  for (const key of ['regionInteriorSmoothing', 'silhouetteProtection', 'textureSuppression', 'deterministicVariation']) {
    if (!refinedRange(value[key], 0, 1)) errors.push({ code: 'REFINEMENT_RANGE', path: `${path}.${key}` });
  }
  if (!legacy) validateRecoveryFields(value, path, errors);
  if (!legacy && !surfaceRecovery) validatePainterlyMassFields(value, path, errors);
  return errors.length ? { ok: false, errors } : { ok: true, refinement: canonicalRefinedPaintingParameters(value) };
}

export function canonicalRefinedPaintingParameters(value) {
  const canonical = {
    schemaVersion: value.schemaVersion,
    colorFieldInterpolation: { ...value.colorFieldInterpolation },
    strokeLengthVariation: { ...value.strokeLengthVariation },
    strokeDensityFalloff: { ...value.strokeDensityFalloff },
    opacityFalloff: { ...value.opacityFalloff },
    curvatureFollowing: { ...value.curvatureFollowing },
    localEdgeHardness: { ...value.localEdgeHardness },
    localGlazeAccumulation: { ...value.localGlazeAccumulation },
    overlapShadowFalloff: { ...value.overlapShadowFalloff },
    regionInteriorSmoothing: refinedClamp(value.regionInteriorSmoothing, 0, 1),
    silhouetteProtection: refinedClamp(value.silhouetteProtection, 0, 1),
    textureSuppression: refinedClamp(value.textureSuppression, 0, 1),
    deterministicVariation: refinedClamp(value.deterministicVariation, 0, 1)
  };
  if (value.schemaVersion === LEGACY_REFINED_PAINTING_PARAMETERS_VERSION) return canonical;
  const recovery = {
    ...canonical,
    multiBandColorField: { ...value.multiBandColorField },
    localWarmCoolShift: { ...value.localWarmCoolShift },
    glazeAccumulationMap: { ...value.glazeAccumulationMap },
    edgeTranslucency: { ...value.edgeTranslucency },
    strokeClustering: { ...value.strokeClustering },
    strokeDropout: refinedClamp(value.strokeDropout, 0, .9),
    nonuniformTextureSuppression: { ...value.nonuniformTextureSuppression },
    centerOcclusionMap: { ...value.centerOcclusionMap },
    leafCrossSectionField: { ...value.leafCrossSectionField },
    backgroundLowFrequencyField: { ...value.backgroundLowFrequencyField }
  };
  if (value.schemaVersion === SURFACE_RECOVERY_PARAMETERS_VERSION) return recovery;
  return {
    ...recovery,
    frequencyLayers: { ...value.frequencyLayers },
    pigmentMass: { ...value.pigmentMass }
  };
}
