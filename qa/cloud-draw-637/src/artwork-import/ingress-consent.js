// Mounted by first-party composition only after a reviewed transport is supplied.
// No OAuth request, file read or document mutation occurs on mount.
export function mountArtworkIngressConsent(app,controller,{documentObject=document}={}) {
  const panel=documentObject.createElement('section');panel.setAttribute('aria-label','PSD／AI 原檔接收');
  const status=documentObject.createElement('p');status.setAttribute('role','status');
  const summary=documentObject.createElement('pre');
  const buttons={};
  for(const [key,label]of Object.entries({start:'建立本次接收要求',preview:'檢查接收原檔',confirm:'確認匯入圖層',cancel:'取消接收'})){
    const b=documentObject.createElement('button');b.type='button';b.textContent=label;buttons[key]=b;panel.append(b);
  }
  buttons.preview.disabled=true;buttons.confirm.disabled=true;
  const messages={INK_ARTWORK_DRIVE_FORMAT_SIZE_LIMIT:'此接收通路最多 8 MiB；PSD 本機匯入最多 32 MiB。',INK_ARTWORK_CROSS_OAUTH_BLOCKED:'Drive 原檔接收通路尚未完成配對驗證。',INK_PSB_LAYERED_UNSUPPORTED:'目前不支援 PSB 分層匯入。',INK_ARTWORK_TARGET_CHANGED:'文件已變動，請重新檢查原檔。'};
  let disposed=false;
  const run=async operation=>{
    for(const b of Object.values(buttons))b.disabled=true;
    try{const result=await operation();if(disposed)return;status.textContent=result.status||'接收要求已建立';return result;}
    catch(error){status.textContent=messages[error.code]||error.code||'原檔檢查失敗；未確認匯入。';}
    finally{if(!disposed){buttons.start.disabled=false;buttons.cancel.disabled=false;buttons.preview.disabled=controller.state().status!=='AWAITING_SOURCE';buttons.confirm.disabled=controller.state().status!=='PENDING_CONFIRMATION';}}
  };
  buttons.start.addEventListener('click',()=>run(()=>{const c=controller.issueChallenge();summary.textContent=JSON.stringify(c,null,2);return c;}));
  buttons.preview.addEventListener('click',()=>run(async()=>{const p=await controller.prepare();summary.textContent=JSON.stringify({format:p.source.format,bytes:p.source.byteLength,status:p.fidelity.status,losses:p.fidelity.losses,mappings:p.fidelity.mappings},null,2);return p;}));
  buttons.confirm.addEventListener('click',()=>run(()=>controller.confirm()));
  buttons.cancel.addEventListener('click',()=>run(()=>{summary.textContent='';return controller.cancel();}));
  panel.prepend(status,summary);documentObject.body.append(panel);
  status.textContent='確認匯入前，請先檢查格式、圖層及轉換損失。';
  return {panel,dispose(){controller.dispose();disposed=true;panel.remove();}};
}
