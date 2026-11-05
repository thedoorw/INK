import { inspectDocument } from './integrity.js';
import { FORMAT_VERSION } from '../config.js';

// Transport only. Native validation, opening, editing and autosave stay with InkApp.
const MAX_BYTES = 8 * 1024 * 1024;
const idPattern = /^[A-Za-z0-9_-]{10,160}$/;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const validId = id => typeof id === 'string' && idPattern.test(id);
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const digest = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
const encode = value => new TextEncoder().encode(value);

export function parseDriveNativeLink(value) {
  const url = new URL(value);
  const fields = ['inkDrive', 'inkDocument', 'inkSha256'];
  if (!fields.some(k => url.searchParams.has(k))) return null;
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) fail('INK_LINK_HTTPS_REQUIRED');
  if (fields.some(k => url.searchParams.getAll(k).length !== 1)) fail('INK_LINK_INVALID');
  const fileId = url.searchParams.get('inkDrive');
  const documentId = url.searchParams.get('inkDocument');
  const sha256 = url.searchParams.get('inkSha256');
  if (!validId(fileId) || !validId(documentId) || !/^[a-f0-9]{64}$/.test(sha256)) fail('INK_LINK_INVALID');
  if (url.username || url.password || url.hash) fail('INK_LINK_INVALID');
  return { fileId, documentId, sha256 };
}

export function makeDriveNativeLink(base, identity) {
  const url = new URL(base);
  if (url.protocol !== 'https:' && !(['localhost','127.0.0.1'].includes(url.hostname) && url.protocol === 'http:')) fail('INK_LINK_HTTPS_REQUIRED');
  if (url.username || url.password || url.hash || url.search) fail('INK_LINK_BASE_INVALID');
  for (const [key,value] of Object.entries({ inkDrive:identity.fileId, inkDocument:identity.documentId, inkSha256:identity.sha256 })) url.searchParams.set(key,value);
  parseDriveNativeLink(url.href);
  return url.href;
}

async function boundedBytes(response, limit) {
  const declared = response.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) fail('INK_LINK_SIZE_LIMIT');
  if (!response.body) fail('INK_LINK_EMPTY');
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done,value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) fail('INK_LINK_SIZE_LIMIT');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(()=>{}); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  return bytes;
}

export function createDriveNativeLinks(app, { getAccessToken, fetchImpl = globalThis.fetch,
  editorUrl = 'https://thedoorw.github.io/INK/', timeoutMs = 20000 } = {}) {
  if (!app?.commands?.execute || typeof getAccessToken !== 'function') fail('INK_LINK_AUTH_CONFIGURATION_REQUIRED');
  // getAccessToken is trusted first-party configuration; never taken from URLs/storage.
  const bindings = new Map();
  let busy = false;
  async function exclusive(task) {
    if (busy) fail('INK_LINK_BUSY');
    busy = true;
    try { return await task(); } finally { busy = false; }
  }
  async function request(url, options = {}) {
    let token;
    try { token = await getAccessToken(); } catch { fail('INK_LINK_AUTH_REQUIRED'); }
    if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) fail('INK_LINK_AUTH_REQUIRED');
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), Math.min(60000,Math.max(1000,timeoutMs)));
    try {
      const response = await fetchImpl(url,{ ...options,signal:abort.signal,credentials:'omit',redirect:'error',
        headers:{ ...options.headers,Authorization:'Bearer '+token } });
      if (!response.ok) {
        if ([401,403].includes(response.status)) fail('INK_LINK_ACCESS_DENIED');
        if ([404,410].includes(response.status)) fail('INK_LINK_NOT_FOUND_OR_REVOKED');
        fail('INK_LINK_REMOTE_ERROR');
      }
      return await boundedBytes(response,MAX_BYTES);
    } catch (error) {
      // Avoid logging provider responses, URLs, tokens or fetch implementation errors.
      if (error?.code?.startsWith('INK_LINK_')) throw error;
      fail(abort.signal.aborted ? 'INK_LINK_TIMEOUT' : 'INK_LINK_NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({
    async listRecoverable() {
      return exclusive(async () => {
        // drive.file sees only files authorized for this INK OAuth app; no broad Drive scope.
        const query = new URL('https://www.googleapis.com/drive/v3/files');
        query.searchParams.set('q',"trashed = false and mimeType = 'application/json' and name contains 'INK-'");
        query.searchParams.set('fields','nextPageToken,files(id,name,mimeType,createdTime,appProperties)');
        query.searchParams.set('orderBy','createdTime desc');
        query.searchParams.set('pageSize','100');
        const bytes = await request(query.href);
        let result;
        try { result = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
        catch { fail('INK_LINK_DISCOVERY_INVALID'); }
        if (!Array.isArray(result?.files) || result.files.length > 100) fail('INK_LINK_DISCOVERY_INVALID');
        return result.files.filter(item => {
          const docId=item?.appProperties?.nativeDocumentId;
          const sha=item?.appProperties?.nativeSha256;
          return validId(item?.id) && validId(docId) && /^[a-f0-9]{64}$/.test(sha) &&
            item.mimeType==='application/json' &&
            item.name==='INK-'+docId+'-'+sha.slice(0,12)+'.ink';
        }).slice(0,20).map(item => Object.freeze({
          fileId:item.id,documentId:item.appProperties.nativeDocumentId,
          sha256:item.appProperties.nativeSha256,
          name:item.name,createdTime:typeof item.createdTime==='string'?item.createdTime:null
        }));
      });
    },
    async open(link) {
      return exclusive(async () => {
        const identity = parseDriveNativeLink(link);
        if (!identity) fail('INK_LINK_INVALID');
        if (app.dirty || app.history?.pending) fail('INK_LINK_UNSAVED_DOCUMENT');
        const source = app.doc, before = source ? inspectDocument(source).fingerprint : null;
        const current = () => app.doc === source && !app.dirty && !app.history?.pending && (!source || inspectDocument(app.doc).fingerprint===before);
        const bytes = await request('https://www.googleapis.com/drive/v3/files/'+identity.fileId+'?alt=media');
        if (await digest(bytes) !== identity.sha256) fail('INK_LINK_DIGEST_MISMATCH');
        let doc;
        try { doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } catch { fail('INK_LINK_INVALID_JSON'); }
        if (doc?.format !== 'INK' || doc.formatVersion !== FORMAT_VERSION || doc.id !== identity.documentId || !inspectDocument(doc).passed) fail('INK_LINK_INVALID_DOCUMENT');
        if (!current()) fail('INK_LINK_STALE_DOCUMENT');
        const opened = await app.commands.execute('document.open.v1',{
          file:new File([bytes],'Drive.ink',{type:'application/json'}) },'chat');
        if (!opened?.ok || opened.result?.documentId!==identity.documentId || app.doc?.id!==identity.documentId) fail('INK_LINK_NATIVE_OPEN_FAILED');
        if(app.sessions?.active){
          app.sessions.active().values.portableHistoryEnabled=true;
          app.sessions.active().values.driveLinkIdentity=identity;
          if(await app.sessions.ensureActiveRecovery()!==true)fail('INK_LINK_NATIVE_OPEN_FAILED');
        }
        bindings.set(identity.documentId,identity);
        return { schema:'INK_DRIVE_NATIVE_LINK_RECEIPT_V1',action:'open',...identity,bytes:bytes.length,
          nativeFingerprint:inspectDocument(app.doc).fingerprint,persisted:true };
      });
    },
    async saveAsRevision() {
      return exclusive(async () => {
        const source = app.doc;
        if (!app.documentOpen) fail('INK_LINK_NO_NATIVE_DOCUMENT');
        if (!source || app.history?.pending || !inspectDocument(source).passed) fail('INK_LINK_INVALID_DOCUMENT');
        const originalText=JSON.stringify(source,null,2);
        const activeSession=app.sessions?.active?.();
        const stillCurrent=()=>app.documentOpen===true&&app.doc===source&&!app.history?.pending&&
          JSON.stringify(app.doc,null,2)===originalText&&app.sessions?.active?.()===activeSession;
        const payload=app.sessions?.projectPayload?.(source,{history:true})||source;
        const text = JSON.stringify(payload,null,2), bytes = encode(text);
        if (bytes.length > MAX_BYTES) fail('INK_LINK_SIZE_LIMIT');
        const sha256 = await digest(bytes), parent = bindings.get(source.id)||app.sessions?.active?.()?.values.driveLinkIdentity;
        // Immutable revisions avoid cross-client lost updates. Never PATCH/overwrite a file.
        const metadata = {name:'INK-'+source.id+'-'+sha256.slice(0,12)+'.ink',mimeType:'application/json',
          appProperties:{nativeDocumentId:source.id,nativeSha256:sha256,...(parent?{nativeParentFile:parent.fileId}:{})}};
        const boundary = 'ink_'+crypto.randomUUID().replaceAll('-','');
        const multipart = new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
          JSON.stringify(metadata),'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n',bytes,'\r\n--'+boundary+'--\r\n']);
        const responseBytes = await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{
          method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body:multipart });
        let response;
        try { response=JSON.parse(new TextDecoder().decode(responseBytes)); } catch { fail('INK_LINK_UPLOAD_RECEIPT_INVALID'); }
        if (!validId(response.id)) fail('INK_LINK_UPLOAD_RECEIPT_INVALID');
        const identity = {fileId:response.id,documentId:source.id,sha256};
        const stored = await request('https://www.googleapis.com/drive/v3/files/'+identity.fileId+'?alt=media');
        if (await digest(stored)!==sha256) fail('INK_LINK_SAVE_READBACK_MISMATCH');
        // Uploads are immutable, but an intervening Native edit/session switch must not
        // be advertised as the current artwork's successfully saved revision.
        if(!stillCurrent())fail('INK_LINK_STALE_DOCUMENT');
        const link = makeDriveNativeLink(editorUrl,identity);
        bindings.set(source.id,identity);
        if(app.sessions?.active){app.sessions.active().values.driveLinkIdentity=identity;
          app.sessions.active().values.portableHistoryEnabled=true;
          if(await app.sessions.ensureActiveRecovery()!==true)fail('INK_LINK_NATIVE_SAVE_RECOVERY_FAILED');}
        return {schema:'INK_DRIVE_NATIVE_LINK_RECEIPT_V1',action:'save',...identity,link,bytes:bytes.length,
          parentFileId:parent?.fileId||null,revisionPolicy:'IMMUTABLE_NEW_FILE',
          currentDocumentUnchanged:true};
      });
    }
  });
}
