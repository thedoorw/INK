/* #604 reference guard. Must be enabled before a human creates the disposable test
   document. This intentionally mirrors the existing popup-client G2 document gate.
   It authorizes ONLY one new empty Native document and exact one-edit Undo. */
export function createG2NativeTargetGuard(app) {
  if (!app?.commands?.subscribe || !app?.sessions?.current || !app?.history)
    throw new Error('G2_NATIVE_RUNTIME_REQUIRED');

  let latestHumanNewSession = null;
  let target = null;
  let edit = null;
  let disposed = false;

  const unsubscribe = app.commands.subscribe(event => {
    if (event?.type === 'command' && event.commandId === 'document.new.v1'
        && event.origin === 'human-ui' && event.changed) {
      latestHumanNewSession = app.sessions.current()?.sessionId ?? null;
    }
  });

  const blankDocument = () => {
    const current = app.sessions.current();
    const record = current && app.sessions.get(current.sessionId);
    const page = app.doc?.pages?.[0];
    if (!current || !app.documentOpen || !record || record.legacy
        || record.recoverySourceKey || app.driveLinkIdentity
        || current.sessionId !== latestHumanNewSession
        || app.doc?.pages?.length !== 1 || !page
        || page.layers?.length !== 1 || page.layers[0].objects?.length !== 0
        || app.history.pending || app.history.undoStack.length
        || app.history.redoStack.length) return null;
    return {...current, pageId:page.id};
  };

  const matches = () => {
    if (disposed || !target) return false;
    const current = app.sessions.current();
    return !!current && app.documentOpen
      && current.sessionId === target.sessionId
      && current.documentId === target.documentId
      && current.generation === target.generation
      && app.doc?.activePageId === target.pageId;
  };

  const guard = {
    capture() {
      if (disposed || target) return null;
      const eligible = blankDocument();
      if (!eligible) return null;
      target = Object.freeze({...eligible});
      edit = null;
      return {...target};
    },
    matches,
    permits(request) {
      if (!matches()) return false;
      const tool=request?.tool, input=request?.input || {};
      if (tool === 'get_ink_context' || tool === 'get_ink_history') return true;
      if (tool === 'propose_ink_edit') return !edit && !!blankDocument();
      if (tool === 'approve_ink_edit') return edit?.state === 'PROPOSED'
        && edit.proposalId === input.proposalId && !!blankDocument();
      if (tool === 'execute_ink_edit') return edit?.state === 'APPROVED'
        && edit.proposalId === input.proposalId && edit.token === input.approvalToken
        && !!blankDocument();
      if (tool === 'undo_ink') return edit?.state === 'EXECUTED'
        && !!edit.historyEntry && !app.history.pending
        && app.history.undoStack.at(-1) === edit.historyEntry;
      return false;
    },
    record(tool, agentResult) {
      if (!matches() || !agentResult) throw new Error('G2_RESULT_TARGET_DENIED');
      if (tool === 'propose_ink_edit') {
        if (edit || agentResult.status !== 'PROPOSED'
            || !agentResult.result?.proposalId) throw new Error('G2_PROPOSAL_RECEIPT_DENIED');
        edit = {state:'PROPOSED', proposalId:agentResult.result.proposalId};
      } else if (tool === 'approve_ink_edit') {
        if (edit?.state !== 'PROPOSED'
            || agentResult.result?.proposalId !== edit.proposalId
            || !agentResult.result?.approvalToken) throw new Error('G2_APPROVAL_RECEIPT_DENIED');
        edit = {...edit,state:'APPROVED',token:agentResult.result.approvalToken};
      } else if (tool === 'execute_ink_edit') {
        if (edit?.state !== 'APPROVED' || agentResult.result?.proposalId !== edit.proposalId
            || !agentResult.result?.objectId) throw new Error('G2_EXECUTION_RECEIPT_DENIED');
        const historyEntry = app.history.undoStack.at(-1);
        if (!historyEntry) throw new Error('G2_HISTORY_ENTRY_REQUIRED');
        edit = {state:'EXECUTED',historyEntry};
      } else if (tool === 'undo_ink') {
        if (edit?.state !== 'EXECUTED') throw new Error('G2_UNDO_RECEIPT_DENIED');
        edit = {state:'UNDONE'};
      }
    },
    reset() { target=null; edit=null; },
    dispose() {
      if (disposed) return;
      disposed=true;
      target=null; edit=null; latestHumanNewSession=null;
      unsubscribe?.();
    }
  };
  return Object.freeze(guard);
}
