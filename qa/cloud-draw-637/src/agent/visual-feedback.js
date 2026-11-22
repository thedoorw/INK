import { buildAIDocumentBridge } from '../ai/document-bridge.js';
import { artboardExportGeometry } from '../document/artboard.js';
import { documentFingerprint, fnv1a32, stableStringify } from '../document/integrity.js';
import {
  INK_OUTPUT_HANDLE_SCHEMA,
  INK_OUTPUT_HANDLE_VERSION
} from './output-handle-registry.js';

export const INK_PREVIEW_DEFAULT_MAX_DIMENSION = 1200;
export const INK_PREVIEW_HARD_MAX_DIMENSION = 1600;
export const INK_PREVIEW_HARD_MAX_PIXELS = 2560000;
export const INK_PREVIEW_MIME_TYPE = 'image/png';

const MAX_OBJECT_REFS = 32;
const RENDER_FINGERPRINT_ALGORITHM = 'fnv1a32-canonical-json+fnv1a32-bytes-v1';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

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

function finite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail('INK_PREVIEW_GEOMETRY_INVALID', { field, value });
  return number;
}

function boundedNumber(value, digits = 6) {
  const number = finite(value, 'boundedNumber');
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function normalizeBounds(bounds) {
  if (!isRecord(bounds)) fail('INK_PREVIEW_BOUNDS_INVALID');
  const normalized = {
    x: boundedNumber(bounds.x),
    y: boundedNumber(bounds.y),
    w: boundedNumber(bounds.w),
    h: boundedNumber(bounds.h)
  };
  if (normalized.w <= 0 || normalized.h <= 0) fail('INK_PREVIEW_BOUNDS_INVALID', { bounds: normalized });
  return normalized;
}

function normalizeMaxDimension(value) {
  if (value == null) return INK_PREVIEW_DEFAULT_MAX_DIMENSION;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) fail('INK_PREVIEW_MAX_DIMENSION_INVALID', { value });
  return Math.min(INK_PREVIEW_HARD_MAX_DIMENSION, Math.max(1, Math.floor(number)));
}

function normalizeScope(value) {
  const scope = value == null ? 'artboard' : String(value);
  if (!['artboard', 'viewport', 'content'].includes(scope)) fail('INK_PREVIEW_SCOPE_UNSUPPORTED', { scope });
  return scope;
}

function safeScale(baseWidth, baseHeight, requestedScale, maxDimension) {
  const width = Math.max(1e-6, finite(baseWidth, 'baseWidth'));
  const height = Math.max(1e-6, finite(baseHeight, 'baseHeight'));
  const requested = requestedScale == null ? 1 : Number(requestedScale);
  if (!Number.isFinite(requested) || requested <= 0) fail('INK_PREVIEW_SCALE_INVALID', { value: requestedScale });
  const dimensionScale = maxDimension / Math.max(width, height);
  const pixelScale = Math.sqrt(INK_PREVIEW_HARD_MAX_PIXELS / (width * height));
  return Math.max(1e-6, Math.min(requested, dimensionScale, pixelScale));
}

function safeContentScale(baseWidth, baseHeight, requestedScale, maxDimension) {
  const width = Math.max(1e-6, finite(baseWidth, 'baseWidth'));
  const height = Math.max(1e-6, finite(baseHeight, 'baseHeight'));
  let scale = safeScale(width, height, requestedScale, maxDimension);
  if (Math.ceil(width * scale) <= maxDimension && Math.ceil(height * scale) <= maxDimension) return scale;

  const roundingGuard = Math.max(Number.EPSILON * maxDimension * 4, Number.MIN_VALUE);
  const guardedDimensionScale = (maxDimension - roundingGuard) / Math.max(width, height);
  scale = Math.max(1e-6, Math.min(scale, guardedDimensionScale));
  return scale;
}

function plannedPixelSize(scope, plan) {
  if (scope === 'artboard') return { width: plan.geometry.width, height: plan.geometry.height };
  if (scope === 'viewport') {
    return {
      width: Math.max(1, Math.round(plan.baseWidth * plan.scale)),
      height: Math.max(1, Math.round(plan.baseHeight * plan.scale))
    };
  }
  return {
    width: Math.max(1, Math.ceil((plan.baseWidth ?? plan.bounds.w) * plan.scale)),
    height: Math.max(1, Math.ceil((plan.baseHeight ?? plan.bounds.h) * plan.scale))
  };
}

function assertPixelBounds(pixelSize, maxDimension) {
  const width = Number(pixelSize?.width);
  const height = Number(pixelSize?.height);
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    fail('INK_PREVIEW_PIXEL_SIZE_INVALID', { pixelSize });
  }
  if (width > maxDimension || height > maxDimension || width > INK_PREVIEW_HARD_MAX_DIMENSION || height > INK_PREVIEW_HARD_MAX_DIMENSION) {
    fail('INK_PREVIEW_DIMENSION_LIMIT_EXCEEDED', { pixelSize, maxDimension, hardMaxDimension: INK_PREVIEW_HARD_MAX_DIMENSION });
  }
  if (width * height > INK_PREVIEW_HARD_MAX_PIXELS) {
    fail('INK_PREVIEW_PIXEL_LIMIT_EXCEEDED', { pixelSize, hardMaxPixels: INK_PREVIEW_HARD_MAX_PIXELS });
  }
}

function previewPlan(app, options = {}) {
  if (!app?.doc) fail('INK_PREVIEW_DOCUMENT_UNAVAILABLE');
  if (typeof app?.renderExportCanvas !== 'function') fail('INK_PREVIEW_RENDER_AUTHORITY_UNAVAILABLE');

  const page = activePage(app);
  if (!page) fail('INK_PREVIEW_PAGE_UNAVAILABLE');

  const scope = normalizeScope(options.scope);
  const maxDimension = normalizeMaxDimension(options.maxDimension);
  const background = options.background !== false;

  if (scope === 'artboard') {
    const artboard = page.artboard || {};
    const widthMm = finite(artboard.widthMm, 'artboard.widthMm');
    const heightMm = finite(artboard.heightMm, 'artboard.heightMm');
    if (widthMm <= 0 || heightMm <= 0) fail('INK_PREVIEW_ARTBOARD_INVALID');
    const requestedPpi = options.ppi == null ? Number(artboard.ppi || 300) : Number(options.ppi);
    if (!Number.isFinite(requestedPpi) || requestedPpi <= 0) fail('INK_PREVIEW_PPI_INVALID', { value: options.ppi });

    const dimensionPpi = maxDimension * 25.4 / Math.max(widthMm, heightMm);
    const areaInches = (widthMm / 25.4) * (heightMm / 25.4);
    const pixelPpi = Math.sqrt(INK_PREVIEW_HARD_MAX_PIXELS / Math.max(areaInches, 1e-9));
    let ppi = Math.max(1e-6, Math.min(requestedPpi, dimensionPpi, pixelPpi));
    let geometry = artboardExportGeometry(page, { ppi, includeBleed: false, cropMarks: false });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const pixels = geometry.width * geometry.height;
      if (geometry.width <= maxDimension && geometry.height <= maxDimension && pixels <= INK_PREVIEW_HARD_MAX_PIXELS) break;
      const correction = Math.min(
        maxDimension / Math.max(geometry.width, geometry.height),
        Math.sqrt(INK_PREVIEW_HARD_MAX_PIXELS / Math.max(1, pixels))
      );
      ppi = Math.max(1e-6, ppi * correction * 0.999);
      geometry = artboardExportGeometry(page, { ppi, includeBleed: false, cropMarks: false });
    }

    const plan = {
      scope,
      maxDimension,
      background,
      ppi,
      geometry,
      bounds: normalizeBounds(geometry.outputBounds)
    };
    const pixelSize = plannedPixelSize(scope, plan);
    assertPixelBounds(pixelSize, maxDimension);
    return {
      ...plan,
      pixelSize,
      renderOptions: {
        scope: 'artboard',
        ppi,
        includeBleed: false,
        cropMarks: false,
        background
      }
    };
  }

  if (!app?.renderer) fail('INK_PREVIEW_RENDERER_UNAVAILABLE');
  if (scope === 'viewport') {
    if (typeof app.renderer.viewportWorldBounds !== 'function') fail('INK_PREVIEW_VIEWPORT_AUTHORITY_UNAVAILABLE');
    const bounds = normalizeBounds(app.renderer.viewportWorldBounds());
    const baseWidth = Math.max(1, finite(app.renderer.width, 'renderer.width'));
    const baseHeight = Math.max(1, finite(app.renderer.height, 'renderer.height'));
    const scale = safeScale(baseWidth, baseHeight, options.scale, maxDimension);
    const plan = { scope, maxDimension, background, bounds, baseWidth, baseHeight, scale };
    const pixelSize = plannedPixelSize(scope, plan);
    assertPixelBounds(pixelSize, maxDimension);
    return {
      ...plan,
      pixelSize,
      renderOptions: {
        scope: 'viewport',
        scale,
        includeBleed: false,
        cropMarks: false,
        background
      }
    };
  }

  if (typeof app.renderer.contentBounds !== 'function') fail('INK_PREVIEW_CONTENT_AUTHORITY_UNAVAILABLE');
  const content = app.renderer.contentBounds() || { x: -200, y: -150, w: 400, h: 300 };
  const pad = 24;
  const rawBounds = {
    x: finite(content.x, 'content.x') - pad,
    y: finite(content.y, 'content.y') - pad,
    w: finite(content.w, 'content.w') + pad * 2,
    h: finite(content.h, 'content.h') + pad * 2
  };
  const bounds = normalizeBounds(rawBounds);
  const baseWidth = rawBounds.w;
  const baseHeight = rawBounds.h;
  const scale = safeContentScale(baseWidth, baseHeight, options.scale, maxDimension);
  const plan = { scope, maxDimension, background, bounds, baseWidth, baseHeight, scale };
  const pixelSize = plannedPixelSize(scope, plan);
  assertPixelBounds(pixelSize, maxDimension);
  return {
    ...plan,
    pixelSize,
    renderOptions: {
      scope: 'content',
      scale,
      includeBleed: false,
      cropMarks: false,
      background
    }
  };
}

function normalizeRefInput(value) {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  if (values.length > MAX_OBJECT_REFS) fail('INK_PREVIEW_REF_LIMIT_EXCEEDED', { maxObjectRefs: MAX_OBJECT_REFS });
  const normalized = [];
  const seen = new Set();
  for (const item of values) {
    let ref = null;
    if (typeof item === 'string' && item.trim()) ref = { objectId: item.trim(), pageId: null, layerId: null };
    else if (isRecord(item) && typeof (item.objectId ?? item.id) === 'string' && String(item.objectId ?? item.id).trim()) {
      ref = {
        objectId: String(item.objectId ?? item.id).trim(),
        pageId: typeof item.pageId === 'string' && item.pageId.trim() ? item.pageId.trim() : null,
        layerId: typeof item.layerId === 'string' && item.layerId.trim() ? item.layerId.trim() : null
      };
    }
    if (!ref) fail('INK_PREVIEW_REF_INVALID');
    const key = [ref.pageId || '', ref.layerId || '', ref.objectId].join('\u0000');
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(ref);
    }
  }
  normalized.sort((a, b) =>
    String(a.pageId || '').localeCompare(String(b.pageId || ''))
    || String(a.layerId || '').localeCompare(String(b.layerId || ''))
    || a.objectId.localeCompare(b.objectId));
  return normalized;
}

function validateObjectRefs(app, value) {
  const requested = normalizeRefInput(value);
  if (!requested.length) return [];

  const objectIds = [...new Set(requested.map(ref => ref.objectId))];
  const bridge = buildAIDocumentBridge(app.doc, {
    objectIds,
    selectedObjectIds: [],
    revisionId: currentRevisionId(app)
  });
  const byId = new Map((bridge.objects || []).map(item => [item?.ref?.objectId, item?.ref]));

  const grounded = requested.map(ref => {
    const actual = byId.get(ref.objectId);
    if (!actual) fail('INK_PREVIEW_REF_NOT_FOUND', { objectId: ref.objectId });
    if (ref.pageId && ref.pageId !== actual.pageId) {
      fail('INK_PREVIEW_REF_PAGE_MISMATCH', { objectId: ref.objectId, expected: ref.pageId, actual: actual.pageId });
    }
    if (ref.layerId && ref.layerId !== actual.layerId) {
      fail('INK_PREVIEW_REF_LAYER_MISMATCH', { objectId: ref.objectId, expected: ref.layerId, actual: actual.layerId });
    }
    return {
      pageId: actual.pageId || null,
      layerId: actual.layerId || null,
      objectId: actual.objectId
    };
  });

  const unique = new Map();
  for (const ref of grounded) unique.set([ref.pageId || '', ref.layerId || '', ref.objectId].join('\u0000'), ref);
  return [...unique.values()].sort((a, b) =>
    String(a.pageId || '').localeCompare(String(b.pageId || ''))
    || String(a.layerId || '').localeCompare(String(b.layerId || ''))
    || a.objectId.localeCompare(b.objectId));
}

function canvasToPngBlob(canvas) {
  if (!canvas || typeof canvas.toBlob !== 'function') fail('INK_PREVIEW_PNG_ENCODER_UNAVAILABLE');
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => {
        if (!blob) reject(Object.assign(new Error('INK_PREVIEW_PNG_ENCODING_FAILED'), { code: 'INK_PREVIEW_PNG_ENCODING_FAILED' }));
        else resolve(blob);
      }, INK_PREVIEW_MIME_TYPE);
    } catch (error) {
      reject(error);
    }
  });
}

async function blobBytes(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function') fail('INK_PREVIEW_BLOB_ARRAY_BUFFER_UNAVAILABLE');
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

function currentIdentity(app) {
  return {
    documentId: app?.doc?.id || null,
    pageId: activePage(app)?.id || null,
    revisionId: currentRevisionId(app),
    documentFingerprint: app?.doc ? documentFingerprint(app.doc) : null
  };
}

function previewBackground(page, included) {
  return {
    included: Boolean(included),
    color: included ? (page?.paper?.color || null) : null
  };
}

export async function captureInkPreview(app, registry, options = {}) {
  if (!registry || typeof registry.store !== 'function') fail('INK_OUTPUT_REGISTRY_UNAVAILABLE');
  const page = activePage(app);
  const identityBefore = currentIdentity(app);
  if (!identityBefore.documentId || !identityBefore.pageId || !identityBefore.documentFingerprint) fail('INK_PREVIEW_IDENTITY_UNAVAILABLE');

  const refs = validateObjectRefs(app, options.refs);
  const plan = previewPlan(app, options);
  const normalizedRequest = {
    scope: plan.scope,
    bounds: plan.bounds,
    maxDimension: plan.maxDimension,
    maxPixels: INK_PREVIEW_HARD_MAX_PIXELS,
    background: previewBackground(page, plan.background),
    includeBleed: false,
    cropMarks: false,
    ppi: plan.scope === 'artboard' ? boundedNumber(plan.ppi) : null,
    scale: plan.scope === 'artboard' ? null : boundedNumber(plan.scale),
    objectRefs: refs
  };

  let canvas = null;
  try {
    canvas = await app.renderExportCanvas(plan.renderOptions);
    const pixelSize = {
      width: Number(canvas?.width),
      height: Number(canvas?.height)
    };
    assertPixelBounds(pixelSize, plan.maxDimension);

    const identityAfter = currentIdentity(app);
    if (
      identityAfter.documentId !== identityBefore.documentId
      || identityAfter.pageId !== identityBefore.pageId
      || identityAfter.revisionId !== identityBefore.revisionId
      || identityAfter.documentFingerprint !== identityBefore.documentFingerprint
    ) {
      fail('INK_PREVIEW_STATE_CHANGED_DURING_RENDER');
    }

    const blob = await canvasToPngBlob(canvas);
    const bytes = await blobBytes(blob);
    const byteFingerprint = 'fnv1a32-bytes:' + fnv1a32Bytes(bytes);
    const requestForFingerprint = {
      ...normalizedRequest,
      pixelSize
    };
    const renderFingerprint = 'fnv1a32:' + fnv1a32(stableStringify({
      request: requestForFingerprint,
      byteFingerprint
    }));

    const outputIdentity = {
      schema: INK_OUTPUT_HANDLE_SCHEMA,
      version: INK_OUTPUT_HANDLE_VERSION,
      kind: 'preview',
      format: 'png',
      mimeType: INK_PREVIEW_MIME_TYPE,
      documentId: identityBefore.documentId,
      pageId: identityBefore.pageId,
      revisionId: identityBefore.revisionId,
      documentFingerprint: identityBefore.documentFingerprint,
      renderFingerprint,
      fingerprintAlgorithm: RENDER_FINGERPRINT_ALGORITHM,
      scope: plan.scope,
      bounds: plan.bounds,
      pixelSize,
      background: normalizedRequest.background,
      objectRefs: refs,
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

    const storedHandle = registry.store(handle, blob);
    return {
      handle: storedHandle,
      targetRefs: refs,
      result: {
        handleId: storedHandle.handleId,
        scope: storedHandle.scope,
        bounds: storedHandle.bounds,
        pixelSize: storedHandle.pixelSize,
        byteLength: storedHandle.byteLength,
        transport: storedHandle.transport,
        persistence: storedHandle.persistence
      }
    };
  } finally {
    if (canvas) {
      try { canvas.width = 1; canvas.height = 1; } catch {}
    }
  }
}

export function inspectInkOutput(app, registry, handleId) {
  if (!registry || typeof registry.inspect !== 'function') fail('INK_OUTPUT_REGISTRY_UNAVAILABLE');
  const current = currentIdentity(app);
  const stored = registry.inspect(handleId);
  if (!stored) {
    return {
      handle: null,
      available: false,
      stale: true,
      staleReasons: ['OUTPUT_HANDLE_UNKNOWN'],
      currentDocumentFingerprint: current.documentFingerprint,
      currentRevisionId: current.revisionId
    };
  }

  const reasons = [];
  const handle = stored.handle;
  if (!stored.available) reasons.push('PAYLOAD_UNAVAILABLE');
  if (handle.documentId !== current.documentId) reasons.push('DOCUMENT_ID_CHANGED');
  if (handle.pageId !== current.pageId) reasons.push('PAGE_ID_CHANGED');
  if (handle.documentFingerprint !== current.documentFingerprint) reasons.push('DOCUMENT_FINGERPRINT_CHANGED');
  if (handle.revisionId !== current.revisionId) reasons.push('REVISION_ID_CHANGED');

  return {
    handle,
    available: stored.available,
    stale: reasons.length > 0,
    staleReasons: reasons,
    currentDocumentFingerprint: current.documentFingerprint,
    currentRevisionId: current.revisionId
  };
}

export function releaseInkOutput(app, registry, handleId) {
  if (!registry || typeof registry.release !== 'function') fail('INK_OUTPUT_REGISTRY_UNAVAILABLE');
  const released = registry.release(handleId);
  const inspection = inspectInkOutput(app, registry, handleId);
  return {
    ...inspection,
    found: released.found,
    released: released.released
  };
}
