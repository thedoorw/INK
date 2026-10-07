import { FloraRuntimeAdapter } from './runtime/flora-runtime-adapter.js';
import { FloraCommandDispatcher } from './action/flora-command-dispatcher.js';
import { HeroStructureRuntime } from './structure/hero-runtime.js';
import { RasterMaskCache } from './mask/vector-mask.js';
import { PaintingRecipeRuntime } from './recipe/painting-recipe-runtime.js';
import { CrownPaintingRuntime } from './crown/crown-painting-runtime.js';
import { CompleteHeroPaintingRuntime } from './hero/complete-hero-painting-runtime.js';
import { FLR012AdonisRuntime } from './species/flr012-adonis.js';
import { resolveReferenceMapping, validateReferenceIdentity } from './reference/reference-mapping.js';
import { measureHeroPaintedRetention, measureRegionPaintedRetention, diagnoseRegionPaintedStages, evaluatePaintedRetentionGates, PAINTED_RETENTION_THRESHOLDS } from './retention/painted-geometry-retention.js';

export function installFloraActionLayer(app) {
  const maskCache = new RasterMaskCache();
  const hero = new HeroStructureRuntime(app, maskCache);
  const adapter = new FloraRuntimeAdapter(app, { heroRuntime: hero, maskCache });
  const dispatcher = new FloraCommandDispatcher(adapter);
  const recipe = new PaintingRecipeRuntime(app, adapter, dispatcher, maskCache);
  const crown = new CrownPaintingRuntime(app, adapter, recipe, hero, maskCache);
  const completeHero = new CompleteHeroPaintingRuntime(app, adapter, recipe, crown, hero, maskCache);
  const flr012 = new FLR012AdonisRuntime(completeHero);
  return Object.freeze({
    schemaVersion: '0.5',
    visualRefinementVersion: '0.8B',
    botanicalGeometryVersion: '0.9A-R1a.1',
    paintedRetentionVersion: '0.9A-R1c.1',
    baseMassStrategy: 'non-periodic-full-body',
    dispatch: action => dispatcher.dispatch(action),
    dispatchMany: actions => dispatcher.dispatchMany(actions),
    documentHash: () => adapter.documentHash(),
    replayHash: () => adapter.replayHash(),
    serializeDocument: () => adapter.serializeDocument(),
    reloadDocument: json => adapter.reloadDocument(json),
    maskCacheDiagnostics: () => maskCache.diagnostics(),
    hero, recipe, crown, completeHero, retention: Object.freeze({ measure: measureHeroPaintedRetention, measureRegion: measureRegionPaintedRetention, diagnoseRegionStages: diagnoseRegionPaintedStages, evaluate: evaluatePaintedRetentionGates, thresholds: PAINTED_RETENTION_THRESHOLDS }), reference: Object.freeze({ resolve: resolveReferenceMapping, validateIdentity: validateReferenceIdentity }), species: Object.freeze({ flr012 }), adapter
  });
}
