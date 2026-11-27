import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {drag} from '../../src/ui/ink017/shared-controls.js';

class PointerSurface {
 constructor(){this.handlers=new Map();this.captured=[];this.rect={left:10,top:20,width:200,height:40}}
 addEventListener(type,handler){const list=this.handlers.get(type)||new Set();list.add(handler);this.handlers.set(type,list)}
 removeEventListener(type,handler){this.handlers.get(type)?.delete(handler)}
 setPointerCapture(id){this.captured.push(id)}
 getBoundingClientRect(){return this.rect}
 emit(type,event){for(const handler of [...(this.handlers.get(type)||[])])handler(event)}
}

test('dialog Close button remains clickable without pointer capture by draggable header',()=>{
 const header=new PointerSurface();let moves=0,ends=0,prevented=0;
 drag(header,()=>moves++,()=>ends++,undefined,{ignoreSelector:'button,[role="button"],a[href],input,select,textarea,[contenteditable="true"]'});
 header.emit('pointerdown',{
  button:0,pointerId:7,target:{closest:selector=>selector.includes('button')?{}:null},
  preventDefault(){prevented++}
 });
 assert.deepEqual(header.captured,[],'Close button must retain its pointer sequence');
 assert.equal(prevented,0,'Close button must retain default click synthesis');
 assert.deepEqual([moves,ends],[0,0]);
 assert.equal(header.handlers.get('pointerup')?.size||0,0,'no drag handlers installed');
});

test('dragging the dialog header background still moves and finishes',()=>{
 const header=new PointerSurface(),moves=[],ends=[];
 let prevented=0;
 drag(header,(event,rect)=>moves.push([event.clientX,rect.left]),event=>ends.push(event.pointerId),undefined,{ignoreSelector:'button'});
 header.emit('pointerdown',{
  button:0,pointerId:12,clientX:47,target:{closest:()=>null},preventDefault(){prevented++}
 });
 header.emit('pointermove',{pointerId:12,clientX:85});
 header.emit('pointerup',{pointerId:12});
 assert.equal(prevented,1);
 assert.deepEqual(header.captured,[12]);
 assert.deepEqual(moves,[[47,10],[85,10]]);
 assert.deepEqual(ends,[12]);
 assert.equal(header.handlers.get('pointermove').size,0);
 assert.equal(header.handlers.get('pointerup').size,0);
});

test('Native shared shell passes the interactive-descendant guard to the dialog drag helper',async()=>{
 const shell=await readFile(new URL('../../src/ui/ink017/shell.js',import.meta.url),'utf8');
 assert.match(shell,/drag\(overlay\.querySelector\('\.dialog-header'\)[\s\S]*?sig,\{ignoreSelector:'button,[^']*'\}\)/);
});
