export function compareRGBA(reference, candidate, { alphaWeight = 1, tolerance = 8 } = {}) {
  if (!reference || !candidate || reference.length !== candidate.length || reference.length % 4 !== 0) {
    return { comparable: false, passed: false, pixels: 0, meanAbsoluteError: Infinity, maxError: Infinity, mismatchRatio: 1 };
  }
  let total = 0, maxError = 0, mismatches = 0;
  const pixels = reference.length / 4;
  for (let i = 0; i < reference.length; i += 4) {
    const dr = Math.abs(reference[i] - candidate[i]);
    const dg = Math.abs(reference[i + 1] - candidate[i + 1]);
    const db = Math.abs(reference[i + 2] - candidate[i + 2]);
    const da = Math.abs(reference[i + 3] - candidate[i + 3]) * alphaWeight;
    const error = (dr + dg + db + da) / (3 + alphaWeight);
    total += error;
    maxError = Math.max(maxError, dr, dg, db, da);
    if (error > tolerance) mismatches++;
  }
  const meanAbsoluteError = total / pixels;
  const mismatchRatio = mismatches / pixels;
  return { comparable: true, passed: meanAbsoluteError <= tolerance && mismatchRatio <= .08, pixels, meanAbsoluteError, maxError, mismatchRatio, tolerance };
}
