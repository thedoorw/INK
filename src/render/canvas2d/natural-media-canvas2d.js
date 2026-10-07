import { clamp } from '../../core/index.js';
import {
  buildBristleClusters, deterministicNaturalMediaUnit, isNaturalMediaStroke,
  naturalMediaGrainAt, naturalMediaSeed, resampleNaturalMediaPath, strokeWidthForMedia
} from '../natural-media-utils.js';

function outlineForStroke(stroke, points, widthScale = 1, edgeVariation = 0) {
  if (!points.length) return [];
  if (points.length === 1) {
    const radius = strokeWidthForMedia(stroke, points[0], 0, 1) * widthScale / 2;
    return Array.from({ length: 28 }, (_, index) => ({
      x: points[0].x + Math.cos(index / 28 * Math.PI * 2) * radius,
      y: points[0].y + Math.sin(index / 28 * Math.PI * 2) * radius
    }));
  }
  const left = [], right = [], seed = naturalMediaSeed(stroke);
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const previous = points[Math.max(0, index - 1)], next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - previous.x, dy = next.y - previous.y, length = Math.hypot(dx, dy) || 1;
    const field = naturalMediaGrainAt(point.x, point.y, seed);
    const edge = 1 + (field - .5) * edgeVariation;
    const radius = strokeWidthForMedia(stroke, point, index, points.length) * widthScale * edge / 2;
    const nx = -dy / length, ny = dx / length;
    left.push({ x: point.x + nx * radius, y: point.y + ny * radius });
    right.push({ x: point.x - nx * radius, y: point.y - ny * radius });
  }
  const end = points[points.length - 1], endPrev = points[points.length - 2];
  const endAngle = Math.atan2(end.y - endPrev.y, end.x - endPrev.x);
  const endRadius = strokeWidthForMedia(stroke, end, points.length - 1, points.length) * widthScale / 2;
  const endCap = Array.from({ length: 8 }, (_, index) => {
    const angle = endAngle - Math.PI / 2 + index / 7 * Math.PI;
    return { x: end.x + Math.cos(angle) * endRadius, y: end.y + Math.sin(angle) * endRadius };
  });
  const start = points[0], startNext = points[1];
  const startAngle = Math.atan2(startNext.y - start.y, startNext.x - start.x);
  const startRadius = strokeWidthForMedia(stroke, start, 0, points.length) * widthScale / 2;
  const startCap = Array.from({ length: 8 }, (_, index) => {
    const angle = startAngle + Math.PI / 2 + index / 7 * Math.PI;
    return { x: start.x + Math.cos(angle) * startRadius, y: start.y + Math.sin(angle) * startRadius };
  });
  return left.concat(endCap, right.reverse(), startCap);
}

function fillOutline(ctx, outline) {
  if (!outline.length) return;
  ctx.beginPath();ctx.moveTo(outline[0].x, outline[0].y);
  for (let index = 1; index < outline.length; index++) ctx.lineTo(outline[index].x, outline[index].y);
  ctx.closePath();ctx.fill();
}

function painterlyMass(stroke) {
  const refinement = stroke?.floraPaint?.refinement || {};
  const mass = refinement.pigmentMass || {};
  const frequency = refinement.frequencyLayers || {};
  return {
    layer: stroke?.floraPaint?.frequencyLayer || 'mid',
    low: clamp(frequency.low ?? 1, 0, 1),
    mid: clamp(frequency.mid ?? .72, 0, 1),
    high: clamp(frequency.high ?? .12, 0, .35),
    pigmentLoad: clamp(mass.pigmentLoad ?? .72, 0, 1.5),
    depositRate: clamp(mass.depositRate ?? .70, 0, 1.5),
    bodyCoverage: clamp(mass.strokeBodyCoverage ?? .78, 0, 1),
    glazeAccumulation: clamp(mass.glazeAccumulation ?? .62, 0, 1.5),
    wetOverDry: clamp(mass.wetOverDryResponse ?? .42, 0, 1),
    edgeRetention: clamp(mass.edgeRetention ?? .72, 0, 1)
  };
}

function renderContinuousBody(ctx, stroke, points, flow) {
  const grain = clamp(stroke.grain ?? 0, 0, 1);
  const wetness = clamp(stroke.wetness ?? .3, 0, 1);
  const mass = painterlyMass(stroke);
  const edgeVariation = (.018 + grain * .055) * (1 - mass.edgeRetention * .38);
  const layerScale = mass.layer === 'mid' ? mass.mid : mass.low;
  const deposit = clamp((.58 + mass.pigmentLoad * .24 + mass.depositRate * .20) * layerScale, .08, 1.32);
  const coverage = clamp(.56 + mass.bodyCoverage * .48, .56, 1.04);
  const coreScale = mass.layer === 'mid' ? .72 : .94;
  const coreAlpha = (mass.layer === 'mid' ? .52 : .82) * deposit * coverage;
  ctx.save();
  ctx.globalAlpha *= flow * coreAlpha;
  fillOutline(ctx, outlineForStroke(stroke, points, coreScale, edgeVariation * .42));
  ctx.restore();
  const shells = stroke.kind === 'airbrush'
    ? [[1.18, .18], [1.04, .26], [.90, .35], [.74, .43], [.57, .48]]
    : [[1.08, .27], [.98, .50], [.82, .38]];
  for (const [scale, alpha] of shells) {
    ctx.save();
    ctx.globalAlpha *= flow * alpha * deposit * coverage * (stroke.kind === 'airbrush' ? .94 : 1);
    fillOutline(ctx, outlineForStroke(stroke, points, scale, edgeVariation));
    ctx.restore();
  }
  if (stroke.kind !== 'airbrush' && wetness > .04) {
    ctx.save();
    ctx.globalAlpha *= flow * (.035 + wetness * .065 + mass.wetOverDry * .025) * deposit;
    fillOutline(ctx, outlineForStroke(stroke, points, 1.10 + wetness * .045, edgeVariation * .62));
    ctx.restore();
  }
}

function renderBristleClusters(ctx, stroke, points, flow) {
  if (points.length < 2) return;
  const bristle = clamp(stroke.bristle ?? (stroke.kind === 'drybrush' ? .72 : .18), 0, 1);
  if (bristle < .025) return;
  const seed = naturalMediaSeed(stroke), clusters = buildBristleClusters(stroke);
  for (let clusterIndex = 0; clusterIndex < clusters.length; clusterIndex++) {
    const cluster = clusters[clusterIndex];
    const mass = painterlyMass(stroke);
    ctx.save();ctx.globalAlpha *= flow * cluster.opacity * mass.mid * (stroke.kind === 'drybrush' ? .82 : .50);
    ctx.lineWidth = Math.max(.24, (stroke.size || 8) * cluster.widthScale);
    ctx.beginPath();let active = false;
    for (let index = 0; index < points.length; index++) {
      const point = points[index], previous = points[Math.max(0, index - 1)], next = points[Math.min(points.length - 1, index + 1)];
      const dx = next.x - previous.x, dy = next.y - previous.y, length = Math.hypot(dx, dy) || 1;
      const field = naturalMediaGrainAt(point.x * .83 + cluster.phase * 7, point.y * .83, seed + clusterIndex * 101);
      const dropped = field < cluster.dropout * (.72 + (point.curvature || 0) * .45);
      const wobble = (naturalMediaGrainAt(point.x * .31, point.y * .31, seed + clusterIndex * 271) - .5) * cluster.waviness;
      const offset = (cluster.offset + wobble) * strokeWidthForMedia(stroke, point, index, points.length) * .9;
      const x = point.x - dy / length * offset, y = point.y + dx / length * offset;
      if (dropped) { active = false;continue; }
      if (!active) { ctx.moveTo(x, y);active = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();ctx.restore();
  }
}

function renderSurfaceAccents(ctx, stroke, points, flow) {
  if (points.length < 3) return;
  const grain = clamp(stroke.grain ?? 0, 0, 1);
  const seed = naturalMediaSeed(stroke), mass = painterlyMass(stroke);
  if (mass.high <= .002) return;
  const count = Math.min(18, Math.max(2, Math.round(points.length * (.018 + grain * .04))));
  for (let accent = 0; accent < count; accent++) {
    const ratio = deterministicNaturalMediaUnit(seed, accent, 401);
    const index = clamp(Math.floor(ratio * points.length), 1, points.length - 2);
    const point = points[index], tangent = { x: point.tangentX || 1, y: point.tangentY || 0 };
    const width = strokeWidthForMedia(stroke, point, index, points.length);
    const length = width * (.24 + deterministicNaturalMediaUnit(seed, accent, 409) * .55);
    const side = (deterministicNaturalMediaUnit(seed, accent, 419) - .5) * width * .52;
    const nx = -tangent.y, ny = tangent.x;
    ctx.save();ctx.globalAlpha *= flow * mass.high * (.025 + grain * .040);
    ctx.lineWidth = Math.max(.22, width * .018);ctx.lineCap = 'round';ctx.beginPath();
    ctx.moveTo(point.x + nx * side - tangent.x * length * .5, point.y + ny * side - tangent.y * length * .5);
    ctx.lineTo(point.x + nx * side + tangent.x * length * .5, point.y + ny * side + tangent.y * length * .5);
    ctx.stroke();ctx.restore();
  }
}

export class Canvas2DNaturalMediaRenderer {
  constructor() {
    this.backend = 'canvas2d';
    this.drawCalls = 0;
    this.surfaceRevision = 'WP8B-1';
    this.frequencyVisibility = { low: true, mid: true, high: true };
  }
  supports(stroke) { return isNaturalMediaStroke(stroke); }
  setFrequencyVisibility(value = {}) {
    for (const key of ['low', 'mid', 'high']) if (typeof value[key] === 'boolean') this.frequencyVisibility[key] = value[key];
    return { ...this.frequencyVisibility };
  }

  render(ctx, stroke) {
    if (!this.supports(stroke)) return false;
    const points = resampleNaturalMediaPath(stroke);
    if (!points.length) return true;
    this.drawCalls++;
    const mass = painterlyMass(stroke);
    const bodyVisible = this.frequencyVisibility[mass.layer] !== false;
    ctx.save();
    ctx.fillStyle = stroke.color || '#202020';
    ctx.strokeStyle = stroke.color || '#202020';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const flow = clamp(stroke.flow ?? .82, .04, 1);
    if (bodyVisible) renderContinuousBody(ctx, stroke, points, flow);
    if (this.frequencyVisibility.mid && bodyVisible && (stroke.kind === 'drybrush' || (stroke.bristle ?? 0) > .035)) renderBristleClusters(ctx, stroke, points, flow);
    if (this.frequencyVisibility.high) renderSurfaceAccents(ctx, stroke, points, flow);
    ctx.restore();
    return true;
  }

  diagnostics() {
    return { backend: this.backend, surfaceRevision: this.surfaceRevision, drawCalls: this.drawCalls, frequencyVisibility: { ...this.frequencyVisibility } };
  }
}
