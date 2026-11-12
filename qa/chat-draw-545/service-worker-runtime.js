// INK_545_PREVIEW_SW_NO_CACHE_V1 - QA subpath only; never production
const EXPECTED_PATH = '/INK/qa/chat-draw-545/';
if(new URL(self.registration.scope).pathname!==EXPECTED_PATH)
  throw new Error('INK_545_PREVIEW_SCOPE_REFUSED');
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  if(event.data?.type==='INK_SKIP_WAITING')self.skipWaiting();
  if(event.data?.type==='INK_GET_VERSION'){
    const target=event.ports?.[0]||event.source;
    target?.postMessage?.({
      type:'INK_VERSION', version:'qa-545',
      buildId:new URL(self.location.href).searchParams.get('build')||'preview-545',
      navigationStrategy:'network-only', assetStrategy:'network-only',
      shellCache:null,runtimeCache:null,publishedRevision:null
    });
  }
});
