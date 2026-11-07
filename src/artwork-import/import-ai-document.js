import { pinImportTarget } from './import-context.js';
import { decodeAdobeArtwork } from './adobe-core.js';
import { adobeNativeEngineFor,adobeIllustratorEngineFor } from './adobe-native-engine.js';
import { uid } from '../core/index.js';
export async function importAiDocument(app,input) {
  if(!app.documentOpen)throw new Error('INK_OPEN_DOCUMENT_REQUIRED');
  if(app.layer().locked)throw new Error('INK_ACTIVE_LAYER_LOCKED');
  if(app.history.pending)throw new Error('INK_HISTORY_BUSY');
  const assertTarget=pinImportTarget(app);
  const {layers,receipt}=await decodeAdobeArtwork(input,{uid,format:'ai',nativeEngine:adobeNativeEngineFor(app),illustratorEngine:adobeIllustratorEngineFor(app)});assertTarget();
  const page=app.page(),path=app.pagePath();
  layers.at(-1).importFidelity=receipt;
  app.history.pushScoped('Import Illustrator PDF display vectors',[[...path,'layers'],[...path,'activeLayerId']],()=>{
    page.layers.push(...layers);page.activeLayerId=layers.at(-1).id;
  });
  app.selection=[];app.spatialDirty=true;app.refreshAll();return receipt;
}

