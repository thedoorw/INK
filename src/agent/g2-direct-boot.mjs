/* #604 PRIVATE CANDIDATE. Disabled by default. A future exact-build QA must
   opt in before first module execution. Never enables Native edits on Presence
   CONNECTED alone: Site owner offer + independent short-lived G2 session and
   separate INK UI approvals remain mandatory. */
import {installG2DirectRuntime} from './g2-direct-runtime-startup.mjs';

export function installG2DirectBoot(globalObject=globalThis){
  if(globalObject?.INK_G2_DIRECT_ENABLED!==true)return {installed:false,status:'OFF'};
  if(globalObject.location?.origin!=='https://thedoorw.github.io'
      ||globalObject.location?.pathname!=='/INK/')
    return {installed:false,status:'WRONG_ORIGIN'};
  if(globalObject.INK_G2_DIRECT_RUNTIME)return globalObject.INK_G2_DIRECT_RUNTIME;

  let active=null,reason='WAITING_RUNTIME';
  const begin=()=>{
    if(active)return;
    const app=globalObject.INK_APP,presence=globalObject.INK_BRIDGE_PRESENCE;
    if(!app?.commands?.subscribe)return;
    if(typeof presence?.getG2Offer!=='function'
        ||typeof presence?.pairG2!=='function'){
      reason='PRESENCE_G2_CALLBACKS_MISSING';
      return;
    }
    try{
      active=installG2DirectRuntime(app,{
        globalObject,documentObject:globalObject.document,
        fetchImpl:globalObject.fetch?.bind(globalObject),
        getTrustedOffer:()=>presence.getG2Offer(),
        pairThroughPresence:input=>presence.pairG2(input)
      });
      reason='INSTALLED';
    }catch(e){
      reason=String(e?.code||e?.message||'G2_INSTALL_FAILED').slice(0,100);
    }
  };
  const ready=()=>begin();
  globalObject.addEventListener?.('ink:runtime-ready',ready);
  const handle=Object.freeze({
    installed:true,
    status:()=>({status:reason,...(active?{runtime:active.status()}:{})}),
    async dispose(){
      globalObject.removeEventListener?.('ink:runtime-ready',ready);
      if(active){const current=active;active=null;await current.dispose();}
      reason='STOPPED';
    }
  });
  Object.defineProperty(globalObject,'INK_G2_DIRECT_RUNTIME',{
    value:handle,configurable:false,writable:false,enumerable:false
  });
  if(globalObject.INK_APP)begin();
  return handle;
}
if(typeof window!=='undefined')installG2DirectBoot(window);
