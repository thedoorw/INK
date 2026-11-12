// #544: first-party, same-module-graph bytes export. Never import this module
// from an unbundled Runner ESM to resolve the bundle's WeakMap registry.
import {inspectDocument} from './integrity.js';
import {FORMAT_VERSION} from '../config.js';
import {getInkOutputRegistry} from '../agent/output-handle-registry.js';
import {inspectInkOutput} from '../agent/visual-feedback.js';

export const NATIVE_OUTPUT_LIMIT=8*1024*1024;
export const PREVIEW_OUTPUT_LIMIT=32*1024*1024;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
async function sha256(bytes){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));}
function historyReceipt(payload,documentId){
  const h=payload?.inkSessionHistory;
  if(!h||h.schema!=='INK_NATIVE_HISTORY_CHECKPOINTS_V1'||
     h.documentId!==documentId||!Number.isSafeInteger(h.applied)||h.applied<0||
     !Array.isArray(h.states)||h.states.length<h.applied+1)
    fail('INK_NATIVE_OUTPUT_HISTORY_INVALID');
  return {applied:h.applied,states:h.states.length};
}
function pngSize(bytes){
  if(bytes.length<24||![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)||
     String.fromCharCode(...bytes.subarray(12,16))!=='IHDR')
    fail('INK_NATIVE_OUTPUT_PNG_INVALID');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const width=view.getUint32(16),height=view.getUint32(20);
  if(!width||!height||width>1600||height>1600||width*height>2560000)
    fail('INK_NATIVE_OUTPUT_PNG_DIMENSIONS_INVALID');
  return {width,height};
}
export function installNativeByteOutput(app){
  if(!app?.sessions?.projectPayload||!app?.documentIntegrity)
    fail('INK_NATIVE_OUTPUT_APP_REQUIRED');
  if(app.nativeByteOutput)fail('INK_NATIVE_OUTPUT_ALREADY_INSTALLED');
  const service=Object.freeze({
    schema:'INK_NATIVE_BYTE_OUTPUT_V1',
    async native(){
      if(!app.documentOpen||!app.doc||app.history?.pending)
        fail('INK_NATIVE_OUTPUT_DOCUMENT_NOT_READY');
      const before=app.doc, active=app.sessions?.active?.()??null;
      const historyBefore=app.history?.timeline?.()?.applied??null;
      const integrity=app.documentIntegrity();
      if(integrity?.passed!==true)fail('INK_NATIVE_OUTPUT_DOCUMENT_INVALID');
      const payload=app.sessions.projectPayload(before,{history:true});
      if(payload?.format!=='INK'||payload.formatVersion!==FORMAT_VERSION||
         payload.id!==before.id)fail('INK_NATIVE_OUTPUT_FORMAT_INVALID');
      const history=historyReceipt(payload,before.id);
      const bytes=new TextEncoder().encode(JSON.stringify(payload,null,2));
      if(bytes.length<40||bytes.length>NATIVE_OUTPUT_LIMIT)fail('INK_NATIVE_OUTPUT_SIZE_LIMIT');
      const digest=await sha256(bytes);
      if(app.doc!==before||app.history?.pending||(app.sessions?.active?.()??null)!==active||
         app.documentIntegrity()?.fingerprint!==integrity.fingerprint)
        fail('INK_NATIVE_OUTPUT_DOCUMENT_CHANGED');
      // Document fingerprint alone excludes portable History, which may mutate
      // while hashing. Validate the same authoritative session payload twice.
      const historyAfter=app.sessions.projectPayload(before,{history:true})?.inkSessionHistory;
      if((app.history?.timeline?.()?.applied??null)!==historyBefore||
         !historyAfter||JSON.stringify(historyAfter)!==JSON.stringify(payload.inkSessionHistory))
        fail('INK_NATIVE_OUTPUT_HISTORY_CHANGED');
      return {bytes,receipt:Object.freeze({schema:'INK_NATIVE_OUTPUT_RECEIPT_V1',
        kind:'native',documentId:before.id,sha256:digest,byteLength:bytes.length,
        formatVersion:payload.formatVersion,historyApplied:history.applied,
        historyStates:history.states,documentFingerprint:integrity.fingerprint})};
    },
    // The original Renderer Blob is read from the existing bundle's registry,
    // not from a second source-module WeakMap or a screenshot.
    async renderer({handleId,release=true}={}){
      if(typeof handleId!=='string'||!/^ink-output-v1:[a-z0-9]+$/.test(handleId))
        fail('INK_NATIVE_OUTPUT_HANDLE_REQUIRED');
      const registry=getInkOutputRegistry(app);
      if(!registry)fail('INK_NATIVE_OUTPUT_REGISTRY_MISSING');
      const inspected=inspectInkOutput(app,registry,handleId);
      if(!inspected.available||inspected.stale||inspected.handle?.kind!=='preview'||
         inspected.handle?.mimeType!=='image/png')fail('INK_NATIVE_OUTPUT_HANDLE_STALE');
      const handle=inspected.handle;
      const blob=registry.resolve(handleId);
      if(!(blob instanceof Blob)||blob.type!=='image/png'||
         blob.size!==handle.byteLength||blob.size>PREVIEW_OUTPUT_LIMIT)
        fail('INK_NATIVE_OUTPUT_BLOB_INVALID');
      const bytes=new Uint8Array(await blob.arrayBuffer());
      const pixelSize=pngSize(bytes);
      if(bytes.length!==handle.byteLength||
         pixelSize.width!==handle.pixelSize?.width||pixelSize.height!==handle.pixelSize?.height)
        fail('INK_NATIVE_OUTPUT_RENDER_MISMATCH');
      if(inspectInkOutput(app,registry,handleId).stale||registry.resolve(handleId)!==blob)
        fail('INK_NATIVE_OUTPUT_HANDLE_CHANGED');
      const digest=await sha256(bytes);
      if(inspectInkOutput(app,registry,handleId).stale)
        fail('INK_NATIVE_OUTPUT_HANDLE_CHANGED');
      if(release!==false)registry.release(handleId);
      return {bytes,receipt:Object.freeze({schema:'INK_RENDERER_BYTES_RECEIPT_V1',
        kind:'renderer',handleId,documentId:handle.documentId,
        revisionId:handle.revisionId,documentFingerprint:handle.documentFingerprint,
        renderFingerprint:handle.renderFingerprint,byteLength:bytes.length,
        sha256:digest,mimeType:'image/png',pixelSize,handleReleased:release!==false})};
    }
  });
  app.nativeByteOutput=service;
  return service;
}
