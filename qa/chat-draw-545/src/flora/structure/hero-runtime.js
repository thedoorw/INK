import { normalizeHeroProfile } from './hero-profile.js';
import { buildHeroStructure } from './hero-geometry.js';
import { buildAbstractPetalBenchmarkStructure } from '../painting/abstract-petal-benchmark.js';
import { buildThreePetalBenchmarkStructure } from '../painting/three-petal-benchmark.js';
import { buildCompleteCrownBenchmarkStructure } from '../painting/complete-crown-benchmark.js';
import { createVectorMask, RasterMaskCache } from '../mask/vector-mask.js';

const stable = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.keys(item).sort().reduce((out, name) => (out[name] = item[name], out), {})
  : item);
const hash = text => {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) { value ^= text.charCodeAt(index); value = Math.imul(value, 16777619); }
  return (value >>> 0).toString(16).padStart(8, '0');
};

export class HeroStructureRuntime {
  constructor(app, cache = new RasterMaskCache()) {
    this.app = app;
    this.cache = cache;
    this.inspect = { structure: false, masks: false, ids: false, topology: false };
  }
  installStructure(structure, label = 'FLORA · 建立 Hero Structure', { history = true } = {}) {
    const page = this.app.page(), path = [...this.app.pagePath(page), 'floraHero'];
    const apply = () => { page.floraHero = structure; };
    if (history) this.app.history.pushScoped(label, [path], apply); else apply();
    this.cache.clear();
    this.app.renderer?.invalidateTiles?.();
    this.app.refreshAll?.(); this.app.renderer?.render?.();
    return { ok: true, profileId: structure.profile?.profileId, regionCount: structure.regions.length, replayHash: this.replayHash() };
  }
  create(input, options = {}) {
    const profile = normalizeHeroProfile(input), structure = buildHeroStructure(profile);
    structure.masks = structure.regions.map(region => createVectorMask(region, { feather: input.maskFeather ?? 0 }));
    return this.installStructure(structure, 'FLORA · 建立 Hero Structure', options);
  }
  createBenchmarkPetal(input = {}, options = {}) {
    const structure = buildAbstractPetalBenchmarkStructure(input);
    return this.installStructure(structure, 'FLORA · 建立抽象 Petal Benchmark', options);
  }
  createBenchmarkThreePetals(input = {}, options = {}) {
    const structure = buildThreePetalBenchmarkStructure(input);
    return this.installStructure(structure, 'FLORA · 建立三花瓣重疊 Benchmark', options);
  }
  createBenchmarkCompleteCrown(input = {}, options = {}) {
    const structure = buildCompleteCrownBenchmarkStructure(input);
    return this.installStructure(structure, 'FLORA · 建立完整 Single Crown Benchmark C1', options);
  }
  setInspect(key, value) {
    if (!(key in this.inspect)) throw new Error('unknown inspection flag');
    this.inspect[key] = Boolean(value);
    this.app.renderer?.invalidateTiles?.();
    this.app.renderer?.render?.();
    return { ...this.inspect };
  }
  setMaskVisibility(regionId, visible, { history = true } = {}) {
    const hero = this.app.page().floraHero, mask = hero?.masks?.find(item => item.regionId === regionId);
    if (!mask) throw new Error('mask not found');
    const path = [...this.app.pagePath(), 'floraHero', 'masks', hero.masks.indexOf(mask), 'visible'];
    const apply = () => { mask.visible = Boolean(visible); };
    if (history) this.app.history.pushScoped('FLORA · Mask visibility', [path], apply); else apply();
    this.app.renderer?.render?.();
    return { ok: true, regionId, visible: mask.visible };
  }
  setMaskFeather(regionId, feather, { history = true } = {}) {
    if (!Number.isFinite(feather) || feather < 0 || feather > .1) throw new Error('feather out of range');
    const hero = this.app.page().floraHero, mask = hero?.masks?.find(item => item.regionId === regionId);
    if (!mask) throw new Error('mask not found');
    const path = [...this.app.pagePath(), 'floraHero', 'masks', hero.masks.indexOf(mask)];
    const apply = () => { mask.feather = feather; mask.cacheKey = null; mask.cacheRevision = (mask.cacheRevision || 0) + 1; };
    if (history) this.app.history.pushScoped('FLORA · Mask feather', [path], apply); else apply();
    this.cache.invalidate(mask.maskId);
    this.app.renderer?.render?.();
    return { ok: true, regionId, feather };
  }
  replayHash() { return hash(stable(this.app.page().floraHero || null)); }
  serialize() { return JSON.stringify(this.app.doc, null, 2); }
}
