// INK637_PREVIEW_SW_NO_CACHE_V1
const EXPECTED_PATH='/INK/qa/cloud-draw-637/';
if(new URL(self.registration.scope).pathname!==EXPECTED_PATH)
  throw new Error('INK637_SW_SCOPE_REFUSED');
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{
  if(e.data?.type==='INK_SKIP_WAITING')self.skipWaiting();
  if(e.data?.type==='INK_GET_VERSION'){
    const dest=e.ports?.[0]||e.source;
    dest?.postMessage?.({type:'INK_VERSION',version:'qa-637',buildId:'preview-637',
      navigationStrategy:'network-only',assetStrategy:'network-only',
      shellCache:null,runtimeCache:null,publishedRevision:null});
  }
});
