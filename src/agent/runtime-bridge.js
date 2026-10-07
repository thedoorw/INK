import {
  INK_RUNTIME_BRIDGE_VERSION,
  INK_RUNTIME_EXPLICIT_CONSENT_TOOLS,
  INK_RUNTIME_MAX_TTL_MS,
  INK_RUNTIME_PROTOCOL_VERSION,
  INK_RUNTIME_TOOL_SCOPE,
  compactRuntimeRejection,
  createRuntimeResult,
  isRuntimeSourceSha,
  normalizeToolScope,
  runtimeProtocolError,
  runtimeRequestFingerprint,
  validateRuntimeRequest
} from './runtime-bridge-protocol.js';

export const INK_RUNTIME_BRIDGE_SCHEMA = 'INK-RUNTIME-BRIDGE';
export const INK_RUNTIME_BRIDGE_API_VERSION = 1;

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const CONSENT_TOOLS = new Set(INK_RUNTIME_EXPLICIT_CONSENT_TOOLS);

function randomSessionId() {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return 'inkrt_' + [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function sourceShaFromDocument() {
  if (typeof document === 'undefined') return null;
  return document.querySelector('meta[name="ink-live-source-sha"]')?.content?.trim()?.toLowerCase() || null;
}

function toolCount(api) {
  try {
    const list = api?.tools?.registry?.();
    return Array.isArray(list) ? list.length : 0;
  } catch {
    return 0;
  }
}

function invokeReady(api) {
  return Boolean(api?.tools && typeof api.tools.invoke === 'function' && typeof api.tools.registry === 'function');
}

function terminalState(record) {
  return [
    'COMPLETED',
    'COMPLETED_AFTER_REVOKE',
    'AGENT_REJECTED',
    'AGENT_REJECTED_AFTER_REVOKE',
    'REJECTED',
    'PUBLISH_FAILED'
  ].includes(record?.state);
}

function approvalReceipt(agentResult) {
  const raw = agentResult?.result?.result;
  const proposalId = raw?.proposalId;
  const approvalToken = raw?.approvalToken;
  if (agentResult?.status === 'APPROVED' && typeof proposalId === 'string' && typeof approvalToken === 'string') {
    return { proposalId, approvalToken };
  }
  return null;
}

function requestActionLabel(tool) {
  return ({
    approve_ink_edit: 'Approve edit proposal',
    undo_ink: 'Undo current History step',
    redo_ink: 'Redo current History step'
  })[tool] || String(tool || 'Request');
}

export class InkRuntimeBridge {
  constructor(app, {
    transport = null,
    enabled = false,
    ledgerCapacity = 64,
    sourceShaReader = sourceShaFromDocument,
    invoke = null,
    registry = null,
    now = () => Date.now()
  } = {}) {
    if (!app) throw new TypeError('INK Runtime Bridge requires app');
    this.app = app;
    this.transport = transport;
    this.enabled = Boolean(enabled);
    this.paired = false;
    this.disposed = false;
    this.sessionId = randomSessionId();
    this.ledgerCapacity = Math.max(1, Math.min(256, Number(ledgerCapacity) || 64));
    this.sourceShaReader = sourceShaReader;
    this.invokeTool = invoke || ((name, input) => this.app?.inkPublicApi?.tools?.invoke?.(name, input));
    this.registry = registry || (() => this.app?.inkPublicApi?.tools?.registry?.() || []);
    this.now = now;
    this.scope = [];
    this.ledger = new Map();
    this.remoteApprovals = new Map();
    this.activeRequestId = null;
    this.last = null;
    this.lifecycleGeneration = 0;
    this.pairInFlight = false;
    this.listeners = new Set();
    this.consentTimers = new Map();
  }

  sourceSha() {
    const value = this.sourceShaReader?.();
    return typeof value === 'string' ? value.trim().toLowerCase() : null;
  }

  ready() {
    return !this.disposed && invokeReady(this.app?.inkPublicApi) && isRuntimeSourceSha(this.sourceSha());
  }

  status() {
    const transportStatus = typeof this.transport?.status === 'function' ? this.transport.status() : null;
    return clone({
      schema: INK_RUNTIME_BRIDGE_SCHEMA,
      version: INK_RUNTIME_BRIDGE_API_VERSION,
      protocolVersion: INK_RUNTIME_PROTOCOL_VERSION,
      bridgeVersion: INK_RUNTIME_BRIDGE_VERSION,
      ready: this.ready(),
      enabled: this.enabled,
      paired: this.paired,
      accepting: this.ready() && this.enabled && this.paired && !this.disposed,
      pairInFlight: this.pairInFlight,
      sessionId: this.sessionId,
      sourceSha: this.sourceSha(),
      publicApi: {
        schema: this.app?.inkPublicApi?.schema || null,
        version: this.app?.inkPublicApi?.version ?? null,
        toolCount: toolCount(this.app?.inkPublicApi)
      },
      scope: [...this.scope],
      activeRequestId: this.activeRequestId,
      pendingConsentRequestId: this.pendingConsent()?.requestId || null,
      ledger: {
        size: this.ledger.size,
        capacity: this.ledgerCapacity
      },
      lastRequestId: this.last?.requestId || null,
      lastTerminalState: this.last?.state || null,
      transport: transportStatus ? clone(transportStatus) : null
    });
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Runtime Bridge listener must be a function');
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  enable() {
    if (this.disposed) throw runtimeProtocolError('INK_RUNTIME_BRIDGE_DISPOSED');
    this.enabled = true;
    this._emit('enabled');
    return this.status();
  }

  disable() {
    if (this.disposed) return this.status();
    const generation = ++this.lifecycleGeneration;
    this.enabled = false;
    this.paired = false;
    this.scope = [];
    this.remoteApprovals.clear();
    this._invalidateOpenRecords('INK_RUNTIME_BRIDGE_DISABLED');
    this._emit('disabled');
    if (typeof this.transport?.revoke === 'function') {
      Promise.resolve(this.transport.revoke({ sessionId: this.sessionId, reason: 'disabled', generation }))
        .catch(() => {});
    }
    return this.status();
  }

  async pair({ scope = INK_RUNTIME_TOOL_SCOPE, authorization = null } = {}) {
    if (this.disposed) throw runtimeProtocolError('INK_RUNTIME_BRIDGE_DISPOSED');
    if (!this.ready()) throw runtimeProtocolError('INK_RUNTIME_BRIDGE_NOT_READY');
    if (!this.transport || typeof this.transport.pair !== 'function') throw runtimeProtocolError('INK_RUNTIME_TRANSPORT_UNAVAILABLE');
    if (this.paired) throw runtimeProtocolError('INK_RUNTIME_PAIR_ALREADY_ACTIVE');
    if (this.pairInFlight) throw runtimeProtocolError('INK_RUNTIME_PAIR_IN_PROGRESS');

    const normalizedScope = normalizeToolScope(scope);
    const generation = ++this.lifecycleGeneration;
    this.enabled = true;
    this.pairInFlight = true;
    this._emit('pair-start');

    try {
      const receipt = await this.transport.pair({
        schema: 'INK-RUNTIME-PAIR',
        version: INK_RUNTIME_PROTOCOL_VERSION,
        sessionId: this.sessionId,
        sourceSha: this.sourceSha(),
        scope: normalizedScope,
        ...(authorization ? { authorization: clone(authorization) } : {})
      });
      if (this.disposed || generation !== this.lifecycleGeneration || !this.enabled) {
        try { await this.transport.revoke?.({ sessionId: this.sessionId, reason: 'stale-pair-completion' }); } catch {}
        throw runtimeProtocolError('INK_RUNTIME_PAIR_CANCELLED');
      }
      if (receipt?.paired !== true) throw runtimeProtocolError('INK_RUNTIME_PAIR_FAILED');
      this.scope = [...normalizedScope];
      this.paired = true;
      this.remoteApprovals.clear();
      this._emit('paired');
      return clone({ paired: true, sessionId: this.sessionId, sourceSha: this.sourceSha(), scope: this.scope });
    } catch (error) {
      this._emit('pair-error', error);
      throw error;
    } finally {
      this.pairInFlight = false;
      this._emit('pair-settled');
    }
  }

  async revoke(reason = 'user-revoked') {
    if (this.disposed) return this.status();
    ++this.lifecycleGeneration;
    this.paired = false;
    this.scope = [];
    this.remoteApprovals.clear();
    this._invalidateOpenRecords('INK_RUNTIME_PAIR_REVOKED', reason);
    this._emit('revoked');
    if (typeof this.transport?.revoke === 'function') {
      try { await this.transport.revoke({ sessionId: this.sessionId, reason }); } catch {}
    }
    return this.status();
  }

  inspectLast() {
    return clone(this.last);
  }

  pendingConsent() {
    if (!this.activeRequestId) return null;
    const record = this.ledger.get(this.activeRequestId);
    if (record?.state !== 'WAITING_CONSENT') return null;
    if (record.request.expiresAtMs <= this.now()) {
      this._expireConsentRecord(record);
      return null;
    }
    return clone({
      requestId: record.request.requestId,
      tool: record.request.tool,
      action: requestActionLabel(record.request.tool),
      createdAt: record.request.createdAt,
      expiresAt: record.request.expiresAt,
      summary: this._consentSummary(record)
    });
  }

  async checkNow() {
    this._assertAccepting();
    if (typeof this.transport?.discover !== 'function') throw runtimeProtocolError('INK_RUNTIME_TRANSPORT_UNAVAILABLE');
    const generation = this.lifecycleGeneration;
    this._emit('discovery-start');
    try {
      const discovered = await this.transport.discover({
        sessionId: this.sessionId,
        sourceSha: this.sourceSha(),
        scope: [...this.scope]
      });
      this._assertGeneration(generation, 'INK_RUNTIME_DISCOVERY_CANCELLED');
      if (!discovered) {
        this._emit('discovery-empty');
        return null;
      }
      const envelope = discovered.request ? discovered : { request: discovered, observedRequestBlobSha: null };
      const result = await this.receiveRequest(envelope, { expectedGeneration: generation });
      this._emit('discovery-complete');
      return result;
    } catch (error) {
      this._emit('discovery-error', error);
      throw error;
    }
  }

  async receiveRequest({ request, observedRequestBlobSha = null } = {}, { expectedGeneration = null } = {}) {
    this._assertAccepting();
    const generation = expectedGeneration ?? this.lifecycleGeneration;
    this._assertGeneration(generation, 'INK_RUNTIME_REQUEST_CANCELLED');

    let normalized;
    try {
      normalized = validateRuntimeRequest(request, {
        sessionId: this.sessionId,
        sourceSha: this.sourceSha(),
        allowedTools: this.scope,
        now: this.now()
      });
    } catch (error) {
      const result = this._result(request, observedRequestBlobSha, 'REJECTED', null, error);
      this.last = { requestId: request?.requestId || null, state: 'REJECTED', result };
      await this._publishEphemeral(result, generation);
      this._emit('request-rejected', error);
      return clone(result);
    }

    const fingerprint = await runtimeRequestFingerprint(normalized);
    this._assertGeneration(generation, 'INK_RUNTIME_REQUEST_CANCELLED');

    const existing = this.ledger.get(normalized.requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        const result = this._result(normalized, observedRequestBlobSha, 'REJECTED', null,
          runtimeProtocolError('INK_RUNTIME_REQUEST_ID_CONFLICT'));
        await this._publishEphemeral(result, generation);
        this._emit('request-rejected');
        return clone(result);
      }
      if (existing.completion) return clone(await existing.completion);
      if (existing.result && existing.published !== true) await this._publishRecord(existing);
      return clone(existing.result);
    }

    this._pruneLedger(this.now());
    if (this.ledger.size >= this.ledgerCapacity) {
      const result = this._result(normalized, observedRequestBlobSha, 'REJECTED', null,
        runtimeProtocolError('INK_RUNTIME_LEDGER_CAPACITY_EXHAUSTED'));
      await this._publishEphemeral(result, generation);
      this._emit('request-rejected');
      return clone(result);
    }
    if (this.activeRequestId) {
      const result = this._result(normalized, observedRequestBlobSha, 'REJECTED', null,
        runtimeProtocolError('INK_RUNTIME_BRIDGE_BUSY'));
      await this._publishEphemeral(result, generation);
      this._emit('request-rejected');
      return clone(result);
    }

    const record = {
      request: normalized,
      fingerprint,
      observedRequestBlobSha,
      generation,
      state: 'RESERVED',
      result: null,
      published: false,
      publishError: null,
      replayUntil: normalized.expiresAtMs + INK_RUNTIME_MAX_TTL_MS,
      completion: null,
      revokedDuringInvoke: false
    };
    this.ledger.set(normalized.requestId, record);
    this.activeRequestId = normalized.requestId;

    if (CONSENT_TOOLS.has(normalized.tool)) {
      record.state = 'WAITING_CONSENT';
      record.result = this._result(normalized, observedRequestBlobSha, 'WAITING_CONSENT', null, null);
      this.last = { requestId: normalized.requestId, state: record.state, result: record.result };
      this._scheduleConsentExpiry(record);
      this._emit('consent-waiting');
      await this._publishRecord(record);
      return clone(record.result);
    }

    record.completion = this._invokeReserved(record);
    try {
      return clone(await record.completion);
    } finally {
      record.completion = null;
    }
  }

  async approvePending(requestId) {
    this._assertAccepting();
    const record = this.ledger.get(String(requestId || ''));
    if (!record || record.state !== 'WAITING_CONSENT') throw runtimeProtocolError('INK_RUNTIME_CONSENT_REQUEST_NOT_FOUND');
    this._assertGeneration(record.generation, 'INK_RUNTIME_CONSENT_STALE');
    if (record.request.expiresAtMs <= this.now()) {
      return this.rejectPending(requestId, 'expired-before-consent', 'INK_RUNTIME_REQUEST_EXPIRED');
    }
    this._clearConsentTimer(record.request.requestId);
    record.state = 'CONSENTED';
    record.published = false;
    this._emit('consent-approved');
    record.completion = this._invokeReserved(record);
    try {
      return clone(await record.completion);
    } finally {
      record.completion = null;
    }
  }

  async rejectPending(requestId, reason = 'user-rejected', code = 'INK_RUNTIME_USER_REJECTED') {
    const record = this.ledger.get(String(requestId || ''));
    if (!record || record.state !== 'WAITING_CONSENT') throw runtimeProtocolError('INK_RUNTIME_CONSENT_REQUEST_NOT_FOUND');
    this._clearConsentTimer(record.request.requestId);
    record.state = 'REJECTED';
    record.published = false;
    record.result = this._result(record.request, record.observedRequestBlobSha, 'REJECTED', null,
      runtimeProtocolError(code, { reason }));
    if (this.activeRequestId === record.request.requestId) this.activeRequestId = null;
    this.last = { requestId: record.request.requestId, state: record.state, result: record.result };
    this._emit('consent-rejected');
    await this._publishRecord(record);
    return clone(record.result);
  }

  async retryPublication(requestId) {
    this._assertAccepting();
    const record = this.ledger.get(String(requestId || ''));
    if (!record?.result) throw runtimeProtocolError('INK_RUNTIME_RESULT_NOT_FOUND');
    this._assertGeneration(record.generation, 'INK_RUNTIME_RESULT_STALE');
    await this._publishRecord(record);
    return clone(record.result);
  }

  async dispose() {
    if (this.disposed) return;
    await this.revoke('disposed');
    this.disposed = true;
    this.enabled = false;
    ++this.lifecycleGeneration;
    this._clearAllConsentTimers();
    this._emit('disposed');
    if (typeof this.transport?.dispose === 'function') {
      try { await this.transport.dispose(); } catch {}
    }
    this.listeners.clear();
    if (this.app?.runtimeBridge === this) {
      try { delete this.app.runtimeBridge; } catch {}
    }
  }

  _assertAccepting() {
    if (this.disposed) throw runtimeProtocolError('INK_RUNTIME_BRIDGE_DISPOSED');
    if (!this.ready()) throw runtimeProtocolError('INK_RUNTIME_BRIDGE_NOT_READY');
    if (!this.enabled) throw runtimeProtocolError('INK_RUNTIME_BRIDGE_DISABLED');
    if (!this.paired) throw runtimeProtocolError('INK_RUNTIME_PAIR_REQUIRED');
  }

  _assertGeneration(generation, code) {
    if (this.disposed || generation !== this.lifecycleGeneration || !this.enabled || !this.paired) {
      throw runtimeProtocolError(code || 'INK_RUNTIME_PAIR_REVOKED');
    }
  }

  _pruneLedger(now) {
    for (const [requestId, record] of this.ledger) {
      if (terminalState(record) && record.replayUntil < now) {
        this._clearConsentTimer(requestId);
        this.ledger.delete(requestId);
      }
    }
  }

  _invalidateOpenRecords(code, reason = null) {
    this.activeRequestId = null;
    for (const record of this.ledger.values()) {
      this._clearConsentTimer(record.request.requestId);
      if (record.state === 'INVOKING' || record.completion) {
        record.revokedDuringInvoke = true;
        continue;
      }
      if (!terminalState(record)) {
        record.state = 'REJECTED';
        record.result = this._result(record.request, record.observedRequestBlobSha, 'REJECTED', null,
          runtimeProtocolError(code, reason ? { reason } : {}));
        record.published = false;
        this.last = { requestId: record.request.requestId, state: record.state, result: record.result };
      }
    }
  }

  _scheduleConsentExpiry(record) {
    this._clearConsentTimer(record.request.requestId);
    const delay = Math.max(0, Math.min(INK_RUNTIME_MAX_TTL_MS, record.request.expiresAtMs - this.now() + 1));
    const timer = setTimeout(() => this._expireConsentRecord(record), delay);
    this.consentTimers.set(record.request.requestId, timer);
  }

  _expireConsentRecord(record) {
    if (!record || record.state !== 'WAITING_CONSENT') return;
    this._clearConsentTimer(record.request.requestId);
    record.state = 'REJECTED';
    record.published = false;
    record.result = this._result(record.request, record.observedRequestBlobSha, 'REJECTED', null,
      runtimeProtocolError('INK_RUNTIME_REQUEST_EXPIRED'));
    if (this.activeRequestId === record.request.requestId) this.activeRequestId = null;
    this.last = { requestId: record.request.requestId, state: record.state, result: record.result };
    this._emit('consent-expired');
    Promise.resolve(this._publishRecord(record)).catch(() => {});
  }

  _clearConsentTimer(requestId) {
    const timer = this.consentTimers.get(requestId);
    if (timer) clearTimeout(timer);
    this.consentTimers.delete(requestId);
  }

  _clearAllConsentTimers() {
    for (const timer of this.consentTimers.values()) clearTimeout(timer);
    this.consentTimers.clear();
  }

  _consentSummary(record) {
    const input = record?.request?.input || {};
    const summary = {
      action: requestActionLabel(record?.request?.tool)
    };
    if (typeof input.proposalId === 'string') {
      summary.proposalId = input.proposalId.slice(0, 160);
      for (const candidate of this.ledger.values()) {
        const proposalId = candidate?.result?.agentResult?.result?.result?.proposalId;
        if (candidate.request?.tool === 'propose_ink_edit' && proposalId === input.proposalId) {
          const refs = candidate.result?.agentResult?.targetRefs;
          if (Array.isArray(refs) && refs.length) summary.targetRefs = clone(refs.slice(0, 8));
          break;
        }
      }
    }
    return summary;
  }

  async _invokeReserved(record) {
    const { request } = record;
    const dispatchGeneration = record.generation;
    let consumedApproval = false;
    try {
      this._assertGeneration(dispatchGeneration, 'INK_RUNTIME_PAIR_REVOKED');
      if (request.tool === 'execute_ink_edit') {
        const proposalId = request.input?.proposalId;
        const token = request.input?.approvalToken;
        const known = typeof proposalId === 'string' ? this.remoteApprovals.get(proposalId) : null;
        if (!known || known.token !== token || known.generation !== dispatchGeneration) {
          throw runtimeProtocolError('INK_RUNTIME_REMOTE_APPROVAL_REQUIRED');
        }
        consumedApproval = true;
      }

      record.state = 'INVOKING';
      this._emit('invoke-start');
      const agentResult = await Promise.resolve(this.invokeTool(request.tool, clone(request.input)));
      if (!agentResult || agentResult.schema !== 'INK_AGENT_RESULT') {
        throw runtimeProtocolError('INK_RUNTIME_AGENT_RESULT_INVALID');
      }

      const stillCurrent = !this.disposed
        && this.enabled
        && this.paired
        && dispatchGeneration === this.lifecycleGeneration;

      if (consumedApproval && typeof request.input?.proposalId === 'string') {
        this.remoteApprovals.delete(request.input.proposalId);
      }

      if (!stillCurrent) {
        record.revokedDuringInvoke = true;
        record.state = agentResult.status === 'FAILED' ? 'AGENT_REJECTED_AFTER_REVOKE' : 'COMPLETED_AFTER_REVOKE';
        record.result = this._result(request, record.observedRequestBlobSha, record.state, agentResult, null);
        record.published = false;
        record.publishError = { code: 'INK_RUNTIME_PAIR_REVOKED_AFTER_DISPATCH', message: 'Pairing changed after native dispatch' };
      } else {
        if (request.tool === 'approve_ink_edit') {
          const receipt = approvalReceipt(agentResult);
          if (receipt) {
            this.remoteApprovals.set(receipt.proposalId, {
              token: receipt.approvalToken,
              generation: dispatchGeneration
            });
          }
        }
        record.state = agentResult.status === 'FAILED' ? 'AGENT_REJECTED' : 'COMPLETED';
        record.result = this._result(request, record.observedRequestBlobSha, record.state, agentResult, null);
      }
    } catch (error) {
      if (consumedApproval && typeof request.input?.proposalId === 'string') {
        this.remoteApprovals.delete(request.input.proposalId);
      }
      record.state = 'REJECTED';
      record.result = this._result(request, record.observedRequestBlobSha, 'REJECTED', null, error);
    } finally {
      if (this.activeRequestId === request.requestId) this.activeRequestId = null;
      this.last = { requestId: request.requestId, state: record.state, result: record.result };
      this._emit('invoke-settled');
    }

    if (dispatchGeneration === this.lifecycleGeneration && this.paired && !this.disposed) {
      await this._publishRecord(record);
    }
    return record.result;
  }

  _result(request, observedRequestBlobSha, status, agentResult, error) {
    return createRuntimeResult({
      request,
      sessionId: this.sessionId,
      sourceSha: this.sourceSha(),
      observedRequestBlobSha,
      status,
      agentResult: agentResult == null ? null : clone(agentResult),
      rejection: error ? compactRuntimeRejection(error) : null
    });
  }

  async _publishEphemeral(result, generation = this.lifecycleGeneration) {
    if (generation !== this.lifecycleGeneration || !this.paired || this.disposed) return;
    if (typeof this.transport?.publishResult !== 'function') return;
    try {
      await this.transport.publishResult(clone(result));
      if (generation === this.lifecycleGeneration) this._emit('publication-complete');
    } catch (error) {
      this._emit('publication-error', error);
    }
  }

  async _publishRecord(record) {
    if (!record?.result || typeof this.transport?.publishResult !== 'function') return;
    const generation = record.generation;
    if (generation !== this.lifecycleGeneration || !this.paired || this.disposed) return;
    try {
      const receipt = await this.transport.publishResult(clone(record.result));
      if (generation !== this.lifecycleGeneration || !this.paired || this.disposed) {
        record.published = false;
        record.publishError = { code: 'INK_RUNTIME_RESULT_RECEIPT_CANCELLED', message: 'Pairing changed during result publication' };
        this._emit('publication-cancelled');
        return;
      }
      record.published = receipt?.published !== false;
      record.publishError = null;
      this._emit('publication-complete');
    } catch (error) {
      record.published = false;
      record.publishError = compactRuntimeRejection(error);
      if (terminalState(record)) record.state = 'PUBLISH_FAILED';
      this.last = { requestId: record.request.requestId, state: record.state, result: record.result };
      this._emit('publication-error', error);
    }
  }

  _emit(reason, error = null) {
    const event = Object.freeze({
      reason,
      error: error ? compactRuntimeRejection(error) : null
    });
    for (const listener of [...this.listeners]) {
      try { listener(event); } catch {}
    }
  }
}

export function installInkRuntimeBridge(app, options = {}) {
  if (app?.runtimeBridge?.schema === INK_RUNTIME_BRIDGE_SCHEMA) return app.runtimeBridge;
  const bridge = new InkRuntimeBridge(app, options);
  Object.defineProperty(bridge, 'schema', { value: INK_RUNTIME_BRIDGE_SCHEMA, enumerable: true });
  Object.defineProperty(bridge, 'version', { value: INK_RUNTIME_BRIDGE_API_VERSION, enumerable: true });
  Object.defineProperty(app, 'runtimeBridge', {
    value: bridge,
    writable: false,
    configurable: true,
    enumerable: true
  });
  return bridge;
}

export function mountInkRuntimeBridgeControls(bridge, container, {
  pairOptionsProvider = null
} = {}) {
  if (!bridge || !container || typeof document === 'undefined') throw new TypeError('Runtime Bridge controls require bridge and container');

  const root = document.createElement('div');
  root.setAttribute('data-ink-runtime-bridge-controls', '1');

  const status = document.createElement('span');
  status.setAttribute('data-ink-runtime-status', '1');
  const pending = document.createElement('span');
  pending.setAttribute('data-ink-runtime-pending', '1');
  const error = document.createElement('span');
  error.setAttribute('data-ink-runtime-error', '1');
  error.setAttribute('role', 'alert');

  const connect = document.createElement('button');
  const revoke = document.createElement('button');
  const check = document.createElement('button');
  const approve = document.createElement('button');
  const reject = document.createElement('button');
  connect.type = revoke.type = check.type = approve.type = reject.type = 'button';
  connect.textContent = 'Connect CHAT';
  revoke.textContent = 'Disconnect';
  check.textContent = 'Check request';
  approve.textContent = 'Approve request';
  reject.textContent = 'Reject request';

  root.append(status, pending, error, connect, revoke, check, approve, reject);
  container.append(root);

  let disposed = false;
  let busy = false;
  let lastError = null;

  const render = () => {
    if (disposed) return;
    const state = bridge.status();
    const consent = bridge.pendingConsent();
    status.textContent = state.paired
      ? (busy ? 'CHAT connected · working' : 'CHAT connected')
      : (state.pairInFlight || busy ? 'CHAT connecting' : 'CHAT disconnected');
    pending.textContent = consent
      ? consent.action + ' · ' + consent.requestId + (consent.summary?.proposalId ? ' · proposal ' + consent.summary.proposalId : '')
      : 'No pending request';
    error.textContent = lastError || '';
    connect.disabled = busy || state.paired || state.pairInFlight || state.ready === false;
    revoke.disabled = busy || (!state.paired && !state.pairInFlight);
    check.disabled = busy || !state.accepting;
    approve.disabled = busy || !consent;
    reject.disabled = busy || !consent;
  };

  const run = async operation => {
    if (disposed || busy) return;
    busy = true;
    lastError = null;
    render();
    try {
      await operation();
    } catch (caught) {
      lastError = ((caught?.code || 'INK_RUNTIME_CONTROL_ERROR') + ': ' + (caught?.message || 'request failed')).slice(0, 300);
    } finally {
      busy = false;
      render();
    }
  };

  const handlers = {
    connect: () => run(async () => {
      const options = typeof pairOptionsProvider === 'function'
        ? await pairOptionsProvider({ bridge, status: bridge.status() })
        : {};
      await bridge.pair(options && typeof options === 'object' ? options : {});
    }),
    revoke: () => run(() => bridge.revoke()),
    check: () => run(() => bridge.checkNow()),
    approve: () => run(async () => {
      const consent = bridge.pendingConsent();
      if (consent) await bridge.approvePending(consent.requestId);
    }),
    reject: () => run(async () => {
      const consent = bridge.pendingConsent();
      if (consent) await bridge.rejectPending(consent.requestId);
    })
  };

  connect.addEventListener('click', handlers.connect);
  revoke.addEventListener('click', handlers.revoke);
  check.addEventListener('click', handlers.check);
  approve.addEventListener('click', handlers.approve);
  reject.addEventListener('click', handlers.reject);
  const unsubscribe = bridge.subscribe(() => render());

  render();

  return {
    element: root,
    elements: Object.freeze({ status, pending, error, connect, revoke, check, approve, reject }),
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      if (typeof connect.removeEventListener === 'function') {
        connect.removeEventListener('click', handlers.connect);
        revoke.removeEventListener('click', handlers.revoke);
        check.removeEventListener('click', handlers.check);
        approve.removeEventListener('click', handlers.approve);
        reject.removeEventListener('click', handlers.reject);
      }
      root.remove();
    }
  };
}
