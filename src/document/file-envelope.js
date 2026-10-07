import { deepClone, nowISO } from '../core/index.js';
import { documentFingerprint, stableStringify } from './integrity.js';
import { walkPageObjects } from './hierarchy.js';
import { EXPRESSIVE_STROKE_EXTENSION } from '../vector/stroke-appearance.js';
import { PATH_MATERIAL_APPEARANCE_EXTENSION } from '../vector/paint-appearance.js';

export const FILE_ENVELOPE_SCHEMA = 'INK-FILE-ENVELOPE';
export const FILE_ENVELOPE_VERSION = '1.0';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validString = value => typeof value === 'string' && value.trim().length > 0;
const validTimestamp = value => validString(value) && Number.isFinite(Date.parse(value));
const fail = (code, details = {}) => { throw Object.assign(new Error(code), { code, ...details }); };

export function declaredDocumentExtensions(document) {
  const found = new Set();
  if (document?.components !== undefined) found.add('ink.components.v1');
  for (const page of document?.pages || []) {
    const objects = walkPageObjects(page);
    if (objects.some(({ object }) => object.layout !== undefined || object.layoutItem !== undefined)) found.add('ink.layout.v1');
    if (objects.some(({ object }) => object.type === 'path' && object.expressiveStroke != null)) found.add(EXPRESSIVE_STROKE_EXTENSION);
    if (objects.some(({ object }) => object.type === 'path' && object.materialAppearance != null)) found.add(PATH_MATERIAL_APPEARANCE_EXTENSION);
  }
  return [...found].sort();
}

function assetReferences(document) {
  const manifest = document?.assetManifest;
  if (!record(manifest) || !Array.isArray(manifest.assets)) return [];
  return manifest.assets.map(asset => deepClone(asset));
}

export function wrapInkFile(document, {
  fileId = document?.id, revision = 1, revisionId = null,
  extensions = null, appliedMigrations = [], savedAt = nowISO()
} = {}) {
  if (!record(document) || document.format !== 'INK') fail('file-envelope-invalid-document');
  if (!validString(fileId)) fail('file-envelope-invalid-file-id');
  if (!Number.isSafeInteger(revision) || revision < 0) fail('file-envelope-invalid-revision');
  if (!Array.isArray(appliedMigrations) || appliedMigrations.some(item => !validString(item))) fail('file-envelope-invalid-migrations');
  if (extensions !== null && !Array.isArray(extensions)) fail('file-envelope-invalid-extensions');
  if (!validTimestamp(savedAt) || (document.modifiedAt !== undefined && !validTimestamp(document.modifiedAt))) fail('file-envelope-invalid-timestamp');
  if (revisionId !== null && !validString(revisionId)) fail('file-envelope-invalid-revision-id');
  const documentPayload = deepClone(document);
  if (!Number.isInteger(documentPayload.formatVersion) || documentPayload.formatVersion < 1) fail('file-envelope-invalid-format-version');
  const declared = extensions === null ? declaredDocumentExtensions(documentPayload) : [...extensions];
  if (declared.some(item => !validString(item))) fail('file-envelope-invalid-extensions');
  let fingerprint;
  try { fingerprint = documentFingerprint(documentPayload); }
  catch (error) { fail('file-envelope-document-not-serializable', { cause: String(error) }); }
  return {
    schema: FILE_ENVELOPE_SCHEMA,
    version: FILE_ENVELOPE_VERSION,
    fileId,
    revision,
    revisionId: revisionId || `${fileId}:r${revision}:${fingerprint.slice(-8)}`,
    documentFormatVersion: documentPayload.formatVersion,
    extensions: [...new Set(declared)].sort(),
    appliedMigrations: [...appliedMigrations],
    document: documentPayload,
    assetReferences: assetReferences(documentPayload),
    savedAt,
    modifiedAt: documentPayload.modifiedAt || savedAt,
    integrity: { algorithm: 'fnv1a32-canonical-json', fingerprint }
  };
}

export function inspectInkFileEnvelope(envelope) {
  const errors = [];
  const add = (code, details = {}) => errors.push({ code, ...details });
  if (!record(envelope)) return { valid: false, errors: [{ code: 'file-envelope-invalid' }] };
  if (envelope.schema !== FILE_ENVELOPE_SCHEMA || envelope.version !== FILE_ENVELOPE_VERSION) add('file-envelope-unsupported-schema');
  if (!validString(envelope.fileId)) add('file-envelope-invalid-file-id');
  if (!Number.isSafeInteger(envelope.revision) || envelope.revision < 0) add('file-envelope-invalid-revision');
  if (!validString(envelope.revisionId)) add('file-envelope-invalid-revision-id');
  if (!record(envelope.document) || envelope.document.format !== 'INK') add('file-envelope-invalid-document');
  if (envelope.documentFormatVersion !== envelope.document?.formatVersion) add('file-envelope-format-version-mismatch');
  if (!Array.isArray(envelope.extensions) || envelope.extensions.some(item => !validString(item))) add('file-envelope-invalid-extensions');
  else {
    try {
      for (const required of declaredDocumentExtensions(envelope.document)) {
        if (!envelope.extensions.includes(required)) add('file-envelope-missing-extension', { extension: required });
      }
    } catch (error) { add('file-envelope-invalid-document-structure', { cause: String(error) }); }
  }
  if (!Array.isArray(envelope.appliedMigrations) || envelope.appliedMigrations.some(item => !validString(item))) add('file-envelope-invalid-migrations');
  if (!Array.isArray(envelope.assetReferences)) add('file-envelope-invalid-assets');
  else {
    try {
      if (stableStringify(envelope.assetReferences) !== stableStringify(assetReferences(envelope.document))) add('file-envelope-asset-reference-mismatch');
    } catch (error) { add('file-envelope-invalid-assets', { cause: String(error) }); }
  }
  if (!validTimestamp(envelope.savedAt) || !validTimestamp(envelope.modifiedAt)) add('file-envelope-invalid-timestamps');
  let actualFingerprint = null;
  if (record(envelope.document)) {
    try { actualFingerprint = documentFingerprint(envelope.document); }
    catch (error) { add('file-envelope-document-not-serializable', { cause: String(error) }); }
  }
  if (envelope.integrity?.algorithm !== 'fnv1a32-canonical-json' || envelope.integrity?.fingerprint !== actualFingerprint) add('file-envelope-fingerprint-mismatch', { actualFingerprint });
  return { valid: errors.length === 0, errors, actualFingerprint };
}

export function unwrapInkFile(envelope) {
  const inspection = inspectInkFileEnvelope(envelope);
  if (!inspection.valid) fail('file-envelope-verification-failed', { inspection });
  return deepClone(envelope.document);
}

export function nextInkFileRevision(envelope, document, { revisionId = null, extensions = null, appliedMigrations = null, savedAt = nowISO() } = {}) {
  const previous = inspectInkFileEnvelope(envelope);
  if (!previous.valid) fail('file-envelope-verification-failed', { inspection: previous });
  return wrapInkFile(document, {
    fileId: envelope.fileId,
    revision: envelope.revision + 1,
    revisionId,
    extensions: extensions ?? [...new Set([...envelope.extensions, ...declaredDocumentExtensions(document)])],
    appliedMigrations: appliedMigrations ?? envelope.appliedMigrations,
    savedAt
  });
}
