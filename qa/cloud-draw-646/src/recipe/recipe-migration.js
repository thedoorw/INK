import { createRecipeAsset } from './recipe-asset.js';

export function migrateRecipeAsset(input) {
  if (input?.format === 'INK-RECIPE' && String(input.schemaVersion) === '1.0' && input.recipeId) return { recipe: structuredClone(input), report: { status: 'PRESERVED', from: '1.0', to: '1.0', warnings: [] } };
  if (['INK-AI-RECIPE', 'INK-RECIPE'].includes(input?.format) || Array.isArray(input?.steps)) {
    const executableRecipe = structuredClone(input), recipeId = input.recipeId || input.id || `recipe-migrated-${Date.now()}`;
    const recipe = createRecipeAsset({ recipeId, title: input.title || input.name || recipeId, description: input.description || 'Migrated legacy INK Recipe', source: { legacyFormat: input.format || 'UNVERSIONED', legacyVersion: input.version || null }, intent: { planId: input.planId || null }, structure: { stepCount: input.steps?.length || 0 }, dependencies: input.dependencies || [], capabilities: { operations: [...new Set((input.steps || []).map(step => step.operation || step.op).filter(Boolean))] }, rollbackPolicy: { strategy: input.rollbackStrategy || 'CHECKPOINT_AND_INVERSE_PATCH' }, testStatus: { status: 'MIGRATED_UNTESTED' }, executableRecipe });
    return { recipe, report: { status: 'MIGRATED', from: input.format || 'UNVERSIONED', to: '1.0', warnings: ['Re-export is required before relying on package metadata.'] } };
  }
  throw Object.assign(new Error('Legacy Recipe format is not recognized'), { code: 'RECIPE_MIGRATION_UNSUPPORTED' });
}
