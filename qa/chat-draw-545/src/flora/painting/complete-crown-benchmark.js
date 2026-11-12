import { createVectorMask } from '../mask/vector-mask.js';
import { rasterizeGeometryPath, measureCrownGeometryGates, GEOMETRY_GATE_THRESHOLDS } from '../structure/geometry-measurement-gates.js';

const CROWN_A4_RATIO = Math.SQRT2;
const crownClamp = (value, min, max) => Math.max(min, Math.min(max, value));
const crownToVisual = point => ({ x: point.x, y: point.y * CROWN_A4_RATIO });
const crownFromVisual = point => ({ x: point.x, y: point.y / CROWN_A4_RATIO });
const crownPrng = seed => {
  let state = seed >>> 0;
  return () => {
    state |= 0; state = state + 0x6D2B79F5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
};

function crownRadialPetal({
  center, angle, length, baseRadius, width, bend = 0, asymmetry = 0,
  shoulderBias = 0, tipRoundness = .42, edgeRhythm = 0, tipSkew = 0,
  rootFullness = .22, samples = 44
}) {
  const c = crownToVisual(center), direction = { x: Math.cos(angle), y: Math.sin(angle) }, normal = { x: -direction.y, y: direction.x };
  const baseV = { x: c.x + direction.x * baseRadius, y: c.y + direction.y * baseRadius };
  const actualTip = { x: c.x + direction.x * length + normal.x * tipSkew, y: c.y + direction.y * length + normal.y * tipSkew };
  const capRadius = width * (.055 + tipRoundness * .105);
  const capHalf = width * (.065 + tipRoundness * .085);
  const capCenter = { x: actualTip.x - direction.x * capRadius, y: actualTip.y - direction.y * capRadius };
  const left = [], right = [], axisPoints = [], widths = [];
  const exponent = crownClamp(.76 - tipRoundness * .26, .44, .74);
  const tEnd = .94;
  for (let index = 0; index <= samples; index += 1) {
    const normalized = index / samples, t = normalized * tEnd;
    const shoulder = shoulderBias * Math.sin(Math.PI * t) * Math.sin(Math.PI * t * .72);
    const bendAmount = bend * Math.sin(Math.PI * t) * (.22 + t * .78) + shoulder;
    const centerV = {
      x: baseV.x + (capCenter.x - baseV.x) * (t / tEnd) + normal.x * bendAmount,
      y: baseV.y + (capCenter.y - baseV.y) * (t / tEnd) + normal.y * bendAmount
    };
    const normalizedT = t / tEnd;
    const body = Math.sin(Math.PI * crownClamp(normalizedT, 0, 1)) ** exponent;
    const rootBulb = rootFullness * (1 - normalizedT) ** 2.2;
    const shoulderFullness = 1 + .18 * Math.sin(Math.PI * crownClamp(normalizedT / .76, 0, 1));
    const contourPulse = 1 + edgeRhythm * Math.sin(Math.PI * normalizedT * 3.35 + .6) * Math.sin(Math.PI * normalizedT);
    const wobble = 1 + asymmetry * Math.sin(Math.PI * normalizedT * 2.15 + .7);
    const half = width * .5 * Math.max(rootBulb, body) * shoulderFullness * contourPulse;
    axisPoints.push(centerV); widths.push(half);
    left.push(crownFromVisual({ x: centerV.x - normal.x * half * wobble, y: centerV.y - normal.y * half * wobble }));
    right.push(crownFromVisual({ x: centerV.x + normal.x * half / Math.max(.62, wobble), y: centerV.y + normal.y * half / Math.max(.62, wobble) }));
  }
  const cap = [];
  for (let index = 0; index <= 8; index += 1) {
    const theta = Math.PI / 2 - Math.PI * (index / 8);
    cap.push(crownFromVisual({
      x: capCenter.x + direction.x * capRadius * Math.cos(theta) - normal.x * capHalf * Math.sin(theta),
      y: capCenter.y + direction.y * capRadius * Math.cos(theta) - normal.y * capHalf * Math.sin(theta)
    }));
  }
  const samplePoint = t => {
    const index = crownClamp(Math.round(t * samples), 0, samples), cv = axisPoints[index], half = widths[index];
    return {
      center: crownFromVisual(cv),
      left: crownFromVisual({ x: cv.x - normal.x * half, y: cv.y - normal.y * half }),
      right: crownFromVisual({ x: cv.x + normal.x * half, y: cv.y + normal.y * half })
    };
  };
  return {
    path: left.concat(cap.slice(1, -1), right.reverse()),
    growthAxis: { base: crownFromVisual(baseV), tip: crownFromVisual(actualTip) },
    foldAxis: { base: samplePoint(.07).center, tip: samplePoint(.90).center },
    centerSeam: [samplePoint(.03).left, samplePoint(.16).left, samplePoint(.16).right, samplePoint(.03).right],
    sideSeams: {
      left: [samplePoint(.13).left, samplePoint(.44).left, samplePoint(.74).left],
      right: [samplePoint(.13).right, samplePoint(.44).right, samplePoint(.74).right]
    }
  };
}

function crownCenterPath(center, radius = .070, samples = 46, seed = 1) {
  const random = crownPrng(seed), c = crownToVisual(center), points = [];
  const phases = [random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2];
  const offset = { x: (random() - .5) * .012, y: (random() - .5) * .010 };
  for (let index = 0; index < samples; index += 1) {
    const angle = index / samples * Math.PI * 2;
    const occludedSide = Math.max(0, Math.sin(angle + phases[2])) * .035;
    const wobble = 1 + .075 * Math.sin(angle * 3 + phases[0]) + .038 * Math.sin(angle * 7 + phases[1]) - occludedSide;
    points.push(crownFromVisual({
      x: c.x + offset.x + Math.cos(angle) * radius * wobble,
      y: c.y + offset.y + Math.sin(angle) * radius * (.88 + .12 * wobble)
    }));
  }
  return points;
}

function crownAngleDistance(a, b) {
  let delta = Math.abs(a - b) % (Math.PI * 2);
  if (delta > Math.PI) delta = Math.PI * 2 - delta;
  return delta;
}


function crownSmoothstep(value) {
  const t = crownClamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function crownSpoonPetal({
  center, angle, length, baseRadius, width, bend = 0, asymmetry = 0,
  tipRoundness = .78, tipSkew = 0, widestPoint = .68, rootWidthRatio = .13,
  elevation = .5, bowlBias = .7, samples = 52
}) {
  const c = crownToVisual(center);
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const normal = { x: -direction.y, y: direction.x };
  const foreshortening = crownClamp(1 - elevation * .15 - bowlBias * .035, .78, .98);
  const visibleLength = length * foreshortening;
  const baseV = { x: c.x + direction.x * baseRadius, y: c.y + direction.y * baseRadius };
  const tipV = {
    x: c.x + direction.x * visibleLength + normal.x * tipSkew,
    y: c.y + direction.y * visibleLength + normal.y * tipSkew - elevation * .006
  };
  const capRadius = width * (.11 + tipRoundness * .10);
  const capHalf = width * (.19 + tipRoundness * .08);
  const capCenter = { x: tipV.x - direction.x * capRadius, y: tipV.y - direction.y * capRadius };
  const left = [], right = [], crossSections = [];
  const tEnd = .93;
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples * tEnd;
    const normalized = t / tEnd;
    const rootPerspective = crownClamp(.78 + elevation * .10 - bowlBias * .025, .76, .88);
    const axial = normalized <= .28
      ? normalized * rootPerspective
      : .28 * rootPerspective + (normalized - .28) * (1 - .28 * rootPerspective) / .72;
    const widening = normalized <= widestPoint
      ? rootWidthRatio + (1 - rootWidthRatio) * crownSmoothstep(normalized / widestPoint)
      : 1 - .22 * crownSmoothstep((normalized - widestPoint) / Math.max(.001, 1 - widestPoint));
    const rootCompression = 1 - bowlBias * .18 * (1 - normalized) ** 2;
    const sideVariation = 1 + asymmetry * Math.sin(Math.PI * normalized) * Math.sin(Math.PI * normalized * 1.65 + .6);
    const bendAmount = bend * Math.sin(Math.PI * normalized) * (.18 + .82 * normalized);
    const centerV = {
      x: baseV.x + (capCenter.x - baseV.x) * axial + normal.x * bendAmount,
      y: baseV.y + (capCenter.y - baseV.y) * axial + normal.y * bendAmount - elevation * .004 * Math.sin(Math.PI * normalized)
    };
    const half = width * .5 * widening * rootCompression;
    const leftHalf = half * crownClamp(sideVariation, .72, 1.25);
    const rightHalf = half / crownClamp(sideVariation, .78, 1.22);
    const lp = crownFromVisual({ x: centerV.x - normal.x * leftHalf, y: centerV.y - normal.y * leftHalf });
    const rp = crownFromVisual({ x: centerV.x + normal.x * rightHalf, y: centerV.y + normal.y * rightHalf });
    const cp = crownFromVisual(centerV);
    left.push(lp); right.push(rp);
    crossSections.push({ t: normalized, center: cp, left: lp, right: rp, width: leftHalf + rightHalf });
  }
  const cap = [];
  for (let index = 0; index <= 12; index += 1) {
    const theta = Math.PI / 2 - Math.PI * index / 12;
    cap.push(crownFromVisual({
      x: capCenter.x + direction.x * capRadius * Math.cos(theta) - normal.x * capHalf * Math.sin(theta),
      y: capCenter.y + direction.y * capRadius * Math.cos(theta) - normal.y * capHalf * Math.sin(theta)
    }));
  }
  const section = t => crossSections[crownClamp(Math.round(t * (crossSections.length - 1)), 0, crossSections.length - 1)];
  const widest = crossSections.reduce((best, item) => item.width > best.width ? item : best, crossSections[0]);
  return {
    path: left.concat(cap.slice(1, -1), right.reverse()),
    growthAxis: { base: crownFromVisual(baseV), tip: crownFromVisual(tipV), crownTip: crownFromVisual(tipV) },
    foldAxis: { base: section(.08).center, tip: section(.88).center },
    centerSeam: [section(.02).left, section(.18).left, section(.18).right, section(.02).right],
    sideSeams: { left: [section(.14).left, section(.44).left, section(.72).left], right: [section(.14).right, section(.44).right, section(.72).right] },
    crossSections,
    spoonMetrics: {
      widestPointT: widest.t, rootWidthRatio, tipRoundness,
      roundedTipCurvature: capRadius / Math.max(.0001, capHalf),
      spearScore: crownClamp(1 - tipRoundness, 0, 1),
      foreshortening, elevation, bowlBias
    }
  };
}

function crownDenseCenterFeatures(center, radius, count, seed) {
  const random = crownPrng(seed), features = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < count; index += 1) {
    const cluster = index % 5;
    const radialBase = Math.sqrt((index + .45 + random() * .35) / count);
    const radial = radius * crownClamp(radialBase * (.72 + .22 * Math.sin(index * 1.73 + cluster)), .08, .96);
    const angle = index * golden + cluster * .17 + (random() - .5) * .34;
    features.push({
      featureId: `feature-${String(index + 1).padStart(2, '0')}`,
      x: center.x + Math.cos(angle) * radial,
      y: center.y + Math.sin(angle) * radial / CROWN_A4_RATIO * .82,
      radius: radius * (.025 + random() * .055),
      weight: .45 + random() * .55,
      angle
    });
  }
  const nearest = features.map((feature, index) => Math.min(...features.filter((_, other) => other !== index).map(other => Math.hypot(feature.x - other.x, (feature.y - other.y) * CROWN_A4_RATIO))));
  const mean = nearest.reduce((a, b) => a + b, 0) / nearest.length;
  const variance = nearest.reduce((sum, value) => sum + (value - mean) ** 2, 0) / nearest.length;
  return { features, spacingMean: mean, spacingCv: Math.sqrt(variance) / Math.max(.0001, mean) };
}

function crownContourMetrics(path, center) {
  const radii = path.map(point => Math.hypot(point.x - center.x, (point.y - center.y) * CROWN_A4_RATIO));
  const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
  const variance = radii.reduce((sum, value) => sum + (value - mean) ** 2, 0) / radii.length;
  return { radialMean: mean, radialCv: Math.sqrt(variance) / Math.max(.0001, mean), circularity: crownClamp(1 - Math.sqrt(variance) / Math.max(.0001, mean), 0, 1) };
}

export function evaluateNarrowSpoonGeometry(petalOrRegion) {
  const sections = petalOrRegion?.crossSections || petalOrRegion?.petal?.crossSections || [];
  if (sections.length < 3) return { ok: false, warnings: ['SPOON_CROSS_SECTIONS_MISSING'] };
  const widest = sections.reduce((best, item) => item.width > best.width ? item : best, sections[0]);
  const root = sections[0].width, peak = widest.width, metrics = petalOrRegion?.spoonMetrics || petalOrRegion?.petal?.spoonMetrics || {};
  const spear = (metrics.tipRoundness ?? 0) < .52 || (metrics.roundedTipCurvature ?? 0) < .55;
  const warnings = [];
  if (widest.t < .55 || widest.t > .80) warnings.push('SPOON_WIDEST_POINT_OUT_OF_RANGE');
  if (root / Math.max(.0001, peak) > .34) warnings.push('SPOON_ROOT_NOT_NARROW');
  if (spear) warnings.push('SPEAR_TIP_WARNING');
  return { ok: warnings.length === 0, widestPointT: widest.t, rootToPeakRatio: root / Math.max(.0001, peak), roundedTipCurvature: metrics.roundedTipCurvature ?? 0, spearTip: spear, warnings };
}

export function evaluateCrownBotanicalGeometry(structure) {
  const petals = structure?.regions?.filter(region => region.kind === 'petal-region') || [];
  const rings = new Map();
  for (const petal of petals) { const ring = petal.petal?.ring || 'single'; rings.set(ring, (rings.get(ring) || 0) + 1); }
  const warnings = [];
  let measured = null;
  if (structure?.ringStructure?.mode === 'MultiPetalCup' && structure?.crownEnvelope && structure?.regions?.some(region => region.kind === 'flower-center-region')) {
    measured = measureCrownGeometryGates(structure, { width: 256, height: 362 });
    const gate = GEOMETRY_GATE_THRESHOLDS.crown;
    if (measured.minimumAdjacentRootOverlapRatio < gate.minimumAdjacentRootOverlapRatio) warnings.push('PETAL_ROOT_OVERLAP_BELOW_GATE');
    if (measured.radialGapRatio > gate.maximumRadialGapRatio || measured.rootZoneEmptyWedges > gate.maximumRootZoneEmptyWedges) warnings.push('ROOT_ZONE_RADIAL_GAPS');
    if (measured.crownCoreOccupancy < gate.minimumCrownCoreOccupancy) warnings.push('CROWN_CORE_OCCUPANCY_LOW');
    if (measured.centerOcclusionRatio < gate.minimumCenterOcclusionRatio || measured.centerOcclusionRatio > gate.maximumCenterOcclusionRatio) warnings.push('CENTER_OCCLUSION_OUT_OF_RANGE');
    if (measured.nearCircleEnvelopeDeviation > gate.maximumNearCircleEnvelopeDeviation) warnings.push('CROWN_ENVELOPE_DEVIATION');
  }
  const genericSingleRing = rings.size <= 1 && petals.length >= 12;
  if (genericSingleRing || measured?.genericRadialFlowerWarning) warnings.push('GENERIC_SINGLE_RING_RADIAL_FLOWER_WARNING');
  if (petals.length === 14 && (rings.get('outer') !== 8 || rings.get('inner') !== 6)) warnings.push('MULTIPETAL_CUP_RING_COUNT_MISMATCH');
  return { ringCounts: Object.fromEntries(rings), measured, warnings: [...new Set(warnings)], genericSingleRingWarning: warnings.includes('GENERIC_SINGLE_RING_RADIAL_FLOWER_WARNING') };
}

function crownSingleRingDrafts({ petalCount, random, center, narrowSpoon, seed, bowlBias }) {
  const drafts = [], baseAngle = -Math.PI / 2, rhythmPhase = random() * Math.PI * 2;
  const rawGaps = Array.from({ length: petalCount }, (_, index) => crownClamp(1 + (random() - .5) * .40 + .12 * Math.sin(index * 1.31 + rhythmPhase) + .06 * Math.sin(index * 2.71 + seed * .002), .72, 1.30));
  const gapScale = Math.PI * 2 / rawGaps.reduce((sum, value) => sum + value, 0);
  let angleCursor = baseAngle;
  const lowFrequencyPhase = random() * Math.PI * 2;
  const depthRhythm = [1.0, .82, .94, .74, .90, .78, 1.04, .86, .96, .72, .91, .80];
  for (let index = 0; index < petalCount; index += 1) {
    const angle = angleCursor + (random() - .5) * .090; angleCursor += rawGaps[index] * gapScale;
    const topBias = Math.max(0, -Math.sin(angle)) * .026, rhythm = depthRhythm[index % depthRhythm.length];
    const length = narrowSpoon ? crownClamp(.318 + .020 * Math.sin(index * 1.19 + lowFrequencyPhase) + (random() - .5) * .022 + topBias * .36, .282, .355) : crownClamp(.326 + .030 * Math.sin(index * 1.19 + lowFrequencyPhase) + (random() - .5) * .028 + topBias * .40, .298, .366);
    const width = narrowSpoon ? crownClamp(.112 + .018 * Math.sin(index * 1.87 + lowFrequencyPhase * .71) + (random() - .5) * .016, .086, .142) : crownClamp(.208 + .034 * Math.sin(index * 1.87 + lowFrequencyPhase * .71) + (random() - .5) * .028, .172, .252);
    const baseRadius = .001 + random() * .008, bend = (random() - .5) * .082, asymmetry = (random() - .5) * .38;
    const tipRoundness = narrowSpoon ? crownClamp(.64 + random() * .28, .58, .96) : crownClamp(.18 + random() * .70, .12, .92);
    const geometry = narrowSpoon ? crownSpoonPetal({ center, angle, length, baseRadius, width, bend, asymmetry, tipRoundness, tipSkew: (random() - .5) * width * .15, widestPoint: .62 + random() * .13, rootWidthRatio: .12 + random() * .07, elevation: .22, bowlBias }) : crownRadialPetal({ center, angle, length, baseRadius, width, bend, asymmetry, shoulderBias: (random() - .5) * .044, tipRoundness, edgeRhythm: .018 + random() * .072, tipSkew: (random() - .5) * width * .22, rootFullness: .66 + random() * .18 });
    const z = Math.round(34 + (.5 + .5 * Math.sin(angle + .28)) * 22 + (.5 + .5 * Math.sin(index * 1.73 + rhythmPhase * .83)) * 18 + (random() - .5) * 8);
    drafts.push({ index, ring: 'single', ringIndex: index, angle, z, length, width, bend, tipRoundness, rhythm, baseRadius, elevation: .22, bowlDepth: .18, ...geometry });
  }
  return { drafts, baseAngle };
}

function crownMultiPetalCupDrafts({ random, center, seed, bowlBias }) {
  const drafts = [], rhythmPhase = random() * Math.PI * 2;
  const configs = [
    { ring: 'outer', count: 8, phase: -Math.PI / 2, length: .282, width: .126, baseRadius: .0015 + bowlBias * .0012, elevation: .38, zBase: 38, rootWidth: [.22, .29] },
    { ring: 'inner', count: 6, phase: -Math.PI / 2 + Math.PI / 8, length: .207, width: .134, baseRadius: .010 + bowlBias * .0015, elevation: .72, zBase: 59, rootWidth: [.24, .31] }
  ];
  let globalIndex = 0;
  for (const config of configs) {
    const rawGaps = Array.from({ length: config.count }, (_, index) => crownClamp(1 + (random() - .5) * .18 + .055 * Math.sin(index * 1.77 + rhythmPhase), .84, 1.16));
    const scale = Math.PI * 2 / rawGaps.reduce((sum, value) => sum + value, 0);
    let cursor = config.phase + (random() - .5) * .045;
    for (let ringIndex = 0; ringIndex < config.count; ringIndex += 1) {
      const angle = cursor + (random() - .5) * .035; cursor += rawGaps[ringIndex] * scale;
      const length = crownClamp(config.length * (1 + .045 * Math.sin(ringIndex * 1.61 + rhythmPhase) + (random() - .5) * .045), config.ring === 'outer' ? .260 : .190, config.ring === 'outer' ? .304 : .224);
      const width = crownClamp(config.width * (1 + .075 * Math.sin(ringIndex * 1.37 + rhythmPhase * .7) + (random() - .5) * .06), config.ring === 'outer' ? .112 : .120, config.ring === 'outer' ? .142 : .150);
      const baseRadius = config.baseRadius * (1 + (random() - .5) * .10), elevation = crownClamp(config.elevation + (random() - .5) * .09, .2, .82);
      const bend = (random() - .5) * (config.ring === 'outer' ? .062 : .045), tipRoundness = crownClamp(.72 + random() * .20, .68, .96);
      const widestPoint = crownClamp(.61 + random() * .13 + (config.ring === 'inner' ? -.025 : .015), .56, .78);
      const rootWidthRatio = crownClamp(config.rootWidth[0] + random() * (config.rootWidth[1] - config.rootWidth[0]), .36, .56);
      const geometry = crownSpoonPetal({ center, angle, length, baseRadius, width, bend, asymmetry: (random() - .5) * .24, tipRoundness, tipSkew: (random() - .5) * width * .13, widestPoint, rootWidthRatio, elevation, bowlBias });
      const bowlDepth = crownClamp((config.ring === 'inner' ? .64 : .28) + bowlBias * .22 + (random() - .5) * .06, .18, .90);
      const z = Math.round(config.zBase + bowlDepth * 16 + Math.sin(angle + .35) * 3 + (random() - .5) * 5);
      drafts.push({ index: globalIndex++, ring: config.ring, ringIndex, angle, z, length, width, bend, tipRoundness, rhythm: config.ring === 'inner' ? .82 : 1, baseRadius, elevation, bowlDepth, ...geometry });
    }
  }
  return { drafts, baseAngle: -Math.PI / 2 };
}

export function buildCompleteCrownBenchmarkStructure({
  crownId = 'wp5-complete-crown', petalCount = 10, feather = .012, seed = 505, focalPetalIndex = null,
  petalGeometryFamily = 'broad-organic', petalRhythm = 'single-layer', bowlBias = 0,
  centerMode = 'abstract-irregular', crownTop = .02, crownHeight = .495, centerRadius = .067
} = {}) {
  if (!Number.isInteger(petalCount) || petalCount < 8 || petalCount > 16) throw new Error('petalCount must be 8–16');
  if (petalRhythm === 'one-to-two-layer' && petalCount !== 14) throw new Error('MultiPetalCup one-to-two-layer requires exactly 14 petals');
  const random = crownPrng(seed), center = { x: .5, y: crownTop + crownHeight / 2 };
  const envelope = { cx: center.x, cy: center.y, rx: .35, ry: crownHeight / 2 };
  const narrowSpoon = petalGeometryFamily === 'narrow-spoon';
  const multiCup = petalRhythm === 'one-to-two-layer';
  const built = multiCup ? crownMultiPetalCupDrafts({ random, center, seed, bowlBias }) : crownSingleRingDrafts({ petalCount, random, center, narrowSpoon, seed, bowlBias });
  const petalDrafts = built.drafts, baseAngle = built.baseAngle;
  const focalCandidates = multiCup ? petalDrafts.filter(item => item.ring === 'inner') : petalDrafts;
  const automaticFocal = focalCandidates.reduce((best, item) => crownAngleDistance(item.angle, -Math.PI / 2 + .18) < crownAngleDistance(best.angle, -Math.PI / 2 + .18) ? item : best, focalCandidates[0]).index;
  const focalIndex = Number.isInteger(focalPetalIndex) && focalPetalIndex >= 0 && focalPetalIndex < petalCount ? focalPetalIndex : automaticFocal;
  if (multiCup && petalDrafts[focalIndex].ring === 'outer') {
    const outerDepthCeiling = Math.min(...petalDrafts.filter(item => item.ring === 'inner').map(item => item.z)) - 3;
    const outerMaximum = Math.max(...petalDrafts.filter(item => item.ring === 'outer' && item.index !== focalIndex).map(item => item.z));
    petalDrafts[focalIndex].z = Math.min(outerDepthCeiling, outerMaximum + 5);
  } else petalDrafts[focalIndex].z = Math.max(...petalDrafts.map(item => item.z)) + 7;
  const centerId = `${crownId}:center`;
  const innerDrafts = petalDrafts.filter(item => item.ring === 'inner');
  const centerZ = multiCup ? Math.min(...innerDrafts.map(item => item.z)) + 1 : [...petalDrafts.map(item => item.z)].sort((a,b)=>a-b)[Math.floor(petalDrafts.length * .42)] + .5;
  if (multiCup) {
    const frontInner = [...innerDrafts].sort((a,b)=>b.z-a.z).slice(0,2);
    for (const item of frontInner) item.z = Math.max(item.z, centerZ + 3);
  }
  const petalRegions = petalDrafts.map(item => ({
    regionId: `${crownId}:petal:${String(item.index + 1).padStart(2, '0')}`,
    kind: 'petal-region', role: item.index === focalIndex ? 'focal-petal' : `${item.ring}-crown-petal`, index: item.index,
    z: item.z, relation: item.z >= 64 ? 'front' : item.z <= 45 ? 'back' : 'middle', visible: true,
    path: item.path, growthAxis: item.growthAxis, foldAxis: item.foldAxis, crossSections: item.crossSections,
    angle: item.angle, ringId: `${crownId}:ring:${item.ring}`, petal: {
      geometryFamily: narrowSpoon ? 'narrow-spoon' : 'broad-organic', ring: item.ring, ringIndex: item.ringIndex,
      length: item.length, width: item.width, bend: item.bend, tipRoundness: item.tipRoundness,
      rhythm: item.rhythm, angularOffset: item.angle - (baseAngle + item.ringIndex * Math.PI * 2 / (item.ring === 'inner' ? 6 : item.ring === 'outer' ? 8 : petalCount)),
      baseRadius: item.baseRadius, elevation: item.elevation, bowlDepth: item.bowlDepth,
      spoonMetrics: item.spoonMetrics || null
    }, overlaps: [], mask: { feather }
  }));
  const intersectionRaster = { width: 320, height: 452 };
  const petalRasterMasks = new Map(petalRegions.map(region => [region.regionId, rasterizeGeometryPath(region.path, intersectionRaster.width, intersectionRaster.height)]));
  const actualIntersection = (leftRegion, rightRegion) => {
    const leftMask = petalRasterMasks.get(leftRegion.regionId), rightMask = petalRasterMasks.get(rightRegion.regionId);
    let intersection = 0, leftArea = 0, rightArea = 0;
    for (let index = 0; index < leftMask.length; index += 1) {
      if (leftMask[index]) leftArea += 1;
      if (rightMask[index]) rightArea += 1;
      if (leftMask[index] && rightMask[index]) intersection += 1;
    }
    return { pixels: intersection, ratio: intersection / Math.max(1, Math.min(leftArea, rightArea)) };
  };
  if (multiCup) {
    const outer = petalDrafts.filter(item=>item.ring==='outer'), inner = petalDrafts.filter(item=>item.ring==='inner');
    for (const ring of [outer, inner]) for (const item of ring) {
      const neighbor = ring[(item.ringIndex + 1) % ring.length];
      const itemRegion = petalRegions[item.index], neighborRegion = petalRegions[neighbor.index];
      const intersection = actualIntersection(itemRegion, neighborRegion);
      const back = item.z < neighbor.z ? item : neighbor, front = item.z < neighbor.z ? neighbor : item;
      if (intersection.pixels > 0 && front.z > back.z) petalRegions[back.index].overlaps.push({
        frontRegionId: petalRegions[front.index].regionId,
        seam: back.sideSeams.right,
        bandWidth:.022+random()*.007,
        kind:`${item.ring}-ring-seam`,
        actualIntersectionPixels: intersection.pixels,
        actualIntersectionRatio: intersection.ratio
      });
    }
    for (const outerItem of outer) {
      const nearest = [...inner].sort((a,b)=>crownAngleDistance(a.angle,outerItem.angle)-crownAngleDistance(b.angle,outerItem.angle)).slice(0,3);
      for (const innerItem of nearest) {
        const outerRegion = petalRegions[outerItem.index], innerRegion = petalRegions[innerItem.index];
        const intersection = actualIntersection(outerRegion, innerRegion);
        if (intersection.pixels <= 0) continue;
        const back = outerItem.z < innerItem.z ? outerItem : innerItem, front = outerItem.z < innerItem.z ? innerItem : outerItem;
        if (front.z <= back.z || petalRegions[back.index].overlaps.some(overlap=>overlap.frontRegionId===petalRegions[front.index].regionId)) continue;
        petalRegions[back.index].overlaps.push({
          frontRegionId: petalRegions[front.index].regionId,
          seam: back.sideSeams[crownAngleDistance(front.angle, back.angle + .18) < crownAngleDistance(front.angle, back.angle - .18) ? 'right' : 'left'],
          bandWidth: .024 + random()*.008,
          kind:'inner-over-outer-seam',
          actualIntersectionPixels: intersection.pixels,
          actualIntersectionRatio: intersection.ratio
        });
      }
    }
  } else {
    for (const item of petalDrafts) {
      const region=petalRegions[item.index];
      const neighborCandidates=[(item.index-2+petalCount)%petalCount,(item.index-1+petalCount)%petalCount,(item.index+1)%petalCount,(item.index+2)%petalCount].map(index=>petalDrafts[index]).filter(candidate=>candidate.z>item.z+2).sort((a,b)=>b.z-a.z);
      for (const front of neighborCandidates.slice(0,item.index%3===0?2:1)) region.overlaps.push({frontRegionId:petalRegions[front.index].regionId,seam:item.sideSeams[((front.index-item.index+petalCount)%petalCount)<=petalCount/2?'right':'left'],bandWidth:.026+random()*.011,kind:'petal-seam'});
    }
  }
  const effectiveCenterRadius = centerMode === 'dense-irregular-gold' ? Math.max(centerRadius, .064) : centerRadius;
  const centerPath = crownCenterPath(center, effectiveCenterRadius, centerMode === 'dense-irregular-gold' ? 68 : 54, seed ^ 0x9E3779B9);
  const centerRasterMask = rasterizeGeometryPath(centerPath, intersectionRaster.width, intersectionRaster.height);
  const centerIntersection = item => {
    const mask = petalRasterMasks.get(petalRegions[item.index].regionId); let pixels = 0;
    for (let index = 0; index < mask.length; index += 1) if (mask[index] && centerRasterMask[index]) pixels += 1;
    return pixels;
  };
  const selectedOccluders = multiCup
    ? [...petalDrafts.filter(item=>item.ring==='inner' && item.z>centerZ && centerIntersection(item)>0)].sort((a,b)=>b.z-a.z).slice(0,4)
    : petalDrafts.filter(item=>item.z>centerZ && centerIntersection(item)>0);
  const featureField = centerMode === 'dense-irregular-gold' ? crownDenseCenterFeatures(center,effectiveCenterRadius,43,seed^0xA53C9E1D) : crownDenseCenterFeatures(center,effectiveCenterRadius,18,seed^0xA53C9E1D);
  const contourMetrics = crownContourMetrics(centerPath,center);
  const centerRegion = {
    regionId:centerId,kind:'flower-center-region',role:'flower-center',index:petalCount,z:centerZ,relation:'middle',visible:true,path:centerPath,
    growthAxis:{base:{...center},tip:{x:center.x+.006,y:center.y-.052}},foldAxis:{base:{x:center.x-.043,y:center.y+.004},tip:{x:center.x+.048,y:center.y-.006}},
    overlaps:selectedOccluders.map(item=>({frontRegionId:petalRegions[item.index].regionId,seam:[petalRegions[item.index].growthAxis.base,petalRegions[item.index].foldAxis.base],bandWidth:.024,kind:'center-occlusion'})),
    center:{mode:centerMode,occludedBy:selectedOccluders.map(item=>petalRegions[item.index].regionId),irregularity:contourMetrics.radialCv,massField:{radius:effectiveCenterRadius,core:.58,mid:.84,edge:1},features:featureField.features,featureSpacingCv:featureField.spacingCv,contourMetrics},
    mask:{feather:Math.min(.018,feather*.68)}
  };
  if (multiCup) {
    for (const item of petalDrafts.filter(candidate=>candidate.ring==='inner' && candidate.z<centerZ && centerIntersection(candidate)>0)) {
      petalRegions[item.index].overlaps.push({ frontRegionId:centerId, seam:item.centerSeam, bandWidth:.026, kind:'center-over-inner-root', actualIntersectionPixels:centerIntersection(item) });
    }
  } else for (const item of petalDrafts) if(centerZ>=item.z) petalRegions[item.index].overlaps.push({frontRegionId:centerId,seam:item.centerSeam,bandWidth:.026,kind:'center-seam'});
  const regions=[...petalRegions,centerRegion];
  const topology=regions.map(region=>({regionId:region.regionId,z:region.z,relation:region.relation,frontOf:regions.filter(item=>item.z<region.z).map(item=>item.regionId)}));
  const masks=regions.map(region=>createVectorMask(region,{feather:region.mask?.feather??feather}));
  const ringAngles = Object.fromEntries(['outer','inner','single'].map(ring=>[ring,petalRegions.filter(p=>p.petal.ring===ring).map(p=>p.angle)]));
  const structure={
    schemaVersion:'0.5',purpose:multiCup?'WP-9A-R1a MultiPetalCup botanical geometry':'WP8 Painterly Rendering Revision — non-species Single Crown Benchmark C3R',
    profile:{schemaVersion:'0.4',profileId:crownId,crownMode:'Single',leafCount:'Two',leafWidth:'Medium',leafTip:'Pointed',leafCurve:'Gentle Wave',crownTop,crownHeight,stemWidthRatio:1/12,seed,metadata:{source:'flora',label:multiCup?'FLR-012 MultiPetalCup · 8 outer + 6 inner':'Painterly Complete Crown',petalGeometryFamily,petalRhythm,centerMode,bowlBias}},
    coordinateSystem:{page:'A4 portrait',normalized:true,origin:'top-left',x:[0,1],y:[0,1],visualAspect:CROWN_A4_RATIO},
    crownEnvelope:{regionId:`${crownId}:envelope`,kind:'near-circle-envelope',path:[envelope],top:crownTop,height:crownHeight},
    backgroundExclusionMask:{maskId:`mask:${crownId}:background-exclusion`,mode:'exclude-outside-crown',visible:false,path:[envelope],feather:0,cacheRevision:0},
    focalRegionId:petalRegions[focalIndex].regionId,
    ringStructure:{mode:multiCup?'MultiPetalCup':'SingleRing',counts:{outer:petalRegions.filter(p=>p.petal.ring==='outer').length,inner:petalRegions.filter(p=>p.petal.ring==='inner').length,single:petalRegions.filter(p=>p.petal.ring==='single').length},angles:ringAngles,staggered:multiCup},
    bowlDepthField:{enabled:multiCup,bias:bowlBias,min:Math.min(...petalRegions.map(p=>p.petal.bowlDepth||0)),max:Math.max(...petalRegions.map(p=>p.petal.bowlDepth||0)),rings:{outer:.28+bowlBias*.22,inner:.64+bowlBias*.22}},
    overlapGraph:{mode:multiCup?'inner-outer-staggered':'asymmetric-seeded',centerZ,edges:regions.flatMap(region=>(region.overlaps||[]).map(overlap=>({backRegionId:region.regionId,frontRegionId:overlap.frontRegionId,kind:overlap.kind,actualIntersectionPixels:overlap.actualIntersectionPixels??null,actualIntersectionRatio:overlap.actualIntersectionRatio??null})))},
    regions,topology,masks
  };
  structure.botanicalGeometry=evaluateCrownBotanicalGeometry(structure);
  return structure;
}
