import { REGION_BLEND_MODES, REGION_DIRECTIONS, REGION_PAINT_OPERATIONS } from '../painting/region-paint-operations.js';

export const PAINTING_RECIPE_SCHEMA_VERSION = '0.2';
export const PAINTING_RECIPE_SUPPORTED_VERSIONS = Object.freeze(['0.1', '0.2']);
export const PAINTING_RECIPE_OPERATIONS = Object.freeze([
  'Base Wash', 'Root Shadow', 'Fold Shadow', 'Central Light', 'Edge Light',
  'Overlap Shadow', 'Transparent Glaze', 'Directional Brushwork', 'Boundary Dissolve'
]);
export const PAINTING_RECIPE_DIRECTIONS = REGION_DIRECTIONS;
export const PAINTING_RECIPE_BLEND_MODES = REGION_BLEND_MODES;
export const MAX_RECIPE_PASSES = 12;
export const MAX_RECIPE_PALETTE = 8;
export const RECIPE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$/;
export const RECIPE_FIELDS = new Set([
  'recipeId', 'schemaVersion', 'targetRegionId', 'operation', 'brushPreset', 'direction', 'palette',
  'coverage', 'opacity', 'density', 'spacing', 'widthRange', 'jitter', 'feather', 'passes',
  'blendMode', 'seed', 'constraints', 'refinement', 'metadata'
]);
export const RETENTION_CONSTRAINT_FIELDS = new Set([
  'mode', 'bodyCoverage', 'rootCoverage', 'alphaFloor', 'localFeatherScale',
  'fillSections', 'boundaryDissolveLimit', 'preserveLobes', 'featureScale', 'visualWeight', 'densityFieldScale', 'directionalDeposit'
]);
export const RECIPE_CONSTRAINT_FIELDS = new Set([
  'frontRegionId', 'foldSide', 'bandWidth', 'edgeAvoidance', 'preserveManual', 'allowRegionIds', 'subjectSeparation', 'axisContinuous', 'coverageRetention'
]);

export function canonicalPaintingRecipe(recipe) {
  return {
    recipeId: recipe.recipeId,
    schemaVersion: recipe.schemaVersion,
    targetRegionId: recipe.targetRegionId,
    operation: recipe.operation,
    brushPreset: recipe.brushPreset,
    direction: recipe.direction,
    palette: [...recipe.palette],
    coverage: recipe.coverage,
    opacity: Array.isArray(recipe.opacity) ? [...recipe.opacity] : recipe.opacity,
    density: recipe.density,
    spacing: recipe.spacing,
    widthRange: [...recipe.widthRange],
    jitter: recipe.jitter,
    feather: recipe.feather,
    passes: recipe.passes,
    blendMode: recipe.blendMode,
    seed: recipe.seed,
    constraints: structuredClone(recipe.constraints || {}),
    ...(recipe.refinement ? { refinement: structuredClone(recipe.refinement) } : {}),
    metadata: structuredClone(recipe.metadata)
  };
}
