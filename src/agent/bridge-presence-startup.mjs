/* #604: Passive, presence-only bridge. No popup, drawing, consent or editor writes. */
import {createInkPresenceClient} from './bridge-presence-client.mjs';

const PUBLIC_ORIGIN = 'https://thedoorw.github.io';
const PUBLIC_PATH = '/INK/';

export function installInkPresenceStartup({
  globalObject = globalThis,
  clientFactory = createInkPresenceClient
} = {}) {
  if (!globalObject?.location || globalObject.location.origin !== PUBLIC_ORIGIN
      || globalObject.location.pathname !== PUBLIC_PATH) {
    return Object.freeze({installed:false, status:()=>({status:'NOT_PUBLIC_INK'})});
  }
  // Modules can be re-imported during test/dev hot reload; keep a single heartbeat agent.
  if (globalObject.INK_BRIDGE_PRESENCE?.installed === true) return globalObject.INK_BRIDGE_PRESENCE;
  const client = clientFactory({
    locationObject:globalObject.location,
    historyObject:globalObject.history,
    fetchImpl:globalObject.fetch?.bind(globalObject),
  });
  const start = () => { void Promise.resolve().then(() => client.start()).catch(() => {}); };
  const stop = () => client.stop();
  const controller = Object.freeze({
    installed:true,status:()=>client.getStatus(),stop,
    ...(globalObject.INK_G2_DIRECT_ENABLED===true?{
      getG2Offer:()=>client.getG2Offer(),
      pairG2:input=>client.pairG2(input)
    }:{})
  });
  Object.defineProperty(globalObject, 'INK_BRIDGE_PRESENCE', {
    value:controller, writable:false, configurable:false, enumerable:false
  });
  globalObject.addEventListener?.('pagehide', stop);
  // Back-forward cache restores need to resume heartbeat without another INK button.
  globalObject.addEventListener?.('pageshow', start);
  start();
  return controller;
}

if (typeof window !== 'undefined') installInkPresenceStartup({globalObject:window});
