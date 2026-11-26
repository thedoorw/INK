// Shared trusted-base integrity checks. Never executes product code or grants QA/release authority.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const blob=b=>createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex');
export const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
export const json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const sha=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
const sha256=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
export const safePath=p=>typeof p==='string'&&p===p.normalize('NFC')&&p.length>0&&p.length<512&&!/[\\:\x00-\x1f\x7f]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
export function allowed(p,cfg){
  return safePath(p)&&!cfg.forbidden_exact.includes(p)&&(cfg.allowed_exact.includes(p)||(!cfg.forbidden_prefixes.some(x=>p.startsWith(x))&&cfg.allowed_prefixes.some(x=>p.startsWith(x))));
}
const metadata=new Set(['BUILD_INFO.json','PUBLISH_RECEIPT.json','release/STATIC_SYNC.json']);
export function checkFiles(files){
  assert.ok(files instanceof Map,'FILE_MAP_REQUIRED');
  for(const [p,f] of files){assert.ok(safePath(p),'UNSAFE_PATH');assert.equal(f.mode,'100644','NON_REGULAR_FILE');assert.ok(Buffer.isBuffer(f.bytes),'BYTES_REQUIRED');assert.equal(blob(f.bytes),f.sha,'BLOB_MISMATCH:'+p);}
}
function parsed(files,p){assert.ok(files.has(p),'MISSING:'+p);return JSON.parse(files.get(p).bytes.toString('utf8'));}
function rowsOf(files,paths){return paths.map(p=>{const f=files.get(p);assert.ok(f,'MISSING:'+p);return {path:p,bytes:f.bytes.length,sha256:hash(f.bytes)};});}
export function validateBuild(build,sourceFiles,cfg){
  assert.equal(build.schema,'INK_PUBLIC_BUILD_INFO_V3','BUILD_SCHEMA');
  assert.equal(build.source?.repo,'thedoorw/INK-Browser-QA','PRIVATE_SOURCE');
  assert.ok(sha(build.source.exact_sha)&&sha(build.source.product_tree),'SOURCE_IDENTITY');
  assert.equal(build.publisher?.allowlist_digest_sha256,hash(Buffer.from(canonical(cfg))),'ALLOWLIST_IDENTITY');
  assert.ok(sha256(build.package?.manifest_sha256),'PACKAGE_DIGEST');
  assert.ok(Array.isArray(build.runtime?.files)&&build.runtime.files.length>=cfg.entrypoints.length,'INVENTORY_REQUIRED');
  const paths=build.runtime.files.map(x=>x.path);
  assert.deepEqual(paths,[...new Set(paths)].sort(),'INVENTORY_ORDER_OR_DUPLICATE');
  assert.equal(build.runtime.file_count,paths.length,'FILE_COUNT');
  for(const p of paths)assert.ok(allowed(p,cfg),'NOT_PUBLIC_RUNTIME:'+p);
  for(const p of [...cfg.entrypoints,'build-identity.js'])assert.ok(paths.includes(p),'ENTRYPOINT:'+p);
  checkFiles(sourceFiles);assert.deepEqual([...sourceFiles.keys()].sort(),paths,'INVENTORY_FILE_SET');
  const rows=rowsOf(sourceFiles,paths);
  assert.equal(canonical(rows),canonical(build.runtime.files),'RUNTIME_ROWS');
  assert.equal(hash(Buffer.from(canonical(rows))),build.runtime.package_digest_sha256,'RUNTIME_DIGEST');
  const code=sourceFiles.get('build-identity.js').bytes.toString('utf8');
  const match=code.match(/self\.INK_BUILD_ID\s*=\s*'(src-[a-f0-9]{24})';/);
  assert.ok(match,'BUILD_ID_INVALID');return match[1];
}
export function validateBase(base,cfg){
  assert.ok(sha(base.head)&&sha(base.tree),'BASE_IDENTITY');checkFiles(base.files);
  const receipt=parsed(base.files,'PUBLISH_RECEIPT.json');
  assert.equal(receipt.schema,'INK_PUBLICATION_RECEIPT_V1','PRIOR_RECEIPT_SCHEMA');
  assert.ok(Array.isArray(receipt.managed_files)&&receipt.managed_files.length,'PRIOR_MANAGED_REQUIRED');
  const seen=new Set();
  for(const r of receipt.managed_files){
    assert.ok(!seen.has(r.path),'PRIOR_DUPLICATE');seen.add(r.path);
    assert.ok(allowed(r.path,cfg)||r.path==='BUILD_INFO.json','PRIOR_PATH_FORBIDDEN');
    const f=base.files.get(r.path);assert.ok(f,'PRIOR_FILE_MISSING');
    assert.equal(f.sha,r.git_blob_sha,'PRIOR_BLOB_DRIFT');assert.equal(hash(f.bytes),r.sha256,'PRIOR_HASH_DRIFT');assert.equal(f.bytes.length,r.bytes,'PRIOR_SIZE_DRIFT');
  }
  // Unknown target files may be preserved, but never overwritten or deleted.
  return receipt;
}
const PAGES_BUILD_IDENTITY='pages-build-identity.txt';
const DUAL_SOURCE_SCHEMA='INK703_DUAL_SOURCE_PUBLISH_V1';
const UI_RELEASE_SCHEMA='INK703_PUBLIC_UI_RELEASE_V1';
export const PUBLIC_UI_PRESENTATION_PATHS=Object.freeze([
  'src/ui/ink017/markup.html',
  'src/ui/ink017/menu-ui.js',
  'src/ui/ink017/panels/adjustments.js',
  'src/ui/ink017/panels/brushes.js',
  'src/ui/ink017/panels/character-typography.js',
  'src/ui/ink017/panels/character.js',
  'src/ui/ink017/panels/color.js',
  'src/ui/ink017/panels/history.js',
  'src/ui/ink017/panels/layers.js',
  'src/ui/ink017/panels/navigator-zoom-curve.mjs',
  'src/ui/ink017/panels/navigator.js',
  'src/ui/ink017/panels/paragraph.js',
  'src/ui/ink017/panels/paths.js',
  'src/ui/ink017/panels/swatches.js',
  'src/ui/ink017/right-dock.js',
  'src/ui/ink017/shared-controls.js',
  'src/ui/ink017/shell.js',
  'src/ui/ink017/tokens.css'
].sort());
export const PUBLIC_UI_BUNDLE_SCHEMA='INK703_PUBLIC_UI_RELEASE_V2';
export const DUAL_BUNDLE_SCHEMA='INK703_DUAL_SOURCE_PUBLISH_V2';
const SHELL_PATH='src/ui/ink017/shell.js';
export function leasedRows(ui){
  return ui.schema===PUBLIC_UI_BUNDLE_SCHEMA?ui.files:[{
    path:ui.path,bytes:ui.bytes,sha256:ui.sha256,git_blob_sha:ui.git_blob_sha
  }];
}
export function dualSchemaForUi(ui){
  return ui.schema===PUBLIC_UI_BUNDLE_SCHEMA?DUAL_BUNDLE_SCHEMA:DUAL_SOURCE_SCHEMA;
}
// A deliberately conservative lexer mask: only executable tokens are used
// when deciding whether Public UI modules import or call beyond their lane.
// Unlike a grep over source, strings, comments and HTML template contents do
// not accidentally grant import authority. Template expressions are inspected.
function executableMask(source){
  const chars=source.split('');
  const blank=i=>{if(chars[i]!=='\n'&&chars[i]!=='\r')chars[i]=' ';};
  function quoted(i,quote){
    blank(i++);
    while(i<source.length){
      if(source[i]==='\\'){blank(i++);if(i<source.length)blank(i++);continue;}
      const c=source[i];blank(i++);if(c===quote)break;
    }
    return i;
  }
  function line(i){blank(i++);blank(i++);while(i<source.length&&source[i]!=='\n'&&source[i]!=='\r')blank(i++);return i;}
  function block(i){blank(i++);blank(i++);while(i<source.length){if(source[i]==='*'&&source[i+1]==='/'){blank(i++);blank(i++);break;}blank(i++);}return i;}
  function template(i){
    blank(i++);
    while(i<source.length){
      if(source[i]==='\\'){blank(i++);if(i<source.length)blank(i++);continue;}
      if(source[i]==='`'){blank(i++);break;}
      if(source[i]==='$'&&source[i+1]==='{'){
        blank(i++);blank(i++);i=code(i,true);continue;
      }
      blank(i++);
    }
    return i;
  }
  function code(i,inTemplate=false){
    let depth=0;
    while(i<source.length){
      const c=source[i],n=source[i+1];
      if(c==='\''||c==='"'){i=quoted(i,c);continue;}
      if(c==='/'&&n==='/'){i=line(i);continue;}
      if(c==='/'&&n==='*'){i=block(i);continue;}
      if(c==='`'){i=template(i);continue;}
      if(inTemplate&&c==='{'){depth++;i++;continue;}
      if(inTemplate&&c==='}'){
        if(depth===0){blank(i++);return i;}
        depth--;i++;continue;
      }
      i++;
    }
    return i;
  }
  code(0);
  return chars.join('');
}
export function assertPresentationClosure(files){
  const owned=new Set(PUBLIC_UI_PRESENTATION_PATHS);
  for(const p of owned){
    const f=files.get(p);
    assert.ok(f?.mode==='100644'&&Buffer.isBuffer(f.bytes),
      'DUAL_PRESENTATION_FILE_MISSING:'+p);
    if(!/\.m?js$/.test(p)||p===PUBLIC_UI_MENU)continue;
    const src=f.bytes.toString('utf8');
    const executable=executableMask(src);
    // No command/Core/module loader authority is implicit in a Public path.
    assert.ok(!/\b(?:eval|Function|fetch|XMLHttpRequest|WebSocket)\s*\(|\b(?:INK_APP|inkPublicApi)\b/.test(executable),
      'DUAL_PRESENTATION_FORBIDDEN_API:'+p);
    // Computed properties would hide the sensitive property name from the
    // executable token mask (it intentionally blanks quoted strings).
    assert.ok(!/\b(?:window|globalThis|self|document\.defaultView)\s*(?:\?\.)?\s*\[/.test(executable),
      'DUAL_PRESENTATION_COMPUTED_GLOBAL:'+p);
    const menuAnchor=/^import\s*\(\s*new\s+URL\s*\(\s*["']\.\/menu-ui\.js["']\s*,\s*import\.meta\.url\s*\)\.href\s*\)/;
    const specs=[];
    let menuCalls=0;
    for(const match of executable.matchAll(/\bimport\b/g)){
      const tail=src.slice(match.index);
      if(/^import\s*\.\s*meta\b/.test(tail)){
        assert.equal(p,SHELL_PATH,'DUAL_PRESENTATION_IMPORT_META:'+p);
        continue;
      }
      if(menuAnchor.test(tail)){
        assert.equal(p,SHELL_PATH,'DUAL_PRESENTATION_MENU_DYNAMIC_SCOPE');
        menuCalls++;
        continue;
      }
      const staticSource=tail.match(/^import\s+(?:\{[^{}]*\}|\*\s+as\s+[\w$]+|[\w$]+(?:\s*,\s*\{[^{}]*\})?)\s+from\s*(["'])([^"']+)\1/);
      const sideEffect=tail.match(/^import\s*(["'])([^"']+)\1/);
      const spec=staticSource?.[2]??sideEffect?.[2];
      assert.ok(spec,'DUAL_PRESENTATION_UNREVIEWED_IMPORT:'+p);
      specs.push(spec);
    }
    const urlCalls=[...executable.matchAll(/\bnew\s+(?:URL|Worker|SharedWorker)\s*\(/g)];
    assert.ok(urlCalls.length===0||p===SHELL_PATH&&menuCalls===1&&
      urlCalls.length===1&&/\bnew\s+URL\s*\(/.test(urlCalls[0][0]),
      'DUAL_PRESENTATION_UNREVIEWED_URL:'+p);
    for(const match of executable.matchAll(/\bexport\s+(?:\*|\{[^{}]*\})\s+from\s*/g)){
      const spec=src.slice(match.index+match[0].length).match(/^(["'])([^"']+)\1/);
      assert.ok(spec,'DUAL_PRESENTATION_REEXPORT_INVALID:'+p);
      specs.push(spec[2]);
    }
    for(const spec of specs){
      assert.ok(spec.startsWith('./')||spec.startsWith('../'),
        'DUAL_PRESENTATION_NONLOCAL_IMPORT:'+p+'->'+spec);
      const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(p),spec));
      assert.ok(owned.has(resolved),'DUAL_PRESENTATION_CORE_IMPORT:'+p+'->'+resolved);
    }
    if(p===SHELL_PATH)assert.equal(menuCalls,1,'DUAL_PRESENTATION_MENU_DYNAMIC_REQUIRED');
  }
  const markup=files.get('src/ui/ink017/markup.html').bytes.toString('utf8');
  assert.ok(!/<\s*(?:script|iframe)\b|\bon[a-z]+\s*=/.test(markup),
    'DUAL_PRESENTATION_MARKUP_EXEC');
  const css=files.get('src/ui/ink017/tokens.css').bytes.toString('utf8');
  assert.ok(!/@import\s/i.test(css),'DUAL_PRESENTATION_REMOTE_CSS');
  const urlCalls=[...css.matchAll(/\burl\s*\(/gi)];
  const parsedUrls=[...css.matchAll(/\burl\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)];
  assert.equal(parsedUrls.length,urlCalls.length,'DUAL_PRESENTATION_CSS_URL_PARSE');
  for(const match of parsedUrls){
    const value=(match[1]??match[2]??match[3]).trim();
    if(!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value))continue;
    assert.ok(value.startsWith('data:image/svg+xml,')&&value.length<=16384,
      'DUAL_PRESENTATION_REMOTE_CSS');
    let decoded;
    try{decoded=decodeURIComponent(value.slice('data:image/svg+xml,'.length));}
    catch{throw Error('DUAL_PRESENTATION_SVG_ESCAPE');}
    assert.ok(/^\s*<svg\b[\s\S]*<\/svg>\s*$/.test(decoded),
      'DUAL_PRESENTATION_SVG_SHAPE');
    const tags=[...decoded.matchAll(/<\s*\/?\s*([A-Za-z][\w:-]*)\b/g)]
      .map(m=>m[1].toLowerCase());
    const permitted=new Set(['svg','path','circle','rect','line','polyline',
      'polygon','g','defs','lineargradient','stop']);
    assert.ok(tags.length>1&&tags.every(tag=>permitted.has(tag))&&
      !/<[!?]|\bon[a-z]+\s*=|\b(?:href|xlink:href)\s*=|\b(?:script|foreignobject)\b/i.test(decoded),
      'DUAL_PRESENTATION_SVG_UNSAFE');
    const withoutNamespace=decoded.replace(/\bxmlns\s*=\s*(['"])http:\/\/www\.w3\.org\/2000\/svg\1/g,'');
    assert.ok(!/(?:https?:|javascript:|data:|url\s*\()/i.test(withoutNamespace),
      'DUAL_PRESENTATION_SVG_EXTERNAL_REF');
  }
}
function verifiedUiLease(base,prior,cfg){
  const ui=prior.ui_release;
  assert.ok(ui?.schema===UI_RELEASE_SCHEMA||ui?.schema===PUBLIC_UI_BUNDLE_SCHEMA,
    'UI_LEASE_SCHEMA');
  assert.equal(ui.repo,'thedoorw/INK','UI_LEASE_REPO');
  assert.ok(sha(ui.base_head)&&sha(ui.base_tree),'UI_LEASE_ORIGINAL_BASE');
  let unsigned;
  if(ui.schema===PUBLIC_UI_BUNDLE_SCHEMA){
    assert.ok(Array.isArray(ui.files),'UI_LEASE_FILES');
    assert.deepEqual(ui.files.map(row=>row.path),PUBLIC_UI_PRESENTATION_PATHS,
      'UI_LEASE_EXACT_PRESENTATION_PATHS');
    for(const row of ui.files){
      assert.deepEqual(Object.keys(row).sort(),
        ['path','git_blob_sha','sha256','bytes'].sort(),'UI_LEASE_ROW_FIELDS');
      assert.ok(sha(row.git_blob_sha)&&sha256(row.sha256)&&
        Number.isSafeInteger(row.bytes)&&row.bytes>0,'UI_LEASE_BLOB_FIELDS:'+row.path);
    }
    unsigned={schema:ui.schema,repo:ui.repo,base_head:ui.base_head,
      base_tree:ui.base_tree,files:ui.files};
  }else{
    assert.equal(ui.path,PUBLIC_UI_MENU,'UI_LEASE_SCOPE');
    assert.ok(sha(ui.git_blob_sha)&&sha256(ui.sha256)&&
      Number.isSafeInteger(ui.bytes)&&ui.bytes>0,'UI_LEASE_BLOB_FIELDS');
    unsigned={schema:ui.schema,repo:ui.repo,base_head:ui.base_head,
      base_tree:ui.base_tree,path:ui.path,git_blob_sha:ui.git_blob_sha,
      sha256:ui.sha256,bytes:ui.bytes};
  }
  assert.deepEqual(Object.keys(ui).sort(),[...Object.keys(unsigned),'version'].sort(),
    'UI_LEASE_EXACT_FIELDS');
  assert.equal(ui.version,'ui-'+hash(Buffer.from(canonical(unsigned))).slice(0,24),
    'UI_LEASE_VERSION');
  const managed=new Map(prior.managed_files.map(r=>[r.path,r]));
  for(const row of leasedRows(ui)){
    const file=base.files.get(row.path);
    assert.ok(file?.mode==='100644','UI_BASE_FILE_REQUIRED:'+row.path);
    assert.equal(file.sha,row.git_blob_sha,'UI_BASE_BLOB:'+row.path);
    assert.equal(hash(file.bytes),row.sha256,'UI_BASE_HASH:'+row.path);
    assert.equal(file.bytes.length,row.bytes,'UI_BASE_BYTES:'+row.path);
    assert.deepEqual(managed.get(row.path),row,'UI_BASE_MANAGED_ROW:'+row.path);
  }
  assert.ok(!managed.has(PAGES_BUILD_IDENTITY),'PAGES_MUST_BE_UNMANAGED');
  const before=parsed(base.files,'BUILD_INFO.json');
  assert.deepEqual(before.ui_release,ui,'UI_BASE_BUILD_LEASE');
  const runtime=new Map();
  for(const r of before.runtime?.files??[]){
    const f=base.files.get(r.path);
    assert.ok(f,'UI_BASE_RUNTIME_FILE:'+r.path);
    runtime.set(r.path,f);
  }
  validateBuild(before,runtime,cfg);
  assert.equal(before.runtime.package_digest_sha256,prior.runtime_digest_sha256,
    'UI_BASE_RUNTIME_RECEIPT');
  // A later UI-only turn may retain the Core provenance, but it MUST update
  // the composite digest and Pages revision in both metadata documents.
  if(prior.dual_source!==undefined||before.dual_source!==undefined){
    const d=prior.dual_source;
    assert.equal(d?.schema,dualSchemaForUi(ui),'UI_BASE_DUAL_SCHEMA');
    assert.deepEqual(before.dual_source,d,'UI_BASE_DUAL_RECEIPT_DRIFT');
    assert.ok(sha256(d.private_runtime_digest_sha256),'UI_BASE_PRIVATE_DIGEST');
    assert.equal(d.composite_runtime_digest_sha256,prior.runtime_digest_sha256,
      'UI_BASE_DUAL_COMPOSITE_DRIFT');
    assert.equal(d.ui_release_version,ui.version,'UI_BASE_DUAL_UI_VERSION_DRIFT');
    assert.equal(d.pages_build_identity,pagesRevisionForDigest(prior.runtime_digest_sha256),
      'UI_BASE_DUAL_PAGES_DRIFT');
  }
  const identity=base.files.get(PAGES_BUILD_IDENTITY);
  assert.ok(identity?.mode==='100644'&&Buffer.isBuffer(identity.bytes),
    'UI_BASE_PAGES_REQUIRED');
  assert.equal(blob(identity.bytes),identity.sha,'UI_BASE_PAGES_BLOB');
  assert.equal(identity.bytes.toString('utf8'),
    pagesRevisionForDigest(prior.runtime_digest_sha256)+'\n','UI_BASE_PAGES_REVISION');
  return ui;
}

// Creates a mixed-source Static Sync009 plan by retaining one exact Public
// lease, while all remaining runtime bytes are still privately qualified.
// This path is available ONLY after a trusted Public UI-only cutover receipt.
function makeDualPlan(args,prior,buildId,{privateRuntimeDigest}={}){
  const {build,sourceFiles,base,cfg,qualification,authorityReference,action='publish'}=args;
  assert.ok(['publish','rollback'].includes(action),'ACTION');
  const lease=verifiedUiLease(base,prior,cfg);
  assert.ok(qualification?.source_tree===build.source.product_tree,'QA_SOURCE_TREE');
  assert.ok(Array.isArray(qualification.runs)&&qualification.runs.length,'QA_RUNS_REQUIRED');
  assert.ok(/^https:\/\/github\.com\/thedoorw\/INK-Browser-QA\/(pull|issues)\/[1-9][0-9]*(#[-a-zA-Z0-9]+)?$/.test(authorityReference),'REVIEW_REFERENCE');
  const originalDigest=privateRuntimeDigest??build.runtime.package_digest_sha256;
  assert.ok(sha256(originalDigest),'DUAL_PRIVATE_RUNTIME_DIGEST');
  const mixed=new Map(sourceFiles);
  for(const row of leasedRows(lease)){
    assert.ok(mixed.has(row.path),'DUAL_PRIVATE_UI_MISSING:'+row.path);
    mixed.set(row.path,base.files.get(row.path));
  }
  // The next Private Core runtime must keep consuming Public UI externally.
  // A valid menu lease cannot rescue a bundled shell or stale SW strategy.
  verifyUiBridgeFiles(mixed,lease);
  const runtimePaths=[...mixed.keys()].sort();
  const runtimeRows=rowsOf(mixed,runtimePaths);
  const digest=hash(Buffer.from(canonical(runtimeRows)));
  const revision=pagesRevisionForDigest(digest);
  const composite=structuredClone(build);
  composite.runtime={...composite.runtime,files:runtimeRows,file_count:runtimeRows.length,
    package_digest_sha256:digest};
  validateBuild(composite,mixed,cfg);
  const dualSource={schema:dualSchemaForUi(lease),
    private_runtime_digest_sha256:originalDigest,
    composite_runtime_digest_sha256:digest,
    ui_release_version:lease.version,pages_build_identity:revision};
  const next=new Map(mixed);
  const deletions=prior.managed_files.map(r=>r.path)
    .filter(p=>p!=='BUILD_INFO.json'&&!next.has(p)).sort();
  const managed=runtimeRows.map(r=>({...r,git_blob_sha:mixed.get(r.path).sha}));
  const info=structuredClone(composite);
  info.ui_release=structuredClone(lease);
  info.dual_source=structuredClone(dualSource);
  info.qualification={status:'REVIEW_REQUIRED',source_tree:qualification.source_tree,
    runs:qualification.runs};
  info.publication={kind:action,previous_target_commit:base.head,
    runtime_bytes_unchanged_from_package:false};
  const add=(p,b)=>next.set(p,{mode:'100644',bytes:b,sha:blob(b)});
  add('BUILD_INFO.json',json(info));
  managed.push({path:'BUILD_INFO.json',bytes:next.get('BUILD_INFO.json').bytes.length,
    sha256:hash(next.get('BUILD_INFO.json').bytes),git_blob_sha:next.get('BUILD_INFO.json').sha});
  const receipt={schema:'INK_PUBLICATION_RECEIPT_V1',action,
    source_sha:build.source.exact_sha,source_tree:build.source.product_tree,
    runtime_digest_sha256:digest,package_manifest_sha256:build.package.manifest_sha256,
    allowlist_digest_sha256:build.publisher.allowlist_digest_sha256,
    previous_target_commit:base.head,authority_reference:authorityReference,
    managed_files:managed.sort((a,b)=>a.path.localeCompare(b.path)),
    ui_release:structuredClone(lease),dual_source:structuredClone(dualSource)};
  add('PUBLISH_RECEIPT.json',json(receipt));
  // Explicit trusted exception: regenerate the unmanaged file on EVERY
  // composite-digest update; never source it from Private or leave stale.
  add(PAGES_BUILD_IDENTITY,Buffer.from(revision+'\n'));
  const manifest={schema:'INK_STATIC_SYNC_V1',intent:'draft-pr-only',action,
    source:build.source,build_id:buildId,
    runtime_digest_sha256:digest,package_manifest_sha256:build.package.manifest_sha256,
    allowlist_digest_sha256:build.publisher.allowlist_digest_sha256,
    target:{repo:'thedoorw/INK',branch:'main',expected_head:base.head,
      expected_tree:base.tree,prior_receipt_sha256:hash(base.files.get('PUBLISH_RECEIPT.json').bytes)},
    qualification,authority_reference:authorityReference,
    rollback:{public_commit:base.head,
      receipt_sha256:hash(base.files.get('PUBLISH_RECEIPT.json').bytes),
      source_sha:prior.source_sha,source_tree:prior.source_tree},
    dual_source:structuredClone(dualSource),
    files:rowsOf(next,[...next.keys()].sort()),deletions};
  add('release/STATIC_SYNC.json',json(manifest));
  const changes=[...next].filter(([p,f])=>base.files.get(p)?.sha!==f.sha)
    .map(([p])=>p).concat(deletions).sort();
  const same=prior.runtime_digest_sha256===digest&&
    prior.source_tree===build.source.product_tree;
  return {schema:'INK_STATIC_SYNC_PLAN_V1',
    disposition:same&&action==='publish'?'ALREADY_PUBLISHED':'DRAFT_REQUIRED',
    manifest,files:next,changes,deletions};
}
export function makePlan({build,sourceFiles,base,cfg,qualification,authorityReference,action='publish'}){
  assert.ok(['publish','rollback'].includes(action),'ACTION');
  const buildId=validateBuild(build,sourceFiles,cfg),prior=validateBase(base,cfg);
  if(prior.ui_release!==undefined)return makeDualPlan(
    {build,sourceFiles,base,cfg,qualification,authorityReference,action},prior,buildId);
  assert.ok(qualification?.source_tree===build.source.product_tree,'QA_SOURCE_TREE');
  assert.ok(Array.isArray(qualification.runs)&&qualification.runs.length,'QA_RUNS_REQUIRED');
  assert.ok(/^https:\/\/github\.com\/thedoorw\/INK-Browser-QA\/(pull|issues)\/[1-9][0-9]*(#[-a-zA-Z0-9]+)?$/.test(authorityReference),'REVIEW_REFERENCE');
  const next=new Map(sourceFiles);
  const deletions=prior.managed_files.map(r=>r.path).filter(p=>p!=='BUILD_INFO.json'&&!next.has(p)).sort();
  const managed=build.runtime.files.map(r=>({...r,git_blob_sha:sourceFiles.get(r.path).sha}));
  const info=structuredClone(build);
  info.qualification={status:'REVIEW_REQUIRED',source_tree:qualification.source_tree,runs:qualification.runs};
  info.publication={kind:action,previous_target_commit:base.head,runtime_bytes_unchanged_from_package:true};
  const add=(p,b)=>next.set(p,{mode:'100644',bytes:b,sha:blob(b)});
  add('BUILD_INFO.json',json(info));
  managed.push({path:'BUILD_INFO.json',bytes:next.get('BUILD_INFO.json').bytes.length,sha256:hash(next.get('BUILD_INFO.json').bytes),git_blob_sha:next.get('BUILD_INFO.json').sha});
  const receipt={schema:'INK_PUBLICATION_RECEIPT_V1',action,source_sha:build.source.exact_sha,source_tree:build.source.product_tree,runtime_digest_sha256:build.runtime.package_digest_sha256,package_manifest_sha256:build.package.manifest_sha256,allowlist_digest_sha256:build.publisher.allowlist_digest_sha256,previous_target_commit:base.head,authority_reference:authorityReference,managed_files:managed.sort((a,b)=>a.path.localeCompare(b.path))};
  add('PUBLISH_RECEIPT.json',json(receipt));
  const manifest={schema:'INK_STATIC_SYNC_V1',intent:'draft-pr-only',action,source:build.source,build_id:buildId,runtime_digest_sha256:build.runtime.package_digest_sha256,package_manifest_sha256:build.package.manifest_sha256,allowlist_digest_sha256:build.publisher.allowlist_digest_sha256,target:{repo:'thedoorw/INK',branch:'main',expected_head:base.head,expected_tree:base.tree,prior_receipt_sha256:hash(base.files.get('PUBLISH_RECEIPT.json').bytes)},qualification,authority_reference:authorityReference,rollback:{public_commit:base.head,receipt_sha256:hash(base.files.get('PUBLISH_RECEIPT.json').bytes),source_sha:prior.source_sha,source_tree:prior.source_tree},files:rowsOf(next,[...next.keys()].sort()),deletions};
  add('release/STATIC_SYNC.json',json(manifest));
  const changes=[...next].filter(([p,f])=>base.files.get(p)?.sha!==f.sha).map(([p])=>p).concat(deletions).sort();
  const same=prior.runtime_digest_sha256===manifest.runtime_digest_sha256&&prior.source_tree===manifest.source.product_tree;
  return {schema:'INK_STATIC_SYNC_PLAN_V1',disposition:same&&action==='publish'?'ALREADY_PUBLISHED':'DRAFT_REQUIRED',manifest,files:next,changes,deletions};
}
function verifyDualPlan({base,candidateFiles,cfg,changedPaths},prior,m){
  const lease=verifiedUiLease(base,prior,cfg);
  assert.equal(m.schema,'INK_STATIC_SYNC_V1','DUAL_SYNC_SCHEMA');
  assert.equal(m.intent,'draft-pr-only','DUAL_INTENT');
  assert.ok(['publish','rollback'].includes(m.action),'DUAL_ACTION');
  assert.equal(m.dual_source?.schema,dualSchemaForUi(lease),'DUAL_MANIFEST_REQUIRED');
  assert.equal(m.target?.repo,'thedoorw/INK','DUAL_TARGET_REPO');
  assert.equal(m.target?.branch,'main','DUAL_TARGET_BRANCH');
  assert.equal(m.target.expected_head,base.head,'DUAL_STALE_BASE');
  assert.equal(m.target.expected_tree,base.tree,'DUAL_STALE_TREE');
  assert.equal(m.target.prior_receipt_sha256,
    hash(base.files.get('PUBLISH_RECEIPT.json').bytes),'DUAL_STALE_RECEIPT');
  const info=parsed(candidateFiles,'BUILD_INFO.json');
  const runtime=new Map();
  for(const r of info.runtime?.files??[]){
    assert.ok(candidateFiles.has(r.path),'DUAL_RUNTIME_MISSING:'+r.path);
    runtime.set(r.path,candidateFiles.get(r.path));
  }
  const buildId=validateBuild(info,runtime,cfg);
  verifyUiBridgeFiles(runtime,lease);
  assert.equal(m.build_id,buildId,'DUAL_BUILD_ID');
  assert.deepEqual(info.ui_release,prior.ui_release,'DUAL_UI_LEASE_NOT_PRESERVED');
  for(const row of leasedRows(lease))
    assert.equal(runtime.get(row.path)?.sha,base.files.get(row.path)?.sha,
      'DUAL_PUBLIC_UI_OVERWRITE:'+row.path);
  assert.equal(info.dual_source?.schema,dualSchemaForUi(lease),
    'DUAL_BUILD_EXTENSION_REQUIRED');
  assert.ok(sha256(info.dual_source.private_runtime_digest_sha256),
    'DUAL_PRIVATE_RUNTIME_DIGEST');
  const previousBuild=structuredClone(info);
  delete previousBuild.qualification;
  delete previousBuild.publication;
  delete previousBuild.ui_release;
  delete previousBuild.dual_source;
  const expected=makeDualPlan({build:previousBuild,sourceFiles:runtime,base,cfg,
    qualification:m.qualification,authorityReference:m.authority_reference,
    action:m.action},prior,buildId,
    {privateRuntimeDigest:info.dual_source.private_runtime_digest_sha256});
  assert.equal(canonical(m),canonical(expected.manifest),'DUAL_MANIFEST_RECONSTRUCTION');
  for(const [p,f] of expected.files)
    assert.equal(candidateFiles.get(p)?.sha,f.sha,'DUAL_EXPECTED_FILE:'+p);
  assert.deepEqual([...changedPaths].sort(),expected.changes,'DUAL_UNEXPECTED_DIFF');
  for(const p of expected.deletions)
    assert.ok(!candidateFiles.has(p),'DUAL_RETIRED_FILE_REMAINS');
  for(const [p,f] of base.files)
    if(!expected.files.has(p)&&!expected.deletions.includes(p))
      assert.equal(candidateFiles.get(p)?.sha,f.sha,'DUAL_PRESERVED_FILE_CHANGED:'+p);
  for(const p of candidateFiles.keys())
    assert.ok(base.files.has(p)||expected.files.has(p),'DUAL_UNMANAGED_FILE_ADDED:'+p);
  const receipt=parsed(candidateFiles,'PUBLISH_RECEIPT.json');
  assert.deepEqual(receipt.ui_release,prior.ui_release,'DUAL_RECEIPT_UI_LEASE');
  assert.deepEqual(receipt.dual_source,info.dual_source,'DUAL_RECEIPT_BUILD_PROVENANCE');
  assert.equal(receipt.runtime_digest_sha256,info.runtime.package_digest_sha256,
    'DUAL_RECEIPT_RUNTIME_DIGEST');
  const pages=candidateFiles.get(PAGES_BUILD_IDENTITY);
  assert.equal(pages?.bytes.toString('utf8'),
    pagesRevisionForDigest(info.runtime.package_digest_sha256)+'\n',
    'DUAL_PAGES_REVISION');
  assert.ok(!receipt.managed_files.some(r=>r.path===PAGES_BUILD_IDENTITY),
    'DUAL_PAGES_MANAGED');
  return {status:'DUAL_SOURCE_INTEGRITY_PASS',build_id:buildId,
    source_sha:m.source.exact_sha,source_tree:m.source.product_tree,
    files:info.runtime.files.length,qa:'PRIVATE_EVIDENCE_REVIEW_REQUIRED',
    release_authorized:false};
}
export function verifyPlan({base,candidateFiles,cfg,changedPaths}){
  const prior=validateBase(base,cfg);checkFiles(candidateFiles);
  const m=parsed(candidateFiles,'release/STATIC_SYNC.json');
  if(prior.ui_release!==undefined)
    return verifyDualPlan({base,candidateFiles,cfg,changedPaths},prior,m);
  assert.equal(m.schema,'INK_STATIC_SYNC_V1','SYNC_SCHEMA');assert.equal(m.intent,'draft-pr-only','INTENT');assert.ok(['publish','rollback'].includes(m.action),'ACTION');
  assert.equal(m.target?.repo,'thedoorw/INK','TARGET_REPO');assert.equal(m.target.branch,'main','TARGET_BRANCH');
  assert.equal(m.target.expected_head,base.head,'STALE_BASE');assert.equal(m.target.expected_tree,base.tree,'STALE_TREE');
  assert.equal(m.target.prior_receipt_sha256,hash(base.files.get('PUBLISH_RECEIPT.json').bytes),'STALE_RECEIPT');
  const info=parsed(candidateFiles,'BUILD_INFO.json'),runtime=new Map();
  for(const r of info.runtime.files){assert.ok(candidateFiles.has(r.path),'RUNTIME_MISSING');runtime.set(r.path,candidateFiles.get(r.path));}
  const id=validateBuild(info,runtime,cfg);assert.equal(m.build_id,id,'BUILD_ID');assert.equal(canonical(m.source),canonical(info.source),'SOURCE_MISMATCH');
  assert.equal(m.runtime_digest_sha256,info.runtime.package_digest_sha256,'DIGEST_MISMATCH');
  assert.equal(m.package_manifest_sha256,info.package.manifest_sha256,'PACKAGE_MISMATCH');
  assert.equal(m.allowlist_digest_sha256,info.publisher.allowlist_digest_sha256,'ALLOWLIST_MISMATCH');
  // Reconstruct independently: exact metadata, retired managed files and rollback binding.
  const expected=makePlan({build:info,sourceFiles:runtime,base,cfg,qualification:m.qualification,authorityReference:m.authority_reference,action:m.action});
  assert.equal(canonical(m),canonical(expected.manifest),'MANIFEST_RECONSTRUCTION');
  for(const [p,f] of expected.files)assert.equal(candidateFiles.get(p)?.sha,f.sha,'EXPECTED_FILE:'+p);
  const expectedChanges=new Set(expected.changes);
  assert.deepEqual([...changedPaths].sort(),[...expectedChanges].sort(),'UNEXPECTED_DIFF');
  for(const p of expected.deletions)assert.ok(!candidateFiles.has(p),'RETIRED_FILE_REMAINS');
  for(const [p,f] of base.files)if(!expected.files.has(p)&&!expected.deletions.includes(p))assert.equal(candidateFiles.get(p)?.sha,f.sha,'PRESERVED_FILE_CHANGED:'+p);
  for(const p of candidateFiles.keys())assert.ok(base.files.has(p)||expected.files.has(p),'UNMANAGED_FILE_ADDED');
  return {status:'INTEGRITY_PASS',build_id:id,source_sha:m.source.exact_sha,source_tree:m.source.product_tree,files:info.runtime.files.length,qa:'PRIVATE_EVIDENCE_REVIEW_REQUIRED',release_authorized:false};
}

// #703 Phase 2 candidate: a trusted-base verifier, never PR-authored code.
// Exactly one presentation module may change; BuildInfo and receipt are
// deterministic bookkeeping computed from the complete Git blob inventories.
const PUBLIC_UI_MENU='src/ui/ink017/menu-ui.js';
const PAGES_IDENTITY='pages-build-identity.txt';
const UI_ONLY_CHANGED=Object.freeze([PUBLIC_UI_MENU,'BUILD_INFO.json','PUBLISH_RECEIPT.json',PAGES_IDENTITY].sort());
export function uiOnlyPaths(paths){
  return Array.isArray(paths)&&paths.length===UI_ONLY_CHANGED.length&&
    paths.every(p=>typeof p==='string')&&
    canonical([...paths].sort())===canonical(UI_ONLY_CHANGED);
}
export function verifyMenuHostContract(source){
  assert.ok(typeof source==='string'&&source.length>0&&source.length<512*1024&&
    !source.includes('\0'),'UI_MENU_SOURCE_INVALID');
  assert.match(source,/export\s+function\s+mountMenuUi\s*\(\s*\{\s*menu\s*,\s*logo\s*,\s*host\s*,\s*invoke\s*,\s*signal\s*\}\s*\)/,
    'UI_MENU_EXPORT_CONTRACT');
  assert.match(source,/\bhost\.menuApi\.[a-zA-Z_$][\w$]*\s*\(/,'UI_MENU_RESTRICTED_API_REQUIRED');
  assert.doesNotMatch(source,/\bhost\s*(?:\.\s*(?:app|provider)\b|\[)/,'UI_MENU_RAW_CORE_ACCESS');
  assert.doesNotMatch(source,/(?:^|\n)\s*import\s|\bimport\s*\(/,'UI_MENU_EXTERNAL_IMPORT');
  assert.doesNotMatch(source,/\b(?:globalThis|window)\s*\.\s*INK_APP\b/,'UI_MENU_CORE_GLOBAL');
  return 'MENU_HOST_CONTRACT_PASS';
}
export function pagesRevisionForDigest(runtimeDigest){
  assert.ok(sha256(runtimeDigest),'INK703_PAGES_RUNTIME_DIGEST');
  return createHash('sha1').update('INK703-PWA:'+runtimeDigest).digest('hex');
}
export function expectedUiOnlyMetadata({base,candidateMenu,cfg}){
  const prior=validateBase(base,cfg);checkedMenu(candidateMenu);
  const oldMenu=base.files.get(PUBLIC_UI_MENU);
  assert.ok(oldMenu&&oldMenu.sha!==candidateMenu.sha,'UI_MENU_UNCHANGED');
  const before=parsed(base.files,'BUILD_INFO.json');
  assert.equal(before.schema,'INK_PUBLIC_BUILD_INFO_V3','UI_BASE_BUILD_SCHEMA');
  assert.ok(Array.isArray(before.runtime?.files),'UI_BASE_RUNTIME');
  const paths=before.runtime.files.map(x=>x.path);
  assert.ok(paths.includes(PUBLIC_UI_MENU),'UI_MENU_NOT_IN_RUNTIME');
  assert.equal(before.runtime.file_count,paths.length,'UI_BASE_RUNTIME_COUNT');
  const byPath=new Map(before.runtime.files.map(x=>[x.path,x]));
  assert.equal(byPath.size,paths.length,'UI_BASE_RUNTIME_DUPLICATES');
  const runtimeFiles=new Map();
  for(const r of before.runtime.files){
    const f=base.files.get(r.path);
    assert.ok(f&&r.sha256===hash(f.bytes)&&r.bytes===f.bytes.length,'UI_BASE_RUNTIME_DRIFT:'+r.path);
    runtimeFiles.set(r.path,f);
  }
  validateBuild(before,runtimeFiles,cfg);
  assert.equal(hash(Buffer.from(canonical(before.runtime.files))),before.runtime.package_digest_sha256,'UI_BASE_RUNTIME_DIGEST');
  assert.equal(prior.runtime_digest_sha256,before.runtime.package_digest_sha256,'UI_BASE_RECEIPT_DIGEST');
  if(before.dual_source!==undefined||prior.dual_source!==undefined){
    assert.equal(before.dual_source?.schema,DUAL_SOURCE_SCHEMA,'UI_BASE_DUAL_SCHEMA');
    assert.equal(canonical(before.dual_source),canonical(prior.dual_source),'UI_BASE_DUAL_RECEIPT_DRIFT');
    assert.ok(sha256(before.dual_source.private_runtime_digest_sha256),'UI_BASE_DUAL_PRIVATE_DIGEST');
    assert.equal(before.dual_source.composite_runtime_digest_sha256,
      before.runtime.package_digest_sha256,'UI_BASE_DUAL_RUNTIME_DRIFT');
    assert.equal(before.dual_source.pages_build_identity,
      pagesRevisionForDigest(before.runtime.package_digest_sha256),'UI_BASE_DUAL_PAGES_DRIFT');
    assert.equal(before.dual_source.ui_release_version,prior.ui_release?.version,'UI_BASE_DUAL_LEASE_DRIFT');
  }
  // The first UI release may follow a legacy 009 receipt without a Pages
  // identity. Every subsequent UI release must carry an intact dual identity.
  const previousIdentity=base.files.get(PAGES_IDENTITY);
  if(previousIdentity||prior.ui_release||before.ui_release){
    assert.ok(previousIdentity?.mode==='100644'&&Buffer.isBuffer(previousIdentity.bytes),
      'UI_BASE_PAGES_IDENTITY_MISSING');
    assert.equal(blob(previousIdentity.bytes),previousIdentity.sha,'UI_BASE_PAGES_BLOB_DRIFT');
    assert.equal(previousIdentity.bytes.toString('utf8'),
      pagesRevisionForDigest(before.runtime.package_digest_sha256)+'\n','UI_BASE_PAGES_IDENTITY_DRIFT');
    assert.ok(prior.ui_release&&before.ui_release,'UI_BASE_UI_RELEASE_MISSING');
    assert.equal(canonical(prior.ui_release),canonical(before.ui_release),'UI_BASE_UI_RELEASE_DRIFT');
    assert.equal(prior.ui_release.git_blob_sha,oldMenu.sha,'UI_BASE_MENU_LEASE_BLOB');
    assert.equal(prior.ui_release.sha256,hash(oldMenu.bytes),'UI_BASE_MENU_LEASE_DIGEST');
    assert.equal(prior.ui_release.bytes,oldMenu.bytes.length,'UI_BASE_MENU_LEASE_SIZE');
  }
  const menuRow={path:PUBLIC_UI_MENU,sha256:hash(candidateMenu.bytes),bytes:candidateMenu.bytes.length};
  const uiLease={schema:'INK703_PUBLIC_UI_RELEASE_V1',repo:'thedoorw/INK',base_head:base.head,
    base_tree:base.tree,path:PUBLIC_UI_MENU,git_blob_sha:candidateMenu.sha,
    sha256:menuRow.sha256,bytes:menuRow.bytes};
  uiLease.version='ui-'+hash(Buffer.from(canonical(uiLease))).slice(0,24);
  const build=structuredClone(before);
  build.runtime.files=before.runtime.files.map(r=>r.path===PUBLIC_UI_MENU?menuRow:r);
  build.runtime.package_digest_sha256=hash(Buffer.from(canonical(build.runtime.files)));
  build.ui_release=uiLease;
  if(before.dual_source!==undefined){
    build.dual_source={...before.dual_source,
      composite_runtime_digest_sha256:build.runtime.package_digest_sha256,
      ui_release_version:uiLease.version,
      pages_build_identity:pagesRevisionForDigest(build.runtime.package_digest_sha256)};
  }
  build.publication={kind:'ui-only',previous_target_commit:base.head,
    runtime_bytes_unchanged_from_package:false};
  const mixedFiles=new Map(runtimeFiles);mixedFiles.set(PUBLIC_UI_MENU,candidateMenu);
  validateBuild(build,mixedFiles,cfg);
  // The original Private package manifest remains the Core evidence identity;
  // the Public UI overlay is independently identified by ui_release.
  const buildBytes=json(build),buildItem={mode:'100644',bytes:buildBytes,sha:blob(buildBytes)};
  const receipt=structuredClone(prior);
  receipt.action='ui-only';
  receipt.previous_target_commit=base.head;
  receipt.runtime_digest_sha256=build.runtime.package_digest_sha256;
  receipt.ui_release=uiLease;
  if(build.dual_source!==undefined)receipt.dual_source=structuredClone(build.dual_source);
  const rows=new Map(receipt.managed_files.map(r=>[r.path,r]));
  const withGit=(r,f)=>({...r,git_blob_sha:f.sha});
  rows.set(PUBLIC_UI_MENU,withGit(menuRow,candidateMenu));
  rows.set('BUILD_INFO.json',withGit({path:'BUILD_INFO.json',bytes:buildBytes.length,sha256:hash(buildBytes)},buildItem));
  receipt.managed_files=[...rows.values()].sort((a,b)=>a.path.localeCompare(b.path,'en'));
  const receiptBytes=json(receipt),receiptItem={mode:'100644',bytes:receiptBytes,sha:blob(receiptBytes)};
  // A deployed Pages revision changes the worker script query (?build=pages-<SHA>)
  // and therefore both cache namespaces without rebuilding Private Core.
  // Derive it from the COMPLETE mixed Runtime digest, not merely the menu SHA:
  // a later Private Core update must rotate the same namespace as a UI update.
  // Deliberately keep this generated identity outside managed_files: current
  // Private 009 preserves unknown Public files but retires absent managed ones.
  const pagesRevision=pagesRevisionForDigest(build.runtime.package_digest_sha256);
  const identityBytes=Buffer.from(pagesRevision+'\n');
  const identityItem={mode:'100644',bytes:identityBytes,sha:blob(identityBytes)};
  return {buildItem,receiptItem,identityItem,pagesRevision,uiLease,menuItem:candidateMenu};
}
function checkedMenu(f){
  assert.ok(f?.mode==='100644'&&Buffer.isBuffer(f.bytes),'UI_MENU_MODE');
  assert.equal(blob(f.bytes),f.sha,'UI_MENU_BLOB_DRIFT');
  verifyMenuHostContract(f.bytes.toString('utf8'));
}
function verifyInstalledUiBridge(base){
  verifyUiBridgeFiles(base.files);
}
function verifyUiBridgeFiles(files,ui){
  const shell=files.get('dist/startup/ink-shell.mjs');
  assert.ok(shell?.mode==='100644'&&Buffer.isBuffer(shell.bytes),'UI_BRIDGE_SHELL_MISSING');
  if(ui?.schema===PUBLIC_UI_BUNDLE_SCHEMA){
    assert.match(shell.bytes.toString('utf8'),
      /import\(new URL\(["']\.\/shell\.js["'],new URL\(["']src\/ui\/ink017\/entry\.js["'],document\.baseURI\)\.href\)\.href\)/,
      'UI_BRIDGE_EXTERNAL_SHELL_NOT_INSTALLED');
    assertPresentationClosure(files);
  }else{
    assert.match(shell.bytes.toString('utf8'),
      /import\(new URL\(["']\.\/menu-ui\.js["'],new URL\(["']src\/ui\/ink017\/shell\.js["'],document\.baseURI\)\.href\)\.href\)/,
      'UI_BRIDGE_NOT_INSTALLED');
  }
  const worker=files.get('service-worker-runtime.js');
  assert.ok(worker?.mode==='100644'&&Buffer.isBuffer(worker.bytes),'UI_BRIDGE_SW_MISSING');
  const source=worker.bytes.toString('utf8');
  assert.match(source,/['"]\.\/src\/ui\/ink017\/menu-ui\.js['"]/,'UI_BRIDGE_SW_OFFLINE_MISSING');
  if(ui?.schema===PUBLIC_UI_BUNDLE_SCHEMA)
    for(const p of PUBLIC_UI_PRESENTATION_PATHS)
      assert.ok(source.includes(JSON.stringify('./'+p))||source.includes("'./"+p+"'"),
        'UI_BRIDGE_SW_OFFLINE_PRESENTATION:'+p);
  assert.match(source,/networkFirstAsset\(event\.request/,'UI_BRIDGE_SW_NETWORK_FIRST_MISSING');
}
export function verifyUiOnlyPlan({base,candidateFiles,cfg,changedPaths}){
  assert.ok(uiOnlyPaths(changedPaths),'UI_ONLY_EXACT_PATHS');
  checkFiles(base.files);checkFiles(candidateFiles);
  assert.deepEqual([...candidateFiles.keys()].sort(),
    [...new Set([...base.files.keys(),PAGES_IDENTITY])].sort(),'UI_ONLY_FULL_TREE_PATHS');
  verifyInstalledUiBridge(base);
  const menuItem=candidateFiles.get(PUBLIC_UI_MENU);
  const expected=expectedUiOnlyMetadata({base,candidateMenu:menuItem,cfg});
  assert.equal(candidateFiles.get('BUILD_INFO.json')?.sha,expected.buildItem.sha,'UI_ONLY_BUILD_IDENTITY');
  assert.equal(candidateFiles.get('PUBLISH_RECEIPT.json')?.sha,expected.receiptItem.sha,'UI_ONLY_RECEIPT_IDENTITY');
  assert.equal(candidateFiles.get(PAGES_IDENTITY)?.sha,expected.identityItem.sha,'UI_ONLY_PAGES_IDENTITY');
  assert.equal(candidateFiles.get(PAGES_IDENTITY)?.bytes.toString('utf8'),expected.pagesRevision+'\n','UI_ONLY_PAGES_IDENTITY_BYTES');
  for(const [p,f] of base.files){
    if(UI_ONLY_CHANGED.includes(p))continue;
    assert.equal(candidateFiles.get(p)?.sha,f.sha,'UI_ONLY_CORE_DRIFT:'+p);
  }
  const actual=[...new Set([...base.files.keys(),...candidateFiles.keys()])]
    .filter(p=>base.files.get(p)?.sha!==candidateFiles.get(p)?.sha).sort();
  assert.deepEqual(actual,UI_ONLY_CHANGED,'UI_ONLY_ACTUAL_DIFF');
  // Guarantees that a future 009 validateBase can consume this Public HEAD.
  validateBase({...base,files:candidateFiles},cfg);
  return Object.freeze({status:'PUBLIC_UI_ONLY_INTEGRITY_PASS',releaseAuthorized:false,
    corePreserved:true,changedPaths:actual,uiVersion:expected.uiLease.version,pagesRevision:expected.pagesRevision,
    priorPublicHead:base.head});
}

// #703 next-stage candidate. A trusted, finite presentation graph is leased
// atomically even when only one of its UI files changes. No Core/Native file
// becomes Public-owned. This branch does not authorize publication.
const UI_BUNDLE_PATH_SET=new Set(PUBLIC_UI_PRESENTATION_PATHS);
const UI_BUNDLE_METADATA=Object.freeze(['BUILD_INFO.json','PUBLISH_RECEIPT.json',PAGES_IDENTITY]);
export function uiBundlePaths(paths){
  return Array.isArray(paths)&&paths.length>=4&&
    new Set(paths).size===paths.length&&
    UI_BUNDLE_METADATA.every(p=>paths.includes(p))&&
    paths.some(p=>UI_BUNDLE_PATH_SET.has(p))&&
    paths.every(p=>UI_BUNDLE_PATH_SET.has(p)||UI_BUNDLE_METADATA.includes(p));
}
export function expectedUiBundleMetadata({base,candidateFiles,cfg}){
  const prior=validateBase(base,cfg);
  const before=parsed(base.files,'BUILD_INFO.json');
  const runtimePaths=before.runtime?.files?.map(r=>r.path);
  assert.ok(Array.isArray(runtimePaths),'UI_BUNDLE_BASE_RUNTIME');
  assert.deepEqual(runtimePaths,[...new Set(runtimePaths)].sort(),'UI_BUNDLE_RUNTIME_ORDER');
  for(const p of PUBLIC_UI_PRESENTATION_PATHS)
    assert.ok(runtimePaths.includes(p),'UI_BUNDLE_SOURCE_NOT_PUBLISHED:'+p);
  const original=new Map(runtimePaths.map(p=>[p,base.files.get(p)]));
  validateBuild(before,original,cfg);
  assert.equal(before.runtime.package_digest_sha256,prior.runtime_digest_sha256,
    'UI_BUNDLE_BASE_RECEIPT_DIGEST');
  if(prior.ui_release!==undefined||before.ui_release!==undefined)
    verifiedUiLease(base,prior,cfg);
  const mixed=new Map(original);
  let uiChanged=0;
  for(const p of PUBLIC_UI_PRESENTATION_PATHS){
    const item=candidateFiles.get(p);
    assert.ok(item?.mode==='100644'&&Buffer.isBuffer(item.bytes),
      'UI_BUNDLE_MISSING:'+p);
    if(item.sha!==original.get(p)?.sha)uiChanged++;
    mixed.set(p,item);
  }
  assert.ok(uiChanged>0,'UI_BUNDLE_UNCHANGED');
  if(candidateFiles.get(PUBLIC_UI_MENU)?.sha!==base.files.get(PUBLIC_UI_MENU)?.sha)
    checkedMenu(candidateFiles.get(PUBLIC_UI_MENU));
  verifyUiBridgeFiles(mixed,{schema:PUBLIC_UI_BUNDLE_SCHEMA});
  const rows=rowsOf(mixed,runtimePaths);
  const runtimeDigest=hash(Buffer.from(canonical(rows)));
  const lease={schema:PUBLIC_UI_BUNDLE_SCHEMA,repo:'thedoorw/INK',
    base_head:base.head,base_tree:base.tree,
    files:PUBLIC_UI_PRESENTATION_PATHS.map(p=>{
      const f=mixed.get(p);return {path:p,bytes:f.bytes.length,
        sha256:hash(f.bytes),git_blob_sha:f.sha};
    })};
  lease.version='ui-'+hash(Buffer.from(canonical(lease))).slice(0,24);
  const build=structuredClone(before);
  build.runtime={...build.runtime,files:rows,file_count:rows.length,
    package_digest_sha256:runtimeDigest};
  build.ui_release=lease;
  const pagesRevision=pagesRevisionForDigest(runtimeDigest);
  if(before.dual_source!==undefined){
    build.dual_source={...before.dual_source,schema:DUAL_BUNDLE_SCHEMA,
      composite_runtime_digest_sha256:runtimeDigest,
      ui_release_version:lease.version,pages_build_identity:pagesRevision};
  }
  build.publication={kind:'ui-only',previous_target_commit:base.head,
    runtime_bytes_unchanged_from_package:false};
  validateBuild(build,mixed,cfg);
  const buildBytes=json(build),buildItem={mode:'100644',bytes:buildBytes,sha:blob(buildBytes)};
  const receipt=structuredClone(prior);
  receipt.action='ui-only';receipt.previous_target_commit=base.head;
  receipt.runtime_digest_sha256=runtimeDigest;
  receipt.ui_release=structuredClone(lease);
  if(build.dual_source)receipt.dual_source=structuredClone(build.dual_source);
  const managedRows=new Map(receipt.managed_files.map(r=>[r.path,r]));
  for(const f of lease.files)managedRows.set(f.path,f);
  managedRows.set('BUILD_INFO.json',{path:'BUILD_INFO.json',bytes:buildBytes.length,
    sha256:hash(buildBytes),git_blob_sha:buildItem.sha});
  receipt.managed_files=[...managedRows.values()].sort((a,b)=>a.path.localeCompare(b.path,'en'));
  const receiptBytes=json(receipt),receiptItem={mode:'100644',bytes:receiptBytes,
    sha:blob(receiptBytes)};
  const identityBytes=Buffer.from(pagesRevision+'\n');
  const identityItem={mode:'100644',bytes:identityBytes,sha:blob(identityBytes)};
  return {buildItem,receiptItem,identityItem,uiLease:lease,pagesRevision,
    changedUiPaths:PUBLIC_UI_PRESENTATION_PATHS.filter(p=>
      base.files.get(p)?.sha!==candidateFiles.get(p)?.sha)};
}
export function verifyUiBundleOnlyPlan({base,candidateFiles,cfg,changedPaths}){
  assert.ok(uiBundlePaths(changedPaths),'UI_BUNDLE_SCOPE');
  checkFiles(base.files);checkFiles(candidateFiles);
  assert.deepEqual([...candidateFiles.keys()].sort(),
    [...new Set([...base.files.keys(),PAGES_IDENTITY])].sort(),'UI_BUNDLE_FULL_TREE');
  const expected=expectedUiBundleMetadata({base,candidateFiles,cfg});
  for(const [p,f] of [['BUILD_INFO.json',expected.buildItem],
    ['PUBLISH_RECEIPT.json',expected.receiptItem],
    [PAGES_IDENTITY,expected.identityItem]])
    assert.equal(candidateFiles.get(p)?.sha,f.sha,'UI_BUNDLE_METADATA:'+p);
  for(const [p,f] of base.files){
    if(UI_BUNDLE_PATH_SET.has(p)||UI_BUNDLE_METADATA.includes(p))continue;
    assert.equal(candidateFiles.get(p)?.sha,f.sha,'UI_BUNDLE_CORE_DRIFT:'+p);
  }
  const actual=[...new Set([...base.files.keys(),...candidateFiles.keys()])]
    .filter(p=>base.files.get(p)?.sha!==candidateFiles.get(p)?.sha).sort();
  assert.deepEqual(actual,[...changedPaths].sort(),'UI_BUNDLE_CHANGED_PATHS');
  assert.deepEqual(actual,[...expected.changedUiPaths,...UI_BUNDLE_METADATA].sort(),
    'UI_BUNDLE_UNEXPECTED_DIFF');
  validateBase({...base,files:candidateFiles},cfg);
  return Object.freeze({status:'PUBLIC_UI_BUNDLE_INTEGRITY_PASS',releaseAuthorized:false,
    corePreserved:true,changedPaths:actual,uiVersion:expected.uiLease.version,
    pagesRevision:expected.pagesRevision,priorPublicHead:base.head});
}
// #637 QA-only gate: enabled only after independently pinned artifact and trusted-base cutover.

export const QA637_ROOT = 'qa/cloud-draw-637/';
const MANIFEST = QA637_ROOT + 'INK_DRIVE_637_PREVIEW_MANIFEST.json';
const hex = (s, n) => typeof s === 'string' && new RegExp(`^[a-f0-9]{${n}}$`).test(s);
const qa637SafePath = path => typeof path === 'string' && path.length > 0 &&
  path === path.normalize('NFC') && !/[\\:\x00-\x1f\x7f]/.test(path) &&
  path.split('/').every(part => part && part !== '.' && part !== '..' && !part.startsWith('.'));
const forbidden = /\.(?:ink|psd|psb|ai|pem|p12|pfx|key|env|zip|tgz)$/i;

export function qa637Only(changedPaths) {
  return changedPaths.length > 0 && changedPaths.every(p => p.startsWith(QA637_ROOT) && qa637SafePath(p));
}

export function qa637Event(event, baseSha, headSha) {
  const pr = event.pull_request;
  assert.equal(event.repository?.full_name, 'thedoorw/INK', 'QA637_REPO');
  assert.equal(pr?.base?.repo?.full_name, 'thedoorw/INK', 'QA637_BASE_REPO');
  assert.equal(pr?.head?.repo?.full_name, 'thedoorw/INK', 'QA637_FORK');
  assert.equal(pr?.base?.ref, 'main', 'QA637_TARGET');
  assert.equal(pr.base.sha, baseSha, 'QA637_BASE_MOVED');
  assert.equal(pr.head.sha, headSha, 'QA637_HEAD_MOVED');
  assert.ok(pr.head.ref.startsWith('qa-637/'), 'QA637_BRANCH_REQUIRED');
  assert.equal(pr.draft, false, 'QA637_DRAFT');
  assert.notEqual(event.action, 'closed', 'QA637_CLOSED');
}

// `trusted` MUST be constants committed to the Public trusted BASE by an
// independently reviewed control/ PR AFTER exact package build/certification.
// Reading these values from the candidate manifest would be self-attestation.
// {sourceSha, manifestSha256, action:'deploy'|'teardown'}
export function verifyQa637({ baseFiles, candidateFiles, changedPaths, trusted }) {
  assert.ok(baseFiles instanceof Map && candidateFiles instanceof Map, 'QA637_FILE_MAPS');
  assert.ok(hex(trusted?.sourceSha, 40) && hex(trusted?.manifestSha256, 64), 'QA637_TRUSTED_PINS_REQUIRED');
  assert.ok(['deploy', 'teardown'].includes(trusted.action), 'QA637_TRUSTED_ACTION');
  assert.ok(qa637Only(changedPaths), 'QA637_PATH_ONLY');
  const computed = [...new Set([...baseFiles.keys(), ...candidateFiles.keys()])]
    .filter(p => baseFiles.get(p)?.sha !== candidateFiles.get(p)?.sha).sort();
  assert.deepEqual([...changedPaths].sort(), computed, 'QA637_CHANGE_SET');

  // Absolutely no production/control/other-QA diff, even metadata changes.
  for (const path of computed) assert.ok(path.startsWith(QA637_ROOT), 'QA637_PRODUCTION_DIFF');
  for (const [p, f] of candidateFiles) {
    if (!p.startsWith(QA637_ROOT)) continue;
    assert.ok(qa637SafePath(p) && !forbidden.test(p), 'QA637_UNSAFE_FILE');
    assert.equal(f.mode, '100644', 'QA637_REGULAR_FILE');
    assert.ok(Buffer.isBuffer(f.bytes), 'QA637_BYTES');
  }

  const current = trusted.action === 'deploy' ? candidateFiles : baseFiles;
  const existing = [...current.keys()].filter(p => p.startsWith(QA637_ROOT)).sort();
  assert.ok(current.has(MANIFEST), 'QA637_MANIFEST_MISSING');
  const manifestBytes = current.get(MANIFEST).bytes;
  assert.equal(hash(manifestBytes), trusted.manifestSha256, 'QA637_MANIFEST_PIN');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(manifest.schema, 'INK_DRIVE_CATALOG_637_PUBLIC_QA_PACKAGE_V1', 'QA637_SCHEMA');
  assert.equal(manifest.privateCandidateSha, trusted.sourceSha, 'QA637_SOURCE_PIN');
  assert.equal(manifest.source, 'thedoorw/INK-Browser-QA', 'QA637_SOURCE_REPO');
  assert.equal(manifest.intendedPath, '/INK/qa/cloud-draw-637/', 'QA637_INTENDED_PATH');
  assert.equal(manifest.googleOAuthOrigin, 'https://thedoorw.github.io', 'QA637_ORIGIN');
  assert.equal(manifest.googleOAuthScope, 'https://www.googleapis.com/auth/drive.file', 'QA637_SCOPE');
  assert.equal(manifest.status, 'PREPARED_NOT_DEPLOYED', 'QA637_PACKAGE_STATE');
  assert.ok(Array.isArray(manifest.files) && manifest.files.length >= 6, 'QA637_INVENTORY');
  assert.equal(manifest.fileCount, manifest.files.length, 'QA637_FILE_COUNT');
  const inventoried = [];
  for (const row of manifest.files) {
    assert.ok(qa637SafePath(row.path) && !forbidden.test(row.path), 'QA637_INVENTORY_PATH');
    assert.ok(Number.isSafeInteger(row.bytes) && row.bytes >= 0 && hex(row.sha256, 64), 'QA637_INVENTORY_ROW');
    const absolute = QA637_ROOT + row.path;
    const f = current.get(absolute);
    assert.ok(f, 'QA637_FILE_MISSING:' + absolute);
    assert.equal(f.mode, '100644', 'QA637_NON_REGULAR:' + absolute);
    assert.equal(f.bytes.length, row.bytes, 'QA637_SIZE:' + absolute);
    assert.equal(hash(f.bytes), row.sha256, 'QA637_DIGEST:' + absolute);
    inventoried.push(absolute);
  }
  assert.deepEqual(inventoried, [...new Set(inventoried)].sort((a, b) => a.localeCompare(b)), 'QA637_DUPLICATE_OR_UNSORTED');
  assert.deepEqual(existing, [...inventoried, MANIFEST].sort(), 'QA637_UNLISTED_OR_MISSING');
  for (const path of ['index.html', 'service-worker-runtime.js', 'drive-catalog-637-preview.css',
    'dist/startup/ink-boot.mjs', 'dist/startup/ink-shell.mjs',
    'src/document/drive-native-link-startup.mjs'])
    assert.ok(inventoried.includes(QA637_ROOT + path), 'QA637_REQUIRED:' + path);
  const html = current.get(QA637_ROOT + 'index.html').bytes.toString('utf8');
  assert.ok(html.includes('id="ink637PreviewLabel"') && html.includes('noindex,nofollow,noarchive') &&
    html.includes(`name="ink-637-candidate-sha" content="${trusted.sourceSha}"`), 'QA637_BANNER_AND_IDENTITY');
  assert.ok(!/<link[^>]+rel=["']manifest["']/.test(html), 'QA637_PWA_MANIFEST');
  const sw = current.get(QA637_ROOT + 'service-worker-runtime.js').bytes.toString('utf8');
  assert.ok(sw.includes('INK637_PREVIEW_SW_NO_CACHE_V1') &&
    sw.includes("EXPECTED_PATH='/INK/qa/cloud-draw-637/'") &&
    sw.includes('navigationStrategy:\'network-only\''), 'QA637_SW_SCOPE');
  assert.ok(!/\bcaches\s*\.|\baddEventListener\s*\(\s*['"]fetch['"]/.test(sw), 'QA637_SW_CACHE_OR_INTERCEPT');

  const changed = new Set(computed);
  if (trusted.action === 'deploy') {
    assert.equal([...baseFiles.keys()].filter(p => p.startsWith(QA637_ROOT)).length, 0, 'QA637_ALREADY_PRESENT');
    assert.deepEqual([...changed].sort(), existing, 'QA637_ONLY_ADDITIONS');
  } else {
    assert.equal([...candidateFiles.keys()].filter(p => p.startsWith(QA637_ROOT)).length, 0, 'QA637_TEARDOWN_INCOMPLETE');
    assert.deepEqual([...changed].sort(), existing, 'QA637_ONLY_PINNED_REMOVAL');
  }
  return { status: 'QA637_INTEGRITY_PASS', action: trusted.action, files: manifest.fileCount,
    sourceSha: trusted.sourceSha, manifestSha256: trusted.manifestSha256,
    releaseAuthorized: false, oauthE2E: 'NOT_RUN' };
}


// #646 QA-only gate: trusted exact package hashes; never a product publish.
export const QA646_ROOT = 'qa/cloud-draw-646/';
const QA646_MANIFEST = QA646_ROOT + 'INK_CLOUD_DRAW_646_QA_MANIFEST.json';
export function qa646Only(changedPaths) {
  return changedPaths.length > 0 &&
    changedPaths.every(p => p.startsWith(QA646_ROOT) && qa637SafePath(p));
}
export function qa646Event(event, baseSha, headSha) {
  const pr = event.pull_request;
  assert.equal(event.repository?.full_name, 'thedoorw/INK', 'QA646_REPO');
  assert.equal(pr?.base?.repo?.full_name, 'thedoorw/INK', 'QA646_BASE_REPO');
  assert.equal(pr?.head?.repo?.full_name, 'thedoorw/INK', 'QA646_FORK');
  assert.equal(pr?.base?.ref, 'main', 'QA646_TARGET');
  assert.equal(pr.base.sha, baseSha, 'QA646_BASE_MOVED');
  assert.equal(pr.head.sha, headSha, 'QA646_HEAD_MOVED');
  assert.ok(pr.head.ref.startsWith('qa/cloud-draw-646-'), 'QA646_BRANCH_REQUIRED');
  assert.equal(pr.draft, false, 'QA646_DRAFT');
  assert.notEqual(event.action, 'closed', 'QA646_CLOSED');
}
export function verifyQa646({baseFiles, candidateFiles, changedPaths, trusted}) {
  assert.ok(baseFiles instanceof Map && candidateFiles instanceof Map, 'QA646_FILE_MAPS');
  assert.ok(hex(trusted?.sourceSha, 40) && hex(trusted?.sourceTree, 40) &&
    hex(trusted?.manifestSha256, 64) && /^src-[a-f0-9]{24}$/.test(trusted?.buildId || '') &&
    hex(trusted?.rendererPngSha256, 64), 'QA646_TRUSTED_PINS_REQUIRED');
  assert.equal(trusted.action, 'deploy', 'QA646_DEPLOY_ONLY');
  assert.ok(qa646Only(changedPaths), 'QA646_PATH_ONLY');
  const computed = [...new Set([...baseFiles.keys(), ...candidateFiles.keys()])]
    .filter(p => baseFiles.get(p)?.sha !== candidateFiles.get(p)?.sha).sort();
  assert.deepEqual([...changedPaths].sort(), computed, 'QA646_CHANGE_SET');
  const baseCount = [...baseFiles.keys()].filter(p => p.startsWith(QA646_ROOT)).length;
  assert.equal(baseCount, 0, 'QA646_ALREADY_PRESENT');
  const current = [...candidateFiles.keys()].filter(p => p.startsWith(QA646_ROOT)).sort();
  assert.ok(candidateFiles.has(QA646_MANIFEST), 'QA646_MANIFEST_MISSING');
  for (const p of current) {
    const f = candidateFiles.get(p);
    assert.ok(qa637SafePath(p) && !forbidden.test(p), 'QA646_UNSAFE_FILE');
    assert.equal(f.mode, '100644', 'QA646_REGULAR_FILE');
    assert.ok(Buffer.isBuffer(f.bytes), 'QA646_BYTES');
    assert.equal(blob(f.bytes), f.sha, 'QA646_BLOB:' + p);
  }
  const manifestBytes = candidateFiles.get(QA646_MANIFEST).bytes;
  assert.equal(hash(manifestBytes), trusted.manifestSha256, 'QA646_MANIFEST_PIN');
  const m = JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(m.schema, 'INK_CLOUD_DRAW_646_PRIVATE_QA_PACKAGE_V1', 'QA646_SCHEMA');
  assert.equal(m.sourceCommit, trusted.sourceSha, 'QA646_SOURCE_PIN');
  assert.equal(m.productSourceTree, trusted.sourceTree, 'QA646_SOURCE_TREE');
  assert.equal(m.buildId, trusted.buildId, 'QA646_BUILD_ID');
  assert.equal(m.rendererPngSha256, trusted.rendererPngSha256, 'QA646_RENDERER_PIN');
  assert.equal(m.mode, 'ISOLATED_PREPARED_NOT_DEPLOYED', 'QA646_PACKAGE_STATE');
  assert.equal(m.noOAuthCredentials, true, 'QA646_NO_CREDENTIALS');
  assert.equal(m.notForPublicProduction, true, 'QA646_QA_ONLY');
  assert.equal(m.realGoogleE2E, 'NOT_RUN', 'QA646_UNVERIFIED_OAUTH');
  assert.equal(m.sharedOriginStorageRisk, 'MUST_USE_FRESH_BROWSER_PROFILE', 'QA646_STORAGE_RISK');
  assert.equal(m.fileCount, 431, 'QA646_EXPECTED_FILE_COUNT');
  assert.ok(Array.isArray(m.files) && m.files.length === 431, 'QA646_INVENTORY');
  const inventory=[];
  for (const row of m.files) {
    assert.ok(qa637SafePath(row.path) && !forbidden.test(row.path), 'QA646_INVENTORY_PATH');
    assert.ok(Number.isSafeInteger(row.bytes) && row.bytes >= 0 && hex(row.sha256, 64),
      'QA646_INVENTORY_ROW');
    const p=QA646_ROOT + row.path, f=candidateFiles.get(p);
    assert.ok(f, 'QA646_FILE_MISSING:' + p);
    assert.equal(f.mode, '100644', 'QA646_NON_REGULAR:' + p);
    assert.equal(f.bytes.length, row.bytes, 'QA646_SIZE:' + p);
    assert.equal(hash(f.bytes), row.sha256, 'QA646_DIGEST:' + p);
    inventory.push(p);
  }
  assert.deepEqual(inventory, [...new Set(inventory)].sort((a,b)=>a.localeCompare(b)),
    'QA646_DUPLICATE_OR_UNSORTED');
  assert.deepEqual(current, [...inventory, QA646_MANIFEST].sort(),
    'QA646_UNLISTED_OR_MISSING');
  assert.deepEqual(computed, current, 'QA646_ONLY_ADDITIONS');
  for (const name of ['index.html', 'service-worker-runtime.js',
    'dist/startup/ink-boot.mjs', 'dist/startup/ink-shell.mjs',
    'src/document/drive-native-link-startup.mjs', 'src/recipe/import-coordinates.js'])
    assert.ok(inventory.includes(QA646_ROOT + name), 'QA646_REQUIRED:' + name);
  const html=candidateFiles.get(QA646_ROOT+'index.html').bytes.toString('utf8');
  assert.ok(html.includes('noindex,nofollow,noarchive') &&
    html.includes('INK #646') &&
    html.includes('name="ink-qa-private-source-sha" content="'+trusted.sourceSha+'"'),
    'QA646_BANNER_AND_IDENTITY');
  const sw=candidateFiles.get(QA646_ROOT+'service-worker-runtime.js').bytes.toString('utf8');
  assert.ok(sw.includes('const required="/INK/qa/cloud-draw-646/"') &&
    sw.includes('new URL(self.registration.scope).pathname!==required') &&
    sw.includes('INK646_SW_SCOPE_REFUSED'), 'QA646_SW_SCOPE');
  assert.ok(!/\bcaches\s*\.|\baddEventListener\s*\(\s*['"]fetch['"]/.test(sw),
    'QA646_SW_CACHE_OR_INTERCEPT');
  for (const [name,entry] of [['manifest.webmanifest','./index.html'],
    ['manifest-portable.webmanifest','./index-standalone.html']]) {
    const p=QA646_ROOT+name, f=candidateFiles.get(p);
    assert.ok(f, 'QA646_MANIFEST_RELATIVE_MISSING:' + name);
    const web=JSON.parse(f.bytes.toString('utf8'));
    assert.equal(web.start_url,entry,'QA646_MANIFEST_START_LOCAL');
    assert.equal(web.scope,'./','QA646_MANIFEST_SCOPE_LOCAL');
    assert.ok(Array.isArray(web.icons) && web.icons.every(x=>typeof x.src==='string' &&
      x.src.startsWith('./assets/') && qa637SafePath(x.src.slice(2))),
      'QA646_MANIFEST_ICONS_LOCAL');
  }
  return {status:'QA646_INTEGRITY_PASS',action:'deploy',files:m.fileCount,
    sourceSha:trusted.sourceSha,sourceTree:trusted.sourceTree,
    manifestSha256:trusted.manifestSha256,releaseAuthorized:false,oauthE2E:'NOT_RUN'};
}
