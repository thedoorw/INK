import { stableHash, stableStringify } from '../core/stable-id.js';

export const CREATIVE_MEMORY_RECORD_SCHEMA = 'INK-CREATIVE-MEMORY-RECORD';
export const CREATIVE_MEMORY_COLLECTION_SCHEMA = 'INK-CREATIVE-MEMORY-COLLECTION';
export const CREATIVE_MEMORY_ADVISORY_SCHEMA = 'INK-CREATIVE-MEMORY-ADVISORY-CONTEXT';
export const CREATIVE_MEMORY_VERSION = 1;
export const CREATIVE_MEMORY_FORMAT_VERSION = 4;

export const CREATIVE_MEMORY_CATEGORIES = Object.freeze([
  'SHAPE_VOCABULARY',
  'COMPOSITION_RULE',
  'LINE_BEHAVIOR',
  'MATERIAL_TREATMENT',
  'COLOR_LOGIC',
  'METHOD',
  'CREATIVE_DECISION',
  'APPROACH_RESULT'
]);

export const CREATIVE_MEMORY_DISPOSITIONS = Object.freeze(['ACCEPTED', 'REJECTED', 'UNRESOLVED']);
export const CREATIVE_MEMORY_EVIDENCE_STRENGTHS = Object.freeze(['DIRECT', 'CORROBORATED', 'PARTIAL', 'UNRESOLVED']);

const DEFAULT_LIMITS = Object.freeze({
  maxRecords: 512,
  maxTags: 64,
  maxEvidenceRefs: 96,
  maxRelatedRefs: 128,
  maxUnresolved: 128,
  maxAttributesBytes: 16 * 1024,
  maxRecordBytes: 32 * 1024,
  maxCollectionBytes: 512 * 1024,
  maxQueryRecords: 128,
  maxContextRecords: 64,
  maxContextBytes: 128 * 1024
});

const HARD_LIMITS = Object.freeze({
  maxRecords: 4096,
  maxTags: 256,
  maxEvidenceRefs: 512,
  maxRelatedRefs: 1024,
  maxUnresolved: 1024,
  maxAttributesBytes: 128 * 1024,
  maxRecordBytes: 256 * 1024,
  maxCollectionBytes: 4 * 1024 * 1024,
  maxQueryRecords: 1024,
  maxContextRecords: 256,
  maxContextBytes: 1024 * 1024
});

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export class CreativeMemoryError extends Error {
  constructor(code, details = {}) {
    super(`INK_CREATIVE_MEMORY_${code}`);
    this.name = 'CreativeMemoryError';
    this.code = `CREATIVE_MEMORY_${code}`;
    Object.assign(this, details);
  }
}

function fail(code, details = {}) {
  throw new CreativeMemoryError(code, details);
}

function text(value, field, { required = false, max = 320 } = {}) {
  if (value == null || value === '') {
    if (required) fail('FIELD_REQUIRED', { field });
    return null;
  }
  if (typeof value !== 'string') fail('FIELD_INVALID', { field });
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max) fail('FIELD_INVALID', { field });
  return normalized || null;
}

function boundedInteger(value, fallback, hardMax, field) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > hardMax) fail('LIMIT_INVALID', { field, value });
  return number;
}

function normalizeLimits(raw = {}) {
  if (!record(raw)) fail('LIMITS_INVALID');
  return {
    maxRecords: boundedInteger(raw.maxRecords, DEFAULT_LIMITS.maxRecords, HARD_LIMITS.maxRecords, 'maxRecords'),
    maxTags: boundedInteger(raw.maxTags, DEFAULT_LIMITS.maxTags, HARD_LIMITS.maxTags, 'maxTags'),
    maxEvidenceRefs: boundedInteger(raw.maxEvidenceRefs, DEFAULT_LIMITS.maxEvidenceRefs, HARD_LIMITS.maxEvidenceRefs, 'maxEvidenceRefs'),
    maxRelatedRefs: boundedInteger(raw.maxRelatedRefs, DEFAULT_LIMITS.maxRelatedRefs, HARD_LIMITS.maxRelatedRefs, 'maxRelatedRefs'),
    maxUnresolved: boundedInteger(raw.maxUnresolved, DEFAULT_LIMITS.maxUnresolved, HARD_LIMITS.maxUnresolved, 'maxUnresolved'),
    maxAttributesBytes: boundedInteger(raw.maxAttributesBytes, DEFAULT_LIMITS.maxAttributesBytes, HARD_LIMITS.maxAttributesBytes, 'maxAttributesBytes'),
    maxRecordBytes: boundedInteger(raw.maxRecordBytes, DEFAULT_LIMITS.maxRecordBytes, HARD_LIMITS.maxRecordBytes, 'maxRecordBytes'),
    maxCollectionBytes: boundedInteger(raw.maxCollectionBytes, DEFAULT_LIMITS.maxCollectionBytes, HARD_LIMITS.maxCollectionBytes, 'maxCollectionBytes'),
    maxQueryRecords: boundedInteger(raw.maxQueryRecords, DEFAULT_LIMITS.maxQueryRecords, HARD_LIMITS.maxQueryRecords, 'maxQueryRecords'),
    maxContextRecords: boundedInteger(raw.maxContextRecords, DEFAULT_LIMITS.maxContextRecords, HARD_LIMITS.maxContextRecords, 'maxContextRecords'),
    maxContextBytes: boundedInteger(raw.maxContextBytes, DEFAULT_LIMITS.maxContextBytes, HARD_LIMITS.maxContextBytes, 'maxContextBytes')
  };
}

function canonical(value, field = 'value') {
  if (Array.isArray(value)) return value.map((item, index) => canonical(item, `${field}[${index}]`));
  if (record(value)) {
    const output = {};
    for (const key of Object.keys(value).sort()) output[key] = canonical(value[key], `${field}.${key}`);
    return output;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) fail('NON_JSON_VALUE', { field });
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') fail('NON_JSON_VALUE', { field });
  return value === undefined ? null : value;
}

function byteLength(value) {
  const serialized = stableStringify(canonical(value));
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(serialized).byteLength;
  let bytes = 0;
  for (const character of serialized) {
    const code = character.codePointAt(0);
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function boundedStringList(raw, field, maxItems, itemMax = 240) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) fail('LIST_INVALID', { field });
  if (raw.length > maxItems) fail('LIST_LIMIT_EXCEEDED', { field, actual: raw.length, max: maxItems });
  const values = raw.map((item, index) => text(item, `${field}[${index}]`, { required: true, max: itemMax }));
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function normalizeScope(raw) {
  if (!record(raw)) fail('SCOPE_REQUIRED');
  const scope = {
    projectId: text(raw.projectId, 'scope.projectId', { max: 240 }),
    documentId: text(raw.documentId, 'scope.documentId', { max: 240 })
  };
  if (!scope.projectId && !scope.documentId) fail('SCOPE_ID_REQUIRED');
  return scope;
}

function normalizeCreatedFrom(raw) {
  if (!record(raw)) fail('CREATED_FROM_REQUIRED');
  return {
    kind: text(raw.kind, 'createdFrom.kind', { required: true, max: 120 }),
    id: text(raw.id, 'createdFrom.id', { required: true, max: 320 }),
    fingerprint: text(raw.fingerprint, 'createdFrom.fingerprint', { max: 320 })
  };
}

function normalizeEvidenceRefs(raw, limits) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) fail('EVIDENCE_REFS_INVALID');
  if (raw.length > limits.maxEvidenceRefs) fail('EVIDENCE_REF_LIMIT_EXCEEDED', { actual: raw.length, max: limits.maxEvidenceRefs });
  const values = raw.map((item, index) => {
    if (!record(item)) fail('EVIDENCE_REF_INVALID', { index });
    const status = text(item.status ?? 'RESOLVED', `sourceEvidence[${index}].status`, { required: true, max: 32 });
    if (!['RESOLVED', 'UNRESOLVED'].includes(status)) fail('EVIDENCE_STATUS_UNSUPPORTED', { index, status });
    return {
      kind: text(item.kind, `sourceEvidence[${index}].kind`, { required: true, max: 120 }),
      id: text(item.id, `sourceEvidence[${index}].id`, { required: true, max: 320 }),
      fingerprint: text(item.fingerprint, `sourceEvidence[${index}].fingerprint`, { max: 320 }),
      status
    };
  });
  const dedup = new Map(values.map(item => [stableStringify(item), item]));
  return [...dedup.values()].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
}

function normalizeReferences(raw, limits) {
  const value = raw == null ? {} : raw;
  if (!record(value)) fail('REFERENCES_INVALID');
  return {
    revisionIds: boundedStringList(value.revisionIds, 'references.revisionIds', limits.maxRelatedRefs, 320),
    provenanceIds: boundedStringList(value.provenanceIds, 'references.provenanceIds', limits.maxRelatedRefs, 320),
    decisionIds: boundedStringList(value.decisionIds, 'references.decisionIds', limits.maxRelatedRefs, 320),
    objectIds: boundedStringList(value.objectIds, 'references.objectIds', limits.maxRelatedRefs, 320),
    regionIds: boundedStringList(value.regionIds, 'references.regionIds', limits.maxRelatedRefs, 320)
  };
}

function normalizeUnresolved(raw, limits) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) fail('UNRESOLVED_INVALID');
  if (raw.length > limits.maxUnresolved) fail('UNRESOLVED_LIMIT_EXCEEDED', { actual: raw.length, max: limits.maxUnresolved });
  const values = raw.map((item, index) => {
    if (typeof item === 'string') {
      return { code: text(item, `unresolvedEvidence[${index}]`, { required: true, max: 160 }), kind: null, id: null, detail: null };
    }
    if (!record(item)) fail('UNRESOLVED_ITEM_INVALID', { index });
    return {
      code: text(item.code, `unresolvedEvidence[${index}].code`, { required: true, max: 160 }),
      kind: text(item.kind, `unresolvedEvidence[${index}].kind`, { max: 120 }),
      id: text(item.id, `unresolvedEvidence[${index}].id`, { max: 320 }),
      detail: text(item.detail, `unresolvedEvidence[${index}].detail`, { max: 500 })
    };
  });
  const dedup = new Map(values.map(item => [stableStringify(item), item]));
  return [...dedup.values()].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
}

function normalizeAttributes(raw, limits) {
  if (raw == null) return {};
  if (!record(raw)) fail('ATTRIBUTES_INVALID');
  const value = canonical(raw, 'attributes');
  const bytes = byteLength(value);
  if (bytes > limits.maxAttributesBytes) fail('ATTRIBUTES_BYTE_LIMIT_EXCEEDED', { bytes, max: limits.maxAttributesBytes });
  return value;
}

function normalizeConfidence(raw) {
  if (raw == null) return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0 || number > 1) fail('CONFIDENCE_INVALID', { value: raw });
  return number;
}

function identityPayload(value) {
  return {
    schema: CREATIVE_MEMORY_RECORD_SCHEMA,
    version: CREATIVE_MEMORY_VERSION,
    formatVersion: CREATIVE_MEMORY_FORMAT_VERSION,
    scope: value.scope,
    category: value.category,
    statement: value.statement,
    createdFrom: value.createdFrom,
    sourceEvidence: value.sourceEvidence,
    references: value.references
  };
}

function recordFingerprintPayload(value) {
  const { fingerprint: _fingerprint, ...payload } = value;
  return payload;
}

export function normalizeCreativeMemoryRecord(raw, options = {}) {
  if (!record(raw)) fail('RECORD_INVALID');
  const limits = normalizeLimits(options.limits || {});
  if (raw.schema != null && raw.schema !== CREATIVE_MEMORY_RECORD_SCHEMA) fail('SCHEMA_UNSUPPORTED', { schema: raw.schema });
  if (raw.version != null && Number(raw.version) !== CREATIVE_MEMORY_VERSION) fail('VERSION_UNSUPPORTED', { version: raw.version });
  if (raw.formatVersion != null && Number(raw.formatVersion) !== CREATIVE_MEMORY_FORMAT_VERSION) {
    fail('FORMAT_VERSION_UNSUPPORTED', { actual: raw.formatVersion, expected: CREATIVE_MEMORY_FORMAT_VERSION });
  }

  const category = text(raw.category, 'category', { required: true, max: 80 });
  if (!CREATIVE_MEMORY_CATEGORIES.includes(category)) fail('CATEGORY_UNSUPPORTED', { category });
  const disposition = text(raw.disposition ?? 'UNRESOLVED', 'disposition', { required: true, max: 40 });
  if (!CREATIVE_MEMORY_DISPOSITIONS.includes(disposition)) fail('DISPOSITION_UNSUPPORTED', { disposition });
  const evidenceStrength = text(raw.evidenceStrength ?? 'UNRESOLVED', 'evidenceStrength', { required: true, max: 40 });
  if (!CREATIVE_MEMORY_EVIDENCE_STRENGTHS.includes(evidenceStrength)) fail('EVIDENCE_STRENGTH_UNSUPPORTED', { evidenceStrength });

  const normalized = {
    schema: CREATIVE_MEMORY_RECORD_SCHEMA,
    version: CREATIVE_MEMORY_VERSION,
    formatVersion: CREATIVE_MEMORY_FORMAT_VERSION,
    scope: normalizeScope(raw.scope),
    category,
    title: text(raw.title, 'title', { required: true, max: 240 }),
    sourceEvidence: normalizeEvidenceRefs(raw.sourceEvidence, limits),
    references: normalizeReferences(raw.references, limits),
    statement: text(raw.statement, 'statement', { required: true, max: 4000 }),
    attributes: normalizeAttributes(raw.attributes, limits),
    outcome: text(raw.outcome, 'outcome', { max: 1200 }),
    disposition,
    confidence: normalizeConfidence(raw.confidence),
    evidenceStrength,
    tags: boundedStringList(raw.tags, 'tags', limits.maxTags, 120),
    createdFrom: normalizeCreatedFrom(raw.createdFrom),
    notes: text(raw.notes, 'notes', { max: 2000 }),
    unresolvedEvidence: normalizeUnresolved(raw.unresolvedEvidence, limits)
  };

  const recordId = `creative-memory:${stableHash(identityPayload(normalized)).split(':').at(-1)}`;
  if (own(raw, 'recordId') && raw.recordId !== recordId) fail('RECORD_ID_MISMATCH', { expected: recordId, actual: raw.recordId });
  const withId = { ...normalized, recordId };
  const fingerprint = stableHash(recordFingerprintPayload(withId));
  if (own(raw, 'fingerprint') && raw.fingerprint !== fingerprint) fail('FINGERPRINT_MISMATCH', { expected: fingerprint, actual: raw.fingerprint });
  const output = { ...withId, fingerprint };
  const bytes = byteLength(output);
  if (bytes > limits.maxRecordBytes) fail('RECORD_BYTE_LIMIT_EXCEEDED', { bytes, max: limits.maxRecordBytes });
  return output;
}

export function validateCreativeMemoryRecord(raw, options = {}) {
  try {
    const normalized = normalizeCreativeMemoryRecord(raw, options);
    return { valid: true, record: normalized, error: null };
  } catch (error) {
    if (!(error instanceof CreativeMemoryError)) throw error;
    return { valid: false, record: null, error: { code: error.code, field: error.field ?? null } };
  }
}

function collectionFingerprintPayload(collection) {
  return {
    schema: collection.schema,
    version: collection.version,
    formatVersion: collection.formatVersion,
    records: collection.records,
    bounds: collection.bounds
  };
}

export function createCreativeMemoryCollection(records = [], options = {}) {
  if (!Array.isArray(records)) fail('COLLECTION_RECORDS_INVALID');
  const limits = normalizeLimits(options.limits || {});
  const byId = new Map();
  let deduplicated = 0;
  for (const raw of records) {
    const item = normalizeCreativeMemoryRecord(raw, { limits });
    const prior = byId.get(item.recordId);
    if (!prior) {
      byId.set(item.recordId, item);
      continue;
    }
    if (prior.fingerprint !== item.fingerprint) fail('DUPLICATE_RECORD_CONFLICT', { recordId: item.recordId });
    deduplicated += 1;
  }
  if (byId.size > limits.maxRecords) fail('COLLECTION_LIMIT_EXCEEDED', { actual: byId.size, max: limits.maxRecords });
  const normalizedRecords = [...byId.values()].sort((a, b) => a.recordId.localeCompare(b.recordId));
  const collection = {
    schema: CREATIVE_MEMORY_COLLECTION_SCHEMA,
    version: CREATIVE_MEMORY_VERSION,
    formatVersion: CREATIVE_MEMORY_FORMAT_VERSION,
    records: normalizedRecords,
    bounds: {
      inputRecords: records.length,
      returnedRecords: normalizedRecords.length,
      deduplicated,
      maxRecords: limits.maxRecords
    }
  };
  collection.fingerprint = stableHash(collectionFingerprintPayload(collection));
  const bytes = byteLength(collection);
  if (bytes > limits.maxCollectionBytes) fail('COLLECTION_BYTE_LIMIT_EXCEEDED', { bytes, max: limits.maxCollectionBytes });
  return collection;
}

function normalizeCollection(raw, options = {}) {
  if (Array.isArray(raw)) return createCreativeMemoryCollection(raw, options);
  if (!record(raw) || raw.schema !== CREATIVE_MEMORY_COLLECTION_SCHEMA || !Array.isArray(raw.records)) fail('COLLECTION_INVALID');
  if (Number(raw.formatVersion) !== CREATIVE_MEMORY_FORMAT_VERSION) {
    fail('FORMAT_VERSION_UNSUPPORTED', { actual: raw.formatVersion ?? null, expected: CREATIVE_MEMORY_FORMAT_VERSION });
  }
  return createCreativeMemoryCollection(raw.records, options);
}

export function putCreativeMemoryRecord(collectionInput, rawRecord, { replace = false, limits = {} } = {}) {
  const collection = normalizeCollection(collectionInput, { limits });
  const item = normalizeCreativeMemoryRecord(rawRecord, { limits });
  const index = collection.records.findIndex(existing => existing.recordId === item.recordId);
  if (index < 0) {
    return { status: 'ADDED', record: item, collection: createCreativeMemoryCollection([...collection.records, item], { limits }) };
  }
  const existing = collection.records[index];
  if (existing.fingerprint === item.fingerprint) return { status: 'DEDUPLICATED', record: existing, collection };
  if (!replace) fail('REPLACEMENT_REQUIRED', { recordId: item.recordId });
  const records = collection.records.slice();
  records[index] = item;
  return { status: 'REPLACED', record: item, collection: createCreativeMemoryCollection(records, { limits }) };
}

export function addCreativeMemoryRecord(collection, rawRecord, options = {}) {
  return putCreativeMemoryRecord(collection, rawRecord, { ...options, replace: false });
}

export function replaceCreativeMemoryRecord(collection, rawRecord, options = {}) {
  const normalized = normalizeCollection(collection, options);
  const item = normalizeCreativeMemoryRecord(rawRecord, options);
  if (!normalized.records.some(existing => existing.recordId === item.recordId)) fail('REPLACEMENT_TARGET_MISSING', { recordId: item.recordId });
  return putCreativeMemoryRecord(normalized, item, { ...options, replace: true });
}

function normalizeQuery(raw = {}, limits) {
  if (!record(raw)) fail('QUERY_INVALID');
  const categories = raw.categories == null
    ? (raw.category == null ? [] : [raw.category])
    : raw.categories;
  const normalizedCategories = boundedStringList(categories, 'query.categories', CREATIVE_MEMORY_CATEGORIES.length, 80);
  for (const category of normalizedCategories) if (!CREATIVE_MEMORY_CATEGORIES.includes(category)) fail('CATEGORY_UNSUPPORTED', { category });
  const disposition = text(raw.disposition, 'query.disposition', { max: 40 });
  if (disposition && !CREATIVE_MEMORY_DISPOSITIONS.includes(disposition)) fail('DISPOSITION_UNSUPPORTED', { disposition });
  const evidenceStrength = text(raw.evidenceStrength, 'query.evidenceStrength', { max: 40 });
  if (evidenceStrength && !CREATIVE_MEMORY_EVIDENCE_STRENGTHS.includes(evidenceStrength)) fail('EVIDENCE_STRENGTH_UNSUPPORTED', { evidenceStrength });
  const scopeRaw = raw.scope == null ? {} : raw.scope;
  if (!record(scopeRaw)) fail('QUERY_SCOPE_INVALID');
  return {
    categories: normalizedCategories,
    tags: boundedStringList(raw.tags, 'query.tags', limits.maxTags, 120),
    scope: {
      projectId: text(scopeRaw.projectId, 'query.scope.projectId', { max: 240 }),
      documentId: text(scopeRaw.documentId, 'query.scope.documentId', { max: 240 })
    },
    disposition,
    evidenceStrength,
    relatedRevisionId: text(raw.relatedRevisionId, 'query.relatedRevisionId', { max: 320 })
  };
}

function matchesQuery(item, query) {
  if (query.categories.length && !query.categories.includes(item.category)) return false;
  if (query.tags.length && !query.tags.every(tag => item.tags.includes(tag))) return false;
  if (query.scope.projectId && item.scope.projectId !== query.scope.projectId) return false;
  if (query.scope.documentId && item.scope.documentId !== query.scope.documentId) return false;
  if (query.disposition && item.disposition !== query.disposition) return false;
  if (query.evidenceStrength && item.evidenceStrength !== query.evidenceStrength) return false;
  if (query.relatedRevisionId && !item.references.revisionIds.includes(query.relatedRevisionId)) return false;
  return true;
}

export function queryCreativeMemory(collectionInput, rawQuery = {}, options = {}) {
  const limits = normalizeLimits(options.limits || {});
  const collection = normalizeCollection(collectionInput, { limits });
  const query = normalizeQuery(rawQuery, limits);
  const maxRecords = boundedInteger(options.maxRecords, limits.maxQueryRecords, HARD_LIMITS.maxQueryRecords, 'query.maxRecords');
  const all = collection.records.filter(item => matchesQuery(item, query));
  const records = all.slice(0, maxRecords).map(clone);
  const result = {
    query,
    records,
    bounds: { matched: all.length, returned: records.length, maxRecords, truncated: all.length > records.length }
  };
  result.queryFingerprint = stableHash(result);
  return result;
}

function intersection(a, b) {
  const right = new Set(b);
  return a.filter(item => right.has(item));
}
function difference(a, b) {
  const right = new Set(b);
  return a.filter(item => !right.has(item));
}
function referenceDiff(a, b) {
  return {
    shared: intersection(a, b),
    onlyA: difference(a, b),
    onlyB: difference(b, a)
  };
}

export function compareCreativeMemoryRecords(rawA, rawB, options = {}) {
  const a = normalizeCreativeMemoryRecord(rawA, options);
  const b = normalizeCreativeMemoryRecord(rawB, options);
  const comparison = {
    schema: 'INK-CREATIVE-MEMORY-COMPARISON',
    version: CREATIVE_MEMORY_VERSION,
    formatVersion: CREATIVE_MEMORY_FORMAT_VERSION,
    records: { a: a.recordId, b: b.recordId },
    equivalent: a.fingerprint === b.fingerprint,
    sameStableIdentity: a.recordId === b.recordId,
    sameCategory: a.category === b.category,
    sameScope: stableStringify(a.scope) === stableStringify(b.scope),
    sameStatement: a.statement === b.statement,
    disposition: { a: a.disposition, b: b.disposition, same: a.disposition === b.disposition },
    evidenceStrength: { a: a.evidenceStrength, b: b.evidenceStrength, same: a.evidenceStrength === b.evidenceStrength },
    confidence: { a: a.confidence, b: b.confidence, same: a.confidence === b.confidence },
    tags: referenceDiff(a.tags, b.tags),
    references: {
      revisionIds: referenceDiff(a.references.revisionIds, b.references.revisionIds),
      provenanceIds: referenceDiff(a.references.provenanceIds, b.references.provenanceIds),
      decisionIds: referenceDiff(a.references.decisionIds, b.references.decisionIds),
      objectIds: referenceDiff(a.references.objectIds, b.references.objectIds),
      regionIds: referenceDiff(a.references.regionIds, b.references.regionIds)
    },
    attributes: {
      a: stableHash(a.attributes),
      b: stableHash(b.attributes),
      same: stableStringify(a.attributes) === stableStringify(b.attributes)
    },
    fingerprints: { a: a.fingerprint, b: b.fingerprint }
  };
  comparison.comparisonFingerprint = stableHash(comparison);
  return comparison;
}

export function serializeCreativeMemoryCollection(collection, options = {}) {
  return stableStringify(normalizeCollection(collection, options));
}

function evidenceIndex(evidence = {}) {
  if (!record(evidence)) fail('EVIDENCE_INPUT_INVALID');
  const revisions = Array.isArray(evidence.revisionRecords) ? evidence.revisionRecords : [];
  const provenanceGraphs = evidence.provenanceGraphs == null
    ? []
    : (Array.isArray(evidence.provenanceGraphs) ? evidence.provenanceGraphs : [evidence.provenanceGraphs]);
  const groundedDecisions = Array.isArray(evidence.groundedDecisions) ? evidence.groundedDecisions : [];

  const revisionIds = new Set(revisions.map(item => item?.revisionId).filter(value => typeof value === 'string'));
  const provenanceIds = new Set();
  for (const graph of provenanceGraphs) {
    if (typeof graph?.fingerprint === 'string') provenanceIds.add(graph.fingerprint);
    for (const event of graph?.events || []) if (typeof event?.eventId === 'string') provenanceIds.add(event.eventId);
  }
  const decisionIds = new Set();
  for (const decision of groundedDecisions) {
    if (typeof decision?.fingerprint === 'string') decisionIds.add(decision.fingerprint);
    if (typeof decision?.decisionId === 'string') decisionIds.add(decision.decisionId);
  }
  return { revisionIds, provenanceIds, decisionIds };
}

export function bindCreativeMemoryEvidence(rawRecord, evidence = {}, options = {}) {
  const normalized = normalizeCreativeMemoryRecord(rawRecord, options);
  const index = evidenceIndex(evidence);
  const unresolved = [...normalized.unresolvedEvidence];
  const addMissing = (code, kind, id) => unresolved.push({ code, kind, id, detail: null });
  for (const id of normalized.references.revisionIds) if (!index.revisionIds.has(id)) addMissing('REVISION_EVIDENCE_MISSING', 'REVISION', id);
  for (const id of normalized.references.provenanceIds) if (!index.provenanceIds.has(id)) addMissing('PROVENANCE_EVIDENCE_MISSING', 'PROVENANCE', id);
  for (const id of normalized.references.decisionIds) if (!index.decisionIds.has(id)) addMissing('GROUNDED_DECISION_EVIDENCE_MISSING', 'GROUNDED_DECISION', id);
  const { recordId: _recordId, fingerprint: _fingerprint, ...base } = normalized;
  return normalizeCreativeMemoryRecord({ ...base, unresolvedEvidence: unresolved }, options);
}

function advisoryRecord(item) {
  return clone(item);
}

function approachSummary(items) {
  return items.map(item => ({
    recordId: item.recordId,
    category: item.category,
    title: item.title,
    statement: item.statement,
    outcome: item.outcome,
    evidenceStrength: item.evidenceStrength,
    confidence: item.confidence
  }));
}

function aggregateReferences(items) {
  const output = { revisionIds: new Set(), provenanceIds: new Set(), decisionIds: new Set(), objectIds: new Set(), regionIds: new Set() };
  for (const item of items) for (const key of Object.keys(output)) for (const id of item.references[key]) output[key].add(id);
  return Object.fromEntries(Object.entries(output).map(([key, values]) => [key, [...values].sort((a, b) => a.localeCompare(b))]));
}

function contextPayload(records, queryResult, bounds) {
  const accepted = records.filter(item => item.disposition === 'ACCEPTED');
  const rejected = records.filter(item => item.disposition === 'REJECTED');
  const unresolvedRecords = records.filter(item => item.disposition === 'UNRESOLVED');
  const unresolvedEvidence = records.flatMap(item => item.unresolvedEvidence.map(evidence => ({ recordId: item.recordId, ...evidence })))
    .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  const categories = [...new Set(records.map(item => item.category))].sort((a, b) => a.localeCompare(b));
  const tags = [...new Set(records.flatMap(item => item.tags))].sort((a, b) => a.localeCompare(b));
  return {
    schema: CREATIVE_MEMORY_ADVISORY_SCHEMA,
    version: CREATIVE_MEMORY_VERSION,
    formatVersion: CREATIVE_MEMORY_FORMAT_VERSION,
    authority: {
      role: 'ADVISORY_READ_ONLY',
      documentWrite: false,
      historyWrite: false,
      revisionWrite: false,
      geometryWrite: false,
      renderer: false,
      execution: false,
      networkRequired: false
    },
    query: queryResult.query,
    selectedRecords: records.map(advisoryRecord),
    vocabulary: {
      categories,
      tags,
      methodStatements: records.map(item => ({ recordId: item.recordId, category: item.category, statement: item.statement }))
    },
    approaches: {
      accepted: approachSummary(accepted),
      rejected: approachSummary(rejected),
      unresolved: approachSummary(unresolvedRecords)
    },
    references: aggregateReferences(records),
    unresolvedEvidence,
    bounds
  };
}

export function buildCreativeMemoryAdvisoryContext(collectionInput, rawQuery = {}, options = {}) {
  const limits = normalizeLimits(options.limits || {});
  const maxRecords = boundedInteger(options.maxRecords, limits.maxContextRecords, HARD_LIMITS.maxContextRecords, 'context.maxRecords');
  const maxBytes = boundedInteger(options.maxBytes, limits.maxContextBytes, HARD_LIMITS.maxContextBytes, 'context.maxBytes');
  const queryResult = queryCreativeMemory(collectionInput, rawQuery, { limits, maxRecords });
  let records = queryResult.records.slice();
  let truncatedByBytes = false;
  let context;
  while (true) {
    const bounds = {
      matched: queryResult.bounds.matched,
      returned: records.length,
      maxRecords,
      maxBytes,
      truncatedByCount: queryResult.bounds.matched > queryResult.bounds.returned,
      truncatedByBytes
    };
    context = contextPayload(records, queryResult, bounds);
    const bytes = byteLength(context);
    if (bytes <= maxBytes) {
      context.bounds.outputBytes = bytes;
      break;
    }
    if (!records.length) fail('ADVISORY_CONTEXT_BYTE_LIMIT_EXCEEDED', { bytes, max: maxBytes });
    records.pop();
    truncatedByBytes = true;
  }
  context.contextFingerprint = stableHash(context);
  return context;
}

export function createCreativeMemoryAdapter({ getRecords } = {}) {
  if (typeof getRecords !== 'function') fail('ADAPTER_RECORD_PROVIDER_REQUIRED');
  return Object.freeze({
    read(options = {}) {
      return createCreativeMemoryCollection(clone(getRecords() || []), options);
    },
    query(query = {}, options = {}) {
      return queryCreativeMemory(createCreativeMemoryCollection(clone(getRecords() || []), options), clone(query), options);
    },
    compare(recordA, recordB, options = {}) {
      return compareCreativeMemoryRecords(clone(recordA), clone(recordB), options);
    },
    readAdvisoryContext(query = {}, options = {}) {
      return buildCreativeMemoryAdvisoryContext(createCreativeMemoryCollection(clone(getRecords() || []), options), clone(query), options);
    }
  });
}
