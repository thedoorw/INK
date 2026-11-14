/* #604 PRIVATE REFERENCE — not wired to Public index.html.
   Uses INK's existing Native bridge and consent; does NOT install the old Popup,
   add a Connect CHAT button, or auto-approve a Native edit / Undo.
   The Site owner-intent/Presence offer adapter MUST exist before enabling. */
import {installInkRuntimeBridge} from './runtime-bridge.js';
import {createG2NativeTargetGuard} from './g2-direct-target-guard.mjs';
import {createG2DirectBrowserTransport,G2_SCOPE} from './g2-direct-browser-transport.mjs';

export function createG2AutoDriver(bridge, {
  schedule=(fn,ms)=>setTimeout(fn,ms),
  cancel=key=>clearTimeout(key),
  intervalMs=3_000
}={}) {
  if (!bridge?.status || !bridge?.pair || !bridge?.checkNow || !bridge?.pendingConsent)
    throw new TypeError('G2_AUTO_DRIVER_REQUIRES_NATIVE_BRIDGE');
  let running=false, timer=null, pendingTick=false, phase='STOPPED', error=null;
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
        await bridge.checkNow();
        phase='G2_PAIRED';error=null;
      }
    } catch (e) {
      error=String(e?.code||e?.message||'G2_ERROR').slice(0,120);
      phase=error==='G2_OWNER_OFFER_REQUIRED'?'WAITING_CHAT_INTENT'
        :error==='G2_DISPOSABLE_TARGET_REQUIRED'?'WAITING_NEW_NATIVE_DOCUMENT'
        :error==='G2_TARGET_CHANGED'?'TARGET_CHANGED':'CHECK_FAILED';
      if (error==='G2_TARGET_CHANGED' || error==='G2_SESSION_EXPIRED') {
        try {await bridge.revoke('g2-session-invalid');} catch { /* fail closed */ }
      }
    } finally {
      pendingTick=false;
      if (running) timer=schedule(tick,intervalMs);
    }
  };
  return Object.freeze({
    start() { if(running) return; running=true;phase='STARTING';void tick(); },
    stop() { running=false;phase='STOPPED';if(timer!==null)cancel(timer);timer=null; },
    status() {return {running,phase,error};},
    tickNow:tick
  });
}

export function mountG2OwnerConsent(bridge, {
  documentObject=globalThis.document, container=documentObject?.getElementById?.('documentStatusStrip')
}={}) {
  if (!container || !documentObject?.createElement || !bridge?.pendingConsent
      || !bridge?.approvePending || !bridge?.rejectPending)
    throw new Error('G2_CONSENT_UI_UNAVAILABLE');

  const root=documentObject.createElement('section');
  root.setAttribute('data-g2-owner-consent','1');
  root.setAttribute('role','group');
  root.setAttribute('aria-label','Native edit or Undo approval');
  const label=documentObject.createElement('span');
  const error=documentObject.createElement('span');
  error.setAttribute('role','alert');
  const approve=documentObject.createElement('button');
  const reject=documentObject.createElement('button');
  approve.type=reject.type='button';
  approve.textContent='核准此項變更';
  reject.textContent='拒絕';
  root.append(label,error,approve,reject);
  container.append(root);
  let busy=false, disposed=false, lastError='';
  const render=()=>{
    if(disposed)return;
    const pending=bridge.pendingConsent();
    root.hidden=!pending;
    label.textContent=pending?String(pending.action||pending.tool||'Native request'):'';
    error.textContent=lastError;
    approve.disabled=reject.disabled=busy||!pending;
  };
  const act=async accepted=>{
    if(busy||disposed)return;
    const pending=bridge.pendingConsent();
    if(!pending)return;
    busy=true;lastError='';render();
    try {
      if(accepted)await bridge.approvePending(pending.requestId);
      else await bridge.rejectPending(pending.requestId);
    }catch(e){
      lastError=String(e?.code||e?.message||'G2_CONSENT_FAILED').slice(0,120);
    }finally{busy=false;render();}
  };
  const onApprove=()=>{void act(true);};
  const onReject=()=>{void act(false);};
  approve.addEventListener('click',onApprove);
  reject.addEventListener('click',onReject);
  const unsubscribe=bridge.subscribe(()=>render());
  render();
  return Object.freeze({
    dispose(){
      if(disposed)return;
      disposed=true;
      unsubscribe?.();
      approve.removeEventListener('click',onApprove);
      reject.removeEventListener('click',onReject);
      root.remove();
    }
  });
}

export function installG2DirectRuntime(app, {
  getTrustedOffer,pairThroughPresence,fetchImpl=globalThis.fetch,globalObject=globalThis,
  documentObject=globalThis.document,schedule,cancel
}={}) {
  if (!app?.documentOpen && !app?.commands?.subscribe)
    throw new Error('G2_NATIVE_RUNTIME_REQUIRED');
  // Never overwrite or piggyback on an existing legacy Popup/G1 runtime pairing.
  if (app.runtimeBridge) throw new Error('G2_BRIDGE_ALREADY_PRESENT');
  const guard=createG2NativeTargetGuard(app);
  let bridge=null,controls=null,driver=null;
  try {
    const transport=createG2DirectBrowserTransport({
      getTrustedOffer,pairThroughPresence,targetGuard:guard,fetchImpl,locationObject:globalObject.location,
      getRuntime:()=>({buildId:globalObject.INK_BUILD_ID,
        ready:!!globalObject.INK_APP
          && globalObject.INK_ARCHITECTURE?.buildId===globalObject.INK_BUILD_ID})
    });
    bridge=installInkRuntimeBridge(app,{transport,enabled:false});
    controls=mountG2OwnerConsent(bridge,{documentObject});
    driver=createG2AutoDriver(bridge,{schedule,cancel});
    const onPagehide=()=>{driver.stop();void bridge.revoke('pagehide');};
    globalObject.addEventListener?.('pagehide',onPagehide,{once:true});
    driver.start();
    return Object.freeze({
      status:()=>({driver:driver.status(),bridge:bridge.status()}),
      dispose:async()=>{
        driver.stop();controls.dispose();
        globalObject.removeEventListener?.('pagehide',onPagehide);
        try{await bridge.revoke('g2-dispose');}finally{guard.dispose();}
      }
    });
  }catch(e){
    driver?.stop();controls?.dispose();guard.dispose();
    if(bridge && app.runtimeBridge===bridge){void bridge.dispose();delete app.runtimeBridge;}
    throw e;
  }
}
