import { deepClone } from '../core/index.js';
import { documentFingerprint, stableStringify } from './integrity.js';

const byteLengthOf = value => new TextEncoder().encode(stableStringify(value)).byteLength;

const envelope = value => ({
  schema: 'INK_STORAGE_V3',
  savedAt: new Date().toISOString(),
  modifiedAt: value?.modifiedAt || null,
  byteLength: byteLengthOf(value),
  fingerprint: documentFingerprint(value),
  value: deepClone(value)
});

const isEnvelope = record => record?.schema === 'INK_STORAGE_V3' || record?.schema === 'INK_STORAGE_V2';
const unwrap = record => isEnvelope(record) ? record.value : record;

export function verifyStorageRecord(record) {
  if (!record) return { valid: false, reason: 'missing-record', value: null };
  const value = unwrap(record);
  if (!value) return { valid: false, reason: 'missing-value', value: null };
  if (record.schema === 'INK_STORAGE_V3') {
    try {
      const fingerprint = documentFingerprint(value);
      const byteLength = byteLengthOf(value);
      if (fingerprint !== record.fingerprint) return { valid: false, reason: 'fingerprint-mismatch', value, fingerprint, expected: record.fingerprint };
      if (byteLength !== record.byteLength) return { valid: false, reason: 'length-mismatch', value, byteLength, expected: record.byteLength };
      return { valid: true, reason: null, value, fingerprint, byteLength, verified: true };
    } catch (error) {
      return { valid: false, reason: 'verification-error', value, error: String(error) };
    }
  }
  return { valid: true, reason: null, value, verified: false, legacy: true };
}

export class InkStore {
  constructor({ databaseName = 'INK_STORE', storeName = 'documents', checkpointLimit = 3 } = {}) {
    this.databaseName = databaseName;
    this.storeName = storeName;
    this.checkpointLimit = Math.max(1, Math.min(10, Math.trunc(checkpointLimit) || 3));
    this.dbPromise = null;
    this.memory = new Map();
    this.lastBackend = 'memory';
    this.lastRecovery = null;
  }

  open() {
    if (!('indexedDB' in globalThis)) return Promise.reject(new Error('IndexedDB unavailable'));
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 3);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(this.storeName)) request.result.createObjectStore(this.storeName);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.dbPromise;
  }

  async idbGet(database, key) {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(this.storeName, 'readonly');
      const request = transaction.objectStore(this.storeName).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  checkpointRecords(previous, existing = []) {
    const values = [previous, ...(Array.isArray(existing) ? existing : [])].filter(Boolean);
    const seen = new Set();
    return values.filter(record => {
      const key = record?.fingerprint || `${record?.savedAt || ''}:${record?.modifiedAt || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, this.checkpointLimit).map(record => deepClone(record));
  }

  async save(key, value) {
    const current = envelope(value);
    const memoryPrevious = this.memory.get(key) || null;
    const memoryCheckpoints = this.memory.get(`${key}:checkpoints`) || [];
    this.memory.set(`${key}:previous`, memoryPrevious);
    this.memory.set(`${key}:checkpoints`, this.checkpointRecords(memoryPrevious, memoryCheckpoints));
    this.memory.set(key, current);
    try {
      const database = await this.open();
      const previous = await this.idbGet(database, key);
      const checkpoints = await this.idbGet(database, `${key}:checkpoints`);
      const nextCheckpoints = this.checkpointRecords(previous, checkpoints);
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        if (previous) store.put(previous, `${key}:previous`);
        store.put(nextCheckpoints, `${key}:checkpoints`);
        store.put(current, key);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      this.lastBackend = 'indexeddb';
      return true;
    } catch (error) {
      try {
        const previousText = globalThis.localStorage?.getItem(`INK:${key}`);
        const previous = previousText ? JSON.parse(previousText) : null;
        const checkpoints = JSON.parse(globalThis.localStorage?.getItem(`INK:${key}:checkpoints`) || '[]');
        if (previousText) globalThis.localStorage?.setItem(`INK:${key}:previous`, previousText);
        globalThis.localStorage?.setItem(`INK:${key}:checkpoints`, JSON.stringify(this.checkpointRecords(previous, checkpoints)));
        globalThis.localStorage?.setItem(`INK:${key}`, JSON.stringify(current));
        this.lastBackend = 'localstorage';
        return true;
      } catch (_) {
        this.lastBackend = 'memory';
        return true;
      }
    }
  }

  async loadRecord(key) {
    try {
      const database = await this.open();
      const value = await this.idbGet(database, key);
      this.lastBackend = 'indexeddb';
      return value;
    } catch (error) {
      try {
        const value = JSON.parse(globalThis.localStorage?.getItem(`INK:${key}`) || 'null');
        if (value) {
          this.lastBackend = 'localstorage';
          return value;
        }
      } catch (_) {}
      this.lastBackend = 'memory';
      return this.memory.get(key) || null;
    }
  }

  async load(key) {
    return unwrap(await this.loadRecord(key));
  }

  async loadWithRecovery(key, validate = value => Boolean(value)) {
    const sources = [
      { name: 'current', record: await this.loadRecord(key) },
      { name: 'previous', record: await this.loadRecord(`${key}:previous`) }
    ];
    const checkpointRecords = await this.loadRecord(`${key}:checkpoints`);
    for (const [index, record] of (Array.isArray(checkpointRecords) ? checkpointRecords : []).entries()) sources.push({ name: `checkpoint-${index + 1}`, record });
    const rejected = [];
    for (const source of sources) {
      const verification = verifyStorageRecord(source.record);
      if (!verification.valid) { rejected.push({ source: source.name, reason: verification.reason }); continue; }
      if (!validate(verification.value)) { rejected.push({ source: source.name, reason: 'validation-failed' }); continue; }
      const result = {
        value: verification.value,
        recovered: source.name !== 'current',
        source: source.name,
        verified: Boolean(verification.verified),
        backend: this.lastBackend,
        rejected
      };
      this.lastRecovery = result;
      return result;
    }
    const result = { value: null, recovered: false, source: null, verified: false, backend: this.lastBackend, rejected };
    this.lastRecovery = result;
    return result;
  }

  async remove(key) {
    for (const suffix of ['', ':previous', ':checkpoints']) this.memory.delete(`${key}${suffix}`);
    try {
      const database = await this.open();
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        for (const suffix of ['', ':previous', ':checkpoints']) store.delete(`${key}${suffix}`);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      try {
        for (const suffix of ['', ':previous', ':checkpoints']) globalThis.localStorage?.removeItem(`INK:${key}${suffix}`);
      } catch (_) {}
    }
  }

  async probe() {
    const key = `__probe__:${Date.now()}`;
    const value = { format: 'INK', formatVersion: 4, id: key, modifiedAt: new Date().toISOString(), activePageId: 'page', pages: [{ id: 'page', activeLayerId: 'layer', layers: [{ id: 'layer', objects: [] }] }] };
    const saved = await this.save(key, value);
    const result = await this.loadWithRecovery(key, candidate => candidate?.id === key);
    await this.remove(key);
    return { ok: saved && result.value?.id === key, verified: result.verified, backend: this.lastBackend, checkpointLimit: this.checkpointLimit };
  }

  diagnostics() {
    return { backend: this.lastBackend, checkpointLimit: this.checkpointLimit, lastRecovery: this.lastRecovery };
  }
}
