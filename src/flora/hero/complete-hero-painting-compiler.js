import { compilePaintingRecipe } from '../recipe/painting-recipe-compiler.js';
import { crownStructureAdapter } from '../crown/crown-painting-compiler.js';
import { validateA4HeroPaintingPlan } from './a4-hero-plan-validator.js';
import { buildCompleteA4HeroStructure } from './complete-hero-structure.js';
import { generateA4HeroRecipes } from './complete-hero-recipe-generation.js';
import { runA4HeroVisualChecks } from './a4-hero-visual-checks.js';

const a4CompilerStable = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.keys(item).sort().reduce((out, name) => (out[name] = item[name], out), {}) : item);
const a4CompilerHash = text => {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) { value ^= text.charCodeAt(index); value = Math.imul(value, 0x01000193); }
  return (value >>> 0).toString(16).padStart(8, '0');
};

export function compileA4HeroPaintingPlan(planInput, adapter, { layerId = null } = {}) {
  const checked = validateA4HeroPaintingPlan(planInput, adapter);
  if (!checked.ok) return { ok: false, errors: checked.errors, recipes: [], actions: [] };
  const plan = checked.plan, structure = buildCompleteA4HeroStructure(plan), recipes = generateA4HeroRecipes(plan, structure);
  const proxy = crownStructureAdapter(adapter, structure), compiledRecipes = [], errors = [];
  for (const recipe of recipes) {
    const compiled = compilePaintingRecipe(recipe, proxy, { layerId });
    if (!compiled.ok) errors.push(...compiled.errors.map(error => ({ ...error, recipeId: recipe.recipeId })));
    else compiledRecipes.push(compiled);
  }
  if (errors.length) return { ok: false, errors, plan, structure, recipes, actions: [] };
  const actions = compiledRecipes.flatMap(item => item.actions), checks = runA4HeroVisualChecks({ structure, plan, recipes });
  const componentNames = [...new Set(recipes.map(recipe => recipe.metadata?.component || 'unknown'))];
  const components = Object.fromEntries(componentNames.map(component => [component, recipes.filter(recipe => recipe.metadata?.component === component).length]));
  return {
    ok: true, plan, structure, recipes, compiledRecipes, actions, checks,
    planHash: a4CompilerHash(a4CompilerStable(plan)), structureHash: a4CompilerHash(a4CompilerStable(structure)),
    compileHash: a4CompilerHash(a4CompilerStable({ plan, structure, recipes, actions })),
    preview: {
      page: 'A4 portrait', crownMode: 'Single', leafCount: plan.composition.leafCount,
      regionCount: structure.regions.length, maskCount: structure.masks.length,
      recipeCount: recipes.length, actionCount: actions.length, components,
      operationCounts: Object.fromEntries([...new Set(recipes.map(recipe => recipe.operation))].map(operation => [operation, recipes.filter(recipe => recipe.operation === operation).length]))
    }
  };
}

export function a4HeroCompilerRoundtrip(value) { return JSON.parse(JSON.stringify(value)); }
