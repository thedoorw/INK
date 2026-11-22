// Text-only validation and source-range policy, shared by model and layout.
export function typographyFail(code) {
  throw Object.assign(new Error(`INK_TEXT_${code}`), { code: `TEXT_${code}` });
}

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export const TYPOGRAPHY_FIELDS = ['paragraph', 'textPresentation', 'tracking', 'kerningPairs', 'textRuns'];
export function hasTextTypography(o) {
  return TYPOGRAPHY_FIELDS.some(key => o?.[key] != null);
}
export function hasGlyphTypography(o) {
  return TYPOGRAPHY_FIELDS.slice(1).some(key => o?.[key] != null);
}
function record(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) typographyFail(code);
}
export function strictTextBox(box) {
  if (!box || !['width', 'height'].every(key => typeof box[key] === 'number' && Number.isFinite(box[key]) && box[key] > 0)) typographyFail('TEXT_BOX_INVALID');
}
export function normalizeParagraph(value, object) {
  record(value, ['align', 'lastLineAlign', 'indentLeft', 'indentRight', 'indentFirstLine'], 'PARAGRAPH_INVALID');
  strictTextBox(object.textBox);
  if ((object.writingMode && object.writingMode !== 'horizontal-tb') || object.pathText) typographyFail('PARAGRAPH_MODE_UNSUPPORTED');
  const out = {};
  for (const key of ['align', 'lastLineAlign']) if (own(value, key)) {
    if (!['left', 'center', 'right', 'justify'].includes(value[key])) typographyFail('PARAGRAPH_ALIGN_INVALID');
    out[key] = value[key];
  }
  for (const key of ['indentLeft', 'indentRight', 'indentFirstLine']) if (own(value, key)) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || (key !== 'indentFirstLine' && value[key] < 0)) typographyFail('PARAGRAPH_INDENT_INVALID');
    out[key] = value[key];
  }
  const width = object.textBox.width - (out.indentLeft ?? 0) - (out.indentRight ?? 0);
  const first = width - (out.indentFirstLine ?? 0);
  if (!Number.isFinite(width) || !Number.isFinite(first) || width <= 0 || first <= 0) typographyFail('PARAGRAPH_INDENT_INVALID');
  return out;
}

export function textGraphemes(text) {
  if (typeof Intl?.Segmenter !== 'function') typographyFail('GRAPHEME_UNSUPPORTED');
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), ({ segment, index }) => ({ text: segment, start: index, end: index + segment.length }));
}

function ranges(value, text, pairs) {
  if (!Array.isArray(value)) typographyFail('RANGES_INVALID');
  const glyphs = textGraphemes(text), boundaries = new Set([0, text.length, ...glyphs.map(g => g.start)]);
  const ids = new Set();
  let previousEnd = 0, previousStart = -1;
  return value.map(item => {
    record(item, pairs ? ['start', 'end', 'adjustment'] : ['id', 'start', 'end', 'baselineShift'], 'RANGES_INVALID');
    const { start, end } = item;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || !boundaries.has(start) || !boundaries.has(end)) typographyFail('RANGE_BOUNDARY_INVALID');
    if (pairs ? start <= previousStart : start < previousEnd) typographyFail('RANGE_OVERLAP');
    previousStart = start; previousEnd = end;
    const fragment = text.slice(start, end);
    if (/[\r\n]/u.test(fragment)) typographyFail('RANGE_NEWLINE_UNSUPPORTED');
    const key = pairs ? 'adjustment' : 'baselineShift';
    const number = item[key] ?? (pairs ? NaN : 0);
    if (typeof number !== 'number' || !Number.isFinite(number)) typographyFail('RANGE_VALUE_INVALID');
    if (pairs) {
      // Manual adjustment of exactly two adjacent printable Latin/ASCII glyphs.
      if (end - start !== 2 || !/^[!-~]{2}$/u.test(fragment)) typographyFail('PAIR_SHAPING_UNSUPPORTED');
      return { start, end, adjustment: number };
    }
    if (typeof item.id !== 'string' || !item.id || ids.has(item.id)) typographyFail('RUN_ID_INVALID');
    ids.add(item.id);
    return { id: item.id, start, end, baselineShift: number };
  });
}

export function normalizeTextTypography(object) {
  if (object.paragraph != null) object.paragraph = normalizeParagraph(object.paragraph, object);
  if (!hasGlyphTypography(object)) return object;
  strictTextBox(object.textBox);
  const lineHeight = Number(object.fontSize ?? 32) * Number(object.lineHeight ?? 1.25);
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) typographyFail('FONT_GEOMETRY_INVALID');
  if ((object.writingMode && object.writingMode !== 'horizontal-tb') || object.pathText) typographyFail('TYPOGRAPHY_MODE_UNSUPPORTED');
  if (object.tracking != null && (typeof object.tracking !== 'number' || !Number.isFinite(object.tracking))) typographyFail('TRACKING_INVALID');
  if (object.textPresentation != null) {
    const p = object.textPresentation;
    record(p, ['case', 'underline', 'strikethrough', 'smallCaps'], 'PRESENTATION_INVALID');
    if (own(p, 'case') && !['none', 'upper'].includes(p.case)) typographyFail('PRESENTATION_INVALID');
    for (const key of ['underline', 'strikethrough', 'smallCaps']) if (own(p, key) && typeof p[key] !== 'boolean') typographyFail('PRESENTATION_INVALID');
    if (p.smallCaps) typographyFail('SMALL_CAPS_UNSUPPORTED');
    object.textPresentation = { ...p };
  }
  if (object.textRuns != null) object.textRuns = ranges(object.textRuns, String(object.text ?? ''), false);
  if (object.kerningPairs != null) object.kerningPairs = ranges(object.kerningPairs, String(object.text ?? ''), true);
  return object;
}
