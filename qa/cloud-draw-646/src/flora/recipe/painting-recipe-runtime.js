import { compilePaintingRecipe, recipeStrokeToCreateStrokeAction } from './painting-recipe-compiler.js';
import { validatePaintingRecipe } from './painting-recipe-validator.js';
import { compileRegionStrokes } from '../painting/region-stroke-compiler.js';

function recipeState(page) {
  if (!page.floraRecipeState) page.floraRecipeState = { schemaVersion: '0.1', recipes: {}, actionToRecipe: {}, strokeToRecipe: {} };
  return page.floraRecipeState;
}
function cloneMap(map) { return new Map(map); }
function resultError(code, message, details = {}) { return { ok: false, code, message, details }; }

export class PaintingRecipeRuntime {
  constructor(app, adapter, dispatcher, maskCache) {
    this.app = app; this.adapter = adapter; this.dispatcher = dispatcher; this.maskCache = maskCache;
  }
  validate(recipe) { return validatePaintingRecipe(recipe, this.adapter); }
  compile(recipe, options = {}) { return compilePaintingRecipe(recipe, this.adapter, options); }
  preview(recipe, options = {}) {
    const compiled = this.compile(recipe, options);
    if (!compiled.ok) return compiled;
    const region = this.adapter.region(compiled.recipe.targetRegionId), sourceMask = this.adapter.mask(compiled.recipe.targetRegionId);
    const mask = structuredClone(sourceMask); mask.feather = compiled.recipe.feather; mask.cacheRevision = (mask.cacheRevision || 0) + 1;
    const raster = this.maskCache.getOrCreate(mask, 128, 181), strokes = [], hashes = [], strokeActions = [];
    for (const action of compiled.actions.filter(item => item.type === 'paintRegion')) {
      const result = compileRegionStrokes({ action, region, mask, page: this.adapter.page(), brushPreset: this.adapter.brushPreset(action.payload.brushPreset), rasterMask: raster });
      strokes.push(...result.strokes); hashes.push(result.compilerHash);
      strokeActions.push(...result.strokes.map((stroke, index) => recipeStrokeToCreateStrokeAction(stroke, action, compiled.layerId, index)));
    }
    this.maskCache.invalidate(mask.maskId);
    return { ...compiled, preview: { ...compiled.preview, strokeCount: strokes.length, compilerHashes: hashes, createStrokeActionCount: strokeActions.length }, strokes, strokeActions };
  }
  state() { return recipeState(this.adapter.page()); }
  lookup(recipeId) { return this.state().recipes[recipeId] || null; }
  execute(recipeInput, { layerId = null, replace = false, operation = null } = {}) {
    const compiled = this.compile(recipeInput, { layerId });
    if (!compiled.ok) return resultError('RECIPE_VALIDATION_FAILED', 'Painting Recipe rejected', { errors: compiled.errors, documentHash: this.adapter.documentHash() });
    const recipe = compiled.recipe, page = this.adapter.page(), statePath = [...this.app.pagePath(page), 'floraRecipeState'];
    const stateBefore = page.floraRecipeState ? structuredClone(page.floraRecipeState) : undefined;
    const beforeHash = this.adapter.documentHash(), beforeReplay = this.adapter.replayHash();
    const beforeUndo = this.app.history.undoStack.length, beforeRedo = this.app.history.redoStack.length;
    const beforeMap = cloneMap(this.adapter.actionObjectMap), cacheBefore = this.maskCache.snapshot?.(), existing = page.floraRecipeState?.recipes?.[recipe.recipeId] || null;
    const oldStrokeIds = replace && existing ? (existing.strokeIds || []).filter(id => {
      if (!operation) return true;
      const found = this.adapter.findObject(id);
      return found?.object?.floraPaint?.recipeOperation === operation;
    }) : [];
    const targets = [statePath];
    const layer = this.adapter.layer(compiled.layerId);
    if (layer) targets.push(this.app.layerObjectsPath(layer));
    const mask = this.adapter.mask(recipe.targetRegionId), maskIndex = this.adapter.hero()?.masks?.indexOf(mask);
    if (maskIndex >= 0) targets.push([...this.app.pagePath(page), 'floraHero', 'masks', maskIndex]);
    this.app.history.begin(`FLORA Recipe · ${recipe.metadata.label}`, { targets });
    try {
      const results = [];
      for (const id of oldStrokeIds) {
        const deleteAction = { schemaVersion: '0.1', actionId: `${recipe.recipeId}:delete:${id}`, type: 'deleteObject', targetId: id, payload: {}, seed: recipe.seed, metadata: { source: 'ai', label: `${recipe.metadata.label} · Replace old stroke`, recipeId: recipe.recipeId } };
        const result = this.adapter.execute(deleteAction, { history: false });
        if (!result.ok) throw new Error(`delete failed: ${id}`);
        results.push(result);
      }
      for (const action of compiled.actions) {
        const result = this.adapter.execute(action, { history: false });
        if (!result.ok) throw new Error(`action failed: ${action.actionId}`);
        results.push(result);
      }
      const state = recipeState(page), createdStrokeIds = results.flatMap(result => result.createdIds || (result.createdId ? [result.createdId] : []))
        .filter(id => this.adapter.findObject(id)?.object?.type === 'stroke');
      const retained = existing?.strokeIds?.filter(id => !oldStrokeIds.includes(id) && this.adapter.objectExists(id)) || [];
      const strokeIds = [...new Set([...retained, ...createdStrokeIds])];
      const expandedActionLog = results.flatMap(result => result.generatedActions || []);
      const actionIds = [...compiled.actions.map(action => action.actionId), ...expandedActionLog.map(action => action.actionId)];
      for (const oldActionId of existing?.actionIds || []) delete state.actionToRecipe[oldActionId];
      state.recipes[recipe.recipeId] = {
        recipe: structuredClone(recipe), compileHash: compiled.compileHash, layerId: compiled.layerId,
        actionIds, strokeIds, revision: (existing?.revision || 0) + 1,
        operation: recipe.operation, targetRegionId: recipe.targetRegionId
      };
      for (const actionId of actionIds) state.actionToRecipe[actionId] = recipe.recipeId;
      for (const strokeId of strokeIds) state.strokeToRecipe[strokeId] = recipe.recipeId;
      for (const removed of oldStrokeIds) delete state.strokeToRecipe[removed];
      this.app.history.commit();
      this.app.refreshAll?.(); this.app.renderer?.render?.();
      return {
        ok: true, atomic: true, recipeId: recipe.recipeId, operation: recipe.operation,
        compileHash: compiled.compileHash, actionLog: compiled.actions, expandedActionLog, results, strokeIds,
        historyEntriesAdded: this.app.history.undoStack.length - beforeUndo,
        documentHash: this.adapter.documentHash(), replayHash: this.adapter.replayHash()
      };
    } catch (error) {
      this.app.history.cancel({ restore: true });
      this.app.history.undoStack.splice(beforeUndo); this.app.history.redoStack.splice(beforeRedo);
      this.adapter.actionObjectMap = beforeMap;
      if (stateBefore === undefined) delete page.floraRecipeState; else page.floraRecipeState = stateBefore;
      if (cacheBefore && this.maskCache.restore) this.maskCache.restore(cacheBefore); else this.maskCache.clear();
      this.app.refreshAll?.(); this.app.renderer?.render?.();
      return resultError('RECIPE_ROLLBACK', error.message, {
        beforeHash, documentHash: this.adapter.documentHash(), beforeReplay, replayHash: this.adapter.replayHash(),
        rolledBack: this.adapter.documentHash() === beforeHash,
        historyUnchanged: this.app.history.undoStack.length === beforeUndo && this.app.history.redoStack.length === beforeRedo
      });
    }
  }
  recompile(recipeId, { operation = null, patch = {}, layerId = null } = {}) {
    const existing = this.lookup(recipeId);
    if (!existing) return resultError('RECIPE_NOT_FOUND', 'Recipe not found', { recipeId });
    if (operation && operation !== existing.recipe.operation) return resultError('OPERATION_NOT_FOUND', 'Operation does not match stored recipe', { recipeId, operation });
    const next = { ...structuredClone(existing.recipe), ...structuredClone(patch), recipeId };
    return this.execute(next, { layerId: layerId || existing.layerId, replace: true, operation });
  }
  mapping(recipeId) {
    const entry = this.lookup(recipeId);
    if (!entry) return null;
    return { recipeId, actionIds: [...entry.actionIds], strokeIds: [...entry.strokeIds] };
  }
}
