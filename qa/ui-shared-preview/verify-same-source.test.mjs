import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {SameSourceError,makeGitReader,verifySameSource} from './verify-same-source.mjs';

const root=resolve(import.meta.dirname,'../..');
const ui='src/ui/ink017/';
const preview='preview/ink-ui-shared/';
const parts=[
 'markup.html','menu-ui.js','panels/adjustments.js','panels/brushes.js',
 'panels/character-typography.js','panels/character.js','panels/color.js',
 'panels/history.js','panels/layers.js','panels/navigator-zoom-curve.mjs',
 'panels/navigator.js','panels/paragraph.js','panels/paths.js',
 'panels/swatches.js','right-dock.js','shared-controls.js','shell.js','tokens.css'
];
const files=new Map();
for(const path of [...parts.map(x=>ui+x),ui+'tool-slices/toolbar-customizer.js',ui+'tool-slices/toolbar-customizer-view.js',ui+'tool-slices/workbench.js',
  'stage-runtime.css','src/ui/minimal-test-shell/size-dialog-view.js',
  'src/ui/minimal-test-shell/modules.js','src/document/artboard.js',
  'src/ui/branding-view.js','src/ui/branding-settings.js',preview+'index.html',
  preview+'preview-entry.js',preview+'mock-host.js']){
  files.set(path,await readFile(join(root,path),'utf8'));
}
const nativeToolSources=[
 'tool-slices/registry.js','tool-slices/completion-tools.js',
 'tool-slices/dev1/catalog.js','tool-slices/dev2/index.mjs',
 'tool-slices/dev3/tools-context-dev3.mjs'
].map(path=>ui+path);
const pins=new Map([...files.get(preview+'mock-host.js').matchAll(
 /['"](tool-slices\/[^'"]+)['"]\s*:\s*['"]([a-f0-9]{40})['"]/g
)].map(m=>[ui+m[1],m[2]]));
for(const path of nativeToolSources)files.set(path,'synthetic Native source placeholder');
// The local test fixture has the exact candidate Public presentation bytes.
// Three Real boot files are represented by their relevant immutable routing
// contracts because this partial source checkout excludes the Core bundle.
files.set('index.html',`<link rel="stylesheet" href="stage-runtime.css">
 <link rel="stylesheet" href="src/ui/ink017/tokens.css">
 <link rel="preload" href="src/ui/ink017/markup.html">
 <script src="src/ui/branding-view.js" defer></script>
 <script src="src/ui/branding-settings.js" defer></script>
 <script type="module" src="src/ui/minimal-test-shell/size-dialog-view.js"></script>
 <script type="module" src="dist/startup/ink-boot.mjs"></script>
 <script type="module" src="dist/startup/ink-shell.mjs"></script>`);
files.set(ui+'entry.js',`const markup=await fetch(new URL('./markup.html',import.meta.url));
 const {mountNativeShell}=await import(new URL('./shell.js',import.meta.url).href);`);
files.set('dist/startup/ink-shell.mjs',`const markup=await fetch(new URL("./markup.html",new URL("src/ui/ink017/entry.js",document.baseURI).href));
 const {mountNativeShell}=await import(new URL("./shell.js",new URL("src/ui/ink017/entry.js",document.baseURI).href).href);
 await mountNativeShell(createNativeHost(app),shell);`);
const blob=text=>{
 const bytes=Buffer.from(text);return createHash('sha1')
  .update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
};
const reader=(patch={})=>({
 head:'a'.repeat(40),
 async read(path){const text=patch[path]??files.get(path);
  assert.equal(typeof text,'string',`Missing test fixture: ${path}`);
  return{text,blob:(pins.has(path)&&!(path in patch))?pins.get(path):blob(text)};
 },
 async children(){return ['index.html','mock-host.js','preview-entry.js']}
});
const codeOf=async (updates={})=>{
 try{return (await verifySameSource(reader(updates))).status}
 catch(e){assert.ok(e instanceof SameSourceError,e.message);return e.code}
};

test('canonical 18-path presentation graph shares one path/blob',async()=>{
 const r=await verifySameSource(reader(),{scope:'presentation',expectedHead:'a'.repeat(40)});
 assert.equal(r.status,'PRESENTATION_SOURCE_PASS');
 assert.equal(r.sharedFiles.length,18);
 assert.ok(r.esmReached.includes(ui+'shell.js'));
 assert.ok(r.esmReached.includes(ui+'menu-ui.js'));
 assert.ok(r.esmReached.includes(ui+'panels/history.js'));
});
test('preview cannot redirect markup to a copied preview-owned HTML',async()=>{
 const path=preview+'preview-entry.js';
 const text=files.get(path).replace('../../src/ui/ink017/markup.html','./markup.html');
 assert.equal(await codeOf({[path]:text}),'PREVIEW_SOURCE_DRIFT');
});
test('preview cannot replace canonical stylesheet',async()=>{
 const path=preview+'index.html';
 const text=files.get(path).replace('../../src/ui/ink017/tokens.css','./tokens.css');
 assert.equal(await codeOf({[path]:text}),'PREVIEW_SOURCE_DRIFT');
});
test('Preview and Real must load canonical stage CSS for dialogs',async()=>{
 const path=preview+'index.html';
 const text=files.get(path).replace('../../stage-runtime.css','./stage-runtime.css');
 assert.equal(await codeOf({[path]:text}),'PREVIEW_SOURCE_DRIFT');
});
test('Preview and Real new-document UI must use one pure template',async()=>{
 const path='src/ui/minimal-test-shell/modules.js';
 const text=files.get(path).replace('globalThis.INK_SIZE_DIALOG_VIEW?.renderNewDocumentSizeDialog',
   'globalThis.INK_FAKE_VIEW?.renderNewDocumentSizeDialog');
 assert.notEqual(text,files.get(path));
 assert.equal(await codeOf({[path]:text}),'REAL_NEW_DOCUMENT_VIEW_DRIFT');
});
test('New-document view must not import Document or Storage',async()=>{
 const path='src/ui/minimal-test-shell/size-dialog-view.js';
 const text="import '../../document/size.js';\n"+files.get(path);
 assert.equal(await codeOf({[path]:text}),'NEW_DOCUMENT_VIEW_HAS_NATIVE_IMPORTS');
});
test('Preview and Real import the exact same Branding pure view',async()=>{
 const report=await verifySameSource(reader());
 assert.ok(report.sharedAuxiliaryFiles.some(item=>item.path==='src/ui/branding-view.js'));
 const path=preview+'index.html';
 const text=files.get(path).replace('../../src/ui/branding-view.js','./branding-view.js');
 assert.equal(await codeOf({[path]:text}),'PREVIEW_SOURCE_DRIFT');
});
test('Real branding controller must use the shared View and retain action boundary',async()=>{
 const path='src/ui/branding-settings.js';
 const text=files.get(path).replace('INK_BRANDING_VIEW?.createBrandingView','INK_BRANDING_LEGACY?.createBrandingView');
 assert.equal(await codeOf({[path]:text}),'REAL_BRANDING_VIEW_NOT_USED');
});
test('Branding pure view must never call network, storage or file APIs',async()=>{
 const path='src/ui/branding-view.js';
 const text=files.get(path)+'\nlocalStorage.setItem("test", "bad");';
 assert.equal(await codeOf({[path]:text}),'BRANDING_VIEW_IMPURE');
});
test('Mock branding view must disable upload/export and external navigation',async()=>{
 const path=preview+'preview-entry.js';
 const original=files.get(path);
 const text=original.replace("['logoChoose','logoInput','candidateButton']","['logoChoose','candidateButton']");
 assert.equal(await codeOf({[path]:text}),'MOCK_BRANDING_IO_CONTROLS_NOT_DISABLED');
 const text2=original.replace("event=>event.preventDefault()","event=>{}");
 assert.equal(await codeOf({[path]:text2}),'MOCK_BRANDING_EXTERNAL_LINK_NOT_GATED');
});
test('preview cannot inline a second copy of the shell markup',async()=>{
 const path=preview+'index.html';
 const text=files.get(path).replace('<div id="app"></div>',
  '<div id="app"><div id="shell"></div></div>');
 assert.equal(await codeOf({[path]:text}),'COPIED_SHELL_MARKUP');
});
test('preview-only CSS cannot override real Dock geometry',async()=>{
 const path=preview+'index.html';
 const text=files.get(path).replace('</style>', '.dock-zone{width:123px}</style>');
 assert.equal(await codeOf({[path]:text}),'PREVIEW_UI_CSS_COPY');
});
test('Mock must not import Native tool registry / Core',async()=>{
 const path=preview+'mock-host.js';
 const text=`import {TOOL_GROUPS} from '../../src/ui/ink017/tool-slices/registry.js';\n`+files.get(path);
 assert.equal(await codeOf({[path]:text}),'MOCK_IMPORTS_CORE_OR_UI');
});
test('Mock toolbar customizer must use memory and disable file IO',async()=>{
 const path=preview+'mock-host.js';
 const text=files.get(path).replace('allowPresetFiles:false','allowPresetFiles:true');
 assert.equal(await codeOf({[path]:text}),'MOCK_TOOLBAR_IO_SEAM_MISSING');
});
test('shared toolbar UI renderer must not acquire Native dependencies',async()=>{
 const path=ui+'tool-slices/toolbar-customizer.js';
 const text="import '../../document/storage.js';\n"+files.get(path);
 assert.equal(await codeOf({[path]:text}),'SHARED_TOOLBAR_NATIVE_DEPENDENCY');
});
test('Real workbench must consume the toolbar View injected by Public Shell',async()=>{
 const path=ui+'tool-slices/workbench.js';
 const text=files.get(path).replace('presentation?.toolbarCustomizerView','presentation?.differentView');
 assert.notEqual(text,files.get(path));
 assert.equal(await codeOf({[path]:text}),'REAL_TOOLBAR_UI_SOURCE_DRIFT');
});
test('Real-only WORK extension must stay gated away from Mock',async()=>{
 const path=ui+'menu-ui.js';
 const text=files.get(path).replace(
  "if(!host.menuApi.isCurrentRuntime())throw Error('INK_WORK_RUNTIME_IDENTITY_MISMATCH');",'');
 assert.notEqual(text,files.get(path));
 assert.equal(await codeOf({[path]:text}),'UI_REAL_EXTENSION_NOT_GATED');
});
test('compiled Real entry must load same exact shell.js',async()=>{
 const path='dist/startup/ink-shell.mjs';
 const text=files.get(path).replace('./shell.js','./other-shell.js');
 assert.equal(await codeOf({[path]:text}),'BUNDLE_UI_URL_DRIFT');
});
test('display-only Native catalog snapshot is pinned to five exact blobs and groups',async()=>{
 const r=await verifySameSource(reader(),{scope:'catalog'});
 assert.equal(r.status,'PRESENTATION_AND_CATALOG_PIN_PASS');
 assert.equal(r.toolSnapshot.groupIds.length,20);
 assert.equal(r.toolSnapshot.nativeSourceBlobs.length,5);
 assert.equal(r.browserVisualParity,'NOT_VERIFIED_BY_STATIC_GUARD');
});
test('Native tool module changed without fixture update fails closed',async()=>{
 await assert.rejects(verifySameSource(reader({[ui+'tool-slices/dev2/index.mjs']:'changed Native tool definitions'}),{scope:'catalog'}),error=>
  error instanceof SameSourceError&&error.code==='TOOL_SOURCE_BLOB_DRIFT');
});
test('Mock may not remove or reorder any of the 20 pinned groups',async()=>{
 const path=preview+'mock-host.js';
 const text=files.get(path).replace("row('select','選取／移動'","row('other','選取／移動'");
 await assert.rejects(verifySameSource(reader({[path]:text}),{scope:'catalog'}),error=>
  error instanceof SameSourceError&&error.code==='TOOL_SNAPSHOT_GROUP_DRIFT');
});
test('full 1:1 claim requires paired Browser fidelity evidence beyond static source',async()=>{
 await assert.rejects(verifySameSource(reader(),{scope:'full'}),error=>
  error instanceof SameSourceError&&error.code==='FULL_BROWSER_PARITY_NOT_VERIFIED');
});
test('Mock cannot silently add real storage or network dependencies',async()=>{
 const path=preview+'mock-host.js';
 const text=files.get(path)+'\nlocalStorage.setItem("test", "x");\n';
 assert.equal(await codeOf({[path]:text}),'MOCK_REAL_IO_FORBIDDEN');
});
test('a moved exact HEAD fails before same-source claims',async()=>{
 await assert.rejects(verifySameSource(reader(),{expectedHead:'b'.repeat(40)}),error=>
  error instanceof SameSourceError&&error.code==='HEAD_DRIFT');
});
test('Git reader rejects a working file that differs from exact HEAD blob',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ink765-blob-'));
 const git=(...args)=>execFileSync('git',['-C',dir,...args],{stdio:'pipe'});
 try{
  git('init','-q');
  await writeFile(join(dir,'sample.txt'),'source at HEAD\n');
  git('add','sample.txt');
  git('-c','user.name=INK-QA','-c','user.email=ink@example.invalid','commit','-qm','fixture');
  const exact=makeGitReader(dir);
  assert.match(exact.head,/^[a-f0-9]{40}$/);
  assert.equal((await exact.read('sample.txt')).text,'source at HEAD\n');
  await writeFile(join(dir,'sample.txt'),'modified without commit\n');
  await assert.rejects(exact.read('sample.txt'),error=>
    error instanceof SameSourceError&&error.code==='GIT_BLOB_DRIFT');
 }finally{await rm(dir,{recursive:true,force:true})}
});
