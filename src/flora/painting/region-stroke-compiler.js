import { Matrix } from '../../core/index.js';
import { artboardTrimBounds } from '../../document/artboard.js';
import { maskAlphaAt, normalizedPointToWorld, vectorPathBounds, vectorPathContains, vectorPathEdgeDistance } from '../mask/vector-mask.js';
import { REGION_BLEND_MODES, REGION_DIRECTIONS, operationDefaults } from './region-paint-operations.js';

const regionClamp = (value, min, max) => Math.max(min, Math.min(max, value));
const regionMix = (a, b, t) => a + (b - a) * t;
const regionSmoothstep = value => { const t = regionClamp(value, 0, 1); return t * t * (3 - 2 * t); };
const regionHashString = text => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, '0');
};
const regionPrng = seed => {
  let state = seed >>> 0;
  return () => {
    state |= 0; state = state + 0x6D2B79F5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
};
const regionNormalizeVector = vector => {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
};

function centroid(region) {
  const first = region.path[0];
  if (Number.isFinite(first.cx)) return { x: first.cx, y: first.cy };
  const total = region.path.reduce((out, point) => ({ x: out.x + point.x, y: out.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / region.path.length, y: total.y / region.path.length };
}

function growthAxis(region) {
  if (region.growthAxis?.base && region.growthAxis?.tip) return { base: { ...region.growthAxis.base }, tip: { ...region.growthAxis.tip } };
  const bounds = vectorPathBounds(region.path), centerX = bounds.x + bounds.w / 2;
  return { base: { x: centerX, y: bounds.y + bounds.h }, tip: { x: centerX, y: bounds.y } };
}

function axisMetrics(region, point) {
  const axis = growthAxis(region), vector = { x: axis.tip.x - axis.base.x, y: axis.tip.y - axis.base.y };
  const length = Math.hypot(vector.x, vector.y) || 1, unit = { x: vector.x / length, y: vector.y / length };
  const relative = { x: point.x - axis.base.x, y: point.y - axis.base.y };
  const t = regionClamp((relative.x * unit.x + relative.y * unit.y) / length, 0, 1);
  const lateral = Math.abs(relative.x * (-unit.y) + relative.y * unit.x);
  const signedLateral = relative.x * (-unit.y) + relative.y * unit.x;
  return { t, lateral, signedLateral, unit, length };
}

function nearestContourTangent(path, point) {
  const first = path[0];
  if (Number.isFinite(first.cx)) {
    const nx = (point.x - first.cx) / Math.max(first.rx, Number.EPSILON);
    const ny = (point.y - first.cy) / Math.max(first.ry, Number.EPSILON);
    return regionNormalizeVector({ x: -ny * first.rx, y: nx * first.ry });
  }
  let best = null;
  for (let index = 0; index < path.length; index += 1) {
    const a = path[index], b = path[(index + 1) % path.length], dx = b.x - a.x, dy = b.y - a.y;
    const length2 = dx * dx + dy * dy || 1;
    const t = regionClamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length2, 0, 1);
    const projected = { x: a.x + dx * t, y: a.y + dy * t }, distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (!best || distance < best.distance) best = { distance, tangent: regionNormalizeVector({ x: dx, y: dy }) };
  }
  return best?.tangent || { x: 1, y: 0 };
}

function directionVector(direction, region, point, random) {
  const axis = growthAxis(region), center = centroid(region);
  if (direction === 'base-to-tip') return regionNormalizeVector({ x: axis.tip.x - axis.base.x, y: axis.tip.y - axis.base.y });
  if (direction === 'tip-to-base') return regionNormalizeVector({ x: axis.base.x - axis.tip.x, y: axis.base.y - axis.tip.y });
  if (direction === 'radial-out') {
    const vector = { x: point.x - center.x, y: point.y - center.y };
    if (Math.hypot(vector.x, vector.y) < .0001) { const angle = random() * Math.PI * 2; return { x: Math.cos(angle), y: Math.sin(angle) }; }
    return regionNormalizeVector(vector);
  }
  return nearestContourTangent(region.path, point);
}

function rasterMaskAlphaAt(rasterMask, x, y) {
  if (!rasterMask?.alpha || !rasterMask.width || !rasterMask.height) return null;
  const px = regionClamp(Math.floor(x * rasterMask.width), 0, rasterMask.width - 1);
  const py = regionClamp(Math.floor(y * rasterMask.height), 0, rasterMask.height - 1);
  return rasterMask.alpha[py * rasterMask.width + px] / 255;
}

function regionMaskAlpha(mask, rasterMask, x, y) {
  const cached = rasterMaskAlphaAt(rasterMask, x, y);
  const exact = maskAlphaAt(mask, x, y);
  return cached === null ? exact : Math.min(cached, exact);
}

function regionPointSegmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy || 1;
  const t = regionClamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length2, 0, 1);
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function regionMaskBoundaryDistance(region, mask, point) {
  let distance = vectorPathEdgeDistance(region.path, point);
  for (const path of mask?.excludePaths || []) distance = Math.min(distance, vectorPathEdgeDistance(path, point));
  return distance;
}

function overlapDistance(region, point, frontId = null) {
  const overlap = region.overlaps?.find(item => item.frontRegionId === frontId);
  if (!overlap?.seam || overlap.seam.length < 2) return Infinity;
  let distance = Infinity;
  for (let index = 0; index < overlap.seam.length - 1; index += 1) distance = Math.min(distance, regionPointSegmentDistance(point, overlap.seam[index], overlap.seam[index + 1]));
  return distance;
}

function operationAccept(operation, region, mask, point, edgeDistance, constraints = {}, refinement = null) {
  const bounds = vectorPathBounds(region.path), scale = Math.max(.01, Math.min(bounds.w, bounds.h));
  const metrics = axisMetrics(region, point), band = constraints.bandWidth ?? scale * .20;
  if (operation === 'Root Shadow') return metrics.t <= .38;
  if (operation === 'Fold Shadow') {
    const side = constraints.foldSide || 'center';
    const sideOk = side === 'center' ? Math.abs(metrics.signedLateral) <= band : side === 'left' ? metrics.signedLateral < 0 : metrics.signedLateral > 0;
    return sideOk && metrics.t >= .12 && metrics.t <= .90 && metrics.lateral <= band * 1.55;
  }
  if (operation === 'Central Light') return metrics.t >= .10 && metrics.t <= .94 && metrics.lateral <= band * .82;
  if (operation === 'Edge Light') {
    if (constraints.subjectSeparation && mask?.excludePaths?.length) {
      const subjectDistance = Math.min(...mask.excludePaths.map(path => vectorPathEdgeDistance(path, point)));
      return subjectDistance <= (constraints.bandWidth ?? band) && subjectDistance >= .001;
    }
    return edgeDistance <= band * .62;
  }
  if (operation === 'Boundary Dissolve') return edgeDistance <= band * .84;
  if (operation === 'Overlap Shadow') {
    const distance = overlapDistance(region, point, constraints.frontRegionId);
    const width = constraints.bandWidth ?? refinement?.overlapShadowFalloff?.width ?? band;
    return distance <= width;
  }
  return true;
}

function densityFalloff(refinement, region, point, edgeDistance) {
  if (!refinement) return 1;
  const metrics = axisMetrics(region, point), bounds = vectorPathBounds(region.path), scale = Math.max(.01, Math.min(bounds.w, bounds.h));
  const axis = regionMix(refinement.strokeDensityFalloff.root, refinement.strokeDensityFalloff.tip, metrics.t);
  const edgeT = regionSmoothstep(edgeDistance / Math.max(.002, scale * .24));
  return regionClamp(axis * regionMix(refinement.strokeDensityFalloff.edge, 1, edgeT), .02, 1);
}

function samplePoint(region, mask, rasterMask, bounds, random, options, operation, constraints, refinement) {
  for (let attempt = 0; attempt < 620; attempt += 1) {
    const point = { x: bounds.x + bounds.w * random(), y: bounds.y + bounds.h * random() };
    if (!vectorPathContains(region.path, point)) continue;
    const distance = regionMaskBoundaryDistance(region, mask, point);
    if (options.edgeAvoidance > 0 && distance < options.edgeAvoidance) continue;
    const alpha = regionMaskAlpha(mask, rasterMask, point.x, point.y);
    if (alpha <= 0) continue;
    if (!operationAccept(operation, region, mask, point, distance, constraints, refinement)) continue;
    if (random() > options.coverage * densityFalloff(refinement, region, point, distance)) continue;
    if (!['Boundary Dissolve', 'Central Light', 'Edge Light'].includes(operation) && random() > Math.max(.14, alpha)) continue;
    return { point, alpha, distance, metrics: axisMetrics(region, point) };
  }
  return null;
}

function operationPointCount(operation, refinement) {
  if (!refinement) {
    if (operation === 'Base Wash') return 9;
    if (operation === 'Transparent Glaze') return 8;
    if (operation === 'Directional Brushwork') return 7;
    if (['Root Shadow', 'Fold Shadow', 'Central Light', 'Edge Light', 'Overlap Shadow'].includes(operation)) return 6;
    return 5;
  }
  const smoothing = refinement.regionInteriorSmoothing;
  const base = operation === 'Base Wash' ? 17 : operation === 'Transparent Glaze' ? 15 : operation === 'Directional Brushwork' ? 13 : ['Root Shadow', 'Fold Shadow', 'Central Light', 'Edge Light', 'Overlap Shadow'].includes(operation) ? 12 : 10;
  return Math.round(base + smoothing * 5);
}

function refinedDirection(vector, contour, strength) {
  let tangent = contour;
  if (vector.x * tangent.x + vector.y * tangent.y < 0) tangent = { x: -tangent.x, y: -tangent.y };
  return regionNormalizeVector({ x: regionMix(vector.x, tangent.x, strength), y: regionMix(vector.y, tangent.y, strength) });
}

function normalizedStrokePoints(region, mask, rasterMask, origin, vectorInput, length, random, jitter, operation, refinement) {
  const count = operationPointCount(operation, refinement), points = [];
  const contour = nearestContourTangent(region.path, origin);
  const curvatureStrength = refinement?.curvatureFollowing?.strength ?? 0;
  const bend = refinement?.curvatureFollowing?.bend ?? 0;
  const blend = operation === 'Directional Brushwork' ? curvatureStrength * .28 : operation === 'Base Wash' ? curvatureStrength * .18 : curvatureStrength * .12;
  const vector = refinedDirection(vectorInput, contour, blend);
  const normal = { x: -vector.y, y: vector.x };
  const startBias = ['Directional Brushwork', 'Transparent Glaze'].includes(operation) ? .50 : operation === 'Base Wash' ? .46 : .5;
  const phase = random() * Math.PI * 2, frequency = .72 + random() * .78;
  const coherentAmplitude = jitter * length * (.08 + (refinement?.deterministicVariation ?? 1) * .14);
  const curveAmplitude = bend * length * .12;
  for (let index = 0; index < count; index += 1) {
    const t = index / Math.max(1, count - 1), along = (t - startBias) * length;
    const envelope = Math.sin(Math.PI * t);
    const coherentWave = Math.sin(phase + frequency * Math.PI * (t - .5)) * coherentAmplitude * envelope;
    const curvature = Math.sin(Math.PI * t) * (t - .5) * curveAmplitude * 2;
    const point = {
      x: origin.x + vector.x * along + normal.x * (coherentWave + curvature),
      y: origin.y + vector.y * along + normal.y * (coherentWave + curvature)
    };
    if (!vectorPathContains(region.path, point)) continue;
    const alpha = regionMaskAlpha(mask, rasterMask, point.x, point.y);
    if (alpha <= 0) continue;
    const pressureNoise = refinement ? (random() - .5) * .025 : (random() - .5) * .08;
    const pressure = regionClamp(.38 + .50 * Math.sin(Math.PI * t) + pressureNoise, .08, 1);
    points.push({ ...point, alpha, p: pressure, edgeDistance: regionMaskBoundaryDistance(region, mask, point) });
  }
  return points.length >= 2 ? points : [];
}

function operationLength(operation, regionScale, refinement = null) {
  if (operation === 'Base Wash') return regionScale * (refinement ? .30 : .86);
  if (operation === 'Transparent Glaze') return regionScale * (refinement ? .46 : .72);
  if (operation === 'Directional Brushwork') return regionScale * .64;
  if (['Root Shadow', 'Fold Shadow', 'Central Light'].includes(operation)) return regionScale * .55;
  if (['Edge Light', 'Overlap Shadow'].includes(operation)) return regionScale * .40;
  return regionScale * .36;
}

function lengthScale(refinement, random) {
  if (!refinement) return .72 + random() * .56;
  const range = refinement.strokeLengthVariation;
  const split = range.minScale + (range.maxScale - range.minScale) * .58;
  return random() < range.shortMix ? regionMix(range.minScale, split, random()) : regionMix(split, range.maxScale, random());
}

function hexToRgb(hex) {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}
function rgbToHex(rgb) {
  return `#${[rgb.r, rgb.g, rgb.b].map(value => Math.round(regionClamp(value, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}
function mixHex(a, b, t) {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  return rgbToHex({ r: regionMix(ca.r, cb.r, t), g: regionMix(ca.g, cb.g, t), b: regionMix(ca.b, cb.b, t) });
}
function shiftWarmCool(hex, amount = 0) {
  const rgb = hexToRgb(hex), shift = regionClamp(amount, -.5, .5) * 34;
  return rgbToHex({ r: rgb.r + shift, g: rgb.g + shift * .18, b: rgb.b - shift * .88 });
}
function fieldPosition(refinement, region, point, edgeDistance) {
  if (!refinement) return .5;
  const field = refinement.colorFieldInterpolation, metrics = axisMetrics(region, point), bounds = vectorPathBounds(region.path);
  let value = metrics.t;
  if (field.mode === 'radial') {
    const center = centroid(region), radius = Math.max(bounds.w, bounds.h) * .5 || 1;
    value = regionClamp(Math.hypot(point.x - center.x, point.y - center.y) / radius, 0, 1);
  } else if (field.mode === 'contour') value = 1 - regionClamp(edgeDistance / Math.max(.002, Math.min(bounds.w, bounds.h) * .28), 0, 1);
  value = regionMix(.5, value, field.strength) + field.bias * .25;
  const multi = refinement.multiBandColorField;
  if (multi) {
    const phase = multi.phase * Math.PI * 2;
    const ridge = Math.sin((metrics.t * multi.bands + multi.phase) * Math.PI * 2);
    const ridgeLift = Math.max(0, ridge) * multi.ridgeAmplitude;
    const valleyDrop = Math.max(0, -ridge) * multi.valleyAmplitude;
    const lateralScale = Math.max(.001, Math.min(bounds.w, bounds.h) * .46);
    const lateral = regionClamp(metrics.signedLateral / lateralScale, -1, 1);
    value += ridgeLift - valleyDrop + lateral * multi.lateralInfluence * .34 + Math.sin(phase + metrics.t * Math.PI) * .018;
  }
  if (region.kind === 'background-region' && refinement.backgroundLowFrequencyField) {
    const low = refinement.backgroundLowFrequencyField;
    value += low.amplitude * .22 * Math.sin((point.x * low.scale + point.y * (low.scale * .73 + low.diagonalBias * .18) + low.phase) * Math.PI * 2);
  }
  return regionClamp(value, 0, 1);
}
function fieldColor(action, refinement, region, point, edgeDistance) {
  const palette = Array.isArray(action.payload.palette) && action.payload.palette.length ? action.payload.palette : [action.payload.color];
  if (!refinement) return action.payload.color;
  if (palette.length === 1) return retainPigmentColor(palette[0], refinement);
  const position = fieldPosition(refinement, region, point, edgeDistance);
  const value = position * (palette.length - 1), index = Math.min(palette.length - 2, Math.floor(value)), t = value - index;
  let color = mixHex(palette[index], palette[index + 1], t);
  const warmCool = refinement.localWarmCoolShift;
  if (warmCool) {
    const metrics = axisMetrics(region, point), bounds = vectorPathBounds(region.path), lateralScale = Math.max(.001, Math.min(bounds.w, bounds.h) * .46);
    const lateral = regionClamp(metrics.signedLateral / lateralScale, -1, 1);
    const axisShift = regionMix(warmCool.root, warmCool.tip, metrics.t);
    const sideShift = lateral < 0 ? warmCool.left * -lateral : warmCool.right * lateral;
    color = shiftWarmCool(color, axisShift + sideShift);
  }
  return retainPigmentColor(color, refinement);
}

function retainPigmentColor(hex, refinement) {
  const mass = refinement?.pigmentMass;
  if (!mass) return hex;
  const rgb = hexToRgb(hex);
  const value = Math.max(rgb.r, rgb.g, rgb.b) / 255;
  const minimum = Math.min(rgb.r, rgb.g, rgb.b) / 255;
  const chroma = Math.max(0, value - minimum);
  const gray = (rgb.r * .299 + rgb.g * .587 + rgb.b * .114);
  const saturationGain = regionClamp(.76 + mass.saturationRetention * .34 + mass.localColorDensity * .10, .78, 1.22);
  let r = gray + (rgb.r - gray) * saturationGain;
  let g = gray + (rgb.g - gray) * saturationGain;
  let b = gray + (rgb.b - gray) * saturationGain;
  const currentValue = Math.max(r, g, b) / 255;
  const targetValue = regionClamp(value * (.84 + mass.valueRetention * .18) + chroma * .025, 0, 1);
  const valueScale = currentValue > 1e-5 ? targetValue / currentValue : 1;
  r *= valueScale; g *= valueScale; b *= valueScale;
  return rgbToHex({ r, g, b });
}

function inferFrequencyLayer(operation, index = '') {
  const label = String(index || '').toLowerCase();
  if (operation === 'Directional Brushwork' || operation === 'Edge Light' || operation === 'Boundary Dissolve') return 'mid';
  if (/brush|track|ridge|ray|edge|detail|accent/.test(label)) return 'mid';
  return 'low';
}

function pigmentOpacity(refinement, rawOpacity, operation, frequencyLayer = 'low', regionKind = '') {
  const mass = refinement?.pigmentMass;
  const frequency = refinement?.frequencyLayers;
  if (!mass || !frequency) return regionClamp(rawOpacity, 0, 1);
  const layerGain = frequencyLayer === 'mid' ? frequency.mid : frequency.low;
  let gain = (.70 + mass.pigmentLoad * .36) * (.72 + mass.depositRate * .30) * (.72 + mass.localColorDensity * .25);
  if (operation === 'Transparent Glaze') gain *= .72 + mass.glazeAccumulation * .42 + mass.wetOverDryResponse * .12;
  if (operation === 'Central Light' || operation === 'Edge Light') gain *= .82 + mass.valueRetention * .20;
  if (operation === 'Directional Brushwork') gain *= .78 + mass.strokeBodyCoverage * .24;
  if (regionKind === 'background-region') gain *= .78;
  const operationFloor = operation === 'Base Wash' ? 1 : operation === 'Transparent Glaze' ? .58 : operation === 'Directional Brushwork' ? .46 : .68;
  const frequencyFloor = frequencyLayer === 'mid' ? .40 : 1;
  const floor = mass.opacityFloor * operationFloor * frequencyFloor * Math.max(.18, layerGain);
  const ceiling = mass.opacityCeiling * (frequencyLayer === 'mid' ? .72 : 1);
  return regionClamp(Math.max(rawOpacity * gain * Math.max(.12, layerGain), floor), 0, ceiling);
}

function opacityFactor(refinement, region, point, edgeDistance, operation, constraints) {
  if (!refinement) return 1;
  const metrics = axisMetrics(region, point), bounds = vectorPathBounds(region.path), scale = Math.max(.01, Math.min(bounds.w, bounds.h));
  const edgeT = regionSmoothstep(edgeDistance / Math.max(.002, scale * .24));
  const axis = regionMix(refinement.opacityFalloff.root, refinement.opacityFalloff.tip, metrics.t);
  let factor = axis * regionMix(refinement.opacityFalloff.edge, 1, edgeT);
  const edgeTranslucency = refinement.edgeTranslucency;
  if (edgeTranslucency) {
    const lateralScale = Math.max(.001, scale * .48), lateral = regionClamp(metrics.signedLateral / lateralScale, -1, 1);
    const side = lateral < 0 ? edgeTranslucency.left : edgeTranslucency.right;
    const tip = regionMix(1, edgeTranslucency.tip, regionSmoothstep((metrics.t - .68) / .32));
    factor *= regionMix(side, 1, edgeT) * tip;
  }
  if (operation === 'Transparent Glaze') {
    const g = refinement.localGlazeAccumulation;
    factor *= metrics.t < .5 ? regionMix(g.root, g.mid, metrics.t * 2) : regionMix(g.mid, g.tip, (metrics.t - .5) * 2);
    const map = refinement.glazeAccumulationMap;
    if (map) {
      const lateralScale = Math.max(.001, scale * .48), lateral = regionClamp(metrics.signedLateral / lateralScale, -1, 1);
      const mid = lateral < 0 ? map.midLeft : map.midRight;
      const mapped = metrics.t < .5 ? regionMix(map.root, mid, metrics.t * 2) : regionMix(mid, map.tip, (metrics.t - .5) * 2);
      factor *= mapped;
    }
  }
  if (operation === 'Overlap Shadow') {
    const o = refinement.overlapShadowFalloff, distance = overlapDistance(region, point, constraints.frontRegionId);
    const normalized = distance / Math.max(.002, o.width);
    const falloff = 1 - regionSmoothstep(normalized * regionMix(1.7, .82, o.softness));
    factor *= regionClamp(falloff * o.intensity, .05, 2);
  }
  return regionClamp(factor, .015, 2);
}

function protectedWidth(width, normalizedPoints, trim, refinement) {
  if (!refinement || refinement.silhouetteProtection <= 0) return width;
  const minimumDimension = Math.min(trim.w, trim.h), loosen = regionMix(1.04, .76, refinement.silhouetteProtection);
  const safeWidth = Math.min(...normalizedPoints.map(point => {
    const distance = point.edgeDistance ?? Infinity, pressure = Math.max(.035, point.p ?? .5);
    return distance * minimumDimension * 2 * loosen / pressure;
  }));
  if (!Number.isFinite(safeWidth)) return width;
  return Math.min(width, Math.max(.5, safeWidth));
}

function strokeSurfaceProperties(brushPreset, refinement, region = null, origin = null) {
  if (!refinement) return {
    smoothing: brushPreset.smoothing ?? .5, grain: brushPreset.grain ?? 0, softness: brushPreset.softness ?? .7,
    flow: brushPreset.flow ?? 1, wetness: brushPreset.wetness ?? 0, bristle: brushPreset.bristle ?? 0
  };
  let suppression = refinement.textureSuppression, smoothing = refinement.regionInteriorSmoothing;
  const nonuniform = refinement.nonuniformTextureSuppression;
  if (nonuniform && region && origin) {
    const metrics = axisMetrics(region, origin), bounds = vectorPathBounds(region.path), scale = Math.max(.01, Math.min(bounds.w, bounds.h));
    const edgeDistance = vectorPathEdgeDistance(region.path, origin), edgeT = regionSmoothstep(edgeDistance / Math.max(.002, scale * .24));
    const axisSuppression = regionMix(nonuniform.interior, nonuniform.tip, metrics.t);
    suppression = regionClamp(regionMix(nonuniform.edge, axisSuppression, edgeT), 0, 1);
  }
  const high = refinement.frequencyLayers?.high ?? .12;
  const mass = refinement.pigmentMass || {};
  return {
    smoothing: regionMix(brushPreset.smoothing ?? .5, .955, smoothing * .78),
    grain: Math.min(.028, (brushPreset.grain ?? 0) * (1 - suppression) * (.16 + high * .42)),
    softness: regionMix(brushPreset.softness ?? .7, .965, smoothing * .44),
    flow: regionClamp(regionMix(brushPreset.flow ?? 1, .94, smoothing * .12) * (.88 + (mass.depositRate ?? .7) * .16), .08, 1),
    wetness: regionMix(brushPreset.wetness ?? 0, .20, (mass.wetOverDryResponse ?? .4) * .40),
    bristle: Math.min(.075, (brushPreset.bristle ?? 0) * (1 - suppression * .94) * (.42 + (refinement.frequencyLayers?.mid ?? .7) * .58))
  };
}

function makeStroke({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement, index, normalizedPoints, origin, color, width, opacity, frequencyLayer = null, baseMassStrategy = null, baseMassLayer = null }) {
  const recoveryPreset = brushPreset;
  const trim = artboardTrimBounds(page), worldPoints = normalizedPoints.map((point, pointIndex) => {
    const world = normalizedPointToWorld(page, point);
    return { x: world.x, y: world.y, p: point.p, t: pointIndex * 16 };
  });
  const first = worldPoints[0], surface = strokeSurfaceProperties(recoveryPreset, refinement, region, origin);
  const resolvedFrequencyLayer = frequencyLayer || inferFrequencyLayer(action.payload.operation, index);
  const resolvedOpacity = pigmentOpacity(refinement, opacity, action.payload.operation, resolvedFrequencyLayer, region.kind);
  return {
    id: `${action.payload.objectPrefix || 'flora-region-stroke'}-${regionHashString(`${action.actionId}:${action.seed}:${index}`)}`,
    type: 'stroke', name: `${action.payload.operation} ${typeof index === 'number' ? index + 1 : index}`,
    matrix: Matrix.translate(first.x, first.y), opacity: resolvedOpacity, color, size: width,
    kind: recoveryPreset.kind, smoothing: surface.smoothing, pressure: recoveryPreset.pressure ?? .8,
    taper: recoveryPreset.taper ?? 0, grain: surface.grain, softness: surface.softness,
    flow: surface.flow, wetness: surface.wetness, bristle: surface.bristle,
    blendMode: options.blendMode,
    mediaModel: ['brush', 'drybrush', 'airbrush'].includes(recoveryPreset.kind) ? 'natural-v2' : undefined,
    points: worldPoints.map(point => ({ x: point.x - first.x, y: point.y - first.y, p: point.p, t: point.t, tiltX: 0, tiltY: 0, mode: refinement?.regionInteriorSmoothing > .5 ? 'smooth' : 'corner' })),
    flora: { actionId: action.actionId, seed: action.seed },
    floraPaint: {
      schemaVersion: refinement ? '0.4' : '0.2', actionId: action.actionId, seed: action.seed, index,
      regionId: region.regionId, regionZ: Number.isFinite(region.z) ? region.z : 0, maskId: mask.maskId, maskRevision: mask.cacheRevision || 0,
      operation: action.payload.operation, direction: options.direction, compilerVersion: baseMassStrategy === 'non-periodic-full-body' ? '0.7-nonperiodic-fill' : refinement?.schemaVersion === '0.3' ? '0.6-painted-retention' : refinement?.schemaVersion === '0.2' ? '0.4-visual-recovery' : refinement ? '0.3-refined' : '0.2', spacing: options.spacing,
      frequencyLayer: resolvedFrequencyLayer, painterlyMassVersion: refinement?.schemaVersion === '0.3' ? 'WP8B-1' : null,
      ...(baseMassStrategy ? { baseMassStrategy, baseMassLayer } : {}),
      normalizedOrigin: origin, edgeDistance: regionMaskBoundaryDistance(region, mask, origin),
      alphaMean: normalizedPoints.reduce((sum, point) => sum + point.alpha, 0) / normalizedPoints.length,
      blendMode: options.blendMode, recipeId: action.payload.recipeId || action.metadata?.recipeId || null,
      recipeOperation: action.payload.recipeOperation || action.payload.operation,
      recipePass: action.payload.recipePass ?? action.metadata?.recipePass ?? null, paletteIndex: action.payload.paletteIndex ?? null,
      constraints: structuredClone(constraints), ...(refinement ? { refinement: structuredClone(refinement) } : {}),
      artboard: { width: trim.w, height: trim.h },
      rasterMask: rasterMask ? { width: rasterMask.width, height: rasterMask.height, alphaHash: rasterMask.alphaHash } : null
    }
  };
}


function crossSectionAt(region, t) {
  const axis = growthAxis(region), vx = axis.tip.x - axis.base.x, vy = axis.tip.y - axis.base.y;
  const length = Math.hypot(vx, vy) || 1, ux = vx / length, uy = vy / length, nx = -uy, ny = ux;
  const distance = length * t, target = { x: axis.base.x + ux * distance, y: axis.base.y + uy * distance };
  const intersections = [], path = region.path || [];
  if (!Array.isArray(path) || path.length < 3 || Number.isFinite(path[0]?.cx)) return null;
  for (let index = 0; index < path.length; index += 1) {
    const a = path[index], b = path[(index + 1) % path.length];
    const da = (a.x - axis.base.x) * ux + (a.y - axis.base.y) * uy;
    const db = (b.x - axis.base.x) * ux + (b.y - axis.base.y) * uy;
    const denominator = db - da;
    if (Math.abs(denominator) < 1e-9 || distance < Math.min(da, db) - 1e-7 || distance > Math.max(da, db) + 1e-7) continue;
    const u = regionClamp((distance - da) / denominator, 0, 1), x = regionMix(a.x, b.x, u), y = regionMix(a.y, b.y, u);
    intersections.push((x - target.x) * nx + (y - target.y) * ny);
  }
  if (intersections.length < 2) return null;
  intersections.sort((a, b) => a - b);
  const low = intersections[0], high = intersections.at(-1), lateral = (low + high) / 2;
  return { center: { x: target.x + nx * lateral, y: target.y + ny * lateral }, halfWidth: Math.max(0, (high - low) / 2), axis: { x: ux, y: uy } };
}

function regionSectionSeries(region, startT = .006, endT = .994, count = 56) {
  const sections = [];
  for (let index = 0; index < count; index += 1) {
    const t = regionMix(startT, endT, index / Math.max(1, count - 1));
    const section = crossSectionAt(region, t);
    if (!section || section.halfWidth <= .0006 || !vectorPathContains(region.path, section.center)) continue;
    const normal = { x: -section.axis.y, y: section.axis.x };
    sections.push({ ...section, normal, t });
  }
  return sections;
}

function regionMaxHalfWidth(sections) {
  return Math.max(.0008, ...sections.map(section => section.halfWidth));
}

function regionStructuredPoints({ sections, mask, rasterMask, lateral = 0, pressureScale = 1, pressureFloor = .08 }) {
  const maxHalfWidth = regionMaxHalfWidth(sections);
  return sections.map((section, index) => {
    const lateralEnvelope = Math.sin(Math.PI * regionClamp((section.t - sections[0].t) / Math.max(.0001, sections.at(-1).t - sections[0].t), 0, 1));
    const offset = lateral * section.halfWidth * regionMix(.70, 1, lateralEnvelope);
    const point = { x: section.center.x + section.normal.x * offset, y: section.center.y + section.normal.y * offset };
    if (!vectorPathContains(section.regionPath || [], point) && !vectorPathContains(mask.path, point)) return null;
    const alpha = regionMaskAlpha(mask, rasterMask, point.x, point.y);
    if (alpha <= 0) return null;
    const widthRatio = section.halfWidth / maxHalfWidth;
    return {
      ...point,
      alpha,
      edgeDistance: regionMaskBoundaryDistance({ path: mask.path }, mask, point),
      p: regionClamp(pressureFloor + widthRatio * pressureScale, .05, 1),
      t: index
    };
  }).filter(Boolean);
}

function regionStructuredStroke({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement, index, sections, lateral = 0, widthScale = 1, opacityScale = 1, palettePosition = .5, startT = null, endT = null, pressureScale = .90, pressureFloor = .06, kind = null, softness = null, frequencyLayer = null }) {
  const selected = sections.filter(section => (startT === null || section.t >= startT) && (endT === null || section.t <= endT));
  if (selected.length < 2) return null;
  const maxHalfWidth = regionMaxHalfWidth(selected), trim = artboardTrimBounds(page);
  const normalizedPoints = regionStructuredPoints({ sections: selected.map(section => ({ ...section, regionPath: region.path })), mask, rasterMask, lateral, pressureScale, pressureFloor });
  if (normalizedPoints.length < 2) return null;
  const sample = selected[Math.floor(selected.length * regionClamp(palettePosition, 0, .999))];
  const samplePoint = { x: sample.center.x + sample.normal.x * lateral * sample.halfWidth, y: sample.center.y + sample.normal.y * lateral * sample.halfWidth };
  const edgeDistance = regionMaskBoundaryDistance(region, mask, samplePoint);
  const localWidth = maxHalfWidth * 2 * Math.min(trim.w, trim.h);
  const width = protectedWidth(regionClamp(localWidth * widthScale, .7, 120), normalizedPoints, trim, refinement);
  const opacity = regionClamp(regionMix(options.opacityRange[0], options.opacityRange[1], .66) * opacityScale * opacityFactor(refinement, region, samplePoint, edgeDistance, action.payload.operation, constraints), .008, .82);
  const palette = Array.isArray(action.payload.palette) && action.payload.palette.length ? action.payload.palette : [action.payload.color];
  const manualValue = regionClamp(palettePosition, 0, 1) * Math.max(0, palette.length - 1);
  const manualIndex = Math.min(Math.max(0, palette.length - 2), Math.floor(manualValue)), manualT = palette.length <= 1 ? 0 : manualValue - manualIndex;
  const manualColor = palette.length <= 1 ? palette[0] : mixHex(palette[manualIndex], palette[manualIndex + 1], manualT);
  const sampledColor = fieldColor(action, refinement, region, samplePoint, edgeDistance);
  const color = palette.length <= 1 ? sampledColor : mixHex(manualColor, sampledColor, .68);
  const preset = kind || softness !== null ? { ...brushPreset, ...(kind ? { kind } : {}), ...(softness !== null ? { softness } : {}) } : brushPreset;
  return makeStroke({ action, region, mask, rasterMask, page, brushPreset: preset, options, constraints, refinement, index, normalizedPoints, origin: normalizedPoints[0], color, width, opacity, frequencyLayer });
}

function regionSeamStroke({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement }) {
  const overlap = region.overlaps?.find(item => item.frontRegionId === constraints.frontRegionId);
  if (!overlap?.seam || overlap.seam.length < 2) return null;
  const normalizedPoints = overlap.seam.map((point, index) => {
    const alpha = regionMaskAlpha(mask, rasterMask, point.x, point.y);
    return { ...point, alpha, edgeDistance: regionMaskBoundaryDistance(region, mask, point), p: regionClamp(.52 + .26 * Math.sin(Math.PI * index / Math.max(1, overlap.seam.length - 1)), .18, .86) };
  }).filter(point => point.alpha > 0 && vectorPathContains(region.path, point));
  if (normalizedPoints.length < 2) return null;
  const trim = artboardTrimBounds(page), width = regionClamp((constraints.bandWidth ?? refinement?.overlapShadowFalloff?.width ?? .018) * Math.min(trim.w, trim.h) * 1.22, 2.5, 24);
  const midpoint = normalizedPoints[Math.floor(normalizedPoints.length / 2)], opacity = regionClamp(regionMix(options.opacityRange[0], options.opacityRange[1], .72) * .78, .018, .42);
  return makeStroke({ action, region, mask, rasterMask, page, brushPreset: { ...brushPreset, kind: 'airbrush', softness: .92 }, options, constraints, refinement, index: 'seam-field', normalizedPoints, origin: midpoint, color: fieldColor(action, refinement, region, midpoint, midpoint.edgeDistance), width, opacity });
}


function retentionConstraint(constraints = {}) {
  const value = constraints.coverageRetention;
  return value && typeof value === 'object' ? value : null;
}

function retentionPoint(mask, rasterMask, region, point, alphaFloor = 0) {
  if (!vectorPathContains(region.path, point)) return null;
  const alpha = regionMaskAlpha(mask, rasterMask, point.x, point.y);
  if (alpha <= 0 && !vectorPathContains(mask.path, point)) return null;
  return {
    ...point,
    alpha: Math.max(alphaFloor, alpha),
    edgeDistance: regionMaskBoundaryDistance(region, mask, point),
    p: .92
  };
}


function regionLowFrequencyValue(seed, t, channel = 0) {
  const phaseA = ((seed ^ Math.imul(channel + 3, 0x9E3779B1)) >>> 0) / 4294967296 * Math.PI * 2;
  const phaseB = ((seed ^ Math.imul(channel + 11, 0x85EBCA6B)) >>> 0) / 4294967296 * Math.PI * 2;
  const a = Math.sin(phaseA + t * Math.PI * 1.137);
  const b = Math.sin(phaseB + t * Math.PI * 2.413 + .37);
  return regionClamp(.5 + a * .27 + b * .13, 0, 1);
}

function regionNonPeriodicPath({ region, mask, rasterMask, sections, seed, lateralBias = 0, driftScale = .08, startT = .01, endT = .99 }) {
  const count = Math.max(18, sections.filter(section => section.t >= startT && section.t <= endT).length);
  const weights = Array.from({ length: count - 1 }, (_, index) => .78 + regionLowFrequencyValue(seed, index / Math.max(1, count - 2), 13) * .44);
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  let cumulative = 0;
  const values = [startT];
  for (const weight of weights) { cumulative += weight; values.push(regionMix(startT, endT, cumulative / total)); }
  return values.map((t, index) => {
    const section = crossSectionAt(region, t);
    if (!section || section.halfWidth <= .0006) return null;
    const normal = { x: -section.axis.y, y: section.axis.x };
    const lowA = regionLowFrequencyValue(seed, t, 1) - .5;
    const lowB = regionLowFrequencyValue(seed, t, 4) - .5;
    const envelope = Math.sin(Math.PI * regionClamp((t - startT) / Math.max(.001, endT - startT), 0, 1));
    const offset = section.halfWidth * (lateralBias + (lowA * .68 + lowB * .32) * driftScale * envelope);
    const candidate = { x: section.center.x + normal.x * offset, y: section.center.y + normal.y * offset };
    const point = retentionPoint(mask, rasterMask, region, candidate, 0);
    if (!point) return null;
    const density = regionLowFrequencyValue(seed, t, 7);
    return { ...point, p: regionClamp(.88 + density * .10, .84, .99), t: index };
  }).filter(Boolean);
}

function nonPeriodicBodyStroke({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement, sections, index, seed, lateralBias = 0, driftScale = .08, widthScale = 1, opacityScale = 1, palettePosition = .5, startT = .01, endT = .99, layer = 'continuous-body', kind = 'airbrush', softness = .95 }) {
  const points = regionNonPeriodicPath({ region, mask, rasterMask, sections, seed, lateralBias, driftScale, startT, endT });
  if (points.length < 2) return null;
  const trim = artboardTrimBounds(page), maxHalfWidth = regionMaxHalfWidth(sections);
  const width = regionClamp(maxHalfWidth * 2 * Math.min(trim.w, trim.h) * widthScale, 1.2, 120);
  const sample = points[Math.floor(points.length * regionClamp(palettePosition, 0, .999))];
  const color = fieldColor(action, refinement, region, sample, sample.edgeDistance);
  const retention = retentionConstraint(constraints) || {};
  const baseOpacity = regionMix(options.opacityRange[0], options.opacityRange[1], layer === 'continuous-body' ? .70 : .58);
  const layerFloor = layer === 'continuous-body' ? (retention.alphaFloor || 0) : .012;
  const opacity = regionClamp(Math.max(layerFloor, baseOpacity * (retention.visualWeight || 1) * opacityScale), .012, .78);
  const preset = { ...brushPreset, kind, softness, grain: 0, bristle: 0, wetness: layer === 'continuous-body' ? .10 : .08, flow: layer === 'continuous-body' ? .96 : .90, taper: 0 };
  return makeStroke({
    action, region, mask, rasterMask, page, brushPreset: preset, options, constraints, refinement,
    index, normalizedPoints: points, origin: sample, color, width, opacity, frequencyLayer: layer === 'sparse-directional-deposit' ? 'mid' : 'low',
    baseMassStrategy: 'non-periodic-full-body', baseMassLayer: layer
  });
}

function regionNonPeriodicFullBodyFillStrokes({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement }) {
  const retention = retentionConstraint(constraints);
  if (!retention || retention.mode !== 'non-periodic-full-body' || action.payload.operation !== 'Base Wash') return [];
  const sections = regionSectionSeries(region, .006, .994, region.kind === 'stem-region' ? 72 : region.kind === 'leaf-region' ? 84 : 76);
  if (sections.length < 4) return [];
  const seedBase = (action.seed ^ parseInt(regionHashString(`${region.regionId}:non-periodic-body`), 16)) >>> 0;
  const strokes = [];
  const mainWidth = region.kind === 'leaf-region' ? 1.34 : region.kind === 'stem-region' ? 1.16 : 1.24;
  const main = nonPeriodicBodyStroke({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement, sections,
    index: 'nonperiodic-body-field', seed: seedBase, lateralBias: 0, driftScale: region.kind === 'stem-region' ? .025 : .055,
    widthScale: mainWidth, opacityScale: region.kind === 'stem-region' ? .82 : 1.00, palettePosition: .46, layer: 'continuous-body', softness: region.kind === 'leaf-region' ? .91 : .94 });
  if (main) strokes.push(main);
  const fieldA = nonPeriodicBodyStroke({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement, sections,
    index: 'nonperiodic-low-field-a', seed: seedBase ^ 0xA341316C, lateralBias: -.16, driftScale: .12,
    widthScale: region.kind === 'stem-region' ? .72 : .82, opacityScale: .26, palettePosition: .22, startT: .025, endT: .96, layer: 'low-frequency-density', softness: .97 });
  const fieldB = nonPeriodicBodyStroke({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement, sections,
    index: 'nonperiodic-low-field-b', seed: seedBase ^ 0xC8013EA4, lateralBias: .19, driftScale: .10,
    widthScale: region.kind === 'stem-region' ? .60 : .72, opacityScale: .22, palettePosition: .78, startT: .06, endT: .92, layer: 'low-frequency-density', softness: .975 });
  if (fieldA) strokes.push(fieldA);
  if (fieldB) strokes.push(fieldB);
  const sparse = nonPeriodicBodyStroke({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement, sections,
    index: 'nonperiodic-sparse-deposit', seed: seedBase ^ 0xAD90777D, lateralBias: -.04, driftScale: .16,
    widthScale: region.kind === 'stem-region' ? .28 : .34, opacityScale: region.kind === 'stem-region' ? .045 : .12, palettePosition: .63,
    startT: .13 + regionLowFrequencyValue(seedBase, .23, 9) * .10, endT: .72 + regionLowFrequencyValue(seedBase, .67, 10) * .18,
    layer: 'sparse-directional-deposit', kind: 'brush', softness: .90 });
  if (sparse) strokes.push(sparse);
  return strokes;
}

function regionCenterNonPeriodicFullBodyFillStrokes({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement }) {
  const retention = retentionConstraint(constraints);
  if (!retention || retention.mode !== 'non-periodic-full-body' || action.payload.operation !== 'Base Wash') return [];
  const bounds = vectorPathBounds(region.path), center = centroid(region), trim = artboardTrimBounds(page);
  const seed = (action.seed ^ parseInt(regionHashString(`${region.regionId}:center-body`), 16)) >>> 0;
  const strokes = [];
  const makeSweep = ({ index, angle, offset = 0, widthScale = 1, opacityScale = 1, layer = 'continuous-body', bend = .08, palettePosition = .5 }) => {
    const direction = { x: Math.cos(angle), y: Math.sin(angle) }, normal = { x: -direction.y, y: direction.x };
    const extent = Math.max(bounds.w, bounds.h) * .58;
    const points = [];
    for (let i = 0; i < 31; i += 1) {
      const t = i / 30, along = (t - .5) * extent * 1.9;
      const drift = Math.sin(Math.PI * t) * (regionLowFrequencyValue(seed, t, i % 5) - .5) * extent * bend;
      const candidate = { x: center.x + direction.x * along + normal.x * (offset * extent + drift), y: center.y + direction.y * along + normal.y * (offset * extent + drift) };
      const point = retentionPoint(mask, rasterMask, region, candidate, 0);
      if (point) points.push({ ...point, p: .93 + .05 * regionLowFrequencyValue(seed, t, 6), t: i });
    }
    if (points.length < 2) return;
    const sample = points[Math.floor(points.length * regionClamp(palettePosition, 0, .999))];
    const diameter = Math.max(bounds.w * trim.w, bounds.h * trim.h);
    strokes.push(makeStroke({ action, region, mask, rasterMask, page,
      brushPreset: { ...brushPreset, kind: layer === 'sparse-directional-deposit' ? 'brush' : 'airbrush', softness: layer === 'continuous-body' ? .94 : .97, grain: 0, bristle: 0, wetness: .10, flow: .95, taper: 0 },
      options, constraints, refinement, index, normalizedPoints: points, origin: sample,
      color: fieldColor(action, refinement, region, sample, sample.edgeDistance), width: regionClamp(diameter * widthScale, 2, 120),
      opacity: regionClamp(Math.max(layer === 'continuous-body' ? (retention.alphaFloor || 0) : .012, regionMix(options.opacityRange[0], options.opacityRange[1], .70) * (retention.visualWeight || 1) * opacityScale), .012, .78),
      frequencyLayer: layer === 'sparse-directional-deposit' ? 'mid' : 'low', baseMassStrategy: 'non-periodic-full-body', baseMassLayer: layer }));
  };
  const phase = regionLowFrequencyValue(seed, .37, 2) * Math.PI * .42;
  makeSweep({ index: 'nonperiodic-center-body', angle: .32 + phase, widthScale: 1.16, opacityScale: 1, layer: 'continuous-body', bend: .10, palettePosition: .46 });
  makeSweep({ index: 'nonperiodic-center-low-a', angle: 1.84 + phase * .31, offset: -.08, widthScale: .76, opacityScale: .25, layer: 'low-frequency-density', bend: .14, palettePosition: .22 });
  makeSweep({ index: 'nonperiodic-center-low-b', angle: 2.63 - phase * .27, offset: .10, widthScale: .63, opacityScale: .20, layer: 'low-frequency-density', bend: .12, palettePosition: .79 });
  makeSweep({ index: 'nonperiodic-center-sparse', angle: .95 + phase * .18, offset: -.18, widthScale: .26, opacityScale: .10, layer: 'sparse-directional-deposit', bend: .18, palettePosition: .64 });
  return strokes;
}

function regionCrossSectionFillStrokes({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement }) {
  const retention = retentionConstraint(constraints);
  if (!retention || action.payload.operation !== 'Base Wash') return [];
  if (!['cross-section-fill', 'axis-body-fill'].includes(retention.mode)) return [];
  const count = regionClamp(Math.round(retention.fillSections), 4, 64);
  const sections = regionSectionSeries(region, .012, .988, count);
  if (sections.length < 3) return [];
  const trim = artboardTrimBounds(page), axis = growthAxis(region);
  const axisWorldLength = Math.hypot((axis.tip.x - axis.base.x) * trim.w, (axis.tip.y - axis.base.y) * trim.h);
  const sliceWidth = regionClamp(axisWorldLength / Math.max(2, sections.length - 1) * 1.62, 1.15, 28);
  const palette = Array.isArray(action.payload.palette) && action.payload.palette.length ? action.payload.palette : [action.payload.color];
  const strokes = [];
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index], t = section.t;
    const rootBoost = t <= .24 ? retention.rootCoverage / Math.max(.01, retention.bodyCoverage) : 1;
    const lateralScale = regionClamp((retention.bodyCoverage || .9) * (t > .94 ? .90 : 1), .60, 1);
    const points = [];
    for (let pointIndex = 0; pointIndex < 11; pointIndex += 1) {
      const u = -lateralScale + lateralScale * 2 * (pointIndex / 10);
      const candidate = {
        x: section.center.x + section.normal.x * section.halfWidth * u,
        y: section.center.y + section.normal.y * section.halfWidth * u
      };
      const point = retentionPoint(mask, rasterMask, region, candidate, retention.alphaFloor || 0);
      if (point) points.push({ ...point, p: regionClamp(.78 + .18 * Math.sin(Math.PI * pointIndex / 10), .45, 1) });
    }
    if (points.length < 2) continue;
    const palettePosition = regionClamp(.12 + t * .76, 0, 1), sample = points[Math.floor(points.length / 2)];
    const color = fieldColor(action, refinement, region, sample, sample.edgeDistance);
    const rawOpacity = regionMix(options.opacityRange[0], options.opacityRange[1], .70) * (retention.visualWeight || 1) * rootBoost;
    const preset = { ...brushPreset, kind: 'airbrush', softness: .90, grain: 0, bristle: 0, wetness: .08, flow: .96, taper: 0 };
    strokes.push(makeStroke({
      action, region, mask, rasterMask, page, brushPreset: preset, options, constraints, refinement,
      index: `retention-cross-fill-${String(index + 1).padStart(2, '0')}`, normalizedPoints: points, origin: sample,
      color: palette.length > 1 ? mixHex(palette[Math.min(palette.length - 1, Math.floor(palettePosition * palette.length))], color, .58) : color,
      width: sliceWidth * (t <= .24 ? 1.18 : 1), opacity: regionClamp(Math.max(retention.alphaFloor || 0, rawOpacity), .02, .78),
      frequencyLayer: 'low'
    }));
  }
  return strokes;
}

function regionCenterMassFillStrokes({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement }) {
  const retention = retentionConstraint(constraints);
  if (!retention || retention.mode !== 'center-mass-fill' || action.payload.operation !== 'Base Wash') return [];
  const count = regionClamp(Math.round(retention.fillSections), 6, 48), bounds = vectorPathBounds(region.path), trim = artboardTrimBounds(page);
  const sliceWidth = regionClamp(bounds.h * trim.h / Math.max(2, count - 1) * 1.72, 1.2, 18), strokes = [];
  for (let index = 0; index < count; index += 1) {
    const y = bounds.y + bounds.h * (.02 + .96 * index / Math.max(1, count - 1)), samples = [];
    for (let sampleIndex = 0; sampleIndex <= 80; sampleIndex += 1) {
      const x = bounds.x + bounds.w * sampleIndex / 80;
      if (vectorPathContains(region.path, { x, y })) samples.push(x);
    }
    if (samples.length < 2) continue;
    const left = Math.min(...samples), right = Math.max(...samples), points = [];
    for (let pointIndex = 0; pointIndex < 11; pointIndex += 1) {
      const point = retentionPoint(mask, rasterMask, region, { x: regionMix(left, right, pointIndex / 10), y }, retention.alphaFloor || 0);
      if (point) points.push({ ...point, p: regionClamp(.82 + .14 * Math.sin(Math.PI * pointIndex / 10), .5, 1) });
    }
    if (points.length < 2) continue;
    const sample = points[Math.floor(points.length / 2)], rawOpacity = regionMix(options.opacityRange[0], options.opacityRange[1], .74) * (retention.visualWeight || 1);
    strokes.push(makeStroke({
      action, region, mask, rasterMask, page,
      brushPreset: { ...brushPreset, kind: 'airbrush', softness: .88, grain: 0, bristle: 0, wetness: .10, flow: .97, taper: 0 },
      options, constraints, refinement, index: `retention-center-fill-${String(index + 1).padStart(2, '0')}`,
      normalizedPoints: points, origin: sample, color: fieldColor(action, refinement, region, sample, sample.edgeDistance),
      width: sliceWidth, opacity: regionClamp(Math.max(retention.alphaFloor || 0, rawOpacity), .025, .80), frequencyLayer: 'low'
    }));
  }
  return strokes;
}

function regionCenterStructuredStrokes({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement }) {
  const bounds = vectorPathBounds(region.path), center = centroid(region), trim = artboardTrimBounds(page);
  const diameter = Math.max(bounds.w, bounds.h) * Math.min(trim.w, trim.h), strokes = [];
  const random = regionPrng((action.seed ^ parseInt(regionHashString(region.regionId), 16) ^ 0xC3A7) >>> 0);
  const operation = action.payload.operation, radius = Math.min(bounds.w, bounds.h) * .48;
  strokes.push(...regionCenterNonPeriodicFullBodyFillStrokes({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement }));
  strokes.push(...regionCenterMassFillStrokes({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement }));
  const makeCenterStroke = ({ index, angle, inner = .02, outer = .42, lateral = 0, widthScale = .12, opacityScale = .3, kind = 'brush', softness = .92, palettePosition = .5, bend = .10 }) => {
    const tangent = { x: -Math.sin(angle), y: Math.cos(angle) };
    const points = Array.from({ length: 9 }, (_, pointIndex) => {
      const t = pointIndex / 8, rr = radius * regionMix(inner, outer, t);
      const curve = Math.sin(Math.PI * t) * radius * bend;
      const point = {
        x: center.x + Math.cos(angle) * rr + tangent.x * (lateral * radius + curve),
        y: center.y + Math.sin(angle) * rr + tangent.y * (lateral * radius + curve)
      };
      return { ...point, alpha: regionMaskAlpha(mask, rasterMask, point.x, point.y), edgeDistance: regionMaskBoundaryDistance(region, mask, point), p: regionClamp(.42 + .44 * Math.sin(Math.PI * t), .12, .94) };
    }).filter(point => point.alpha > 0 && vectorPathContains(region.path, point));
    if (points.length < 2) return;
    const color = fieldColor(action, refinement, region, points[Math.floor(points.length * regionClamp(palettePosition, 0, .999))], points[Math.floor(points.length / 2)].edgeDistance);
    const preset = { ...brushPreset, kind, softness, grain: 0, bristle: kind === 'brush' ? .01 : 0, wetness: kind === 'brush' ? .12 : .02, flow: .92 };
    strokes.push(makeStroke({
      action, region, mask, rasterMask, page, brushPreset: preset, options, constraints, refinement, index,
      normalizedPoints: points, origin: points[0], color,
      width: regionClamp(diameter * widthScale, 1.2, 54),
      opacity: regionClamp(regionMix(options.opacityRange[0], options.opacityRange[1], .56) * opacityScale, .008, .36)
    }));
  };

  if (operation === 'Base Wash' || operation === 'Transparent Glaze') {
    const fieldCount = operation === 'Base Wash' ? 3 : 2;
    for (let index = 0; index < fieldCount; index += 1) {
      const angle = -.58 + index * .73 + (random() - .5) * .34;
      makeCenterStroke({
        index: `center-field-${index}`, angle, inner: 0, outer: .78 + random() * .16,
        lateral: (random() - .5) * .22, widthScale: operation === 'Base Wash' ? .76 - index * .10 : .46,
        opacityScale: operation === 'Base Wash' ? .96 - index * .12 : .40,
        kind: index === 0 ? 'brush' : 'airbrush', softness: index === 0 ? .90 : .985,
        palettePosition: .18 + index * .27, bend: (random() - .5) * .22
      });
    }
  } else if (operation === 'Root Shadow') {
    makeCenterStroke({ index: 'center-crescent-depth', angle: 1.72 + (random() - .5) * .28, inner: .02, outer: .72, lateral: .20, widthScale: .34, opacityScale: .70, kind: 'airbrush', softness: .96, palettePosition: .10, bend: -.18 });
  } else if (operation === 'Central Light') {
    makeCenterStroke({ index: 'center-broken-light', angle: -.76 + (random() - .5) * .24, inner: .06, outer: .68, lateral: -.10, widthScale: .19, opacityScale: .50, kind: 'airbrush', softness: .94, palettePosition: .82, bend: .16 });
  } else if (operation === 'Directional Brushwork') {
    const occlusion = refinement?.centerOcclusionMap?.occlusion ?? .28;
    const spokes = 5;
    let angle = -2.72 + random() * .38;
    for (let index = 0; index < spokes; index += 1) {
      angle += (.78 + random() * .54);
      if (random() < occlusion * .42) continue;
      makeCenterStroke({
        index: `center-irregular-ray-${index}`, angle, inner: .10 + random() * .12, outer: .48 + random() * .30,
        lateral: (random() - .5) * .18, widthScale: .032 + random() * .035,
        opacityScale: .26 + random() * .18, kind: 'brush', softness: .76 + random() * .14,
        palettePosition: .36 + random() * .48, bend: (random() - .5) * .24
      });
    }
    const featureScale = retentionConstraint(constraints)?.featureScale || 1;
    const features = (region.center?.features || []).filter((feature, featureIndex) => featureIndex % 3 === 0).slice(0, 15);
    for (const [featureIndex, feature] of features.entries()) {
      const angle = Number.isFinite(feature.angle) ? feature.angle : featureIndex * 1.7;
      const tangent = { x: -Math.sin(angle), y: Math.cos(angle) }, half = Math.max(.0012, feature.radius * .48 * featureScale);
      const points = [-1, 0, 1].map((offset, pointIndex) => {
        const candidate = { x: feature.x + tangent.x * half * offset, y: feature.y + tangent.y * half * offset };
        const point = retentionPoint(mask, rasterMask, region, candidate, .12);
        return point ? { ...point, p: pointIndex === 1 ? .96 : .66 } : null;
      }).filter(Boolean);
      if (points.length < 2) continue;
      const sample = points[Math.floor(points.length / 2)], preset = { ...brushPreset, kind: 'brush', softness: .72 + (featureIndex % 3) * .07, grain: 0, bristle: .008, wetness: .10, flow: .94 };
      strokes.push(makeStroke({
        action, region, mask, rasterMask, page, brushPreset: preset, options, constraints, refinement,
        index: `center-feature-${String(featureIndex + 1).padStart(2, '0')}`, normalizedPoints: points, origin: sample,
        color: fieldColor(action, refinement, region, sample, sample.edgeDistance),
        width: regionClamp(feature.radius * Math.min(trim.w, trim.h) * 1.35 * featureScale, 1.2, 8.5),
        opacity: regionClamp(regionMix(options.opacityRange[0], options.opacityRange[1], .72) * (.72 + feature.weight * .34), .04, .42), frequencyLayer: 'mid'
      }));
    }
  } else if (operation === 'Edge Light') {
    makeCenterStroke({ index: 'center-partial-edge', angle: -1.10 + random() * .26, inner: .38, outer: .78, lateral: -.06, widthScale: .045, opacityScale: .22, kind: 'brush', softness: .84, palettePosition: .88, bend: .12 });
  }
  return strokes;
}

function regionBackgroundSegments(points, mask, rasterMask) {
  const segments = [], current = [];
  const flush = () => { if (current.length >= 2) segments.push(current.splice(0)); else current.length = 0; };
  for (const point of points) {
    const insidePage = point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
    const alpha = insidePage ? regionMaskAlpha(mask, rasterMask, point.x, point.y) : 0;
    if (alpha <= 0) { flush(); continue; }
    current.push({ ...point, alpha, edgeDistance: regionMaskBoundaryDistance({ path: mask.path }, mask, point), p: point.p ?? .8 });
  }
  flush();
  return segments;
}

function regionBackgroundStructuredStrokes({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement }) {
  if (!['Base Wash', 'Transparent Glaze', 'Directional Brushwork'].includes(action.payload.operation)) return [];
  const trim = artboardTrimBounds(page), strokes = [];
  const random = regionPrng((action.seed ^ 0xB6C5D4E3) >>> 0);
  const low = refinement?.backgroundLowFrequencyField || { amplitude: .18, scale: .78, phase: .21, diagonalBias: .22 };
  const pushSegments = ({ points, index, color, width, opacity }) => {
    const segments = regionBackgroundSegments(points, mask, rasterMask);
    segments.forEach((normalizedPoints, segmentIndex) => strokes.push(makeStroke({
      action, region, mask, rasterMask, page,
      brushPreset: { ...brushPreset, kind: 'airbrush', softness: .995, grain: 0, bristle: 0, wetness: .03, flow: .88, taper: 0 },
      options, constraints, refinement,
      index: `${index}-segment-${segmentIndex}`, normalizedPoints, origin: normalizedPoints[0], color, width, opacity
    })));
  };
  const fieldCount = action.payload.operation === 'Base Wash' ? 7 : action.payload.operation === 'Transparent Glaze' ? 4 : 2;
  const palette = action.payload.palette || [action.payload.color];
  for (let index = 0; index < fieldCount; index += 1) {
    const center = { x: .12 + random() * .76, y: .08 + random() * .84 };
    const angle = (-.90 + random() * 1.80) + low.diagonalBias * (random() - .5) * .55;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const normal = { x: -direction.y, y: direction.x };
    const length = 1.15 + random() * .58;
    const phase = (low.phase + random()) * Math.PI * 2;
    const points = Array.from({ length: 78 }, (_, pointIndex) => {
      const t = pointIndex / 77, along = (t - .5) * length;
      const wave = Math.sin(phase + t * Math.PI * (1.1 + low.scale * .55)) * low.amplitude * (.035 + random() * .018);
      const drift = Math.sin(Math.PI * t) * (random() - .5) * .014;
      return {
        x: center.x + direction.x * along + normal.x * (wave + drift),
        y: center.y + direction.y * along + normal.y * (wave + drift),
        p: .60 + .20 * Math.sin(Math.PI * t)
      };
    });
    const position = regionClamp((index + random() * .72) / Math.max(1, fieldCount - 1), 0, 1);
    const v = position * Math.max(0, palette.length - 1);
    const ci = Math.min(Math.max(0, palette.length - 2), Math.floor(v)), ct = palette.length <= 1 ? 0 : v - ci;
    const color = palette.length <= 1 ? palette[0] : mixHex(palette[ci], palette[ci + 1], ct);
    pushSegments({
      points, index: `background-low-field-${index}`, color,
      width: action.payload.operation === 'Base Wash' ? 150 : 132,
      opacity: action.payload.operation === 'Base Wash' ? .074 + random() * .034 : action.payload.operation === 'Transparent Glaze' ? .030 + random() * .016 : .004 + random() * .003
    });
  }
  if (action.payload.operation === 'Transparent Glaze') {
    for (let index = 0; index < 2; index += 1) {
      const centerY = .24 + random() * .54, bend = (random() - .5) * .07;
      const points = Array.from({ length: 78 }, (_, pointIndex) => {
        const t = pointIndex / 77;
        return { x: -.12 + 1.24 * t, y: centerY + bend * Math.sin(t * Math.PI) + Math.sin(t * Math.PI * 1.35 + index) * .012, p: .58 };
      });
      pushSegments({ points, index: `background-glaze-${index}`, color: palette[(index + 1) % palette.length], width: 120, opacity: .014 + random() * .006 });
    }
  }
  return strokes;
}

function compileRefinedStructuredStrokes({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement }) {
  if (!refinement) return [];
  if (region.kind === 'background-region') return regionBackgroundStructuredStrokes({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement });
  if (region.kind === 'flower-center-region') return regionCenterStructuredStrokes({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement });
  const sections = regionSectionSeries(region);
  if (sections.length < 4) return [];
  const operation = action.payload.operation, strokes = [];
  const random = regionPrng((action.seed ^ parseInt(regionHashString(region.regionId), 16) ^ 0x7A5E) >>> 0);
  strokes.push(...regionNonPeriodicFullBodyFillStrokes({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement }));
  strokes.push(...regionCrossSectionFillStrokes({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement }));
  const add = spec => {
    const stroke = regionStructuredStroke({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement, sections, ...spec });
    if (stroke) strokes.push(stroke);
  };
  const isStem = region.kind === 'stem-region';
  const isLeaf = region.kind === 'leaf-region';
  const asym = (random() - .5) * .18;
  const dropout = refinement.strokeDropout ?? .12;

  if (operation === 'Overlap Shadow') {
    const seam = regionSeamStroke({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement });
    if (seam) strokes.push(seam);
    return strokes;
  }

  if (isStem) {
    if (operation === 'Base Wash') {
      add({ index: 'stem-body', lateral: 0, widthScale: 1.02, opacityScale: 1.32, palettePosition: .50, startT: .015, endT: .985, kind: 'airbrush', softness: .94 });
      add({ index: 'stem-left-volume', lateral: -.30, widthScale: .58, opacityScale: .82, palettePosition: .18, startT: .025, endT: .975, kind: 'brush', softness: .92 });
      add({ index: 'stem-right-volume', lateral: .30, widthScale: .56, opacityScale: .76, palettePosition: .76, startT: .035, endT: .965, kind: 'brush', softness: .92 });
    } else if (operation === 'Fold Shadow') add({ index: 'stem-side-shadow', lateral: .40, widthScale: .28, opacityScale: .55, palettePosition: .10, kind: 'airbrush', softness: .94 });
    else if (operation === 'Central Light') add({ index: 'stem-long-light', lateral: -.18, widthScale: .20, opacityScale: .56, palettePosition: .86, startT: .04, endT: .92, kind: 'airbrush', softness: .93 });
    else if (operation === 'Transparent Glaze') add({ index: 'stem-soft-glaze', lateral: .08, widthScale: .76, opacityScale: .36, palettePosition: .62, kind: 'airbrush', softness: .98 });
    else if (operation === 'Directional Brushwork') {
      add({ index: 'stem-track-a', lateral: -.24, widthScale: .08, opacityScale: .30, palettePosition: .54, startT: .04, endT: .95, kind: 'brush', pressureScale: .60 });
      add({ index: 'stem-track-b', lateral: .16, widthScale: .06, opacityScale: .24, palettePosition: .70, startT: .18, endT: .88, kind: 'brush', pressureScale: .55 });
    } else if (operation === 'Boundary Dissolve') add({ index: 'stem-edge-soft', lateral: .78, widthScale: .10, opacityScale: .14, palettePosition: .58, startT: .10, endT: .86, kind: 'airbrush', softness: .99 });
    return strokes;
  }

  if (isLeaf) {
    const cross = refinement.leafCrossSectionField || { ridge: .68, leftShadow: .62, rightLight: .58, twist: .24 };
    const twist = (region.role === 'left-leaf' ? -1 : 1) * (cross.twist ?? 0);
    if (operation === 'Base Wash') {
      add({ index: 'leaf-mass', lateral: 0, widthScale: 1.00, opacityScale: 1.08, palettePosition: .50, startT: .025, endT: .955, kind: 'airbrush', softness: .95 });
      add({ index: 'leaf-left-plane', lateral: -.30 - cross.leftShadow * .10 + twist * .12, widthScale: .64, opacityScale: .88, palettePosition: .18, startT: .045, endT: .935, kind: 'brush', softness: .92 });
      add({ index: 'leaf-right-plane', lateral: .30 + cross.rightLight * .10 - twist * .08, widthScale: .62, opacityScale: .82, palettePosition: .76, startT: .055, endT: .925, kind: 'brush', softness: .92 });
      add({ index: 'leaf-soft-field', lateral: .05 + twist * .08, widthScale: .58, opacityScale: .36, palettePosition: .62, startT: .10, endT: .90, kind: 'airbrush', softness: .98 });
    } else if (operation === 'Root Shadow') add({ index: 'leaf-root-depth', lateral: -.06, widthScale: .76, opacityScale: .55, palettePosition: .08, startT: .015, endT: .33, kind: 'airbrush', softness: .94 });
    else if (operation === 'Central Light') add({ index: 'leaf-ridge', lateral: (cross.ridge - .5) * .24 + twist * .22, widthScale: .16, opacityScale: .58, palettePosition: .83, startT: .08, endT: .95, kind: 'airbrush', softness: .92 });
    else if (operation === 'Edge Light') {
      const side = region.role === 'left-leaf' ? -.76 : .76;
      add({ index: 'leaf-selected-edge', lateral: side, widthScale: .11, opacityScale: .30, palettePosition: .91, startT: .22, endT: .92, kind: 'brush', softness: .84 });
    } else if (operation === 'Transparent Glaze') {
      add({ index: 'leaf-glaze-a', lateral: -.18 + twist * .12, widthScale: .66, opacityScale: .42, palettePosition: .58, startT: .04, endT: .96, kind: 'airbrush', softness: .98 });
      add({ index: 'leaf-glaze-b', lateral: .30 - twist * .10, widthScale: .32, opacityScale: .28, palettePosition: .80, startT: .28, endT: .86, kind: 'airbrush', softness: .98 });
    } else if (operation === 'Directional Brushwork') {
      const count = 3;
      for (let i = 0; i < count; i += 1) {
        if (i > 0 && random() < dropout * .45) continue;
        add({ index: `leaf-brush-${i}`, lateral: -.34 + i * .31 + asym, widthScale: .075 + random() * .045, opacityScale: .22 + random() * .15, palettePosition: .35 + random() * .48, startT: .10 + random() * .22, endT: .78 + random() * .18, kind: 'brush', pressureScale: .54 + random() * .12 });
      }
    } else if (operation === 'Boundary Dissolve') add({ index: 'leaf-partial-dissolve', lateral: region.role === 'left-leaf' ? .82 : -.82, widthScale: .10, opacityScale: .10 * (retentionConstraint(constraints)?.visualWeight || 1), palettePosition: .62, startT: .34, endT: .88, kind: 'airbrush', softness: .99 });
    return strokes;
  }

  if (operation === 'Base Wash') {
    add({ index: 'petal-underpaint', lateral: asym * .20, widthScale: 1.08, opacityScale: 1.12, palettePosition: .48, startT: .025, endT: .930, kind: 'airbrush', softness: .94 });
    add({ index: 'petal-body-brush', lateral: asym * .12, widthScale: .72, opacityScale: .48, palettePosition: .54, startT: .08, endT: .88, kind: 'brush', softness: .88 });
    add({ index: 'petal-root-field', lateral: -.08 + asym, widthScale: .92, opacityScale: .88, palettePosition: .07, startT: .035, endT: .52 + random() * .10, kind: 'airbrush', softness: .96 });
    add({ index: 'petal-cool-plane', lateral: -.27 + asym, widthScale: .55, opacityScale: .54, palettePosition: .34, startT: .20, endT: .88, kind: 'airbrush', softness: .97 });
    add({ index: 'petal-warm-plane', lateral: .25 + asym, widthScale: .50, opacityScale: .50, palettePosition: .74, startT: .25, endT: .91, kind: 'airbrush', softness: .97 });
  } else if (operation === 'Root Shadow') {
    add({ index: 'petal-root-depth', lateral: -.04 + asym, widthScale: .66, opacityScale: .76, palettePosition: .04, startT: .035, endT: .34 + random() * .07, kind: 'airbrush', softness: .93 });
  } else if (operation === 'Fold Shadow') {
    const lateral = constraints.foldSide === 'left' ? -.30 : constraints.foldSide === 'right' ? .30 : (random() < .5 ? -.18 : .18);
    add({ index: 'petal-fold-depth', lateral: lateral + asym, widthScale: .20 + random() * .10, opacityScale: .62 + random() * .18, palettePosition: .16, startT: .12 + random() * .08, endT: .76 + random() * .16, kind: 'brush' });
  } else if (operation === 'Central Light') {
    add({ index: 'petal-ridge-light', lateral: -.10 + asym, widthScale: .25 + random() * .08, opacityScale: .60, palettePosition: .84, startT: .16, endT: .92, kind: 'airbrush', softness: .93 });
    add({ index: 'petal-reflected-light', lateral: .27 + asym, widthScale: .16, opacityScale: .28, palettePosition: .68, startT: .32, endT: .82, kind: 'airbrush', softness: .96 });
  } else if (operation === 'Edge Light') {
    const primary = random() < .5 ? -.78 : .78;
    add({ index: 'petal-edge-primary', lateral: primary, widthScale: .10 + random() * .04, opacityScale: .40 + random() * .14, palettePosition: .92, startT: .18 + random() * .12, endT: .84 + random() * .06, kind: 'brush', softness: .84 });
    if (random() > .48) add({ index: 'petal-edge-secondary', lateral: -primary * .86, widthScale: .07, opacityScale: .14, palettePosition: .78, startT: .44, endT: .79, kind: 'airbrush', softness: .94 });
  } else if (operation === 'Transparent Glaze') {
    add({ index: 'petal-glaze-root-mid', lateral: -.10 + asym, widthScale: .88, opacityScale: .58, palettePosition: .48, startT: .04, endT: .82, kind: 'airbrush', softness: .985 });
    add({ index: 'petal-glaze-tip-side', lateral: .22 + asym, widthScale: .52, opacityScale: .40, palettePosition: .82, startT: .34, endT: .92, kind: 'airbrush', softness: .985 });
  } else if (operation === 'Directional Brushwork') {
    const cluster = refinement.strokeClustering || { count: 3, strength: .5, spread: .4 };
    const count = regionClamp(Math.round(cluster.count), 2, 4);
    for (let i = 0; i < count; i += 1) {
      if (i > 0 && random() < dropout) continue;
      const center = (i / Math.max(1, count - 1) - .5) * .78;
      add({ index: `petal-brush-${i}`, lateral: center + (random() - .5) * cluster.spread * .28 + asym, widthScale: .075 + random() * .075, opacityScale: .20 + random() * .18, palettePosition: .28 + random() * .62, startT: .08 + random() * .34, endT: .70 + random() * .27, kind: 'brush', pressureScale: .50 + random() * .20 });
    }
  } else if (operation === 'Boundary Dissolve') {
    const side = random() < .5 ? -.84 : .84;
    add({ index: 'petal-partial-dissolve', lateral: side, widthScale: .09, opacityScale: (.09 + random() * .05) * (retentionConstraint(constraints)?.visualWeight || 1), palettePosition: .58, startT: .28 + random() * .14, endT: .82 + random() * .12, kind: 'airbrush', softness: .99 });
    if (random() > .60) add({ index: 'petal-tip-dissolve', lateral: -side * .32, widthScale: .15, opacityScale: .10, palettePosition: .80, startT: .78, endT: .91, kind: 'airbrush', softness: .995 });
  }
  return strokes;
}

function compileContinuousAxisStroke({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement }) {
  if (!constraints.axisContinuous) return null;
  const axis = growthAxis(region), reverse = options.direction === 'tip-to-base';
  const from = reverse ? axis.tip : axis.base, to = reverse ? axis.base : axis.tip;
  const trim = artboardTrimBounds(page), normalizedPoints = [], pointCount = refinement ? 72 : 48;
  const phase = (action.seed % 97) / 97 * Math.PI * 2;
  for (let index = 0; index < pointCount; index += 1) {
    const t = .018 + .964 * (index / Math.max(1, pointCount - 1));
    const sway = refinement ? Math.sin(Math.PI * t) * Math.sin(phase + t * Math.PI) * .0018 * refinement.curvatureFollowing.bend : 0;
    const point = { x: regionMix(from.x, to.x, t) + sway, y: regionMix(from.y, to.y, t) };
    if (!vectorPathContains(region.path, point)) continue;
    const alpha = regionMaskAlpha(mask, rasterMask, point.x, point.y);
    if (alpha <= 0) continue;
    normalizedPoints.push({ ...point, alpha, edgeDistance: regionMaskBoundaryDistance(region, mask, point), p: regionClamp(.66 + .22 * Math.sin(Math.PI * t), .18, 1) });
  }
  if (normalizedPoints.length < 2) return null;
  const alphaMean = normalizedPoints.reduce((sum, point) => sum + point.alpha, 0) / normalizedPoints.length;
  const baseWidth = options.widthRange[1], width = protectedWidth(baseWidth, normalizedPoints, trim, refinement);
  const opacity = regionClamp(regionMix(options.opacityRange[0], options.opacityRange[1], .72) * (mask.feather > 0 ? Math.max(.12, alphaMean) : 1) * opacityFactor(refinement, region, normalizedPoints[Math.floor(normalizedPoints.length / 2)], Math.min(...normalizedPoints.map(point => point.edgeDistance)), action.payload.operation, constraints), 0, 1);
  return makeStroke({
    action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement,
    index: 'axis-continuous', normalizedPoints, origin: normalizedPoints[0],
    color: fieldColor(action, refinement, region, normalizedPoints[Math.floor(normalizedPoints.length / 2)], normalizedPoints[Math.floor(normalizedPoints.length / 2)].edgeDistance),
    width, opacity
  });
}

export function validateCompilerOptions(options = {}) {
  const errors = [];
  if (!REGION_DIRECTIONS.includes(options.direction)) errors.push('unsupported direction');
  if (!Number.isFinite(options.density) || options.density < 1 || options.density > 256) errors.push('density out of range');
  if (!Number.isFinite(options.spacing) || options.spacing < .001 || options.spacing > .25) errors.push('spacing out of range');
  if (!Array.isArray(options.widthRange) || options.widthRange.length !== 2 || options.widthRange.some(value => !Number.isFinite(value) || value < .5 || value > 120) || options.widthRange[0] > options.widthRange[1]) errors.push('widthRange invalid');
  if (!Array.isArray(options.opacityRange) || options.opacityRange.length !== 2 || options.opacityRange.some(value => !Number.isFinite(value) || value < 0 || value > 1) || options.opacityRange[0] > options.opacityRange[1]) errors.push('opacityRange invalid');
  if (!Number.isFinite(options.jitter) || options.jitter < 0 || options.jitter > 1) errors.push('jitter out of range');
  if (!Number.isFinite(options.edgeAvoidance) || options.edgeAvoidance < 0 || options.edgeAvoidance > .25) errors.push('edgeAvoidance out of range');
  if (!Number.isFinite(options.coverage) || options.coverage < 0 || options.coverage > 1) errors.push('coverage out of range');
  if (!REGION_BLEND_MODES.includes(options.blendMode)) errors.push('blendMode unsupported');
  return { ok: !errors.length, errors };
}

export function compileRegionStrokes({ action, region, mask, page, brushPreset, rasterMask = null }) {
  if (!action || !region || !mask || !page || !brushPreset) throw new Error('compiler input incomplete');
  const defaults = operationDefaults(action.payload.operation), refinement = action.payload.refinement || null, options = {
    ...defaults,
    direction: action.payload.direction ?? defaults.direction,
    density: action.payload.density ?? defaults.density,
    spacing: action.payload.spacing ?? defaults.spacing,
    widthRange: action.payload.widthRange ?? defaults.widthRange,
    opacityRange: action.payload.opacityRange ?? defaults.opacityRange,
    jitter: action.payload.jitter ?? defaults.jitter,
    edgeAvoidance: action.payload.edgeAvoidance ?? defaults.edgeAvoidance,
    coverage: action.payload.coverage ?? defaults.coverage,
    blendMode: action.payload.blendMode ?? defaults.blendMode
  };
  const check = validateCompilerOptions(options);
  if (!check.ok) throw new Error(check.errors.join('; '));
  const random = regionPrng((action.seed ^ parseInt(regionHashString(action.actionId), 16)) >>> 0), bounds = vectorPathBounds(region.path), trim = artboardTrimBounds(page);
  const regionScale = Math.max(.01, Math.min(bounds.w, bounds.h)), spacingFactor = regionClamp(.03 / options.spacing, .25, 4);
  const rawTargetCount = Math.max(1, Math.round(options.density * spacingFactor));
  const refinedCountFactor = action.payload.operation === 'Base Wash' ? .46 : action.payload.operation === 'Directional Brushwork' ? .72 : action.payload.operation === 'Boundary Dissolve' ? .62 : .82;
  const regionCountFactor = region.kind === 'flower-center-region' ? .18 : region.kind === 'background-region' ? .12 : region.kind === 'stem-region' ? .36 : region.kind === 'leaf-region' ? .54 : .72;
  const targetCount = refinement ? Math.max(region.kind === 'flower-center-region' ? 2 : 4, Math.round(rawTargetCount * refinedCountFactor * regionCountFactor)) : rawTargetCount;
  const strokes = [], constraints = action.payload.constraints || {};
  const structuredStrokes = compileRefinedStructuredStrokes({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement });
  strokes.push(...structuredStrokes);
  const continuousAxisStroke = structuredStrokes.length ? null : compileContinuousAxisStroke({ action, region, mask, rasterMask, page, brushPreset, options, random, constraints, refinement });
  if (continuousAxisStroke) strokes.push(continuousAxisStroke);
  const genericTargetCount = refinement && structuredStrokes.length ? 0 : targetCount;
  for (let index = 0; index < genericTargetCount; index += 1) {
    if ((strokes.length > 0 || index > 0) && refinement?.strokeDropout && ['Directional Brushwork', 'Transparent Glaze', 'Boundary Dissolve'].includes(action.payload.operation) && random() < refinement.strokeDropout) continue;
    const sampled = samplePoint(region, mask, rasterMask, bounds, random, options, action.payload.operation, constraints, refinement);
    if (!sampled) continue;
    if ((strokes.length > 0 || index > 0) && refinement?.strokeClustering && ['Directional Brushwork', 'Transparent Glaze'].includes(action.payload.operation)) {
      const cluster = refinement.strokeClustering;
      const phase = ((action.seed >>> 0) % 997) / 997;
      const wave = .5 + .5 * Math.cos((sampled.metrics.t * cluster.count + phase) * Math.PI * 2);
      const accept = 1 - cluster.strength + cluster.strength * Math.pow(wave, 1 + cluster.spread * 2);
      if (random() > accept) continue;
    }
    const vector = directionVector(options.direction, region, sampled.point, random);
    const length = operationLength(action.payload.operation, regionScale, refinement) * lengthScale(refinement, random);
    const normalizedPoints = normalizedStrokePoints(region, mask, rasterMask, sampled.point, vector, length, random, options.jitter, action.payload.operation, refinement);
    if (normalizedPoints.length < 2) continue;
    const alphaMean = normalizedPoints.reduce((sum, point) => sum + point.alpha, 0) / normalizedPoints.length;
    let width = regionMix(options.widthRange[0], options.widthRange[1], random());
    width = protectedWidth(width, normalizedPoints, trim, refinement);
    const edgeDistance = Math.min(...normalizedPoints.map(point => point.edgeDistance ?? sampled.distance));
    const edgeHardness = refinement ? regionMix(refinement.localEdgeHardness.edge, refinement.localEdgeHardness.interior, regionSmoothstep(edgeDistance / Math.max(.002, regionScale * .22))) : 1;
    const randomTextureFactor = refinement ? (action.payload.operation === 'Base Wash' ? .22 : action.payload.operation === 'Directional Brushwork' ? .34 : action.payload.operation === 'Boundary Dissolve' ? .30 : .56) : 1;
    const opacity = regionClamp(
      regionMix(options.opacityRange[0], options.opacityRange[1], random()) *
      (mask.feather > 0 ? Math.max(.08, alphaMean) : 1) *
      opacityFactor(refinement, region, sampled.point, edgeDistance, action.payload.operation, constraints) *
      regionMix(.72, 1, edgeHardness) * randomTextureFactor, 0, 1
    );
    const color = fieldColor(action, refinement, region, sampled.point, edgeDistance);
    strokes.push(makeStroke({ action, region, mask, rasterMask, page, brushPreset, options, constraints, refinement, index, normalizedPoints, origin: sampled.point, color, width, opacity }));
  }
  if (!strokes.length) throw new Error('compiler produced no strokes');
  return {
    strokes, options,
    compilerHash: regionHashString(JSON.stringify(strokes.map(stroke => ({ id: stroke.id, opacity: stroke.opacity, size: stroke.size, color: stroke.color, blendMode: stroke.blendMode, points: stroke.points }))))
  };
}
