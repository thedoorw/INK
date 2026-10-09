const COMMAND_SCHEMA = 'INK-COMMAND';
const COMMAND_VERSION = 1;
const COMMAND_OWNER_CONTRACT_VERSION = 1;
const ORIGINS = new Set(['human-ui','chat','recipe','public-api','system']);
const HISTORY_POLICIES = new Set(['REQUIRED','JOIN_ACTIVE_TRANSACTION','NONE','PRESERVE_EXISTING_ROUTE']);

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function historySummary(app) {
  const history = app?.history;
  if (!history) return { applied:0, retainedCount:0, limit:0, canUndo:false, canRedo:false, entries:[] };
  const timeline = typeof history.timeline === 'function'
    ? history.timeline()
    : { entries:[...(history.undoStack || []), ...[...(history.redoStack || [])].reverse()], applied:history.undoStack?.length || 0, limit:history.limit || 0 };
  return {
    applied: timeline.applied,
    retainedCount: timeline.entries?.length || 0,
    limit: timeline.limit,
    canUndo: Boolean(history.undoStack?.length),
    canRedo: Boolean(history.redoStack?.length),
    entries: (timeline.entries || []).map((entry,index)=>({
      index,
      label: entry.label || '變更',
      applied: index < timeline.applied,
      patchCount: entry.patchCount ?? null,
      captureMode: entry.captureMode || null
    }))
  };
}

function commandFailure(commandId, error) {
  return {
    ok:false,
    commandId,
    changed:false,
    error:{
      code:error?.code || 'COMMAND_FAILED',
      message:error?.message || String(error),
      details: clone(error?.details || {})
    }
  };
}

function normalizeEnvelope(commandIdOrEnvelope, args, origin) {
  if (typeof commandIdOrEnvelope === 'string') {
    return { schema:COMMAND_SCHEMA, version:COMMAND_VERSION, commandId:commandIdOrEnvelope, origin:origin || 'human-ui', arguments:args || {} };
  }
  return { ...(commandIdOrEnvelope || {}) };
}

function unavailable(commandId, ownerId = null) {
  return commandFailure(commandId, Object.assign(new Error('Command capability unavailable'), {
    code:'CAPABILITY_UNAVAILABLE',
    details:{ commandId, ownerId }
  }));
}

export function installCommandAuthority(app) {
  if (!app) throw new TypeError('INK command authority requires an app');
  if (app.commandAuthority?.schema === COMMAND_SCHEMA) return app.commandAuthority;

  const definitions = new Map();
  const selectors = new Map();
  const owners = new Map();
  const subscribers = new Set();
  let sequence = 0;

  const emit = event => {
    const frozen = Object.freeze({ sequence:++sequence, at:Date.now(), ...event });
    for (const listener of [...subscribers]) {
      try { listener(frozen); } catch (error) { console.warn('INK_COMMAND_SUBSCRIBER_FAILED', error); }
    }
    try { globalThis.dispatchEvent(new CustomEvent('ink:command-state-change',{ detail:frozen })); } catch {}
    return frozen;
  };

  const normalizeDefinition = (ownerId, id, definition) => {
    if (!id || typeof definition?.run !== 'function') throw new Error('INK_COMMAND_DEFINITION_INVALID:'+id);
    const history = definition.history || 'PRESERVE_EXISTING_ROUTE';
    if (!HISTORY_POLICIES.has(history)) throw new Error('INK_COMMAND_HISTORY_POLICY_INVALID:'+id);
    return Object.freeze({
      validation:definition.validation || (definition.validate ? 'INLINE' : 'NONE'),
      resultContract:definition.resultContract || 'INK_COMMAND_RESULT_V1',
      mutationScope:definition.mutationScope || 'NATIVE_SERVICE',
      transaction:definition.transaction || history,
      async:Boolean(definition.async),
      documentPolicy:definition.documentPolicy || 'SAME_DOCUMENT',
      invalidation:definition.invalidation || 'UI_REFRESH',
      governance:definition.governance || 'SHARED_COMMAND',
      ...definition,
      id,
      ownerId,
      history
    });
  };

  const normalizeSelector = (ownerId, id, selector) => {
    const select = typeof selector === 'function' ? selector : selector?.select;
    if (!id || typeof select !== 'function') throw new Error('INK_SELECTOR_DEFINITION_INVALID:'+id);
    return Object.freeze({ id, ownerId, select });
  };

  const stageBundle = (ownerId, bundle = {}, { replacing = false } = {}) => {
    if (!ownerId || typeof ownerId !== 'string') throw new Error('INK_COMMAND_OWNER_REQUIRED');
    const commandItems = (bundle.commands || []).map(item=>normalizeDefinition(ownerId,item.id,item.definition || item));
    const selectorItems = (bundle.selectors || []).map(item=>normalizeSelector(ownerId,item.id,item.selector || item));
    const commandIds = new Set(), selectorIds = new Set();
    for (const item of commandItems) {
      if (commandIds.has(item.id)) throw new Error('INK_COMMAND_DUPLICATE_IN_BUNDLE:'+item.id);
      commandIds.add(item.id);
      const existing = definitions.get(item.id);
      if (existing && (!replacing || existing.ownerId !== ownerId)) throw new Error('INK_COMMAND_DUPLICATE:'+item.id);
    }
    for (const item of selectorItems) {
      if (selectorIds.has(item.id)) throw new Error('INK_SELECTOR_DUPLICATE_IN_BUNDLE:'+item.id);
      selectorIds.add(item.id);
      const existing = selectors.get(item.id);
      if (existing && (!replacing || existing.ownerId !== ownerId)) throw new Error('INK_SELECTOR_DUPLICATE:'+item.id);
    }
    return { commandItems, selectorItems, commandIds, selectorIds };
  };

  const registerOwned = (ownerId, bundle = {}) => {
    if (owners.has(ownerId)) throw new Error('INK_COMMAND_OWNER_DUPLICATE:'+ownerId);
    const staged = stageBundle(ownerId,bundle);
    for (const item of staged.commandItems) definitions.set(item.id,item);
    for (const item of staged.selectorItems) selectors.set(item.id,item);
    owners.set(ownerId,{ id:ownerId, disabled:false, inFlight:0, commandIds:staged.commandIds, selectorIds:staged.selectorIds });
    emit({type:'owner-register',ownerId,commands:[...staged.commandIds],selectors:[...staged.selectorIds]});
    return true;
  };

  const replaceOwned = (ownerId, bundle = {}) => {
    const current = owners.get(ownerId);
    if (!current) throw new Error('INK_COMMAND_OWNER_UNKNOWN:'+ownerId);
    if (current.inFlight) throw Object.assign(new Error('INK_COMMAND_OWNER_IN_FLIGHT:'+ownerId),{code:'PROVIDER_BUSY'});
    const staged = stageBundle(ownerId,bundle,{replacing:true});
    const same = (a,b)=>a.size===b.size&&[...a].every(id=>b.has(id));
    if (!same(current.commandIds,staged.commandIds) || !same(current.selectorIds,staged.selectorIds)) {
      throw Object.assign(new Error('INK_COMMAND_OWNER_REPLACEMENT_SURFACE_MISMATCH:'+ownerId),{code:'INCOMPATIBLE_REPLACEMENT'});
    }
    for (const id of current.commandIds) definitions.delete(id);
    for (const id of current.selectorIds) selectors.delete(id);
    for (const item of staged.commandItems) definitions.set(item.id,item);
    for (const item of staged.selectorItems) selectors.set(item.id,item);
    current.commandIds=staged.commandIds;
    current.selectorIds=staged.selectorIds;
    emit({type:'owner-replace',ownerId,commands:[...staged.commandIds],selectors:[...staged.selectorIds]});
    return true;
  };

  const unregisterOwned = ownerId => {
    const owner=owners.get(ownerId);
    if (!owner) return false;
    if (owner.inFlight) throw Object.assign(new Error('INK_COMMAND_OWNER_IN_FLIGHT:'+ownerId),{code:'PROVIDER_BUSY'});
    for (const id of owner.commandIds) definitions.delete(id);
    for (const id of owner.selectorIds) selectors.delete(id);
    owners.delete(ownerId);
    emit({type:'owner-unregister',ownerId});
    return true;
  };

  const setOwnerDisabled = (ownerId, disabled) => {
    const owner=owners.get(ownerId);
    if (!owner) throw new Error('INK_COMMAND_OWNER_UNKNOWN:'+ownerId);
    owner.disabled=Boolean(disabled);
    emit({type:'owner-availability',ownerId,available:!owner.disabled});
    return !owner.disabled;
  };

  const finalize = (definition, envelope, raw, beforeHistory) => {
    const afterHistory = historySummary(app);
    const result = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw,'changed')
      ? raw : { changed: raw !== false, result: raw };
    const changed = result.changed !== false;
    const receipt = {
      history:{
        policy:definition.history,
        applied: afterHistory.applied !== beforeHistory.applied || afterHistory.retainedCount !== beforeHistory.retainedCount,
        beforeApplied:beforeHistory.applied,
        afterApplied:afterHistory.applied,
        beforeRetained:beforeHistory.retainedCount,
        afterRetained:afterHistory.retainedCount
      },
      revision:{ policy:'NO_IMPLICIT_CAPTURE', revisionId:app?.revisions?.revisionIdFor?.(app?.doc?.id) ?? null },
      dirty:Boolean(app?.dirty),
      invalidation:[definition.invalidation || 'UI_REFRESH'],
      ownerId:definition.ownerId
    };
    const response = { ok:true, commandId:definition.id, changed, result:clone(result.result ?? result), receipt };
    emit({ type:'command', commandId:definition.id, ownerId:definition.ownerId, origin:envelope.origin, changed, receipt });
    return response;
  };

  const execute = (commandIdOrEnvelope, args = {}, origin = 'human-ui') => {
    const envelope = normalizeEnvelope(commandIdOrEnvelope,args,origin);
    const commandId = String(envelope.commandId || '');
    const definition = definitions.get(commandId);
    if (!definition) return unavailable(commandId);
    const owner = owners.get(definition.ownerId);
    if (!owner || owner.disabled) return unavailable(commandId,definition.ownerId);
    if (envelope.schema && envelope.schema !== COMMAND_SCHEMA) return commandFailure(commandId,Object.assign(new Error('Invalid command schema'),{code:'ARGUMENTS_INVALID'}));
    if (envelope.version != null && Number(envelope.version) !== COMMAND_VERSION) return commandFailure(commandId,Object.assign(new Error('Invalid command version'),{code:'ARGUMENTS_INVALID'}));
    envelope.origin = ORIGINS.has(envelope.origin) ? envelope.origin : 'system';
    const beforeHistory = historySummary(app);
    const documentAtStart=app?.doc || null, documentIdAtStart=documentAtStart?.id || null;
    let sessionOperation=null;
    const execution=Object.freeze({
      commandId, ownerId:definition.ownerId, documentAtStart, documentIdAtStart,
      get sessionOperation(){return sessionOperation;},
      assertDocumentCurrent(){
        if (app?.doc !== documentAtStart || (documentIdAtStart != null && app?.doc?.id !== documentIdAtStart)) {
          throw Object.assign(new Error('Document changed during asynchronous command'),{code:'STALE_DOCUMENT'});
        }
        return true;
      }
    });
    try {app.multiView?.assertCommandAllowed?.(commandId);sessionOperation=app.sessions?.admit(commandId)||null;}
    catch(error){return commandFailure(commandId,error);}
    owner.inFlight++;
    try {
      definition.validate?.(envelope.arguments || {}, envelope);
      const raw = definition.run(envelope.arguments || {}, envelope, execution);
      if (raw && typeof raw.then === 'function') {
        return raw.then(value=>{
          if (definition.documentPolicy === 'SAME_DOCUMENT') execution.assertDocumentCurrent();
          return finalize(definition,envelope,value,beforeHistory);
        }).catch(error=>commandFailure(commandId,error)).finally(()=>{ owner.inFlight=Math.max(0,owner.inFlight-1); sessionOperation?.release(); });
      }
      const response=finalize(definition,envelope,raw,beforeHistory);
      owner.inFlight=Math.max(0,owner.inFlight-1);
      sessionOperation?.release();
      return response;
    } catch (error) {
      owner.inFlight=Math.max(0,owner.inFlight-1);
      sessionOperation?.release();
      return commandFailure(commandId,error);
    }
  };

  registerOwned('_command-authority',{selectors:[
    {id:'revision.summary',selector:()=>clone({ revisionId:app?.revisions?.revisionIdFor?.(app?.doc?.id) ?? null })},
    {id:'render.status',selector:()=>clone({ preference:app?.renderPreference || null, width:app?.renderer?.width || 0, height:app?.renderer?.height || 0 })}
  ]});

  const api = Object.freeze({
    schema:COMMAND_SCHEMA,
    version:COMMAND_VERSION,
    ownerContractVersion:COMMAND_OWNER_CONTRACT_VERSION,
    execute,
    executeCommand:(commandId,args={},origin='human-ui')=>execute(commandId,args,origin),
    has:id=>{const d=definitions.get(id),owner=d?owners.get(d.ownerId):null;return Boolean(d&&owner&&!owner.disabled);},
    list:()=>[...definitions.values()].map(definition=>({
      id:definition.id, ownerId:definition.ownerId, history:definition.history, invalidation:definition.invalidation,
      validation:definition.validation, resultContract:definition.resultContract, mutationScope:definition.mutationScope,
      transaction:definition.transaction, async:definition.async, documentPolicy:definition.documentPolicy, governance:definition.governance
    })),
    select:(id,args={})=>{
      const definition=selectors.get(id);
      if(!definition)throw Object.assign(new Error('Selector unavailable'),{code:'INK_SELECTOR_UNAVAILABLE',selectorId:id});
      const owner=owners.get(definition.ownerId);
      if(!owner||owner.disabled)throw Object.assign(new Error('Selector provider unavailable'),{code:'INK_SELECTOR_UNAVAILABLE',selectorId:id,ownerId:definition.ownerId});
      return clone(definition.select(args));
    },
    subscribe(listener){ if(typeof listener!=='function')throw new TypeError('listener required'); subscribers.add(listener); return()=>subscribers.delete(listener); },
    notify(reason='external'){ return emit({type:'state',reason}); },
    registerOwned, replaceOwned, unregisterOwned,
    disableOwned:ownerId=>setOwnerDisabled(ownerId,true),
    enableOwned:ownerId=>setOwnerDisabled(ownerId,false),
    ownerOf:id=>definitions.get(id)?.ownerId || null,
    selectorOwnerOf:id=>selectors.get(id)?.ownerId || null,
    ownerState:ownerId=>{const owner=owners.get(ownerId);return owner?{id:owner.id,disabled:owner.disabled,inFlight:owner.inFlight,commands:[...owner.commandIds],selectors:[...owner.selectorIds]}:null;},
    owners:()=>[...owners.values()].map(owner=>({id:owner.id,disabled:owner.disabled,inFlight:owner.inFlight,commands:[...owner.commandIds],selectors:[...owner.selectorIds]})),
    isOwnerIdle:ownerId=>(owners.get(ownerId)?.inFlight || 0)===0
  });

  Object.defineProperty(app,'commandAuthority',{value:api,configurable:true});
  Object.defineProperty(app,'commands',{value:api,configurable:true});

  const wrapRefresh = name => {
    const original=app[name];
    if(typeof original!=='function'||original.__inkCommandWrapped)return;
    const wrapped=function(...args){const result=original.apply(this,args);emit({type:'state',reason:name});return result;};
    Object.defineProperty(wrapped,'__inkCommandWrapped',{value:true});
    app[name]=wrapped;
  };
  ['updateHistoryUI','refreshLayers','refreshPages','refreshSelectionUI','refreshToolUI','refreshAll'].forEach(wrapRefresh);
  return api;
}

export { COMMAND_SCHEMA, COMMAND_VERSION, COMMAND_OWNER_CONTRACT_VERSION };
