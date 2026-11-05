import {
  INK_CHAT_MAILBOX_ROLE, INK_CHAT_INBOX_EMPTY, INK_CHAT_INBOX_MAX_BYTES,
  parseInkChatRequestName, parseInkChatCompletionName, makeInkChatCompletionName,
  isInkChatMailboxMetadata
} from './drive-chat-inbox-protocol.mjs';

// INK first-party Google Drive API mailbox. CHAT updates the SAME app-created
// Drive file via its independently authorized Drive connector. No MCP/Runner.
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const fail = code => { throw Object.assign(new Error(code), {code}); };
const decode = bytes => new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const sha256 = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(value=>value.toString(16).padStart(2,'0')).join('');

async function bounded(response,limit){
  const declared=response.headers?.get?.('content-length');
  if(declared && (!/^\d+$/.test(declared) || Number(declared)>limit))
    fail('INK_CHAT_INBOX_RESPONSE_LIMIT');
  const chunks=[]; let bytes=0;
  if(!response.body?.getReader)fail('INK_CHAT_INBOX_STREAM_REQUIRED');
  const reader=response.body.getReader();
  try {
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>limit)fail('INK_CHAT_INBOX_RESPONSE_LIMIT');
      chunks.push(value);
    }
  }finally{await reader.cancel().catch(()=>{});}
  const raw=new Uint8Array(bytes);let at=0;
  for(const chunk of chunks){raw.set(chunk,at);at+=chunk.length;}
  return raw;
}

export function createFirstPartyDriveChatInbox(app,{
  getAccessToken,fetchImpl=globalThis.fetch,clock=()=>Date.now(),
  maxBytes=INK_CHAT_INBOX_MAX_BYTES
}={}){
  if(typeof getAccessToken!=='function'||typeof fetchImpl!=='function'||
     typeof app?.nativeFileInput?.open!=='function') fail('INK_CHAT_INBOX_CONFIGURATION_REQUIRED');
  if(maxBytes<1||maxBytes>INK_CHAT_INBOX_MAX_BYTES)fail('INK_CHAT_INBOX_SIZE_LIMIT');
  let inboxId=null,pending=null,last=null,disposed=false,busy=false;
  // An opened document must never be reopened to recover autosave or ACK.
  let opened=null;
  const clearPending=()=>{pending?.bytes?.fill(0);pending=null;};
  const request=async(url,{method='GET',headers={},body,limit=40960}={})=>{
    if(disposed)fail('INK_CHAT_INBOX_DISPOSED');
    const token=await getAccessToken();
    if(typeof token!=='string'||!token||/[\r\n]/.test(token))fail('INK_CHAT_INBOX_AUTH_REQUIRED');
    const response=await fetchImpl(url,{
      method,cache:'no-store',credentials:'omit',redirect:'error',
      headers:{Authorization:'Bearer '+token,...headers},...(body===undefined?{}:{body})
    });
    if(!response.ok){
      if(response.status===401||response.status===403)fail('INK_CHAT_INBOX_ACCESS_DENIED');
      if(response.status===404||response.status===410)fail('INK_CHAT_INBOX_NOT_FOUND');
      fail('INK_CHAT_INBOX_REMOTE_ERROR');
    }
    return bounded(response,limit);
  };
  const json=async(url,options)=> {
    let value;
    try{value=JSON.parse(decode(await request(url,options)));}
    catch(error){if(error?.code)throw error;fail('INK_CHAT_INBOX_BAD_RESPONSE');}
    return value;
  };
  const metadata=async()=>{
    if(!inboxId)fail('INK_CHAT_INBOX_NOT_CONFIGURED');
    const url=API+'/'+encodeURIComponent(inboxId)+'?fields=id,name,mimeType,size,modifiedTime,appProperties,trashed';
    const info=await json(url);
    if(!isInkChatMailboxMetadata(info,inboxId))fail('INK_CHAT_INBOX_IDENTITY_CHANGED');
    return info;
  };
  const exclusive=async task=>{
    if(busy)fail('INK_CHAT_INBOX_BUSY');
    busy=true;
    try{return await task();}finally{busy=false;}
  };
  async function findOrCreate(){
    const url=new URL(API);
    url.searchParams.set('q',"trashed = false and appProperties has { key='inkChatMailbox' and value='"+INK_CHAT_MAILBOX_ROLE+"' }");
    url.searchParams.set('fields','nextPageToken,files(id,name,mimeType,appProperties,trashed)');
    url.searchParams.set('pageSize','20');
    const found=await json(url.href);
    if(!Array.isArray(found.files)||found.nextPageToken)fail('INK_CHAT_INBOX_DISCOVERY_INVALID');
    const files=found.files.filter(file=>file.appProperties?.inkChatMailbox===INK_CHAT_MAILBOX_ROLE);
    if(files.length>1)fail('INK_CHAT_INBOX_AMBIGUOUS');
    if(files.length===1){
      if(files[0].mimeType!=='application/octet-stream')fail('INK_CHAT_INBOX_FORMAT_CHANGED');
      inboxId=files[0].id;
      await metadata();
      return {fileId:inboxId,created:false};
    }
    const boundary='inkchat_'+crypto.randomUUID().replaceAll('-','');
    const body=new Blob([
      '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify({name:INK_CHAT_INBOX_EMPTY,mimeType:'application/octet-stream',
        appProperties:{inkChatMailbox:INK_CHAT_MAILBOX_ROLE}}),
      '\r\n--'+boundary+'\r\nContent-Type: application/octet-stream\r\n\r\n',
      '{}\n','\r\n--'+boundary+'--\r\n'
    ]);
    const result=await json(UPLOAD+'?uploadType=multipart&fields=id,name,mimeType,appProperties',{
      method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
    if(typeof result?.id!=='string'||!/^[-_a-zA-Z0-9]{10,160}$/.test(result.id))
      fail('INK_CHAT_INBOX_CREATE_INVALID');
    inboxId=result.id;
    await metadata();
    return {fileId:inboxId,created:true};
  }
  async function receive(){
    if(!inboxId)fail('INK_CHAT_INBOX_NOT_CONFIGURED');
    const before=await metadata();
    const receipt=parseInkChatCompletionName(before.name);
    if(receipt){
      if(receipt.status==='recovery-required'){
        const recoverable=Boolean(opened&&!opened.durable&&opened.requestId===receipt.requestId&&
          opened.documentId===receipt.documentId);
        clearPending();
        return {status:recoverable?'RECOVERY_REQUIRED':'RECOVERY_REQUIRED_AFTER_RELOAD',
          requestId:receipt.requestId,documentId:receipt.documentId,recoverable,neverReopen:true};
      }
      clearPending();
      if(opened&&receipt.requestId===opened.requestId&&receipt.status==='opened')opened=null;
      return {status:'COMPLETE',ackStatus:receipt.status,requestId:receipt.requestId,documentId:receipt.documentId};
    }
    if(opened){
      if(before.name!==opened.filename)fail('INK_CHAT_INBOX_STALE_REQUEST');
      return {status:opened.durable?'OPENED_ACK_PENDING':'RECOVERY_REQUIRED',
        requestId:opened.requestId,documentId:opened.documentId,
        recoverable:!opened.durable,neverReopen:true};
    }
    if(before.name===INK_CHAT_INBOX_EMPTY){
      clearPending();
      return {status:'EMPTY'};
    }
    const info=parseInkChatRequestName(before.name);
    if(!info)fail('INK_CHAT_INBOX_REQUEST_INVALID');
    if(info.unsupported)return {status:'UNSUPPORTED_FORMAT',format:info.format,requestId:info.requestId};
    if(pending?.requestId===info.requestId && pending.filename===before.name)
      return {status:'PENDING_CONFIRMATION',requestId:info.requestId,documentId:info.documentId,bytes:pending.bytes.length};
    clearPending();
    const size=Number(before.size);
    if(!Number.isSafeInteger(size)||size<1||size>maxBytes)fail('INK_CHAT_INBOX_SIZE_LIMIT');
    const bytes=await request(API+'/'+encodeURIComponent(inboxId)+'?alt=media',{limit:maxBytes});
    const after=await metadata();
    if(after.name!==before.name||after.modifiedTime!==before.modifiedTime||
       Number(after.size)!==bytes.length)fail('INK_CHAT_INBOX_STALE_REQUEST');
    if(await sha256(bytes)!==info.sha256)fail('INK_CHAT_INBOX_DIGEST_MISMATCH');
    pending={...info,bytes,filename:before.name,modifiedTime:before.modifiedTime};
    return {status:'PENDING_CONFIRMATION',requestId:info.requestId,documentId:info.documentId,bytes:bytes.length};
  }
  async function complete(accept){
    if(opened&&!accept)fail('INK_CHAT_INBOX_ALREADY_OPENED');
    const current=opened||pending;
    if(!current)fail('INK_CHAT_INBOX_NO_PENDING');
    const latest=await metadata();
    const recoveryName=makeInkChatCompletionName({
      status:'recovery-required',requestId:current.requestId,documentId:current.documentId});
    if(latest.name!==current.filename&&!(opened&&latest.name===recoveryName))
      fail('INK_CHAT_INBOX_STALE_REQUEST');
    if(!opened&&latest.modifiedTime!==current.modifiedTime)
      fail('INK_CHAT_INBOX_STALE_REQUEST');
    const patchAck=async name=>{
      if(latest.name===name)return true;
      try{
        const renamed=await json(API+'/'+encodeURIComponent(inboxId)+'?fields=id,name',{
          method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})
        });
        return renamed.id===inboxId&&renamed.name===name;
      }catch{return false;} // Never retry Native Open merely because ACK failed
    };
    if(!accept){
      const acknowledged=await patchAck(makeInkChatCompletionName({
        status:'rejected',requestId:current.requestId,documentId:current.documentId}));
      last={requestId:current.requestId,status:'REJECTED',acknowledged,documentId:current.documentId,receipt:null};
      if(acknowledged)clearPending();
      return {status:'REJECTED',acknowledged,receipt:null};
    }
    if(!opened){
      // Only the first confirmation may call the mutation authority.
      const receipt=await app.nativeFileInput.open({bytes:current.bytes,identity:{
        fileId:current.fileId,documentId:current.documentId,sha256:current.sha256
      }});
      if(!receipt?.nativeOpened||receipt.documentId!==current.documentId)
        fail('INK_CHAT_INBOX_NATIVE_OPEN_FAILED');
      opened={filename:current.filename,requestId:current.requestId,
        documentId:current.documentId,sessionId:receipt.sessionId??null,
        receipt,durable:receipt.status==='OPENED'&&receipt.recoveryPersisted===true};
      clearPending(); // Drop a redundant copy of the private source bytes
    }else if(!opened.durable){
      if(typeof app.nativeFileInput.retryRecovery!=='function'||!opened.sessionId)
        fail('INK_CHAT_INBOX_RECOVERY_CONTEXT_UNAVAILABLE');
      const retry=await app.nativeFileInput.retryRecovery({
        documentId:opened.documentId,sessionId:opened.sessionId});
      if(retry?.status==='RECOVERY_PERSISTED'&&retry.recoveryPersisted===true){
        opened.durable=true;opened.recoveryReceipt=retry;
      }
    }
    const durable=opened.durable;
    // CHAT may inspect recovery-required but MUST never see opened before
    // both source/History and recovery index are durable.
    const name=makeInkChatCompletionName({
      status:durable?'opened':'recovery-required',
      requestId:opened.requestId,documentId:opened.documentId});
    const acknowledged=await patchAck(name);
    const receipt=opened.receipt,recoveryReceipt=opened.recoveryReceipt??null;
    const status=durable?'OPENED':'OPENED_BUT_RECOVERY_FAILED';
    last={requestId:opened.requestId,status,acknowledged,documentId:opened.documentId,
      receipt,recoveryReceipt};
    if(durable&&acknowledged)opened=null;
    return {status,acknowledged,receipt,recoveryReceipt,
      recoveryPersisted:durable,neverReopen:true,
      nextAction:durable?(acknowledged?null:'RETRY_ACK_WITHOUT_REOPEN'):'RETRY_RECOVERY_WITHOUT_REOPEN'};
  }
  return Object.freeze({
    schema:'INK_FIRST_PARTY_DRIVE_CHAT_INBOX_V1',
    ensureInbox:()=>exclusive(findOrCreate),
    check:()=>exclusive(receive),
    accept:()=>exclusive(()=>complete(true)),
    reject:()=>exclusive(()=>complete(false)),
    state:()=>Object.freeze({configured:Boolean(inboxId),inboxId,
      recoveryRequired:Boolean(opened&&!opened.durable),
      acknowledgementPending:Boolean(opened&&opened.durable),
      pending:pending?{requestId:pending.requestId,documentId:pending.documentId,bytes:pending.bytes.length}:null,
      last}),
    dispose(){disposed=true;clearPending();opened=null;}
  });
}
