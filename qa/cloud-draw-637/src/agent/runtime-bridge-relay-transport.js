import { INK_RUNTIME_PROTOCOL_VERSION, runtimeProtocolError } from './runtime-bridge-protocol.js';

function normalizeBaseUrl(value) {
  const url = new URL(String(value || ''));
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw runtimeProtocolError('INK_RUNTIME_RELAY_TLS_REQUIRED');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

async function parseResponse(response) {
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); }
    catch { throw runtimeProtocolError('INK_RUNTIME_RELAY_RESPONSE_INVALID'); }
  }
  if (!response.ok) {
    throw runtimeProtocolError(body?.code || 'INK_RUNTIME_RELAY_REQUEST_FAILED', {
      status: response.status
    });
  }
  return body;
}

function sameBinding(a, b) {
  return Boolean(a && b
    && a.sessionId === b.sessionId
    && a.sourceSha === b.sourceSha
    && JSON.stringify(a.scope || []) === JSON.stringify(b.scope || []));
}

export function createRuntimeBridgeRelayTransport({
  baseUrl,
  fetchImpl = globalThis.fetch,
  pairingChallengeHandler = null
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Runtime relay transport requires fetch');
  const relayUrl = normalizeBaseUrl(baseUrl);
  let capability = null;
  let pairing = null;
  let pendingChallenge = null;
  let disposed = false;
  let generation = 0;
  let pairInFlight = false;
  let challengeInFlight = false;

  const rawRequest = async (path, options = {}) => {
    const response = await fetchImpl(relayUrl + path, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      ...options
    });
    return parseResponse(response);
  };

  const authenticatedHeaders = (cap, extra = {}) => ({
    Accept: 'application/json',
    ...(cap ? { Authorization: 'INKBridge ' + cap } : {}),
    ...extra
  });

  const request = async (path, options = {}) => {
    if (disposed) throw runtimeProtocolError('INK_RUNTIME_TRANSPORT_DISPOSED');
    return rawRequest(path, options);
  };

  const revokeChallenge = async challenge => {
    if (!challenge) return;
    try {
      await rawRequest('/v1/pair/challenge/revoke', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-INK-Pairing-Intent': 'explicit'
        },
        body: JSON.stringify({
          authorization: {
            challengeId: challenge.challengeId,
            challengeProof: challenge.challengeProof
          }
        })
      });
    } catch {}
  };

  const revokeIssuedCapability = async (cap, pair, reason) => {
    if (!cap || !pair) return;
    try {
      await rawRequest('/v1/revoke', {
        method: 'POST',
        headers: authenticatedHeaders(cap, {
          'Content-Type': 'application/json',
          'X-INK-Session-Id': pair.sessionId
        }),
        body: JSON.stringify({ reason: String(reason || 'superseded-pair').slice(0, 120) })
      });
    } catch {}
  };

  const transport = {
    async requestPairingChallenge(info) {
      if (disposed) throw runtimeProtocolError('INK_RUNTIME_TRANSPORT_DISPOSED');
      if (capability || pairing) throw runtimeProtocolError('INK_RUNTIME_PAIR_ALREADY_ACTIVE');
      if (pairInFlight || challengeInFlight) throw runtimeProtocolError('INK_RUNTIME_PAIR_IN_PROGRESS');
      challengeInFlight = true;
      const binding = {
        sessionId: info?.sessionId,
        sourceSha: info?.sourceSha,
        scope: Array.isArray(info?.scope) ? [...info.scope] : []
      };
      try {
        if (pendingChallenge && sameBinding(pendingChallenge.binding, binding)) {
          return {
            challengeId: pendingChallenge.challengeId,
            expiresAt: pendingChallenge.expiresAt,
            binding: { ...pendingChallenge.binding, scope: [...pendingChallenge.binding.scope] }
          };
        }
        if (pendingChallenge) await revokeChallenge(pendingChallenge);
        const localGeneration = generation;
        const body = await request('/v1/pair/challenge', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-INK-Pairing-Intent': 'explicit'
        },
        body: JSON.stringify({
          schema: 'INK-RUNTIME-PAIR',
          version: INK_RUNTIME_PROTOCOL_VERSION,
          ...binding
        })
      });
        if (disposed || generation !== localGeneration) {
          if (body?.challengeId && body?.challengeProof) {
            await revokeChallenge({
              challengeId: body.challengeId,
              challengeProof: body.challengeProof
            });
          }
          throw runtimeProtocolError('INK_RUNTIME_PAIR_CANCELLED');
        }
        if (typeof body?.challengeId !== 'string'
          || typeof body?.challengeProof !== 'string'
          || typeof body?.expiresAt !== 'string') {
          throw runtimeProtocolError('INK_RUNTIME_PAIR_CHALLENGE_INVALID');
        }
        pendingChallenge = {
          challengeId: body.challengeId,
          challengeProof: body.challengeProof,
          expiresAt: body.expiresAt,
          binding
        };
        const safe = {
          challengeId: body.challengeId,
          expiresAt: body.expiresAt,
          binding: { ...binding, scope: [...binding.scope] }
        };
        if (typeof pairingChallengeHandler === 'function') {
          await pairingChallengeHandler(safe);
        }
        return safe;
      } finally {
        challengeInFlight = false;
      }
    },

    async pair(info) {
      if (disposed) throw runtimeProtocolError('INK_RUNTIME_TRANSPORT_DISPOSED');
      if (capability || pairing) throw runtimeProtocolError('INK_RUNTIME_PAIR_ALREADY_ACTIVE');
      if (pairInFlight || challengeInFlight) throw runtimeProtocolError('INK_RUNTIME_PAIR_IN_PROGRESS');
      const localGeneration = generation;
      const binding = {
        sessionId: info?.sessionId,
        sourceSha: info?.sourceSha,
        scope: Array.isArray(info?.scope) ? [...info.scope] : []
      };
      if (!pendingChallenge || !sameBinding(pendingChallenge.binding, binding)) {
        await transport.requestPairingChallenge(binding);
        if (typeof pairingChallengeHandler !== 'function') {
          throw runtimeProtocolError('INK_RUNTIME_OPERATOR_AUTH_REQUIRED');
        }
      }
      pairInFlight = true;
      try {
        const challenge = pendingChallenge;
        if (!challenge || !sameBinding(challenge.binding, binding)) {
          throw runtimeProtocolError('INK_RUNTIME_OPERATOR_AUTH_REQUIRED');
        }

        const body = await request('/v1/pair', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-INK-Pairing-Intent': 'explicit'
          },
          body: JSON.stringify({
            schema: 'INK-RUNTIME-PAIR',
            version: INK_RUNTIME_PROTOCOL_VERSION,
            ...binding,
            authorization: {
              challengeId: challenge.challengeId,
              challengeProof: challenge.challengeProof
            }
          })
        });

        if (body?.paired !== true || typeof body?.capability !== 'string' || body.capability.length < 32) {
          throw runtimeProtocolError('INK_RUNTIME_PAIR_FAILED');
        }

        const issuedPairing = {
          sessionId: binding.sessionId,
          sourceSha: binding.sourceSha,
          scope: [...binding.scope],
          expiresAt: body.expiresAt || null
        };

        if (disposed || generation !== localGeneration) {
          await revokeIssuedCapability(body.capability, issuedPairing, 'stale-pair-completion');
          pendingChallenge = null;
          throw runtimeProtocolError('INK_RUNTIME_PAIR_CANCELLED');
        }

        capability = body.capability;
        pairing = issuedPairing;
        pendingChallenge = null;
        return {
          paired: true,
          sessionId: pairing.sessionId,
          sourceSha: pairing.sourceSha,
          scope: [...pairing.scope],
          expiresAt: pairing.expiresAt
        };
      } finally {
        pairInFlight = false;
      }
    },

    async discover() {
      if (disposed) throw runtimeProtocolError('INK_RUNTIME_TRANSPORT_DISPOSED');
      if (!capability || !pairing) throw runtimeProtocolError('INK_RUNTIME_PAIR_REQUIRED');
      const localGeneration = generation;
      const localCapability = capability;
      const localPairing = pairing;
      const body = await request('/v1/request', {
        method: 'GET',
        headers: authenticatedHeaders(localCapability, {
          'X-INK-Session-Id': localPairing.sessionId
        })
      });
      if (disposed || generation !== localGeneration || capability !== localCapability || pairing !== localPairing) {
        throw runtimeProtocolError('INK_RUNTIME_DISCOVERY_CANCELLED');
      }
      if (body == null || body.pending === false) return null;
      if (!body.request || typeof body.observedRequestBlobSha !== 'string') {
        throw runtimeProtocolError('INK_RUNTIME_RELAY_RESPONSE_INVALID');
      }
      return {
        request: body.request,
        observedRequestBlobSha: body.observedRequestBlobSha
      };
    },

    async publishResult(result) {
      if (disposed) throw runtimeProtocolError('INK_RUNTIME_TRANSPORT_DISPOSED');
      if (!capability || !pairing) throw runtimeProtocolError('INK_RUNTIME_PAIR_REQUIRED');
      const localGeneration = generation;
      const localCapability = capability;
      const localPairing = pairing;
      const body = await request('/v1/result', {
        method: 'POST',
        headers: authenticatedHeaders(localCapability, {
          'Content-Type': 'application/json',
          'X-INK-Session-Id': localPairing.sessionId
        }),
        body: JSON.stringify(result)
      });
      if (disposed || generation !== localGeneration || capability !== localCapability || pairing !== localPairing) {
        throw runtimeProtocolError('INK_RUNTIME_RESULT_RECEIPT_CANCELLED');
      }
      return {
        published: body?.published === true,
        resultBlobSha: body?.resultBlobSha || null
      };
    },

    async revoke({ reason = 'user-revoked' } = {}) {
      generation++;
      const oldCapability = capability;
      const oldPairing = pairing;
      const challenge = pendingChallenge;
      capability = null;
      pairing = null;
      pendingChallenge = null;
      await Promise.allSettled([
        revokeIssuedCapability(oldCapability, oldPairing, reason),
        revokeChallenge(challenge)
      ]);
      return { revoked: true };
    },

    status() {
      return {
        kind: 'github-app-relay',
        baseUrl: relayUrl,
        paired: Boolean(capability && pairing),
        sessionId: pairing?.sessionId || null,
        sourceSha: pairing?.sourceSha || null,
        expiresAt: pairing?.expiresAt || null,
        pairingChallengePending: Boolean(pendingChallenge),
        pairInFlight: pairInFlight || challengeInFlight
      };
    },

    async dispose() {
      if (disposed) return;
      await transport.revoke({ reason: 'disposed' });
      disposed = true;
      generation++;
    }
  };

  return Object.freeze(transport);
}
