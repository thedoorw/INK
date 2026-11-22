import { documentFingerprint } from '../document/integrity.js';
import { planAdobeImport, decodeAdobeArtwork } from './adobe-core.js';
import { adobeNativeEngineFor, adobeIllustratorEngineFor } from './adobe-native-engine.js';

export const ARTWORK_FORMAT_LIMITS = Object.freeze({
  psd: Object.freeze({decoder:32*1024*1024,driveInbox:8*1024*1024,tool:'import_ink_psd_layers'}),
  ai: Object.freeze({decoder:8*1024*1024,driveInbox:8*1024*1024,tool:'import_ink_ai_document'}),
  psb: Object.freeze({decoder:32*1024*1024,driveInbox:8*1024*1024,tool:'import_ink_psd_layers'})
});
export const artworkFail = code => {throw Object.assign(new Error(code),{code});};
export function captureArtworkContext(app) {
  return {documentId:app.doc?.id,pageId:app.doc?.activePageId,
    session:app.sessions?.current?.()??null,fingerprint:documentFingerprint(app.doc)};
}
export function assertArtworkContext(app,expected) {
  if(expected && JSON.stringify(captureArtworkContext(app))!==JSON.stringify(expected))
    artworkFail('INK_ARTWORK_TARGET_CHANGED');
}
export function artworkFileFormat(file) {
  return String(file?.name||'').match(/\.(psd|psb|ai)$/i)?.[1].toLowerCase()??null;
}
// Returns handled:false for .ink/.json and ordinary images; their original routes
// stay authoritative. No format is routed to document.open.v1 by this module.
export async function routeArtworkFile(app,file,{confirm=globalThis.confirm,execution=null}={}) {
  const format=artworkFileFormat(file);
  if(!format)return {handled:false};
  const context=captureArtworkContext(app),limit=ARTWORK_FORMAT_LIMITS[format].decoder;
  if(!Number.isSafeInteger(file.size)||file.size<1||file.size>limit)artworkFail('INK_ARTWORK_FILE_SIZE_LIMIT');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.length!==file.size)artworkFail('INK_ARTWORK_FILE_SIZE_CHANGED');
  assertArtworkContext(app,context);
  // Reject unsupported high-depth/legacy engines and mislabeled files before
  // creating a startup document. Never switch engines from the suffix alone.
  const nativeEngine=adobeNativeEngineFor(app);
  const illustratorEngine=adobeIllustratorEngineFor(app);
  const plan=planAdobeImport(bytes,{format,nativeEngine,illustratorEngine});
  const warning=format==='ai'&&plan.engine==='vectorcraft-ai-0.22.0'
     ? 'Illustrator 原始私有結構將交由已授權的 VectorCraft 本機引擎解析並映射 INK，可編輯性與字型、畫板及效果可能部分保真。是否繼續？'
     : format==='ai'&&plan.engine==='create-design-ai-browser-0.0.17'
    ? 'Illustrator 私有原生來源將在瀏覽器解析為 INK 物件；未知語意可能回退 PDF 顯示內容，非完整 Adobe 保真。是否繼續？'
    : format==='ai'&&plan.engine==='create-design-ai-0.0.17'
    ? 'Illustrator Native 私有來源由授權的本機 Node 引擎解析；仍可能遺失效果、字體與畫板語意。是否繼續？'
    : format==='ai'
    ? '有限 AI 匯入：僅支援 PDF 相容內容。字型、排版、漸層、效果及 Illustrator 私有圖層可能不同；不是完整保真。匯入後請另存 .ink 並核對原稿。是否繼續？'
    : plan.engine==='ag-psd@34.1.0'
      ? 'ag-psd RGB16 匯入會建立可編輯 Native 物件；部分遮色片、效果與智慧型物件不保證保真。是否繼續？'
    : plan.engine==='photoshopapi-0.9.1-rgb16'
      ? '有限 RGB16 PSD／PSB 匯入：使用已綁定的本機 PhotoshopAPI；保留 16-bit 像素與 ICC，但圖層效果及私有語意未完整驗證，不是完整保真。匯入後請另存 .ink 並核對原稿。是否繼續？'
      : '有限 PSD／PSB 匯入：僅支援部分 RGB8 圖層。遮色片預覽為靜態，編輯遮色片不會即時更新；智慧型物件、效果及色彩管理未完整保留。匯入後請另存 .ink 並核對原稿。是否繼續？';
  if(typeof confirm!=='function')artworkFail('INK_ARTWORK_CONFIRMATION_REQUIRED');
  if(!confirm(warning))return {handled:true,receipt:false};
  assertArtworkContext(app,context);
  // File/Open also works from the empty startup shell. Create through the
  // existing session authority only after consent; cancellation stays blank.
  if(!app.documentOpen){
    // Header admission cannot prove that layer records/channels/PDF streams are
    // decodable. Validate the whole bounded import before session creation.
    // Preview IDs are local to discarded decode output; no Native state changes.
    let previewId=0;
    await decodeAdobeArtwork(bytes,{format,nativeEngine,illustratorEngine,uid:()=>`open-preflight-${++previewId}`});
    assertArtworkContext(app,context);
    execution?.assertDocumentCurrent?.();
    await app.sessions?.waitForAutosaves?.();
    assertArtworkContext(app,context);
    execution?.assertDocumentCurrent?.();
    await app.newDocument({execution});
  }
  const receipt=format!=='ai'?app.importPsdLayers(bytes):app.importAiDocument(bytes);
  return {handled:true,receipt:await receipt};
}


