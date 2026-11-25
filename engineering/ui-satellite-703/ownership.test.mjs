import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPath, verifyUiOnly} from './ownership.mjs';
const sha=c=>c.repeat(40);
const one=(path='src/ui/ink017/menu-ui.js')=>({path,oldMode:'100644',newMode:'100644',oldSha:sha('a'),newSha:sha('b')});
const check=(changes=[one()],files=changes.map(x=>x.path))=>verifyUiOnly({base:sha('1'),head:sha('2'),changes,files});
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
