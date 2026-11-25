import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {planUiPreviewCandidate} from './preview-candidate.mjs';

const paths=['src/ui/ink017/markup.html','src/ui/ink017/menu-ui.js',
  'src/ui/ink017/tokens.css'];
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'ink703-preview-candidate-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  git(root,'init','-q');git(root,'config','user.email','qa@invalid.test');
  git(root,'config','user.name','INK703 Test');
  for(const path of paths){
    await mkdir(dirname(join(root,path)),{recursive:true});
    await writeFile(join(root,path),path+' baseline\n');
  }
  await mkdir(join(root,'src/core'),{recursive:true});
  await writeFile(join(root,'src/core/engine.js'),'core baseline\n');
  git(root,'add','.');git(root,'commit','-qm','base');
  const base=git(root,'rev-parse','HEAD');
  await writeFile(join(root,paths[1]),'menu approved\n');
  git(root,'add','.');git(root,'commit','-qm','menu');
  const head=git(root,'rev-parse','HEAD');
  const sourceBlobs=Object.fromEntries(paths.map(path=>
    [path,git(root,'rev-parse',`${head}:${path}`)]));
  return {root,base,head,previewEvidence:{mode:'MOCK_NO_CORE',candidateSha:head,sourceBlobs}};
}

test('binds exact Public UI Git blobs to a mock preview plan',async t=>{
  const f=await fixture(t),result=planUiPreviewCandidate(f);
  assert.deepEqual(result.changedPaths,[paths[1]]);
  assert.equal(result.trustedQa,false);
  assert.equal(result.releaseAuthorized,false);
});
test('rejects a different preview source blob',async t=>{
  const f=await fixture(t);f.previewEvidence.sourceBlobs[paths[1]]='a'.repeat(40);
  assert.throws(()=>planUiPreviewCandidate(f),/PREVIEW_BLOB_DRIFT/);
});
test('rejects a preview wired to Core',async t=>{
  const f=await fixture(t);f.previewEvidence.mode='REAL_CORE';
  assert.throws(()=>planUiPreviewCandidate(f),/PREVIEW_MUST_MOCK_CORE/);
});
test('rejects hidden Core changes in the complete Git diff',async t=>{
  const f=await fixture(t);
  await writeFile(join(f.root,'src/core/engine.js'),'unsafe core change\n');
  git(f.root,'add','.');git(f.root,'commit','-qm','hidden-core');
  f.head=git(f.root,'rev-parse','HEAD');f.previewEvidence.candidateSha=f.head;
  assert.throws(()=>planUiPreviewCandidate(f),/PROTECTED_PATH/);
});
test('rejects a stale preview candidate SHA',async t=>{
  const f=await fixture(t);f.previewEvidence.candidateSha=f.base;
  assert.throws(()=>planUiPreviewCandidate(f),/PREVIEW_HEAD_DRIFT/);
});
test('rejects a symlinked untouched UI source despite matching tree SHA',async t=>{
  const f=await fixture(t),path=paths[0];
  await rm(join(f.root,path));
  await symlink('menu-ui.js',join(f.root,path));
  git(f.root,'add','.');git(f.root,'commit','-qm','symlink-preview-source');
  const symlinkHead=git(f.root,'rev-parse','HEAD');
  // Compare two revisions which only change the menu, but already contain
  // the bad symlink. The complete diff alone cannot detect unchanged nodes.
  await writeFile(join(f.root,paths[1]),'menu next\n');
  git(f.root,'add','.');git(f.root,'commit','-qm','menu next');
  f.base=symlinkHead;f.head=git(f.root,'rev-parse','HEAD');
  f.previewEvidence.candidateSha=f.head;
  f.previewEvidence.sourceBlobs=Object.fromEntries(paths.map(p=>
    [p,git(f.root,'rev-parse',`${f.head}:${p}`)]));
  assert.throws(()=>planUiPreviewCandidate(f),/UI_UNSAFE_MODE/);
});
test('rejects executable mode on an untouched UI source',async t=>{
  const f=await fixture(t),path=paths[2];
  await chmod(join(f.root,path),0o755);
  git(f.root,'add','.');git(f.root,'commit','-qm','executable-ui');
  const badBase=git(f.root,'rev-parse','HEAD');
  await writeFile(join(f.root,paths[1]),'menu next\n');
  git(f.root,'add','.');git(f.root,'commit','-qm','menu next');
  f.base=badBase;f.head=git(f.root,'rev-parse','HEAD');
  f.previewEvidence.candidateSha=f.head;
  f.previewEvidence.sourceBlobs=Object.fromEntries(paths.map(p=>
    [p,git(f.root,'rev-parse',`${f.head}:${p}`)]));
  assert.throws(()=>planUiPreviewCandidate(f),/UI_UNSAFE_MODE/);
});
