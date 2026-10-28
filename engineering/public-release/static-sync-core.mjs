// Shared trusted-base integrity checks. Never executes product code or grants QA/release authority.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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
export function makePlan({build,sourceFiles,base,cfg,qualification,authorityReference,action='publish'}){
  assert.ok(['publish','rollback'].includes(action),'ACTION');
  const buildId=validateBuild(build,sourceFiles,cfg),prior=validateBase(base,cfg);
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
export function verifyPlan({base,candidateFiles,cfg,changedPaths}){
  validateBase(base,cfg);checkFiles(candidateFiles);
  const m=parsed(candidateFiles,'release/STATIC_SYNC.json');
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
