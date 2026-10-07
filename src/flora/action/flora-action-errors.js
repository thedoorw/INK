export class FloraActionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'FloraActionError';
    this.code = code;
    this.details = details;
  }
  toJSON() { return { ok: false, error: { code: this.code, message: this.message, details: this.details } }; }
}
export const errorResult = (code, message, details = {}) => ({ ok: false, error: { code, message, details } });
