// Portable Public self-tests: no Private module, network, credential or product execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkEvent,isControlOnly} from './verify-static-sync.mjs';
import {makePlan,verifyPlan,blob,hash,canonical,safePath,allowed,verifyQa637,qa637Only,qa637Event,QA637_ROOT,verifyQa646,qa646Only,qa646Event,QA646_ROOT} from './static-sync-core.mjs';
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
  assert.throws(()=>verifyQa646({...params,candidateFiles:tampered}),/QA646_DIGEST/);
  const wrongTrust={...trusted,sourceSha:sha('f')};
  assert.throws(()=>verifyQa646({...params,trusted:wrongTrust}),/QA646_SOURCE_PIN/);
  const badWeb=new Map(candidateFiles);
  badWeb.set(QA646_ROOT+'manifest.webmanifest',file(JSON.stringify({start_url:'/INK/',scope:'/INK/',icons:[]})));
  assert.throws(()=>verifyQa646({...params,candidateFiles:badWeb}),/QA646_DIGEST/);
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
