import {siteOrigin, buildId, sourceSha, scope, popupLifetime, validBinding, validNonce,
  fromPeer, loadedIdentity, projectResult} from "./popup-policy.js";

let popup, port, challenge, active, pending, delivery, handshake, sequence = 0;
function reset() {
  window.removeEventListener("message", ready);
  clearTimeout(handshake);
  port?.close();
  popup?.close();
  if (pending) {
    clearTimeout(pending.timer);
    pending.reject(new Error("POPUP_DISCONNECTED"));
  }
  popup = port = active = pending = delivery = challenge = undefined;
  sequence = 0;
}
function ready(event) {
  if (!fromPeer(event, siteOrigin, popup, "ink-popup-ready") || !validNonce(event.data.nonce)) return;
  window.removeEventListener("message", ready);
  const channel = new MessageChannel();
  const handle = popup;
  channel.port1.onmessageerror = reset;
  channel.port1.onmessage = ({data}) => {
    if (popup !== handle || popup.closed || data?.challenge !== challenge) return;
    if (data.kind === "ink-popup-accepted" && !port) {
      clearTimeout(handshake);
      port = channel.port1;
      active = Date.now() + popupLifetime;
      return;
    }
    if (!pending || data.id !== pending.id) return;
    const response = pending;
    pending = undefined;
    clearTimeout(response.timer);
    if (data.error) response.reject(new Error(data.error));
    else response.resolve(data.result);
  };
  popup.postMessage({kind:"ink-popup-bind",nonce:event.data.nonce,challenge},siteOrigin,[channel.port2]);
}
function openPopup() {
  if (!loadedIdentity(location, window.INK_BUILD_ID) || window.INK_ARCHITECTURE?.buildId !== buildId) return;
  reset();
  challenge = crypto.randomUUID();
  window.addEventListener("message", ready);
  popup = window.open(siteOrigin+"/bridge-popup", "_blank", "popup,width=650,height=480");
  if (!popup) reset();
  else handshake = setTimeout(reset, 45_000);
}
function call(method, input) {
  if (!port || popup.closed || Date.now() >= active) {
    reset();
    return Promise.reject(new Error("POPUP_DISCONNECTED"));
  }
  if (pending) return Promise.reject(new Error("POPUP_BUSY"));
  return new Promise((resolve,reject) => {
    const id = ++sequence;
    const timer = setTimeout(reset, 12_000);
    pending = {id,resolve,reject,timer};
    port.postMessage({challenge,id,method,input});
  });
}
if (loadedIdentity(location, window.INK_BUILD_ID)) {
  window.INK_RUNTIME_BRIDGE_CONFIG = Object.freeze({
    install:true, sourceSha,
    transport:{
      pair(input) {
        if (!validBinding(input)) throw new Error("PAIR_DENIED");
        return call("pair",{sessionId:input.sessionId,sourceSha,scope});
      },
      async discover() { delivery = await call("discover"); return delivery; },
      publishResult(result) {
        const safe = projectResult(result,delivery,result?.sessionId,Date.now());
        if (!safe) throw new Error("RECEIPT_DENIED");
        delivery = null;
        return call("publishResult",safe);
      },
      async revoke() { try { return await call("revoke"); } finally { reset(); } },
      dispose:reset,
    },
    pairOptionsProvider:()=>({scope}),
  });
  const button=document.createElement("button");
  button.type="button";
  button.textContent="開啟私人唯讀連線";
  button.addEventListener("click",openPopup);
  document.body.append(button);
  window.addEventListener("pagehide",reset,{once:true});
}
