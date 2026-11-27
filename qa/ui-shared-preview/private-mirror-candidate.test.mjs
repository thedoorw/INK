import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {makeGitReader} from './verify-same-source.mjs';

// All 18 existing V2 leased UI files have been compared byte-for-byte with
// an independently assembled Private native candidate derived from 16771fca.
// This is a local source proof, NOT a remote Private commit, release gate,
// Browser pixel receipt, or authorization to publish.
const PRIVATE_CANDIDATE='Private167-derived V2-only Core candidate (unpublished)';
const EXACT_MIRROR_BLOBS=Object.freeze({
 'src/ui/ink017/markup.html':'6c1c7444a2056bb86b1d8e30c600640e79406bd7',
 'src/ui/ink017/menu-ui.js':'363c64075e6de8a7ac1c12944b3cd68e7b9781b9',
 'src/ui/ink017/panels/adjustments.js':'62b3c31e127e269d6e21bc43540f101e4b74a79a',
 'src/ui/ink017/panels/brushes.js':'8a663a6a1b00499776536f6d05e7a17c71a61ce2',
 'src/ui/ink017/panels/character-typography.js':'eeba1bf67e97bc24f2d02cdd76f7570041dc9f6b',
 'src/ui/ink017/panels/character.js':'4b0c51dbdf4e97c0150085bc21ee368c09a8f72e',
 'src/ui/ink017/panels/color.js':'9ee6f11483cbf98feba6662267d3186996b3b9b5',
 'src/ui/ink017/panels/history.js':'17a4123bdc810361038558e4fed2a49e9f49a709',
 'src/ui/ink017/panels/layers.js':'d5664227aca0af19f7adb4f656616f4ffaca8665',
 'src/ui/ink017/panels/navigator-zoom-curve.mjs':'f6c2da784fd7e7e2d5c35c8539806313a3a99aa1',
 'src/ui/ink017/panels/navigator.js':'c09aae766b9e36225beaaf1a1805aebc9c138891',
 'src/ui/ink017/panels/paragraph.js':'45a410e95a4b4dff1553256a62b504dcaa56775f',
 'src/ui/ink017/panels/paths.js':'6ef3623a8f418bfdf444eee081ed634b8880f7a8',
 'src/ui/ink017/panels/swatches.js':'89c5fc17b9bccff62bdca1d441d0111dc8a79251',
 'src/ui/ink017/right-dock.js':'c594a1da258c749e59ff59ab27b83db28788b184',
 'src/ui/ink017/shared-controls.js':'45ce95593ea1facfc1eeb5bfff251c250d307d06',
 'src/ui/ink017/shell.js':'34abf11ebea920804e744ecec7ed3ede331d8008',
 'src/ui/ink017/tokens.css':'771886b82339d8c387b15b2fef1cd68b340c02cb'
});

test('18/18 leased Public UI sources mirror the isolated Private Real-host candidate',async()=>{
 const source=makeGitReader(resolve(import.meta.dirname,'../..'));
 const pairs=await Promise.all(Object.entries(EXACT_MIRROR_BLOBS).map(async([path,expected])=>{
  const file=await source.read(path);
  assert.equal(file.blob,expected,PRIVATE_CANDIDATE+' source mismatch: '+path);
  return[path,file.blob];
 }));
 assert.equal(pairs.length,18);
 assert.equal(new Set(pairs.map(([path])=>path)).size,18);
});
