import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {renderNewDocumentSizeDialog} from '../../src/ui/minimal-test-shell/size-dialog-view.js';
import {renderNewDocumentSizeDialogFromPublic} from '../../src/ui/minimal-test-shell/modules.js';

const base=resolve(import.meta.dirname,'../..');
const read=path=>readFileSync(resolve(base,path),'utf8');

test('Native size controller invokes the exact external Public view function',()=>{
 assert.equal(globalThis.INK_SIZE_DIALOG_VIEW?.renderNewDocumentSizeDialog,renderNewDocumentSizeDialog);
 const options={ppiMin:36,ppiMax:2400,presetOptions:'<option value="0">A4</option>'};
 assert.equal(renderNewDocumentSizeDialogFromPublic(options),renderNewDocumentSizeDialog(options));
});

test('missing Public view fails closed rather than falling back to compiled markup',()=>{
 const original=globalThis.INK_SIZE_DIALOG_VIEW;
 try{
  globalThis.INK_SIZE_DIALOG_VIEW=null;
  assert.throws(()=>renderNewDocumentSizeDialogFromPublic({ppiMin:36,ppiMax:2400}),/INK_NEW_DOCUMENT_VIEW_NOT_LOADED/);
 }finally{globalThis.INK_SIZE_DIALOG_VIEW=original;}
});

test('Real entry schedules external view before compiled Core bootstrap',()=>{
 const entry=read('index.html');
 const view='<script type="module" src="src/ui/minimal-test-shell/size-dialog-view.js"></script>';
 const boot='<script type="module" src="dist/startup/ink-boot.mjs"></script>';
 assert.ok(entry.indexOf(view)>0,'Real external view module is listed');
 assert.ok(entry.indexOf(view)<entry.indexOf(boot),'View ESM must precede compiled Core');
});

test('Branding already loads its one pure view before the native IO controller',()=>{
 const entry=read('index.html');
 const view='<script src="src/ui/branding-view.js" defer></script>';
 const controller='<script src="src/ui/branding-settings.js" defer></script>';
 assert.ok(entry.indexOf(view)>0&&entry.indexOf(view)<entry.indexOf(controller));
 assert.match(read('src/ui/branding-settings.js'),/INK_BRANDING_VIEW\?\.createBrandingView/);
 assert.doesNotMatch(read('src/ui/branding-view.js'),/localStorage|fetch\(|XMLHttpRequest|\.click\(\)|Drive\b/);
});
