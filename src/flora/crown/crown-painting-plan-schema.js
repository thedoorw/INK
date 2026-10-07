export const CROWN_PLAN_SCHEMA_VERSION = '0.1';
export const CROWN_PLAN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$/;
export const CROWN_PLAN_FIELDS = new Set([
  'planId', 'schemaVersion', 'crownId', 'petalCount', 'crownBasePalette', 'petalPaletteVariation',
  'centerPalette', 'globalLightDirection', 'depthOrder', 'focalRegion', 'edgeHierarchy',
  'shadowStrategy', 'glazeStrategy', 'backgroundExclusionMask', 'brushPresets', 'seed',
  'bowlBias', 'petalRhythm', 'petalGeometryFamily', 'centerMode', 'metadata'
]);
export const CROWN_BRUSH_FIELDS = new Set(['wash', 'shadow', 'light', 'glaze', 'detail', 'soft']);
export const EDGE_LEVELS = Object.freeze(['crisp', 'mixed', 'soft']);

export function canonicalCrownPaintingPlan(plan) {
  return {
    planId: plan.planId,
    schemaVersion: plan.schemaVersion,
    crownId: plan.crownId,
    petalCount: plan.petalCount,
    crownBasePalette: [...plan.crownBasePalette],
    petalPaletteVariation: structuredClone(plan.petalPaletteVariation),
    centerPalette: [...plan.centerPalette],
    globalLightDirection: structuredClone(plan.globalLightDirection),
    depthOrder: plan.depthOrder,
    focalRegion: structuredClone(plan.focalRegion),
    edgeHierarchy: structuredClone(plan.edgeHierarchy),
    shadowStrategy: structuredClone(plan.shadowStrategy),
    glazeStrategy: structuredClone(plan.glazeStrategy),
    backgroundExclusionMask: structuredClone(plan.backgroundExclusionMask),
    brushPresets: structuredClone(plan.brushPresets),
    seed: plan.seed,
    ...(plan.bowlBias !== undefined ? { bowlBias: plan.bowlBias } : {}),
    ...(plan.petalRhythm !== undefined ? { petalRhythm: plan.petalRhythm } : {}),
    ...(plan.petalGeometryFamily !== undefined ? { petalGeometryFamily: plan.petalGeometryFamily } : {}),
    ...(plan.centerMode !== undefined ? { centerMode: plan.centerMode } : {}),
    metadata: structuredClone(plan.metadata)
  };
}
