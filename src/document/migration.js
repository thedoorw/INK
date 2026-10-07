import { FORMAT_VERSION, INK_VERSION } from '../config.js';
import { clamp, deepClone, uid } from '../core/index.js';
import { DEFAULT_RECENT, createStructuralNormalizationState, defaultLayer, normalizeDocumentColorState, normalizeObject } from './model.js';
import { normalizeArtboard } from './artboard.js';
import { normalizeWorkspace } from './workspace.js';
import { migrateStrokeSession } from '../paint/stroke-session.js';
import { createBrushPackage } from '../paint/brush-engine.js';
import { migrateSemanticDocument } from '../semantic/semantic-migration.js';
import { migrateDocumentAssetManifest } from '../assets/asset-migration.js';
import { normalizeRulerGuide, normalizeSnapSettings } from '../editor/precision-layout.js';

export function migrateDocument(raw) {
  if (!raw || raw.format !== 'INK' || !Array.isArray(raw.pages)) {
    throw new Error('不是有效的 INK 專案檔');
  }
  const sourceVersion = Number(raw.formatVersion || 1);
  if (sourceVersion > FORMAT_VERSION) {
    throw new Error(`此專案格式版本 ${sourceVersion} 高於目前支援的 ${FORMAT_VERSION}`);
  }
  const document = deepClone(raw);
  const structuralState = createStructuralNormalizationState();
  document.formatVersion = FORMAT_VERSION;
  document.appVersion = INK_VERSION;
  document.colorState = normalizeDocumentColorState(document.colorState || {});
  document.programAssets = Array.isArray(document.programAssets)
    ? document.programAssets.filter(asset => asset && typeof asset === 'object' && asset.id).map(asset => deepClone(asset))
    : [];
  document.referencePackages = Array.isArray(document.referencePackages)
    ? document.referencePackages.filter(item => item && typeof item === 'object' && item.assetId).map(item => deepClone(item))
    : [];
  document.strokeSessions = Array.isArray(document.strokeSessions)
    ? document.strokeSessions.map(session => migrateStrokeSession(session))
    : [];
  document.brushPackages = Array.isArray(document.brushPackages)
    ? document.brushPackages.filter(item => item && typeof item === 'object').map(item => item.format === 'INK-BRUSH-PACKAGE' ? deepClone(item) : createBrushPackage(item))
    : [];
  document.vectorBrushLibrary = document.vectorBrushLibrary && typeof document.vectorBrushLibrary === 'object'
    ? deepClone(document.vectorBrushLibrary)
    : { format: 'INK-VECTOR-BRUSH-LIBRARY', version: '1.0', materials: [] };
  document.vectorBrushLibrary.format = 'INK-VECTOR-BRUSH-LIBRARY';
  document.vectorBrushLibrary.version = '1.0';
  document.vectorBrushLibrary.materials = Array.isArray(document.vectorBrushLibrary.materials) ? document.vectorBrushLibrary.materials.filter(item => item && item.brushId).map(deepClone) : [];
  document.handDrawingReports = Array.isArray(document.handDrawingReports)
    ? document.handDrawingReports.filter(item => item && typeof item === 'object').map(deepClone)
    : [];
  document.deviceCalibrationProfiles = Array.isArray(document.deviceCalibrationProfiles)
    ? document.deviceCalibrationProfiles.filter(item => item && typeof item === 'object' && item.id).map(deepClone) : [];
  document.deviceValidationReports = Array.isArray(document.deviceValidationReports)
    ? document.deviceValidationReports.filter(item => item && typeof item === 'object').map(deepClone) : [];
  document.interactivePerformanceReports = Array.isArray(document.interactivePerformanceReports)
    ? document.interactivePerformanceReports.filter(item => item && typeof item === 'object').map(deepClone) : [];
  document.deviceReplayProfileSelection = ['ORIGINAL_PROFILE','CURRENT_PROFILE','ORIGINAL_OR_CURRENT_SELECTABLE'].includes(document.deviceReplayProfileSelection)
    ? document.deviceReplayProfileSelection : 'ORIGINAL_OR_CURRENT_SELECTABLE';
  document.drawingGapRanking = document.drawingGapRanking && typeof document.drawingGapRanking === 'object'
    ? deepClone(document.drawingGapRanking) : null;
  document.materialLibrary = document.materialLibrary && typeof document.materialLibrary === 'object'
    ? deepClone(document.materialLibrary)
    : { format: 'INK-MATERIAL-LIBRARY', version: '1.0', templates: [] };
  document.materialLibrary.format = 'INK-MATERIAL-LIBRARY';
  document.materialLibrary.version = '1.0';
  document.materialLibrary.templates = Array.isArray(document.materialLibrary.templates) ? document.materialLibrary.templates.filter(template => template && template.templateId).map(deepClone) : [];
  document.dependencyModel = document.dependencyModel && typeof document.dependencyModel === 'object'
    ? deepClone(document.dependencyModel)
    : { format: 'INK-DOCUMENT-DEPENDENCY-MODEL', version: '1.0', edges: [] };
  document.dependencyModel.format = 'INK-DOCUMENT-DEPENDENCY-MODEL';
  document.dependencyModel.version = '1.0';
  document.dependencyModel.edges = Array.isArray(document.dependencyModel.edges) ? document.dependencyModel.edges.filter(edge => edge && edge.from && edge.to && edge.type).map(deepClone) : [];
  document.ai = document.ai && typeof document.ai === 'object' ? deepClone(document.ai) : {};
  document.ai.permission = ['OBSERVE','PROPOSE','PREVIEW','EXECUTE'].includes(document.ai.permission) ? document.ai.permission : 'PROPOSE';
  for (const key of ['selection','semanticTargets','unresolvedTargets','checkpoints','recipes','audit','variants','missingDependencies']) {
    document.ai[key] = Array.isArray(document.ai[key]) ? document.ai[key] : [];
  }
  document.recentColors = Array.isArray(document.recentColors)
    ? document.recentColors.slice(0, 16)
    : [...DEFAULT_RECENT];
  document.pages.forEach((page, pageIndex) => {
    page.id = page.id || uid();
    page.name = page.name || `頁面 ${pageIndex + 1}`;
    const legacyArtboardMode = page.artboard?.mode || (!page.artboard ? 'infinite' : 'fixed');
    page.artboard = normalizeArtboard({ ...(page.artboard || {}), mode: 'fixed' });
    page.paper = {
      type: page.paper?.type || 'blank',
      color: page.paper?.color || '#fffef9',
      gridSize: clamp(+page.paper?.gridSize || 32, 8, 100),
      absorbency: clamp(Number.isFinite(+page.paper?.absorbency) ? +page.paper.absorbency : .58, 0, 1),
      roughness: clamp(Number.isFinite(+page.paper?.roughness) ? +page.paper.roughness : .42, 0, 1),
      fiberStrength: clamp(Number.isFinite(+page.paper?.fiberStrength) ? +page.paper.fiberStrength : .36, 0, 1),
      fiberAngle: Number.isFinite(+page.paper?.fiberAngle) ? +page.paper.fiberAngle : 0,
      sizing: clamp(Number.isFinite(+page.paper?.sizing) ? +page.paper.sizing : .28, 0, 1),
      granulation: clamp(Number.isFinite(+page.paper?.granulation) ? +page.paper.granulation : .32, 0, 1),
      seed: Number.isFinite(+page.paper?.seed) ? Math.trunc(+page.paper.seed) : 1337,
      textureVisible: page.paper?.textureVisible !== false
    };
    const migratedCamera = {
      x: +page.camera?.x || 0,
      y: +page.camera?.y || 0,
      scale: clamp(+page.camera?.scale || 1, .03, 24),
      rotation: +page.camera?.rotation || 0
    };
    page.workspace = normalizeWorkspace(page.workspace || {}, {
      legacyArtboardMode,
      activeCamera: migratedCamera,
      defaultSpace: 'creation'
    });
    page.camera = page.workspace.cameras[page.workspace.activeSpace];
    page.guides = (Array.isArray(page.guides) ? page.guides : []).map(guide => normalizeRulerGuide(guide));
    page.snap = normalizeSnapSettings(page.snap || {});
    page.layers = Array.isArray(page.layers) && page.layers.length
      ? page.layers
      : [defaultLayer()];
    page.layers.forEach((layer, layerIndex) => {
      layer.id = layer.id || uid();
      layer.name = layer.name || `圖層 ${layerIndex + 1}`;
      layer.visible = layer.visible !== false;
      layer.locked = !!layer.locked;
      layer.opacity = clamp(Number.isFinite(+layer.opacity) ? +layer.opacity : 1, 0, 1);
      layer.objects = Array.isArray(layer.objects) ? layer.objects : [];
      layer.objects.forEach(object => normalizeObject(object, { structuralState }));
    });
    page.activeLayerId = page.layers.some(layer => layer.id === page.activeLayerId)
      ? page.activeLayerId
      : page.layers[0].id;
  });
  document.activePageId = document.pages.some(page => page.id === document.activePageId)
    ? document.activePageId
    : document.pages[0].id;
  migrateSemanticDocument(document);
  migrateDocumentAssetManifest(document);
  return document;
}

export const sanitizeDocument = migrateDocument;
