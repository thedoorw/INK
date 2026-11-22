import { documentFingerprint } from '../document/integrity.js';
export function pinImportTarget(app) {
  if(!app.documentOpen)throw new Error('INK_OPEN_DOCUMENT_REQUIRED');
  if(app.layer().locked)throw new Error('INK_ACTIVE_LAYER_LOCKED');
  if(app.history.pending)throw new Error('INK_HISTORY_BUSY');
  const doc=app.doc,fingerprint=documentFingerprint(doc),layer=app.layer(),session=JSON.stringify(app.sessions?.current?.()??null);
  return ()=>{
    if(app.doc!==doc||!app.documentOpen||app.layer()!==layer||documentFingerprint(app.doc)!==fingerprint||JSON.stringify(app.sessions?.current?.()??null)!==session)
      throw Object.assign(new Error('INK_ARTWORK_TARGET_CHANGED'),{code:'INK_ARTWORK_TARGET_CHANGED'});
    if(app.layer().locked)throw new Error('INK_ACTIVE_LAYER_LOCKED');
    if(app.history.pending)throw new Error('INK_HISTORY_BUSY');
  };
}
