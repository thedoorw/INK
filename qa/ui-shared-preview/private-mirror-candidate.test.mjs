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
const PRIVATE_CANDIDATE='c5441a8359f3a5ab7c613568eb53cdd0b0e85e21';
const EXACT_MIRROR_BLOBS=Object.freeze({
 'index.html':'3efa32c3091696ddc3872be78241a9bc3e109113',
 'src/ui/branding-settings.js':'82226193cf277ab95740fdcdf251ebc260a4bb3d',
 'src/ui/branding-view.js':'6271b91a7cc13124d0c006aa36ce742584ce2801',
 'src/ui/ink017/markup.html':'6c1c7444a2056bb86b1d8e30c600640e79406bd7',
 'src/ui/ink017/shared-controls.js':'332b250f38caeefb460b00a350f7f7f5800f6021',
 'src/ui/ink017/shell.js':'6e8c6a7749e66f45350c165b0a40b7bd05d4c1f9',
 'src/ui/ink017/tool-slices/dev1/options.js':'2fdcde7b2d64489693ba244e77d4a74817cea62e',
 'src/ui/ink017/tool-slices/dev3/tools-context-dev3.mjs':'3db1fbfa2d337c54eafff055f5369026b6e60234',
 'src/ui/ink017/tool-slices/toolbar-customizer.js':'9b11beae2c180f0ef2cd52ea30d8aa88dc4abeb0',
 'src/ui/ink017/tool-slices/workbench.js':'0053ab267556e94f4e3e1fdf96e1184a2304436e',
 'src/ui/minimal-test-shell/modules.js':'2f7e7e33dda79431e18c2756d05565f30d9fd75d',
 'src/ui/minimal-test-shell/size-dialog-view.js':'a4f2d2b3b666368cda5ed37f2315a3ab5af905d9'
});

test('12/12 Public UI sources mirror the reviewed Private Real-host candidate',async()=>{
 const source=makeGitReader(resolve(import.meta.dirname,'../..'));
 const pairs=await Promise.all(Object.entries(EXACT_MIRROR_BLOBS).map(async([path,expected])=>{
  const file=await source.read(path);
  assert.equal(file.blob,expected,PRIVATE_CANDIDATE+' source mismatch: '+path);
  return[path,file.blob];
 }));
 assert.equal(pairs.length,12);
 assert.equal(new Set(pairs.map(([path])=>path)).size,12);
});
