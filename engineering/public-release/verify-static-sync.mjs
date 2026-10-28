// Staged Public Gate001 replacement. Run ONLY from trusted BASE after approved cutover.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {blob,verifyPlan} from './static-sync-core.mjs';
const CONTROL_PATHS=new Set([
  '.github/workflows/ink-public-release-gate-001.yml',
  'engineering/public-release/static-sync-core.mjs',
  'engineering/public-release/verify-static-sync.mjs',
  'engineering/public-release/static-sync.allowlist.json',
  'engineering/public-release/static-sync.test.mjs'
]);
export function isControlOnly(paths){
  return paths.length>0 && paths.every(p=>CONTROL_PATHS.has(p));
}
export function checkEvent(event,base,head,{documentationOnly=false,controlOnly=false}={}){
  const p=event.pull_request;
  assert.equal(event.repository?.full_name,'thedoorw/INK','REPO');
  assert.equal(p?.base?.repo?.full_name,'thedoorw/INK','BASE_REPO');
  assert.equal(p.head?.repo?.full_name,'thedoorw/INK','FORK_REJECTED');
  assert.equal(p.base.ref,'main','BASE_BRANCH');assert.equal(p.base.sha,base,'BASE_MOVED');assert.equal(p.head.sha,head,'HEAD_MOVED');
  assert.ok(documentationOnly||(controlOnly?p.head.ref.startsWith('control/'):p.head.ref.startsWith('sync-009/')),'SYNC_BRANCH_REQUIRED');assert.equal(p.draft,false,'DRAFT_CANDIDATE');
  assert.equal(event.action==='closed',false,'CLOSED_PR');
}
export function gitSnapshot(root){
  const git=(...a)=>execFileSync('git',['-C',root,...a],{maxBuffer:64*1024*1024});
  const head=git('rev-parse','HEAD').toString().trim(),tree=git('rev-parse','HEAD^{tree}').toString().trim(),files=new Map();
  for(const record of git('ls-tree','-rz','--full-tree','HEAD').toString().split('\0').filter(Boolean)){
    const tab=record.indexOf('\t'),[mode,type,sha]=record.slice(0,tab).split(' '),path=record.slice(tab+1);
    assert.equal(type,'blob','GIT_TYPE');assert.equal(mode,'100644','GIT_MODE');
    const bytes=git('cat-file','blob',sha);assert.equal(blob(bytes),sha,'GIT_BLOB');files.set(path,{mode,sha,bytes});
  }
  return {head,tree,files};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [baseRoot,candidateRoot]=process.argv.slice(2);assert.ok(baseRoot&&candidateRoot,'BASE_AND_CANDIDATE_REQUIRED');
  const base=gitSnapshot(baseRoot),candidate=gitSnapshot(candidateRoot);
  const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
  const paths=[...new Set([...base.files.keys(),...candidate.files.keys()])].filter(p=>base.files.get(p)?.sha!==candidate.files.get(p)?.sha);
  const documentationOnly=paths.length===1&&paths[0]==='README.md';
  const controlOnly=isControlOnly(paths);
  checkEvent(event,base.head,candidate.head,{documentationOnly,controlOnly});
  if(controlOnly){console.log(JSON.stringify({status:'CONTROL_ONLY_INDEPENDENT_REVIEW_REQUIRED',runtimeAndHistoricalTrustUnchanged:true,base:base.head,head:candidate.head,changedPaths:paths,release_authorized:false}));process.exit(0);}
  if(documentationOnly){console.log(JSON.stringify({status:'README_ONLY',noRuntimePublication:true,release_authorized:false}));process.exit(0);}
  const cfg=JSON.parse(base.files.get('engineering/public-release/static-sync.allowlist.json').bytes);
  console.log(JSON.stringify(verifyPlan({base,candidateFiles:candidate.files,cfg,changedPaths:paths})));
}
