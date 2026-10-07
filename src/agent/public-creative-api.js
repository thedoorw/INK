import { buildAIDocumentBridge } from '../ai/document-bridge.js';
import { installInkOutputRegistry } from './output-handle-registry.js';
import { exportInkAsset } from './export-asset.js';
import { captureInkPreview, inspectInkOutput, releaseInkOutput } from './visual-feedback.js';
import { createCreativeLibrarySearch } from './creative-library-search.js';
import { normalizeChatAttachment } from '../ai/chat-reference-handoff.js';
import { getInkCapabilitySummariesRuntime, getInkNamedToolDefinitions, resolveInkCapabilityDescriptorRuntime } from './capability-registry.js';

export const INK_PUBLIC_CREATIVE_API_SCHEMA = 'INK-PUBLIC-CREATIVE-API';
export const INK_PUBLIC_CREATIVE_API_VERSION = 1;
export const INK_AGENT_RESULT_SCHEMA = 'INK_AGENT_RESULT';
export const INK_AGENT_RESULT_VERSION = 1;

export const INK_AGENT_ROUTING_CLASSES = Object.freeze([
  'NAMED_TOOL',
  'PROGRAMMABLE_FUTURE',
  'READ_ONLY',
  'PROPOSAL_REQUIRED',
  'UNAVAILABLE'
]);

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function jsonSafe(value, seen = new WeakSet()) {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    throw Object.assign(new TypeError('INK_AGENT_RESULT_NON_JSON_VALUE'), { code: 'AGENT_RESULT_NON_JSON_VALUE' });
  }
  if (Array.isArray(value)) return value.map(item => jsonSafe(item, seen));
  if (!isRecord(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw Object.assign(new TypeError('INK_AGENT_RESULT_NON_PLAIN_OBJECT'), { code: 'AGENT_RESULT_NON_PLAIN_OBJECT' });
  }
  if (seen.has(value)) throw Object.assign(new TypeError('INK_AGENT_RESULT_CYCLIC_VALUE'), { code: 'AGENT_RESULT_CYCLIC_VALUE' });
  seen.add(value);
  const output = {};
  for (const key of Object.keys(value).sort()) output[key] = jsonSafe(value[key], seen);
  seen.delete(value);
  return output;
}

function safeClone(value) {
  return jsonSafe(value);
}

function diagnostic(error, phase = null) {
  const source = isRecord(error) ? error : {};
  const details = {};
  for (const key of ['field', 'operation', 'objectId', 'pageId', 'layerId', 'expected', 'actual', 'proposalId']) {
    if (source[key] !== undefined) {
      try { details[key] = safeClone(source[key]); } catch {}
    }
  }
  return {
    code: typeof source.code === 'string' ? source.code : 'INK_AGENT_OPERATION_FAILED',
    message: typeof source.message === 'string' ? source.message : String(error || 'INK agent operation failed'),
    phase,
    details
  };
}

function selectedObjectIds(app) {
  const ids = [];
  for (const item of Array.isArray(app?.selection) ? app.selection : []) {
    const id = typeof item === 'string' ? item : item?.objectId ?? item?.id;
    if (typeof id === 'string' && id.trim()) ids.push(id.trim());
  }
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

function activePage(app) {
  if (typeof app?.page === 'function') {
    try { return app.page(); } catch {}
  }
  const document = app?.doc;
  return document?.pages?.find(page => page.id === document.activePageId) || document?.pages?.[0] || null;
}

function currentRevisionId(app) {
  try { return app?.revisions?.revisionIdFor?.(app?.doc?.id) ?? null; }
  catch { return null; }
}

function contextIdentity(app) {
  return {
    documentId: app?.doc?.id || null,
    pageId: activePage(app)?.id || null,
    revisionId: currentRevisionId(app)
  };
}

function normalizeRefs(value) {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  const refs = [];
  for (const item of list) {
    if (typeof item === 'string' && item.trim()) refs.push({ objectId: item.trim() });
    else if (isRecord(item) && typeof (item.objectId ?? item.id) === 'string') {
      refs.push({
        pageId: typeof item.pageId === 'string' ? item.pageId : null,
        layerId: typeof item.layerId === 'string' ? item.layerId : null,
        objectId: String(item.objectId ?? item.id)
      });
    }
  }
  const byKey = new Map();
  for (const ref of refs) byKey.set(`${ref.pageId || ''}\u0000${ref.layerId || ''}\u0000${ref.objectId}`, ref);
  return [...byKey.values()].sort((a, b) =>
    String(a.pageId || '').localeCompare(String(b.pageId || ''))
    || String(a.layerId || '').localeCompare(String(b.layerId || ''))
    || String(a.objectId).localeCompare(String(b.objectId)));
}

function bridgeOptions(app, options = {}) {
  const next = isRecord(options) ? { ...options } : {};
  if (!hasOwn(next, 'selectedObjectIds')) next.selectedObjectIds = selectedObjectIds(app);
  if (!hasOwn(next, 'revisionId')) next.revisionId = currentRevisionId(app);
  return next;
}

function bridgeRead(app, options = {}) {
  if (!app?.doc) throw Object.assign(new Error('INK public API document unavailable'), { code: 'INK_AGENT_DOCUMENT_UNAVAILABLE' });
  return buildAIDocumentBridge(app.doc, bridgeOptions(app, options));
}

function refsFromBridgeObjects(objects = []) {
  return normalizeRefs(objects.map(item => item?.ref).filter(Boolean));
}

function compactRevisionReceipt(value) {
  if (!isRecord(value)) return value == null ? null : safeClone(value);
  const record = value.record;
  return safeClone({
    created: value.created ?? null,
    equivalent: value.equivalent ?? null,
    persisted: value.persisted ?? null,
    restored: value.restored ?? null,
    revisionId: value.revisionId ?? record?.revisionId ?? null,
    documentId: value.documentId ?? record?.documentId ?? null,
    sequence: record?.sequence ?? null,
    parentRevisionId: record?.parentRevisionId ?? null,
    documentFingerprint: value.documentFingerprint ?? record?.documentFingerprint ?? null,
    historyBoundary: value.historyBoundary ?? null
  });
}

function normalizeDiagnostics(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return safeClone(value);
  return [safeClone(value)];
}

function referenceResultMetadata(raw, app) {
  const pageId = activePage(app)?.id || null;
  const targetRefs = normalizeRefs([{ pageId, objectId: raw?.sourceReferenceObjectId }]);
  const createdRefs = normalizeRefs([
    ...(raw?.colorObjectIds || []).map(objectId => ({ pageId, layerId: raw?.colorLayerId || null, objectId })),
    ...(raw?.lineObjectIds || []).map(objectId => ({ pageId, layerId: raw?.lineLayerId || null, objectId }))
  ]);
  return {
    targetRefs,
    createdRefs,
    changedRefs: createdRefs,
    historyReceipt: raw?.history ?? null,
    revisionReceipt: raw?.revision ?? null,
    provenanceReceipt: raw?.provenance ?? null,
    diagnostics: normalizeDiagnostics(raw?.diagnostics)
  };
}

function editResultMetadata(raw) {
  const payload = raw?.result;
  const task = payload?.task || payload?.result?.task || null;
  const targets = payload?.targets?.map(item => item?.ref || item) || task?.targets || [];
  return {
    targetRefs: normalizeRefs(targets),
    changedRefs: raw?.ok && payload?.changed ? normalizeRefs(targets) : [],
    historyReceipt: payload?.history ?? null,
    revisionReceipt: payload?.revision ?? null,
    diagnostics: raw?.ok ? [] : [safeClone({
      code: raw?.code || 'CHAT_EDIT_FAILED',
      phase: raw?.phase || null,
      details: Object.fromEntries(Object.entries(raw || {}).filter(([key]) =>
        !['ok', 'action', 'result', 'code', 'phase'].includes(key)))
    })]
  };
}

function creativePlanAuthority(app) {
  const controller = app?.chatCreativePlan;
  if (!controller
    || typeof controller.inspect !== 'function'
    || typeof controller.getPlan !== 'function'
    || typeof controller.propose !== 'function'
    || typeof controller.approve !== 'function'
    || typeof controller.execute !== 'function'
    || typeof controller.reject !== 'function') {
    throw Object.assign(new Error('INK Chat Creative Plan authority unavailable'), { code: 'INK_AGENT_COMPOSITION_AUTHORITY_UNAVAILABLE' });
  }
  return controller;
}

function creativePlanTargetRefs(record) {
  const refs = [];
  for (const step of Array.isArray(record?.steps) ? record.steps : []) {
    refs.push(...(Array.isArray(step?.targets) ? step.targets : []));
  }
  if (!refs.length) {
    for (const step of Array.isArray(record?.stepResults) ? record.stepResults : []) {
      refs.push(...(Array.isArray(step?.targets) ? step.targets : []));
    }
  }
  return normalizeRefs(refs);
}

function creativePlanMetadata(record) {
  const stepResults = Array.isArray(record?.stepResults)
    ? record.stepResults
    : (Array.isArray(record?.result?.stepResults) ? record.result.stepResults : []);
  const changedRefs = normalizeRefs(stepResults
    .filter(step => step?.ok === true && step?.changed === true)
    .flatMap(step => Array.isArray(step?.targets) ? step.targets : []));
  const historySteps = stepResults
    .filter(step => step?.history != null)
    .map(step => ({ stepId: step.stepId ?? null, stepIndex: step.stepIndex ?? null, history: step.history }));
  const diagnostics = Array.isArray(record?.diagnostics) && record.diagnostics.length
    ? record.diagnostics
    : (record?.result?.diagnostic ? [record.result.diagnostic] : []);
  return {
    status: record?.status || record?.result?.status || 'COMPLETED',
    targetRefs: creativePlanTargetRefs(record),
    changedRefs,
    historyReceipt: historySteps.length ? { steps: historySteps } : null,
    revisionReceipt: record?.result?.revision ?? null,
    diagnostics: normalizeDiagnostics(diagnostics)
  };
}

function creativePlanInspection(record) {
  const stepResults = new Map((Array.isArray(record?.stepResults) ? record.stepResults : [])
    .map(step => [String(step?.stepId || ''), step]));
  const steps = (Array.isArray(record?.steps) ? record.steps : []).map((step, stepIndex) => {
    const receipt = stepResults.get(String(step?.stepId || ''));
    return {
      stepId: step?.stepId ?? null,
      stepIndex,
      operation: step?.operation ?? null,
      state: receipt?.state || 'PENDING',
      dependsOn: Array.isArray(step?.dependsOn) ? [...step.dependsOn] : []
    };
  });
  return safeClone({
    planId: record?.planId ?? null,
    status: record?.status ?? null,
    approved: Boolean(record?.approved),
    intentSummary: record?.intentSummary ?? null,
    source: record?.source ? {
      documentId: record.source.documentId ?? null,
      pageId: record.source.pageId ?? null,
      revisionId: record.source.revisionId ?? null,
      documentFingerprint: record.source.documentFingerprint ?? null
    } : null,
    stepCount: steps.length,
    completedStepCount: steps.filter(step => step.state === 'COMPLETED').length,
    stoppedStepCount: steps.filter(step => step.state === 'STOPPED').length,
    steps
  });
}

function historyEntrySummary(entry) {
  if (!entry) return null;
  return safeClone({
    label: entry.label || null,
    objectIds: Array.isArray(entry.objectIds) ? [...entry.objectIds].sort((a, b) => String(a).localeCompare(String(b))) : [],
    patchCount: Number.isFinite(Number(entry.patchCount)) ? Number(entry.patchCount) : 0,
    captureMode: entry.captureMode || null,
    targetCount: Number.isFinite(Number(entry.targetCount)) ? Number(entry.targetCount) : null,
    storedBytes: Number.isFinite(Number(entry.storedBytes)) ? Number(entry.storedBytes) : null
  });
}

function historyInspection(app) {
  const history = app?.history;
  if (!history) throw Object.assign(new Error('INK History authority unavailable'), { code: 'INK_AGENT_HISTORY_UNAVAILABLE' });
  const timeline = typeof history.timeline === 'function'
    ? history.timeline()
    : { entries: [...(history.undoStack || []), ...[...(history.redoStack || [])].reverse()], applied: history.undoStack?.length || 0, limit: history.limit || 0 };
  return safeClone({
    applied: timeline.applied,
    retainedCount: timeline.entries?.length || 0,
    limit: timeline.limit,
    pending: Boolean(history.pending),
    canUndo: Boolean(history.undoStack?.length),
    canRedo: Boolean(history.redoStack?.length),
    entries: (timeline.entries || []).map(historyEntrySummary),
    stats: typeof history.stats === 'function' ? history.stats() : null
  });
}

export function createInkAgentResult(app, action, {
  status = 'COMPLETED',
  targetRefs = [],
  createdRefs = [],
  changedRefs = [],
  historyReceipt = null,
  revisionReceipt = null,
  provenanceReceipt = null,
  outputHandles = [],
  diagnostics = [],
  result = null
} = {}) {
  const identity = contextIdentity(app);
  return {
    schema: INK_AGENT_RESULT_SCHEMA,
    version: INK_AGENT_RESULT_VERSION,
    action: String(action || 'unknown'),
    status: String(status || 'COMPLETED'),
    documentId: identity.documentId,
    pageId: identity.pageId,
    revisionId: identity.revisionId,
    targetRefs: safeClone(normalizeRefs(targetRefs)),
    createdRefs: safeClone(normalizeRefs(createdRefs)),
    changedRefs: safeClone(normalizeRefs(changedRefs)),
    historyReceipt: safeClone(historyReceipt),
    revisionReceipt: safeClone(revisionReceipt),
    provenanceReceipt: safeClone(provenanceReceipt),
    outputHandles: safeClone(outputHandles),
    diagnostics: safeClone(diagnostics),
    result: safeClone(result)
  };
}

function failedResult(app, action, error, result = null) {
  return createInkAgentResult(app, action, {
    status: 'FAILED',
    diagnostics: [diagnostic(error, action)],
    result
  });
}

export function createInkPublicCreativeApi(app) {
  if (!app) throw new TypeError('INK public API requires an InkApp instance');
  const outputRegistry = installInkOutputRegistry(app);
  const creativeLibrarySearch = createCreativeLibrarySearch(app);
  const namedToolDefinitions = getInkNamedToolDefinitions();

  const capabilities = () => {
    try {
      return createInkAgentResult(app, 'capabilities', {
        result: {
          api: { schema: INK_PUBLIC_CREATIVE_API_SCHEMA, version: INK_PUBLIC_CREATIVE_API_VERSION },
          capabilities: getInkCapabilitySummariesRuntime(app.commands),
          namedTools: namedToolDefinitions
        }
      });
    } catch (error) {
      return failedResult(app, 'capabilities', error);
    }
  };

  const context = (options = {}) => {
    try {
      const result = bridgeRead(app, options);
      return createInkAgentResult(app, 'context', {
        targetRefs: refsFromBridgeObjects(result.objects),
        result
      });
    } catch (error) {
      return failedResult(app, 'context', error);
    }
  };

  const selection = (options = {}) => {
    try {
      const ids = selectedObjectIds(app);
      const result = bridgeRead(app, ids.length ? { ...options, objectIds: ids } : options);
      const selected = new Set(ids);
      const objects = result.objects.filter(item => selected.has(item.ref.objectId));
      return createInkAgentResult(app, 'selection', {
        targetRefs: refsFromBridgeObjects(objects),
        result: {
          selection: result.selection,
          objects,
          contextFingerprint: result.contextFingerprint
        }
      });
    } catch (error) {
      return failedResult(app, 'selection', error);
    }
  };

  const inspect = (refsOrObjectIds, options = {}) => {
    try {
      if (isRecord(refsOrObjectIds) && (hasOwn(refsOrObjectIds, 'refs') || hasOwn(refsOrObjectIds, 'objectIds') || hasOwn(refsOrObjectIds, 'options'))) {
        const input = refsOrObjectIds;
        refsOrObjectIds = input.refs ?? input.objectIds ?? [];
        options = input.options ?? options;
      }
      const refs = normalizeRefs(refsOrObjectIds);
      if (!refs.length) throw Object.assign(new Error('INK inspect requires at least one stable object reference'), { code: 'INK_AGENT_INSPECT_TARGET_REQUIRED' });
      const result = bridgeRead(app, { ...options, objectIds: refs.map(ref => ref.objectId) });
      return createInkAgentResult(app, 'inspect', {
        targetRefs: refsFromBridgeObjects(result.objects),
        result
      });
    } catch (error) {
      return failedResult(app, 'inspect', error);
    }
  };

  const reference = Object.freeze({
    async import(input, options = {}) {
      const action = 'reference.import';
      try {
        if (typeof app?.chatReferenceHandoff?.importReference !== 'function') {
          throw Object.assign(new Error('INK Reference import authority unavailable'), { code: 'INK_AGENT_REFERENCE_AUTHORITY_UNAVAILABLE' });
        }
        const raw = await app.chatReferenceHandoff.importReference(input, options);
        const createdRefs = normalizeRefs(raw?.referenceObjectId ? [{
          pageId: activePage(app)?.id || null,
          layerId: raw.targetLayerId || null,
          objectId: raw.referenceObjectId
        }] : []);
        return createInkAgentResult(app, action, {
          status: raw?.status || 'COMPLETED',
          createdRefs,
          changedRefs: createdRefs,
          historyReceipt: raw?.history ?? null,
          revisionReceipt: raw?.revision ?? null,
          provenanceReceipt: raw?.provenance ?? null,
          diagnostics: raw?.error ? [diagnostic(raw.error, action)] : [],
          result: raw
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    },
    async decompose(referenceObjectId, options = {}) {
      const action = 'reference.decompose';
      try {
        if (isRecord(referenceObjectId) && hasOwn(referenceObjectId, 'referenceObjectId')) {
          const input = referenceObjectId;
          referenceObjectId = input.referenceObjectId;
          options = input.options ?? options;
        }
        if (typeof app?.chatReferenceHandoff?.decomposeReference !== 'function') {
          throw Object.assign(new Error('INK Reference decomposition authority unavailable'), { code: 'INK_AGENT_REFERENCE_AUTHORITY_UNAVAILABLE' });
        }
        const raw = await app.chatReferenceHandoff.decomposeReference(referenceObjectId, options);
        const metadata = referenceResultMetadata(raw, app);
        return createInkAgentResult(app, action, {
          status: raw?.status || 'COMPLETED',
          ...metadata,
          result: raw
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    }
  });

  const raster = Object.freeze({
    async import(input, options = {}) {
      const action = 'raster.import';
      try {
        if (typeof app?.importWebRaster !== 'function' || typeof app?.importImageFormat !== 'function' || typeof app?.imageFormatProbe !== 'function') {
          throw Object.assign(new Error('INK mutable raster import authority unavailable'), { code: 'INK_AGENT_RASTER_IMPORT_AUTHORITY_UNAVAILABLE' });
        }
        const historyBefore = historyInspection(app);
        const revisionBefore = currentRevisionId(app);
        const file = await normalizeChatAttachment(input, options);
        const name = options?.name || file?.name || null;
        const matrix = options?.matrix ?? null;
        const fileName = String(file?.name || name || '').toLowerCase();
        const mimeType = String(file?.type || options?.type || options?.mimeType || '').toLowerCase();
        const rawLike = /\.(dng|nef|cr2|cr3|arw|orf|rw2|raf|pef|srw|raw)$/i.test(fileName)
          || /(?:camera-raw|x-adobe-dng|x-canon-cr2|x-canon-cr3|x-nikon-nef|x-sony-arw|x-panasonic-rw2|x-fuji-raf|x-raw)/i.test(mimeType);
        let object;
        let importRoute = 'web-raster';
        let detectedFormat = null;

        const bytes = new Uint8Array(await file.arrayBuffer());
        const probe = app.imageFormatProbe(bytes);
        detectedFormat = probe?.matched ? String(probe.format || '').toUpperCase() : null;
        if (['PSD', 'TIFF', 'EXR', 'RAW'].includes(detectedFormat)) {
          importRoute = detectedFormat === 'RAW' ? 'advanced-format-raw' : 'advanced-format';
          object = await app.importImageFormat(bytes, { name: name || 'Imported image', matrix, format: detectedFormat });
        } else if (rawLike) {
          const rawStatus = String(probe?.status || 'decoder-unavailable');
          throw Object.assign(new Error(
            rawStatus === 'unsupported-family'
              ? 'No registered RAW adapter supports this camera family'
              : 'No approved RAW decoder is registered in the current INK runtime'
          ), {
            code: rawStatus === 'unsupported-family'
              ? 'INK_AGENT_RASTER_RAW_FAMILY_UNSUPPORTED'
              : 'INK_AGENT_RASTER_RAW_DECODER_UNAVAILABLE',
            field: 'input',
            actual: file?.name || null,
            rawStatus
          });
        } else if (detectedFormat) {
          throw Object.assign(new Error('Detected raster format is not qualified for CHAT mutable import'), {
            code: 'INK_AGENT_RASTER_FORMAT_NOT_QUALIFIED',
            field: 'input',
            actual: detectedFormat
          });
        } else {
          object = await app.importWebRaster(file, {
            name,
            matrix,
            sourceChannel: 'CHAT_RASTER_ATTACHMENT_HANDOFF'
          });
        }

        const pageId = activePage(app)?.id || null;
        const selected = (Array.isArray(app?.selection) ? app.selection : [])
          .find(item => String(item?.objectId ?? item?.id ?? '') === String(object?.id || ''));
        const createdRefs = normalizeRefs(object?.id ? [{
          pageId,
          layerId: selected?.layerId || null,
          objectId: object.id
        }] : []);
        const historyAfter = historyInspection(app);
        const revisionAfter = currentRevisionId(app);
        const source = object?.metadata?.rasterImport?.source || {};
        const rasterState = object?.rasterState || {};
        const formatSource = rasterState?.source || {};
        const compactHistory = value => ({
          applied: value?.applied ?? null,
          retainedCount: value?.retainedCount ?? null,
          limit: value?.limit ?? null,
          pending: Boolean(value?.pending),
          canUndo: Boolean(value?.canUndo),
          canRedo: Boolean(value?.canRedo)
        });
        const latestHistory = historyAfter?.applied > 0
          ? historyAfter.entries?.[historyAfter.applied - 1] || null
          : null;
        return createInkAgentResult(app, action, {
          status: 'COMPLETED',
          createdRefs,
          changedRefs: createdRefs,
          historyReceipt: {
            before: compactHistory(historyBefore),
            after: compactHistory(historyAfter),
            latest: latestHistory
          },
          revisionReceipt: { before: revisionBefore, after: revisionAfter },
          provenanceReceipt: importRoute.startsWith('advanced-format')
            ? {
                sourceChannel: 'CHAT_RASTER_ATTACHMENT_HANDOFF',
                format: formatSource?.format || detectedFormat,
                provenance: rasterState?.provenance || null
              }
            : {
                sourceChannel: object?.metadata?.rasterImport?.sourceChannel || 'CHAT_RASTER_ATTACHMENT_HANDOFF',
                sourceSha256: source?.sha256 || null
              },
          result: {
            objectId: object?.id || null,
            source: {
              name: source?.name || file?.name || null,
              mimeType: source?.mimeType || file?.type || null,
              sha256: source?.sha256 || null,
              sizeBytes: source?.sizeBytes ?? file?.size ?? null,
              width: Number(object?.w) || null,
              height: Number(object?.h) || null
            },
            rasterState: {
              type: rasterState?.type || null,
              format: formatSource?.format || rasterState?.format || detectedFormat,
              bitDepth: rasterState?.colorRaster?.bitDepth ?? null,
              colorMode: rasterState?.colorRaster?.colorMode ?? null,
              width: Number(object?.w) || null,
              height: Number(object?.h) || null
            },
            importRoute
          }
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    }
  });

  const edit = Object.freeze({
    inspect() {
      const action = 'edit.inspect';
      try {
        const raw = app?.chatBoundedEditAdapter?.inspect?.();
        if (!raw) throw Object.assign(new Error('INK bounded edit authority unavailable'), { code: 'INK_AGENT_EDIT_AUTHORITY_UNAVAILABLE' });
        const metadata = editResultMetadata(raw);
        return createInkAgentResult(app, action, {
          status: raw.ok ? 'COMPLETED' : 'FAILED',
          ...metadata,
          result: raw
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    },
    propose(task) {
      const action = 'edit.propose';
      try {
        const raw = app?.chatBoundedEditAdapter?.propose?.(task);
        if (!raw) throw Object.assign(new Error('INK bounded edit authority unavailable'), { code: 'INK_AGENT_EDIT_AUTHORITY_UNAVAILABLE' });
        const metadata = editResultMetadata(raw);
        return createInkAgentResult(app, action, {
          status: raw.ok ? (raw.result?.state || 'PROPOSED') : 'FAILED',
          ...metadata,
          result: raw
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    },
    approve(proposalId) {
      const action = 'edit.approve';
      try {
        if (isRecord(proposalId)) proposalId = proposalId.proposalId;
        const raw = app?.chatBoundedEditAdapter?.approve?.(proposalId);
        if (!raw) throw Object.assign(new Error('INK bounded edit authority unavailable'), { code: 'INK_AGENT_EDIT_AUTHORITY_UNAVAILABLE' });
        const metadata = editResultMetadata(raw);
        return createInkAgentResult(app, action, {
          status: raw.ok ? (raw.result?.state || 'APPROVED') : 'FAILED',
          ...metadata,
          result: raw
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    },
    execute(proposalId, approvalToken) {
      const action = 'edit.execute';
      try {
        if (isRecord(proposalId)) {
          const input = proposalId;
          proposalId = input.proposalId;
          approvalToken = input.approvalToken ?? approvalToken;
        }
        const raw = app?.chatBoundedEditAdapter?.execute?.(proposalId, approvalToken);
        if (!raw) throw Object.assign(new Error('INK bounded edit authority unavailable'), { code: 'INK_AGENT_EDIT_AUTHORITY_UNAVAILABLE' });
        const metadata = editResultMetadata(raw);
        return createInkAgentResult(app, action, {
          status: raw.ok ? (raw.result?.state || 'EXECUTED') : 'FAILED',
          ...metadata,
          result: raw
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    }
  });

  const composition = Object.freeze({
    inspect(input = {}) {
      const action = 'composition.inspect';
      try {
        const controller = creativePlanAuthority(app);
        const planId = isRecord(input) ? input.planId : (typeof input === 'string' ? input : null);
        if (!planId) {
          return createInkAgentResult(app, action, { result: { state: safeClone(controller.inspect()) } });
        }
        const record = controller.getPlan(planId);
        if (!record) {
          throw Object.assign(new Error('INK Chat Creative Plan not found'), {
            code: 'CHAT_PLAN_PLAN_NOT_FOUND',
            field: 'planId',
            actual: String(planId)
          });
        }
        return createInkAgentResult(app, action, {
          status: record.status || 'COMPLETED',
          targetRefs: creativePlanTargetRefs(record),
          result: { plan: creativePlanInspection(record) }
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    },
    propose(input) {
      const action = 'composition.propose';
      try {
        const controller = creativePlanAuthority(app);
        const plan = isRecord(input) && hasOwn(input, 'plan') ? input.plan : input;
        const record = controller.propose(plan);
        const metadata = creativePlanMetadata(record);
        return createInkAgentResult(app, action, { ...metadata, result: record });
      } catch (error) {
        return failedResult(app, action, error);
      }
    },
    approve(planId) {
      const action = 'composition.approve';
      try {
        if (isRecord(planId)) planId = planId.planId;
        const controller = creativePlanAuthority(app);
        const record = controller.approve(planId);
        const metadata = creativePlanMetadata(record);
        return createInkAgentResult(app, action, { ...metadata, result: record });
      } catch (error) {
        return failedResult(app, action, error);
      }
    },
    async execute(planId, approvalToken) {
      const action = 'composition.execute';
      try {
        if (isRecord(planId)) {
          const input = planId;
          planId = input.planId;
          approvalToken = input.approvalToken ?? approvalToken;
        }
        const controller = creativePlanAuthority(app);
        const raw = await controller.execute(planId, approvalToken);
        const record = controller.getPlan(planId) || raw;
        const metadata = creativePlanMetadata(record);
        return createInkAgentResult(app, action, { ...metadata, result: raw });
      } catch (error) {
        return failedResult(app, action, error);
      }
    },
    cancel(planId) {
      const action = 'composition.cancel';
      try {
        if (isRecord(planId)) planId = planId.planId;
        const controller = creativePlanAuthority(app);
        const record = controller.reject(planId);
        const metadata = creativePlanMetadata(record);
        return createInkAgentResult(app, action, { ...metadata, result: record });
      } catch (error) {
        return failedResult(app, action, error);
      }
    }
  });

  const history = Object.freeze({
    inspect() {
      const action = 'history.inspect';
      try {
        return createInkAgentResult(app, action, { result: historyInspection(app) });
      } catch (error) {
        return failedResult(app, action, error);
      }
    },
    undo() {
      const action = 'history.undo';
      try {
        if (!app?.commands?.has?.('history.undo.v1')) throw Object.assign(new Error('INK history-control provider unavailable'), { code: 'INK_AGENT_CAPABILITY_UNAVAILABLE' });
        const before = historyInspection(app);
        const shared = app.commands.execute('history.undo.v1', {}, 'public-api');
        if (!shared?.ok) throw Object.assign(new Error(shared?.error?.message || 'INK history undo failed'), { code: shared?.error?.code || 'INK_AGENT_COMMAND_FAILED' });
        const applied = Boolean(shared.changed);
        const after = historyInspection(app);
        return createInkAgentResult(app, action, {
          status: applied ? 'COMPLETED' : 'NO_OP',
          historyReceipt: { applied, before, after },
          result: { applied, history: after }
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    },
    redo() {
      const action = 'history.redo';
      try {
        if (!app?.commands?.has?.('history.redo.v1')) throw Object.assign(new Error('INK history-control provider unavailable'), { code: 'INK_AGENT_CAPABILITY_UNAVAILABLE' });
        const before = historyInspection(app);
        const shared = app.commands.execute('history.redo.v1', {}, 'public-api');
        if (!shared?.ok) throw Object.assign(new Error(shared?.error?.message || 'INK history redo failed'), { code: shared?.error?.code || 'INK_AGENT_COMMAND_FAILED' });
        const applied = Boolean(shared.changed);
        const after = historyInspection(app);
        return createInkAgentResult(app, action, {
          status: applied ? 'COMPLETED' : 'NO_OP',
          historyReceipt: { applied, before, after },
          result: { applied, history: after }
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    }
  });

  const revision = Object.freeze({
    current() {
      const action = 'revision.current';
      try {
        if (!app?.revisions) throw Object.assign(new Error('INK Revision authority unavailable'), { code: 'INK_AGENT_REVISION_UNAVAILABLE' });
        return createInkAgentResult(app, action, {
          result: {
            revisionId: currentRevisionId(app),
            diagnostics: typeof app.revisions.diagnostics === 'function' ? app.revisions.diagnostics() : null
          }
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    },
    async list(documentId = app?.doc?.id) {
      const action = 'revision.list';
      try {
        if (isRecord(documentId)) documentId = documentId.documentId ?? app?.doc?.id;
        if (typeof app?.revisions?.list !== 'function') throw Object.assign(new Error('INK Revision authority unavailable'), { code: 'INK_AGENT_REVISION_UNAVAILABLE' });
        const items = await app.revisions.list(documentId);
        return createInkAgentResult(app, action, { result: { items } });
      } catch (error) {
        return failedResult(app, action, error);
      }
    },
    async capture(options = {}) {
      const action = 'revision.capture';
      try {
        if (typeof app?.revisions?.capture !== 'function') throw Object.assign(new Error('INK Revision authority unavailable'), { code: 'INK_AGENT_REVISION_UNAVAILABLE' });
        const raw = await app.revisions.capture(options);
        return createInkAgentResult(app, action, {
          status: raw?.created === false ? 'NO_OP' : 'COMPLETED',
          revisionReceipt: compactRevisionReceipt(raw),
          result: raw
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    },
    async restore(revisionId, options = {}) {
      const action = 'revision.restore';
      try {
        if (isRecord(revisionId) && hasOwn(revisionId, 'revisionId')) {
          const input = revisionId;
          revisionId = input.revisionId;
          options = input.options ?? options;
        }
        if (typeof app?.revisions?.restore !== 'function') throw Object.assign(new Error('INK Revision authority unavailable'), { code: 'INK_AGENT_REVISION_UNAVAILABLE' });
        const raw = await app.revisions.restore(revisionId, options);
        return createInkAgentResult(app, action, {
          status: raw?.restored === false ? 'FAILED' : 'COMPLETED',
          revisionReceipt: compactRevisionReceipt(raw),
          result: raw
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    }
  });

  const preview = Object.freeze({
    async capture(options = {}) {
      const action = 'preview.capture';
      try {
        const raw = await captureInkPreview(app, outputRegistry, isRecord(options) ? options : {});
        return createInkAgentResult(app, action, {
          targetRefs: raw.targetRefs,
          outputHandles: [raw.handle],
          result: raw.result
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    }
  });

  const asset = Object.freeze({
    async export(options = {}) {
      const action = 'asset.export';
      try {
        const raw = await exportInkAsset(app, outputRegistry, isRecord(options) ? options : {});
        return createInkAgentResult(app, action, {
          outputHandles: raw.handle ? [raw.handle] : [],
          result: raw.result
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    },
    inspect(handleId) {
      const action = 'asset.inspect';
      try {
        if (isRecord(handleId)) handleId = handleId.handleId;
        const raw = inspectInkOutput(app, outputRegistry, handleId);
        return createInkAgentResult(app, action, {
          targetRefs: raw.handle?.objectRefs || [],
          outputHandles: raw.handle ? [raw.handle] : [],
          result: raw
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    },
    release(handleId) {
      const action = 'asset.release';
      try {
        if (isRecord(handleId)) handleId = handleId.handleId;
        const raw = releaseInkOutput(app, outputRegistry, handleId);
        return createInkAgentResult(app, action, {
          status: raw.found ? 'COMPLETED' : 'NO_OP',
          targetRefs: raw.handle?.objectRefs || [],
          outputHandles: raw.handle ? [raw.handle] : [],
          result: raw
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    }
  });

  const library = Object.freeze({
    query(input = {}) {
      const action = 'library.query';
      try {
        const result = creativeLibrarySearch.query(isRecord(input) ? input : {});
        return createInkAgentResult(app, action, { result });
      } catch (error) {
        return failedResult(app, action, error);
      }
    }
  });

  const recipe = Object.freeze({
    inventory(input = {}) {
      const action = 'recipe.inventory';
      try {
        const request = isRecord(input) ? input : {};
        const engine = app?.studio?.engine;
        if (!engine || typeof engine.list !== 'function' || typeof engine.describe !== 'function') {
          throw Object.assign(new Error('INK Studio RecipeEngine authority unavailable'), { code: 'INK_AGENT_RECIPE_AUTHORITY_UNAVAILABLE' });
        }
        const requestedId = typeof request.recipeId === 'string' && request.recipeId.trim() ? request.recipeId.trim() : null;
        const studio = engine.list()
          .filter(item => !requestedId || item.id === requestedId)
          .map(item => {
            const detail = engine.describe(item.id);
            return {
              source: 'studio.recipe-engine',
              id: item.id,
              name: item.name || null,
              version: String(item.version),
              roleSchema: item.roleSchema || null,
              parameterNames: Array.isArray(item.parameters) ? [...item.parameters] : [],
              steps: Array.isArray(detail.steps) ? detail.steps : [],
              capabilities: detail.capabilities || null,
              execution: {
                governed: true,
                operation: 'recipe.studio.execute.v1',
                route: 'propose_ink_edit → approve_ink_edit → execute_ink_edit'
              }
            };
          });
        if (requestedId && !studio.length) {
          throw Object.assign(new Error('INK registered Recipe not found'), {
            code: 'INK_AGENT_RECIPE_NOT_FOUND',
            field: 'recipeId',
            actual: requestedId
          });
        }
        const floraStored = [];
        for (const page of app?.doc?.pages || []) {
          for (const [recipeId, record] of Object.entries(page?.floraRecipeState?.recipes || {})) {
            floraStored.push({
              source: 'page.floraRecipeState.recipes',
              pageId: page.id || null,
              id: recipeId,
              version: String(record?.recipe?.schemaVersion ?? record?.recipe?.version ?? '0.1'),
              operation: record?.operation || record?.recipe?.operation || null,
              targetRegionId: record?.targetRegionId || record?.recipe?.targetRegionId || null,
              revision: Number(record?.revision || 0),
              compileHash: record?.compileHash || null,
              execution: {
                governed: false,
                reason: 'NOT_EXPOSED_BY_CLUSTER_D3_STUDIO_ROUTE'
              }
            });
          }
        }
        floraStored.sort((a, b) => String(a.pageId).localeCompare(String(b.pageId)) || String(a.id).localeCompare(String(b.id)));
        return createInkAgentResult(app, action, {
          result: {
            schema: 'INK_RECIPE_INVENTORY',
            version: 1,
            readOnly: true,
            requestedId,
            studio,
            floraStored,
            counts: { studio: studio.length, floraStored: floraStored.length }
          }
        });
      } catch (error) {
        return failedResult(app, action, error);
      }
    }
  });

  const capability = Object.freeze({
    describe(idOrToolName) {
      const action = 'capability.describe';
      try {
        if (isRecord(idOrToolName)) idOrToolName = idOrToolName.idOrToolName ?? idOrToolName.capabilityId ?? idOrToolName.toolName;
        const descriptor = resolveInkCapabilityDescriptorRuntime(idOrToolName, app.commands);
        if (!descriptor) {
          throw Object.assign(new Error('Unknown INK capability or named tool'), {
            code: 'INK_CAPABILITY_NOT_FOUND',
            field: 'idOrToolName',
            actual: String(idOrToolName || '')
          });
        }
        return createInkAgentResult(app, action, { result: descriptor });
      } catch (error) {
        return failedResult(app, action, error);
      }
    }
  });

  const publicMethods = Object.freeze({ capabilities, context, selection, inspect, reference, raster, edit, composition, history, revision, preview, asset, library, recipe, capability });
  const toolHandlers = Object.freeze({
    get_ink_capabilities: () => capabilities(),
    get_ink_context: input => context(input?.options ?? input ?? {}),
    get_ink_selection: input => selection(input?.options ?? input ?? {}),
    inspect_ink_objects: input => inspect(input?.refs ?? input?.objectIds ?? input, input?.options ?? {}),
    decompose_ink_reference: input => reference.decompose(input?.referenceObjectId, input?.options ?? {}),
    propose_ink_edit: input => edit.propose(input?.task ?? input),
    approve_ink_edit: input => edit.approve(input?.proposalId),
    execute_ink_edit: input => edit.execute(input?.proposalId, input?.approvalToken),
    get_ink_history: () => history.inspect(),
    undo_ink: () => history.undo(),
    redo_ink: () => history.redo(),
    get_ink_revisions: input => revision.list(input?.documentId ?? app?.doc?.id),
    capture_ink_revision: input => revision.capture(input?.options ?? input ?? {}),
    restore_ink_revision: input => revision.restore(input?.revisionId, input?.options ?? {}),
    get_ink_preview: input => preview.capture(input?.options ?? input ?? {}),
    inspect_ink_output: input => asset.inspect(input?.handleId ?? input),
    release_ink_output: input => asset.release(input?.handleId ?? input),
    describe_ink_capability: input => capability.describe(input?.idOrToolName ?? input?.capabilityId ?? input?.toolName ?? input),
    import_ink_reference: request => reference.import(request?.input ?? request, request?.options ?? {}),
    import_ink_raster: request => raster.import(request?.input ?? request, request?.options ?? {}),
    export_ink_asset: input => asset.export(input ?? {}),
    search_ink_library: input => library.query(input ?? {}),
    get_ink_recipe_inventory: input => recipe.inventory(input ?? {}),
    use_ink: input => {
      const request = isRecord(input) ? input : {};
      const action = String(request.action || '').trim();
      if (action === 'inspect') return composition.inspect(request);
      if (action === 'propose') return composition.propose(request);
      if (action === 'approve') return composition.approve(request);
      if (action === 'execute') return composition.execute(request);
      if (action === 'cancel') return composition.cancel(request);
      return failedResult(app, 'use_ink', Object.assign(new Error('Unsupported use_ink action'), {
        code: 'INK_USE_INK_ACTION_UNSUPPORTED',
        field: 'action',
        actual: action
      }));
    }
  });

  const tools = Object.freeze({
    registry() { return safeClone(namedToolDefinitions); },
    invoke(name, input = {}) {
      const handler = toolHandlers[String(name || '')];
      if (!handler) return failedResult(app, 'tools.invoke', Object.assign(new Error('Unknown INK named tool'), { code: 'INK_AGENT_TOOL_NOT_FOUND' }));
      return handler(input);
    }
  });

  return Object.freeze({
    schema: INK_PUBLIC_CREATIVE_API_SCHEMA,
    version: INK_PUBLIC_CREATIVE_API_VERSION,
    ...publicMethods,
    tools
  });
}

export function installInkPublicCreativeApi(app) {
  if (app?.inkPublicApi?.schema === INK_PUBLIC_CREATIVE_API_SCHEMA) return app.inkPublicApi;
  const api = createInkPublicCreativeApi(app);
  Object.defineProperty(app, 'inkPublicApi', {
    value: api,
    writable: false,
    configurable: false,
    enumerable: true
  });
  return api;
}
