function focusable(root){
  return [...(root?.querySelectorAll?.('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[href],[tabindex]:not([tabindex="-1"])')||[])];
}

export function createDialogPresentationService({host,slot='dialogs.content',focusFallback}={}){
  if(!host)throw new TypeError('INK_UI_DIALOG_HOST_REQUIRED');
  let returnFocus=null;
  let keyCleanup=null;
  let transitioning=false;
  let disposed=false;

  const isOpen=()=>host.diagnostics().active.some(item=>item.slot===slot);
  const activeRoot=()=>host.slot(slot)?.firstElementChild||null;
  const releaseKey=()=>{if(keyCleanup){keyCleanup();keyCleanup=null;}};
  const restoreReturnFocus=()=>{
    if(!returnFocus)return false;
    const target=returnFocus?.isConnected?returnFocus:focusFallback?.();
    returnFocus=null;
    try{target?.focus?.({preventScroll:true});return Boolean(target);}catch{return false;}
  };
  const installKeyboard=root=>{
    releaseKey();
    if(!root)return null;
    const onKey=event=>{
      if(event.key==='Escape'){event.preventDefault();close();return;}
      if(event.key!=='Tab')return;
      const list=focusable(root);
      if(!list.length){event.preventDefault();try{root?.focus?.({preventScroll:true});}catch{}return;}
      const current=list.indexOf(globalThis.document?.activeElement);
      const next=event.shiftKey?(current<=0?list[list.length-1]:list[current-1]):(current<0||current===list.length-1?list[0]:list[current+1]);
      event.preventDefault();
      try{next?.focus?.({preventScroll:true});}catch{}
    };
    globalThis.document?.addEventListener?.('keydown',onKey,true);
    keyCleanup=()=>globalThis.document?.removeEventListener?.('keydown',onKey,true);
    return root;
  };
  const focusDialog=root=>{
    const nodes=focusable(root),first=nodes[0]||root;
    try{first?.focus?.({preventScroll:true});}catch{}
    return root;
  };
  const lifecycleCleanup=host.subscribeLifecycle?.(event=>{
    if(event?.type==='unmount'&&event.slot===slot){
      releaseKey();
      if(!transitioning)restoreReturnFocus();
    }else if(event?.type==='dispose'){
      releaseKey();
      if(!transitioning)restoreReturnFocus();
    }
  })||(()=>false);

  const close=()=>{
    if(disposed)return false;
    releaseKey();
    transitioning=true;
    let changed=false;
    try{changed=host.unmount(slot);}
    finally{transitioning=false;}
    restoreReturnFocus();
    return changed;
  };

  const present=module=>{
    if(disposed)throw new Error('INK_UI_DIALOG_PRESENTATION_DISPOSED');
    if(!module||module.slot!==slot)throw new Error('INK_UI_DIALOG_SLOT_MISMATCH');
    const wasOpen=isOpen();
    if(!wasOpen)returnFocus=globalThis.document?.activeElement||focusFallback?.()||null;
    releaseKey();
    transitioning=true;
    try{
      if(wasOpen)host.swap(slot,module);else host.mount(module);
    }catch(error){
      transitioning=false;
      releaseKey();
      if(isOpen()){
        const recovered=activeRoot();
        installKeyboard(recovered);
        focusDialog(recovered);
      }else{
        restoreReturnFocus();
      }
      throw error;
    }
    transitioning=false;
    const root=activeRoot();
    installKeyboard(root);
    focusDialog(root);
    return root;
  };

  const dispose=()=>{
    if(disposed)return false;
    try{close();}catch{releaseKey();restoreReturnFocus();}
    lifecycleCleanup?.();
    disposed=true;
    return true;
  };

  return Object.freeze({
    schema:'INK-UI-DIALOG-PRESENTATION',version:1,slot,
    present,close,dispose,isOpen,
    diagnostics:()=>Object.freeze({open:isOpen(),keyboardBound:Boolean(keyCleanup),hasReturnFocus:Boolean(returnFocus),disposed})
  });
}
