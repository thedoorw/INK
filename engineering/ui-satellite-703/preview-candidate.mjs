// #703 isolated planning only. This module never writes a repository or deploys.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {inspectGitDiff} from './ownership.mjs';

const UI_PATHS=Object.freeze([
  'src/ui/ink017/markup.html',
  'src/ui/ink017/menu-ui.js',
  'src/ui/ink017/tokens.css'
]);
const SHA=/^[a-f0-9]{40}$/;

function git(root,...args){
  return execFileSync('git',['-C',root,...args],
    {encoding:'utf8',maxBuffer:4*1024*1024}).trim();
}

// previewEvidence is a *claim* from a mock preview, never trusted browser QA.
// It can bind the preview's UI bytes to one Git candidate, but cannot authorize
// Pages, prove a browser interaction, or substitute for a required check.
export function planUiPreviewCandidate({root,base,head,previewEvidence}){
  assert.ok(typeof root==='string'&&root.length>0,'GIT_ROOT_REQUIRED');
  const scope=inspectGitDiff(root,base,head);
  assert.equal(previewEvidence?.mode,'MOCK_NO_CORE','PREVIEW_MUST_MOCK_CORE');
  assert.equal(previewEvidence?.candidateSha,head,'PREVIEW_HEAD_DRIFT');
  assert.ok(previewEvidence?.sourceBlobs&&
    typeof previewEvidence.sourceBlobs==='object'&&
    !Array.isArray(previewEvidence.sourceBlobs),'PREVIEW_BLOBS_REQUIRED');
  assert.deepEqual(Object.keys(previewEvidence.sourceBlobs).sort(),[...UI_PATHS],
    'PREVIEW_SOURCE_CLOSURE_DRIFT');
  const uiBlobs=Object.fromEntries(UI_PATHS.map(path=>{
    const treeLine=git(root,'ls-tree',head,'--',path);
    const match=/^(\d{6}) (blob|tree) ([a-f0-9]{40})\t(.+)$/.exec(treeLine);
    assert.ok(match&&match[4]===path,`UI_TREE_ENTRY_MISSING:${path}`);
    assert.equal(match[1],'100644',`UI_UNSAFE_MODE:${path}`);
    assert.equal(match[2],'blob',`UI_NOT_BLOB:${path}`);
    const blob=match[3];
    assert.match(blob,SHA,'UI_BLOB_MISSING');
    assert.equal(git(root,'cat-file','-t',blob),'blob',`UI_BLOB_TYPE_DRIFT:${path}`);
    assert.equal(previewEvidence.sourceBlobs[path],blob,`PREVIEW_BLOB_DRIFT:${path}`);
    return [path,blob];
  }));
  return Object.freeze({
    schema:'INK703_UI_PREVIEW_CANDIDATE_PLAN_V1',
    publicBase:base,publicHead:head,uiBlobs,
    changedPaths:scope.changedPaths,
    previewMode:'MOCK_NO_CORE',
    qualification:'IDENTITY_ONLY_BROWSER_NOT_PROVEN',
    trustedQa:false,releaseAuthorized:false,publicPublished:false
  });
}
