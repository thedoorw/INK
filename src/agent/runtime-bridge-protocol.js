export const INK_RUNTIME_REQUEST_SCHEMA = 'INK-RUNTIME-REQUEST';
export const INK_RUNTIME_RESULT_SCHEMA = 'INK-RUNTIME-RESULT';
export const INK_RUNTIME_PROTOCOL_VERSION = 1;
export const INK_RUNTIME_BRIDGE_VERSION = '1.0.0';
export const INK_RUNTIME_MAX_TTL_MS = 5 * 60 * 1000;
export const INK_RUNTIME_MAX_FUTURE_SKEW_MS = 30 * 1000;
export const INK_RUNTIME_MAX_INPUT_BYTES = 32 * 1024;
export const INK_RUNTIME_MAX_RESULT_BYTES = 192 * 1024;

export const INK_RUNTIME_TOOL_SCOPE = Object.freeze([
  'get_ink_context',
  'propose_ink_edit',
  'approve_ink_edit',
  'execute_ink_edit',
  'get_ink_preview',
  'get_ink_history',
  'undo_ink',
  'redo_ink'
]);

export const INK_RUNTIME_EXPLICIT_CONSENT_TOOLS = Object.freeze([
  'approve_ink_edit',
  'undo_ink',
  'redo_ink'
]);

const SHA40 = /^[a-f0-9]{40}$/i;
const REQUEST_ID = /^[A-Za-z0-9_.:-]{1,120}$/;

function plainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function stableJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('INK_RUNTIME_JSON_NON_FINITE');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (!plainRecord(value)) throw new TypeError('INK_RUNTIME_JSON_NON_PLAIN');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
}

export function byteLengthJson(value) {
  return new TextEncoder().encode(stableJson(value)).byteLength;
}

export function runtimeProtocolError(code, details = {}) {
  return Object.assign(new Error(code), { code, ...details });
}

function requireText(value, code, max = 200) {
  if (typeof value !== 'string' || !value || value.length > max) throw runtimeProtocolError(code);
  return value;
}

function parseIso(value, code) {
  requireText(value, code, 64);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw runtimeProtocolError(code);
  return ms;
}

export function normalizeToolScope(scope) {
  if (!Array.isArray(scope) || !scope.length) throw runtimeProtocolError('INK_RUNTIME_PAIR_SCOPE_INVALID');
  const allowed = new Set(INK_RUNTIME_TOOL_SCOPE);
  const normalized = [...new Set(scope.map(item => String(item || '').trim()))].sort();
  if (!normalized.length || normalized.some(item => !allowed.has(item))) {
    throw runtimeProtocolError('INK_RUNTIME_PAIR_SCOPE_INVALID');
  }
  return Object.freeze(normalized);
}

export function validateRuntimeRequest(raw, {
  sessionId,
  sourceSha,
  allowedTools = INK_RUNTIME_TOOL_SCOPE,
  now = Date.now()
} = {}) {
  if (!plainRecord(raw)) throw runtimeProtocolError('INK_RUNTIME_REQUEST_SCHEMA_INVALID');
  if (raw.schema !== INK_RUNTIME_REQUEST_SCHEMA) throw runtimeProtocolError('INK_RUNTIME_REQUEST_SCHEMA_INVALID');
  if (raw.version !== INK_RUNTIME_PROTOCOL_VERSION) throw runtimeProtocolError('INK_RUNTIME_REQUEST_VERSION_UNSUPPORTED');
  if (typeof raw.requestId !== 'string' || !REQUEST_ID.test(raw.requestId)) throw runtimeProtocolError('INK_RUNTIME_REQUEST_ID_INVALID');
  if (typeof raw.sessionId !== 'string' || raw.sessionId !== sessionId) throw runtimeProtocolError('INK_RUNTIME_SESSION_MISMATCH');
  if (typeof raw.expectedSourceSha !== 'string' || !SHA40.test(raw.expectedSourceSha) || raw.expectedSourceSha.toLowerCase() !== String(sourceSha || '').toLowerCase()) {
    throw runtimeProtocolError('INK_RUNTIME_SOURCE_MISMATCH');
  }

  const createdAtMs = parseIso(raw.createdAt, 'INK_RUNTIME_REQUEST_TIME_INVALID');
  const expiresAtMs = parseIso(raw.expiresAt, 'INK_RUNTIME_REQUEST_TIME_INVALID');
  if (expiresAtMs <= createdAtMs) throw runtimeProtocolError('INK_RUNTIME_REQUEST_TIME_INVALID');
  if (expiresAtMs - createdAtMs > INK_RUNTIME_MAX_TTL_MS) throw runtimeProtocolError('INK_RUNTIME_REQUEST_TTL_EXCEEDED');
  if (createdAtMs > now + INK_RUNTIME_MAX_FUTURE_SKEW_MS) throw runtimeProtocolError('INK_RUNTIME_REQUEST_TIME_INVALID');
  if (expiresAtMs <= now) throw runtimeProtocolError('INK_RUNTIME_REQUEST_EXPIRED');

  const tool = requireText(raw.tool, 'INK_RUNTIME_TOOL_NOT_ALLOWED', 80);
  const allowed = new Set(Array.isArray(allowedTools) ? allowedTools : []);
  if (!allowed.has(tool) || !INK_RUNTIME_TOOL_SCOPE.includes(tool)) throw runtimeProtocolError('INK_RUNTIME_TOOL_NOT_ALLOWED');

  const input = raw.input == null ? {} : raw.input;
  if (!plainRecord(input)) throw runtimeProtocolError('INK_RUNTIME_INPUT_INVALID');
  let inputBytes;
  try { inputBytes = byteLengthJson(input); }
  catch { throw runtimeProtocolError('INK_RUNTIME_INPUT_INVALID'); }
  if (inputBytes > INK_RUNTIME_MAX_INPUT_BYTES) throw runtimeProtocolError('INK_RUNTIME_INPUT_INVALID');

  return Object.freeze({
    schema: INK_RUNTIME_REQUEST_SCHEMA,
    version: INK_RUNTIME_PROTOCOL_VERSION,
    requestId: raw.requestId,
    sessionId: raw.sessionId,
    expectedSourceSha: raw.expectedSourceSha.toLowerCase(),
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    createdAtMs,
    expiresAtMs,
    tool,
    input: JSON.parse(stableJson(input))
  });
}

export function runtimeRequestFingerprintInput(request) {
  return stableJson({
    schema: request.schema,
    version: request.version,
    requestId: request.requestId,
    sessionId: request.sessionId,
    expectedSourceSha: request.expectedSourceSha,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    tool: request.tool,
    input: request.input
  });
}

export async function runtimeRequestFingerprint(request) {
  const bytes = new TextEncoder().encode(runtimeRequestFingerprintInput(request));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createRuntimeResult({
  request = null,
  sessionId,
  sourceSha,
  observedRequestBlobSha = null,
  status,
  agentResult = null,
  rejection = null,
  bridgeVersion = INK_RUNTIME_BRIDGE_VERSION,
  publishedAt = null
}) {
  const result = {
    schema: INK_RUNTIME_RESULT_SCHEMA,
    version: INK_RUNTIME_PROTOCOL_VERSION,
    bridgeVersion,
    requestId: request?.requestId || null,
    sessionId: sessionId || null,
    sourceSha: sourceSha || null,
    observedRequestBlobSha: observedRequestBlobSha || null,
    tool: request?.tool || null,
    status: String(status || 'FAILED'),
    completedAt: new Date().toISOString(),
    agentResult: agentResult == null ? null : agentResult,
    rejection: rejection == null ? null : rejection
  };
  if (publishedAt) result.publishedAt = publishedAt;
  let bytes;
  try { bytes = byteLengthJson(result); }
  catch { throw runtimeProtocolError('INK_RUNTIME_RESULT_INVALID'); }
  if (bytes > INK_RUNTIME_MAX_RESULT_BYTES) throw runtimeProtocolError('INK_RUNTIME_RESULT_TOO_LARGE', { bytes });
  return result;
}

export function compactRuntimeRejection(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : 'INK_RUNTIME_REQUEST_REJECTED',
    message: typeof error?.message === 'string' ? error.message.slice(0, 240) : 'INK Runtime request rejected'
  };
}

export function isRuntimeSourceSha(value) {
  return typeof value === 'string' && SHA40.test(value);
}
