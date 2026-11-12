import { chatStateFingerprint, stableChatStringify } from '../editor/chat-bounded-edit.js';
import { createChatCreativePlanProposal } from '../editor/chat-creative-plan.js';

export const GROUNDED_CREATIVE_DECISION_SCHEMA = 'INK-GROUNDED-CREATIVE-DECISION';
export const GROUNDED_CREATIVE_DECISION_VERSION = 1;
export const GROUNDED_CREATIVE_PLAN_BRIDGE_SCHEMA = 'INK-GROUNDED-CREATIVE-PLAN-BRIDGE';
export const GROUNDED_CREATIVE_PLAN_BRIDGE_VERSION = 1;

export const GROUNDED_CREATIVE_DECISION_TYPES = Object.freeze([
  'DISCUSSION_ONLY',
  'PLAN_PROPOSAL',
  'INSUFFICIENT_EVIDENCE',
  'UNSUPPORTED'
]);

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export class GroundedCreativeDecisionError extends Error {
  constructor(code, details = {}) {
    super(`INK_GROUNDED_CREATIVE_DECISION_${code}`);
    this.name = 'GroundedCreativeDecisionError';
    this.code = `GROUNDED_CREATIVE_DECISION_${code}`;
    Object.assign(this, details);
  }
}

function fail(code, details = {}) {
  throw new GroundedCreativeDecisionError(code, details);
}

function boundedText(value, field, { required = true, max = 1000 } = {}) {
  if (value == null || value === '') {
    if (!required) return null;
    fail('FIELD_REQUIRED', { field });
  }
  if (typeof value !== 'string') fail('FIELD_INVALID', { field });
  const text = value.trim();
  if ((required && !text) || text.length > max) fail('FIELD_INVALID', { field });
  return text || null;
}

function canonicalJson(value, field, maxBytes = 4096) {
  let normalized;
  try {
    normalized = JSON.parse(stableChatStringify(value));
  } catch {
    fail('FIELD_INVALID', { field });
  }
  if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength > maxBytes) {
    fail('FIELD_BOUNDS', { field, maxBytes });
  }
  return normalized;
}

function boundedEvidenceList(raw, field) {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 64) fail('FIELD_INVALID', { field });
  return raw.map((item, index) => canonicalJson(item, `${field}[${index}]`))
    .sort((a, b) => stableChatStringify(a).localeCompare(stableChatStringify(b)));
}

function boundedStringList(raw, field) {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 64) fail('FIELD_INVALID', { field });
  return [...new Set(raw.map((item, index) => boundedText(item, `${field}[${index}]`, { max: 500 })))]
    .sort((a, b) => a.localeCompare(b));
}

function normalizeSourceRequest(raw) {
  if (!record(raw)) fail('SOURCE_REQUEST_REQUIRED');
  return {
    requestId: boundedText(raw.requestId, 'sourceRequest.requestId', { max: 220 }),
    sessionId: boundedText(raw.sessionId, 'sourceRequest.sessionId', { max: 220 })
  };
}

function normalizeTarget(raw, index) {
  if (!record(raw)) fail('TARGET_INVALID', { index });
  return {
    pageId: boundedText(raw.pageId, `targets[${index}].pageId`, { max: 160 }),
    layerId: boundedText(raw.layerId, `targets[${index}].layerId`, { max: 160 }),
    objectId: boundedText(raw.objectId, `targets[${index}].objectId`, { max: 160 })
  };
}

function targetKey(ref) {
  return `${ref.pageId}\u0000${ref.layerId}\u0000${ref.objectId}`;
}

function normalizeTargets(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 64) fail('TARGETS_INVALID');
  const targets = raw.map(normalizeTarget).sort((a, b) => targetKey(a).localeCompare(targetKey(b)));
  if (new Set(targets.map(targetKey)).size !== targets.length) fail('TARGET_DUPLICATE');
  return targets;
}

function evidenceCallId(envelope) {
  return envelope?.toolCallId || envelope?.id || null;
}

function evidenceToolName(envelope) {
  return envelope?.name || envelope?.tool || envelope?.function?.name || null;
}

function trustedEvidenceIndex(trustedToolResults = []) {
  const index = new Map();
  for (const envelope of trustedToolResults || []) {
    const toolCallId = evidenceCallId(envelope);
    const tool = evidenceToolName(envelope);
    if (!toolCallId || !tool) continue;
    index.set(toolCallId, {
      toolCallId,
      tool,
      resultFingerprint: chatStateFingerprint(envelope?.result ?? envelope)
    });
  }
  return index;
}

function normalizeToolEvidence(raw, trustedToolResults) {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 32) fail('TOOL_EVIDENCE_INVALID');
  const trusted = trustedEvidenceIndex(trustedToolResults);
  const evidence = raw.map((item, index) => {
    if (!record(item)) fail('TOOL_EVIDENCE_INVALID', { index });
    const toolCallId = boundedText(item.toolCallId, `toolEvidence[${index}].toolCallId`, { max: 160 });
    const actual = trusted.get(toolCallId);
    if (!actual) fail('TOOL_EVIDENCE_UNTRUSTED', { toolCallId });
    const requestedTool = boundedText(item.tool ?? actual.tool, `toolEvidence[${index}].tool`, { max: 160 });
    if (requestedTool !== actual.tool) fail('TOOL_EVIDENCE_MISMATCH', { toolCallId, expected: actual.tool, actual: requestedTool });
    if (item.resultFingerprint != null && item.resultFingerprint !== actual.resultFingerprint) {
      fail('TOOL_RESULT_FINGERPRINT_MISMATCH', {
        toolCallId,
        expected: actual.resultFingerprint,
        actual: item.resultFingerprint
      });
    }
    return actual;
  }).sort((a, b) => a.toolCallId.localeCompare(b.toolCallId));
  if (new Set(evidence.map(item => item.toolCallId)).size !== evidence.length) fail('TOOL_EVIDENCE_DUPLICATE');
  return evidence;
}

function decisionFingerprintPayload(decision) {
  return {
    schema: decision.schema,
    version: decision.version,
    decisionType: decision.decisionType,
    sourceRequest: decision.sourceRequest,
    groundedContextFingerprint: decision.groundedContextFingerprint,
    toolEvidence: decision.toolEvidence,
    targets: decision.targets,
    rationale: decision.rationale,
    assumptions: decision.assumptions,
    planCandidate: decision.planCandidate,
    unresolvedEvidence: decision.unresolvedEvidence,
    unsupportedEvidence: decision.unsupportedEvidence
  };
}

export function normalizeGroundedCreativeDecision(raw, {
  expectedRequest = null,
  trustedGroundedContextFingerprint = null,
  trustedToolResults = []
} = {}) {
  if (!record(raw)) fail('DECISION_INVALID');
  if (raw.schema !== GROUNDED_CREATIVE_DECISION_SCHEMA) fail('SCHEMA_UNSUPPORTED', { schema: raw.schema ?? null });
  if (Number(raw.version) !== GROUNDED_CREATIVE_DECISION_VERSION) fail('VERSION_UNSUPPORTED', { version: raw.version ?? null });

  const decisionType = boundedText(raw.decisionType, 'decisionType', { max: 80 });
  if (!GROUNDED_CREATIVE_DECISION_TYPES.includes(decisionType)) fail('DECISION_TYPE_UNSUPPORTED', { decisionType });
  const sourceRequest = normalizeSourceRequest(raw.sourceRequest);
  if (expectedRequest?.requestId && sourceRequest.requestId !== expectedRequest.requestId) {
    fail('STALE_REQUEST', { expected: expectedRequest.requestId, actual: sourceRequest.requestId });
  }
  if (expectedRequest?.sessionId && sourceRequest.sessionId !== expectedRequest.sessionId) {
    fail('STALE_SESSION', { expected: expectedRequest.sessionId, actual: sourceRequest.sessionId });
  }

  const groundedContextFingerprint = boundedText(
    raw.groundedContextFingerprint,
    'groundedContextFingerprint',
    { max: 220 }
  );
  if (trustedGroundedContextFingerprint && groundedContextFingerprint !== trustedGroundedContextFingerprint) {
    fail('GROUNDED_CONTEXT_FINGERPRINT_MISMATCH', {
      expected: trustedGroundedContextFingerprint,
      actual: groundedContextFingerprint
    });
  }

  const decision = {
    schema: GROUNDED_CREATIVE_DECISION_SCHEMA,
    version: GROUNDED_CREATIVE_DECISION_VERSION,
    decisionType,
    sourceRequest,
    groundedContextFingerprint,
    toolEvidence: normalizeToolEvidence(raw.toolEvidence, trustedToolResults),
    targets: normalizeTargets(raw.targets),
    rationale: boundedText(raw.rationale, 'rationale', { required: false, max: 2000 }),
    assumptions: boundedStringList(raw.assumptions, 'assumptions'),
    planCandidate: raw.planCandidate == null ? null : canonicalJson(raw.planCandidate, 'planCandidate', 128 * 1024),
    unresolvedEvidence: boundedEvidenceList(raw.unresolvedEvidence, 'unresolvedEvidence'),
    unsupportedEvidence: boundedEvidenceList(raw.unsupportedEvidence, 'unsupportedEvidence')
  };

  if (decisionType === 'PLAN_PROPOSAL') {
    if (!decision.planCandidate) fail('PLAN_CANDIDATE_REQUIRED');
    if (!decision.toolEvidence.length) fail('TOOL_EVIDENCE_REQUIRED');
    if (!decision.targets.length) fail('TARGETS_REQUIRED');
  } else if (decision.planCandidate != null) {
    fail('PLAN_CANDIDATE_NOT_ALLOWED', { decisionType });
  }

  decision.fingerprint = chatStateFingerprint(decisionFingerprintPayload(decision));
  if (own(raw, 'fingerprint') && raw.fingerprint !== decision.fingerprint) {
    fail('FINGERPRINT_MISMATCH', { expected: decision.fingerprint, actual: raw.fingerprint });
  }
  return decision;
}

function assertCandidateTargetsGrounded(plan, groundedTargets) {
  const grounded = new Set(groundedTargets.map(targetKey));
  for (const [stepIndex, step] of (plan?.steps || []).entries()) {
    for (const target of step?.targets || []) {
      if (!grounded.has(targetKey(target))) {
        fail('PLAN_TARGET_UNGROUNDED', { stepIndex, objectId: target?.objectId ?? null });
      }
    }
  }
}

function bridgeMetadata(decision) {
  return {
    decisionFingerprint: decision.fingerprint,
    sourceRequest: clone(decision.sourceRequest),
    groundedContextFingerprint: decision.groundedContextFingerprint,
    toolEvidence: clone(decision.toolEvidence),
    targets: clone(decision.targets),
    rationale: decision.rationale,
    assumptions: clone(decision.assumptions),
    unresolvedEvidence: clone(decision.unresolvedEvidence),
    unsupportedEvidence: clone(decision.unsupportedEvidence)
  };
}

export function createGroundedCreativePlanProposal(app, rawDecision, trust = {}) {
  const decision = normalizeGroundedCreativeDecision(rawDecision, trust);
  const metadata = bridgeMetadata(decision);
  if (decision.decisionType !== 'PLAN_PROPOSAL') {
    return {
      schema: GROUNDED_CREATIVE_PLAN_BRIDGE_SCHEMA,
      version: GROUNDED_CREATIVE_PLAN_BRIDGE_VERSION,
      status: decision.decisionType,
      decision,
      proposal: null,
      validation: null,
      metadata
    };
  }
  if (!app) fail('APP_REQUIRED');
  if (!app.chatCreativePlan?.propose) fail('PLAN_CONTROLLER_REQUIRED');
  if (!decision.planCandidate?.source) fail('PLAN_SOURCE_REQUIRED');
  assertCandidateTargetsGrounded(decision.planCandidate, decision.targets);

  const { plan, validation } = createChatCreativePlanProposal(app, decision.planCandidate);
  const proposal = app.chatCreativePlan.propose(plan);
  if (proposal.status !== 'PROPOSED' || proposal.approved !== false || proposal.approvalToken !== null) {
    fail('APPROVAL_BOUNDARY_VIOLATION');
  }

  return {
    schema: GROUNDED_CREATIVE_PLAN_BRIDGE_SCHEMA,
    version: GROUNDED_CREATIVE_PLAN_BRIDGE_VERSION,
    status: 'PROPOSED',
    decision,
    proposal: clone(proposal),
    validation: clone(validation),
    metadata
  };
}

export function extractGroundedCreativeDecision(response) {
  if (record(response?.groundedDecision)) return clone(response.groundedDecision);
  const content = typeof response === 'string' ? response : response?.content;
  if (typeof content !== 'string') return null;
  const text = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!text.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed?.schema === GROUNDED_CREATIVE_DECISION_SCHEMA ? parsed : null;
  } catch {
    return null;
  }
}
