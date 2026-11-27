import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderDev1DrawingOptions,renderDev3ShapeOptions,arrangeToolOptions} from '../../src/ui/ink017/shared-controls.js';
import {createMockHost} from '../../preview/ink-ui-shared/mock-host.js';

test('the Public drawing-option renderer generates Native field identifiers',()=>{
 const html=renderDev1DrawingOptions('手繪筆',{size:2,opacity:1,smoothing:.66,pressure:.15,taper:.04});
 assert.match(html,/aria-label="手繪筆 parameters"/);
 assert.deepEqual([...html.matchAll(/data-key="dev1:([^"]+)"/g)].map(m=>m[1]),
  ['size','opacity','smoothing','pressure','taper']);
 assert.match(html,/aria-label="Size px"[^>]*type="number" value="2"/);
 assert.match(html,/aria-label="Opacity %"[^>]*type="number" value="100"/);
 assert.match(html,/aria-label="Smoothing %"[^>]*type="number" value="66"/);
 assert.match(html,/min="1" max="300"/);
});

test('Mock display values change only in memory',()=>{
 const host=createMockHost();
 host.setFixture('a4');
 assert.deepEqual(host.select('tool.settings'),{size:2,opacity:1,smoothing:.66,pressure:.15,taper:.04});
 assert.equal(host.dispatch({type:'tool.option',key:'pen.size',value:27}).ok,true);
 assert.equal(host.dispatch({type:'tool.option',key:'pen.opacity',value:.55}).ok,true);
 assert.equal(host.select('tool.settings').size,27);
 assert.equal(host.select('tool.settings').opacity,.55);
 host.setFixture('a4');
 assert.equal(host.select('tool.settings').size,2);
});

test('Shape line renderer preserves Native fields and selection order',()=>{
 const html=renderDev3ShapeOptions({shapeType:'line',shapeFill:false},{
  type:'shape',locked:false,w:80,h:90,rotate:0,fill:'#d7eafa'
 });
 assert.match(html,/aria-label="Shape defaults and selected object"/);
 assert.deepEqual([...html.matchAll(/data-key="([^"]+)"/g)].map(m=>m[1]),
  ['shape:type','shape:defaultFill','shape:w','shape:h','shape:rotate','shape:fill']);
 assert.match(html,/data-key="shape:type"[^>]*aria-label="Shape"/);
 assert.match(html,/data-key="shape:fill"[^>]*aria-label="Object fill"/);
 assert.match(html,/min="-360000" max="360000"/);
 const locked=renderDev3ShapeOptions({shapeType:'line',shapeFill:true},{locked:true,w:20,h:30,rotate:5,fill:'#000000'});
 assert.match(locked,/<fieldset disabled>/);
});

test('Mock Shape option changes remain isolated from Native',()=>{
 const host=createMockHost();
 assert.equal(host.setFixture('shape'),'shape');
 assert.equal(host.getSnapshot().object.type,'shape');
 assert.deepEqual(host.select('tool.options'),{shapeType:'line',shapeFill:false});
 host.dispatch({type:'tool.option',key:'shape:type',value:'rect'});
 host.dispatch({type:'tool.option',key:'shape:defaultFill',value:'On'});
 host.dispatch({type:'tool.option',key:'shape:w',value:120});
 host.dispatch({type:'tool.option',key:'shape:fill',value:'#ff0000'});
 assert.deepEqual(host.select('tool.options'),{shapeType:'rect',shapeFill:true});
 assert.equal(host.getSnapshot().object.w,120);
 assert.equal(host.getSnapshot().object.fill,'#ff0000');
 host.setFixture('shape');
 assert.deepEqual(host.select('tool.options'),{shapeType:'line',shapeFill:false});
});

test('both Native and Mock source paths use one Public renderer',async()=>{
 const native=await readFile(new URL('../../src/ui/ink017/tool-slices/dev1/options.js',import.meta.url),'utf8');
 const mock=await readFile(new URL('../../preview/ink-ui-shared/mock-host.js',import.meta.url),'utf8');
 const shell=await readFile(new URL('../../src/ui/ink017/shell.js',import.meta.url),'utf8');
 const dev3=await readFile(new URL('../../src/ui/ink017/tool-slices/dev3/tools-context-dev3.mjs',import.meta.url),'utf8');
 const workbench=await readFile(new URL('../../src/ui/ink017/tool-slices/workbench.js',import.meta.url),'utf8');
 assert.match(native,/renderDev1DrawingOptions\(cfg\.label,settings\)/);
 assert.match(mock,/presentation\.renderDev1DrawingOptions\(item\.label,select\('tool\.settings'\)\)/);
 assert.match(shell,/renderDev1DrawingOptions,renderDev3ShapeOptions,arrangeToolOptions,decorateToolOptions/);
 assert.match(dev3,/renderDev3ShapeOptions\(o,selectedShape\)/);
 assert.match(mock,/presentation\.renderDev3ShapeOptions\(select\('tool\.options'\)/);
 assert.match(workbench,/arrangeToolOptions\(options,bar,optionAbort\.signal,\{expanded\}\)/);
 assert.equal(typeof arrangeToolOptions,'function');
});
