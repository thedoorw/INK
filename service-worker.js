// Stable legacy registration URL. This worker contains no product presentation.
// It upgrades stale cache-first registrations to network-first transport.
// Current clients must acknowledge dirty-state safety. A single historical client
// that cannot speak the safety protocol receives one bounded migration navigation;
// multiple/explicitly-unsafe clients are never blindly navigated.
// client.navigate() is deliberately fire-and-forget inside activate: awaiting it
// can deadlock activation because the navigation is handled by the activated worker.
const MIGRATION_ID='ink-minimal-shell-migration-v6';
const CACHE_PREFIX='ink-build-';
const clientStates=new Map();
function owned(key){return key.startsWith(CACHE_PREFIX)||key.startsWith('ink-v');}
async function preflight(){
  for(const path of ['./index.html','./build-identity.js','./service-worker-runtime.js']){
    const response=await fetch(new Request(path,{cache:'reload'}));
    if(!response?.ok)throw new Error('INK_MIGRATION_PREFLIGHT_FAILED:'+path);
  }
}
async function clearOwnedCaches(){const keys=await caches.keys();await Promise.all(keys.filter(owned).map(key=>caches.delete(key)));}
function navigateClient(client){try{const pending=client.navigate(client.url);pending?.catch?.(()=>{});return true;}catch{return false;}}
async function requestSafeNavigation(){
  const token=MIGRATION_ID+':'+Date.now();
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clients){try{client.postMessage({type:'INK_MIGRATION_SAFETY_QUERY',token,migrationId:MIGRATION_ID});}catch{}}
  await new Promise(resolve=>setTimeout(resolve,700));

  const unacknowledged=[];
  for(const client of clients){
    const state=clientStates.get(client.id);
    if(state?.token===token){
      if(state.safe===true)await navigateClient(client);
      continue;
    }
    unacknowledged.push(client);
  }

  // Historical PS clients predate INK_MIGRATION_SAFETY_QUERY and therefore
  // cannot acknowledge clean state. Bound the compatibility fallback to the
  // one-client first-entry case only. Multi-tab/ambiguous states are deferred.
  if(unacknowledged.length===1&&clients.length===1){
    await new Promise(resolve=>setTimeout(resolve,700));
    await navigateClient(unacknowledged[0]);
  }
  clientStates.clear();
}
self.addEventListener('install',event=>event.waitUntil((async()=>{await preflight();await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{await preflight();await self.clients.claim();await clearOwnedCaches();await requestSafeNavigation();})()));
async function networkFirst(request){
  try{const response=await fetch(new Request(request,{cache:'reload'}));if(response)return response;}catch{}
  return await caches.match(request,{ignoreSearch:true})||await caches.match('./index.html')||Response.error();
}
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;event.respondWith(networkFirst(event.request));});
self.addEventListener('message',event=>{
  const message=event.data||{};
  if(message.type==='INK_MIGRATION_CLIENT_STATE'&&typeof message.safe==='boolean'&&typeof message.token==='string'&&event.source?.id){
    clientStates.set(event.source.id,{token:message.token,safe:message.safe===true});
  }
  if(message.type!=='INK_GET_VERSION')return;
  const target=event.ports?.[0]||event.source;
  target?.postMessage?.({type:'INK_VERSION',version:'0.1',buildId:MIGRATION_ID,shellCache:null,runtimeCache:null,navigationStrategy:'migration-network-first',assetStrategy:'migration-network-first',migration:true});
});
