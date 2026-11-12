// Portable Public self-tests: no Private module, network, credential or product execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkEvent,isControlOnly,isBrandingOnly,verifyBrandingOnly,validateBrandPng} from './verify-static-sync.mjs';
import {deflateSync} from 'node:zlib';
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


// Dedicated BRANDING FAST PATH must not inherit Adobe/Runtime dependencies.
function brandPngChunk(name,data){
 const buf=Buffer.alloc(12+data.length);buf.writeUInt32BE(data.length,0);buf.write(name,4,4,'ascii');data.copy(buf,8);
 let crc=0xffffffff;
 for(let i=4;i<8+data.length;i++){crc^=buf[i];for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 buf.writeUInt32BE((crc^0xffffffff)>>>0,8+data.length);return buf;
}
function brandPng(width=64,height=64,alpha=true){
 const signature=Buffer.from([137,80,78,71,13,10,26,10]),header=Buffer.alloc(13);
 header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=alpha?6:2;
 const ch=alpha?4:3,raw=Buffer.alloc((width*ch+1)*height);
 return Buffer.concat([signature,brandPngChunk('IHDR',header),brandPngChunk('IDAT',deflateSync(raw)),brandPngChunk('IEND',Buffer.alloc(0))]);
}
function brandSnapshots(){
 const base=inputs().base, candidate={head:sha('3'),tree:sha('4'),files:new Map(base.files)};
 return {base,candidate};
}
test('BRANDING FAST PATH only recognizes owner assets, never executable/default runtime or mixed paths',()=>{
 assert.equal(isBrandingOnly(['assets/favicon-user.png']),true);
 assert.equal(isBrandingOnly(['assets/logo-user.png']),true);
 assert.equal(isBrandingOnly(['assets/favicon-user.png','assets/logo-user.png']),true);
 for(const p of ['assets/favicon.png','assets/ink-mark.svg','assets/favicon-user.png.js','src/ink.js','index.html','BUILD_INFO.json','service-worker-runtime.js','engineering/public-release/verify-static-sync.mjs']){
  assert.equal(isBrandingOnly([p]),false,p);
  assert.equal(isBrandingOnly(['assets/favicon-user.png',p]),false,p);
 }
 assert.equal(isBrandingOnly([]),false);
});
test('branding branch identity is protected, same repo and non-Draft, not a Runtime sync',()=>{
 const event={repository:{full_name:'thedoorw/INK'},action:'synchronize',pull_request:{draft:false,base:{repo:{full_name:'thedoorw/INK'},sha:sha('1'),ref:'main'},head:{repo:{full_name:'thedoorw/INK'},sha:sha('2'),ref:'branding/favicon-20261107'}}};
 assert.doesNotThrow(()=>checkEvent(event,sha('1'),sha('2'),{brandingOnly:true}));
 event.pull_request.head.ref='sync-009/fake';
 assert.throws(()=>checkEvent(event,sha('1'),sha('2'),{brandingOnly:true}),/SYNC_BRANCH_REQUIRED/);
 event.pull_request.head.ref='branding/favicon-20261107';
 event.pull_request.draft=true;
 assert.throws(()=>checkEvent(event,sha('1'),sha('2'),{brandingOnly:true}),/DRAFT_CANDIDATE/);
 event.pull_request.draft=false;
 event.pull_request.head.repo.full_name='unknown/fork';
 assert.throws(()=>checkEvent(event,sha('1'),sha('2'),{brandingOnly:true}),/FORK_REJECTED/);
});
test('favicon PNG add and independent logo PNG update pass without runtime packaging',()=>{
 const {base,candidate}=brandSnapshots();
 candidate.files.set('assets/favicon-user.png',file(brandPng()));
 candidate.files.set('assets/logo-user.png',file(brandPng(512,256)));
 const result=verifyBrandingOnly({base,candidate,changedPaths:['assets/favicon-user.png','assets/logo-user.png']});
 assert.equal(result.status,'BRANDING_ONLY_INTEGRITY_PASS');
 assert.equal(result.runtimeBuildRequired,false);
 assert.equal(result.adobeDependencyScanRequired,false);
 assert.deepEqual(result.assets.map(x=>[x.path,x.action]),[['assets/favicon-user.png','add'],['assets/logo-user.png','add']]);
 assert.equal(result.assets[0].width,64);assert.equal(result.assets[1].width,512);
});
test('owner reset by deleting only override is a valid branding-only change',()=>{
 const {base,candidate}=brandSnapshots();
 base.files.set('assets/favicon-user.png',file(brandPng()));
 const result=verifyBrandingOnly({base,candidate,changedPaths:['assets/favicon-user.png']});
 assert.deepEqual(result.assets,[{path:'assets/favicon-user.png',action:'reset'}]);
});
test('unexpected extra change is rejected even if changedPaths lies about it',()=>{
 const {base,candidate}=brandSnapshots();
 candidate.files.set('assets/favicon-user.png',file(brandPng()));
 candidate.files.set('index.html',file('hijacked runtime'));
 assert.throws(()=>verifyBrandingOnly({base,candidate,changedPaths:['assets/favicon-user.png']}),/BRAND_EXACT_DIFF/);
});
test('a runtime-managed path cannot be reclassified as branding data',()=>{
 const {base,candidate}=brandSnapshots();
 const receipt=JSON.parse(base.files.get('PUBLISH_RECEIPT.json').bytes.toString('utf8'));
 receipt.managed_files.push({path:'assets/favicon-user.png'});
 base.files.set('PUBLISH_RECEIPT.json',file(JSON.stringify(receipt)));
 candidate.files.set('PUBLISH_RECEIPT.json',base.files.get('PUBLISH_RECEIPT.json'));
 candidate.files.set('assets/favicon-user.png',file(brandPng()));
 assert.throws(()=>verifyBrandingOnly({base,candidate,changedPaths:['assets/favicon-user.png']}),/BRAND_PATH_OWNED_BY_RUNTIME/);
});
test('bad PNG, wrong CRC, non-square favicon and oversized payload all fail',()=>{
 const p=brandPng();
 assert.equal(validateBrandPng(p,'assets/favicon-user.png').width,64);
 const bad=Buffer.from(p);bad[25]^=1;
 assert.throws(()=>validateBrandPng(bad,'assets/favicon-user.png'),/BRAND_PNG_CRC/);
 assert.throws(()=>validateBrandPng(brandPng(128,64),'assets/favicon-user.png'),/BRAND_FAVICON_MUST_BE_SQUARE/);
 assert.throws(()=>validateBrandPng(Buffer.alloc(256*1024+1),'assets/favicon-user.png'),/BRAND_PNG_SIZE/);
 assert.throws(()=>validateBrandPng(Buffer.concat([p,Buffer.from('script')]),'assets/favicon-user.png'),/BRAND_PNG_TRAILING_BYTES/);
 assert.throws(()=>validateBrandPng(Buffer.from('<script>alert(1)</script>'),'assets/logo-user.png'),/BRAND_PNG_SIZE|BRAND_PNG_SIGNATURE/);
});


test('real published owner-approved favicon PNG satisfies the fast path decoder',async()=>{
 const real=await readFile(new URL('../../assets/favicon.png',import.meta.url));
 const result=validateBrandPng(real,'assets/favicon-user.png');
 assert.equal(result.width,64);assert.equal(result.height,64);
});
