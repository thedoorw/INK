import { deterministicHash } from './canonical-operation.js';

const clone = value => JSON.parse(JSON.stringify(value));

export const REFERENCE_PACKAGE_FILES = Object.freeze([
  'asset.json', 'source-program', 'source-license', 'source-input', 'source-application-version',
  'source-execution-log', 'source-intermediate-states', 'source-output', 'source-structure-summary',
  'canonical-operations', 'ink-recipe', 'ink-document', 'ink-output', 'capability-report',
  'gap-report', 'difference-report', 'replay-report', 'qa-report'
]);

export function createReferencePackage({ assetId, kind, source = {}, ink = {}, reports = {}, files = {}, status = 'PARTIAL' } = {}) {
  if (!assetId) throw new Error('INK_REFERENCE_PACKAGE_ASSET_ID_REQUIRED');
  const manifest = {
    format: 'INK-REFERENCE-PACKAGE', schemaVersion: 1, assetId, kind: kind || 'unknown', status,
    source: clone(source), ink: clone(ink), reports: clone(reports), files: clone(files),
    traceability: { assetId, requiredFiles: [...REFERENCE_PACKAGE_FILES] }
  };
  manifest.id = `reference_package_${deterministicHash(manifest)}`;
  return manifest;
}

export function validateReferencePackage(manifest, { requireCompletedEvidence = false } = {}) {
  const errors = [], warnings = [];
  if (manifest?.format !== 'INK-REFERENCE-PACKAGE') errors.push('format');
  if (!manifest?.assetId) errors.push('assetId');
  for (const key of REFERENCE_PACKAGE_FILES) {
    const value = manifest?.files?.[key];
    if (!value) errors.push(`files.${key}`);
    else if (value.assetId && value.assetId !== manifest.assetId) errors.push(`assetId mismatch:${key}`);
  }
  const sourceRun = manifest?.source?.referenceRun;
  if (requireCompletedEvidence && sourceRun?.status !== 'COMPLETED') errors.push('completed source reference run');
  if (sourceRun?.status === 'COMPLETED' && sourceRun?.originalProgramExecuted !== true) errors.push('original program execution evidence');
  if (manifest?.status === 'EQUIVALENT' && sourceRun?.status !== 'COMPLETED') errors.push('equivalence without source evidence');
  if (errors.some(error => error.startsWith('files.'))) warnings.push('package is incomplete but remains traceable and reproducible');
  return { valid: errors.length === 0, errors, warnings };
}

export function attachReferencePackage(document, manifest) {
  if (!document || !manifest?.assetId) throw new Error('INK_REFERENCE_PACKAGE_DOCUMENT_REQUIRED');
  document.referencePackages = Array.isArray(document.referencePackages) ? document.referencePackages : [];
  const value = clone(manifest), index = document.referencePackages.findIndex(item => item.assetId === manifest.assetId);
  index >= 0 ? document.referencePackages.splice(index, 1, value) : document.referencePackages.push(value);
  return clone(value);
}
