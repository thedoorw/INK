// Stable legacy registration URL. Retained cache-first Service Workers
// converge to network-first transport without navigating a live document.
// Historical already-active workers may still execute their old behavior
// once before this revision replaces them.
const MIGRATION_ID='ink-ui017-shell-migration-v8';
const CACHE_PREFIX='ink-build-';
function owned(key){return key.startsWith(CACHE_PREFIX)||key.startsWith('ink-v');}
async function preflight(){
 for(const path of ['./index.html','./build-identity.js','./service-worker-runtime.js']){
  const response=await fetch(new Request(path,{cache:'reload'}));
  if(!response?.ok)throw new Error('INK_MIGRATION_PREFLIGHT_FAILED:'+path);
 }
}
async function clearOwnedCaches(){
 const keys=await caches.keys();
 await Promise.all(keys.filter(owned).map(key=>caches.delete(key)));
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 await preflight();
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 await preflight();
 await self.clients.claim();
 await clearOwnedCaches();
 // Deliberately no client navigation; existing editors keep their live state.
})()));
async function networkFirst(request){
 try{
  const response=await fetch(new Request(request,{cache:'reload'}));
  if(response?.ok)return response;
 }catch{}
 return await caches.match(request,{ignoreSearch:true})
   ||await caches.match('./index.html')||Response.error();
}
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 event.respondWith(networkFirst(event.request));
});
self.addEventListener('message',event=>{
 if(event.data?.type!=='INK_GET_VERSION')return;
 const target=event.ports?.[0]||event.source;
 target?.postMessage?.({type:'INK_VERSION',version:'0.1',buildId:MIGRATION_ID,
  shellCache:null,runtimeCache:null,navigationStrategy:'migration-network-first',
  assetStrategy:'migration-network-first',migration:true});
});
