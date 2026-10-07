import { compareRevisionDocuments, inspectRevisionRecord } from '../document/revision.js';
import { documentFingerprint, fnv1a32, inspectDocument, stableStringify } from '../document/integrity.js';
import { walkPageObjects } from '../document/hierarchy.js';

export const VISUAL_COMPARE_SCHEMA = 'INK-VISUAL-COMPARISON';
export const VISUAL_COMPARE_SUBJECT_SCHEMA = 'INK-VISUAL-COMPARE-SUBJECT';
export const VISUAL_VARIANT_SCHEMA = 'INK-VISUAL-VARIANT';
export const VISUAL_COMPARE_VERSION = 1;
export const VISUAL_COMPARE_MODES = Object.freeze(['side-by-side', 'overlay', 'wipe', 'difference', 'structural']);
export const VISUAL_VARIANT_DECISION_STATES = Object.freeze(['UNRESOLVED', 'SELECTED', 'REJECTED']);

const KINDS = new Set(['reference', 'current', 'revision', 'variant']);
const DEFAULTS = { maxObjectIds: 512, maxProvenanceRefs: 96, maxBytes: 128 * 1024 };
const HARD = { maxObjectIds: 4096, maxProvenanceRefs: 1024, maxBytes: 1024 * 1024 };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class VisualCompareError extends Error {
  constructor(code, details = {}) {
    super(`INK_VISUAL_COMPARE_${code}`);
    this.name = 'VisualCompareError';
    this.code = `VISUAL_COMPARE_${code}`;
    Object.assign(this, details);
  }
}
const fail = (code, details = {}) => { throw new VisualCompareError(code, details); };

function text(value, field, required = false, max = 320) {
  if (value == null || value === '') {
    if (required) fail('TEXT_REQUIRED', { field });
    return null;
  }
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail('TEXT_INVALID', { field });
  return value.trim();
}
function limit(value, fallback, hard, field) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > hard) fail('LIMIT_INVALID', { field, value });
  return number;
}
function limits(raw = {}) {
  if (!record(raw)) fail('LIMITS_INVALID');
  return {
    maxObjectIds: limit(raw.maxObjectIds, DEFAULTS.maxObjectIds, HARD.maxObjectIds, 'maxObjectIds'),
    maxProvenanceRefs: limit(raw.maxProvenanceRefs, DEFAULTS.maxProvenanceRefs, HARD.maxProvenanceRefs, 'maxProvenanceRefs'),
    maxBytes: limit(raw.maxBytes, DEFAULTS.maxBytes, HARD.maxBytes, 'maxBytes')
  };
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value)) {
    const output = {};
    for (const key of Object.keys(value).sort()) output[key] = canonical(value[key]);
    return output;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') fail('NON_JSON_VALUE');
  return value === undefined ? null : value;
}
const fingerprint = value => `fnv1a32:${fnv1a32(stableStringify(canonical(value)))}`;
const bytes = value => new TextEncoder().encode(stableStringify(value)).byteLength;

function boundedStrings(values, max, field) {
  if (values == null) return { values: [], total: 0, truncated: false };
  if (!Array.isArray(values)) fail('LIST_INVALID', { field });
  const all = [...new Set(values.map((value, index) => text(value, `${field}[${index}]`, true)))].sort((a, b) => a.localeCompare(b));
  return { values: all.slice(0, max), total: all.length, truncated: all.length > max };
}
function objectIds(document, max) {
  if (!document) return { values: [], total: 0, truncated: false };
  const ids = [];
  for (const page of document.pages || []) {
    for (const found of walkPageObjects(page)) if (typeof found.object?.id === 'string') ids.push(found.object.id);
  }
  return boundedStrings(ids, max, 'objectIds');
}
function normalizedDocument(document, field) {
  if (document == null) return null;
  const inspection = inspectDocument(document);
  if (!inspection?.passed) fail('DOCUMENT_INVALID', { field, inspection });
  if (Number(document.formatVersion) !== 4) fail('FORMAT_VERSION_UNSUPPORTED', { field, expected: 4, actual: document.formatVersion ?? null });
  return {
    document,
    documentId: text(document.id, `${field}.id`, true),
    documentFingerprint: inspection.fingerprint || documentFingerprint(document)
  };
}
function normalizedRevision(revisionRecord) {
  const inspection = inspectRevisionRecord(revisionRecord);
  if (!inspection.valid) fail('REVISION_RECORD_INVALID', { inspection });
  const document = normalizedDocument(revisionRecord.envelope?.document, 'revision.envelope.document');
  if (document.documentId !== revisionRecord.documentId) fail('REVISION_DOCUMENT_ID_MISMATCH');
  return { ...document, revisionId: revisionRecord.revisionId, revisionFingerprint: revisionRecord.integrity?.fingerprint || null };
}
function normalizeRefs(raw, max) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) fail('PROVENANCE_REFS_INVALID');
  const map = new Map();
  raw.forEach((item, index) => {
    const ref = typeof item === 'string'
      ? { type: 'evidence', id: text(item, `provenanceRefs[${index}]`, true) }
      : { type: text(item?.type || 'evidence', `provenanceRefs[${index}].type`, true, 80), id: text(item?.id, `provenanceRefs[${index}].id`, true) };
    map.set(`${ref.type}\u0000${ref.id}`, ref);
  });
  return [...map.values()].sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id)).slice(0, max);
}
function contextRefs(context, identity, max) {
  if (context == null) return [];
  if (!record(context) || context.schema !== 'INK-AI-DOCUMENT-BRIDGE-PROVENANCE' || Number(context.version) !== 1) fail('PROVENANCE_CONTEXT_INVALID');
  const refs = context.provenanceFingerprint ? [{ type: 'provenance-graph', id: context.provenanceFingerprint }] : [];
  const ids = new Set(identity.objectIds || []);
  for (const event of context.events || []) {
    if (!event?.eventId) continue;
    const revisionMatch = identity.revisionId && event.revisionId === identity.revisionId;
    const objectMatch = Array.isArray(event.objectIds) && event.objectIds.some(id => ids.has(id));
    if (revisionMatch || objectMatch) refs.push({ type: 'provenance-event', id: String(event.eventId) });
  }
  return normalizeRefs(refs, max);
}
function normalizeSubject(input, opts) {
  if (!record(input)) fail('SUBJECT_INVALID');
  const kind = text(input.kind, 'subject.kind', true, 32);
  if (!KINDS.has(kind)) fail('SUBJECT_KIND_UNSUPPORTED', { kind });

  let doc = null;
  let revisionId = text(input.revisionId, 'subject.revisionId');
  let revisionFingerprint = null;
  if (kind === 'revision') {
    if (!record(input.revisionRecord)) fail('REVISION_RECORD_REQUIRED');
    const revision = normalizedRevision(input.revisionRecord);
    doc = revision;
    revisionId = revision.revisionId;
    revisionFingerprint = revision.revisionFingerprint;
  } else if (input.document != null) doc = normalizedDocument(input.document, 'subject.document');

  const documentId = text(input.documentId, 'subject.documentId') || doc?.documentId || null;
  if (doc && documentId !== doc.documentId) fail('SUBJECT_DOCUMENT_ID_MISMATCH');
  const referenceId = kind === 'reference' ? text(input.referenceId, 'subject.referenceId', true) : text(input.referenceId, 'subject.referenceId');
  const variantId = kind === 'variant' ? text(input.variantId, 'subject.variantId', true) : text(input.variantId, 'subject.variantId');
  const ids = input.objectIds == null ? objectIds(doc?.document, opts.maxObjectIds) : boundedStrings(input.objectIds, opts.maxObjectIds, 'subject.objectIds');
  const identity = { kind, documentId, revisionId, referenceId, variantId, objectIds: ids.values };
  const refs = normalizeRefs([
    ...normalizeRefs(input.provenanceRefs, opts.maxProvenanceRefs),
    ...contextRefs(input.provenanceContext, identity, opts.maxProvenanceRefs)
  ], opts.maxProvenanceRefs);

  let visualDescriptors = null;
  if (input.visualDescriptors != null) {
    visualDescriptors = canonical(input.visualDescriptors);
    if (bytes(visualDescriptors) > 16 * 1024) fail('VISUAL_DESCRIPTOR_BOUNDS_EXCEEDED');
  }

  return {
    document: doc?.document || null,
    ids,
    summary: {
      schema: VISUAL_COMPARE_SUBJECT_SCHEMA,
      version: VISUAL_COMPARE_VERSION,
      kind,
      label: text(input.label || input.name, 'subject.label') || kind,
      identity,
      documentFingerprint: doc?.documentFingerprint || text(input.documentFingerprint, 'subject.documentFingerprint'),
      revisionFingerprint,
      visualDescriptors,
      provenanceRefs: refs
    }
  };
}
function structural(a, b, opts) {
  const empty = code => ({
    status: 'UNRESOLVED', source: null, equivalent: null,
    correspondence: { basis: 'STABLE_OBJECT_ID', sharedObjectIds: [], count: 0, truncated: false },
    addedObjectIds: [], removedObjectIds: [], changedObjectIds: [], touchedObjectIds: [],
    objectCounts: null, fingerprints: null, unresolved: [{ code }]
  });
  if (!a.document || !b.document) return empty('STRUCTURAL_DOCUMENT_UNAVAILABLE');
  const aDoc = a.summary.identity.documentId;
  const bDoc = b.summary.identity.documentId;
  if (aDoc && bDoc && aDoc !== bDoc) return empty('DOCUMENT_IDENTITY_MISMATCH');

  const comparison = compareRevisionDocuments(a.document, b.document);
  const list = key => boundedStrings(comparison[key] || [], opts.maxObjectIds, key);
  const aIds = new Set(a.ids.values);
  const shared = boundedStrings(b.ids.values.filter(id => aIds.has(id)), opts.maxObjectIds, 'sharedObjectIds');
  const added = list('addedObjectIds'), removed = list('removedObjectIds'), changed = list('changedObjectIds'), touched = list('touchedObjectIds');
  const truncated = shared.truncated || added.truncated || removed.truncated || changed.truncated || touched.truncated || Object.values(comparison.truncated || {}).some(Boolean);
  return {
    status: 'RESOLVED',
    source: 'document.revision.compareRevisionDocuments',
    equivalent: comparison.equivalent,
    correspondence: { basis: 'STABLE_OBJECT_ID', sharedObjectIds: shared.values, count: shared.total, truncated: shared.truncated },
    addedObjectIds: added.values,
    removedObjectIds: removed.values,
    changedObjectIds: changed.values,
    touchedObjectIds: touched.values,
    objectCounts: comparison.objectCounts,
    fingerprints: comparison.fingerprints,
    unresolved: truncated ? [{ code: 'STRUCTURAL_EVIDENCE_TRUNCATED' }] : []
  };
}
function finalize(output, maxBytes) {
  const hashPayload = canonical({ ...output, comparisonFingerprint: null, bounds: { ...output.bounds, outputBytes: null } });
  output.comparisonFingerprint = fingerprint(hashPayload);
  output.bounds.outputBytes = bytes(output);
  if (output.bounds.outputBytes > maxBytes) fail('OUTPUT_BOUNDS_EXCEEDED', { actualBytes: output.bounds.outputBytes, maxBytes });
  return output;
}

export function compareVisualSubjects(subjectA, subjectB, options = {}) {
  if (!record(options)) fail('OPTIONS_INVALID');
  const opts = limits(options.limits || {});
  const mode = text(options.mode || 'structural', 'options.mode', true, 32);
  if (!VISUAL_COMPARE_MODES.includes(mode)) fail('MODE_UNSUPPORTED', { mode });
  const a = normalizeSubject(subjectA, opts);
  const b = normalizeSubject(subjectB, opts);
  const structure = structural(a, b, opts);
  const unresolved = [...structure.unresolved];
  if (a.ids.truncated || b.ids.truncated) unresolved.push({ code: 'SUBJECT_OBJECT_IDS_TRUNCATED' });

  const { unresolved: _structuralUnresolved, ...structuralEvidence } = structure;
  return finalize({
    schema: VISUAL_COMPARE_SCHEMA,
    version: VISUAL_COMPARE_VERSION,
    fingerprintAlgorithm: 'fnv1a32-canonical-json',
    mode: { requested: mode, supported: [...VISUAL_COMPARE_MODES], renderingExecuted: false },
    subjects: { a: a.summary, b: b.summary },
    structural: structuralEvidence,
    visual: {
      status: a.summary.visualDescriptors != null || b.summary.visualDescriptors != null ? 'DESCRIPTORS_AVAILABLE' : 'NO_DESCRIPTORS',
      pixelCaptureExecuted: false,
      rendererInvoked: false
    },
    unresolved: unresolved.sort((x, y) => stableStringify(x).localeCompare(stableStringify(y))),
    workflow: { choose: 'METADATA_ONLY', restore: 'NOT_EXECUTED', continue: 'METADATA_ONLY' },
    bounds: { limits: opts, truncated: unresolved.length > 0 && unresolved.some(item => item.code?.includes('TRUNCATED')), outputBytes: null },
    comparisonFingerprint: null
  }, opts.maxBytes);
}

export function createVariantDescriptor({
  variantId, baseSubject, derivedSubject, label = 'Variant', reason = 'unspecified',
  sourceRevisionId = null, provenanceFingerprint = null, decisionState = 'UNRESOLVED', comparison = null
} = {}, options = {}) {
  const opts = limits(options.limits || {});
  const id = text(variantId, 'variantId', true);
  const state = text(decisionState, 'decisionState', true, 32);
  if (!VISUAL_VARIANT_DECISION_STATES.includes(state)) fail('VARIANT_DECISION_STATE_UNSUPPORTED', { decisionState: state });
  const result = comparison || compareVisualSubjects(baseSubject, derivedSubject, options);
  if (result?.schema !== VISUAL_COMPARE_SCHEMA || !result.comparisonFingerprint) fail('VARIANT_COMPARISON_INVALID');
  const base = normalizeSubject(baseSubject, opts).summary;
  const derived = normalizeSubject(derivedSubject, opts).summary;
  const payload = {
    schema: VISUAL_VARIANT_SCHEMA, version: VISUAL_COMPARE_VERSION, variantId: id,
    label: text(label, 'variant.label', true, 240), reason: text(reason, 'variant.reason', true, 480),
    baseSubject: base, derivedSubject: derived,
    sourceRevisionId: text(sourceRevisionId, 'variant.sourceRevisionId') || derived.identity.revisionId || null,
    provenanceFingerprint: text(provenanceFingerprint, 'variant.provenanceFingerprint')
      || derived.provenanceRefs.find(item => item.type === 'provenance-graph')?.id || null,
    comparisonFingerprint: result.comparisonFingerprint, decisionState: state
  };
  const output = { ...payload, variantFingerprint: fingerprint(payload) };
  if (bytes(output) > opts.maxBytes) fail('OUTPUT_BOUNDS_EXCEEDED', { kind: 'variant', maxBytes: opts.maxBytes });
  return output;
}

export function createVisualCompareAdapter({
  getCurrentDocument, getReference, getRevision, getVariant, getProvenanceContext = null
} = {}) {
  for (const [name, provider] of Object.entries({ getCurrentDocument, getReference, getRevision, getVariant })) {
    if (typeof provider !== 'function') fail('ADAPTER_PROVIDER_INVALID', { provider: name });
  }
  if (getProvenanceContext != null && typeof getProvenanceContext !== 'function') fail('ADAPTER_PROVIDER_INVALID', { provider: 'getProvenanceContext' });
  const provenance = spec => getProvenanceContext ? { ...spec, provenanceContext: spec.provenanceContext ?? getProvenanceContext() } : spec;
  const current = () => provenance({ kind: 'current', document: getCurrentDocument(), label: 'Current' });
  const reference = id => {
    const value = getReference(id);
    if (!record(value)) fail('REFERENCE_PROVIDER_RESULT_INVALID', { referenceId: id });
    return provenance({ ...value, kind: 'reference', referenceId: value.referenceId || id });
  };
  const revision = id => {
    const value = getRevision(id);
    if (!record(value)) fail('REVISION_PROVIDER_RESULT_INVALID', { revisionId: id });
    return provenance({ kind: 'revision', revisionRecord: value, label: value.label || id });
  };
  const variant = id => {
    const value = getVariant(id);
    if (!record(value)) fail('VARIANT_PROVIDER_RESULT_INVALID', { variantId: id });
    return provenance({ ...value, kind: 'variant', variantId: value.variantId || id });
  };
  return Object.freeze({
    referenceCurrent: (referenceId, options = {}) => compareVisualSubjects(reference(referenceId), current(), options),
    revisionRevision: (a, b, options = {}) => compareVisualSubjects(revision(a), revision(b), options),
    currentRevision: (revisionId, options = {}) => compareVisualSubjects(current(), revision(revisionId), options),
    variantVariant: (a, b, options = {}) => compareVisualSubjects(variant(a), variant(b), options),
    variantDescriptor: (spec, options = {}) => createVariantDescriptor(spec, options)
  });
}
