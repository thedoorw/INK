import { documentFingerprint, fnv1a32, stableStringify } from '../document/integrity.js';
import {
  INK_OUTPUT_HANDLE_SCHEMA,
  INK_OUTPUT_HANDLE_VERSION
} from './output-handle-registry.js';

const FINGERPRINT_ALGORITHM = 'fnv1a32-canonical-json+fnv1a32-bytes-v1';

function fail(code, details = {}) {
  throw Object.assign(new Error(code), { code, ...details });
}

function activePage(app) {
  if (typeof app?.page === 'function') {
    try { return app.page(); } catch {}
  }
  return app?.doc?.pages?.find(page => page.id === app?.doc?.activePageId) || app?.doc?.pages?.[0] || null;
}

function currentRevisionId(app) {
  try { return app?.revisions?.revisionIdFor?.(app?.doc?.id) ?? null; }
  catch { return null; }
}

function finiteNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) fail('INK_EXPORT_ARGUMENT_INVALID', { value });
  return number;
}

function booleanValue(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'boolean') fail('INK_EXPORT_ARGUMENT_INVALID', { value });
  return value;
}

function normalizeOptions(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INK_EXPORT_ARGUMENT_INVALID');
  const format = String(input.format || '').trim().toLowerCase();
  if (!['png', 'svg', 'pdf'].includes(format)) fail('INK_EXPORT_FORMAT_UNSUPPORTED', { format });
  const scope = String(input.scope || 'artboard').trim().toLowerCase();
  if (!['artboard', 'viewport', 'content'].includes(scope)) fail('INK_EXPORT_SCOPE_UNSUPPORTED', { scope });
  if (format === 'pdf' && scope !== 'artboard') fail('INK_EXPORT_PDF_SCOPE_UNSUPPORTED', { scope });
  return {
    format,
    scope,
    scale: finiteNumber(input.scale, 2, { min: 0.01, max: 64 }),
    ppi: finiteNumber(input.ppi, 300, { min: 36, max: 2400 }),
    includeBleed: booleanValue(input.includeBleed, false),
    cropMarks: booleanValue(input.cropMarks, false),
    background: booleanValue(input.background, true)
  };
}

function historyState(app) {
  return {
    undo: Array.isArray(app?.history?.undoStack) ? app.history.undoStack.length : null,
    redo: Array.isArray(app?.history?.redoStack) ? app.history.redoStack.length : null,
    pending: app?.history?.pending ?? null
  };
}

function sameHistory(a, b) {
  return a.undo === b.undo && a.redo === b.redo && a.pending === b.pending;
}

function currentIdentity(app) {
  return {
    documentId: app?.doc?.id || null,
    pageId: activePage(app)?.id || null,
    revisionId: currentRevisionId(app),
    documentFingerprint: app?.doc ? documentFingerprint(app.doc) : null,
    history: historyState(app)
  };
}

async function bytesForBlob(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function') fail('INK_EXPORT_PAYLOAD_INVALID');
  return new Uint8Array(await blob.arrayBuffer());
}

function fnv1a32Bytes(bytes) {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function assertIdentityUnchanged(before, after) {
  if (
    before.documentId !== after.documentId
    || before.pageId !== after.pageId
    || before.revisionId !== after.revisionId
    || before.documentFingerprint !== after.documentFingerprint
    || !sameHistory(before.history, after.history)
  ) {
    fail('INK_EXPORT_STATE_MUTATED');
  }
}

function pixelSizeFor(app, format) {
  if (format !== 'png') return null;
  const report = app?.lastPNGExportReport;
  const width = Number(report?.width);
  const height = Number(report?.height);
  return Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0
    ? { width, height }
    : null;
}

function physicalSizeFor(app, scope) {
  if (scope !== 'artboard') return null;
  const artboard = activePage(app)?.artboard;
  const widthMm = Number(artboard?.widthMm);
  const heightMm = Number(artboard?.heightMm);
  return Number.isFinite(widthMm) && widthMm > 0 && Number.isFinite(heightMm) && heightMm > 0
    ? { widthMm, heightMm }
    : null;
}

export async function exportInkAsset(app, registry, input = {}) {
  if (!app?.doc) fail('INK_EXPORT_DOCUMENT_UNAVAILABLE');
  if (!registry || typeof registry.store !== 'function') fail('INK_OUTPUT_REGISTRY_UNAVAILABLE');

  const options = normalizeOptions(input);
  const authority = options.format === 'png'
    ? app?.exportPNG
    : options.format === 'svg'
      ? app?.exportSVG
      : app?.exportPDF;
  if (typeof authority !== 'function') fail('INK_EXPORT_AUTHORITY_UNAVAILABLE', { format: options.format });

  const before = currentIdentity(app);
  if (!before.documentId || !before.pageId || !before.documentFingerprint) fail('INK_EXPORT_IDENTITY_UNAVAILABLE');

  const exportOptions = {
    scope: options.scope,
    scale: options.scale,
    ppi: options.ppi,
    includeBleed: options.includeBleed,
    cropMarks: options.cropMarks,
    background: options.background
  };

  let payload;
  let mimeType;
  if (options.format === 'png') {
    payload = await app.exportPNG(exportOptions);
    mimeType = 'image/png';
  } else if (options.format === 'svg') {
    const svg = app.exportSVG(exportOptions);
    if (typeof svg !== 'string') fail('INK_EXPORT_PAYLOAD_INVALID', { format: options.format });
    payload = new Blob([svg], { type: 'image/svg+xml' });
    mimeType = 'image/svg+xml';
  } else {
    payload = await app.exportPDF(exportOptions);
    mimeType = 'application/pdf';
  }

  if (!(payload instanceof Blob)) fail('INK_EXPORT_PAYLOAD_INVALID', { format: options.format });
  const after = currentIdentity(app);
  assertIdentityUnchanged(before, after);

  const bytes = await bytesForBlob(payload);
  assertIdentityUnchanged(before, currentIdentity(app));
  const byteFingerprint = 'fnv1a32-bytes:' + fnv1a32Bytes(bytes);
  const pixelSize = pixelSizeFor(app, options.format);
  const physicalSize = physicalSizeFor(app, options.scope);
  const editable = options.format === 'svg';
  const renderFingerprint = 'fnv1a32:' + fnv1a32(stableStringify({
    request: exportOptions,
    format: options.format,
    byteFingerprint,
    pixelSize,
    physicalSize,
    editable
  }));

  const outputIdentity = {
    schema: INK_OUTPUT_HANDLE_SCHEMA,
    version: INK_OUTPUT_HANDLE_VERSION,
    kind: 'asset-export',
    format: options.format,
    mimeType,
    documentId: before.documentId,
    pageId: before.pageId,
    revisionId: before.revisionId,
    documentFingerprint: before.documentFingerprint,
    renderFingerprint,
    fingerprintAlgorithm: FINGERPRINT_ALGORITHM,
    scope: options.scope,
    pixelSize,
    physicalSize,
    editable,
    objectRefs: [],
    byteLength: bytes.byteLength,
    transport: 'INTERNAL_EPHEMERAL',
    persistence: 'NONE'
  };
  const handleId = 'ink-output-v1:' + fnv1a32(stableStringify(outputIdentity));
  const handle = Object.freeze({
    schema: INK_OUTPUT_HANDLE_SCHEMA,
    version: INK_OUTPUT_HANDLE_VERSION,
    handleId,
    ...outputIdentity
  });
  const storedHandle = registry.store(handle, payload);

  return {
    handle: storedHandle,
    result: {
      handleId: storedHandle.handleId,
      format: storedHandle.format,
      mimeType: storedHandle.mimeType,
      byteLength: storedHandle.byteLength,
      scope: storedHandle.scope,
      pixelSize: storedHandle.pixelSize,
      physicalSize: storedHandle.physicalSize,
      editable: storedHandle.editable,
      documentId: storedHandle.documentId,
      pageId: storedHandle.pageId,
      transport: storedHandle.transport,
      persistence: storedHandle.persistence
    }
  };
}
