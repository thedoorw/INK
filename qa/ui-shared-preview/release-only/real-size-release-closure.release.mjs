import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';

// Strict release-only checks. The design branch deliberately has neither a
// rebuilt Private Core bundle nor an updated Service Worker manifest. Never
// fold these assertions into the catalog-only design profile or skip them:
// a release candidate must explicitly invoke this test profile and pass.
const base=resolve(import.meta.dirname,'../../..');
const read=path=>readFileSync(resolve(base,path),'utf8');

test('Real release Service Worker caches the external New Document UI view',()=>{
 assert.match(read('service-worker-runtime.js'),/\.\/src\/ui\/minimal-test-shell\/size-dialog-view\.js/);
 assert.match(read('service-worker-runtime.js'),/\.\/src\/ui\/ink017\/tool-slices\/toolbar-customizer-view\.js/);
});

test('compiled Private Core resolves the Public view without a bundled duplicate',()=>{
 const moduleSource=read('src/ui/minimal-test-shell/modules.js');
 assert.doesNotMatch(moduleSource,/from ['"]\.\/size-dialog-view\.js['"]/);
 const bundles=['dist/startup/ink-boot.mjs','dist/startup/ink-shell.mjs',
  ...readdirSync(resolve(base,'dist/startup/chunks')).map(name=>'dist/startup/chunks/'+name)]
  .map(read).join('\n');
 assert.ok(bundles.includes('INK_SIZE_DIALOG_VIEW'));
 assert.ok(!bundles.includes('ink-new-orientation'));
 assert.ok(!bundles.includes('Local preset'));
});
