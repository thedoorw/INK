importScripts('./build-identity.js');

const PRODUCT_VERSION = '0.1';
const WORKER_URL = new URL(self.location.href);
const QUERY_BUILD_ID = WORKER_URL.searchParams.get('build');
const BUILD_ID = QUERY_BUILD_ID || self.INK_BUILD_ID;
const PUBLISHED_REVISION = BUILD_ID?.startsWith('pages-') ? BUILD_ID.slice(6) : null;
if (!BUILD_ID) throw new Error('INK build identity unavailable');
const CACHE_PREFIX = 'ink-build-';
const SHELL_CACHE = `${CACHE_PREFIX}${BUILD_ID}-shell`;
const RUNTIME_CACHE = `${CACHE_PREFIX}${BUILD_ID}-runtime`;

// Portable/static closure for the authoritative modular runtime.
// Keep this inventory synchronized with product/source/src; INK-CLOUD-016
// adds a deterministic source/static harness that fails on drift.
const SOURCE_SHELL = Object.freeze([
  './src/ai/ai-core.js',
  './src/ai/chat-reference-handoff.js',
  './src/ai/chat-runtime.js',
  './src/ai/conversation-flower-contract.js',
  './src/ai/creative-intelligence-context.js',
  './src/ai/document-bridge.js',
  './src/ai/grounded-creative-decision.js',
  './src/ai/install-ai.js',
  './src/ai/intent/flower-vocabulary-v1.json',
  './src/ai/intent/intent-parser.js',
  './src/ai/intent/intent-schema.js',
  './src/ai/intent/intent-to-plan.js',
  './src/ai/intent/intent-validator.js',
  './src/ai/plan-analyzers.js',
  './src/assets/asset-error.js',
  './src/assets/asset-manifest.js',
  './src/assets/asset-migration.js',
  './src/assets/index.js',
  './src/compare/visual-compare.js',
  './src/composition/composition-constraints.js',
  './src/config.js',
  './src/core/geometry.js',
  './src/core/index.js',
  './src/core/math.js',
  './src/core/stable-id.js',
  './src/core/utils.js',
  './src/document/artboard.js',
  './src/document/components.js',
  './src/document/file-envelope.js',
  './src/document/hierarchy.js',
  './src/document/index.js',
  './src/document/integrity.js',
  './src/document/layout.js',
  './src/document/migration.js',
  './src/document/model.js',
  './src/document/revision.js',
  './src/document/storage.js',
  './src/document/workspace.js',
  './src/editor/bounds.js',
  './src/editor/chat-bounded-edit.js',
  './src/editor/chat-creative-plan.js',
  './src/editor/composition.js',
  './src/editor/creative-workspace.js',
  './src/editor/expressive-stroke.js',
  './src/editor/index.js',
  './src/editor/path-edit.js',
  './src/editor/repaint-material.js',
  './src/editor/selection.js',
  './src/editor/transform.js',
  './src/export/index.js',
  './src/export/pdf.js',
  './src/export/png-worker-encoder.js',
  './src/extraction/adapters.js',
  './src/extraction/core.js',
  './src/extraction/install.js',
  './src/extraction/structure.js',
  './src/extraction/workspace.js',
  './src/flora/action/flora-action-errors.js',
  './src/flora/action/flora-action-schema.js',
  './src/flora/action/flora-action-validator.js',
  './src/flora/action/flora-command-dispatcher.js',
  './src/flora/crown/crown-painting-compiler.js',
  './src/flora/crown/crown-painting-plan-schema.js',
  './src/flora/crown/crown-painting-plan-validator.js',
  './src/flora/crown/crown-painting-runtime.js',
  './src/flora/crown/crown-visual-checks.js',
  './src/flora/crown/petal-recipe-generation.js',
  './src/flora/hero/a4-hero-plan-schema.js',
  './src/flora/hero/a4-hero-plan-validator.js',
  './src/flora/hero/a4-hero-visual-checks.js',
  './src/flora/hero/complete-hero-painting-compiler.js',
  './src/flora/hero/complete-hero-painting-runtime.js',
  './src/flora/hero/complete-hero-recipe-generation.js',
  './src/flora/hero/complete-hero-structure.js',
  './src/flora/index.js',
  './src/flora/mask/vector-mask.js',
  './src/flora/painting/abstract-petal-benchmark.js',
  './src/flora/painting/complete-crown-benchmark.js',
  './src/flora/painting/region-paint-operations.js',
  './src/flora/painting/region-stroke-compiler.js',
  './src/flora/painting/three-petal-benchmark.js',
  './src/flora/recipe/painting-recipe-compiler.js',
  './src/flora/recipe/painting-recipe-runtime.js',
  './src/flora/recipe/painting-recipe-schema.js',
  './src/flora/recipe/painting-recipe-validator.js',
  './src/flora/recipe/refined-painting-parameters.js',
  './src/flora/reference/reference-mapping.js',
  './src/flora/retention/painted-geometry-retention.js',
  './src/flora/runtime/flora-runtime-adapter.js',
  './src/flora/species/flr012-adonis.js',
  './src/flora/structure/geometry-measurement-gates.js',
  './src/flora/structure/hero-geometry.js',
  './src/flora/structure/hero-profile.js',
  './src/flora/structure/hero-runtime.js',
  './src/history/diff.js',
  './src/history/history.js',
  './src/history/index.js',
  './src/image/image-core.js',
  './src/ink.js',
  './src/input/device-validation.js',
  './src/input/input-arbiter.js',
  './src/input/pen-calibration.js',
  './src/input/stylus-test.js',
  './src/material/flower-batch-01.js',
  './src/material/index.js',
  './src/material/material-library.js',
  './src/memory/creative-memory.js',
  './src/paint/brush-engine.js',
  './src/paint/drawing-quality.js',
  './src/paint/drawing-workflow-import.js',
  './src/paint/index.js',
  './src/paint/natural-media-state.js',
  './src/paint/paint-core.js',
  './src/paint/stroke-model.js',
  './src/paint/stroke-quality-tools.js',
  './src/paint/stroke-session.js',
  './src/paint/vector-watercolor.js',
  './src/program-import/canonical-operation.js',
  './src/program-import/comparison-engine.js',
  './src/program-import/compiler.js',
  './src/program-import/coverage-engine.js',
  './src/program-import/expression-ir.js',
  './src/program-import/format-detector.js',
  './src/program-import/importer.js',
  './src/program-import/index.js',
  './src/program-import/parsers.js',
  './src/program-import/reference-package.js',
  './src/program-import/reference-pipeline.js',
  './src/program-import/reference-runner.js',
  './src/program-import/security.js',
  './src/provenance/provenance-graph.js',
  './src/pwa/index.js',
  './src/pwa/update-manager.js',
  './src/recipe/recipe-asset.js',
  './src/recipe/recipe-engine.js',
  './src/recipe/recipe-io.js',
  './src/recipe/recipe-migration.js',
  './src/recipe/recipe-validator.js',
  './src/recompute/affected-scope.js',
  './src/recompute/change-domain.js',
  './src/recompute/dependency-graph.js',
  './src/recompute/local-recompute.js',
  './src/recompute/recompute-report.js',
  './src/recompute/recompute-validator.js',
  './src/release/external-diagnostics.js',
  './src/release/index.js',
  './src/release/runtime-health.js',
  './src/render/canvas2d/multi-channel-ink-canvas2d.js',
  './src/render/canvas2d/natural-media-canvas2d.js',
  './src/render/gpu-resource-budget.js',
  './src/render/index.js',
  './src/render/interactive-benchmark.js',
  './src/render/live-canvas-tile-renderer.js',
  './src/render/multi-channel-ink.js',
  './src/render/natural-media-controller.js',
  './src/render/natural-media-run-utils.js',
  './src/render/natural-media-utils.js',
  './src/render/paper-profile.js',
  './src/render/pixel-compare.js',
  './src/render/tile-atlas.js',
  './src/render/tiled-export.js',
  './src/render/webgl/multi-channel-ink-webgl.js',
  './src/render/webgl/natural-media-webgl.js',
  './src/repeat/repeat-identity.js',
  './src/research/research-creation-bridge.js',
  './src/semantic/relationship-graph.js',
  './src/semantic/semantic-migration.js',
  './src/semantic/semantic-model.js',
  './src/semantic/semantic-region-grounding.js',
  './src/semantic/semantic-resolver.js',
  './src/semantic/semantic-validator.js',
  './src/spatial/index.js',
  './src/spatial/page-spatial-index.js',
  './src/spatial/quadtree.js',
  './src/stroke/edit.js',
  './src/stroke/index.js',
  './src/structure/parametric-structure.js',
  './src/studio-core.js',
  './src/ui/legacy-ui-adapter.js',
  './src/vector/deformation.js',
  './src/vector/geometry-kernel.js',
  './src/vector/paint-appearance.js',
  './src/vector/stroke-appearance.js',
  './src/vector/svg-id-normalizer.js',
  './src/vector/vector-core.js',
  './src/vendor/bezier-js-6.1.4/bezier.js',
  './src/vendor/bezier-js-6.1.4/poly-bezier.js',
  './src/vendor/bezier-js-6.1.4/utils.js',
  './src/vendor/imagetracer-1.2.6.js',
  './src/vendor/polygon-clipping.umd.min.js'
]);

const APP_SHELL = Object.freeze([
  './',
  './index.html',
  './index-standalone.html',
  './stage-runtime.css',
  './ui/legacy-entry-loader.js',
  './ui/legacy-workstation.web.js',
  './ui/legacy-workstation.portable.js',
  './styles.css',
  './web-shell.js',
  './build-identity.js',
  './qa/runtime-test-bridge.js',
  './assets/INK_MARK_SOURCE_W-300.jpg',
  './assets/ink-mark.svg',
  './assets/favicon.svg',
  './dist/ink.compat.js',
  './manifest.webmanifest',
  './manifest-portable.webmanifest',
  './ui/branding-settings.js',
  './ui/capability-contributions.js',
  './ui/capability-raster-tools.js',
  './ui/full-capability-controls.js',
  ...SOURCE_SHELL
]);

self.addEventListener('install', event => {
  const takeover = self.skipWaiting();
  const precache = caches.open(SHELL_CACHE).then(cache => cache.addAll(
    APP_SHELL.map(path => new Request(path, { cache: 'reload' }))
  ));
  event.waitUntil(Promise.all([takeover, precache]));
});

function isOwnedInkCache(key) {
  return key.startsWith(CACHE_PREFIX) || key.startsWith('ink-v');
}

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => isOwnedInkCache(key) && ![SHELL_CACHE, RUNTIME_CACHE].includes(key)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  const message = event.data || {};
  if (message.type === 'INK_SKIP_WAITING') self.skipWaiting();
  if (message.type === 'INK_GET_VERSION') {
    const target = event.ports?.[0] || event.source;
    target?.postMessage?.({
      type: 'INK_VERSION',
      version: PRODUCT_VERSION,
      buildId: BUILD_ID,
      shellCache: SHELL_CACHE,
      runtimeCache: RUNTIME_CACHE,
      navigationStrategy: 'network-first',
      assetStrategy: 'network-first',
      publishedRevision: PUBLISHED_REVISION
    });
  }
  if (message.type === 'INK_CLEAR_RUNTIME_CACHE') event.waitUntil(caches.delete(RUNTIME_CACHE));
});

function freshRequest(request) {
  return new Request(request, { cache: 'no-store' });
}

async function buildConsistentNavigation(request) {
  try {
    const response = await fetch(freshRequest(request));
    if (response?.ok && response.type !== 'opaque') return response;
  } catch (_) {}
  const shell = await caches.open(SHELL_CACHE);
  const pathname = new URL(request.url).pathname;
  const entry = pathname.endsWith('/index-standalone.html') ? './index-standalone.html' : './index.html';
  return await shell.match(request, { ignoreSearch: true })
    || await shell.match(entry)
    || Response.error();
}

async function networkFirstAsset(request) {
  try {
    const response = await fetch(freshRequest(request));
    if (response?.ok && response.type !== 'opaque') {
      const runtime = await caches.open(RUNTIME_CACHE);
      await runtime.put(request, response.clone());
      return response;
    }
  } catch (_) {}
  const runtime = await caches.open(RUNTIME_CACHE);
  const shell = await caches.open(SHELL_CACHE);
  return await runtime.match(request)
    || await runtime.match(request, { ignoreSearch: true })
    || await shell.match(request)
    || await shell.match(request, { ignoreSearch: true })
    || Response.error();
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(buildConsistentNavigation(event.request));
    return;
  }
  event.respondWith(networkFirstAsset(event.request));
});
