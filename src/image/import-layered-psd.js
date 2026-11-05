import { pinImportTarget } from '../artwork-import/import-context.js';
import { decodeLayeredPsdAsync } from './formats/psd-layered.js';
import { uid } from '../core/index.js';

export async function importLayeredPsd(app, input) {
  if (!app.documentOpen) throw new Error('INK_OPEN_DOCUMENT_REQUIRED');
  if (app.layer().locked) throw new Error('INK_ACTIVE_LAYER_LOCKED');
  if (app.history.pending) throw new Error('INK_HISTORY_BUSY');
  const assertTarget=pinImportTarget(app);
  const result = await decodeLayeredPsdAsync(input, { uid });
  assertTarget();
  result.layers.at(-1).importFidelity = result.receipt;
  const page = app.page(), path = app.pagePath();
  app.history.pushScoped('Import layered PSD', [[...path, 'layers'], [...path, 'activeLayerId']], () => {
    page.layers.push(...result.layers);
    page.activeLayerId = result.layers.at(-1).id;
  });
  app.selection = [];
  app.spatialDirty = true;
  app.refreshAll();
  return result.receipt;
}
