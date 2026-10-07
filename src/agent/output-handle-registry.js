export const INK_OUTPUT_HANDLE_SCHEMA = 'INK_OUTPUT_HANDLE';
export const INK_OUTPUT_HANDLE_VERSION = 1;

export const INK_OUTPUT_REGISTRY_DEFAULT_MAX_ENTRIES = 8;
export const INK_OUTPUT_REGISTRY_DEFAULT_MAX_BYTES = 32 * 1024 * 1024;

const registries = new WeakMap();

function fail(code, details = {}) {
  throw Object.assign(new Error(code), { code, ...details });
}

function positiveInteger(value, fallback, max, field) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) fail('INK_OUTPUT_REGISTRY_LIMIT_INVALID', { field, value });
  return number;
}

function cloneHandle(handle) {
  return JSON.parse(JSON.stringify(handle));
}

function validHandle(handle) {
  return handle
    && handle.schema === INK_OUTPUT_HANDLE_SCHEMA
    && Number(handle.version) === INK_OUTPUT_HANDLE_VERSION
    && typeof handle.handleId === 'string'
    && handle.handleId.trim()
    && Number.isInteger(Number(handle.byteLength))
    && Number(handle.byteLength) >= 0;
}

export class InkOutputRegistry {
  constructor({
    maxEntries = INK_OUTPUT_REGISTRY_DEFAULT_MAX_ENTRIES,
    maxTotalBytes = INK_OUTPUT_REGISTRY_DEFAULT_MAX_BYTES
  } = {}) {
    this.maxEntries = positiveInteger(maxEntries, INK_OUTPUT_REGISTRY_DEFAULT_MAX_ENTRIES, INK_OUTPUT_REGISTRY_DEFAULT_MAX_ENTRIES, 'maxEntries');
    this.maxTotalBytes = positiveInteger(maxTotalBytes, INK_OUTPUT_REGISTRY_DEFAULT_MAX_BYTES, INK_OUTPUT_REGISTRY_DEFAULT_MAX_BYTES, 'maxTotalBytes');
    this.entries = new Map();
    this.totalBytes = 0;
    this.sequence = 0;
  }

  _oldestEntry({ availableOnly = false, excludeHandleId = null } = {}) {
    let oldest = null;
    for (const [handleId, entry] of this.entries) {
      if (handleId === excludeHandleId) continue;
      if (availableOnly && entry.payload == null) continue;
      if (!oldest || entry.sequence < oldest.entry.sequence) oldest = { handleId, entry };
    }
    return oldest;
  }

  _dropEntry(handleId) {
    const entry = this.entries.get(handleId);
    if (!entry) return false;
    if (entry.payload != null) this.totalBytes = Math.max(0, this.totalBytes - entry.payloadBytes);
    this.entries.delete(handleId);
    return true;
  }

  _releasePayload(entry, reason) {
    if (!entry || entry.payload == null) return false;
    this.totalBytes = Math.max(0, this.totalBytes - entry.payloadBytes);
    entry.payload = null;
    entry.payloadBytes = 0;
    entry.available = false;
    entry.released = reason === 'RELEASED';
    entry.evicted = reason === 'EVICTED';
    entry.unavailableReason = reason;
    return true;
  }

  _makeByteRoom(byteLength, excludeHandleId = null) {
    while (this.totalBytes + byteLength > this.maxTotalBytes) {
      const oldest = this._oldestEntry({ availableOnly: true, excludeHandleId });
      if (!oldest) fail('INK_OUTPUT_REGISTRY_BYTE_LIMIT_EXCEEDED', { byteLength, maxTotalBytes: this.maxTotalBytes });
      this._releasePayload(oldest.entry, 'EVICTED');
    }
  }

  store(handle, payload) {
    if (!validHandle(handle)) fail('INK_OUTPUT_HANDLE_INVALID');
    const handleId = handle.handleId.trim();
    const byteLength = Number(handle.byteLength);
    if (byteLength > this.maxTotalBytes) {
      fail('INK_OUTPUT_REGISTRY_PAYLOAD_TOO_LARGE', { byteLength, maxTotalBytes: this.maxTotalBytes });
    }

    const existing = this.entries.get(handleId);
    if (existing) {
      if (existing.handle.renderFingerprint !== handle.renderFingerprint || Number(existing.handle.byteLength) !== byteLength) {
        fail('INK_OUTPUT_HANDLE_ID_COLLISION', { handleId });
      }
      if (existing.payload != null) {
        existing.sequence = ++this.sequence;
        return cloneHandle(existing.handle);
      }
      this._makeByteRoom(byteLength, handleId);
      existing.payload = payload;
      existing.payloadBytes = byteLength;
      existing.available = true;
      existing.released = false;
      existing.evicted = false;
      existing.unavailableReason = null;
      existing.sequence = ++this.sequence;
      this.totalBytes += byteLength;
      return cloneHandle(existing.handle);
    }

    while (this.entries.size >= this.maxEntries) {
      const oldest = this._oldestEntry();
      if (!oldest) break;
      this._dropEntry(oldest.handleId);
    }
    this._makeByteRoom(byteLength);

    const storedHandle = cloneHandle(handle);
    this.entries.set(handleId, {
      handle: storedHandle,
      payload,
      payloadBytes: byteLength,
      available: true,
      released: false,
      evicted: false,
      unavailableReason: null,
      sequence: ++this.sequence
    });
    this.totalBytes += byteLength;
    return cloneHandle(storedHandle);
  }

  inspect(handleId) {
    const id = String(handleId || '').trim();
    const entry = id ? this.entries.get(id) : null;
    if (!entry) return null;
    return {
      handle: cloneHandle(entry.handle),
      available: entry.payload != null,
      released: Boolean(entry.released),
      evicted: Boolean(entry.evicted),
      unavailableReason: entry.unavailableReason || null
    };
  }

  resolve(handleId) {
    const id = String(handleId || '').trim();
    return id ? this.entries.get(id)?.payload ?? null : null;
  }

  release(handleId) {
    const id = String(handleId || '').trim();
    const entry = id ? this.entries.get(id) : null;
    if (!entry) return { found: false, released: false, handle: null };
    const released = this._releasePayload(entry, 'RELEASED');
    entry.sequence = ++this.sequence;
    return { found: true, released, handle: cloneHandle(entry.handle) };
  }

  stats() {
    let availableEntries = 0;
    for (const entry of this.entries.values()) if (entry.payload != null) availableEntries += 1;
    return {
      entries: this.entries.size,
      availableEntries,
      totalBytes: this.totalBytes,
      maxEntries: this.maxEntries,
      maxTotalBytes: this.maxTotalBytes
    };
  }
}

export function createInkOutputRegistry(options = {}) {
  return new InkOutputRegistry(options);
}

export function installInkOutputRegistry(app, options = {}) {
  if (!app || (typeof app !== 'object' && typeof app !== 'function')) fail('INK_OUTPUT_REGISTRY_APP_REQUIRED');
  let registry = registries.get(app);
  if (!registry) {
    registry = createInkOutputRegistry(options);
    registries.set(app, registry);
  }
  return registry;
}

export function getInkOutputRegistry(app) {
  return app ? registries.get(app) || null : null;
}

export function resolveInkOutputPayload(app, handleId) {
  return getInkOutputRegistry(app)?.resolve(handleId) ?? null;
}
