import { operationDefaults } from '../painting/region-paint-operations.js';
import { validatePaintingRecipe } from './painting-recipe-validator.js';

const recipeHash = text => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, '0');
};
const stableRecipe = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.keys(item).sort().reduce((out, name) => (out[name] = item[name], out), {})
  : item);
const mixRange = value => Array.isArray(value) ? value : [value, value];
const actionMetadata = (recipe, pass, label) => ({
  source: 'ai', label, recipeId: recipe.recipeId, recipeOperation: recipe.operation, recipePass: pass
});

export function compilePaintingRecipe(recipeInput, adapter, { layerId = null } = {}) {
  const checked = validatePaintingRecipe(recipeInput, adapter);
  if (!checked.ok) return { ok: false, errors: checked.errors, actions: [] };
  const recipe = checked.recipe;
  const targetLayerId = layerId || adapter.page().activeLayerId || adapter.page().layers[0]?.id;
  if (!targetLayerId || !adapter.layerExists(targetLayerId)) return { ok: false, errors: [{ code: 'LAYER_NOT_FOUND', path: '$.layerId' }], actions: [] };
  const defaults = operationDefaults(recipe.operation), actions = [];
  const mask = adapter.mask(recipe.targetRegionId);
  if (mask && Math.abs((mask.feather || 0) - recipe.feather) > 1e-9) actions.push({
    schemaVersion: '0.1', actionId: `${recipe.recipeId}:mask-feather`, type: 'setMaskFeather',
    payload: { regionId: recipe.targetRegionId, feather: recipe.feather }, seed: recipe.seed,
    metadata: actionMetadata(recipe, -1, `${recipe.metadata.label} · Mask Feather`)
  });
  for (let pass = 0; pass < recipe.passes; pass += 1) {
    const color = recipe.palette[pass % recipe.palette.length];
    const seed = (recipe.seed + Math.imul(pass + 1, 2654435761)) >>> 0;
    actions.push({
      schemaVersion: '0.1', actionId: `${recipe.recipeId}:${recipe.operation.replace(/\s+/g, '-').toLowerCase()}:pass-${pass + 1}`,
      type: 'paintRegion', seed,
      payload: {
        regionId: recipe.targetRegionId, layerId: targetLayerId, operation: recipe.operation,
        brushPreset: recipe.brushPreset || defaults.brushPreset, color, palette: [...recipe.palette], direction: recipe.direction,
        density: recipe.density, spacing: recipe.spacing, widthRange: [...recipe.widthRange],
        opacityRange: mixRange(recipe.opacity), jitter: recipe.jitter,
        edgeAvoidance: recipe.constraints.edgeAvoidance ?? defaults.edgeAvoidance,
        coverage: recipe.coverage, blendMode: recipe.blendMode,
        constraints: structuredClone(recipe.constraints), ...(recipe.refinement ? { refinement: structuredClone(recipe.refinement) } : {}), recipeId: recipe.recipeId,
        recipeOperation: recipe.operation, recipePass: pass, paletteIndex: pass % recipe.palette.length,
        objectPrefix: `flora-recipe-${recipeHash(recipe.recipeId)}`
      },
      metadata: actionMetadata(recipe, pass, `${recipe.metadata.label} · ${recipe.operation} · Pass ${pass + 1}`)
    });
  }
  return {
    ok: true, recipe, layerId: targetLayerId, actions,
    compileHash: recipeHash(stableRecipe({ recipe, actions })),
    preview: { actionCount: actions.length, passCount: recipe.passes, targetRegionId: recipe.targetRegionId, operation: recipe.operation }
  };
}

export function paintingRecipeRoundtrip(recipe) {
  const json = JSON.stringify(recipe);
  return JSON.parse(json);
}


export function recipeStrokeToCreateStrokeAction(stroke, sourceAction, layerId, index = 0) {
  const matrix = stroke.matrix || [1, 0, 0, 1, 0, 0];
  const tx = Number(matrix[4]) || 0, ty = Number(matrix[5]) || 0;
  const floraPaint = stroke.floraPaint || {};
  return {
    schemaVersion: '0.1',
    actionId: `flora-create-stroke-${recipeHash(`${sourceAction.actionId}:${stroke.id}:${index}`)}`,
    type: 'createStroke',
    seed: (sourceAction.seed + index) >>> 0,
    payload: {
      layerId, objectId: stroke.id, brushPreset: sourceAction.payload.brushPreset,
      color: stroke.color, size: stroke.size, opacity: stroke.opacity,
      smoothing: stroke.smoothing, pressure: stroke.pressure, taper: stroke.taper,
      grain: stroke.grain, softness: stroke.softness, flow: stroke.flow,
      wetness: stroke.wetness, bristle: stroke.bristle, blendMode: stroke.blendMode || 'source-over',
      points: (stroke.points || []).map(point => ({
        x: tx + point.x, y: ty + point.y, p: point.p, t: point.t,
        tiltX: point.tiltX ?? 0, tiltY: point.tiltY ?? 0
      })),
      regionId: floraPaint.regionId, maskId: floraPaint.maskId,
      maskRevision: floraPaint.maskRevision ?? 0, regionZ: floraPaint.regionZ ?? 0,
      operation: floraPaint.operation, direction: floraPaint.direction,
      recipeId: floraPaint.recipeId, recipeOperation: floraPaint.recipeOperation,
      recipePass: floraPaint.recipePass, paletteIndex: floraPaint.paletteIndex,
      constraints: structuredClone(floraPaint.constraints || {}),
      ...(floraPaint.refinement ? { refinement: structuredClone(floraPaint.refinement) } : {})
    },
    metadata: {
      source: 'ai', label: `${sourceAction.metadata.label} · Editable Stroke ${index + 1}`,
      recipeId: floraPaint.recipeId, recipeOperation: floraPaint.recipeOperation,
      recipePass: floraPaint.recipePass
    }
  };
}
