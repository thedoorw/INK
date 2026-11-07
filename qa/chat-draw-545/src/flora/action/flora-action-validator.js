import { ACTION_FIELDS, ACTION_ID_RE, FLORA_ACTION_TYPES, FLORA_SCHEMA_VERSION, MAX_COORDINATE, MAX_STROKE_POINTS, OBJECT_ID_RE, canonicalAction } from './flora-action-schema.js';
import { REGION_BLEND_MODES, REGION_DIRECTIONS, REGION_PAINT_OPERATIONS, operationDefaults } from '../painting/region-paint-operations.js';
import { validateCompilerOptions } from '../painting/region-stroke-compiler.js';
import { validateRefinedPaintingParameters } from '../recipe/refined-painting-parameters.js';

const floraIsObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const floraFinite = value => typeof value === 'number' && Number.isFinite(value);
const allowedPayload = {
  createLayer: new Set(['name', 'layerId']),
  createStroke: new Set(['layerId', 'objectId', 'brushPreset', 'color', 'size', 'opacity', 'smoothing', 'pressure', 'taper', 'grain', 'softness', 'flow', 'wetness', 'bristle', 'blendMode', 'points', 'regionId', 'maskId', 'maskRevision', 'regionZ', 'operation', 'direction', 'recipeId', 'recipeOperation', 'recipePass', 'paletteIndex', 'constraints', 'refinement']),
  setLayerVisibility: new Set(['visible']),
  setLayerOpacity: new Set(['opacity']),
  deleteObject: new Set([]),
  paintRegion: new Set(['regionId', 'layerId', 'operation', 'brushPreset', 'color', 'direction', 'density', 'spacing', 'widthRange', 'opacityRange', 'jitter', 'edgeAvoidance', 'coverage', 'blendMode', 'constraints', 'recipeId', 'recipeOperation', 'recipePass', 'paletteIndex', 'objectPrefix', 'palette', 'refinement']),
  clearRegion: new Set(['regionId', 'layerId']),
  setMaskFeather: new Set(['regionId', 'feather']),
  setMaskVisibility: new Set(['regionId', 'visible']),
  invalidateMaskCache: new Set(['regionId'])
};

function rejectUnsupported(object, allowed, prefix, errors) {
  for (const key of Object.keys(object)) if (!allowed.has(key)) errors.push({ code: 'UNSUPPORTED_FIELD', path: `${prefix}.${key}` });
}

function hasCodeLike(value) {
  if (typeof value === 'string') return /<script|javascript:|document\.|window\.|eval\s*\(|Function\s*\(/i.test(value);
  if (Array.isArray(value)) return value.some(hasCodeLike);
  if (floraIsObject(value)) return Object.values(value).some(hasCodeLike);
  return false;
}

function validateId(value, code, path, errors) {
  if (!OBJECT_ID_RE.test(value || '')) errors.push({ code, path });
}

function validateRegionReference(payload, adapter, errors) {
  validateId(payload.regionId, 'REGION_ID', '$.payload.regionId', errors);
  if (OBJECT_ID_RE.test(payload.regionId || '') && !adapter?.regionExists(payload.regionId)) errors.push({ code: 'REGION_NOT_FOUND', path: '$.payload.regionId' });
  if (OBJECT_ID_RE.test(payload.regionId || '') && !adapter?.maskExists(payload.regionId)) errors.push({ code: 'MASK_NOT_FOUND', path: '$.payload.regionId' });
}

export function validateFloraAction(action, adapter) {
  const errors = [];
  if (!floraIsObject(action)) return { ok: false, errors: [{ code: 'INVALID_ACTION', path: '$' }] };
  rejectUnsupported(action, ACTION_FIELDS, '$', errors);
  if (action.schemaVersion !== FLORA_SCHEMA_VERSION) errors.push({ code: 'SCHEMA_VERSION', path: '$.schemaVersion' });
  if (!ACTION_ID_RE.test(action.actionId || '')) errors.push({ code: 'ACTION_ID', path: '$.actionId' });
  if (!FLORA_ACTION_TYPES.includes(action.type)) errors.push({ code: 'ACTION_TYPE', path: '$.type' });
  if (!Number.isSafeInteger(action.seed) || action.seed < 0 || action.seed > 0xffffffff) errors.push({ code: 'SEED', path: '$.seed' });
  if (!floraIsObject(action.metadata) || action.metadata.source !== 'ai' || typeof action.metadata.label !== 'string' || !action.metadata.label.trim() || action.metadata.label.length > 160) errors.push({ code: 'METADATA', path: '$.metadata' });
  if (!floraIsObject(action.payload)) errors.push({ code: 'PAYLOAD', path: '$.payload' });
  if (hasCodeLike(action)) errors.push({ code: 'CODE_OR_DOM_FORBIDDEN', path: '$' });
  if (errors.length || !allowedPayload[action.type]) return { ok: false, errors };

  rejectUnsupported(action.payload, allowedPayload[action.type], '$.payload', errors);
  const payload = action.payload;
  if (action.targetId !== undefined && !OBJECT_ID_RE.test(action.targetId)) errors.push({ code: 'TARGET_ID', path: '$.targetId' });

  if (action.type === 'createLayer') {
    if (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.length > 120) errors.push({ code: 'LAYER_NAME', path: '$.payload.name' });
    if (payload.layerId !== undefined && !OBJECT_ID_RE.test(payload.layerId)) errors.push({ code: 'LAYER_ID', path: '$.payload.layerId' });
  }

  if (action.type === 'createStroke') {
    if (!OBJECT_ID_RE.test(payload.layerId || '') || !adapter?.layerExists(payload.layerId)) errors.push({ code: 'LAYER_NOT_FOUND', path: '$.payload.layerId' });
    if (payload.objectId !== undefined && !OBJECT_ID_RE.test(payload.objectId)) errors.push({ code: 'OBJECT_ID', path: '$.payload.objectId' });
    if (payload.objectId !== undefined && adapter?.objectExists(payload.objectId)) errors.push({ code: 'OBJECT_ID_EXISTS', path: '$.payload.objectId' });
    if (typeof payload.brushPreset !== 'string' || !adapter?.brushPresetExists(payload.brushPreset)) errors.push({ code: 'BRUSH_PRESET_NOT_FOUND', path: '$.payload.brushPreset' });
    if (typeof payload.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(payload.color)) errors.push({ code: 'COLOR', path: '$.payload.color' });
    for (const [key, minimum, maximum] of [['size', .5, 120], ['opacity', 0, 1], ['smoothing', 0, 1], ['pressure', 0, 1], ['taper', 0, 1], ['grain', 0, 1], ['softness', 0, 1], ['flow', 0, 1], ['wetness', 0, 1], ['bristle', 0, 1]]) {
      if (payload[key] !== undefined && (!floraFinite(payload[key]) || payload[key] < minimum || payload[key] > maximum)) errors.push({ code: 'RANGE', path: `$.payload.${key}` });
    }
    if (payload.blendMode !== undefined && !REGION_BLEND_MODES.includes(payload.blendMode)) errors.push({ code: 'BLEND_MODE', path: '$.payload.blendMode' });
    if (payload.regionId !== undefined) {
      validateRegionReference(payload, adapter, errors);
      const mask = adapter?.mask(payload.regionId);
      if (payload.maskId !== undefined && payload.maskId !== mask?.maskId) errors.push({ code: 'MASK_ID_MISMATCH', path: '$.payload.maskId' });
      if (payload.regionZ !== undefined && !floraFinite(payload.regionZ)) errors.push({ code: 'REGION_Z', path: '$.payload.regionZ' });
      if (payload.operation !== undefined && !REGION_PAINT_OPERATIONS.includes(payload.operation)) errors.push({ code: 'PAINT_OPERATION', path: '$.payload.operation' });
      if (payload.direction !== undefined && !REGION_DIRECTIONS.includes(payload.direction)) errors.push({ code: 'DIRECTION', path: '$.payload.direction' });
      if (payload.recipeId !== undefined && !ACTION_ID_RE.test(payload.recipeId)) errors.push({ code: 'RECIPE_ID', path: '$.payload.recipeId' });
      if (payload.recipePass !== undefined && (!Number.isInteger(payload.recipePass) || payload.recipePass < 0 || payload.recipePass > 63)) errors.push({ code: 'RECIPE_PASS', path: '$.payload.recipePass' });
      if (payload.paletteIndex !== undefined && (!Number.isInteger(payload.paletteIndex) || payload.paletteIndex < 0 || payload.paletteIndex > 63)) errors.push({ code: 'PALETTE_INDEX', path: '$.payload.paletteIndex' });
      if (payload.refinement !== undefined) {
        const refined = validateRefinedPaintingParameters(payload.refinement, '$.payload.refinement');
        if (!refined.ok) errors.push(...refined.errors);
      }
    } else if (payload.maskId !== undefined || payload.regionZ !== undefined || payload.operation !== undefined || payload.recipeId !== undefined) errors.push({ code: 'REGION_METADATA_WITHOUT_REGION', path: '$.payload.regionId' });
    if (!Array.isArray(payload.points) || payload.points.length < 1 || payload.points.length > MAX_STROKE_POINTS) errors.push({ code: 'STROKE_POINTS', path: '$.payload.points' });
    else payload.points.forEach((point, index) => {
      if (!floraIsObject(point) || !floraFinite(point.x) || !floraFinite(point.y) || Math.abs(point.x) > MAX_COORDINATE || Math.abs(point.y) > MAX_COORDINATE || !floraFinite(point.p) || point.p < 0 || point.p > 1) errors.push({ code: 'STROKE_POINT', path: `$.payload.points[${index}]` });
    });
  }

  if (['setLayerVisibility', 'setLayerOpacity'].includes(action.type)) {
    if (!action.targetId || !adapter?.layerExists(action.targetId)) errors.push({ code: 'TARGET_NOT_FOUND', path: '$.targetId' });
    if (action.type === 'setLayerVisibility' && typeof payload.visible !== 'boolean') errors.push({ code: 'VISIBLE', path: '$.payload.visible' });
    if (action.type === 'setLayerOpacity' && (!floraFinite(payload.opacity) || payload.opacity < 0 || payload.opacity > 1)) errors.push({ code: 'OPACITY', path: '$.payload.opacity' });
  }

  if (action.type === 'deleteObject' && (!action.targetId || !adapter?.objectExists(action.targetId))) errors.push({ code: 'TARGET_NOT_FOUND', path: '$.targetId' });

  if (action.type === 'paintRegion') {
    validateRegionReference(payload, adapter, errors);
    if (!OBJECT_ID_RE.test(payload.layerId || '') || !adapter?.layerExists(payload.layerId)) errors.push({ code: 'LAYER_NOT_FOUND', path: '$.payload.layerId' });
    if (!REGION_PAINT_OPERATIONS.includes(payload.operation)) errors.push({ code: 'PAINT_OPERATION', path: '$.payload.operation' });
    if (typeof payload.brushPreset !== 'string' || !adapter?.brushPresetExists(payload.brushPreset)) errors.push({ code: 'BRUSH_PRESET_NOT_FOUND', path: '$.payload.brushPreset' });
    if (typeof payload.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(payload.color)) errors.push({ code: 'COLOR', path: '$.payload.color' });
    if (payload.objectPrefix !== undefined && !OBJECT_ID_RE.test(payload.objectPrefix)) errors.push({ code: 'OBJECT_PREFIX', path: '$.payload.objectPrefix' });
    if (REGION_PAINT_OPERATIONS.includes(payload.operation)) {
      const defaults = operationDefaults(payload.operation), options = {
        ...defaults,
        direction: payload.direction ?? defaults.direction,
        density: payload.density ?? defaults.density,
        spacing: payload.spacing ?? defaults.spacing,
        widthRange: payload.widthRange ?? defaults.widthRange,
        opacityRange: payload.opacityRange ?? defaults.opacityRange,
        jitter: payload.jitter ?? defaults.jitter,
        edgeAvoidance: payload.edgeAvoidance ?? defaults.edgeAvoidance,
        coverage: payload.coverage ?? defaults.coverage,
        blendMode: payload.blendMode ?? defaults.blendMode
      };
      const compiler = validateCompilerOptions(options);
      compiler.errors.forEach(message => errors.push({ code: 'COMPILER_OPTIONS', path: '$.payload', message }));
      if (payload.direction !== undefined && !REGION_DIRECTIONS.includes(payload.direction)) errors.push({ code: 'DIRECTION', path: '$.payload.direction' });
      if (payload.coverage !== undefined && (!floraFinite(payload.coverage) || payload.coverage < 0 || payload.coverage > 1)) errors.push({ code: 'COVERAGE', path: '$.payload.coverage' });
      if (payload.blendMode !== undefined && !REGION_BLEND_MODES.includes(payload.blendMode)) errors.push({ code: 'BLEND_MODE', path: '$.payload.blendMode' });
      if (payload.recipeId !== undefined && !ACTION_ID_RE.test(payload.recipeId)) errors.push({ code: 'RECIPE_ID', path: '$.payload.recipeId' });
      if (payload.recipeOperation !== undefined && payload.recipeOperation !== payload.operation) errors.push({ code: 'RECIPE_OPERATION', path: '$.payload.recipeOperation' });
      if (payload.recipePass !== undefined && (!Number.isInteger(payload.recipePass) || payload.recipePass < 0 || payload.recipePass > 63)) errors.push({ code: 'RECIPE_PASS', path: '$.payload.recipePass' });
      if (payload.paletteIndex !== undefined && (!Number.isInteger(payload.paletteIndex) || payload.paletteIndex < 0 || payload.paletteIndex > 63)) errors.push({ code: 'PALETTE_INDEX', path: '$.payload.paletteIndex' });
      if (payload.palette !== undefined && (!Array.isArray(payload.palette) || payload.palette.length < 1 || payload.palette.length > 8 || payload.palette.some(color => typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)))) errors.push({ code: 'PALETTE', path: '$.payload.palette' });
      if (payload.refinement !== undefined) {
        const refined = validateRefinedPaintingParameters(payload.refinement, '$.payload.refinement');
        if (!refined.ok) errors.push(...refined.errors);
      }
      if (payload.constraints !== undefined) {
        if (!floraIsObject(payload.constraints)) errors.push({ code: 'CONSTRAINTS', path: '$.payload.constraints' });
        else {
          const allowed = new Set(['frontRegionId', 'foldSide', 'bandWidth', 'edgeAvoidance', 'preserveManual', 'allowRegionIds', 'subjectSeparation', 'axisContinuous']);
          rejectUnsupported(payload.constraints, allowed, '$.payload.constraints', errors);
          if (payload.constraints.frontRegionId !== undefined && (!OBJECT_ID_RE.test(payload.constraints.frontRegionId || '') || !adapter?.regionExists(payload.constraints.frontRegionId))) errors.push({ code: 'FRONT_REGION_NOT_FOUND', path: '$.payload.constraints.frontRegionId' });
          if (payload.constraints.foldSide !== undefined && !['left', 'right', 'center'].includes(payload.constraints.foldSide)) errors.push({ code: 'FOLD_SIDE', path: '$.payload.constraints.foldSide' });
          if (payload.constraints.bandWidth !== undefined && (!floraFinite(payload.constraints.bandWidth) || payload.constraints.bandWidth < .002 || payload.constraints.bandWidth > .2)) errors.push({ code: 'BAND_WIDTH', path: '$.payload.constraints.bandWidth' });
        }
      }
    }
  }

  if (action.type === 'clearRegion') {
    validateRegionReference(payload, adapter, errors);
    if (payload.layerId !== undefined && (!OBJECT_ID_RE.test(payload.layerId) || !adapter?.layerExists(payload.layerId))) errors.push({ code: 'LAYER_NOT_FOUND', path: '$.payload.layerId' });
  }

  if (['setMaskFeather', 'setMaskVisibility', 'invalidateMaskCache'].includes(action.type)) validateRegionReference(payload, adapter, errors);
  if (action.type === 'setMaskFeather' && (!floraFinite(payload.feather) || payload.feather < 0 || payload.feather > .1)) errors.push({ code: 'FEATHER', path: '$.payload.feather' });
  if (action.type === 'setMaskVisibility' && typeof payload.visible !== 'boolean') errors.push({ code: 'VISIBLE', path: '$.payload.visible' });

  return errors.length ? { ok: false, errors } : { ok: true, action: canonicalAction(action) };
}
