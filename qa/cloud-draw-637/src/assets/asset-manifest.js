import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { AssetError } from './asset-error.js';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function validateAssetManifest(manifest) {
  const errors = [], ids = new Set();
  if (manifest?.format !== 'INK-ASSET-MANIFEST') errors.push({ code: 'ASSET_MANIFEST_FORMAT_INVALID' });
  for (const asset of manifest?.assets || []) {
    if (!asset.assetId || ids.has(asset.assetId)) errors.push({ code: 'ASSET_ID_INVALID_OR_DUPLICATE', assetId: asset.assetId });
    ids.add(asset.assetId);
    if (!asset.path || path.isAbsolute(asset.path) || asset.path.split(/[\\/]/).includes('..')) errors.push({ code: 'ASSET_PATH_NOT_PORTABLE', assetId: asset.assetId, path: asset.path });
    if (!asset.type) errors.push({ code: 'ASSET_TYPE_MISSING', assetId: asset.assetId });
  }
  return { valid: errors.length === 0, errors, assetCount: ids.size };
}

export class AssetManager {
  constructor({ root = process.cwd(), manifest = null } = {}) { this.root = path.resolve(root); this.manifest = manifest; }
  async load(file = path.join(this.root, 'ASSET_MANIFEST.json')) { this.manifest = JSON.parse(await readFile(file, 'utf8')); const validation = validateAssetManifest(this.manifest); if (!validation.valid) throw Object.assign(new Error('Asset Manifest is invalid'), { code: 'ASSET_MANIFEST_INVALID', details: validation }); return this.manifest; }
  entry(assetId) { const asset = this.manifest?.assets?.find(item => item.assetId === assetId); if (!asset) throw new AssetError('ASSET_MISSING', { assetId, expectedPath: '', requiredBy: [], optional: false, fallbackAvailable: false }); return asset; }
  resolvePath(asset) { const candidate = path.resolve(this.root, asset.path); if (candidate !== this.root && !candidate.startsWith(`${this.root}${path.sep}`)) throw new AssetError('ASSET_PATH_UNSAFE', { assetId: asset.assetId, expectedPath: asset.path }); return candidate; }
  async check(assetId) {
    const asset = this.entry(assetId), expectedPath = this.resolvePath(asset);
    try {
      await access(expectedPath); const info = await stat(expectedPath), bytes = await readFile(expectedPath), actualHash = sha256(bytes);
      if (asset.hash && asset.hash !== actualHash) throw new AssetError('ASSET_HASH_MISMATCH', { assetId, expectedPath: asset.path, expectedHash: asset.hash, actualHash, requiredBy: asset.usedBy || [], optional: asset.optional, fallbackAvailable: Boolean(asset.fallback) });
      return { ...asset, status: 'AVAILABLE', absolutePath: expectedPath, actualHash, actualSize: info.size };
    } catch (error) {
      if (error instanceof AssetError) throw error;
      if (asset.fallback) return { ...asset, status: 'FALLBACK', fallback: asset.fallback };
      if (asset.optional) return { ...asset, status: 'OPTIONAL_MISSING' };
      throw new AssetError('ASSET_MISSING', { assetId, expectedPath: asset.path, requiredBy: asset.usedBy || [], optional: false, fallbackAvailable: false });
    }
  }
  async audit() {
    const assets = [];
    for (const asset of this.manifest?.assets || []) { try { assets.push(await this.check(asset.assetId)); } catch (error) { assets.push({ ...asset, status: error.code || 'ASSET_ERROR', error: error.toJSON?.() || { code: error.code, message: error.message } }); } }
    const requiredFailures = assets.filter(item => !item.optional && !['AVAILABLE', 'FALLBACK'].includes(item.status));
    return { format: 'INK-ASSET-AUDIT', version: '1.0', status: requiredFailures.length ? 'FAIL' : assets.some(item => item.status !== 'AVAILABLE') ? 'PARTIAL' : 'PASS', assets, requiredFailures: requiredFailures.map(item => item.assetId) };
  }
  async portablePackage(assetIds, destination) {
    await mkdir(destination, { recursive: true }); const copied = [];
    for (const assetId of assetIds) { const checked = await this.check(assetId); if (checked.status !== 'AVAILABLE') continue; const target = path.resolve(destination, checked.path); await mkdir(path.dirname(target), { recursive: true }); await copyFile(checked.absolutePath, target); copied.push({ assetId, path: checked.path, hash: checked.actualHash }); }
    return { format: 'INK-PORTABLE-ASSET-PACKAGE', version: '1.0', mode: 'Portable Package', copied };
  }
  linkedDocument(assetIds) { return { format: 'INK-LINKED-ASSETS', version: '1.0', mode: 'Linked Document', assets: assetIds.map(assetId => { const asset = this.entry(assetId); return { assetId, path: asset.path, hash: asset.hash, embedded: false }; }) }; }
}
