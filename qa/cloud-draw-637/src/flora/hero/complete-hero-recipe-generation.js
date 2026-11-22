import { generateCenterRecipes, generatePetalRecipes } from '../crown/petal-recipe-generation.js';
import { defaultRefinedPaintingParameters } from '../recipe/refined-painting-parameters.js';

const a4RecipeClamp = (value, min, max) => Math.max(min, Math.min(max, value));
const a4RecipeHashString = text => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return hash >>> 0;
};
const a4ScalePair = (pair, scale, min = 0, max = 1) => pair.map(value => a4RecipeClamp(value * scale, min, max));
const a4RecipeSlug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');


function a4RefinementFor(component, operation, variationSeed = 0) {
  const profileName = component === 'flower-center' ? 'center' : component.startsWith('leaf-') ? 'leaf' : component;
  const refinement = defaultRefinedPaintingParameters(profileName);
  const phase = ((variationSeed >>> 0) % 17) / 16;
  refinement.deterministicVariation = a4RecipeClamp(refinement.deterministicVariation * (.84 + phase * .22), 0, 1);
  if (operation === 'Base Wash') {
    refinement.regionInteriorSmoothing = Math.max(refinement.regionInteriorSmoothing, .94);
    refinement.textureSuppression = Math.max(refinement.textureSuppression, .92);
    refinement.strokeLengthVariation.shortMix *= .56;
    refinement.localEdgeHardness.edge *= .86;
  } else if (['Root Shadow', 'Fold Shadow', 'Overlap Shadow'].includes(operation)) {
    refinement.colorFieldInterpolation.strength = Math.max(refinement.colorFieldInterpolation.strength, .88);
    refinement.localGlazeAccumulation.root = Math.min(2, refinement.localGlazeAccumulation.root * 1.10);
    refinement.overlapShadowFalloff.softness = Math.max(refinement.overlapShadowFalloff.softness, .82);
    refinement.textureSuppression = Math.max(refinement.textureSuppression, .86);
  } else if (['Central Light', 'Edge Light'].includes(operation)) {
    refinement.opacityFalloff.edge *= .86;
    refinement.localEdgeHardness.edge = operation === 'Edge Light' ? Math.max(.46, refinement.localEdgeHardness.edge) : refinement.localEdgeHardness.edge;
    refinement.textureSuppression = Math.max(refinement.textureSuppression, .88);
  } else if (operation === 'Transparent Glaze') {
    refinement.localGlazeAccumulation = { root: 1.18, mid: 1.06, tip: .78 };
    refinement.regionInteriorSmoothing = Math.max(refinement.regionInteriorSmoothing, .95);
    refinement.textureSuppression = Math.max(refinement.textureSuppression, .94);
  } else if (operation === 'Directional Brushwork') {
    refinement.strokeLengthVariation = { minScale: .42, maxScale: 1.34, shortMix: .42 };
    refinement.curvatureFollowing.strength = Math.max(refinement.curvatureFollowing.strength, .90);
    refinement.textureSuppression = Math.max(refinement.textureSuppression, .72);
    refinement.strokeDensityFalloff.edge *= .78;
  } else if (operation === 'Boundary Dissolve') {
    refinement.localEdgeHardness.edge = Math.min(refinement.localEdgeHardness.edge, .24);
    refinement.opacityFalloff.edge = Math.min(refinement.opacityFalloff.edge, .42);
    refinement.regionInteriorSmoothing = Math.max(refinement.regionInteriorSmoothing, .96);
    refinement.textureSuppression = Math.max(refinement.textureSuppression, .96);
  }
  if (refinement.schemaVersion === '0.3') {
    if (operation === 'Base Wash') {
      refinement.frequencyLayers.low = 1;
      refinement.frequencyLayers.mid = Math.max(refinement.frequencyLayers.mid, .74);
      refinement.pigmentMass.pigmentLoad = Math.min(1.2, refinement.pigmentMass.pigmentLoad * 1.06);
      refinement.pigmentMass.depositRate = Math.min(1.2, refinement.pigmentMass.depositRate * 1.08);
      refinement.pigmentMass.strokeBodyCoverage = Math.min(1, refinement.pigmentMass.strokeBodyCoverage * 1.05);
      refinement.pigmentMass.opacityFloor = Math.min(.16, refinement.pigmentMass.opacityFloor * 1.08);
    } else if (operation === 'Transparent Glaze') {
      refinement.frequencyLayers.low = Math.max(.82, refinement.frequencyLayers.low);
      refinement.pigmentMass.glazeAccumulation = Math.min(1.3, refinement.pigmentMass.glazeAccumulation * 1.12);
      refinement.pigmentMass.saturationRetention = Math.min(1.15, refinement.pigmentMass.saturationRetention * 1.03);
    } else if (operation === 'Directional Brushwork') {
      refinement.frequencyLayers.mid = Math.min(1, refinement.frequencyLayers.mid * 1.12);
      refinement.strokeDropout = Math.min(.32, refinement.strokeDropout * .58);
      refinement.pigmentMass.opacityFloor = Math.max(.025, refinement.pigmentMass.opacityFloor * .56);
      refinement.pigmentMass.edgeRetention = Math.min(1, refinement.pigmentMass.edgeRetention * 1.05);
    } else if (operation === 'Edge Light') {
      refinement.frequencyLayers.mid = Math.min(1, refinement.frequencyLayers.mid * 1.08);
      refinement.pigmentMass.valueRetention = Math.min(1.15, refinement.pigmentMass.valueRetention * 1.05);
    }
    if (profileName === 'background') {
      refinement.frequencyLayers = { low: .74, mid: .20, high: .018 };
      refinement.pigmentMass.opacityCeiling = Math.min(.16, refinement.pigmentMass.opacityCeiling);
    }
  }
  refinement.multiBandColorField.phase = phase;
  refinement.multiBandColorField.bands = component === 'background' ? 2 : component === 'flower-center' ? 4 : 3 + (variationSeed % 2);
  refinement.localWarmCoolShift.root = a4RecipeClamp(refinement.localWarmCoolShift.root + (phase - .5) * .10, -.5, .5);
  refinement.localWarmCoolShift.tip = a4RecipeClamp(refinement.localWarmCoolShift.tip - (phase - .5) * .08, -.5, .5);
  refinement.localWarmCoolShift.left = a4RecipeClamp(refinement.localWarmCoolShift.left + (phase - .5) * .12, -.5, .5);
  refinement.localWarmCoolShift.right = a4RecipeClamp(refinement.localWarmCoolShift.right - (phase - .5) * .10, -.5, .5);
  refinement.strokeDropout = a4RecipeClamp(refinement.strokeDropout + (phase - .5) * .12, 0, .9);
  if (profileName === 'leaf') {
    refinement.leafCrossSectionField.ridge = a4RecipeClamp(.65 + phase * .18, 0, 1);
    refinement.leafCrossSectionField.leftShadow = a4RecipeClamp(.55 + (1 - phase) * .18, 0, 1);
    refinement.leafCrossSectionField.rightLight = a4RecipeClamp(.50 + phase * .20, 0, 1);
    refinement.leafCrossSectionField.twist = a4RecipeClamp(.16 + phase * .30, 0, 1);
  }
  if (profileName === 'background') {
    refinement.backgroundLowFrequencyField.phase = phase;
    refinement.backgroundLowFrequencyField.amplitude = .10 + phase * .08;
    refinement.backgroundLowFrequencyField.diagonalBias = -.24 + phase * .48;
  }
  if (profileName === 'center') {
    refinement.centerOcclusionMap.occlusion = .24 + phase * .24;
    refinement.centerOcclusionMap.irregularity = .46 + phase * .30;
    refinement.centerOcclusionMap.transition = .54 + phase * .24;
  }
  return refinement;
}

function a4CoverageRetention(component, { ring = null, filigree = false } = {}) {
  if (component === 'flower-center') return {
    mode: 'non-periodic-full-body', bodyCoverage: .96, rootCoverage: .94, alphaFloor: .20,
    localFeatherScale: .28, fillSections: 18, boundaryDissolveLimit: .16,
    preserveLobes: false, featureScale: 1.28, visualWeight: 1.34, densityFieldScale: .66, directionalDeposit: .22
  };
  if (component === 'leaf') return {
    mode: 'non-periodic-full-body', bodyCoverage: .96, rootCoverage: .98, alphaFloor: .18,
    localFeatherScale: filigree ? .18 : .30, fillSections: filigree ? 34 : 24,
    boundaryDissolveLimit: .16, preserveLobes: filigree, featureScale: 1, visualWeight: 1.02, densityFieldScale: .88, directionalDeposit: .12
  };
  if (component === 'stem') return {
    mode: 'non-periodic-full-body', bodyCoverage: .92, rootCoverage: .94, alphaFloor: .15,
    localFeatherScale: .32, fillSections: 22, boundaryDissolveLimit: .20,
    preserveLobes: false, featureScale: 1, visualWeight: .56, densityFieldScale: .96, directionalDeposit: .08
  };
  return {
    mode: 'non-periodic-full-body', bodyCoverage: .97, rootCoverage: .99, alphaFloor: .19,
    localFeatherScale: .24, fillSections: ring === 'inner' ? 20 : 24,
    boundaryDissolveLimit: .18, preserveLobes: false, featureScale: 1, visualWeight: ring === 'inner' ? 1.12 : 1.08, densityFieldScale: ring === 'inner' ? .78 : .82, directionalDeposit: .16
  };
}

function a4MakeRecipe({ plan, regionId, component, semanticOperation, operation, brushPreset, direction, palette, coverage,
  opacity, density, spacing, widthRange, jitter, feather, passes = 1, blendMode = 'source-over', constraints = {}, seedOffset = 0 }) {
  const recipeId = `${plan.planId}:${component}:${a4RecipeSlug(semanticOperation)}`;
  return {
    recipeId, schemaVersion: '0.2', targetRegionId: regionId, operation, brushPreset, direction,
    palette: [...palette], coverage, opacity: Array.isArray(opacity) ? [...opacity] : opacity,
    density, spacing, widthRange: [...widthRange], jitter, feather, passes, blendMode,
    seed: (plan.seed ^ a4RecipeHashString(`${recipeId}:${seedOffset}`)) >>> 0,
    constraints: { preserveManual: true, ...structuredClone(constraints) },
    refinement: a4RefinementFor(component, operation, seedOffset),
    metadata: {
      source: 'ai', label: `WP7R ${semanticOperation} · ${component}`, heroPlanId: plan.planId,
      heroId: plan.heroId, component, semanticOperation
    }
  };
}

function refineCrownRecipe(recipeInput, plan, structure) {
  const a4MakeRecipe = structuredClone(recipeInput), isCenter = a4MakeRecipe.targetRegionId === structure.centerRegionId;
  const component = isCenter ? 'flower-center' : 'crown';
  const targetRegion = structure.regions.find(region => region.regionId === a4MakeRecipe.targetRegionId);
  const ring = targetRegion?.petal?.ring || null;
  a4MakeRecipe.schemaVersion = '0.2';
  a4MakeRecipe.refinement = a4RefinementFor(component, a4MakeRecipe.operation, a4MakeRecipe.seed);
  a4MakeRecipe.constraints = { ...(a4MakeRecipe.constraints || {}) };
  if (a4MakeRecipe.operation === 'Base Wash') a4MakeRecipe.constraints.coverageRetention = a4CoverageRetention(component, { ring });
  if (a4MakeRecipe.operation === 'Boundary Dissolve') {
    a4MakeRecipe.constraints.coverageRetention = a4CoverageRetention(component, { ring });
    a4MakeRecipe.constraints.coverageRetention.visualWeight = .42;
  }
  a4MakeRecipe.metadata = {
    ...a4MakeRecipe.metadata, label: String(a4MakeRecipe.metadata?.label || '').replace('WP5', 'WP7R'),
    heroPlanId: plan.planId, heroId: plan.heroId,
    component, qualityRefinement: 'hero-visual-quality-recovery-v0.7r'
  };
  if (!isCenter && ['Base Wash', 'Transparent Glaze', 'Directional Brushwork'].includes(a4MakeRecipe.operation)) a4MakeRecipe.direction = 'base-to-tip';
  if (isCenter) {
    const crownBase = plan.crownPlan.crownBasePalette;
    const center = plan.crownPlan.centerPalette;
    if (a4MakeRecipe.operation === 'Base Wash') a4MakeRecipe.palette = [crownBase[2] || crownBase[0], crownBase[0], center[1] || crownBase[1]];
    if (a4MakeRecipe.operation === 'Root Shadow') a4MakeRecipe.palette = [crownBase[2] || crownBase[0]];
    if (a4MakeRecipe.operation === 'Central Light') a4MakeRecipe.palette = [center.at(-1), crownBase[1] || crownBase[0]];
    if (a4MakeRecipe.operation === 'Directional Brushwork') a4MakeRecipe.palette = [center[1] || crownBase[1]];
    if (a4MakeRecipe.operation === 'Edge Light') a4MakeRecipe.palette = [center.at(-1)];
    if (a4MakeRecipe.operation === 'Transparent Glaze') a4MakeRecipe.palette = [crownBase[0], center[1] || crownBase[1]];
    a4MakeRecipe.opacity = a4ScalePair(a4MakeRecipe.opacity, a4MakeRecipe.operation === 'Base Wash' ? .82 : .62);
    a4MakeRecipe.widthRange = a4MakeRecipe.widthRange.map(value => a4RecipeClamp(value * .72, .5, 120));
  }
  a4MakeRecipe.jitter = a4RecipeClamp(a4MakeRecipe.jitter * (isCenter ? .78 : .58), 0, 1);
  a4MakeRecipe.spacing = a4RecipeClamp(a4MakeRecipe.spacing * .92, .001, .25);
  if (a4MakeRecipe.operation === 'Base Wash') {
    a4MakeRecipe.density = a4RecipeClamp(a4MakeRecipe.density * 1.65, 18, 256);
    a4MakeRecipe.opacity = isCenter ? [.58, .82] : ring === 'inner' ? [.47, .72] : [.45, .71];
    a4MakeRecipe.coverage = a4RecipeClamp(a4MakeRecipe.coverage + .035, 0, 1);
    a4MakeRecipe.widthRange = a4MakeRecipe.widthRange.map(value => a4RecipeClamp(value * 1.08, .5, 120));
  }
  if (['Root Shadow', 'Fold Shadow', 'Overlap Shadow'].includes(a4MakeRecipe.operation)) {
    a4MakeRecipe.opacity = a4ScalePair(a4MakeRecipe.opacity, 1.02);
    a4MakeRecipe.density = a4RecipeClamp(a4MakeRecipe.density * .90, 1, 256);
  }
  if (['Central Light', 'Edge Light'].includes(a4MakeRecipe.operation)) {
    a4MakeRecipe.opacity = a4ScalePair(a4MakeRecipe.opacity, .98);
    a4MakeRecipe.feather = a4RecipeClamp(Math.max(a4MakeRecipe.feather, .006), 0, .1);
  }
  if (a4MakeRecipe.operation === 'Transparent Glaze') {
    a4MakeRecipe.opacity = a4ScalePair(a4MakeRecipe.opacity, .86);
    a4MakeRecipe.density = a4RecipeClamp(a4MakeRecipe.density * 1.10, 1, 256);
    a4MakeRecipe.passes = Math.max(1, Math.min(2, a4MakeRecipe.passes));
  }
  if (a4MakeRecipe.operation === 'Directional Brushwork') {
    a4MakeRecipe.opacity = a4ScalePair(a4MakeRecipe.opacity, .72);
    a4MakeRecipe.density = a4RecipeClamp(a4MakeRecipe.density * .82, 1, 256);
    a4MakeRecipe.widthRange = a4MakeRecipe.widthRange.map(value => a4RecipeClamp(value * .82, .5, 120));
  }
  if (a4MakeRecipe.operation === 'Boundary Dissolve') {
    a4MakeRecipe.opacity = a4ScalePair(a4MakeRecipe.opacity, .34);
    a4MakeRecipe.feather = a4RecipeClamp(Math.max(a4MakeRecipe.feather, .009), 0, .1);
  }

  if (a4MakeRecipe.operation === 'Base Wash') a4MakeRecipe.brushPreset = plan.crownPlan.brushPresets.wash;
  if (a4MakeRecipe.operation === 'Transparent Glaze') a4MakeRecipe.brushPreset = plan.crownPlan.brushPresets.soft;
  if (!isCenter && a4MakeRecipe.operation === 'Base Wash') {
    a4MakeRecipe.widthRange = [Math.max(18, a4MakeRecipe.widthRange[0] * 1.18), Math.min(54, a4MakeRecipe.widthRange[1] * 1.25)];
    a4MakeRecipe.jitter = Math.min(a4MakeRecipe.jitter, .055);
  }
  if (!isCenter && a4MakeRecipe.operation === 'Directional Brushwork') {
    a4MakeRecipe.spacing = Math.max(.036, a4MakeRecipe.spacing * 1.08);
    a4MakeRecipe.jitter = Math.min(a4MakeRecipe.jitter, .07);
  }
  return a4MakeRecipe;
}

export function generateA4HeroRecipes(plan, structure) {
  const crownRecipes = [
    ...generatePetalRecipes(plan.crownPlan, structure),
    ...generateCenterRecipes(plan.crownPlan, structure)
  ].map(a4MakeRecipe => refineCrownRecipe(a4MakeRecipe, plan, structure));

  const stem = plan.stemPlan, stemId = stem.regionId, stemOps = [
    a4MakeRecipe({ plan, regionId: stemId, component: 'stem', semanticOperation: 'Base Color', operation: 'Base Wash', brushPreset: stem.brushPresets.wash, direction: 'base-to-tip', palette: stem.palette, coverage: .98, opacity: a4ScalePair([.26, .46], stem.opacityScale), density: 26, spacing: .030, widthRange: [18, 36], jitter: .012, feather: stem.edgeSoftness, constraints: { axisContinuous: true, coverageRetention: a4CoverageRetention('stem') } }),
    a4MakeRecipe({ plan, regionId: stemId, component: 'stem', semanticOperation: 'Longitudinal Light', operation: 'Central Light', brushPreset: stem.brushPresets.light, direction: 'base-to-tip', palette: [stem.palette[1] || stem.palette[0]], coverage: .82, opacity: a4ScalePair([.035, .105], stem.opacityScale), density: 18, spacing: .031, widthRange: [8, 18], jitter: .035, feather: stem.edgeSoftness, blendMode: 'screen', constraints: { bandWidth: .018 } }),
    a4MakeRecipe({ plan, regionId: stemId, component: 'stem', semanticOperation: 'Side Shadow', operation: 'Fold Shadow', brushPreset: stem.brushPresets.shadow, direction: 'base-to-tip', palette: [stem.palette.at(-1)], coverage: .78, opacity: a4ScalePair([.09, .22], stem.opacityScale), density: 18, spacing: .033, widthRange: [5, 13], jitter: .05, feather: stem.edgeSoftness, blendMode: 'multiply', constraints: { foldSide: plan.globalLightDirection.x < 0 ? 'right' : 'left', bandWidth: .022 } }),
    a4MakeRecipe({ plan, regionId: stemId, component: 'stem', semanticOperation: 'Soft Glaze', operation: 'Transparent Glaze', brushPreset: stem.brushPresets.glaze, direction: 'base-to-tip', palette: [stem.palette[0], stem.palette[1] || stem.palette[0]], coverage: .70, opacity: a4ScalePair([.025, .075], stem.opacityScale), density: 15, spacing: .038, widthRange: [8, 18], jitter: .05, feather: stem.edgeSoftness, blendMode: 'source-over' }),
    a4MakeRecipe({ plan, regionId: stemId, component: 'stem', semanticOperation: 'Directional Brushwork', operation: 'Directional Brushwork', brushPreset: stem.brushPresets.detail, direction: 'base-to-tip', palette: [stem.palette[1] || stem.palette[0]], coverage: .62, opacity: a4ScalePair([.025, .07], stem.opacityScale), density: 12, spacing: .044, widthRange: [2, 6], jitter: .035, feather: stem.edgeSoftness }),
    a4MakeRecipe({ plan, regionId: stemId, component: 'stem', semanticOperation: 'Edge Control', operation: 'Boundary Dissolve', brushPreset: stem.brushPresets.soft, direction: 'contour-follow', palette: [stem.palette[0]], coverage: .52, opacity: a4ScalePair([.018, .055], stem.opacityScale), density: 12, spacing: .042, widthRange: [7, 16], jitter: .09, feather: Math.max(stem.edgeSoftness, .006) })
  ];

  const leafRecipes = plan.leafPlans.flatMap(leaf => {
    const side = leaf.metadata.side, slot = leaf.metadata.slot || side, component = `leaf-${slot}`, regionId = leaf.regionId;
    const filigreePinnate = leaf.leafEdgeMode === 'filigree-pinnate-impression';
    const baseDensity = filigreePinnate ? 20 : 24;
    const edgeDensity = filigreePinnate ? 19 : 15;
    const detailWidth = filigreePinnate ? [2, 6] : [3, 8];
    return [
      a4MakeRecipe({ plan, regionId, component, semanticOperation: 'Base Wash', operation: 'Base Wash', brushPreset: leaf.brushPresets.wash, direction: 'base-to-tip', palette: leaf.palette, coverage: .98, opacity: a4ScalePair(filigreePinnate ? [.34, .55] : [.30, .52], leaf.opacityScale), density: baseDensity, spacing: filigreePinnate ? .034 : .034, widthRange: filigreePinnate ? [14, 32] : [18, 38], jitter: .025, feather: filigreePinnate ? Math.min(leaf.edgeSoftness, .0035) : leaf.edgeSoftness, constraints: { coverageRetention: a4CoverageRetention('leaf', { filigree: filigreePinnate }) }, seedOffset: 11 + (a4RecipeHashString(slot) % 23) }),
      a4MakeRecipe({ plan, regionId, component, semanticOperation: 'Root Shadow', operation: 'Root Shadow', brushPreset: leaf.brushPresets.shadow, direction: 'base-to-tip', palette: [leaf.palette.at(-1)], coverage: .78, opacity: a4ScalePair([.09, .23], leaf.opacityScale), density: 16, spacing: .035, widthRange: [8, 20], jitter: .07, feather: leaf.edgeSoftness, blendMode: 'multiply' }),
      a4MakeRecipe({ plan, regionId, component, semanticOperation: 'Central Light', operation: 'Central Light', brushPreset: leaf.brushPresets.light, direction: 'base-to-tip', palette: [leaf.palette[1] || leaf.palette[0]], coverage: .76, opacity: a4ScalePair([.03, .10], leaf.opacityScale), density: 17, spacing: .034, widthRange: [13, 30], jitter: .055, feather: leaf.edgeSoftness, blendMode: 'screen', constraints: { bandWidth: .055 } }),
      a4MakeRecipe({ plan, regionId, component, semanticOperation: 'Edge Light', operation: 'Edge Light', brushPreset: leaf.brushPresets.detail, direction: 'contour-follow', palette: [leaf.palette[1] || leaf.palette[0]], coverage: .56, opacity: a4ScalePair([.035, .11], leaf.opacityScale), density: edgeDensity, spacing: filigreePinnate ? .031 : .036, widthRange: filigreePinnate ? [2, 7] : [4, 10], jitter: .07, feather: leaf.edgeSoftness, blendMode: 'screen', constraints: { bandWidth: .04 } }),
      a4MakeRecipe({ plan, regionId, component, semanticOperation: 'Transparent Glaze', operation: 'Transparent Glaze', brushPreset: leaf.brushPresets.glaze, direction: 'base-to-tip', palette: leaf.palette.slice(0, 2), coverage: .70, opacity: a4ScalePair([.025, .08], leaf.opacityScale), density: 15, spacing: .039, widthRange: [10, 24], jitter: .065, feather: leaf.edgeSoftness, blendMode: 'source-over' }),
      a4MakeRecipe({ plan, regionId, component, semanticOperation: 'Directional Brushwork', operation: 'Directional Brushwork', brushPreset: leaf.brushPresets.detail, direction: 'base-to-tip', palette: leaf.palette.slice(0, 2), coverage: .60, opacity: a4ScalePair([.02, .065], leaf.opacityScale), density: filigreePinnate ? 16 : 12, spacing: filigreePinnate ? .039 : .046, widthRange: detailWidth, jitter: .055, feather: leaf.edgeSoftness }),
      a4MakeRecipe({ plan, regionId, component, semanticOperation: 'Boundary Dissolve', operation: 'Boundary Dissolve', brushPreset: leaf.brushPresets.soft, direction: 'contour-follow', palette: [leaf.palette[0]], coverage: .28, opacity: a4ScalePair([.008, .026], leaf.opacityScale), density: 8, spacing: .050, widthRange: [7, 15], jitter: .08, feather: Math.min(Math.max(leaf.edgeSoftness, .004), .006), constraints: { coverageRetention: { ...a4CoverageRetention('leaf', { filigree: filigreePinnate }), visualWeight: .34 } } })
    ];
  });

  const background = plan.backgroundPlan, backgroundId = background.regionId;
  const backgroundRecipes = [
    a4MakeRecipe({ plan, regionId: backgroundId, component: 'background', semanticOperation: 'Base Field', operation: 'Base Wash', brushPreset: background.brushPresets.wash, direction: 'contour-follow', palette: background.palette, coverage: .94, opacity: [.075, .16], density: 22, spacing: .040, widthRange: [52, 96], jitter: .045, feather: background.edgeSoftness }),
    a4MakeRecipe({ plan, regionId: backgroundId, component: 'background', semanticOperation: 'Soft Gradient Field', operation: 'Transparent Glaze', brushPreset: background.brushPresets.glaze, direction: plan.globalLightDirection.y < 0 ? 'tip-to-base' : 'base-to-tip', palette: background.palette.slice(0, 2), coverage: .70, opacity: [.018, .055], density: 22, spacing: .038, widthRange: [30, 66], jitter: .08, feather: background.edgeSoftness, blendMode: 'soft-light' }),
    a4MakeRecipe({ plan, regionId: backgroundId, component: 'background', semanticOperation: 'Quiet Texture', operation: 'Directional Brushwork', brushPreset: background.brushPresets.detail, direction: 'contour-follow', palette: background.palette, coverage: .34, opacity: [a4RecipeClamp(.004 * (1 + background.textureStrength), .003, .016), a4RecipeClamp(.012 * (1 + background.textureStrength), .006, .035)], density: 5, spacing: .070, widthRange: [12, 30], jitter: .08, feather: background.edgeSoftness }),
    a4MakeRecipe({ plan, regionId: backgroundId, component: 'background', semanticOperation: 'Edge Suppression', operation: 'Boundary Dissolve', brushPreset: background.brushPresets.soft, direction: 'contour-follow', palette: [background.palette[0]], coverage: .42, opacity: [.01, .035], density: 11, spacing: .055, widthRange: [24, 54], jitter: .16, feather: Math.max(background.edgeSoftness, .012) }),
    a4MakeRecipe({ plan, regionId: backgroundId, component: 'background', semanticOperation: 'Subject Separation', operation: 'Edge Light', brushPreset: background.brushPresets.soft, direction: 'contour-follow', palette: [background.palette[1] || background.palette[0]], coverage: .50, opacity: [.012, .042], density: 17, spacing: .043, widthRange: [16, 38], jitter: .10, feather: background.edgeSoftness, blendMode: 'screen', constraints: { subjectSeparation: true, bandWidth: .032 } })
  ];

  const all = [...backgroundRecipes, ...leafRecipes, ...stemOps, ...crownRecipes];
  const regionById = new Map(structure.regions.map(region => [region.regionId, region]));
  const z = new Map(structure.regions.map(region => [region.regionId, region.z]));
  const operationOrder = new Map(['Base Wash', 'Directional Glaze', 'Root Shadow', 'Fold Shadow', 'Overlap Shadow', 'Central Light', 'Edge Light', 'Transparent Glaze', 'Directional Brushwork', 'Boundary Dissolve'].map((name, index) => [name, index]));
  const stage = recipe => {
    const region = regionById.get(recipe.targetRegionId), component = recipe.metadata?.component;
    if (component === 'background') return recipe.operation === 'Base Wash' ? 0 : 4;
    if (component === 'stem') return recipe.operation === 'Base Wash' ? 10 : 18;
    if (component?.startsWith('leaf-')) return recipe.operation === 'Base Wash' ? 12 : 20;
    if (region?.kind === 'petal-region') {
      if (recipe.operation === 'Base Wash') return region.petal?.ring === 'inner' ? 31 : 30;
      if (['Root Shadow', 'Fold Shadow', 'Overlap Shadow'].includes(recipe.operation)) return 36;
      if (['Central Light', 'Transparent Glaze'].includes(recipe.operation)) return 42;
      if (recipe.operation === 'Directional Brushwork') return 48;
      if (recipe.operation === 'Edge Light') return 50;
      if (recipe.operation === 'Boundary Dissolve') return 58;
    }
    if (region?.kind === 'flower-center-region') {
      if (recipe.operation === 'Base Wash') return 44;
      if (recipe.operation === 'Root Shadow') return 45;
      if (recipe.operation === 'Directional Brushwork') return 51;
      if (recipe.operation === 'Central Light' || recipe.operation === 'Edge Light') return 52;
      if (recipe.operation === 'Transparent Glaze') return 53;
      return 54;
    }
    return 60;
  };
  return all.sort((a, b) => stage(a) - stage(b) || (z.get(a.targetRegionId) ?? 0) - (z.get(b.targetRegionId) ?? 0) || (operationOrder.get(a.operation) ?? 99) - (operationOrder.get(b.operation) ?? 99) || a.recipeId.localeCompare(b.recipeId));
}
