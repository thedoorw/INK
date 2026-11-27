import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import test from 'node:test';

// Import the Mock in an isolated data module. This intentionally requires no
// DOM, Browser, Native registry, Core, local storage, network or test Runner.
const path=resolve(fileURLToPath(new URL('.',import.meta.url)),'../../preview/ink-ui-shared/mock-host.js');
const source=readFileSync(path,'utf8');
const injected='\nexport { fixtures, NATIVE_TOOL_SOURCE_BLOBS };';
const mock=await import('data:text/javascript;base64,'+Buffer.from(source+injected).toString('base64'));

test('Mock catalog is exactly the pinned 20 Native display groups / 41 items',()=>{
 const ids=['select','marquee','lasso','wand','crop','eyedropper','drawing','healing','stamp','eraser','fill','local','tone','vector-pen','text','nodes','shape','guide','pan','zoom'];
 assert.deepEqual(mock.fixtures.map(group=>group.id),ids);
 assert.equal(mock.fixtures.flatMap(group=>group.items).length,41);
 assert.equal(Object.keys(mock.NATIVE_TOOL_SOURCE_BLOBS).length,5);
 assert.ok(Object.values(mock.NATIVE_TOOL_SOURCE_BLOBS).every(sha=>/^[0-9a-f]{40}$/.test(sha)));
 for(const group of mock.fixtures){
  assert.ok(group.label&&group.items.length>0,group.id);
  for(const item of group.items)assert.match(item.icon,/^<svg\b[^>]+>[\s\S]*<\/svg>$/);
 }
});

test('empty fixture is no-document with Real default Pen and no capabilities',()=>{
 const host=mock.createMockHost();
 assert.equal(host.setFixture('empty'),'empty');
 const state=host.getSnapshot();
 assert.deepEqual(state.docs,[]);
 assert.equal(state.activeDoc,null);
 assert.equal(state.object,null);
 assert.equal(state.tool,'pen');
 assert.equal(state.capabilities.foreground,false);
 assert.equal(host.getHistory().index,0);
 host.dispose();
});

test('fresh A4 fixture is one clean layer, 210×297 mm at 300 PPI',()=>{
 const host=mock.createMockHost();
 host.setFixture('a4');
 const state=host.getSnapshot(),doc=state.docs[0];
 assert.equal(state.activeDoc,doc.id);
 assert.equal(doc.width,210);
 assert.equal(doc.height,297);
 assert.equal(doc.ppi,300);
 assert.equal(doc.units,'mm');
 assert.equal(doc.layers.length,1);
 assert.equal(doc.selection,doc.layers[0].id);
 assert.equal(state.object,null);
 assert.equal(host.getHistory().index,0);
 host.dispose();
});

test('selection, image, text, locked and history fixtures are distinct and repeatable',()=>{
 const host=mock.createMockHost();
 for(const name of ['selection','image','text','locked','history']){
  assert.equal(host.setFixture(name),name);
  assert.equal(host.getSnapshot().docs.length,1);
  assert.ok(host.getSnapshot().object);
 }
 host.setFixture('selection');
 assert.equal(host.getSnapshot().object.type,'path');
 assert.equal(host.getHistory().entries.at(-1).label,'繪製幾何');
 assert.equal(host.getHistory().index,1);
 host.setFixture('image');
 assert.equal(host.getSnapshot().object.type,'image');
 assert.equal(host.getSnapshot().object.raster.width,800);
 host.setFixture('text');
 assert.equal(host.getSnapshot().object.type,'text');
 host.setFixture('locked');
 const state=host.getSnapshot(),doc=state.docs[0];
 assert.equal(state.object.locked,true);
 assert.equal(doc.layers.find(layer=>layer.id===doc.selection).locked,true);
 host.setFixture('history');
 assert.deepEqual(host.getHistory().entries.map(entry=>entry.index),[0,1,2,3]);
 assert.equal(host.getHistory().index,3);
 host.dispose();
});

test('Mock History is in-memory and Undo / Redo never invokes Native',async()=>{
 const host=mock.createMockHost();
 host.setFixture('history');
 await host.execute('history.undo.v1');
 assert.equal(host.getHistory().index,2);
 await host.execute('history.redo.v1');
 assert.equal(host.getHistory().index,3);
 host.dispatch({type:'history.jump',index:1});
 assert.equal(host.getHistory().index,1);
 host.setFixture('history');
 assert.equal(host.getHistory().index,3);
 host.dispose();
});

test('Mock blocks Native save, Drive, export, and unsupported command routes',async()=>{
 const host=mock.createMockHost();
 const save=await host.execute('document.save.v1');
 assert.equal(save.ok,false);
 assert.equal(save.error.code,'MOCK_NO_NATIVE');
 assert.equal(host.dispatch({type:'document.save'}).error.code,'MOCK_UNSUPPORTED');
 assert.deepEqual(await host.shellApi.openDrivePanel(),{ok:false,code:'MOCK_DRIVE_DISABLED'});
 assert.deepEqual(await host.shellApi.exportArtboard(),{completed:false});
 assert.doesNotMatch(source,/\blocalStorage\s*\.|\bindexedDB\s*\.|\bserviceWorker\s*\.|\bfetch\s*\(/);
 assert.doesNotMatch(source,/\bimport\s*\(|\bfrom\s*['"][^'"]*(?:native-host|document\/storage|vector-core|registry\.js)/);
 host.dispose();
});

test('Mock snapshots are detached, and invalid fixture falls back to A4',()=>{
 const host=mock.createMockHost();
 const snapshot=host.getSnapshot();
 snapshot.docs[0].layers[0].name='mutated outside';
 assert.notEqual(host.getSnapshot().docs[0].layers[0].name,'mutated outside');
 assert.equal(host.setFixture('unrecognized'),'a4');
 assert.equal(host.getSnapshot().docs[0].width,210);
 host.dispose();
});
