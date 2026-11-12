// Composites snapshots produced by the existing artwork renderer. No document mutation.
import { compareRGBA } from '../render/pixel-compare.js';

const MODES = new Set(['side-by-side', 'wipe', 'overlay', 'difference']);
const MAX_PIXELS = 4_000_000;
const ratio = (value, name) => {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`INK_PREVIEW_${name}_INVALID`);
  return value;
};
export function readPreviewPixels(canvas) {
  if (!Number.isInteger(canvas?.width) || !Number.isInteger(canvas?.height) || canvas.width < 1 || canvas.height < 1 || canvas.width * canvas.height > MAX_PIXELS) throw new Error('INK_PREVIEW_SIZE_INVALID');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('INK_PREVIEW_CONTEXT_UNAVAILABLE');
  return context.getImageData(0, 0, canvas.width, canvas.height);
}
export function pixelFingerprint(data) {
  let hash = 0x811c9dc5;
  for (const value of data) hash = Math.imul(hash ^ value, 0x01000193);
  return `fnv1a32-rgba:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function renderPixelPreview(before, after, { mode = 'side-by-side', position = .5, opacity = .5, canvas = null, tolerance = 8 } = {}) {
  if (!MODES.has(mode)) throw new Error('INK_PREVIEW_MODE_UNSUPPORTED');
  ratio(position, 'POSITION'); ratio(opacity, 'OPACITY');
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255) throw new Error('INK_PREVIEW_TOLERANCE_INVALID');
  if (before === canvas || after === canvas) throw new Error('INK_PREVIEW_OUTPUT_ALIASES_INPUT');
  const a = readPreviewPixels(before), b = readPreviewPixels(after);
  if (a.width !== b.width || a.height !== b.height) throw new Error('INK_PREVIEW_DIMENSION_MISMATCH');
  const outputWidth = a.width * (mode === 'side-by-side' ? 2 : 1);
  if (outputWidth * a.height > MAX_PIXELS) throw new Error('INK_PREVIEW_SIZE_INVALID');
  const output = canvas || globalThis.document.createElement('canvas');
  output.width = outputWidth; output.height = a.height;
  const context = output.getContext('2d');
  if (!context) throw new Error('INK_PREVIEW_CONTEXT_UNAVAILABLE');
  const image = context.createImageData(output.width, output.height);
  const report = { mode, width: output.width, height: output.height, renderingExecuted: true, pixelCaptureExecuted: true, position, opacity, comparison: compareRGBA(a.data, b.data, { tolerance }) };
  function draw() {
    const split = Math.round(a.width * position);
    for (let y = 0; y < a.height; y++) for (let x = 0; x < output.width; x++) {
      const target = (y * output.width + x) * 4, source = (y * a.width + x % a.width) * 4;
      if (mode === 'overlay') {
        const aa = a.data[source + 3] / 255 * (1 - opacity), ba = b.data[source + 3] / 255 * opacity, alpha = aa + ba;
        for (let c = 0; c < 3; c++) image.data[target + c] = alpha ? (a.data[source + c] * aa + b.data[source + c] * ba) / alpha : 0;
        image.data[target + 3] = alpha * 255;
      } else if (mode === 'difference') {
        // Compare visible premultiplied color; transparent hidden RGB is not visible difference.
        const alphaDifference = Math.abs(a.data[source + 3] - b.data[source + 3]);
        for (let c = 0; c < 3; c++) image.data[target + c] = Math.max(alphaDifference, Math.abs(a.data[source + c] * a.data[source + 3] / 255 - b.data[source + c] * b.data[source + 3] / 255));
        image.data[target + 3] = 255;
      } else {
        const data = mode === 'side-by-side' ? (x < a.width ? a.data : b.data) : (x < split ? a.data : b.data);
        image.data.set(data.subarray(source, source + 4), target);
      }
    }
    context.putImageData(image, 0, 0);
    report.position = position; report.opacity = opacity; report.pixelFingerprint = pixelFingerprint(image.data);
    return report;
  }
  draw();
  return {
    canvas: output, report,
    setPosition(value) { position = ratio(value, 'POSITION'); return draw(); },
    setOpacity(value) { opacity = ratio(value, 'OPACITY'); return draw(); },
    dispose() { output.width = output.height = 1; }
  };
}
