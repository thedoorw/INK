import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {makeGitReader} from './verify-same-source.mjs';

// Exact-blob review fixture for the isolated #765 candidate. Public UI source
// remains the edit authority; this snapshot checks that the corresponding
// Private Real-host candidate uses those same files. On the next intentional
// UI change, first reconcile and review both candidates, then renew the pins.
// This is NOT a release gate, proof of rendered pixel parity, or permission
// to treat the Private repository as a second UI implementation.
const PRIVATE_CANDIDATE='16771fca (isolated Private final seam candidate)';
const EXACT_MIRROR_BLOBS=Object.freeze({
 'index.html':'b1a14f8bb9c112f32200fc373ee2e623a2bd760b',
 'src/ui/branding-settings.js':'82226193cf277ab95740fdcdf251ebc260a4bb3d',
 'src/ui/branding-view.js':'6271b91a7cc13124d0c006aa36ce742584ce2801',
 'src/ui/ink017/markup.html':'6c1c7444a2056bb86b1d8e30c600640e79406bd7',
 'src/ui/ink017/shared-controls.js':'332b250f38caeefb460b00a350f7f7f5800f6021',
 'src/ui/ink017/shell.js':'6c40a4cbb3de04c022c7f865a51b2942e7732e89',
 'src/ui/ink017/tool-slices/dev1/options.js':'b040ae3edb5256b2568984469a991b0895b46ea0',
 'src/ui/ink017/tool-slices/dev3/tools-context-dev3.mjs':'12be3a89e31063eb504f631794add97f040d4894',
 'src/ui/ink017/tool-slices/toolbar-customizer.js':'e45568970b453401e604cea36894351a371bf233',
 'src/ui/ink017/tool-slices/toolbar-customizer-view.js':'7eb187090b38f2a3dfdfd7e5f333ec46c69b3217',
 'src/ui/ink017/tool-slices/workbench.js':'5a4e0b758871c603ebe74db803cf22b447a04334',
 'src/ui/minimal-test-shell/modules.js':'bcd41eaade55eb65d8ad3ac8435d944ffaa96d78',
 'src/ui/minimal-test-shell/size-dialog-view.js':'e3ddb1ce75ddc2952eb9c10d76be0c03706b43fb'
});

test('13/13 Public UI sources mirror the reviewed Private Real-host candidate',async()=>{
 const source=makeGitReader(resolve(import.meta.dirname,'../..'));
 const pairs=await Promise.all(Object.entries(EXACT_MIRROR_BLOBS).map(async([path,expected])=>{
  const file=await source.read(path);
  assert.equal(file.blob,expected,PRIVATE_CANDIDATE+' source mismatch: '+path);
  return[path,file.blob];
 }));
 assert.equal(pairs.length,13);
 assert.equal(new Set(pairs.map(([path])=>path)).size,13);
});
