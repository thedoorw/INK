import { vectorPathBounds, vectorPathContains } from '../mask/vector-mask.js';

const a4Check = (name, passed, failureReason) => ({ name, passed: Boolean(passed), ...(passed ? {} : { failureReason }) });
function a4PolygonArea(path) {
  if (!Array.isArray(path) || path.length < 3) return 0;
  const first = path[0];
  if (Number.isFinite(first.cx)) return Math.PI * first.rx * first.ry;
  let area = 0;
  for (let index = 0; index < path.length; index += 1) {
    const a = path[index], b = path[(index + 1) % path.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}
function a4PathInsidePage(path) {
  const bounds = vectorPathBounds(path);
  return bounds.x >= -1e-6 && bounds.y >= -1e-6 && bounds.x + bounds.w <= 1 + 1e-6 && bounds.y + bounds.h <= 1 + 1e-6;
}
function a4OperationSet(recipes, regionId) { return new Set(recipes.filter(recipe => recipe.targetRegionId === regionId).map(recipe => recipe.metadata?.semanticOperation || recipe.operation)); }


function a4Variance(values) {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}
function a4PetalAngles(petals) {
  return petals.map(region => {
    const axis = region.growthAxis || {};
    return Math.atan2((axis.tip?.y || 0) - (axis.base?.y || 0), (axis.tip?.x || 0) - (axis.base?.x || 0));
  }).sort((a, b) => a - b);
}
function a4AngleGaps(angles) {
  if (angles.length < 2) return [];
  return angles.map((angle, index) => {
    const next = index === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[index + 1];
    return next - angle;
  });
}
function a4StrokeSignature(object) {
  const points = object?.points || [];
  if (points.length < 2) return '';
  const first = points[0], last = points.at(-1);
  return `${points.length}:${Math.round((last.x - first.x) * 10)}:${Math.round((last.y - first.y) * 10)}:${Math.round((object.size || 0) * 10)}`;
}

export function runA4HeroVisualChecks({ structure, plan, recipes = [], layer = null }) {
  const regions = structure?.regions || [], masks = structure?.masks || [];
  const crownRegions = regions.filter(region => ['petal-region', 'flower-center-region'].includes(region.kind));
  const multiCup = structure?.ringStructure?.mode === 'MultiPetalCup';
  const innerPetals = regions.filter(region => region.kind === 'petal-region' && region.petal?.ring === 'inner');
  const petals = regions.filter(region => region.kind === 'petal-region');
  const center = regions.find(region => region.kind === 'flower-center-region');
  const stem = regions.find(region => region.kind === 'stem-region');
  const leaves = regions.filter(region => region.kind === 'leaf-region');
  const background = regions.find(region => region.kind === 'background-region');
  const backgroundMask = masks.find(mask => mask.regionId === background?.regionId);
  const crownArea = crownRegions.reduce((sum, region) => sum + a4PolygonArea(region.path), 0);
  const lowerArea = [...leaves, stem].reduce((sum, region) => sum + a4PolygonArea(region.path), 0);
  const stemWidth = stem?.stem?.width || 0;
  const crownDiameter = structure?.crownEnvelope?.path?.[0]?.rx * 2 || 0;
  const leafTips = leaves.map(region => region.growthAxis?.tip).filter(Boolean);
  const stemAtMid = { x: plan?.composition?.stemAxisX ?? .5, y: .74 };
  const recipeFeathers = new Set(recipes.map(recipe => Number(recipe.feather).toFixed(4)));
  const backgroundOps = a4OperationSet(recipes, background?.regionId);
  const requiredBackground = ['Base Field', 'Soft Gradient Field', 'Quiet Texture', 'Edge Suppression', 'Subject Separation'];
  const subjectIds = new Set(structure?.subjectRegionIds || []);
  const subjectMasksComplete = [...subjectIds].every(id => masks.some(mask => mask.regionId === id));
  const allPathsInside = regions.filter(region => region.kind !== 'background-region').every(region => a4PathInsidePage(region.path));
  const crownRefined = recipes.filter(recipe => recipe.metadata?.component === 'crown');
  const centerRefined = recipes.filter(recipe => recipe.metadata?.component === 'flower-center');
  const leafRefined = recipes.filter(recipe => String(recipe.metadata?.component || '').startsWith('leaf-'));
  const backgroundRefined = recipes.filter(recipe => recipe.metadata?.component === 'background');
  const refinedRecipes = recipes.filter(recipe => ['0.2'].includes(recipe.schemaVersion) && recipe.refinement);
  const petalBounds = petals.map(region => vectorPathBounds(region.path));
  const petalLengths = petals.map(region => Math.hypot(region.growthAxis.tip.x - region.growthAxis.base.x, region.growthAxis.tip.y - region.growthAxis.base.y));
  const petalWidths = petalBounds.map(bounds => bounds.w);
  const angleGaps = a4AngleGaps(a4PetalAngles(petals));
  const regularityVariance = a4Variance(angleGaps);
  const surfaceContinuityReady = crownRefined.filter(recipe => ['Base Wash', 'Transparent Glaze'].includes(recipe.operation)).every(recipe =>
    recipe.refinement?.regionInteriorSmoothing >= .86 && recipe.refinement?.colorFieldInterpolation?.strength >= .70 && recipe.refinement?.textureSuppression >= .72
  );
  const silhouetteVariation = petalLengths.length > 1 && Math.max(...petalLengths) - Math.min(...petalLengths) >= .018 && Math.max(...petalWidths) - Math.min(...petalWidths) >= .012;
  const recipeVariationReady = crownRefined.every(recipe => !recipe.refinement || (recipe.refinement.strokeLengthVariation.maxScale - recipe.refinement.strokeLengthVariation.minScale >= .25 && recipe.refinement.deterministicVariation > 0));
  const expectedLeafCount = plan?.composition?.leafCount === 'Four' ? 4 : 2;
  const leafMassRatio = leaves.length ? Math.min(...leaves.map(region => a4PolygonArea(region.path))) / Math.max(...leaves.map(region => a4PolygonArea(region.path))) : 0;
  const backgroundQuiet = backgroundRefined.every(recipe => !recipe.refinement || recipe.refinement.textureSuppression >= .88) && backgroundRefined.every(recipe => Math.max(...(Array.isArray(recipe.opacity) ? recipe.opacity : [recipe.opacity])) <= .16);
  const checks = [
    a4Check('A4 proportion', structure?.coordinateSystem?.page === 'A4 portrait' && Math.abs((structure?.coordinateSystem?.visualAspect || 0) - Math.SQRT2) < .001, 'coordinate system is not normalized A4 portrait'),
    a4Check('crown placement', structure?.crownEnvelope?.top >= .01 && structure?.crownEnvelope?.top <= .04 && structure?.crownEnvelope?.height >= .48 && structure?.crownEnvelope?.height <= .52, 'crown top or height violates fixed Hero range'),
    a4Check('crown completeness', petals.length >= 8 && petals.length <= 16 && center && crownRegions.every(region => masks.some(mask => mask.regionId === region.regionId)), 'complete Single Crown regions or masks are missing'),
    a4Check('crown focal dominance', plan?.focalHierarchy?.primary === 'crown' && structure?.focalRegionId && crownArea > lowerArea * .72, 'crown is not the declared and geometrically dominant focal system'),
    a4Check('stem continuity', stem?.growthAxis?.base?.y === 1 && stem?.growthAxis?.tip?.y < .50 && a4PathInsidePage(stem?.path || []), 'stem is not a continuous bottom-to-crown region'),
    a4Check('stem proportional width', crownDiameter > 0 && stemWidth / crownDiameter >= 1 / 14 - .001 && stemWidth / crownDiameter <= 1 / 10 + .001, 'stem width is outside 1/14–1/10 of crown diameter'),
    a4Check('leaf count', leaves.length === expectedLeafCount && new Set(leaves.map(region => region.leaf?.slot || region.leaf?.side)).size === expectedLeafCount, `exactly ${expectedLeafCount} independent leaves are required`),
    a4Check('leaf separation', leaves.length === expectedLeafCount && leaves.every((leaf, index) => leaves.every((other, otherIndex) => index === otherIndex || !vectorPathContains(leaf.path, other.growthAxis.tip))), 'leaf silhouettes are not sufficiently separated'),
    a4Check('leaf tip completeness', leafTips.length === expectedLeafCount && leafTips.every(tip => tip.x > .02 && tip.x < .98 && tip.y > .50 && tip.y < .76), 'leaf tips are incomplete or outside the lower-half target band'),
    a4Check('central stem visibility', stem?.z > Math.max(...leaves.map(region => region.z), -Infinity) && vectorPathContains(stem.path, stemAtMid), 'central stem is not topologically visible between leaves'),
    a4Check('lower-weight control', lowerArea < crownArea * .95, 'stem and leaves are visually heavier than the crown system'),
    a4Check('silhouette integrity', allPathsInside && subjectMasksComplete && backgroundMask?.excludePaths?.length === subjectIds.size, 'a subject silhouette is outside the page or missing from masks/exclusion'),
    a4Check('edge hierarchy', recipeFeathers.size >= 4 && plan?.edgeHierarchy?.background === 'soft' && ['crisp', 'mixed'].includes(plan?.edgeHierarchy?.crown), 'hard, soft, and dissolving edge hierarchy is not represented'),
    a4Check('color continuity', plan?.colorContinuity?.sharedWarmCool === true && plan?.globalPalette?.length >= 4 && plan?.backgroundPlan?.palette?.some(color => plan.globalPalette.includes(color)), 'subject and background palettes do not share the declared color relationship'),
    a4Check('center integration', Boolean(center) && (multiCup ? innerPetals.length === 6 && center.overlaps?.length >= 3 && center.overlaps.length <= 5 && center.overlaps.every(item => innerPetals.some(petal => petal.regionId === item.frontRegionId)) : petals.every(petal => petal.overlaps?.some(item => item.frontRegionId === center.regionId) || center.overlaps?.some(item => item.frontRegionId === petal.regionId))) && ['Base Wash', 'Root Shadow', 'Central Light', 'Transparent Glaze', 'Directional Brushwork'].every(name => a4OperationSet(recipes, center?.regionId).has(name)), 'Flower Center is not topologically or painterly integrated with inner petals'),
    a4Check('surface continuity', surfaceContinuityReady && crownRefined.some(recipe => recipe.operation === 'Directional Brushwork'), 'petal color fields, glaze, smoothing, or growth-directed brushwork are incomplete'),
    a4Check('petal surface continuity', surfaceContinuityReady && crownRefined.some(recipe => recipe.operation === 'Directional Brushwork'), 'petal color fields, glaze, smoothing, or growth-directed brushwork are incomplete'),
    a4Check('petal silhouette coherence', silhouetteVariation && petals.every(region => masks.some(mask => mask.regionId === region.regionId)), 'petal length/width rhythm is too regular or a silhouette mask is missing'),
    a4Check('radial regularity warning', regularityVariance > .00002, 'petal angular spacing is mechanically regular'),
    a4Check('brush repetition warning', recipeVariationReady, 'stroke-length or deterministic variation is insufficient'),
    a4Check('center integration refined', centerRefined.some(recipe => recipe.operation === 'Transparent Glaze' && recipe.refinement?.regionInteriorSmoothing >= .88) && centerRefined.some(recipe => recipe.operation === 'Root Shadow'), 'center lacks refined depth, glaze, or inner-petal seam integration'),
    a4Check('leaf mass coherence', leaves.length === expectedLeafCount && leafMassRatio >= (expectedLeafCount === 4 ? .42 : .58) && leafRefined.every(recipe => !recipe.refinement || recipe.refinement.silhouetteProtection >= .9), 'leaf masses are fragmented, excessively unequal, or insufficiently silhouette-protected'),
    a4Check('leaf tip integrity refined', leafTips.length === expectedLeafCount && leafTips.every(tip => tip.x > .02 && tip.x < .98) && leafRefined.every(recipe => !recipe.refinement || recipe.refinement.opacityFalloff.tip <= .82), 'leaf tips are clipped or overpainted'),
    a4Check('background quietness', backgroundQuiet, 'background opacity or texture remains too assertive'),
    a4Check('focal dominance refined', plan?.focalHierarchy?.primary === 'crown' && backgroundQuiet && crownArea > lowerArea * .72, 'background or lower structure competes with the crown'),
    a4Check('procedural artifact warning', refinedRecipes.length === recipes.length && recipeVariationReady && regularityVariance > .00002 && backgroundQuiet, 'Recipe variation, silhouette rhythm, or texture suppression still predicts visible procedural artifacts'),
    a4Check('background support', background && backgroundMask?.mode === 'subject-exclusion' && requiredBackground.every(name => backgroundOps.has(name)) && plan?.backgroundContrast <= .35, 'background does not exclude the subject or lacks quiet support operations'),
    a4Check('small-view readability', crownDiameter >= .62 && stemWidth >= .045 && leafTips.length === expectedLeafCount && (expectedLeafCount === 4 ? plan?.smallViewRequirements?.fourLeaves === true : plan?.smallViewRequirements?.twoLeaves === true), 'crown, stem, or leaf silhouette is too weak for small view')
  ];
  if (layer) {
    const heroObjects = layer.objects.filter(object => object.floraPaint?.heroId === plan.heroId || object.floraPaint?.recipeId?.startsWith(`${plan.planId}:`));
    const signatures = heroObjects.map(a4StrokeSignature).filter(Boolean);
    const uniqueRatio = signatures.length ? new Set(signatures).size / signatures.length : 0;
    const smoothRatio = heroObjects.length ? heroObjects.filter(object => object.points?.some(point => point.mode === 'smooth')).length / heroObjects.length : 0;
    checks.push(a4Check('editable painted scene', heroObjects.length > 100 && heroObjects.every(object => object.type === 'stroke'), 'whole-page result is not represented by editable INK strokes'));
    checks.push(a4Check('painted procedural artifact warning', refinedRecipes.length > 0 && smoothRatio > .72 && uniqueRatio > .10, 'stroke paths remain excessively repetitive or insufficiently integrated'));
  }
  return { passed: checks.every(item => item.passed), checks, failed: checks.filter(item => !item.passed) };
}
