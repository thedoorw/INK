// Portable Public self-tests: no Private module, network, credential or product execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkEvent,isControlOnly} from './verify-static-sync.mjs';
import {makePlan,verifyPlan,validateBase,blob,hash,canonical,safePath,allowed,uiOnlyPaths,verifyUiOnlyPlan,expectedUiOnlyMetadata,pagesRevisionForDigest,verifyMenuHostContract,verifyQa637,qa637Only,qa637Event,QA637_ROOT,verifyQa646,qa646Only,qa646Event,QA646_ROOT} from './static-sync-core.mjs';
import {createHash} from 'node:crypto';
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
