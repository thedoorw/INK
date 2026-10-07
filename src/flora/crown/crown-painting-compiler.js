import { buildCompleteCrownBenchmarkStructure } from '../painting/complete-crown-benchmark.js';
import { compilePaintingRecipe } from '../recipe/painting-recipe-compiler.js';
import { validateCrownPaintingPlan } from './crown-painting-plan-validator.js';
import { generateCenterRecipes, generatePetalRecipes } from './petal-recipe-generation.js';
import { runCrownVisualChecks } from './crown-visual-checks.js';

const crownCompilerStable = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.keys(item).sort().reduce((out, name) => (out[name] = item[name], out), {}) : item);
const crownCompilerHash = text => {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) { value ^= text.charCodeAt(index); value = Math.imul(value, 0x01000193); }
  return (value >>> 0).toString(16).padStart(8, '0');
};

export function crownStructureAdapter(adapter, structure) {
  return {
    page: () => adapter.page(),
    hero: () => structure,
    region: id => structure.regions.find(region => region.regionId === id) || null,
    regionExists: id => structure.regions.some(region => region.regionId === id),
    mask: id => structure.masks.find(mask => mask.regionId === id || mask.maskId === id) || null,
    maskExists: id => structure.masks.some(mask => mask.regionId === id || mask.maskId === id),
    brushPreset: id => adapter.brushPreset(id), brushPresetExists: id => adapter.brushPresetExists(id),
    layer: id => adapter.layer(id), layerExists: id => adapter.layerExists(id)
  };
}

export function compileCrownPaintingPlan(planInput, adapter, { layerId = null, overrides = {} } = {}) {
  const checked = validateCrownPaintingPlan(planInput, adapter);
  if (!checked.ok) return { ok: false, errors: checked.errors, recipes: [], actions: [] };
  const plan = checked.plan;
  const structure = buildCompleteCrownBenchmarkStructure({
    crownId: plan.crownId, petalCount: plan.petalCount, feather: .012, seed: plan.seed,
    focalPetalIndex: plan.focalRegion.petalIndex, petalGeometryFamily: plan.petalGeometryFamily || plan.metadata?.petalGeometryFamily || 'broad-organic',
    petalRhythm: plan.petalRhythm || 'single-layer', bowlBias: plan.bowlBias || 0, centerMode: plan.centerMode || 'abstract-irregular',
    centerRadius: plan.metadata?.centerRadius || .067
  });
  structure.backgroundExclusionMask.enabled = plan.backgroundExclusionMask.enabled;
  structure.backgroundExclusionMask.mode = plan.backgroundExclusionMask.mode;
  const recipes = [
    ...generatePetalRecipes(plan, structure, { overrides }),
    ...generateCenterRecipes(plan, structure, { overrides })
  ];
  const proxy = crownStructureAdapter(adapter, structure), compiledRecipes = [], errors = [];
  for (const recipe of recipes) {
    const compiled = compilePaintingRecipe(recipe, proxy, { layerId });
    if (!compiled.ok) errors.push(...compiled.errors.map(error => ({ ...error, recipeId: recipe.recipeId })));
    else compiledRecipes.push(compiled);
  }
  if (errors.length) return { ok: false, errors, plan, structure, recipes, actions: [] };
  const actions = compiledRecipes.flatMap(item => item.actions);
  const recipeHashes = new Set(compiledRecipes.map(item => item.compileHash));
  const checks = runCrownVisualChecks({ structure, plan, recipes });
  return {
    ok: true, plan, structure, recipes, compiledRecipes, actions, checks,
    planHash: crownCompilerHash(crownCompilerStable(plan)), structureHash: crownCompilerHash(crownCompilerStable(structure)),
    compileHash: crownCompilerHash(crownCompilerStable({ plan, structure, recipes, actions })),
    preview: {
      petalCount: structure.regions.filter(region => region.kind === 'petal-region').length,
      centerCount: structure.regions.filter(region => region.kind === 'flower-center-region').length,
      recipeCount: recipes.length, actionCount: actions.length, uniqueRecipeHashes: recipeHashes.size,
      operationCounts: Object.fromEntries([...new Set(recipes.map(recipe => recipe.operation))].map(operation => [operation, recipes.filter(recipe => recipe.operation === operation).length]))
    }
  };
}

export function crownPlanCompilerRoundtrip(value) { return JSON.parse(JSON.stringify(value)); }
