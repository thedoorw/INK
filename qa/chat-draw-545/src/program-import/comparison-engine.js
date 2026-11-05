import { deterministicHash } from './canonical-operation.js';

export const REFERENCE_DECISIONS = Object.freeze([
  'EQUIVALENT', 'ACCEPTABLE_DIFFERENCE', 'APPROXIMATED', 'STRUCTURALLY_DIFFERENT',
  'VISUALLY_DIFFERENT', 'EXECUTION_FAILED', 'REJECTED'
]);

export const DEFAULT_REFERENCE_THRESHOLDS = Object.freeze({
  raster: Object.freeze({ sizeMatch: true, alphaSimilarity: 0.995, structureRetention: 0.95, maskOverlap: 0.95, colorSimilarity: 0.94, histogramSimilarity: 0.94, edgeSimilarity: 0.9, textureSimilarity: 0.85, layerPreservation: 0.95, blendSimilarity: 0.95 }),
  vector: Object.freeze({ pathPreservation: 0.995, topologyPreservation: 0.995, geometrySimilarity: 0.995, maxAnchorInflation: 1.25, gradientPreservation: 0.99, groupPreservation: 0.99, idPreservation: 0.99, svgRoundtripStability: 0.99 }),
  stroke: Object.freeze({ strokePreservation: 0.99, pathSimilarity: 0.95, pressureSimilarity: 0.95, brushParameterPreservation: 0.95, replayConsistency: 0.995, compositeSimilarity: 0.9 })
});

const numeric = value => Number.isFinite(+value) ? +value : 0;
const clamp01 = value => Math.max(0, Math.min(1, numeric(value)));
const ratio = (a, b) => a === 0 && b === 0 ? 1 : Math.min(a, b) / Math.max(1, Math.max(a, b));
const descendObjects = (objects, page, layer) => (objects || []).flatMap(object => [{ page, layer, object }, ...(object?.type === 'group' ? descendObjects(object.children, page, layer) : [])]);
const flattenObjects = document => (document?.pages || []).flatMap(page => (page.layers || []).flatMap(layer => descendObjects(layer.objects, page, layer)));
const distance = (a, b) => Math.hypot(numeric(a?.x) - numeric(b?.x), numeric(a?.y) - numeric(b?.y));

function bboxOfAnchors(anchors) {
  if (!anchors.length) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = anchors.map(anchor => numeric(anchor.x)), ys = anchors.map(anchor => numeric(anchor.y));
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

function vectorSummary(value) {
  const descend = objects => (objects || []).flatMap(object => [object, ...(object?.type === 'group' ? descend(object.children) : [])]);
  const objects = value?.format === 'INK' ? flattenObjects(value).map(item => item.object) : descend(value?.objects || value?.paths || []);
  const paths = objects.filter(object => object?.type === 'path');
  const anchors = paths.flatMap(path => (path.subpaths || []).flatMap(subpath => subpath.anchors || []));
  const closed = paths.reduce((sum, path) => sum + (path.subpaths || []).filter(subpath => subpath.closed).length, 0);
  const holes = paths.reduce((sum, path) => sum + (path.subpaths || []).filter(subpath => subpath.role === 'hole').length, 0);
  const bezierHandles = anchors.filter(anchor => anchor.in || anchor.out).length;
  const bbox = bboxOfAnchors(anchors);
  return {
    pathCount: paths.length, anchorCount: anchors.length, bezierHandles, closedSubpaths: closed, holes,
    fillCount: paths.filter(path => path.fill).length, strokeCount: paths.filter(path => path.stroke).length,
    gradientCount: paths.filter(path => path.gradient).length, groupCount: objects.filter(object => object?.type === 'group').length,
    layerCount: value?.pages?.reduce((sum, page) => sum + (page.layers || []).length, 0) || numeric(value?.layerCount),
    objectIds: paths.map(path => path.id).filter(Boolean), bbox,
    svgRoundtripStability: value?.svgRoundtripStability ?? null
  };
}

function rasterStructure(value) {
  const layers = value?.layers || value?.structure?.layers || value?.pages?.flatMap(page => page.layers || []) || [];
  return {
    layerCount: layers.length, layerOrder: layers.map(layer => layer.id || layer.name),
    groups: layers.filter(layer => layer.type === 'group' || layer.kind === 'group').length,
    masks: layers.filter(layer => layer.mask || layer.vectorMask || layer.layerMask).length,
    clippings: layers.filter(layer => layer.clipping || layer.clippingMask).length,
    blends: layers.map(layer => layer.blendMode || 'source-over'),
    opacities: layers.map(layer => layer.opacity ?? 1),
    adjustments: layers.reduce((sum, layer) => sum + (layer.adjustments?.length || 0), 0),
    filters: layers.reduce((sum, layer) => sum + (layer.filterStack?.length || 0), 0)
  };
}

function rasterSummary(value) {
  const width = numeric(value?.width), height = numeric(value?.height), data = value?.data || [];
  const histogram = Array.from({ length: 16 }, () => 0), luminances = [];
  let alphaNonZero = 0, edgeEnergy = 0, textureEnergy = 0, colorTotal = 0;
  for (let index = 0; index < data.length; index += 4) {
    const luminance = numeric(data[index]) * .2126 + numeric(data[index + 1]) * .7152 + numeric(data[index + 2]) * .0722;
    luminances.push(luminance); histogram[Math.min(15, Math.floor(luminance / 16))] += 1; colorTotal += luminance;
    if (numeric(data[index + 3]) > 0) alphaNonZero += 1;
    if (index >= 4) edgeEnergy += Math.abs(luminance - luminances[luminances.length - 2]);
    if (luminances.length > 2) textureEnergy += Math.abs(luminance - 2 * luminances[luminances.length - 2] + luminances[luminances.length - 3]);
  }
  return { width, height, alphaNonZero, meanLuminance: colorTotal / Math.max(1, data.length / 4), edgeEnergy, textureEnergy, histogram, structure: rasterStructure(value), maskPixels: value?.maskPixels || null };
}

function strokeSummary(value) {
  const sessions = value?.sessions || value?.strokeSessions || value?.pages?.flatMap(page => page.strokeSessions || []) || [];
  const strokes = sessions.flatMap(session => session.session?.strokes || session.strokes || []), points = strokes.flatMap(stroke => stroke.samples || stroke.points || []);
  const average = key => points.reduce((sum, point) => sum + numeric(point[key]), 0) / Math.max(1, points.length);
  return {
    sessionCount: sessions.length, strokeCount: strokes.length, pointCount: points.length,
    meanPressure: average('pressure') || average('p'), meanTilt: average('tilt'), meanSize: average('size'), meanOpacity: average('opacity'),
    meanFlow: average('flow'), meanSpacing: average('spacing'), meanRotation: average('rotation'),
    brushDependencies: [...new Set(strokes.map(stroke => stroke.brushId).filter(Boolean))],
    endpoints: strokes.map(stroke => { const values = stroke.samples || stroke.points || []; return [values[0], values.at(-1)]; }),
    replayHash: value?.replayHash || value?.deterministicHash || null,
    compositeSimilarity: value?.compositeSimilarity ?? null
  };
}

const arrayPreservation = (reference, ink) => ratio(reference.length, ink.length);
const exactArraySimilarity = (reference, ink) => reference.length === 0 && ink.length === 0 ? 1 : reference.reduce((sum, value, index) => sum + Number(value === ink[index]), 0) / Math.max(reference.length, ink.length, 1);
const histogramSimilarity = (a, b) => 1 - Math.min(1, a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) / Math.max(1, a.reduce((sum, value) => sum + value, 0) + b.reduce((sum, value) => sum + value, 0)));
const energySimilarity = (a, b) => ratio(a, b);

function thresholdDecision(kind, metrics, thresholds, metadata) {
  if (metadata.executionFailed) return 'EXECUTION_FAILED';
  if (!metadata.referenceSoftware || !metadata.referenceVersion || !metadata.sameInputConfirmed) return 'REJECTED';
  const pass = key => metrics[key] >= thresholds[key];
  if (kind === 'raster') {
    if (!metrics.sizeMatch || !pass('structureRetention') || !pass('layerPreservation')) return 'STRUCTURALLY_DIFFERENT';
    if (!pass('colorSimilarity') || !pass('histogramSimilarity') || !pass('edgeSimilarity') || !pass('textureSimilarity')) return 'VISUALLY_DIFFERENT';
    if (Object.keys(thresholds).filter(key => key !== 'sizeMatch').every(pass)) return 'EQUIVALENT';
    return 'ACCEPTABLE_DIFFERENCE';
  }
  if (kind === 'vector') {
    if (!pass('pathPreservation') || !pass('topologyPreservation') || metrics.anchorInflation > thresholds.maxAnchorInflation) return 'STRUCTURALLY_DIFFERENT';
    if (pass('geometrySimilarity') && pass('gradientPreservation') && pass('groupPreservation') && pass('idPreservation') && pass('svgRoundtripStability')) return 'EQUIVALENT';
    return 'ACCEPTABLE_DIFFERENCE';
  }
  if (!pass('strokePreservation') || !pass('pathSimilarity')) return 'STRUCTURALLY_DIFFERENT';
  if (pass('pressureSimilarity') && pass('brushParameterPreservation') && pass('replayConsistency') && pass('compositeSimilarity')) return 'EQUIVALENT';
  return metrics.compositeSimilarity < thresholds.compositeSimilarity ? 'VISUALLY_DIFFERENT' : 'APPROXIMATED';
}

export function compareReference({ reference, ink, kind = 'auto', metadata = {}, thresholds = {} } = {}) {
  const resolvedKind = kind === 'auto' ? reference?.data && ink?.data ? 'raster' : reference?.sessions || ink?.strokeSessions ? 'stroke' : 'vector' : kind;
  const gate = { ...DEFAULT_REFERENCE_THRESHOLDS[resolvedKind], ...(thresholds || {}) };
  let referenceSummary, inkSummary, metrics;
  if (resolvedKind === 'raster') {
    referenceSummary = rasterSummary(reference); inkSummary = rasterSummary(ink);
    const layerPreservation = ratio(referenceSummary.structure.layerCount, inkSummary.structure.layerCount);
    const orderSimilarity = exactArraySimilarity(referenceSummary.structure.layerOrder, inkSummary.structure.layerOrder);
    const blendSimilarity = exactArraySimilarity(referenceSummary.structure.blends, inkSummary.structure.blends);
    const maskOverlap = referenceSummary.maskPixels && inkSummary.maskPixels ? ratio(referenceSummary.maskPixels, inkSummary.maskPixels) : 1;
    metrics = {
      sizeMatch: referenceSummary.width === inkSummary.width && referenceSummary.height === inkSummary.height,
      alphaSimilarity: ratio(referenceSummary.alphaNonZero, inkSummary.alphaNonZero),
      structureRetention: (layerPreservation + orderSimilarity + ratio(referenceSummary.structure.groups, inkSummary.structure.groups) + ratio(referenceSummary.structure.masks, inkSummary.structure.masks) + ratio(referenceSummary.structure.clippings, inkSummary.structure.clippings)) / 5,
      maskOverlap, colorSimilarity: 1 - Math.min(1, Math.abs(referenceSummary.meanLuminance - inkSummary.meanLuminance) / 255),
      histogramSimilarity: histogramSimilarity(referenceSummary.histogram, inkSummary.histogram), edgeSimilarity: energySimilarity(referenceSummary.edgeEnergy, inkSummary.edgeEnergy),
      textureSimilarity: energySimilarity(referenceSummary.textureEnergy, inkSummary.textureEnergy), layerPreservation,
      blendSimilarity: (blendSimilarity + exactArraySimilarity(referenceSummary.structure.opacities, inkSummary.structure.opacities)) / 2
    };
  } else if (resolvedKind === 'stroke') {
    referenceSummary = strokeSummary(reference); inkSummary = strokeSummary(ink);
    const endpoints = referenceSummary.endpoints.flat(), inkEndpoints = inkSummary.endpoints.flat(), diagonal = Math.max(1, numeric(metadata.canvasDiagonal) || 1000);
    const endpointDeviation = endpoints.reduce((sum, point, index) => sum + distance(point, inkEndpoints[index]), 0) / Math.max(1, endpoints.length) / diagonal;
    metrics = {
      strokePreservation: ratio(referenceSummary.strokeCount, inkSummary.strokeCount), pathSimilarity: clamp01(1 - endpointDeviation),
      pressureSimilarity: clamp01(1 - Math.abs(referenceSummary.meanPressure - inkSummary.meanPressure)),
      brushParameterPreservation: (ratio(referenceSummary.meanSize, inkSummary.meanSize) + ratio(referenceSummary.meanOpacity, inkSummary.meanOpacity) + ratio(referenceSummary.meanFlow, inkSummary.meanFlow) + ratio(referenceSummary.meanSpacing, inkSummary.meanSpacing) + ratio(referenceSummary.meanRotation, inkSummary.meanRotation) + Number(referenceSummary.brushDependencies.every(value => inkSummary.brushDependencies.includes(value)))) / 6,
      replayConsistency: referenceSummary.replayHash && inkSummary.replayHash ? Number(referenceSummary.replayHash === inkSummary.replayHash) : numeric(metadata.replayConsistency ?? 0),
      compositeSimilarity: numeric(inkSummary.compositeSimilarity ?? metadata.compositeSimilarity ?? 0)
    };
    metrics.strokeRetention = metrics.strokePreservation;
  } else {
    referenceSummary = vectorSummary(reference); inkSummary = vectorSummary(ink);
    const bboxScale = Math.max(1, referenceSummary.bbox.w, referenceSummary.bbox.h), bboxDeviation = (distance(referenceSummary.bbox, inkSummary.bbox) + Math.abs(referenceSummary.bbox.w - inkSummary.bbox.w) + Math.abs(referenceSummary.bbox.h - inkSummary.bbox.h)) / (3 * bboxScale);
    metrics = {
      pathPreservation: ratio(referenceSummary.pathCount, inkSummary.pathCount),
      topologyPreservation: (ratio(referenceSummary.closedSubpaths, inkSummary.closedSubpaths) + ratio(referenceSummary.holes, inkSummary.holes) + ratio(referenceSummary.bezierHandles, inkSummary.bezierHandles)) / 3,
      geometrySimilarity: clamp01(1 - bboxDeviation), anchorInflation: referenceSummary.anchorCount ? inkSummary.anchorCount / referenceSummary.anchorCount : inkSummary.anchorCount ? Infinity : 1,
      gradientPreservation: ratio(referenceSummary.gradientCount, inkSummary.gradientCount), groupPreservation: ratio(referenceSummary.groupCount, inkSummary.groupCount),
      idPreservation: ratio(referenceSummary.objectIds.filter(id => inkSummary.objectIds.includes(id)).length, referenceSummary.objectIds.length),
      svgRoundtripStability: numeric(metadata.svgRoundtripStability ?? inkSummary.svgRoundtripStability ?? 0)
    };
  }
  const decision = thresholdDecision(resolvedKind, metrics, gate, metadata);
  const values = Object.entries(metrics).filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value <= 1).map(([, value]) => value);
  const retention = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return {
    format: 'INK-DIFFERENCE-REPORT', schemaVersion: 3,
    id: `difference_${deterministicHash({ referenceSummary, inkSummary, metadata, gate })}`,
    kind: resolvedKind, metadata, thresholds: gate, reference: referenceSummary, ink: inkSummary, metrics,
    structure: { retention }, visual: { measured: resolvedKind !== 'vector', decision }, decision,
    claim: decision, warning: decision === 'EQUIVALENT' ? null : '不得將近似或缺乏原軟體證據的結果標示為等價'
  };
}
