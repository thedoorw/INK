import { layoutParagraphText } from './text-layout.js';
import { hasGlyphTypography } from './text-typography.js';

const failure = code => {
  throw Object.assign(new Error(code), { code });
};

/**
 * Shared opt-in text placement source for Canvas drawing, local bounds and SVG.
 * Legacy no-opt-in and path text preserve the original renderer paths.
 * Advanced glyph positioning needs additive actual font measurement, not a
 * reconstructed second line breaker or silent fallback.
 *
 * Decoration placement is supported only when the caller supplies verified
 * fontMetrics. Canvas 2D TextMetrics does not expose canonical underline or
 * strike thickness/positions; do not guess from fontSize.
 */
export function resolveConfiguredParagraphPlacement(object, context, { fontMetrics = null } = {}) {
  const glyphMode = hasGlyphTypography(object);
  if (object?.type !== 'text' || !object.textBox || (!glyphMode && object.paragraph == null)) return null;
  if (typeof context?.measureText !== 'function' || typeof context?.save !== 'function' || typeof context?.restore !== 'function') {
    failure('TEXT_MEASURE_CONTEXT_UNAVAILABLE');
  }
  const fontSize = Number(object.fontSize) > 0 ? Number(object.fontSize) : 32;
  context.save();
  try {
    context.font = `${object.fontWeight || 400} ${fontSize}px ${object.fontFamily || 'system-ui'}`;
    const layout = layoutParagraphText(object, {
      paragraph: object.paragraph ?? null,
      measureText: text => context.measureText(text).width,
      fontMetrics
    });
    const spans = [];
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    const trackBounds = (l, t, r, b) => {
      if (![l, t, r, b].every(Number.isFinite)) failure('TEXT_GEOMETRY_INVALID');
      left = Math.min(left, l);
      right = Math.max(right, r);
      top = Math.min(top, t);
      bottom = Math.max(bottom, b);
    };
    for (const line of layout.lines) {
      for (const source of line.spans) {
        const x = source.x, y = source.baseline - layout.lineHeight;
        const span = {
          ...source, text: source.text, x, y,
          width: source.width, advance: source.advance ?? source.width,
          paragraphIndex: line.paragraphIndex
        };
        if (![x, y, span.width, span.advance].every(Number.isFinite)) failure('TEXT_GEOMETRY_INVALID');
        spans.push(span);
        if (!span.text) continue;
        const ink = context.measureText(span.text);
        if (glyphMode && !['actualBoundingBoxAscent','actualBoundingBoxDescent','actualBoundingBoxLeft','actualBoundingBoxRight'].every(key => Number.isFinite(ink[key]))) {
          failure('TEXT_GLYPH_INK_METRICS_UNAVAILABLE');
        }
        const ascent = Number.isFinite(ink.actualBoundingBoxAscent) ? Math.max(0, ink.actualBoundingBoxAscent) : fontSize * .84;
        const descent = Number.isFinite(ink.actualBoundingBoxDescent) ? Math.max(0, ink.actualBoundingBoxDescent) : fontSize * .16;
        const boxLeft = Number.isFinite(ink.actualBoundingBoxLeft) ? ink.actualBoundingBoxLeft : 0;
        const boxRight = Number.isFinite(ink.actualBoundingBoxRight) ? ink.actualBoundingBoxRight : span.width;
        trackBounds(x - boxLeft, y - ascent, x + boxRight, y + descent);
      }
    }
    const decorations = (layout.decorations || []).map(source => {
      const rect = { ...source, x: source.x, y: source.y - layout.lineHeight };
      if (![rect.x,rect.y,rect.width,rect.thickness].every(Number.isFinite) || rect.width < 0 || rect.thickness <= 0) failure('TEXT_DECORATION_GEOMETRY_INVALID');
      trackBounds(rect.x, rect.y, rect.x + rect.width, rect.y + rect.thickness);
      return rect;
    });
    const bounds = Number.isFinite(left)
      ? { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) }
      : { x: 0, y: -fontSize * .84, w: 1, h: Math.max(1, fontSize) };
    return {
      mode: glyphMode ? 'glyph' : 'paragraph', spans, decorations, bounds,
      overflow: layout.overflow, horizontalOverflow: Boolean(layout.horizontalOverflow),
      layout, status: 'AVAILABLE',
      measurement: glyphMode ? 'CANVAS_ADDITIVE_GRAPHEME_METRICS' : 'CANVAS_CONTEXT_METRICS_NOT_SHAPING_CERTIFIED'
    };
  } finally {
    context.restore();
  }
}
