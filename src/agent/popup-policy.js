export const publicOrigin = "https://thedoorw.github.io";
export const siteOrigin = "https://ink-direct-bridge-test.thedoorw.chatgpt.site";
// Binding is anchored in generated build-identity.js, not a self-hashed module.
export const buildId = typeof globalThis.INK_BUILD_ID === "string" && /^src-[a-f0-9]{24}$/.test(globalThis.INK_BUILD_ID)
  ? globalThis.INK_BUILD_ID : null;
export const sourceSha = "5d3c12831b6c91fa13366fd770f10f12f9e35f4f";
// G2 is a bounded test: circle proposal, owner-approved execution, one History undo.
export const readOnlyScope = Object.freeze(["get_ink_context"]);
export const scope = Object.freeze([
  "approve_ink_edit", "execute_ink_edit", "get_ink_context",
  "get_ink_history", "propose_ink_edit", "undo_ink"
]);
export const sameScope = (a,b) => Array.isArray(a) && a.length === b.length && b.every((v,i) => a[i] === v);
export const popupLifetime = 120_000;
const noncePattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const idPattern = /^[A-Za-z0-9_.:-]{1,160}$/;
const shaPattern = /^[a-f0-9]{40}$/i;
const safeId = value => typeof value === "string" && idPattern.test(value);
const plain = value => !!value && typeof value === "object" && !Array.isArray(value);
const only = (value, keys) => plain(value) && Object.keys(value).every(key => keys.includes(key));
const finite = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const token = (v, proposalId) => typeof v === "string" && typeof proposalId === "string"
  && v.startsWith(`INK-LOCAL-APPROVAL:${proposalId}:`)
  && /^[1-9][0-9]{0,15}$/.test(v.slice(`INK-LOCAL-APPROVAL:${proposalId}:`.length));
const validRef = ref => plain(ref) && safeId(ref.objectId)
  && (ref.pageId == null || safeId(ref.pageId))
  && (ref.layerId == null || safeId(ref.layerId));
const safeRefs = refs => Array.isArray(refs) && refs.length <= 8 && refs.every(validRef)
  ? refs.map(ref => ({pageId:ref.pageId ?? null,layerId:ref.layerId ?? null,objectId:ref.objectId})) : [];

export const validNonce = value => typeof value === "string" && noncePattern.test(value);
export function fromPeer(event, origin, peer, kind, ports = 0) {
  return !!peer && event.origin === origin && event.source === peer
    && event.data?.kind === kind && event.ports?.length === ports;
}
export function validBinding(value, expected = scope) {
  return typeof value?.sessionId === "string" && /^inkrt_[a-f0-9]{48}$/.test(value.sessionId)
    && value.sourceSha === sourceSha && Array.isArray(value.scope)
    && sameScope(value.scope, expected);
}
export function loadedIdentity(location, loadedBuild) {
  return !!buildId && location.origin === publicOrigin && location.pathname === "/INK/" && loadedBuild === buildId;
}
export function validCall(data, challenge, sequence, now, expires, closed) {
  return !closed && now < expires && data?.challenge === challenge && Number.isSafeInteger(data.id)
    && data.id === sequence + 1 && ["pair", "discover", "publishResult", "revoke"].includes(data.method);
}
export function validRequestInput(tool, input) {
  if (tool === "get_ink_context" || tool === "get_ink_history" || tool === "undo_ink") {
    return input == null || (plain(input) && Object.keys(input).length === 0);
  }
  if (tool === "propose_ink_edit") {
    const task = input?.task, args = task?.arguments;
    return only(input, ["task"])
      && only(task, ["taskId", "operation", "targets", "arguments"])
      && safeId(task.taskId) && task.operation === "path.create.v1"
      && Array.isArray(task.targets) && task.targets.length === 0
      && only(args, ["shape", "cx", "cy", "r", "fill"])
      && args.shape === "circle" && finite(args.cx, 0, 1600) && finite(args.cy, 0, 1600)
      && finite(args.r, 1, 200) && typeof args.fill === "string" && /^#[0-9a-fA-F]{6}$/.test(args.fill);
  }
  if (tool === "approve_ink_edit") return only(input, ["proposalId"]) && safeId(input.proposalId);
  if (tool === "execute_ink_edit") return only(input, ["proposalId", "approvalToken"])
    && safeId(input.proposalId) && token(input.approvalToken,input.proposalId);
  return false;
}
export function validDelivery(delivery, sessionId, now, allowed = scope) {
  const r = delivery?.request;
  return typeof r?.requestId === "string" && /^[A-Za-z0-9_.:-]{1,120}$/.test(r.requestId)
    && typeof delivery?.observedRequestBlobSha === "string"
    && shaPattern.test(delivery.observedRequestBlobSha)
    && r.schema === "INK-RUNTIME-REQUEST" && r.version === 1
    && r.sessionId === sessionId && r.expectedSourceSha === sourceSha
    && allowed.includes(r.tool) && validRequestInput(r.tool, r.input)
    && Number.isFinite(Date.parse(r.expiresAt)) && Date.parse(r.expiresAt) > now;
}
function historySummary(value) {
  if (!plain(value)) return null;
  const {applied,retainedCount,canUndo,canRedo,pending} = value;
  if (!Number.isSafeInteger(applied) || applied < 0 || !Number.isSafeInteger(retainedCount) || retainedCount < 0
    || typeof canUndo !== "boolean" || typeof canRedo !== "boolean") return null;
  return {applied,retainedCount,canUndo,canRedo,pending:pending === true};
}
export function projectResult(value, delivery, sessionId, now, allowed = scope) {
  if (!validDelivery(delivery, sessionId, now, allowed) || value?.sessionId !== sessionId
    || value.sourceSha !== sourceSha || value.tool !== delivery.request.tool
    || value.requestId !== delivery.request.requestId || value.observedRequestBlobSha !== delivery.observedRequestBlobSha
    || value.schema !== "INK-RUNTIME-RESULT" || value.version !== 1 || value.bridgeVersion !== "1.0.0"
    || !Number.isFinite(Date.parse(value.completedAt))) return null;
  const {schema,version,bridgeVersion,sessionId:id,sourceSha:source,tool,requestId,
    observedRequestBlobSha,completedAt,status} = value;
  const safe = {schema,version,bridgeVersion,sessionId:id,sourceSha:source,tool,requestId,
    observedRequestBlobSha,completedAt,status};
  // The first owner-consent receipt is nonterminal. Keep the delivery binding until resolved.
  if (status === "WAITING_CONSENT") {
    return (tool === "approve_ink_edit" || tool === "undo_ink") && value.agentResult == null ? safe : null;
  }
  if (status === "REJECTED" || status === "AGENT_REJECTED") return safe;
  if (status !== "COMPLETED") return null;
  const r = value.agentResult;
  const expected = {
    get_ink_context:["context","COMPLETED"],
    propose_ink_edit:["edit.propose","PROPOSED"],
    approve_ink_edit:["edit.approve","APPROVED"],
    execute_ink_edit:["edit.execute","EXECUTED"],
    get_ink_history:["history.inspect","COMPLETED"],
    undo_ink:["history.undo",null]
  }[tool];
  if (!expected || r?.schema !== "INK_AGENT_RESULT" || r.version !== 1
    || r.action !== expected[0] || (expected[1] ? r.status !== expected[1] : !["COMPLETED","NO_OP"].includes(r.status))
    || !safeId(r.documentId) || (r.pageId != null && !safeId(r.pageId))
    || (r.revisionId != null && !safeId(r.revisionId))) return null;
  const result = {schema:r.schema,version:r.version,action:r.action,status:r.status,
    documentId:r.documentId,pageId:r.pageId ?? null,revisionId:r.revisionId ?? null};
  const inner = r.result?.result;
  if (tool === "propose_ink_edit") {
    if (!safeId(inner?.proposalId)) return null;
    result.result = {proposalId:inner.proposalId};
  } else if (tool === "approve_ink_edit") {
    if (!safeId(inner?.proposalId) || inner.proposalId !== delivery.request.input.proposalId
      || !token(inner.approvalToken, inner.proposalId)) return null;
    result.result = {proposalId:inner.proposalId,approvalToken:inner.approvalToken};
  } else if (tool === "execute_ink_edit") {
    // Native edit.execute: the normalized Native changedRefs are authoritative.
    const refs = safeRefs(r.changedRefs);
    if (inner?.proposalId !== delivery.request.input.proposalId
      || inner.operation !== "path.create.v1" || inner.changed !== true
      || !Array.isArray(r.changedRefs) || r.changedRefs.length !== 1 || refs.length !== 1) return null;
    result.createdRefs = refs;
    result.result = {proposalId:inner.proposalId,objectId:refs[0].objectId};
  } else if (tool === "get_ink_history") {
    const history = historySummary(r.result);
    if (!history) return null;
    result.result = history;
  } else if (tool === "undo_ink") {
    const before = historySummary(r.historyReceipt?.before);
    const after = historySummary(r.historyReceipt?.after);
    if (!before || !after || typeof r.historyReceipt?.applied !== "boolean"
      || r.historyReceipt.applied !== (r.status === "COMPLETED")) return null;
    result.result = {applied:r.historyReceipt.applied,before,after};
  }
  return {...safe,agentResult:result};
}
