import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { canonical, sha256, gitBlobSha, validateChangedPaths, verifyPRIdentity, verifyReleaseCandidate, allowedRuntime } from './verify-public-release.mjs';

const hex=(x,n)=>x.repeat(n);
const source={repo:'thedoorw/INK-Browser-QA',sha:hex('a',40),tree:hex('e',40)};
const oldHead=hex('b',40),oldTree=hex('c',40);
const packageId={runtime_digest_sha256:hex('1',64),manifest_sha256:hex('2',64),allowlist_digest_sha256:hex('3',64)};
const filenames=['index.html','build-identity.js','service-worker.js','service-worker-runtime.js','src/ink.js','src/document/storage.js'];
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const pub=publicKey.export({format:'pem',type:'spki'});
const policy={schema:'INK_PUBLIC_RELEASE_POLICY_V1',repository:'thedoorw/INK',min_runtime_files:6,
  signers:[{id:'test-key',public_key_pem:pub}],allowed_exact:['index.html','build-identity.js','service-worker.js','service-worker-runtime.js'],
  allowed_prefixes:['src/'],forbidden_prefixes:['working/','research/','.github/','engineering/','release/','qa/']};
const byBytes=(a,b)=>a<b?-1:a>b?1:0;
const row=(p,bytes)=>({path:p,sha256:sha256(bytes),bytes:bytes.length});
const signManifest=(m)=>sign(null,Buffer.from(canonical(m)),privateKey).toString('base64')+'\n';
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'ink-public-gate-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const baseRoot=join(root,'base'),candidateRoot=join(root,'candidate');
 await mkdir(baseRoot);await mkdir(candidateRoot);
 const prior={schema:'INK_PUBLICATION_RECEIPT_V1',managed_files:[]};
 const priorBytes=Buffer.from(JSON.stringify(prior)+'\n');
 await writeFile(join(baseRoot,'PUBLISH_RECEIPT.json'),priorBytes);
 for(const path of filenames){
  const abs=join(candidateRoot,path);
  await mkdir(dirname(abs),{recursive:true});
  await writeFile(abs,Buffer.from('public runtime file '+path));
 }
 const sourceRows=[];
 for(const path of filenames){const bytes=await readFile(join(candidateRoot,path));sourceRows.push(row(path,bytes));}
 const build={source:{exact_sha:source.sha,product_tree:source.tree},
    package:{manifest_sha256:packageId.manifest_sha256},
    runtime:{file_count:filenames.length,files:sourceRows,package_digest_sha256:packageId.runtime_digest_sha256}};
 const buildBytes=Buffer.from(JSON.stringify(build)+'\n');
 await writeFile(join(candidateRoot,'BUILD_INFO.json'),buildBytes);
 const managed=sourceRows.map(r=>({...r,git_blob_sha:''}));
 managed.push(row('BUILD_INFO.json',buildBytes));
 for(const r of managed){r.git_blob_sha=gitBlobSha(await readFile(join(candidateRoot,r.path)));}
 const receipt={schema:'INK_PUBLICATION_RECEIPT_V1',source_sha:source.sha,source_tree:source.tree,
   previous_target_commit:oldHead,runtime_digest_sha256:packageId.runtime_digest_sha256,
   package_manifest_sha256:packageId.manifest_sha256,allowlist_digest_sha256:packageId.allowlist_digest_sha256,
   managed_files:managed};
 await writeFile(join(candidateRoot,'PUBLISH_RECEIPT.json'),JSON.stringify(receipt)+'\n');
 const paths=[...filenames,'BUILD_INFO.json','PUBLISH_RECEIPT.json'].sort(byBytes);
 const rows=[];
 for(const p of paths)rows.push(row(p,await readFile(join(candidateRoot,p))));
 const manifest={schema:'INK_PUBLIC_RUNTIME_CANDIDATE_V1',action:'publish',intent:'candidate-only',signer_id:'test-key',
   source,target:{repo:'thedoorw/INK',branch:'main',expected_head:oldHead,expected_tree:oldTree,prior_receipt_sha256:sha256(priorBytes)},
   package:{...packageId},files:rows};
 const args={baseRoot,candidateRoot,manifest,signature:signManifest(manifest),policy,
  changedPaths:['index.html','release/CANDIDATE.json','release/CANDIDATE.sig'],baseHead:oldHead,baseTree:oldTree};
 return {root,baseRoot,candidateRoot,manifest,args};
}
test('P01: signed and fully consistent public candidate is accepted as verification-only',async t=>{
 const f=await fixture(t);
 const result=await verifyReleaseCandidate(f.args);
 assert.equal(result.status,'PASS');
 assert.equal(result.runtimeFiles,6);
 assert.equal(result.candidateFiles,8);
 assert.equal(result.releaseIntentOnly,true);
});
test('N01: unsigned/altered candidate bytes fail closed',async t=>{
 const f=await fixture(t);
 await writeFile(join(f.candidateRoot,'index.html'),'evil');
 await assert.rejects(()=>verifyReleaseCandidate(f.args),/BYTE_HASH_MISMATCH|SIZE_MISMATCH/);
});
test('N02: altered signed manifest without private signer fails closed',async t=>{
 const f=await fixture(t);
 const altered={...f.manifest,source:{...source,sha:hex('9',40)}};
 await assert.rejects(()=>verifyReleaseCandidate({...f.args,manifest:altered}),/MANIFEST_SIGNATURE_INVALID/);
});
test('N03: unknown trusted signer rejects candidate even if signed',async t=>{
 const f=await fixture(t);
 await assert.rejects(()=>verifyReleaseCandidate({...f.args,policy:{...policy,signers:[]}}),/UNREGISTERED_SIGNER/);
});
test('N04: public target expected HEAD, tree, prior receipt are independent fail-closed gates',async t=>{
 const f=await fixture(t);
 for(const [key,value,error] of [
  ['baseHead',hex('8',40),/TARGET_HEAD_STALE/],
  ['baseTree',hex('8',40),/TARGET_TREE_STALE/]
 ]){await assert.rejects(()=>verifyReleaseCandidate({...f.args,[key]:value}),error);}
 const changed={...f.manifest,target:{...f.manifest.target,prior_receipt_sha256:hex('9',64)}};
 await assert.rejects(()=>verifyReleaseCandidate({...f.args,manifest:changed,signature:signManifest(changed)}),/PRIOR_RECEIPT_STALE/);
});
test('N05: metadata and source-only tree mutations never count as published candidate',async t=>{
 const f=await fixture(t);
 for(const path of ['.github/workflows/verify.yml','engineering/public-release/policy.json','working/private.txt','research/reports.md','README.md']){
  assert.throws(()=>validateChangedPaths([...f.args.changedPaths,path],f.manifest.files,policy),/UNTRUSTED_PATH_CHANGE/);
 }
});
test('N06: unknown added JS path cannot be omitted from signed manifest',async t=>{
 const f=await fixture(t);
 assert.throws(()=>validateChangedPaths([...f.args.changedPaths,'src/injected.js'],f.manifest.files,policy,[]),/UNLISTED_CHANGED_RUNTIME_PATH/);
});
test('N07: malformed traversal, absolute, slash and secret QA paths are not runtime',()=>{
 for(const p of ['../admin','src/../private','/etc/passwd','src\\file.js','qa/internal.json','release/CANDIDATE.json']){
  assert.equal(allowedRuntime(p,policy),false,p);
 }
});
test('N08: symlink instead of runtime file fails',async t=>{
 const f=await fixture(t);
 await rm(join(f.candidateRoot,'src/ink.js'));
 await symlink(join(f.candidateRoot,'index.html'),join(f.candidateRoot,'src/ink.js'));
 await assert.rejects(()=>verifyReleaseCandidate(f.args),/SYMLINK_OR_SPECIAL_PATH/);
});
test('N09: forged receipt rows cannot be signed into acceptance',async t=>{
 const f=await fixture(t);
 const name='PUBLISH_RECEIPT.json',p=join(f.candidateRoot,name);
 const r=JSON.parse(await readFile(p,'utf8'));
 r.managed_files[0].sha256=hex('5',64);
 await writeFile(p,JSON.stringify(r)+'\n');
 const rows=[];
 for(const row0 of f.manifest.files){
  const bytes=await readFile(join(f.candidateRoot,row0.path));
  rows.push(row(row0.path,bytes));
 }
 const altered={...f.manifest,files:rows};
 await assert.rejects(()=>verifyReleaseCandidate({...f.args,manifest:altered,signature:signManifest(altered)}),/RECEIPT_MANAGED_BYTES_MISMATCH/);
});
test('N10: remote forked candidate, wrong base and draft release are refused',()=>{
 const event={action:'opened',repository:{full_name:'thedoorw/INK'},
  pull_request:{base:{ref:'main',sha:oldHead,repo:{full_name:'thedoorw/INK'}},
   head:{sha:hex('f',40),repo:{full_name:'thedoorw/INK'}},draft:false}};
 assert.doesNotThrow(()=>verifyPRIdentity(event,hex('f',40),oldHead));
 assert.throws(()=>verifyPRIdentity({...event,pull_request:{...event.pull_request,head:{...event.pull_request.head,repo:{full_name:'attacker/fork'}}}},hex('f',40),oldHead),/CROSS_REPOSITORY_HEAD_FORBIDDEN/);
 assert.throws(()=>verifyPRIdentity({...event,pull_request:{...event.pull_request,draft:true}},hex('f',40),oldHead),/DRAFT_CANDIDATE/);
 assert.throws(()=>verifyPRIdentity(event,hex('a',40),oldHead),/HEAD_CHANGED/);
});
test('N11: mismatching BUILD_INFO runtime record rejects even a newly signed envelope',async t=>{
 const f=await fixture(t);
 const path='BUILD_INFO.json';
 const build=JSON.parse(await readFile(join(f.candidateRoot,path),'utf8'));
 build.runtime.file_count=99;
 await writeFile(join(f.candidateRoot,path),JSON.stringify(build)+'\n');
 const receipt=JSON.parse(await readFile(join(f.candidateRoot,'PUBLISH_RECEIPT.json'),'utf8'));
 const latest=await readFile(join(f.candidateRoot,path));
 const record=receipt.managed_files.find(x=>x.path===path);
 record.sha256=sha256(latest);record.bytes=latest.length;record.git_blob_sha=gitBlobSha(latest);
 await writeFile(join(f.candidateRoot,'PUBLISH_RECEIPT.json'),JSON.stringify(receipt)+'\n');
 const rows=[];
 for(const r of f.manifest.files) rows.push(row(r.path,await readFile(join(f.candidateRoot,r.path))));
 const altered={...f.manifest,files:rows};
 await assert.rejects(()=>verifyReleaseCandidate({...f.args,manifest:altered,signature:signManifest(altered)}),/BUILD_RUNTIME_COUNT_MISMATCH/);
});
