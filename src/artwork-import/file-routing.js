import { documentFingerprint } from '../document/integrity.js';

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
export async function routeArtworkFile(app,file,{confirm=globalThis.confirm}={}) {
  const format=artworkFileFormat(file);
  if(!format)return {handled:false};
  const context=captureArtworkContext(app),limit=ARTWORK_FORMAT_LIMITS[format].decoder;
  if(!Number.isSafeInteger(file.size)||file.size<1||file.size>limit)artworkFail('INK_ARTWORK_FILE_SIZE_LIMIT');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.length!==file.size)artworkFail('INK_ARTWORK_FILE_SIZE_CHANGED');
  assertArtworkContext(app,context);
  if(!app.documentOpen)artworkFail('INK_OPEN_DOCUMENT_REQUIRED');
  const warning=format==='ai'
    ? '有限 AI 匯入：僅支援 PDF 相容內容。字型、排版、漸層、效果及 Illustrator 私有圖層可能不同；不是完整保真。匯入後請另存 .ink 並核對原稿。是否繼續？'
    : '有限 PSD／PSB 匯入：僅支援部分 RGB8 圖層。遮色片預覽為靜態，編輯遮色片不會即時更新；智慧型物件、效果及色彩管理未完整保留。匯入後請另存 .ink 並核對原稿。是否繼續？';
  if(typeof confirm!=='function')artworkFail('INK_ARTWORK_CONFIRMATION_REQUIRED');
  if(!confirm(warning))return {handled:true,receipt:false};
  assertArtworkContext(app,context);
  const receipt=format!=='ai'?app.importPsdLayers(bytes):app.importAiDocument(bytes);
  return {handled:true,receipt:await receipt};
}

