import {normalizeG2DocumentRequest} from './g2-create-document.mjs';
import {createInkRuntimeLink} from './ink-runtime-link.mjs';
import {createG2ResumeGate} from './g2-direct-resume.mjs';
import {SOURCE_SHA as G2_SOURCE_SHA} from './g2-direct-browser-transport.mjs';

export function installG2DirectBoot(globalObject=globalThis,{
  installRuntime,now=()=>Date.now(),
  schedule=(fn,ms)=>setTimeout(fn,ms),cancel=key=>clearTimeout(key)
}={}){
  if(globalObject?.INK_G2_DIRECT_ENABLED!==true)return {installed:false,status:'OFF'};
  if(globalObject.location?.origin!=='https://thedoorw.github.io'
      ||globalObject.location?.pathname!=='/INK/')
    return {installed:false,status:'WRONG_ORIGIN'};
  if(globalObject.INK_G2_DIRECT_RUNTIME)return globalObject.INK_G2_DIRECT_RUNTIME;

  const documentObject=globalObject.document;
  const link=createInkRuntimeLink({globalObject,installRuntime});
  let active=null,preparation=null,disconnecting=false,reason='IDLE',button=null,observer=null;
  let suspended=false,resumeTimer=null,resumeChecking=false,bfcacheAllowed=false;
  let autoTimer=null,autoChecking=false,lastOwnerOfferId=null;
  const resume=createG2ResumeGate({globalObject,now});
  const cancelResumeTimer=()=>{if(resumeTimer!==null)cancel(resumeTimer);resumeTimer=null;};
  const cancelAutoTimer=()=>{if(autoTimer!==null)cancel(autoTimer);autoTimer=null;};
  const retryResume=()=>{
    if(resumeTimer!==null||!resume.hasMarker()||suspended||active)return;
    resumeTimer=schedule(()=>{resumeTimer=null;void tryResume();},2_000);
  };
  const render=()=>{
    if(!button)return;
    const paired=active?.status().bridge.accepting===true;
    button.disabled=disconnecting;
    const runtime=active?.status();
    const failed=runtime?.driver.phase==='CHECK_FAILED';
    const label=paired&&!failed?'已連線 CHAT · 斷線'
      :failed?'連線暫停 · 取消'
      :runtime?.recovering?'重新連線中 · 取消'
      :preparation?'等待文件或尺寸 · 取消'
      :active?'連線中 · 取消':reason==='IDLE'?'連線 CHAT':'已斷線 · 連線 CHAT';
    button.title=runtime?.driver.error || (reason==='IDLE'||reason==='DISCONNECTED'?'':reason);
    if(button.firstChild.textContent!==label)button.firstChild.textContent=label;
    button.setAttribute('aria-pressed',String(paired));
  };
  const disconnect=async(error,{preserveResume=false}={})=>{
    if(!preserveResume){resume.clear();cancelResumeTimer();}
    if(!active)return;
    active=null;
    disconnecting=true;
    reason=error||'DISCONNECTED';
    render();
    try{await link.disconnect();}finally{
      disconnecting=false;render();
      if(preserveResume&&!suspended)retryResume();
      if(!suspended)void tryOwnerOffer();
    }
  };
  const cancelPreparation=()=>{
    const attempt=preparation;
    if(!attempt)return;
    preparation=null;
    clearTimeout(attempt.timer);
    reason='DISCONNECTED';
    if(attempt.grantId)void attempt.presence.blankG2(attempt.grantId,true).catch(()=>{});
    render();
  };
  const tryResume=async()=>{
    if(!resume.hasMarker()||suspended||active||preparation||resumeChecking)return;
    if(disconnecting){retryResume();return;}
    resumeChecking=true;
    try{
      const app=globalObject.INK_APP;
      let documentReady=false;
      if(app?.startupDocumentReady){
        await app.startupDocumentReady;
        documentReady=true;
      }
      if(suspended||active||preparation)return;
      const presence=globalObject.INK_BRIDGE_PRESENCE;
      const state=resume.inspect({
        app,presence,buildId:globalObject.INK_BUILD_ID,
        allowBfcache:bfcacheAllowed,documentReady
      });
      if(state==='GRANTED'){
        let runtime,renewed=false;
        const onStatus=()=>{
          // Re-arm the finite hint only after a NEW server-verified pair.
          // Merely loading a matching marker never extends its lifetime.
          if(!renewed&&runtime&&active===runtime
              &&runtime.status().bridge.accepting===true
              &&resume.inspect({app,presence,buildId:globalObject.INK_BUILD_ID,
                allowBfcache:bfcacheAllowed,documentReady:true})==='GRANTED'){
            renewed=resume.capture({app,presence,buildId:globalObject.INK_BUILD_ID});
          }
          render();
        };
        runtime=link.reconnect({app,presence,documentObject,
          // A prior trusted click is bound to this same Presence instance and
          // exact document. Relay must still authorize a fresh one-use offer.
          userGranted:true,onStatus,onInvalid:error=>{void disconnect(error);}
        });
        active=runtime;
        reason='AUTO_RESUMED';
        onStatus();
      }else if(state.startsWith('WAIT_'))retryResume();
    }catch{
      resume.clear();reason='G2_RESUME_FAILED';render();
    }finally{resumeChecking=false;}
  };
  // A registered Presence device can see only a one-use offer minted by the
  // authenticated Site owner in CHAT. Seeing that specific offer is the
  // authorization for this automatic pair; mere page visibility is not.
  const tryOwnerOffer=async()=>{
    if(autoChecking||suspended||active||preparation||disconnecting||resume.hasMarker())return;
    autoChecking=true;
    try{
      const app=globalObject.INK_APP,presence=globalObject.INK_BRIDGE_PRESENCE;
      if(!app?.commands||!app?.sessions?.current
          ||!presence?.installed||typeof presence.getG2Offer!=='function'
          ||!['ONLINE','CHALLENGE_ACKNOWLEDGED'].includes(presence.status?.().status)
          ||globalObject.INK_ARCHITECTURE?.buildId!==globalObject.INK_BUILD_ID
          ||globalObject.navigator?.onLine===false)return;
      await app.startupDocumentReady;
      if(suspended||active||preparation||disconnecting
          ||globalObject.INK_APP!==app||globalObject.INK_BRIDGE_PRESENCE!==presence)return;
      const offer=await presence.getG2Offer();
      const at=now(),instance=presence.status?.().instanceId;
      if(offer?.status!=='G2_OFFER'||!/^[a-f0-9]{24}$/.test(offer.offerId||'')
          ||offer.offerId===lastOwnerOfferId||offer.instanceId!==instance
          ||offer.buildId!==globalObject.INK_BUILD_ID
          ||offer.sourceSha!==G2_SOURCE_SHA
          ||!Number.isSafeInteger(offer.expiresAt)||offer.expiresAt<=at
          ||offer.expiresAt>at+90_000)return;
      // Do not retry an already seen offer after a transport or target failure.
      // Relay will independently verify one-use consumption and owner/device.
      lastOwnerOfferId=offer.offerId;
      if(suspended||active||preparation||disconnecting||globalObject.INK_APP!==app
          ||globalObject.INK_BUILD_ID!==offer.buildId)return;
      let runtime,persisted=false;
      const onStatus=()=>{
        if(!persisted&&runtime&&active===runtime
            &&runtime.status().bridge.accepting===true){
          if(app.documentOpen)persisted=resume.capture({app,presence,buildId:offer.buildId});
        }
        render();
      };
      runtime=link.pair({app,presence,documentObject,userGranted:true,
        onStatus,onInvalid:error=>{void disconnect(error);}});
      active=runtime;
      reason='OWNER_OFFER_AUTO_PAIR';
      onStatus();
    }catch(error){
      reason=String(error?.code||error?.message||'G2_AUTO_LINK_FAILED').slice(0,120);
      render();
    }finally{
      autoChecking=false;
      if(!suspended&&!active&&autoTimer===null){
        autoTimer=schedule(()=>{autoTimer=null;void tryOwnerOffer();},3_000);
      }
    }
  };
  const click=async event=>{
    if(!event.isTrusted||disconnecting)return;
    if(preparation){cancelPreparation();resume.clear();return;}
    if(active){void disconnect();return;}
    resume.clear();cancelResumeTimer();
    const app=globalObject.INK_APP,presence=globalObject.INK_BRIDGE_PRESENCE;
    if(!app?.commands||!presence?.pairG2||!presence?.blankG2){reason='INK 尚未就緒';render();return;}
    const build=globalObject.INK_BUILD_ID;
    const attempt={presence,grantId:null,timer:null};
    const valid=()=>preparation===attempt && globalObject.INK_APP===app
      && globalObject.INK_BUILD_ID===build && globalObject.INK_BRIDGE_PRESENCE===presence;
    const startRuntime=()=>{
      if(!valid()||!app.documentOpen)return;
      let runtime,persisted=false;
      const onStatus=()=>{
        // A trusted click alone is not sufficient for reload consent. Only a
        // Relay-verified G2 pair AND an accepting Native bridge earns the hint.
        if(!persisted&&runtime&&active===runtime
            &&runtime.status().bridge.accepting===true){
          persisted=resume.capture({app,presence,buildId:build});
        }
        render();
      };
      runtime=link.pair({app,presence,documentObject,
        userGranted:true,onStatus,onInvalid:error=>{void disconnect(error);}
      });
      active=runtime;
      cancelPreparation();
      onStatus();
    };
    const fail=error=>{
      cancelPreparation();
      reason=String(error?.code||error?.message||'G2_INSTALL_FAILED');
      render();
    };
    const poll=async()=>{
      if(!valid()){if(preparation===attempt)fail(new Error('G2_TARGET_CHANGED'));return;}
      try{
        if(app.documentOpen){startRuntime();return;}
        const reply=await presence.blankG2(attempt.grantId);
        if(!valid())return;
        if(app.documentOpen){startRuntime();return;}
        if(reply.status==='G2_CREATE_CLAIMED'){
          const spec=normalizeG2DocumentRequest(reply.request);
          if(!spec)throw new Error('G2_DOCUMENT_SIZE_REQUIRED');
          const {requestId,...size}=spec;
          const receipt=await app.commands.execute('document.new.v1',size,'human-ui');
          if(!valid())return;
          if(!receipt?.ok||!receipt.changed||!app.documentOpen||app.doc?.id!==receipt.result?.documentId)
            throw new Error(receipt?.error?.code||'G2_DOCUMENT_CREATION_FAILED');
          startRuntime();
          return;
        }
      }catch(error){
        if(!valid())return;
        if(!['G2_PRESENCE_REQUIRED','BRIDGE_HTTP_403'].includes(error.message)){fail(error);return;}
      }
      if(valid())attempt.timer=setTimeout(poll,1000);
    };
    preparation=attempt;
    render();
    try{
      await app.startupDocumentReady;
      if(!valid()){if(preparation===attempt)fail(new Error('G2_TARGET_CHANGED'));return;}
      if(app.documentOpen){startRuntime();return;}
      const bytes=globalObject.crypto.getRandomValues(new Uint8Array(12));
      attempt.grantId=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
      void poll();
    }catch(error){if(preparation===attempt)fail(error);}
  };
  const mount=()=>{
    const group=documentObject?.querySelector?.('#mainMenu .menu-pane[aria-label="plugins"] .menu-group');
    if(!group||group.contains(button))return;
    const host=documentObject.createElement('div');
    host.className='menu-item-host';
    button=documentObject.createElement('button');
    button.type='button';
    button.className='menu-row';
    button.setAttribute('data-ink-g2-connect','');
    button.setAttribute('role','menuitem');
    const label=documentObject.createElement('span');
    label.className='menu-label';
    button.append(label);
    button.addEventListener('click',click);
    host.append(button);
    group.append(host);
    render();
  };
  const start=event=>{
    suspended=false;
    if(event?.type==='pageshow'&&event.persisted===true)bfcacheAllowed=true;
    if(!documentObject?.body||!globalObject.MutationObserver)return;
    if(!observer){
      observer=new globalObject.MutationObserver(mount);
      observer.observe(documentObject.body,{childList:true,subtree:true});
    }
    mount();
    void tryResume();
    void tryOwnerOffer();
  };
  const pagehide=()=>{
    suspended=true;
    cancelResumeTimer();
    cancelAutoTimer();
    cancelPreparation();
    observer?.disconnect();
    observer=null;
    void disconnect(undefined,{preserveResume:true});
  };
  const online=()=>{if(!suspended){void tryResume();void tryOwnerOffer();}};
  globalObject.addEventListener?.('ink:runtime-ready',start);
  globalObject.addEventListener?.('pageshow',start);
  globalObject.addEventListener?.('pagehide',pagehide);
  globalObject.addEventListener?.('online',online);
  const handle=Object.freeze({
    installed:true,
    discover:()=>link.discover(),
    receipt:()=>link.receipt(),
    status:()=>({status:active?'INSTALLED':preparation?'WAITING_FOR_DOCUMENT':reason,...(active?{runtime:active.status()}:{})}),
    async dispose(){
      suspended=true;
      resume.clear();cancelResumeTimer();
      cancelAutoTimer();
      cancelPreparation();
      observer?.disconnect();
      button?.parentElement?.remove();
      globalObject.removeEventListener?.('ink:runtime-ready',start);
      globalObject.removeEventListener?.('pageshow',start);
      globalObject.removeEventListener?.('pagehide',pagehide);
      globalObject.removeEventListener?.('online',online);
      await disconnect();
    }
  });
  Object.defineProperty(globalObject,'INK_G2_DIRECT_RUNTIME',{value:handle});
  start();
  return handle;
}
if(typeof window!=='undefined')installG2DirectBoot(window);
