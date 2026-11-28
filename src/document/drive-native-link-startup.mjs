import {createDriveNativeLinks,parseDriveNativeLink,makeDriveNativeLink} from './drive-native-links.mjs';
import {createDriveTokenProvider} from './drive-native-auth.mjs';
import {createDriveDialogView as fallbackDriveDialogView,
  appendDriveRecoveryChoices as fallbackDriveRecoveryChoices} from './drive-native-link-view.mjs';

// One first-party UI/service for both a new Native document and a pinned Drive URL.
// This is not an independent Document, History, Renderer or token persistence owner.
export async function mountDriveNativeLink(app,{config,ready,documentObject=document,locationObject=location,historyObject=history}={}){
  const identity=parseDriveNativeLink(locationObject.href);
  if(!identity&&!config?.clientId&&typeof config?.getAccessToken!=='function')return null;
  await ready;
  // The startup chunk is compiled Core. Resolve its view at the actual Public
  // document base, as #703 does for shell.js, to keep display edits independent.
  // Its bundled original is retained only for old/offline mixed deployments.
  let view={createDriveDialogView:fallbackDriveDialogView,
    appendDriveRecoveryChoices:fallbackDriveRecoveryChoices};
  try{
    const base=documentObject.baseURI||locationObject.href;
    const publicURL=new URL('./drive-native-link-view.mjs',
      new URL('src/document/drive-native-link-startup.mjs',base).href).href;
    const candidate=await import(publicURL);
    if(typeof candidate.createDriveDialogView!=='function'||
       typeof candidate.appendDriveRecoveryChoices!=='function')throw Error('INK_DRIVE_PUBLIC_VIEW_CONTRACT');
    view=candidate;
  }catch(error){console.error('INK_DRIVE_PUBLIC_VIEW_FALLBACK',error);}
  const {createDriveDialogView,appendDriveRecoveryChoices}=view;
  // The old body-appended section was clipped by INK's overflow:hidden shell.
  // A native dialog enters the browser top layer; all actual OAuth requests
  // remain on the existing in-dialog user-click handlers, never on menu hover.
  const {panel,dismiss,status,open,save,recover,found,link}=
    createDriveDialogView(documentObject,{hasIdentity:Boolean(identity)});
  dismiss.addEventListener('click',()=>panel.close());
  documentObject.body.append(panel);
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
    // Start GIS authorization within the actual click when consent is needed.
    await getAccessToken();
    const receipt=await client.open(value);
    currentIdentity=parseDriveNativeLink(value);
    pinnedOpenConfirmed=true;
    status.textContent='Native 作品已開啟：'+receipt.documentId;
    refreshSaveEligibility();
    save.textContent='儲存新版本並取得連結';
    return receipt;
  }
  let requestedFilename;
  async function saveArtwork(){
    const filename=requestedFilename;
    if(!app.documentOpen)throw Object.assign(new Error('INK_LINK_NO_NATIVE_DOCUMENT'),{code:'INK_LINK_NO_NATIVE_DOCUMENT'});
    if(!isCurrentPinnedDocument())
      throw Object.assign(new Error('INK_LINK_PINNED_DOCUMENT_NOT_OPENED'),{code:'INK_LINK_PINNED_DOCUMENT_NOT_OPENED'});
    // Hashing the Native payload is async: authorize before that loses user activation.
    await getAccessToken();
    // Native sessions may change while GIS consent is pending.
    if(!isCurrentPinnedDocument())
      throw Object.assign(new Error('INK_LINK_PINNED_DOCUMENT_NOT_OPENED'),{code:'INK_LINK_PINNED_DOCUMENT_NOT_OPENED'});
    const receipt=await client.saveAsRevision({filename});
    currentIdentity=parseDriveNativeLink(receipt.link);
    pinnedOpenConfirmed=true;
    link.href=receipt.link;link.hidden=false;link.focus();
    historyObject.replaceState(null,'',receipt.link);
    save.textContent='儲存新版本並取得連結';
    status.textContent='新版本已保存並校驗；上方連結與網址已更新。';
    refreshSaveEligibility();
    return receipt;
  }
  // Menu routing only reveals this real, accessible first-party dialog. An
  // additional click on the original button is deliberate: GIS consent must
  // start in a genuine user activation on an authorized INK origin.
  function showPanel(intent='save',{filename}={}){
    requestedFilename=filename;
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
    try{
      // Real user-initiated token request, with no added Drive scope or backend.
      await getAccessToken();
      const items=await client.listRecoverable();
      if(!items.length){status.textContent='找不到此 INK Google 帳號授權可存取的 INK 作品。';return;}
      appendDriveRecoveryChoices(documentObject,found,items,async(item,button)=>{
          button.disabled=true;
          try{
            const recoveredLink=makeDriveNativeLink(locationObject.origin+locationObject.pathname,item);
            await openArtwork(recoveredLink);
            historyObject.replaceState(null,'',recoveredLink);
            found.hidden=true;
            status.textContent='已從 Google Drive 找回並校驗 Native 作品。';
          }catch(error){pinnedOpenConfirmed=false;status.textContent=error.code||'INK_LINK_RECOVERY_FAILED';}
          finally{refreshSaveEligibility();button.disabled=false;}
      });
      found.hidden=false;
      status.textContent='已列出此 INK 應用程式可存取的私有作品。';
    }catch(error){status.textContent=error.code||'INK_LINK_DISCOVERY_FAILED';}
    finally{recover.disabled=false;}
  });
  open.addEventListener('click',async()=>{
    open.disabled=true;
    try{await openArtwork();}
    catch(error){pinnedOpenConfirmed=false;status.textContent=error.code||'INK_LINK_OPEN_FAILED';}
    finally{refreshSaveEligibility();open.disabled=false;}
  });
  save.addEventListener('click',async()=>{
    save.disabled=true;
    try{await saveArtwork();}
    catch(error){status.textContent=error.code||'INK_LINK_SAVE_FAILED';}
    finally{refreshSaveEligibility();}
  });
  if(identity)showPanel('open');
  return{panel,client,service:app.driveArtworks,status:recovered?'RECOVERED':identity?'AUTHORIZATION_REQUIRED':'FIRST_SAVE_READY'};
}
