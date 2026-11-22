// INK #646 QA-only no-cache service worker; never ship as production.
const required="/INK/qa/cloud-draw-646/";
if(new URL(self.registration.scope).pathname!==required)throw Error("INK646_SW_SCOPE_REFUSED");
self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
