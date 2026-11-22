// Protect the existing InkStore write boundary; no unload-time second store.
export function hasPendingRecovery(app){
  if(app.autosavePending)return true;
  const active=app.sessions?.activeId;
  return [...(app.sessions?.records?.values?.()||[])].some(entry=>
    entry.sessionId!==active&&entry.state==='OPEN'&&entry.values.autosavePending);
}

export function installPersistenceExitGuard(app,target=globalThis){
  const onBeforeUnload=event=>{
    if(!hasPendingRecovery(app))return;
    event.preventDefault();
    event.returnValue='';
  };
  target.addEventListener?.('beforeunload',onBeforeUnload);
  return ()=>target.removeEventListener?.('beforeunload',onBeforeUnload);
}
