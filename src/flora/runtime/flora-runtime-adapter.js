import { Matrix, deepClone } from '../../core/index.js';
import { defaultLayer } from '../../document/model.js';
import { compileRegionStrokes } from '../painting/region-stroke-compiler.js';
import { recipeStrokeToCreateStrokeAction } from '../recipe/painting-recipe-compiler.js';

const floraHashString = text => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
};
const floraStable = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.keys(item).sort().reduce((out, name) => (out[name] = item[name], out), {})
  : item);

export class FloraRuntimeAdapter {
  constructor(app, { heroRuntime = null, maskCache = null } = {}) {
    this.app = app;
    this.heroRuntime = heroRuntime;
    this.maskCache = maskCache || heroRuntime?.cache || null;
    this.actionObjectMap = new Map();
  }
  page() { return this.app.page(); }
  hero() { return this.page().floraHero || null; }
  layerExists(id) { return this.page().layers.some(layer => layer.id === id); }
  objectExists(id) { return this.page().layers.some(layer => layer.objects.some(object => object.id === id)); }
  brushPreset(id) { return this.app.brushPresetCatalog?.[id] || this.app.toolSettings?.[id] || null; }
  brushPresetExists(id) { return Boolean(this.brushPreset(id)); }
  layer(id) { return this.page().layers.find(layer => layer.id === id); }
  region(id) { return this.hero()?.regions?.find(region => region.regionId === id) || null; }
  mask(id) { return this.hero()?.masks?.find(mask => mask.regionId === id || mask.maskId === id) || null; }
  regionExists(id) { return Boolean(this.region(id)); }
  maskExists(id) { return Boolean(this.mask(id)); }
  findObject(id) {
    for (const layer of this.page().layers) {
      const index = layer.objects.findIndex(object => object.id === id);
      if (index >= 0) return { layer, index, object: layer.objects[index] };
    }
    return null;
  }
  deterministicId(prefix, action) { return `${prefix}-${floraHashString(`${action.actionId}:${action.seed}`)}`; }
  insertRegionObjects(layer, objects, regionId, explicitZ = null) {
    const regionZ = Number.isFinite(explicitZ) ? explicitZ : (this.region(regionId)?.z ?? 0);
    const insertAt = layer.objects.findIndex(object => {
      if (!object.floraPaint) return false;
      const objectZ = Number.isFinite(object.floraPaint.regionZ)
        ? object.floraPaint.regionZ
        : (this.region(object.floraPaint.regionId)?.z ?? 0);
      return objectZ > regionZ;
    });
    if (insertAt < 0) layer.objects.push(...objects); else layer.objects.splice(insertAt, 0, ...objects);
  }
  actionTargets(action) {
    const payload = action.payload || {}, page = this.page();
    if (action.type === 'createLayer') return [[...this.app.pagePath(page), 'layers']];
    if (['createStroke', 'paintRegion'].includes(action.type)) return [this.app.layerObjectsPath(this.layer(payload.layerId))];
    if (action.type === 'clearRegion') {
      const layers = payload.layerId ? [this.layer(payload.layerId)] : page.layers;
      return layers.filter(Boolean).map(layer => this.app.layerObjectsPath(layer));
    }
    if (['setLayerVisibility', 'setLayerOpacity'].includes(action.type)) return [this.app.layerPath(this.layer(action.targetId))];
    if (action.type === 'deleteObject') {
      const found = this.findObject(action.targetId);
      return found ? [this.app.layerObjectsPath(found.layer)] : [];
    }
    if (['setMaskFeather', 'setMaskVisibility', 'invalidateMaskCache'].includes(action.type)) {
      const mask = this.mask(payload.regionId), index = this.hero()?.masks?.indexOf(mask);
      return index >= 0 ? [[...this.app.pagePath(page), 'floraHero', 'masks', index]] : [];
    }
    return [];
  }
  execute(action, { history = true, render = true } = {}) {
    const payload = action.payload, label = `AI · ${action.metadata.label}`;
    let createdId = null, createdIds = [], affectedIds = [], compilerHash = null, rasterCacheKey = null, generatedActions = [];
    const apply = (targets, operation) => history ? this.app.history.pushScoped(label, targets, operation) : operation();

    if (action.type === 'createLayer') {
      const page = this.page(), path = [...this.app.pagePath(page), 'layers'];
      apply([path], () => {
        const layer = defaultLayer(payload.name.trim());
        layer.id = payload.layerId || this.deterministicId('flora-layer', action);
        layer.flora = { actionId: action.actionId, seed: action.seed };
        page.layers.push(layer);
        page.activeLayerId = layer.id;
        createdId = layer.id;
      });
    } else if (action.type === 'createStroke') {
      const layer = this.layer(payload.layerId), path = this.app.layerObjectsPath(layer), preset = deepClone(this.brushPreset(payload.brushPreset));
      apply([path], () => {
        const first = payload.points[0], object = {
          id: payload.objectId || this.deterministicId('flora-stroke', action), type: 'stroke', name: action.metadata.label,
          matrix: Matrix.translate(first.x, first.y), opacity: payload.opacity ?? preset.opacity ?? 1, color: payload.color, blendMode: payload.blendMode || 'source-over',
          size: payload.size ?? preset.size, kind: preset.kind, smoothing: payload.smoothing ?? preset.smoothing ?? .5,
          pressure: payload.pressure ?? preset.pressure ?? 1, taper: payload.taper ?? preset.taper ?? 0,
          grain: payload.grain ?? preset.grain ?? 0, softness: payload.softness ?? preset.softness ?? .7,
          flow: payload.flow ?? preset.flow ?? 1, wetness: payload.wetness ?? preset.wetness ?? 0, bristle: payload.bristle ?? preset.bristle ?? 0,
          mediaModel: ['brush', 'drybrush', 'airbrush'].includes(preset.kind) ? 'natural-v2' : undefined,
          flora: { actionId: action.actionId, seed: action.seed },
          ...(payload.regionId ? { floraPaint: {
            schemaVersion: '0.2', actionId: action.actionId, seed: action.seed, index: 0,
            regionId: payload.regionId, regionZ: payload.regionZ ?? this.region(payload.regionId)?.z ?? 0,
            maskId: payload.maskId || this.mask(payload.regionId)?.maskId,
            maskRevision: payload.maskRevision ?? this.mask(payload.regionId)?.cacheRevision ?? 0,
            operation: payload.operation, direction: payload.direction, compilerVersion: '0.2-action',
            recipeId: payload.recipeId || action.metadata?.recipeId || null,
            recipeOperation: payload.recipeOperation || payload.operation,
            recipePass: payload.recipePass ?? action.metadata?.recipePass ?? null,
            paletteIndex: payload.paletteIndex ?? null, constraints: structuredClone(payload.constraints || {}),
            ...(payload.refinement ? { refinement: structuredClone(payload.refinement) } : {})
          }} : {}),
          points: payload.points.map((point, index) => ({
            x: point.x - first.x, y: point.y - first.y, p: point.p,
            tiltX: point.tiltX ?? 0, tiltY: point.tiltY ?? 0, t: point.t ?? index * 16, mode: payload.refinement?.regionInteriorSmoothing > .5 ? 'smooth' : 'corner'
          }))
        };
        if (payload.regionId) this.insertRegionObjects(layer, [object], payload.regionId, payload.regionZ);
        else layer.objects.push(object);
        createdId = object.id;
      });
    } else if (action.type === 'setLayerVisibility') {
      const layer = this.layer(action.targetId);
      apply([this.app.layerPath(layer)], () => { layer.visible = payload.visible; affectedIds = [layer.id]; });
    } else if (action.type === 'setLayerOpacity') {
      const layer = this.layer(action.targetId);
      apply([this.app.layerPath(layer)], () => { layer.opacity = payload.opacity; affectedIds = [layer.id]; });
    } else if (action.type === 'deleteObject') {
      const found = this.findObject(action.targetId);
      apply([this.app.layerObjectsPath(found.layer)], () => { found.layer.objects.splice(found.index, 1); affectedIds = [action.targetId]; });
    } else if (action.type === 'paintRegion') {
      const layer = this.layer(payload.layerId), region = this.region(payload.regionId), mask = this.mask(payload.regionId), preset = deepClone(this.brushPreset(payload.brushPreset));
      const raster = this.maskCache?.getOrCreate(mask, 128, 181);
      rasterCacheKey = mask.cacheKey;
      const compiled = compileRegionStrokes({ action, region, mask, page: this.page(), brushPreset: preset, rasterMask: raster });
      compilerHash = compiled.compilerHash;
      generatedActions = compiled.strokes.map((stroke, index) => recipeStrokeToCreateStrokeAction(stroke, action, layer.id, index));
      apply([this.app.layerObjectsPath(layer)], () => {
        this.insertRegionObjects(layer, compiled.strokes, region.regionId, region.z);
        createdIds = compiled.strokes.map(stroke => stroke.id);
        createdId = createdIds[0] || null;
      });
    } else if (action.type === 'clearRegion') {
      const layers = payload.layerId ? [this.layer(payload.layerId)] : this.page().layers;
      const targets = layers.filter(Boolean).map(layer => this.app.layerObjectsPath(layer));
      apply(targets, () => {
        for (const layer of layers.filter(Boolean)) {
          const removed = layer.objects.filter(object => object.floraPaint?.regionId === payload.regionId).map(object => object.id);
          layer.objects = layer.objects.filter(object => object.floraPaint?.regionId !== payload.regionId);
          affectedIds.push(...removed);
        }
      });
    } else if (action.type === 'setMaskFeather') {
      const mask = this.mask(payload.regionId), index = this.hero().masks.indexOf(mask), path = [...this.app.pagePath(), 'floraHero', 'masks', index];
      apply([path], () => {
        mask.feather = payload.feather; mask.cacheKey = null; mask.cacheRevision = (mask.cacheRevision || 0) + 1; affectedIds = [mask.maskId];
      });
      this.maskCache?.invalidate(mask.maskId);
    } else if (action.type === 'setMaskVisibility') {
      const mask = this.mask(payload.regionId), index = this.hero().masks.indexOf(mask), path = [...this.app.pagePath(), 'floraHero', 'masks', index];
      apply([path], () => { mask.visible = payload.visible; affectedIds = [mask.maskId]; });
    } else if (action.type === 'invalidateMaskCache') {
      const mask = this.mask(payload.regionId), index = this.hero().masks.indexOf(mask), path = [...this.app.pagePath(), 'floraHero', 'masks', index];
      apply([path], () => { mask.cacheKey = null; mask.cacheRevision = (mask.cacheRevision || 0) + 1; affectedIds = [mask.maskId]; });
      this.maskCache?.invalidate(mask.maskId);
    }

    if (createdId) this.actionObjectMap.set(action.actionId, createdIds.length > 1 ? [...createdIds] : createdId);
    for (const generated of generatedActions) this.actionObjectMap.set(generated.actionId, generated.payload.objectId);
    this.app.spatialDirty = true;
    if (render) {
      this.app.renderer?.naturalMedia?.clearCaches?.();
      this.app.renderer?.invalidateTiles?.();
      this.app.refreshAll?.();
      this.app.renderer?.render?.();
    }
    return {
      ok: true, actionId: action.actionId, type: action.type, createdId,
      ...(createdIds.length ? { createdIds, createdCount: createdIds.length } : {}),
      ...(affectedIds.length ? { affectedIds } : {}),
      ...(compilerHash ? { compilerHash } : {}),
      ...(rasterCacheKey ? { rasterCacheKey } : {}),
      ...(generatedActions.length ? { generatedActions } : {}),
      documentHash: this.documentHash()
    };
  }
  documentHash() { return floraHashString(floraStable(this.app.doc)); }
  replayHash() {
    const payload = this.app.doc.pages.map(page => ({
      floraHero: page.floraHero || null,
      floraRecipeState: page.floraRecipeState || null,
      floraCrownState: page.floraCrownState || null,
      floraHeroPaintingState: page.floraHeroPaintingState || null,
      layers: page.layers.filter(layer => layer.flora || layer.objects.some(object => object.flora || object.floraPaint)).map(layer => ({
        id: layer.id, name: layer.name, visible: layer.visible, opacity: layer.opacity, flora: layer.flora,
        objects: layer.objects.filter(object => object.flora || object.floraPaint)
      }))
    }));
    return floraHashString(floraStable(payload));
  }
  serializeDocument() { return JSON.stringify(this.app.doc, null, 2); }
  reloadDocument(json) {
    this.maskCache?.clear();
    this.app.replaceDocument(JSON.parse(json));
    return this.documentHash();
  }
}
