import { Matrix } from '../core/index.js';
import { hasGlyphTypography, normalizeParagraph, normalizeTextTypography, textGraphemes, typographyFail } from './text-typography.js';

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

export function layoutParagraphText(object, { measureText = null, paragraph = object?.paragraph ?? null, fontMetrics = null } = {}) {
  assertTextObject(object);
  const box = object.textBox;
  if (!box || !Number.isFinite(+box.width) || !Number.isFinite(+box.height) || +box.width <= 0 || +box.height <= 0) fail('TEXT_BOX_REQUIRED');
  if (hasGlyphTypography(object)) return layoutGlyphTypography(object, { measureText, paragraph, fontMetrics });
  if (paragraph != null) return layoutConfiguredParagraph(object, measureText, paragraph);
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

// Opt-in horizontal layout contract. No native metadata or renderer activation.
// The no-option branch above deliberately retains the exact legacy result shape.
function layoutConfiguredParagraph(object, measureText, paragraph) {
  try { paragraph = normalizeParagraph(paragraph, object); }
  catch (error) {
    const code = error.code === 'TEXT_PARAGRAPH_INVALID' ? 'PARAGRAPH_OPTIONS_INVALID' : error.code?.replace(/^TEXT_/, '');
    fail(code || 'PARAGRAPH_OPTIONS_INVALID');
  }
  if (measureText != null && typeof measureText !== 'function') fail('MEASURE_INVALID');
  // No bidi ordering/shaping authority is introduced by this LTR-only slice.
  if (/[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(String(object.text ?? ''))) fail('PARAGRAPH_BIDI_UNSUPPORTED');
  const align = paragraph.align ?? object.paragraphAlign ?? 'left';
  const lastLineAlign = paragraph.lastLineAlign ?? 'left';
  if (!['left', 'center', 'right', 'justify'].includes(align)) fail('PARAGRAPH_ALIGN_INVALID');
  const { indentLeft = 0, indentRight = 0, indentFirstLine = 0 } = paragraph;
  const width = +object.textBox.width, height = +object.textBox.height;
  const availableWidth = width - indentLeft - indentRight;
  const firstWidth = availableWidth - indentFirstLine;
  if (align === 'justify' && typeof measureText !== 'function') fail('MEASURE_REQUIRED');
  const fontSize = positive(object.fontSize, 32);
  const lineHeight = positive(object.lineHeight, 1.25) * fontSize;
  const rawLines = [];
  let sourceStart = 0;
  for (const [paragraphIndex, sourceText] of String(object.text ?? '').split('\n').entries()) {
    const normalized = sourceText.trim().split(/\s+/).filter(Boolean).join(' ');
    // Existing token splitting is code-point based. Fail instead of splitting a
    // combining/ZWJ grapheme when the opted-in layout would need a token break.
    for (const token of normalized.split(' ')) {
      if (measure(token, object, measureText) <= Math.min(firstWidth, availableWidth)) continue;
      if (typeof Intl?.Segmenter !== 'function') fail('PARAGRAPH_GRAPHEME_UNSUPPORTED');
      const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(token);
      if (Array.from(segments).some(({ segment }) => Array.from(segment).length > 1)) fail('PARAGRAPH_GRAPHEME_UNSUPPORTED');
    }
    let texts = wrapParagraph(sourceText, availableWidth, object, measureText);
    if (firstWidth !== availableWidth) {
      const first = wrapParagraph(sourceText, firstWidth, object, measureText)[0];
      const rest = normalized.slice(first.length).trimStart();
      texts = [first, ...(rest ? wrapParagraph(rest, availableWidth, object, measureText) : [])];
    }
    texts.forEach((text, lineInParagraph) => rawLines.push({
      text, paragraphIndex, lineInParagraph,
      isParagraphLastLine: lineInParagraph === texts.length - 1,
      sourceParagraph: { start: sourceStart, end: sourceStart + sourceText.length, text: sourceText },
      availableWidth: lineInParagraph === 0 ? firstWidth : availableWidth,
      left: indentLeft + (lineInParagraph === 0 ? indentFirstLine : 0)
    }));
    sourceStart += sourceText.length + 1;
  }
  const maxLines = Math.max(0, Math.floor((height + 1e-9) / lineHeight));
  const lines = rawLines.slice(0, maxLines).map((line, index) => {
    const naturalWidth = measure(line.text, object, measureText);
    const effectiveAlign = align === 'justify' && line.isParagraphLastLine ? lastLineAlign : align;
    const remainder = line.availableWidth - naturalWidth;
    const extra = Math.max(0, remainder);
    const words = line.text.split(' ');
    const applied = effectiveAlign === 'justify' && words.length > 1 && extra > 0;
    const x = line.left + (effectiveAlign === 'center' ? remainder / 2 : effectiveAlign === 'right' ? remainder : 0);
    const y = index * lineHeight, baseline = (index + 1) * lineHeight;
    const wordSpacing = applied ? extra / (words.length - 1) : 0;
    let spans = [{ text: line.text, x, y, baseline, width: naturalWidth }];
    if (applied) {
      const spaceWidth = measure(' ', object, measureText);
      const widths = words.map(word => measure(word, object, measureText));
      const summed = widths.reduce((sum, value) => sum + value, 0) + (words.length - 1) * spaceWidth;
      if (Math.abs(summed - naturalWidth) > 1e-7 * Math.max(1, naturalWidth)) fail('MEASURE_NON_ADDITIVE');
      let cursor = x;
      spans = words.map((text, wordIndex) => {
        const span = { text, x: cursor, y, baseline, width: widths[wordIndex] };
        cursor += widths[wordIndex] + spaceWidth + wordSpacing;
        return span;
      });
    }
    const { left, ...context } = line;
    return { ...context, index, width: naturalWidth, x, y, baseline,
      paintWidth: applied ? line.availableWidth : naturalWidth,
      horizontalOverflow: naturalWidth > line.availableWidth,
      effectiveAlign, justification: { applied, wordSpacing }, spans };
  });
  return {
    mode: 'paragraph', box: { width, height }, align, lineHeight, lines,
    overflow: rawLines.length > lines.length,
    hiddenLineCount: Math.max(0, rawLines.length - lines.length),
    horizontalOverflow: lines.some(line => line.horizontalOverflow),
    measurement: measureText ? 'CALLBACK' : 'APPROXIMATE',
    paragraph: { align, indentLeft, indentRight, indentFirstLine, lastLineAlign }
  };
}

// The same paragraph composer provides line breaking/alignment. This extension
// only turns its measured spans into mapped grapheme placements and decoration
// geometry; callers must consume these placements in paint, bounds and export.
function layoutGlyphTypography(source, { measureText, paragraph, fontMetrics }) {
  const object = normalizeTextTypography({ ...source });
  if (typeof measureText !== 'function') typographyFail('MEASURE_REQUIRED');
  const text = String(object.text ?? '');
  // Supported LTR slices only. No hidden bidi/Indic/Arabic shaping fallback.
  if (!/^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Common}\p{Script=Inherited}]*$/u.test(text) || /[\u0590-\u08ff\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(text)) typographyFail('SHAPING_UNSUPPORTED');
  if (text.split('\n').some(line => line !== line.trim() || /\s{2}|[^\S ]/u.test(line))) typographyFail('SOURCE_WHITESPACE_UNSUPPORTED');
  const presentation = object.textPresentation || {};
  const tracking = object.tracking ?? 0;
  const pairs = object.kerningPairs || [], runs = object.textRuns || [];
  const mapped = [];
  let displayText = '';
  for (const grapheme of textGraphemes(text)) {
    const display = presentation.case === 'upper' ? grapheme.text.toUpperCase() : grapheme.text;
    for (const glyph of textGraphemes(display)) {
      mapped.push({ text: glyph.text, displayStart: displayText.length + glyph.start,
        displayEnd: displayText.length + glyph.end, sourceStart: grapheme.start, sourceEnd: grapheme.end });
    }
    displayText += display;
  }
  const rawWidth = value => measure(value, object, measureText);
  const measured = value => {
    const glyphs = textGraphemes(value);
    const widths = glyphs.map(g => rawWidth(g.text));
    const whole = rawWidth(value), sum = widths.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - whole) > 1e-7 * Math.max(1, whole)) typographyFail('SHAPING_NON_ADDITIVE_UNSUPPORTED');
    if (widths.slice(0, -1).some(w => w + tracking <= 0)) typographyFail('TRACKING_ADVANCE_INVALID');
    const total = whole + Math.max(0, glyphs.length - 1) * tracking;
    if (!Number.isFinite(total) || total < 0) typographyFail('TRACKING_ADVANCE_INVALID');
    return total;
  };
  const displayObject = { ...object, text: displayText };
  const alignment = paragraph?.align ?? object.paragraphAlign ?? 'left';
  if (alignment === 'justify' && tracking !== 0) typographyFail('TRACKING_JUSTIFY_UNSUPPORTED');
  if (alignment === 'justify' && (presentation.underline || presentation.strikethrough)) typographyFail('DECORATION_JUSTIFY_UNSUPPORTED');
  const result = layoutConfiguredParagraph(displayObject, value => measured(value), paragraph ?? {});
  const wrapped = result.lines.some(line => line.lineInParagraph > 0) || result.overflow;
  if (pairs.length && (wrapped || result.align === 'justify')) typographyFail('PAIR_WRAP_JUSTIFY_UNSUPPORTED');
  if (pairs.length && presentation.case === 'upper' && displayText.length !== text.length) typographyFail('PAIR_CASE_MAPPING_UNSUPPORTED');
  const decorations = [];
  const metrics = {};
  for (const [enabled, position] of [['underline', 'underlinePosition'], ['strikethrough', 'strikePosition']]) {
    if (!presentation[enabled]) continue;
    const value = fontMetrics?.[position], thickness = fontMetrics?.decorationThickness;
    if (typeof value !== 'number' || !Number.isFinite(value) || typeof thickness !== 'number' || !Number.isFinite(thickness) || thickness <= 0) typographyFail('FONT_METRICS_REQUIRED');
    metrics[enabled] = { position: value, thickness };
  }
  let searchFrom = 0;
  const lines = result.lines.map(line => {
    const spans = [];
    let pairDelta = 0;
    for (const span of line.spans) {
      const start = displayText.indexOf(span.text, searchFrom);
      if (start < 0) typographyFail('SOURCE_MAPPING_UNSUPPORTED');
      const end = start + span.text.length;
      const glyphs = mapped.filter(g => g.displayStart >= start && g.displayEnd <= end && g.text !== '\n');
      if (glyphs.map(g => g.text).join('') !== span.text) typographyFail('SOURCE_MAPPING_UNSUPPORTED');
      let x = span.x + pairDelta;
      glyphs.forEach((glyph, index) => {
        const width = rawWidth(glyph.text);
        const run = runs.find(r => r.start <= glyph.sourceStart && r.end >= glyph.sourceEnd);
        const baselineShift = run?.baselineShift ?? 0;
        const pair = pairs.find(p => p.start === glyph.sourceStart && glyph.sourceEnd < p.end);
        const adjustment = pair?.adjustment ?? 0;
        const gap = index < glyphs.length - 1 ? tracking : 0;
        const advance = width + gap + adjustment;
        if (!Number.isFinite(advance) || advance < 0 || (index < glyphs.length - 1 && advance <= 0)) typographyFail('PAIR_ADVANCE_INVALID');
        spans.push({ ...glyph, x, y: line.y - baselineShift, baseline: line.baseline - baselineShift,
          width, advance, baselineShift, runId: run?.id ?? null });
        x += advance; pairDelta += adjustment;
      });
      searchFrom = end;
    }
    // Negative pair adjustments must also move centered/right-aligned content.
    const correction = line.effectiveAlign === 'center' ? -pairDelta / 2 : line.effectiveAlign === 'right' ? -pairDelta : 0;
    for (const span of spans) span.x += correction;
    for (const span of spans) for (const [kind, metric] of Object.entries(metrics)) {
      decorations.push({ kind, x: span.x, y: span.baseline + metric.position,
        width: span.advance, thickness: metric.thickness, sourceStart: span.sourceStart, sourceEnd: span.sourceEnd });
    }
    const width = line.width + pairDelta;
    if (!Number.isFinite(width) || width < 0) typographyFail('PAIR_ADVANCE_INVALID');
    const sourceParagraphs = text.split('\n');
    const paragraphStart = sourceParagraphs.slice(0, line.paragraphIndex).reduce((sum, p) => sum + p.length + 1, 0);
    return { ...line, sourceParagraph: { start: paragraphStart, end: paragraphStart + sourceParagraphs[line.paragraphIndex].length, text: sourceParagraphs[line.paragraphIndex] }, x: line.x + correction, width,
      paintWidth: line.paintWidth + pairDelta, horizontalOverflow: width > line.availableWidth, spans };
  });
  if (lines.some(line => !Number.isFinite(line.width) || line.spans.some(span => ![span.x, span.y, span.baseline, span.width, span.advance].every(Number.isFinite))) ||
      decorations.some(d => ![d.x, d.y, d.width, d.thickness].every(Number.isFinite))) typographyFail('GEOMETRY_INVALID');
  return { ...result, lines, horizontalOverflow: lines.some(l => l.horizontalOverflow), decorations,
    sourceObjectId: source.id ?? null, sourceText: text, displayText,
    sourceRangeUnit: 'UTF16', measurement: 'CALLBACK_ADDITIVE_GRAPHEME_ONLY',
    consumerIntegration: 'MR_PENDING' };
}

export function layoutVerticalText(object) {
  assertTextObject(object);
  if (hasGlyphTypography(object) || object.paragraph != null) typographyFail('TYPOGRAPHY_MODE_UNSUPPORTED');
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
  if (hasGlyphTypography(object) || object.paragraph != null) typographyFail('TYPOGRAPHY_MODE_UNSUPPORTED');
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

