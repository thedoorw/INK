#!/usr/bin/env node
// INK #765: advisory, read-only source-identity check. No Runtime or release gate.
// Run at a complete, exact Public Git checkout; no network, Runner or product state.
import {readFile, readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve, dirname, relative, sep, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const UI='src/ui/ink017/';
const PREVIEW='preview/ink-ui-shared/';
const SAFE_TOOLBAR_UI=UI+'tool-slices/toolbar-customizer.js';
const NATIVE_WORKBENCH=UI+'tool-slices/workbench.js';
const SHARED_VIEW=UI+'shared-controls.js';
const NATIVE_STATE='src/ui/minimal-test-shell/modules.js';
const ARTBOARD_SOURCE='src/document/artboard.js';
const BRAND_CONTROLLER='src/ui/branding-settings.js';
const LEASED=Object.freeze([
  'markup.html','menu-ui.js','panels/adjustments.js','panels/brushes.js',
  'panels/character-typography.js','panels/character.js','panels/color.js',
  'panels/history.js','panels/layers.js','panels/navigator-zoom-curve.mjs',
  'panels/navigator.js','panels/paragraph.js','panels/paths.js',
  'panels/swatches.js','right-dock.js','shared-controls.js','shell.js','tokens.css'
].map(p=>UI+p));
const LEASED_SET=new Set(LEASED);
const MODULES=LEASED.filter(p=>/\.m?js$/.test(p));
// This is a frozen display snapshot boundary, not a claim that the Native
// tool registry is a pure UI module. Importing registry.js in Mock would
// transitively execute real Core modules.
const NATIVE_TOOL_SOURCES=Object.freeze([
  'tool-slices/registry.js','tool-slices/completion-tools.js',
  'tool-slices/dev1/catalog.js','tool-slices/dev2/index.mjs',
  'tool-slices/dev3/tools-context-dev3.mjs'
].map(p=>UI+p));
const NATIVE_TOOL_IDS=Object.freeze([
  'select','marquee','lasso','wand','crop','eyedropper','drawing',
  'healing','stamp','eraser','fill','local','tone','vector-pen',
  'text','nodes','shape','guide','pan','zoom'
]);
const FILES=Object.freeze([
  'index.html','src/ui/ink017/entry.js','dist/startup/ink-shell.mjs',
  'stage-runtime.css',NATIVE_STATE,ARTBOARD_SOURCE,BRAND_CONTROLLER,
  PREVIEW+'index.html',PREVIEW+'preview.css',PREVIEW+'preview-entry.js',PREVIEW+'mock-host.js',
  SAFE_TOOLBAR_UI,NATIVE_WORKBENCH,...LEASED
]);

export class SameSourceError extends Error {
  constructor(code, detail=''){
    super(`${code}${detail?' : '+detail:''}`);
    this.name='SameSourceError';this.code=code;this.detail=detail;
  }
}
const demand=(condition,code,detail='')=>{
  if(!condition)throw new SameSourceError(code,detail);
};
const cleanPath=p=>p.split(sep).join('/');
const localPath=(from,spec)=>cleanPath(relative('.',resolve(dirname(from),spec)));
const pathSpec=(text,p)=>text.includes(p);
const gitBlob=bytes=>{
  const prefix=Buffer.from(`blob ${bytes.length}\0`);
  return createHash('sha1').update(prefix).update(bytes).digest('hex');
};

// Loaded paths have both their working bytes and the exact committed Git blob.
// This rejects accidental testing of unstaged, staged or stale files as HEAD.
export function makeGitReader(root){
  const git=(...args)=>execFileSync('git',['-C',root,...args],{
    encoding:'utf8',maxBuffer:32*1024*1024
  }).trim();
  let head;
  try{
    demand(git('rev-parse','--is-inside-work-tree')==='true','GIT_CHECKOUT_REQUIRED');
    head=git('rev-parse','HEAD');
  }catch(error){
    if(error instanceof SameSourceError)throw error;
    throw new SameSourceError('GIT_CHECKOUT_REQUIRED',String(error.message));
  }
  return {
    head,
    async read(path){
      const bytes=await readFile(join(root,path));
      let committed;
      try{committed=git('rev-parse',`${head}:${path}`)}
      catch{throw new SameSourceError('PATH_NOT_COMMITTED',path)}
      const observed=gitBlob(bytes);
      demand(committed===observed,'GIT_BLOB_DRIFT',`${path} committed=${committed} working=${observed}`);
      return {text:bytes.toString('utf8'),blob:committed};
    },
    async children(path){return await readdir(join(root,path))}
  };
}

// Only the existing UI presentation files may be shared. The actual Real
// tool registry, Native dialogs, canvas and branding are a separate seam.
function importsOf(text){
  const imports=[...text.matchAll(/\bimport\s+(?:[\s\S]*?\s+from\s*)?['"]([^'"]+)['"]/g)]
    .map(match=>match[1]);
  for(const match of text.matchAll(/\bexport\s+(?:\*\s*|\{[^}]*\}\s*)from\s*['"]([^'"]+)['"]/g))
    imports.push(match[1]);
  for(const match of text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g))
    imports.push(match[1]);
  for(const match of text.matchAll(/\bimport\s*\(\s*new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)\.href\s*\)/g))
    imports.push(match[1]);
  return imports;
}

function mustLoadCanonical(preview,real,expected){
  demand(preview===expected,'PREVIEW_SOURCE_DRIFT',`${preview} != ${expected}`);
  demand(real===expected,'REAL_SOURCE_DRIFT',`${real} != ${expected}`);
}

function checkPreviewHtml(html,previewCss){
  demand(/<script\b[^>]*\bsrc=["']\.\/preview-entry\.js["']/i.test(html),
    'PREVIEW_ENTRY_MISSING');
  demand(/style-src 'self';/.test(html)&&!/'unsafe-inline'/.test(html),
    'PREVIEW_CSP_MUST_MATCH_REAL');
  const css=[...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']/gi)]
    .map(m=>m[1]);
  demand(css.length===3,'PREVIEW_STYLESHEET_COPY',css.join(','));
  mustLoadCanonical(localPath(PREVIEW+'index.html',css[0]),'stage-runtime.css','stage-runtime.css');
  mustLoadCanonical(localPath(PREVIEW+'index.html',css[1]),UI+'tokens.css',UI+'tokens.css');
  demand(localPath(PREVIEW+'index.html',css[2])===PREVIEW+'preview.css',
    'PREVIEW_STYLESHEET_COPY',css[2]);
  demand(previewCss.trim().length>0&&previewCss.includes('{'),
    'PREVIEW_CSS_MISSING');
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m=>m[1]);
  demand(scripts.length===1&&scripts[0]==='./preview-entry.js',
    'PREVIEW_MUST_IMPORT_LEASED_VIEWS',scripts.join(','));
  demand(!/<(?:div|section|main|aside|header|footer)\b[^>]*\bid=["'](?:shell|rightDock|mainMenu|workspace)["']/i.test(html),
    'COPIED_SHELL_MARKUP');
  const inlineStyles=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(x=>x[1]);
  demand(inlineStyles.length===0&&!/\bstyle\s*=/i.test(html),
    'PREVIEW_CSP_INLINE_STYLE','inline CSS prohibited under Real CSP');
  // Preview-only controls/page placeholders may be styled locally. Actual
  // UI geometry stays exclusively in the canonical tokens.css Git blob.
  for(const match of previewCss.matchAll(/(?:^|})\s*([^{}]+)\s*\{/g)){
    for(const selector of match[1].split(',')){
      const s=selector.trim();
      demand(/^(?:#mockControls(?:\s+.+)?|html\[data-preview-clean=["']true["']\]\s+#mockControls|\.preview-page|\.preview-empty)$/.test(s),
        'PREVIEW_UI_CSS_COPY',s);
    }
  }
}

function checkPreviewEntrypoint(entry,mock){
  const shell=/\bimport\s*\{\s*mountNativeShell\s*\}\s*from\s*['"]([^'"]+)['"]/.exec(entry)?.[1];
  const host=/\bimport\s*\{\s*createMockHost\s*\}\s*from\s*['"]([^'"]+)['"]/.exec(entry)?.[1];
  const size=/\bimport\s*\{\s*renderNewDocumentSizeDialog\s*,\s*registerInkPublicViews\s*\}\s*from\s*['"]([^'"]+)['"]/.exec(entry)?.[1];
  demand(shell&&host&&size,'PREVIEW_BOOT_IMPORT_CONTRACT');
  mustLoadCanonical(localPath(PREVIEW+'preview-entry.js',shell),UI+'shell.js',UI+'shell.js');
  demand(localPath(PREVIEW+'preview-entry.js',host)===PREVIEW+'mock-host.js','PREVIEW_MOCK_HOST_CONTRACT');
  mustLoadCanonical(localPath(PREVIEW+'preview-entry.js',size),SHARED_VIEW,SHARED_VIEW);
  demand(/\bregisterInkPublicViews\s*\(\s*\)/.test(entry),'PREVIEW_PUBLIC_VIEW_REGISTER_MISSING');
  demand(importsOf(entry).length===3,'PREVIEW_EXTRA_IMPORTS',importsOf(entry).join(','));
  demand(/renderNewDocumentSizeDialog\s*\(\s*\{\s*ppiMin\s*:\s*36\s*,\s*ppiMax\s*:\s*2400/.test(entry),
    'PREVIEW_SIZE_PPI_CONTRACT');
  const markup=/\bnew URL\(\s*['"]([^'"]*markup\.html)['"]\s*,\s*import\.meta\.url\s*\)/.exec(entry)?.[1];
  demand(markup,'PREVIEW_MARKUP_IMPORT_CONTRACT');
  mustLoadCanonical(localPath(PREVIEW+'preview-entry.js',markup),UI+'markup.html',UI+'markup.html');
  demand(/\bmountNativeShell\s*\(\s*host\s*,\s*shell\s*\)/.test(entry),'PREVIEW_NATIVE_SHELL_REUSE');
  demand(/\bDOMParser\b/.test(entry),'PREVIEW_MARKUP_PARSER_MISSING');
  demand(/INK_BRANDING_VIEW\?\.createBrandingView/.test(entry),'MOCK_BRANDING_VIEW_MISSING');
  demand(/\[\s*'logoChoose'\s*,\s*'logoInput'\s*,\s*'candidateButton'\s*\]/.test(entry),
    'MOCK_BRANDING_IO_CONTROLS_NOT_DISABLED');
  demand(/view\.ownerLink\.addEventListener\(['"]click['"],\s*event\s*=>\s*event\.preventDefault\(\)\)/.test(entry),
    'MOCK_BRANDING_EXTERNAL_LINK_NOT_GATED');
  demand(!/\b(?:localStorage|sessionStorage|FileReader|Blob|URL\.createObjectURL)\b/.test(entry),
    'PREVIEW_BRANDING_IO_FORBIDDEN');
  demand(!/\b(?:innerHTML|insertAdjacentHTML|document\.write)\s*(?:=|\()/.test(entry),
    'PREVIEW_COPIED_UI_TEMPLATE');
  const imports=importsOf(mock);
  demand(imports.length===1&&localPath(PREVIEW+'mock-host.js',imports[0])===SAFE_TOOLBAR_UI,
    'MOCK_IMPORTS_CORE_OR_UI',imports.join(','));
  demand(/mountToolbarCustomizer\s*\(\s*root\s*,\s*grouped\s*,\s*\{[\s\S]*?storage\s*:\s*memory\s*,\s*allowPresetFiles\s*:\s*false/.test(mock),
    'MOCK_TOOLBAR_IO_SEAM_MISSING');
  demand(/presentation\s*:\s*presentation\.toolbarCustomizerView/.test(mock),
    'MOCK_TOOLBAR_SHARED_VIEW_NOT_INJECTED');
  demand(!/\b(?:import\s*\(|require\s*\()/.test(mock),'MOCK_DYNAMIC_IMPORT');
  const forbidden=[
    /\b(?:localStorage|sessionStorage|indexedDB|caches|CacheStorage)\b/,
    /\bnavigator\s*\.\s*serviceWorker\b/,
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|Worker|SharedWorker)\s*\(/
  ];
  for(const pattern of forbidden)demand(!pattern.test(mock),'MOCK_REAL_IO_FORBIDDEN',pattern.source);
  demand(!/<(?:div|section|main|aside|header|footer)\b[^>]*\bid=["'](?:shell|rightDock|mainMenu|workspace)["']/i.test(mock),
    'MOCK_COPIED_SHELL_MARKUP');
}

function checkRealEntrypoint(html,entry,bundle,branding){
  demand(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']stage-runtime\.css["']/i.test(html),
    'REAL_STAGE_STYLESHEET_DRIFT');
  demand(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']src\/ui\/ink017\/tokens\.css["']/i.test(html),
    'REAL_TOKENS_STYLESHEET_DRIFT');
  demand(/<link\b[^>]*\brel=["']preload["'][^>]*\bhref=["']src\/ui\/ink017\/markup\.html["']/i.test(html),
    'REAL_MARKUP_PRELOAD_DRIFT');
  demand(/<script\b[^>]*\bsrc=["']dist\/startup\/ink-shell\.mjs["']/i.test(html),
    'REAL_SHELL_BUNDLE_MISSING');
  const brandController=html.indexOf('src="src/ui/branding-settings.js"');
  demand(brandController>=0&&/<script\s+type="module"\s+src="src\/ui\/branding-settings\.js"/.test(html),
    'REAL_BRANDING_VIEW_ORDER');
  const nativeBoot=html.indexOf('src="dist/startup/ink-boot.mjs"');
  demand(nativeBoot>brandController,'REAL_NEW_DOCUMENT_EXTERNAL_VIEW_ORDER');
  demand(/import\s*\{\s*registerInkPublicViews\s*\}\s*from\s*['"]\.\/ink017\/shared-controls\.js['"]/.test(branding)&&
    /\bregisterInkPublicViews\s*\(\s*\)/.test(branding),
    'REAL_PUBLIC_VIEW_REGISTER_MISSING');
  demand(!html.includes('src="src/ui/branding-view.js"')&&
    !html.includes('src="src/ui/minimal-test-shell/size-dialog-view.js"'),
    'REAL_LEGACY_VIEW_SCRIPT_STILL_LOADED');
  const entryMarkup=/\bnew URL\(\s*['"]([^'"]*markup\.html)['"]\s*,\s*import\.meta\.url\s*\)/.exec(entry)?.[1];
  const entryShell=/\bimport\s*\(\s*new URL\(\s*['"]([^'"]*shell\.js)['"]\s*,\s*import\.meta\.url\s*\)\.href\s*\)/.exec(entry)?.[1];
  demand(entryMarkup&&entryShell,'REAL_ENTRY_SOURCE_CONTRACT');
  mustLoadCanonical(localPath(UI+'entry.js',entryMarkup),UI+'markup.html',UI+'markup.html');
  mustLoadCanonical(localPath(UI+'entry.js',entryShell),UI+'shell.js',UI+'shell.js');
  // A compiled Startup currently embeds the Native entry but lazily loads
  // the canonical, Public-owned presentation by URL at runtime.
  for(const name of ['markup.html','shell.js']){
    const expression=new RegExp(`new URL\\(["']\\./${name.replace('.','\\.')}["'],\\s*new URL\\(["']src/ui/ink017/entry\\.js["'],\\s*document\\.baseURI\\)\\.href\\)`);
    demand(expression.test(bundle),'BUNDLE_UI_URL_DRIFT',name);
  }
  demand(/\bmountNativeShell\s*\(\s*createNativeHost\s*\(\s*app\s*\)\s*,\s*shell\s*\)/.test(bundle),
    'REAL_HOST_INJECTION_DRIFT');
}

function checkUiGraph(contents){
  const seen=new Set(),queue=[UI+'shell.js'];
  while(queue.length){
    const current=queue.shift();if(seen.has(current))continue;
    seen.add(current);
    for(const spec of importsOf(contents.get(current).text)){
      demand(spec.startsWith('.'),'UI_IMPORTS_NONLOCAL',`${current} => ${spec}`);
      const resolved=localPath(current,spec);
      if(current===UI+'menu-ui.js'&&resolved==='src/agent/work-runtime-read-controls.mjs'){
        // Existing WORK extension is Real-runtime-only; Mock's
        // isCurrentRuntime() is hard-false. Keep this narrow exception
        // guarded, never treat the Agent module as shared UI source.
        demand(/if\s*\(\s*!host\.menuApi\.isCurrentRuntime\(\)\s*\)\s*throw\s+Error\(['"]INK_WORK_RUNTIME_IDENTITY_MISMATCH['"]\)/.test(contents.get(current).text),
          'UI_REAL_EXTENSION_NOT_GATED',resolved);
        continue;
      }
      demand(LEASED_SET.has(resolved),
        'UI_IMPORT_OUTSIDE_LEASE',`${current} => ${resolved}`);
      demand(/\.m?js$/.test(resolved),'UI_IMPORT_NOT_MODULE',resolved);
      queue.push(resolved);
    }
  }
  const absent=MODULES.filter(m=>!seen.has(m));
  demand(absent.length===0,'UI_MODULE_NOT_REACHED_FROM_SHELL',absent.join(','));
  return [...seen].sort();
}

async function checkFrozenToolSnapshot(reader,mock){
  const sourceBlock=/\bNATIVE_TOOL_SOURCE_BLOBS\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/.exec(mock)?.[1];
  demand(sourceBlock,'TOOL_SOURCE_PINS_MISSING');
  const declared=[...sourceBlock.matchAll(/['"]([^'"]+)['"]\s*:\s*['"]([a-f0-9]{40})['"]/g)]
    .map(m=>[UI+m[1],m[2]]);
  demand(declared.length===NATIVE_TOOL_SOURCES.length,'TOOL_SOURCE_PIN_COUNT',String(declared.length));
  const pins=new Map(declared);
  demand(pins.size===NATIVE_TOOL_SOURCES.length,'TOOL_SOURCE_PIN_DUPLICATE');
  const verified=[];
  for(const path of NATIVE_TOOL_SOURCES){
    demand(pins.has(path),'TOOL_SOURCE_PIN_MISSING',path);
    const live=await reader.read(path);
    demand(pins.get(path)===live.blob,'TOOL_SOURCE_BLOB_DRIFT',
      `${path} pinned=${pins.get(path)} committed=${live.blob}`);
    verified.push({path,git_blob_sha:live.blob});
  }
  const fixtureBlock=/\bconst\s+fixtures\s*=\s*\[([\s\S]*?)\n\];/.exec(mock)?.[1];
  demand(fixtureBlock,'TOOL_SNAPSHOT_NOT_STATIC');
  const ids=[...fixtureBlock.matchAll(/^\s*row\(\s*['"]([^'"]+)['"]/gm)].map(m=>m[1]);
  demand(ids.join('|')===NATIVE_TOOL_IDS.join('|'),'TOOL_SNAPSHOT_GROUP_DRIFT',ids.join(','));
  return {kind:'DISPLAY_ONLY_FROZEN_SNAPSHOT',nativeSourceBlobs:verified,groupIds:ids};
}

export async function verifySameSource(reader,{scope='presentation',expectedHead=null}={}){
  demand(['presentation','catalog','full'].includes(scope),'UNKNOWN_SCOPE',scope);
  if(expectedHead)demand(reader.head===expectedHead,'HEAD_DRIFT',`${reader.head} != ${expectedHead}`);
  const results=await Promise.all(FILES.map(async path=>[path,await reader.read(path)]));
  const contents=new Map(results);
  const get=p=>contents.get(p).text;
  const children=await reader.children(PREVIEW);
  demand(children.slice().sort().join('|')===['index.html','mock-host.js','preview-entry.js','preview.css'].sort().join('|'),
    'PREVIEW_EXTRA_SOURCE_FILES',children.join(','));
  checkPreviewHtml(get(PREVIEW+'index.html'),get(PREVIEW+'preview.css'));
  checkPreviewEntrypoint(get(PREVIEW+'preview-entry.js'),get(PREVIEW+'mock-host.js'));
  demand(!importsOf(get(NATIVE_STATE)).some(spec=>localPath(NATIVE_STATE,spec)===SHARED_VIEW)&&
    /globalThis\.INK_SIZE_DIALOG_VIEW\?\.renderNewDocumentSizeDialog/.test(get(NATIVE_STATE)),
    'REAL_NEW_DOCUMENT_VIEW_DRIFT');
  demand(/renderNewDocumentSizeDialogFromPublic\s*\(/.test(get(NATIVE_STATE))&&
    /INK_SIZE_DIALOG_VIEW\s*=\s*Object\.freeze/.test(get(SHARED_VIEW)),
    'REAL_NEW_DOCUMENT_VIEW_NOT_USED');
  demand(/export const ARTBOARD_PPI_MIN\s*=\s*36\b/.test(get(ARTBOARD_SOURCE))&&
    /export const ARTBOARD_PPI_MAX\s*=\s*2400\b/.test(get(ARTBOARD_SOURCE)),
    'NEW_DOCUMENT_PPI_BOUNDS_DRIFT');
  const brandView=get(SHARED_VIEW);
  demand(/INK_BRANDING_VIEW\s*=\s*Object\.freeze\(\{createBrandingView\}\)/.test(brandView)&&
    /export function registerInkPublicViews\s*\(/.test(brandView),
    'BRANDING_PURE_VIEW_EXPORT_MISSING');
  demand(!/\b(?:import\s*\(|require\s*\(|fetch\s*\(|localStorage|sessionStorage|FileReader|Blob|createObjectURL|XMLHttpRequest|indexedDB)\b/.test(brandView),
    'BRANDING_VIEW_IMPURE');
  demand(/INK_BRANDING_VIEW\?\.createBrandingView/.test(get(BRAND_CONTROLLER)),
    'REAL_BRANDING_VIEW_NOT_USED');
  demand(importsOf(get(UI+'shell.js')).some(spec=>
    localPath(UI+'shell.js',spec)===SHARED_VIEW)&&
    importsOf(get(NATIVE_WORKBENCH)).some(spec=>
      localPath(NATIVE_WORKBENCH,spec)===SAFE_TOOLBAR_UI)&&
    /presentation\?\.toolbarCustomizerView/.test(get(NATIVE_WORKBENCH)),
    'REAL_TOOLBAR_UI_SOURCE_DRIFT');
  demand(importsOf(get(SAFE_TOOLBAR_UI)).length===0,'SHARED_TOOLBAR_NATIVE_DEPENDENCY');
  demand(/storage\s*,\s*allowPresetFiles\s*=\s*true/.test(get(SAFE_TOOLBAR_UI)),
    'SHARED_TOOLBAR_SAFE_HOST_SEAM_MISSING');
  demand(!/\b(?:localStorage|sessionStorage|FileReader|Blob|createObjectURL|XMLHttpRequest|indexedDB|fetch\s*\()\b/.test(get(SHARED_VIEW))&&
    /toolbarCustomizerView\s*=\s*(?:\/\*\s*@__PURE__\s*\*\/\s*)?Object\.freeze/.test(get(SHARED_VIEW)),
    'TOOLBAR_VIEW_IMPURE');
  checkRealEntrypoint(get('index.html'),get(UI+'entry.js'),get('dist/startup/ink-shell.mjs'),get(BRAND_CONTROLLER));
  const reached=checkUiGraph(contents);
  const shared=LEASED.map(path=>({path,git_blob_sha:contents.get(path).blob}));
  const report={schema:'INK765_SAME_SOURCE_AUDIT_V1',scope,commit:reader.head,
    status:'PRESENTATION_SOURCE_PASS',sharedFiles:shared,esmReached:reached,
    previewOnlyStylesheet:{path:PREVIEW+'preview.css',git_blob_sha:contents.get(PREVIEW+'preview.css').blob},
    browserVisualParity:'NOT_VERIFIED_BY_STATIC_GUARD',
    previewHost:'MOCK_ONLY',realHost:'NATIVE_ONLY',
    sharedAuxiliaryFiles:['stage-runtime.css',SAFE_TOOLBAR_UI].map(path=>({path,git_blob_sha:contents.get(path).blob})),
    leasedViews:['new-document','branding','toolbar-customizer','dev1','dev3','more'].map(id=>({id,source:SHARED_VIEW,git_blob_sha:contents.get(SHARED_VIEW).blob})),
    excludedFromClaim:['Native tool registry/options','other Native size dialogs (canvas/PPI/artwork)','canvas/Renderer',
      'Native branding storage/files/export, Drive','unapproved Mobile Master redesign','visual pixel parity']};
  if(scope==='catalog'||scope==='full'){
    report.toolSnapshot=await checkFrozenToolSnapshot(reader,get(PREVIEW+'mock-host.js'));
    report.status='PRESENTATION_AND_CATALOG_PIN_PASS';
  }
  if(scope==='full'){
    // Source identity and a pinned display catalogue do not establish that
    // the real rendered shell, tool options or Native-owned surfaces match.
    // An independent, same-state Browser DOM/CSS/pixel/interaction receipt
    // remains mandatory before any complete 1:1 acceptance claim.
    throw new SameSourceError('FULL_BROWSER_PARITY_NOT_VERIFIED',
      'Native dialog/branding and complete Browser visual/interaction matrix are not attested');
  }
  return report;
}

async function main(argv){
  let root=resolve('.'),scope='presentation',expectedHead=null;
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--root')root=resolve(argv[++i]||'.');
    else if(argv[i]==='--scope')scope=argv[++i];
    else if(argv[i]==='--expected-head')expectedHead=argv[++i];
    else throw new SameSourceError('UNRECOGNIZED_ARGUMENT',argv[i]);
  }
  demand(!expectedHead||/^[a-f0-9]{40}$/.test(expectedHead),'EXPECTED_HEAD_INVALID');
  const result=await verifySameSource(makeGitReader(root),{scope,expectedHead});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main(process.argv.slice(2)).catch(error=>{
    process.stderr.write(JSON.stringify({status:'FAIL',code:error.code||'UNEXPECTED',detail:error.detail||error.message})+'\n');
    process.exitCode=1;
  });
}
