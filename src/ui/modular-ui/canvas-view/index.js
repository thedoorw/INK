export {
  CANVAS_EDGE_SIZE, normalizeViewContract, clampViewScale, normalizeCamera,
  normalizeLayoutViewport, nativeToScreen, screenToNative, effectiveViewScale,
  chooseRulerStep, buildRulerTicks, artboardWorldBounds, viewportNativeBounds,
  normalizeThumbnailPreview, navigatorSurfacePointToDisplay, navigatorArtworkPointToDisplay,
  navigatorModel, navigatorPointToNative, panDeltaToCenter,
  axisScrollbarModel, scrollbarThumbSize, horizontalScrollbarModel, verticalScrollbarModel,
  horizontalScrollbarPanDelta, verticalScrollbarPanDelta
} from './geometry.js';

export {
  workspaceGestureIdentity, viewStateKey, beginGuideGesture, updateGuideGesture,
  completeGuideGesture, consumeGuideDeleteKey, createPrimaryPointerTracker, createViewSyncLoop
} from './interactions.js';

export {
  createCanvasChromeModule,
  createCanvasViewportModule,
  createNavigatorModule,
  createStatusBandContribution,
  installStatusBandContribution,
  canvasViewDiagnostics
} from './modules.js';

export const CANVAS_VIEW_INSTALL_MANIFEST=Object.freeze({
  schema:'INK-UI-D-002-INSTALL',
  version:2,
  owner:'D',
  modules:Object.freeze([
    Object.freeze({factory:'createCanvasChromeModule',slot:'canvas.chrome',id:'canvas-view.chrome.v2'}),
    Object.freeze({factory:'createCanvasViewportModule',slot:'canvas.viewport',id:'canvas-view.viewport.v2'}),
    Object.freeze({factory:'createNavigatorModule',slot:'panels.group-a.navigator',id:'canvas-view.navigator.v3'})
  ]),
  contributions:Object.freeze([
    Object.freeze({factory:'installStatusBandContribution',target:'status',id:'canvas-view.status-band.v2',integrationOwner:'MR',cleanup:'REGISTERED_ON_A_CTX_EXACTLY_ONCE'})
  ]),
  commands:Object.freeze([
    'view.zoom.by.v1','view.zoom.set.v1','view.pan.v1','view.reset.v1',
    'view.fit.content.v1','view.fit.artboard.v1','workspace.activate.v1',
    'guide.add.v1','guide.move.v1','guide.remove.v1'
  ]),
  selectors:Object.freeze(['view.current','view.contract','workspace.current','page.active','page.preview']),
  sharedPatch:Object.freeze({
    stagedAt:'engineering/ui-002/D/shared-view-contract-guides-preview.patch',
    integrationOwner:'MR',
    affectedPaths:Object.freeze([
      'product/source/src/document/workspace.js',
      'product/source/src/editor/function-modules/native-service-ports.js',
      'product/source/src/editor/function-modules/providers.js',
      'product/source/src/ink.js'
    ]),
    purpose:'Centralize the existing 3%-2400% zoom bounds in document/workspace owner; expose read-only view.contract, page.guides and native renderer page.preview; make native zoomBy/wheel/pinch consume the shared clamp.'
  }),
  navigatorPreviewPatch:Object.freeze({
    stagedAt:'engineering/ui-002/D/navigator-preview-geometry.patch',
    integrationOwner:'MR',
    applyAfter:'engineering/ui-002/D/shared-view-contract-guides-preview.patch',
    affectedPaths:Object.freeze([
      'product/source/src/document/artboard.js',
      'product/source/src/editor/function-modules/native-service-ports.js',
      'product/source/src/ink.js'
    ]),
    purpose:'Expose the exact native thumbnail fit/bleed/padding geometry and Renderer layoutViewportMatrix used by Navigator preview so overlay/click coordinates share the same contract.'
  }),
  css:Object.freeze({path:'product/source/src/ui/modular-ui/canvas-view/styles.css',integrationOwner:'MR'}),
  guarantees:Object.freeze([
    'single-stage-lease',
    'no-raw-camera-write-from-ui',
    'native-view-command-authority',
    'native-guide-history-authority',
    'one-guide-command-per-guide-gesture',
    'guide-page-workspace-revalidation',
    'guide-keyboard-propagation-contained',
    'shared-zoom-contract-required',
    'native-renderer-navigator-preview',
    'navigator-preview-overlay-click-single-coordinate-contract',
    'horizontal-and-vertical-pan-proxies',
    'status-cleanup-registered-on-a-context-once'
  ])
});
