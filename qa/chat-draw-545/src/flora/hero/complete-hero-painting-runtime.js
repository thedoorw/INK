import { compilePaintingRecipe } from '../recipe/painting-recipe-compiler.js';
import { crownStructureAdapter } from '../crown/crown-painting-compiler.js';
import { validateA4HeroPaintingPlan } from './a4-hero-plan-validator.js';
import { compileA4HeroPaintingPlan } from './complete-hero-painting-compiler.js';
import { runA4HeroVisualChecks } from './a4-hero-visual-checks.js';

const a4RuntimeStable = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.keys(item).sort().reduce((out, name) => (out[name] = item[name], out), {}) : item);
const a4RuntimeHash = text => {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) { value ^= text.charCodeAt(index); value = Math.imul(value, 0x01000193); }
  return (value >>> 0).toString(16).padStart(8, '0');
};
const a4RuntimeError = (code, message, details = {}) => ({ ok: false, code, message, details });
const a4CloneMap = map => new Map(map);
function a4RecipeState(page) {
  if (!page.floraRecipeState) page.floraRecipeState = { schemaVersion: '0.1', recipes: {}, actionToRecipe: {}, strokeToRecipe: {} };
  return page.floraRecipeState;
}
function a4HeroState(page) {
  if (!page.floraHeroPaintingState) page.floraHeroPaintingState = { schemaVersion: '0.1', heroes: {}, recipeToHero: {}, strokeToHero: {} };
  return page.floraHeroPaintingState;
}
function a4SetOptional(object, key, snapshot) { if (snapshot === undefined) delete object[key]; else object[key] = structuredClone(snapshot); }
function a4ObjectHash(adapter, ids) { return a4RuntimeHash(a4RuntimeStable(ids.map(id => adapter.findObject(id)?.object).filter(Boolean))); }
function a4RecipeMatches(recipe, { regionIds = null, component = null, operation = null } = {}) {
  if (regionIds && !regionIds.includes(recipe.targetRegionId)) return false;
  if (component && recipe.metadata?.component !== component) return false;
  if (operation && recipe.operation !== operation && recipe.metadata?.semanticOperation !== operation) return false;
  return true;
}

export class CompleteHeroPaintingRuntime {
  constructor(app, adapter, recipeRuntime, crownRuntime, heroRuntime, maskCache) {
    this.app = app; this.adapter = adapter; this.recipeRuntime = recipeRuntime; this.crownRuntime = crownRuntime; this.heroRuntime = heroRuntime; this.maskCache = maskCache;
  }
  validate(plan) { return validateA4HeroPaintingPlan(plan, this.adapter); }
  compile(plan, options = {}) { return compileA4HeroPaintingPlan(plan, this.adapter, options); }
  preview(plan, options = {}) { return this.compile(plan, options); }
  state() { return a4HeroState(this.adapter.page()); }
  lookup(heroId) { return this.state().heroes[heroId] || null; }
  plan(heroId) { return this.lookup(heroId)?.plan || null; }
  mapping(heroId) {
    const entry = this.lookup(heroId);
    if (!entry) return null;
    return {
      heroId, planId: entry.plan.planId, recipeIds: [...entry.recipeIds], actionIds: [...entry.actionIds],
      strokeIds: [...entry.strokeIds], regionRecipeIds: structuredClone(entry.regionRecipeIds),
      componentRecipeIds: structuredClone(entry.componentRecipeIds), recipeToStrokeIds: structuredClone(entry.recipeToStrokeIds)
    };
  }
  _storeRecipe({ page, state, heroes, entry, plan, recipe, compiled, results, layerId }) {
    const createdStrokeIds = results.flatMap(result => result.createdIds || (result.createdId ? [result.createdId] : [])).filter(id => this.adapter.findObject(id)?.object?.type === 'stroke');
    const expandedActions = results.flatMap(result => result.generatedActions || []);
    const actionIds = [...compiled.actions.map(action => action.actionId), ...expandedActions.map(action => action.actionId)];
    for (const id of createdStrokeIds) {
      const object = this.adapter.findObject(id)?.object;
      if (object?.floraPaint) {
        object.floraPaint.heroId = plan.heroId;
        object.floraPaint.heroPlanId = plan.planId;
        object.floraPaint.component = recipe.metadata?.component || null;
        object.floraPaint.semanticOperation = recipe.metadata?.semanticOperation || recipe.operation;
      }
    }
    const old = state.recipes[recipe.recipeId];
    for (const id of old?.actionIds || []) delete state.actionToRecipe[id];
    for (const id of old?.strokeIds || []) { delete state.strokeToRecipe[id]; delete heroes.strokeToHero[id]; }
    state.recipes[recipe.recipeId] = {
      recipe: structuredClone(recipe), compileHash: compiled.compileHash, layerId,
      actionIds, strokeIds: createdStrokeIds, revision: (old?.revision || 0) + 1,
      operation: recipe.operation, semanticOperation: recipe.metadata?.semanticOperation || recipe.operation,
      targetRegionId: recipe.targetRegionId, heroId: plan.heroId
    };
    for (const id of actionIds) state.actionToRecipe[id] = recipe.recipeId;
    for (const id of createdStrokeIds) { state.strokeToRecipe[id] = recipe.recipeId; heroes.strokeToHero[id] = plan.heroId; }
    heroes.recipeToHero[recipe.recipeId] = plan.heroId;
    entry.recipeToStrokeIds[recipe.recipeId] = createdStrokeIds;
    entry.regionRecipeIds[recipe.targetRegionId] ||= [];
    if (!entry.regionRecipeIds[recipe.targetRegionId].includes(recipe.recipeId)) entry.regionRecipeIds[recipe.targetRegionId].push(recipe.recipeId);
    const component = recipe.metadata?.component || 'unknown';
    entry.componentRecipeIds[component] ||= [];
    if (!entry.componentRecipeIds[component].includes(recipe.recipeId)) entry.componentRecipeIds[component].push(recipe.recipeId);
    return { createdStrokeIds, actionIds };
  }
  execute(planInput, { layerId = null } = {}) {
    const precompiled = this.compile(planInput, { layerId });
    if (!precompiled.ok) return a4RuntimeError('A4_HERO_PLAN_REJECTED', 'Complete A4 Hero Painting Plan rejected', { errors: precompiled.errors, documentHash: this.adapter.documentHash() });
    const { plan, structure, recipes } = precompiled, page = this.adapter.page();
    const targetLayerId = layerId || page.activeLayerId || page.layers[0]?.id;
    if (!targetLayerId || !this.adapter.layerExists(targetLayerId)) return a4RuntimeError('LAYER_NOT_FOUND', 'Target layer not found');
    const existing = page.floraHeroPaintingState?.heroes?.[plan.heroId] || null;
    const snapshots = {
      hero: page.floraHero === undefined ? undefined : structuredClone(page.floraHero),
      recipes: page.floraRecipeState === undefined ? undefined : structuredClone(page.floraRecipeState),
      heroPainting: page.floraHeroPaintingState === undefined ? undefined : structuredClone(page.floraHeroPaintingState)
    };
    const beforeHash = this.adapter.documentHash(), beforeReplay = this.adapter.replayHash();
    const beforeUndo = this.app.history.undoStack.length, beforeRedo = this.app.history.redoStack.length;
    const beforeMap = a4CloneMap(this.adapter.actionObjectMap), cacheBefore = this.maskCache.snapshot?.(), layer = this.adapter.layer(targetLayerId);
    const targets = [
      [...this.app.pagePath(page), 'floraHero'], [...this.app.pagePath(page), 'floraRecipeState'],
      [...this.app.pagePath(page), 'floraHeroPaintingState'], this.app.layerObjectsPath(layer)
    ];
    this.app.history.begin(`FLORA A4 Hero · ${plan.metadata.label}`, { targets });
    try {
      const oldStrokeIds = existing?.strokeIds?.filter(id => this.adapter.objectExists(id)) || [];
      for (const id of oldStrokeIds) {
        const result = this.adapter.execute({ schemaVersion: '0.1', actionId: `${plan.planId}:replace:${id}`, type: 'deleteObject', targetId: id, payload: {}, seed: plan.seed, metadata: { source: 'ai', label: `${plan.metadata.label} · Replace prior Hero stroke` } }, { history: false, render: false });
        if (!result.ok) throw new Error(`failed to remove prior Hero stroke: ${id}`);
      }
      page.floraHero = structuredClone(structure); this.maskCache.clear();
      const state = a4RecipeState(page), heroes = a4HeroState(page);
      if (existing) {
        for (const recipeId of existing.recipeIds || []) {
          const old = state.recipes[recipeId];
          for (const id of old?.actionIds || []) delete state.actionToRecipe[id];
          for (const id of old?.strokeIds || []) { delete state.strokeToRecipe[id]; delete heroes.strokeToHero[id]; }
          delete state.recipes[recipeId]; delete heroes.recipeToHero[recipeId];
        }
      }
      const entry = {
        plan: structuredClone(plan), planHash: precompiled.planHash, structureHash: precompiled.structureHash,
        compileHash: precompiled.compileHash, layerId: targetLayerId, recipeIds: [], actionIds: [], strokeIds: [],
        regionRecipeIds: {}, componentRecipeIds: {}, recipeToStrokeIds: {}, recipeOverrides: {},
        revision: (existing?.revision || 0) + 1, focalRegionId: structure.focalRegionId,
        centerRegionId: structure.centerRegionId, stemRegionId: structure.stemRegionId,
        leafRegionIds: [...structure.leafRegionIds], backgroundRegionId: structure.backgroundRegionId
      };
      for (const recipe of recipes) {
        const compiled = compilePaintingRecipe(recipe, this.adapter, { layerId: targetLayerId });
        if (!compiled.ok) throw new Error(`recipe compile failed: ${recipe.recipeId}`);
        const results = [];
        for (const action of compiled.actions) {
          const result = this.adapter.execute(action, { history: false, render: false });
          if (!result.ok) throw new Error(`action failed: ${action.actionId}`);
          results.push(result);
        }
        const stored = this._storeRecipe({ page, state, heroes, entry, plan, recipe, compiled, results, layerId: targetLayerId });
        entry.recipeIds.push(recipe.recipeId); entry.actionIds.push(...stored.actionIds); entry.strokeIds.push(...stored.createdStrokeIds);
      }
      heroes.heroes[plan.heroId] = entry;
      this.app.history.commit();
      this.app.spatialDirty = true; this.app.renderer?.naturalMedia?.clearCaches?.(); this.app.renderer?.invalidateTiles?.(); this.app.refreshAll?.(); this.app.renderer?.render?.();
      const checks = runA4HeroVisualChecks({ structure: page.floraHero, plan, recipes, layer });
      return {
        ok: true, atomic: true, heroId: plan.heroId, planId: plan.planId,
        planHash: precompiled.planHash, structureHash: precompiled.structureHash, compileHash: precompiled.compileHash,
        recipeCount: entry.recipeIds.length, actionCount: entry.actionIds.length, strokeCount: entry.strokeIds.length,
        recipeIds: [...entry.recipeIds], actionIds: [...entry.actionIds], strokeIds: [...entry.strokeIds],
        componentRecipeIds: structuredClone(entry.componentRecipeIds), checks,
        historyEntriesAdded: this.app.history.undoStack.length - beforeUndo,
        documentHash: this.adapter.documentHash(), replayHash: this.adapter.replayHash()
      };
    } catch (error) {
      this.app.history.cancel({ restore: true });
      this.app.history.undoStack.splice(beforeUndo); this.app.history.redoStack.splice(beforeRedo);
      this.adapter.actionObjectMap = beforeMap;
      const current = this.adapter.page();
      a4SetOptional(current, 'floraHero', snapshots.hero); a4SetOptional(current, 'floraRecipeState', snapshots.recipes); a4SetOptional(current, 'floraHeroPaintingState', snapshots.heroPainting);
      if (cacheBefore && this.maskCache.restore) this.maskCache.restore(cacheBefore); else this.maskCache.clear();
      this.app.refreshAll?.(); this.app.renderer?.render?.();
      return a4RuntimeError('A4_HERO_ROLLBACK', error.message, {
        beforeHash, documentHash: this.adapter.documentHash(), beforeReplay, replayHash: this.adapter.replayHash(),
        rolledBack: this.adapter.documentHash() === beforeHash, replayRestored: this.adapter.replayHash() === beforeReplay,
        historyUnchanged: this.app.history.undoStack.length === beforeUndo && this.app.history.redoStack.length === beforeRedo
      });
    }
  }
  _localRecompile(heroId, selector = {}, patch = {}) {
    const entry = this.lookup(heroId);
    if (!entry) return a4RuntimeError('HERO_NOT_FOUND', 'Complete A4 Hero not found', { heroId });
    const full = this.compile(entry.plan, { layerId: entry.layerId });
    if (!full.ok) return a4RuntimeError('LOCAL_COMPILE_REJECTED', 'Stored Hero plan no longer compiles', { errors: full.errors });
    const selected = full.recipes.filter(recipe => a4RecipeMatches(recipe, selector));
    if (!selected.length) return a4RuntimeError('LOCAL_TARGET_NOT_FOUND', 'No matching Hero Recipe', selector);
    const recipes = selected.map(recipe => {
      const prior = entry.recipeOverrides?.[recipe.recipeId] || {};
      const next = { ...recipe, ...structuredClone(prior), ...structuredClone(patch), recipeId: recipe.recipeId };
      if (patch.edgeSoftness !== undefined) next.feather = Number(patch.edgeSoftness);
      delete next.edgeSoftness;
      return next;
    });
    const proxy = crownStructureAdapter(this.adapter, this.adapter.hero()), compiledItems = [];
    for (const recipe of recipes) {
      const item = compilePaintingRecipe(recipe, proxy, { layerId: entry.layerId });
      if (!item.ok) return a4RuntimeError('LOCAL_RECOMPILE_REJECTED', 'Local Hero Recipe rejected', { recipeId: recipe.recipeId, errors: item.errors });
      compiledItems.push(item);
    }
    const page = this.adapter.page(), layer = this.adapter.layer(entry.layerId);
    const recipeBefore = structuredClone(page.floraRecipeState), heroBefore = structuredClone(page.floraHeroPaintingState);
    const beforeHash = this.adapter.documentHash(), beforeReplay = this.adapter.replayHash();
    const beforeUndo = this.app.history.undoStack.length, beforeRedo = this.app.history.redoStack.length, beforeMap = a4CloneMap(this.adapter.actionObjectMap), cacheBefore = this.maskCache.snapshot?.();
    const targetRecipeIds = recipes.map(recipe => recipe.recipeId);
    const oldActionIds = targetRecipeIds.flatMap(id => page.floraRecipeState?.recipes?.[id]?.actionIds || []);
    const oldStrokeIds = targetRecipeIds.flatMap(id => entry.recipeToStrokeIds[id] || []).filter(id => this.adapter.objectExists(id));
    const nonTargetIds = entry.strokeIds.filter(id => !oldStrokeIds.includes(id) && this.adapter.objectExists(id));
    const nonTargetHashBefore = a4ObjectHash(this.adapter, nonTargetIds);
    const targets = [[...this.app.pagePath(page), 'floraRecipeState'], [...this.app.pagePath(page), 'floraHeroPaintingState'], this.app.layerObjectsPath(layer)];
    for (const recipe of recipes) {
      const mask = this.adapter.mask(recipe.targetRegionId), index = this.adapter.hero()?.masks?.indexOf(mask);
      if (index >= 0) targets.push([...this.app.pagePath(page), 'floraHero', 'masks', index]);
    }
    this.app.history.begin(`FLORA A4 Hero Local · ${selector.component || selector.regionIds?.join(',') || selector.operation || 'selection'}`, { targets });
    try {
      for (const id of oldStrokeIds) {
        const result = this.adapter.execute({ schemaVersion: '0.1', actionId: `${entry.plan.planId}:local-delete:${id}`, type: 'deleteObject', targetId: id, payload: {}, seed: entry.plan.seed, metadata: { source: 'ai', label: 'WP6 Local Hero replace old stroke' } }, { history: false, render: false });
        if (!result.ok) throw new Error(`local delete failed: ${id}`);
      }
      const state = a4RecipeState(page), heroes = a4HeroState(page), createdStrokeIds = [], createdActionIds = [];
      for (let index = 0; index < recipes.length; index += 1) {
        const recipe = recipes[index], item = compiledItems[index], results = [];
        for (const action of item.actions) {
          const result = this.adapter.execute(action, { history: false, render: false });
          if (!result.ok) throw new Error(`local action failed: ${action.actionId}`);
          results.push(result);
        }
        const stored = this._storeRecipe({ page, state, heroes, entry, plan: entry.plan, recipe, compiled: item, results, layerId: entry.layerId });
        entry.recipeOverrides ||= {}; entry.recipeOverrides[recipe.recipeId] = { ...(entry.recipeOverrides[recipe.recipeId] || {}), ...structuredClone(patch) };
        createdStrokeIds.push(...stored.createdStrokeIds); createdActionIds.push(...stored.actionIds);
      }
      entry.strokeIds = [...new Set([...entry.strokeIds.filter(id => !oldStrokeIds.includes(id) && this.adapter.objectExists(id)), ...createdStrokeIds])];
      entry.actionIds = [...new Set([...entry.actionIds.filter(id => !oldActionIds.includes(id)), ...createdActionIds])];
      entry.revision += 1; entry.localRevision = (entry.localRevision || 0) + 1;
      this.app.history.commit();
      this.app.spatialDirty = true; this.app.renderer?.naturalMedia?.clearCaches?.(); this.app.renderer?.invalidateTiles?.(); this.app.refreshAll?.(); this.app.renderer?.render?.();
      const nonTargetHashAfter = a4ObjectHash(this.adapter, nonTargetIds);
      return {
        ok: true, atomic: true, heroId, selector: structuredClone(selector), recipeIds: targetRecipeIds,
        removedStrokeIds: oldStrokeIds, createdStrokeIds, nonTargetIds,
        nonTargetHashBefore, nonTargetHashAfter, nonTargetUnchanged: nonTargetHashBefore === nonTargetHashAfter,
        historyEntriesAdded: this.app.history.undoStack.length - beforeUndo,
        documentHash: this.adapter.documentHash(), replayHash: this.adapter.replayHash()
      };
    } catch (error) {
      this.app.history.cancel({ restore: true }); this.app.history.undoStack.splice(beforeUndo); this.app.history.redoStack.splice(beforeRedo);
      this.adapter.actionObjectMap = beforeMap; const current = this.adapter.page(); current.floraRecipeState = recipeBefore; current.floraHeroPaintingState = heroBefore;
      if (cacheBefore && this.maskCache.restore) this.maskCache.restore(cacheBefore); else this.maskCache.clear();
      this.app.refreshAll?.(); this.app.renderer?.render?.();
      return a4RuntimeError('A4_HERO_LOCAL_ROLLBACK', error.message, {
        beforeHash, documentHash: this.adapter.documentHash(), beforeReplay, replayHash: this.adapter.replayHash(),
        rolledBack: this.adapter.documentHash() === beforeHash,
        historyUnchanged: this.app.history.undoStack.length === beforeUndo && this.app.history.redoStack.length === beforeRedo
      });
    }
  }
  recompileCrown(heroId, options = {}) { return this._localRecompile(heroId, { regionIds: this.adapter.hero()?.regions?.filter(region => ['petal-region', 'flower-center-region'].includes(region.kind)).map(region => region.regionId) || [], operation: options.operation || null }, options.patch || {}); }
  recompilePetal(heroId, regionId, options = {}) {
    if (this.adapter.region(regionId)?.kind !== 'petal-region') return a4RuntimeError('PETAL_REGION_REQUIRED', 'Target is not a petal region', { regionId });
    return this._localRecompile(heroId, { regionIds: [regionId], operation: options.operation || null }, options.patch || {});
  }
  recompileCenter(heroId, options = {}) {
    const entry = this.lookup(heroId); if (!entry) return a4RuntimeError('HERO_NOT_FOUND', 'Complete A4 Hero not found', { heroId });
    return this._localRecompile(heroId, { regionIds: [entry.centerRegionId], operation: options.operation || null }, options.patch || {});
  }
  recompileStem(heroId, options = {}) {
    const entry = this.lookup(heroId); if (!entry) return a4RuntimeError('HERO_NOT_FOUND', 'Complete A4 Hero not found', { heroId });
    return this._localRecompile(heroId, { regionIds: [entry.stemRegionId], operation: options.operation || null }, options.patch || {});
  }
  recompileLeaf(heroId, side, options = {}) {
    const entry = this.lookup(heroId); if (!entry) return a4RuntimeError('HERO_NOT_FOUND', 'Complete A4 Hero not found', { heroId });
    const regionId = entry.leafRegionIds.find(id => id.endsWith(`:${side}`));
    if (!regionId) return a4RuntimeError('LEAF_NOT_FOUND', 'Leaf side not found', { side });
    return this._localRecompile(heroId, { regionIds: [regionId], operation: options.operation || null }, options.patch || {});
  }
  recompileBackground(heroId, options = {}) {
    const entry = this.lookup(heroId); if (!entry) return a4RuntimeError('HERO_NOT_FOUND', 'Complete A4 Hero not found', { heroId });
    return this._localRecompile(heroId, { regionIds: [entry.backgroundRegionId], operation: options.operation || null }, options.patch || {});
  }
  recompileOperation(heroId, operation, { regionId = null, component = null, patch = {} } = {}) {
    return this._localRecompile(heroId, { regionIds: regionId ? [regionId] : null, component, operation }, patch);
  }
  adjustRegion(heroId, regionId, { opacity, palette, edgeSoftness, operation = null } = {}) {
    const patch = {};
    if (opacity !== undefined) patch.opacity = structuredClone(opacity);
    if (palette !== undefined) patch.palette = structuredClone(palette);
    if (edgeSoftness !== undefined) patch.edgeSoftness = edgeSoftness;
    return this._localRecompile(heroId, { regionIds: [regionId], operation }, patch);
  }
  visualChecks(heroId) {
    const entry = this.lookup(heroId); if (!entry) return a4RuntimeError('HERO_NOT_FOUND', 'Complete A4 Hero not found', { heroId });
    const state = a4RecipeState(this.adapter.page()), recipes = entry.recipeIds.map(id => state.recipes[id]?.recipe).filter(Boolean);
    return runA4HeroVisualChecks({ structure: this.adapter.hero(), plan: entry.plan, recipes, layer: this.adapter.layer(entry.layerId) });
  }
  replayHash(heroId) {
    const entry = this.lookup(heroId);
    return entry ? a4RuntimeHash(a4RuntimeStable({ entry, hero: this.adapter.hero(), recipes: this.adapter.page().floraRecipeState, objects: entry.strokeIds.map(id => this.adapter.findObject(id)?.object).filter(Boolean) })) : null;
  }
}
