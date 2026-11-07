import { decodeAdobeArtwork } from './adobe-core.js';
import { adobeNativeEngineFor,adobeIllustratorEngineFor } from './adobe-native-engine.js';
import { ARTWORK_FORMAT_LIMITS,captureArtworkContext,assertArtworkContext,artworkFail as fail } from './file-routing.js';
const MAX_AGE=5*60*1000;
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{10,160}$/.test(value);
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
const clone=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// The transport is injected ONLY by trusted first-party browser composition.
// Its read() must perform its own authenticated, bounded Google read and return
// independently observed metadata. It is not a CHAT-provided JSON attestation.
// #534 v1 has no such external-format contract; default configuration is blocked.
export function createExternalArtworkIngress(app,{transport=null,clock=()=>Date.now()}={}) {
  let challenge=null,pending=null,busy=false,disposed=false;
  const wipe=()=>{pending?.bytes.fill(0);pending=null;};
  const clear=()=>{wipe();challenge=null;};
  function configured(){
    if(disposed)fail('INK_ARTWORK_INGRESS_DISPOSED');
    if(!transport||transport.schema!=='INK_EXTERNAL_ARTWORK_TRANSPORT_V1'||
      typeof transport.read!=='function'||typeof transport.currentAccountKey!=='function'||
      !validId(transport.inboxId)||transport.maxBytes!==8*1024*1024)
      fail('INK_ARTWORK_CROSS_OAUTH_BLOCKED');
  }
  const active=()=>{
    if(!app.documentOpen||!app.sessions?.current?.())fail('INK_ARTWORK_OPEN_SESSION_REQUIRED');
    if(app.history?.pending)fail('INK_HISTORY_BUSY');
    if(app.layer?.()?.locked)fail('INK_ACTIVE_LAYER_LOCKED');
  };
  const exclusive=async fn=>{
    if(disposed)fail('INK_ARTWORK_INGRESS_DISPOSED');
    if(busy)fail('INK_ARTWORK_INGRESS_BUSY');busy=true;
    try{return await fn();}finally{busy=false;}
  };
  const current=()=>{
    configured();active();
    if(!challenge)fail('INK_ARTWORK_CHALLENGE_REQUIRED');
    if(clock()<challenge.issuedAt||clock()>challenge.expiresAt)fail('INK_ARTWORK_REQUEST_EXPIRED');
    assertArtworkContext(app,challenge.context);
    if(transport.currentAccountKey()!==challenge.accountKey)fail('INK_ARTWORK_ACCOUNT_CHANGED');
  };
  async function read(){
    current();const ref=challenge;
    const observed=await transport.read({inboxId:transport.inboxId,requestId:ref.requestId,maxBytes:transport.maxBytes});
    current();
    if(challenge!==ref)fail('INK_ARTWORK_CHALLENGE_CHANGED');
    const {bytes,source}=observed??{};
    if(observed?.origin!=='INK_FIRST_PARTY_DRIVE_READ'||observed.inboxId!==transport.inboxId||
      observed.mailboxRole!=='ink-chat-inbox-v1'||observed.accountKey!==ref.accountKey||
      !source||source.requestId!==ref.requestId||!validId(source.fileId)||
      typeof source.revision!=='string'||!(/^[A-Za-z0-9._:-]{1,160}$/).test(source.revision)||typeof source.modifiedTime!=='string'||source.modifiedTime.length>64||!Number.isFinite(Date.parse(source.modifiedTime)))
      fail('INK_ARTWORK_ORIGIN_OR_IDENTITY_INVALID');
    const policy=ARTWORK_FORMAT_LIMITS[source.format];
    if(!policy?.tool)fail('INK_ARTWORK_FORMAT_UNSUPPORTED');
    const limit=Math.min(policy.decoder,policy.driveInbox,transport.maxBytes);
    if(!Number.isSafeInteger(source.byteLength)||source.byteLength<1||source.byteLength>limit)
      fail('INK_ARTWORK_DRIVE_FORMAT_SIZE_LIMIT');
    if(!(bytes instanceof Uint8Array)||bytes.length!==source.byteLength)fail('INK_ARTWORK_BYTES_REQUIRED');
    if(typeof source.sha256!=='string'||!/^[a-f0-9]{64}$/.test(source.sha256))fail('INK_ARTWORK_DIGEST_REQUIRED');
    const copy=new Uint8Array(bytes);
    try{
      if(await digest(copy)!==source.sha256)fail('INK_ARTWORK_DIGEST_MISMATCH');
      current();if(challenge!==ref)fail('INK_ARTWORK_CHALLENGE_CHANGED');
      return {bytes:copy,source:Object.fromEntries(['format','fileId','revision','modifiedTime','byteLength','sha256','requestId'].map(key=>[key,source[key]]))};
    }catch(error){copy.fill(0);throw error;}
  }
  if(transport)configured();
  return Object.freeze({
    schema:'INK_EXTERNAL_ARTWORK_INGRESS_V1',
    state:()=>({status:disposed?'DISPOSED':!transport?'CROSS_OAUTH_BLOCKED':pending?'PENDING_CONFIRMATION':challenge?'AWAITING_SOURCE':'IDLE',
      pending:pending?{source:clone(pending.source),fidelity:clone(pending.fidelity)}:null}),
    issueChallenge(){
      if(busy)fail('INK_ARTWORK_INGRESS_BUSY');configured();active();clear();
      const accountKey=transport.currentAccountKey();
      if(typeof accountKey!=='string'||!accountKey||accountKey.length>256)fail('INK_ARTWORK_ACCOUNT_REQUIRED');
      const issuedAt=clock();challenge={requestId:crypto.randomUUID(),issuedAt,expiresAt:issuedAt+MAX_AGE,accountKey,context:captureArtworkContext(app)};
      return {requestId:challenge.requestId,expiresAt:challenge.expiresAt,inboxId:transport.inboxId};
    },
    prepare:()=>exclusive(async()=>{
      wipe();let value=null;
      try{
        value=await read();let counter=0;
        const previewUid=()=>`preview-${++counter}`;
        // Actual strict decoder preflight: no fabricated preview and no Native mutation.
        const preview=await decodeAdobeArtwork(value.bytes,{uid:previewUid,format:value.source.format,nativeEngine:adobeNativeEngineFor(app),illustratorEngine:adobeIllustratorEngineFor(app)});
        current();pending={...value,fidelity:preview.receipt};
        return {status:'PENDING_CONFIRMATION',source:clone(value.source),fidelity:clone(preview.receipt)};
      }catch(error){value?.bytes.fill(0);clear();throw error;}
    }),
    confirm:()=>exclusive(async()=>{
      let reread=null;
      try{
        current();if(!pending)fail('INK_ARTWORK_NO_PENDING');
        const prepared=pending;reread=await read();
        if(!same(prepared.source,reread.source))fail('INK_ARTWORK_SOURCE_CHANGED');
        current();
        const tool=ARTWORK_FORMAT_LIMITS[prepared.source.format].tool;
        if(typeof app.inkPublicApi?.tools?.invoke!=='function')fail('INK_ARTWORK_NAMED_ROUTE_REQUIRED');
        // Burn the challenge BEFORE dispatch. Failure also requires a fresh nonce.
        const context=challenge.context;challenge=null;
        const file=new File([prepared.bytes],`Drive source.${prepared.source.format}`,{type:'application/octet-stream'});
        const result=await app.inkPublicApi.tools.invoke(tool,{input:file,options:{expectedContext:context}});
        if(result?.status!=='COMPLETED')fail(result?.diagnostics?.[0]?.code||'INK_ARTWORK_NATIVE_IMPORT_FAILED');
        return {status:'IMPORTED',requestId:prepared.source.requestId,source:clone(prepared.source),
          documentId:app.doc.id,receipt:result.result?.receipt,transportAcknowledged:false};
      }finally{reread?.bytes.fill(0);clear();}
    }),
    cancel(){if(busy)fail('INK_ARTWORK_INGRESS_BUSY');clear();return {status:'CANCELLED'};},
    dispose(){if(busy)fail('INK_ARTWORK_INGRESS_BUSY');disposed=true;clear();}
  });
}

