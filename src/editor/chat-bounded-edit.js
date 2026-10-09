import { Matrix } from '../core/index.js';
import { createFrame, findPageObject, reparentPageObject, walkPageObjects } from '../document/hierarchy.js';
import { setFrameLayout, setChildLayoutItem } from '../document/layout.js';
import { registerComponentDefinition, createComponentInstance, setComponentOverride, detachComponentInstance, duplicateComponentDefinition, repairComponentReference } from '../document/components.js';
import { PathEditController } from './path-edit.js';
import { cloneCompositionObject } from './composition.js';
import { applyWorldTransformBatch } from './transform.js';
import { createPathProjectiveDeformationPlan, createWarpDeformationPlan } from './transform-advanced.js';
import { resizeFrameGeometry } from './bounds.js';
import { createTextObject, updateTextObject } from './text-object.js';
import { pathGeometryFingerprint } from '../vector/stroke-appearance.js';
import { applyNonDestructiveDeformation, deformationReport } from '../vector/deformation.js';
import { booleanPaths, createAnchor, createPath, createRepeat, createVectorGroup, dividePaths, importSVGDocument } from '../vector/vector-core.js';
import { documentFingerprint } from '../document/integrity.js';
import { paperProfileFingerprint } from '../render/paper-profile.js';
import { eraseStrokeWithCircle } from '../stroke/edit.js';
import { BrushPresetRegistry, BUILTIN_BRUSH_PRESETS, StrokeSessionRecorder, replayStrokeSession } from '../paint/paint-core.js';
import { IMAGE_CAPABILITIES, LIQUIFY_OPERATIONS, burn, cloneStamp, colorRasterToRgba8, colorReplacementBrush, createAdjustment, createColorRaster, createFilter, createLayerEffect, createLiquifyFilter, deserializeColorRaster, dodge, healingBrush, localBlur, localSharpen, maskBounds, paintBucketFill, patchRaster, rasterizePathMask, serializeColorRaster, sponge, spotHealing } from '../image/image-core.js';
import { createMaterialInstance, createMaterialTemplate, getMaterialTemplate } from '../material/material-library.js';

export const CHAT_STATE_SUMMARY_SCHEMA = 'INK-CHAT-STATE-SUMMARY';
export const CHAT_STATE_SUMMARY_VERSION = 1;

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

export function stableChatStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function chatStateFingerprint(value) {
  const text = stableChatStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function fnvByte(hash, value) {
  hash ^= value & 0xff;
  return Math.imul(hash, 0x01000193);
}

function fnvText(hash, value) {
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) hash = fnvByte(hash, text.charCodeAt(index) & 0xff);
  return hash;
}

function fnvRasterSamples(hash, values, bitDepth) {
  if (!values) return fnvText(hash, 'null');
  hash = fnvText(hash, values.length);
  if (bitDepth === 8) {
    for (let index = 0; index < values.length; index += 1) hash = fnvByte(hash, Number(values[index]) || 0);
    return hash;
  }
  if (bitDepth === 16) {
    for (let index = 0; index < values.length; index += 1) {
      const value = Number(values[index]) || 0;
      hash = fnvByte(hash, value);
      hash = fnvByte(hash, value >>> 8);
    }
    return hash;
  }
  const buffer = new ArrayBuffer(4), view = new DataView(buffer);
  for (let index = 0; index < values.length; index += 1) {
    view.setFloat32(0, Number(values[index]) || 0, true);
    for (let byte = 0; byte < 4; byte += 1) hash = fnvByte(hash, view.getUint8(byte));
  }
  return hash;
}

function serializedColorRasterFingerprint(raster) {
  if (!raster) return null;
  let hash = 0x811c9dc5;
  for (const value of [raster.type, raster.width, raster.height, raster.bitDepth, raster.colorMode, raster.channelCount]) hash = fnvText(hash, value);
  for (const name of raster.channelNames || []) hash = fnvText(hash, name);
  hash = fnvRasterSamples(hash, raster.data, raster.bitDepth);
  hash = fnvRasterSamples(hash, raster.alpha, raster.bitDepth);
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function rasterMaskFingerprint(mask) {
  if (!mask) return null;
  let hash = 0x811c9dc5;
  for (const value of [mask.type, mask.width, mask.height, mask.invert, mask.feather, mask.expand, mask.enabled]) hash = fnvText(hash, value);
  hash = fnvRasterSamples(hash, mask.alpha, 8);
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function precisionLayoutFingerprint(page) {
  return chatStateFingerprint({
    snap: clone(page?.snap || null),
    guides: clone(Array.isArray(page?.guides) ? page.guides : [])
  });
}

function artboardFingerprint(page) {
  return chatStateFingerprint(clone(page?.artboard || null));
}

export function chatObjectRef(pageId, found) {
  return {
    pageId: pageId || null,
    layerId: found?.layer?.id || null,
    objectId: found?.object?.id || null
  };
}

function pathGeometrySummary(path) {
  const subpaths = Array.isArray(path?.subpaths) ? path.subpaths : [];
  return {
    kind: 'path',
    subpathCount: subpaths.length,
    anchorCount: subpaths.reduce((sum, subpath) => sum + (Array.isArray(subpath?.anchors) ? subpath.anchors.length : 0), 0),
    closedSubpathCount: subpaths.filter(subpath => subpath?.closed).length,
    roles: subpaths.slice(0, 64).map(subpath => subpath?.role || 'outer'),
    rolesTruncated: subpaths.length > 64,
    fingerprint: pathGeometryFingerprint(path)
  };
}

function genericGeometrySummary(object) {
  if (object?.type === 'path') return pathGeometrySummary(object);
  if (object?.type === 'frame') {
    return { kind: 'frame', width: finite(object.width), height: finite(object.height), childCount: object.children?.length || 0 };
  }
  if (object?.type === 'group') return { kind: 'group', childCount: object.children?.length || 0 };
  if (object?.type === 'stroke') return { kind: 'stroke', pointCount: object.points?.length || 0 };
  if (object?.type === 'text') return { kind: 'text', characterCount: String(object.text || '').length };
  if (object?.type === 'image' || object?.type === 'reference') {
    return { kind: object.type, width: finite(object.width ?? object.w), height: finite(object.height ?? object.h) };
  }
  return { kind: object?.type || 'unknown' };
}

function pathAppearanceSummary(path) {
  const expressive = path?.expressiveStroke;
  const material = path?.materialAppearance;
  return {
    fill: path?.fill ?? 'none',
    stroke: path?.stroke ?? 'none',
    strokeWidth: finite(path?.strokeWidth),
    opacity: finite(path?.opacity) ?? 1,
    fillRule: path?.fillRule || 'nonzero',
    expressiveStroke: expressive ? {
      format: expressive.format || null,
      version: expressive.version ?? null,
      color: expressive.color || null,
      baseWidth: finite(expressive.baseWidth),
      opacity: finite(expressive.opacity)
    } : null,
    material: material ? {
      format: material.format || null,
      version: material.version ?? null,
      templateId: material.templateId || null,
      templateVersion: material.templateVersion || null,
      parameterKeys: Object.keys(material.parameterOverrides || {}).sort(),
      fallback: clone(material.fallback || null)
    } : null
  };
}

function appearanceSummary(object) {
  if (object?.type === 'path') return pathAppearanceSummary(object);
  if (object?.type === 'image') {
    return {
      opacity: finite(object?.opacity) ?? 1,
      rasterStateType: object?.rasterState?.type || null,
      stackFingerprint: chatStateFingerprint({
        adjustments: object?.adjustments || [],
        filterStack: object?.filterStack || [],
        effects: object?.effects || [],
        blendMode: object?.blendMode || 'source-over'
      })
    };
  }
  const result = { opacity: finite(object?.opacity) ?? 1 };
  for (const key of ['color', 'fill', 'fillColor', 'stroke', 'strokeWidth', 'size', 'kind']) {
    if (object?.[key] !== undefined && typeof object[key] !== 'object') result[key] = object[key];
  }
  return result;
}

function provenanceSummary(object) {
  const metadata = object?.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const extraction = metadata.extraction;
  if (extraction && typeof extraction === 'object') {
    return {
      kind: 'extraction',
      schema: extraction.schema || null,
      batchId: extraction.batchId || null,
      referenceObjectId: extraction.referenceObjectId || null,
      sourceName: extraction.source?.name || extraction.sourceName || null
    };
  }
  const source = metadata.source;
  if (source && typeof source === 'object') {
    return { kind: 'source', id: source.id || null, name: source.name || null, type: source.type || null };
  }
  return null;
}

export function summarizeChatObject(pageId, found) {
  const object = found.object;
  const summary = {
    ref: chatObjectRef(pageId, found),
    type: object?.type || 'unknown',
    name: object?.name || null,
    parentId: found.parentObject?.id || null,
    depth: found.depth ?? 0,
    renderOrder: found.renderOrder ?? 0,
    effectiveVisible: found.effectiveVisible !== false,
    effectiveLocked: Boolean(found.effectiveLocked),
    effectiveOpacity: finite(found.effectiveOpacity) ?? 1,
    interactionExposed: found.interactionExposed !== false,
    matrix: clone(object?.matrix || null),
    worldMatrix: clone(found.worldMatrix || null),
    geometry: genericGeometrySummary(object),
    appearance: appearanceSummary(object),
    provenance: provenanceSummary(object)
  };
  return { ...summary, stateFingerprint: chatStateFingerprint(summary) };
}

function selectedRefs(app, page) {
  const selected = [];
  for (const ref of Array.isArray(app.selection) ? app.selection : []) {
    const found = typeof app.findObject === 'function' ? app.findObject(ref) : null;
    if (found) selected.push(chatObjectRef(page.id, found));
  }
  return selected.sort((a, b) =>
    String(a.layerId).localeCompare(String(b.layerId))
    || String(a.objectId).localeCompare(String(b.objectId)));
}

export function buildChatStateSummary(app) {
  const document = app?.doc;
  const page = typeof app?.page === 'function' ? app.page() : null;
  if (!document || !page) throw Object.assign(new Error('INK_CHAT_STATE_UNAVAILABLE'), { code: 'CHAT_STATE_UNAVAILABLE' });

  const walked = walkPageObjects(page);
  const objects = walked.map(found => summarizeChatObject(page.id, found));
  const layers = (page.layers || []).map((layer, index) => ({
    id: layer.id || null,
    name: layer.name || null,
    index,
    visible: layer.visible !== false,
    locked: Boolean(layer.locked),
    opacity: finite(layer.opacity) ?? 1,
    objectCount: walked.filter(item => item.layer?.id === layer.id).length
  }));

  return {
    schema: CHAT_STATE_SUMMARY_SCHEMA,
    version: CHAT_STATE_SUMMARY_VERSION,
    document: {
      id: document.id || null,
      title: document.title || null,
      format: document.format || 'INK',
      formatVersion: document.formatVersion ?? null,
      activePageId: document.activePageId || page.id || null,
      pageCount: document.pages?.length || 0
    },
    revision: {
      revisionId: app?.revisions?.revisionIdFor?.(document.id) ?? null,
      documentFingerprint: documentFingerprint(document)
    },
    page: {
      id: page.id || null,
      name: page.name || null,
      activeLayerId: page.activeLayerId || null,
      layerCount: page.layers?.length || 0,
      artboard: clone(page.artboard || null)
    },
    selection: selectedRefs(app, page),
    layers,
    objects
  };
}


export const CHAT_EDIT_TASK_SCHEMA = 'INK-CHAT-EDIT-TASK';
export const CHAT_EDIT_TASK_VERSION = 1;
export const CHAT_EDIT_PROPOSAL_SCHEMA = 'INK-CHAT-EDIT-PROPOSAL';
export const CHAT_EDIT_PROPOSAL_VERSION = 1;

export const CHAT_IMAGE_ADJUSTMENT_TYPES = Object.freeze(['brightnessContrast', 'levels', 'curves', 'hueSaturation']);
export const CHAT_IMAGE_FILTER_TYPES = Object.freeze(['gaussianBlur', 'sharpen', 'noiseGrain', 'textureOverlay']);
export const CHAT_IMAGE_BLEND_MODES = Object.freeze([...IMAGE_CAPABILITIES.blendModes]);
export const CHAT_IMAGE_EFFECT_TYPES = Object.freeze(['dropShadow', 'innerShadow', 'outerGlow', 'colorOverlay', 'stroke']);
export const CHAT_IMAGE_LIQUIFY_OPERATION_TYPES = Object.freeze([...LIQUIFY_OPERATIONS]);
export const CHAT_IMAGE_LOCAL_RETOUCH_TYPES = Object.freeze(['dodge', 'burn', 'sponge', 'localBlur', 'localSharpen', 'colorReplacement']);
export const CHAT_IMAGE_SOURCE_RETOUCH_TYPES = Object.freeze(['cloneStamp', 'healingBrush', 'patch']);
export const CHAT_PAGE_OPERATIONS = Object.freeze(['page.create.v1', 'page.duplicate.v1', 'page.delete.v1', 'page.rename.v1', 'page.activate.v1']);
const CHAT_PAGE_OPERATION_SET = new Set(CHAT_PAGE_OPERATIONS);
export const CHAT_OBJECT_ALIGN_MODES = Object.freeze(['left', 'centerX', 'right', 'top', 'centerY', 'bottom', 'distributeX', 'distributeY']);
export const CHAT_SNAP_KEYS = Object.freeze(['enabled', 'guides', 'edges', 'centers', 'grid', 'angle', 'equalDistance']);
export const CHAT_ARTBOARD_KEYS = Object.freeze(['orientation', 'ppi', 'bleedMm', 'safeMarginMm', 'unit', 'showBleed', 'showSafeArea', 'showCenter', 'clipContent']);
export const CHAT_PRECISION_LAYOUT_OPERATIONS = Object.freeze(['page.snap.set.v1', 'guide.add.v1', 'guide.move.v1', 'guide.remove.v1', 'guide.lock.set.v1', 'guide.visibility.set.v1']);
const CHAT_PRECISION_LAYOUT_OPERATION_SET = new Set(CHAT_PRECISION_LAYOUT_OPERATIONS);
export const CHAT_MATERIAL_OPERATIONS = Object.freeze(['material.template.create.v1', 'material.instance.create.v1']);
const CHAT_MATERIAL_OPERATION_SET = new Set(CHAT_MATERIAL_OPERATIONS);
export const CHAT_RECIPE_OPERATIONS = Object.freeze(['recipe.studio.execute.v1']);
const CHAT_RECIPE_OPERATION_SET = new Set(CHAT_RECIPE_OPERATIONS);

export const CHAT_EDIT_OPERATIONS = Object.freeze([
  'material.template.create.v1',
  'material.instance.create.v1',
  'recipe.studio.execute.v1',
  'path.repaint.v1',
  'path.material.apply.v1',
  'path.material.remove.v1',
  'object.translate.v1',
  'object.align.v1',
  'path.simplify.v1',
  'path.refine.v1',
  'path.create.v1',
  'stroke.create.v1',
  'stroke.erase.circle.v1',
  'page.create.v1',
  'page.duplicate.v1',
  'page.delete.v1',
  'page.rename.v1',
  'page.activate.v1',
  'page.paper.set.v1',
  'page.artboard.set.v1',
  'page.snap.set.v1',
  'guide.add.v1',
  'guide.move.v1',
  'guide.remove.v1',
  'guide.lock.set.v1',
  'guide.visibility.set.v1',
  'paint.session.create.v1',
  'image.adjustment.add.v1',
  'image.filter.add.v1',
  'image.blend.set.v1',
  'image.effect.add.v1',
  'image.liquify.add.v1',
  'image.raster.paintBucket.v1',
  'image.mask.raster.set.v1',
  'image.raster.spotHeal.v1',
  'image.raster.localRetouch.v1',
  'image.raster.sourceRetouch.v1',
  'path.warp.v1',
  'path.distort.v1',
  'path.perspective.v1',
  'path.edit.v1',
  'object.rotate.v1',
  'object.clone.v1',
  'repeat.radial.v1',
  'boolean.apply.v1',
  'group.create.v1',
  'object.reparent.v1',
  'frame.create.v1',
  'text.create.v1',
  'text.edit.v1',
  'text.path.set.v1',
  'svg.import.v1',
  'object.resize.v1',
  'object.scale.v1',
  'object.order.v1',
  'repeat.mirror.v1',
  'repeat.grid.v1',
  'layout.frame.set.v1',
  'layout.frame.remove.v1',
  'layout.item.set.v1',
  'layout.item.remove.v1',
  'component.register.v1',
  'component.instance.create.v1',
  'component.override.set.v1',
  'component.override.reset.v1',
  'component.instance.detach.v1',
  'component.definition.duplicate.v1',
  'component.reference.repair.v1'
]);

const CHAT_EDIT_OPERATION_SET = new Set(CHAT_EDIT_OPERATIONS);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function editFail(code, details = {}) {
  throw Object.assign(new Error(`INK_CHAT_EDIT_${code}`), { code: `CHAT_EDIT_${code}`, ...details });
}

function boundedText(value, field, { required = true, max = 160 } = {}) {
  if (value == null || value === '') {
    if (!required) return null;
    editFail('FIELD_REQUIRED', { field });
  }
  if (typeof value !== 'string') editFail('FIELD_INVALID', { field });
  const text = value.trim();
  if ((required && !text) || text.length > max) editFail('FIELD_INVALID', { field });
  return text || null;
}

function boundedRawString(value, field, { required = true, max = 32768 } = {}) {
  if (value == null) {
    if (!required) return null;
    editFail('FIELD_REQUIRED', { field });
  }
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) editFail('FIELD_INVALID', { field });
  return value;
}

function boundedNumber(value, field, { min = -1e6, max = 1e6, integer = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    editFail('ARGUMENT_INVALID', { field });
  }
  return number;
}

function boundedPaintToken(value, field) {
  return boundedText(value, field, { max: 256 });
}

function normalizeTargetRef(ref, index) {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) editFail('TARGET_REF_INVALID', { index });
  return {
    pageId: boundedText(ref.pageId, `targets[${index}].pageId`, { max: 160 }),
    layerId: boundedText(ref.layerId, `targets[${index}].layerId`, { max: 160 }),
    objectId: boundedText(ref.objectId, `targets[${index}].objectId`, { max: 160 })
  };
}

function normalizeTargets(raw, { exact = null, min = 1, max = 64 } = {}) {
  if (!Array.isArray(raw) || raw.length < min || raw.length > max) editFail('TARGETS_INVALID');
  const targets = raw.map(normalizeTargetRef);
  const unique = new Set(targets.map(ref => `${ref.pageId}\u0000${ref.layerId}\u0000${ref.objectId}`));
  if (unique.size !== targets.length) editFail('TARGET_DUPLICATE');
  if (exact != null && targets.length !== exact) editFail('TARGET_COUNT_INVALID', { expected: exact, actual: targets.length });
  return targets;
}

function boundedBoolean(value, field, fallback = null) {
  if (value == null && fallback !== null) return fallback;
  if (typeof value !== 'boolean') editFail('ARGUMENT_INVALID', { field });
  return value;
}

function boundedEnum(value, field, allowed) {
  const text = boundedText(value, field, { max: 80 });
  if (!allowed.includes(text)) editFail('ARGUMENT_INVALID', { field });
  return text;
}

function normalizeBoundedJson(value, field, {
  maxBytes = 8192,
  maxDepth = 4,
  maxKeys = 64,
  maxArray = 128,
  maxString = 512
} = {}) {
  const state = { keys: 0 };
  const visit = (item, path, depth) => {
    if (depth > maxDepth) editFail('ARGUMENTS_BOUNDS', { field: path });
    if (item == null || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) editFail('ARGUMENT_INVALID', { field: path });
      return item;
    }
    if (typeof item === 'string') {
      if (item.length > maxString) editFail('ARGUMENTS_BOUNDS', { field: path });
      return item;
    }
    if (Array.isArray(item)) {
      if (item.length > maxArray) editFail('ARGUMENTS_BOUNDS', { field: path });
      return item.map((entry, index) => visit(entry, `${path}[${index}]`, depth + 1));
    }
    if (!item || typeof item !== 'object' || Object.getPrototypeOf(item) !== Object.prototype) {
      editFail('ARGUMENT_INVALID', { field: path });
    }
    const keys = Object.keys(item);
    state.keys += keys.length;
    if (state.keys > maxKeys) editFail('ARGUMENTS_BOUNDS', { field: path });
    return Object.fromEntries(keys.sort().map(key => [
      boundedText(key, `${path}.key`, { max: 128 }),
      visit(item[key], `${path}.${key}`, depth + 1)
    ]));
  };
  const normalized = visit(value ?? {}, field, 0);
  if (JSON.stringify(normalized).length > maxBytes) editFail('ARGUMENTS_BOUNDS', { field });
  return normalized;
}

function normalizeImageAdjustmentArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return {
    type: boundedEnum(raw.type, 'arguments.type', CHAT_IMAGE_ADJUSTMENT_TYPES),
    params: normalizeBoundedJson(raw.params ?? {}, 'arguments.params'),
    opacity: boundedNumber(raw.opacity ?? 1, 'arguments.opacity', { min: 0, max: 1 })
  };
}

function normalizeImageFilterArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return {
    type: boundedEnum(raw.type, 'arguments.type', CHAT_IMAGE_FILTER_TYPES),
    params: normalizeBoundedJson(raw.params ?? {}, 'arguments.params'),
    opacity: boundedNumber(raw.opacity ?? 1, 'arguments.opacity', { min: 0, max: 1 })
  };
}

function normalizeImageBlendArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return { mode: boundedEnum(raw.mode, 'arguments.mode', CHAT_IMAGE_BLEND_MODES) };
}

function normalizeImageEffectArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return {
    type: boundedEnum(raw.type, 'arguments.type', CHAT_IMAGE_EFFECT_TYPES),
    params: normalizeBoundedJson(raw.params ?? {}, 'arguments.params'),
    opacity: boundedNumber(raw.opacity ?? 1, 'arguments.opacity', { min: 0, max: 1 })
  };
}

function normalizeImageLiquifyArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  if (!Array.isArray(raw.operations) || raw.operations.length < 1 || raw.operations.length > 32) editFail('ARGUMENTS_INVALID', { field: 'arguments.operations' });
  const operations = raw.operations.map((op, index) => {
    if (!op || typeof op !== 'object' || Array.isArray(op)) editFail('ARGUMENT_INVALID', { field: `arguments.operations[${index}]` });
    const normalized = {
      type: boundedEnum(op.type, `arguments.operations[${index}].type`, CHAT_IMAGE_LIQUIFY_OPERATION_TYPES),
      x: boundedNumber(op.x, `arguments.operations[${index}].x`),
      y: boundedNumber(op.y, `arguments.operations[${index}].y`),
      radius: boundedNumber(op.radius ?? 32, `arguments.operations[${index}].radius`, { min: 1, max: 1e6 }),
      strength: boundedNumber(op.strength ?? .5, `arguments.operations[${index}].strength`, { min: -1, max: 1 })
    };
    if (op.dx != null) normalized.dx = boundedNumber(op.dx, `arguments.operations[${index}].dx`);
    if (op.dy != null) normalized.dy = boundedNumber(op.dy, `arguments.operations[${index}].dy`);
    if (op.angle != null) normalized.angle = boundedNumber(op.angle, `arguments.operations[${index}].angle`, { min: -360000, max: 360000 });
    return normalized;
  });
  return {
    operations,
    opacity: boundedNumber(raw.opacity ?? 1, 'arguments.opacity', { min: 0, max: 1 }),
    maxWork: raw.maxWork == null ? null : boundedNumber(raw.maxWork, 'arguments.maxWork', { min: 1, max: 50000000, integer: true })
  };
}

function normalizeImageRasterPaintBucketArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const color = boundedPaintToken(raw.color, 'arguments.color');
  if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color)) editFail('ARGUMENT_INVALID', { field: 'arguments.color' });
  return {
    x: boundedNumber(raw.x, 'arguments.x', { min: 0, max: 1e6 }),
    y: boundedNumber(raw.y, 'arguments.y', { min: 0, max: 1e6 }),
    color: color.toLowerCase(),
    tolerance: boundedNumber(raw.tolerance ?? 0, 'arguments.tolerance', { min: 0, max: 255 }),
    contiguous: boundedBoolean(raw.contiguous ?? true, 'arguments.contiguous'),
    opacity: boundedNumber(raw.opacity ?? 1, 'arguments.opacity', { min: 0, max: 1 })
  };
}

function normalizeImageRasterSpotHealArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return {
    x: boundedNumber(raw.x, 'arguments.x', { min: 0, max: 1e6 }),
    y: boundedNumber(raw.y, 'arguments.y', { min: 0, max: 1e6 }),
    radius: boundedNumber(raw.radius ?? 12, 'arguments.radius', { min: Number.EPSILON, max: 512 }),
    opacity: boundedNumber(raw.opacity ?? 1, 'arguments.opacity', { min: 0, max: 1 }),
    hardness: boundedNumber(raw.hardness ?? .85, 'arguments.hardness', { min: 0, max: 1 }),
    neighborRadius: boundedNumber(raw.neighborRadius ?? 2, 'arguments.neighborRadius', { min: 1, max: 64, integer: true })
  };
}

function normalizeImageRasterLocalRetouchArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const type = boundedEnum(raw.type, 'arguments.type', CHAT_IMAGE_LOCAL_RETOUCH_TYPES);
  const result = {
    type,
    x: boundedNumber(raw.x, 'arguments.x', { min: 0, max: 1e6 }),
    y: boundedNumber(raw.y, 'arguments.y', { min: 0, max: 1e6 }),
    radius: boundedNumber(raw.radius ?? 18, 'arguments.radius', { min: Number.EPSILON, max: 512 }),
    hardness: boundedNumber(raw.hardness ?? .85, 'arguments.hardness', { min: 0, max: 1 })
  };
  if (type === 'dodge' || type === 'burn') {
    result.strength = boundedNumber(raw.strength ?? .55, 'arguments.strength', { min: 0, max: 1 });
  } else if (type === 'sponge') {
    result.strength = boundedNumber(raw.strength ?? .55, 'arguments.strength', { min: 0, max: 1 });
    result.mode = boundedEnum(raw.mode ?? 'saturate', 'arguments.mode', ['saturate', 'desaturate']);
  } else if (type === 'localBlur') {
    result.strength = boundedNumber(raw.strength ?? .75, 'arguments.strength', { min: 0, max: 1 });
    result.kernelRadius = boundedNumber(raw.kernelRadius ?? 2, 'arguments.kernelRadius', { min: 1, max: 16, integer: true });
  } else if (type === 'localSharpen') {
    result.amount = boundedNumber(raw.amount ?? 1, 'arguments.amount', { min: 0, max: 4 });
    result.kernelRadius = boundedNumber(raw.kernelRadius ?? 2, 'arguments.kernelRadius', { min: 1, max: 16, integer: true });
  } else if (type === 'colorReplacement') {
    const replacementColor = boundedPaintToken(raw.replacementColor, 'arguments.replacementColor');
    if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(replacementColor)) editFail('ARGUMENT_INVALID', { field: 'arguments.replacementColor' });
    result.replacementColor = replacementColor.toLowerCase();
    if (raw.referenceColor != null) {
      const referenceColor = boundedPaintToken(raw.referenceColor, 'arguments.referenceColor');
      if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(referenceColor)) editFail('ARGUMENT_INVALID', { field: 'arguments.referenceColor' });
      result.referenceColor = referenceColor.toLowerCase();
    }
    result.tolerance = boundedNumber(raw.tolerance ?? 32, 'arguments.tolerance', { min: 0, max: 255 });
    result.strength = boundedNumber(raw.strength ?? 1, 'arguments.strength', { min: 0, max: 1 });
  }
  return result;
}

function normalizeRasterLocalRegion(raw, field) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENT_INVALID', { field });
  return {
    x: boundedNumber(raw.x, `${field}.x`, { min: 0, max: 1e6 }),
    y: boundedNumber(raw.y, `${field}.y`, { min: 0, max: 1e6 }),
    width: boundedNumber(raw.width, `${field}.width`, { min: Number.EPSILON, max: 1e6 }),
    height: boundedNumber(raw.height, `${field}.height`, { min: Number.EPSILON, max: 1e6 })
  };
}

function normalizeImageRasterSourceRetouchArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const type = boundedEnum(raw.type, 'arguments.type', CHAT_IMAGE_SOURCE_RETOUCH_TYPES);
  const opacity = boundedNumber(raw.opacity ?? 1, 'arguments.opacity', { min: 0, max: 1 });
  if (type === 'patch') {
    const sourceRegion = normalizeRasterLocalRegion(raw.sourceRegion, 'arguments.sourceRegion');
    const targetRegion = normalizeRasterLocalRegion(raw.targetRegion, 'arguments.targetRegion');
    if (sourceRegion.width !== targetRegion.width || sourceRegion.height !== targetRegion.height) {
      editFail('ARGUMENT_INVALID', { field: 'arguments.targetRegion' });
    }
    return {
      type,
      sourceRegion,
      targetRegion,
      opacity,
      feather: boundedNumber(raw.feather ?? 0, 'arguments.feather', { min: 0, max: 512 })
    };
  }
  return {
    type,
    sourceX: boundedNumber(raw.sourceX, 'arguments.sourceX', { min: 0, max: 1e6 }),
    sourceY: boundedNumber(raw.sourceY, 'arguments.sourceY', { min: 0, max: 1e6 }),
    targetX: boundedNumber(raw.targetX, 'arguments.targetX', { min: 0, max: 1e6 }),
    targetY: boundedNumber(raw.targetY, 'arguments.targetY', { min: 0, max: 1e6 }),
    radius: boundedNumber(raw.radius ?? 18, 'arguments.radius', { min: Number.EPSILON, max: 512 }),
    opacity,
    hardness: boundedNumber(raw.hardness ?? .85, 'arguments.hardness', { min: 0, max: 1 })
  };
}

function normalizeImageRasterMaskArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return {
    shape: boundedEnum(raw.shape ?? 'rectangle', 'arguments.shape', ['rectangle']),
    x: boundedNumber(raw.x, 'arguments.x', { min: 0, max: 1e6 }),
    y: boundedNumber(raw.y, 'arguments.y', { min: 0, max: 1e6 }),
    width: boundedNumber(raw.width, 'arguments.width', { min: Number.EPSILON, max: 1e6 }),
    height: boundedNumber(raw.height, 'arguments.height', { min: Number.EPSILON, max: 1e6 }),
    invert: boundedBoolean(raw.invert ?? false, 'arguments.invert'),
    feather: boundedNumber(raw.feather ?? 0, 'arguments.feather', { min: 0, max: 256 }),
    expand: boundedNumber(raw.expand ?? 0, 'arguments.expand', { min: -256, max: 256, integer: true })
  };
}

function normalizePathWarpArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const strength = boundedNumber(raw.strength ?? 0, 'arguments.strength', { min: -1, max: 1 });
  const maxDisplacement = boundedNumber(raw.maxDisplacement ?? .5, 'arguments.maxDisplacement', { min: 0, max: .5 });
  if (strength === 0 || maxDisplacement === 0) editFail('NO_OP', { operation: 'path.warp.v1' });
  return { strength, maxDisplacement };
}

function normalizePathProjectiveArguments(raw = {}, operation) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const xOffset = boundedNumber(raw.xOffset ?? 0, 'arguments.xOffset', { min: -1e6, max: 1e6 });
  const yOffset = boundedNumber(raw.yOffset ?? 0, 'arguments.yOffset', { min: -1e6, max: 1e6 });
  if (xOffset === 0 && yOffset === 0) editFail('NO_OP', { operation });
  return { xOffset, yOffset };
}

function normalizePoint(value, field, { optional = false } = {}) {
  if (value == null && optional) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) editFail('ARGUMENT_INVALID', { field });
  return {
    x: boundedNumber(value.x, `${field}.x`),
    y: boundedNumber(value.y, `${field}.y`)
  };
}

function normalizeAnchor(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) editFail('ARGUMENT_INVALID', { field });
  const mode = value.mode == null ? 'corner' : boundedEnum(value.mode, `${field}.mode`, ['corner', 'smooth', 'symmetric']);
  return {
    x: boundedNumber(value.x, `${field}.x`),
    y: boundedNumber(value.y, `${field}.y`),
    in: value.in == null ? { x: 0, y: 0 } : normalizePoint(value.in, `${field}.in`),
    out: value.out == null ? { x: 0, y: 0 } : normalizePoint(value.out, `${field}.out`),
    mode
  };
}

function normalizePathCreateArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const shape = boundedEnum(raw.shape || 'path', 'arguments.shape', ['path', 'ellipse', 'circle', 'rectangle', 'polygon', 'polyline']);
  const result = {
    shape,
    objectId: raw.objectId == null ? null : boundedText(raw.objectId, 'arguments.objectId', { max: 160 }),
    name: raw.name == null ? 'CHAT Path' : boundedText(raw.name, 'arguments.name', { max: 160 }),
    fill: raw.fill == null ? 'none' : boundedPaintToken(raw.fill, 'arguments.fill'),
    stroke: raw.stroke == null ? '#202020' : boundedPaintToken(raw.stroke, 'arguments.stroke'),
    strokeWidth: boundedNumber(raw.strokeWidth ?? 1.5, 'arguments.strokeWidth', { min: 0, max: 1e5 }),
    opacity: boundedNumber(raw.opacity ?? 1, 'arguments.opacity', { min: 0, max: 1 })
  };
  if (shape === 'path') {
    if (!Array.isArray(raw.subpaths) || !raw.subpaths.length || raw.subpaths.length > 64) editFail('ARGUMENTS_INVALID');
    let anchorCount = 0;
    result.subpaths = raw.subpaths.map((subpath, subpathIndex) => {
      if (!subpath || typeof subpath !== 'object' || Array.isArray(subpath)) editFail('ARGUMENT_INVALID', { field: `arguments.subpaths[${subpathIndex}]` });
      if (!Array.isArray(subpath.anchors) || subpath.anchors.length < 2) editFail('ARGUMENT_INVALID', { field: `arguments.subpaths[${subpathIndex}].anchors` });
      anchorCount += subpath.anchors.length;
      if (anchorCount > 4096) editFail('ARGUMENTS_BOUNDS');
      return {
        closed: subpath.closed === undefined ? true : boundedBoolean(subpath.closed, `arguments.subpaths[${subpathIndex}].closed`),
        role: subpath.role == null ? 'outer' : boundedEnum(subpath.role, `arguments.subpaths[${subpathIndex}].role`, ['outer', 'hole']),
        anchors: subpath.anchors.map((anchor, anchorIndex) => normalizeAnchor(anchor, `arguments.subpaths[${subpathIndex}].anchors[${anchorIndex}]`))
      };
    });
  } else if (shape === 'ellipse' || shape === 'circle') {
    result.cx = boundedNumber(raw.cx, 'arguments.cx');
    result.cy = boundedNumber(raw.cy, 'arguments.cy');
    result.rx = boundedNumber(raw.rx ?? raw.r, 'arguments.rx', { min: Number.EPSILON, max: 1e6 });
    result.ry = shape === 'circle'
      ? result.rx
      : boundedNumber(raw.ry ?? raw.r ?? raw.rx, 'arguments.ry', { min: Number.EPSILON, max: 1e6 });
  } else if (shape === 'rectangle') {
    result.x = boundedNumber(raw.x, 'arguments.x');
    result.y = boundedNumber(raw.y, 'arguments.y');
    result.width = boundedNumber(raw.width, 'arguments.width', { min: Number.EPSILON, max: 1e6 });
    result.height = boundedNumber(raw.height, 'arguments.height', { min: Number.EPSILON, max: 1e6 });
  } else {
    if (!Array.isArray(raw.points) || raw.points.length < (shape === 'polygon' ? 3 : 2) || raw.points.length > 4096) editFail('ARGUMENTS_INVALID');
    result.points = raw.points.map((point, index) => normalizePoint(point, `arguments.points[${index}]`));
  }
  return result;
}


export const CHAT_PAINT_SESSION_BRUSH_IDS = Object.freeze(
  BUILTIN_BRUSH_PRESETS
    .filter(preset => !['blender', 'smudge', 'eraser'].includes(preset.engine))
    .map(preset => preset.id)
);
const CHAT_PAINT_SESSION_BRUSH_ID_SET = new Set(CHAT_PAINT_SESSION_BRUSH_IDS);

export const CHAT_STROKE_KINDS = Object.freeze(['pen', 'pencil', 'marker', 'brush', 'drybrush', 'airbrush', 'blender', 'smudge']);
const CHAT_STROKE_KIND_SET = new Set(CHAT_STROKE_KINDS);
const CHAT_MIXER_STROKE_KIND_SET = new Set(['blender', 'smudge']);
const CHAT_NATURAL_MEDIA_STROKE_KIND_SET = new Set(['brush', 'drybrush', 'airbrush', 'blender', 'smudge']);

function normalizeStrokeCreateSample(raw, field, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENT_INVALID', { field });
  return {
    x: boundedNumber(raw.x, `${field}.x`),
    y: boundedNumber(raw.y, `${field}.y`),
    pressure: boundedNumber(raw.pressure ?? raw.p ?? .5, `${field}.pressure`, { min: 0, max: 1 }),
    timestamp: boundedNumber(raw.timestamp ?? raw.time ?? raw.t ?? index * 16, `${field}.timestamp`, { min: 0, max: 1e9 }),
    tiltX: boundedNumber(raw.tiltX ?? 0, `${field}.tiltX`, { min: -90, max: 90 }),
    tiltY: boundedNumber(raw.tiltY ?? 0, `${field}.tiltY`, { min: -90, max: 90 }),
    azimuth: boundedNumber(raw.azimuth ?? 0, `${field}.azimuth`, { min: -1000, max: 1000 }),
    altitude: boundedNumber(raw.altitude ?? 90, `${field}.altitude`, { min: 0, max: 90 }),
    twist: boundedNumber(raw.twist ?? 0, `${field}.twist`, { min: -360000, max: 360000 })
  };
}

function normalizeStrokeCreateArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const kind = boundedText(raw.kind, 'arguments.kind', { max: 80 });
  if (!CHAT_STROKE_KIND_SET.has(kind)) editFail('ARGUMENT_INVALID', { field: 'arguments.kind', allowed: CHAT_STROKE_KINDS });
  if (!Array.isArray(raw.samples) || raw.samples.length < 2 || raw.samples.length > 4096) {
    editFail('ARGUMENT_INVALID', { field: 'arguments.samples' });
  }
  const samples = raw.samples.map((sample, sampleIndex) =>
    normalizeStrokeCreateSample(sample, `arguments.samples[${sampleIndex}]`, sampleIndex));
  for (let sampleIndex = 1; sampleIndex < samples.length; sampleIndex += 1) {
    if (samples[sampleIndex].timestamp < samples[sampleIndex - 1].timestamp) {
      editFail('ARGUMENT_INVALID', { field: `arguments.samples[${sampleIndex}].timestamp` });
    }
  }
  return {
    objectId: raw.objectId == null ? null : boundedText(raw.objectId, 'arguments.objectId', { max: 160 }),
    name: raw.name == null ? 'CHAT Stroke' : boundedText(raw.name, 'arguments.name', { max: 160 }),
    kind,
    color: raw.color == null ? '#202020' : boundedPaintToken(raw.color, 'arguments.color'),
    size: boundedNumber(raw.size ?? 12, 'arguments.size', { min: .25, max: 512 }),
    opacity: boundedNumber(raw.opacity ?? 1, 'arguments.opacity', { min: 0, max: 1 }),
    smoothing: boundedNumber(raw.smoothing ?? .5, 'arguments.smoothing', { min: 0, max: .95 }),
    pressure: boundedNumber(raw.pressure ?? .8, 'arguments.pressure', { min: 0, max: 1 }),
    taper: boundedNumber(raw.taper ?? 0, 'arguments.taper', { min: 0, max: 1 }),
    grain: boundedNumber(raw.grain ?? 0, 'arguments.grain', { min: 0, max: 1 }),
    softness: boundedNumber(raw.softness ?? .7, 'arguments.softness', { min: 0, max: 1 }),
    flow: boundedNumber(raw.flow ?? 1, 'arguments.flow', { min: 0, max: 1 }),
    wetness: boundedNumber(raw.wetness ?? 0, 'arguments.wetness', { min: 0, max: 1 }),
    bristle: boundedNumber(raw.bristle ?? 0, 'arguments.bristle', { min: 0, max: 1 }),
    blend: boundedNumber(raw.blend ?? (kind === 'blender' ? .92 : 0), 'arguments.blend', { min: 0, max: 1 }),
    smudge: boundedNumber(raw.smudge ?? (kind === 'smudge' ? .94 : kind === 'blender' ? .58 : 0), 'arguments.smudge', { min: 0, max: 1 }),
    drag: boundedNumber(raw.drag ?? (kind === 'smudge' ? .82 : kind === 'blender' ? .32 : 0), 'arguments.drag', { min: 0, max: 1 }),
    samples
  };
}

function normalizePaintSessionSample(raw, field, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENT_INVALID', { field });
  return {
    x: boundedNumber(raw.x, `${field}.x`),
    y: boundedNumber(raw.y, `${field}.y`),
    pressure: boundedNumber(raw.pressure ?? raw.p ?? .5, `${field}.pressure`, { min: 0, max: 1 }),
    timestamp: boundedNumber(raw.timestamp ?? raw.time ?? raw.t ?? index * 16, `${field}.timestamp`, { min: 0, max: 1e9 }),
    tiltX: boundedNumber(raw.tiltX ?? 0, `${field}.tiltX`, { min: -90, max: 90 }),
    tiltY: boundedNumber(raw.tiltY ?? 0, `${field}.tiltY`, { min: -90, max: 90 }),
    azimuth: boundedNumber(raw.azimuth ?? 0, `${field}.azimuth`, { min: -1000, max: 1000 }),
    altitude: boundedNumber(raw.altitude ?? 90, `${field}.altitude`, { min: 0, max: 90 })
  };
}

function normalizePaintSessionCreateArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  if (!Array.isArray(raw.strokes) || raw.strokes.length < 1 || raw.strokes.length > 64) editFail('ARGUMENTS_INVALID');
  let sampleCount = 0;
  const strokes = raw.strokes.map((stroke, strokeIndex) => {
    if (!stroke || typeof stroke !== 'object' || Array.isArray(stroke)) {
      editFail('ARGUMENT_INVALID', { field: `arguments.strokes[${strokeIndex}]` });
    }
    const brushId = boundedText(stroke.brushId, `arguments.strokes[${strokeIndex}].brushId`, { max: 80 });
    if (!CHAT_PAINT_SESSION_BRUSH_ID_SET.has(brushId)) {
      editFail('ARGUMENT_INVALID', {
        field: `arguments.strokes[${strokeIndex}].brushId`,
        allowed: CHAT_PAINT_SESSION_BRUSH_IDS
      });
    }
    if (!Array.isArray(stroke.samples) || stroke.samples.length < 2 || stroke.samples.length > 4096) {
      editFail('ARGUMENT_INVALID', { field: `arguments.strokes[${strokeIndex}].samples` });
    }
    sampleCount += stroke.samples.length;
    if (sampleCount > 16384) editFail('ARGUMENTS_BOUNDS', { field: 'arguments.strokes.samples' });
    const samples = stroke.samples.map((sample, sampleIndex) =>
      normalizePaintSessionSample(sample, `arguments.strokes[${strokeIndex}].samples[${sampleIndex}]`, sampleIndex));
    for (let sampleIndex = 1; sampleIndex < samples.length; sampleIndex += 1) {
      if (samples[sampleIndex].timestamp < samples[sampleIndex - 1].timestamp) {
        editFail('ARGUMENT_INVALID', { field: `arguments.strokes[${strokeIndex}].samples[${sampleIndex}].timestamp` });
      }
    }
    return {
      id: stroke.id == null ? null : boundedText(stroke.id, `arguments.strokes[${strokeIndex}].id`, { max: 160 }),
      brushId,
      color: stroke.color == null ? '#202020' : boundedPaintToken(stroke.color, `arguments.strokes[${strokeIndex}].color`),
      seed: boundedNumber(stroke.seed ?? strokeIndex + 1, `arguments.strokes[${strokeIndex}].seed`, { min: 0, max: 4294967295, integer: true }),
      samples
    };
  });
  return {
    objectId: raw.objectId == null ? null : boundedText(raw.objectId, 'arguments.objectId', { max: 160 }),
    name: raw.name == null ? 'CHAT Paint Session' : boundedText(raw.name, 'arguments.name', { max: 160 }),
    seed: boundedNumber(raw.seed ?? 1, 'arguments.seed', { min: 0, max: 4294967295, integer: true }),
    opacity: boundedNumber(raw.opacity ?? 1, 'arguments.opacity', { min: 0, max: 1 }),
    strokes,
    sampleCount
  };
}
function normalizePathEditArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const action = boundedEnum(raw.action, 'arguments.action', [
    'move-anchor', 'move-handle', 'set-anchor-mode', 'add-anchor', 'delete-anchors', 'set-subpath-closed'
  ]);
  const index = (value, field) => boundedNumber(value, field, { min: 0, max: 4096, integer: true });
  if (action === 'move-anchor') return {
    action, subpathIndex: index(raw.subpathIndex, 'arguments.subpathIndex'), anchorIndex: index(raw.anchorIndex, 'arguments.anchorIndex'),
    x: boundedNumber(raw.x, 'arguments.x'), y: boundedNumber(raw.y, 'arguments.y')
  };
  if (action === 'move-handle') return {
    action, subpathIndex: index(raw.subpathIndex, 'arguments.subpathIndex'), anchorIndex: index(raw.anchorIndex, 'arguments.anchorIndex'),
    side: boundedEnum(raw.side, 'arguments.side', ['in', 'out']),
    x: boundedNumber(raw.x, 'arguments.x'), y: boundedNumber(raw.y, 'arguments.y')
  };
  if (action === 'set-anchor-mode') return {
    action, subpathIndex: index(raw.subpathIndex, 'arguments.subpathIndex'), anchorIndex: index(raw.anchorIndex, 'arguments.anchorIndex'),
    mode: boundedEnum(raw.mode, 'arguments.mode', ['corner', 'smooth', 'symmetric'])
  };
  if (action === 'add-anchor') return {
    action, subpathIndex: index(raw.subpathIndex, 'arguments.subpathIndex'), segmentIndex: index(raw.segmentIndex, 'arguments.segmentIndex'),
    t: boundedNumber(raw.t ?? 0.5, 'arguments.t', { min: Number.EPSILON, max: 1 - Number.EPSILON })
  };
  if (action === 'delete-anchors') {
    if (!Array.isArray(raw.anchors) || !raw.anchors.length || raw.anchors.length > 512) editFail('ARGUMENTS_INVALID');
    return {
      action,
      anchors: raw.anchors.map((ref, refIndex) => ({
        subpathIndex: index(ref?.subpathIndex, `arguments.anchors[${refIndex}].subpathIndex`),
        anchorIndex: index(ref?.anchorIndex, `arguments.anchors[${refIndex}].anchorIndex`)
      }))
    };
  }
  return {
    action,
    subpathIndex: index(raw.subpathIndex, 'arguments.subpathIndex'),
    closed: boundedBoolean(raw.closed, 'arguments.closed')
  };
}

function normalizeRotateArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const degrees = boundedNumber(raw.degrees, 'arguments.degrees', { min: -360000, max: 360000 });
  if (degrees === 0) editFail('NO_OP');
  return { degrees, center: normalizePoint(raw.center, 'arguments.center', { optional: true }) };
}

function normalizeCloneArguments(raw = {}) {
  if (raw == null) raw = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return {
    dx: boundedNumber(raw.dx ?? 0, 'arguments.dx'),
    dy: boundedNumber(raw.dy ?? 0, 'arguments.dy')
  };
}

function normalizeRepeatRadialArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return {
    count: boundedNumber(raw.count, 'arguments.count', { min: 2, max: 720, integer: true }),
    center: normalizePoint(raw.center, 'arguments.center'),
    sweep: boundedNumber(raw.sweep ?? 360, 'arguments.sweep', { min: -360000, max: 360000 }),
    startAngle: boundedNumber(raw.startAngle ?? 0, 'arguments.startAngle', { min: -360000, max: 360000 }),
    linked: raw.linked === undefined ? true : boundedBoolean(raw.linked, 'arguments.linked')
  };
}

function normalizeBooleanArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return {
    operation: boundedEnum(raw.operation, 'arguments.operation', ['union', 'difference', 'intersection', 'xor', 'divide']),
    name: raw.name == null ? null : boundedText(raw.name, 'arguments.name', { max: 160 }),
    tolerance: boundedNumber(raw.tolerance ?? 0.65, 'arguments.tolerance', { min: Number.EPSILON, max: 1e4 })
  };
}

function normalizeGroupArguments(raw = {}) {
  if (raw == null) raw = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return { name: raw.name == null ? 'CHAT Group' : boundedText(raw.name, 'arguments.name', { max: 160 }) };
}

function normalizeReparentArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return {
    parentObjectId: raw.parentObjectId == null ? null : boundedText(raw.parentObjectId, 'arguments.parentObjectId', { max: 160 }),
    targetLayerId: raw.targetLayerId == null ? null : boundedText(raw.targetLayerId, 'arguments.targetLayerId', { max: 160 }),
    index: raw.index == null ? null : boundedNumber(raw.index, 'arguments.index', { min: 0, max: 1e6, integer: true })
  };
}


function normalizeFrameCreateArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return {
    name: raw.name == null ? 'CHAT Frame' : boundedText(raw.name, 'arguments.name', { max: 160 }),
    x: boundedNumber(raw.x ?? 0, 'arguments.x'),
    y: boundedNumber(raw.y ?? 0, 'arguments.y'),
    width: boundedNumber(raw.width ?? 320, 'arguments.width', { min: Number.EPSILON, max: 1e6 }),
    height: boundedNumber(raw.height ?? 240, 'arguments.height', { min: Number.EPSILON, max: 1e6 }),
    opacity: boundedNumber(raw.opacity ?? 1, 'arguments.opacity', { min: 0, max: 1 })
  };
}

function normalizeTextCreateArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return {
    text: boundedRawString(raw.text, 'arguments.text', { max: 32768 }),
    x: boundedNumber(raw.x ?? 0, 'arguments.x'),
    y: boundedNumber(raw.y ?? 0, 'arguments.y'),
    opacity: boundedNumber(raw.opacity ?? 1, 'arguments.opacity', { min: 0, max: 1 }),
    color: raw.color == null ? '#202020' : boundedPaintToken(raw.color, 'arguments.color'),
    fontFamily: raw.fontFamily == null ? 'system-ui' : boundedText(raw.fontFamily, 'arguments.fontFamily', { max: 160 }),
    fontSize: boundedNumber(raw.fontSize ?? 32, 'arguments.fontSize', { min: Number.EPSILON, max: 1e4 }),
    lineHeight: boundedNumber(raw.lineHeight ?? 1.25, 'arguments.lineHeight', { min: Number.EPSILON, max: 20 }),
    fontWeight: raw.fontWeight == null ? null : boundedNumber(raw.fontWeight, 'arguments.fontWeight', { min: 1, max: 1000 })
  };
}

function normalizeTextEditArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const patch = {};
  if (hasOwn(raw, 'text')) patch.text = boundedRawString(raw.text, 'arguments.text', { max: 32768 });
  if (hasOwn(raw, 'x')) patch.x = boundedNumber(raw.x, 'arguments.x');
  if (hasOwn(raw, 'y')) patch.y = boundedNumber(raw.y, 'arguments.y');
  if (hasOwn(raw, 'opacity')) patch.opacity = boundedNumber(raw.opacity, 'arguments.opacity', { min: 0, max: 1 });
  if (hasOwn(raw, 'color')) patch.color = boundedPaintToken(raw.color, 'arguments.color');
  if (hasOwn(raw, 'fontFamily')) patch.fontFamily = boundedText(raw.fontFamily, 'arguments.fontFamily', { max: 160 });
  if (hasOwn(raw, 'fontSize')) patch.fontSize = boundedNumber(raw.fontSize, 'arguments.fontSize', { min: Number.EPSILON, max: 1e4 });
  if (hasOwn(raw, 'lineHeight')) patch.lineHeight = boundedNumber(raw.lineHeight, 'arguments.lineHeight', { min: Number.EPSILON, max: 20 });
  if (hasOwn(raw, 'fontWeight')) patch.fontWeight = boundedNumber(raw.fontWeight, 'arguments.fontWeight', { min: 1, max: 1000 });
  if (!Object.keys(patch).length) editFail('ARGUMENTS_EMPTY');
  return patch;
}

function normalizeTextPathSetArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const ref = raw.pathRef;
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) editFail('ARGUMENT_INVALID', { field: 'arguments.pathRef' });
  return {
    pathRef: {
      pageId: boundedText(ref.pageId, 'arguments.pathRef.pageId', { max: 160 }),
      layerId: boundedText(ref.layerId, 'arguments.pathRef.layerId', { max: 160 }),
      objectId: boundedText(ref.objectId, 'arguments.pathRef.objectId', { max: 160 })
    },
    startOffset: boundedNumber(raw.startOffset ?? 0, 'arguments.startOffset', { min: 0, max: 1e6 }),
    overflow: raw.overflow == null ? 'clip' : boundedEnum(raw.overflow, 'arguments.overflow', ['clip'])
  };
}

function normalizeSvgImportArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const svg = boundedRawString(raw.svg, 'arguments.svg', { max: 1048576 });
  if (
    /<\s*(?:script|foreignObject|iframe|object|embed)\b/i.test(svg)
    || /\son[a-z]+\s*=/i.test(svg)
    || /(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|javascript:|data:text\/html)/i.test(svg)
    || /url\s*\(\s*["']?\s*(?:https?:|\/\/|javascript:)/i.test(svg)
    || /@import\b/i.test(svg)
  ) editFail('SVG_UNSAFE_CONTENT');
  return { svg };
}

function normalizeResizeArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const width = raw.width == null ? null : boundedNumber(raw.width, 'arguments.width', { min: Number.EPSILON, max: 1e6 });
  const height = raw.height == null ? null : boundedNumber(raw.height, 'arguments.height', { min: Number.EPSILON, max: 1e6 });
  if (width == null && height == null) editFail('ARGUMENTS_EMPTY');
  return {
    width,
    height,
    preserveAspect: raw.preserveAspect === undefined ? false : boundedBoolean(raw.preserveAspect, 'arguments.preserveAspect')
  };
}

function normalizeScaleArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const sx = boundedNumber(raw.sx, 'arguments.sx', { min: -1e4, max: 1e4 });
  const sy = boundedNumber(raw.sy ?? raw.sx, 'arguments.sy', { min: -1e4, max: 1e4 });
  if (Math.abs(sx) < 1e-6 || Math.abs(sy) < 1e-6) editFail('SINGULAR_SCALE');
  if (sx === 1 && sy === 1) editFail('NO_OP');
  return { sx, sy, center: normalizePoint(raw.center, 'arguments.center', { optional: true }) };
}

function normalizeOrderArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return { action: boundedEnum(raw.action, 'arguments.action', ['front', 'back']) };
}

function normalizeRepeatMirrorArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return {
    axis: boundedEnum(raw.axis ?? 'y', 'arguments.axis', ['x', 'y']),
    center: normalizePoint(raw.center, 'arguments.center', { optional: true }),
    linked: raw.linked === undefined ? true : boundedBoolean(raw.linked, 'arguments.linked')
  };
}

function normalizeRepeatGridArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const columns = boundedNumber(raw.columns, 'arguments.columns', { min: 1, max: 64, integer: true });
  const rows = boundedNumber(raw.rows, 'arguments.rows', { min: 1, max: 64, integer: true });
  if (columns * rows > 1024) editFail('ARGUMENTS_BOUNDS', { field: 'arguments.columns/rows' });
  return {
    columns,
    rows,
    dx: boundedNumber(raw.dx ?? 0, 'arguments.dx', { min: -1e5, max: 1e5 }),
    dy: boundedNumber(raw.dy ?? 0, 'arguments.dy', { min: -1e5, max: 1e5 }),
    linked: raw.linked === undefined ? true : boundedBoolean(raw.linked, 'arguments.linked')
  };
}

function normalizeFrameLayoutSetArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const padding = raw.padding == null ? {} : raw.padding;
  const align = raw.align == null ? {} : raw.align;
  const sizing = raw.sizing == null ? {} : raw.sizing;
  for (const [value, field] of [[padding, 'arguments.padding'], [align, 'arguments.align'], [sizing, 'arguments.sizing']]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) editFail('ARGUMENT_INVALID', { field });
  }
  const layout = {
    mode: boundedEnum(raw.mode ?? 'manual', 'arguments.mode', ['manual', 'horizontal', 'vertical']),
    gap: boundedNumber(raw.gap ?? 0, 'arguments.gap', { min: 0, max: 1e6 }),
    padding: {
      top: boundedNumber(padding.top ?? 0, 'arguments.padding.top', { min: 0, max: 1e6 }),
      right: boundedNumber(padding.right ?? 0, 'arguments.padding.right', { min: 0, max: 1e6 }),
      bottom: boundedNumber(padding.bottom ?? 0, 'arguments.padding.bottom', { min: 0, max: 1e6 }),
      left: boundedNumber(padding.left ?? 0, 'arguments.padding.left', { min: 0, max: 1e6 })
    },
    align: {
      main: boundedEnum(align.main ?? 'start', 'arguments.align.main', ['start', 'center', 'end', 'space-between']),
      cross: boundedEnum(align.cross ?? 'start', 'arguments.align.cross', ['start', 'center', 'end', 'stretch'])
    },
    sizing: {
      horizontal: boundedEnum(sizing.horizontal ?? 'fixed', 'arguments.sizing.horizontal', ['fixed', 'hug']),
      vertical: boundedEnum(sizing.vertical ?? 'fixed', 'arguments.sizing.vertical', ['fixed', 'hug'])
    }
  };
  return layout;
}

function normalizeLayoutItemSetArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const sizing = raw.sizing == null ? {} : raw.sizing;
  const fixedSize = raw.fixedSize == null ? {} : raw.fixedSize;
  const constraints = raw.constraints == null ? {} : raw.constraints;
  for (const [value, field] of [[sizing, 'arguments.sizing'], [fixedSize, 'arguments.fixedSize'], [constraints, 'arguments.constraints']]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) editFail('ARGUMENT_INVALID', { field });
  }
  return {
    participation: boundedEnum(raw.participation ?? 'flow', 'arguments.participation', ['flow', 'absolute']),
    sizing: {
      horizontal: boundedEnum(sizing.horizontal ?? 'hug', 'arguments.sizing.horizontal', ['fixed', 'fill', 'hug']),
      vertical: boundedEnum(sizing.vertical ?? 'hug', 'arguments.sizing.vertical', ['fixed', 'fill', 'hug'])
    },
    fixedSize: {
      width: boundedNumber(fixedSize.width ?? 1, 'arguments.fixedSize.width', { min: 0, max: 1e6 }),
      height: boundedNumber(fixedSize.height ?? 1, 'arguments.fixedSize.height', { min: 0, max: 1e6 })
    },
    constraints: {
      horizontal: boundedEnum(constraints.horizontal ?? 'start', 'arguments.constraints.horizontal', ['start', 'end', 'center', 'scale', 'stretch']),
      vertical: boundedEnum(constraints.vertical ?? 'start', 'arguments.constraints.vertical', ['start', 'end', 'center', 'scale', 'stretch'])
    }
  };
}

function normalizeNoArguments(raw = {}) {
  if (raw == null) return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length) editFail('ARGUMENTS_INVALID');
  return {};
}

function normalizePageIdArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => key !== 'pageId')) editFail('ARGUMENTS_INVALID');
  return { pageId: boundedText(raw.pageId, 'arguments.pageId', { max: 160 }) };
}

function normalizePageRenameArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['pageId', 'name'].includes(key))) editFail('ARGUMENTS_INVALID');
  return {
    pageId: boundedText(raw.pageId, 'arguments.pageId', { max: 160 }),
    name: boundedText(raw.name, 'arguments.name', { max: 160 })
  };
}

function normalizeComponentRegisterArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return { name: boundedText(raw.name, 'arguments.name', { max: 160 }) };
}

function normalizeComponentInstanceCreateArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  let matrix = null;
  if (raw.matrix != null) {
    if (!Array.isArray(raw.matrix) || raw.matrix.length !== 6 || raw.matrix.some(value => !Number.isFinite(Number(value)))) {
      editFail('ARGUMENT_INVALID', { field: 'arguments.matrix' });
    }
    matrix = raw.matrix.map(Number);
    if (!Matrix.isInvertible(matrix)) editFail('SINGULAR_MATRIX', { field: 'arguments.matrix' });
  }
  return {
    definitionId: boundedText(raw.definitionId, 'arguments.definitionId', { max: 160 }),
    pageId: boundedText(raw.pageId, 'arguments.pageId', { max: 160 }),
    layerId: boundedText(raw.layerId, 'arguments.layerId', { max: 160 }),
    parentId: raw.parentId == null ? null : boundedText(raw.parentId, 'arguments.parentId', { max: 160 }),
    matrix
  };
}

function normalizeComponentOverrideSetArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return {
    sourceNodeId: boundedText(raw.sourceNodeId, 'arguments.sourceNodeId', { max: 160 }),
    opacity: boundedNumber(raw.opacity, 'arguments.opacity', { min: 0, max: 1 })
  };
}

function normalizeComponentOverrideResetArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return { sourceNodeId: boundedText(raw.sourceNodeId, 'arguments.sourceNodeId', { max: 160 }) };
}

function normalizeComponentDefinitionDuplicateArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return {
    definitionId: boundedText(raw.definitionId, 'arguments.definitionId', { max: 160 }),
    name: raw.name == null ? null : boundedText(raw.name, 'arguments.name', { max: 160 })
  };
}

function normalizeComponentReferenceRepairArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  return { definitionId: boundedText(raw.definitionId, 'arguments.definitionId', { max: 160 }) };
}

function normalizeRepaintArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const patch = {};
  if (hasOwn(raw, 'fill')) patch.fill = boundedPaintToken(raw.fill, 'arguments.fill');
  if (hasOwn(raw, 'stroke')) patch.stroke = boundedPaintToken(raw.stroke, 'arguments.stroke');
  if (hasOwn(raw, 'opacity')) patch.opacity = boundedNumber(raw.opacity, 'arguments.opacity', { min: 0, max: 1 });
  if (hasOwn(raw, 'expressiveStrokeColor')) patch.expressiveStrokeColor = boundedPaintToken(raw.expressiveStrokeColor, 'arguments.expressiveStrokeColor');
  if (!Object.keys(patch).length) editFail('ARGUMENTS_EMPTY');
  return patch;
}

function validateMaterialTemplateTokens(value, field = 'arguments.template.geometry') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateMaterialTemplateTokens(item, `${field}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const keys = Object.keys(value);
  const dollarKeys = keys.filter(key => key.startsWith('$'));
  if (dollarKeys.length) {
    if (keys.length !== 1 || !['$param', '$calc'].includes(keys[0])) editFail('MATERIAL_TOKEN_UNSUPPORTED', { field });
    if (keys[0] === '$param') {
      boundedText(value.$param, field + '.$param', { max: 160 });
      return;
    }
    const calc = value.$calc;
    if (!calc || typeof calc !== 'object' || Array.isArray(calc) || Object.keys(calc).some(key => !['op', 'args'].includes(key))) {
      editFail('MATERIAL_TOKEN_INVALID', { field });
    }
    boundedEnum(calc.op, field + '.$calc.op', ['add', 'subtract', 'multiply', 'divide', 'negate', 'min', 'max', 'round', 'select']);
    if (!Array.isArray(calc.args) || !calc.args.length || calc.args.length > 16) editFail('MATERIAL_TOKEN_INVALID', { field });
    calc.args.forEach((item, index) => validateMaterialTemplateTokens(item, `${field}.$calc.args[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value)) validateMaterialTemplateTokens(item, `${field}.${key}`);
}

function normalizeMaterialTemplateCreateArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => key !== 'template')) editFail('ARGUMENTS_INVALID');
  const template = normalizeBoundedJson(raw.template, 'arguments.template', { maxBytes: 32768, maxDepth: 12, maxKeys: 512, maxArray: 512, maxString: 1024 });
  if (!template || typeof template !== 'object' || Array.isArray(template)) editFail('ARGUMENTS_INVALID');
  const allowed = new Set(['templateId', 'templateVersion', 'materialType', 'geometry', 'defaultParameters', 'editableParameters', 'constraints', 'semanticRole', 'sourceBenchmark', 'validationState', 'metadata']);
  if (Object.keys(template).some(key => !allowed.has(key))) editFail('ARGUMENTS_INVALID');
  template.templateId = boundedText(template.templateId, 'arguments.template.templateId', { max: 160 });
  if (!/^material[-_:]/i.test(template.templateId)) editFail('ARGUMENT_INVALID', { field: 'arguments.template.templateId' });
  template.templateVersion = boundedText(template.templateVersion, 'arguments.template.templateVersion', { max: 80 });
  template.materialType = boundedText(template.materialType, 'arguments.template.materialType', { max: 120 });
  template.semanticRole = boundedText(template.semanticRole, 'arguments.template.semanticRole', { max: 160 });
  if (!template.geometry || typeof template.geometry !== 'object' || Array.isArray(template.geometry)) editFail('ARGUMENT_INVALID', { field: 'arguments.template.geometry' });
  if (!template.defaultParameters || typeof template.defaultParameters !== 'object' || Array.isArray(template.defaultParameters)) editFail('ARGUMENT_INVALID', { field: 'arguments.template.defaultParameters' });
  if (!template.editableParameters || typeof template.editableParameters !== 'object' || Array.isArray(template.editableParameters)) editFail('ARGUMENT_INVALID', { field: 'arguments.template.editableParameters' });
  if (!Array.isArray(template.constraints)) editFail('ARGUMENT_INVALID', { field: 'arguments.template.constraints' });
  if (!template.sourceBenchmark || typeof template.sourceBenchmark !== 'object' || Array.isArray(template.sourceBenchmark)) editFail('ARGUMENT_INVALID', { field: 'arguments.template.sourceBenchmark' });
  if (!template.validationState || typeof template.validationState !== 'object' || Array.isArray(template.validationState)) editFail('ARGUMENT_INVALID', { field: 'arguments.template.validationState' });
  validateMaterialTemplateTokens(template.geometry);
  const pathAppearance = template.metadata?.pathAppearance;
  if (pathAppearance != null) {
    if (!pathAppearance || typeof pathAppearance !== 'object' || Array.isArray(pathAppearance) || Object.keys(pathAppearance).some(key => !['fill', 'stroke'].includes(key))) {
      editFail('ARGUMENT_INVALID', { field: 'arguments.template.metadata.pathAppearance' });
    }
    if (hasOwn(pathAppearance, 'fill')) pathAppearance.fill = boundedPaintToken(pathAppearance.fill, 'arguments.template.metadata.pathAppearance.fill');
    if (hasOwn(pathAppearance, 'stroke')) pathAppearance.stroke = boundedPaintToken(pathAppearance.stroke, 'arguments.template.metadata.pathAppearance.stroke');
  }
  return { template };
}

function normalizeMaterialInstanceCreateArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const allowed = new Set(['templateId', 'templateVersion', 'instanceId', 'instanceKey', 'name', 'layerId', 'parameterOverrides', 'transform', 'semanticRole']);
  if (Object.keys(raw).some(key => !allowed.has(key))) editFail('ARGUMENTS_INVALID');
  const result = {
    templateId: boundedText(raw.templateId, 'arguments.templateId', { max: 160 }),
    templateVersion: boundedText(raw.templateVersion, 'arguments.templateVersion', { max: 80 }),
    layerId: boundedText(raw.layerId, 'arguments.layerId', { max: 160 })
  };
  for (const key of ['instanceId', 'instanceKey', 'name', 'semanticRole']) {
    const value = boundedText(raw[key], `arguments.${key}`, { required: false, max: 160 });
    if (value) result[key] = value;
  }
  result.parameterOverrides = raw.parameterOverrides === undefined
    ? {}
    : normalizeBoundedJson(raw.parameterOverrides, 'arguments.parameterOverrides', { maxBytes: 8192, maxDepth: 6, maxKeys: 128, maxArray: 128, maxString: 512 });
  if (!result.parameterOverrides || typeof result.parameterOverrides !== 'object' || Array.isArray(result.parameterOverrides)) editFail('ARGUMENTS_INVALID');
  if (raw.transform !== undefined) {
    if (!Array.isArray(raw.transform) || raw.transform.length !== 6) editFail('ARGUMENT_INVALID', { field: 'arguments.transform' });
    result.transform = raw.transform.map((value, index) => boundedNumber(value, `arguments.transform[${index}]`));
    if (!Matrix.isInvertible(result.transform)) editFail('TARGET_SINGULAR', { field: 'arguments.transform' });
  }
  return result;
}

function normalizeStudioRecipeExecuteArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const allowed = new Set(['recipeId', 'recipeVersion', 'parameters', 'roles']);
  if (Object.keys(raw).some(key => !allowed.has(key))) editFail('ARGUMENTS_INVALID');
  const recipeId = boundedText(raw.recipeId, 'arguments.recipeId', { max: 160 });
  const recipeVersion = boundedText(raw.recipeVersion == null ? null : String(raw.recipeVersion), 'arguments.recipeVersion', { max: 80 });
  const parameters = raw.parameters === undefined
    ? {}
    : normalizeBoundedJson(raw.parameters, 'arguments.parameters', { maxBytes: 8192, maxDepth: 5, maxKeys: 128, maxArray: 128, maxString: 512 });
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) editFail('ARGUMENTS_INVALID');
  if (!Array.isArray(raw.roles) || raw.roles.length > 64) editFail('ARGUMENT_INVALID', { field: 'arguments.roles' });
  const roles = raw.roles.map((role, index) => boundedText(role, `arguments.roles[${index}]`, { max: 80 }));
  return { recipeId, recipeVersion, parameters, roles };
}

function normalizeMaterialArguments(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
  const templateId = boundedText(raw.templateId ?? raw.materialRef?.templateId, 'arguments.templateId', { max: 160 });
  const templateVersion = boundedText(raw.templateVersion ?? raw.materialRef?.templateVersion, 'arguments.templateVersion', { required: false, max: 80 });
  let parameterOverrides = {};
  if (raw.parameterOverrides !== undefined) {
    if (!raw.parameterOverrides || typeof raw.parameterOverrides !== 'object' || Array.isArray(raw.parameterOverrides)) editFail('ARGUMENTS_INVALID');
    if (Object.keys(raw.parameterOverrides).length > 32 || stableChatStringify(raw.parameterOverrides).length > 4096) editFail('ARGUMENTS_BOUNDS');
    parameterOverrides = clone(raw.parameterOverrides);
  }
  const fallback = {};
  if (raw.fallback !== undefined) {
    if (!raw.fallback || typeof raw.fallback !== 'object' || Array.isArray(raw.fallback)) editFail('ARGUMENTS_INVALID');
    if (hasOwn(raw.fallback, 'fill')) fallback.fill = boundedPaintToken(raw.fallback.fill, 'arguments.fallback.fill');
    if (hasOwn(raw.fallback, 'stroke')) fallback.stroke = boundedPaintToken(raw.fallback.stroke, 'arguments.fallback.stroke');
  }
  return { templateId, templateVersion, parameterOverrides, fallback };
}

export const CHAT_PAPER_KEYS = Object.freeze(['type', 'color', 'gridSize', 'absorbency', 'roughness', 'fiberStrength', 'fiberAngle', 'sizing', 'granulation', 'seed', 'textureVisible']);

function normalizePaperSetArguments(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['key', 'value'].includes(key))) editFail('ARGUMENTS_INVALID');
  const key = raw.key;
  if (!CHAT_PAPER_KEYS.includes(key)) editFail('FIELD_INVALID', { field: 'arguments.key' });
  let value = raw.value;
  if (key === 'type') {
    if (!['blank', 'dots', 'grid', 'ruled'].includes(value)) editFail('FIELD_INVALID', { field: 'arguments.value' });
  } else if (key === 'color') {
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) editFail('FIELD_INVALID', { field: 'arguments.value' });
    value = value.toLowerCase();
  } else if (key === 'textureVisible') {
    if (typeof value !== 'boolean') editFail('FIELD_INVALID', { field: 'arguments.value' });
  } else {
    if (typeof value !== 'number' || !Number.isFinite(value)) editFail('FIELD_INVALID', { field: 'arguments.value' });
    const bounds = key === 'gridSize' ? { min: 8, max: 100 }
      : key === 'fiberAngle' ? { min: -90, max: 90 }
      : key === 'seed' ? { min: 0, max: 4294967295, integer: true }
      : { min: 0, max: 1 };
    value = boundedNumber(value, 'arguments.value', bounds);
  }
  return { key, value };
}

function normalizeArtboardSetArguments(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['key', 'value'].includes(key))) editFail('ARGUMENTS_INVALID');
  const key = boundedEnum(raw.key, 'arguments.key', CHAT_ARTBOARD_KEYS);
  let value = raw.value;
  if (key === 'orientation') value = boundedEnum(value, 'arguments.value', ['portrait', 'landscape']);
  else if (key === 'ppi') {
    value = boundedNumber(value, 'arguments.value', { min: 72, max: 600, integer: true });
    if (![72, 96, 150, 300, 600].includes(value)) editFail('ARGUMENT_INVALID', { field: 'arguments.value' });
  } else if (key === 'bleedMm') value = boundedNumber(value, 'arguments.value', { min: 0, max: 25 });
  else if (key === 'safeMarginMm') value = boundedNumber(value, 'arguments.value', { min: 0, max: 2500 });
  else if (key === 'unit') value = boundedEnum(value, 'arguments.value', ['mm', 'px']);
  else value = boundedBoolean(value, 'arguments.value');
  return { key, value };
}

function normalizeSnapSetArguments(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['key', 'value'].includes(key))) editFail('ARGUMENTS_INVALID');
  return {
    key: boundedEnum(raw.key, 'arguments.key', CHAT_SNAP_KEYS),
    value: boundedBoolean(raw.value, 'arguments.value')
  };
}

function normalizeGuideAddArguments(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['id', 'orientation', 'position', 'locked', 'visible'].includes(key))) editFail('ARGUMENTS_INVALID');
  const result = {
    orientation: boundedEnum(raw.orientation, 'arguments.orientation', ['horizontal', 'vertical']),
    position: boundedNumber(raw.position, 'arguments.position')
  };
  const id = boundedText(raw.id, 'arguments.id', { required: false, max: 160 });
  if (id) result.id = id;
  if (raw.locked != null) result.locked = boundedBoolean(raw.locked, 'arguments.locked');
  if (raw.visible != null) result.visible = boundedBoolean(raw.visible, 'arguments.visible');
  return result;
}

function normalizeGuideIdArguments(raw, extra = []) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['guideId', ...extra].includes(key))) editFail('ARGUMENTS_INVALID');
  return { guideId: boundedText(raw.guideId, 'arguments.guideId', { max: 160 }) };
}

function normalizeOperationArguments(operation, raw) {
  if (operation === 'material.template.create.v1') return normalizeMaterialTemplateCreateArguments(raw);
  if (operation === 'material.instance.create.v1') return normalizeMaterialInstanceCreateArguments(raw);
  if (operation === 'recipe.studio.execute.v1') return normalizeStudioRecipeExecuteArguments(raw);
  if (operation === 'page.create.v1') return normalizeNoArguments(raw);
  if (operation === 'page.duplicate.v1' || operation === 'page.delete.v1' || operation === 'page.activate.v1') return normalizePageIdArguments(raw);
  if (operation === 'page.rename.v1') return normalizePageRenameArguments(raw);
  if (operation === 'page.paper.set.v1') return normalizePaperSetArguments(raw);
  if (operation === 'page.artboard.set.v1') return normalizeArtboardSetArguments(raw);
  if (operation === 'page.snap.set.v1') return normalizeSnapSetArguments(raw);
  if (operation === 'guide.add.v1') return normalizeGuideAddArguments(raw);
  if (operation === 'guide.move.v1') {
    const base = normalizeGuideIdArguments(raw, ['position']);
    return { ...base, position: boundedNumber(raw.position, 'arguments.position') };
  }
  if (operation === 'guide.remove.v1') return normalizeGuideIdArguments(raw);
  if (operation === 'guide.lock.set.v1') {
    const base = normalizeGuideIdArguments(raw, ['locked']);
    return { ...base, locked: boundedBoolean(raw.locked, 'arguments.locked') };
  }
  if (operation === 'guide.visibility.set.v1') {
    const base = normalizeGuideIdArguments(raw, ['visible']);
    return { ...base, visible: boundedBoolean(raw.visible, 'arguments.visible') };
  }
  if (operation === 'path.repaint.v1') return normalizeRepaintArguments(raw);
  if (operation === 'path.material.apply.v1') return normalizeMaterialArguments(raw);
  if (operation === 'path.material.remove.v1') {
    if (raw != null && (typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length)) editFail('ARGUMENTS_INVALID');
    return {};
  }
  if (operation === 'object.translate.v1') {
    const dx = boundedNumber(raw?.dx, 'arguments.dx');
    const dy = boundedNumber(raw?.dy, 'arguments.dy');
    if (dx === 0 && dy === 0) editFail('NO_OP');
    return { dx, dy };
  }
  if (operation === 'object.align.v1') {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => key !== 'mode')) editFail('ARGUMENTS_INVALID');
    return { mode: boundedEnum(raw.mode, 'arguments.mode', CHAT_OBJECT_ALIGN_MODES) };
  }
  if (operation === 'path.simplify.v1') {
    return {
      tolerance: boundedNumber(raw?.tolerance ?? 0.75, 'arguments.tolerance', { min: 0, max: 1e6 }),
      handleTolerance: boundedNumber(raw?.handleTolerance ?? Math.max(0.05, Number(raw?.tolerance ?? 0.75) * 0.25), 'arguments.handleTolerance', { min: 0, max: 1e6 }),
      maxPasses: boundedNumber(raw?.maxPasses ?? 256, 'arguments.maxPasses', { min: 1, max: 4096, integer: true })
    };
  }
  if (operation === 'path.refine.v1') {
    return {
      maxControlLength: boundedNumber(raw?.maxControlLength ?? 48, 'arguments.maxControlLength', { min: Number.EPSILON, max: 1e6 }),
      maxAddedAnchors: boundedNumber(raw?.maxAddedAnchors ?? 128, 'arguments.maxAddedAnchors', { min: 1, max: 4096, integer: true })
    };
  }
  if (operation === 'path.create.v1') return normalizePathCreateArguments(raw);
  if (operation === 'stroke.create.v1') return normalizeStrokeCreateArguments(raw);
  if (operation === 'stroke.erase.circle.v1') {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('ARGUMENTS_INVALID');
    return {
      x: boundedNumber(raw.x, 'arguments.x'),
      y: boundedNumber(raw.y, 'arguments.y'),
      radius: boundedNumber(raw.radius, 'arguments.radius', { min: Number.EPSILON, max: 1e6 })
    };
  }
  if (operation === 'paint.session.create.v1') return normalizePaintSessionCreateArguments(raw);
  if (operation === 'image.adjustment.add.v1') return normalizeImageAdjustmentArguments(raw);
  if (operation === 'image.filter.add.v1') return normalizeImageFilterArguments(raw);
  if (operation === 'image.blend.set.v1') return normalizeImageBlendArguments(raw);
  if (operation === 'image.effect.add.v1') return normalizeImageEffectArguments(raw);
  if (operation === 'image.liquify.add.v1') return normalizeImageLiquifyArguments(raw);
  if (operation === 'image.raster.paintBucket.v1') return normalizeImageRasterPaintBucketArguments(raw);
  if (operation === 'image.mask.raster.set.v1') return normalizeImageRasterMaskArguments(raw);
  if (operation === 'image.raster.spotHeal.v1') return normalizeImageRasterSpotHealArguments(raw);
  if (operation === 'image.raster.localRetouch.v1') return normalizeImageRasterLocalRetouchArguments(raw);
  if (operation === 'image.raster.sourceRetouch.v1') return normalizeImageRasterSourceRetouchArguments(raw);
  if (operation === 'path.warp.v1') return normalizePathWarpArguments(raw);
  if (operation === 'path.distort.v1' || operation === 'path.perspective.v1') return normalizePathProjectiveArguments(raw, operation);
  if (operation === 'path.edit.v1') return normalizePathEditArguments(raw);
  if (operation === 'object.rotate.v1') return normalizeRotateArguments(raw);
  if (operation === 'object.clone.v1') return normalizeCloneArguments(raw);
  if (operation === 'repeat.radial.v1') return normalizeRepeatRadialArguments(raw);
  if (operation === 'boolean.apply.v1') return normalizeBooleanArguments(raw);
  if (operation === 'group.create.v1') return normalizeGroupArguments(raw);
  if (operation === 'object.reparent.v1') return normalizeReparentArguments(raw);
  if (operation === 'frame.create.v1') return normalizeFrameCreateArguments(raw);
  if (operation === 'text.create.v1') return normalizeTextCreateArguments(raw);
  if (operation === 'text.edit.v1') return normalizeTextEditArguments(raw);
  if (operation === 'text.path.set.v1') return normalizeTextPathSetArguments(raw);
  if (operation === 'svg.import.v1') return normalizeSvgImportArguments(raw);
  if (operation === 'object.resize.v1') return normalizeResizeArguments(raw);
  if (operation === 'object.scale.v1') return normalizeScaleArguments(raw);
  if (operation === 'object.order.v1') return normalizeOrderArguments(raw);
  if (operation === 'repeat.mirror.v1') return normalizeRepeatMirrorArguments(raw);
  if (operation === 'repeat.grid.v1') return normalizeRepeatGridArguments(raw);
  if (operation === 'layout.frame.set.v1') return normalizeFrameLayoutSetArguments(raw);
  if (operation === 'layout.frame.remove.v1') return normalizeNoArguments(raw);
  if (operation === 'layout.item.set.v1') return normalizeLayoutItemSetArguments(raw);
  if (operation === 'layout.item.remove.v1') return normalizeNoArguments(raw);
  if (operation === 'component.register.v1') return normalizeComponentRegisterArguments(raw);
  if (operation === 'component.instance.create.v1') return normalizeComponentInstanceCreateArguments(raw);
  if (operation === 'component.override.set.v1') return normalizeComponentOverrideSetArguments(raw);
  if (operation === 'component.override.reset.v1') return normalizeComponentOverrideResetArguments(raw);
  if (operation === 'component.instance.detach.v1') return normalizeNoArguments(raw);
  if (operation === 'component.definition.duplicate.v1') return normalizeComponentDefinitionDuplicateArguments(raw);
  if (operation === 'component.reference.repair.v1') return normalizeComponentReferenceRepairArguments(raw);
  editFail('OPERATION_NOT_ALLOWED', { operation });
}

function operationTargetRules(operation) {
  if (CHAT_PAGE_OPERATION_SET.has(operation) || operation === 'page.paper.set.v1' || operation === 'page.artboard.set.v1' || CHAT_PRECISION_LAYOUT_OPERATION_SET.has(operation) || CHAT_MATERIAL_OPERATION_SET.has(operation)) return { exact: 0, min: 0, max: 0 };
  if (operation === 'recipe.studio.execute.v1') return { min: 0, max: 64 };
  if (operation === 'path.create.v1' || operation === 'stroke.create.v1' || operation === 'paint.session.create.v1' || operation === 'frame.create.v1' || operation === 'text.create.v1' || operation === 'svg.import.v1' || operation === 'component.instance.create.v1' || operation === 'component.definition.duplicate.v1') return { exact: 0, min: 0, max: 0 };
  if (operation === 'image.adjustment.add.v1'
    || operation === 'image.filter.add.v1'
    || operation === 'image.blend.set.v1'
    || operation === 'image.effect.add.v1'
    || operation === 'image.liquify.add.v1'
    || operation === 'image.raster.paintBucket.v1'
    || operation === 'image.mask.raster.set.v1'
    || operation === 'image.raster.spotHeal.v1'
    || operation === 'image.raster.localRetouch.v1'
    || operation === 'image.raster.sourceRetouch.v1'
    || operation === 'path.warp.v1'
    || operation === 'path.distort.v1'
    || operation === 'path.perspective.v1'
    || operation === 'path.edit.v1'
    || operation.startsWith('path.simplify.')
    || operation.startsWith('path.refine.')
    || operation === 'object.clone.v1'
    || operation === 'repeat.radial.v1'
    || operation === 'object.reparent.v1'
    || operation === 'text.edit.v1'
    || operation === 'text.path.set.v1'
    || operation === 'object.resize.v1'
    || operation === 'repeat.mirror.v1'
    || operation === 'repeat.grid.v1'
    || operation === 'layout.frame.set.v1'
    || operation === 'layout.frame.remove.v1'
    || operation === 'layout.item.set.v1'
    || operation === 'layout.item.remove.v1'
    || operation === 'component.register.v1'
    || operation === 'component.override.set.v1'
    || operation === 'component.override.reset.v1'
    || operation === 'component.instance.detach.v1'
    || operation === 'component.reference.repair.v1') return { exact: 1, max: 1 };
  if (operation === 'boolean.apply.v1') return { min: 2, max: 64 };
  if (operation === 'object.align.v1') return { min: 2, max: 64 };
  return { min: 1, max: 64 };
}

function normalizeExpected(raw) {
  if (raw == null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('EXPECTED_INVALID');
  const expected = {};
  if (raw.paperFingerprint != null) expected.paperFingerprint = boundedText(raw.paperFingerprint, 'expected.paperFingerprint', { max: 160 });
  if (raw.artboardFingerprint != null) expected.artboardFingerprint = boundedText(raw.artboardFingerprint, 'expected.artboardFingerprint', { max: 160 });
  if (raw.precisionFingerprint != null) expected.precisionFingerprint = boundedText(raw.precisionFingerprint, 'expected.precisionFingerprint', { max: 160 });
  if (raw.materialLibraryFingerprint != null) expected.materialLibraryFingerprint = boundedText(raw.materialLibraryFingerprint, 'expected.materialLibraryFingerprint', { max: 160 });
  if (raw.recipeRegistryFingerprint != null) expected.recipeRegistryFingerprint = boundedText(raw.recipeRegistryFingerprint, 'expected.recipeRegistryFingerprint', { max: 160 });
  if (raw.documentId != null) expected.documentId = boundedText(raw.documentId, 'expected.documentId', { max: 160 });
  if (raw.pageId != null) expected.pageId = boundedText(raw.pageId, 'expected.pageId', { max: 160 });
  if (hasOwn(raw, 'revisionId')) {
    expected.revisionId = raw.revisionId == null
      ? null
      : boundedText(raw.revisionId, 'expected.revisionId', { max: 220 });
  }
  if (raw.targetFingerprints != null) {
    if (!raw.targetFingerprints || typeof raw.targetFingerprints !== 'object' || Array.isArray(raw.targetFingerprints)) editFail('EXPECTED_INVALID');
    const keys = Object.keys(raw.targetFingerprints);
    if (keys.length > 64) editFail('EXPECTED_INVALID');
    expected.targetFingerprints = Object.fromEntries(keys.sort().map(key => [
      boundedText(key, 'expected.targetFingerprints.key', { max: 360 }),
      boundedText(raw.targetFingerprints[key], `expected.targetFingerprints.${key}`, { max: 160 })
    ]));
  }
  return expected;
}

export function normalizeChatEditTask(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) editFail('TASK_INVALID');
  if (raw.schema != null && raw.schema !== CHAT_EDIT_TASK_SCHEMA) editFail('SCHEMA_UNSUPPORTED', { schema: raw.schema });
  if (raw.version != null && Number(raw.version) !== CHAT_EDIT_TASK_VERSION) editFail('VERSION_UNSUPPORTED', { version: raw.version });
  const operation = boundedText(raw.operation, 'operation', { max: 80 });
  if (!CHAT_EDIT_OPERATION_SET.has(operation)) editFail('OPERATION_NOT_ALLOWED', { operation });
  return {
    schema: CHAT_EDIT_TASK_SCHEMA,
    version: CHAT_EDIT_TASK_VERSION,
    taskId: boundedText(raw.taskId, 'taskId', { max: 160 }),
    operation,
    targets: normalizeTargets(raw.targets, operationTargetRules(operation)),
    arguments: normalizeOperationArguments(operation, raw.arguments),
    expected: normalizeExpected(raw.expected)
  };
}

export function createChatEditProposal(rawTask, { proposalId = null, expected = null, stateFingerprint = null } = {}) {
  const task = normalizeChatEditTask(rawTask);
  const identity = proposalId || `proposal:${task.taskId}:${chatStateFingerprint(task).slice(-8)}`;
  return {
    schema: CHAT_EDIT_PROPOSAL_SCHEMA,
    version: CHAT_EDIT_PROPOSAL_VERSION,
    proposalId: boundedText(identity, 'proposalId', { max: 220 }),
    task,
    expected: normalizeExpected(expected ?? task.expected),
    revisionId: normalizeExpected(expected ?? task.expected)?.revisionId ?? null,
    stateFingerprint: stateFingerprint ? boundedText(stateFingerprint, 'stateFingerprint', { max: 160 }) : null,
    state: 'PROPOSED',
    approved: false,
    approvalToken: null
  };
}

export function chatEditDiagnostic(error, phase = 'unknown') {
  const code = typeof error?.code === 'string' ? error.code : 'CHAT_EDIT_UNKNOWN';
  const diagnostic = { ok: false, phase, code };
  for (const key of ['field', 'operation', 'index', 'objectId', 'pageId', 'layerId', 'expected', 'actual']) {
    if (error?.[key] !== undefined) diagnostic[key] = clone(error[key]);
  }
  return diagnostic;
}


function targetRefKey(ref) {
  return `${ref.layerId}/${ref.objectId}`;
}

function operationRequiresPath(operation) {
  return operation.startsWith('path.') && operation !== 'path.create.v1';
}

const CHAT_RASTER_IMAGE_OPERATION_SET = new Set([
  'image.adjustment.add.v1',
  'image.filter.add.v1',
  'image.blend.set.v1',
  'image.effect.add.v1',
  'image.liquify.add.v1',
  'image.raster.paintBucket.v1',
  'image.mask.raster.set.v1',
  'image.raster.spotHeal.v1',
  'image.raster.localRetouch.v1',
  'image.raster.sourceRetouch.v1'
]);

function currentTargetFingerprint(page, found, operation = null) {
  const summary = summarizeChatObject(page.id, found);
  if (!CHAT_RASTER_IMAGE_OPERATION_SET.has(operation) || found.object?.type !== 'image') return summary.stateFingerprint;
  return chatStateFingerprint({
    stateFingerprint: summary.stateFingerprint,
    rasterContentFingerprint: serializedColorRasterFingerprint(found.object?.rasterState?.colorRaster),
    rasterMaskFingerprint: rasterMaskFingerprint(found.object?.rasterMask)
  });
}

function recipeRegistryFingerprint(app) {
  const engine = app?.studio?.engine;
  if (!engine || typeof engine.list !== 'function') return null;
  return chatStateFingerprint(engine.list());
}

function validateStudioRecipeParameters(recipe, parameters) {
  const specs = recipe?.parameters && typeof recipe.parameters === 'object' ? recipe.parameters : {};
  for (const [name, value] of Object.entries(parameters || {})) {
    const field = `arguments.parameters.${name}`;
    const spec = specs[name];
    if (!spec || typeof spec !== 'object') editFail('RECIPE_PARAMETER_UNKNOWN', { field, actual: name });
    const type = String(spec.type || '').toLowerCase();
    if (type === 'number' || type === 'integer') {
      if (typeof value !== 'number' || !Number.isFinite(value) || (type === 'integer' && !Number.isInteger(value))) {
        editFail('RECIPE_PARAMETER_TYPE', { field, expected: type, actual: typeof value });
      }
      if (Number.isFinite(Number(spec.min)) && value < Number(spec.min)) editFail('RECIPE_PARAMETER_RANGE', { field, expected: { min: Number(spec.min) }, actual: value });
      if (Number.isFinite(Number(spec.max)) && value > Number(spec.max)) editFail('RECIPE_PARAMETER_RANGE', { field, expected: { max: Number(spec.max) }, actual: value });
    } else if (type === 'boolean') {
      if (typeof value !== 'boolean') editFail('RECIPE_PARAMETER_TYPE', { field, expected: type, actual: typeof value });
    } else if (type === 'string' || type === 'color') {
      if (typeof value !== 'string' || !value.trim() || value.length > 512) editFail('RECIPE_PARAMETER_TYPE', { field, expected: type, actual: typeof value });
    }
    const allowed = Array.isArray(spec.enum) ? spec.enum : Array.isArray(spec.values) ? spec.values : Array.isArray(spec.options) ? spec.options : null;
    if (allowed && !allowed.some(item => Object.is(item, value))) editFail('RECIPE_PARAMETER_ENUM', { field, expected: allowed, actual: value });
  }
}

function captureExpectedState(app, task, resolved) {
  const page = app.page();
  return {
    documentId: app.doc?.id || null,
    pageId: page?.id || null,
    revisionId: app?.revisions?.revisionIdFor?.(app.doc?.id) ?? null,
    ...(task.operation === 'page.paper.set.v1' ? { paperFingerprint: chatStateFingerprint(page.paper) } : {}),
    ...(task.operation === 'page.artboard.set.v1' ? { artboardFingerprint: artboardFingerprint(page) } : {}),
    ...(CHAT_PRECISION_LAYOUT_OPERATION_SET.has(task.operation) ? { precisionFingerprint: precisionLayoutFingerprint(page) } : {}),
    ...(CHAT_MATERIAL_OPERATION_SET.has(task.operation) ? { materialLibraryFingerprint: chatStateFingerprint(app.doc?.materialLibrary || null) } : {}),
    ...(CHAT_RECIPE_OPERATION_SET.has(task.operation) ? { recipeRegistryFingerprint: recipeRegistryFingerprint(app) } : {}),
    targetFingerprints: Object.fromEntries([
      ...resolved.map(({ ref, found }) => [targetRefKey(ref), currentTargetFingerprint(page, found, task.operation)]),
      ...(task.operation === 'text.path.set.v1'
        ? (() => {
            const pathFound = findPageObject(page, task.arguments.pathRef);
            return pathFound ? [[targetRefKey(task.arguments.pathRef), currentTargetFingerprint(page, pathFound, task.operation)]] : [];
          })()
        : [])
    ].sort((a, b) => a[0].localeCompare(b[0])))
  };
}

export function validateChatEditTaskAgainstState(app, rawTask, { expected = null, requireHistoryIdle = false } = {}) {
  const task = normalizeChatEditTask(rawTask);
  if (typeof app?.commands?.has === 'function' && !app.commands.has(task.operation)) editFail('CAPABILITY_UNAVAILABLE', { operation: task.operation });
  const document = app?.doc;
  const page = typeof app?.page === 'function' ? app.page() : null;
  if (!document || !page) editFail('STATE_UNAVAILABLE');
  if (requireHistoryIdle && app.history?.pending) editFail('HISTORY_BUSY');

  const preconditions = normalizeExpected(expected ?? task.expected);
  if (preconditions?.documentId && preconditions.documentId !== document.id) {
    editFail('STALE_DOCUMENT', { expected: preconditions.documentId, actual: document.id || null });
  }
  if (preconditions?.pageId && preconditions.pageId !== page.id) {
    editFail('STALE_PAGE', { expected: preconditions.pageId, actual: page.id || null });
  }
  if (CHAT_MATERIAL_OPERATION_SET.has(task.operation)) {
    if (!app.history?.pushScoped) editFail('CONTROLLER_UNAVAILABLE', { operation: task.operation });
    const actualLibraryFingerprint = chatStateFingerprint(document.materialLibrary || null);
    if (preconditions?.materialLibraryFingerprint && preconditions.materialLibraryFingerprint !== actualLibraryFingerprint) {
      editFail('STALE_MATERIAL_LIBRARY', { expected: preconditions.materialLibraryFingerprint, actual: actualLibraryFingerprint });
    }
    if (task.operation === 'material.template.create.v1') {
      try { createMaterialTemplate(clone(document), task.arguments.template, { replace: false }); }
      catch (error) { editFail('MATERIAL_TEMPLATE_INVALID', { actual: error?.code || error?.message || 'UNKNOWN' }); }
    } else {
      const probeDocument = clone(document);
      let template;
      try { template = getMaterialTemplate(probeDocument, task.arguments.templateId); }
      catch { editFail('MATERIAL_TEMPLATE_MISSING', { actual: task.arguments.templateId }); }
      if (String(template.templateVersion) !== String(task.arguments.templateVersion)) {
        editFail('MATERIAL_TEMPLATE_VERSION_MISMATCH', { expected: task.arguments.templateVersion, actual: template.templateVersion ?? null });
      }
      if (!(page.layers || []).some(layer => layer.id === task.arguments.layerId)) editFail('LAYER_MISSING', { layerId: task.arguments.layerId });
      try {
        createMaterialInstance(probeDocument, task.arguments.templateId, {
          instanceId: task.arguments.instanceId,
          instanceKey: task.arguments.instanceKey,
          name: task.arguments.name,
          parameterOverrides: task.arguments.parameterOverrides,
          transform: task.arguments.transform,
          layerId: task.arguments.layerId,
          semanticRole: task.arguments.semanticRole
        });
      } catch (error) { editFail('MATERIAL_INSTANCE_INVALID', { actual: error?.code || error?.message || 'UNKNOWN' }); }
    }
  }
  if (CHAT_RECIPE_OPERATION_SET.has(task.operation)) {
    const engine = app?.studio?.engine;
    if (!engine || typeof engine.describe !== 'function' || typeof engine.execute !== 'function' || typeof engine.replayReport !== 'function') {
      editFail('CONTROLLER_UNAVAILABLE', { operation: task.operation });
    }
    const actualRegistryFingerprint = recipeRegistryFingerprint(app);
    if (preconditions?.recipeRegistryFingerprint && preconditions.recipeRegistryFingerprint !== actualRegistryFingerprint) {
      editFail('STALE_RECIPE_REGISTRY', { expected: preconditions.recipeRegistryFingerprint, actual: actualRegistryFingerprint });
    }
    let recipe;
    try { recipe = engine.describe(task.arguments.recipeId); }
    catch { editFail('RECIPE_NOT_FOUND', { actual: task.arguments.recipeId }); }
    if (String(recipe.version) !== String(task.arguments.recipeVersion)) {
      editFail('RECIPE_VERSION_MISMATCH', { expected: task.arguments.recipeVersion, actual: recipe.version ?? null });
    }
    if (!recipe.capabilities?.supported) editFail('RECIPE_CAPABILITY_UNSUPPORTED', { actual: recipe.capabilities?.unsupported || [] });
    validateStudioRecipeParameters(recipe, task.arguments.parameters);
    if (task.arguments.roles.length !== task.targets.length) editFail('RECIPE_ROLE_BINDING_COUNT_MISMATCH', { expected: task.targets.length, actual: task.arguments.roles.length });
    const registered = engine.recipes?.get?.(task.arguments.recipeId);
    if (!task.targets.length && (!registered || registered.targets?.some(target=>target?.required === true) || registered.steps?.some(step=>step.enabled !== false && step.role && !step.optional))) editFail('RECIPE_EXTERNAL_TARGET_REQUIRED');
    if (!(registered?.steps||[]).some(step=>step.enabled!==false && step.op!=='checkpoint')) editFail('RECIPE_NO_OP');
  }
  if (CHAT_PAGE_OPERATION_SET.has(task.operation)) {
    if (!app?.commands?.has?.(task.operation)) editFail('CAPABILITY_UNAVAILABLE', { operation: task.operation });
    const pages = Array.isArray(document.pages) ? document.pages : [];
    const pageId = task.arguments.pageId || null;
    const targetPage = pageId ? pages.find(item => item.id === pageId) || null : null;
    if (pageId && !targetPage) editFail('PAGE_MISSING', { pageId });
    if (task.operation === 'page.delete.v1' && pages.length <= 1) editFail('MINIMUM_PAGE_REQUIRED', { pageId });
    if (task.operation === 'page.rename.v1' && targetPage?.name === task.arguments.name) editFail('NO_OP', { pageId });
    if (task.operation === 'page.activate.v1' && document.activePageId === pageId) editFail('NO_OP', { pageId });
  }
  if (task.operation === 'page.artboard.set.v1') {
    if (typeof app.changeArtboard !== 'function' || !page.artboard) editFail('CONTROLLER_UNAVAILABLE');
    if (preconditions?.artboardFingerprint && preconditions.artboardFingerprint !== artboardFingerprint(page)) editFail('STALE_ARTBOARD');
    const { key, value } = task.arguments;
    if (key === 'safeMarginMm') {
      const width = Number(page.artboard.widthMm);
      const height = Number(page.artboard.heightMm);
      const maxSafe = Math.min(width, height) / 2;
      if (!Number.isFinite(maxSafe) || value > maxSafe) editFail('ARGUMENT_INVALID', { field: 'arguments.value' });
    }
    if (page.artboard[key] === value) editFail('NO_OP');
  }
  if (task.operation === 'page.paper.set.v1') {
    if (app.paperPreview) editFail('PAPER_PREVIEW_BUSY');
    if (typeof app.changePaper !== 'function' || !page.paper) editFail('CONTROLLER_UNAVAILABLE');
    if (preconditions?.paperFingerprint && preconditions.paperFingerprint !== chatStateFingerprint(page.paper)) editFail('STALE_PAPER');
    if (page.paper[task.arguments.key] === task.arguments.value) editFail('NO_OP');
  }
  if (CHAT_PRECISION_LAYOUT_OPERATION_SET.has(task.operation)) {
    if (!app?.commands?.has?.(task.operation)) editFail('CAPABILITY_UNAVAILABLE', { operation: task.operation });
    if (preconditions?.precisionFingerprint && preconditions.precisionFingerprint !== precisionLayoutFingerprint(page)) editFail('STALE_PRECISION_LAYOUT');
    const guideById = id => (Array.isArray(page.guides) ? page.guides : []).find(guide => guide?.id === id) || null;
    if (task.operation === 'page.snap.set.v1') {
      const { key, value } = task.arguments;
      if (key === 'enabled') {
        if ((page.snap?.enabled !== false) === value) editFail('NO_OP');
      } else {
        const defaults = { guides: true, edges: true, centers: true, grid: false, angle: true, equalDistance: true };
        const current = page.snap?.categories?.[key] ?? defaults[key];
        if (Boolean(current) === value) editFail('NO_OP');
      }
    } else if (task.operation === 'guide.add.v1') {
      if (task.arguments.id && guideById(task.arguments.id)) editFail('GUIDE_ID_DUPLICATE', { guideId: task.arguments.id });
    } else {
      const guide = guideById(task.arguments.guideId);
      if (!guide) editFail('GUIDE_NOT_FOUND', { guideId: task.arguments.guideId });
      if (task.operation === 'guide.move.v1') {
        if (guide.locked) editFail('GUIDE_LOCKED', { guideId: guide.id });
        if (Number(guide.position) === task.arguments.position) editFail('NO_OP');
      }
      if (task.operation === 'guide.lock.set.v1' && Boolean(guide.locked) === task.arguments.locked) editFail('NO_OP');
      if (task.operation === 'guide.visibility.set.v1' && (guide.visible !== false) === task.arguments.visible) editFail('NO_OP');
    }
  }
  if (preconditions && hasOwn(preconditions, 'revisionId')) {
    const actualRevisionId = app?.revisions?.revisionIdFor?.(document.id) ?? null;
    if (preconditions.revisionId !== actualRevisionId) {
      editFail('STALE_REVISION', { expected: preconditions.revisionId, actual: actualRevisionId });
    }
  }

  const resolved = task.targets.map(ref => {
    if (ref.pageId !== page.id) editFail('TARGET_PAGE_INACTIVE', { pageId: ref.pageId, actual: page.id || null });
    const found = findPageObject(page, ref);
    if (!found) editFail('TARGET_MISSING', { layerId: ref.layerId, objectId: ref.objectId });
    if ((operationRequiresPath(task.operation) || task.operation === 'boolean.apply.v1' || task.operation === 'recipe.studio.execute.v1') && found.object?.type !== 'path') {
      editFail('PATH_REQUIRED', { objectId: found.object?.id || null });
    }
    if (task.operation === 'stroke.erase.circle.v1' && found.object?.type !== 'stroke') {
      editFail('STROKE_REQUIRED', { objectId: found.object?.id || null });
    }
    if ((task.operation === 'text.edit.v1' || task.operation === 'text.path.set.v1') && found.object?.type !== 'text') {
      editFail('TEXT_REQUIRED', { objectId: found.object?.id || null });
    }
    if (CHAT_RASTER_IMAGE_OPERATION_SET.has(task.operation)
      && (found.object?.type !== 'image' || !found.object?.rasterState?.colorRaster)) {
      editFail('RASTER_IMAGE_REQUIRED', { objectId: found.object?.id || null });
    }
    if (task.operation === 'image.blend.set.v1' && (found.object?.blendMode || 'source-over') === task.arguments.mode) {
      editFail('NO_OP', { objectId: found.object?.id || null });
    }
    if (found.effectiveLocked) editFail('TARGET_LOCKED', { objectId: found.object.id });
    if (found.effectiveVisible === false) editFail('TARGET_HIDDEN', { objectId: found.object.id });
    const stableRefHierarchyEscape = task.operation === 'object.reparent.v1';
    if (found.interactionExposed === false && !stableRefHierarchyEscape) {
      editFail('TARGET_UNEXPOSED', { objectId: found.object.id });
    }
    if (!Matrix.isInvertible(found.worldMatrix || found.object?.matrix || Matrix.identity())) {
      editFail('TARGET_SINGULAR', { objectId: found.object.id });
    }
    const expectedFingerprint = preconditions?.targetFingerprints?.[targetRefKey(ref)];
    if (expectedFingerprint) {
      const actualFingerprint = currentTargetFingerprint(page, found, task.operation);
      if (actualFingerprint !== expectedFingerprint) {
        editFail('TARGET_STALE', { objectId: found.object.id, expected: expectedFingerprint, actual: actualFingerprint });
      }
    }
    return { ref, found };
  });

  if (task.operation === 'text.path.set.v1') {
    const textFound = resolved[0]?.found || null;
    const pathRef = task.arguments.pathRef;
    if (pathRef.pageId !== page.id) editFail('PATH_REF_PAGE_INACTIVE', { pageId: pathRef.pageId, actual: page.id || null });
    const pathFound = findPageObject(page, pathRef);
    if (!pathFound) editFail('PATH_REF_MISSING', { layerId: pathRef.layerId, objectId: pathRef.objectId });
    if (pathFound.object?.type !== 'path') editFail('PATH_REQUIRED', { objectId: pathFound.object?.id || null });
    const textParentId = textFound?.parentObject?.id || null;
    const pathParentId = pathFound.parentObject?.id || null;
    if (pathFound.layer?.id !== textFound?.layer?.id || pathParentId !== textParentId) {
      editFail('PATH_TEXT_CONTAINER_MISMATCH', { objectId: pathFound.object.id });
    }
    if (!Matrix.isInvertible(textFound.object?.matrix || Matrix.identity())) {
      editFail('TARGET_SINGULAR', { objectId: textFound.object.id });
    }
    if (!Matrix.isInvertible(pathFound.worldMatrix || pathFound.object?.matrix || Matrix.identity())) {
      editFail('TARGET_SINGULAR', { objectId: pathFound.object.id });
    }
    const expectedPathFingerprint = preconditions?.targetFingerprints?.[targetRefKey(pathRef)];
    if (expectedPathFingerprint) {
      const actualPathFingerprint = currentTargetFingerprint(page, pathFound, task.operation);
      if (actualPathFingerprint !== expectedPathFingerprint) {
        editFail('TARGET_STALE', { objectId: pathFound.object.id, expected: expectedPathFingerprint, actual: actualPathFingerprint });
      }
    }
    const current = textFound.object.pathText || null;
    if (current?.pathId === pathFound.object.id
      && Number(current.startOffset || 0) === task.arguments.startOffset
      && (current.overflow || 'clip') === task.arguments.overflow) {
      editFail('NO_OP', { objectId: textFound.object.id });
    }
  }

  return { task, resolved, expected: preconditions };
}

export class ChatBoundedEditController {
  constructor(app) {
    this.app = app;
    this.proposals = new Map();
    this.approvalSequence = 0;
  }

  inspect() {
    return buildChatStateSummary(this.app);
  }

  getProposal(proposalId) {
    const proposal = this.proposals.get(String(proposalId || ''));
    return proposal ? clone(proposal) : null;
  }

  propose(rawTask) {
    const { task, resolved } = validateChatEditTaskAgainstState(this.app, rawTask);
    const summary = this.inspect();
    const expected = captureExpectedState(this.app, task, resolved);
    const proposal = createChatEditProposal(task, {
      expected,
      stateFingerprint: chatStateFingerprint(summary)
    });
    if (this.proposals.has(proposal.proposalId)) editFail('PROPOSAL_EXISTS', { proposalId: proposal.proposalId });
    this.proposals.set(proposal.proposalId, proposal);
    return clone(proposal);
  }

  approve(proposalId) {
    const key = String(proposalId || '');
    const proposal = this.proposals.get(key);
    if (!proposal) editFail('PROPOSAL_NOT_FOUND');
    if (proposal.state !== 'PROPOSED') editFail('PROPOSAL_STATE_INVALID', { actual: proposal.state });
    validateChatEditTaskAgainstState(this.app, proposal.task, { expected: proposal.expected });
    const approvalToken = `INK-LOCAL-APPROVAL:${proposal.proposalId}:${++this.approvalSequence}`;
    proposal.state = 'APPROVED';
    proposal.approved = true;
    proposal.approvalToken = approvalToken;
    this.proposals.set(key, proposal);
    return clone(proposal);
  }

  reject(proposalId) {
    const key = String(proposalId || '');
    const proposal = this.proposals.get(key);
    if (!proposal) editFail('PROPOSAL_NOT_FOUND');
    if (proposal.state === 'EXECUTED') editFail('PROPOSAL_STATE_INVALID', { actual: proposal.state });
    proposal.state = 'REJECTED';
    proposal.approved = false;
    proposal.approvalToken = null;
    this.proposals.set(key, proposal);
    return clone(proposal);
  }

  assertApproved(proposalId, approvalToken) {
    const proposal = this.proposals.get(String(proposalId || ''));
    if (!proposal) editFail('PROPOSAL_NOT_FOUND');
    if (proposal.state !== 'APPROVED' || !proposal.approved) editFail('APPROVAL_REQUIRED', { actual: proposal.state });
    if (!approvalToken || approvalToken !== proposal.approvalToken) editFail('APPROVAL_TOKEN_INVALID');
    validateChatEditTaskAgainstState(this.app, proposal.task, {
      expected: proposal.expected,
      requireHistoryIdle: true
    });
    return proposal;
  }
}

export function installChatBoundedEdit(app) {
  const controller = new ChatBoundedEditController(app);
  app.chatBoundedEdit = controller;
  app.chatBoundedEditAdapter = createChatBoundedEditAdapter(controller);
  return controller;
}


export const CHAT_EDIT_RESULT_SCHEMA = 'INK-CHAT-EDIT-RESULT';
export const CHAT_EDIT_RESULT_VERSION = 1;

function snapshotRefs(app, refs, operation = null) {
  const page = app.page();
  return refs.map(ref => {
    const found = findPageObject(page, ref);
    if (!found) editFail('TARGET_MISSING', { layerId: ref.layerId, objectId: ref.objectId });
    return {
      ref: clone(ref),
      stateFingerprint: currentTargetFingerprint(page, found, operation),
      worldMatrix: clone(found.worldMatrix || found.object?.matrix || null)
    };
  });
}

function snapshotTaskTargets(app, task) {
  if (CHAT_PAGE_OPERATION_SET.has(task.operation)) return [{
    ref: { pageId: app.doc?.activePageId || null },
    stateFingerprint: chatStateFingerprint({
      activePageId: app.doc?.activePageId || null,
      pages: (app.doc?.pages || []).map(page => ({ id: page.id || null, name: page.name || null }))
    })
  }];
  if (task.operation === 'page.paper.set.v1') return [{ ref: { pageId: app.page().id }, stateFingerprint: chatStateFingerprint(app.page().paper) }];
  if (task.operation === 'page.artboard.set.v1') return [{ ref: { pageId: app.page().id }, stateFingerprint: artboardFingerprint(app.page()) }];
  if (CHAT_PRECISION_LAYOUT_OPERATION_SET.has(task.operation)) return [{ ref: { pageId: app.page().id }, stateFingerprint: precisionLayoutFingerprint(app.page()) }];
  return snapshotRefs(app, task.targets, task.operation);
}

function targetSnapshotsChanged(before, after) {
  if (before.length !== after.length) return true;
  return before.some((item, index) =>
    item.ref.layerId !== after[index]?.ref?.layerId
    || item.ref.objectId !== after[index]?.ref?.objectId
    || item.stateFingerprint !== after[index]?.stateFingerprint);
}

function executeSharedCreativeCommand(app, task) {
  if (!app?.commands?.has?.(task.operation)) editFail('CAPABILITY_UNAVAILABLE', { operation: task.operation });
  const argumentsWithTargetContext = { ...(task.arguments || {}), targetRefs: clone(task.targets || []) };
  const response = app.commands.execute(task.operation, argumentsWithTargetContext, 'chat');
  if (response && typeof response.then === 'function') editFail('SHARED_COMMAND_ASYNC_UNSUPPORTED', { operation: task.operation });
  if (!response?.ok) {
    editFail(response?.error?.code === 'CAPABILITY_UNAVAILABLE' ? 'CAPABILITY_UNAVAILABLE' : 'SHARED_COMMAND_FAILED', {
      operation: task.operation,
      sharedCode: response?.error?.code || null,
      sharedMessage: response?.error?.message || null
    });
  }
  return response.result;
}

ChatBoundedEditController.prototype.execute = function execute(proposalId, approvalToken) {
  const proposal = this.assertApproved(proposalId, approvalToken);
  const beforeTargets = snapshotTaskTargets(this.app, proposal.task);
  const beforeUndoCount = this.app.history?.undoStack?.length ?? null;

  const controllerResult = executeSharedCreativeCommand(this.app, proposal.task);

  const resultRefs = Array.isArray(controllerResult?.resultRefs) ? controllerResult.resultRefs : null;
  const afterTargets = resultRefs ? snapshotRefs(this.app, resultRefs, proposal.task.operation) : snapshotTaskTargets(this.app, proposal.task);
  const afterUndoCount = this.app.history?.undoStack?.length ?? null;
  const changed = controllerResult?.changed === true
    ? true
    : proposal.task.operation === 'stroke.erase.circle.v1'
      ? false
      : (resultRefs ? resultRefs.length > 0 : targetSnapshotsChanged(beforeTargets, afterTargets));
  const latestHistory = this.app.history?.undoStack?.at?.(-1) || null;

  proposal.state = 'EXECUTED';
  proposal.approved = false;
  proposal.approvalToken = null;
  this.proposals.set(proposal.proposalId, proposal);

  return {
    schema: CHAT_EDIT_RESULT_SCHEMA,
    version: CHAT_EDIT_RESULT_VERSION,
    ok: true,
    proposalId: proposal.proposalId,
    taskId: proposal.task.taskId,
    operation: proposal.task.operation,
    state: 'EXECUTED',
    changed,
    targets: afterTargets,
    history: {
      beforeUndoCount,
      afterUndoCount,
      latestLabel: latestHistory?.label || null
    },
    revision: {
      inspectedRevisionId: proposal.revisionId ?? null,
      currentRevisionId: this.app?.revisions?.revisionIdFor?.(this.app?.doc?.id) ?? null,
      documentFingerprint: documentFingerprint(this.app.doc)
    },
    controllerResult: clone(controllerResult ?? null)
  };
};

export function createChatBoundedEditAdapter(appOrController) {
  const controller = appOrController instanceof ChatBoundedEditController
    ? appOrController
    : (appOrController?.chatBoundedEdit || new ChatBoundedEditController(appOrController));

  return Object.freeze({
    inspect() {
      try { return { ok: true, action: 'inspect', result: controller.inspect() }; }
      catch (error) { return chatEditDiagnostic(error, 'inspect'); }
    },
    propose(task) {
      try { return { ok: true, action: 'propose', result: controller.propose(task) }; }
      catch (error) { return chatEditDiagnostic(error, 'propose'); }
    },
    approve(proposalId) {
      try { return { ok: true, action: 'approve', result: controller.approve(proposalId) }; }
      catch (error) { return chatEditDiagnostic(error, 'approve'); }
    },
    reject(proposalId) {
      try { return { ok: true, action: 'reject', result: controller.reject(proposalId) }; }
      catch (error) { return chatEditDiagnostic(error, 'reject'); }
    },
    execute(proposalId, approvalToken) {
      try { return { ok: true, action: 'execute', result: controller.execute(proposalId, approvalToken) }; }
      catch (error) { return chatEditDiagnostic(error, 'execute'); }
    }
  });
}
