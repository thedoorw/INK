import test from 'node:test';
import assert from 'node:assert/strict';
import {planUiOnlyClosure} from './ui-only-closure-plan.mjs';

const menu='src/ui/ink017/menu-ui.js';
const candidate=()=>({
  schema:'INK703_UI_PREVIEW_CANDIDATE_PLAN_V1',
  publicBase:'a'.repeat(40),publicHead:'b'.repeat(40),
  previewMode:'MOCK_NO_CORE',trustedQa:false,releaseAuthorized:false,
  uiBlobs:{'src/ui/ink017/markup.html':'c'.repeat(40),
    [menu]:'d'.repeat(40),'src/ui/ink017/tokens.css':'e'.repeat(40)},
  changedPaths:[menu]
});
const plan=(override={},payloadPaths=[menu])=>planUiOnlyClosure({
  previewCandidate:{...candidate(),...override},payloadPaths});

test('UI-only source changes produce HOLD closure rather than a deployable package',()=>{
  const r=plan();
  assert.deepEqual(r.payload,[menu]);
  assert.deepEqual(r.externalRuntimeRequirements.map(x=>x.id),[
    'SW_CACHE_ROTATION','BUILD_AND_RECEIPT_IDENTITY','CORE_UNCHANGED','ROLLBACK_AND_OFFLINE']);
  assert.ok(r.externalRuntimeRequirements.every(x=>x.status==='NOT_PROVEN'));
  assert.equal(r.releaseAuthorized,false);
  assert.equal(r.publicPublished,false);
});
test('rejects compiled startup or Service Worker mixed into UI-only payload',()=>{
  for(const path of ['dist/startup/ink-shell.mjs','service-worker-runtime.js'])
    assert.throws(()=>plan({},[menu,path]),/PAYLOAD_SCOPE_DRIFT/);
});
test('rejects a Core payload or hidden Core change',()=>{
  assert.throws(()=>plan({},[menu,'src/core/engine.js']),/PAYLOAD_SCOPE_DRIFT/);
  assert.throws(()=>plan({changedPaths:[menu,'src/core/engine.js']}),/UI_OWNERSHIP_BOUNDARY/);
});
test('rejects incomplete UI identity and conflicting preview authority',()=>{
  const c=candidate();delete c.uiBlobs['src/ui/ink017/tokens.css'];
  assert.throws(()=>plan(c),/UI_SOURCE_CLOSURE_DRIFT/);
  assert.throws(()=>plan({trustedQa:true}),/UNTRUSTED_PREVIEW_CANNOT_BE_QA/);
  assert.throws(()=>plan({releaseAuthorized:true}),/RELEASE_AUTHORITY_NOT_ALLOWED/);
});
test('rejects stale payload, duplicate paths and old revision reuse',()=>{
  assert.throws(()=>plan({},[]),/PAYLOAD_SCOPE_DRIFT/);
  assert.throws(()=>plan({},[menu,menu]),/DUPLICATE_PAYLOAD/);
  assert.throws(()=>plan({publicHead:'a'.repeat(40)}),/NO_REVISION/);
});
test('cannot tamper with the returned gate list or a gate status',()=>{
  const r=plan();
  assert.throws(()=>{r.externalRuntimeRequirements[0]={status:'PASS'}},TypeError);
  assert.throws(()=>{r.externalRuntimeRequirements.push({status:'PASS'})},TypeError);
  assert.throws(()=>{r.externalRuntimeRequirements[0].status='PASS'},TypeError);
  assert.ok(r.externalRuntimeRequirements.every(x=>x.status==='NOT_PROVEN'));
});
