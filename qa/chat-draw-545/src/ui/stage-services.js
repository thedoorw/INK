function freezePorts(commandAuthority){
  if(!commandAuthority?.execute||!commandAuthority?.select||!commandAuthority?.subscribe)throw new TypeError('INK_MINIMAL_COMMAND_AUTHORITY_REQUIRED');
  return Object.freeze({
    commands:Object.freeze({execute:(id,args={})=>commandAuthority.execute(String(id),args,'human-ui'),has:id=>commandAuthority.has(String(id)),list:()=>commandAuthority.list().map(item=>Object.freeze({...item}))}),
    selectors:Object.freeze({get:(id,args={})=>commandAuthority.select(String(id),args),subscribe:listener=>commandAuthority.subscribe(listener)})
  });
}

export function createMinimalStageServices(app,{document=globalThis.document}={}){
  if(!app?.commands)throw new TypeError('INK_MINIMAL_STAGE_APP_REQUIRED');
  const input=document?.getElementById?.('projectFileInput');
  const stage=document?.getElementById?.('stageWrap');
  const snap=document?.getElementById?.('snapFeedback');
  if(!input||!stage||!snap)throw new Error('INK_MINIMAL_STAGE_NODES_REQUIRED');
  let disposed=false,previewVisible=false;
  const previewListeners=new Set();
  const notifyPreview=()=>{for(const listener of [...previewListeners]){try{listener(previewVisible);}catch{}}};
  const onProjectChange=async()=>{
    const file=input.files?.[0];input.value='';
    if(!file||disposed)return;
    const result=app.commands.execute('document.open.v1',{file},'human-ui');
    if(result?.then)await result;
  };
  input.addEventListener('change',onProjectChange);
  const openProject=()=>{if(disposed)return false;input.value='';input.click();return true;};
  const exportDocument=async options=>{
    if(disposed)throw new Error('INK_MINIMAL_STAGE_DISPOSED');
    if(typeof app.runExportRequest!=='function')throw new Error('INK_EXPORT_UNAVAILABLE');
    return app.runExportRequest({...options,entryPolicy:'minimal'});
  };
  const cancelExport=requestId=>app.cancelExport?.(requestId)||{cancelled:false,requestId:requestId||null,reason:'unavailable'};
  const setPreview=value=>{previewVisible=Boolean(value);notifyPreview();return previewVisible;};
  const togglePreview=()=>setPreview(!previewVisible);
  const bindPreview=listener=>{previewListeners.add(listener);return()=>previewListeners.delete(listener);};
  const snapFeedback=Object.freeze({
    show:(evidence,point={})=>{if(disposed)return false;const rect=stage.getBoundingClientRect();snap.hidden=false;snap.style.left=Math.max(0,Number(point.clientX||rect.left)-rect.left)+'px';snap.style.top=Math.max(0,Number(point.clientY||rect.top)-rect.top)+'px';snap.textContent=evidence?'SNAP':'SNAP';return true;},
    clear:()=>{snap.hidden=true;return true;}
  });
  const fullscreen=Object.freeze({present:active=>{document.documentElement.dataset.inkFullscreen=String(Boolean(active));return true;}});
  const presentation=Object.freeze({openProject,snapFeedback,fullscreen});
  const dispose=()=>{if(disposed)return false;disposed=true;input.removeEventListener('change',onProjectChange);previewListeners.clear();snap.hidden=true;return true;};
  return Object.freeze({
    schema:'INK-MINIMAL-STAGE-SERVICES',version:1,ports:freezePorts(app.commands),presentation,
    openProject,exportDocument,cancelExport,togglePreview,setPreview,isPreviewVisible:()=>previewVisible,bindPreview,
    report:message=>app.toast?.(String(message||''),2200),
    buildIdentity:()=>Object.freeze({sourceBuildId:globalThis.INK_BUILD_ID||null,worker:app.updates?.diagnostics?.()||null}),
    dispose
  });
}
