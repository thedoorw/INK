// Capture the document and page during the trusted Connect click.
export function createG2SessionGuard(app) {
  const current=app.sessions.current();
  const pageId=app.doc?.activePageId;
  if (!app.documentOpen || !current?.sessionId || !current.documentId || !pageId)
    throw new Error('G2_TARGET_REQUIRED');
  let target=Object.freeze({...current,pageId});
  let applyingHistory=false;
  const ownHistory=new WeakSet();
  let proposal=null;
  let previousEntry=null;
  let disposed=false;
  const matches=()=>{
    const active=app.sessions.current();
    return !disposed && app.documentOpen && active?.sessionId===target.sessionId
      && active.documentId===target.documentId && (applyingHistory || active.generation===target.generation)
      && app.doc?.activePageId===target.pageId;
  };
  return Object.freeze({
    capture:()=>matches()?target:null,
    matches,
    permits({tool,input}){
      if(!matches())return false;
      if(tool==='get_ink_context'||tool==='get_ink_history')return true;
      if(app.history.pending)return false;
      if(tool==='propose_ink_edit'){
        const {operation,targets}=input.task;
        return app.commands.has(operation) && targets.every(ref=>ref.pageId===target.pageId);
      }
      if(tool==='approve_ink_edit')return proposal?.id===input.proposalId;
      if(tool==='execute_ink_edit')return proposal?.id===input.proposalId
        && proposal?.token===input.approvalToken;
      if(tool==='undo_ink')return ownHistory.has(app.history.undoStack.at(-1));
      if(tool==='redo_ink')return ownHistory.has(app.history.redoStack.at(-1));
      return false;
    },
    invoke(tool,input){
      const tools=app.inkPublicApi.tools;
      if(tool==='execute_ink_edit')previousEntry=app.history.undoStack.at(-1);
      if(tool!=='undo_ink' && tool!=='redo_ink')return tools.invoke(tool,input);
      const undo=tool==='undo_ink';
      const entry=(undo?app.history.undoStack:app.history.redoStack).at(-1);
      applyingHistory=true;
      try{
        const result=tools.invoke(tool,input);
        const active=app.sessions.current();
        // Native History replaces the document object synchronously. Admit only the
        // same document/page and the exact authorized entry moving to the other stack.
        if(matches() && result?.status==='COMPLETED'
            && active.generation===target.generation+1
            && (undo?app.history.redoStack:app.history.undoStack).at(-1)===entry)
          target=Object.freeze({...target,generation:active.generation});
        return result;
      }finally{applyingHistory=false;}
    },
    record(tool,result){
      if(!matches())throw new Error('G2_TARGET_CHANGED');
      if(tool==='propose_ink_edit')proposal={id:result.result.proposalId};
      if(tool==='approve_ink_edit')proposal={id:result.result.proposalId,token:result.result.approvalToken};
      if(tool==='execute_ink_edit'){
        proposal=null;
        const entry=app.history.undoStack.at(-1);
        if(!entry||entry===previousEntry)throw new Error('G2_HISTORY_ENTRY_REQUIRED');
        ownHistory.add(entry);
      }
    },
    reset(){proposal=null;},
    dispose(){disposed=true;proposal=null;}
  });
}
