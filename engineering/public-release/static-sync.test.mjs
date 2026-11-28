// Portable Public self-tests: no Private module, network, credential or product execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readFileSync,existsSync} from 'node:fs';
import {checkEvent,isControlOnly} from './verify-static-sync.mjs';
import {makePlan,verifyPlan,validateBase,validateBuild,blob,hash,canonical,safePath,allowed,uiOnlyPaths,verifyUiOnlyPlan,expectedUiOnlyMetadata,uiBundlePaths,verifyUiBundleOnlyPlan,expectedUiBundleMetadata,verifyUiBridgeFiles,assertStagePresentationCss,PUBLIC_UI_PRESENTATION_PATHS,PUBLIC_UI_PRESENTATION_PATHS_V2,PUBLIC_UI_SHARED_CONTROL_EXPORTS,pagesRevisionForDigest,verifyMenuHostContract,verifyQa637,qa637Only,qa637Event,QA637_ROOT,verifyQa646,qa646Only,qa646Event,QA646_ROOT} from './static-sync-core.mjs';
import {createHash} from 'node:crypto';
const cfg=JSON.parse(await readFile(new URL('./static-sync.allowlist.json',import.meta.url)));
const sha=c=>c.repeat(40),file=s=>{const bytes=Buffer.from(s);return{bytes,sha:blob(bytes),mode:'100644'}};
test('actual checked-out Public receipt and UI bridge remain verifiable across V2 lease migration',async()=>{
 const root=new URL('../../',import.meta.url);
 const read=async path=>{const bytes=await readFile(new URL(path,root));return {bytes,sha:blob(bytes),mode:'100644'}};
 const [buildItem,receiptItem]=await Promise.all([read('BUILD_INFO.json'),read('PUBLISH_RECEIPT.json')]);
 const build=JSON.parse(buildItem.bytes),receipt=JSON.parse(receiptItem.bytes);
 const paths=new Set([...build.runtime.files.map(r=>r.path),
  ...receipt.managed_files.map(r=>r.path),'PUBLISH_RECEIPT.json','pages-build-identity.txt']);
 const files=new Map(await Promise.all([...paths].map(async path=>[path,await read(path)])));
 const prior=validateBase({head:sha('a'),tree:sha('b'),files},cfg);
 const runtime=new Map(build.runtime.files.map(row=>[row.path,files.get(row.path)]));
 validateBuild(build,runtime,cfg);
 assert.deepEqual(prior.ui_release,build.ui_release);
 assert.ok([PUBLIC_UI_PRESENTATION_PATHS_V2.length,PUBLIC_UI_PRESENTATION_PATHS.length]
  .includes(prior.ui_release?.files?.length),
  'actual checked-out Public must retain a known exact V2 presentation lease');
 verifyUiBridgeFiles(runtime,prior.ui_release);
});
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

// #703 Public-only UI release: menu source is the single user-authored file;
// BUILD_INFO and PUBLISH_RECEIPT are exact outputs of trusted-base math.
const UI_MENU='src/ui/ink017/menu-ui.js';
const UI_ONLY_CHANGE=['BUILD_INFO.json','PUBLISH_RECEIPT.json',UI_MENU,'pages-build-identity.txt'].sort();
const menuSource=(api,label)=>`// ${label}\nexport function mountMenuUi({menu,logo,host,invoke,signal}){return host.menuApi.${api}();}\n`;
function uiOnlyFixture(){
 const s=inputs();s.sourceFiles.set(UI_MENU,file(menuSource('snapState','Public baseline A')));
 s.sourceFiles.set('dist/startup/ink-shell.mjs',file('await import(new URL("./menu-ui.js",new URL("src/ui/ink017/shell.js",document.baseURI).href).href);'));
 s.sourceFiles.set('service-worker-runtime.js',file('const SOURCE_SHELL=["./src/ui/ink017/menu-ui.js"];function networkFirstAsset(request){};networkFirstAsset(event.request);'));
 const rows=[...s.sourceFiles].map(([path,f])=>({path,bytes:f.bytes.length,sha256:hash(f.bytes)})).sort((a,b)=>a.path.localeCompare(b.path,'en'));
 s.build.runtime.files=rows;s.build.runtime.file_count=rows.length;
 s.build.runtime.package_digest_sha256=hash(Buffer.from(canonical(rows)));
 const first=makePlan(s),base={head:sha('4'),tree:sha('5'),files:stage(s,first)};
 const nextMenu=file(menuSource('selectedRasterInfo','approved Public B'));
 const metadata=expectedUiOnlyMetadata({base,candidateMenu:nextMenu,cfg});
 const candidateFiles=new Map(base.files);
 candidateFiles.set(UI_MENU,nextMenu);
 candidateFiles.set('BUILD_INFO.json',metadata.buildItem);
 candidateFiles.set('PUBLISH_RECEIPT.json',metadata.receiptItem);
 candidateFiles.set('pages-build-identity.txt',metadata.identityItem);
 return {base,candidateFiles,nextMenu,metadata,changedPaths:UI_ONLY_CHANGE};
}
test('Public-only menu + deterministic metadata pass; next Private 009 validateBase accepts full bytes',()=>{
 const x=uiOnlyFixture();
 assert.equal(uiOnlyPaths(x.changedPaths),true);
 const result=verifyUiOnlyPlan({...x,cfg});
 assert.equal(result.status,'PUBLIC_UI_ONLY_INTEGRITY_PASS');
 assert.equal(result.corePreserved,true);assert.equal(result.releaseAuthorized,false);
 assert.equal(validateBase({...x.base,files:x.candidateFiles},cfg).ui_release.version,x.metadata.uiLease.version);
 const expectedPagesRevision=createHash('sha1').update('INK703-PWA:'+generatedRuntimeDigest(x)).digest('hex');
 assert.equal(x.candidateFiles.get('pages-build-identity.txt').bytes.toString('utf8'),expectedPagesRevision+'\n');
 // The PWA controller selects ?build=pages-<composite Core+UI revision>.
 assert.equal('pages-'+x.candidateFiles.get('pages-build-identity.txt').bytes.toString('utf8').trim(),
  'pages-'+expectedPagesRevision);
 for(const [p,f] of x.base.files)if(!x.changedPaths.includes(p))assert.equal(x.candidateFiles.get(p).sha,f.sha);
 const generated=JSON.parse(x.candidateFiles.get('BUILD_INFO.json').bytes);
 assert.equal(generated.source.exact_sha,JSON.parse(x.base.files.get('BUILD_INFO.json').bytes).source.exact_sha);
 assert.notEqual(generated.runtime.package_digest_sha256,JSON.parse(x.base.files.get('BUILD_INFO.json').bytes).runtime.package_digest_sha256);
});
function generatedRuntimeDigest(fixtureValue){
 return JSON.parse(fixtureValue.candidateFiles.get('BUILD_INFO.json').bytes).runtime.package_digest_sha256;
}
test('A→B→C UI-only revisions rotate Pages worker cache key while Core identity remains fixed',()=>{
 const first=uiOnlyFixture();
 const aBuild=JSON.parse(first.base.files.get('BUILD_INFO.json').bytes);
 const bBuild=JSON.parse(first.candidateFiles.get('BUILD_INFO.json').bytes);
 const revA=pagesRevisionForDigest(aBuild.runtime.package_digest_sha256);
 const revB=pagesRevisionForDigest(bBuild.runtime.package_digest_sha256);
 assert.notEqual(revA,revB);
 assert.equal(first.metadata.pagesRevision,revB);
 const nextBase={head:sha('6'),tree:sha('7'),files:first.candidateFiles};
 const menuC=file(menuSource('driveAvailable','approved Public C'));
 const metaC=expectedUiOnlyMetadata({base:nextBase,candidateMenu:menuC,cfg});
 const next=new Map(nextBase.files);
 next.set(UI_MENU,menuC);next.set('BUILD_INFO.json',metaC.buildItem);
 next.set('PUBLISH_RECEIPT.json',metaC.receiptItem);next.set('pages-build-identity.txt',metaC.identityItem);
 assert.equal(verifyUiOnlyPlan({base:nextBase,candidateFiles:next,cfg,changedPaths:UI_ONLY_CHANGE}).status,
  'PUBLIC_UI_ONLY_INTEGRITY_PASS');
 assert.notEqual(revB,metaC.pagesRevision);
 assert.equal(bBuild.source.exact_sha,JSON.parse(next.get('BUILD_INFO.json').bytes).source.exact_sha);
 assert.notEqual('ink-build-pages-'+revB+'-shell','ink-build-pages-'+metaC.pagesRevision+'-shell');
 // This is an identity/cache-namespace contract test, not a live offline SW test.
});
test('a Core-only runtime digest change rotates Pages identity even with identical menu blob',()=>{
 const x=uiOnlyFixture(),digest=generatedRuntimeDigest(x),revised='f'.repeat(64);
 assert.notEqual(pagesRevisionForDigest(digest),pagesRevisionForDigest(revised));
 assert.equal(pagesRevisionForDigest(revised).length,40);
});
test('second UI release rejects stale Pages identity and missing prior UI lease',()=>{
 const x=uiOnlyFixture(),menuC=file(menuSource('driveAvailable','next C'));
 const prior={head:sha('6'),tree:sha('7'),files:new Map(x.candidateFiles)};
 prior.files.set('pages-build-identity.txt',file(sha('0')+'\n'));
 assert.throws(()=>expectedUiOnlyMetadata({base:prior,candidateMenu:menuC,cfg}),/UI_BASE_PAGES_IDENTITY_DRIFT/);
 prior.files.delete('pages-build-identity.txt');
 assert.throws(()=>expectedUiOnlyMetadata({base:prior,candidateMenu:menuC,cfg}),/UI_BASE_PAGES_IDENTITY_MISSING/);
});
test('Public-only branch uses exact-head, same-repo, non-Draft gate',()=>{
 const base=sha('4'),head=sha('6');
 const event={repository:{full_name:'thedoorw/INK'},action:'synchronize',
  pull_request:{draft:false,base:{sha:base,ref:'main',repo:{full_name:'thedoorw/INK'}},
   head:{sha:head,ref:'ui-703/menu-b',repo:{full_name:'thedoorw/INK'}}}};
 assert.doesNotThrow(()=>checkEvent(event,base,head,{uiOnlyScope:true}));
 event.pull_request.head.ref='sync-009/pretend-ui';assert.throws(()=>checkEvent(event,base,head,{uiOnlyScope:true}),/SYNC_BRANCH_REQUIRED/);
 event.pull_request.head.ref='ui-703/menu-b';event.pull_request.draft=true;assert.throws(()=>checkEvent(event,base,head,{uiOnlyScope:true}),/DRAFT_CANDIDATE/);
 event.pull_request.draft=false;event.pull_request.base.sha=sha('7');assert.throws(()=>checkEvent(event,base,head,{uiOnlyScope:true}),/BASE_MOVED/);
});
test('Public-only scope excludes shell, Core, tokens and extra changes',()=>{
 for(const changed of [[],[UI_MENU],[UI_MENU,'BUILD_INFO.json'],
  [UI_MENU,'BUILD_INFO.json','PUBLISH_RECEIPT.json'],
  [...UI_ONLY_CHANGE,'src/core/ink.js'],[...UI_ONLY_CHANGE,'src/ui/ink017/tokens.css'],
  [...UI_ONLY_CHANGE,'dist/startup/ink-shell.mjs']])assert.equal(uiOnlyPaths(changed),false);
});
test('Public-only menu rejects old unrestricted host API and external imports',()=>{
 for(const body of [menuSource('snapState','ok')+'host.app;',menuSource('snapState','ok')+'host["provider"];',
   'import {x} from "../../core/x.js";\n'+menuSource('snapState','ok'),
   menuSource('snapState','ok')+'window.INK_APP;',
   'export function mountMenuUi(host){return host.menuApi.snapState()}'])
  assert.throws(()=>verifyMenuHostContract(body));
 assert.equal(verifyMenuHostContract(menuSource('snapState','safe')),'MENU_HOST_CONTRACT_PASS');
});
test('Public-only exact bytes, old receipt and complete tree are fail-closed',()=>{
 const x=uiOnlyFixture();
 const corruptBuild=new Map(x.candidateFiles);corruptBuild.set('BUILD_INFO.json',file('forged'));
 assert.throws(()=>verifyUiOnlyPlan({...x,candidateFiles:corruptBuild,cfg}),/UI_ONLY_BUILD_IDENTITY/);
 const corruptReceipt=new Map(x.candidateFiles);corruptReceipt.set('PUBLISH_RECEIPT.json',file('forged'));
 assert.throws(()=>verifyUiOnlyPlan({...x,candidateFiles:corruptReceipt,cfg}),/UI_ONLY_RECEIPT_IDENTITY/);
 const oldIdentity=new Map(x.candidateFiles);oldIdentity.set('pages-build-identity.txt',file(sha('0')+'\n'));
 assert.throws(()=>verifyUiOnlyPlan({...x,candidateFiles:oldIdentity,cfg}),/UI_ONLY_PAGES_IDENTITY/);
 const noIdentity=new Map(x.candidateFiles);noIdentity.delete('pages-build-identity.txt');
 assert.throws(()=>verifyUiOnlyPlan({...x,candidateFiles:noIdentity,cfg}),/UI_ONLY_FULL_TREE_PATHS/);
 const extra=new Map(x.candidateFiles);extra.set('src/core/phantom.js',file('malicious'));
 assert.throws(()=>verifyUiOnlyPlan({...x,candidateFiles:extra,cfg}),/UI_ONLY_FULL_TREE_PATHS/);
 const altered=new Map(x.candidateFiles);altered.set('src/core/native.js',file('private'));
 assert.throws(()=>verifyUiOnlyPlan({...x,candidateFiles:altered,cfg}),/UI_ONLY_FULL_TREE_PATHS/);
 const stale={...x.base,head:sha('9')};
 assert.throws(()=>verifyUiOnlyPlan({...x,base:stale,cfg}),/UI_ONLY_BUILD_IDENTITY/);
 const wrongSha=new Map(x.candidateFiles);wrongSha.set(UI_MENU,{...x.nextMenu,sha:sha('0')});
 assert.throws(()=>verifyUiOnlyPlan({...x,candidateFiles:wrongSha,cfg}),/BLOB_MISMATCH/);
 const badMode=new Map(x.candidateFiles);badMode.set(UI_MENU,{...x.nextMenu,mode:'120000'});
 assert.throws(()=>verifyUiOnlyPlan({...x,candidateFiles:badMode,cfg}),/NON_REGULAR_FILE/);
 const legacyShell=new Map(x.base.files);legacyShell.set('dist/startup/ink-shell.mjs',file('menu bundled in Core'));
 assert.throws(()=>verifyUiOnlyPlan({...x,base:{...x.base,files:legacyShell},cfg}),/UI_BRIDGE_NOT_INSTALLED/);
 const unsafeSW=new Map(x.base.files);unsafeSW.set('service-worker-runtime.js',file('const SOURCE_SHELL=[];'));
 assert.throws(()=>verifyUiOnlyPlan({...x,base:{...x.base,files:unsafeSW},cfg}),/UI_BRIDGE_SW_OFFLINE_MISSING/);
});

function dualCoreFixture(){
 const ui=uiOnlyFixture();
 const base={head:sha('8'),tree:sha('9'),files:ui.candidateFiles};
 const current=JSON.parse(base.files.get('BUILD_INFO.json').bytes);
 const sourceFiles=new Map(current.runtime.files.map(r=>[r.path,base.files.get(r.path)]));
 sourceFiles.set(UI_MENU,file(menuSource('snapState','Private has older menu A')));
 sourceFiles.set('index.html',file('<html>new Private Core</html>'));
 const build=structuredClone(current);
 delete build.ui_release;delete build.dual_source;delete build.qualification;delete build.publication;
 build.source.exact_sha=sha('e');build.source.product_tree=sha('f');
 const rows=[...sourceFiles].map(([path,f])=>({path,bytes:f.bytes.length,sha256:hash(f.bytes)}))
  .sort((a,b)=>a.path.localeCompare(b.path,'en'));
 build.runtime.files=rows;build.runtime.file_count=rows.length;
 build.runtime.package_digest_sha256=hash(Buffer.from(canonical(rows)));
 build.package.manifest_sha256='3'.repeat(64);
 const qualification={source_tree:build.source.product_tree,runs:[{id:703}]};
 const opts={build,sourceFiles,base,cfg,qualification,
  authorityReference:'https://github.com/thedoorw/INK-Browser-QA/issues/703'};
 const plan=makePlan(opts);
 const candidateFiles=new Map([...base.files,...plan.files]);
 for(const removed of plan.deletions)candidateFiles.delete(removed);
 return {ui,opts,base,plan,candidateFiles};
}
test('trusted 009 mixed-source candidate preserves Public menu and independently reconstructs full blob plan',()=>{
 const x=dualCoreFixture();
 assert.equal(x.plan.manifest.dual_source.schema,'INK703_DUAL_SOURCE_PUBLISH_V1');
 assert.equal(x.candidateFiles.get(UI_MENU).sha,x.base.files.get(UI_MENU).sha);
 assert.notEqual(x.candidateFiles.get(UI_MENU).sha,x.opts.sourceFiles.get(UI_MENU).sha);
 const info=JSON.parse(x.candidateFiles.get('BUILD_INFO.json').bytes);
 const receipt=JSON.parse(x.candidateFiles.get('PUBLISH_RECEIPT.json').bytes);
 assert.deepEqual(info.dual_source,receipt.dual_source);
 assert.deepEqual(info.dual_source,x.plan.manifest.dual_source);
 assert.deepEqual(info.ui_release,receipt.ui_release);
 assert.equal(receipt.managed_files.some(r=>r.path==='pages-build-identity.txt'),false);
 assert.equal(x.candidateFiles.get('pages-build-identity.txt').bytes.toString('utf8'),
  pagesRevisionForDigest(info.runtime.package_digest_sha256)+'\n');
 assert.equal(verifyPlan({base:x.base,candidateFiles:x.candidateFiles,cfg,changedPaths:x.plan.changes}).status,
  'DUAL_SOURCE_INTEGRITY_PASS');
});
test('next Private Core release fails closed if compiled shell loses the external Public menu import',()=>{
 const x=dualCoreFixture();
 x.opts.sourceFiles.set('dist/startup/ink-shell.mjs',file('compiled Private menu copied inside shell'));
 const rows=[...x.opts.sourceFiles].map(([path,f])=>({path,bytes:f.bytes.length,sha256:hash(f.bytes)}))
  .sort((a,b)=>a.path.localeCompare(b.path,'en'));
 x.opts.build.runtime.files=rows;
 x.opts.build.runtime.package_digest_sha256=hash(Buffer.from(canonical(rows)));
 assert.throws(()=>makePlan(x.opts),/UI_BRIDGE_NOT_INSTALLED/);
});
test('next Private Core release fails closed if SW loses menu offline closure or network-first',()=>{
 for(const [workerBody,pattern] of [
  ['function networkFirstAsset(request){};networkFirstAsset(event.request);',/UI_BRIDGE_SW_SOURCE_SHELL_REQUIRED/],
  ['const SOURCE_SHELL=["./src/ui/ink017/menu-ui.js"];function cacheOnly(request){};',/UI_BRIDGE_SW_NETWORK_FIRST_MISSING/]
 ]){
  const x=dualCoreFixture();
  x.opts.sourceFiles.set('service-worker-runtime.js',file(workerBody));
  const rows=[...x.opts.sourceFiles].map(([path,f])=>({path,bytes:f.bytes.length,sha256:hash(f.bytes)}))
   .sort((a,b)=>a.path.localeCompare(b.path,'en'));
  x.opts.build.runtime.files=rows;
  x.opts.build.runtime.package_digest_sha256=hash(Buffer.from(canonical(rows)));
  assert.throws(()=>makePlan(x.opts),pattern);
 }
});
test('mixed-source candidate rejects Public menu overwrite, forged metadata, stale pages and unexpected Core paths',()=>{
 const x=dualCoreFixture();
 const tamper=(path,value)=>{const changed=new Map(x.candidateFiles);changed.set(path,file(value));return changed};
 assert.throws(()=>verifyPlan({base:x.base,
  candidateFiles:tamper(UI_MENU,menuSource('snapState','Private overwritten Public menu')),
  cfg,changedPaths:x.plan.changes}),/RUNTIME_ROWS|DUAL_PUBLIC_MENU_OVERWRITE|DUAL_EXPECTED_FILE/);
 assert.throws(()=>verifyPlan({base:x.base,
  candidateFiles:tamper('PUBLISH_RECEIPT.json','{}'),cfg,changedPaths:x.plan.changes}),
  /DUAL_EXPECTED_FILE|DUAL_RECEIPT/);
 assert.throws(()=>verifyPlan({base:x.base,
  candidateFiles:tamper('pages-build-identity.txt',sha('0')+'\n'),cfg,changedPaths:x.plan.changes}),
  /DUAL_EXPECTED_FILE|DUAL_PAGES_REVISION/);
 const malicious= new Map(x.candidateFiles);malicious.set('src/core/phantom.js',file('unauthorized Core'));
 assert.throws(()=>verifyPlan({base:x.base,candidateFiles:malicious,cfg,
  changedPaths:[...x.plan.changes,'src/core/phantom.js']}),/DUAL_UNEXPECTED_DIFF|DUAL_UNMANAGED_FILE_ADDED/);
 const stale={...x.base,head:sha('0')};
 assert.throws(()=>verifyPlan({base:stale,candidateFiles:x.candidateFiles,cfg,
  changedPaths:x.plan.changes}),/DUAL_STALE_BASE/);
});
test('Core→UI→Core chain updates dual-source digest/Pages revision while retaining private provenance and menu lease',()=>{
 const x=dualCoreFixture();
 const coreB={head:sha('a'),tree:sha('b'),files:x.candidateFiles};
 const prevInfo=JSON.parse(coreB.files.get('BUILD_INFO.json').bytes);
 const prevReceipt=JSON.parse(coreB.files.get('PUBLISH_RECEIPT.json').bytes);
 const menuC=file(menuSource('driveAvailable','new public menu C'));
 const meta=expectedUiOnlyMetadata({base:coreB,candidateMenu:menuC,cfg});
 const uiFiles=new Map(coreB.files);
 uiFiles.set(UI_MENU,menuC);uiFiles.set('BUILD_INFO.json',meta.buildItem);
 uiFiles.set('PUBLISH_RECEIPT.json',meta.receiptItem);
 uiFiles.set('pages-build-identity.txt',meta.identityItem);
 assert.equal(verifyUiOnlyPlan({base:coreB,candidateFiles:uiFiles,cfg,
  changedPaths:UI_ONLY_CHANGE}).status,'PUBLIC_UI_ONLY_INTEGRITY_PASS');
 const nextInfo=JSON.parse(uiFiles.get('BUILD_INFO.json').bytes);
 const nextReceipt=JSON.parse(uiFiles.get('PUBLISH_RECEIPT.json').bytes);
 assert.equal(nextInfo.dual_source.private_runtime_digest_sha256,
  prevInfo.dual_source.private_runtime_digest_sha256);
 assert.equal(nextInfo.dual_source.composite_runtime_digest_sha256,
  nextInfo.runtime.package_digest_sha256);
 assert.equal(nextInfo.dual_source.pages_build_identity,meta.pagesRevision);
 assert.equal(nextInfo.dual_source.ui_release_version,nextInfo.ui_release.version);
 assert.deepEqual(nextInfo.dual_source,nextReceipt.dual_source);
 assert.notEqual(nextInfo.dual_source.pages_build_identity,prevReceipt.dual_source.pages_build_identity);
 const future=dualCoreFixture();
 future.opts.base={head:sha('c'),tree:sha('d'),files:uiFiles};
 const nextCore=makePlan(future.opts);
 const coreFiles=new Map([...uiFiles,...nextCore.files]);
 for(const removed of nextCore.deletions)coreFiles.delete(removed);
 assert.equal(coreFiles.get(UI_MENU).sha,menuC.sha);
 assert.equal(verifyPlan({base:future.opts.base,candidateFiles:coreFiles,cfg,
  changedPaths:nextCore.changes}).status,'DUAL_SOURCE_INTEGRITY_PASS');
});
  // Public Gate001 QA-only exact-pinned integrity regression suite.
{
  
  const HASH = bytes => createHash('sha256').update(bytes).digest('hex');
  const HEAD = '06860f134b514f84f76ee389d1805821fdd8b1a5';
  const buffer = value => Buffer.from(value);
  const file = value => {
    const bytes = buffer(value);
    return { bytes, mode: '100644', sha: HASH(bytes).slice(0, 40) };
  };
  const serviceWorker = `// INK637_PREVIEW_SW_NO_CACHE_V1
  const EXPECTED_PATH='/INK/qa/cloud-draw-637/';
  if(new URL(self.registration.scope).pathname!==EXPECTED_PATH)throw Error('QA_SCOPE');
  self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
  self.addEventListener('message',e=>{e.source?.postMessage?.({navigationStrategy:'network-only'});});
  `;
  function fixture() {
    const base = new Map([
      ['index.html', file('official INK unchanged')],
      ['BUILD_INFO.json', file('release metadata unchanged')],
      ['.github/workflows/ink-public-release-gate-001.yml', file('three required checks unchanged')]
    ]);
    const page = {
      'index.html': `<!doctype html><html><head><meta name="robots" content="noindex,nofollow,noarchive"><meta name="ink-637-candidate-sha" content="${HEAD}"></head><body><aside id="ink637PreviewLabel">QA only</aside></body></html>`,
      'service-worker-runtime.js': serviceWorker,
      'drive-catalog-637-preview.css': '#ink637PreviewLabel{color:#fff}',
      'dist/startup/ink-boot.mjs': '// compiled from private SHA',
      'dist/startup/ink-shell.mjs': '// compiled from private SHA',
      'src/document/drive-native-link-startup.mjs': '// Drive catalog Native bridge'
    };
    const files = Object.entries(page).map(([path, value]) => ({ path, bytes: buffer(value).length, sha256: HASH(buffer(value)) }))
      .sort((a, b) => a.path.localeCompare(b.path));
    const manifest = {
      schema: 'INK_DRIVE_CATALOG_637_PUBLIC_QA_PACKAGE_V1', privateCandidateSha: HEAD,
      source: 'thedoorw/INK-Browser-QA', intendedPath: '/INK/qa/cloud-draw-637/',
      googleOAuthOrigin: 'https://thedoorw.github.io',
      googleOAuthScope: 'https://www.googleapis.com/auth/drive.file',
      status: 'PREPARED_NOT_DEPLOYED', fileCount: files.length, files
    };
    const candidate = new Map(base);
    for (const [path, value] of Object.entries(page)) candidate.set(QA637_ROOT + path, file(value));
    const manifestBytes = JSON.stringify(manifest, null, 2) + '\n';
    candidate.set(QA637_ROOT + 'INK_DRIVE_637_PREVIEW_MANIFEST.json', file(manifestBytes));
    const changedPaths = [...candidate.keys()].filter(p => !base.has(p)).sort();
    const trusted = { sourceSha: HEAD, manifestSha256: HASH(buffer(manifestBytes)), action: 'deploy' };
    return { baseFiles: base, candidateFiles: candidate, changedPaths, trusted };
  }
  test('deploy pass: complete pinned QA only; production metadata preserved', () => {
    const f = fixture();
    const result = verifyQa637(f);
    assert.equal(result.status, 'QA637_INTEGRITY_PASS');
    assert.equal(result.releaseAuthorized, false);
    assert.equal(result.oauthE2E, 'NOT_RUN');
  });
  test('teardown pass: removes only previously pinned QA inventory', () => {
    const f = fixture();
    assert.equal(verifyQa637({
      baseFiles: f.candidateFiles, candidateFiles: f.baseFiles,
      changedPaths: f.changedPaths, trusted: { ...f.trusted, action: 'teardown' }
    }).action, 'teardown');
  });
  test('refuses unrelated production changes and mixed paths', () => {
    const f = fixture(); f.candidateFiles.set('index.html', file('modified official runtime'));
    assert.throws(() => verifyQa637({ ...f, changedPaths: [...f.changedPaths, 'index.html'] }), /QA637_PATH_ONLY/);
    assert.equal(qa637Only(['qa/cloud-draw-637/index.html', 'src/official.js']), false);
    assert.equal(qa637Only(['qa/cloud-draw-637/../index.html']), false);
  });
  test('refuses self-declared source without independently pinned digest', () => {
    const f = fixture();
    assert.throws(() => verifyQa637({ ...f, trusted: { ...f.trusted, sourceSha: 'f'.repeat(40) } }), /QA637_SOURCE_PIN/);
    assert.throws(() => verifyQa637({ ...f, trusted: { ...f.trusted, manifestSha256: 'f'.repeat(64) } }), /QA637_MANIFEST_PIN/);
    assert.throws(() => verifyQa637({ ...f, trusted: { ...f.trusted, manifestSha256: null } }), /QA637_TRUSTED_PINS_REQUIRED/);
  });
  test('refuses tampering even if candidate changes its own file set', () => {
    const f = fixture(); f.candidateFiles.set(QA637_ROOT + 'index.html', file('attack'));
    assert.throws(() => verifyQa637(f), /QA637_(SIZE|DIGEST)/);
    const g = fixture(); g.candidateFiles.set(QA637_ROOT + 'extra.js', file('extra'));
    assert.throws(() => verifyQa637({ ...g, changedPaths: [...g.changedPaths, QA637_ROOT + 'extra.js'] }), /QA637_UNLISTED_OR_MISSING/);
  });
  test('refuses secret file, symlink or incomplete teardown', () => {
    const f = fixture(); f.candidateFiles.set(QA637_ROOT + 'private.key', file('secret'));
    assert.throws(() => verifyQa637({ ...f, changedPaths: [...f.changedPaths, QA637_ROOT + 'private.key'] }), /QA637_UNSAFE_FILE/);
    const g = fixture(); g.candidateFiles.get(QA637_ROOT + 'index.html').mode = '120000';
    assert.throws(() => verifyQa637(g), /QA637_REGULAR_FILE/);
    const h = fixture(); const partial = new Map(h.baseFiles); partial.set(QA637_ROOT + 'index.html', h.candidateFiles.get(QA637_ROOT + 'index.html'));
    assert.throws(() => verifyQa637({ baseFiles: h.candidateFiles, candidateFiles: partial,
      changedPaths: h.changedPaths.slice(1), trusted: { ...h.trusted, action: 'teardown' } }), /QA637_/);
  });
  test('refuses manifest inconsistency or caching worker', () => {
    const f = fixture();
    const manifestFile = f.candidateFiles.get(QA637_ROOT + 'INK_DRIVE_637_PREVIEW_MANIFEST.json');
    const manifest = JSON.parse(manifestFile.bytes.toString('utf8'));
    manifest.files[0].sha256 = '0'.repeat(64);
    const forged = JSON.stringify(manifest, null, 2) + '\n';
    f.candidateFiles.set(QA637_ROOT + 'INK_DRIVE_637_PREVIEW_MANIFEST.json', file(forged));
    f.trusted.manifestSha256 = HASH(buffer(forged));
    assert.throws(() => verifyQa637(f), /QA637_DIGEST/);
    const g = fixture();
    const workerPath = QA637_ROOT + 'service-worker-runtime.js';
    g.candidateFiles.set(workerPath, file(serviceWorker + 'caches.open("bad");'));
    assert.throws(() => verifyQa637(g), /QA637_(SIZE|DIGEST)/);
  });
  test('refuses unapproved branch, fork, draft, moved base/head', () => {
    const b = 'a'.repeat(40), h = 'b'.repeat(40);
    const e = { repository: { full_name: 'thedoorw/INK' }, action: 'synchronize',
      pull_request: { draft: false, base: { sha: b, ref: 'main', repo: { full_name: 'thedoorw/INK' } },
        head: { sha: h, ref: 'qa-637/review', repo: { full_name: 'thedoorw/INK' } } } };
    assert.doesNotThrow(() => qa637Event(e, b, h));
    e.pull_request.head.ref = 'preview/anything'; assert.throws(() => qa637Event(e, b, h), /QA637_BRANCH_REQUIRED/);
    e.pull_request.head.ref = 'qa-637/review';e.pull_request.draft = true; assert.throws(() => qa637Event(e, b, h), /QA637_DRAFT/);
    e.pull_request.draft = false;e.pull_request.head.repo.full_name = 'untrusted/INK'; assert.throws(() => qa637Event(e, b, h), /QA637_FORK/);
    e.pull_request.head.repo.full_name = 'thedoorw/INK';assert.throws(() => qa637Event(e, b, 'c'.repeat(40)), /QA637_HEAD_MOVED/);
  });
}


test('QA646 exact scoped 431-file package integrity passes; adjacent Public files preserved',()=>{
  const trusted={
    sourceSha:sha('a'),sourceTree:sha('b'),buildId:'src-'+('c'.repeat(24)),
    rendererPngSha256:'d'.repeat(64),manifestSha256:'',action:'deploy'
  };
  const baseFiles=new Map([['index.html',file('UNTOUCHED_PRODUCTION')],['qa/cloud-draw-637/old.js',file('UNCHANGED_637')]]);
  const candidateFiles=new Map(baseFiles);
  const seed=new Map([
    ['index.html',file('<meta name="robots" content="noindex,nofollow,noarchive"><meta name="ink-qa-private-source-sha" content="'+trusted.sourceSha+'"><body>INK #646 QA</body>')],
    ['service-worker-runtime.js',file('const required="/INK/qa/cloud-draw-646/";if(new URL(self.registration.scope).pathname!==required)throw Error("INK646_SW_SCOPE_REFUSED");')],
    ['dist/startup/ink-boot.mjs',file('BOOT')],
    ['dist/startup/ink-shell.mjs',file('SHELL')],
    ['src/document/drive-native-link-startup.mjs',file('DRIVE')],
    ['src/recipe/import-coordinates.js',file('SVG')],
    ['manifest.webmanifest',file(JSON.stringify({start_url:'./index.html',scope:'./',icons:[{src:'./assets/a.svg'}]}))],
    ['manifest-portable.webmanifest',file(JSON.stringify({start_url:'./index-standalone.html',scope:'./',icons:[{src:'./assets/a.svg'}]}))]
  ]);
  for(let i=0;i<423;i++)seed.set('src/generated/qa-'+String(i).padStart(3,'0')+'.js',file('static '+i));
  const rows=[...seed].sort((a,b)=>a[0].localeCompare(b[0])).map(([path,f])=>({
    path,bytes:f.bytes.length,sha256:hash(f.bytes)
  }));
  const manifest={
    schema:'INK_CLOUD_DRAW_646_PRIVATE_QA_PACKAGE_V1',
    sourceCommit:trusted.sourceSha,productSourceTree:trusted.sourceTree,buildId:trusted.buildId,
    rendererPngSha256:trusted.rendererPngSha256,mode:'ISOLATED_PREPARED_NOT_DEPLOYED',
    noOAuthCredentials:true,notForPublicProduction:true,realGoogleE2E:'NOT_RUN',
    sharedOriginStorageRisk:'MUST_USE_FRESH_BROWSER_PROFILE',
    fileCount:431,files:rows
  };
  const manifestFile=file(JSON.stringify(manifest));
  trusted.manifestSha256=hash(manifestFile.bytes);
  for(const [p,f] of seed)candidateFiles.set(QA646_ROOT+p,f);
  candidateFiles.set(QA646_ROOT+'INK_CLOUD_DRAW_646_QA_MANIFEST.json',manifestFile);
  const changedPaths=[...candidateFiles.keys()].filter(p=>!baseFiles.has(p)).sort();
  const params={baseFiles,candidateFiles,changedPaths,trusted};
  assert.equal(qa646Only(changedPaths),true);
  assert.equal(verifyQa646(params).status,'QA646_INTEGRITY_PASS');
  assert.equal(baseFiles.get('index.html').sha,candidateFiles.get('index.html').sha);
  const outside=new Map(candidateFiles);
  outside.set('BUILD_INFO.json',file('ATTACK'));
  assert.equal(qa646Only([...changedPaths,'BUILD_INFO.json']),false);
  assert.throws(()=>verifyQa646({...params,candidateFiles:outside,changedPaths:[...changedPaths,'BUILD_INFO.json']}),/QA646_PATH_ONLY/);
  const tampered=new Map(candidateFiles);
  tampered.set(QA646_ROOT+'src/generated/qa-003.js',file('TAMPER'));
  assert.throws(()=>verifyQa646({...params,candidateFiles:tampered}),/QA646_(?:SIZE|DIGEST)/);
  const wrongTrust={...trusted,sourceSha:sha('f')};
  assert.throws(()=>verifyQa646({...params,trusted:wrongTrust}),/QA646_SOURCE_PIN/);
  const badWeb=new Map(candidateFiles);
  badWeb.set(QA646_ROOT+'manifest.webmanifest',file(JSON.stringify({start_url:'/INK/',scope:'/INK/',icons:[]})));
  assert.throws(()=>verifyQa646({...params,candidateFiles:badWeb}),/QA646_(?:SIZE|DIGEST)/);
});
test('QA646 branch is explicitly isolated, not legacy QA637 or unrestricted sync',()=>{
  const b='a'.repeat(40),h='b'.repeat(40);
  const event={repository:{full_name:'thedoorw/INK'},action:'opened',pull_request:{
    base:{ref:'main',sha:b,repo:{full_name:'thedoorw/INK'}},
    head:{ref:'qa/cloud-draw-646-exact-99b045f-20261122',sha:h,repo:{full_name:'thedoorw/INK'}},
    draft:false
  }};
  assert.doesNotThrow(()=>qa646Event(event,b,h));
  assert.doesNotThrow(()=>checkEvent(event,b,h,{qa646Scope:true}));
  event.pull_request.head.ref='qa-637/fake';
  assert.throws(()=>qa646Event(event,b,h),/QA646_BRANCH_REQUIRED/);
  assert.throws(()=>checkEvent(event,b,h,{qa646Scope:true}),/SYNC_BRANCH_REQUIRED/);
});

// #703 V2 Public-owned presentation source. This is a source-only trusted
// verifier test; the real Browser/SW A→B→offline evidence is a separate gate.
const BUNDLE_SHELL='src/ui/ink017/shell.js';
const BUNDLE_SHARED='src/ui/ink017/shared-controls.js';
const BUNDLE_COLOR='src/ui/ink017/panels/color.js';
const BUNDLE_TOKENS='src/ui/ink017/tokens.css';
const BUNDLE_STAGE_CSS='src/ui/stage-presentation.css';
const REAL_SVG_ICON="url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='12'%20height='12'%20viewBox='0%200%2012%2012'%3E%3Cpath%20d='M2.5%204.5%206%208%209.5%204.5'%20fill='none'%20stroke='%23666666'%20stroke-width='1.25'%20stroke-linecap='round'%20stroke-linejoin='round'/%3E%3C/svg%3E\")";
const BUNDLE_META=['BUILD_INFO.json','PUBLISH_RECEIPT.json','pages-build-identity.txt'];
const bundleShell=()=>"import './right-dock.js';import './shared-controls.js';import {toolbarCustomizerPresentation} from './toolbar-customizer-view.js';import {renderCompletionOptions} from './completion-options-view.js';import {renderNativeToolParameters} from './native-tool-params-view.js';import {presentCompletionOverlay} from './completion-overlay-view.js';import {presentCropOverlay} from './crop-overlay-view.js';const menu=import(new URL('./menu-ui.js',import.meta.url).href);";
const bundleControllers=[
 'src/ui/branding-settings.js','src/ui/minimal-test-shell/modules.js',
 'src/agent/g2-direct-boot.mjs','src/document/drive-native-link-startup.mjs',
 'src/agent/popup-client.js','src/agent/work-runtime-read-controls.mjs',
 'src/document/multi-view-workspace.js','src/agent/runtime-bridge.js',
 'src/artwork-import/ingress-consent.js'
];
const stageImports="import {createMultiViewPane,updateMultiViewPane,createMultiViewGrid,createFixedDocumentCanvas} from './multi-view-view.js';import {createReadonlyCompareView} from './compare-readonly-view.js';import {createRuntimeBridgeControls,presentRuntimeBridgeControls} from './runtime-bridge-view.js';import {createArtworkIngressConsentView,artworkIngressSuccessText,artworkIngressErrorText} from './artwork-ingress-view.js';";
const bundleStage=()=>stageImports+"globalThis.INK_PUBLIC_DOCUMENT_VIEWS=Object.freeze({createMultiViewPane,updateMultiViewPane,createMultiViewGrid,createFixedDocumentCanvas,createReadonlyCompareView,createRuntimeBridgeControls,presentRuntimeBridgeControls,createArtworkIngressConsentView,artworkIngressSuccessText,artworkIngressErrorText});export function renderStageShellView(){/* inkBootGate emptyHint textEditor textInput textCommit textCancel */}";
const bundleWorker=()=>`const SOURCE_SHELL=[${[...PUBLIC_UI_PRESENTATION_PATHS,...bundleControllers].map(p=>JSON.stringify('./'+p)).join(',')}];networkFirstAsset(event.request);`;
const runtimeRows=files=>[...files].map(([path,f])=>({path,bytes:f.bytes.length,sha256:hash(f.bytes)}))
  .sort((a,b)=>a.path.localeCompare(b.path,'en'));
function bundleFixture({missingCharacterSW=false,missingToolbarSW=false}={}){
 const s=inputs();
 s.sourceFiles.set('index.html',file('<main></main><link rel="stylesheet" href="src/ui/stage-presentation.css"><script type="module" src="src/ui/stage-shell-view.js"></script>'));
 s.sourceFiles.set('src/ui/branding-settings.js',file("const viewPromise=import('./branding-settings-view.js');"));
 s.sourceFiles.set('src/ui/minimal-test-shell/modules.js',file("import {renderMinimalControlsView,renderMinimalStateView,renderMinimalStatusView} from './runtime-view.js';"));
 s.sourceFiles.set('src/agent/g2-direct-boot.mjs',file("import {g2ConnectionLabel,createG2ConnectControl} from './g2-direct-boot-view.mjs';"));
 s.sourceFiles.set('src/document/drive-native-link-startup.mjs',file("import {createDriveDialogView,appendDriveRecoveryChoices} from './drive-native-link-view.mjs';"));
 s.sourceFiles.set('src/agent/popup-client.js',file("import {createPrivateReadOnlyMenuRow} from './popup-client-view.js';"));
 s.sourceFiles.set('src/agent/work-runtime-read-controls.mjs',file("import {createWorkReadDialog,presentWorkRecipeState} from '../ui/work-runtime-read-view.mjs';"));
 s.sourceFiles.set('src/document/multi-view-workspace.js',file('globalThis.INK_PUBLIC_DOCUMENT_VIEWS?.createMultiViewGrid;globalThis.INK_PUBLIC_DOCUMENT_VIEWS?.createMultiViewPane;globalThis.INK_PUBLIC_DOCUMENT_VIEWS?.updateMultiViewPane;'));
 s.sourceFiles.set('src/agent/runtime-bridge.js',file('globalThis.INK_PUBLIC_DOCUMENT_VIEWS?.createRuntimeBridgeControls;globalThis.INK_PUBLIC_DOCUMENT_VIEWS?.presentRuntimeBridgeControls;'));
 s.sourceFiles.set('src/artwork-import/ingress-consent.js',file('globalThis.INK_PUBLIC_DOCUMENT_VIEWS?.createArtworkIngressConsentView;globalThis.INK_PUBLIC_DOCUMENT_VIEWS?.artworkIngressSuccessText;globalThis.INK_PUBLIC_DOCUMENT_VIEWS?.artworkIngressErrorText;'));
 s.sourceFiles.set('dist/startup/ink-shell.mjs',file(
  'await import(new URL("./shell.js",new URL("src/ui/ink017/entry.js",document.baseURI).href).href);'));
 s.sourceFiles.set('service-worker-runtime.js',file(missingCharacterSW?
  bundleWorker().replace('"./src/ui/ink017/panels/character-typography.js",',''):
  missingToolbarSW?bundleWorker().replace('"./src/ui/ink017/toolbar-customizer-view.js"',''):bundleWorker()));
 for(const p of PUBLIC_UI_PRESENTATION_PATHS)s.sourceFiles.set(p,file(p===BUNDLE_SHELL?bundleShell():
  p===BUNDLE_SHARED?PUBLIC_UI_SHARED_CONTROL_EXPORTS.map(name=>`export const ${name}=()=>{};`).join('\n'):
  p==='src/ui/branding-settings-view.js'?'export function createBrandingDialogView(){}':
  p==='src/ui/minimal-test-shell/size-dialog-view.js'?'export function sizeDialogMarkup(){}':
  p==='src/ui/minimal-test-shell/runtime-view.js'?"import {sizeDialogMarkup} from './size-dialog-view.js';export function renderMinimalControlsView(){};export function renderMinimalStateView(){};export function renderMinimalStatusView(){}":
  p==='src/agent/g2-direct-boot-view.mjs'?'export function g2ConnectionLabel(){};export function createG2ConnectControl(){}':
  p==='src/document/drive-native-link-view.mjs'?'export function createDriveDialogView(){};export function appendDriveRecoveryChoices(){}':
  p==='src/ui/stage-shell-view.js'?bundleStage():
  p==='src/ui/multi-view-view.js'?'export function createMultiViewPane(){};export function updateMultiViewPane(){};export function createMultiViewGrid(){};export function createFixedDocumentCanvas(){}':
  p==='src/ui/compare-readonly-view.js'?'export function createReadonlyCompareView(){}':
  p==='src/ui/runtime-bridge-view.js'?'export function createRuntimeBridgeControls(){};export function presentRuntimeBridgeControls(){}':
  p==='src/ui/artwork-ingress-view.js'?'export function createArtworkIngressConsentView(){};export function artworkIngressSuccessText(){};export function artworkIngressErrorText(){}':
  p==='src/ui/work-runtime-read-view.mjs'?'export function createWorkReadDialog(){};export function createWorkRecipeForm(){};export function presentWorkRecipeState(){}':
  p===BUNDLE_STAGE_CSS?':root{color:#222;background:#f4f4f4}':
  p==='src/ui/ink017/completion-options-view.js'?"import {field,esc} from './shared-controls.js';export function renderCompletionOptions(){}":
  p==='src/ui/ink017/native-tool-params-view.js'?'export function renderNativeToolParameters({markup}){return markup}':
  p==='src/agent/popup-client-view.js'?'export function createPrivateReadOnlyMenuRow(){}':
  p==='src/ui/ink017/completion-overlay-view.js'?'export function presentCompletionOverlay(markup){return markup}':
  p==='src/ui/ink017/crop-overlay-view.js'?'export function presentCropOverlay(markup){return markup}':
  p===UI_MENU?menuSource('snapState','Public A'):p.endsWith('.html')?'<main>INK</main>':
  p.endsWith('.css')?':root{--ink-color:blue}':`export const label=${JSON.stringify(p)};`));
 s.build.runtime.files=runtimeRows(s.sourceFiles);
 s.build.runtime.file_count=s.sourceFiles.size;
 s.build.runtime.package_digest_sha256=hash(Buffer.from(canonical(s.build.runtime.files)));
 const first=makePlan(s),base={head:sha('4'),tree:sha('5'),files:stage(s,first)};
 const candidateFiles=new Map(base.files);
 candidateFiles.set(BUNDLE_COLOR,file('export const label="Public B color";'));
 candidateFiles.set(BUNDLE_TOKENS,file(':root{--ink-color:green}'));
 if(missingCharacterSW||missingToolbarSW)return {base,candidateFiles};
 const metadata=expectedUiBundleMetadata({base,candidateFiles,cfg});
 candidateFiles.set('BUILD_INFO.json',metadata.buildItem);
 candidateFiles.set('PUBLISH_RECEIPT.json',metadata.receiptItem);
 candidateFiles.set('pages-build-identity.txt',metadata.identityItem);
 const changedPaths=[...metadata.changedUiPaths,...BUNDLE_META].sort();
 return {base,candidateFiles,metadata,changedPaths};
}
function verifyBundle(x){return verifyUiBundleOnlyPlan({...x,cfg});}
test('#788 18-path published V2 receipt remains valid before Public-view lease migration',()=>{
 const x=bundleFixture(),files=new Map(x.candidateFiles);
 const before=JSON.parse(files.get('BUILD_INFO.json').bytes);
 const receipt=JSON.parse(files.get('PUBLISH_RECEIPT.json').bytes);
 const legacy=structuredClone(before.ui_release);
 legacy.files=legacy.files.filter(row=>PUBLIC_UI_PRESENTATION_PATHS_V2.includes(row.path));
 delete legacy.version;
 legacy.version='ui-'+hash(Buffer.from(canonical(legacy))).slice(0,24);
 assert.equal(legacy.files.length,18);
 before.ui_release=structuredClone(legacy);
 receipt.ui_release=structuredClone(legacy);
 const buildFile=file(JSON.stringify(before,null,2)+'\n');
 files.set('BUILD_INFO.json',buildFile);
 receipt.managed_files=receipt.managed_files.map(row=>row.path==='BUILD_INFO.json'?{
  path:'BUILD_INFO.json',bytes:buildFile.bytes.length,sha256:hash(buildFile.bytes),git_blob_sha:buildFile.sha
 }:row);
 files.set('PUBLISH_RECEIPT.json',file(JSON.stringify(receipt,null,2)+'\n'));
 const base={head:sha('a'),tree:sha('b'),files};
 assert.deepEqual(validateBase(base,cfg).ui_release.files.map(row=>row.path),PUBLIC_UI_PRESENTATION_PATHS_V2);
 const candidate=new Map(files);
 candidate.set('src/ui/ink017/toolbar-customizer-view.js',file('export const revisedToolbarView=true;'));
 const next=expectedUiBundleMetadata({base,candidateFiles:candidate,cfg});
 candidate.set('BUILD_INFO.json',next.buildItem);
 candidate.set('PUBLISH_RECEIPT.json',next.receiptItem);
 candidate.set('pages-build-identity.txt',next.identityItem);
 assert.equal(verifyUiBundleOnlyPlan({base,candidateFiles:candidate,cfg,
  changedPaths:[...next.changedUiPaths,...BUNDLE_META].sort()}).status,'PUBLIC_UI_BUNDLE_INTEGRITY_PASS');
 assert.deepEqual(next.uiLease.files.map(row=>row.path),PUBLIC_UI_PRESENTATION_PATHS);
});
test('#788 extra view requires published source, same-origin module binding and offline closure',()=>{
 const x=bundleFixture();
 const without=new Map(x.base.files);without.delete('src/ui/ink017/toolbar-customizer-view.js');
 const missingBase={...x.base,files:without};
 assert.throws(()=>expectedUiBundleMetadata({base:missingBase,candidateFiles:x.candidateFiles,cfg}),
  /UI_BUNDLE_SOURCE_NOT_PUBLISHED|PRIOR_FILE_MISSING/);
 const unbound=new Map(x.candidateFiles);
 unbound.set(BUNDLE_SHELL,file(bundleShell().replace("import {toolbarCustomizerPresentation} from './toolbar-customizer-view.js';",'')));
 assert.throws(()=>expectedUiBundleMetadata({base:x.base,candidateFiles:unbound,cfg}),
  /DUAL_TOOLBAR_PUBLIC_VIEW_NOT_BOUND/);
 const missing=bundleFixture({missingToolbarSW:true});
 assert.throws(()=>expectedUiBundleMetadata({...missing,cfg}),
  /UI_BRIDGE_SW_OFFLINE_PRESENTATION:.*toolbar-customizer-view/);
});
test('#788 Public-only branding and size presentation edits preserve all Core controller blobs',()=>{
 const x=bundleFixture(),base=x.candidateFiles;
 const nextBase={head:sha('8'),tree:sha('9'),files:base};
 const candidate=new Map(base);
 const presentation='src/ui/branding-settings-view.js';
 candidate.set(presentation,file('export function createBrandingDialogView(){return {visualOnly:true}}'));
 const meta=expectedUiBundleMetadata({base:nextBase,candidateFiles:candidate,cfg});
 candidate.set('BUILD_INFO.json',meta.buildItem);
 candidate.set('PUBLISH_RECEIPT.json',meta.receiptItem);
 candidate.set('pages-build-identity.txt',meta.identityItem);
 assert.deepEqual(meta.changedUiPaths,[presentation]);
 assert.equal(verifyUiBundleOnlyPlan({base:nextBase,candidateFiles:candidate,cfg,
  changedPaths:[presentation,...BUNDLE_META].sort()}).status,'PUBLIC_UI_BUNDLE_INTEGRITY_PASS');
 for(const protectedPath of bundleControllers.concat('index.html','dist/startup/ink-shell.mjs'))
  assert.equal(candidate.get(protectedPath).sha,base.get(protectedPath).sha,
    'protected controller unchanged '+protectedPath);
 assert.notEqual(meta.pagesRevision,
  JSON.parse(base.get('BUILD_INFO.json').bytes).dual_source?.pages_build_identity);
});
test('#788 added Public presenters cannot import Core or bypass their native binding',()=>{
 const views=[
  ['src/ui/branding-settings-view.js','src/ui/branding-settings.js'],
  ['src/ui/minimal-test-shell/runtime-view.js','src/ui/minimal-test-shell/modules.js'],
  ['src/agent/g2-direct-boot-view.mjs','src/agent/g2-direct-boot.mjs'],
  ['src/document/drive-native-link-view.mjs','src/document/drive-native-link-startup.mjs'],
  ['src/ui/stage-shell-view.js','index.html'],
  ['src/agent/popup-client-view.js','src/agent/popup-client.js'],
  ['src/ui/work-runtime-read-view.mjs','src/agent/work-runtime-read-controls.mjs']
 ];
 for(const [view,controller] of views){
  const x=bundleFixture(),unbound=new Map(x.candidateFiles);
  unbound.set(controller,file('/* missing bound presenter */'));
  assert.throws(()=>verifyUiBridgeFiles(unbound,x.metadata.uiLease),
    /UI_BRIDGE_PUBLIC_VIEW_NOT_BOUND/,controller);
  const nonlocal=new Map(x.candidateFiles);
  nonlocal.set(view,file("import '../../core/index.js';\n"+x.candidateFiles.get(view).bytes));
  assert.throws(()=>expectedUiBundleMetadata({base:x.base,candidateFiles:nonlocal,cfg}),
    /DUAL_PRESENTATION_(?:CORE_IMPORT|NONLOCAL_IMPORT)/,view);
 }
});
test('#788 Drive compiled fallback cannot impersonate a live Public view import',()=>{
 const x=bundleFixture(),candidate=new Map(x.candidateFiles);
 candidate.set('src/document/drive-native-link-startup.mjs',file(
  "import {createDriveDialogView as fallbackDriveDialogView,appendDriveRecoveryChoices as fallbackDriveRecoveryChoices} from './drive-native-link-view.mjs';"));
 assert.throws(()=>verifyUiBridgeFiles(candidate,x.metadata.uiLease),
  /UI_BRIDGE_DRIVE_PUBLIC_URL_REQUIRED/);
 candidate.set('src/document/drive-native-link-startup.mjs',file(
  "import {createDriveDialogView as fallbackDriveDialogView,appendDriveRecoveryChoices as fallbackDriveRecoveryChoices} from './drive-native-link-view.mjs';const publicURL=new URL('./drive-native-link-view.mjs',document.baseURI);"));
 assert.throws(()=>verifyUiBridgeFiles(candidate,x.metadata.uiLease),
  /UI_BRIDGE_DRIVE_DYNAMIC_IMPORT_REQUIRED/);
});
test('#788 offline view and protected controller are an atomic SW inventory',()=>{
 for(const p of [
  'src/ui/branding-settings-view.js','src/ui/stage-shell-view.js',
  'src/ui/minimal-test-shell/runtime-view.js','src/ui/minimal-test-shell/modules.js',
  'src/document/drive-native-link-startup.mjs','src/agent/g2-direct-boot-view.mjs',
  'src/ui/stage-presentation.css','src/ui/multi-view-view.js',
  'src/ui/compare-readonly-view.js','src/ui/runtime-bridge-view.js',
  'src/ui/artwork-ingress-view.js','src/ui/work-runtime-read-view.mjs',
  'src/agent/work-runtime-read-controls.mjs','src/document/multi-view-workspace.js',
  'src/agent/runtime-bridge.js','src/artwork-import/ingress-consent.js'
 ]){
  const x=bundleFixture(),candidate=new Map(x.candidateFiles);
  candidate.set('service-worker-runtime.js',file(bundleWorker().replace(JSON.stringify('./'+p),
    JSON.stringify('./missing-offline-asset.js'))));
  assert.throws(()=>verifyUiBridgeFiles(candidate,x.metadata.uiLease),
    /UI_BRIDGE_SW_OFFLINE_(?:PRESENTATION|CONTROLLER)/,p);
 }
});
test('#788 SW entries in comments or unrelated strings are not accepted as offline closure',()=>{
 const missing='src/ui/branding-settings-view.js';
 const worker=bundleWorker();
 const without=worker.replace(JSON.stringify('./'+missing),'');
 const x=bundleFixture();
 const commented=new Map(x.candidateFiles);
 commented.set('service-worker-runtime.js',file(without+'\n// ./'+missing+'\n'));
 assert.throws(()=>verifyUiBridgeFiles(commented,x.metadata.uiLease),
  /UI_BRIDGE_SW_OFFLINE_PRESENTATION:.*branding-settings-view/);
 const injected=new Map(x.candidateFiles);
 injected.set('service-worker-runtime.js',file(without+'\nconst fakeLabel="./'+missing+'";\n'));
 assert.throws(()=>verifyUiBridgeFiles(injected,x.metadata.uiLease),
  /UI_BRIDGE_SW_OFFLINE_PRESENTATION:.*branding-settings-view/);
 const spoofed=new Map(x.candidateFiles);
 spoofed.set('service-worker-runtime.js',file('// '+bundleWorker()+'\nnetworkFirstAsset(event.request);'));
 assert.throws(()=>verifyUiBridgeFiles(spoofed,x.metadata.uiLease),
  /UI_BRIDGE_SW_SOURCE_SHELL_REQUIRED/);
});
test('#788 stage presentation CSS admits responsive paint/type and denies layout, hit testing and remote CSS',()=>{
 const stagePath=new URL('../../src/ui/stage-presentation.css',import.meta.url);
 const actual=existsSync(stagePath)?readFileSync(stagePath,'utf8'):
  ':root{font-family:system-ui;color:#222;background:#f4f4f4}@media(max-width:820px){.ink-view-mode{font-size:9px}}';
 assert.doesNotThrow(()=>assertStagePresentationCss(actual));
 assert.doesNotThrow(()=>assertStagePresentationCss(actual+'\n.ink-size-actions{gap:12px}'));
 assert.equal(PUBLIC_UI_PRESENTATION_PATHS.length,36);
 for(const rule of [
  '.ink-view-pane{position:fixed}',
  '.ink-view-pane{inset:0}',
  '.ink-view-pane{z-index:999}',
  '.ink-view-pane{pointer-events:none}',
  '.ink-view-pane{touch-action:none}',
  '.ink-view-pane{width:100vw}',
  '.ink-view-pane{transform:scale(0)}',
  '.ink-view-pane{visibility:hidden}',
  '.ink-view-pane{display:none}',
  '.ink-view-pane{opacity:0}',
  '.stage-wrap{gap:12px}',
  '.ink-size-dialog{padding:18px}',
  '.ink-branding-panel{width:500px}',
  'dialog.ink-drive-native-dialog{min-height:500px}',
  '.ink-size-actions{display:none}',
  '.ink-size-actions{display:none!important}',
  '.ink-branding-panel .ink-branding-actions{height:100vh}',
  '@import url(https://example.com/a.css);',
  '.ink-view-pane{background:url(https://example.com/a.svg)}',
  '@keyframes hide{from{color:red}to{color:blue}}',
  '.ink-view-pane{border:100px solid red}',
  '.ink-view-pane{border:999em solid red}',
  '.ink-view-pane{border:100vw solid red}',
  '.ink-view-pane{border:var(--layout) solid red}'
 ])assert.throws(()=>assertStagePresentationCss(actual+'\n'+rule),
  /DUAL_STAGE_CSS_/,rule);
 const f=bundleFixture();
 const noStyle=new Map(f.candidateFiles);
 noStyle.set('index.html',file('<script type="module" src="src/ui/stage-shell-view.js"></script>'));
 assert.throws(()=>verifyUiBridgeFiles(noStyle,f.metadata.uiLease),
  /UI_BRIDGE_PUBLIC_VIEW_NOT_BOUND:src\/ui\/stage-presentation\.css/);
 const outOfLane=new Map(f.candidateFiles);
 outOfLane.set(BUNDLE_STAGE_CSS,file('.stage-wrap{pointer-events:none}'));
 assert.throws(()=>expectedUiBundleMetadata({base:f.base,candidateFiles:outOfLane,cfg}),
  /DUAL_STAGE_CSS_PROPERTY:pointer-events/);
});
test('V2 Public UI-only color/tokens changes preserve Native/Core exact bytes and rotate full SW identity',()=>{
 const x=bundleFixture();
 assert.equal(uiBundlePaths(x.changedPaths),true);
 assert.equal(uiOnlyPaths(x.changedPaths),false);
 const verdict=verifyBundle(x);
 assert.equal(verdict.status,'PUBLIC_UI_BUNDLE_INTEGRITY_PASS');
 assert.equal(verdict.corePreserved,true);assert.equal(verdict.releaseAuthorized,false);
 const before=JSON.parse(x.base.files.get('BUILD_INFO.json').bytes);
 const after=JSON.parse(x.candidateFiles.get('BUILD_INFO.json').bytes);
 assert.equal(after.ui_release.schema,'INK703_PUBLIC_UI_RELEASE_V2');
 assert.deepEqual(after.ui_release.files.map(r=>r.path),PUBLIC_UI_PRESENTATION_PATHS);
 assert.equal(after.source.exact_sha,before.source.exact_sha);
 assert.notEqual(after.runtime.package_digest_sha256,before.runtime.package_digest_sha256);
 assert.equal(x.candidateFiles.get('pages-build-identity.txt').bytes.toString('utf8'),
  pagesRevisionForDigest(after.runtime.package_digest_sha256)+'\n');
 for(const [p,f] of x.base.files)if(!x.changedPaths.includes(p))
  assert.equal(x.candidateFiles.get(p).sha,f.sha,'Core or UI unmodified '+p);
});
test('V2 Public A→B→A rollback and Core C sync preserve the exact leased presentation paths',()=>{
 const x=bundleFixture();
 const baseB={head:sha('6'),tree:sha('7'),files:x.candidateFiles};
 const rollback=new Map(baseB.files);
 rollback.set(BUNDLE_COLOR,x.base.files.get(BUNDLE_COLOR));
 rollback.set(BUNDLE_TOKENS,x.base.files.get(BUNDLE_TOKENS));
 const rollbackMeta=expectedUiBundleMetadata({base:baseB,candidateFiles:rollback,cfg});
 rollback.set('BUILD_INFO.json',rollbackMeta.buildItem);
 rollback.set('PUBLISH_RECEIPT.json',rollbackMeta.receiptItem);
 rollback.set('pages-build-identity.txt',rollbackMeta.identityItem);
 assert.equal(verifyUiBundleOnlyPlan({base:baseB,candidateFiles:rollback,cfg,
  changedPaths:[...rollbackMeta.changedUiPaths,...BUNDLE_META]}).status,
  'PUBLIC_UI_BUNDLE_INTEGRITY_PASS');
 assert.notEqual(rollbackMeta.pagesRevision,x.metadata.pagesRevision);
 const baseC={head:sha('8'),tree:sha('9'),files:x.candidateFiles};
 const published=JSON.parse(baseC.files.get('BUILD_INFO.json').bytes);
 const sourceFiles=new Map(published.runtime.files.map(row=>[row.path,baseC.files.get(row.path)]));
 sourceFiles.set('index.html',file('<html>Private Core C<link rel="stylesheet" href="src/ui/stage-presentation.css"><script type="module" src="src/ui/stage-shell-view.js"></script></html>'));
 sourceFiles.set(BUNDLE_COLOR,x.base.files.get(BUNDLE_COLOR));
 const nextBuild=structuredClone(published);
 delete nextBuild.ui_release;delete nextBuild.dual_source;
 delete nextBuild.qualification;delete nextBuild.publication;
 nextBuild.source.exact_sha=sha('e');nextBuild.source.product_tree=sha('f');
 nextBuild.runtime.files=runtimeRows(sourceFiles);
 nextBuild.runtime.file_count=sourceFiles.size;
 nextBuild.runtime.package_digest_sha256=hash(Buffer.from(canonical(nextBuild.runtime.files)));
 const plan=makePlan({build:nextBuild,sourceFiles,base:baseC,cfg,
  qualification:{source_tree:nextBuild.source.product_tree,runs:[{id:703}]},
  authorityReference:'https://github.com/thedoorw/INK-Browser-QA/issues/703'});
 const candidate=new Map([...baseC.files,...plan.files]);
 for(const p of plan.deletions)candidate.delete(p);
 assert.equal(plan.manifest.dual_source.schema,'INK703_DUAL_SOURCE_PUBLISH_V2');
 for(const p of PUBLIC_UI_PRESENTATION_PATHS)
  assert.equal(candidate.get(p).sha,baseC.files.get(p).sha,'Public UI B kept '+p);
 assert.notEqual(candidate.get('index.html').sha,baseC.files.get('index.html').sha);
 assert.equal(verifyPlan({base:baseC,candidateFiles:candidate,cfg,
  changedPaths:plan.changes}).status,'DUAL_SOURCE_INTEGRITY_PASS');
});
test('V2 Public rejects Core imports, computed globals, forged metadata and missing panel offline closure',()=>{
 for(const [code,error] of [
  [bundleShell()+"import '../../core/app.js';",/DUAL_PRESENTATION_CORE_IMPORT/],
  [bundleShell()+"await import(window.plugin);",/DUAL_PRESENTATION_UNREVIEWED_IMPORT/],
  [bundleShell()+"globalThis['INK_APP'];",/DUAL_PRESENTATION_COMPUTED_GLOBAL/],
  [bundleShell()+"new URL('../native-host.js',import.meta.url);",/DUAL_PRESENTATION_UNREVIEWED_URL/],
  [bundleShell()+`const quote=/["']/;\nimport '../../core/app.js';`,/DUAL_PRESENTATION_CORE_IMPORT/]
 ]){
  const x=bundleFixture();x.candidateFiles.set(BUNDLE_SHELL,file(code));
  assert.throws(()=>expectedUiBundleMetadata({base:x.base,candidateFiles:x.candidateFiles,cfg}),error);
 }
 const x=bundleFixture();
 const forged=new Map(x.candidateFiles);forged.set('BUILD_INFO.json',file('{}'));
 assert.throws(()=>verifyBundle({...x,candidateFiles:forged}),/UI_BUNDLE_METADATA/);
 const extra=new Map(x.candidateFiles);extra.set('src/ui/ink017/native-host.js',file('evil'));
 assert.throws(()=>verifyBundle({...x,candidateFiles:extra}),/UI_BUNDLE_FULL_TREE/);
 const missing=bundleFixture({missingCharacterSW:true});
 assert.throws(()=>expectedUiBundleMetadata({...missing,cfg}),
  /UI_BRIDGE_SW_OFFLINE_PRESENTATION:.*character-typography/);
});
test('V2 Public rejects missing shared helper ESM export before an incompatible UI-only merge',()=>{
 const x=bundleFixture();
 x.candidateFiles.set(BUNDLE_SHARED,file('export const esc=s=>s;'));
 assert.throws(()=>expectedUiBundleMetadata({base:x.base,candidateFiles:x.candidateFiles,cfg}),
  /DUAL_PRESENTATION_SHARED_API:/);
 assert.equal(PUBLIC_UI_PRESENTATION_PATHS.includes('src/ui/ink017/tool-slices/workbench.js'),false);
 assert.equal(PUBLIC_UI_PRESENTATION_PATHS.includes('src/ui/ink017/panels/properties.js'),false);
});
test('V2 Public accepts a same-closure rail-only shell presentation edit',()=>{
 const x=bundleFixture();
 x.candidateFiles.set(BUNDLE_COLOR,x.base.files.get(BUNDLE_COLOR));
 x.candidateFiles.set(BUNDLE_TOKENS,x.base.files.get(BUNDLE_TOKENS));
 x.candidateFiles.set(BUNDLE_SHELL,file(bundleShell()+'\n// reviewed Public rail label\n'));
 const expected=expectedUiBundleMetadata({base:x.base,candidateFiles:x.candidateFiles,cfg});
 x.candidateFiles.set('BUILD_INFO.json',expected.buildItem);
 x.candidateFiles.set('PUBLISH_RECEIPT.json',expected.receiptItem);
 x.candidateFiles.set('pages-build-identity.txt',expected.identityItem);
 const changed=[...expected.changedUiPaths,...BUNDLE_META].sort();
 const verdict=verifyUiBundleOnlyPlan({...x,cfg,changedPaths:changed});
 assert.equal(verdict.status,'PUBLIC_UI_BUNDLE_INTEGRITY_PASS');
 assert.equal(verdict.corePreserved,true);
 assert.deepEqual(expected.changedUiPaths,[BUNDLE_SHELL]);
});
test('V2 accepts canonical published tokens.css inline SVG while rejecting remote icons',async t=>{
 let canonicalCss;
 try{canonicalCss=await readFile(new URL('../../src/ui/ink017/tokens.css',import.meta.url),'utf8');}
 catch(error){if(error.code==='ENOENT'){t.skip('full Public checkout required for canonical CSS bytes');return;}throw error;}
 assert.ok((canonicalCss.match(/data:image\/svg\+xml,/g)||[]).length>=7);
 const x=bundleFixture();
 x.candidateFiles.set(BUNDLE_TOKENS,file(canonicalCss+'\n:root{--ink-public-b:1}\n'));
 const expected=expectedUiBundleMetadata({base:x.base,candidateFiles:x.candidateFiles,cfg});
 x.candidateFiles.set('BUILD_INFO.json',expected.buildItem);
 x.candidateFiles.set('PUBLISH_RECEIPT.json',expected.receiptItem);
 x.candidateFiles.set('pages-build-identity.txt',expected.identityItem);
 assert.equal(verifyUiBundleOnlyPlan({...x,cfg,
  changedPaths:[...expected.changedUiPaths,...BUNDLE_META].sort()}).status,
  'PUBLIC_UI_BUNDLE_INTEGRITY_PASS');
});
test('V2 Public accepts shipped inline SVG icon but rejects network/data HTML/onload CSS',()=>{
 const safe=bundleFixture();
 safe.candidateFiles.set(BUNDLE_TOKENS,file(':root{--ink-color:green}.icon{background:'+REAL_SVG_ICON+'}'));
 const metadata=expectedUiBundleMetadata({base:safe.base,candidateFiles:safe.candidateFiles,cfg});
 safe.candidateFiles.set('BUILD_INFO.json',metadata.buildItem);
 safe.candidateFiles.set('PUBLISH_RECEIPT.json',metadata.receiptItem);
 safe.candidateFiles.set('pages-build-identity.txt',metadata.identityItem);
 assert.equal(verifyUiBundleOnlyPlan({...safe,cfg,
  changedPaths:[...metadata.changedUiPaths,...BUNDLE_META]}).status,
  'PUBLIC_UI_BUNDLE_INTEGRITY_PASS');
 for(const css of [
  'url(https://evil.example/ink.svg)',
  'url(//evil.example/ink.svg)',
  'url(data:text/html,%3Cscript%3Ealert(1)%3C/script%3E)',
  'url("data:image/svg+xml,%3Csvg%20onload%3D%27alert(1)%27%3E%3Cpath/%3E%3C/svg%3E")',
  '@import url("./unreviewed.css")'
 ]){
  const bad=bundleFixture();
  bad.candidateFiles.set(BUNDLE_TOKENS,file(':root{--ink-color:red}.icon{background:'+css+'}'));
  assert.throws(()=>expectedUiBundleMetadata({base:bad.base,
   candidateFiles:bad.candidateFiles,cfg}),/DUAL_PRESENTATION_(?:REMOTE_CSS|SVG_UNSAFE)/,css);
 }
});
