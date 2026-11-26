import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPath, verifyUiOnly, inspectGitDiff, verifyCoreMirror, verifyMenuHostContract} from './ownership.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const sha=c=>c.repeat(40);
const one=(path='src/ui/ink017/menu-ui.js')=>({path,oldMode:'100644',newMode:'100644',oldSha:sha('a'),newSha:sha('b')});
const check=(changes=[one()],files=changes.map(x=>x.path))=>verifyUiOnly({base:sha('1'),head:sha('2'),changes,files});
test('menu contract admits the restricted menuApi but rejects legacy Core object reach-through',()=>{
  const valid="export function mountMenuUi({menu,logo,host,invoke,signal}){return host.menuApi.selectedRasterInfo();}\n";
  assert.equal(verifyMenuHostContract(valid).status,'MENU_RESTRICTED_HOST_CONTRACT_PASS');
  assert.throws(()=>verifyMenuHostContract(valid.replace('host.menuApi.selectedRasterInfo()', 'host.provider.image.selectedInfo()')),/MENU_HOST_API_REQUIRED|MENU_LEGACY_CORE_ACCESS/);
  assert.throws(()=>verifyMenuHostContract(valid+'host.app.history()'),/MENU_LEGACY_CORE_ACCESS/);
  assert.throws(()=>verifyMenuHostContract(valid+'host["provider"]'),/MENU_LEGACY_CORE_ACCESS/);
  assert.throws(()=>verifyMenuHostContract(valid+'host[unknown]'),/MENU_DYNAMIC_HOST_ACCESS/);
  assert.throws(()=>verifyMenuHostContract('export function notMenu(){return host.menuApi.snapState()}'),/MENU_EXPORT_CONTRACT/);
  assert.throws(()=>verifyMenuHostContract(valid+'\0'),/MENU_SOURCE_INVALID/);
});
test('one actual UI source path is admitted, without publication permission',()=>{
  assert.deepEqual(check().changedPaths,['src/ui/ink017/menu-ui.js']);
  assert.equal(check().releaseAuthorized,false);
});
test('other UI files admitted independently',()=>{
  assert.equal(classifyPath('src/ui/ink017/markup.html'),'public-ui');
  assert.equal(classifyPath('src/ui/ink017/tokens.css'),'public-ui');
});
test('core, runtime closure, metadata, workflow and previews cannot ride along',()=>{
  for(const p of ['src/core/geometry.js','dist/startup/ink-shell.mjs','BUILD_INFO.json','PUBLISH_RECEIPT.json','build-identity.js','service-worker-runtime.js','index.html','.github/workflows/ink-public-release-gate-001.yml','preview/ui-satellite-703/index.html'])
    assert.throws(()=>check([one(p)]),/PROTECTED_PATH/);
});
test('path traversal, slash tricks and repeated entries fail closed',()=>{
  for(const p of ['../src/ui/ink017/menu-ui.js','src/ui/ink017/../menu-ui.js','src\\ui\\ink017\\menu-ui.js','/src/ui/ink017/menu-ui.js'])assert.throws(()=>check([one(p)]),/UNSAFE_PATH/);
  assert.throws(()=>check([one(),one()]),/DUPLICATE_PATH/);
});
test('modes, source identity and complete diff required',()=>{
  assert.throws(()=>check([{...one(),newMode:'120000'}]),/NEW_MODE/);
  assert.throws(()=>check([{...one(),newSha:sha('a')}]),/UNCHANGED_BLOB/);
  assert.throws(()=>check([one()],[]),/INCOMPLETE_DIFF/);
  assert.throws(()=>check([one()],['src/ui/ink017/tokens.css']),/DIFF_PATH_MISMATCH/);
  assert.throws(()=>verifyUiOnly({base:'main',head:sha('2'),changes:[one()],files:['src/ui/ink017/menu-ui.js']}),/BASE_SHA/);
});
test('trusted complete Git diff succeeds for UI edit, fails on hidden Core edit',()=>{
  const dir=mkdtempSync(join(tmpdir(),'ink703-'));
  const git=(...args)=>execFileSync('git',['-C',dir,...args],{encoding:'utf8'}).trim();
  const write=(p,content)=>{mkdirSync(join(dir,p.split('/').slice(0,-1).join('/')),{recursive:true});writeFileSync(join(dir,p),content);};
  try {
    git('init');git('config','user.name','INK Test');git('config','user.email','ink-test@example.invalid');
    write('src/ui/ink017/menu-ui.js',"export function mountMenuUi({menu,logo,host,invoke,signal}){return host.menuApi.selectedRasterInfo();}\n");write('src/core/geometry.js','core');
    git('add','.');git('commit','-m','base');const base=git('rev-parse','HEAD');
    write('src/ui/ink017/menu-ui.js',"export function mountMenuUi({menu,logo,host,invoke,signal}){return host.menuApi.selectedRasterInfo();}\n// updated menu label\n");git('add','.');git('commit','-m','ui');const ui=git('rev-parse','HEAD');
    assert.equal(inspectGitDiff(dir,base,ui).status,'UI_ONLY_SCOPE_PASS');
    write('src/ui/ink017/menu-ui.js',"export function mountMenuUi({menu,logo,host,invoke,signal}){return host.provider.image.selectedInfo()}\n");
    git('add','.');git('commit','-m','legacy menu rejected');
    assert.throws(()=>inspectGitDiff(dir,base,git('rev-parse','HEAD')),/MENU_HOST_API_REQUIRED|MENU_LEGACY_CORE_ACCESS/);
    write('src/core/geometry.js','tamper');git('add','.');git('commit','-m','hidden core');
    assert.throws(()=>inspectGitDiff(dir,base,git('rev-parse','HEAD')),/PROTECTED_PATH/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('Core overlay preserves exact Public UI, and rejects overwrite, deletion or hidden diff',()=>{
  const blob=(s,mode='100644')=>({sha:sha(s),mode});
  const base=new Map([['src/ui/ink017/menu-ui.js',blob('a')],['src/ui/ink017/tokens.css',blob('b')],['src/core/geometry.js',blob('c')]]);
  const candidate=new Map(base);candidate.set('src/core/geometry.js',blob('d'));
  const verify=(c,paths=['src/core/geometry.js'])=>verifyCoreMirror({publicBase:base,publicCandidate:c,coreChangedPaths:paths});
  assert.equal(verify(candidate).status,'CORE_SYNC_PRESERVES_PUBLIC_UI');
  const overwrite=new Map(candidate);overwrite.set('src/ui/ink017/menu-ui.js',blob('e'));
  assert.throws(()=>verify(overwrite),/PUBLIC_UI_OVERWRITE/);
  const deleted=new Map(candidate);deleted.delete('src/ui/ink017/tokens.css');
  assert.throws(()=>verify(deleted),/PUBLIC_UI_REMOVED/);
  const symlink=new Map(candidate);symlink.set('src/ui/ink017/menu-ui.js',blob('a','120000'));
  assert.throws(()=>verify(symlink),/PUBLIC_UI_CANDIDATE_MODE/);
  assert.throws(()=>verify(candidate,['src/core/geometry.js','src/core/history.js']),/CORE_FULL_DIFF_MISMATCH/);
  assert.throws(()=>verify(candidate,['src/ui/ink017/menu-ui.js']),/CORE_SYNC_UI_PATH/);
  assert.throws(()=>verify(candidate,['src/ui/ink017/shell.js']),/SHARED_CLOSURE_REQUIRES_RELEASE/);
  assert.throws(()=>verify(candidate,['.github/workflows/release.yml']),/CORE_PATH_NOT_ALLOWLISTED/);
});
