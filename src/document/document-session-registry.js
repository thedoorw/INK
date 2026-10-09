// Runtime-only ownership of native Document/History; never a second mutation authority.
import { uid, deepClone } from '../core/index.js';
import { sanitizeDocument } from './migration.js';
import { inspectDocument } from './integrity.js';

const fail=(code)=>{throw Object.assign(new Error(code),{code});};
const transientKeys=['doc','documentOpen','history','dirty','selection','spatialIndex','spatialDirty','spatialPending','persistenceGeneration','mutationEpoch','autosaveBoundaryPromise','layoutViewportPreview','strokeEdit','draft'];
const studioKeys=['currentFixture','lastExecutionId','lastPaintSession','lastProgramImport','lastProgramReplay','lastDifference','lastReferenceRun','lastReferencePackage','lastDrawingImport','lastDrawingReplay','lastDrawingQuality','lastInteractiveBenchmark','activeStrokeRecorder','lastStylusReport','programStep'];
const identity=(entry)=>Object.freeze({sessionId:entry.sessionId,documentId:entry.documentId,generation:entry.generation,pageId:entry.doc?.activePageId||null});

export class DocumentSessionRegistry {
  constructor(app,{makeHistory,makeSpatialIndex}={}){
    if(!app||typeof makeHistory!=='function'||typeof makeSpatialIndex!=='function')fail('INK_SESSION_DEPENDENCIES_REQUIRED');
    this.app=app;this.makeHistory=makeHistory;this.makeSpatialIndex=makeSpatialIndex;
    this.records=new Map();this.operations=new Map();this.sequence=0;this.activeId=null;
    this.closingId=null;this.closingLeaseId=null;this.recoveryIndex=null;this.recoveryQueue=Promise.resolve();
    this.addInitial();
  }
  addInitial(){
    const entry=this.makeEntry(this.app.doc,true);
    this.capture(entry);this.records.set(entry.sessionId,entry);this.activeId=entry.sessionId;
  }
  makeEntry(doc,legacy=false){
    if(!doc?.id)fail('INK_SESSION_DOCUMENT_ID_REQUIRED');
    // Duplicate .ink file opens are independent runtime sessions. Preserve the serialized
    // document ID for round-trip fidelity, but NEVER share a session's recovery lane.
    const sessionId=uid();
    const entry={sessionId,documentId:doc.id,generation:1,state:'OPEN',doc,legacy,autosaveKey:legacy?'autosave':'autosave:session:'+sessionId,values:{},studio:{},autosaveTimer:null};
    return entry;
  }
  capture(entry=this.active()){
    if(!entry)return;
    for(const key of transientKeys)entry.values[key]=this.app[key];
    entry.doc=this.app.doc;entry.documentId=this.app.doc.id;
    for(const key of studioKeys)entry.studio[key]=this.app.studio?.[key];
    entry.autosaveTimer=this.app.autosaveTimer;
  }
  restore(entry){
    for(const key of transientKeys)this.app[key]=entry.values[key];
    for(const key of studioKeys)if(this.app.studio)this.app.studio[key]=entry.studio[key];
    this.app.autosaveTimer=entry.autosaveTimer;
    this.app.documentOpen=Boolean(entry.values.documentOpen);
    this.app.flora?.hero?.cache?.clear?.();
    this.app.renderer?.imageCache?.clear?.();
    this.app.renderer?.studioImageCache?.clear?.();
    this.app.renderer?.studioLayerCache?.clear?.();
    this.app.renderer?.liveTiles?.atlas?.clear?.();
    this.app.renderer?.invalidateTiles?.();
    this.app.studio?.reloadBrushPackages?.();
    this.app.refreshAll?.();
    this.app.renderer?.resize?.();
    this.app.commands?.notify?.('native-session-change');
  }
  active(){return this.records.get(this.activeId)||null;}
  current(){const active=this.active();return active?identity(active):null;}
  get(sessionId){return this.records.get(sessionId)||null;}
  list(){this.capture();return [...this.records.values()].map(x=>Object.freeze({...identity(x),active:x.sessionId===this.activeId,dirty:Boolean(x.values.dirty),title:x.doc.title,state:x.state}));}
  assertTarget(target,{active=false}={}){
    const entry=this.get(target?.sessionId);
    if(!entry||entry.state!=='OPEN'||entry.documentId!==target.documentId||entry.generation!==target.generation)fail('INK_SESSION_STALE_TARGET');
    if(active&&this.activeId!==target.sessionId)fail('INK_SESSION_NOT_ACTIVE');
    return entry;
  }
  activeTarget(){return this.current();}
  admit(owner){return this.admitFor(this.current(),owner,{active:true});}
  admitFor(target,owner,{active=false}={}){
    if(this.closingId)fail('INK_SESSION_CLOSING');
    if(target)this.assertTarget(target,{active});
    const ticket=Object.freeze({id:++this.sequence,owner:String(owner),target});
    this.operations.set(ticket.id,ticket);
    return Object.freeze({id:ticket.id,target,assertCurrent:()=>target?this.assertTarget(target,{active}):!this.activeId,release:()=>this.operations.delete(ticket.id)});
  }
  busy(exceptLease=null){
    const exemptId=typeof exceptLease==='object'&&exceptLease?.id!=null&&this.operations.has(exceptLease.id)?exceptLease.id:null;
    const owners=[...this.operations.values()].filter(x=>x.id!==exemptId).map(x=>x.owner);
    if(this.app.interaction||this.app.draft||this.app.history?.pending||this.app.input?.pointers?.size||this.app.activeExportJob||this.app.activeExportRequest||this.app.textEditorPresentation?.active||this.app.pathEditing?.active||this.app.strokeEdit||this.app.studio?.activeStrokeRecorder?.active)owners.push('native-gesture-or-async');
    return owners;
  }
  assertIdle(exceptLease=null){const busy=this.busy(exceptLease);if(busy.length)fail('INK_SESSION_BUSY:'+busy.join(','));}
  add(doc,{lease=null,activate=true,historyLimit=30,dirty=false,recoverySourceKey=null}={}){
    this.assertIdle(lease);
    const entry=this.makeEntry(doc);
    entry.recoverySourceKey=recoverySourceKey;
    entry.values={doc,documentOpen:true,history:this.makeHistory(historyLimit),dirty:Boolean(dirty),selection:[],spatialIndex:this.makeSpatialIndex(),spatialDirty:true,spatialPending:new Set(),persistenceGeneration:0,mutationEpoch:0,autosaveBoundaryPromise:Promise.resolve(true),layoutViewportPreview:null,strokeEdit:null,draft:null};
    for(const key of studioKeys)entry.studio[key]=null;
    entry.studio.programStep=0;
    this.records.set(entry.sessionId,entry);
    if(activate)this.activate(entry.sessionId,{lease});
    this.app.commands?.notify?.('native-session-add');
    return identity(entry);
  }
  activate(sessionId,{lease=null,closing=false}={}){
    if(this.activeId===sessionId)return this.current();
    this.assertIdle(lease);
    const next=this.get(sessionId);
    if(!next||(next.state!=='OPEN'&&!(closing&&next.state==='CLOSING'&&this.closingId===sessionId&&this.closingLeaseId===lease?.id)))fail('INK_SESSION_NOT_FOUND');
    const previous=this.active();this.capture(previous);
    this.activeId=sessionId;
    this.restore(next);
    return identity(next);
  }
  // Call after native replacement/History rollback, never on an unrelated session.
  replaced(){const entry=this.active();if(!entry)return;entry.generation++;entry.doc=this.app.doc;entry.documentId=this.app.doc.id;entry.autosaveKey=entry.legacy?'autosave':'autosave:session:'+entry.sessionId;this.capture(entry);this.app.commands?.notify?.('native-session-replaced');}
  // The index is a separate InkStore record, never a FORMAT4 document/schema change.
  // Workspace tabs stay runtime-only; recovery is explicit and selected by the user.
  async discoverRecovery(){
    const result=await this.app.store.loadWithRecovery('autosave:session:index:v1',
      value=>value?.schema==='INK_SESSION_RECOVERY_INDEX_V1'&&Array.isArray(value.slots));
    const slots=(result.value?.slots||[]).filter(x=>typeof x.key==='string'&&x.key.startsWith('autosave:session:')&&
      x.key!=='autosave:session:index:v1'&&typeof x.sessionId==='string').slice(-64);
    const cleanup=Array.isArray(result.value?.cleanup)?result.value.cleanup.filter(key=>typeof key==='string'&&key.startsWith('autosave:session:')&&key.endsWith(':close-escrow')):[];
    this.recoveryIndex={schema:'INK_SESSION_RECOVERY_INDEX_V1',slots,cleanup};
    return this.recoverable();
  }
  recoverable(){return (this.recoveryIndex?.slots||[]).map(x=>Object.freeze({...x}));}
  queueRecoveryUpdate(operation){
    const run=()=>operation();
    this.recoveryQueue=this.recoveryQueue.then(run,run);
    return this.recoveryQueue;
  }
  async persistAutosave(admission,snapshot){
    const entry=this.get(admission.target?.sessionId);
    if(!entry||entry.state!=='OPEN')fail('INK_SESSION_STALE_TARGET');
    if(entry.legacy)return this.app.store.save(admission.storageKey,snapshot);
    return this.queueRecoveryUpdate(async()=>{
      this.assertTarget(admission.target);
      if(!this.recoveryIndex)await this.discoverRecovery();
      const slots=this.recoveryIndex.slots.filter(x=>x.key!==entry.autosaveKey);
      slots.push({key:entry.autosaveKey,sessionId:entry.sessionId,documentId:entry.documentId,
        title:String(snapshot.title||'未命名作品'),modifiedAt:snapshot.modifiedAt||null});
      const updated={...this.recoveryIndex,slots:slots.slice(-64)};
      if(await this.app.store.save('autosave:session:index:v1',updated)!==true)return false;
      this.recoveryIndex=updated;
      this.assertTarget(admission.target);
      return this.app.store.save(entry.autosaveKey,snapshot);
    });
  }
  async sweepRecoveryCleanup(){
    return this.queueRecoveryUpdate(async()=>{
      if(!this.recoveryIndex)await this.discoverRecovery();
      for(const key of [...new Set(this.recoveryIndex.cleanup||[])]){
        // Indexed live recovery is never eligible for garbage collection.
        if(this.recoveryIndex.slots.some(x=>x.key===key))continue;
        let removed=false;
        try{removed=await this.app.store.remove(key)===true;}catch{}
        if(!removed)continue;
        const updated={...this.recoveryIndex,
          cleanup:(this.recoveryIndex.cleanup||[]).filter(x=>x!==key)};
        try{await this.writeRecoveryIndex(updated);}catch{return false;}
      }
      return !(this.recoveryIndex.cleanup||[]).length;
    });
  }
  async verifyRecoveryIndex(expected){
    const result=await this.app.store.loadWithRecovery('autosave:session:index:v1',
      value=>value?.schema==='INK_SESSION_RECOVERY_INDEX_V1'&&Array.isArray(value.slots));
    if(!result.verified||!result.value||result.backend==='memory'||
       JSON.stringify(result.value.slots)!==JSON.stringify(expected.slots)||
       JSON.stringify(result.value.cleanup||[])!==JSON.stringify(expected.cleanup||[]))
      fail('INK_SESSION_RECOVERY_INDEX_NOT_DURABLE');
    this.recoveryIndex=expected;
    return true;
  }
  async writeRecoveryIndex(updated){
    if(await this.app.store.save('autosave:session:index:v1',updated)!==true)
      fail('INK_SESSION_RECOVERY_INDEX_FAILED');
    await this.verifyRecoveryIndex(updated);
  }
  // Closing a nonlegacy lane is a recoverability transaction, not remove-then-index.
  // A verified, indexed escrow protects against both a failed remove and a failed
  // final index save (including a browser crash between those two awaits).
  async retireRecovery(entry){
    if(entry.legacy){
      if(await this.app.store?.remove?.(entry.autosaveKey)!==true)fail('INK_SESSION_DISCARD_STORAGE_FAILED');
      return {sourcePreserved:false,cleanupPending:false};
    }
    return this.queueRecoveryUpdate(async()=>{
      if(!this.recoveryIndex)await this.discoverRecovery();
      const key=entry.autosaveKey,escrowKey=key+':close-escrow';
      const isIndexed=this.recoveryIndex.slots.some(x=>x.key===key);
      const preexistingEscrow=this.recoveryIndex.slots.some(x=>x.key===escrowKey);
      const sourceKey=entry.recoverySourceKey||null;
      // The restored session is a new runtime fork. Its original recovery lane
      // remains independently discoverable on both Save and Discard.
      if(!isIndexed&&!preexistingEscrow){
        if(sourceKey){
          const parent=this.recoveryIndex.slots.find(x=>x.key===sourceKey);
          if(!parent)fail('INK_SESSION_RECOVERY_SOURCE_MISSING');
          const source=await this.app.store.loadWithRecovery(sourceKey,value=>inspectDocument(value).passed);
          if(!source.value||!source.verified||source.backend==='memory')fail('INK_SESSION_RECOVERY_SOURCE_NOT_DURABLE');
          return {sourcePreserved:true,sourceKey,cleanupPending:false};
        }
        return {sourcePreserved:false,cleanupPending:false};
      }
      const saved=deepClone(entry.doc);
      if(!inspectDocument(saved).passed)fail('INK_SESSION_RECOVERY_ESCROW_INVALID');
      if(await this.app.store.save(escrowKey,saved)!==true)fail('INK_SESSION_RECOVERY_ESCROW_SAVE_FAILED');
      const escrow=await this.app.store.loadWithRecovery(escrowKey,value=>inspectDocument(value).passed);
      if(!escrow.value||!escrow.verified||escrow.backend==='memory'||
         JSON.stringify(escrow.value)!==JSON.stringify(saved))
        fail('INK_SESSION_RECOVERY_ESCROW_NOT_DURABLE');
      const descriptor={key:escrowKey,sessionId:entry.sessionId,documentId:entry.documentId,
        title:String(saved.title||'未命名作品'),modifiedAt:saved.modifiedAt||null,kind:'close-escrow'};
      // The original index entry stays recoverable while the escrow becomes durable.
      const staged={...this.recoveryIndex,slots:[
        ...this.recoveryIndex.slots.filter(x=>x.key!==escrowKey),descriptor]};
      await this.writeRecoveryIndex(staged);
      if(isIndexed&&await this.app.store.remove(key)!==true)
        fail('INK_SESSION_DISCARD_STORAGE_FAILED');
      // The last index commit atomically retires both discoverable references;
      // garbage collection of the escrow is separately and durably journaled.
      const finalized={...this.recoveryIndex,
        slots:this.recoveryIndex.slots.filter(x=>x.key!==key&&x.key!==escrowKey),
        cleanup:[...new Set([...(this.recoveryIndex.cleanup||[]),escrowKey])]};
      await this.writeRecoveryIndex(finalized);
      let cleaned=false;
      try{cleaned=await this.app.store.remove(escrowKey)===true;}catch{}
      if(cleaned){
        const cleared={...this.recoveryIndex,
          cleanup:this.recoveryIndex.cleanup.filter(x=>x!==escrowKey)};
        try{await this.writeRecoveryIndex(cleared);}catch{
          // Journal remains on disk, so restart can retry cleanup safely.
          cleaned=false;
        }
      }
      const sourcePreserved=Boolean(sourceKey);
      if(sourcePreserved){
        const row=this.recoveryIndex.slots.find(x=>x.key===sourceKey);
        if(!row)fail('INK_SESSION_RECOVERY_SOURCE_MISSING');
        const orig=await this.app.store.loadWithRecovery(sourceKey,value=>inspectDocument(value).passed);
        if(!orig.value||!orig.verified||orig.backend==='memory')
          fail('INK_SESSION_RECOVERY_SOURCE_NOT_DURABLE');
      }
      return {sourcePreserved,sourceKey,cleanupPending:!cleaned};
    });
  }
  async recover(key,{lease=null}={}){
    this.assertIdle(lease);
    await this.discoverRecovery();
    if(!this.recoveryIndex.slots.some(x=>x.key===key))fail('INK_SESSION_RECOVERY_NOT_INDEXED');
    const result=await this.app.store.loadWithRecovery(key,value=>inspectDocument(value).passed);
    if(!result.value||result.verified!==true)fail('INK_SESSION_RECOVERY_NOT_DURABLE');
    const doc=sanitizeDocument(result.value);
    if(!inspectDocument(doc).passed)fail('INK_SESSION_RECOVERY_INVALID');
    this.assertIdle(lease);
    return this.add(doc,{lease,historyLimit:this.app.history?.limit||30,dirty:true,recoverySourceKey:key});
  }
  async close(sessionId,{decision=null,lease=null}={}){
    const entry=this.get(sessionId);if(!entry||entry.state!=='OPEN')fail('INK_SESSION_NOT_FOUND');
    const direct=lease?null:this.admit('session.close.direct');
    const operation=lease||direct;
    const originalActive=this.activeId;
    try{
      this.assertIdle(operation);
      if(this.activeId===sessionId)this.capture(entry);
      if(entry.values.dirty&&!['save','discard','cancel'].includes(decision))fail('INK_SESSION_CLOSE_DECISION_REQUIRED');
      if(decision==='cancel')return Object.freeze({closed:false,cancelled:true});
      if(this.closingId)fail('INK_SESSION_CLOSING');
      // Exclusive state is installed synchronously, before the first await.
      entry.state='CLOSING';this.closingId=sessionId;this.closingLeaseId=operation?.id||null;
      if(entry.values.dirty&&decision==='save'){
        this.activate(sessionId,{lease:operation,closing:true});
        if(await this.app.saveProject()!==true)fail('INK_SESSION_SAVE_FAILED');
        this.capture(entry);
      }
      const recoveryReceipt=await this.retireRecovery(entry);
      if(entry.autosaveTimer)clearTimeout(entry.autosaveTimer);
      const wasActive=this.activeId===sessionId;
      entry.generation++;this.records.delete(sessionId);entry.state='CLOSED';
      if(wasActive){
        // The 002 view authority chooses an eligible native editing session,
        // never an existing reference pane by incidental Map insertion order.
        const preferred=this.app.multiView?.fallbackAfterClose?.({
          closedSessionId:sessionId,originalActiveId:originalActive
        });
        const next=(preferred&&this.records.get(preferred))||this.records.values().next().value;
        if(next){this.activeId=next.sessionId;this.restore(next);}
        else{this.activeId=null;this.app.documentOpen=false;this.app.commands?.notify?.('native-session-empty');}
      }
      this.app.commands?.notify?.('native-session-close');
      return Object.freeze({closed:true,sessionId,...recoveryReceipt});
    }catch(error){
      if(entry.state==='CLOSING'){
        entry.state='OPEN';
        if(originalActive!==this.activeId&&this.get(originalActive))this.activate(originalActive,{lease:operation});
        if(this.activeId===sessionId&&entry.values.dirty)this.app.scheduleAutosave?.();
      }
      throw error;
    }finally{
      if(this.closingId===sessionId){this.closingId=null;this.closingLeaseId=null;}
      direct?.release();
    }
  }
}
