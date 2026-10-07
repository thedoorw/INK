import { FORMAT_VERSION, INK_VERSION } from '../config.js';
import { Matrix, deepClone, nowISO, uid } from '../core/index.js';
import { createArtboard } from './artboard.js';
import { createWorkspace } from './workspace.js';
import { normalizeSemantic } from '../semantic/semantic-model.js';
import { createFrame } from './hierarchy.js';
import { normalizeObjectLayout } from './layout.js';
import { normalizeExpressiveStroke } from '../vector/stroke-appearance.js';
import { normalizePathMaterialAppearance } from '../vector/paint-appearance.js';
import { getColorModeDescriptor, inspectIccProfile, parseIccProfile, validateBitDepth } from '../image/color-management-core.js';
import { normalizeSnapSettings } from '../editor/precision-layout.js';

export function normalizeDocumentColorState(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  let bitDepth = 8;
  try { bitDepth = validateBitDepth(source.bitDepth ?? 8); } catch {}
  let colorMode = ['RGB','CMYK','Lab','Multichannel'].includes(source.colorMode) ? source.colorMode : 'RGB';
  let channelNames = Array.isArray(source.channelNames) ? source.channelNames.map(String) : null;
  if (colorMode === 'Multichannel' && !channelNames?.length) {
    channelNames = Array.isArray(source.channelLayout?.process)
      ? source.channelLayout.process.map(channel => String(channel?.name || '')).filter(Boolean)
      : ['Channel 1'];
  }
  let descriptor;
  try { descriptor = getColorModeDescriptor(colorMode, colorMode === 'Multichannel' ? channelNames.length : null, channelNames); }
  catch {
    colorMode = 'RGB';
    descriptor = getColorModeDescriptor('RGB');
  }
  const bytesSource = source.icc?.bytes ?? source.iccBytes ?? null;
  const bytes = bytesSource == null ? null : Array.from(bytesSource, value => Math.max(0, Math.min(255, Math.trunc(Number(value) || 0))));
  let inspection = source.icc?.inspection && typeof source.icc.inspection === 'object' ? deepClone(source.icc.inspection) : null;
  let iccStatus = bytes?.length ? 'preserved-unverified' : 'none';
  if (bytes?.length) {
    try {
      inspection = inspectIccProfile(parseIccProfile(Uint8Array.from(bytes)));
      iccStatus = 'verified';
    } catch {
      iccStatus = 'preserved-unsupported-or-invalid';
    }
  }
  const channelLayout = source.channelLayout && typeof source.channelLayout === 'object'
    ? deepClone(source.channelLayout)
    : {
        type: 'channel-layout',
        bitDepth,
        colorMode,
        process: descriptor.channels.map((name, index) => ({ index, id: `process:${index}:${name}`, name, kind: 'process' })),
        auxiliary: []
      };
  return {
    bitDepth,
    colorMode,
    channelCount: descriptor.channelCount,
    channelNames: [...descriptor.channels],
    icc: { bytes, inspection, status: iccStatus },
    channelLayout
  };
}

export function documentColorStateFromPayload(payload = {}) {
  return normalizeDocumentColorState({
    bitDepth: payload.bitDepth,
    colorMode: payload.colorMode,
    channelNames: payload.channelNames,
    channelLayout: payload.channelLayout,
    icc: {
      bytes: payload.icc?.bytes ? Array.from(payload.icc.bytes) : null,
      inspection: payload.icc?.inspection || null
    }
  });
}

export const DEFAULT_RECENT = [
  '#202020', '#ffffff', '#b63c36', '#d18b2f',
  '#d7c64b', '#3d875d', '#2f718f', '#594f9a'
];

export function defaultLayer(name = '圖層 1') {
  return { id: uid(), name, visible: true, locked: false, opacity: 1, objects: [] };
}

export function defaultPage(index = 1) {
  const layer = defaultLayer();
  const workspace = createWorkspace({ activeSpace: 'creation' });
  return {
    id: uid(),
    name: `頁面 ${index}`,
    artboard: createArtboard(),
    workspace,
    paper: { type: 'blank', color: '#fffef9', gridSize: 32, absorbency: .58, roughness: .42, fiberStrength: .36, fiberAngle: 0, sizing: .28, granulation: .32, seed: 1337, textureVisible: true },
    camera: workspace.cameras.creation,
    guides: [],
    snap: normalizeSnapSettings(),
    layers: [layer],
    activeLayerId: layer.id
  };
}

export function defaultDocument() {
  const page = defaultPage(1);
  return {
    format: 'INK',
    formatVersion: FORMAT_VERSION,
    appVersion: INK_VERSION,
    id: uid(),
    title: '未命名作品',
    createdAt: nowISO(),
    modifiedAt: nowISO(),
    colorState: normalizeDocumentColorState(),
    activePageId: page.id,
    pages: [page],
    programAssets: [],
    referencePackages: [],
    strokeSessions: [],
    brushPackages: [],
    vectorBrushLibrary: { format: 'INK-VECTOR-BRUSH-LIBRARY', version: '1.0', materials: [] },
    handDrawingReports: [],
    deviceCalibrationProfiles: [],
    deviceValidationReports: [],
    interactivePerformanceReports: [],
    ai: {
      permission: 'PROPOSE', selection: [], semanticTargets: [], unresolvedTargets: [],
      checkpoints: [], recipes: [], audit: [], variants: [], missingDependencies: []
    },
    semanticModel: { format: 'INK-SEMANTIC-MODEL', version: '1.0', migrationStrategy: 'NATIVE', relationshipGraph: { format: 'INK-SEMANTIC-RELATIONSHIP-GRAPH', version: '1.0', nodes: [], edges: [] } },
    materialLibrary: { format: 'INK-MATERIAL-LIBRARY', version: '1.0', templates: [] },
    dependencyModel: { format: 'INK-DOCUMENT-DEPENDENCY-MODEL', version: '1.0', edges: [] },
    assetManifest: { format: 'INK-DOCUMENT-ASSET-MANIFEST', version: '1.0', mode: 'Linked Document', assets: [] },
    deviceReplayProfileSelection: 'ORIGINAL_OR_CURRENT_SELECTABLE',
    drawingGapRanking: null,
    recentColors: [...DEFAULT_RECENT]
  };
}

export function activePage(document) {
  return document.pages.find(page => page.id === document.activePageId) || document.pages[0];
}

export function activeLayer(document) {
  const page = activePage(document);
  return page.layers.find(layer => layer.id === page.activeLayerId) || page.layers[0];
}

export function allObjects(page) {
  return page.layers.flatMap(layer => layer.objects.map(object => ({ layer, object })));
}

export { createFrame };

export function createStructuralNormalizationState() {
  return { seenObjects: new WeakSet(), activeObjects: new WeakSet(), objectIds: new Set() };
}

export function normalizeObject(object, { parentId = null, structuralState = null, structural = true } = {}) {
  if (!object || typeof object !== 'object') return object;
  const state = structuralState || createStructuralNormalizationState();
  if (structural) {
    if (state.activeObjects.has(object)) {
      throw Object.assign(new Error('INK_HIERARCHY_CYCLE'), { code: 'HIERARCHY_CYCLE', objectId: object.id || null });
    }
    if (state.seenObjects.has(object)) {
      throw Object.assign(new Error('INK_HIERARCHY_DUPLICATE_OWNERSHIP'), { code: 'HIERARCHY_DUPLICATE_OWNERSHIP', objectId: object.id || null });
    }
    state.seenObjects.add(object);
    state.activeObjects.add(object);
  }
  object.id = object.id || uid();
  if (structural) {
    if (state.objectIds.has(object.id)) {
      throw Object.assign(new Error(`INK_HIERARCHY_DUPLICATE_ID:${object.id}`), { code: 'HIERARCHY_DUPLICATE_ID', objectId: object.id });
    }
    state.objectIds.add(object.id);
  }
  if (parentId) object.parentId = parentId;
  else delete object.parentId;
  object.matrix = Array.isArray(object.matrix) && object.matrix.length === 6
    ? object.matrix
    : Matrix.identity();
  if (!Number.isFinite(+object.opacity)) object.opacity = 1;
  object.opacity = Math.max(0, Math.min(1, +object.opacity));
  if (object.type === 'path') {
    if (object.expressiveStroke == null) delete object.expressiveStroke;
    else object.expressiveStroke = normalizeExpressiveStroke(object.expressiveStroke, { color: object.stroke, width: object.strokeWidth });
    if (object.materialAppearance == null) delete object.materialAppearance;
    else object.materialAppearance = normalizePathMaterialAppearance(object.materialAppearance, { fill: object.fill, stroke: object.stroke });
  }
  if (object.type === 'stroke') {
    object.points = Array.isArray(object.points) ? object.points.map(point => ({
      x: Number.isFinite(+point.x) ? +point.x : 0,
      y: Number.isFinite(+point.y) ? +point.y : 0,
      p: Number.isFinite(+point.p) ? +point.p : .5,
      tiltX: Number.isFinite(+point.tiltX) ? +point.tiltX : 0,
      tiltY: Number.isFinite(+point.tiltY) ? +point.tiltY : 0,
      t: Number.isFinite(+point.t) ? +point.t : 0,
      mode: ['corner', 'smooth', 'symmetric'].includes(point.mode) ? point.mode : 'corner',
      ...(point.in && Number.isFinite(+point.in.x) && Number.isFinite(+point.in.y) ? { in: { x: +point.in.x, y: +point.in.y } } : {}),
      ...(point.out && Number.isFinite(+point.out.x) && Number.isFinite(+point.out.y) ? { out: { x: +point.out.x, y: +point.out.y } } : {})
    })) : [];
    const segmentCount = Math.max(0, object.points.length - 1);
    if (Array.isArray(object.segmentStyles)) {
      object.segmentStyles = Array.from({ length: segmentCount }, (_, index) => {
        const style = object.segmentStyles[index] || {};
        const normalized = {};
        if (typeof style.color === 'string') normalized.color = style.color;
        if (Number.isFinite(+style.size)) normalized.size = Math.max(.5, +style.size);
        if (Number.isFinite(+style.opacity)) normalized.opacity = Math.max(0, Math.min(1, +style.opacity));
        return normalized;
      });
      if (!object.segmentStyles.some(style => Object.keys(style).length)) delete object.segmentStyles;
    }
  }
  if (object.type === 'group') {
    object.visible = object.visible !== false;
    object.locked = Boolean(object.locked);
    object.children = Array.isArray(object.children) ? object.children : [];
    object.children.forEach(child => normalizeObject(child, { parentId: object.id, structuralState: state }));
  }
  if (object.type === 'frame') {
    object.name = String(object.name || 'Frame');
    object.width = Number.isFinite(+object.width) && +object.width > 0 ? +object.width : 320;
    object.height = Number.isFinite(+object.height) && +object.height > 0 ? +object.height : 240;
    object.visible = object.visible !== false;
    object.locked = Boolean(object.locked);
    object.children = Array.isArray(object.children) ? object.children : [];
    object.children.forEach(child => normalizeObject(child, { parentId: object.id, structuralState: state }));
  }
  if (object.type === 'repeat') {
    if (object.source && typeof object.source === 'object') normalizeObject(object.source, { structuralState: createStructuralNormalizationState() });
    object.instances = Array.isArray(object.instances) ? object.instances.filter(instance => instance && instance.instanceId).map(instance => ({ ...instance, generatorId: object.id })) : [];
  }
  if (object.materialInstance && typeof object.materialInstance === 'object') {
    object.materialInstance.instanceId = object.id;
    object.materialInstance.detached = false;
    object.materialInstance.parameterOverrides = object.materialInstance.parameterOverrides && typeof object.materialInstance.parameterOverrides === 'object' ? object.materialInstance.parameterOverrides : {};
    object.materialInstance.localOverrideState = object.materialInstance.localOverrideState && typeof object.materialInstance.localOverrideState === 'object' ? object.materialInstance.localOverrideState : { parameters: [], geometryDetached: false, styleDetached: false };
  }
  normalizeSemantic(object);
  normalizeObjectLayout(object);
  if (structural) state.activeObjects.delete(object);
  return object;
}
