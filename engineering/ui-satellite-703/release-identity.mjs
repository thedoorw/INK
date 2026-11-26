// #703 review-only two-source receipt contract. Never authorizes release.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const SHA=/^[a-f0-9]{40}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=entries=>JSON.stringify(entries);

export function verifyDualSourceIdentity({core,ui,resources,cacheKey}) {
  assert.equal(core?.repo,'thedoorw/INK-Browser-QA','CORE_REPO');
  assert.equal(ui?.repo,'thedoorw/INK','UI_REPO');
  assert.match(core.sha??'',SHA,'CORE_SHA');
  assert.match(ui.sha??'',SHA,'UI_SHA');
  assert.match(core.tree??'',SHA,'CORE_TREE');
  assert.match(ui.tree??'',SHA,'UI_TREE');
  assert.ok(Array.isArray(resources)&&resources.length>0,'RESOURCES_REQUIRED');
  const seen=new Set();
  for(const resource of resources){
    const path=resource?.path;
    assert.ok(typeof path==='string'&&path&&!path.startsWith('/')&&
      !path.includes('\\')&&!path.split('/').some(s=>!s||s==='.'||s==='..'),'UNSAFE_RESOURCE_PATH');
    assert.ok(!seen.has(path),'DUPLICATE_RESOURCE');seen.add(path);
    assert.match(resource.sha256??'',DIGEST,'RESOURCE_DIGEST');
    assert.ok(Number.isSafeInteger(resource.bytes)&&resource.bytes>=0,'RESOURCE_SIZE');
  }
  for(const path of ['src/ui/ink017/menu-ui.js','src/ui/ink017/markup.html',
    'src/ui/ink017/tokens.css','dist/startup/ink-shell.mjs','service-worker-runtime.js'])
    assert.ok(seen.has(path),`RUNTIME_CLOSURE_MISSING:${path}`);
  const ordered=[...resources].sort((a,b)=>a.path.localeCompare(b.path,'en'));
  const digest=hash(Buffer.from(canonical({core,ui,resources:ordered})));
  const expected='ink-dual-'+digest.slice(0,32);
  assert.equal(cacheKey,expected,'CACHE_IDENTITY_MISMATCH');
  return Object.freeze({status:'DUAL_SOURCE_RECEIPT_CONSISTENT',cacheKey,resourceDigest:digest,releaseAuthorized:false});
}
