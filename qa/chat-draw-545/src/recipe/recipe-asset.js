import { AICommandLayer } from '../ai/ai-core.js';
import { assertValidRecipeAsset, validateRecipeAsset } from './recipe-validator.js';

const clone = value => structuredClone(value);
const stamp = () => new Date().toISOString();

export function createRecipeAsset(input = {}) {
  const createdAt = input.createdAt || stamp();
  return {
    format: 'INK-RECIPE', version: '1.0', recipeId: input.recipeId || `recipe-${crypto.randomUUID()}`, schemaVersion: '1.0',
    title: input.title || '', description: input.description || '', source: clone(input.source || {}), intent: clone(input.intent || {}),
    composition: clone(input.composition || {}), structure: clone(input.structure || {}), rendering: clone(input.rendering || {}),
    constraints: clone(input.constraints || {}), editableParameters: clone(input.editableParameters || {}), dependencies: clone(input.dependencies || []),
    capabilities: clone(input.capabilities || {}), expectedVisualChecks: clone(input.expectedVisualChecks || {}), rollbackPolicy: clone(input.rollbackPolicy || {}),
    testStatus: clone(input.testStatus || { status: 'UNTESTED' }), executableRecipe: clone(input.executableRecipe || null), createdAt, updatedAt: input.updatedAt || createdAt
  };
}

export function inspectRecipeAsset(recipe) {
  const validation = validateRecipeAsset(recipe);
  return { format: recipe?.format, version: recipe?.version, recipeId: recipe?.recipeId, title: recipe?.title, validation, dependencies: clone(recipe?.dependencies || []), capabilities: clone(recipe?.capabilities || {}), testStatus: clone(recipe?.testStatus || {}) };
}

export function checkRecipeDependencies(recipe, assetReport = null) {
  const missing = [], optionalMissing = [];
  for (const dependency of recipe.dependencies || []) {
    const record = assetReport?.assets?.find(item => item.assetId === (dependency.assetId || dependency));
    if (!record || record.status === 'MISSING') (dependency.optional ? optionalMissing : missing).push(dependency.assetId || dependency);
  }
  return { passed: missing.length === 0, missing, optionalMissing };
}

export function compareRecipeAssets(before, after) {
  assertValidRecipeAsset(before); assertValidRecipeAsset(after);
  const parameterDifference = {}, beforeParameters = before.editableParameters || {}, afterParameters = after.editableParameters || {};
  for (const key of new Set([...Object.keys(beforeParameters), ...Object.keys(afterParameters)])) if (JSON.stringify(beforeParameters[key]) !== JSON.stringify(afterParameters[key])) parameterDifference[key] = { before: beforeParameters[key] ?? null, after: afterParameters[key] ?? null };
  return { format: 'INK-RECIPE-COMPARISON', version: '1.0', sameRecipeId: before.recipeId === after.recipeId, schemaChanged: before.schemaVersion !== after.schemaVersion, parameterDifference, dependencyDifference: { before: before.dependencies, after: after.dependencies }, capabilityDifference: { before: before.capabilities, after: after.capabilities }, executableChanged: JSON.stringify(before.executableRecipe) !== JSON.stringify(after.executableRecipe) };
}

export function applyRecipeAsset(recipe, document, { approved = false } = {}) {
  assertValidRecipeAsset(recipe);
  if (!recipe.executableRecipe) throw Object.assign(new Error('Recipe has no executable payload'), { code: 'RECIPE_EXECUTABLE_MISSING' });
  const app = { doc: clone(document), replaceDocument(value) { this.doc = value; } }, layer = new AICommandLayer({ app }), executable = clone(recipe.executableRecipe);
  executable.recipeId = executable.recipeId || recipe.recipeId; executable.planId = executable.planId || `plan:${recipe.recipeId}`;
  layer.plans.set(executable.planId, { planId: executable.planId, confidence: Number(recipe.testStatus?.confidence ?? 1), recipeDraft: executable });
  layer.recipes.set(executable.recipeId, executable);
  const preview = layer.preview(executable.recipeId);
  if (!approved) return { status: 'AWAITING_APPROVAL', preview, document: app.doc };
  const approval = layer.approve(preview.previewId, { actor: { type: 'user', id: 'ink-recipe-cli' } });
  const execution = layer.executeApproval(approval.approvalId);
  return { status: 'COMPLETED', preview, approval, execution, document: app.doc };
}
