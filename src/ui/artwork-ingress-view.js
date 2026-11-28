// Public-visible PSD/AI ingress consent panel. No file read, OAuth or import
// operation is exposed here; the protected controller owns all click handlers.
export function createArtworkIngressConsentView(documentObject=globalThis.document){
 const panel=documentObject.createElement('section');
 panel.setAttribute('aria-label','PSD／AI 原檔接收');
 const status=documentObject.createElement('p');status.setAttribute('role','status');
 const summary=documentObject.createElement('pre');
 const buttons={};
 for(const [key,label]of Object.entries({start:'建立本次接收要求',preview:'檢查接收原檔',
  confirm:'確認匯入圖層',cancel:'取消接收'})){
  const button=documentObject.createElement('button');
  button.type='button';button.textContent=label;
  buttons[key]=button;panel.append(button);
 }
 buttons.preview.disabled=true;buttons.confirm.disabled=true;
 panel.prepend(status,summary);
 status.textContent='確認匯入前，請先檢查格式、圖層及轉換損失。';
 return {panel,status,summary,buttons};
}

export function artworkIngressSuccessText(result){
 return result?.status||'接收要求已建立';
}

export function artworkIngressErrorText(error){
 const messages={
  INK_ARTWORK_DRIVE_FORMAT_SIZE_LIMIT:'此接收通路最多 8 MiB；PSD 本機匯入最多 32 MiB。',
  INK_ARTWORK_CROSS_OAUTH_BLOCKED:'Drive 原檔接收通路尚未完成配對驗證。',
  INK_PSB_LAYERED_UNSUPPORTED:'目前不支援 PSB 分層匯入。',
  INK_ARTWORK_TARGET_CHANGED:'文件已變動，請重新檢查原檔。'
 };
 return messages[error?.code]||error?.code||'原檔檢查失敗；未確認匯入。';
}
