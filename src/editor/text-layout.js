import { Matrix } from '../core/index.js';

function fail(code, details = {}) {
  throw Object.assign(new Error(`INK_TEXT_LAYOUT_${code}`), { code: `TEXT_LAYOUT_${code}`, ...details });
}

const finite = (value, fallback = 0) => Number.isFinite(+value) ? +value : fallback;
const positive = (value, fallback) => Number.isFinite(+value) && +value > 0 ? +value : fallback;

function assertTextObject(object) {
  if (!object || object.type !== 'text') fail('TEXT_OBJECT_REQUIRED');
  return object;
}

function defaultMeasure(text, object) {
  return Array.from(String(text)).length * positive(object.fontSize, 32) * 0.6;
}

function measure(text, object, measureText) {
  const width = measureText ? Number(measureText(String(text), object)) : defaultMeasure(text, object);
  if (!Number.isFinite(width) || width < 0) fail('MEASURE_INVALID');
  return width;
}

function breakLongToken(token, maxWidth, object, measureText) {
  const chunks = [];
  let current = '';
  for (const character of Array.from(token)) {
    const next = current + character;
    if (current && measure(next, object, measureText) > maxWidth) {
      chunks.push(current);
      current = character;
    } else current = next;
  }
  if (current) chunks.push(current);
  return chunks;
}

function wrapParagraph(paragraph, maxWidth, object, measureText) {
  if (paragraph === '') return [''];
  const tokens = paragraph.trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const token of tokens) {
    const parts = measure(token, object, measureText) <= maxWidth ? [token] : breakLongToken(token, maxWidth, object, measureText);
    for (const part of parts) {
      const candidate = current ? `${current} ${part}` : part;
      if (current && measure(candidate, object, measureText) > maxWidth) {
        lines.push(current);
        current = part;
      } else current = candidate;
    }
  }
  if (current || !lines.length) lines.push(current);
  return lines;
}

export function layoutParagraphText(object, { measureText = null } = {}) {
  assertTextObject(object);
  const box = object.textBox;
  if (!box || !Number.isFinite(+box.width) || !Number.isFinite(+box.height) || +box.width <= 0 || +box.height <= 0) fail('TEXT_BOX_REQUIRED');
  const width = +box.width, height = +box.height;
  const fontSize = positive(object.fontSize, 32);
  const lineHeight = positive(object.lineHeight, 1.25) * fontSize;
  const align = ['left', 'center', 'right'].includes(object.paragraphAlign) ? object.paragraphAlign : 'left';
  const rawLines = String(object.text ?? '').split('\n').flatMap(paragraph => wrapParagraph(paragraph, width, object, measureText));
  const maxLines = Math.max(0, Math.floor((height + 1e-9) / lineHeight));
  const visible = rawLines.slice(0, maxLines);
  const lines = visible.map((text, index) => {
    const lineWidth = measure(text, object, measureText);
    const x = align === 'center' ? (width - lineWidth) / 2 : align === 'right' ? width - lineWidth : 0;
    return { index, text, width: lineWidth, x, y: index * lineHeight, baseline: (index + 1) * lineHeight };
  });
  return {
    mode: 'paragraph', box: { width, height }, align, lineHeight, lines,
    overflow: rawLines.length > visible.length,
    hiddenLineCount: Math.max(0, rawLines.length - visible.length)
  };
}

export function layoutVerticalText(object) {
  assertTextObject(object);
  const writingMode = ['vertical-rl', 'vertical-lr'].includes(object.writingMode) ? object.writingMode : 'vertical-rl';
  const advance = positive(object.fontSize, 32) * positive(object.lineHeight, 1.25);
  const glyphs = Array.from(String(object.text ?? '')).map((character, index) => ({
    index, character, x: 0, y: index * advance, advance, orientation: 'upright'
  }));
  return { mode: 'vertical', writingMode, advance, glyphs };
}

function cubicPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return { x: a*p0.x+b*p1.x+c*p2.x+d*p3.x, y: a*p0.y+b*p1.y+c*p2.y+d*p3.y };
}

function sampleSubpath(subpath, matrix) {
  const anchors = subpath?.anchors || [];
  if (anchors.length < 2) return [];
  const points = [];
  const count = subpath.closed ? anchors.length : anchors.length - 1;
  for (let index = 0; index < count; index += 1) {
    const from = anchors[index], to = anchors[(index + 1) % anchors.length];
    const p0 = { x: from.x, y: from.y };
    const p1 = { x: from.x + finite(from.out?.x), y: from.y + finite(from.out?.y) };
    const p2 = { x: to.x + finite(to.in?.x), y: to.y + finite(to.in?.y) };
    const p3 = { x: to.x, y: to.y };
    const curved = Math.hypot(p1.x-p0.x,p1.y-p0.y) + Math.hypot(p2.x-p3.x,p2.y-p3.y) > 1e-9;
    const steps = curved ? 24 : 1;
    for (let step = 0; step <= steps; step += 1) {
      if (index > 0 && step === 0) continue;
      points.push(Matrix.point(matrix, cubicPoint(p0,p1,p2,p3,step/steps)));
    }
  }
  return points;
}

function polylineMetrics(points) {
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) lengths.push(lengths[index-1] + Math.hypot(points[index].x-points[index-1].x, points[index].y-points[index-1].y));
  return { lengths, total: lengths.at(-1) || 0 };
}

function pointAtDistance(points, lengths, distance) {
  if (!points.length) fail('PATH_EMPTY');
  if (distance <= 0) {
    const next = points[1] || points[0];
    return { point: points[0], tangent: Math.atan2(next.y-points[0].y, next.x-points[0].x) };
  }
  for (let index = 1; index < points.length; index += 1) {
    if (distance > lengths[index]) continue;
    const segment = Math.max(1e-12, lengths[index]-lengths[index-1]);
    const t = (distance-lengths[index-1])/segment;
    const a = points[index-1], b = points[index];
    return { point: { x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t }, tangent: Math.atan2(b.y-a.y,b.x-a.x) };
  }
  const a = points.at(-2) || points.at(-1), b = points.at(-1);
  return { point: b, tangent: Math.atan2(b.y-a.y,b.x-a.x) };
}

export function layoutTextOnPath(object, path, { measureText = null, startOffset = null } = {}) {
  assertTextObject(object);
  if (!path || path.type !== 'path' || !Array.isArray(path.subpaths) || !path.subpaths.length) fail('PATH_REQUIRED');
  const sourceFingerprint = JSON.stringify(path);
  const matrix = Array.isArray(path.matrix) && path.matrix.length === 6 ? path.matrix : Matrix.identity();
  const points = sampleSubpath(path.subpaths[0], matrix);
  const { lengths, total } = polylineMetrics(points);
  if (total <= 0) fail('PATH_EMPTY');
  const configuredOffset = startOffset == null ? finite(object.pathText?.startOffset, 0) : finite(startOffset, 0);
  let cursor = Math.max(0, configuredOffset);
  const placements = [];
  let overflow = false;
  for (const [index, character] of Array.from(String(object.text ?? '')).entries()) {
    const advance = measure(character, object, measureText);
    const midpoint = cursor + advance / 2;
    if (midpoint > total) { overflow = true; break; }
    const { point, tangent } = pointAtDistance(points, lengths, midpoint);
    placements.push({ index, character, x: point.x, y: point.y, angle: tangent, advance, distance: midpoint });
    cursor += advance;
  }
  if (JSON.stringify(path) !== sourceFingerprint) fail('PATH_MUTATED');
  return { mode: 'path', pathId: path.id || null, startOffset: Math.max(0, configuredOffset), pathLength: total, placements, overflow };
}
