// INK #703 candidate only. This is NOT wired into the production release gate.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const UI_FILES = new Set([
  'src/ui/ink017/menu-ui.js',
  'src/ui/ink017/markup.html',
  'src/ui/ink017/tokens.css',
]);
const CORE_ROOTS=['src/core/','src/document/','src/history/','src/renderer/','src/recipe/','src/editor/','src/paint/'];
const SHA = /^[a-f0-9]{40}$/;

export function classifyPath(path) {
  if (typeof path !== 'string' || !path || path.startsWith('/') ||
      path.includes('\\') || path.split('/').some(p => p === '.' || p === '..' || !p))
    throw Error('UNSAFE_PATH');
  return UI_FILES.has(path) ? 'public-ui' : 'protected';
}

export function verifyUiOnly({base, head, files, changes}) {
  assert.match(base, SHA, 'BASE_SHA');
  assert.match(head, SHA, 'HEAD_SHA');
  assert.notEqual(base, head, 'EMPTY_REVISION');
  assert.ok(Array.isArray(changes) && changes.length > 0, 'NO_CHANGES');
  const names = new Set();
  for (const entry of changes) {
    assert.ok(entry && typeof entry === 'object', 'INVALID_ENTRY');
    const {path, oldSha, newSha, oldMode, newMode} = entry;
    assert.equal(classifyPath(path), 'public-ui', `PROTECTED_PATH:${path}`);
    assert.ok(!names.has(path), 'DUPLICATE_PATH');
    names.add(path);
    assert.equal(oldMode, '100644', 'OLD_MODE');
    assert.equal(newMode, '100644', 'NEW_MODE');
    assert.match(oldSha, SHA, 'OLD_BLOB');
    assert.match(newSha, SHA, 'NEW_BLOB');
    assert.notEqual(oldSha, newSha, 'UNCHANGED_BLOB');
  }
  assert.ok(Array.isArray(files) && files.length === changes.length, 'INCOMPLETE_DIFF');
  assert.deepEqual([...files].sort(), [...names].sort(), 'DIFF_PATH_MISMATCH');
  return Object.freeze({status:'UI_ONLY_SCOPE_PASS', base, head, changedPaths:[...names].sort(), releaseAuthorized:false});
}

const git = (root, ...args) => execFileSync('git', ['-C',root,...args], {encoding:'utf8',maxBuffer:16*1024*1024}).trim();

// Derive the complete changed set from trusted Git trees; never consume a PR-authored allowlist.
export function inspectGitDiff(root, base, head) {
  assert.match(base, SHA, 'BASE_SHA');
  assert.match(head, SHA, 'HEAD_SHA');
  assert.equal(git(root,'rev-parse',`${base}^{commit}`), base, 'BASE_NOT_FOUND');
  assert.equal(git(root,'rev-parse',`${head}^{commit}`), head, 'HEAD_NOT_FOUND');
  assert.equal(git(root,'merge-base',base,head), base, 'NOT_ANCESTOR');
  const raw = git(root,'diff','--raw','--abbrev=40','-z','--no-renames',base,head).split('\0');
  const changes = [];
  for(let i=0;i<raw.length-1;i+=2){
    const m = /^:(\d{6}) (\d{6}) ([a-f0-9]{40}) ([a-f0-9]{40}) ([A-Z])$/.exec(raw[i]);
    assert.ok(m, 'DIFF_FORMAT');
    assert.equal(m[5], 'M', 'ADD_DELETE_RENAME_REJECTED');
    changes.push({path:raw[i+1],oldMode:m[1],newMode:m[2],oldSha:m[3],newSha:m[4]});
  }
  return verifyUiOnly({base,head,changes,files:changes.map(c=>c.path)});
}

// Validate a proposed Private Core -> Public overlay from *complete* trusted tree
// inventories. Every Public-owned UI blob must survive byte-for-byte. Shared
// startup/shell files are forbidden from an automatic Core-only sync.
export function verifyCoreMirror({publicBase,publicCandidate,coreChangedPaths}) {
  assert.ok(publicBase instanceof Map&&publicCandidate instanceof Map,'FULL_TREES_REQUIRED');
  assert.ok(Array.isArray(coreChangedPaths)&&coreChangedPaths.length>0,'CORE_DIFF_REQUIRED');
  const declared=new Set(coreChangedPaths);
  assert.equal(declared.size,coreChangedPaths.length,'DUPLICATE_CORE_PATH');
  for(const path of declared){
    assert.equal(classifyPath(path),'protected','CORE_SYNC_UI_PATH');
    assert.ok(!/^(?:src\/ui\/ink017\/(?:entry|shell)\.js|dist\/|service-worker|BUILD_INFO|PUBLISH_RECEIPT|index\.html)/.test(path),'SHARED_CLOSURE_REQUIRES_RELEASE');
    assert.ok(CORE_ROOTS.some(root=>path.startsWith(root)&&path.length>root.length),'CORE_PATH_NOT_ALLOWLISTED');
  }
  const actual=[];
  for(const path of new Set([...publicBase.keys(),...publicCandidate.keys()])){
    classifyPath(path);
    const before=publicBase.get(path),after=publicCandidate.get(path);
    if(before?.sha!==after?.sha||before?.mode!==after?.mode)actual.push(path);
    if(classifyPath(path)==='public-ui'){
      assert.ok(before&&after,'PUBLIC_UI_REMOVED');
      assert.equal(before.mode,'100644','PUBLIC_UI_BASE_MODE');
      assert.equal(after.mode,'100644','PUBLIC_UI_CANDIDATE_MODE');
      assert.equal(after.sha,before.sha,`PUBLIC_UI_OVERWRITE:${path}`);
    }
  }
  assert.deepEqual(actual.sort(),[...declared].sort(),'CORE_FULL_DIFF_MISMATCH');
  return Object.freeze({status:'CORE_SYNC_PRESERVES_PUBLIC_UI',changedPaths:actual,releaseAuthorized:false});
}
