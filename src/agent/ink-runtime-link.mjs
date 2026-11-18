/* #625: Thin lifecycle facade over the existing Presence + owner-bound G2
   Native bridge. Future browser/PIN adapters may provide a presenceReader;
   this module does not mint grants, transport receipts or Native commands. */
import {installG2DirectRuntime} from './g2-direct-runtime-startup.mjs';

export function createInkRuntimeLink({
  globalObject=globalThis,
  presenceReader=()=>globalObject.INK_BRIDGE_PRESENCE,
  installRuntime=installG2DirectRuntime
}={}){
  let runtime=null;
  const discover=()=>{
    const presence=presenceReader();
    const state=presence?.status?.();
    return Object.freeze({
      status:state?.status==='ONLINE'||state?.status==='CHALLENGE_ACKNOWLEDGED'
        ?'PRESENCE_ONLINE':state?.status==='NEEDS_CHAT_ENROLLMENT'
          ?'NOT_ENROLLED':state?.status||'PRESENCE_UNAVAILABLE',
      instanceId:state?.instanceId||null,
      buildId:globalObject.INK_BUILD_ID||null,
      runtimeReady:Boolean(globalObject.INK_APP?.commands)
        &&globalObject.INK_ARCHITECTURE?.buildId===globalObject.INK_BUILD_ID
    });
  };
  const transport=(presence=presenceReader())=>{
    if(typeof presence?.getG2Offer!=='function'||typeof presence?.pairG2!=='function')
      throw new Error('G2_PRESENCE_TRANSPORT_REQUIRED');
    return Object.freeze({
      getTrustedOffer:()=>presence.getG2Offer(),
      pairThroughPresence:input=>presence.pairG2(input)
    });
  };
  const receipt=()=>{
    // These are read-only bridge receipt identifiers, not an alternate result
    // channel. Native requests and full receipts still use the original G2
    // browser transport publishResult -> Relay -> Site owner read path.
    const state=runtime?.status?.().bridge;
    return Object.freeze({
      lastRequestId:state?.lastRequestId??null,
      lastTerminalState:state?.lastTerminalState??null,
      activeRequestId:state?.activeRequestId??null,
      pendingConsentRequestId:state?.pendingConsentRequestId??null
    });
  };
  const start=({app=globalObject.INK_APP,presence=presenceReader(),documentObject=globalObject.document,
    userGranted=false,onStatus=()=>{},onInvalid=()=>{}}={})=>{
    if(globalObject.INK_G2_DIRECT_ENABLED!==true)throw new Error('G2_LINK_DISABLED');
    if(globalObject.location?.origin!=='https://thedoorw.github.io'
        ||globalObject.location?.pathname!=='/INK/')
      throw new Error('G2_LINK_ORIGIN_DENIED');
    if(userGranted!==true)throw new Error('G2_LINK_CONSENT_REQUIRED');
    if(runtime)throw new Error('G2_LINK_ALREADY_ACTIVE');
    const adapters=transport(presence);
    const next=installRuntime(app,{
      globalObject,documentObject,fetchImpl:globalObject.fetch?.bind(globalObject),
      ...adapters,userGranted:true,onStatus,onInvalid
    });
    if(!next?.status||!next?.dispose)throw new Error('G2_LINK_RUNTIME_INVALID');
    runtime=next;
    return runtime;
  };
  const disconnect=async()=>{
    const current=runtime;
    runtime=null;
    if(current)await current.dispose();
    return Object.freeze({status:'DISCONNECTED'});
  };
  const status=()=>Object.freeze({
    status:runtime?'ACTIVE':'DISCOVER_ONLY',
    presence:discover(),
    paired:runtime?.status?.().bridge?.accepting===true,
    receipt:receipt()
  });
  return Object.freeze({
    discover,transport,
    pair:start,
    reconnect:start,
    receipt,disconnect,status
  });
}
