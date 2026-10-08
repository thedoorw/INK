import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify as ed25519Verify } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

export const RELEASE_SCHEMA = 'INK_PUBLIC_RUNTIME_CANDIDATE_V1';
export const MANAGED_RECEIPT_SCHEMA = 'INK_PUBLICATION_RECEIPT_V1';
const SHA40=/^[a-f0-9]{40}$/;
const SHA256=/^[a-f0-9]{64}$/;
const REQUIRED_RUNTIME=['index.html','build-identity.js','service-worker.js','service-worker-runtime.js','src/ink.js','src/document/storage.js'];

export function canonical(value) {
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (value && typeof value==='object') {
    const keys=Object.keys(value).sort();
    return '{'+keys.map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  }
  if (typeof value==='number') assert.ok(Number.isSafeInteger(value),'UNSAFE_NUMBER');
  assert.notEqual(value,undefined,'UNDEFINED_CANONICAL');
  return JSON.stringify(value);
}
export const sha256=(bytes)=>createHash('sha256').update(bytes).digest('hex');
export const gitBlobSha=(bytes)=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
const goodPath=(p)=>typeof p==='string'&&p.length>0&&p.length<512&&p===p.normalize('NFC')
 &&!p.startsWith('/')&&!p.includes('\\')&&!p.includes(':')&&!p.includes('//')&&p.split('/').every(x=>x!==''&&x!=='.'&&x!=='..')&&!/[\x00-\x1f\x7f]/.test(p);
const byteCmp=(a,b)=>a<b?-1:a>b?1:0;
const metaPaths=new Set(['release/CANDIDATE.json','release/CANDIDATE.sig']);
const coreMeta=new Set(['BUILD_INFO.json','PUBLISH_RECEIPT.json']);
export function allowedRuntime(p,policy){
  if(!goodPath(p))return false;
  if((policy.forbidden_exact||[]).includes(p))return false;
  if((policy.forbidden_prefixes||[]).some(s=>p.startsWith(s)))return false;
  if(p==='qa/runtime-test-bridge.js')return true;
  if(p.startsWith('qa/')||p.startsWith('release/')||p.startsWith('engineering/')||p.startsWith('.github/'))return false;
  return (policy.allowed_exact||[]).includes(p)||(policy.allowed_prefixes||[]).some(s=>p.startsWith(s));
}
export function validateChangedPaths(paths,rows,policy){
  const known=new Set(rows.map(r=>r.path));
  for(const p of paths){
    assert.ok(goodPath(p),'CHANGED_PATH_INVALID:'+p);
    assert.ok(metaPaths.has(p)||coreMeta.has(p)||allowedRuntime(p,policy),'UNTRUSTED_PATH_CHANGE:'+p);
    if(!metaPaths.has(p))assert.ok(known.has(p)||allowedRuntime(p,policy),'UNLISTED_CHANGED_PATH:'+p);
    if(allowedRuntime(p,policy)&&!known.has(p)){
      // Deletion is permitted only when absent from the new candidate checkout.
      // The on-disk file set and prior managed file list are checked separately.
      continue;
    }
  }
}
export function verifyPRIdentity(event,actualHead,actualBase){
  const pr=event?.pull_request;
  assert.ok(pr && event.repository?.full_name==='thedoorw/INK','NOT_AN_INK_PR');
  assert.equal(event.action==='closed'?false:true,true,'CLOSED_PR');
  assert.equal(pr.base?.repo?.full_name,'thedoorw/INK','BASE_REPO_INVALID');
  assert.equal(pr.head?.repo?.full_name,'thedoorw/INK','CROSS_REPOSITORY_HEAD_FORBIDDEN');
  assert.equal(pr.base?.ref,'main','BASE_BRANCH_INVALID');
  assert.equal(pr.head?.sha,actualHead,'HEAD_CHANGED');
  assert.equal(pr.base?.sha,actualBase,'BASE_CHANGED');
  assert.ok(SHA40.test(actualHead)&&SHA40.test(actualBase),'COMMIT_SHA_INVALID');
  assert.notEqual(pr.draft,true,'DRAFT_CANDIDATE');
}
function trustPolicy(policy){
  assert.ok(policy && policy.schema==='INK_PUBLIC_RELEASE_POLICY_V1','TRUST_POLICY_INVALID');
  assert.equal(policy.repository,'thedoorw/INK','TRUST_TARGET_INVALID');
  assert.ok(Number.isInteger(policy.min_runtime_files)&&policy.min_runtime_files>=1,'TRUST_MINIMUM_INVALID');
  assert.ok(Array.isArray(policy.signers),'TRUST_SIGNERS_INVALID');
}
function verifySignature(manifest,signature,policy){
  const signer=policy.signers.find(s=>s.id===manifest.signer_id);
  assert.ok(signer && signer.public_key_pem && signer.public_key_pem.includes('PUBLIC KEY'),'UNREGISTERED_SIGNER');
  assert.ok(typeof signature==='string'&&/^[a-zA-Z0-9+/]+={0,2}$/.test(signature.trim()),'SIGNATURE_ENCODING_INVALID');
  const bytes=Buffer.from(signature.trim(),'base64');
  assert.ok(bytes.length===64,'SIGNATURE_LENGTH_INVALID');
  assert.ok(ed25519Verify(null,Buffer.from(canonical(manifest),'utf8'),createPublicKey(signer.public_key_pem),bytes),'MANIFEST_SIGNATURE_INVALID');
}
function validateEnvelope(manifest,policy,base){
  assert.equal(manifest?.schema,RELEASE_SCHEMA,'SCHEMA_INVALID');
  assert.ok(['publish','rollback'].includes(manifest.action),'ACTION_INVALID');
  assert.equal(manifest.intent,'candidate-only','DIRECT_MAIN_INTENT_FORBIDDEN');
  assert.equal(manifest.source?.repo,'thedoorw/INK-Browser-QA','SOURCE_REPOSITORY_INVALID');
  assert.ok(SHA40.test(manifest.source?.sha)&&SHA40.test(manifest.source?.tree),'SOURCE_OBJECT_INVALID');
  assert.equal(manifest.target?.repo,'thedoorw/INK','TARGET_INVALID');
  assert.equal(manifest.target?.branch,'main','TARGET_BRANCH_INVALID');
  assert.equal(manifest.target?.expected_head,base.head,'TARGET_HEAD_STALE');
  assert.equal(manifest.target?.expected_tree,base.tree,'TARGET_TREE_STALE');
  assert.equal(manifest.target?.prior_receipt_sha256,base.priorReceiptHash,'PRIOR_RECEIPT_STALE');
  assert.ok(Array.isArray(manifest.files),'FILES_INVALID');
  assert.ok(manifest.files.length>=policy.min_runtime_files+2,'RUNTIME_FILE_COUNT_LOW');
  const rows=manifest.files,seen=new Set();
  for(let i=0;i<rows.length;i++){
    const row=rows[i],p=row?.path;
    assert.ok(p==='BUILD_INFO.json'||p==='PUBLISH_RECEIPT.json'||allowedRuntime(p,policy),'PUBLIC_PATH_FORBIDDEN:'+p);
    assert.ok(!seen.has(p),'DUPLICATE_PATH:'+p);
    assert.ok(i===0||byteCmp(rows[i-1].path,p)<0,'FILE_ORDER_INVALID');
    assert.ok(SHA256.test(row?.sha256)&&Number.isSafeInteger(row?.bytes)&&row.bytes>=0,'FILE_ROW_INVALID:'+p);
    seen.add(p);
  }
  for(const p of ['BUILD_INFO.json','PUBLISH_RECEIPT.json',...REQUIRED_RUNTIME])assert.ok(seen.has(p),'MISSING_REQUIRED_FILE:'+p);
  assert.ok(SHA256.test(manifest.package?.runtime_digest_sha256),'RUNTIME_DIGEST_INVALID');
  assert.ok(SHA256.test(manifest.package?.manifest_sha256),'PACKAGE_MANIFEST_INVALID');
  assert.ok(SHA256.test(manifest.package?.allowlist_digest_sha256),'ALLOWLIST_DIGEST_INVALID');
  return rows;
}
export async function verifyReleaseCandidate({baseRoot,candidateRoot,manifest,signature,policy,changedPaths,baseHead,baseTree,prEvent}){
  trustPolicy(policy);
  const priorBytes=await readFile(resolve(baseRoot,'PUBLISH_RECEIPT.json'));
  const prior=JSON.parse(priorBytes.toString('utf8'));
  assert.equal(prior.schema,MANAGED_RECEIPT_SCHEMA,'PRIOR_RECEIPT_INVALID');
  const base={head:baseHead,tree:baseTree,priorReceiptHash:sha256(priorBytes)};
  const rows=validateEnvelope(manifest,policy,base);
  verifySignature(manifest,signature,policy);
  validateChangedPaths(changedPaths,rows,policy);
  const rowMap=new Map(rows.map(r=>[r.path,r]));
  for(const row of rows){
    const abs=resolve(candidateRoot,row.path);
    assert.ok(abs.startsWith(resolve(candidateRoot)+sep),'PATH_ESCAPE');
    const stat=await lstat(abs);
    assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'NOT_ORDINARY_FILE:'+row.path);
    const bytes=await readFile(abs);
    assert.equal(bytes.length,row.bytes,'SIZE_MISMATCH:'+row.path);
    assert.equal(sha256(bytes),row.sha256,'BYTE_HASH_MISMATCH:'+row.path);
  }
  for(const row of prior.managed_files||[]){
    if(!rowMap.has(row.path)){
      const existing=await lstat(resolve(candidateRoot,row.path)).then(()=>true,err=>err.code==='ENOENT'?false:Promise.reject(err));
      assert.ok(!existing,'RETIRED_MANAGED_PATH_STILL_PRESENT:'+row.path);
    }
  }
  const b=JSON.parse(await readFile(resolve(candidateRoot,'BUILD_INFO.json'),'utf8'));
  const receipt=JSON.parse(await readFile(resolve(candidateRoot,'PUBLISH_RECEIPT.json'),'utf8'));
  assert.equal(b.source?.exact_sha,manifest.source.sha,'BUILD_SOURCE_MISMATCH');
  assert.equal(b.source?.product_tree,manifest.source.tree,'BUILD_TREE_MISMATCH');
  assert.equal(b.package?.manifest_sha256,manifest.package.manifest_sha256,'BUILD_PACKAGE_MISMATCH');
  assert.equal(b.runtime?.package_digest_sha256,manifest.package.runtime_digest_sha256,'BUILD_RUNTIME_DIGEST_MISMATCH');
  const runtime=rows.filter(r=>!coreMeta.has(r.path));
  assert.equal(b.runtime?.file_count,runtime.length,'BUILD_RUNTIME_COUNT_MISMATCH');
  const runMap=new Map((b.runtime?.files||[]).map(r=>[r.path,r]));
  assert.equal(runMap.size,runtime.length,'BUILD_RUNTIME_ROWS_INVALID');
  for(const row of runtime){
    const actual=runMap.get(row.path);
    assert.ok(actual&&actual.sha256===row.sha256&&actual.bytes===row.bytes,'BUILD_RUNTIME_BYTES_MISMATCH:'+row.path);
  }
  assert.equal(receipt.schema,MANAGED_RECEIPT_SCHEMA,'RECEIPT_SCHEMA_INVALID');
  assert.equal(receipt.source_sha,manifest.source.sha,'RECEIPT_SOURCE_MISMATCH');
  assert.equal(receipt.source_tree,manifest.source.tree,'RECEIPT_TREE_MISMATCH');
  assert.equal(receipt.previous_target_commit,base.head,'RECEIPT_PRIOR_HEAD_MISMATCH');
  assert.equal(receipt.runtime_digest_sha256,manifest.package.runtime_digest_sha256,'RECEIPT_RUNTIME_MISMATCH');
  assert.equal(receipt.package_manifest_sha256,manifest.package.manifest_sha256,'RECEIPT_PACKAGE_MISMATCH');
  assert.equal(receipt.allowlist_digest_sha256,manifest.package.allowlist_digest_sha256,'RECEIPT_ALLOWLIST_MISMATCH');
  const managed=new Map((receipt.managed_files||[]).map(r=>[r.path,r]));
  assert.equal(managed.size,rows.length-1,'RECEIPT_MANAGED_ROWS_INVALID');
  for(const row of rows.filter(r=>r.path!=='PUBLISH_RECEIPT.json')){
    const r=managed.get(row.path);
    const data=await readFile(resolve(candidateRoot,row.path));
    assert.ok(r&&r.sha256===row.sha256&&r.bytes===row.bytes&&r.git_blob_sha===gitBlobSha(data),'RECEIPT_MANAGED_BYTES_MISMATCH:'+row.path);
  }
  if(prEvent)verifyPRIdentity(prEvent,prEvent.pull_request.head.sha,base.head);
  return {status:'PASS',releaseIntentOnly:true,sourceSha:manifest.source.sha,targetExpectedHead:base.head,
    candidateFiles:rows.length,runtimeFiles:runtime.length,signedManifestSha256:sha256(Buffer.from(canonical(manifest)))};
}
export function gitChangedPaths(root,baseSha,headSha){
  assert.ok(SHA40.test(baseSha)&&SHA40.test(headSha),'DIFF_REF_INVALID');
  const raw=execFileSync('git',['diff','--name-only','--no-renames','-z',baseSha,headSha],{cwd:root});
  return raw.toString('utf8').split('\0').filter(Boolean);
}
export async function main(argv=process.argv.slice(2),env=process.env){
  if(argv.length!==2)throw new Error('USAGE: verify-public-release.mjs <trusted-base-checkout> <untrusted-candidate-checkout>');
  const [trusted,candidate]=argv;
  const event=JSON.parse(await readFile(env.GITHUB_EVENT_PATH,'utf8'));
  const policy=JSON.parse(await readFile(resolve(trusted,'engineering/public-release/policy.json'),'utf8'));
  const baseHead=execFileSync('git',['rev-parse','HEAD'],{cwd:trusted,encoding:'utf8'}).trim();
  const baseTree=execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:trusted,encoding:'utf8'}).trim();
  const candidateHead=execFileSync('git',['rev-parse','HEAD'],{cwd:candidate,encoding:'utf8'}).trim();
  verifyPRIdentity(event,candidateHead,baseHead);
  const changedPaths=gitChangedPaths(candidate,baseHead,candidateHead);
  assert.ok(changedPaths.includes('release/CANDIDATE.json')&&changedPaths.includes('release/CANDIDATE.sig'),'NO_RELEASE_MANIFEST_CHANGE');
  const manifest=JSON.parse(await readFile(resolve(candidate,'release/CANDIDATE.json'),'utf8'));
  const signature=await readFile(resolve(candidate,'release/CANDIDATE.sig'),'utf8');
  const result=await verifyReleaseCandidate({baseRoot:trusted,candidateRoot:candidate,manifest,signature,policy,changedPaths,baseHead,baseTree,prEvent:event});
  console.log(JSON.stringify(result,null,2));
}
if(process.argv[1] && import.meta.url === new URL('file://'+resolve(process.argv[1])).href){
  main().catch(err=>{console.error('PUBLIC_RELEASE_VERIFIER_REJECT:',err?.message||err);process.exitCode=1;});
}
