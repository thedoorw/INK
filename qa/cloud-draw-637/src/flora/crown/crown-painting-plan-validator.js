import {
  CROWN_BRUSH_FIELDS, CROWN_PLAN_FIELDS, CROWN_PLAN_ID_RE, CROWN_PLAN_SCHEMA_VERSION,
  EDGE_LEVELS, canonicalCrownPaintingPlan
} from './crown-painting-plan-schema.js';

const crownIsObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const crownFinite = value => typeof value === 'number' && Number.isFinite(value);
const crownRange = (value, min, max) => crownFinite(value) && value >= min && value <= max;
const crownPair = (value, min, max) => Array.isArray(value) && value.length === 2 && value.every(item => crownRange(item, min, max)) && value[0] <= value[1];
const CROWN_HEX = /^#[0-9a-fA-F]{6}$/;
function crownUnsupported(value, fields, prefix, errors) {
  for (const key of Object.keys(value || {})) if (!fields.has(key)) errors.push({ code: 'UNSUPPORTED_FIELD', path: `${prefix}.${key}` });
}
function crownCodeLike(value) {
  if (typeof value === 'string') return /<script|javascript:|document\.|window\.|eval\s*\(|Function\s*\(/i.test(value);
  if (Array.isArray(value)) return value.some(crownCodeLike);
  if (crownIsObject(value)) return Object.values(value).some(crownCodeLike);
  return false;
}
function crownPalette(value, min, max) { return Array.isArray(value) && value.length >= min && value.length <= max && value.every(color => CROWN_HEX.test(color)); }

export function validateCrownPaintingPlan(plan, adapter = null) {
  const errors = [];
  if (!crownIsObject(plan)) return { ok: false, errors: [{ code: 'INVALID_PLAN', path: '$' }] };
  crownUnsupported(plan, CROWN_PLAN_FIELDS, '$', errors);
  if (plan.schemaVersion !== CROWN_PLAN_SCHEMA_VERSION) errors.push({ code: 'SCHEMA_VERSION', path: '$.schemaVersion' });
  if (!CROWN_PLAN_ID_RE.test(plan.planId || '')) errors.push({ code: 'PLAN_ID', path: '$.planId' });
  if (!CROWN_PLAN_ID_RE.test(plan.crownId || '')) errors.push({ code: 'CROWN_ID', path: '$.crownId' });
  if (!Number.isInteger(plan.petalCount) || plan.petalCount < 8 || plan.petalCount > 16) errors.push({ code: 'PETAL_COUNT', path: '$.petalCount' });
  if (!crownPalette(plan.crownBasePalette, 2, 6)) errors.push({ code: 'CROWN_BASE_PALETTE', path: '$.crownBasePalette' });
  if (!crownIsObject(plan.petalPaletteVariation) || !crownPair(plan.petalPaletteVariation.lightnessRange, -.35, .35) || !crownPair(plan.petalPaletteVariation.saturationRange, -.35, .35)) errors.push({ code: 'PETAL_PALETTE_VARIATION', path: '$.petalPaletteVariation' });
  if (!crownPalette(plan.centerPalette, 2, 6)) errors.push({ code: 'CENTER_PALETTE', path: '$.centerPalette' });
  if (!crownIsObject(plan.globalLightDirection) || !crownRange(plan.globalLightDirection.x, -1, 1) || !crownRange(plan.globalLightDirection.y, -1, 1) || Math.hypot(plan.globalLightDirection?.x || 0, plan.globalLightDirection?.y || 0) < .1) errors.push({ code: 'GLOBAL_LIGHT_DIRECTION', path: '$.globalLightDirection' });
  if (plan.depthOrder !== 'topology-z') errors.push({ code: 'DEPTH_ORDER', path: '$.depthOrder' });
  if (!crownIsObject(plan.focalRegion) || !Number.isInteger(plan.focalRegion.petalIndex) || plan.focalRegion.petalIndex < 0 || plan.focalRegion.petalIndex >= (plan.petalCount || 0)) errors.push({ code: 'FOCAL_REGION', path: '$.focalRegion' });
  if (!crownIsObject(plan.edgeHierarchy) || !EDGE_LEVELS.includes(plan.edgeHierarchy.focal) || !EDGE_LEVELS.includes(plan.edgeHierarchy.front) || !EDGE_LEVELS.includes(plan.edgeHierarchy.rear)) errors.push({ code: 'EDGE_HIERARCHY', path: '$.edgeHierarchy' });
  if (!crownIsObject(plan.shadowStrategy) || !crownRange(plan.shadowStrategy.root, 0, 1) || !crownRange(plan.shadowStrategy.fold, 0, 1) || !crownRange(plan.shadowStrategy.overlap, 0, 1)) errors.push({ code: 'SHADOW_STRATEGY', path: '$.shadowStrategy' });
  if (!crownIsObject(plan.glazeStrategy) || !crownRange(plan.glazeStrategy.strength, 0, 1) || !Number.isInteger(plan.glazeStrategy.passes) || plan.glazeStrategy.passes < 1 || plan.glazeStrategy.passes > 3) errors.push({ code: 'GLAZE_STRATEGY', path: '$.glazeStrategy' });
  if (!crownIsObject(plan.backgroundExclusionMask) || plan.backgroundExclusionMask.enabled !== true || plan.backgroundExclusionMask.mode !== 'crown-envelope') errors.push({ code: 'BACKGROUND_EXCLUSION_MASK', path: '$.backgroundExclusionMask' });
  if (!crownIsObject(plan.brushPresets)) errors.push({ code: 'BRUSH_PRESETS', path: '$.brushPresets' });
  else {
    crownUnsupported(plan.brushPresets, CROWN_BRUSH_FIELDS, '$.brushPresets', errors);
    for (const key of CROWN_BRUSH_FIELDS) {
      const id = plan.brushPresets[key];
      if (typeof id !== 'string' || (adapter && !adapter.brushPresetExists(id))) errors.push({ code: 'BRUSH_PRESET_NOT_FOUND', path: `$.brushPresets.${key}` });
    }
  }
  if (!Number.isSafeInteger(plan.seed) || plan.seed < 0 || plan.seed > 0xffffffff) errors.push({ code: 'SEED', path: '$.seed' });
  if (plan.bowlBias !== undefined && !crownRange(plan.bowlBias, 0, 1)) errors.push({ code: 'BOWL_BIAS', path: '$.bowlBias' });
  if (plan.petalRhythm !== undefined && !['single-layer', 'one-to-two-layer'].includes(plan.petalRhythm)) errors.push({ code: 'PETAL_RHYTHM', path: '$.petalRhythm' });
  if (plan.petalGeometryFamily !== undefined && !['broad-organic', 'narrow-spoon'].includes(plan.petalGeometryFamily)) errors.push({ code: 'PETAL_GEOMETRY_FAMILY', path: '$.petalGeometryFamily' });
  if (plan.centerMode !== undefined && !['abstract-irregular', 'dense-irregular-gold'].includes(plan.centerMode)) errors.push({ code: 'CENTER_MODE', path: '$.centerMode' });
  if (plan.petalRhythm === 'one-to-two-layer' && plan.petalCount !== 14) errors.push({ code: 'MULTIPETAL_CUP_REQUIRES_14', path: '$.petalCount' });
  if (!crownIsObject(plan.metadata) || plan.metadata.source !== 'ai' || typeof plan.metadata.label !== 'string' || !plan.metadata.label.trim() || plan.metadata.label.length > 160) errors.push({ code: 'METADATA', path: '$.metadata' });
  if (crownCodeLike(plan)) errors.push({ code: 'CODE_OR_DOM_FORBIDDEN', path: '$' });
  return errors.length ? { ok: false, errors } : { ok: true, plan: canonicalCrownPaintingPlan(plan) };
}

export function crownPlanRoundtrip(plan) { return JSON.parse(JSON.stringify(plan)); }
