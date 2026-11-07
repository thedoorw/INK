export const A4_HERO_PLAN_SCHEMA_VERSION = '0.1';
export const A4_HERO_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$/;
export const A4_HERO_PLAN_FIELDS = new Set([
  'planId', 'schemaVersion', 'heroId', 'composition', 'crownPlan', 'stemPlan', 'leafPlans',
  'backgroundPlan', 'globalPalette', 'globalLightDirection', 'focalHierarchy', 'edgeHierarchy',
  'depthStrategy', 'colorContinuity', 'backgroundContrast', 'smallViewRequirements', 'seed', 'metadata'
]);
export const A4_COMPOSITION_FIELDS = new Set([
  'page', 'normalized', 'crownMode', 'leafCount', 'crownTop', 'crownHeight', 'stemAxisX',
  'stemWidthRatio', 'leafWidth', 'leafTip', 'leafCurve', 'singleFocalPoint'
]);
export const A4_COMPONENT_PLAN_FIELDS = new Set([
  'regionId', 'palette', 'brushPresets', 'opacityScale', 'edgeSoftness', 'seed', 'leafEdgeMode', 'metadata'
]);
export const A4_BACKGROUND_PLAN_FIELDS = new Set([
  'regionId', 'palette', 'brushPresets', 'contrast', 'textureStrength', 'edgeSoftness', 'seed', 'metadata'
]);
export const A4_BRUSH_FIELDS = new Set(['wash', 'shadow', 'light', 'glaze', 'detail', 'soft']);

export function canonicalA4HeroPaintingPlan(plan) {
  return {
    planId: plan.planId,
    schemaVersion: plan.schemaVersion,
    heroId: plan.heroId,
    composition: structuredClone(plan.composition),
    crownPlan: structuredClone(plan.crownPlan),
    stemPlan: structuredClone(plan.stemPlan),
    leafPlans: plan.leafPlans.map(item => structuredClone(item)),
    backgroundPlan: structuredClone(plan.backgroundPlan),
    globalPalette: [...plan.globalPalette],
    globalLightDirection: structuredClone(plan.globalLightDirection),
    focalHierarchy: structuredClone(plan.focalHierarchy),
    edgeHierarchy: structuredClone(plan.edgeHierarchy),
    depthStrategy: structuredClone(plan.depthStrategy),
    colorContinuity: structuredClone(plan.colorContinuity),
    backgroundContrast: plan.backgroundContrast,
    smallViewRequirements: structuredClone(plan.smallViewRequirements),
    seed: plan.seed,
    metadata: structuredClone(plan.metadata)
  };
}
