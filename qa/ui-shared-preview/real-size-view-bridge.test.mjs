import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {registerInkPublicViews,renderNewDocumentSizeDialog} from '../../src/ui/ink017/shared-controls.js';
import {renderNewDocumentSizeDialogFromPublic} from '../../src/ui/minimal-test-shell/modules.js';

const base=resolve(import.meta.dirname,'../..');
const read=path=>readFileSync(resolve(base,path),'utf8');
registerInkPublicViews();

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
 const view='<script type="module" src="src/ui/branding-settings.js"></script>';
 const boot='<script type="module" src="dist/startup/ink-boot.mjs"></script>';
 assert.ok(entry.indexOf(view)>0,'Real external view module is listed');
 assert.ok(entry.indexOf(view)<entry.indexOf(boot),'View ESM must precede compiled Core');
});

test('Branding module registers the leased view before the native IO controller',()=>{
 const entry=read('index.html');
 const controller='<script type="module" src="src/ui/branding-settings.js"></script>';
 assert.ok(entry.indexOf(controller)>0);
 const source=read('src/ui/branding-settings.js');
 assert.match(source,/import\s*\{registerInkPublicViews\}\s*from/);
 assert.match(source,/registerInkPublicViews\(\)/);
 assert.match(source,/INK_BRANDING_VIEW\?\.createBrandingView/);
 assert.match(read('src/ui/ink017/shared-controls.js'),/INK_BRANDING_VIEW=Object\.freeze\(\{createBrandingView\}\)/);
});
