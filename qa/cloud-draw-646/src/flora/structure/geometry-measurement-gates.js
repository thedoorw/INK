const GEOMETRY_GATE_ASPECT = Math.SQRT2;
const geometryGateClamp = (value, min, max) => Math.max(min, Math.min(max, value));
const geometryGateFinitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);

function geometryGatePolygonScanlineMask(path, width, height) {
  if (!Array.isArray(path) || path.length < 3 || !path.every(geometryGateFinitePoint)) throw new Error('invalid polygon path');
  const mask = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    const y = (row + .5) / height;
    const intersections = [];
    for (let index = 0, previous = path.length - 1; index < path.length; previous = index, index += 1) {
      const a = path[previous], b = path[index];
      if ((a.y > y) === (b.y > y)) continue;
      const x = a.x + (y - a.y) * (b.x - a.x) / ((b.y - a.y) || Number.EPSILON);
      intersections.push(x);
    }
    intersections.sort((a, b) => a - b);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const start = geometryGateClamp(Math.ceil(intersections[index] * width - .5), 0, width - 1);
      const end = geometryGateClamp(Math.floor(intersections[index + 1] * width - .5), 0, width - 1);
      for (let column = start; column <= end; column += 1) mask[row * width + column] = 1;
    }
  }
  return mask;
}

function geometryGateEllipseMask(shape, width, height) {
  const mask = new Uint8Array(width * height);
  const rx = Math.max(Number.EPSILON, shape.rx), ry = Math.max(Number.EPSILON, shape.ry);
  for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
    const x = (column + .5) / width, y = (row + .5) / height;
    const dx = (x - shape.cx) / rx, dy = (y - shape.cy) / ry;
    if (dx * dx + dy * dy <= 1) mask[row * width + column] = 1;
  }
  return mask;
}

export function rasterizeGeometryPath(path, width = 256, height = 362) {
  if (!Array.isArray(path) || !path.length) throw new Error('invalid geometry path');
  const first = path[0];
  return Number.isFinite(first?.cx) ? geometryGateEllipseMask(first, width, height) : geometryGatePolygonScanlineMask(path, width, height);
}

const geometryGateCountOn = mask => mask.reduce((sum, value) => sum + (value ? 1 : 0), 0);
const geometryGateMaskUnion = masks => {
  if (!masks.length) return new Uint8Array(0);
  const output = new Uint8Array(masks[0].length);
  for (const mask of masks) for (let index = 0; index < output.length; index += 1) if (mask[index]) output[index] = 1;
  return output;
};
const geometryGateMaskIntersectionCount = (a, b, selector = null) => {
  let count = 0;
  for (let index = 0; index < a.length; index += 1) if (a[index] && b[index] && (!selector || selector[index])) count += 1;
  return count;
};

function geometryGateComponentAreas(mask, width, height) {
  const seen = new Uint8Array(mask.length), areas = [];
  const stack = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1; stack.push(start); let area = 0;
    while (stack.length) {
      const index = stack.pop(); area += 1;
      const x = index % width, y = Math.floor(index / width);
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (!offsetX && !offsetY) continue;
        const nx = x + offsetX, ny = y + offsetY;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const candidate = ny * width + nx;
        if (seen[candidate] || !mask[candidate]) continue;
        seen[candidate] = 1; stack.push(candidate);
      }
    }
    areas.push(area);
  }
  areas.sort((a, b) => b - a);
  return areas;
}

function geometryGateRadialSelector(width, height, center, minRadius, maxRadius) {
  const selector = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
    const x = (column + .5) / width, y = (row + .5) / height;
    const radius = Math.hypot(x - center.x, (y - center.y) * GEOMETRY_GATE_ASPECT);
    if (radius >= minRadius && radius <= maxRadius) selector[row * width + column] = 1;
  }
  return selector;
}

function geometryGateSelectorOccupancy(mask, selector) {
  let total = 0, occupied = 0;
  for (let index = 0; index < mask.length; index += 1) if (selector[index]) { total += 1; if (mask[index]) occupied += 1; }
  return total ? occupied / total : 0;
}

function geometryGateAngularOccupancy(mask, width, height, center, minRadius, maxRadius, bins = 48) {
  const occupied = Array(bins).fill(0), total = Array(bins).fill(0);
  for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
    const x = (column + .5) / width, y = (row + .5) / height;
    const dx = x - center.x, dy = (y - center.y) * GEOMETRY_GATE_ASPECT, radius = Math.hypot(dx, dy);
    if (radius < minRadius || radius > maxRadius) continue;
    const angle = Math.atan2(dy, dx), bin = geometryGateClamp(Math.floor((angle + Math.PI) / (Math.PI * 2) * bins), 0, bins - 1);
    total[bin] += 1; if (mask[row * width + column]) occupied[bin] += 1;
  }
  return occupied.map((value, index) => total[index] ? value / total[index] : 0);
}

function geometryGateOuterRadiusByAngle(mask, width, height, center, bins = 72) {
  const radii = Array(bins).fill(0);
  for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
    if (!mask[row * width + column]) continue;
    const x = (column + .5) / width, y = (row + .5) / height;
    const dx = x - center.x, dy = (y - center.y) * GEOMETRY_GATE_ASPECT, radius = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx), bin = geometryGateClamp(Math.floor((angle + Math.PI) / (Math.PI * 2) * bins), 0, bins - 1);
    radii[bin] = Math.max(radii[bin], radius);
  }
  return radii;
}

function geometryGateCoefficientOfVariation(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return 0;
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const variance = finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / finite.length;
  return mean ? Math.sqrt(variance) / Math.abs(mean) : 0;
}

function geometryGateAngleDistance(a, b) {
  let delta = Math.abs(a - b) % (Math.PI * 2);
  if (delta > Math.PI) delta = Math.PI * 2 - delta;
  return delta;
}

function geometryGateRingAdjacentPairs(regions) {
  const sorted = [...regions].sort((a, b) => a.petal.ringIndex - b.petal.ringIndex);
  return sorted.map((region, index) => [region, sorted[(index + 1) % sorted.length]]);
}

export function measureCrownGeometryGates(structure, { width = 320, height = 452 } = {}) {
  const petals = structure?.regions?.filter(region => region.kind === 'petal-region') || [];
  const centerRegion = structure?.regions?.find(region => region.kind === 'flower-center-region');
  if (!petals.length || !centerRegion) throw new Error('crown structure missing petals or center');
  const envelope = structure.crownEnvelope?.path?.[0];
  const center = { x: envelope?.cx ?? .5, y: envelope?.cy ?? .27 };
  const masks = new Map([...petals, centerRegion].map(region => [region.regionId, rasterizeGeometryPath(region.path, width, height)]));
  const outer = petals.filter(region => region.petal?.ring === 'outer');
  const inner = petals.filter(region => region.petal?.ring === 'inner');
  const petalUnion = geometryGateMaskUnion(petals.map(region => masks.get(region.regionId)));
  const outerUnion = geometryGateMaskUnion(outer.map(region => masks.get(region.regionId)));
  const innerUnion = geometryGateMaskUnion(inner.map(region => masks.get(region.regionId)));
  const centerMask = masks.get(centerRegion.regionId);
  const crownUnion = geometryGateMaskUnion([petalUnion, centerMask]);
  const rootZone = geometryGateRadialSelector(width, height, center, 0, .155);
  const coreZone = geometryGateRadialSelector(width, height, center, 0, .145);
  const coreAnnulus = geometryGateRadialSelector(width, height, center, .074, .148);
  const adjacentMetrics = ring => geometryGateRingAdjacentPairs(ring).map(([a, b]) => {
    const am = masks.get(a.regionId), bm = masks.get(b.regionId);
    let aRoot = 0, bRoot = 0;
    for (let index = 0; index < rootZone.length; index += 1) if (rootZone[index]) { if (am[index]) aRoot += 1; if (bm[index]) bRoot += 1; }
    const intersection = geometryGateMaskIntersectionCount(am, bm, rootZone);
    return { a: a.regionId, b: b.regionId, intersectionPixels: intersection, ratio: intersection / Math.max(1, Math.min(aRoot, bRoot)) };
  });
  const outerAdjacent = adjacentMetrics(outer), innerAdjacent = adjacentMetrics(inner);
  const innerOuterIntersection = geometryGateMaskIntersectionCount(innerUnion, outerUnion);
  const innerOuterIntersectionRatio = innerOuterIntersection / Math.max(1, Math.min(geometryGateCountOn(innerUnion), geometryGateCountOn(outerUnion)));
  const actualCenterOccluders = inner.filter(region => region.z > centerRegion.z && geometryGateMaskIntersectionCount(masks.get(region.regionId), centerMask) > 0);
  const occluderUnion = geometryGateMaskUnion(actualCenterOccluders.map(region => masks.get(region.regionId)));
  const centerArea = geometryGateCountOn(centerMask), centerOccluded = geometryGateMaskIntersectionCount(centerMask, occluderUnion);
  const angular = geometryGateAngularOccupancy(petalUnion, width, height, center, .074, .148, 48);
  const emptyWedgeIndices = angular.map((value, index) => value < .52 ? index : -1).filter(index => index >= 0);
  const radialGapRatio = 1 - geometryGateSelectorOccupancy(petalUnion, coreAnnulus);
  const petalAreas = geometryGateComponentAreas(petalUnion, width, height), crownAreas = geometryGateComponentAreas(crownUnion, width, height);
  const silhouetteRadii = geometryGateOuterRadiusByAngle(crownUnion, width, height, center, 72).filter(value => value > 0);
  const silhouetteMean = silhouetteRadii.reduce((sum, value) => sum + value, 0) / Math.max(1, silhouetteRadii.length);
  const nearCircleDeviation = geometryGateCoefficientOfVariation(silhouetteRadii);
  const spoon = petals.map(region => {
    const sections = region.crossSections || [];
    const widest = sections.reduce((best, section) => !best || section.width > best.width ? section : best, null);
    const metrics = region.petal?.spoonMetrics || {};
    return { regionId: region.regionId, widestPointT: widest?.t ?? null, roundedTipCurvature: metrics.roundedTipCurvature ?? 0, spearTip: (metrics.tipRoundness ?? 0) < .52 || (metrics.roundedTipCurvature ?? 0) < .55 };
  });
  const outerAngles = outer.map(region => region.angle).sort((a, b) => a - b), innerAngles = inner.map(region => region.angle).sort((a, b) => a - b);
  const staggerDistances = innerAngles.map(angle => Math.min(...outerAngles.map(other => geometryGateAngleDistance(angle, other))));
  const rootRatios = [...outerAdjacent, ...innerAdjacent].map(item => item.ratio);
  const repeatedEmptyWedgePattern = emptyWedgeIndices.length >= 4;
  const genericRadialFlowerWarning = structure.ringStructure?.mode !== 'MultiPetalCup' || radialGapRatio > .15 || petalAreas.length > 1 || repeatedEmptyWedgePattern;
  return {
    raster: { width, height },
    petalUnionComponentCount: petalAreas.length,
    crownUnionComponentCount: crownAreas.length,
    primaryPetalMassRatio: petalAreas.length ? petalAreas[0] / Math.max(1, petalAreas.reduce((sum, value) => sum + value, 0)) : 0,
    crownCoreOccupancy: geometryGateSelectorOccupancy(crownUnion, coreZone),
    petalCoreOccupancy: geometryGateSelectorOccupancy(petalUnion, coreZone),
    radialGapRatio,
    rootZoneEmptyWedges: emptyWedgeIndices.length,
    emptyWedgeIndices,
    geometryGateAngularOccupancy: angular,
    repeatedEmptyWedgePattern,
    outerAdjacentRootOverlaps: outerAdjacent,
    innerAdjacentRootOverlaps: innerAdjacent,
    minimumAdjacentRootOverlapRatio: rootRatios.length ? Math.min(...rootRatios) : 0,
    meanAdjacentRootOverlapRatio: rootRatios.length ? rootRatios.reduce((sum, value) => sum + value, 0) / rootRatios.length : 0,
    innerOuterIntersectionPixels: innerOuterIntersection,
    innerOuterIntersectionRatio,
    centerAreaPixels: centerArea,
    centerOccludedPixels: centerOccluded,
    centerOcclusionRatio: centerOccluded / Math.max(1, centerArea),
    centerVisibleRatio: 1 - centerOccluded / Math.max(1, centerArea),
    actualCenterOccluderIds: actualCenterOccluders.map(region => region.regionId),
    nearCircleEnvelopeDeviation: nearCircleDeviation,
    silhouetteRadiusMean: silhouetteMean,
    staggerMinimum: staggerDistances.length ? Math.min(...staggerDistances) : 0,
    staggerMean: staggerDistances.length ? staggerDistances.reduce((sum, value) => sum + value, 0) / staggerDistances.length : 0,
    innerMeanLength: inner.length ? inner.reduce((sum, region) => sum + region.petal.length, 0) / inner.length : 0,
    outerMeanLength: outer.length ? outer.reduce((sum, region) => sum + region.petal.length, 0) / outer.length : 0,
    innerMeanElevation: inner.length ? inner.reduce((sum, region) => sum + region.petal.elevation, 0) / inner.length : 0,
    outerMeanElevation: outer.length ? outer.reduce((sum, region) => sum + region.petal.elevation, 0) / outer.length : 0,
    bowlDepthMin: structure.bowlDepthField?.min ?? 0,
    bowlDepthMax: structure.bowlDepthField?.max ?? 0,
    spoon,
    genericRadialFlowerWarning
  };
}

function geometryGateSmoothSeries(values, radius = 1) {
  return values.map((_, index) => {
    let sum = 0, count = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const candidate = index + offset;
      if (candidate >= 0 && candidate < values.length) { sum += values[candidate]; count += 1; }
    }
    return sum / Math.max(1, count);
  });
}

function geometryGateSideLobeMetrics(crossSections, key, smallWidth) {
  const raw = crossSections.map(section => Number(section[key]) || 0);
  const values = geometryGateSmoothSeries(raw, 1), maxValue = Math.max(...values, Number.EPSILON);
  const candidates = [];
  for (let index = 2; index < values.length - 2; index += 1) {
    const t = crossSections[index].t;
    if (t < .075 || t > .915) continue;
    if (values[index] >= values[index - 1] && values[index] > values[index + 1]) candidates.push(index);
  }
  const peaks = [];
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const index = candidates[candidateIndex];
    const leftBound = candidateIndex ? Math.floor((candidates[candidateIndex - 1] + index) / 2) : Math.max(0, index - 6);
    const rightBound = candidateIndex + 1 < candidates.length ? Math.ceil((index + candidates[candidateIndex + 1]) / 2) : Math.min(values.length - 1, index + 6);
    const leftValley = Math.min(...values.slice(leftBound, index + 1));
    const rightValley = Math.min(...values.slice(index, rightBound + 1));
    const controllingValley = Math.max(leftValley, rightValley);
    const prominence = (values[index] - controllingValley) / maxValue;
    const valleyDepth = 1 - controllingValley / Math.max(Number.EPSILON, values[index]);
    if (prominence >= .105 && valleyDepth >= .15) peaks.push({ index, t: crossSections[index].t, width: values[index], prominence, valleyDepth, smallViewPixels: (values[index] - controllingValley) * smallWidth });
  }
  return {
    count: peaks.length,
    peaks,
    prominenceMedian: peaks.length ? [...peaks].sort((a, b) => a.prominence - b.prominence)[Math.floor(peaks.length / 2)].prominence : 0,
    valleyDepthMedian: peaks.length ? [...peaks].sort((a, b) => a.valleyDepth - b.valleyDepth)[Math.floor(peaks.length / 2)].valleyDepth : 0,
    smallViewReadableCount: peaks.filter(peak => peak.smallViewPixels >= 1.05).length,
    maxWidth: maxValue
  };
}

export function measureLeafGeometryGates(region, { smallWidth = 160 } = {}) {
  const crossSections = region?.leaf?.crossSections || region?.crossSections || [];
  const axis = region?.leaf?.centralAxis || region?.centralAxis || [];
  if (crossSections.length < 12) throw new Error('leaf cross sections missing');
  const left = geometryGateSideLobeMetrics(crossSections, 'leftHalf', smallWidth), right = geometryGateSideLobeMetrics(crossSections, 'rightHalf', smallWidth);
  const peakWidths = [...left.peaks, ...right.peaks].sort((a, b) => a.t - b.t);
  const early = peakWidths.filter(item => item.t >= .10 && item.t <= .40).map(item => item.width);
  const late = peakWidths.filter(item => item.t >= .62 && item.t <= .88).map(item => item.width);
  const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const taperRatio = mean(late) / Math.max(Number.EPSILON, mean(early));
  const widths = crossSections.map(section => section.width);
  const maxAxisStep = axis.slice(1).reduce((maximum, point, index) => Math.max(maximum, Math.hypot(point.x - axis[index].x, point.y - axis[index].y)), 0);
  const pairOffsets = left.peaks.map(peak => Math.min(...right.peaks.map(other => Math.abs(peak.t - other.t))));
  const alternationOffset = pairOffsets.length ? pairOffsets.reduce((sum, value) => sum + value, 0) / pairOffsets.length : 0;
  const smallViewReadable = left.smallViewReadableCount >= 5 && right.smallViewReadableCount >= 5;
  const genericRibbonSimilarity = left.count < 6 || right.count < 6 || left.prominenceMedian < .12 || right.prominenceMedian < .12 || left.valleyDepthMedian < .18 || right.valleyDepthMedian < .18 || geometryGateCoefficientOfVariation(widths) < .26 || !smallViewReadable;
  const tip = region.growthAxis?.tip;
  return {
    regionId: region.regionId,
    effectiveLobeCountLeft: left.count,
    effectiveLobeCountRight: right.count,
    leftProminence: left.prominenceMedian,
    rightProminence: right.prominenceMedian,
    leftValleyDepth: left.valleyDepthMedian,
    rightValleyDepth: right.valleyDepthMedian,
    alternationOffset,
    lobeTaperRatio: taperRatio,
    centralAxisPointCount: axis.length,
    centralAxisMaximumStep: maxAxisStep,
    centralAxisContinuous: axis.length >= 48 && maxAxisStep <= .025,
    silhouetteWidthVariation: geometryGateCoefficientOfVariation(widths),
    genericRibbonSimilarity,
    smallViewReadable,
    smallViewReadableLeft: left.smallViewReadableCount,
    smallViewReadableRight: right.smallViewReadableCount,
    pointedTipComplete: Boolean(tip && tip.x > 0 && tip.x < 1 && tip.y > 0 && tip.y < 1),
    leftPeaks: left.peaks,
    rightPeaks: right.peaks
  };
}

export function measureFourLeafSeparation(structure, { width = 240, height = 340 } = {}) {
  const leaves = structure?.regions?.filter(region => region.kind === 'leaf-region') || [];
  const masks = leaves.map(region => rasterizeGeometryPath(region.path, width, height));
  const individualComponentAreas = masks.map(mask => geometryGateComponentAreas(mask, width, height));
  const individualComponents = individualComponentAreas.map(areas => {
    const total = areas.reduce((sum, value) => sum + value, 0), minimum = Math.max(3, total * .005);
    return areas.filter(area => area >= minimum).length;
  });
  const pairIntersections = [];
  for (let left = 0; left < leaves.length; left += 1) for (let right = left + 1; right < leaves.length; right += 1) {
    const pixels = geometryGateMaskIntersectionCount(masks[left], masks[right]);
    pairIntersections.push({ a: leaves[left].regionId, b: leaves[right].regionId, pixels });
  }
  return {
    leafCount: leaves.length,
    uniqueRegionCount: new Set(leaves.map(region => region.regionId)).size,
    individualComponentCounts: individualComponents,
    individualComponentAreas,
    allIndividualContoursConnected: individualComponents.every(count => count === 1),
    pairIntersections,
    separated: leaves.length === 4 && individualComponents.every(count => count === 1) && pairIntersections.every(item => item.pixels === 0)
  };
}

export const GEOMETRY_GATE_THRESHOLDS = Object.freeze({
  crown: Object.freeze({
    minimumAdjacentRootOverlapRatio: .012,
    maximumRadialGapRatio: .10,
    minimumCrownCoreOccupancy: .91,
    minimumPetalCoreOccupancy: .76,
    maximumRootZoneEmptyWedges: 2,
    minimumInnerOuterIntersectionRatio: .18,
    minimumCenterOcclusionRatio: .12,
    maximumCenterOcclusionRatio: .55,
    maximumNearCircleEnvelopeDeviation: .20
  }),
  leaf: Object.freeze({
    minimumEffectiveLobesPerSide: 6,
    maximumEffectiveLobesPerSide: 10,
    minimumProminence: .12,
    minimumValleyDepth: .18,
    maximumTipTaperRatio: .82,
    minimumAlternationOffset: .018,
    maximumAxisStep: .025,
    minimumSilhouetteWidthVariation: .26,
    minimumSmallViewReadableLobesPerSide: 5
  })
});
