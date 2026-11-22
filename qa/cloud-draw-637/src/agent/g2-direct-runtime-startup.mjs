import {installInkRuntimeBridge} from './runtime-bridge.js';
import {createG2SessionGuard} from './g2-direct-session-guard.mjs';
import {createG2DirectBrowserTransport,G2_SCOPE} from './g2-direct-browser-transport.mjs';

export function createG2AutoDriver(bridge, {
  schedule=(fn,ms)=>setTimeout(fn,ms),
  cancel=key=>clearTimeout(key),
  intervalMs=3_000,
  onStatus=()=>{},
  onInvalid=null
}={}) {
  if (!bridge?.status || !bridge?.pair || !bridge?.checkNow || !bridge?.pendingConsent)
    throw new TypeError('G2_AUTO_DRIVER_REQUIRES_NATIVE_BRIDGE');
  let running=false, timer=null, pendingTick=false, idleTicks=0, phase='STOPPED', error=null;
  const tick=async()=>{
    if (!running || pendingTick) return;
    pendingTick=true;
    try {
      if (bridge.pendingConsent()) {
        phase='WAITING_OWNER_CONSENT';error=null;
      } else if (!bridge.status().paired) {
        phase='PAIRING';
        await bridge.pair({scope:[...G2_SCOPE]});
        phase='G2_PAIRED';error=null;
      } else {
        phase='CHECKING';
        const result=await bridge.checkNow();
        idleTicks=result?0:Math.min(idleTicks+1,2);
        phase='G2_PAIRED';error=null;
      }
    } catch (e) {
      error=String(e?.code||e?.message||'G2_ERROR').slice(0,120);
      phase=(error==='G2_OWNER_OFFER_REQUIRED'||error==='G2_PRESENCE_REQUIRED')?'WAITING_CHAT_INTENT'
        :error==='G2_DISPOSABLE_TARGET_REQUIRED'?'WAITING_NEW_NATIVE_DOCUMENT'
        :error==='G2_TARGET_CHANGED'?'TARGET_CHANGED':'CHECK_FAILED';
      if (['G2_TARGET_CHANGED','BRIDGE_HTTP_403'].includes(error) || (bridge.status().paired &&
        ['G2_SESSION_EXPIRED','G2_LEASE_CONFIRMED_EXPIRED','G2_SESSION_REQUIRED','G2_SITE_HTTP_403',
          'G2_RUNTIME_NOT_READY','G2_LEASE_RECEIPT_INVALID','G2_DELIVERY_PENDING'].includes(error))) {
        if(onInvalid){running=false;onInvalid(error);return;}
        try {await bridge.revoke('g2-session-invalid');} catch { /* fail closed */ }
      }
    } finally {
      pendingTick=false;
      onStatus();
      if (running) timer=schedule(tick,intervalMs*(1+idleTicks));
    }
  };
  return Object.freeze({
    start() { if(running) return; running=true;phase='STARTING';void tick(); },
    stop() { running=false;phase='STOPPED';if(timer!==null)cancel(timer);timer=null; },
    status() {return {running,phase,error};},
    tickNow(){
      if(timer!==null)cancel(timer);
      timer=null;
      return tick();
    }
  });
}

export function installG2DirectRuntime(app, {
  getTrustedOffer,pairThroughPresence,fetchImpl=globalThis.fetch,globalObject=globalThis,
  schedule,cancel,now,userGranted=false,onStatus,onInvalid
}={}) {
  if (!userGranted || !app?.commands?.subscribe || !app?.history)
    throw new Error('G2_CLICK_GRANT_REQUIRED');
  if (app.runtimeBridge) throw new Error('G2_BRIDGE_ALREADY_PRESENT');
  const guard=createG2SessionGuard(app);
  const grantBuild=globalObject.INK_BUILD_ID;
  let grantedInstance=null, disposed=false, recovering=false, recovery=null;
  let bridge, driver, transport;
  const validGrant=()=>!disposed && guard.matches() && globalObject.INK_APP===app
    && globalObject.INK_BUILD_ID===grantBuild && globalObject.INK_ARCHITECTURE?.buildId===grantBuild;
  const invalidate=error=>onInvalid?.(error);
  const rearm=async()=>{
    recovering=true;
    onStatus?.();
    try {
      await bridge.dispose();
      if(!disposed && validGrant())install();
      else if(!disposed)invalidate('G2_TARGET_CHANGED');
    } catch {
      if(!disposed)invalidate('G2_RECOVERY_FAILED');
    } finally {
      recovering=false;
      onStatus?.();
    }
  };
  const handleFailure=error=>{
    // Only an elapsed local lease can rearm the click grant. A Relay denial,
    // invalid response, target switch or Build change ends the grant.
    if(error==='G2_LEASE_CONFIRMED_EXPIRED' && grantedInstance && validGrant()){
      recovery=rearm();
      return;
    }
    invalidate(error);
  };
  function install(){
    transport=createG2DirectBrowserTransport({
      getTrustedOffer:async()=>{
        const offer=await getTrustedOffer();
        if(offer?.status==='G2_OFFER' && grantedInstance && offer.instanceId!==grantedInstance)
          throw new Error('G2_TARGET_CHANGED');
        return offer;
      },
      pairThroughPresence:async input=>{
        const result=await pairThroughPresence(input);
        if(result?.status==='G2_PAIRED' && result.instanceId===input.instanceId)
          grantedInstance=input.instanceId;
        return result;
      },
      targetGuard:guard,fetchImpl,now,locationObject:globalObject.location,
      verifyExpiredLease:true,
      isForeground:()=>true,
      getRuntime:()=>({buildId:grantBuild,ready:validGrant()})
    });
    bridge=installInkRuntimeBridge(app,{
      transport,enabled:false,now,
      sourceShaReader:()=>globalObject.document?.querySelector('meta[name="ink-live-source-sha"]')?.content,
      sessionConsent:request=>transport.authorizes(request)
        && ['approve_ink_edit','undo_ink','redo_ink'].includes(request.tool),
      authorizeDispatch:request=>transport.authorizes(request),
      invoke:(tool,input)=>{
        const result=guard.invoke(tool,input);
        if(!validGrant())invalidate('G2_TARGET_CHANGED');
        return result;
      }
    });
    driver=createG2AutoDriver(bridge,{schedule,cancel,onStatus,onInvalid:handleFailure});
    driver.start();
  }
  const unsubscribe=app.commands.subscribe(()=>{
    if(!validGrant())invalidate('G2_TARGET_CHANGED');
  });
  const wake=()=>{if(!disposed && !recovering)void driver.tickNow();};
  install();
  globalObject.addEventListener?.('online',wake);
  globalObject.document?.addEventListener?.('visibilitychange',wake);
  return Object.freeze({
    status:()=>{
      const state=bridge.status();
      return {recovering,driver:driver.status(),bridge:{...state,accepting:state.accepting&&transport.status().paired}};
    },
    async dispose(){
      if(disposed)return;
      disposed=true;
      driver.stop();
      unsubscribe?.();
      guard.dispose();
      globalObject.removeEventListener?.('online',wake);
      globalObject.document?.removeEventListener?.('visibilitychange',wake);
      if(recovering)await recovery;
      else await bridge.dispose();
    }
  });
}
