import { artboardTrimBounds } from '../../document/artboard.js';
import { rasterizeVectorMask, worldPointToNormalized } from '../mask/vector-mask.js';
import { rasterizeGeometryPath } from '../structure/geometry-measurement-gates.js';

const PaintedGeometryRetentionModule = (() => {

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const countOn = mask => mask.reduce((sum, value) => sum + (value ? 1 : 0), 0);
const ratio = (value, total) => total ? value / total : 0;

const PAINTED_RETENTION_THRESHOLDS = Object.freeze({
  geometryToMaskArea: .985,
  maskToFinalAlphaArea: .82,
  finalVisibleColorArea: .76,
  petalBodyCoverage: .84,
  petalRootCoverage: .88,
  crownCoreCoverage: .90,
  ringSurvival: .80,
  centerVisibleRatio: .68,
  centerFeatureSurvival: .62,
  leafBodyWidthRetention: .76,
  leafLobeSurvival: .70,
  leafSmallViewSilhouette: .72,
  stemToLeafVisualWeightMaximum: .90,
  maximumPaintedRadialGapRatio: .11
});

function maskUnion(masks) {
  if (!masks.length) return new Uint8Array(0);
  const output = new Uint8Array(masks[0].length);
  for (const mask of masks) for (let index = 0; index < output.length; index += 1) if (mask[index]) output[index] = 1;
  return output;
}

function maskIntersectionCount(a, b) {
  let count = 0;
  for (let index = 0; index < a.length; index += 1) if (a[index] && b[index]) count += 1;
  return count;
}

function componentAreas(mask, width, height) {
  const seen = new Uint8Array(mask.length), areas = [], stack = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1; stack.push(start); let area = 0;
    while (stack.length) {
      const index = stack.pop(); area += 1;
      const x = index % width, y = Math.floor(index / width);
      for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
        if (!ox && !oy) continue;
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const candidate = ny * width + nx;
        if (!seen[candidate] && mask[candidate]) { seen[candidate] = 1; stack.push(candidate); }
      }
    }
    areas.push(area);
  }
  return areas.sort((a, b) => b - a);
}

function effectiveComponentAreas(mask, width, height, minimumRatio = .005) {
  const areas = componentAreas(mask, width, height);
  const total = areas.reduce((sum, value) => sum + value, 0);
  const minimum = Math.max(3, total * minimumRatio);
  return areas.filter(area => area >= minimum);
}

function matrixTranslation(matrix) {
  if (Array.isArray(matrix)) return { x: Number(matrix[4]) || 0, y: Number(matrix[5]) || 0 };
  return { x: Number(matrix?.e) || 0, y: Number(matrix?.f) || 0 };
}

function drawDisk(alpha, width, height, cx, cy, radiusX, radiusY, deposit) {
  const minX = clamp(Math.floor(cx - radiusX - 1), 0, width - 1), maxX = clamp(Math.ceil(cx + radiusX + 1), 0, width - 1);
  const minY = clamp(Math.floor(cy - radiusY - 1), 0, height - 1), maxY = clamp(Math.ceil(cy + radiusY + 1), 0, height - 1);
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    const dx = (x + .5 - cx) / Math.max(.5, radiusX), dy = (y + .5 - cy) / Math.max(.5, radiusY);
    const distance = Math.hypot(dx, dy);
    if (distance > 1) continue;
    const coverage = deposit * (1 - distance * distance);
    const index = y * width + x;
    alpha[index] = 1 - (1 - alpha[index]) * (1 - coverage);
  }
}

function rasterizePaintedStrokeCoverage({ page, region, strokes, width = 128, height = 181 }) {
  const trim = artboardTrimBounds(page), alpha = new Float32Array(width * height);
  for (const stroke of strokes || []) {
    const translation = matrixTranslation(stroke.matrix), points = (stroke.points || []).map(point => {
      const normalized = worldPointToNormalized(page, { x: translation.x + point.x, y: translation.y + point.y });
      return { x: normalized.x * width, y: normalized.y * height, p: Number.isFinite(point.p) ? point.p : 1 };
    });
    if (!points.length) continue;
    const radiusX = Math.max(.55, (Number(stroke.size) || 1) * .5 / trim.w * width);
    const radiusY = Math.max(.55, (Number(stroke.size) || 1) * .5 / trim.h * height);
    const opacity = clamp(Number(stroke.opacity) || 0, 0, 1);
    for (let segment = 0; segment < Math.max(1, points.length - 1); segment += 1) {
      const a = points[segment], b = points[Math.min(points.length - 1, segment + 1)];
      const distance = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(distance / .55));
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        const pressure = clamp(a.p + (b.p - a.p) * t, .05, 1);
        drawDisk(alpha, width, height, x, y, radiusX * (.62 + pressure * .38), radiusY * (.62 + pressure * .38), opacity * pressure * .72);
      }
    }
  }
  const geometryMask = rasterizeGeometryPath(region.path, width, height), output = new Float32Array(alpha.length);
  for (let index = 0; index < alpha.length; index += 1) output[index] = geometryMask[index] ? alpha[index] : 0;
  return output;
}

function binaryFromAlpha(alpha, threshold = .08) {
  const output = new Uint8Array(alpha.length);
  for (let index = 0; index < alpha.length; index += 1) if (alpha[index] >= threshold) output[index] = 1;
  return output;
}

function selectorByAxis(region, width, height, maximumT = 1) {
  const base = region.growthAxis?.base, tip = region.growthAxis?.tip;
  if (!base || !tip) return new Uint8Array(width * height).fill(1);
  const vx = tip.x - base.x, vy = tip.y - base.y, length2 = vx * vx + vy * vy || 1;
  const selector = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const nx = (x + .5) / width, ny = (y + .5) / height;
    const t = ((nx - base.x) * vx + (ny - base.y) * vy) / length2;
    if (t >= -.02 && t <= maximumT) selector[y * width + x] = 1;
  }
  return selector;
}

function selectorCoverage(mask, painted, selector) {
  let total = 0, covered = 0;
  for (let index = 0; index < mask.length; index += 1) if (mask[index] && selector[index]) { total += 1; if (painted[index]) covered += 1; }
  return ratio(covered, total);
}

function sampleAlpha(alpha, width, height, point) {
  const x = clamp(Math.floor(point.x * width), 0, width - 1), y = clamp(Math.floor(point.y * height), 0, height - 1);
  return alpha[y * width + x];
}

function smallViewIou(geometryMask, paintedMask, width, height, smallWidth = 80) {
  const smallHeight = Math.max(1, Math.round(height / width * smallWidth));
  let intersection = 0, union = 0;
  for (let sy = 0; sy < smallHeight; sy += 1) for (let sx = 0; sx < smallWidth; sx += 1) {
    const x0 = Math.floor(sx * width / smallWidth), x1 = Math.max(x0 + 1, Math.floor((sx + 1) * width / smallWidth));
    const y0 = Math.floor(sy * height / smallHeight), y1 = Math.max(y0 + 1, Math.floor((sy + 1) * height / smallHeight));
    let g = false, p = false;
    for (let y = y0; y < y1 && (!g || !p); y += 1) for (let x = x0; x < x1; x += 1) {
      const index = y * width + x; if (geometryMask[index]) g = true; if (paintedMask[index]) p = true;
    }
    if (g && p) intersection += 1;
    if (g || p) union += 1;
  }
  return ratio(intersection, union);
}


function diagnoseRegionPaintedStages({ page, structure, regionId, width = 128, height = 181, alphaThreshold = .08 }) {
  const region = structure.regions.find(item => item.regionId === regionId);
  if (!region) throw new Error(`Unknown retention diagnostic Region: ${regionId}`);
  const objects = page.layers.flatMap(layer => layer.objects || []).filter(object => object.floraPaint?.regionId === regionId);
  const geometryMask = rasterizeGeometryPath(region.path, width, height);
  const mask = structure.masks.find(item => item.regionId === regionId);
  const rawMask = mask ? rasterizeVectorMask({ ...mask, feather: 0 }, width, height).alpha : geometryMask;
  const featheredMask = mask ? rasterizeVectorMask(mask, width, height).alpha : rawMask;
  const paintedAlpha = rasterizePaintedStrokeCoverage({ page, region, strokes: objects, width, height });
  const paintedMask = binaryFromAlpha(paintedAlpha, alphaThreshold);
  return { regionId, kind: region.kind, width, height, geometryMask, rawMask, featheredMask, paintedAlpha, paintedMask };
}

function measureRegionPaintedRetention({ page, structure, region, strokes, width = 128, height = 181, alphaThreshold = .08 }) {
  const geometryMask = rasterizeGeometryPath(region.path, width, height), mask = structure.masks.find(item => item.regionId === region.regionId);
  const rawMask = mask ? rasterizeVectorMask({ ...mask, feather: 0 }, width, height).alpha : geometryMask;
  const feathered = mask ? rasterizeVectorMask(mask, width, height).alpha : rawMask;
  const paintedAlpha = rasterizePaintedStrokeCoverage({ page, region, strokes, width, height });
  const paintedMask = binaryFromAlpha(paintedAlpha, alphaThreshold), rootSelector = selectorByAxis(region, width, height, .28);
  const geometryArea = countOn(geometryMask), rawMaskArea = [...rawMask].filter(value => value > 0).length;
  const featheredMaskArea = [...feathered].filter(value => value >= 16).length, finalAlphaArea = countOn(paintedMask);
  const centralAxis = region.leaf?.centralAxis || [], crossSections = region.leaf?.crossSections || [];
  const lobeSamples = [];
  for (const [side, lobes] of [['left', region.leaf?.pinnate?.leftLobes || []], ['right', region.leaf?.pinnate?.rightLobes || []]]) {
    for (const lobe of lobes) {
      if (!crossSections.length || !Number.isFinite(lobe.center)) continue;
      const section = crossSections.reduce((best, candidate) => Math.abs(candidate.t - lobe.center) < Math.abs(best.t - lobe.center) ? candidate : best, crossSections[0]);
      const boundary = section?.[side], centerPoint = section?.center;
      if (!boundary || !centerPoint) continue;
      // Sample just inside the true compound contour so antialiasing at the exact edge
      // cannot falsely classify a retained lobe as lost.
      lobeSamples.push({ x: centerPoint.x + (boundary.x - centerPoint.x) * .82, y: centerPoint.y + (boundary.y - centerPoint.y) * .82 });
    }
  }
  const structuralAxis = centralAxis.length > 20 ? centralAxis.slice(Math.floor(centralAxis.length * .05), Math.ceil(centralAxis.length * .95)) : centralAxis;
  const axisSurvival = structuralAxis.length ? structuralAxis.filter(point => sampleAlpha(paintedAlpha, width, height, point) >= alphaThreshold).length / structuralAxis.length : null;
  const lobeSurvival = lobeSamples.length ? lobeSamples.filter(point => sampleAlpha(paintedAlpha, width, height, point) >= alphaThreshold).length / lobeSamples.length : null;
  const features = region.center?.features || [];
  const featureSurvival = features.length ? features.filter(point => sampleAlpha(paintedAlpha, width, height, point) >= alphaThreshold).length / features.length : null;
  const occluderIds = region.center?.occludedBy || [];
  const occluderMasks = occluderIds.map(id => structure.regions.find(item => item.regionId === id)).filter(Boolean).map(item => rasterizeGeometryPath(item.path, width, height));
  const occluderUnion = occluderMasks.length ? maskUnion(occluderMasks) : new Uint8Array(width * height);
  const centerOcclusionArea = region.kind === 'flower-center-region' ? maskIntersectionCount(geometryMask, occluderUnion) : 0;
  const centerVisibleGeometryArea = region.kind === 'flower-center-region' ? Math.max(0, geometryArea - centerOcclusionArea) : geometryArea;
  let centerVisiblePaintedArea = 0;
  if (region.kind === 'flower-center-region') for (let index = 0; index < geometryMask.length; index += 1) if (geometryMask[index] && !occluderUnion[index] && paintedMask[index]) centerVisiblePaintedArea += 1;
  const alphaValues = [];
  for (let index = 0; index < paintedAlpha.length; index += 1) if (geometryMask[index]) alphaValues.push(paintedAlpha[index]);
  return {
    regionId: region.regionId, kind: region.kind, raster: { width, height }, geometryArea, rawMaskArea, featheredMaskArea, finalAlphaArea,
    geometryToMaskRetention: ratio(rawMaskArea, geometryArea), maskToFinalAlphaRetention: ratio(finalAlphaArea, rawMaskArea),
    visibleColorRetention: ratio(alphaValues.filter(value => value >= .12).length, geometryArea),
    bodyCoverage: ratio(finalAlphaArea, geometryArea), rootCoverage: selectorCoverage(geometryMask, paintedMask, rootSelector),
    meanPigmentDensity: alphaValues.length ? alphaValues.reduce((sum, value) => sum + value, 0) / alphaValues.length : 0,
    connectedComponentCount: effectiveComponentAreas(paintedMask, width, height).length,
    rawConnectedComponentCount: componentAreas(paintedMask, width, height).length,
    primaryComponentRatio: (() => { const areas = effectiveComponentAreas(paintedMask, width, height); return areas.length ? areas[0] / Math.max(1, areas.reduce((sum, value) => sum + value, 0)) : 0; })(),
    axisSurvival, lobeSurvival, featureSurvival,
    centerOcclusionRatio: region.kind === 'flower-center-region' ? ratio(centerOcclusionArea, geometryArea) : null,
    centerExpectedVisibleRatio: region.kind === 'flower-center-region' ? ratio(centerVisibleGeometryArea, geometryArea) : null,
    centerVisibleCoverage: region.kind === 'flower-center-region' ? ratio(centerVisiblePaintedArea, centerVisibleGeometryArea) : null,
    smallViewSilhouetteRetention: smallViewIou(geometryMask, paintedMask, width, height),
    paintedAlpha, paintedMask, geometryMask
  };
}

function crownRadialGap(mask, width, height, center = { x: .5, y: .27 }, minRadius = .074, maxRadius = .148) {
  let total = 0, occupied = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const nx = (x + .5) / width, ny = (y + .5) / height;
    const radius = Math.hypot(nx - center.x, (ny - center.y) * Math.SQRT2);
    if (radius < minRadius || radius > maxRadius) continue;
    total += 1; if (mask[y * width + x]) occupied += 1;
  }
  return total ? 1 - occupied / total : 1;
}

function measureHeroPaintedRetention({ page, structure, width = 128, height = 181, alphaThreshold = .08 }) {
  const objects = page.layers.flatMap(layer => layer.objects || []).filter(object => object.floraPaint);
  const regions = structure.regions.filter(region => region.kind !== 'background-region');
  const metrics = regions.map(region => measureRegionPaintedRetention({
    page, structure, region, strokes: objects.filter(object => object.floraPaint?.regionId === region.regionId), width, height, alphaThreshold
  }));
  const byId = new Map(metrics.map(item => [item.regionId, item]));
  const petals = structure.regions.filter(region => region.kind === 'petal-region'), inner = petals.filter(region => region.petal?.ring === 'inner'), outer = petals.filter(region => region.petal?.ring === 'outer');
  const petalPainted = maskUnion(petals.map(region => byId.get(region.regionId).paintedMask));
  const centerMetric = byId.get(structure.centerRegionId), centerPainted = centerMetric?.paintedMask || new Uint8Array(width * height);
  const crownPainted = maskUnion([petalPainted, centerPainted]), crownComponents = componentAreas(crownPainted, width, height);
  const leaves = structure.leafRegionIds.map(id => byId.get(id)), stem = byId.get(structure.stemRegionId);
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const centerFeatureSurvival = centerMetric?.featureSurvival ?? 0;
  const leafDensity = average(leaves.map(item => item.meanPigmentDensity));
  const stemToLeaf = stem ? stem.meanPigmentDensity / Math.max(.001, leafDensity) : Infinity;
  const coreMask = new Uint8Array(width * height);
  const center = structure.crownEnvelope?.path?.[0] || { cx: .5, cy: .27 };
  let coreTotal = 0, coreOn = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const nx = (x + .5) / width, ny = (y + .5) / height;
    if (Math.hypot(nx - center.cx, (ny - center.cy) * Math.SQRT2) <= .145) { const index = y * width + x; coreMask[index] = 1; coreTotal += 1; if (crownPainted[index]) coreOn += 1; }
  }
  const ringSurvival = ring => average(ring.map(region => byId.get(region.regionId).bodyCoverage));
  return {
    raster: { width, height }, regions: metrics.map(({ paintedAlpha, paintedMask, geometryMask, ...item }) => item),
    crown: {
      paintedConnectedComponentCount: crownComponents.length,
      primaryComponentRatio: crownComponents.length ? crownComponents[0] / Math.max(1, crownComponents.reduce((sum, value) => sum + value, 0)) : 0,
      bodyCoverage: average(petals.map(region => byId.get(region.regionId).bodyCoverage)),
      rootCoverage: average(petals.map(region => byId.get(region.regionId).rootCoverage)),
      innerRingSurvival: ringSurvival(inner), outerRingSurvival: ringSurvival(outer),
      coreCoverage: ratio(coreOn, coreTotal), radialGapRatio: crownRadialGap(petalPainted, width, height, { x: center.cx, y: center.cy })
    },
    center: { ...centerMetric, paintedAlpha: undefined, paintedMask: undefined, geometryMask: undefined, featureSurvival: centerFeatureSurvival },
    leaves: {
      count: leaves.length, averageBodyCoverage: average(leaves.map(item => item.bodyCoverage)),
      averageLobeSurvival: average(leaves.map(item => item.lobeSurvival || 0)),
      averageSmallViewSilhouetteRetention: average(leaves.map(item => item.smallViewSilhouetteRetention)),
      paintedConnectedComponents: leaves.reduce((sum, item) => sum + item.connectedComponentCount, 0)
    },
    stem: { ...stem, paintedAlpha: undefined, paintedMask: undefined, geometryMask: undefined, stemToLeafVisualWeightRatio: stemToLeaf }
  };
}

function evaluatePaintedRetentionGates(measurement, thresholds = PAINTED_RETENTION_THRESHOLDS) {
  const relevant = measurement.regions.filter(item => ['petal-region', 'leaf-region', 'flower-center-region', 'stem-region'].includes(item.kind));
  const checks = {
    geometryToMaskArea: relevant.every(item => item.geometryToMaskRetention >= thresholds.geometryToMaskArea),
    maskToFinalAlphaArea: relevant.every(item => item.maskToFinalAlphaRetention >= (item.kind === 'stem-region' ? .72 : thresholds.maskToFinalAlphaArea)),
    finalVisibleColorArea: relevant.every(item => item.visibleColorRetention >= (item.kind === 'stem-region' ? .68 : thresholds.finalVisibleColorArea)),
    petalBodyCoverage: measurement.crown.bodyCoverage >= thresholds.petalBodyCoverage,
    petalRootCoverage: measurement.crown.rootCoverage >= thresholds.petalRootCoverage,
    crownCoreCoverage: measurement.crown.coreCoverage >= thresholds.crownCoreCoverage,
    innerRingSurvival: measurement.crown.innerRingSurvival >= thresholds.ringSurvival,
    outerRingSurvival: measurement.crown.outerRingSurvival >= thresholds.ringSurvival,
    paintedCrownOneMass: measurement.crown.paintedConnectedComponentCount === 1 && measurement.crown.primaryComponentRatio >= .985,
    paintedRadialGap: measurement.crown.radialGapRatio <= thresholds.maximumPaintedRadialGapRatio,
    centerVisible: measurement.center.bodyCoverage >= thresholds.centerVisibleRatio,
    centerFeatureSurvival: measurement.center.featureSurvival >= thresholds.centerFeatureSurvival,
    leafBodyWidthRetention: measurement.leaves.averageBodyCoverage >= thresholds.leafBodyWidthRetention,
    leafLobeSurvival: measurement.leaves.averageLobeSurvival >= thresholds.leafLobeSurvival,
    leafSmallViewSilhouette: measurement.leaves.averageSmallViewSilhouetteRetention >= thresholds.leafSmallViewSilhouette,
    fourPaintedLeafComponents: measurement.leaves.count === 4 && measurement.regions.filter(item => item.kind === 'leaf-region').every(item => item.connectedComponentCount === 1),
    stemVisualWeight: measurement.stem.stemToLeafVisualWeightRatio <= thresholds.stemToLeafVisualWeightMaximum
  };
  return { checks, passed: Object.values(checks).filter(Boolean).length, total: Object.keys(checks).length, ok: Object.values(checks).every(Boolean) };
}

return { PAINTED_RETENTION_THRESHOLDS, rasterizePaintedStrokeCoverage, diagnoseRegionPaintedStages, measureRegionPaintedRetention, measureHeroPaintedRetention, evaluatePaintedRetentionGates };
})();

export const PAINTED_RETENTION_THRESHOLDS = PaintedGeometryRetentionModule.PAINTED_RETENTION_THRESHOLDS;
export const rasterizePaintedStrokeCoverage = PaintedGeometryRetentionModule.rasterizePaintedStrokeCoverage;
export const diagnoseRegionPaintedStages = PaintedGeometryRetentionModule.diagnoseRegionPaintedStages;
export const measureRegionPaintedRetention = PaintedGeometryRetentionModule.measureRegionPaintedRetention;
export const measureHeroPaintedRetention = PaintedGeometryRetentionModule.measureHeroPaintedRetention;
export const evaluatePaintedRetentionGates = PaintedGeometryRetentionModule.evaluatePaintedRetentionGates;
