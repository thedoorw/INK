import {createDriveNativeLinks,parseDriveNativeLink,makeDriveNativeLink,groupRecoverableArtworks} from './drive-native-links.mjs';
import {createDriveTokenProvider} from './drive-native-auth.mjs';

// One first-party UI/service for both a new Native document and a pinned Drive URL.
// This is not an independent Document, History, Renderer or token persistence owner.
export async function mountDriveNativeLink(app,{config,ready,documentObject=document,locationObject=location,historyObject=history}={}){
  const identity=parseDriveNativeLink(locationObject.href);
  if(!identity&&!config?.clientId&&typeof config?.getAccessToken!=='function')return null;
  await ready;
  // The old body-appended section was clipped by INK's overflow:hidden shell.
  // A native dialog enters the browser top layer; all actual OAuth requests
  // remain on the existing in-dialog user-click handlers, never on menu hover.
  const panel=documentObject.createElement('dialog');
  panel.className='ink-drive-native-dialog';
  panel.setAttribute('aria-label','INK Google Drive 作品');
  const header=documentObject.createElement('header');
  const heading=documentObject.createElement('strong');heading.textContent='Google Drive 私人作品';
  const dismiss=documentObject.createElement('button');dismiss.type='button';
  dismiss.textContent='關閉';dismiss.setAttribute('aria-label','關閉 Google Drive 操作視窗');
  dismiss.addEventListener('click',()=>panel.close());
  header.append(heading,dismiss);
  const status=documentObject.createElement('p');status.setAttribute('role','status');
  const open=documentObject.createElement('button');open.type='button';open.textContent='授權並開啟 Drive 作品';open.hidden=!identity;
  const save=documentObject.createElement('button');save.type='button';
  save.textContent=identity?'儲存新版本並取得連結':'儲存到 Google Drive 並取得作品連結';
  const recover=documentObject.createElement('button');recover.type='button';
  recover.textContent='從 Google Drive 找回作品';
  const found=documentObject.createElement('div');found.setAttribute('aria-label','INK 已儲存的作品');found.hidden=true;
  const link=documentObject.createElement('a');link.textContent='開啟已保存版本';link.hidden=true;
  const copy=documentObject.createElement('button');copy.type='button';
  copy.textContent='複製可編輯作品連結';copy.setAttribute('aria-label','複製目前已校驗的 Google Drive 私人作品連結');copy.hidden=true;
  const details=documentObject.createElement('details');details.hidden=true;
  const summary=documentObject.createElement('summary');summary.textContent='已校驗的 Drive 儲存回執';
  const receiptView=documentObject.createElement('pre');
  receiptView.style.whiteSpace='pre-wrap';receiptView.style.overflowWrap='anywhere';
  receiptView.setAttribute('role','region');receiptView.setAttribute('aria-label','INK Drive 儲存回執');
  details.append(summary,receiptView);
  panel.append(header,status,open,save,recover,found,link,copy,details);
  documentObject.body.append(panel);
  function clearReceipt(){details.hidden=true;receiptView.textContent='';}
  function showReceipt(receipt){
    // Whitelist only validated first-party values, never OAuth/provider details.
    const {schema,action,fileId,documentId,sha256,parentFileId,revisionPolicy,bytes,link,currentDocumentUnchanged}=receipt;
    receiptView.textContent=JSON.stringify({schema,action,fileId,documentId,sha256,parentFileId,
      revisionPolicy,bytes,link,currentDocumentUnchanged},null,2);
    details.hidden=false;
  }
  function showVerifiedLink(value){link.href=value;link.hidden=false;copy.hidden=false;}
  copy.addEventListener('click',async()=>{
    if(link.hidden||!link.href)return;
    try{
      if(!globalThis.navigator?.clipboard?.writeText)throw Error('clipboard unavailable');
      await globalThis.navigator.clipboard.writeText(link.href);
      status.textContent='已複製此版本的私人可編輯連結。';
    }catch{status.textContent='無法自動複製，請使用旁邊的作品連結手動複製網址。';}
  });
  let getAccessToken;
  try {
    getAccessToken=typeof config?.getAccessToken==='function'?config.getAccessToken:
      config?.clientId?await createDriveTokenProvider({clientId:config.clientId,documentObject}):null;
  } catch(error) {
    status.textContent=error.code||'INK_LINK_AUTH_SDK_UNAVAILABLE';
    open.disabled=true;save.disabled=true;
    return{panel,status:'AUTH_SDK_UNAVAILABLE'};
  }
  if(typeof getAccessToken!=='function'){
    status.textContent='INK_LINK_AUTH_CONFIGURATION_REQUIRED：尚未設定 INK 的 Google Drive 網頁授權.';
    open.disabled=true;save.disabled=true;
    return{panel,status:'AUTH_CONFIGURATION_REQUIRED'};
  }
  async function authorize(){
    status.textContent='正在請求本次 Google Drive 授權…';
    try{
      await getAccessToken();
      status.textContent='本次 Drive 授權可用；正在進行作品讀寫校驗…';
    }catch{
      status.textContent='未取得 Drive 授權；作品未變更。';
      throw Object.assign(new Error('INK_LINK_AUTH_REQUIRED'),{code:'INK_LINK_AUTH_REQUIRED'});
    }
  }
  const errorMessage=(error,fallback)=>({
    INK_LINK_AUTH_REQUIRED:'未取得 Google Drive 授權；作品未變更。',
    INK_LINK_ACCESS_DENIED:'Google Drive 拒絕存取，請重新授權；作品未變更。',
    INK_LINK_UNSAVED_DOCUMENT:'目前有未保存的 Native 變更，請先保存或處理後再開啟 Drive 版本。'
  })[error?.code]||error?.code||fallback;
  const client=createDriveNativeLinks(app,{getAccessToken,editorUrl:locationObject.origin+locationObject.pathname});
  // The URL is a pinned, private identity, NOT a blanket permission to save
  // whichever Native document happens to be active. This value follows only
  // successfully opened/saved Drive revisions, never a failed authorization.
  let currentIdentity=identity;
  const initialBinding=app.sessions?.active?.()?.values?.driveLinkIdentity;
  // Incomplete Native recovery can leave a changed document and matching
  // binding even though the open operation failed. Do not revise until an
  // open finishes successfully, or a matching session was restored on load.
  let pinnedOpenConfirmed=Boolean(identity&&app.documentOpen &&
    app.doc?.id===identity.documentId &&
    initialBinding?.fileId===identity.fileId &&
    initialBinding?.documentId===identity.documentId &&
    initialBinding?.sha256===identity.sha256);
  const isCurrentPinnedDocument=()=>{
    if(!app.documentOpen)return false;
    if(!currentIdentity)return true; // First save of a new local Native document.
    const bound=app.sessions?.active?.()?.values?.driveLinkIdentity;
    return Boolean(pinnedOpenConfirmed&&app.doc?.id===currentIdentity.documentId &&
      bound?.fileId===currentIdentity.fileId &&
      bound?.documentId===currentIdentity.documentId &&
      bound?.sha256===currentIdentity.sha256);
  };
  const refreshSaveEligibility=()=>{save.disabled=!isCurrentPinnedDocument();return !save.disabled;};
  const recovered=Boolean(identity&&isCurrentPinnedDocument());
  status.textContent=recovered?'已恢復此連結的本機 Native 文件與步驟記錄。':
    identity?'此私有作品需要您的 Google Drive 授權。':'建立 Native 作品後，可授權並保存為私有 INK 作品連結。';
  refreshSaveEligibility();
  async function openArtwork(value=locationObject.href){
    clearReceipt();
    // Start GIS authorization within the actual click when consent is needed.
    await authorize();
    const receipt=await client.open(value);
    currentIdentity=parseDriveNativeLink(value);
    pinnedOpenConfirmed=true;
    showVerifiedLink(value);
    status.textContent='Native 作品已開啟：'+receipt.documentId;
    refreshSaveEligibility();
    save.textContent='儲存新版本並取得連結';
    return receipt;
  }
  async function saveArtwork(){
    clearReceipt();
    if(!app.documentOpen)throw Object.assign(new Error('INK_LINK_NO_NATIVE_DOCUMENT'),{code:'INK_LINK_NO_NATIVE_DOCUMENT'});
    if(!isCurrentPinnedDocument())
      throw Object.assign(new Error('INK_LINK_PINNED_DOCUMENT_NOT_OPENED'),{code:'INK_LINK_PINNED_DOCUMENT_NOT_OPENED'});
    // Hashing the Native payload is async: authorize before that loses user activation.
    await authorize();
    // Native sessions may change while GIS consent is pending.
    if(!isCurrentPinnedDocument())
      throw Object.assign(new Error('INK_LINK_PINNED_DOCUMENT_NOT_OPENED'),{code:'INK_LINK_PINNED_DOCUMENT_NOT_OPENED'});
    const receipt=await client.saveAsRevision();
    currentIdentity=parseDriveNativeLink(receipt.link);
    pinnedOpenConfirmed=true;
    showVerifiedLink(receipt.link);link.focus();
    showReceipt(receipt);
    historyObject.replaceState(null,'',receipt.link);
    save.textContent='儲存新版本並取得連結';
    status.textContent='新版本已保存並由 Drive 回讀校驗；此網址固定指向剛保存的版本。';
    refreshSaveEligibility();
    return receipt;
  }
  // Menu routing only reveals this real, accessible first-party dialog. An
  // additional click on the original button is deliberate: GIS consent must
  // start in a genuine user activation on an authorized INK origin.
  function showPanel(intent='save'){
    if(!['save','save-revision','recover','open'].includes(intent))
      throw Object.assign(new Error('INK_LINK_MENU_INTENT_INVALID'),{code:'INK_LINK_MENU_INTENT_INVALID'});
    const maySave=refreshSaveEligibility();
    open.hidden=!currentIdentity;
    if((intent==='save'||intent==='save-revision')&&!maySave&&currentIdentity)
      status.textContent='此私人連結的作品尚未開啟或不符目前文件，請先授權開啟連結。';
    if(intent==='save-revision'){
      save.textContent='另存 Google Drive 新版（不覆寫原件）';
      if(maySave)status.textContent='將建立新的私人版本，不會覆寫 Google Drive 原件。';
    }else if(intent==='save'){
      save.textContent='儲存到 Google Drive（私人新檔）';
      if(maySave)status.textContent='確認後使用 INK 的 Google Drive 授權儲存私人作品。';
      else if(!currentIdentity)status.textContent='請先建立或開啟 Native 文件。';
    }else if(intent==='recover'){
      recover.hidden=false;
      status.textContent='按「從 Google Drive 找回作品」以列出本 INK 應用程式已授權的私人版本。';
    }
    if(!panel.open)panel.showModal();
    (intent==='recover'?recover:
      (!maySave&&currentIdentity)||intent==='open'&&!open.hidden?open:save).focus();
    return {status:'DIALOG_VISIBLE',intent};
  }
  // No new Drive token, file handler, or remote command interface.
  app.driveArtworks=Object.freeze({schema:'INK_DRIVE_ARTWORK_SERVICE_V1',openArtwork,saveArtwork,showPanel});
  recover.addEventListener('click',async()=>{
    recover.disabled=true;
    found.replaceChildren();found.hidden=true;
    clearReceipt();
    try{
      // Real user-initiated token request, with no added Drive scope or backend.
      await authorize();
      const items=await client.listRecoverable();
      if(!items.length){status.textContent='找不到此 INK Google 帳號授權可存取的 INK 作品。';return;}
      const groups=groupRecoverableArtworks(items);
      const heading=documentObject.createElement('p');
      heading.textContent='找到 '+groups.length+' 件作品、'+items.length+' 個版本（近期最多 100 筆）；選擇作品的最新或歷史版本：';
      found.append(heading);
      const versionButton=(item,label)=>{
        const button=documentObject.createElement('button');button.type='button';
        const when=item.createdTime&&Number.isFinite(Date.parse(item.createdTime))
          ?new Date(item.createdTime).toLocaleString():'時間未提供';
        button.textContent=label+' · '+when+' · '+item.sha256.slice(0,12);
        button.setAttribute('aria-label',button.textContent+'；檔案 '+item.fileId+
          '；上版 '+(item.parentFileId||'無'));
        button.addEventListener('click',async()=>{
          button.disabled=true;
          // A dirty Native document is rejected by client.open BEFORE any
          // document.open.v1 dispatch. In this one proven no-mutation case,
          // preserve the existing verified binding so the user can save edits.
          const previouslySavable=isCurrentPinnedDocument();
          const previousDoc=app.doc,previousText=JSON.stringify(app.doc);
          const previousSession=app.sessions?.active?.();
          const previousIdentity=currentIdentity;
          try{
            const recoveredLink=makeDriveNativeLink(locationObject.origin+locationObject.pathname,item);
            await openArtwork(recoveredLink);
            historyObject.replaceState(null,'',recoveredLink);
            found.hidden=true;
            status.textContent='已找回並校驗指定 Native 版本；F5 仍會開啟此版，不會自行跳到最新。';
          }catch(error){
            const untouchedDirtyRejection=error?.code==='INK_LINK_UNSAVED_DOCUMENT' &&
              previouslySavable && currentIdentity===previousIdentity &&
              app.documentOpen===true && app.doc===previousDoc &&
              JSON.stringify(app.doc)===previousText &&
              app.sessions?.active?.()===previousSession && isCurrentPinnedDocument();
            if(!untouchedDirtyRejection)pinnedOpenConfirmed=false;
            status.textContent=errorMessage(error,'INK_LINK_RECOVERY_FAILED');
          }
          finally{refreshSaveEligibility();button.disabled=false;}
        });
        return button;
      };
      for(const group of groups){
        const section=documentObject.createElement('section');
        section.setAttribute('aria-label','INK 作品 '+group.documentId);
        const title=documentObject.createElement('strong');
        title.textContent='作品 '+group.documentId.slice(0,8)+'… · '+group.versions.length+' 版';
        section.append(title,versionButton(group.latest,'開啟最新保存版本'));
        if(group.versions.length>1){
          const historyVersions=documentObject.createElement('details');
          const summary=documentObject.createElement('summary');
          summary.textContent='選擇歷史版本（'+(group.versions.length-1)+'）';
          historyVersions.append(summary);
          for(const item of group.versions.slice(1))
            historyVersions.append(versionButton(item,'開啟歷史版本'));
          section.append(historyVersions);
        }
        found.append(section);
      }
      found.hidden=false;
      status.textContent='已按 Native 作品整理私人版本；只有選擇「最新版本」才會開啟目前列表中的最新保存檔。';
    }catch(error){status.textContent=errorMessage(error,'INK_LINK_DISCOVERY_FAILED');}
    finally{recover.disabled=false;}
  });
  open.addEventListener('click',async()=>{
    open.disabled=true;
    try{await openArtwork();}
    catch(error){pinnedOpenConfirmed=false;status.textContent=errorMessage(error,'INK_LINK_OPEN_FAILED');}
    finally{refreshSaveEligibility();open.disabled=false;}
  });
  save.addEventListener('click',async()=>{
    save.disabled=true;
    try{await saveArtwork();}
    catch(error){status.textContent=errorMessage(error,'INK_LINK_SAVE_FAILED');}
    finally{refreshSaveEligibility();}
  });
  if(identity)showPanel('open');
  return{panel,client,service:app.driveArtworks,status:recovered?'RECOVERED':identity?'AUTHORIZATION_REQUIRED':'FIRST_SAVE_READY'};
}

