// Public-owned Google Drive artwork dialog presentation. Native document IO,
// OAuth activation, identity pinning and recovery stay in the protected host.
export function createDriveDialogView(documentObject,{hasIdentity}){
  const panel=documentObject.createElement('dialog');
  panel.className='ink-drive-native-dialog';
  panel.setAttribute('aria-label','INK Google Drive 作品');
  const header=documentObject.createElement('header');
  const heading=documentObject.createElement('strong');heading.textContent='Google Drive 私人作品';
  const dismiss=documentObject.createElement('button');dismiss.type='button';
  dismiss.textContent='關閉';dismiss.setAttribute('aria-label','關閉 Google Drive 操作視窗');
  header.append(heading,dismiss);
  const status=documentObject.createElement('p');status.setAttribute('role','status');
  const open=documentObject.createElement('button');open.type='button';
  open.textContent='授權並開啟 Drive 作品';open.hidden=!hasIdentity;
  const save=documentObject.createElement('button');save.type='button';
  save.textContent=hasIdentity?'儲存新版本並取得連結':'儲存到 Google Drive 並取得作品連結';
  const recover=documentObject.createElement('button');recover.type='button';
  recover.textContent='從 Google Drive 找回作品';
  const found=documentObject.createElement('div');found.setAttribute('aria-label','INK 已儲存的作品');found.hidden=true;
  const link=documentObject.createElement('a');link.textContent='開啟已保存版本';link.hidden=true;
  panel.append(header,status,open,save,recover,found,link);
  return {panel,dismiss,status,open,save,recover,found,link};
}

export function appendDriveRecoveryChoices(documentObject,found,items,onSelect){
  const heading=documentObject.createElement('p');
  heading.textContent='找到 '+items.length+' 個 INK 儲存版本，請選擇要開啟的作品：';
  found.append(heading);
  for(const item of items){
    const button=documentObject.createElement('button');button.type='button';
    const when=item.createdTime&&Number.isFinite(Date.parse(item.createdTime))
      ?new Date(item.createdTime).toLocaleString():'儲存版本';
    button.textContent=when+' · '+item.name;
    button.addEventListener('click',()=>onSelect(item,button));
    found.append(button);
  }
}
