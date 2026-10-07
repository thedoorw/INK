import { canonicalProgram, deterministicHash } from './canonical-operation.js';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

export const WORKFLOW_IR_FORMAT = 'INK-WORKFLOW-IR';
export const WORKFLOW_IR_SCHEMA_VERSION = 1;
export const USER_TRANSLATION_STATUSES = Object.freeze([
  'DIRECT_TRANSLATION',
  'SEMANTIC_TRANSLATION',
  'PARTIAL',
  'UNSUPPORTED',
  'FORMAT_BLOCKED'
]);

const normalizeDependency = value => {
  if (value == null) return [];
  return Array.isArray(value) ? clone(value) : [clone(value)];
};

export function toUserTranslationStatus(status, { gapCategory = null, formatBlocked = false } = {}) {
  if (formatBlocked || gapCategory === 'FILE_FORMAT_LIMIT') return 'FORMAT_BLOCKED';
  if (status === 'DIRECT') return 'DIRECT_TRANSLATION';
  if (status === 'EQUIVALENT' || status === 'APPROXIMATED') return 'SEMANTIC_TRANSLATION';
  if (status === 'REJECTED') return 'UNSUPPORTED';
  return 'PARTIAL';
}

export function createWorkflowIR({ source = {}, metadata = {}, operations = [], dependencies = [], warnings = [], adapter = null } = {}) {
  const irOperations = operations.map((input, index) => {
    const operation = input.operation || input.canonicalOperation || 'external.unknown';
    const operationId = input.operationId || 'workflow_op_' + deterministicHash({ operation, index, sourceCommand: input.sourceCommand, parameters: input.parameters || {} });
    return {
      operationId,
      operation,
      target: clone(input.target || {}),
      parameters: clone(input.parameters || {}),
      order: Number.isFinite(Number(input.order)) ? Number(input.order) : index + 1,
      condition: clone(input.condition ?? null),
      repeat: clone(input.repeat ?? null),
      dependency: normalizeDependency(input.dependency ?? input.dependencies),
      input: clone(input.input ?? input.inputState ?? {}),
      output: clone(input.output ?? input.outputState ?? {}),
      unsupportedStep: input.unsupportedStep === true,
      sourceSoftware: input.sourceSoftware || metadata.sourceSoftware || source.sourceSoftware || 'Unknown',
      sourceCommand: input.sourceCommand || operation,
      category: input.category || 'External Dependency',
      destructive: Boolean(input.destructive),
      deterministic: input.deterministic !== false,
      inkCapabilityMapping: clone(input.inkCapabilityMapping ?? operation),
      fallbackCandidate: clone(input.fallbackCandidate ?? null),
      confidence: Math.max(0, Math.min(1, Number(input.confidence ?? 0.5))),
      evidence: clone(input.evidence || []),
      unsupportedReason: input.unsupportedReason || null,
      conversionStatus: input.conversionStatus || 'PARTIAL'
    };
  }).sort((a, b) => a.order - b.order || a.operationId.localeCompare(b.operationId));

  const canonicalInputs = irOperations.map(item => ({
    operationId: item.operationId,
    sourceSoftware: item.sourceSoftware,
    sourceCommand: item.sourceCommand,
    canonicalOperation: item.operation,
    category: item.category,
    target: item.target,
    inputState: item.input,
    parameters: item.parameters,
    dependencies: item.dependency,
    expectedStateChange: { operation: item.operation, order: item.order },
    outputState: item.output,
    destructive: item.destructive,
    deterministic: item.deterministic,
    inkCapabilityMapping: item.inkCapabilityMapping,
    fallbackCandidate: item.fallbackCandidate,
    confidence: item.confidence,
    evidence: item.evidence,
    unsupportedReason: item.unsupportedReason,
    conversionStatus: item.conversionStatus
  }));
  const canonical = canonicalProgram({ source, metadata, operations: canonicalInputs, dependencies, warnings });
  const canonicalById = new Map(canonical.operations.map(operation => [operation.operationId, operation]));
  const normalized = irOperations.map(operation => ({
    ...operation,
    canonicalOperation: canonicalById.get(operation.operationId)?.canonicalOperation || operation.operation
  }));
  const id = 'workflow_' + deterministicHash({ source, metadata, operations: normalized, adapter });
  return {
    format: WORKFLOW_IR_FORMAT,
    schemaVersion: WORKFLOW_IR_SCHEMA_VERSION,
    id,
    source: clone(source),
    metadata: clone(metadata),
    adapter: clone(adapter),
    operations: normalized,
    dependencies: clone(dependencies),
    warnings: clone(warnings),
    canonicalProgram: canonical,
    deterministicHash: deterministicHash(normalized)
  };
}

export function validateWorkflowIR(workflow) {
  const errors = [];
  if (workflow?.format !== WORKFLOW_IR_FORMAT) errors.push('format');
  if (workflow?.schemaVersion !== WORKFLOW_IR_SCHEMA_VERSION) errors.push('schemaVersion');
  if (!Array.isArray(workflow?.operations)) errors.push('operations');
  for (const [index, operation] of (workflow?.operations || []).entries()) {
    for (const key of ['operation', 'target', 'parameters', 'order', 'condition', 'repeat', 'dependency', 'input', 'output', 'unsupportedStep']) {
      if (operation?.[key] === undefined) errors.push('operation[' + index + '].' + key);
    }
  }
  if (workflow?.canonicalProgram?.format !== 'INK-CANONICAL-PROGRAM') errors.push('canonicalProgram');
  return { valid: errors.length === 0, errors };
}
