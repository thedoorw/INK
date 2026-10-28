// Portable Public self-tests: no Private module, network, credential or product execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkEvent,isControlOnly} from './verify-static-sync.mjs';
import {makePlan,verifyPlan,blob,hash,canonical,safePath,allowed} from './static-sync-core.mjs';
const cfg=JSON.parse(await readFile(new URL('./static-sync.allowlist.json',import.meta.url)));
const sha=c=>c.repeat(40),file=s=>{const bytes=Buffer.from(s);return{bytes,sha:blob(bytes),mode:'100644'}};
function inputs(){
 const sourceFiles=new Map([['index.html',file('<html></html>')],['build-identity.js',file("self.INK_BUILD_ID = 'src-123456789012345678901234';")],['manifest.webmanifest',file('{}')],['service-worker.js',file('// worker')],['service-worker-runtime.js',file('// worker')]]);
 const files=[...sourceFiles].sort().map(([path,f])=>({path,bytes:f.bytes.length,sha256:hash(f.bytes)}));
 const build={schema:'INK_PUBLIC_BUILD_INFO_V3',source:{repo:'thedoorw/INK-Browser-QA',exact_sha:sha('b'),product_tree:sha('a')},publisher:{allowlist_digest_sha256:hash(Buffer.from(canonical(cfg)))},package:{manifest_sha256:'c'.repeat(64)},runtime:{files,file_count:files.length,package_digest_sha256:hash(Buffer.from(canonical(files)))}};
 const baseFiles=new Map(sourceFiles);baseFiles.set('BUILD_INFO.json',file('{}'));baseFiles.set('engineering/public-release/policy.json',file('HISTORICAL_TRUST'));
 const managed_files=[...baseFiles].filter(([p])=>!p.startsWith('engineering/')).map(([path,f])=>({path,bytes:f.bytes.length,sha256:hash(f.bytes),git_blob_sha:f.sha}));
 baseFiles.set('PUBLISH_RECEIPT.json',file(JSON.stringify({schema:'INK_PUBLICATION_RECEIPT_V1',source_sha:sha('d'),source_tree:sha('d'),managed_files})));
 return{build,cfg,sourceFiles,base:{head:sha('1'),tree:sha('2'),files:baseFiles},qualification:{source_tree:sha('a'),runs:[{id:1}]},authorityReference:'https://github.com/thedoorw/INK-Browser-QA/pull/468'};
}
function stage(s,p){return new Map([...s.base.files,...p.files])}
test('trusted BASE reconstruction passes exact metadata and preserves historical trust',()=>{const s=inputs(),p=makePlan(s);assert.equal(verifyPlan({base:s.base,candidateFiles:stage(s,p),cfg,changedPaths:p.changes}).status,'INTEGRITY_PASS')});
test('control change rejected',()=>{const s=inputs(),p=makePlan(s),c=stage(s,p);c.set('engineering/public-release/policy.json',file('BAD'));assert.throws(()=>verifyPlan({base:s.base,candidateFiles:c,cfg,changedPaths:p.changes}))});
test('runtime tampering rejected',()=>{const s=inputs(),p=makePlan(s),c=stage(s,p);c.set('index.html',file('BAD'));assert.throws(()=>verifyPlan({base:s.base,candidateFiles:c,cfg,changedPaths:p.changes}))});
test('stale Public parent rejected',()=>{const s=inputs(),p=makePlan(s);s.base.head=sha('9');assert.throws(()=>verifyPlan({base:s.base,candidateFiles:stage(s,p),cfg,changedPaths:p.changes}),/STALE_BASE/)});
test('symlinks and traversal rejected',()=>{assert.equal(safePath('../private'),false);const s=inputs();s.sourceFiles.get('index.html').mode='120000';assert.throws(()=>makePlan(s))});
test('private paths cannot be runtime',()=>{for(const p of ['research/a','working/a','engineering/a','.github/workflows/a','qa/evidence/a'])assert.equal(allowed(p,cfg),false)});
test('unlisted file cannot ride along',()=>{const s=inputs(),p=makePlan(s),c=stage(s,p);c.set('src/extra.js',file('BAD'));assert.throws(()=>verifyPlan({base:s.base,candidateFiles:c,cfg,changedPaths:p.changes}))});
test('PR identity rejects untrusted fork and Draft',()=>{const e={repository:{full_name:'thedoorw/INK'},action:'synchronize',pull_request:{draft:true,base:{sha:sha('1'),ref:'main',repo:{full_name:'thedoorw/INK'}},head:{sha:sha('2'),ref:'sync-009/x',repo:{full_name:'thedoorw/INK'}}}};assert.throws(()=>checkEvent(e,sha('1'),sha('2')),/DRAFT/);e.pull_request.draft=false;e.pull_request.head.repo.full_name='other/INK';assert.throws(()=>checkEvent(e,sha('1'),sha('2')),/FORK/)});

test('control maintenance permits only exact verifier paths, never Runtime or historical trust',()=>{
 assert.equal(isControlOnly(['engineering/public-release/verify-static-sync.mjs']),true);
 for(const path of ['index.html','BUILD_INFO.json','release/CANDIDATE.sig','engineering/public-release/policy.json','.github/workflows/other.yml','engineering/public-release/extra.mjs'])
  assert.equal(isControlOnly(['engineering/public-release/verify-static-sync.mjs',path]),false);
 assert.equal(isControlOnly([]),false);
});
