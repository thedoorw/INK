import { normalizeNewDocumentSizeRequest } from '../../document/size.js';

export const normalizeNewDocumentRequest=normalizeNewDocumentSizeRequest;

export function createUiB002DocumentAdapter(app){
  if(!app)throw new TypeError('INK_UI_B_002_DOCUMENT_APP_REQUIRED');
  return Object.freeze({
    newDocument(args={},execution=null){
      const spec=normalizeNewDocumentRequest(args);
      const nativeResult=app.newDocument?.(spec?{artboard:spec.artboard,execution}:{execution});
      return{changed:nativeResult?.changed===true,result:{
        documentId:app.doc?.id||null,title:app.doc?.title||null,cancelled:Boolean(nativeResult?.cancelled),spec:spec||null
      }};
    }
  });
}
