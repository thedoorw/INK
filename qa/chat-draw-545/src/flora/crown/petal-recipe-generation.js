import { PAINTING_RECIPE_OPERATIONS } from '../recipe/painting-recipe-schema.js';

const crownRecipeClamp = (value, min, max) => Math.max(min, Math.min(max, value));
const crownRecipeHashString = text => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return hash >>> 0;
};
const crownRecipeRandom = seed => {
  let state = seed >>> 0;
  return () => {
    state |= 0; state = state + 0x6D2B79F5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
};
const crownRecipeSlug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const crownRecipeNormalize = vector => {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
};
const crownEdgeFeather = level => level === 'crisp' ? .004 : level === 'soft' ? .026 : .013;

function crownHexToHsl(hex) {
  const value = hex.slice(1), r = parseInt(value.slice(0, 2), 16) / 255, g = parseInt(value.slice(2, 4), 16) / 255, b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min, s = l > .5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return { h, s, l };
}
function crownHue2rgb(p, q, t) {
  if (t < 0) t += 1; if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
function crownHslToHex({ h, s, l }) {
  let r, g, b;
  if (s === 0) r = g = b = l;
  else {
    const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    r = crownHue2rgb(p, q, h + 1 / 3); g = crownHue2rgb(p, q, h); b = crownHue2rgb(p, q, h - 1 / 3);
  }
  return `#${[r, g, b].map(value => Math.round(crownRecipeClamp(value, 0, 1) * 255).toString(16).padStart(2, '0')).join('')}`;
}
function crownVaryColor(hex, lightness, saturation) {
  const hsl = crownHexToHsl(hex);
  return crownHslToHex({ h: hsl.h, s: crownRecipeClamp(hsl.s + saturation, 0, 1), l: crownRecipeClamp(hsl.l + lightness, .03, .97) });
}
function crownOperationPalette(operation, base, secondary, light, shadow) {
  if (['Root Shadow', 'Fold Shadow', 'Overlap Shadow'].includes(operation)) return [shadow, crownVaryColor(shadow, .035, -.015)];
  if (['Central Light', 'Edge Light'].includes(operation)) return [light, crownVaryColor(light, .04, -.03)];
  if (operation === 'Transparent Glaze') return [secondary, crownVaryColor(base, .02, .04)];
  if (operation === 'Boundary Dissolve') return [crownVaryColor(base, .12, -.08)];
  if (operation === 'Directional Brushwork') return [crownVaryColor(base, -.025, .06), crownVaryColor(secondary, .015, .03)];
  return [base, secondary];
}
function crownOperationBrush(operation, brushes) {
  if (operation === 'Base Wash') return brushes.wash;
  if (['Root Shadow', 'Overlap Shadow'].includes(operation)) return brushes.shadow;
  if (operation === 'Fold Shadow' || operation === 'Directional Brushwork' || operation === 'Edge Light') return brushes.detail;
  if (operation === 'Central Light' || operation === 'Boundary Dissolve') return brushes.soft;
  if (operation === 'Transparent Glaze') return brushes.glaze;
  return brushes.light;
}
function crownOperationDirection(operation) {
  if (['Edge Light', 'Overlap Shadow', 'Boundary Dissolve', 'Base Wash'].includes(operation)) return 'contour-follow';
  return 'base-to-tip';
}
function crownOperationBlend(operation) {
  if (['Root Shadow', 'Fold Shadow', 'Overlap Shadow'].includes(operation)) return 'multiply';
  if (['Central Light', 'Edge Light'].includes(operation)) return 'screen';
  if (operation === 'Transparent Glaze') return 'source-over';
  return 'source-over';
}
function crownCircularDistance(a, b, count) { const d = Math.abs(a - b); return Math.min(d, count - d); }

export function generatePetalRecipes(plan, structure, { regionIds = null, operation = null, overrides = {} } = {}) {
  const petals = structure.regions.filter(region => region.kind === 'petal-region').sort((a, b) => a.index - b.index);
  const selected = regionIds ? petals.filter(region => regionIds.includes(region.regionId)) : petals;
  const zMin = Math.min(...petals.map(region => region.z)), zMax = Math.max(...petals.map(region => region.z));
  const light = crownRecipeNormalize(plan.globalLightDirection), recipes = [];
  for (const region of selected) {
    const random = crownRecipeRandom((plan.seed ^ crownRecipeHashString(region.regionId)) >>> 0);
    const axis = crownRecipeNormalize({ x: region.growthAxis.tip.x - region.growthAxis.base.x, y: region.growthAxis.tip.y - region.growthAxis.base.y });
    const lightFacing = crownRecipeClamp((axis.x * light.x + axis.y * light.y + 1) / 2, 0, 1);
    const depth = zMax === zMin ? .5 : (region.z - zMin) / (zMax - zMin);
    const focalDistance = crownCircularDistance(region.index, plan.focalRegion.petalIndex, plan.petalCount);
    const focal = crownRecipeClamp(1 - focalDistance / Math.max(1, plan.petalCount / 2), 0, 1);
    const ring = region.petal?.ring || 'single';
    const bowlDepth = crownRecipeClamp(region.petal?.bowlDepth || 0, 0, 1);
    const ringMass = ring === 'inner' ? .92 : ring === 'outer' ? 1.04 : 1;
    const variation = plan.petalPaletteVariation;
    const lShift = variation.lightnessRange[0] + (variation.lightnessRange[1] - variation.lightnessRange[0]) * (.2 + .5 * lightFacing + .3 * random());
    const sShift = variation.saturationRange[0] + (variation.saturationRange[1] - variation.saturationRange[0]) * random();
    const baseSource = plan.crownBasePalette[region.index % plan.crownBasePalette.length];
    const secondarySource = plan.crownBasePalette[(region.index + 1) % plan.crownBasePalette.length];
    const base = crownVaryColor(baseSource, lShift, sShift), secondary = crownVaryColor(secondarySource, lShift * .7, sShift * .8);
    const lightColor = crownVaryColor(base, .22 + lightFacing * .08, -.08);
    const shadowColor = crownVaryColor(base, -.25 - (1 - depth) * .06, .02);
    const edgeLevel = region.regionId === structure.focalRegionId ? plan.edgeHierarchy.focal : depth > .58 ? plan.edgeHierarchy.front : plan.edgeHierarchy.rear;
    const feather = crownEdgeFeather(edgeLevel);
    const operations = operation ? [operation] : PAINTING_RECIPE_OPERATIONS;
    for (const op of operations) {
      const overlap = op === 'Overlap Shadow'
        ? (region.overlaps.find(item => item.kind === 'petal-seam') || region.overlaps.find(item => item.kind === 'center-seam') || region.overlaps[0])
        : null;
      if (op === 'Overlap Shadow' && !overlap) continue;
      const strength = op === 'Root Shadow' ? plan.shadowStrategy.root
        : op === 'Fold Shadow' ? plan.shadowStrategy.fold
        : op === 'Overlap Shadow' ? plan.shadowStrategy.overlap
        : op === 'Transparent Glaze' ? plan.glazeStrategy.strength : 1;
      const recipeId = `${plan.planId}:${region.regionId.split(':').at(-1)}:${crownRecipeSlug(op)}`;
      const baseOpacity = op === 'Base Wash' ? [.12, .29] : ['Root Shadow', 'Fold Shadow', 'Overlap Shadow'].includes(op) ? [.045, .16] : ['Central Light', 'Edge Light'].includes(op) ? [.03, .11] : op === 'Transparent Glaze' ? [.025, .10] : [.035, .14];
      const opacityScale = crownRecipeClamp((.70 + focal * .22 + depth * .12 + bowlDepth * .08 + (random() - .5) * .08) * ringMass, .55, 1.22) * strength;
      const constraints = { bandWidth: op === 'Overlap Shadow' ? overlap?.bandWidth || .03 : op === 'Fold Shadow' ? .044 + random() * .018 : .04 + random() * .018, preserveManual: true };
      if (op === 'Overlap Shadow') constraints.frontRegionId = overlap.frontRegionId;
      if (op === 'Fold Shadow') constraints.foldSide = light.x > .12 ? 'left' : light.x < -.12 ? 'right' : 'center';
      const recipe = {
        recipeId, schemaVersion: '0.1', targetRegionId: region.regionId, operation: op,
        brushPreset: crownOperationBrush(op, plan.brushPresets), direction: crownOperationDirection(op),
        palette: crownOperationPalette(op, base, secondary, lightColor, shadowColor),
        coverage: crownRecipeClamp((op === 'Base Wash' ? .94 + bowlDepth * .025 : op === 'Boundary Dissolve' ? .58 : .72) + (random() - .5) * .08, .4, .99),
        opacity: [crownRecipeClamp(baseOpacity[0] * opacityScale, .008, .8), crownRecipeClamp(baseOpacity[1] * opacityScale, .015, .9)],
        density: Math.round((op === 'Base Wash' ? 12 : op === 'Directional Brushwork' ? 10 : 8) + focal * 2 + random() * 2),
        spacing: crownRecipeClamp(.033 + (random() - .5) * .007, .024, .048),
        widthRange: op === 'Base Wash' ? [16 + depth * 3, 30 + focal * 6] : op === 'Boundary Dissolve' ? [15, 34] : op === 'Directional Brushwork' ? [3, 8 + focal * 2] : op === 'Central Light' ? [10, 24] : [4, 16],
        jitter: crownRecipeClamp(.08 + random() * .12 + (1 - focal) * .04, 0, .35),
        feather: op === 'Boundary Dissolve' ? crownRecipeClamp(feather + .012, 0, .05) : op === 'Edge Light' ? Math.max(.002, feather * .55) : feather,
        passes: op === 'Transparent Glaze' ? plan.glazeStrategy.passes : 1,
        blendMode: crownOperationBlend(op), seed: (plan.seed + crownRecipeHashString(recipeId)) >>> 0,
        constraints,
        metadata: {
          source: 'ai', label: `WP5 Crown ${op} · Petal ${region.index + 1}`,
          crownPlanId: plan.planId, crownId: plan.crownId, regionRole: region.role,
          lightFacing: Number(lightFacing.toFixed(5)), depth: Number(depth.toFixed(5)), focalDistance,
          petalGeometryFamily: plan.petalGeometryFamily || region.petal?.geometryFamily || 'broad-organic', petalRhythm: plan.petalRhythm || 'single-layer', ring, bowlDepth: Number(bowlDepth.toFixed(5))
        }
      };
      const patch = overrides[recipeId] || overrides[region.regionId] || {};
      if (patch.edgeSoftness !== undefined) recipe.feather = crownRecipeClamp(Number(patch.edgeSoftness), 0, .1);
      Object.assign(recipe, structuredClone(patch));
      delete recipe.edgeSoftness;
      recipes.push(recipe);
    }
  }
  return recipes;
}

export function generateCenterRecipes(plan, structure, { operation = null, overrides = {} } = {}) {
  const center = structure.regions.find(region => region.kind === 'flower-center-region');
  if (!center) throw new Error('flower center region missing');
  const denseGold = plan.centerMode === 'dense-irregular-gold' || center.center?.mode === 'dense-irregular-gold';
  const specs = [
    ['Base Wash', plan.brushPresets.wash, 'radial-out', 'source-over', plan.centerPalette, denseGold ? [.22, .43] : [.16, .34], denseGold ? 20 : 14, denseGold ? [12, 28] : [10, 24], .010],
    ['Root Shadow', plan.brushPresets.shadow, 'radial-out', 'multiply', [crownVaryColor(plan.centerPalette[0], -.18, .08)], denseGold ? [.075, .18] : [.07, .19], denseGold ? 15 : 11, [6, 18], .010],
    ['Central Light', plan.brushPresets.soft, 'radial-out', 'screen', [crownVaryColor(plan.centerPalette.at(-1), .20, -.08)], denseGold ? [.05, .15] : [.035, .12], denseGold ? 14 : 10, [8, 22], .014],
    ['Directional Brushwork', plan.brushPresets.detail, 'radial-out', 'source-over', [plan.centerPalette[1 % plan.centerPalette.length], plan.centerPalette.at(-1)], denseGold ? [.07, .20] : [.06, .18], denseGold ? 23 : 14, denseGold ? [1.5, 6] : [2.5, 7], .009],
    ['Edge Light', plan.brushPresets.detail, 'contour-follow', 'screen', [crownVaryColor(plan.centerPalette.at(-1), .25, -.10)], [.04, .13], denseGold ? 14 : 10, [3, 8], .006],
    ['Transparent Glaze', plan.brushPresets.glaze, 'radial-out', 'source-over', [...plan.centerPalette].reverse(), denseGold ? [.035, .11] : [.025, .09], denseGold ? 14 : 10, [7, 18], .012]
  ];
  const recipes = specs.filter(spec => !operation || spec[0] === operation).map((spec, index) => {
    const [op, brushPreset, direction, blendMode, palette, opacity, density, widthRange, feather] = spec;
    const recipeId = `${plan.planId}:center:${crownRecipeSlug(op)}`;
    const recipe = {
      recipeId, schemaVersion: '0.1', targetRegionId: center.regionId, operation: op,
      brushPreset, direction, palette: [...palette], coverage: op === 'Base Wash' ? .94 : .74,
      opacity: op === 'Transparent Glaze' ? opacity.map(value => crownRecipeClamp(value * plan.glazeStrategy.strength, .008, .9)) : [...opacity],
      density, spacing: (denseGold ? .027 : .032) + index * .0013, widthRange: [...widthRange],
      jitter: (denseGold ? .18 : .10) + index * .012, feather, passes: op === 'Transparent Glaze' ? plan.glazeStrategy.passes : 1,
      blendMode, seed: (plan.seed + crownRecipeHashString(recipeId)) >>> 0,
      constraints: { bandWidth: .035, preserveManual: true },
      metadata: { source: 'ai', label: `WP7R Crown ${op} · Flower Center`, crownPlanId: plan.planId, crownId: plan.crownId, regionRole: 'flower-center', centerMode: denseGold ? 'dense-irregular-gold' : 'abstract-irregular', featureSpacingCv: center.center?.featureSpacingCv || 0 }
    };
    const patch = overrides[recipeId] || overrides[center.regionId] || {};
    if (patch.edgeSoftness !== undefined) recipe.feather = crownRecipeClamp(Number(patch.edgeSoftness), 0, .1);
    Object.assign(recipe, structuredClone(patch)); delete recipe.edgeSoftness;
    return recipe;
  });
  if (!operation || operation === 'Overlap Shadow') {
    for (const [index, overlap] of (center.overlaps || []).entries()) {
      const recipeId = `${plan.planId}:center:overlap-shadow:${String(index + 1).padStart(2, '0')}`;
      const recipe = {
        recipeId, schemaVersion: '0.1', targetRegionId: center.regionId, operation: 'Overlap Shadow',
        brushPreset: plan.brushPresets.shadow, direction: 'contour-follow',
        palette: [crownVaryColor(plan.centerPalette[0], -.22, .03)], coverage: .78,
        opacity: [.045, .14], density: 8, spacing: .035, widthRange: [4, 14], jitter: .05,
        feather: .010, passes: 1, blendMode: 'multiply', seed: (plan.seed + crownRecipeHashString(recipeId)) >>> 0,
        constraints: { bandWidth: overlap.bandWidth || .024, frontRegionId: overlap.frontRegionId, preserveManual: true },
        metadata: { source: 'ai', label: `WP7R Crown Overlap Shadow · Center seam ${index + 1}`, crownPlanId: plan.planId, crownId: plan.crownId, regionRole: 'flower-center' }
      };
      const patch = overrides[recipeId] || overrides[center.regionId] || {};
      if (patch.edgeSoftness !== undefined) recipe.feather = crownRecipeClamp(Number(patch.edgeSoftness), 0, .1);
      Object.assign(recipe, structuredClone(patch)); delete recipe.edgeSoftness;
      recipes.push(recipe);
    }
  }
  return recipes;
}
