import { deterministicHash } from './canonical-operation.js';

const clone = value => JSON.parse(JSON.stringify(value));

export const REFERENCE_RUN_STATES = Object.freeze([
  'COMPLETED',
  'INSTALLATION_REQUIRED',
  'LICENSE_REQUIRED',
  'MANUAL_REFERENCE_RUN_REQUIRED',
  'EXTERNAL_EXECUTION_UNAVAILABLE',
  'EXECUTION_FAILED'
]);

export const REFERENCE_RUN_LABELS = Object.freeze({
  INSTALLATION_REQUIRED: 'INSTALLATION REQUIRED',
  LICENSE_REQUIRED: 'LICENSE REQUIRED',
  MANUAL_REFERENCE_RUN_REQUIRED: 'MANUAL REFERENCE RUN REQUIRED',
  EXTERNAL_EXECUTION_UNAVAILABLE: 'EXTERNAL EXECUTION UNAVAILABLE'
});

const now = () => new Date().toISOString();

function validateRequest(request) {
  for (const key of ['assetId', 'runnerId', 'software', 'program']) {
    if (!request?.[key]) throw new Error(`INK_REFERENCE_RUN_REQUEST_${key.toUpperCase()}_REQUIRED`);
  }
  return request;
}

export function unavailableReferenceRun(request, status, detail = {}) {
  validateRequest(request);
  if (!REFERENCE_RUN_STATES.includes(status) || status === 'COMPLETED') throw new Error('INK_REFERENCE_RUN_STATUS_INVALID');
  const startedAt = detail.startedAt || now();
  return {
    format: 'INK-EXTERNAL-REFERENCE-RUN', schemaVersion: 1,
    id: `reference_run_${deterministicHash({ request, status, detail })}`,
    assetId: request.assetId, runnerId: request.runnerId, software: request.software,
    status, statusLabel: REFERENCE_RUN_LABELS[status] || status,
    automatic: false, originalProgramExecuted: false,
    softwareVersion: detail.softwareVersion || null,
    programVersion: request.programVersion || null,
    startedAt, finishedAt: detail.finishedAt || startedAt, durationMs: 0,
    input: clone(request.input || null), program: clone(request.program),
    output: null, intermediateStates: [], structureSummary: null,
    errors: clone(detail.errors || []), warnings: clone(detail.warnings || []),
    executionLog: clone(detail.executionLog || []),
    reproducibility: {
      request: clone(request), command: null,
      reason: detail.reason || REFERENCE_RUN_LABELS[status] || status,
      retainedOnFailure: true
    }
  };
}

export function completedReferenceRun(request, evidence = {}) {
  validateRequest(request);
  if (!evidence.softwareVersion) throw new Error('INK_REFERENCE_SOFTWARE_VERSION_REQUIRED');
  if (!evidence.output) throw new Error('INK_REFERENCE_OUTPUT_REQUIRED');
  const startedAt = evidence.startedAt || now(), finishedAt = evidence.finishedAt || now();
  const result = {
    format: 'INK-EXTERNAL-REFERENCE-RUN', schemaVersion: 1,
    assetId: request.assetId, runnerId: request.runnerId, software: request.software,
    status: 'COMPLETED', statusLabel: 'COMPLETED', automatic: evidence.automatic !== false,
    originalProgramExecuted: evidence.originalProgramExecuted === true,
    softwareVersion: String(evidence.softwareVersion), programVersion: request.programVersion || evidence.programVersion || null,
    startedAt, finishedAt, durationMs: Number.isFinite(+evidence.durationMs) ? +evidence.durationMs : Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
    input: clone(request.input || null), program: clone(request.program), output: clone(evidence.output),
    intermediateStates: clone(evidence.intermediateStates || []), structureSummary: clone(evidence.structureSummary || null),
    errors: clone(evidence.errors || []), warnings: clone(evidence.warnings || []), executionLog: clone(evidence.executionLog || []),
    reproducibility: clone(evidence.reproducibility || { request: clone(request), retainedOnFailure: true })
  };
  if (!result.originalProgramExecuted) throw new Error('INK_REFERENCE_ORIGINAL_EXECUTION_EVIDENCE_REQUIRED');
  result.id = `reference_run_${deterministicHash(result)}`;
  return result;
}

export class ExternalReferenceRunnerRegistry {
  constructor() { this.runners = new Map(); }
  register(descriptor) {
    if (!descriptor?.id || !descriptor.software || typeof descriptor.run !== 'function') throw new Error('INK_REFERENCE_RUNNER_INVALID');
    this.runners.set(descriptor.id, { automatic: true, availability: () => ({ available: true }), ...descriptor });
    return descriptor.id;
  }
  describe(id) {
    const runner = this.runners.get(id);
    if (!runner) return null;
    const availability = runner.availability?.() || { available: true };
    return clone({ id: runner.id, software: runner.software, automatic: runner.automatic !== false, availability });
  }
  async execute(request, { userApproved = false } = {}) {
    validateRequest(request);
    const runner = this.runners.get(request.runnerId);
    if (!runner) return unavailableReferenceRun(request, 'EXTERNAL_EXECUTION_UNAVAILABLE', { reason: 'runner is not registered' });
    const availability = await runner.availability(request);
    if (!availability?.available) return unavailableReferenceRun(request, availability?.status || 'INSTALLATION_REQUIRED', availability || {});
    if (runner.requiresLicense && !availability.licensed) return unavailableReferenceRun(request, 'LICENSE_REQUIRED', availability);
    if (!userApproved) return unavailableReferenceRun(request, 'MANUAL_REFERENCE_RUN_REQUIRED', { reason: 'trusted external execution requires explicit approval' });
    try {
      const evidence = await runner.run(clone(request));
      return completedReferenceRun(request, { automatic: runner.automatic !== false, ...evidence });
    } catch (error) {
      return unavailableReferenceRun(request, 'EXECUTION_FAILED', {
        errors: [{ code: error.code || 'EXECUTION_FAILED', message: error.message }],
        reason: 'external runner failed; reproducibility data retained'
      });
    }
  }
}

export function createManualReferenceRunKit(request, { instructions = [], requiredImports = [], reason = 'automatic runner unavailable' } = {}) {
  validateRequest(request);
  return {
    format: 'INK-MANUAL-REFERENCE-RUN-KIT', schemaVersion: 1,
    id: `manual_reference_${deterministicHash({ request, instructions, requiredImports })}`,
    assetId: request.assetId, runnerId: request.runnerId, software: request.software,
    status: 'MANUAL_REFERENCE_RUN_REQUIRED', statusLabel: REFERENCE_RUN_LABELS.MANUAL_REFERENCE_RUN_REQUIRED,
    automaticRunner: false, request: clone(request),
    instructions: clone(instructions), requiredImports: clone(requiredImports), reason,
    acceptance: {
      sourceOutputRequired: true, sourceStructureSummaryRequired: true,
      softwareVersionRequired: true, executionLogRequired: true,
      mayServeAsFormalReferenceEvidence: true, mayBeClaimedAsAutomaticRunner: false
    }
  };
}
