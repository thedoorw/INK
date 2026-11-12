export const publicOrigin = "https://thedoorw.github.io";
export const siteOrigin = "https://ink-direct-bridge-test.thedoorw.chatgpt.site";
// Binding is anchored in the generated build-identity.js, not in a self-hashed source module.
export const buildId = typeof globalThis.INK_BUILD_ID === "string" && /^src-[a-f0-9]{24}$/.test(globalThis.INK_BUILD_ID)
  ? globalThis.INK_BUILD_ID : null;
export const sourceSha = "5d3c12831b6c91fa13366fd770f10f12f9e35f4f";
export const scope = Object.freeze(["get_ink_context"]);
export const popupLifetime = 120_000;
const noncePattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
export const validNonce = value => typeof value === "string" && noncePattern.test(value);
export function fromPeer(event, origin, peer, kind, ports = 0) {
  return !!peer && event.origin === origin && event.source === peer
    && event.data?.kind === kind && event.ports?.length === ports;
}
export function validBinding(value) {
  return typeof value?.sessionId === "string" && /^inkrt_[a-f0-9]{48}$/.test(value.sessionId)
    && value.sourceSha === sourceSha && Array.isArray(value.scope)
    && value.scope.length === 1 && value.scope[0] === scope[0];
}
export function loadedIdentity(location, loadedBuild) {
  return !!buildId && location.origin === publicOrigin && location.pathname === "/INK/" && loadedBuild === buildId;
}
export function validCall(data, challenge, sequence, now, expires, closed) {
  return !closed && now < expires && data?.challenge === challenge && Number.isSafeInteger(data.id)
    && data.id === sequence + 1 && ["pair", "discover", "publishResult", "revoke"].includes(data.method);
}
export function validDelivery(delivery, sessionId, now) {
  const r = delivery?.request;
  return typeof r?.requestId === "string" && /^[A-Za-z0-9_.:-]{1,120}$/.test(r.requestId)
    && typeof delivery?.observedRequestBlobSha === "string"
    && /^[a-f0-9]{40}$/i.test(delivery.observedRequestBlobSha)
    && r.schema === "INK-RUNTIME-REQUEST" && r.version === 1
    && r.sessionId === sessionId
    && r.expectedSourceSha === sourceSha && r.tool === scope[0]
    && Number.isFinite(Date.parse(r.expiresAt)) && Date.parse(r.expiresAt) > now;
}
export function projectResult(value, delivery, sessionId, now) {
  if (!validDelivery(delivery, sessionId, now) || value?.sessionId !== sessionId
    || value.sourceSha !== sourceSha || value.tool !== scope[0]
    || value.requestId !== delivery.request.requestId || value.observedRequestBlobSha !== delivery.observedRequestBlobSha
    || value.schema !== "INK-RUNTIME-RESULT" || value.version !== 1 || value.bridgeVersion !== "1.0.0"
    || !Number.isFinite(Date.parse(value.completedAt))) return null;
  const { schema, version, bridgeVersion, sessionId: id, sourceSha: source, tool, requestId,
    observedRequestBlobSha, completedAt, status } = value;
  const safe = {schema, version, bridgeVersion, sessionId:id, sourceSha:source, tool, requestId,
    observedRequestBlobSha, completedAt, status};
  if (status === "REJECTED" || status === "AGENT_REJECTED") return safe;
  const r = value.agentResult;
  const validId = v => typeof v === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(v);
  if (status !== "COMPLETED" || r?.schema !== "INK_AGENT_RESULT" || r.version !== 1 || r.action !== "context"
    || r.status !== "COMPLETED" || !validId(r.documentId)) return null;
  return {...safe, agentResult:{schema:r.schema, version:r.version, action:r.action, status:r.status, documentId:r.documentId,
    pageId:validId(r.pageId)?r.pageId:null, revisionId:validId(r.revisionId)?r.revisionId:null}};
}
