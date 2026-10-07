import {
  MAX_RECIPE_PALETTE, MAX_RECIPE_PASSES, PAINTING_RECIPE_BLEND_MODES, PAINTING_RECIPE_DIRECTIONS,
  PAINTING_RECIPE_OPERATIONS, PAINTING_RECIPE_SUPPORTED_VERSIONS, RECIPE_CONSTRAINT_FIELDS, RETENTION_CONSTRAINT_FIELDS,
  RECIPE_FIELDS, RECIPE_ID_RE, canonicalPaintingRecipe
} from './painting-recipe-schema.js';
import { validateRefinedPaintingParameters } from './refined-painting-parameters.js';
import { OBJECT_ID_RE } from '../action/flora-action-schema.js';

const recipeObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const recipeFinite = value => typeof value === 'number' && Number.isFinite(value);
const HEX = /^#[0-9a-fA-F]{6}$/;

function unsupported(object, allowed, prefix, errors) {
  for (const key of Object.keys(object || {})) if (!allowed.has(key)) errors.push({ code: 'UNSUPPORTED_FIELD', path: `${prefix}.${key}` });
}
function range(value, min, max) { return recipeFinite(value) && value >= min && value <= max; }
function pair(value, min, max) { return Array.isArray(value) && value.length === 2 && value.every(item => range(item, min, max)) && value[0] <= value[1]; }
function codeLike(value) {
  if (typeof value === 'string') return /<script|javascript:|document\.|window\.|eval\s*\(|Function\s*\(/i.test(value);
  if (Array.isArray(value)) return value.some(codeLike);
  if (recipeObject(value)) return Object.values(value).some(codeLike);
  return false;
}

export function validatePaintingRecipe(recipe, adapter) {
  const errors = [];
  if (!recipeObject(recipe)) return { ok: false, errors: [{ code: 'INVALID_RECIPE', path: '$' }] };
  unsupported(recipe, RECIPE_FIELDS, '$', errors);
  if (!PAINTING_RECIPE_SUPPORTED_VERSIONS.includes(recipe.schemaVersion)) errors.push({ code: 'SCHEMA_VERSION', path: '$.schemaVersion' });
  if (!RECIPE_ID_RE.test(recipe.recipeId || '')) errors.push({ code: 'RECIPE_ID', path: '$.recipeId' });
  if (!OBJECT_ID_RE.test(recipe.targetRegionId || '') || !adapter?.regionExists(recipe.targetRegionId)) errors.push({ code: 'REGION_NOT_FOUND', path: '$.targetRegionId' });
  if (!PAINTING_RECIPE_OPERATIONS.includes(recipe.operation)) errors.push({ code: 'OPERATION', path: '$.operation' });
  if (typeof recipe.brushPreset !== 'string' || !adapter?.brushPresetExists(recipe.brushPreset)) errors.push({ code: 'BRUSH_PRESET_NOT_FOUND', path: '$.brushPreset' });
  if (!PAINTING_RECIPE_DIRECTIONS.includes(recipe.direction)) errors.push({ code: 'DIRECTION', path: '$.direction' });
  if (!Array.isArray(recipe.palette) || recipe.palette.length < 1 || recipe.palette.length > MAX_RECIPE_PALETTE || recipe.palette.some(color => !HEX.test(color))) errors.push({ code: 'PALETTE', path: '$.palette' });
  if (!range(recipe.coverage, 0, 1)) errors.push({ code: 'COVERAGE', path: '$.coverage' });
  if (!(range(recipe.opacity, 0, 1) || pair(recipe.opacity, 0, 1))) errors.push({ code: 'OPACITY', path: '$.opacity' });
  if (!range(recipe.density, 1, 256)) errors.push({ code: 'DENSITY', path: '$.density' });
  if (!range(recipe.spacing, .001, .25)) errors.push({ code: 'SPACING', path: '$.spacing' });
  if (!pair(recipe.widthRange, .5, 120)) errors.push({ code: 'WIDTH_RANGE', path: '$.widthRange' });
  if (!range(recipe.jitter, 0, 1)) errors.push({ code: 'JITTER', path: '$.jitter' });
  if (!range(recipe.feather, 0, .1)) errors.push({ code: 'FEATHER', path: '$.feather' });
  if (!Number.isInteger(recipe.passes) || recipe.passes < 1 || recipe.passes > MAX_RECIPE_PASSES) errors.push({ code: 'PASSES', path: '$.passes' });
  if (!PAINTING_RECIPE_BLEND_MODES.includes(recipe.blendMode)) errors.push({ code: 'BLEND_MODE', path: '$.blendMode' });
  if (!Number.isSafeInteger(recipe.seed) || recipe.seed < 0 || recipe.seed > 0xffffffff) errors.push({ code: 'SEED', path: '$.seed' });
  if (!recipeObject(recipe.constraints)) errors.push({ code: 'CONSTRAINTS', path: '$.constraints' });
  else {
    unsupported(recipe.constraints, RECIPE_CONSTRAINT_FIELDS, '$.constraints', errors);
    const constraints = recipe.constraints;
    if (constraints.frontRegionId !== undefined) {
      if (!OBJECT_ID_RE.test(constraints.frontRegionId || '') || !adapter?.regionExists(constraints.frontRegionId)) errors.push({ code: 'FRONT_REGION_NOT_FOUND', path: '$.constraints.frontRegionId' });
      if (constraints.frontRegionId === recipe.targetRegionId) errors.push({ code: 'CROSS_REGION_ILLEGAL', path: '$.constraints.frontRegionId' });
    }
    if (constraints.foldSide !== undefined && !['left', 'right', 'center'].includes(constraints.foldSide)) errors.push({ code: 'FOLD_SIDE', path: '$.constraints.foldSide' });
    if (constraints.bandWidth !== undefined && !range(constraints.bandWidth, .002, .2)) errors.push({ code: 'BAND_WIDTH', path: '$.constraints.bandWidth' });
    if (constraints.edgeAvoidance !== undefined && !range(constraints.edgeAvoidance, 0, .25)) errors.push({ code: 'EDGE_AVOIDANCE', path: '$.constraints.edgeAvoidance' });
    if (constraints.preserveManual !== undefined && typeof constraints.preserveManual !== 'boolean') errors.push({ code: 'PRESERVE_MANUAL', path: '$.constraints.preserveManual' });
    if (constraints.subjectSeparation !== undefined && typeof constraints.subjectSeparation !== 'boolean') errors.push({ code: 'SUBJECT_SEPARATION', path: '$.constraints.subjectSeparation' });
    if (constraints.axisContinuous !== undefined && typeof constraints.axisContinuous !== 'boolean') errors.push({ code: 'AXIS_CONTINUOUS', path: '$.constraints.axisContinuous' });
    if (constraints.allowRegionIds !== undefined && (!Array.isArray(constraints.allowRegionIds) || constraints.allowRegionIds.some(id => !OBJECT_ID_RE.test(id || '') || !adapter?.regionExists(id)))) errors.push({ code: 'ALLOW_REGION_IDS', path: '$.constraints.allowRegionIds' });
    if (constraints.coverageRetention !== undefined) {
      const retention = constraints.coverageRetention;
      if (!recipeObject(retention)) errors.push({ code: 'COVERAGE_RETENTION', path: '$.constraints.coverageRetention' });
      else {
        unsupported(retention, RETENTION_CONSTRAINT_FIELDS, '$.constraints.coverageRetention', errors);
        if (!['non-periodic-full-body', 'cross-section-fill', 'center-mass-fill', 'axis-body-fill'].includes(retention.mode)) errors.push({ code: 'RETENTION_MODE', path: '$.constraints.coverageRetention.mode' });
        for (const key of ['bodyCoverage', 'rootCoverage', 'alphaFloor', 'localFeatherScale', 'boundaryDissolveLimit']) {
          if (!range(retention[key], 0, 1)) errors.push({ code: 'RETENTION_RANGE', path: `$.constraints.coverageRetention.${key}` });
        }
        if (!Number.isInteger(retention.fillSections) || retention.fillSections < 4 || retention.fillSections > 64) errors.push({ code: 'RETENTION_SECTIONS', path: '$.constraints.coverageRetention.fillSections' });
        if (typeof retention.preserveLobes !== 'boolean') errors.push({ code: 'RETENTION_PRESERVE_LOBES', path: '$.constraints.coverageRetention.preserveLobes' });
        if (!range(retention.featureScale, .5, 2)) errors.push({ code: 'RETENTION_FEATURE_SCALE', path: '$.constraints.coverageRetention.featureScale' });
        if (!range(retention.visualWeight, .2, 2)) errors.push({ code: 'RETENTION_VISUAL_WEIGHT', path: '$.constraints.coverageRetention.visualWeight' });
        if (!range(retention.densityFieldScale, .1, 2)) errors.push({ code: 'RETENTION_DENSITY_FIELD_SCALE', path: '$.constraints.coverageRetention.densityFieldScale' });
        if (!range(retention.directionalDeposit, 0, .5)) errors.push({ code: 'RETENTION_DIRECTIONAL_DEPOSIT', path: '$.constraints.coverageRetention.directionalDeposit' });
      }
    }
  }
  if (recipe.refinement !== undefined) {
    const refined = validateRefinedPaintingParameters(recipe.refinement);
    if (!refined.ok) errors.push(...refined.errors);
    else recipe = { ...recipe, refinement: refined.refinement };
  }
  if (!recipeObject(recipe.metadata) || recipe.metadata.source !== 'ai' || typeof recipe.metadata.label !== 'string' || !recipe.metadata.label.trim() || recipe.metadata.label.length > 160) errors.push({ code: 'METADATA', path: '$.metadata' });
  if (codeLike(recipe)) errors.push({ code: 'CODE_OR_DOM_FORBIDDEN', path: '$' });

  if (!errors.length && recipe.constraints.frontRegionId !== undefined && recipe.operation !== 'Overlap Shadow') {
    errors.push({ code: 'CROSS_REGION_ILLEGAL', path: '$.constraints.frontRegionId' });
  }
  if (!errors.length && recipe.operation === 'Overlap Shadow') {
    const region = adapter.region(recipe.targetRegionId);
    const frontId = recipe.constraints.frontRegionId;
    const topology = adapter.hero()?.topology?.find(item => item.regionId === frontId);
    const overlap = region?.overlaps?.find(item => item.frontRegionId === frontId);
    if (!frontId || !topology?.frontOf?.includes(recipe.targetRegionId) || !overlap) errors.push({ code: 'TOPOLOGY_MISMATCH', path: '$.constraints.frontRegionId' });
  }

  return errors.length ? { ok: false, errors } : { ok: true, recipe: canonicalPaintingRecipe(recipe) };
}
