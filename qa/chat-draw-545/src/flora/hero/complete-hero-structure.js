import { createVectorMask, vectorMaskHash } from '../mask/vector-mask.js';
import { buildCompleteCrownBenchmarkStructure } from '../painting/complete-crown-benchmark.js';
import { measureLeafGeometryGates, GEOMETRY_GATE_THRESHOLDS } from '../structure/geometry-measurement-gates.js';

const a4SClamp = (value, min, max) => Math.max(min, Math.min(max, value));
const a4SPoint = (x, y) => ({ x: a4SClamp(x, 0, 1), y: a4SClamp(y, 0, 1) });
const a4SMix = (a, b, t) => a + (b - a) * t;

function a4SCubicPoint(a, b, c, d, t) {
  const u = 1 - t;
  return { x: u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x, y: u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y };
}

function a4SCubicDerivative(a, b, c, d, t) {
  const u = 1 - t;
  return {
    x: 3 * u ** 2 * (b.x - a.x) + 6 * u * t * (c.x - b.x) + 3 * t ** 2 * (d.x - c.x),
    y: 3 * u ** 2 * (b.y - a.y) + 6 * u * t * (c.y - b.y) + 3 * t ** 2 * (d.y - c.y)
  };
}

function a4SBandPath({ base, tip, control1, control2, width, wave = .018, samples = 48, taperBase = .38, twist = 0, asymmetry = 0, edgeRhythm = 0, edgeLobes = 0, edgePhase = 0 }) {
  const left = [], right = [], axis = []; let previous = base;
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples, raw = a4SCubicPoint(base, control1, control2, tip, t), next = a4SCubicPoint(base, control1, control2, tip, Math.min(1, t + 1 / samples));
    const dx = next.x - previous.x || next.x - raw.x, dy = next.y - previous.y || next.y - raw.y, length = Math.hypot(dx, dy) || 1, normal = { x: -dy / length, y: dx / length };
    const lateral = wave * Math.sin(Math.PI * t) * Math.sin(Math.PI * (1.25 + twist) * t + twist * 2.4);
    const center = { x: raw.x + normal.x * lateral, y: raw.y + normal.y * lateral };
    const body = Math.sin(Math.PI * t) ** .72, root = taperBase * (1 - t) ** 2.4, shoulder = 1 + .12 * Math.sin(Math.PI * Math.min(1, t / .74));
    const tipTaper = t > .72 ? (1 - ((t - .72) / .28) ** 1.45) : 1;
    const filigree = edgeLobes > 0 ? Math.sin(Math.PI * t) ** 1.25 * (Math.sin(Math.PI * 2 * edgeLobes * t + edgePhase) * .62 + Math.sin(Math.PI * 2 * (edgeLobes + 2) * t + edgePhase * .71) * .38) : 0;
    const half = width * .5 * Math.max(root, body) * shoulder * Math.max(0, tipTaper), twistBias = twist * Math.sin(Math.PI * t) * .10;
    const leftScale = Math.max(.52, 1 + asymmetry * .18 + twistBias + edgeRhythm * filigree), rightScale = Math.max(.52, 1 - asymmetry * .14 - twistBias * .72 - edgeRhythm * filigree * .78);
    axis.push(a4SPoint(center.x, center.y)); left.push(a4SPoint(center.x - normal.x * half * leftScale, center.y - normal.y * half * leftScale)); right.push(a4SPoint(center.x + normal.x * half * rightScale, center.y + normal.y * half * rightScale)); previous = raw;
  }
  return { path: left.concat(right.reverse()), growthAxis: { base: a4SPoint(base.x, base.y), tip: a4SPoint(tip.x, tip.y) }, axis };
}


function a4SSmoothstep(value) {
  const t = a4SClamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function a4SProfileAt(t, anchors) {
  if (t <= anchors[0].t) return anchors[0].value;
  if (t >= anchors.at(-1).t) return anchors.at(-1).value;
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const a = anchors[index], b = anchors[index + 1];
    if (t < a.t || t > b.t) continue;
    const local = a4SSmoothstep((t - a.t) / Math.max(.0001, b.t - a.t));
    return a4SMix(a.value, b.value, local);
  }
  return anchors.at(-1).value;
}

function a4SBuildLobeAnchors({ count, phase, side, asymmetry }) {
  const start = .105, end = .865, step = (end - start) / Math.max(1, count - 1);
  const sideShift = side === 'left' ? -.16 : .20;
  const phaseShift = Math.sin(phase + sideShift) * step * .075;
  const sidePhaseOffset = side === 'left' ? -step * .11 : step * .17;
  const peaks = Array.from({ length: count }, (_, index) => {
    const alternatingShift = (index % 2 ? 1 : -1) * step * (side === 'left' ? .08 : .12);
    const t = a4SClamp(start + index * step + phaseShift + sidePhaseOffset + alternatingShift, .085, .89);
    const taper = 1 - .48 * a4SSmoothstep((t - .18) / .72);
    const variation = 1 + .11 * Math.sin(index * 1.63 + phase + (side === 'right' ? .83 : 0)) + asymmetry * (side === 'left' ? .08 : -.07);
    return { t, value: a4SClamp((1.03 * taper) * variation, .50, 1.18), kind: 'peak', index };
  }).sort((a, b) => a.t - b.t);
  const anchors = [{ t: 0, value: .12, kind: 'root' }, { t: .055, value: .26, kind: 'root-shoulder' }];
  for (let index = 0; index < peaks.length; index += 1) {
    const peak = peaks[index];
    const previousT = index ? peaks[index - 1].t : .055;
    const valleyT = previousT + (peak.t - previousT) * (index ? .54 : .62);
    const valleyScale = a4SClamp(.205 + .045 * Math.sin(index * 1.31 + phase * .7 + (side === 'right' ? .6 : 0)), .15, .27);
    anchors.push({ t: valleyT, value: peak.value * valleyScale, kind: 'valley', index });
    anchors.push(peak);
  }
  const last = peaks.at(-1);
  anchors.push({ t: last.t + (1 - last.t) * .42, value: last.value * .23, kind: 'terminal-valley' });
  anchors.push({ t: .965, value: .045, kind: 'tip-neck' }, { t: 1, value: 0, kind: 'tip' });
  return { anchors: anchors.sort((a, b) => a.t - b.t), peaks };
}

function a4SFiligreePinnatePath({ base, tip, control1, control2, width, wave = .025, samples = 144, twist = 0, asymmetry = 0, lobeCount = 8, phase = 0 }) {
  const left = [], right = [], axis = [], crossSections = [];
  const leftProfile = a4SBuildLobeAnchors({ count: lobeCount, phase, side: 'left', asymmetry });
  const rightProfile = a4SBuildLobeAnchors({ count: lobeCount, phase: phase + .57, side: 'right', asymmetry });
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples, raw = a4SCubicPoint(base, control1, control2, tip, t), derivative = a4SCubicDerivative(base, control1, control2, tip, t);
    const length = Math.hypot(derivative.x, derivative.y) || 1;
    const tangent = { x: derivative.x / length, y: derivative.y / length }, normal = { x: -tangent.y, y: tangent.x };
    const lateral = wave * Math.sin(Math.PI * t) * Math.sin(Math.PI * (1.12 + twist * .22) * t + phase * .47);
    const center = a4SPoint(raw.x + normal.x * lateral, raw.y + normal.y * lateral);
    const body = Math.sin(Math.PI * t) ** .63;
    const rootEnvelope = t < .075 ? .18 + .82 * a4SSmoothstep(t / .075) : 1;
    const tipEnvelope = t > .89 ? Math.max(0, 1 - a4SSmoothstep((t - .89) / .11)) : 1;
    const halfBase = width * .57 * body * rootEnvelope * tipEnvelope;
    const leftScale = a4SProfileAt(t, leftProfile.anchors), rightScale = a4SProfileAt(t, rightProfile.anchors);
    const leftHalf = halfBase * leftScale, rightHalf = halfBase * rightScale;
    const lp = a4SPoint(center.x - normal.x * leftHalf, center.y - normal.y * leftHalf);
    const rp = a4SPoint(center.x + normal.x * rightHalf, center.y + normal.y * rightHalf);
    axis.push(center); left.push(lp); right.push(rp);
    crossSections.push({ t, center, left: lp, right: rp, width: leftHalf + rightHalf, leftHalf, rightHalf, tangent, normal, leftScale, rightScale });
  }
  const path = left.concat(right.reverse());
  return {
    path, growthAxis: { base: a4SPoint(base.x, base.y), tip: a4SPoint(tip.x, tip.y) }, axis, crossSections,
    pinnate: {
      lobeCountPerSide: lobeCount,
      leftLobes: leftProfile.peaks.map(peak => ({ center: peak.t, amplitude: peak.value })),
      rightLobes: rightProfile.peaks.map(peak => ({ center: peak.t, amplitude: peak.value })),
      leftAnchors: leftProfile.anchors,
      rightAnchors: rightProfile.anchors,
      alternating: true,
      taperRatio: (leftProfile.peaks.at(-1).value + rightProfile.peaks.at(-1).value) / Math.max(.0001, leftProfile.peaks[0].value + rightProfile.peaks[0].value),
      edgeMode: 'filigree-pinnate-impression',
      contourMode: 'central-spine-alternating-lobe-valley-compound'
    }
  };
}

export function evaluateFiligreePinnateLeafGeometry(region) {
  const pinnate = region?.leaf?.pinnate || region?.pinnate;
  const axis = region?.leaf?.centralAxis || region?.centralAxis || [];
  const warnings = [];
  let measured = null;
  if ((region?.leaf?.crossSections || region?.crossSections)?.length >= 12) {
    measured = measureLeafGeometryGates(region);
    const gate = GEOMETRY_GATE_THRESHOLDS.leaf;
    if (measured.effectiveLobeCountLeft < gate.minimumEffectiveLobesPerSide || measured.effectiveLobeCountLeft > gate.maximumEffectiveLobesPerSide || measured.effectiveLobeCountRight < gate.minimumEffectiveLobesPerSide || measured.effectiveLobeCountRight > gate.maximumEffectiveLobesPerSide) warnings.push('LEAF_EFFECTIVE_LOBE_COUNT_OUT_OF_RANGE');
    if (measured.leftProminence < gate.minimumProminence || measured.rightProminence < gate.minimumProminence) warnings.push('LEAF_LOBE_PROMINENCE_LOW');
    if (measured.leftValleyDepth < gate.minimumValleyDepth || measured.rightValleyDepth < gate.minimumValleyDepth) warnings.push('LEAF_VALLEY_DEPTH_LOW');
    if (measured.lobeTaperRatio >= gate.maximumTipTaperRatio) warnings.push('LEAF_LOBES_DO_NOT_TAPER');
    if (!measured.centralAxisContinuous) warnings.push('LEAF_AXIS_DISCONTINUITY');
    if (!measured.smallViewReadable) warnings.push('LEAF_SMALL_VIEW_LOBES_UNREADABLE');
    if (measured.genericRibbonSimilarity) warnings.push('GENERIC_RIBBON_LEAF_WARNING');
  } else if (!pinnate || pinnate.lobeCountPerSide < 6 || pinnate.lobeCountPerSide > 10) warnings.push('GENERIC_RIBBON_LEAF_WARNING');
  if (axis.length < 8 || axis.some((point, index) => index && Math.hypot(point.x - axis[index - 1].x, point.y - axis[index - 1].y) > .08)) warnings.push('LEAF_AXIS_DISCONTINUITY');
  if (pinnate && pinnate.taperRatio >= .86) warnings.push('LEAF_LOBES_DO_NOT_TAPER');
  if (pinnate && pinnate.alternating !== true) warnings.push('LEAF_LOBES_NOT_ALTERNATING');
  const uniqueWarnings = [...new Set(warnings)];
  return { ok: uniqueWarnings.length === 0, warnings: uniqueWarnings, lobeCountPerSide: pinnate?.lobeCountPerSide || 0, taperRatio: pinnate?.taperRatio ?? 1, axisPointCount: axis.length, measured, genericRibbonWarning: uniqueWarnings.includes('GENERIC_RIBBON_LEAF_WARNING') };
}

function a4SStemPath({ axisX = .5, top = .43, bottom = 1, width = .0583, samples = 42 }) {
  const left = [], right = [], axis = [];
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples, y = a4SMix(top, bottom, t), centerX = axisX + .0018 * Math.sin(Math.PI * t) * Math.sin(Math.PI * 1.18 * t + .45), topTaper = .82 + .18 * Math.min(1, t * 5), bottomSet = .94 + .06 * t, half = width * .5 * topTaper * bottomSet;
    axis.push(a4SPoint(centerX, y)); left.push(a4SPoint(centerX - half, y)); right.push(a4SPoint(centerX + half, y));
  }
  return { path: left.concat(right.reverse()), growthAxis: { base: a4SPoint(axisX, bottom), tip: a4SPoint(axisX, top) }, axis };
}

const a4SRegionMask = (region, feather) => createVectorMask(region, { feather });

function a4SLeafSpecs(plan) {
  if (plan.composition.leafCount === 'Four') return [
    { slot: 'left-outer', role: 'left-outer-leaf', index: -6, z: 10, base: { x: .414, y: 1 }, tip: { x: .060, y: .690 }, c1: { x: .390, y: .900 }, c2: { x: .170, y: .755 }, width: .062, wave: .010, taperBase: .13, twist: -.48, asym: .28, edgeRhythm: .16, edgeLobes: 9, phase: .2, foldTip: { x: .083, y: .708 } },
    { slot: 'left-inner', role: 'left-inner-leaf', index: -5, z: 15, base: { x: .460, y: 1 }, tip: { x: .265, y: .575 }, c1: { x: .455, y: .885 }, c2: { x: .330, y: .660 }, width: .057, wave: .010, taperBase: .12, twist: .38, asym: -.20, edgeRhythm: .15, edgeLobes: 8, phase: 1.1, foldTip: { x: .280, y: .602 } },
    { slot: 'right-inner', role: 'right-inner-leaf', index: -4, z: 16, base: { x: .540, y: 1 }, tip: { x: .735, y: .598 }, c1: { x: .548, y: .880 }, c2: { x: .665, y: .680 }, width: .057, wave: .010, taperBase: .12, twist: -.35, asym: .22, edgeRhythm: .15, edgeLobes: 8, phase: 2.0, foldTip: { x: .720, y: .620 } },
    { slot: 'right-outer', role: 'right-outer-leaf', index: -3, z: 11, base: { x: .586, y: 1 }, tip: { x: .940, y: .665 }, c1: { x: .610, y: .895 }, c2: { x: .825, y: .735 }, width: .062, wave: .010, taperBase: .13, twist: .50, asym: -.26, edgeRhythm: .16, edgeLobes: 9, phase: 2.8, foldTip: { x: .917, y: .688 } }
  ];
  return [
    { slot: 'left', role: 'left-leaf', index: -2, z: 14, base: { x: .466, y: 1 }, tip: { x: .080, y: .625 }, c1: { x: .430, y: .905 }, c2: { x: .205, y: .675 }, width: .190, wave: .015, taperBase: .32, twist: -.30, asym: .32, edgeRhythm: 0, edgeLobes: 0, phase: 0, foldTip: { x: .105, y: .651 } },
    { slot: 'right', role: 'right-leaf', index: -1, z: 16, base: { x: .536, y: 1 }, tip: { x: .923, y: .566 }, c1: { x: .585, y: .895 }, c2: { x: .770, y: .620 }, width: .184, wave: .020, taperBase: .29, twist: .38, asym: -.24, edgeRhythm: 0, edgeLobes: 0, phase: 0, foldTip: { x: .892, y: .595 } }
  ];
}

export function buildCompleteA4HeroStructure(plan) {
  const crown = buildCompleteCrownBenchmarkStructure({
    crownId: plan.crownPlan.crownId, petalCount: plan.crownPlan.petalCount, feather: .009, seed: plan.seed,
    focalPetalIndex: plan.crownPlan.focalRegion.petalIndex, petalGeometryFamily: plan.crownPlan.petalGeometryFamily || plan.crownPlan.metadata?.petalGeometryFamily || 'broad-organic',
    petalRhythm: plan.crownPlan.petalRhythm || 'single-layer', bowlBias: plan.crownPlan.bowlBias || plan.crownPlan.metadata?.bowlBias || 0,
    centerMode: plan.crownPlan.centerMode || 'abstract-irregular', crownTop: plan.composition.crownTop, crownHeight: plan.composition.crownHeight, centerRadius: plan.crownPlan.metadata?.centerRadius || .067
  });
  const crownDiameter = crown.crownEnvelope.path[0].rx * 2, stemWidth = crownDiameter * plan.composition.stemWidthRatio;
  const background = { regionId: plan.backgroundPlan.regionId, kind: 'background-region', role: 'quiet-background', index: -8, z: 0, relation: 'back', visible: true, path: [a4SPoint(0, 0), a4SPoint(1, 0), a4SPoint(1, 1), a4SPoint(0, 1)], growthAxis: { base: a4SPoint(.47, 1), tip: a4SPoint(.54, 0) }, foldAxis: { base: a4SPoint(0, .56), tip: a4SPoint(1, .44) }, overlaps: [], mask: { feather: plan.backgroundPlan.edgeSoftness } };
  const leaves = a4SLeafSpecs(plan).map(spec => {
    const leafPlan = plan.leafPlans.find(item => (item.metadata?.slot || item.metadata?.side) === spec.slot);
    if (!leafPlan) throw new Error(`leaf plan missing: ${spec.slot}`);
    const edgeMode = leafPlan.leafEdgeMode || leafPlan.metadata?.leafEdgeMode || (leafPlan.metadata?.filigreeEdge ? 'filigree-wave' : 'smooth-band');
    const geometry = edgeMode === 'filigree-pinnate-impression'
      ? a4SFiligreePinnatePath({ base: spec.base, tip: spec.tip, control1: spec.c1, control2: spec.c2, width: spec.width, wave: spec.wave, twist: spec.twist, asymmetry: spec.asym, lobeCount: spec.edgeLobes || 7, phase: spec.phase })
      : a4SBandPath({ base: spec.base, tip: spec.tip, control1: spec.c1, control2: spec.c2, width: spec.width, wave: spec.wave, taperBase: spec.taperBase, twist: spec.twist, asymmetry: spec.asym, edgeRhythm: spec.edgeRhythm, edgeLobes: spec.edgeLobes, edgePhase: spec.phase });
    const leafData = { count: plan.composition.leafCount, width: plan.composition.leafWidth, tip: plan.composition.leafTip, curve: plan.composition.leafCurve, side: leafPlan.metadata.side, slot: spec.slot, twist: spec.twist, ridgeBias: spec.asym * .2, filigreeEdge: edgeMode !== 'smooth-band', edgeMode, centralAxis: geometry.axis || [], pinnate: geometry.pinnate || null, crossSections: geometry.crossSections || [] };
    const output = {
      regionId: leafPlan.regionId, kind: 'leaf-region', role: spec.role, index: spec.index, z: spec.z, relation: 'middle', visible: true,
      path: geometry.path, growthAxis: geometry.growthAxis, foldAxis: { base: a4SPoint(spec.base.x, .965), tip: a4SPoint(spec.foldTip.x, spec.foldTip.y) }, overlaps: [],
      leaf: leafData, mask: { feather: Math.min(.014, leafPlan.edgeSoftness) }
    };
    output.botanicalGeometry = evaluateFiligreePinnateLeafGeometry(output);
    return output;
  });
  const stemGeometry = a4SStemPath({ axisX: plan.composition.stemAxisX, top: .435, bottom: 1, width: stemWidth });
  const stem = { regionId: plan.stemPlan.regionId, kind: 'stem-region', role: 'central-stem', index: -2, z: 24, relation: 'middle', visible: true, path: stemGeometry.path, growthAxis: stemGeometry.growthAxis, foldAxis: { base: a4SPoint(plan.composition.stemAxisX - stemWidth * .17, .965), tip: a4SPoint(plan.composition.stemAxisX - stemWidth * .11, .455) }, overlaps: [], stem: { width: stemWidth, widthRatio: plan.composition.stemWidthRatio, axisX: plan.composition.stemAxisX, continuity: 'single-volume' }, mask: { feather: Math.min(.010, plan.stemPlan.edgeSoftness) } };
  const subjectRegions = [...leaves, stem, ...crown.regions], backgroundMask = a4SRegionMask(background, plan.backgroundPlan.edgeSoftness);
  backgroundMask.excludePaths = subjectRegions.map(region => structuredClone(region.path)); backgroundMask.excludeRegionIds = subjectRegions.map(region => region.regionId); backgroundMask.vectorHash = vectorMaskHash(backgroundMask); backgroundMask.mode = 'subject-exclusion'; backgroundMask.visible = true;
  const masks = [backgroundMask, ...leaves.map(leaf => a4SRegionMask(leaf, leaf.mask.feather)), a4SRegionMask(stem, stem.mask.feather), ...crown.masks];
  const regions = [background, ...leaves, stem, ...crown.regions];
  const topology = regions.map(region => ({ regionId: region.regionId, z: region.z, relation: region.relation, frontOf: regions.filter(candidate => candidate.z < region.z).map(candidate => candidate.regionId) }));
  return {
    schemaVersion: '0.9', purpose: plan.metadata?.speciesProfileId === 'FLR-012' ? 'WP-9A FLR-012 Adonis Candidate A' : 'WP8 Painterly Rendering Revision — abstract benchmark',
    profile: { schemaVersion: '0.5', profileId: plan.heroId, crownMode: 'Single', leafCount: plan.composition.leafCount, leafWidth: plan.composition.leafWidth, leafTip: plan.composition.leafTip, leafCurve: plan.composition.leafCurve, crownTop: plan.composition.crownTop, crownHeight: plan.composition.crownHeight, stemWidthRatio: plan.composition.stemWidthRatio, seed: plan.seed, metadata: { source: 'flora', label: plan.metadata?.label || 'A4 Hero Flower' } },
    coordinateSystem: { page: 'A4 portrait', normalized: true, origin: 'top-left', x: [0, 1], y: [0, 1], visualAspect: Math.SQRT2 }, composition: structuredClone(plan.composition), crownEnvelope: structuredClone(crown.crownEnvelope), crownOverlapGraph: structuredClone(crown.overlapGraph), ringStructure: structuredClone(crown.ringStructure), bowlDepthField: structuredClone(crown.bowlDepthField), botanicalGeometry: structuredClone(crown.botanicalGeometry), focalRegionId: crown.focalRegionId, centerRegionId: `${plan.crownPlan.crownId}:center`, stemRegionId: stem.regionId, leafRegionIds: leaves.map(leaf => leaf.regionId), backgroundRegionId: background.regionId, subjectRegionIds: subjectRegions.map(region => region.regionId), backgroundExclusionMask: { maskId: backgroundMask.maskId, regionId: background.regionId, mode: 'subject-exclusion', excludeRegionIds: [...backgroundMask.excludeRegionIds], excludeCount: backgroundMask.excludePaths.length }, regions, topology, masks
  };
}
