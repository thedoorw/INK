/* Canonical operation model shared by every external-program parser.
 * External source text is never executed by this module. */

const clone = value => JSON.parse(JSON.stringify(value));

export const CANONICAL_CATEGORIES = Object.freeze([
  'Document', 'Canvas', 'Layer', 'Group', 'Object', 'Path', 'Selection',
  'Mask', 'Transform', 'Fill', 'Stroke', 'Gradient', 'Boolean',
  'Brush Stroke', 'Raster Operation', 'Adjustment', 'Filter', 'Blend',
  'Texture', 'Import', 'Export', 'Expression', 'Conditional', 'Loop', 'User Input',
  'External Dependency'
]);

export const CONVERSION_STATUSES = Object.freeze([
  'DIRECT', 'EQUIVALENT', 'APPROXIMATED', 'PARTIAL',
  'MANUAL STEP REQUIRED', 'EXTERNAL EXECUTION REQUIRED', 'REJECTED'
]);

export const GAP_CATEGORIES = Object.freeze([
  'CAPABILITY_MISSING', 'PARAMETER_MISSING', 'STATE_MODEL_MISMATCH',
  'RENDERING_DIFFERENCE', 'FILE_FORMAT_LIMIT', 'VERSION_INCOMPATIBLE',
  'LANGUAGE_DEPENDENCY', 'ASSET_DEPENDENCY', 'EXTERNAL_SOFTWARE_REQUIRED',
  'NON_DETERMINISTIC', 'SECURITY_REJECTED', 'LICENSE_REJECTED',
  'UNKNOWN_OPERATION'
]);

export const MATURITY_LEVELS = Object.freeze([
  'MATURE', 'OPERATIONAL', 'PARTIAL', 'EXPERIMENTAL', 'MISSING', 'REJECTED'
]);

export const SAFETY_MODES = Object.freeze([
  'STATIC_PARSE', 'SANDBOX_ANALYSIS', 'TRANSLATE_ONLY', 'TRUSTED_EXTERNAL_RUN'
]);

const stable = value => JSON.stringify(value, (_, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item
);

export function deterministicHash(value) {
  let hash = 2166136261;
  for (const character of stable(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function canonicalOperation(input = {}) {
  const category = CANONICAL_CATEGORIES.includes(input.category) ? input.category : 'External Dependency';
  const operation = {
    operationId: input.operationId || `op_${deterministicHash({ sourceCommand: input.sourceCommand, index: input.index || 0, parameters: input.parameters || {} })}`,
    sourceSoftware: input.sourceSoftware || 'Unknown',
    sourceCommand: input.sourceCommand || 'unknown',
    canonicalOperation: input.canonicalOperation || 'external.unknown',
    category,
    target: clone(input.target || { kind: category.toLowerCase().replace(/\s+/g, '-') }),
    inputState: clone(input.inputState || {}),
    parameters: clone(input.parameters || {}),
    dependencies: clone(input.dependencies || []),
    expectedStateChange: clone(input.expectedStateChange || {}),
    outputState: clone(input.outputState || {}),
    destructive: Boolean(input.destructive),
    deterministic: input.deterministic !== false,
    inkCapabilityMapping: clone(input.inkCapabilityMapping || null),
    fallbackCandidate: clone(input.fallbackCandidate || null),
    confidence: Math.max(0, Math.min(1, Number(input.confidence ?? 0.5))),
    evidence: clone(input.evidence || []),
    unsupportedReason: input.unsupportedReason || null,
    conversionStatus: CONVERSION_STATUSES.includes(input.conversionStatus) ? input.conversionStatus : 'PARTIAL'
  };
  return Object.freeze(operation);
}

export function validateCanonicalOperation(operation) {
  const missing = [
    'operationId', 'sourceSoftware', 'sourceCommand', 'canonicalOperation',
    'category', 'target', 'inputState', 'parameters', 'dependencies',
    'expectedStateChange', 'outputState', 'inkCapabilityMapping',
    'confidence', 'evidence', 'conversionStatus'
  ].filter(key => operation?.[key] === undefined);
  const errors = [];
  if (missing.length) errors.push(`missing:${missing.join(',')}`);
  if (!CANONICAL_CATEGORIES.includes(operation?.category)) errors.push(`category:${operation?.category}`);
  if (!CONVERSION_STATUSES.includes(operation?.conversionStatus)) errors.push(`status:${operation?.conversionStatus}`);
  if (!(Number(operation?.confidence) >= 0 && Number(operation?.confidence) <= 1)) errors.push('confidence:range');
  return { valid: errors.length === 0, errors };
}

export function canonicalProgram({ source, metadata, operations = [], dependencies = [], warnings = [] }) {
  const normalized = operations.map((operation, index) => canonicalOperation({ ...operation, index }));
  const invalid = normalized.map(validateCanonicalOperation).filter(result => !result.valid);
  if (invalid.length) throw new Error(`INK_CANONICAL_OPERATION_INVALID:${invalid.flatMap(result => result.errors).join(';')}`);
  return {
    format: 'INK-CANONICAL-PROGRAM',
    schemaVersion: 1,
    id: `program_${deterministicHash({ source, metadata, normalized })}`,
    source: clone(source),
    metadata: clone(metadata),
    operations: normalized.map(clone),
    dependencies: clone(dependencies),
    warnings: clone(warnings),
    deterministicHash: deterministicHash(normalized)
  };
}

