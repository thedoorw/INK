// Character-only adapters to the existing canonical TextObject typography fields.
// No parallel storage, shaping rules, document version or command owner.
const finiteShift = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1000;
const simpleLine = o => Boolean(o?.type === 'text' && o.textBox &&
  typeof o.text === 'string' && o.text.length && !/[\r\n]/u.test(o.text));

export function baselineAvailable(o) {
  if (!simpleLine(o)) return false;
  const runs = o.textRuns || [];
  return Array.isArray(runs) && (runs.length === 0 ||
    (runs.length === 1 && runs[0].start === 0 && runs[0].end === o.text.length));
}

export function baselinePatch(o, shift) {
  if (!baselineAvailable(o) || !finiteShift(shift)) return null;
  const old = o.textRuns?.[0];
  return { textRuns: shift === 0 ? null : [
    { id: old?.id || 'character-whole-line', start: 0, end: o.text.length, baselineShift: shift }
  ] };
}

// Manual kerning addresses one supported source-indexed adjacent ASCII pair.
// The existing TextObject validator and Native measure/paint preflight decide
// whether that pair can actually be shaped without fallback.
export function eligibleKerningPairs(o) {
  if (!simpleLine(o) || /\s/u.test(o.text)) return [];
  const output = [];
  for (let i = 0; i < o.text.length - 1; i++) {
    const pair = o.text.slice(i, i + 2);
    if (/^[!-~]{2}$/u.test(pair)) output.push({ start: i, text: pair });
  }
  return output;
}

export function kerningPairPatch(o, start, adjustment) {
  if (!Number.isInteger(start) || !finiteShift(adjustment) ||
      !eligibleKerningPairs(o).some(p => p.start === start)) return null;
  const old = o.kerningPairs || [];
  if (!Array.isArray(old)) return null;
  const pairs = old.filter(p => p.start !== start);
  if (adjustment !== 0) pairs.push({ start, end: start + 2, adjustment });
  pairs.sort((a, b) => a.start - b.start);
  return { kerningPairs: pairs.length ? pairs : null };
}
