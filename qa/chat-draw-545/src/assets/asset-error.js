export class AssetError extends Error {
  constructor(code, details = {}) { super(code === 'ASSET_MISSING' ? `Required asset is missing: ${details.assetId || details.expectedPath || 'unknown'}` : `Asset error: ${code}`); this.name = 'AssetError'; this.code = code; this.details = details; }
  toJSON() { return { code: this.code, assetId: this.details.assetId || '', expectedPath: this.details.expectedPath || '', requiredBy: this.details.requiredBy || [], optional: Boolean(this.details.optional), fallbackAvailable: Boolean(this.details.fallbackAvailable), ...this.details }; }
}
