import { vectorPathBounds } from '../mask/vector-mask.js';

function crownCheck(name, passed, reason = '') { return { name, passed: Boolean(passed), reason: passed ? '' : reason }; }
function crownTip(region) { return region.growthAxis?.crownTip || null; }

export function runCrownVisualChecks({ structure, plan, recipes = [], layer = null } = {}) {
  const petals = structure?.regions?.filter(region => region.kind === 'petal-region') || [];
  const center = structure?.regions?.find(region => region.kind === 'flower-center-region');
  const ids = new Set(petals.map(region => region.regionId));
  const maskIds = new Set((structure?.masks || []).map(mask => mask.regionId));
  const zLevels = new Set(petals.map(region => region.z));
  const overlapsValid = petals.every(region => (region.overlaps || []).every(overlap => {
    const topology = structure.topology?.find(item => item.regionId === overlap.frontRegionId);
    return topology?.frontOf?.includes(region.regionId);
  }));
  const envelope = structure?.crownEnvelope?.path?.[0];
  const tips = petals.map(crownTip).filter(Boolean);
  let minimumTipDistance = Infinity;
  for (let a = 0; a < tips.length; a += 1) for (let b = a + 1; b < tips.length; b += 1) minimumTipDistance = Math.min(minimumTipDistance, Math.hypot(tips[a].x - tips[b].x, tips[a].y - tips[b].y));
  const feathers = new Set(recipes.map(recipe => Number(recipe.feather).toFixed(4)));
  const centerTopology = structure?.topology?.find(item => item.regionId === center?.regionId);
  const multiCup = structure?.ringStructure?.mode === 'MultiPetalCup';
  const innerPetals = petals.filter(region => region.petal?.ring === 'inner');
  const centerIntegrated = multiCup
    ? innerPetals.length === 6 && center?.overlaps?.length >= 3 && center.overlaps.length <= 5 && center.overlaps.every(item => innerPetals.some(region => region.regionId === item.frontRegionId))
    : petals.every(region => region.overlaps?.some(item => item.frontRegionId === center?.regionId) || center?.overlaps?.some(item => item.frontRegionId === region.regionId));
  const crownObjects = layer?.objects?.filter(object => object.floraPaint?.crownId === plan?.crownId || object.floraPaint?.recipeId?.startsWith(`${plan?.planId}:`)) || [];
  const checks = [
    crownCheck('crown completeness', petals.length >= 8 && petals.length <= 16 && Boolean(center), 'requires 8–16 petals and one center'),
    crownCheck('petal separation', ids.size === petals.length && petals.every(region => maskIds.has(region.regionId)) && minimumTipDistance > .035, 'petal IDs, masks, or tips are not sufficiently distinct'),
    crownCheck('focal hierarchy', structure?.focalRegionId === `${plan?.crownId}:petal:${String((plan?.focalRegion?.petalIndex ?? -1) + 1).padStart(2, '0')}` && ids.has(structure?.focalRegionId), 'focal region does not match plan'),
    crownCheck('depth readability', zLevels.size >= 4 && petals.some(region => region.relation === 'front') && petals.some(region => region.relation === 'back'), 'insufficient front/back depth levels'),
    crownCheck('overlap correctness', overlapsValid && petals.filter(region => region.overlaps?.length).length >= Math.ceil(petals.length * .6), 'an overlap seam contradicts topology or too few depth seams are represented'),
    crownCheck('color continuity', plan?.crownBasePalette?.length >= 2 && plan?.centerPalette?.length >= 2, 'plan palettes are incomplete'),
    crownCheck('edge variation', feathers.size >= 3, 'compiled recipes do not contain hard/medium/soft edge variation'),
    crownCheck('center integration', centerIntegrated, 'center/petal seams do not represent the selected crown rhythm'),
    crownCheck('silhouette integrity', envelope && envelope.cy - envelope.ry >= .01 && envelope.cy + envelope.ry <= .53 && envelope.ry * 2 >= .48 && envelope.ry * 2 <= .52, 'near-circle envelope violates fixed upper crown proportions'),
    crownCheck('small-view readability', minimumTipDistance > .035 && petals.every(region => { const bounds = vectorPathBounds(region.path); return bounds.w > .045 && bounds.h > .035; }), 'petal silhouettes merge or become too small'),
    crownCheck('painted surface present', !layer || crownObjects.length >= petals.length * 3, 'insufficient editable painted strokes for a non-flat crown')
  ];
  return { passed: checks.every(item => item.passed), checks, failed: checks.filter(item => !item.passed).map(item => ({ name: item.name, reason: item.reason })) };
}
