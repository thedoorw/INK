export const uid = () => globalThis.crypto?.randomUUID?.() ||
  `ink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const deepClone = value => globalThis.structuredClone
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));

export const nowISO = () => new Date().toISOString();
