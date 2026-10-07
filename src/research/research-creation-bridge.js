import { stableHash, stableStringify } from '../core/stable-id.js';

export const RESEARCH_EVIDENCE_SCHEMA = 'INK-RESEARCH-EVIDENCE';
export const RESEARCH_PRINCIPLE_SCHEMA = 'INK-RESEARCH-VISUAL-PRINCIPLE';
export const RESEARCH_CONSTRAINT_SCHEMA = 'INK-RESEARCH-CREATIVE-CONSTRAINT';
export const RESEARCH_CREATION_BUNDLE_SCHEMA = 'INK-RESEARCH-CREATION-BUNDLE';
export const RESEARCH_CREATION_ADVISORY_SCHEMA = 'INK-RESEARCH-CREATION-ADVISORY-CONTEXT';
export const RESEARCH_CREATIVE_MEMORY_CANDIDATE_SCHEMA = 'INK-RESEARCH-CREATIVE-MEMORY-CANDIDATE';
export const RESEARCH_CREATION_VERSION = 1;
export const RESEARCH_CREATION_FORMAT_VERSION = 4;

export const RESEARCH_EVIDENCE_CLASSES = Object.freeze([
  'VISUAL_REFERENCE',
  'ARTWORK_DESIGN_EXAMPLE',
  'TECHNIQUE_PROCESS_NOTE',
  'COMPOSITION_OBSERVATION',
  'GEOMETRY_OBSERVATION',
  'PALETTE_COLOR_OBSERVATION',
  'LINE_STROKE_OBSERVATION',
  'MATERIAL_SURFACE_OBSERVATION',
  'USER_RESEARCH_NOTE'
]);

export const RESEARCH_PRINCIPLE_CATEGORIES = Object.freeze([
  'GEOMETRY',
  'COMPOSITION',
  'SHAPE_VOCABULARY',
  'LINE_BEHAVIOR',
  'COLOR_LOGIC',
  'MATERIAL_TREATMENT',
  'SPACING_RHYTHM',
  'HIERARCHY',
  'REPETITION_VARIATION',
  'METHOD'
]);

export const RESEARCH_CONSTRAINT_CLASSES = Object.freeze([
  'GEOMETRY',
  'COMPOSITION',
  'PALETTE_COLOR',
  'LINE_STROKE',
  'MATERIAL',
  'SPACING_RHYTHM',
  'HIERARCHY',
  'REPETITION_VARIATION',
  'METHOD_GUIDANCE'
]);

export const RESEARCH_EVIDENCE_STRENGTHS = Object.freeze(['DIRECT', 'CORROBORATED', 'PARTIAL', 'UNRESOLVED']);
export const RESEARCH_STATES = Object.freeze(['RESOLVED', 'UNRESOLVED', 'CONFLICTING']);

const DEFAULT_LIMITS = Object.freeze({
  maxEvidence: 256,
  maxPrinciples: 256,
  maxConstraints: 256,
  maxTags: 64,
  maxRefs: 128,
  maxAssumptions: 64,
  maxUnresolved: 128,
  maxAttributesBytes: 16 * 1024,
  maxRecordBytes: 48 * 1024,
  maxBundleBytes: 512 * 1024,
  maxContextBytes: 192 * 1024,
  maxContextEvidence: 96,
  maxContextPrinciples: 96,
  maxContextConstraints: 96
});

const HARD_LIMITS = Object.freeze({
  maxEvidence: 2048,
  maxPrinciples: 2048,
  maxConstraints: 2048,
  maxTags: 256,
  maxRefs: 1024,
  maxAssumptions: 256,
  maxUnresolved: 1024,
  maxAttributesBytes: 128 * 1024,
  maxRecordBytes: 256 * 1024,
  maxBundleBytes: 4 * 1024 * 1024,
  maxContextBytes: 1024 * 1024,
  maxContextEvidence: 512,
  maxContextPrinciples: 512,
  maxContextConstraints: 512
});

const CATEGORY_TO_CONSTRAINT = Object.freeze({
  GEOMETRY: 'GEOMETRY',
  COMPOSITION: 'COMPOSITION',
  SHAPE_VOCABULARY: 'GEOMETRY',
  LINE_BEHAVIOR: 'LINE_STROKE',
  COLOR_LOGIC: 'PALETTE_COLOR',
  MATERIAL_TREATMENT: 'MATERIAL',
  SPACING_RHYTHM: 'SPACING_RHYTHM',
  HIERARCHY: 'HIERARCHY',
  REPETITION_VARIATION: 'REPETITION_VARIATION',
  METHOD: 'METHOD_GUIDANCE'
});

const CATEGORY_TO_MEMORY = Object.freeze({
  GEOMETRY: 'SHAPE_VOCABULARY',
  COMPOSITION: 'COMPOSITION_RULE',
  SHAPE_VOCABULARY: 'SHAPE_VOCABULARY',
  LINE_BEHAVIOR: 'LINE_BEHAVIOR',
  COLOR_LOGIC: 'COLOR_LOGIC',
  MATERIAL_TREATMENT: 'MATERIAL_TREATMENT',
  SPACING_RHYTHM: 'COMPOSITION_RULE',
  HIERARCHY: 'COMPOSITION_RULE',
  REPETITION_VARIATION: 'COMPOSITION_RULE',
  METHOD: 'METHOD'
});

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export class ResearchCreationBridgeError extends Error {
  constructor(code, details = {}) {
    super(`INK_RESEARCH_CREATION_${code}`);
    this.name = 'ResearchCreationBridgeError';
    this.code = `RESEARCH_CREATION_${code}`;
    Object.assign(this, details);
  }
}

function fail(code, details = {}) {
  throw new ResearchCreationBridgeError(code, details);
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
  const output = {};
  for (const key of Object.keys(DEFAULT_LIMITS)) {
    output[key] = boundedInteger(raw[key], DEFAULT_LIMITS[key], HARD_LIMITS[key], key);
  }
  return output;
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
  return [...new Set(raw.map((item, index) => text(item, `${field}[${index}]`, { required: true, max: itemMax })))]
    .sort((a, b) => a.localeCompare(b));
}

function normalizeConfidence(raw) {
  if (raw == null) return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0 || number > 1) fail('CONFIDENCE_INVALID', { value: raw });
  return number;
}

function normalizeStrength(raw, field = 'evidenceStrength') {
  const strength = text(raw ?? 'UNRESOLVED', field, { required: true, max: 40 });
  if (!RESEARCH_EVIDENCE_STRENGTHS.includes(strength)) fail('EVIDENCE_STRENGTH_UNSUPPORTED', { field, strength });
  return strength;
}

function normalizeState(raw, field = 'state') {
  const state = text(raw ?? 'RESOLVED', field, { required: true, max: 40 });
  if (!RESEARCH_STATES.includes(state)) fail('STATE_UNSUPPORTED', { field, state });
  return state;
}

function normalizeAttributes(raw, limits, field = 'attributes') {
  if (raw == null) return {};
  if (!record(raw)) fail('ATTRIBUTES_INVALID', { field });
  const value = canonical(raw, field);
  const bytes = byteLength(value);
  if (bytes > limits.maxAttributesBytes) fail('ATTRIBUTES_BYTE_LIMIT_EXCEEDED', { field, bytes, max: limits.maxAttributesBytes });
  return value;
}

function normalizeIssueList(raw, field, limits) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) fail('ISSUE_LIST_INVALID', { field });
  if (raw.length > limits.maxUnresolved) fail('ISSUE_LIMIT_EXCEEDED', { field, actual: raw.length, max: limits.maxUnresolved });
  const values = raw.map((item, index) => {
    if (typeof item === 'string') return { code: text(item, `${field}[${index}]`, { required: true, max: 160 }), detail: null, evidenceId: null };
    if (!record(item)) fail('ISSUE_INVALID', { field, index });
    return {
      code: text(item.code, `${field}[${index}].code`, { required: true, max: 160 }),
      detail: text(item.detail, `${field}[${index}].detail`, { max: 800 }),
      evidenceId: text(item.evidenceId, `${field}[${index}].evidenceId`, { max: 320 })
    };
  });
  const dedup = new Map(values.map(item => [stableStringify(item), item]));
  return [...dedup.values()].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
}

function normalizeSource(raw) {
  if (!record(raw)) fail('SOURCE_REQUIRED');
  return {
    id: text(raw.id, 'source.id', { required: true, max: 320 }),
    type: text(raw.type, 'source.type', { required: true, max: 120 }),
    label: text(raw.label ?? raw.title, 'source.label', { max: 240 }),
    locator: text(raw.locator, 'source.locator', { max: 500 })
  };
}

function normalizeLinkRefs(raw, field, limits) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) fail('REFERENCE_LIST_INVALID', { field });
  if (raw.length > limits.maxRefs) fail('REFERENCE_LIMIT_EXCEEDED', { field, actual: raw.length, max: limits.maxRefs });
  const values = raw.map((item, index) => {
    if (typeof item === 'string') return { type: 'REFERENCE', id: text(item, `${field}[${index}]`, { required: true, max: 320 }) };
    if (!record(item)) fail('REFERENCE_INVALID', { field, index });
    return {
      type: text(item.type ?? 'REFERENCE', `${field}[${index}].type`, { required: true, max: 120 }),
      id: text(item.id, `${field}[${index}].id`, { required: true, max: 320 })
    };
  });
  const dedup = new Map(values.map(item => [`${item.type}\u0000${item.id}`, item]));
  return [...dedup.values()].sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
}

function normalizeProvenance(raw, limits) {
  const value = raw == null ? {} : raw;
  if (!record(value)) fail('PROVENANCE_INVALID');
  return {
    revisionIds: boundedStringList(value.revisionIds, 'provenance.revisionIds', limits.maxRefs, 320),
    provenanceIds: boundedStringList(value.provenanceIds, 'provenance.provenanceIds', limits.maxRefs, 320),
    decisionIds: boundedStringList(value.decisionIds, 'provenance.decisionIds', limits.maxRefs, 320),
    objectIds: boundedStringList(value.objectIds, 'provenance.objectIds', limits.maxRefs, 320),
    regionIds: boundedStringList(value.regionIds, 'provenance.regionIds', limits.maxRefs, 320)
  };
}

function ensureRecordBytes(value, limits, kind) {
  const bytes = byteLength(value);
  if (bytes > limits.maxRecordBytes) fail('RECORD_BYTE_LIMIT_EXCEEDED', { kind, bytes, max: limits.maxRecordBytes });
  return value;
}

function evidenceIdentityPayload(value) {
  return {
    schema: RESEARCH_EVIDENCE_SCHEMA,
    version: RESEARCH_CREATION_VERSION,
    source: value.source,
    evidenceClass: value.evidenceClass,
    observation: value.observation,
    relatedSourceRefs: value.relatedSourceRefs
  };
}

export function normalizeResearchEvidence(raw, options = {}) {
  if (!record(raw)) fail('EVIDENCE_INVALID');
  const limits = normalizeLimits(options.limits || {});
  if (raw.schema != null && raw.schema !== RESEARCH_EVIDENCE_SCHEMA) fail('SCHEMA_UNSUPPORTED', { schema: raw.schema });
  if (raw.version != null && Number(raw.version) !== RESEARCH_CREATION_VERSION) fail('VERSION_UNSUPPORTED', { version: raw.version });
  if (raw.formatVersion != null && Number(raw.formatVersion) !== RESEARCH_CREATION_FORMAT_VERSION) {
    fail('FORMAT_VERSION_UNSUPPORTED', { actual: raw.formatVersion, expected: RESEARCH_CREATION_FORMAT_VERSION });
  }
  const evidenceClass = text(raw.evidenceClass, 'evidenceClass', { required: true, max: 80 });
  if (!RESEARCH_EVIDENCE_CLASSES.includes(evidenceClass)) fail('EVIDENCE_CLASS_UNSUPPORTED', { evidenceClass });
  const normalized = {
    schema: RESEARCH_EVIDENCE_SCHEMA,
    version: RESEARCH_CREATION_VERSION,
    formatVersion: RESEARCH_CREATION_FORMAT_VERSION,
    source: normalizeSource(raw.source),
    evidenceClass,
    title: text(raw.title, 'title', { max: 240 }),
    observation: text(raw.observation, 'observation', { required: true, max: 2000 }),
    attributes: normalizeAttributes(raw.attributes, limits),
    confidence: normalizeConfidence(raw.confidence),
    evidenceStrength: normalizeStrength(raw.evidenceStrength),
    tags: boundedStringList(raw.tags, 'tags', limits.maxTags, 120),
    relatedSourceRefs: normalizeLinkRefs(raw.relatedSourceRefs, 'relatedSourceRefs', limits),
    state: normalizeState(raw.state ?? (raw.unresolved === true ? 'UNRESOLVED' : 'RESOLVED')),
    unresolvedEvidence: normalizeIssueList(raw.unresolvedEvidence, 'unresolvedEvidence', limits),
    provenance: normalizeProvenance(raw.provenance, limits)
  };
  const evidenceId = `research-evidence:${stableHash(evidenceIdentityPayload(normalized)).split(':').at(-1)}`;
  if (own(raw, 'evidenceId') && raw.evidenceId !== evidenceId) fail('EVIDENCE_ID_MISMATCH', { expected: evidenceId, actual: raw.evidenceId });
  const withId = { ...normalized, evidenceId };
  const fingerprint = stableHash(withId);
  if (own(raw, 'fingerprint') && raw.fingerprint !== fingerprint) fail('EVIDENCE_FINGERPRINT_MISMATCH', { expected: fingerprint, actual: raw.fingerprint });
  return ensureRecordBytes({ ...withId, fingerprint }, limits, 'EVIDENCE');
}

function normalizeEvidenceCollection(raw, options = {}) {
  const limits = normalizeLimits(options.limits || {});
  const list = Array.isArray(raw) ? raw : raw?.evidence;
  if (!Array.isArray(list)) fail('EVIDENCE_COLLECTION_INVALID');
  if (list.length > limits.maxEvidence) fail('EVIDENCE_LIMIT_EXCEEDED', { actual: list.length, max: limits.maxEvidence });
  const map = new Map();
  for (const item of list) {
    const evidence = normalizeResearchEvidence(item, { limits });
    const prior = map.get(evidence.evidenceId);
    if (prior && prior.fingerprint !== evidence.fingerprint) fail('EVIDENCE_ID_CONFLICT', { evidenceId: evidence.evidenceId });
    map.set(evidence.evidenceId, evidence);
  }
  return [...map.values()].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
}

function normalizeApplicabilityScope(raw = {}) {
  if (!record(raw)) fail('APPLICABILITY_SCOPE_INVALID');
  return {
    projectId: text(raw.projectId, 'applicabilityScope.projectId', { max: 240 }),
    documentId: text(raw.documentId, 'applicabilityScope.documentId', { max: 240 }),
    referenceIds: boundedStringList(raw.referenceIds, 'applicabilityScope.referenceIds', 128, 320),
    tags: boundedStringList(raw.tags, 'applicabilityScope.tags', 64, 120)
  };
}

function normalizeEvidenceIdList(raw, field, limits, { required = false } = {}) {
  const ids = boundedStringList(raw, field, limits.maxRefs, 320);
  if (required && !ids.length) fail('SUPPORTING_EVIDENCE_REQUIRED', { field });
  return ids;
}

function resolvedEvidenceRefs(ids, evidenceMap, field) {
  return ids.map(id => {
    const evidence = evidenceMap.get(id);
    if (!evidence) fail('SUPPORTING_EVIDENCE_MISSING', { field, evidenceId: id });
    return { evidenceId: id, fingerprint: evidence.fingerprint, state: evidence.state, evidenceStrength: evidence.evidenceStrength };
  });
}

function principleIdentityPayload(value) {
  return {
    schema: RESEARCH_PRINCIPLE_SCHEMA,
    version: RESEARCH_CREATION_VERSION,
    category: value.category,
    statement: value.statement,
    supportingEvidence: value.supportingEvidence,
    applicabilityScope: value.applicabilityScope
  };
}

export function normalizeResearchPrinciple(raw, evidenceInput, options = {}) {
  if (!record(raw)) fail('PRINCIPLE_INVALID');
  const limits = normalizeLimits(options.limits || {});
  const evidence = normalizeEvidenceCollection(evidenceInput, { limits });
  const evidenceMap = new Map(evidence.map(item => [item.evidenceId, item]));
  const category = text(raw.category, 'category', { required: true, max: 80 });
  if (!RESEARCH_PRINCIPLE_CATEGORIES.includes(category)) fail('PRINCIPLE_CATEGORY_UNSUPPORTED', { category });
  const supportingIds = normalizeEvidenceIdList(raw.supportingEvidenceRefs, 'supportingEvidenceRefs', limits, { required: true });
  const conflictIds = normalizeEvidenceIdList(raw.conflictingEvidenceRefs, 'conflictingEvidenceRefs', limits);
  const supportingEvidence = resolvedEvidenceRefs(supportingIds, evidenceMap, 'supportingEvidenceRefs');
  const conflictingEvidence = resolvedEvidenceRefs(conflictIds, evidenceMap, 'conflictingEvidenceRefs');
  const explicitState = raw.state == null ? null : normalizeState(raw.state, 'state');
  const derivedState = conflictIds.length ? 'CONFLICTING' : (supportingEvidence.some(item => item.state !== 'RESOLVED') ? 'UNRESOLVED' : 'RESOLVED');
  const normalized = {
    schema: RESEARCH_PRINCIPLE_SCHEMA,
    version: RESEARCH_CREATION_VERSION,
    formatVersion: RESEARCH_CREATION_FORMAT_VERSION,
    category,
    label: text(raw.label ?? raw.title, 'label', { required: true, max: 240 }),
    statement: text(raw.statement, 'statement', { required: true, max: 2000 }),
    applicabilityScope: normalizeApplicabilityScope(raw.applicabilityScope || {}),
    confidence: normalizeConfidence(raw.confidence),
    evidenceStrength: normalizeStrength(raw.evidenceStrength),
    state: explicitState || derivedState,
    supportingEvidence,
    conflictingEvidence,
    assumptions: boundedStringList(raw.assumptions, 'assumptions', limits.maxAssumptions, 500),
    unresolvedEvidence: normalizeIssueList(raw.unresolvedEvidence, 'unresolvedEvidence', limits),
    attributes: normalizeAttributes(raw.attributes, limits),
    tags: boundedStringList(raw.tags, 'tags', limits.maxTags, 120)
  };
  if (normalized.state === 'RESOLVED' && (conflictingEvidence.length || supportingEvidence.some(item => item.state !== 'RESOLVED'))) {
    fail('PRINCIPLE_STATE_CONTRADICTION');
  }
  const principleId = `research-principle:${stableHash(principleIdentityPayload(normalized)).split(':').at(-1)}`;
  if (own(raw, 'principleId') && raw.principleId !== principleId) fail('PRINCIPLE_ID_MISMATCH', { expected: principleId, actual: raw.principleId });
  const withId = { ...normalized, principleId };
  const fingerprint = stableHash(withId);
  if (own(raw, 'fingerprint') && raw.fingerprint !== fingerprint) fail('PRINCIPLE_FINGERPRINT_MISMATCH', { expected: fingerprint, actual: raw.fingerprint });
  return ensureRecordBytes({ ...withId, fingerprint }, limits, 'PRINCIPLE');
}

export function extractResearchPrinciples(evidenceInput, principleCandidates = [], options = {}) {
  const limits = normalizeLimits(options.limits || {});
  const evidence = normalizeEvidenceCollection(evidenceInput, { limits });
  if (!Array.isArray(principleCandidates)) fail('PRINCIPLE_CANDIDATES_INVALID');
  if (principleCandidates.length > limits.maxPrinciples) fail('PRINCIPLE_LIMIT_EXCEEDED', { actual: principleCandidates.length, max: limits.maxPrinciples });
  const map = new Map();
  for (const raw of principleCandidates) {
    const principle = normalizeResearchPrinciple(raw, evidence, { limits });
    const prior = map.get(principle.principleId);
    if (prior && prior.fingerprint !== principle.fingerprint) fail('PRINCIPLE_ID_CONFLICT', { principleId: principle.principleId });
    map.set(principle.principleId, principle);
  }
  return [...map.values()].sort((a, b) => a.principleId.localeCompare(b.principleId));
}

function normalizePrincipleCollection(raw, evidence, options = {}) {
  if (Array.isArray(raw) && raw.every(item => item?.schema === RESEARCH_PRINCIPLE_SCHEMA && item?.fingerprint)) {
    const limits = normalizeLimits(options.limits || {});
    const candidates = raw.map(item => {
      const { principleId: _id, fingerprint: _fingerprint, supportingEvidence, conflictingEvidence, ...base } = item;
      return {
        ...base,
        supportingEvidenceRefs: (supportingEvidence || []).map(ref => ref.evidenceId),
        conflictingEvidenceRefs: (conflictingEvidence || []).map(ref => ref.evidenceId)
      };
    });
    return extractResearchPrinciples(evidence, candidates, { limits });
  }
  return extractResearchPrinciples(evidence, raw || [], options);
}

function assertAdvisoryShape(value, field = 'constraint') {
  const forbidden = new Set(['command', 'commands', 'approvalToken', 'executionToken', 'autoExecute', 'documentMutation']);
  const visit = (item, path) => {
    if (Array.isArray(item)) return item.forEach((child, index) => visit(child, `${path}[${index}]`));
    if (!record(item)) return;
    for (const [key, child] of Object.entries(item)) {
      if (forbidden.has(key)) fail('EXECUTION_SHAPE_PROHIBITED', { field: `${path}.${key}` });
      visit(child, `${path}.${key}`);
    }
  };
  visit(value, field);
}

function constraintIdentityPayload(value) {
  return {
    schema: RESEARCH_CONSTRAINT_SCHEMA,
    version: RESEARCH_CREATION_VERSION,
    constraintClass: value.constraintClass,
    statement: value.statement,
    principleRefs: value.principleRefs,
    applicabilityScope: value.applicabilityScope,
    parameters: value.parameters
  };
}

export function normalizeCreativeConstraint(raw, principlesInput, options = {}) {
  if (!record(raw)) fail('CONSTRAINT_INVALID');
  const limits = normalizeLimits(options.limits || {});
  const principles = Array.isArray(principlesInput) ? principlesInput : principlesInput?.principles;
  if (!Array.isArray(principles)) fail('PRINCIPLE_COLLECTION_INVALID');
  const principleMap = new Map(principles.map(item => [item.principleId, item]));
  const principleRefs = boundedStringList(raw.principleRefs, 'principleRefs', limits.maxRefs, 320);
  if (!principleRefs.length) fail('PRINCIPLE_REFERENCE_REQUIRED');
  const linked = principleRefs.map(id => {
    const principle = principleMap.get(id);
    if (!principle) fail('PRINCIPLE_REFERENCE_MISSING', { principleId: id });
    return principle;
  });
  const constraintClass = text(raw.constraintClass ?? CATEGORY_TO_CONSTRAINT[linked[0].category], 'constraintClass', { required: true, max: 80 });
  if (!RESEARCH_CONSTRAINT_CLASSES.includes(constraintClass)) fail('CONSTRAINT_CLASS_UNSUPPORTED', { constraintClass });
  const parameters = normalizeAttributes(raw.parameters, limits, 'parameters');
  assertAdvisoryShape(parameters, 'parameters');
  const normalized = {
    schema: RESEARCH_CONSTRAINT_SCHEMA,
    version: RESEARCH_CREATION_VERSION,
    formatVersion: RESEARCH_CREATION_FORMAT_VERSION,
    constraintClass,
    label: text(raw.label ?? raw.title, 'label', { required: true, max: 240 }),
    statement: text(raw.statement, 'statement', { required: true, max: 2000 }),
    principleRefs,
    principleFingerprints: linked.map(item => item.fingerprint).sort((a, b) => a.localeCompare(b)),
    applicabilityScope: normalizeApplicabilityScope(raw.applicabilityScope ?? linked[0].applicabilityScope ?? {}),
    parameters,
    advisory: true,
    execution: false,
    state: normalizeState(raw.state ?? (linked.some(item => item.state !== 'RESOLVED') ? 'UNRESOLVED' : 'RESOLVED')),
    assumptions: boundedStringList(raw.assumptions, 'assumptions', limits.maxAssumptions, 500),
    unresolvedEvidence: normalizeIssueList(raw.unresolvedEvidence, 'unresolvedEvidence', limits),
    tags: boundedStringList(raw.tags, 'tags', limits.maxTags, 120)
  };
  const constraintId = `research-constraint:${stableHash(constraintIdentityPayload(normalized)).split(':').at(-1)}`;
  if (own(raw, 'constraintId') && raw.constraintId !== constraintId) fail('CONSTRAINT_ID_MISMATCH', { expected: constraintId, actual: raw.constraintId });
  const withId = { ...normalized, constraintId };
  const fingerprint = stableHash(withId);
  if (own(raw, 'fingerprint') && raw.fingerprint !== fingerprint) fail('CONSTRAINT_FINGERPRINT_MISMATCH', { expected: fingerprint, actual: raw.fingerprint });
  return ensureRecordBytes({ ...withId, fingerprint }, limits, 'CONSTRAINT');
}

export function bridgeResearchToCreativeConstraints(principlesInput, constraintCandidates = [], options = {}) {
  const limits = normalizeLimits(options.limits || {});
  if (!Array.isArray(constraintCandidates)) fail('CONSTRAINT_CANDIDATES_INVALID');
  if (constraintCandidates.length > limits.maxConstraints) fail('CONSTRAINT_LIMIT_EXCEEDED', { actual: constraintCandidates.length, max: limits.maxConstraints });
  const map = new Map();
  for (const raw of constraintCandidates) {
    const constraint = normalizeCreativeConstraint(raw, principlesInput, { limits });
    const prior = map.get(constraint.constraintId);
    if (prior && prior.fingerprint !== constraint.fingerprint) fail('CONSTRAINT_ID_CONFLICT', { constraintId: constraint.constraintId });
    map.set(constraint.constraintId, constraint);
  }
  return [...map.values()].sort((a, b) => a.constraintId.localeCompare(b.constraintId));
}

function evidenceById(evidence) {
  return new Map(evidence.map(item => [item.evidenceId, item]));
}

function aggregateMemoryReferences(supportingEvidence, evidenceMap) {
  const refs = { revisionIds: new Set(), provenanceIds: new Set(), decisionIds: new Set(), objectIds: new Set(), regionIds: new Set() };
  for (const support of supportingEvidence) {
    const item = evidenceMap.get(support.evidenceId);
    if (!item) continue;
    for (const key of Object.keys(refs)) for (const id of item.provenance[key]) refs[key].add(id);
  }
  return Object.fromEntries(Object.entries(refs).map(([key, set]) => [key, [...set].sort((a, b) => a.localeCompare(b))]));
}

function normalizeMemoryScope(raw, principle) {
  const scope = raw == null ? principle.applicabilityScope : raw;
  if (!record(scope)) fail('MEMORY_SCOPE_INVALID');
  const normalized = {
    projectId: text(scope.projectId, 'memory.scope.projectId', { max: 240 }),
    documentId: text(scope.documentId, 'memory.scope.documentId', { max: 240 })
  };
  if (!normalized.projectId && !normalized.documentId) fail('MEMORY_SCOPE_REQUIRED');
  return normalized;
}

function memoryIssueList(principle) {
  const unresolved = [...principle.unresolvedEvidence];
  for (const item of principle.conflictingEvidence) {
    unresolved.push({ code: 'RESEARCH_CONFLICTING_EVIDENCE', detail: null, evidenceId: item.evidenceId });
  }
  return unresolved.map(item => ({ code: item.code, kind: 'RESEARCH', id: item.evidenceId, detail: item.detail }));
}

export function createCreativeMemoryCandidate(principleInput, evidenceInput, promotion = {}, options = {}) {
  if (!record(promotion) || promotion.requested !== true) fail('MEMORY_PROMOTION_EXPLICIT_REQUEST_REQUIRED');
  const limits = normalizeLimits(options.limits || {});
  const evidence = normalizeEvidenceCollection(evidenceInput, { limits });
  const principle = principleInput?.schema === RESEARCH_PRINCIPLE_SCHEMA && principleInput?.fingerprint
    ? principleInput
    : normalizeResearchPrinciple(principleInput, evidence, { limits });
  const evidenceMap = evidenceById(evidence);
  for (const support of principle.supportingEvidence) if (!evidenceMap.has(support.evidenceId)) fail('SUPPORTING_EVIDENCE_MISSING', { evidenceId: support.evidenceId });
  const disposition = text(promotion.disposition ?? 'UNRESOLVED', 'promotion.disposition', { required: true, max: 40 });
  if (!['ACCEPTED', 'REJECTED', 'UNRESOLVED'].includes(disposition)) fail('MEMORY_DISPOSITION_UNSUPPORTED', { disposition });
  const candidate = {
    schema: 'INK-CREATIVE-MEMORY-RECORD',
    version: 1,
    formatVersion: RESEARCH_CREATION_FORMAT_VERSION,
    scope: normalizeMemoryScope(promotion.scope, principle),
    category: CATEGORY_TO_MEMORY[principle.category],
    title: text(promotion.title ?? principle.label, 'promotion.title', { required: true, max: 240 }),
    sourceEvidence: principle.supportingEvidence.map(item => ({
      kind: 'RESEARCH_EVIDENCE',
      id: item.evidenceId,
      fingerprint: item.fingerprint,
      status: item.state === 'RESOLVED' ? 'RESOLVED' : 'UNRESOLVED'
    })).sort((a, b) => a.id.localeCompare(b.id)),
    references: aggregateMemoryReferences(principle.supportingEvidence, evidenceMap),
    statement: principle.statement,
    attributes: {
      researchPrinciple: {
        principleId: principle.principleId,
        fingerprint: principle.fingerprint,
        category: principle.category,
        applicabilityScope: principle.applicabilityScope
      }
    },
    outcome: null,
    disposition,
    confidence: principle.confidence,
    evidenceStrength: principle.evidenceStrength,
    tags: [...principle.tags],
    createdFrom: { kind: 'RESEARCH_PRINCIPLE', id: principle.principleId, fingerprint: principle.fingerprint },
    notes: text(promotion.notes, 'promotion.notes', { max: 2000 }),
    unresolvedEvidence: memoryIssueList(principle)
  };
  ensureRecordBytes(candidate, limits, 'MEMORY_CANDIDATE');
  return {
    schema: RESEARCH_CREATIVE_MEMORY_CANDIDATE_SCHEMA,
    version: RESEARCH_CREATION_VERSION,
    formatVersion: RESEARCH_CREATION_FORMAT_VERSION,
    targetSchema: 'INK-CREATIVE-MEMORY-RECORD',
    targetVersion: 1,
    autoWrite: false,
    requested: true,
    principleId: principle.principleId,
    principleFingerprint: principle.fingerprint,
    candidate,
    candidateFingerprint: stableHash(candidate)
  };
}

function restorePrincipleCandidate(item) {
  const { principleId: _id, fingerprint: _fingerprint, supportingEvidence, conflictingEvidence, ...base } = item;
  return {
    ...base,
    supportingEvidenceRefs: (supportingEvidence || []).map(ref => ref.evidenceId),
    conflictingEvidenceRefs: (conflictingEvidence || []).map(ref => ref.evidenceId)
  };
}

function restoreConstraintCandidate(item) {
  const { constraintId: _id, fingerprint: _fingerprint, principleFingerprints: _principleFingerprints, advisory: _advisory, execution: _execution, ...base } = item;
  return base;
}

export function createResearchCreationBundle({ evidence = [], principles = [], constraints = [] } = {}, options = {}) {
  const limits = normalizeLimits(options.limits || {});
  const normalizedEvidence = normalizeEvidenceCollection(evidence, { limits });
  const normalizedPrinciples = Array.isArray(principles) && principles.every(item => item?.schema === RESEARCH_PRINCIPLE_SCHEMA && item?.fingerprint)
    ? extractResearchPrinciples(normalizedEvidence, principles.map(restorePrincipleCandidate), { limits })
    : extractResearchPrinciples(normalizedEvidence, principles, { limits });
  const normalizedConstraints = Array.isArray(constraints) && constraints.every(item => item?.schema === RESEARCH_CONSTRAINT_SCHEMA && item?.fingerprint)
    ? bridgeResearchToCreativeConstraints(normalizedPrinciples, constraints.map(restoreConstraintCandidate), { limits })
    : bridgeResearchToCreativeConstraints(normalizedPrinciples, constraints, { limits });
  const bundle = {
    schema: RESEARCH_CREATION_BUNDLE_SCHEMA,
    version: RESEARCH_CREATION_VERSION,
    formatVersion: RESEARCH_CREATION_FORMAT_VERSION,
    evidence: normalizedEvidence,
    principles: normalizedPrinciples,
    constraints: normalizedConstraints,
    authority: {
      researchSourceAuthority: 'EVIDENCE_ONLY',
      creativeMemoryAutoWrite: false,
      documentWrite: false,
      historyWrite: false,
      revisionWrite: false,
      geometryWrite: false,
      renderer: false,
      execution: false,
      networkRequired: false
    }
  };
  bundle.fingerprint = stableHash(bundle);
  const bytes = byteLength(bundle);
  if (bytes > limits.maxBundleBytes) fail('BUNDLE_BYTE_LIMIT_EXCEEDED', { bytes, max: limits.maxBundleBytes });
  bundle.bounds = { outputBytes: bytes, maxBytes: limits.maxBundleBytes };
  return bundle;
}

function selectByIds(items, ids, idField, maxItems, field) {
  const all = ids == null ? items : (() => {
    const selected = new Set(boundedStringList(ids, field, maxItems * 4, 320));
    return items.filter(item => selected.has(item[idField]));
  })();
  return { items: all.slice(0, maxItems).map(clone), total: all.length, truncated: all.length > maxItems };
}

function allIssues(bundle) {
  const output = [];
  for (const evidence of bundle.evidence) {
    if (evidence.state !== 'RESOLVED') output.push({ kind: 'EVIDENCE', id: evidence.evidenceId, state: evidence.state });
    for (const issue of evidence.unresolvedEvidence) output.push({ kind: 'EVIDENCE', id: evidence.evidenceId, ...issue });
  }
  for (const principle of bundle.principles) {
    if (principle.state !== 'RESOLVED') output.push({ kind: 'PRINCIPLE', id: principle.principleId, state: principle.state });
    for (const conflict of principle.conflictingEvidence) output.push({ kind: 'PRINCIPLE_CONFLICT', id: principle.principleId, evidenceId: conflict.evidenceId });
    for (const issue of principle.unresolvedEvidence) output.push({ kind: 'PRINCIPLE', id: principle.principleId, ...issue });
  }
  for (const constraint of bundle.constraints) {
    if (constraint.state !== 'RESOLVED') output.push({ kind: 'CONSTRAINT', id: constraint.constraintId, state: constraint.state });
    for (const issue of constraint.unresolvedEvidence) output.push({ kind: 'CONSTRAINT', id: constraint.constraintId, ...issue });
  }
  const dedup = new Map(output.map(item => [stableStringify(item), item]));
  return [...dedup.values()].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
}

function boundedContextPayload(bundle, selection, options, limits) {
  const maxEvidence = boundedInteger(options.maxEvidence, limits.maxContextEvidence, HARD_LIMITS.maxContextEvidence, 'context.maxEvidence');
  const maxPrinciples = boundedInteger(options.maxPrinciples, limits.maxContextPrinciples, HARD_LIMITS.maxContextPrinciples, 'context.maxPrinciples');
  const maxConstraints = boundedInteger(options.maxConstraints, limits.maxContextConstraints, HARD_LIMITS.maxContextConstraints, 'context.maxConstraints');
  const selectedEvidence = selectByIds(bundle.evidence, selection.evidenceIds, 'evidenceId', maxEvidence, 'selection.evidenceIds');
  const selectedPrinciples = selectByIds(bundle.principles, selection.principleIds, 'principleId', maxPrinciples, 'selection.principleIds');
  const selectedConstraints = selectByIds(bundle.constraints, selection.constraintIds, 'constraintId', maxConstraints, 'selection.constraintIds');
  return {
    schema: RESEARCH_CREATION_ADVISORY_SCHEMA,
    version: RESEARCH_CREATION_VERSION,
    formatVersion: RESEARCH_CREATION_FORMAT_VERSION,
    authority: {
      role: 'ADVISORY_READ_ONLY',
      researchSourceAuthority: 'EVIDENCE_ONLY',
      documentWrite: false,
      historyWrite: false,
      revisionWrite: false,
      geometryWrite: false,
      renderer: false,
      execution: false,
      networkRequired: false,
      creativeMemoryAutoWrite: false
    },
    selectedResearchEvidence: selectedEvidence.items,
    derivedPrinciples: selectedPrinciples.items,
    derivedCreativeConstraints: selectedConstraints.items,
    unresolvedEvidence: allIssues(bundle),
    creativeMemory: { requested: false, candidates: [], references: [] },
    traceability: {
      evidenceToPrinciples: selectedPrinciples.items.map(item => ({ principleId: item.principleId, evidenceIds: item.supportingEvidence.map(ref => ref.evidenceId) })),
      principlesToConstraints: selectedConstraints.items.map(item => ({ constraintId: item.constraintId, principleIds: item.principleRefs }))
    },
    compatibility: {
      creativeMemory: 'EXPLICIT_PROMOTION_CANDIDATE',
      parametricCreativeStructure: 'ADVISORY_PARAMETERS_ONLY',
      groundedChatPlanning: 'READ_ONLY_CONTEXT'
    },
    bounds: {
      evidence: { returned: selectedEvidence.items.length, total: selectedEvidence.total, truncated: selectedEvidence.truncated, max: maxEvidence },
      principles: { returned: selectedPrinciples.items.length, total: selectedPrinciples.total, truncated: selectedPrinciples.truncated, max: maxPrinciples },
      constraints: { returned: selectedConstraints.items.length, total: selectedConstraints.total, truncated: selectedConstraints.truncated, max: maxConstraints },
      outputBytes: null,
      maxBytes: boundedInteger(options.maxBytes, limits.maxContextBytes, HARD_LIMITS.maxContextBytes, 'context.maxBytes')
    }
  };
}

export function buildResearchCreationAdvisoryContext(bundleInput, selection = {}, options = {}) {
  if (!record(selection)) fail('SELECTION_INVALID');
  const limits = normalizeLimits(options.limits || {});
  const bundle = bundleInput?.schema === RESEARCH_CREATION_BUNDLE_SCHEMA
    ? createResearchCreationBundle(bundleInput, { limits })
    : createResearchCreationBundle(bundleInput || {}, { limits });
  let context = boundedContextPayload(bundle, selection, options, limits);
  if (selection.includeCreativeMemoryCandidates === true) {
    const promotions = Array.isArray(selection.memoryPromotions) ? selection.memoryPromotions : [];
    if (!promotions.length) fail('MEMORY_PROMOTION_EXPLICIT_REQUEST_REQUIRED');
    const principleMap = new Map(bundle.principles.map(item => [item.principleId, item]));
    const candidates = promotions.map((promotion, index) => {
      if (!record(promotion)) fail('MEMORY_PROMOTION_INVALID', { index });
      const principleId = text(promotion.principleId, `memoryPromotions[${index}].principleId`, { required: true, max: 320 });
      const principle = principleMap.get(principleId);
      if (!principle) fail('MEMORY_PROMOTION_PRINCIPLE_MISSING', { principleId });
      return createCreativeMemoryCandidate(principle, bundle.evidence, { ...promotion, requested: promotion.requested === true }, { limits });
    }).sort((a, b) => a.principleId.localeCompare(b.principleId));
    context.creativeMemory = {
      requested: true,
      candidates,
      references: candidates.map(item => ({ principleId: item.principleId, candidateFingerprint: item.candidateFingerprint }))
    };
  }
  const maxBytes = context.bounds.maxBytes;
  context.contextFingerprint = stableHash({ ...context, contextFingerprint: null, bounds: { ...context.bounds, outputBytes: null } });
  context.bounds.outputBytes = byteLength(context);
  if (context.bounds.outputBytes > maxBytes) fail('ADVISORY_CONTEXT_BYTE_LIMIT_EXCEEDED', { bytes: context.bounds.outputBytes, max: maxBytes });
  return context;
}

export function createResearchCreationBridgeAdapter({ getEvidence, getPrinciples, getConstraints } = {}) {
  if (typeof getEvidence !== 'function') fail('ADAPTER_EVIDENCE_PROVIDER_REQUIRED');
  if (typeof getPrinciples !== 'function') fail('ADAPTER_PRINCIPLE_PROVIDER_REQUIRED');
  if (typeof getConstraints !== 'function') fail('ADAPTER_CONSTRAINT_PROVIDER_REQUIRED');
  return Object.freeze({
    read(options = {}) {
      return createResearchCreationBundle({
        evidence: clone(getEvidence() || []),
        principles: clone(getPrinciples() || []),
        constraints: clone(getConstraints() || [])
      }, options);
    },
    advisory(selection = {}, options = {}) {
      return buildResearchCreationAdvisoryContext(this.read(options), clone(selection), options);
    }
  });
}
