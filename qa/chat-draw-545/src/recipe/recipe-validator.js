const REQUIRED = ['format', 'version', 'recipeId', 'schemaVersion', 'title', 'dependencies', 'capabilities', 'rollbackPolicy', 'testStatus'];

export function validateRecipeAsset(recipe) {
  const errors = [], warnings = [];
  if (!recipe || typeof recipe !== 'object') return { valid: false, errors: [{ code: 'RECIPE_REQUIRED' }], warnings };
  for (const field of REQUIRED) if (recipe[field] === undefined || recipe[field] === null) errors.push({ code: 'RECIPE_FIELD_REQUIRED', field });
  if (recipe.format !== 'INK-RECIPE') errors.push({ code: 'RECIPE_FORMAT_INVALID', expected: 'INK-RECIPE' });
  if (String(recipe.schemaVersion) !== '1.0') errors.push({ code: 'RECIPE_SCHEMA_UNSUPPORTED', schemaVersion: recipe.schemaVersion });
  if (!/^recipe[-_:]/.test(String(recipe.recipeId || ''))) errors.push({ code: 'RECIPE_ID_INVALID', recipeId: recipe.recipeId });
  if (!Array.isArray(recipe.dependencies)) errors.push({ code: 'RECIPE_DEPENDENCIES_INVALID' });
  if (!recipe.executableRecipe?.steps?.length) warnings.push({ code: 'RECIPE_EXECUTABLE_EMPTY' });
  const result = { format: 'INK-RECIPE-VALIDATION', version: '1.0', valid: errors.length === 0, errors, warnings };
  if (!result.valid) result.code = 'RECIPE_SCHEMA_INVALID';
  return result;
}

export function assertValidRecipeAsset(recipe) {
  const result = validateRecipeAsset(recipe);
  if (!result.valid) throw Object.assign(new Error('Recipe failed INK-RECIPE schema validation'), { code: 'RECIPE_SCHEMA_INVALID', details: result });
  return result;
}
