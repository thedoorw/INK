import {createDriveNativeLinks,parseDriveNativeLink,makeDriveNativeLink} from './drive-native-links.mjs';
import {createDriveTokenProvider} from './drive-native-auth.mjs';

// One first-party UI/service for both a new Native document and a pinned Drive URL.
// This is not an independent Document, History, Renderer or token persistence owner.
export async function mountDriveNativeLink(app,{config,ready,documentObject=document,locationObject=location,historyObject=history}={}){
  const identity=parseDriveNativeLink(locationObject.href);
  if(!identity&&!config?.clientId&&typeof config?.getAccessToken!=='function')return null;
  await ready;
  const panel=documentObject.createElement('section');
  panel.setAttribute('role','region');panel.setAttribute('aria-label','INK Drive 文件連結');
  const status=documentObject.createElement('p');status.setAttribute('role','status');
  const open=documentObject.createElement('button');open.type='button';open.textContent='授權並開啟 Drive 作品';open.hidden=!identity;
  const save=documentObject.createElement('button');save.type='button';
  save.textContent=identity?'儲存新版本並取得連結':'儲存到 Google Drive 並取得作品連結';
  const recover=documentObject.createElement('button');recover.type='button';
  recover.textContent='從 Google Drive 找回作品';recover.hidden=Boolean(identity);
  const found=documentObject.createElement('div');found.setAttribute('aria-label','INK 已儲存的作品');found.hidden=true;
  const link=documentObject.createElement('a');link.textContent='開啟已保存版本';link.hidden=true;
  panel.append(status,open,save,recover,found,link);documentObject.body.append(panel);
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
  const binding=app.sessions?.active?.()?.values.driveLinkIdentity;
  const recovered=Boolean(identity&&app.documentOpen&&app.doc.id===identity.documentId&&binding?.fileId===identity.fileId&&binding?.sha256===identity.sha256);
  status.textContent=recovered?'已恢復此連結的本機 Native 文件與步驟記錄。':
    identity?'此私有作品需要您的 Google Drive 授權。':'建立 Native 作品後，可授權並保存為私有 INK 作品連結。';
  save.disabled=Boolean(identity&&!recovered);
  async function openArtwork(value=locationObject.href){
    // Start GIS authorization within the actual click when consent is needed.
    await getAccessToken();
    const receipt=await client.open(value);
    status.textContent='Native 作品已開啟：'+receipt.documentId;
    save.disabled=false;
    save.textContent='儲存新版本並取得連結';
    return receipt;
  }
  async function saveArtwork(){
    if(!app.documentOpen)throw Object.assign(new Error('INK_LINK_NO_NATIVE_DOCUMENT'),{code:'INK_LINK_NO_NATIVE_DOCUMENT'});
    // Hashing the Native payload is async: authorize before that loses user activation.
    await getAccessToken();
    const receipt=await client.saveAsRevision();
    link.href=receipt.link;link.hidden=false;
    historyObject.replaceState(null,'',receipt.link);
    save.textContent='儲存新版本並取得連結';
    status.textContent='新版本已保存並校驗；上方連結與網址已更新。';
    return receipt;
  }
  // Stable consumer-neutral first-party browser API. No token or arbitrary file/write endpoint.
  app.driveArtworks=Object.freeze({schema:'INK_DRIVE_ARTWORK_SERVICE_V1',openArtwork,saveArtwork});
  recover.addEventListener('click',async()=>{
    recover.disabled=true;
    found.replaceChildren();found.hidden=true;
    try{
      // Real user-initiated token request, with no added Drive scope or backend.
      await getAccessToken();
      const items=await client.listRecoverable();
      if(!items.length){status.textContent='找不到此 INK Google 帳號授權可存取的 INK 作品。';return;}
      const heading=documentObject.createElement('p');
      heading.textContent='找到 '+items.length+' 個 INK 儲存版本，請選擇要開啟的作品：';
      found.append(heading);
      for(const item of items){
        const button=documentObject.createElement('button');button.type='button';
        const when=item.createdTime&&Number.isFinite(Date.parse(item.createdTime))
          ?new Date(item.createdTime).toLocaleString():'儲存版本';
        button.textContent=when+' · '+item.name;
        button.addEventListener('click',async()=>{
          button.disabled=true;
          try{
            const recoveredLink=makeDriveNativeLink(locationObject.origin+locationObject.pathname,item);
            await openArtwork(recoveredLink);
            historyObject.replaceState(null,'',recoveredLink);
            recover.hidden=true;found.hidden=true;
            status.textContent='已從 Google Drive 找回並校驗 Native 作品。';
          }catch(error){status.textContent=error.code||'INK_LINK_RECOVERY_FAILED';}
          finally{button.disabled=false;}
        });
        found.append(button);
      }
      found.hidden=false;
      status.textContent='已列出此 INK 應用程式可存取的私有作品。';
    }catch(error){status.textContent=error.code||'INK_LINK_DISCOVERY_FAILED';}
    finally{recover.disabled=false;}
  });
  open.addEventListener('click',async()=>{
    open.disabled=true;
    try{await openArtwork();}
    catch(error){status.textContent=error.code||'INK_LINK_OPEN_FAILED';}
    finally{open.disabled=false;}
  });
  save.addEventListener('click',async()=>{
    save.disabled=true;
    try{await saveArtwork();}
    catch(error){status.textContent=error.code||'INK_LINK_SAVE_FAILED';}
    finally{save.disabled=Boolean(identity&&!app.documentOpen);}
  });
  return{panel,client,service:app.driveArtworks,status:recovered?'RECOVERED':identity?'AUTHORIZATION_REQUIRED':'FIRST_SAVE_READY'};
}
