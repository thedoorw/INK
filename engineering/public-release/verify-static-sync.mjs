// Staged Public Gate001 replacement. Run ONLY from trusted BASE after approved cutover.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {inflateSync} from 'node:zlib';
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
// Owner branding is data-only, not part of the INK executable Runtime.
// This whitelist intentionally never contains favicon.png, index.html, manifest,
// scripts, source bundles, GitHub workflows, or release receipt metadata.
const BRAND_ASSETS = new Map([
  ['assets/favicon-user.png',{maxBytes:256*1024,maxDimension:512,square:true}],
  ['assets/logo-user.png',{maxBytes:768*1024,maxDimension:2048,square:false}]
]);
export function isBrandingOnly(paths){
  return paths.length>0&&paths.every(p=>BRAND_ASSETS.has(p));
}
function crc32(bytes,start,end){
  let c=0xffffffff;
  for(let i=start;i<end;i++){
    c^=bytes[i];
    for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);
  }
  return (c^0xffffffff)>>>0;
}
export function validateBrandPng(bytes,path){
  const spec=BRAND_ASSETS.get(path);
  assert.ok(spec,'UNAPPROVED_BRAND_ASSET');
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length>50&&bytes.length<=spec.maxBytes,'BRAND_PNG_SIZE');
  assert.ok(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'BRAND_PNG_SIGNATURE');
  let pos=8,first=true,ended=false,width=0,height=0,channels=0,idat=[],sawIdat=false;
  while(pos<bytes.length){
    assert.ok(pos+12<=bytes.length,'BRAND_PNG_TRUNCATED_CHUNK');
    const size=bytes.readUInt32BE(pos);pos+=4;
    assert.ok(size<=spec.maxBytes&&pos+size+8<=bytes.length,'BRAND_PNG_CHUNK_BOUNDS');
    const name=bytes.toString('ascii',pos,pos+4);
    assert.match(name,/^[A-Za-z]{4}$/,'BRAND_PNG_CHUNK_NAME');
    const dataStart=pos+4,dataEnd=dataStart+size;
    assert.equal(crc32(bytes,pos,dataEnd),bytes.readUInt32BE(dataEnd),'BRAND_PNG_CRC');
    pos=dataEnd+4;
    if(first){
      assert.equal(name,'IHDR','BRAND_PNG_IHDR_FIRST');assert.equal(size,13,'BRAND_PNG_IHDR_SIZE');
      width=bytes.readUInt32BE(dataStart);height=bytes.readUInt32BE(dataStart+4);
      assert.ok(width>=16&&width<=spec.maxDimension&&height>=16&&height<=spec.maxDimension,'BRAND_PNG_DIMENSIONS');
      if(spec.square)assert.equal(width,height,'BRAND_FAVICON_MUST_BE_SQUARE');
      assert.equal(bytes[dataStart+8],8,'BRAND_PNG_8_BIT_REQUIRED');
      channels=bytes[dataStart+9]===6?4:bytes[dataStart+9]===2?3:0;
      assert.ok(channels,'BRAND_PNG_RGB_OR_RGBA_REQUIRED');
      assert.equal(bytes[dataStart+10],0,'BRAND_PNG_COMPRESSION');
      assert.equal(bytes[dataStart+11],0,'BRAND_PNG_FILTER_METHOD');
      assert.equal(bytes[dataStart+12],0,'BRAND_PNG_NO_INTERLACE');
      first=false;continue;
    }
    assert.notEqual(name,'IHDR','BRAND_PNG_DUPLICATE_IHDR');
    assert.ok(!['acTL','fcTL','fdAT'].includes(name),'BRAND_PNG_ANIMATION_NOT_ALLOWED');
    if(name==='IDAT'){sawIdat=true;idat.push(bytes.subarray(dataStart,dataEnd));}
    else if(name==='IEND'){
      assert.equal(size,0,'BRAND_PNG_IEND_SIZE');
      assert.ok(sawIdat,'BRAND_PNG_IDAT_REQUIRED');
      assert.equal(pos,bytes.length,'BRAND_PNG_TRAILING_BYTES');
      ended=true;break;
    }else if(name[0]===name[0].toUpperCase()&&name!=='PLTE'){
      throw Error('BRAND_PNG_UNKNOWN_CRITICAL_CHUNK:'+name);
    }
  }
  assert.ok(ended,'BRAND_PNG_IEND_REQUIRED');
  const rowBytes=width*channels+1;
  const maxOut=rowBytes*height;
  const raster=inflateSync(Buffer.concat(idat),{maxOutputLength:maxOut+1});
  assert.equal(raster.length,maxOut,'BRAND_PNG_RASTER_LENGTH');
  for(let y=0;y<height;y++)assert.ok(raster[y*rowBytes]<=4,'BRAND_PNG_FILTER_BYTE');
  return {path,width,height,bytes:bytes.length};
}
export function verifyBrandingOnly({base,candidate,changedPaths}){
  assert.ok(isBrandingOnly(changedPaths),'BRAND_ONLY_PATHS_REQUIRED');
  assert.ok(base.head&&candidate.head&&base.head!==candidate.head,'BRAND_SEPARATE_HEAD');
  // Same Git blob validation as the Runtime verifier, but no Runtime build.
  for(const snapshot of [base,candidate]){
    assert.ok(snapshot.files instanceof Map,'BRAND_FILE_MAP');
    for(const [path,f] of snapshot.files){
      assert.equal(f.mode,'100644','BRAND_NON_REGULAR_FILE');
      assert.equal(blob(f.bytes),f.sha,'BRAND_GIT_BLOB:'+path);
    }
  }
  const receipt=JSON.parse(base.files.get('PUBLISH_RECEIPT.json')?.bytes.toString('utf8')||'null');
  assert.equal(receipt?.schema,'INK_PUBLICATION_RECEIPT_V1','BRAND_BASE_RECEIPT');
  const managed=new Set(receipt.managed_files?.map(x=>x.path)||[]);
  const assets=[];
  for(const path of changedPaths){
    assert.ok(!managed.has(path),'BRAND_PATH_OWNED_BY_RUNTIME:'+path);
    const file=candidate.files.get(path);
    assets.push(file?{...validateBrandPng(file.bytes,path),action:base.files.has(path)?'replace':'add'}:{path,action:'reset'});
  }
  // All other files, including BUILD_INFO, Runtime and trusted control, must be
  // identical; changedPaths is independently derived from the full Git tree.
  return {status:'BRANDING_ONLY_INTEGRITY_PASS',base:base.head,head:candidate.head,assets,
    runtimeBuildRequired:false,adobeDependencyScanRequired:false,releaseAuthorized:false};
}
export function checkEvent(event,base,head,{documentationOnly=false,controlOnly=false,brandingOnly=false}={}){
  const p=event.pull_request;
  assert.equal(event.repository?.full_name,'thedoorw/INK','REPO');
  assert.equal(p?.base?.repo?.full_name,'thedoorw/INK','BASE_REPO');
  assert.equal(p.head?.repo?.full_name,'thedoorw/INK','FORK_REJECTED');
  assert.equal(p.base.ref,'main','BASE_BRANCH');assert.equal(p.base.sha,base,'BASE_MOVED');assert.equal(p.head.sha,head,'HEAD_MOVED');
  assert.ok(documentationOnly||(controlOnly?p.head.ref.startsWith('control/'):brandingOnly?p.head.ref.startsWith('branding/'):p.head.ref.startsWith('sync-009/')),'SYNC_BRANCH_REQUIRED');assert.equal(p.draft,false,'DRAFT_CANDIDATE');
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
  const brandingOnly=isBrandingOnly(paths);
  checkEvent(event,base.head,candidate.head,{documentationOnly,controlOnly,brandingOnly});
  if(brandingOnly){
    console.log(JSON.stringify(verifyBrandingOnly({base,candidate,changedPaths:paths})));
    process.exit(0);
  }
  if(controlOnly){console.log(JSON.stringify({status:'CONTROL_ONLY_INDEPENDENT_REVIEW_REQUIRED',runtimeAndHistoricalTrustUnchanged:true,base:base.head,head:candidate.head,changedPaths:paths,release_authorized:false}));process.exit(0);}
  if(documentationOnly){console.log(JSON.stringify({status:'README_ONLY',noRuntimePublication:true,release_authorized:false}));process.exit(0);}
  const cfg=JSON.parse(base.files.get('engineering/public-release/static-sync.allowlist.json').bytes);
  console.log(JSON.stringify(verifyPlan({base,candidateFiles:candidate.files,cfg,changedPaths:paths})));
}
