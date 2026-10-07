import { compilePaintingRecipe } from '../recipe/painting-recipe-compiler.js';
import { compileCrownPaintingPlan, crownStructureAdapter } from './crown-painting-compiler.js';
import { validateCrownPaintingPlan } from './crown-painting-plan-validator.js';
import { generateCenterRecipes, generatePetalRecipes } from './petal-recipe-generation.js';
import { runCrownVisualChecks } from './crown-visual-checks.js';

const crownRuntimeStable = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.keys(item).sort().reduce((out, name) => (out[name] = item[name], out), {}) : item);
const crownRuntimeHash = text => {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) { value ^= text.charCodeAt(index); value = Math.imul(value, 0x01000193); }
  return (value >>> 0).toString(16).padStart(8, '0');
};
const crownCloneMap = map => new Map(map);
const crownResultError = (code, message, details = {}) => ({ ok: false, code, message, details });
function crownRecipeState(page) {
  if (!page.floraRecipeState) page.floraRecipeState = { schemaVersion: '0.1', recipes: {}, actionToRecipe: {}, strokeToRecipe: {} };
  return page.floraRecipeState;
}
function crownRuntimeState(page) {
  if (!page.floraCrownState) page.floraCrownState = { schemaVersion: '0.1', crowns: {}, recipeToCrown: {}, strokeToCrown: {} };
  return page.floraCrownState;
}
function crownSetOptional(object, key, snapshot) { if (snapshot === undefined) delete object[key]; else object[key] = structuredClone(snapshot); }
function crownObjectHash(adapter, ids) {
  return crownRuntimeHash(crownRuntimeStable(ids.map(id => adapter.findObject(id)?.object).filter(Boolean)));
}

export class CrownPaintingRuntime {
  constructor(app, adapter, recipeRuntime, heroRuntime, maskCache) {
    this.app = app; this.adapter = adapter; this.recipeRuntime = recipeRuntime; this.heroRuntime = heroRuntime; this.maskCache = maskCache;
  }
  validate(plan) { return validateCrownPaintingPlan(plan, this.adapter); }
  compile(plan, options = {}) { return compileCrownPaintingPlan(plan, this.adapter, options); }
  preview(plan, options = {}) { return this.compile(plan, options); }
  state() { return crownRuntimeState(this.adapter.page()); }
  lookup(crownId) { return this.state().crowns[crownId] || null; }
  plan(crownId) { return this.lookup(crownId)?.plan || null; }
  mapping(crownId) {
    const entry = this.lookup(crownId);
    if (!entry) return null;
    return {
      crownId, planId: entry.plan.planId, recipeIds: [...entry.recipeIds], actionIds: [...entry.actionIds],
      strokeIds: [...entry.strokeIds], regionRecipeIds: structuredClone(entry.regionRecipeIds),
      recipeToStrokeIds: structuredClone(entry.recipeToStrokeIds)
    };
  }
  execute(planInput, { layerId = null } = {}) {
    const precompiled = this.compile(planInput, { layerId });
    if (!precompiled.ok) return crownResultError('CROWN_PLAN_REJECTED', 'Crown Painting Plan rejected', { errors: precompiled.errors, documentHash: this.adapter.documentHash() });
    const { plan, structure, recipes } = precompiled, page = this.adapter.page();
    const targetLayerId = layerId || page.activeLayerId || page.layers[0]?.id;
    if (!targetLayerId || !this.adapter.layerExists(targetLayerId)) return crownResultError('LAYER_NOT_FOUND', 'Target layer not found');
    const existing = page.floraCrownState?.crowns?.[plan.crownId] || null;
    const oldStrokeIds = existing?.strokeIds?.filter(id => this.adapter.objectExists(id)) || [];
    const snapshots = {
      hero: page.floraHero === undefined ? undefined : structuredClone(page.floraHero),
      recipes: page.floraRecipeState === undefined ? undefined : structuredClone(page.floraRecipeState),
      crowns: page.floraCrownState === undefined ? undefined : structuredClone(page.floraCrownState)
    };
    const beforeHash = this.adapter.documentHash(), beforeReplay = this.adapter.replayHash();
    const beforeUndo = this.app.history.undoStack.length, beforeRedo = this.app.history.redoStack.length;
    const beforeMap = crownCloneMap(this.adapter.actionObjectMap), cacheBefore = this.maskCache.snapshot?.(), layer = this.adapter.layer(targetLayerId);
    const targets = [
      [...this.app.pagePath(page), 'floraHero'], [...this.app.pagePath(page), 'floraRecipeState'],
      [...this.app.pagePath(page), 'floraCrownState'], this.app.layerObjectsPath(layer)
    ];
    this.app.history.begin(`FLORA Crown · ${plan.metadata.label}`, { targets });
    try {
      for (const id of oldStrokeIds) {
        const result = this.adapter.execute({ schemaVersion: '0.1', actionId: `${plan.planId}:replace:${id}`, type: 'deleteObject', targetId: id, payload: {}, seed: plan.seed, metadata: { source: 'ai', label: `${plan.metadata.label} · Replace crown stroke` } }, { history: false, render: false });
        if (!result.ok) throw new Error(`failed to remove previous crown stroke: ${id}`);
      }
      page.floraHero = structuredClone(structure);
      this.maskCache.clear();
      const state = crownRecipeState(page), crown = crownRuntimeState(page), allResults = [], actionIds = [], strokeIds = [], recipeIds = [], regionRecipeIds = {}, recipeToStrokeIds = {};
      if (existing) {
        for (const recipeId of existing.recipeIds || []) {
          const prior = state.recipes[recipeId];
          for (const actionId of prior?.actionIds || []) delete state.actionToRecipe[actionId];
          for (const strokeId of prior?.strokeIds || []) delete state.strokeToRecipe[strokeId];
          delete state.recipes[recipeId]; delete crown.recipeToCrown[recipeId];
        }
        for (const strokeId of existing.strokeIds || []) delete crown.strokeToCrown[strokeId];
      }
      for (const recipe of recipes) {
        const compiled = compilePaintingRecipe(recipe, this.adapter, { layerId: targetLayerId });
        if (!compiled.ok) throw new Error(`recipe compile failed: ${recipe.recipeId}`);
        const results = [];
        for (const action of compiled.actions) {
          const result = this.adapter.execute(action, { history: false, render: false });
          if (!result.ok) throw new Error(`action failed: ${action.actionId}`);
          results.push(result); allResults.push(result);
        }
        const createdStrokeIds = results.flatMap(result => result.createdIds || (result.createdId ? [result.createdId] : [])).filter(id => this.adapter.findObject(id)?.object?.type === 'stroke');
        const expandedActionLog = results.flatMap(result => result.generatedActions || []);
        const currentActionIds = [...compiled.actions.map(action => action.actionId), ...expandedActionLog.map(action => action.actionId)];
        state.recipes[recipe.recipeId] = {
          recipe: structuredClone(recipe), compileHash: compiled.compileHash, layerId: targetLayerId,
          actionIds: currentActionIds, strokeIds: createdStrokeIds, revision: 1,
          operation: recipe.operation, targetRegionId: recipe.targetRegionId, crownId: plan.crownId
        };
        for (const id of currentActionIds) state.actionToRecipe[id] = recipe.recipeId;
        for (const id of createdStrokeIds) state.strokeToRecipe[id] = recipe.recipeId;
        recipeIds.push(recipe.recipeId); actionIds.push(...currentActionIds); strokeIds.push(...createdStrokeIds);
        regionRecipeIds[recipe.targetRegionId] ||= []; regionRecipeIds[recipe.targetRegionId].push(recipe.recipeId);
        recipeToStrokeIds[recipe.recipeId] = createdStrokeIds;
        crown.recipeToCrown[recipe.recipeId] = plan.crownId;
        for (const id of createdStrokeIds) crown.strokeToCrown[id] = plan.crownId;
      }
      crown.crowns[plan.crownId] = {
        plan: structuredClone(plan), planHash: precompiled.planHash, structureHash: precompiled.structureHash,
        compileHash: precompiled.compileHash, layerId: targetLayerId, recipeIds, actionIds, strokeIds,
        regionRecipeIds, recipeToStrokeIds, recipeOverrides: {}, revision: (existing?.revision || 0) + 1,
        focalRegionId: structure.focalRegionId, centerRegionId: `${plan.crownId}:center`
      };
      this.app.history.commit();
      this.app.spatialDirty = true; this.app.renderer?.naturalMedia?.clearCaches?.(); this.app.renderer?.invalidateTiles?.(); this.app.refreshAll?.(); this.app.renderer?.render?.();
      const checks = runCrownVisualChecks({ structure: page.floraHero, plan, recipes, layer });
      return {
        ok: true, atomic: true, crownId: plan.crownId, planId: plan.planId, planHash: precompiled.planHash,
        compileHash: precompiled.compileHash, recipeCount: recipeIds.length, actionCount: actionIds.length,
        strokeCount: strokeIds.length, recipeIds, actionIds, strokeIds, regionRecipeIds,
        checks, historyEntriesAdded: this.app.history.undoStack.length - beforeUndo,
        documentHash: this.adapter.documentHash(), replayHash: this.adapter.replayHash()
      };
    } catch (error) {
      this.app.history.cancel({ restore: true });
      this.app.history.undoStack.splice(beforeUndo); this.app.history.redoStack.splice(beforeRedo);
      this.adapter.actionObjectMap = beforeMap;
      const current = this.adapter.page();
      crownSetOptional(current, 'floraHero', snapshots.hero); crownSetOptional(current, 'floraRecipeState', snapshots.recipes); crownSetOptional(current, 'floraCrownState', snapshots.crowns);
      this.maskCache.clear(); this.app.refreshAll?.(); this.app.renderer?.render?.();
      return crownResultError('CROWN_ROLLBACK', error.message, {
        beforeHash, documentHash: this.adapter.documentHash(), beforeReplay, replayHash: this.adapter.replayHash(),
        rolledBack: this.adapter.documentHash() === beforeHash, replayRestored: this.adapter.replayHash() === beforeReplay,
        historyUnchanged: this.app.history.undoStack.length === beforeUndo && this.app.history.redoStack.length === beforeRedo
      });
    }
  }
  _localRecompile(crownId, regionId, { operation = null, patch = {} } = {}) {
    const entry = this.lookup(crownId);
    if (!entry) return crownResultError('CROWN_NOT_FOUND', 'Crown not found', { crownId });
    const structure = this.adapter.hero(), region = this.adapter.region(regionId);
    if (!region || !entry.regionRecipeIds[regionId]) return crownResultError('REGION_NOT_FOUND', 'Crown region not found', { crownId, regionId });
    const plan = structuredClone(entry.plan), isCenter = region.kind === 'flower-center-region';
    const generated = isCenter
      ? generateCenterRecipes(plan, structure, { operation, overrides: {} })
      : generatePetalRecipes(plan, structure, { regionIds: [regionId], operation, overrides: {} });
    if (!generated.length) return crownResultError('OPERATION_NOT_FOUND', 'No matching Crown operation', { operation });
    const recipes = generated.map(recipe => {
      const existingOverride = entry.recipeOverrides?.[recipe.recipeId] || {};
      const next = { ...recipe, ...structuredClone(existingOverride), ...structuredClone(patch), recipeId: recipe.recipeId };
      if (patch.edgeSoftness !== undefined) next.feather = Number(patch.edgeSoftness);
      delete next.edgeSoftness;
      return next;
    });
    const proxy = crownStructureAdapter(this.adapter, structure), compiled = [];
    for (const recipe of recipes) {
      const item = compilePaintingRecipe(recipe, proxy, { layerId: entry.layerId });
      if (!item.ok) return crownResultError('LOCAL_RECOMPILE_REJECTED', 'Local Crown Recipe rejected', { recipeId: recipe.recipeId, errors: item.errors });
      compiled.push(item);
    }
    const page = this.adapter.page(), layer = this.adapter.layer(entry.layerId), stateBefore = structuredClone(page.floraRecipeState), crownBefore = structuredClone(page.floraCrownState);
    const beforeHash = this.adapter.documentHash(), beforeReplay = this.adapter.replayHash(), beforeUndo = this.app.history.undoStack.length, beforeRedo = this.app.history.redoStack.length;
    const beforeMap = crownCloneMap(this.adapter.actionObjectMap), cacheBefore = this.maskCache.snapshot?.();
    const targetRecipeIds = recipes.map(recipe => recipe.recipeId);
    const oldActionIds = targetRecipeIds.flatMap(id => page.floraRecipeState?.recipes?.[id]?.actionIds || []);
    const oldStrokeIds = targetRecipeIds.flatMap(id => entry.recipeToStrokeIds[id] || []).filter(id => this.adapter.objectExists(id));
    const nonTargetIds = entry.strokeIds.filter(id => !oldStrokeIds.includes(id) && this.adapter.objectExists(id));
    const nonTargetHashBefore = crownObjectHash(this.adapter, nonTargetIds);
    const targets = [[...this.app.pagePath(page), 'floraRecipeState'], [...this.app.pagePath(page), 'floraCrownState'], this.app.layerObjectsPath(layer)];
    for (const recipe of recipes) {
      const mask = this.adapter.mask(recipe.targetRegionId), index = structure.masks.indexOf(mask);
      if (index >= 0) targets.push([...this.app.pagePath(page), 'floraHero', 'masks', index]);
    }
    this.app.history.begin(`FLORA Crown Local · ${regionId}${operation ? ` · ${operation}` : ''}`, { targets });
    try {
      for (const id of oldStrokeIds) {
        const result = this.adapter.execute({ schemaVersion: '0.1', actionId: `${entry.plan.planId}:local-delete:${id}`, type: 'deleteObject', targetId: id, payload: {}, seed: entry.plan.seed, metadata: { source: 'ai', label: 'WP5 Local Crown replace old stroke' } }, { history: false, render: false });
        if (!result.ok) throw new Error(`local delete failed: ${id}`);
      }
      const state = crownRecipeState(page), crown = crownRuntimeState(page), updatedStrokeIds = [], updatedActionIds = [];
      for (let index = 0; index < recipes.length; index += 1) {
        const recipe = recipes[index], item = compilePaintingRecipe(recipe, this.adapter, { layerId: entry.layerId }), results = [];
        if (!item.ok) throw new Error(`local compile failed: ${recipe.recipeId}`);
        for (const action of item.actions) {
          const result = this.adapter.execute(action, { history: false, render: false });
          if (!result.ok) throw new Error(`local action failed: ${action.actionId}`);
          results.push(result);
        }
        const old = state.recipes[recipe.recipeId];
        for (const id of old?.actionIds || []) delete state.actionToRecipe[id];
        for (const id of old?.strokeIds || []) { delete state.strokeToRecipe[id]; delete crown.strokeToCrown[id]; }
        const strokes = results.flatMap(result => result.createdIds || (result.createdId ? [result.createdId] : [])).filter(id => this.adapter.findObject(id)?.object?.type === 'stroke');
        const expanded = results.flatMap(result => result.generatedActions || []), actions = [...item.actions.map(action => action.actionId), ...expanded.map(action => action.actionId)];
        state.recipes[recipe.recipeId] = { recipe: structuredClone(recipe), compileHash: item.compileHash, layerId: entry.layerId, actionIds: actions, strokeIds: strokes, revision: (old?.revision || 0) + 1, operation: recipe.operation, targetRegionId: recipe.targetRegionId, crownId };
        for (const id of actions) state.actionToRecipe[id] = recipe.recipeId;
        for (const id of strokes) { state.strokeToRecipe[id] = recipe.recipeId; crown.strokeToCrown[id] = crownId; }
        crown.recipeToCrown[recipe.recipeId] = crownId;
        entry.recipeToStrokeIds[recipe.recipeId] = strokes;
        entry.recipeOverrides ||= {}; entry.recipeOverrides[recipe.recipeId] = { ...(entry.recipeOverrides[recipe.recipeId] || {}), ...structuredClone(patch) };
        updatedStrokeIds.push(...strokes); updatedActionIds.push(...actions);
      }
      entry.strokeIds = [...new Set([...entry.strokeIds.filter(id => !oldStrokeIds.includes(id) && this.adapter.objectExists(id)), ...updatedStrokeIds])];
      entry.actionIds = [...new Set([...entry.actionIds.filter(id => !oldActionIds.includes(id)), ...updatedActionIds])];
      entry.revision += 1; entry.localRevision = (entry.localRevision || 0) + 1;
      this.app.history.commit(); this.app.spatialDirty = true; this.app.renderer?.naturalMedia?.clearCaches?.(); this.app.renderer?.invalidateTiles?.(); this.app.refreshAll?.(); this.app.renderer?.render?.();
      const nonTargetHashAfter = crownObjectHash(this.adapter, nonTargetIds);
      return {
        ok: true, atomic: true, crownId, regionId, operation, recipeIds: targetRecipeIds,
        removedStrokeIds: oldStrokeIds, createdStrokeIds: updatedStrokeIds,
        nonTargetIds, nonTargetHashBefore, nonTargetHashAfter, nonTargetUnchanged: nonTargetHashBefore === nonTargetHashAfter,
        historyEntriesAdded: this.app.history.undoStack.length - beforeUndo,
        documentHash: this.adapter.documentHash(), replayHash: this.adapter.replayHash()
      };
    } catch (error) {
      this.app.history.cancel({ restore: true }); this.app.history.undoStack.splice(beforeUndo); this.app.history.redoStack.splice(beforeRedo);
      this.adapter.actionObjectMap = beforeMap; const current = this.adapter.page(); current.floraRecipeState = stateBefore; current.floraCrownState = crownBefore;
      this.maskCache.clear(); this.app.refreshAll?.(); this.app.renderer?.render?.();
      return crownResultError('CROWN_LOCAL_ROLLBACK', error.message, {
        beforeHash, documentHash: this.adapter.documentHash(), beforeReplay, replayHash: this.adapter.replayHash(),
        rolledBack: this.adapter.documentHash() === beforeHash, historyUnchanged: this.app.history.undoStack.length === beforeUndo && this.app.history.redoStack.length === beforeRedo
      });
    }
  }
  recompilePetal(crownId, regionId, options = {}) {
    const region = this.adapter.region(regionId);
    if (region?.kind !== 'petal-region') return crownResultError('PETAL_REGION_REQUIRED', 'Target is not a petal region', { regionId });
    return this._localRecompile(crownId, regionId, options);
  }
  recompileCenter(crownId, options = {}) {
    const entry = this.lookup(crownId);
    if (!entry) return crownResultError('CROWN_NOT_FOUND', 'Crown not found', { crownId });
    return this._localRecompile(crownId, entry.centerRegionId, options);
  }
  adjustPetal(crownId, regionId, { opacity, palette, edgeSoftness, operation = null } = {}) {
    const patch = {};
    if (opacity !== undefined) patch.opacity = structuredClone(opacity);
    if (palette !== undefined) patch.palette = structuredClone(palette);
    if (edgeSoftness !== undefined) patch.edgeSoftness = edgeSoftness;
    return this.recompilePetal(crownId, regionId, { operation, patch });
  }
  visualChecks(crownId) {
    const entry = this.lookup(crownId);
    if (!entry) return crownResultError('CROWN_NOT_FOUND', 'Crown not found', { crownId });
    const state = crownRecipeState(this.adapter.page()), recipes = entry.recipeIds.map(id => state.recipes[id]?.recipe).filter(Boolean);
    return runCrownVisualChecks({ structure: this.adapter.hero(), plan: entry.plan, recipes, layer: this.adapter.layer(entry.layerId) });
  }
  replayHash(crownId) {
    const entry = this.lookup(crownId);
    return entry ? crownRuntimeHash(crownRuntimeStable({ entry, hero: this.adapter.hero(), recipes: this.adapter.page().floraRecipeState, objects: entry.strokeIds.map(id => this.adapter.findObject(id)?.object).filter(Boolean) })) : null;
  }
}
