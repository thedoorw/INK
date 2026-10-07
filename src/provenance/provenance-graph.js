import { stableHash } from '../core/stable-id.js';
import { walkPageObjects } from '../document/hierarchy.js';

export const PROVENANCE_GRAPH_SCHEMA = 'INK-REVISION-PROVENANCE-GRAPH';
export const PROVENANCE_GRAPH_VERSION = 1;
export const PROVENANCE_BRIDGE_SCHEMA = 'INK-AI-DOCUMENT-BRIDGE-PROVENANCE';
export const PROVENANCE_BRIDGE_VERSION = 1;

const DEFAULT_LIMITS = Object.freeze({
  maxEvents: 256,
  maxEdges: 768,
  maxUnresolved: 256,
  maxConflicts: 128,
  maxBytes: 128 * 1024
});
const HARD_LIMITS = Object.freeze({
  maxEvents: 2048,
  maxEdges: 8192,
  maxUnresolved: 2048,
  maxConflicts: 1024,
  maxBytes: 1024 * 1024
});
const INTERNAL_ENTITY_TYPES = new Set([
  'object', 'revision', 'recipe', 'recipe-execution', 'recipe-step',
  'chat-plan', 'chat-proposal', 'semantic-region'
]);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class RevisionProvenanceError extends Error {
  constructor(code, details = {}) {
    super(`INK_REVISION_PROVENANCE_${code}`);
    this.name = 'RevisionProvenanceError';
    this.code = `REVISION_PROVENANCE_${code}`;
    Object.assign(this, details);
  }
}

function fail(code, details = {}) {
  throw new RevisionProvenanceError(code, details);
}

function text(value, field, { required = false, max = 240 } = {}) {
  if (value == null || value === '') {
    if (required) fail('FIELD_REQUIRED', { field });
    return null;
  }
  if (typeof value !== 'string') fail('FIELD_INVALID', { field });
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max) fail('FIELD_INVALID', { field });
  return normalized || null;
}

function validTimestamp(value, field) {
  if (value == null || value === '') return null;
  const normalized = text(value, field, { required: true, max: 80 });
  if (!Number.isFinite(Date.parse(normalized))) fail('TIMESTAMP_INVALID', { field });
  return normalized;
}

function stringList(value, field, { max = 512 } = {}) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail('FIELD_INVALID', { field });
  const values = value.map((item, index) => text(item, `${field}[${index}]`, { required: true }));
  return [...new Set(values)].sort((a, b) => a.localeCompare(b)).slice(0, max);
}

function normalizeLimit(value, fallback, hardMax, field) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > hardMax) fail('LIMIT_INVALID', { field, value });
  return number;
}

function limitsFrom(raw = {}) {
  if (!record(raw)) fail('LIMITS_INVALID');
  return {
    maxEvents: normalizeLimit(raw.maxEvents, DEFAULT_LIMITS.maxEvents, HARD_LIMITS.maxEvents, 'maxEvents'),
    maxEdges: normalizeLimit(raw.maxEdges, DEFAULT_LIMITS.maxEdges, HARD_LIMITS.maxEdges, 'maxEdges'),
    maxUnresolved: normalizeLimit(raw.maxUnresolved, DEFAULT_LIMITS.maxUnresolved, HARD_LIMITS.maxUnresolved, 'maxUnresolved'),
    maxConflicts: normalizeLimit(raw.maxConflicts, DEFAULT_LIMITS.maxConflicts, HARD_LIMITS.maxConflicts, 'maxConflicts'),
    maxBytes: normalizeLimit(raw.maxBytes, DEFAULT_LIMITS.maxBytes, HARD_LIMITS.maxBytes, 'maxBytes')
  };
}

function bytes(value) {
  const serialized = JSON.stringify(value);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(serialized).byteLength;
  let count = 0;
  for (const char of serialized) {
    const code = char.codePointAt(0);
    count += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return count;
}

function normalizeEntity(raw, field, { required = true } = {}) {
  if (raw == null) {
    if (required) fail('ENTITY_REQUIRED', { field });
    return null;
  }
  if (!record(raw)) fail('ENTITY_INVALID', { field });
  return {
    type: text(raw.type, `${field}.type`, { required: true, max: 80 }),
    id: text(raw.id, `${field}.id`, { required: true })
  };
}

function entityKey(entity) {
  return `${entity.type}\u0000${entity.id}`;
}

function entityNode(entity) {
  return {
    entityId: `prov-entity:${stableHash(entity).split(':').at(-1)}`,
    type: entity.type,
    id: entity.id
  };
}

function normalizeDocument(document) {
  if (!record(document) || document.format !== 'INK') fail('DOCUMENT_INVALID');
  if (Number(document.formatVersion) !== 4) fail('FORMAT_VERSION_UNSUPPORTED', { actual: document.formatVersion ?? null, expected: 4 });
  const documentId = text(document.id, 'document.id', { required: true });
  if (!Array.isArray(document.pages) || !document.pages.length) fail('DOCUMENT_PAGES_INVALID');
  return documentId;
}

function sortedObjectEntries(document) {
  const entries = [];
  const ids = new Set();
  for (const page of document.pages) {
    if (!record(page) || !Array.isArray(page.layers)) fail('PAGE_INVALID');
    for (const found of walkPageObjects(page)) {
      const objectId = text(found.object?.id, 'object.id', { required: true });
      if (ids.has(objectId)) fail('DUPLICATE_OBJECT_ID', { objectId });
      ids.add(objectId);
      entries.push({ page, found });
    }
  }
  return entries.sort((a, b) => a.found.object.id.localeCompare(b.found.object.id));
}

function normalizeEventSpec(spec, documentId) {
  const kind = text(spec.kind, 'event.kind', { required: true, max: 100 });
  const source = normalizeEntity(spec.source, 'event.source', { required: false });
  const target = normalizeEntity(spec.target, 'event.target');
  const unresolvedReasons = stringList(spec.unresolvedReasons || [], 'event.unresolvedReasons', { max: 64 });
  const status = unresolvedReasons.length || String(spec.status || '').toUpperCase() === 'UNRESOLVED' ? 'UNRESOLVED' : 'RESOLVED';
  const event = {
    kind,
    source,
    target,
    documentId: text(spec.documentId ?? documentId, 'event.documentId', { required: true }),
    revisionId: text(spec.revisionId, 'event.revisionId', { max: 220 }),
    parentEventIds: [],
    sourceEventIds: [],
    operation: text(spec.operation, 'event.operation', { max: 160 }),
    recipeId: text(spec.recipeId, 'event.recipeId'),
    stepId: text(spec.stepId, 'event.stepId'),
    proposalId: text(spec.proposalId, 'event.proposalId'),
    planId: text(spec.planId, 'event.planId'),
    executionId: text(spec.executionId, 'event.executionId'),
    batchId: text(spec.batchId, 'event.batchId'),
    objectIds: stringList(spec.objectIds || [], 'event.objectIds'),
    beforeFingerprint: text(spec.beforeFingerprint, 'event.beforeFingerprint'),
    afterFingerprint: text(spec.afterFingerprint, 'event.afterFingerprint'),
    timestamp: validTimestamp(spec.timestamp, 'event.timestamp'),
    status,
    unresolvedReasons,
    evidenceRefs: []
  };
  const identity = { ...event, timestamp: null, parentEventIds: [], sourceEventIds: [], evidenceRefs: [] };
  const eventId = `prov-event:${kind}:${stableHash(identity).split(':').at(-1)}`;
  return {
    ...event,
    eventId,
    fingerprint: stableHash(identity),
    _parentEntities: (spec.parentEntities || []).map((item, index) => normalizeEntity(item, `event.parentEntities[${index}]`))
  };
}

function createCollector(documentId) {
  const events = new Map();
  const evidenceKeys = new Map();
  const conflicts = [];

  const add = (spec, evidenceKeyValue) => {
    const event = normalizeEventSpec(spec, documentId);
    const evidenceKey = text(evidenceKeyValue, 'evidenceKey', { required: true, max: 360 });
    const priorForKey = evidenceKeys.get(evidenceKey);
    if (priorForKey && priorForKey !== event.eventId) {
      conflicts.push({
        evidenceKey,
        eventIds: [priorForKey, event.eventId].sort(),
        reason: 'EVIDENCE_KEY_CONFLICT'
      });
    } else {
      evidenceKeys.set(evidenceKey, event.eventId);
    }

    const existing = events.get(event.eventId);
    if (!existing) {
      event.evidenceRefs = [evidenceKey];
      events.set(event.eventId, event);
      return event.eventId;
    }

    existing.evidenceRefs = [...new Set([...existing.evidenceRefs, evidenceKey])].sort();
    if (event.timestamp && (!existing.timestamp || event.timestamp < existing.timestamp)) existing.timestamp = event.timestamp;
    const parentMap = new Map(existing._parentEntities.map(item => [entityKey(item), item]));
    for (const item of event._parentEntities) parentMap.set(entityKey(item), item);
    existing._parentEntities = [...parentMap.values()].sort((a, b) => entityKey(a).localeCompare(entityKey(b)));
    return existing.eventId;
  };

  return { events, conflicts, add };
}

function sourceFromMetadata(metadata, objectId) {
  const source = metadata?.source;
  if (typeof source === 'string' && source.trim()) return { type: 'source', id: source.trim() };
  if (record(source)) {
    const id = source.id ?? source.name;
    if (id != null && id !== '') return { type: text(source.type, `object.${objectId}.metadata.source.type`, { max: 80 }) || 'source', id: text(id, `object.${objectId}.metadata.source.id`, { required: true }) };
  }
  return null;
}

function addDocumentObjectEvidence(document, documentId, collector) {
  for (const { found } of sortedObjectEntries(document)) {
    const object = found.object;
    const metadata = record(object.metadata) ? object.metadata : {};
    const semantic = record(object.semantic) ? object.semantic : {};
    const target = { type: 'object', id: object.id };

    const source = sourceFromMetadata(metadata, object.id);
    if (source) {
      collector.add({
        kind: 'object-source',
        source,
        target,
        objectIds: [object.id]
      }, `object-source:${object.id}`);
    }

    const sourceObjectId = object.sourceObjectId ?? metadata.sourceObjectId;
    if (sourceObjectId != null && sourceObjectId !== '') {
      const normalizedSourceObjectId = text(sourceObjectId, `object.${object.id}.sourceObjectId`, { required: true });
      collector.add({
        kind: 'object-derived',
        source: { type: 'object', id: normalizedSourceObjectId },
        target,
        objectIds: [normalizedSourceObjectId, object.id]
      }, `object-derived:${object.id}`);
    }

    if (record(metadata.extraction)) {
      const extraction = metadata.extraction;
      const referenceObjectId = text(extraction.referenceObjectId, `object.${object.id}.metadata.extraction.referenceObjectId`);
      const sourceName = text(extraction.source?.name ?? extraction.sourceName, `object.${object.id}.metadata.extraction.sourceName`);
      const batchId = text(extraction.batchId, `object.${object.id}.metadata.extraction.batchId`);
      const extractionSource = referenceObjectId
        ? { type: 'object', id: referenceObjectId }
        : sourceName ? { type: 'reference', id: sourceName } : null;
      collector.add({
        kind: 'extraction',
        source: extractionSource,
        target,
        batchId,
        operation: text(extraction.schema, `object.${object.id}.metadata.extraction.schema`, { max: 160 }),
        objectIds: [object.id],
        status: extractionSource ? 'RESOLVED' : 'UNRESOLVED',
        unresolvedReasons: extractionSource ? [] : ['EXTRACTION_SOURCE_MISSING']
      }, `extraction:${object.id}:${batchId || 'none'}`);
    }

    const recipeId = text(semantic.sourceRecipeId ?? metadata.sourceRecipeId, `object.${object.id}.sourceRecipeId`);
    const stepId = text(semantic.sourceStepId ?? metadata.sourceStepId, `object.${object.id}.sourceStepId`);
    if (recipeId || stepId) {
      const sourceId = recipeId && stepId ? `${recipeId}/${stepId}` : (recipeId || stepId);
      collector.add({
        kind: 'recipe-object',
        source: { type: stepId ? 'recipe-step' : 'recipe', id: sourceId },
        target,
        recipeId,
        stepId,
        objectIds: [object.id],
        status: recipeId && stepId ? 'RESOLVED' : 'UNRESOLVED',
        unresolvedReasons: recipeId && stepId ? [] : ['RECIPE_STEP_LINK_INCOMPLETE']
      }, `recipe-object:${object.id}:${recipeId || 'none'}:${stepId || 'none'}`);
    }
  }
}

function validateEnvelope(envelope, index) {
  if (!record(envelope)
      || envelope.schema !== 'INK-FILE-ENVELOPE'
      || envelope.version !== '1.0'
      || !record(envelope.document)) fail('FILE_ENVELOPE_INVALID', { index });
  return {
    fileId: text(envelope.fileId, `fileEnvelopes[${index}].fileId`, { required: true }),
    revisionId: text(envelope.revisionId, `fileEnvelopes[${index}].revisionId`, { required: true }),
    documentId: text(envelope.document.id, `fileEnvelopes[${index}].document.id`, { required: true }),
    fingerprint: text(envelope.integrity?.fingerprint, `fileEnvelopes[${index}].integrity.fingerprint`, { required: true }),
    timestamp: validTimestamp(envelope.savedAt, `fileEnvelopes[${index}].savedAt`)
  };
}

function addFileEnvelopeEvidence(fileEnvelopes, documentId, collector) {
  if (!Array.isArray(fileEnvelopes)) fail('FILE_ENVELOPES_INVALID');
  fileEnvelopes.forEach((envelope, index) => {
    const value = validateEnvelope(envelope, index);
    if (value.documentId !== documentId) fail('DOCUMENT_ID_MISMATCH', { expected: documentId, actual: value.documentId });
    collector.add({
      kind: 'file-envelope',
      source: { type: 'file', id: value.fileId },
      target: { type: 'document', id: documentId },
      revisionId: value.revisionId,
      afterFingerprint: value.fingerprint,
      timestamp: value.timestamp
    }, `file-envelope:${value.fileId}:${value.revisionId}`);
  });
}

function validateRevisionComparison(comparison, field) {
  if (!record(comparison)
      || comparison.schema !== 'INK-REVISION-COMPARISON'
      || Number(comparison.version) !== 1) fail('REVISION_COMPARISON_INVALID', { field });
  for (const key of ['addedObjectIds', 'changedObjectIds', 'removedObjectIds']) {
    if (!Array.isArray(comparison[key])) fail('REVISION_COMPARISON_INVALID', { field: `${field}.${key}` });
  }
  return comparison;
}

function addRevisionComparisonChanges(comparison, context, collector, evidencePrefix) {
  const beforeFingerprint = text(comparison.beforeDocumentFingerprint, `${evidencePrefix}.beforeDocumentFingerprint`);
  const afterFingerprint = text(comparison.afterDocumentFingerprint, `${evidencePrefix}.afterDocumentFingerprint`, { required: true });
  for (const [key, operation, kind] of [
    ['addedObjectIds', 'object.add', 'revision-object-added'],
    ['changedObjectIds', 'object.change', 'revision-object-changed'],
    ['removedObjectIds', 'object.remove', 'revision-object-removed']
  ]) {
    const ids = stringList(comparison[key], `${evidencePrefix}.${key}`);
    for (const objectId of ids) {
      collector.add({
        kind,
        source: context.revisionId ? { type: 'revision', id: context.revisionId } : { type: 'document', id: context.documentId },
        target: { type: 'object', id: objectId },
        documentId: context.documentId,
        revisionId: context.revisionId,
        parentEntities: context.revisionId ? [{ type: 'revision', id: context.revisionId }] : [],
        operation,
        objectIds: [objectId],
        beforeFingerprint,
        afterFingerprint
      }, `${evidencePrefix}:${operation}:${objectId}`);
    }
  }
}

function addRevisionEvidence(revisionRecords, revisionComparisons, documentId, collector) {
  if (!Array.isArray(revisionRecords)) fail('REVISION_RECORDS_INVALID');
  for (const [index, revision] of revisionRecords.entries()) {
    if (!record(revision)
        || revision.schema !== 'INK-REVISION-RECORD'
        || Number(revision.version) !== 1) fail('REVISION_RECORD_INVALID', { index });
    const revisionId = text(revision.revisionId, `revisionRecords[${index}].revisionId`, { required: true });
    const recordDocumentId = text(revision.documentId, `revisionRecords[${index}].documentId`, { required: true });
    if (recordDocumentId !== documentId) fail('DOCUMENT_ID_MISMATCH', { expected: documentId, actual: recordDocumentId });
    const parentRevisionId = text(revision.parentRevisionId, `revisionRecords[${index}].parentRevisionId`, { max: 220 });
    const baseRevisionId = text(revision.baseRevisionId, `revisionRecords[${index}].baseRevisionId`, { max: 220 });
    const parentEntities = [...new Map([parentRevisionId, baseRevisionId].filter(Boolean).map(id => [id, { type: 'revision', id }])).values()];
    const comparison = revision.comparison == null ? null : validateRevisionComparison(revision.comparison, `revisionRecords[${index}].comparison`);
    collector.add({
      kind: 'revision',
      source: parentRevisionId ? { type: 'revision', id: parentRevisionId } : { type: 'document', id: documentId },
      target: { type: 'revision', id: revisionId },
      revisionId,
      parentEntities,
      operation: text(revision.reason, `revisionRecords[${index}].reason`, { max: 160 }),
      beforeFingerprint: comparison ? text(comparison.beforeDocumentFingerprint, `revisionRecords[${index}].comparison.beforeDocumentFingerprint`) : null,
      afterFingerprint: text(revision.documentFingerprint, `revisionRecords[${index}].documentFingerprint`, { required: true }),
      timestamp: validTimestamp(revision.createdAt, `revisionRecords[${index}].createdAt`)
    }, `revision:${revisionId}`);
    if (comparison) addRevisionComparisonChanges(comparison, { documentId, revisionId }, collector, `revision:${revisionId}:comparison`);
  }

  if (!Array.isArray(revisionComparisons)) fail('REVISION_COMPARISONS_INVALID');
  for (const [index, raw] of revisionComparisons.entries()) {
    const wrapper = raw?.comparison ? raw : { comparison: raw };
    const comparison = validateRevisionComparison(wrapper.comparison, `revisionComparisons[${index}]`);
    const revisionId = text(wrapper.revisionId, `revisionComparisons[${index}].revisionId`, { max: 220 });
    addRevisionComparisonChanges(comparison, { documentId, revisionId }, collector, `revision-comparison:${revisionId || stableHash(comparison)}`);
  }
}

function addHistoryEvidence(historyEntries, documentId, collector) {
  if (!Array.isArray(historyEntries)) fail('HISTORY_ENTRIES_INVALID');
  historyEntries.forEach((entry, index) => {
    if (!record(entry)) fail('HISTORY_ENTRY_INVALID', { index });
    const objectIds = stringList(entry.objectIds || [], `historyEntries[${index}].objectIds`);
    const label = text(entry.label, `historyEntries[${index}].label`, { required: true });
    const evidenceId = text(entry.evidenceId, `historyEntries[${index}].evidenceId`) || stableHash({
      label,
      objectIds,
      patchCount: Number(entry.patchCount || 0),
      storedBytes: Number(entry.storedBytes || 0)
    });
    collector.add({
      kind: 'history-change',
      source: { type: 'document', id: documentId },
      target: { type: 'document', id: documentId },
      operation: label,
      objectIds
    }, `history:${evidenceId}`);
  });
}

function addRecipeEvidence(recipeEvidence, documentId, collector) {
  if (!Array.isArray(recipeEvidence)) fail('RECIPE_EVIDENCE_INVALID');
  recipeEvidence.forEach((item, index) => {
    if (!record(item)) fail('RECIPE_EVIDENCE_INVALID', { index });
    const recipeId = text(item.recipeId ?? item.id, `recipeEvidence[${index}].recipeId`);
    const executionId = text(item.executionId, `recipeEvidence[${index}].executionId`);
    const evidenceId = text(item.evidenceId, `recipeEvidence[${index}].evidenceId`);
    const timestamp = validTimestamp(item.startedAt ?? item.finishedAt ?? item.timestamp, `recipeEvidence[${index}].timestamp`);

    if (recipeId && Array.isArray(item.steps) && !executionId) {
      collector.add({
        kind: 'recipe-definition',
        source: { type: 'document', id: documentId },
        target: { type: 'recipe', id: recipeId },
        recipeId,
        timestamp
      }, evidenceId || `recipe-definition:${recipeId}`);
      for (const [stepIndex, step] of item.steps.entries()) {
        if (!record(step)) fail('RECIPE_STEP_INVALID', { index, stepIndex });
        const stepId = text(step.id ?? step.stepId, `recipeEvidence[${index}].steps[${stepIndex}].id`, { required: true });
        collector.add({
          kind: 'recipe-step-definition',
          source: { type: 'recipe', id: recipeId },
          target: { type: 'recipe-step', id: `${recipeId}/${stepId}` },
          parentEntities: [{ type: 'recipe', id: recipeId }],
          recipeId,
          stepId,
          operation: text(step.op ?? step.operation, `recipeEvidence[${index}].steps[${stepIndex}].operation`, { max: 160 })
        }, `${evidenceId || `recipe-definition:${recipeId}`}:step:${stepId}`);
      }
      return;
    }

    if (recipeId && executionId) {
      collector.add({
        kind: 'recipe-execution',
        source: { type: 'recipe', id: recipeId },
        target: { type: 'recipe-execution', id: executionId },
        parentEntities: [{ type: 'recipe', id: recipeId }],
        recipeId,
        executionId,
        beforeFingerprint: text(item.documentStateBefore ?? item.replayDiff?.beforeHash, `recipeEvidence[${index}].beforeFingerprint`),
        afterFingerprint: text(item.result?.documentHash ?? item.replayDiff?.afterHash, `recipeEvidence[${index}].afterFingerprint`),
        timestamp
      }, evidenceId || `recipe-execution:${executionId}`);
    }

    if (Array.isArray(item.states)) {
      item.states.forEach((state, stateIndex) => {
        if (!record(state)) fail('RECIPE_STATE_INVALID', { index, stateIndex });
        const stepId = text(state.id ?? state.stepId, `recipeEvidence[${index}].states[${stateIndex}].id`);
        const targetId = text(state.targetId, `recipeEvidence[${index}].states[${stateIndex}].targetId`);
        if (!stepId) return;
        const source = executionId
          ? { type: 'recipe-execution', id: executionId }
          : recipeId ? { type: 'recipe', id: recipeId } : null;
        collector.add({
          kind: 'recipe-step',
          source,
          target: targetId ? { type: 'object', id: targetId } : { type: 'recipe-step', id: `${recipeId || 'unknown'}/${stepId}` },
          parentEntities: executionId ? [{ type: 'recipe-execution', id: executionId }] : [],
          recipeId,
          stepId,
          executionId,
          operation: text(state.op ?? state.operation, `recipeEvidence[${index}].states[${stateIndex}].operation`, { max: 160 }),
          objectIds: targetId ? [targetId] : [],
          status: String(state.status || '').toLowerCase() === 'failed' ? 'UNRESOLVED' : 'RESOLVED',
          unresolvedReasons: String(state.status || '').toLowerCase() === 'failed' ? ['RECIPE_STEP_FAILED'] : []
        }, `${evidenceId || executionId || recipeId || `recipe-${index}`}:step:${stepId}:${targetId || 'none'}`);
      });
    }

    if (!recipeId && !executionId && !Array.isArray(item.states) && item.stepId) {
      const stepId = text(item.stepId, `recipeEvidence[${index}].stepId`, { required: true });
      const objectIds = stringList(item.objectIds || (item.objectId ? [item.objectId] : []), `recipeEvidence[${index}].objectIds`);
      collector.add({
        kind: 'recipe-step',
        source: null,
        target: objectIds.length ? { type: 'object', id: objectIds[0] } : { type: 'document', id: documentId },
        recipeId,
        stepId,
        executionId,
        operation: text(item.operation, `recipeEvidence[${index}].operation`, { max: 160 }),
        objectIds,
        status: 'UNRESOLVED',
        unresolvedReasons: ['RECIPE_ID_MISSING']
      }, evidenceId || `recipe-step:${stepId}:${stableHash(objectIds)}`);
    }
  });
}

function targetObjectIds(targets, field) {
  if (targets == null) return [];
  if (!Array.isArray(targets)) fail('CHAT_TARGETS_INVALID', { field });
  const ids = [];
  for (const [index, target] of targets.entries()) {
    if (typeof target === 'string') ids.push(text(target, `${field}[${index}]`, { required: true }));
    else if (record(target)) {
      const id = target.objectId ?? target.ref?.objectId ?? target.id;
      if (id != null) ids.push(text(id, `${field}[${index}].objectId`, { required: true }));
    } else fail('CHAT_TARGETS_INVALID', { field, index });
  }
  return [...new Set(ids)].sort();
}

function addChatEvidence(chatEvidence, documentId, collector) {
  if (!Array.isArray(chatEvidence)) fail('CHAT_EVIDENCE_INVALID');
  chatEvidence.forEach((item, index) => {
    if (!record(item)) fail('CHAT_EVIDENCE_INVALID', { index });
    const evidenceId = text(item.evidenceId, `chatEvidence[${index}].evidenceId`);
    const format = text(item.format ?? item.schema, `chatEvidence[${index}].format`, { max: 120 });

    if (format === 'INK-EDITABLE-PLAN' || format === 'INK-MODEL-PLAN') {
      const planId = text(item.planId, `chatEvidence[${index}].planId`, { required: true });
      const recipeId = text(item.recipeDraft?.recipeId, `chatEvidence[${index}].recipeDraft.recipeId`);
      collector.add({
        kind: 'chat-plan',
        source: { type: 'document', id: documentId },
        target: { type: 'chat-plan', id: planId },
        planId,
        recipeId,
        beforeFingerprint: text(item.preconditions?.[0]?.documentHash, `chatEvidence[${index}].preconditions.documentHash`)
      }, evidenceId || `chat-plan:${planId}`);
      if (recipeId) {
        collector.add({
          kind: 'chat-plan-recipe',
          source: { type: 'chat-plan', id: planId },
          target: { type: 'recipe', id: recipeId },
          parentEntities: [{ type: 'chat-plan', id: planId }],
          planId,
          recipeId
        }, `${evidenceId || `chat-plan:${planId}`}:recipe:${recipeId}`);
      }
      for (const [stepIndex, step] of (item.orderedSteps || []).entries()) {
        if (!record(step)) fail('CHAT_PLAN_STEP_INVALID', { index, stepIndex });
        const stepId = text(step.stepId, `chatEvidence[${index}].orderedSteps[${stepIndex}].stepId`, { required: true });
        collector.add({
          kind: 'chat-plan-step',
          source: { type: 'chat-plan', id: planId },
          target: { type: 'recipe-step', id: `${recipeId || planId}/${stepId}` },
          parentEntities: [{ type: 'chat-plan', id: planId }],
          operation: text(step.operation, `chatEvidence[${index}].orderedSteps[${stepIndex}].operation`, { max: 160 }),
          recipeId,
          stepId,
          planId,
          objectIds: targetObjectIds(Array.isArray(step.target) ? step.target : step.target == null ? [] : [step.target], `chatEvidence[${index}].orderedSteps[${stepIndex}].target`)
        }, `${evidenceId || `chat-plan:${planId}`}:step:${stepId}`);
      }
      return;
    }

    if (format === 'INK-CHAT-EDIT-PROPOSAL') {
      const proposalId = text(item.proposalId, `chatEvidence[${index}].proposalId`, { required: true });
      const taskId = text(item.task?.taskId, `chatEvidence[${index}].task.taskId`);
      const objectIds = targetObjectIds(item.task?.targets || [], `chatEvidence[${index}].task.targets`);
      collector.add({
        kind: 'chat-proposal',
        source: taskId ? { type: 'chat-task', id: taskId } : { type: 'document', id: documentId },
        target: { type: 'chat-proposal', id: proposalId },
        revisionId: text(item.revisionId, `chatEvidence[${index}].revisionId`, { max: 220 }),
        operation: text(item.task?.operation, `chatEvidence[${index}].task.operation`, { max: 160 }),
        proposalId,
        objectIds,
        beforeFingerprint: text(item.stateFingerprint, `chatEvidence[${index}].stateFingerprint`)
      }, evidenceId || `chat-proposal:${proposalId}`);
      return;
    }

    if (format === 'INK-CHAT-EDIT-RESULT') {
      const proposalId = text(item.proposalId, `chatEvidence[${index}].proposalId`, { required: true });
      const executionId = text(item.executionId, `chatEvidence[${index}].executionId`);
      const objectIds = targetObjectIds(item.targets || [], `chatEvidence[${index}].targets`);
      collector.add({
        kind: 'chat-execution',
        source: { type: 'chat-proposal', id: proposalId },
        target: { type: 'document', id: documentId },
        parentEntities: [{ type: 'chat-proposal', id: proposalId }],
        revisionId: text(item.revision?.currentRevisionId ?? item.revision?.inspectedRevisionId, `chatEvidence[${index}].revisionId`, { max: 220 }),
        operation: text(item.operation, `chatEvidence[${index}].operation`, { max: 160 }),
        proposalId,
        executionId,
        objectIds,
        afterFingerprint: text(item.revision?.documentFingerprint, `chatEvidence[${index}].revision.documentFingerprint`)
      }, evidenceId || `chat-execution:${executionId || proposalId}:${text(item.taskId, `chatEvidence[${index}].taskId`) || 'task'}`);
      return;
    }

    const planId = text(item.planId, `chatEvidence[${index}].planId`);
    const proposalId = text(item.proposalId, `chatEvidence[${index}].proposalId`);
    const executionId = text(item.executionId, `chatEvidence[${index}].executionId`);
    if (planId || proposalId || executionId) {
      const source = proposalId ? { type: 'chat-proposal', id: proposalId } : planId ? { type: 'chat-plan', id: planId } : { type: 'document', id: documentId };
      collector.add({
        kind: executionId ? 'chat-execution' : proposalId ? 'chat-proposal-evidence' : 'chat-plan-evidence',
        source,
        target: { type: 'document', id: documentId },
        planId,
        proposalId,
        executionId,
        operation: text(item.operation, `chatEvidence[${index}].operation`, { max: 160 }),
        objectIds: stringList(item.objectIds || [], `chatEvidence[${index}].objectIds`),
        beforeFingerprint: text(item.beforeFingerprint, `chatEvidence[${index}].beforeFingerprint`),
        afterFingerprint: text(item.afterFingerprint, `chatEvidence[${index}].afterFingerprint`),
        timestamp: validTimestamp(item.timestamp, `chatEvidence[${index}].timestamp`)
      }, evidenceId || `chat-generic:${executionId || proposalId || planId}`);
      return;
    }

    fail('CHAT_EVIDENCE_UNSUPPORTED', { index, format });
  });
}

function addRegionProvenance(region, graphIndex, regionIndex, documentId, collector) {
  const regionId = text(region.regionId, `semanticRegionGraphs[${graphIndex}].regions[${regionIndex}].regionId`, { required: true });
  const objectId = text(region.ref?.objectId, `semanticRegionGraphs[${graphIndex}].regions[${regionIndex}].ref.objectId`, { required: true });
  collector.add({
    kind: 'semantic-region-grounding',
    source: { type: 'object', id: objectId },
    target: { type: 'semantic-region', id: regionId },
    objectIds: [objectId],
    afterFingerprint: text(region.fingerprint, `semanticRegionGraphs[${graphIndex}].regions[${regionIndex}].fingerprint`)
  }, `semantic-region:${regionId}`);

  const provenance = region.provenance;
  if (record(provenance)) {
    if (provenance.kind === 'extraction') {
      const referenceObjectId = text(provenance.referenceObjectId, `semanticRegionGraphs[${graphIndex}].regions[${regionIndex}].provenance.referenceObjectId`);
      const sourceName = text(provenance.sourceName, `semanticRegionGraphs[${graphIndex}].regions[${regionIndex}].provenance.sourceName`);
      const source = referenceObjectId ? { type: 'object', id: referenceObjectId } : sourceName ? { type: 'reference', id: sourceName } : null;
      collector.add({
        kind: 'semantic-region-extraction',
        source,
        target: { type: 'semantic-region', id: regionId },
        batchId: text(provenance.batchId, `semanticRegionGraphs[${graphIndex}].regions[${regionIndex}].provenance.batchId`),
        operation: text(provenance.schema, `semanticRegionGraphs[${graphIndex}].regions[${regionIndex}].provenance.schema`, { max: 160 }),
        objectIds: [objectId],
        status: source ? 'RESOLVED' : 'UNRESOLVED',
        unresolvedReasons: source ? [] : ['EXTRACTION_SOURCE_MISSING']
      }, `semantic-region-extraction:${regionId}`);
    } else if (provenance.kind === 'source') {
      const sourceId = text(provenance.id ?? provenance.name, `semanticRegionGraphs[${graphIndex}].regions[${regionIndex}].provenance.id`);
      if (sourceId) {
        collector.add({
          kind: 'semantic-region-source',
          source: { type: text(provenance.type, `semanticRegionGraphs[${graphIndex}].regions[${regionIndex}].provenance.type`, { max: 80 }) || 'source', id: sourceId },
          target: { type: 'semantic-region', id: regionId },
          objectIds: [objectId]
        }, `semantic-region-source:${regionId}`);
      }
    }
  }

  const recipeId = text(region.semantic?.sourceRecipeId, `semanticRegionGraphs[${graphIndex}].regions[${regionIndex}].semantic.sourceRecipeId`);
  const stepId = text(region.semantic?.sourceStepId, `semanticRegionGraphs[${graphIndex}].regions[${regionIndex}].semantic.sourceStepId`);
  if (recipeId || stepId) {
    collector.add({
      kind: 'semantic-region-recipe',
      source: { type: stepId ? 'recipe-step' : 'recipe', id: recipeId && stepId ? `${recipeId}/${stepId}` : (recipeId || stepId) },
      target: { type: 'semantic-region', id: regionId },
      recipeId,
      stepId,
      objectIds: [objectId],
      status: recipeId && stepId ? 'RESOLVED' : 'UNRESOLVED',
      unresolvedReasons: recipeId && stepId ? [] : ['RECIPE_STEP_LINK_INCOMPLETE']
    }, `semantic-region-recipe:${regionId}:${recipeId || 'none'}:${stepId || 'none'}`);
  }
}

function addSemanticRegionEvidence(graphs, documentId, collector) {
  if (!Array.isArray(graphs)) fail('SEMANTIC_REGION_GRAPHS_INVALID');
  graphs.forEach((graph, graphIndex) => {
    if (!record(graph)
        || graph.schema !== 'INK-SEMANTIC-REGION-GRAPH'
        || Number(graph.version) !== 1
        || graph.document?.id !== documentId
        || !Array.isArray(graph.regions)) fail('SEMANTIC_REGION_GRAPH_INVALID', { graphIndex });
    graph.regions.forEach((region, regionIndex) => {
      if (!record(region)) fail('SEMANTIC_REGION_INVALID', { graphIndex, regionIndex });
      addRegionProvenance(region, graphIndex, regionIndex, documentId, collector);
    });
  });
}

function buildGraphLinks(events, baseUnresolved) {
  const byTarget = new Map();
  for (const event of events) {
    const key = entityKey(event.target);
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key).push(event.eventId);
  }
  for (const ids of byTarget.values()) ids.sort();

  const unresolved = [...baseUnresolved];
  const edges = new Map();

  const addEdge = (from, type, to) => {
    if (!from || !to || from === to) return;
    const key = `${from}\u0000${type}\u0000${to}`;
    edges.set(key, { from, type, to });
  };

  for (const event of events) {
    const sourceIds = event.source ? (byTarget.get(entityKey(event.source)) || []).filter(id => id !== event.eventId) : [];
    event.sourceEventIds = sourceIds;
    for (const sourceEventId of sourceIds) addEdge(sourceEventId, 'derived-from', event.eventId);

    const parentIds = new Set();
    for (const parentEntity of event._parentEntities || []) {
      const matches = (byTarget.get(entityKey(parentEntity)) || []).filter(id => id !== event.eventId);
      for (const match of matches) parentIds.add(match);
      if (!matches.length) unresolved.push({
        kind: 'missing-parent-event',
        eventId: event.eventId,
        entity: parentEntity,
        reason: 'PARENT_EVENT_MISSING'
      });
    }
    event.parentEventIds = [...parentIds].sort();
    for (const parentEventId of event.parentEventIds) addEdge(parentEventId, 'parent-of', event.eventId);

    if (event.source && INTERNAL_ENTITY_TYPES.has(event.source.type) && !sourceIds.length) {
      const sourceExistsAsCurrentObject = event.source.type === 'object'
        && events.some(candidate => candidate.target.type === 'object' && candidate.target.id === event.source.id);
      if (!sourceExistsAsCurrentObject) {
        unresolved.push({
          kind: 'missing-source-event',
          eventId: event.eventId,
          entity: event.source,
          reason: 'SOURCE_EVENT_MISSING'
        });
      }
    }
  }

  const entities = new Map();
  for (const event of events) {
    for (const entity of [event.source, event.target]) {
      if (!entity) continue;
      entities.set(entityKey(entity), entityNode(entity));
    }
  }

  const cleanedEvents = events.map(({ _parentEntities, ...event }) => event);
  return {
    events: cleanedEvents,
    entities: [...entities.values()].sort((a, b) => a.entityId.localeCompare(b.entityId)),
    edges: [...edges.values()].sort((a, b) => a.from.localeCompare(b.from) || a.type.localeCompare(b.type) || a.to.localeCompare(b.to)),
    unresolved: [...new Map(unresolved.map(item => [stableHash(item), item])).values()]
      .sort((a, b) => stableHash(a).localeCompare(stableHash(b)))
  };
}

function semanticGraphFingerprint(payload) {
  const normalized = {
    ...payload,
    events: payload.events.map(event => ({ ...event, timestamp: null })),
    fingerprint: undefined,
    bounds: { ...payload.bounds, outputBytes: null }
  };
  return stableHash(normalized);
}

function materialize(documentId, formatVersion, events, baseUnresolved, conflicts, limits, caps) {
  const linked = buildGraphLinks(events.slice(0, caps.events), baseUnresolved);
  const edgeList = linked.edges.slice(0, caps.edges);
  const unresolvedList = linked.unresolved.slice(0, caps.unresolved);
  const conflictList = [...new Map(conflicts.map(item => [stableHash(item), item])).values()]
    .sort((a, b) => stableHash(a).localeCompare(stableHash(b)))
    .slice(0, caps.conflicts);

  const payload = {
    schema: PROVENANCE_GRAPH_SCHEMA,
    version: PROVENANCE_GRAPH_VERSION,
    document: { id: documentId, formatVersion },
    entities: linked.entities,
    events: linked.events,
    edges: edgeList,
    unresolved: unresolvedList,
    conflicts: conflictList,
    bounds: {
      limits,
      events: { totalAvailable: events.length, returned: linked.events.length, truncated: linked.events.length < events.length },
      edges: { totalAvailable: linked.edges.length, returned: edgeList.length, truncated: edgeList.length < linked.edges.length },
      unresolved: { totalAvailable: linked.unresolved.length, returned: unresolvedList.length, truncated: unresolvedList.length < linked.unresolved.length },
      conflicts: { totalAvailable: conflicts.length, returned: conflictList.length, truncated: conflictList.length < conflicts.length },
      outputBytes: null
    }
  };
  payload.fingerprint = semanticGraphFingerprint(payload);
  payload.bounds.outputBytes = 0;
  for (let pass = 0; pass < 4; pass += 1) {
    const measured = bytes(payload);
    if (measured === payload.bounds.outputBytes) break;
    payload.bounds.outputBytes = measured;
  }
  return payload;
}

function finalize(documentId, formatVersion, events, unresolved, conflicts, limits) {
  const caps = {
    events: Math.min(events.length, limits.maxEvents),
    edges: limits.maxEdges,
    unresolved: limits.maxUnresolved,
    conflicts: limits.maxConflicts
  };
  let payload = materialize(documentId, formatVersion, events, unresolved, conflicts, limits, caps);
  while (payload.bounds.outputBytes > limits.maxBytes) {
    if (caps.edges > 1) caps.edges = Math.max(1, Math.floor(caps.edges * 0.75));
    else if (caps.unresolved > 1) caps.unresolved = Math.max(1, Math.floor(caps.unresolved * 0.75));
    else if (caps.conflicts > 1) caps.conflicts = Math.max(1, Math.floor(caps.conflicts * 0.75));
    else if (caps.events > 1) caps.events -= 1;
    else fail('OUTPUT_BOUNDS_EXCEEDED', { maxBytes: limits.maxBytes, actualBytes: payload.bounds.outputBytes });
    payload = materialize(documentId, formatVersion, events, unresolved, conflicts, limits, caps);
  }
  return payload;
}

export function buildRevisionProvenanceGraph(input = {}, options = {}) {
  if (!record(input) || !record(options)) fail('INPUT_INVALID');
  const document = input.document;
  const documentId = normalizeDocument(document);
  const limits = limitsFrom(options.limits || {});
  const collector = createCollector(documentId);
  const unresolved = [];

  addDocumentObjectEvidence(document, documentId, collector);
  addFileEnvelopeEvidence(input.fileEnvelopes || [], documentId, collector);
  addRevisionEvidence(input.revisionRecords || [], input.revisionComparisons || [], documentId, collector);
  addHistoryEvidence(input.historyEntries || [], documentId, collector);
  addRecipeEvidence(input.recipeEvidence || [], documentId, collector);
  addChatEvidence(input.chatEvidence || [], documentId, collector);
  addSemanticRegionEvidence(input.semanticRegionGraphs || [], documentId, collector);

  const events = [...collector.events.values()].sort((a, b) => a.eventId.localeCompare(b.eventId));
  for (const event of events) {
    if (event.status === 'UNRESOLVED') unresolved.push({
      kind: 'event-unresolved',
      eventId: event.eventId,
      reasons: event.unresolvedReasons
    });
  }

  return finalize(documentId, Number(document.formatVersion), events, unresolved, collector.conflicts, limits);
}

export function provenanceBridgeContext(graph, { maxEvents = 96, maxEdges = 192 } = {}) {
  if (!record(graph)
      || graph.schema !== PROVENANCE_GRAPH_SCHEMA
      || Number(graph.version) !== PROVENANCE_GRAPH_VERSION) fail('GRAPH_INVALID');
  const eventLimit = normalizeLimit(maxEvents, 96, 512, 'maxEvents');
  const edgeLimit = normalizeLimit(maxEdges, 192, 1024, 'maxEdges');
  return {
    schema: PROVENANCE_BRIDGE_SCHEMA,
    version: PROVENANCE_BRIDGE_VERSION,
    documentId: graph.document?.id || null,
    provenanceFingerprint: graph.fingerprint,
    events: (graph.events || []).slice(0, eventLimit).map(event => ({
      eventId: event.eventId,
      kind: event.kind,
      source: event.source,
      target: event.target,
      revisionId: event.revisionId,
      operation: event.operation,
      recipeId: event.recipeId,
      stepId: event.stepId,
      proposalId: event.proposalId,
      planId: event.planId,
      executionId: event.executionId,
      objectIds: event.objectIds,
      beforeFingerprint: event.beforeFingerprint,
      afterFingerprint: event.afterFingerprint,
      status: event.status
    })),
    edges: (graph.edges || []).slice(0, edgeLimit),
    unresolvedCount: graph.unresolved?.length || 0,
    conflictCount: graph.conflicts?.length || 0,
    truncated: {
      events: (graph.events?.length || 0) > eventLimit,
      edges: (graph.edges?.length || 0) > edgeLimit
    }
  };
}

export function createRevisionProvenanceAdapter({
  getDocument,
  getRevisionRecords = null,
  getRevisionComparisons = null,
  getFileEnvelopes = null,
  getHistoryEntries = null,
  getRecipeEvidence = null,
  getChatEvidence = null,
  getSemanticRegionGraphs = null
} = {}) {
  if (typeof getDocument !== 'function') fail('ADAPTER_DOCUMENT_PROVIDER_REQUIRED');
  for (const [name, provider] of Object.entries({
    getRevisionRecords,
    getRevisionComparisons,
    getFileEnvelopes,
    getHistoryEntries,
    getRecipeEvidence,
    getChatEvidence,
    getSemanticRegionGraphs
  })) {
    if (provider != null && typeof provider !== 'function') fail('ADAPTER_PROVIDER_INVALID', { provider: name });
  }

  const readInput = () => ({
    document: getDocument(),
    revisionRecords: getRevisionRecords?.() || [],
    revisionComparisons: getRevisionComparisons?.() || [],
    fileEnvelopes: getFileEnvelopes?.() || [],
    historyEntries: getHistoryEntries?.() || [],
    recipeEvidence: getRecipeEvidence?.() || [],
    chatEvidence: getChatEvidence?.() || [],
    semanticRegionGraphs: getSemanticRegionGraphs?.() || []
  });

  return Object.freeze({
    read(options = {}) {
      return buildRevisionProvenanceGraph(readInput(), options);
    },
    readBridgeContext(options = {}, bridgeOptions = {}) {
      return provenanceBridgeContext(this.read(options), bridgeOptions);
    }
  });
}
