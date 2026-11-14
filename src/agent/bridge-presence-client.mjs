/* Passive, read-only presence agent for Public INK. No buttons, popup, drawing, or undo.
   Can be imported at INK runtime startup AFTER formal Public QA and release approval.
   First enrollment uses a short-lived URL obtained in CHAT; later opens self-register. */
export const BRIDGE_SITE = 'https://ink-604-https-cors-poc-qa.up.railway.app';
export const INK_ROOT = 'https://thedoorw.github.io/INK/';
// Build is derived from the generated public build-identity.js; never self-pin its source hash.
export const BUILD_PATTERN = /^src-[a-f0-9]{24}$/;
const dbName='ink-private-presence-v1', storeName='device';
function randomHex(bytes=12){
  const out=new Uint8Array(bytes);
  crypto.getRandomValues(out);
  return Array.from(out,b=>b.toString(16).padStart(2,'0')).join('');
}
export function createDeviceStorage({indexedDBImpl=globalThis.indexedDB}={}) {
  return {
    async get(){
      if(!indexedDBImpl) return null;
      return new Promise((resolve,reject)=>{
        const open=indexedDBImpl.open(dbName,1);
        open.onupgradeneeded=()=>open.result.createObjectStore(storeName);
        open.onerror=()=>reject(open.error);
        open.onsuccess=()=>{
          const db=open.result, tx=db.transaction(storeName,'readonly');
          const req=tx.objectStore(storeName).get('enrollment');
          req.onsuccess=()=>{resolve(req.result||null);db.close()};
          req.onerror=()=>{reject(req.error);db.close()};
        };
      });
    },
    async set(value){
      if(!indexedDBImpl) throw new Error('INDEXED_DB_UNAVAILABLE');
      return new Promise((resolve,reject)=>{
        const open=indexedDBImpl.open(dbName,1);
        open.onupgradeneeded=()=>open.result.createObjectStore(storeName);
        open.onerror=()=>reject(open.error);
        open.onsuccess=()=>{
          const db=open.result, tx=db.transaction(storeName,'readwrite');
          tx.objectStore(storeName).put(value,'enrollment');
          tx.oncomplete=()=>{resolve();db.close()};
          tx.onerror=()=>{reject(tx.error);db.close()};
        };
      });
    }
  };
}
export function createInkPresenceClient({
  locationObject=globalThis.location,
  historyObject=globalThis.history,
  fetchImpl=globalThis.fetch,
  runtime=()=>({buildId:globalThis.INK_BUILD_ID, ready:Boolean(globalThis.INK_APP)&&globalThis.INK_ARCHITECTURE?.buildId===globalThis.INK_BUILD_ID}),
  storage=createDeviceStorage(),
  schedule=(fn,ms)=>setTimeout(fn,ms),
  cancel=id=>clearTimeout(id),
  periodMs=3_000
}={}) {
  let instanceId=randomHex(), device=null, running=false, timer=null, lastStatus='INITIAL';
  let grant=null;
  const exactLocation=()=>locationObject?.origin==='https://thedoorw.github.io' && locationObject.pathname==='/INK/';
  async function send(action,body,secret,method='POST') {
    const query=method==='GET'?`?instanceId=${instanceId}&deviceId=${encodeURIComponent(device.deviceId)}`:'';
    const response=await fetchImpl(`${BRIDGE_SITE}/bridge-presence/v1/browser/${action}${query}`,{
      method,mode:'cors',credentials:'omit',cache:'no-store',
      headers:{...(method==='POST'?{'Content-Type':'application/json'}:{}),...(secret?{Authorization:`Bearer ${secret}`}:{})},
      ...(method==='POST'?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8_000)
    });
    if(!response.ok) throw new Error(`BRIDGE_HTTP_${response.status}`);
    return response.json();
  }
  async function tick() {
    if(!running) return;
    try {
      const info=runtime();
      if(!exactLocation()||!BUILD_PATTERN.test(info?.buildId||'')||info?.ready!==true) {
        lastStatus='WAITING_FOR_EXACT_RUNTIME';return;
      }
      if(!device){
        if(grant){
          const enrollment=await send('register',{grant,instanceId,buildId:info.buildId});
          grant=null;
          if(enrollment.status!=='REGISTERED')throw new Error('ENROLLMENT_REJECTED');
          device={deviceId:enrollment.deviceId,secret:enrollment.secret};
          await storage.set(device);
        }else device=await storage.get();
      }
      if(!device){lastStatus='NEEDS_CHAT_ENROLLMENT';return;}
      await send('heartbeat',{deviceId:device.deviceId,instanceId,buildId:info.buildId},device.secret);
      const p=await send('poll',null,device.secret,'GET');
      if(p.status==='PROBE'){
        const renewed=runtime();
        if(renewed?.ready!==true||renewed.buildId!==info.buildId)throw new Error('RUNTIME_NOT_READY');
        const acknowledged=await send('ack',{
          deviceId:device.deviceId,instanceId,probeId:p.probeId,nonce:p.nonce,buildId:info.buildId,runtimeReady:true
        },device.secret);
        if(acknowledged.status!=='ACKNOWLEDGED')throw new Error('ACK_REJECTED');
        lastStatus='CHALLENGE_ACKNOWLEDGED';
      }else lastStatus='ONLINE';
    }catch(e){lastStatus=e?.message?.slice(0,80)||'NETWORK_ERROR';}
  }
  async function loop(){
    if(!running)return;
    await tick();
    if(running)timer=schedule(loop,periodMs);
  }
  return {
    async start(){
      if(running)return lastStatus;
      if(!exactLocation()){lastStatus='NOT_PUBLIC_INK';return lastStatus;}
      const hash=locationObject.hash||'';
      if(/^#ink-bridge=[0-9a-f]{64}$/.test(hash)){
        grant=hash.slice('#ink-bridge='.length);
        // Remove secret from address bar before network, logging, navigation or third-party code can copy it.
        historyObject.replaceState(historyObject.state,'',locationObject.pathname+locationObject.search);
      }
      running=true;
      await loop();
      return lastStatus;
    },
    stop(){running=false;if(timer!==null)cancel(timer);timer=null;lastStatus='STOPPED';},
    getStatus(){return {status:lastStatus,instanceId};}
  };
}
