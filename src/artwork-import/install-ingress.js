import { createExternalArtworkIngress } from './external-file-ingress.mjs';
import { mountArtworkIngressConsent } from './ingress-consent.js';
// Startup publishes a blocked, read-free controller. No transport is guessed.
export function installExternalArtworkIngress(app) {
  app.externalArtworkIngress=createExternalArtworkIngress(app);
  return app.externalArtworkIngress;
}
// Explicit integration seam for MR / #534 owner. Does not alter the .ink inbox.
// The caller is trusted first-party composition, never a CHAT named-tool payload.
export function bindExternalArtworkTransport(app,transport,options={}) {
  const next=createExternalArtworkIngress(app,{transport});
  if(app.externalArtworkIngressUI)app.externalArtworkIngressUI.dispose();
  else app.externalArtworkIngress?.dispose();
  app.externalArtworkIngress=next;
  app.externalArtworkIngressUI=mountArtworkIngressConsent(app,next,options);
  return app.externalArtworkIngressUI;
}
