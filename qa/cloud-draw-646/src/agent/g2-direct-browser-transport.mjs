import {stableJson} from './runtime-bridge-protocol.js';
/* #604 Private reference only; NOT installed in Product. No popup, no IndexedDB writes.
   The caller MUST fetch trusted owner-initiated offers AND redeem one through the
   authenticated Presence closure; Relay validates the SAME enrolled device.
   Possession of a long-lived Presence bearer alone MUST NOT authorize G2 writes. */
import {validDelivery, projectResult} from './popup-policy.js';

export const RELAY_ORIGIN = 'https://ink-604-https-cors-poc-qa.up.railway.app';
export const PUBLIC_ORIGIN = 'https://thedoorw.github.io';
export const PUBLIC_PATH = '/INK/';
export const G2_ROUTE = '/bridge-presence/v1/browser/g2/';
export const SOURCE_SHA = '5d3c12831b6c91fa13366fd770f10f12f9e35f4f';
export const G2_SCOPE = Object.freeze([
  'approve_ink_edit', 'execute_ink_edit', 'get_ink_context',
  'get_ink_history', 'propose_ink_edit', 'redo_ink', 'undo_ink'
]);
const SESSION_TTL_MS = 120_000;
const RENEW_WINDOW_MS = 30_000;
const hex24 = /^[0-9a-f]{24}$/;
const hex64 = /^[0-9a-f]{64}$/;
const runtimeId = /^inkrt_[0-9a-f]{48}$/;
const buildId = /^src-[0-9a-f]{24}$/;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
const sameScope = scope => Array.isArray(scope) && scope.length === G2_SCOPE.length
  && scope.every((value, index) => value === G2_SCOPE[index]);
function checkResponse(json) {
  return !!json && typeof json === 'object' && !Array.isArray(json);
}

export function createG2DirectBrowserTransport({
  fetchImpl = globalThis.fetch,
  getTrustedOffer,
  pairThroughPresence,
  targetGuard,
  getRuntime = () => ({
    buildId: globalThis.INK_BUILD_ID,
    ready: !!globalThis.INK_APP && globalThis.INK_ARCHITECTURE?.buildId === globalThis.INK_BUILD_ID
  }),
  locationObject = globalThis.location,
  verifyExpiredLease = false,
  isForeground = () => globalThis.document?.visibilityState === 'visible',
  now = () => Date.now()
} = {}) {
  if (typeof fetchImpl !== 'function' || typeof getTrustedOffer !== 'function'
      || typeof pairThroughPresence !== 'function' || !targetGuard || typeof targetGuard.capture !== 'function'
      || typeof targetGuard.matches !== 'function'
      || typeof targetGuard.permits !== 'function'
      || typeof targetGuard.record !== 'function'
      || typeof targetGuard.reset !== 'function')
    throw fail('G2_TRANSPORT_DEPENDENCY_REQUIRED');

  let capability = null, session = null, delivery = null, disposed = false, pairing = false;

  const checkOrigin = () => {
    if (locationObject?.origin !== PUBLIC_ORIGIN || locationObject?.pathname !== PUBLIC_PATH)
      throw fail('G2_ORIGIN_DENIED');
  };
  const checkReady = () => {
    checkOrigin();
    const runtime = getRuntime();
    if (!runtime?.ready || !buildId.test(runtime.buildId || ''))
      throw fail('G2_RUNTIME_NOT_READY');
    return runtime.buildId;
  };
  const wipe = () => { capability = session = delivery = null; targetGuard.reset(); };

  async function request(action, body, cap = null) {
    const response = await fetchImpl(RELAY_ORIGIN + G2_ROUTE + action, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        ...(cap ? {Authorization: 'Bearer ' + cap} : {})
      },
      body: JSON.stringify(body),
      signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(8_000) : undefined
    });
    if (!response?.ok) throw fail('G2_SITE_HTTP_' + (response?.status ?? 'NETWORK'));
    const value = await response.json();
    if (!checkResponse(value)) throw fail('G2_SITE_INVALID_RESPONSE');
    return value;
  }

  function ensurePaired(info = null, allowExpired = false) {
    if (disposed) throw fail('G2_TRANSPORT_DISPOSED');
    const actualBuild = checkReady();
    if (!session || !capability) throw fail('G2_SESSION_REQUIRED');
    if (session.buildId !== actualBuild || !targetGuard.matches()) {
      throw fail('G2_TARGET_CHANGED');
    }
    if (!allowExpired && session.expiresAt <= now()) throw fail('G2_SESSION_EXPIRED');
    if (info && (info.sessionId !== session.sessionId ||
        info.sourceSha !== SOURCE_SHA || !sameScope(info.scope))) throw fail('G2_SESSION_MISMATCH');
    return session;
  }

  return Object.freeze({
    async pair(info) {
      if (disposed) throw fail('G2_TRANSPORT_DISPOSED');
      if (pairing || session) throw fail('G2_PAIR_ALREADY_ACTIVE');
      const actualBuild = checkReady();
      if (!runtimeId.test(info?.sessionId || '') || info?.sourceSha !== SOURCE_SHA
          || !sameScope(info?.scope)) throw fail('G2_PAIR_BINDING_DENIED');
      const target = targetGuard.capture();
      if (!target?.sessionId || !target?.documentId || !target?.pageId
          || !Number.isSafeInteger(target.generation))
        throw fail('G2_DISPOSABLE_TARGET_REQUIRED');
      pairing = true;
      try {
        // The Site must deliver this only for a verified owner CHAT intent and the
        // existing enrolled browser instance. No arbitrary URL or ownerId accepted.
        const offer = await getTrustedOffer();
        if (offer?.status !== 'G2_OFFER' || !hex24.test(offer.offerId || '')
            || !hex24.test(offer.instanceId || '') || offer.buildId !== actualBuild
            || offer.sourceSha !== SOURCE_SHA
            || !Number.isSafeInteger(offer.expiresAt) || offer.expiresAt <= now())
          throw fail('G2_OWNER_OFFER_REQUIRED');
        // Redeem only through the existing Presence device-authenticated closure;
        // no public unauthenticated offerId->write-capability conversion.
        if (!targetGuard.matches()) throw fail('G2_TARGET_CHANGED');
        const result = await pairThroughPresence({
          offerId: offer.offerId, instanceId: offer.instanceId,
          sessionId: info.sessionId, buildId: actualBuild,
          sourceSha: SOURCE_SHA, scope: [...G2_SCOPE],
          documentId: target.documentId, pageId: target.pageId,
          documentGeneration: target.generation
        });
        if (result.status !== 'G2_PAIRED' || !hex64.test(result.capability || '')
            || result.sessionId !== info.sessionId
            || result.instanceId !== offer.instanceId
            || result.buildId !== actualBuild || result.sourceSha !== SOURCE_SHA
            || result.documentId !== target.documentId
            || result.pageId !== target.pageId
            || !Number.isSafeInteger(result.expiresAt)
            || result.expiresAt <= now() || result.expiresAt > now() + SESSION_TTL_MS)
          throw fail('G2_PAIR_RECEIPT_INVALID');
        if (disposed || !targetGuard.matches()) {
          try { await request('revoke', {sessionId:info.sessionId}, result.capability); } catch {}
          throw fail('G2_TARGET_CHANGED');
        }
        capability = result.capability; // in-memory only, NOT IndexedDB/localStorage
        session = Object.freeze({
          sessionId: info.sessionId, buildId: actualBuild,
          sourceSha: SOURCE_SHA, scope: [...G2_SCOPE], expiresAt: result.expiresAt,
          documentId: target.documentId, pageId: target.pageId
        });
        return {paired: true, sessionId: session.sessionId,
          sourceSha: SOURCE_SHA, scope: [...G2_SCOPE]};
      } catch (error) {
        targetGuard.reset();
        throw error;
      } finally {
        pairing = false;
      }
    },
    async discover(info) {
      const paired = ensurePaired(info, verifyExpiredLease);
      if (verifyExpiredLease && paired.expiresAt <= now()) {
        const proof = await request('discover', {sessionId:paired.sessionId,expiryCheck:true}, capability);
        if (ensurePaired(info, true) !== paired) throw fail('G2_SESSION_MISMATCH');
        if (proof.status === 'G2_LEASE_ELAPSED') throw fail('G2_LEASE_CONFIRMED_EXPIRED');
        // The acknowledgement for the previous renewal may have been lost.
        if (proof.status !== 'G2_LEASE_ACTIVE' || !Number.isSafeInteger(proof.expiresAt)
            || proof.expiresAt <= now() || proof.expiresAt > now() + SESSION_TTL_MS)
          throw fail('G2_LEASE_RECEIPT_INVALID');
        session = Object.freeze({...paired, expiresAt:proof.expiresAt});
        return null;
      }
      if (delivery) throw fail('G2_DELIVERY_PENDING');
      const renew = isForeground() && paired.expiresAt - now() <= RENEW_WINDOW_MS;
      const result = await request('discover', {
        sessionId: paired.sessionId,
        ...(renew ? {renew:true} : {})
      }, capability);
      // A response in flight cannot authorize operations after revoke or a target switch.
      if (ensurePaired(info) !== paired) throw fail('G2_SESSION_MISMATCH');
      if (result.status !== 'G2_EMPTY' && result.status !== 'G2_DELIVERY')
        throw fail('G2_DELIVERY_INVALID');
      if (renew) {
        if (!Number.isSafeInteger(result.expiresAt) || result.expiresAt <= paired.expiresAt
            || result.expiresAt > now() + SESSION_TTL_MS)
          throw fail('G2_LEASE_RECEIPT_INVALID');
        session = Object.freeze({...paired, expiresAt:result.expiresAt});
      }
      if (result.status === 'G2_EMPTY') return null;
      if (result.status !== 'G2_DELIVERY'
          || !validDelivery(result.delivery, paired.sessionId, now(), G2_SCOPE))
        throw fail('G2_DELIVERY_INVALID');
      delivery = result.delivery;
      // Existing Runtime Bridge independently validates session/Source SHA and request.
      return delivery;
    },
    authorizes(request) {
      try {
        ensurePaired();
        const pending=delivery?.request;
        return !!pending && pending.requestId===request.requestId
          && pending.tool===request.tool
          && stableJson(pending.input??{})===stableJson(request.input??{})
          && targetGuard.permits(request);
      } catch {return false;}
    },
    async publishResult(value) {
      const paired = ensurePaired();
      if (!delivery || value?.sessionId !== paired.sessionId
          || value.requestId !== delivery.request.requestId)
        throw fail('G2_RESULT_BINDING_DENIED');
      const safe = projectResult(value, delivery, paired.sessionId, now(), G2_SCOPE);
      if (!safe) throw fail('G2_RESULT_PROJECTION_DENIED');
      const result = await request('result', {sessionId: paired.sessionId, result: safe}, capability);
      if (result.status !== 'G2_ACCEPTED') throw fail('G2_RESULT_NOT_ACCEPTED');
      if (ensurePaired() !== paired) throw fail('G2_SESSION_MISMATCH');
      if (safe.agentResult) targetGuard.record(safe.tool, safe.agentResult);
      // Explicit owner consent is two receipts on the SAME delivery.
      if (safe.status !== 'WAITING_CONSENT') delivery = null;
      return result;
    },
    async revoke({sessionId} = {}) {
      if (disposed && !session) return {status:'G2_REVOKED'};
      const cap = capability, id = session?.sessionId;
      wipe();
      // Revoke the actual active Site session even if the caller's hint is stale.
      if (cap) {
        try { await request('revoke', {sessionId:id}, cap); } catch { /* fail closed locally */ }
      }
      if (sessionId && sessionId !== id) throw fail('G2_SESSION_MISMATCH');
      return {status:'G2_REVOKED'};
    },
    status() {
      const targetMatches=!!session && targetGuard.matches() && getRuntime()?.buildId===session.buildId;
      return {status: !targetMatches ? 'G2_SESSION_REQUIRED'
        : session.expiresAt <= now() ? 'G2_SESSION_EXPIRED' : 'G2_PAIRED',
        paired: targetMatches && session.expiresAt > now(), pending: !!delivery};
    },
    dispose() { disposed = true; wipe(); }
  });
}
