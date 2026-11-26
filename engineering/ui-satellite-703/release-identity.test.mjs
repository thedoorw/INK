import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyDualSourceIdentity} from './release-identity.mjs';
const sha=c=>c.repeat(40),digest=c=>c.repeat(64);
const paths=['src/ui/ink017/menu-ui.js','src/ui/ink017/markup.html','src/ui/ink017/tokens.css','dist/startup/ink-shell.mjs','service-worker-runtime.js'];
const fixture=()=>({core:{repo:'thedoorw/INK-Browser-QA',sha:sha('a'),tree:sha('b')},ui:{repo:'thedoorw/INK',sha:sha('c'),tree:sha('d')},resources:paths.map((path,i)=>({path,bytes:i+1,sha256:digest('e')}))});
const seal=v=>({...v,cacheKey:'ink-dual-'+createHash('sha256').update(JSON.stringify({...v,resources:[...v.resources].sort((a,b)=>a.path.localeCompare(b.path,'en'))})).digest('hex').slice(0,32)});
test('both sources and complete runtime resources produce coherent, non-authorizing identity',()=>{
  const v=verifyDualSourceIdentity(seal(fixture()));
  assert.equal(v.status,'DUAL_SOURCE_RECEIPT_CONSISTENT');assert.equal(v.releaseAuthorized,false);
});
test('source/UI or asset drift cannot reuse old cache key',()=>{
  const v=seal(fixture());
  assert.throws(()=>verifyDualSourceIdentity({...v,ui:{...v.ui,sha:sha('f')}}),/CACHE_IDENTITY_MISMATCH/);
  assert.throws(()=>verifyDualSourceIdentity({...v,resources:v.resources.map((r,i)=>i? r:{...r,sha256:digest('f')})}),/CACHE_IDENTITY_MISMATCH/);
});
test('closure, repo authority, duplicate, and path tricks fail closed',()=>{
  const v=seal(fixture());
  assert.throws(()=>verifyDualSourceIdentity({...v,resources:v.resources.slice(1)}),/RUNTIME_CLOSURE_MISSING/);
  assert.throws(()=>verifyDualSourceIdentity({...v,core:{...v.core,repo:'thedoorw/INK'}}),/CORE_REPO/);
  assert.throws(()=>verifyDualSourceIdentity({...v,resources:[...v.resources,v.resources[0]]}),/DUPLICATE_RESOURCE/);
  assert.throws(()=>verifyDualSourceIdentity({...v,resources:[...v.resources,{...v.resources[0],path:'../secret'}]}),/UNSAFE_RESOURCE_PATH/);
});
