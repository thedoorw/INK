import { documentFingerprint, inspectDocument } from '../document/integrity.js';
import { readPreviewPixels, pixelFingerprint, renderPixelPreview } from './pixel-preview.js';
import { compareRGBA } from '../render/pixel-compare.js';
import { PNGWorkerEncoder } from '../export/png-worker-encoder.js';

const clock = () => globalThis.performance.now();
const fail = code => { throw new Error(`INK_ARTWORK_${code}`); };
function identity(app) {
  if (!app?.doc || app.documentOpen === false) fail('DOCUMENT_UNAVAILABLE');
  return { documentId: app.doc.id, pageId: app.page().id, documentFingerprint: documentFingerprint(app.doc) };
}
function assertCurrent(app, expected) {
  const actual = identity(app);
  if (actual.documentId !== expected.documentId || actual.pageId !== expected.pageId || actual.documentFingerprint !== expected.documentFingerprint) fail('SOURCE_CHANGED');
}
function assertCapture(capture) {
  if (capture?.format !== 'INK-ARTWORK-CAPTURE' || !capture.identity || !capture.canvas) fail('CAPTURE_REQUIRED');
  const pixels = readPreviewPixels(capture.canvas);
  if (capture.width !== pixels.width || capture.height !== pixels.height || capture.pixelFingerprint !== pixelFingerprint(pixels.data)) fail('CAPTURE_CHANGED');
  return pixels;
}

export async function captureArtworkPreview(app, options = {}) {
  const source = identity(app), started = clock();
  // Low-resolution preview by default. Export itself retains the existing renderer's limits.
  const settings = { scope: 'artboard', ppi: 72, background: true, ...options };
  await globalThis.document.fonts?.ready;
  let canvas = await app.renderExportCanvas(settings);
  try {
    // The normal renderer starts image loading on first draw. Do not certify its placeholder.
    const images = [...(app.renderer?.imageCache?.values() || [])];
    const pending = images.filter(image => !image.complete);
    if (pending.length) {
      let timer;
      try {
        await Promise.race([
          Promise.all(pending.map(image => image.decode())),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('INK_ARTWORK_IMAGE_TIMEOUT')), 10000); })
        ]);
      } finally { clearTimeout(timer); }
      canvas.width = canvas.height = 1;
      assertCurrent(app, source);
      canvas = await app.renderExportCanvas(settings);
    }
    if (images.some(image => !image.complete || !image.naturalWidth)) fail('IMAGE_UNAVAILABLE');
    assertCurrent(app, source);
    const pixels = readPreviewPixels(canvas);
    return { format: 'INK-ARTWORK-CAPTURE', version: 1, identity: source, options: settings, width: canvas.width, height: canvas.height, physical: canvas.inkPhysical || null, pixelFingerprint: pixelFingerprint(pixels.data), renderTimeMs: clock() - started, canvas, dispose() { canvas.width = canvas.height = 1; } };
  } catch (error) { canvas.width = canvas.height = 1; throw error; }
}

export async function compareArtworkPreview(app, before, options = {}) {
  assertCapture(before);
  const current = identity(app);
  if (before.identity.documentId !== current.documentId || before.identity.pageId !== current.pageId) fail('CAPTURE_IDENTITY_MISMATCH');
  const after = await captureArtworkPreview(app, before.options);
  try {
    const preview = renderPixelPreview(before.canvas, after.canvas, options);
    preview.report.subjects = { before: before.identity, after: after.identity };
    preview.report.rendererInvoked = true;
    return preview;
  } finally { after.dispose(); }
}

// Actual current artwork -> authoritative render -> encoded PNG -> decoded pixel QA.
// This is software/export QA, not botanical, stylistic or USER visual acceptance.
export async function runArtworkQA(app, { captureOptions = {}, reference = null, tolerance = 8, signal = null } = {}) {
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255) fail('TOLERANCE_INVALID');
  const source = identity(app), integrity = inspectDocument(app.doc), started = clock();
  if (!integrity.passed) fail('DOCUMENT_INVALID');
  if (signal?.aborted) fail('CANCELLED');
  const capture = await captureArtworkPreview(app, captureOptions);
  let bitmap, decodedCanvas;
  try {
    const pixels = assertCapture(capture), encodeStarted = clock();
    const { blob, report: encoding } = await (app.pngWorkerEncoder || new PNGWorkerEncoder()).encode(capture.canvas, { signal });
    if (!blob?.size || blob.type !== 'image/png') fail('PNG_EMPTY_OR_INVALID');
    const exportTimeMs = clock() - encodeStarted;
    bitmap = await globalThis.createImageBitmap(blob);
    decodedCanvas = globalThis.document.createElement('canvas');
    decodedCanvas.width = bitmap.width; decodedCanvas.height = bitmap.height;
    decodedCanvas.getContext('2d').drawImage(bitmap, 0, 0);
    const decoded = readPreviewPixels(decodedCanvas);
    const roundtrip = compareRGBA(pixels.data, decoded.data, { tolerance: 0 });
    const dimensionsMatch = bitmap.width === capture.width && bitmap.height === capture.height;
    let referenceComparison = null;
    if (reference) {
      const referencePixels = assertCapture(reference);
      if (reference.identity.documentId !== source.documentId || reference.identity.pageId !== source.pageId || referencePixels.width !== pixels.width || referencePixels.height !== pixels.height) fail('REFERENCE_MISMATCH');
      referenceComparison = compareRGBA(referencePixels.data, pixels.data, { tolerance });
    }
    assertCurrent(app, source);
    if (signal?.aborted) fail('CANCELLED');
    const report = {
      format: 'INK-ARTWORK-QA-REPORT', version: 1, identity: source,
      passed: dimensionsMatch && roundtrip.passed && (!referenceComparison || referenceComparison.passed),
      scope: 'CURRENT_ARTWORK_RENDER_AND_PNG_EXPORT',
      source: { integrityPassed: integrity.passed, stats: integrity.stats },
      render: { width: capture.width, height: capture.height, physical: capture.physical, options: capture.options, pixelFingerprint: capture.pixelFingerprint },
      export: { type: blob.type, bytes: blob.size, encoding, dimensionsMatch, decodedPixelFingerprint: pixelFingerprint(decoded.data), roundtrip },
      referenceComparison,
      benchmark: { renderTimeMs: capture.renderTimeMs, exportTimeMs, totalTimeMs: clock() - started, repetitions: 1, synthetic: false },
      visualAcceptance: 'NOT_ASSESSED'
    };
    return { report, pngBlob: blob, reportBlob: new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' }) };
  } finally {
    bitmap?.close();
    if (decodedCanvas) decodedCanvas.width = decodedCanvas.height = 1;
    capture.dispose();
  }
}

export function installArtworkReview(InkApp) {
  InkApp.prototype.captureArtworkPreview = function (options) { return captureArtworkPreview(this, options); };
  InkApp.prototype.compareArtworkPreview = function (before, options) { return compareArtworkPreview(this, before, options); };
  InkApp.prototype.runArtworkQA = function (options) { return runArtworkQA(this, options); };
}
