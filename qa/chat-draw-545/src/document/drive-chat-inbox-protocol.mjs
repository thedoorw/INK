// Stable, purely declarative mailbox filenames. Neither tokens nor private bytes
// are embedded here. A filename is a claim until the INK receiver hashes bytes.
export const INK_CHAT_MAILBOX_ROLE = 'ink-chat-inbox-v1';
export const INK_CHAT_INBOX_EMPTY = 'INKCHAT1__empty.bin';
export const INK_CHAT_INBOX_MAX_BYTES = 8 * 1024 * 1024;
const FILE_ID = /^[A-Za-z0-9_-]{10,96}$/;
const DOC_ID = /^[A-Za-z0-9_-]{10,96}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REQUEST_ID = /^[a-z0-9][a-z0-9-]{7,47}$/;
const fail = code => { throw Object.assign(new Error(code), {code}); };
const hasOwn = (o,k) => Object.prototype.hasOwnProperty.call(o,k);

export function createInkChatRequestName({format='ink',fileId,documentId,sha256,requestId}={}) {
  if (format!=='ink' || !FILE_ID.test(fileId||'') || !DOC_ID.test(documentId||'') ||
      !DIGEST.test(sha256||'') || !REQUEST_ID.test(requestId||'')) fail('INK_CHAT_INBOX_IDENTITY_INVALID');
  const name=['INKCHAT1',format,fileId,documentId,sha256,requestId].join('__')+'.bin';
  if(name.length>240)fail('INK_CHAT_INBOX_NAME_TOO_LONG');
  return name;
}

export function parseInkChatRequestName(name) {
  if(typeof name!=='string'||name.length>240)return null;
  const fields=name.match(/^INKCHAT1__(ink|recipe|psd|psb|ai)__([A-Za-z0-9_-]{10,96})__([A-Za-z0-9_-]{10,96}|_)__([a-f0-9]{64})__([a-z0-9][a-z0-9-]{7,47})\.bin$/);
  if(!fields)return null;
  const [,format,fileId,documentId,sha256,requestId]=fields;
  if(format!=='ink'||!DOC_ID.test(documentId))return {unsupported:true,format,requestId};
  return Object.freeze({format,fileId,documentId,sha256,requestId});
}

export function makeInkChatCompletionName({status,requestId,documentId}={}){
  if(!['opened','rejected','recovery-required'].includes(status) || !REQUEST_ID.test(requestId||'')||
     !DOC_ID.test(documentId||''))fail('INK_CHAT_INBOX_ACK_INVALID');
  return ['INKCHAT1',status,requestId,documentId].join('__')+'.bin';
}
export function parseInkChatCompletionName(name){
  if(typeof name!=='string')return null;
  const fields=name.match(/^INKCHAT1__(opened|rejected|recovery-required)__([a-z0-9][a-z0-9-]{7,47})__([A-Za-z0-9_-]{10,96})\.bin$/);
  if(!fields)return null;
  return Object.freeze({status:fields[1],requestId:fields[2],documentId:fields[3]});
}

export function isInkChatMailboxMetadata(file,id){
  return Boolean(file && file.id===id &&
    file.mimeType==='application/octet-stream' &&
    file.appProperties?.inkChatMailbox===INK_CHAT_MAILBOX_ROLE &&
    !file.trashed);
}
