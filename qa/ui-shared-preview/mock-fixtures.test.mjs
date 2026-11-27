import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import test from 'node:test';

// Import the fixture state in an isolated data module. The pure toolbar view
// mount is intentionally a no-op here: these assertions never mount a DOM,
// while the separate same-source tests verify the actual shared import.
const path=resolve(fileURLToPath(new URL('.',import.meta.url)),'../../preview/ink-ui-shared/mock-host.js');
const source=readFileSync(path,'utf8');
const injected='\nexport { fixtures, NATIVE_TOOL_SOURCE_BLOBS };';
const isolated=source.replace(/^import \{mountToolbarCustomizer\} from '[^']+';$/m,
 'const mountToolbarCustomizer=()=>({dispose(){}});');
assert.notEqual(isolated,source,'toolbar shared view must be imported by Mock');
const mock=await import('data:text/javascript;base64,'+Buffer.from(isolated+injected).toString('base64'));

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

test('Mock Navigator renders a real in-memory A4 bitmap and full-page viewport',()=>{
 const previous=globalThis.document,paints=[];
 let canvases=0;
 globalThis.document={createElement(tag){
  assert.equal(tag,'canvas');canvases++;
  return{width:0,height:0,getContext(kind){
   assert.equal(kind,'2d');return{clearRect:(...args)=>paints.push(['clear',...args]),
    fillRect(...args){paints.push(['paper',this.fillStyle,...args])}};
  },toDataURL(type){assert.equal(type,'image/png');return'data:image/png;base64,cG5n'}};
 }};
 try{
  const host=mock.createMockHost();
  const preview=host.select('page.preview',{width:152,height:215});
  assert.equal(preview.width,152);
  assert.equal(preview.height,215);
  assert.match(preview.dataUrl,/^data:image\/png;base64,/);
  assert.equal(preview.pageId,'mock-page');
  assert.equal(preview.padding,7);
  assert.equal(preview.fitBounds.w,210*96/25.4);
  assert.equal(preview.fitBounds.h,297*96/25.4);
  assert.equal(paints[1][1],'#fffef9');
  assert.ok(paints[1][4]>100&&paints[1][5]>190,'paint the full paper, not a placeholder label');
  const polygon=host.navigator.read(preview);
  assert.equal(polygon.length,4);
  assert.ok(polygon[0][0]>0&&polygon[0][1]>0);
  assert.equal(polygon[0][0],(preview.width-preview.fitBounds.w*preview.scale)/2);
  assert.deepEqual(host.select('page.preview',{width:152,height:215}),preview);
  assert.equal(canvases,1,'same-size thumbnail remains in memory');
  host.dispatch({type:'camera.patch',patch:{zoom:200},source:'test'});
  const zoomed=host.navigator.read(preview);
  assert.notDeepEqual(zoomed,polygon,'zoom must shrink the visible viewport');
  assert.ok(zoomed[2][0]-zoomed[0][0]<(polygon[2][0]-polygon[0][0])*.6);
  const pan=host.navigator.pan({offsetX:8,offsetY:12,originX:0,originY:0,scale:preview.scale});
  assert.equal(pan.ok,true);
  assert.ok(host.getSnapshot().docs[0].camera.x<0);
  assert.ok(host.getSnapshot().docs[0].camera.y<0);
  const panned=host.navigator.read(preview);
  assert.ok(panned[0][0]>zoomed[0][0]&&panned[0][1]>zoomed[0][1],
   'pan must move the viewport, not just mutate hidden camera state');
  host.setFixture('history');
  assert.equal(host.getSnapshot().docs[0].camera.zoom,100);
  const refreshed=host.select('page.preview',{width:152,height:215});
  assert.match(refreshed.dataUrl,/^data:image\/png;base64,/);
  assert.equal(canvases,2,'new fixture must rebuild a fresh PNG despite unchanged size');
  assert.deepEqual(host.navigator.read(refreshed),polygon,'new fixture resets viewport to entire page');
  host.setFixture('empty');
  assert.equal(host.select('page.preview',{width:152,height:215}),null);
  assert.equal(host.navigator.read(preview),null);
  assert.equal(host.navigator.pan({offsetX:0,offsetY:0,originX:0,originY:0,scale:1}).ok,false);
  host.dispose();
 }finally{
  if(previous===undefined)delete globalThis.document;else globalThis.document=previous;
 }
});

test('Mock A4 fit follows Native viewport geometry on desktop and narrow screens',async()=>{
 const host=mock.createMockHost();
 const worldW=210*96/25.4,worldH=297*96/25.4;
 const preview={width:152,height:215,fitBounds:{x:-worldW/2,y:-worldH/2,w:worldW,h:worldH},
  scale:Math.min((152-14)/worldW,(215-14)/worldH)};
 for(const viewport of [{width:1077,height:936},{width:740,height:600},{width:310,height:620}]){
  host.setFixture('a4',viewport);
  const fitted=Math.max(3,Math.min(1200,100*Math.min((viewport.width-112)/worldW,(viewport.height-112)/worldH)));
  assert.equal(host.getSnapshot().docs[0].camera.zoom,fitted);
  const paperW=worldW*fitted/100,paperH=worldH*fitted/100;
  assert.ok(paperW<=viewport.width-112+1e-8&&paperH<=viewport.height-112+1e-8);
  const full=host.navigator.read(preview);
  assert.ok(Math.abs(full[0][0]-(preview.width-worldW*preview.scale)/2)<1e-8);
  host.dispatch({type:'camera.patch',patch:{zoom:fitted*2}});
  const zoomed=host.navigator.read(preview);
  assert.notDeepEqual(zoomed,full,'viewport zoom must change the polygon for '+JSON.stringify(viewport));
  host.navigator.pan({offsetX:10,offsetY:8,originX:0,originY:0,scale:preview.scale});
  assert.notDeepEqual(host.navigator.read(preview),zoomed,'pan must move the polygon');
  await host.execute('view.fit.artboard.v1');
  assert.equal(host.getSnapshot().docs[0].camera.zoom,fitted);
  assert.deepEqual(host.navigator.read(preview),full,'fit must restore the entire paper');
 }
 host.dispose();
});

test('Mock viewport resize retains active fixture, camera, and History',async()=>{
 const host=mock.createMockHost();
 host.setFixture('history',{width:1077,height:936});
 host.dispatch({type:'camera.patch',patch:{zoom:139.5,x:12,y:-9}});
 await host.execute('history.undo.v1');
 const before=host.getSnapshot(),history=host.getHistory();
 let notifications=0;
 const unsubscribe=host.subscribe(()=>notifications++);
 const fitted=host.resizeViewport({width:740,height:600});
 assert.equal(fitted,100*Math.min((740-112)/(210*96/25.4),(600-112)/(297*96/25.4)));
 assert.deepEqual(host.getSnapshot(),before,'resize may not reset fixture or camera');
 assert.deepEqual(host.getHistory(),history,'resize may not reset the undo timeline');
 assert.equal(notifications,1);
 host.resizeViewport({width:740,height:600});
 assert.equal(notifications,1,'same-size ResizeObserver notification must be a no-op');
 await host.execute('view.fit.artboard.v1');
 assert.equal(host.getSnapshot().docs[0].camera.zoom,fitted,'Fit uses latest viewport');
 assert.equal(host.getSnapshot().docs[0].camera.x,0);
 assert.equal(host.getSnapshot().docs[0].camera.y,0);
 unsubscribe();host.dispose();
});

test('Mock zoom matches Native fractional precision and 3–12800% clamp',async()=>{
 const host=mock.createMockHost();
 host.dispatch({type:'camera.patch',patch:{zoom:73.406285}});
 await host.execute('view.zoom.by.v1',{factor:1.2});
 assert.equal(host.getSnapshot().docs[0].camera.zoom,73.406285*1.2);
 await host.execute('view.zoom.set.v1',{scale:128*2});
 assert.equal(host.getSnapshot().docs[0].camera.zoom,12800);
 await host.execute('view.zoom.by.v1',{factor:.00001});
 assert.equal(host.getSnapshot().docs[0].camera.zoom,3);
 host.dispose();
});

test('Mock frame and responsive stage use CSSOM without copying Public layout CSS',()=>{
 const entry=readFileSync(resolve(fileURLToPath(new URL('.',import.meta.url)),
  '../../preview/ink-ui-shared/preview-entry.js'),'utf8');
 assert.match(entry,/new ResizeObserver\(/);
 assert.match(entry,/host\.resizeViewport\(/);
 assert.match(entry,/stage\.style\.width=/);
 assert.match(entry,/stage\.style\.height=/);
 assert.match(entry,/stage\.style\.transform=/);
 assert.match(entry,/stage\.style\.outline=/);
 assert.match(entry,/stage\.style\.boxShadow=/);
 assert.doesNotMatch(entry,/stage\.style\.border\s*=/);
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
