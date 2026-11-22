import {siteOrigin, buildId, sourceSha, scope, readOnlyScope, sameScope, popupLifetime, validBinding, validNonce,
  fromPeer, loadedIdentity, validDelivery, projectResult} from "./popup-policy.js";

let popup, port, challenge, active, pending, delivery, handshake, sessionId, testTarget, edit;
let negotiated = readOnlyScope, sequence = 0;
const seen = new Set();
let newDocumentSession;

function disposableTarget() {
  const app = window.INK_APP;
  const target = app?.sessions?.current();
  const record = target && app.sessions.get(target.sessionId);
  const page = app?.doc?.pages?.[0];
  return target && app.documentOpen && target.sessionId === newDocumentSession
    && record && !record.legacy && !record.recoverySourceKey && !app.driveLinkIdentity
    && app.doc.pages.length === 1 && page.layers.length === 1 && page.layers[0].objects.length === 0
    && !app.history.pending && !app.history.undoStack.length && !app.history.redoStack.length
    ? {...target, pageId:page.id} : null;
}

function currentTestDocument() {
  const app = window.INK_APP;
  const current = app?.sessions?.current();
  return testTarget && current?.sessionId === testTarget.sessionId && current.generation === testTarget.generation
    && current.documentId === testTarget.documentId && app.doc.activePageId === testTarget.pageId;
}

function permittedRequest({tool, input}) {
  if (tool === "get_ink_context") return true;
  if (!currentTestDocument()) return false;
  const app = window.INK_APP;
  switch (tool) {
    case "get_ink_history": return true;
    case "propose_ink_edit": return !edit && !!disposableTarget();
    case "approve_ink_edit": return edit?.state === "PROPOSED" && edit.proposalId === input.proposalId && !!disposableTarget();
    case "execute_ink_edit":
      return edit?.state === "APPROVED" && edit.proposalId === input.proposalId && edit.token === input.approvalToken
        && !!disposableTarget();
    case "undo_ink":
      return edit?.state === "EXECUTED" && !!edit.historyEntry && !app.history.pending
        && app.history.undoStack.at(-1) === edit.historyEntry;
    default: return false;
  }
}

function recordEdit(tool, result) {
  if (tool === "propose_ink_edit") edit = {state:"PROPOSED", proposalId:result.result?.proposalId};
  if (tool === "approve_ink_edit") edit = {...edit, state:"APPROVED", token:result.result?.approvalToken};
  if (tool === "execute_ink_edit") edit = {state:"EXECUTED", historyEntry:window.INK_APP.history.undoStack.at(-1)};
  if (tool === "undo_ink") edit = {state:"UNDONE"};
}
function reset() {
  window.removeEventListener("message", ready);
  clearTimeout(handshake);
  port?.close();
  popup?.close();
  if (pending) {
    clearTimeout(pending.timer);
    pending.reject(new Error("POPUP_DISCONNECTED"));
  }
  popup = port = active = pending = delivery = challenge = sessionId = testTarget = edit = undefined;
  negotiated = readOnlyScope;
  seen.clear();
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
      negotiated = testTarget && data.buildId === buildId && sameScope(data.scope, scope) ? scope : readOnlyScope;
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
  popup.postMessage({kind:"ink-popup-bind",nonce:event.data.nonce,challenge,buildId},siteOrigin,[channel.port2]);
}
function openPopup() {
  if (!loadedIdentity(location, window.INK_BUILD_ID) || window.INK_ARCHITECTURE?.buildId !== buildId) return;
  reset();
  testTarget = disposableTarget();
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
// #604: Optional Popup controls live in INK's existing plugins/擴充 menu.
// Do not place any standalone action on the artboard or modify editor commands.
function mountPrivatePluginMenu() {
  let menuObserver, activeMenu;
  const install = () => {
    const pane = activeMenu?.querySelector('.menu-pane[aria-label="plugins"]');
    const group = pane?.querySelector(".menu-group");
    if (!group || group.querySelector("[data-ink-readonly-popup]")) return;
    const host = document.createElement("div");
    host.className = "menu-item-host";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-row";
    button.setAttribute("role", "menuitem");
    button.setAttribute("data-ink-readonly-popup", "");
    const label = document.createElement("span");
    label.className = "menu-label";
    label.textContent = "開啟私人唯讀連線";
    button.append(label);
    host.append(button);
    group.append(host);
  };
  const attach = () => {
    const menu = document.getElementById("mainMenu");
    if (!menu || menu === activeMenu) return !!menu;
    menuObserver?.disconnect();
    activeMenu = menu;
    menu.addEventListener("click", event => {
      const button = event.target.closest?.("[data-ink-readonly-popup]");
      if (!button || !menu.contains(button)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      // Keep the original menu's close lifecycle and the user's popup gesture.
      document.getElementById("logoButton")?.click();
      openPopup();
    }, true);
    menuObserver = new MutationObserver(install);
    menuObserver.observe(menu, {childList:true,subtree:true});
    install();
    return true;
  };
  // The native shell can replace #mainMenu after initial mount or on re-render.
  // Track the current element, not an obsolete menu subtree.
  const shellObserver = new MutationObserver(() => attach());
  shellObserver.observe(document.body, {childList:true,subtree:true});
  attach();
  window.addEventListener("pagehide", () => {
    shellObserver.disconnect();
    menuObserver?.disconnect();
  }, {once:true});
}

if (window.INK_G2_DIRECT_ENABLED !== true && loadedIdentity(location, window.INK_BUILD_ID)) {
  function trackNewDocument() {
    const app = window.INK_APP;
    const unsubscribe = app.commands.subscribe(event => {
      if (event.type === "command" && event.commandId === "document.new.v1"
        && event.origin === "human-ui" && event.changed) newDocumentSession = app.sessions.current()?.sessionId;
    });
    const {bridge, controls} = app.runtimeBridgeStartup;
    controls?.elements?.approve.addEventListener("click", event => {
      if (!delivery || permittedRequest(delivery.request)) return;
      event.stopImmediatePropagation();
      const consent = bridge.pendingConsent();
      if (consent) void bridge.rejectPending(consent.requestId, "target-changed", "INK_G2_TARGET_CHANGED").catch(() => {});
    }, true);
    window.addEventListener("pagehide", unsubscribe, {once:true});
  }
  if (window.INK_APP) trackNewDocument();
  else window.addEventListener("ink:runtime-ready", trackNewDocument, {once:true});
  window.INK_RUNTIME_BRIDGE_CONFIG = Object.freeze({
    install:true, sourceSha,
    transport:{
      async pair(input) {
        if (!validBinding(input, negotiated)) throw new Error("PAIR_DENIED");
        const receipt = await call("pair",{sessionId:input.sessionId,sourceSha,scope:negotiated});
        sessionId = input.sessionId;
        return receipt;
      },
      async discover() {
        if (delivery && Date.parse(delivery.request.expiresAt) > Date.now()) return null;
        delivery = null;
        const next = await call("discover");
        if (next == null) return null;
        if (!validDelivery(next, sessionId, Date.now(), negotiated)) throw new Error("REQUEST_DENIED");
        const {request} = next;
        if (seen.has(request.requestId) || seen.size >= 64 || !permittedRequest(request)) throw new Error("REQUEST_DENIED");
        seen.add(request.requestId);
        if (request.tool === "execute_ink_edit") edit = {state:"EXECUTING"};
        delivery = next;
        return delivery;
      },
      async publishResult(result) {
        const safe = projectResult(result, delivery, sessionId, Date.now(), negotiated);
        if (!safe) throw new Error("RECEIPT_DENIED");
        if (safe.tool !== "get_ink_context" && safe.agentResult) {
          if (!currentTestDocument() || safe.agentResult.documentId !== testTarget.documentId
            || safe.agentResult.pageId !== testTarget.pageId) throw new Error("DOCUMENT_MISMATCH");
          recordEdit(safe.tool, safe.agentResult);
        }
        const receipt = await call("publishResult",safe);
        if (safe.status !== "WAITING_CONSENT") delivery = null;
        return receipt;
      },
      async revoke() { try { return await call("revoke"); } finally { reset(); } },
      dispose:reset,
    },
    pairOptionsProvider:()=>({scope:negotiated}),
  });
  mountPrivatePluginMenu();
  window.addEventListener("pagehide",reset,{once:true});
}
