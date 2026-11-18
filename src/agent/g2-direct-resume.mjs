/* #625: Non-secret, same-tab reload hint. This is not a G2 capability or an
   enrollment grant: Relay/Presence must still authenticate and pair each time. */
export const G2_RESUME_KEY='ink-g2-click-resume-v1';
export const G2_RESUME_TTL_MS=15*60_000;
const instancePattern=/^[a-f0-9]{24}$/;
const buildPattern=/^src-[a-f0-9]{24}$/;

function targetOf(app){
  const session=app?.sessions?.current?.();
  const pageId=app?.doc?.activePageId;
  if(!app?.documentOpen||typeof session?.documentId!=='string'||!session.documentId
      ||typeof pageId!=='string'||!pageId||!Number.isSafeInteger(session.generation)
      ||session.generation<0)return null;
  return {documentId:session.documentId,pageId,generation:session.generation};
}

export function createG2ResumeGate({
  globalObject=globalThis,now=()=>Date.now(),
  navigationType=globalObject.performance?.getEntriesByType?.('navigation')?.[0]?.type
}={}){
  const storage=(()=>{try{return globalObject.sessionStorage}catch{return null}})();
  const clear=()=>{try{storage?.removeItem(G2_RESUME_KEY)}catch{/* fail closed */}};
  const read=()=>{
    let raw=null;
    try{raw=storage?.getItem(G2_RESUME_KEY)}catch{return null}
    if(!raw)return null;
    try{return JSON.parse(raw)}catch{clear();return null}
  };
  const capture=({app,presence,buildId})=>{
    const instanceId=presence?.status?.().instanceId;
    const target=targetOf(app);
    const at=now();
    if(!storage||!instancePattern.test(instanceId||'')||!buildPattern.test(buildId||'')
        ||!target||!Number.isSafeInteger(at)){clear();return false;}
    const marker={v:1,instanceId,buildId,...target,issuedAt:at,expiresAt:at+G2_RESUME_TTL_MS};
    try{storage.setItem(G2_RESUME_KEY,JSON.stringify(marker));return true}
    catch{clear();return false}
  };
  const inspect=({app,presence,buildId,allowBfcache=false,documentReady=false})=>{
    const marker=read();
    if(!marker)return 'ABSENT';
    const at=now();
    if(marker.v!==1||!instancePattern.test(marker.instanceId||'')
        ||!buildPattern.test(marker.buildId||'')||!Number.isSafeInteger(marker.issuedAt)
        ||!Number.isSafeInteger(marker.expiresAt)||marker.issuedAt>at
        ||marker.expiresAt<=at||marker.expiresAt-marker.issuedAt>G2_RESUME_TTL_MS
        ||(navigationType!=='reload'&&!allowBfcache)){
      clear();return 'DENIED';
    }
    if(!presence?.installed||typeof presence.status!=='function')return 'WAIT_PRESENCE';
    const status=presence.status();
    if(status?.instanceId!==marker.instanceId){clear();return 'DENIED';}
    if(!app?.commands||!app?.sessions?.current||!buildId)return 'WAIT_RUNTIME';
    if(buildId!==marker.buildId){
      clear();return 'DENIED';
    }
    if(!globalObject.INK_ARCHITECTURE?.buildId)return 'WAIT_RUNTIME';
    if(globalObject.INK_ARCHITECTURE.buildId!==marker.buildId){
      clear();return 'DENIED';
    }
    const target=targetOf(app);
    if(!target){
      if(documentReady){clear();return 'DENIED';}
      return 'WAIT_RUNTIME';
    }
    // Native session generation is an in-memory counter (new sessions start at
    // 1). F5 creates a fresh session even when it reopens the SAME saved file.
    // During BFCache the same JS session survives, so a generation change there
    // does indicate a document/history replacement and must be rejected.
    if(target.documentId!==marker.documentId||target.pageId!==marker.pageId
        ||(navigationType!=='reload'&&target.generation!==marker.generation)){
      clear();return 'DENIED';
    }
    if(globalObject.navigator?.onLine===false)return 'WAIT_OFFLINE';
    if(!['ONLINE','CHALLENGE_ACKNOWLEDGED'].includes(status.status))return 'WAIT_PRESENCE';
    return 'GRANTED';
  };
  return Object.freeze({capture,inspect,clear,hasMarker:()=>Boolean(read())});
}
