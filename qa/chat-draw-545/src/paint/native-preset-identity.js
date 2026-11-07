import { validateBrushPreset } from './brush-engine.js';

// Native tool identity is distinct from the approximate replay engine family.
const ENGINE_FAMILY = Object.freeze({pen:'ink', pencil:'pencil', marker:'marker', brush:'opaque-paint', drybrush:'dry-brush', airbrush:'soft-paint'});
const SNAPSHOT_FIELDS = ['size','opacity','smoothing','pressure','taper','grain','softness','flow','wetness','bristle','mediaModel','color','kind'];

export function nativePresetMetadata(settings = {}) {
  const nativeParameters = {};
  for (const key of SNAPSHOT_FIELDS) {
    const value = settings[key];
    if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean' || (typeof value === 'string' && value.length <= 128)) nativeParameters[key] = value;
  }
  return {toolPresetId: typeof settings.id === 'string' && settings.id.length <= 128 ? settings.id : null, nativeParameters};
}

export function resolveNativePreset(stroke = {}, registry, options = {}) {
  const metadata = stroke.metadata?.nativeParameters ? JSON.parse(JSON.stringify(stroke.metadata)) : nativePresetMetadata(stroke);
  const enginePresetId = options.enginePresetId || ENGINE_FAMILY[metadata.nativeParameters.kind || stroke.kind];
  const unavailable = (code, details = []) => ({status:'UNAVAILABLE', code, details, toolPresetId:metadata.toolPresetId, enginePresetId:enginePresetId || null});
  if (!enginePresetId) return unavailable('NATIVE_PRESET_KIND_UNSUPPORTED');
  let preset;
  try { preset = registry.get(enginePresetId); } catch { return unavailable('ENGINE_PRESET_NOT_FOUND'); }
  const checked = validateBrushPreset(preset, {availableAssets:options.availableAssets || []});
  if (!checked.valid) return unavailable('ENGINE_PRESET_INVALID', checked.errors);
  if (checked.missingDependencies.length) return unavailable('ENGINE_PRESET_DEPENDENCY_MISSING', checked.missingDependencies.map(item => item.assetId));
  metadata.presetMapping = {enginePresetId, classification:'APPROXIMATE_ENGINE_FAMILY', parameterFidelity:'NOT_VERIFIED', legacySourceIdentity:metadata.toolPresetId == null};
  return {status:'AVAILABLE', toolPresetId:metadata.toolPresetId, enginePresetId, metadata};
}
