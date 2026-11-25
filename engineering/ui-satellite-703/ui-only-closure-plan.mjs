// #703 review-only Public UI candidate closure plan. Never builds or publishes.
import assert from 'node:assert/strict';

const SHA=/^[a-f0-9]{40}$/;
const UI=Object.freeze(['src/ui/ink017/markup.html',
  'src/ui/ink017/menu-ui.js','src/ui/ink017/tokens.css']);
const REQUIRED=Object.freeze([
  Object.freeze({id:'SW_CACHE_ROTATION',owner:'trusted-public-release-builder',
    check:'new Pages revision installs UI-inclusive cache and evicts previous shell cache'}),
  Object.freeze({id:'BUILD_AND_RECEIPT_IDENTITY',owner:'trusted-public-release-builder',
    check:'Public BUILD_INFO and PUBLISH_RECEIPT bind exact approved UI and Core revisions'}),
  Object.freeze({id:'CORE_UNCHANGED',owner:'trusted-git-tree-verifier',
    check:'complete Public Core-owned Git tree remains byte-for-byte unchanged'}),
  Object.freeze({id:'ROLLBACK_AND_OFFLINE',owner:'trusted-chrome-browser-qa',
    check:'same-origin update, offline UI, stale query rejection and old UI rollback'})
]);

export function planUiOnlyClosure({previewCandidate,payloadPaths}){
  assert.equal(previewCandidate?.schema,'INK703_UI_PREVIEW_CANDIDATE_PLAN_V1',
    'PREVIEW_PLAN_SCHEMA');
  assert.equal(previewCandidate?.previewMode,'MOCK_NO_CORE','PREVIEW_NOT_ISOLATED');
  assert.equal(previewCandidate?.trustedQa,false,'UNTRUSTED_PREVIEW_CANNOT_BE_QA');
  assert.equal(previewCandidate?.releaseAuthorized,false,'RELEASE_AUTHORITY_NOT_ALLOWED');
  assert.match(previewCandidate.publicBase||'',SHA,'BASE_SHA');
  assert.match(previewCandidate.publicHead||'',SHA,'HEAD_SHA');
  assert.notEqual(previewCandidate.publicBase,previewCandidate.publicHead,'NO_REVISION');
  const blobs=previewCandidate.uiBlobs;
  assert.ok(blobs&&typeof blobs==='object'&&!Array.isArray(blobs),'UI_BLOBS_REQUIRED');
  assert.deepEqual(Object.keys(blobs).sort(),[...UI],'UI_SOURCE_CLOSURE_DRIFT');
  for(const p of UI)assert.match(blobs[p],SHA,`INVALID_UI_BLOB:${p}`);
  assert.ok(Array.isArray(previewCandidate.changedPaths)&&
    previewCandidate.changedPaths.length>0,'CHANGES_REQUIRED');
  const changes=[...new Set(previewCandidate.changedPaths)].sort();
  assert.equal(changes.length,previewCandidate.changedPaths.length,'DUPLICATE_CHANGE');
  assert.ok(changes.every(p=>UI.includes(p)),'UI_OWNERSHIP_BOUNDARY');
  assert.ok(Array.isArray(payloadPaths),'PAYLOAD_REQUIRED');
  const payload=[...new Set(payloadPaths)].sort();
  assert.equal(payload.length,payloadPaths.length,'DUPLICATE_PAYLOAD');
  assert.deepEqual(payload,changes,'PAYLOAD_SCOPE_DRIFT');
  return Object.freeze({
    schema:'INK703_UI_ONLY_CLOSURE_PLAN_V1',
    publicBase:previewCandidate.publicBase,
    publicHead:previewCandidate.publicHead,
    payload,
    uiSourceBlobs:Object.freeze(Object.fromEntries(UI.map(p=>[p,blobs[p]]))),
    externalRuntimeRequirements:Object.freeze(REQUIRED.map(g=>Object.freeze({...g,status:'NOT_PROVEN'}))),
    qualification:'DRY_RUN_ONLY_RUNTIME_CLOSURE_UNPROVEN',
    publicCoreImmutable:'REQUIRES_TRUSTED_FULL_TREE_CHECK',
    releaseAuthorized:false,publicPublished:false
  });
}
