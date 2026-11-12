export const FLORA_SCHEMA_VERSION = '0.1';
export const FLORA_ACTION_TYPES = Object.freeze([
  'createLayer', 'createStroke', 'setLayerVisibility', 'setLayerOpacity', 'deleteObject',
  'paintRegion', 'clearRegion', 'setMaskFeather', 'setMaskVisibility', 'invalidateMaskCache'
]);
export const ACTION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$/;
export const OBJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
export const MAX_STROKE_POINTS = 20000;
export const MAX_COORDINATE = 1000000;
export const ACTION_FIELDS = new Set(['schemaVersion', 'actionId', 'type', 'targetId', 'payload', 'seed', 'metadata']);
export function canonicalAction(action) {
  return {
    schemaVersion: action.schemaVersion,
    actionId: action.actionId,
    type: action.type,
    ...(action.targetId !== undefined ? { targetId: action.targetId } : {}),
    payload: action.payload,
    seed: action.seed,
    metadata: action.metadata
  };
}
