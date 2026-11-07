export function migrateDocumentAssetManifest(document) {
  const existing = document.assetManifest && typeof document.assetManifest === 'object' ? structuredClone(document.assetManifest) : null;
  document.assetManifest = existing || { format: 'INK-DOCUMENT-ASSET-MANIFEST', version: '1.0', mode: 'Linked Document', assets: [], migration: 'LEGACY_NO_MANIFEST' };
  return { document, report: { format: 'INK-ASSET-MANIFEST-MIGRATION', version: '1.0', status: existing ? 'PRESERVED' : 'MIGRATED_EMPTY', assetCount: document.assetManifest.assets?.length || 0 } };
}
