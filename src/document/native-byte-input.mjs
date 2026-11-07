// #544 source-neutral adapter ported from Draft #527; first-party document.open.v1 remains authority.
import {inspectDocument} from './integrity.js';
import {FORMAT_VERSION} from '../config.js';

// Must match the bounded first-party Native output, not Adobe source limits.
export const NATIVE_INPUT_LIMIT=12*1024*1024;
const ID=/^[A-Za-z0-9_-]{10,160}$/;
const SHA=/^[a-f0-9]{64}$/;
const busy=new WeakSet();
const fail=code=>{throw Object.assign(new Error(code),{code});};

// An in-process byte admission adapter, not another file parser or mutation owner.
// The authorized host supplies bytes; no URL, OAuth token or Drive permission here.
export function installNativeByteInput(app,{ready=app.startupDocumentReady}={}){
  if(!app?.commands?.execute)fail('INK_BYTE_INPUT_APP_REQUIRED');
  if(app.nativeFileInput)fail('INK_BYTE_INPUT_ALREADY_INSTALLED');
  const service=Object.freeze({schema:'INK_NATIVE_BYTE_INPUT_V1',async open({bytes,identity}={}){
    if(busy.has(app))fail('INK_BYTE_INPUT_BUSY');
    busy.add(app);
    try{
      // Copy before the first await: caller cannot change bytes/identity during admission.
      if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>NATIVE_INPUT_LIMIT)
        fail('INK_BYTE_INPUT_SIZE_LIMIT');
      const raw=new Uint8Array(bytes);
      const sourceKind=identity?.sourceKind ?? (identity?.fileId ? 'DRIVE' : null);
      const sourceId=identity?.sourceId ?? identity?.fileId;
      const source={sourceKind,sourceId,documentId:identity?.documentId,sha256:identity?.sha256,
        ...(sourceKind==='DRIVE'?{fileId:identity?.fileId??sourceId}:{})};
      if(!['DRIVE','GITHUB','CHAT_LOCAL'].includes(sourceKind)||
         !ID.test(sourceId||'')||!ID.test(source.documentId||'')||!SHA.test(source.sha256||''))
        fail('INK_BYTE_INPUT_IDENTITY_REQUIRED');
      await ready;
      if(app.dirty||app.history?.pending)fail('INK_BYTE_INPUT_UNSAVED_DOCUMENT');
      const before=app.doc, fingerprint=before?inspectDocument(before).fingerprint:null;
      const digest=await crypto.subtle.digest('SHA-256',raw);
      const sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      if(sha256!==source.sha256)fail('INK_BYTE_INPUT_SHA_MISMATCH');
      let doc;
      try{doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
      catch{fail('INK_BYTE_INPUT_INVALID_JSON');}
      if(doc?.format!=='INK'||doc.formatVersion!==FORMAT_VERSION||doc.id!==source.documentId||
         !inspectDocument(doc).passed)fail('INK_BYTE_INPUT_INVALID_NATIVE');
      if(app.doc!==before||app.dirty||app.history?.pending||
         (before&&inspectDocument(app.doc).fingerprint!==fingerprint))fail('INK_BYTE_INPUT_STALE_DOCUMENT');
      const opened=await app.commands.execute('document.open.v1',{
        file:new File([raw],sourceKind.toLowerCase()+'-source.ink',{type:'application/json'})},'chat');
      if(!opened?.ok||opened.result?.documentId!==source.documentId||
         app.doc?.id!==source.documentId||app.documentOpen!==true)fail('INK_BYTE_INPUT_OPEN_FAILED');
      const active=app.sessions?.active?.();
      const openedDoc=app.doc, openedSessionId=active?.sessionId??null;
      if(active){
        active.values.portableHistoryEnabled=true;
        // Provenance is not a first-party drive.file grant or permission to overwrite.
        active.values.driveLinkIdentity=null;
        active.values.chatNativeInputIdentity={...source};
        active.values.chatOriginalDriveIdentity=sourceKind==='DRIVE'?{...source}:null;
      }
      // Persistence follows the real document.open.v1 mutation. A failure here
      // MUST NOT throw a generic "open failed": the document is already open.
      let recoveryPersisted=false;
      let recoveryErrorCode=active==null?'INK_BYTE_INPUT_RECOVERY_UNAVAILABLE':null;
      if(active){
        try {
          recoveryPersisted=await app.sessions.ensureActiveRecovery()===true;
          if(!recoveryPersisted)recoveryErrorCode='INK_BYTE_INPUT_RECOVERY_NOT_DURABLE';
        }catch(error){
          recoveryPersisted=false;
          recoveryErrorCode=typeof error?.code==='string'
            ?error.code:'INK_BYTE_INPUT_RECOVERY_EXCEPTION';
        }
      }
      // Protect a concurrent tab/session switch while recovery awaited.
      const current=app.sessions?.active?.();
      if(app.doc!==openedDoc||app.documentOpen!==true||app.doc?.id!==source.documentId||
         (active&&current!==active))
        throw Object.assign(new Error('INK_BYTE_INPUT_SESSION_CHANGED_AFTER_OPEN'),{
          code:'INK_BYTE_INPUT_SESSION_CHANGED_AFTER_OPEN',
          documentOpened:true,documentId:source.documentId});
      const native=inspectDocument(app.doc);
      if(!native.passed)fail('INK_BYTE_INPUT_READBACK_FAILED');
      const timeline=app.history?.timeline?.();
      return Object.freeze({schema:'INK_NATIVE_BYTE_OPEN_RECEIPT_V1',...source,
        status:recoveryPersisted?'OPENED':'OPENED_BUT_RECOVERY_FAILED',
        recoveryPersisted,recoveryErrorCode,sessionId:openedSessionId,
        nextAction:recoveryPersisted?null:'RETRY_RECOVERY_WITHOUT_REOPEN',
        bytes:raw.length,nativeOpened:true,nativeFingerprint:native.fingerprint,
        objects:native.stats.objects,paths:native.stats.paths,
        historyApplied:timeline?.applied??null,source:'AUTHORIZED_'+sourceKind+'_BY_CALLER'});
    }finally{busy.delete(app);}
  },
  // Only retry durability for the already opened, still-active document.
  // Never replay the input bytes or open a second Native document/session.
  async retryRecovery({documentId,sessionId}={}){
    if(busy.has(app))fail('INK_BYTE_INPUT_BUSY');
    busy.add(app);
    try {
      if(!ID.test(documentId||'')||!app.documentOpen||
         app.doc?.id!==documentId||app.dirty||app.history?.pending)
        fail('INK_BYTE_INPUT_RECOVERY_TARGET_INVALID');
      const active=app.sessions?.active?.();
      if(!active||!ID.test(sessionId||'')||active.sessionId!==sessionId)
        fail('INK_BYTE_INPUT_RECOVERY_SESSION_MISMATCH');
      const beforeDoc=app.doc, beforeFingerprint=inspectDocument(beforeDoc).fingerprint;
      let persisted=false, errorCode=null;
      try{persisted=await app.sessions.ensureActiveRecovery()===true;}
      catch(error){errorCode=typeof error?.code==='string'?error.code:'INK_BYTE_INPUT_RECOVERY_EXCEPTION';}
      if(app.doc!==beforeDoc||app.sessions.active()!==active||
         inspectDocument(app.doc).fingerprint!==beforeFingerprint)
        fail('INK_BYTE_INPUT_RECOVERY_STALE');
      return Object.freeze({schema:'INK_NATIVE_BYTE_RECOVERY_RECEIPT_V1',documentId,sessionId,
        status:persisted?'RECOVERY_PERSISTED':'OPENED_BUT_RECOVERY_FAILED',
        recoveryPersisted:persisted,recoveryErrorCode:persisted?null:errorCode||'INK_BYTE_INPUT_RECOVERY_NOT_DURABLE'});
    }finally{busy.delete(app);}
  }});
  app.nativeFileInput=service;
  return service;
}
