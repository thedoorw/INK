// Staged Public Gate001 replacement. Run ONLY from trusted BASE after approved cutover.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {blob,verifyPlan,qa637Only,qa637Event,verifyQa637,qa646Only,qa646Event,verifyQa646} from './static-sync-core.mjs';
// Independently audited Windows #569 artifact: 429 files, exact source and
// manifest bytes. These pins become trusted only after protected control/ merge.
// No candidate-supplied value is trusted; this authorizes QA-only integrity,
// never Pages publication or the official Static Sync009 runtime.
const QA637_TRUST=Object.freeze({
  sourceSha:'06860f134b514f84f76ee389d1805821fdd8b1a5',
  manifestSha256:'880379c9fb2aa8f21bc940b9af25b10ae08ba68274a95912ccd9a364f44984ba',
  action:'deploy'
});
const QA646_TRUST=Object.freeze({
  sourceSha:'99b045f7d58dc9aec29995d00ca0c42aa762647e',
  sourceTree:'093650c37c08b0bc7a61dbde7430d76e89fe1677',
  buildId:'src-785d2f76a6343a077ca4e2f2',
  manifestSha256:'3c8d85a28cce2e86fb091406b34bb9a5aa0e1aa7381cd10f1ef4f72688d14110',
  rendererPngSha256:'a2a72731b8ab270e1d9ca8f8b3f1cceefb10c5757a8be110c058523f641ce570',
  action:'deploy'
});
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
export function checkEvent(event,base,head,{documentationOnly=false,controlOnly=false,qa637Scope=false,qa646Scope=false}={}){
  const p=event.pull_request;
  assert.equal(event.repository?.full_name,'thedoorw/INK','REPO');
  assert.equal(p?.base?.repo?.full_name,'thedoorw/INK','BASE_REPO');
  assert.equal(p.head?.repo?.full_name,'thedoorw/INK','FORK_REJECTED');
  assert.equal(p.base.ref,'main','BASE_BRANCH');assert.equal(p.base.sha,base,'BASE_MOVED');assert.equal(p.head.sha,head,'HEAD_MOVED');
  assert.ok(documentationOnly||(qa646Scope?p.head.ref.startsWith('qa/cloud-draw-646-'):qa637Scope?p.head.ref.startsWith('qa-637/'):controlOnly?p.head.ref.startsWith('control/'):p.head.ref.startsWith('sync-009/')),'SYNC_BRANCH_REQUIRED');assert.equal(p.draft,false,'DRAFT_CANDIDATE');
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
  const qa637Scope=qa637Only(paths);
  const qa646Scope=qa646Only(paths);
  checkEvent(event,base.head,candidate.head,{documentationOnly,controlOnly,qa637Scope,qa646Scope});
  if(controlOnly){console.log(JSON.stringify({status:'CONTROL_ONLY_INDEPENDENT_REVIEW_REQUIRED',runtimeAndHistoricalTrustUnchanged:true,base:base.head,head:candidate.head,changedPaths:paths,release_authorized:false}));process.exit(0);}
  if(documentationOnly){console.log(JSON.stringify({status:'README_ONLY',noRuntimePublication:true,release_authorized:false}));process.exit(0);}
  if(qa637Scope){
    qa637Event(event,base.head,candidate.head);
    console.log(JSON.stringify(verifyQa637({
      baseFiles:base.files,candidateFiles:candidate.files,changedPaths:paths,trusted:QA637_TRUST
    })));
    process.exit(0);
  }
  if(qa646Scope){
    qa646Event(event,base.head,candidate.head);
    console.log(JSON.stringify(verifyQa646({
      baseFiles:base.files,candidateFiles:candidate.files,changedPaths:paths,trusted:QA646_TRUST
    })));
    process.exit(0);
  }
  const cfg=JSON.parse(base.files.get('engineering/public-release/static-sync.allowlist.json').bytes);
  console.log(JSON.stringify(verifyPlan({base,candidateFiles:candidate.files,cfg,changedPaths:paths})));
}
