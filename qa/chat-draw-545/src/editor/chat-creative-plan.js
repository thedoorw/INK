import {
  buildChatStateSummary,
  chatStateFingerprint,
  normalizeChatEditTask,
  validateChatEditTaskAgainstState
} from './chat-bounded-edit.js';

export const CHAT_CREATIVE_PLAN_SCHEMA = 'INK-CHAT-CREATIVE-PLAN';
export const CHAT_CREATIVE_PLAN_VERSION = 1;
export const CHAT_CREATIVE_PLAN_RESULT_SCHEMA = 'INK-CHAT-CREATIVE-PLAN-RESULT';
export const CHAT_CREATIVE_PLAN_RESULT_VERSION = 1;

export const CHAT_CREATIVE_PLAN_STATES = Object.freeze([
  'PROPOSED',
  'APPROVED',
  'EXECUTING',
  'COMPLETED',
  'STOPPED',
  'REJECTED'
]);

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function planFail(code, details = {}) {
  throw Object.assign(new Error(`INK_CHAT_PLAN_${code}`), {
    code: `CHAT_PLAN_${code}`,
    ...details
  });
}

function boundedText(value, field, { required = true, max = 240 } = {}) {
  if (value == null || value === '') {
    if (!required) return null;
    planFail('FIELD_REQUIRED', { field });
  }
  if (typeof value !== 'string') planFail('FIELD_INVALID', { field });
  const text = value.trim();
  if ((required && !text) || text.length > max) planFail('FIELD_INVALID', { field });
  return text || null;
}

function normalizeSource(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) planFail('SOURCE_REQUIRED');
  const source = {
    documentId: boundedText(raw.documentId, 'source.documentId', { max: 160 }),
    pageId: boundedText(raw.pageId, 'source.pageId', { max: 160 }),
    revisionId: hasOwn(raw, 'revisionId')
      ? (raw.revisionId == null ? null : boundedText(raw.revisionId, 'source.revisionId', { max: 220 }))
      : null,
    documentFingerprint: boundedText(raw.documentFingerprint, 'source.documentFingerprint', { max: 160 })
  };
  return source;
}

function normalizeDependencies(raw, index) {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 32) planFail('DEPENDENCIES_INVALID', { index });
  const dependencies = raw.map((value, dependencyIndex) =>
    boundedText(value, `steps[${index}].dependsOn[${dependencyIndex}]`, { max: 160 }));
  if (new Set(dependencies).size !== dependencies.length) {
    planFail('DEPENDENCY_DUPLICATE', { index });
  }
  return dependencies;
}

function normalizeStep(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) planFail('STEP_INVALID', { index });
  const stepId = boundedText(raw.stepId, `steps[${index}].stepId`, { max: 160 });
  const task = normalizeChatEditTask({
    schema: 'INK-CHAT-EDIT-TASK',
    version: 1,
    taskId: raw.taskId || `plan-step:${stepId}`,
    operation: raw.operation,
    targets: raw.targets,
    arguments: raw.arguments,
    expected: raw.expected ?? null
  });
  return {
    stepId,
    operation: task.operation,
    targets: clone(task.targets),
    arguments: clone(task.arguments),
    dependsOn: normalizeDependencies(raw.dependsOn, index)
  };
}

function validateStepGraph(steps) {
  const ids = steps.map(step => step.stepId);
  const unique = new Set(ids);
  if (unique.size !== ids.length) planFail('STEP_ID_DUPLICATE');

  const indexById = new Map(ids.map((id, index) => [id, index]));
  steps.forEach((step, index) => {
    for (const dependency of step.dependsOn) {
      if (!indexById.has(dependency)) {
        planFail('DEPENDENCY_MISSING', { stepId: step.stepId, dependency });
      }
      const dependencyIndex = indexById.get(dependency);
      if (dependencyIndex >= index) {
        planFail('DEPENDENCY_ORDER_INVALID', {
          stepId: step.stepId,
          dependency,
          dependencyIndex,
          stepIndex: index
        });
      }
    }
  });
}

function derivePlanId(source, intentSummary, steps) {
  const fingerprint = chatStateFingerprint({
    source,
    intentSummary,
    steps: steps.map(step => ({
      stepId: step.stepId,
      operation: step.operation,
      targets: step.targets,
      arguments: step.arguments,
      dependsOn: step.dependsOn
    }))
  });
  return `plan:${source.documentId}:${fingerprint.slice(-8)}`;
}

export function normalizeChatCreativePlan(raw, { source = null } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) planFail('PLAN_INVALID');
  if (raw.schema != null && raw.schema !== CHAT_CREATIVE_PLAN_SCHEMA) {
    planFail('SCHEMA_UNSUPPORTED', { schema: raw.schema });
  }
  if (raw.version != null && Number(raw.version) !== CHAT_CREATIVE_PLAN_VERSION) {
    planFail('VERSION_UNSUPPORTED', { version: raw.version });
  }

  if (!Array.isArray(raw.steps) || raw.steps.length < 2 || raw.steps.length > 32) {
    planFail('STEPS_INVALID', { min: 2, max: 32, actual: raw.steps?.length ?? null });
  }

  const normalizedSource = normalizeSource(raw.source ?? source);
  const intentSummary = boundedText(raw.intentSummary, 'intentSummary', { max: 1000 });
  const steps = raw.steps.map(normalizeStep);
  validateStepGraph(steps);

  const planId = raw.planId
    ? boundedText(raw.planId, 'planId', { max: 220 })
    : derivePlanId(normalizedSource, intentSummary, steps);

  return {
    schema: CHAT_CREATIVE_PLAN_SCHEMA,
    version: CHAT_CREATIVE_PLAN_VERSION,
    planId,
    source: normalizedSource,
    intentSummary,
    steps,
    status: 'PROPOSED',
    diagnostics: []
  };
}

export function chatCreativePlanDiagnostic(error, phase = 'unknown') {
  const code = typeof error?.code === 'string' ? error.code : 'CHAT_PLAN_UNKNOWN';
  const diagnostic = { ok: false, phase, code };
  for (const key of [
    'field', 'schema', 'version', 'stepId', 'stepIndex', 'dependency',
    'dependencyIndex', 'operation', 'objectId', 'pageId', 'layerId',
    'expected', 'actual', 'min', 'max'
  ]) {
    if (error?.[key] !== undefined) diagnostic[key] = clone(error[key]);
  }
  return diagnostic;
}


export const CHAT_CREATIVE_PLAN_VALIDATION_SCHEMA = 'INK-CHAT-CREATIVE-PLAN-VALIDATION';
export const CHAT_CREATIVE_PLAN_VALIDATION_VERSION = 1;

export function chatCreativePlanSource(app) {
  const summary = buildChatStateSummary(app);
  return {
    documentId: summary.document.id,
    pageId: summary.page.id,
    revisionId: summary.revision.revisionId ?? null,
    documentFingerprint: summary.revision.documentFingerprint
  };
}

function assertPlanSourceCurrent(app, source) {
  const current = chatCreativePlanSource(app);
  if (source.documentId !== current.documentId) {
    planFail('STALE_DOCUMENT', { expected: source.documentId, actual: current.documentId });
  }
  if (source.pageId !== current.pageId) {
    planFail('STALE_PAGE', { expected: source.pageId, actual: current.pageId });
  }
  if (source.revisionId !== current.revisionId) {
    planFail('STALE_REVISION', { expected: source.revisionId, actual: current.revisionId });
  }
  if (source.documentFingerprint !== current.documentFingerprint) {
    planFail('STALE_DOCUMENT_FINGERPRINT', {
      expected: source.documentFingerprint,
      actual: current.documentFingerprint
    });
  }
  return current;
}

function stepAsEditTask(plan, step) {
  return {
    schema: 'INK-CHAT-EDIT-TASK',
    version: 1,
    taskId: `${plan.planId}:${step.stepId}`,
    operation: step.operation,
    targets: clone(step.targets),
    arguments: clone(step.arguments),
    expected: {
      documentId: plan.source.documentId,
      pageId: plan.source.pageId,
      revisionId: plan.source.revisionId
    }
  };
}

export function validateChatCreativePlanAgainstState(app, rawPlan, {
  requireHistoryIdle = true,
  source = null
} = {}) {
  const plan = normalizeChatCreativePlan(rawPlan, { source: source ?? chatCreativePlanSource(app) });
  const currentSource = assertPlanSourceCurrent(app, plan.source);
  if (!app?.history || !Array.isArray(app.history.undoStack) || !Array.isArray(app.history.redoStack)) {
    planFail('HISTORY_INVALID');
  }
  if (requireHistoryIdle && app.history.pending) planFail('HISTORY_BUSY');

  const steps = plan.steps.map((step, stepIndex) => {
    const task = stepAsEditTask(plan, step);
    const validation = validateChatEditTaskAgainstState(app, task, {
      expected: task.expected,
      requireHistoryIdle
    });
    return {
      stepId: step.stepId,
      stepIndex,
      operation: step.operation,
      dependsOn: clone(step.dependsOn),
      targetCount: validation.task.targets.length,
      targets: clone(validation.task.targets),
      valid: true
    };
  });

  return {
    plan,
    validation: {
      schema: CHAT_CREATIVE_PLAN_VALIDATION_SCHEMA,
      version: CHAT_CREATIVE_PLAN_VALIDATION_VERSION,
      valid: true,
      source: currentSource,
      stepCount: steps.length,
      steps
    }
  };
}

export function createChatCreativePlanProposal(app, rawPlan) {
  const source = chatCreativePlanSource(app);
  const candidate = rawPlan?.source ? rawPlan : { ...rawPlan, source };
  return validateChatCreativePlanAgainstState(app, candidate, {
    requireHistoryIdle: true,
    source
  });
}


function planRecord(plan, validation) {
  return {
    ...clone(plan),
    validation: clone(validation),
    approved: false,
    approvalToken: null,
    stepResults: [],
    result: null
  };
}

function requirePlan(controller, planId) {
  const plan = controller.plans.get(String(planId || ''));
  if (!plan) planFail('PLAN_NOT_FOUND', { planId: String(planId || '') });
  return plan;
}

function assertExecutionFingerprint(app, expectedFingerprint) {
  const current = chatCreativePlanSource(app);
  if (current.documentFingerprint !== expectedFingerprint) {
    planFail('STALE_DOCUMENT_FINGERPRINT', {
      expected: expectedFingerprint,
      actual: current.documentFingerprint
    });
  }
  return current;
}

function assertExecutionIdentity(app, source) {
  const current = chatCreativePlanSource(app);
  if (current.documentId !== source.documentId) {
    planFail('STALE_DOCUMENT', { expected: source.documentId, actual: current.documentId });
  }
  if (current.pageId !== source.pageId) {
    planFail('STALE_PAGE', { expected: source.pageId, actual: current.pageId });
  }
  if (current.revisionId !== source.revisionId) {
    planFail('STALE_REVISION', { expected: source.revisionId, actual: current.revisionId });
  }
  if (!app?.history || !Array.isArray(app.history.undoStack) || !Array.isArray(app.history.redoStack)) {
    planFail('HISTORY_INVALID');
  }
  if (app.history.pending) planFail('HISTORY_BUSY');
  return current;
}

function stoppedStepResult(step, stepIndex, diagnostic) {
  return {
    stepId: step.stepId,
    stepIndex,
    operation: step.operation,
    state: 'STOPPED',
    ok: false,
    diagnostic: clone(diagnostic)
  };
}

async function capturePlanRevision(app, record, startingRevisionId, status) {
  const revisions = app?.revisions;
  if (!revisions?.capture) planFail('REVISION_UNAVAILABLE');
  const currentRevisionId = revisions.revisionIdFor?.(app?.doc?.id) ?? null;
  if (currentRevisionId !== startingRevisionId) {
    return {
      startingRevisionId,
      endingRevisionId: currentRevisionId,
      created: false,
      equivalent: false,
      captureSkipped: 'source-revision-changed',
      comparison: null
    };
  }
  const captured = await revisions.capture({
    parentRevisionId: startingRevisionId,
    reason: status === 'COMPLETED' ? 'chat-plan-complete' : 'chat-plan-stopped',
    label: `CHAT plan ${record.planId} · ${status.toLowerCase()}`
  });
  return {
    startingRevisionId,
    endingRevisionId: captured.record?.revisionId ?? currentRevisionId,
    created: Boolean(captured.created),
    equivalent: Boolean(captured.equivalent),
    captureSkipped: null,
    comparison: clone(captured.comparison || null)
  };
}

export class ChatCreativePlanController {
  constructor(app) {
    this.app = app;
    this.plans = new Map();
    this.approvalSequence = 0;
  }

  inspect() {
    return buildChatStateSummary(this.app);
  }

  getPlan(planId) {
    const plan = this.plans.get(String(planId || ''));
    return plan ? clone(plan) : null;
  }

  propose(rawPlan) {
    const { plan, validation } = createChatCreativePlanProposal(this.app, rawPlan);
    if (this.plans.has(plan.planId)) planFail('PLAN_EXISTS', { planId: plan.planId });
    const record = planRecord(plan, validation);
    this.plans.set(record.planId, record);
    return clone(record);
  }

  validate(planId) {
    const record = requirePlan(this, planId);
    if (record.status !== 'PROPOSED') {
      planFail('PLAN_STATE_INVALID', { actual: record.status });
    }
    const { validation } = validateChatCreativePlanAgainstState(this.app, record, {
      requireHistoryIdle: true,
      source: record.source
    });
    record.validation = clone(validation);
    this.plans.set(record.planId, record);
    return clone(validation);
  }

  approve(planId) {
    const record = requirePlan(this, planId);
    if (record.status !== 'PROPOSED') {
      planFail('PLAN_STATE_INVALID', { actual: record.status });
    }
    const { validation } = validateChatCreativePlanAgainstState(this.app, record, {
      requireHistoryIdle: true,
      source: record.source
    });
    const approvalToken = `INK-LOCAL-PLAN-APPROVAL:${record.planId}:${++this.approvalSequence}`;
    record.validation = clone(validation);
    record.status = 'APPROVED';
    record.approved = true;
    record.approvalToken = approvalToken;
    record.diagnostics = [];
    this.plans.set(record.planId, record);
    return clone(record);
  }

  reject(planId) {
    const record = requirePlan(this, planId);
    if (!['PROPOSED', 'APPROVED'].includes(record.status)) {
      planFail('PLAN_STATE_INVALID', { actual: record.status });
    }
    record.status = 'REJECTED';
    record.approved = false;
    record.approvalToken = null;
    record.result = {
      schema: CHAT_CREATIVE_PLAN_RESULT_SCHEMA,
      version: CHAT_CREATIVE_PLAN_RESULT_VERSION,
      ok: false,
      planId: record.planId,
      status: 'REJECTED',
      stepResults: clone(record.stepResults),
      stoppedStepId: null,
      revision: {
        startingRevisionId: record.source.revisionId,
        endingRevisionId: this.app?.revisions?.revisionIdFor?.(this.app?.doc?.id) ?? null
      }
    };
    this.plans.set(record.planId, record);
    return clone(record);
  }

  assertApproved(planId, approvalToken) {
    const record = requirePlan(this, planId);
    if (record.status !== 'APPROVED' || !record.approved) {
      planFail('APPROVAL_REQUIRED', { actual: record.status });
    }
    if (!approvalToken || approvalToken !== record.approvalToken) {
      planFail('APPROVAL_TOKEN_INVALID');
    }
    return record;
  }

  async execute(planId, approvalToken) {
    const record = this.assertApproved(planId, approvalToken);
    const bounded = this.app?.chatBoundedEdit;
    if (!bounded?.propose || !bounded?.approve || !bounded?.execute) {
      planFail('BOUNDED_EDIT_UNAVAILABLE');
    }
    if (!this.app?.revisions?.capture) planFail('REVISION_UNAVAILABLE');

    const startingRevisionId = record.source.revisionId;
    let expectedFingerprint = record.source.documentFingerprint;
    const completedIds = new Set();

    record.status = 'EXECUTING';
    record.approved = false;
    record.approvalToken = null;
    record.stepResults = [];
    record.diagnostics = [];
    this.plans.set(record.planId, record);

    for (let stepIndex = 0; stepIndex < record.steps.length; stepIndex += 1) {
      const step = record.steps[stepIndex];
      try {
        for (const dependency of step.dependsOn) {
          if (!completedIds.has(dependency)) {
            planFail('DEPENDENCY_NOT_COMPLETED', {
              stepId: step.stepId,
              stepIndex,
              dependency
            });
          }
        }

        assertExecutionIdentity(this.app, record.source);

        const task = stepAsEditTask(record, step);
        validateChatEditTaskAgainstState(this.app, task, {
          expected: task.expected,
          requireHistoryIdle: true
        });
        assertExecutionFingerprint(this.app, expectedFingerprint);

        const proposal = bounded.propose(task);
        const technicalApproval = bounded.approve(proposal.proposalId);
        const boundedResult = bounded.execute(
          proposal.proposalId,
          technicalApproval.approvalToken
        );

        expectedFingerprint = boundedResult?.revision?.documentFingerprint
          || chatCreativePlanSource(this.app).documentFingerprint;
        completedIds.add(step.stepId);
        record.stepResults.push({
          stepId: step.stepId,
          stepIndex,
          operation: step.operation,
          state: 'COMPLETED',
          ok: true,
          proposalId: proposal.proposalId,
          changed: Boolean(boundedResult?.changed),
          targets: clone(boundedResult?.targets || step.targets),
          history: clone(boundedResult?.history || null),
          revision: clone(boundedResult?.revision || null)
        });
        this.plans.set(record.planId, record);
      } catch (error) {
        const diagnostic = chatCreativePlanDiagnostic(error, 'execute-step');
        const stopped = stoppedStepResult(step, stepIndex, diagnostic);
        record.stepResults.push(stopped);
        record.status = 'STOPPED';
        record.diagnostics = [diagnostic];
        let revision = {
          startingRevisionId,
          endingRevisionId: this.app?.revisions?.revisionIdFor?.(this.app?.doc?.id) ?? null,
          created: false,
          equivalent: false,
          captureSkipped: 'no-completed-step',
          comparison: null
        };
        if (record.stepResults.some(item => item.ok === true)) {
          try {
            revision = await capturePlanRevision(this.app, record, startingRevisionId, 'STOPPED');
          } catch (revisionError) {
            record.diagnostics.push(chatCreativePlanDiagnostic(revisionError, 'revision-capture'));
            revision.captureSkipped = 'capture-failed';
          }
        }
        record.result = {
          schema: CHAT_CREATIVE_PLAN_RESULT_SCHEMA,
          version: CHAT_CREATIVE_PLAN_RESULT_VERSION,
          ok: false,
          planId: record.planId,
          status: 'STOPPED',
          stepResults: clone(record.stepResults),
          stoppedStepId: step.stepId,
          stoppedStepIndex: stepIndex,
          remainingStepIds: record.steps.slice(stepIndex + 1).map(item => item.stepId),
          revision,
          diagnostic
        };
        this.plans.set(record.planId, record);
        return clone(record.result);
      }
    }

    let revision;
    try {
      revision = await capturePlanRevision(this.app, record, startingRevisionId, 'COMPLETED');
    } catch (error) {
      const diagnostic = chatCreativePlanDiagnostic(error, 'revision-capture');
      record.status = 'STOPPED';
      record.diagnostics = [diagnostic];
      record.result = {
        schema: CHAT_CREATIVE_PLAN_RESULT_SCHEMA,
        version: CHAT_CREATIVE_PLAN_RESULT_VERSION,
        ok: false,
        planId: record.planId,
        status: 'STOPPED',
        stepResults: clone(record.stepResults),
        stoppedStepId: null,
        stoppedStepIndex: null,
        remainingStepIds: [],
        revision: {
          startingRevisionId,
          endingRevisionId: this.app?.revisions?.revisionIdFor?.(this.app?.doc?.id) ?? null,
          created: false,
          equivalent: false,
          captureSkipped: 'capture-failed',
          comparison: null
        },
        diagnostic
      };
      this.plans.set(record.planId, record);
      return clone(record.result);
    }

    record.status = 'COMPLETED';
    record.result = {
      schema: CHAT_CREATIVE_PLAN_RESULT_SCHEMA,
      version: CHAT_CREATIVE_PLAN_RESULT_VERSION,
      ok: true,
      planId: record.planId,
      status: 'COMPLETED',
      stepResults: clone(record.stepResults),
      stoppedStepId: null,
      remainingStepIds: [],
      revision: {
        ...revision,
        documentFingerprint: expectedFingerprint
      }
    };
    this.plans.set(record.planId, record);
    return clone(record.result);
  }
}

export function createChatCreativePlanAdapter(appOrController) {
  const controller = appOrController instanceof ChatCreativePlanController
    ? appOrController
    : (appOrController?.chatCreativePlan || new ChatCreativePlanController(appOrController));

  return Object.freeze({
    inspect() {
      try { return { ok: true, action: 'inspect', result: controller.inspect() }; }
      catch (error) { return chatCreativePlanDiagnostic(error, 'inspect'); }
    },
    propose(plan) {
      try { return { ok: true, action: 'propose', result: controller.propose(plan) }; }
      catch (error) { return chatCreativePlanDiagnostic(error, 'propose'); }
    },
    validate(planId) {
      try { return { ok: true, action: 'validate', result: controller.validate(planId) }; }
      catch (error) { return chatCreativePlanDiagnostic(error, 'validate'); }
    },
    approve(planId) {
      try { return { ok: true, action: 'approve', result: controller.approve(planId) }; }
      catch (error) { return chatCreativePlanDiagnostic(error, 'approve'); }
    },
    reject(planId) {
      try { return { ok: true, action: 'reject', result: controller.reject(planId) }; }
      catch (error) { return chatCreativePlanDiagnostic(error, 'reject'); }
    },
    async execute(planId, approvalToken) {
      try {
        return {
          ok: true,
          action: 'execute',
          result: await controller.execute(planId, approvalToken)
        };
      } catch (error) {
        return chatCreativePlanDiagnostic(error, 'execute');
      }
    }
  });
}

export function installChatCreativePlan(app) {
  const controller = new ChatCreativePlanController(app);
  app.chatCreativePlan = controller;
  app.chatCreativePlanAdapter = createChatCreativePlanAdapter(controller);
  return controller;
}
