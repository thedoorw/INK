import { normalizeNewDocumentRequest } from '../../ui/modular-ui/menu-tools-dialogs/new-document.js';

export function createUiB002DocumentAdapter(app){
  if(!app)throw new TypeError('INK_UI_B_002_DOCUMENT_APP_REQUIRED');
  return Object.freeze({
    newDocument(args={}){
      const spec=normalizeNewDocumentRequest(args);
      const nativeResult=app.newDocument?.(spec?{artboard:spec.artboard}:{});
      const changed=nativeResult?.changed===true;
      return{changed,result:{documentId:app.doc?.id||null,title:app.doc?.title||null,cancelled:Boolean(nativeResult?.cancelled),spec:spec||null}};
    }
  });
}
