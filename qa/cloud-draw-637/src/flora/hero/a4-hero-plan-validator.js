import { validateCrownPaintingPlan } from '../crown/crown-painting-plan-validator.js';
import {
  A4_BACKGROUND_PLAN_FIELDS, A4_BRUSH_FIELDS, A4_COMPONENT_PLAN_FIELDS, A4_COMPOSITION_FIELDS,
  A4_HERO_ID_RE, A4_HERO_PLAN_FIELDS, A4_HERO_PLAN_SCHEMA_VERSION, canonicalA4HeroPaintingPlan
} from './a4-hero-plan-schema.js';

const a4IsObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const a4Finite = value => typeof value === 'number' && Number.isFinite(value);
const a4Range = (value, min, max) => a4Finite(value) && value >= min && value <= max;
const A4_HEX = /^#[0-9a-fA-F]{6}$/;
function a4Unsupported(object, fields, prefix, errors) { for (const key of Object.keys(object || {})) if (!fields.has(key)) errors.push({ code: 'UNSUPPORTED_FIELD', path: `${prefix}.${key}` }); }
function a4Palette(value, min = 2, max = 8) { return Array.isArray(value) && value.length >= min && value.length <= max && value.every(item => A4_HEX.test(item)); }
function a4CodeLike(value) {
  if (typeof value === 'string') return /<script|javascript:|document\.|window\.|eval\s*\(|Function\s*\(/i.test(value);
  if (Array.isArray(value)) return value.some(a4CodeLike);
  if (a4IsObject(value)) return Object.values(value).some(a4CodeLike);
  return false;
}
function a4ValidateMetadata(value, path, errors) {
  if (!a4IsObject(value) || value.source !== 'ai' || typeof value.label !== 'string' || !value.label.trim() || value.label.length > 160) errors.push({ code: 'METADATA', path });
}
function a4ValidateBrushes(value, adapter, path, errors) {
  if (!a4IsObject(value)) { errors.push({ code: 'BRUSH_PRESETS', path }); return; }
  a4Unsupported(value, A4_BRUSH_FIELDS, path, errors);
  for (const key of A4_BRUSH_FIELDS) if (typeof value[key] !== 'string' || !adapter?.brushPresetExists(value[key])) errors.push({ code: 'BRUSH_PRESET_NOT_FOUND', path: `${path}.${key}` });
}
function a4ValidateComponent(value, adapter, path, expectedRegionId, errors) {
  if (!a4IsObject(value)) { errors.push({ code: 'COMPONENT_PLAN', path }); return; }
  a4Unsupported(value, A4_COMPONENT_PLAN_FIELDS, path, errors);
  if (value.regionId !== expectedRegionId) errors.push({ code: 'REGION_ID', path: `${path}.regionId` });
  if (!a4Palette(value.palette, 2, 6)) errors.push({ code: 'PALETTE', path: `${path}.palette` });
  a4ValidateBrushes(value.brushPresets, adapter, `${path}.brushPresets`, errors);
  if (!a4Range(value.opacityScale, .25, 1.5)) errors.push({ code: 'OPACITY_SCALE', path: `${path}.opacityScale` });
  if (!a4Range(value.edgeSoftness, 0, .1)) errors.push({ code: 'EDGE_SOFTNESS', path: `${path}.edgeSoftness` });
  if (!Number.isSafeInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff) errors.push({ code: 'SEED', path: `${path}.seed` });
  if (value.leafEdgeMode !== undefined && !['smooth-band', 'filigree-wave', 'filigree-pinnate-impression'].includes(value.leafEdgeMode)) errors.push({ code: 'LEAF_EDGE_MODE', path: `${path}.leafEdgeMode` });
  a4ValidateMetadata(value.metadata, `${path}.metadata`, errors);
}

export function validateA4HeroPaintingPlan(plan, adapter = null) {
  const errors = [];
  if (!a4IsObject(plan)) return { ok: false, errors: [{ code: 'INVALID_PLAN', path: '$' }] };
  a4Unsupported(plan, A4_HERO_PLAN_FIELDS, '$', errors);
  if (plan.schemaVersion !== A4_HERO_PLAN_SCHEMA_VERSION) errors.push({ code: 'SCHEMA_VERSION', path: '$.schemaVersion' });
  if (!A4_HERO_ID_RE.test(plan.planId || '')) errors.push({ code: 'PLAN_ID', path: '$.planId' });
  if (!A4_HERO_ID_RE.test(plan.heroId || '')) errors.push({ code: 'HERO_ID', path: '$.heroId' });
  const composition = plan.composition;
  if (!a4IsObject(composition)) errors.push({ code: 'COMPOSITION', path: '$.composition' });
  else {
    a4Unsupported(composition, A4_COMPOSITION_FIELDS, '$.composition', errors);
    if (composition.page !== 'A4 portrait' || composition.normalized !== true) errors.push({ code: 'A4_PORTRAIT_REQUIRED', path: '$.composition.page' });
    if (composition.crownMode !== 'Single') errors.push({ code: 'CROWN_MODE', path: '$.composition.crownMode' });
    if (!['Two', 'Four'].includes(composition.leafCount)) errors.push({ code: 'LEAF_COUNT', path: '$.composition.leafCount' });
    if (!a4Range(composition.crownTop, .01, .04)) errors.push({ code: 'CROWN_TOP', path: '$.composition.crownTop' });
    if (!a4Range(composition.crownHeight, .48, .52)) errors.push({ code: 'CROWN_HEIGHT', path: '$.composition.crownHeight' });
    if (!a4Range(composition.stemAxisX, .495, .505)) errors.push({ code: 'STEM_AXIS', path: '$.composition.stemAxisX' });
    if (!a4Range(composition.stemWidthRatio, 1 / 14, 1 / 10)) errors.push({ code: 'STEM_WIDTH_RATIO', path: '$.composition.stemWidthRatio' });
    if (!['Narrow', 'Medium'].includes(composition.leafWidth)) errors.push({ code: 'LEAF_WIDTH', path: '$.composition.leafWidth' });
    if (composition.leafTip !== 'Pointed') errors.push({ code: 'LEAF_TIP', path: '$.composition.leafTip' });
    if (!['Gentle Wave', 'Strong Wave'].includes(composition.leafCurve)) errors.push({ code: 'LEAF_CURVE', path: '$.composition.leafCurve' });
    if (composition.singleFocalPoint !== true) errors.push({ code: 'SINGLE_FOCAL_POINT', path: '$.composition.singleFocalPoint' });
  }
  const crown = validateCrownPaintingPlan(plan.crownPlan, adapter);
  if (!crown.ok) errors.push(...crown.errors.map(error => ({ ...error, path: `$.crownPlan${error.path === '$' ? '' : error.path.slice(1)}` })));
  else {
    if (crown.plan.crownId !== `${plan.heroId}:crown`) errors.push({ code: 'CROWN_ID_MISMATCH', path: '$.crownPlan.crownId' });
    if (crown.plan.seed !== plan.seed) errors.push({ code: 'CROWN_SEED_MISMATCH', path: '$.crownPlan.seed' });
  }
  a4ValidateComponent(plan.stemPlan, adapter, '$.stemPlan', `${plan.heroId}:stem`, errors);
  const expectedLeafCount = composition?.leafCount === 'Four' ? 4 : 2;
  if (!Array.isArray(plan.leafPlans) || plan.leafPlans.length !== expectedLeafCount) errors.push({ code: 'LEAF_PLANS', path: '$.leafPlans' });
  else {
    const slots = new Set();
    for (let index = 0; index < plan.leafPlans.length; index += 1) {
      const item = plan.leafPlans[index], side = item?.metadata?.side, slot = item?.metadata?.slot || side;
      if (!['left', 'right'].includes(side)) errors.push({ code: 'LEAF_SIDE', path: `$.leafPlans[${index}].metadata.side` });
      if (typeof slot !== 'string' || !slot) errors.push({ code: 'LEAF_SLOT', path: `$.leafPlans[${index}].metadata.slot` }); else slots.add(slot);
      a4ValidateComponent(item, adapter, `$.leafPlans[${index}]`, `${plan.heroId}:leaf:${slot}`, errors);
    }
    if (slots.size !== expectedLeafCount) errors.push({ code: 'LEAF_SLOTS_UNIQUE', path: '$.leafPlans' });
  }
  const background = plan.backgroundPlan;
  if (!a4IsObject(background)) errors.push({ code: 'BACKGROUND_PLAN', path: '$.backgroundPlan' });
  else {
    a4Unsupported(background, A4_BACKGROUND_PLAN_FIELDS, '$.backgroundPlan', errors);
    if (background.regionId !== `${plan.heroId}:background`) errors.push({ code: 'REGION_ID', path: '$.backgroundPlan.regionId' });
    if (!a4Palette(background.palette, 2, 5)) errors.push({ code: 'PALETTE', path: '$.backgroundPlan.palette' });
    a4ValidateBrushes(background.brushPresets, adapter, '$.backgroundPlan.brushPresets', errors);
    if (!a4Range(background.contrast, 0, .35)) errors.push({ code: 'BACKGROUND_CONTRAST', path: '$.backgroundPlan.contrast' });
    if (!a4Range(background.textureStrength, 0, .35)) errors.push({ code: 'TEXTURE_STRENGTH', path: '$.backgroundPlan.textureStrength' });
    if (!a4Range(background.edgeSoftness, 0, .1)) errors.push({ code: 'EDGE_SOFTNESS', path: '$.backgroundPlan.edgeSoftness' });
    if (!Number.isSafeInteger(background.seed) || background.seed < 0 || background.seed > 0xffffffff) errors.push({ code: 'SEED', path: '$.backgroundPlan.seed' });
    a4ValidateMetadata(background.metadata, '$.backgroundPlan.metadata', errors);
  }
  if (!a4Palette(plan.globalPalette, 4, 8)) errors.push({ code: 'GLOBAL_PALETTE', path: '$.globalPalette' });
  if (!a4IsObject(plan.globalLightDirection) || !a4Range(plan.globalLightDirection.x, -1, 1) || !a4Range(plan.globalLightDirection.y, -1, 1) || Math.hypot(plan.globalLightDirection?.x || 0, plan.globalLightDirection?.y || 0) < .1) errors.push({ code: 'GLOBAL_LIGHT_DIRECTION', path: '$.globalLightDirection' });
  if (!a4IsObject(plan.focalHierarchy) || plan.focalHierarchy.primary !== 'crown' || !Array.isArray(plan.focalHierarchy.secondary) || plan.focalHierarchy.secondary.some(item => !['stem', 'leaves', 'background'].includes(item))) errors.push({ code: 'FOCAL_HIERARCHY', path: '$.focalHierarchy' });
  if (!a4IsObject(plan.edgeHierarchy) || !['crisp', 'mixed'].includes(plan.edgeHierarchy.crown) || !['mixed', 'soft'].includes(plan.edgeHierarchy.stem) || !['mixed', 'soft'].includes(plan.edgeHierarchy.leaves) || plan.edgeHierarchy.background !== 'soft') errors.push({ code: 'EDGE_HIERARCHY', path: '$.edgeHierarchy' });
  if (!a4IsObject(plan.depthStrategy) || plan.depthStrategy.mode !== 'topology-z' || plan.depthStrategy.background !== 'behind-subject' || plan.depthStrategy.stem !== 'front-of-leaves-behind-crown') errors.push({ code: 'DEPTH_STRATEGY', path: '$.depthStrategy' });
  if (!a4IsObject(plan.colorContinuity) || plan.colorContinuity.sharedWarmCool !== true || !a4Range(plan.colorContinuity.subjectBackgroundRelation, 0, 1)) errors.push({ code: 'COLOR_CONTINUITY', path: '$.colorContinuity' });
  if (!a4Range(plan.backgroundContrast, 0, .35)) errors.push({ code: 'BACKGROUND_CONTRAST', path: '$.backgroundContrast' });
  if (!a4IsObject(plan.smallViewRequirements) || plan.smallViewRequirements.crown !== true || plan.smallViewRequirements.stem !== true || (composition?.leafCount === 'Four' ? plan.smallViewRequirements.fourLeaves !== true : plan.smallViewRequirements.twoLeaves !== true)) errors.push({ code: 'SMALL_VIEW_REQUIREMENTS', path: '$.smallViewRequirements' });
  if (!Number.isSafeInteger(plan.seed) || plan.seed < 0 || plan.seed > 0xffffffff) errors.push({ code: 'SEED', path: '$.seed' });
  a4ValidateMetadata(plan.metadata, '$.metadata', errors);
  if (a4CodeLike(plan)) errors.push({ code: 'CODE_OR_DOM_FORBIDDEN', path: '$' });
  return errors.length ? { ok: false, errors } : { ok: true, plan: canonicalA4HeroPaintingPlan(plan) };
}

export function a4HeroPlanRoundtrip(plan) { return JSON.parse(JSON.stringify(plan)); }
