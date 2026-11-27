import test from 'node:test';
import assert from 'node:assert/strict';
import {observeMockContextWidth} from '../../preview/ink-ui-shared/mock-host.js';
import {arrangeToolOptions} from '../../src/ui/ink017/shared-controls.js';

test('Mock context rechecks initial post-layout overflow, widths, and changing scrollWidth',()=>{
 const prior={observer:globalThis.ResizeObserver,raf:globalThis.requestAnimationFrame,cancel:globalThis.cancelAnimationFrame};
 const frames=new Map(),instances=[];
 let nextFrame=0;
 class ResizeObserverFake{
  constructor(callback){this.callback=callback;this.observed=[];this.disconnected=false;instances.push(this)}
  observe(node){this.observed.push(node)}
  disconnect(){this.disconnected=true}
  fire(){this.callback()}
 }
 globalThis.ResizeObserver=ResizeObserverFake;
 globalThis.requestAnimationFrame=callback=>{const id=++nextFrame;frames.set(id,callback);return id};
 globalThis.cancelAnimationFrame=id=>frames.delete(id);
 const flush=()=>{const queued=[...frames.values()];frames.clear();queued.forEach(callback=>callback())};
 try{
  const root={width:454,getBoundingClientRect(){return {width:this.width}}};
  const bar={clientWidth:255,scrollWidth:255};
  const abort=new AbortController(),actual=[];
  const dispose=observeMockContextWidth(root,bar,()=>actual.push([root.width,bar.clientWidth,bar.scrollWidth]),abort.signal);
  const observer=instances[0];
  assert.deepEqual(observer.observed,[bar,root]);
  assert.equal(frames.size,1,'initial post-layout recheck must not be filtered out');
  observer.fire();flush();
  assert.deepEqual(actual,[[454,255,255]],'initial reflow receives a repaint');
  observer.fire();flush();assert.equal(actual.length,1,'same post-layout geometry does not repaint');

  // Native rebuilds canonical Public markup when an actual geometry change
  // moves Shape fields in and out of More.
  root.width=340;bar.clientWidth=122;
  observer.fire();observer.fire();observer.fire();
  assert.equal(frames.size,1,'rapid notifications coalesce into one animation frame');
  flush();assert.deepEqual(actual.at(-1),[340,122,255]);
  observer.fire();flush();assert.equal(actual.length,2,'unchanged layout does not repaint');

  root.width=454;bar.clientWidth=255;
  observer.fire();flush();
  assert.deepEqual(actual.at(-1),[454,255,255],'expanding restores full Shape fields');

  // Fonts/overflow can finish after initial paint, even if root and bar
  // widths stay equal. The previous width-only filter silently skipped this.
  bar.scrollWidth=540;
  observer.fire();observer.fire();flush();
  assert.deepEqual(actual.at(-1),[454,255,540],'post-reflow overflow triggers live More arrangement');
  observer.fire();flush();assert.equal(actual.length,4,'unchanged overflow does not spin');

  root.width=340;bar.clientWidth=122;
  observer.fire();
  abort.abort();flush();
  assert.equal(observer.disconnected,true);
  assert.equal(actual.length,4,'aborted queued resize is inert');
  dispose();
 }finally{
  for(const [key,value] of Object.entries({ResizeObserver:prior.observer,requestAnimationFrame:prior.raf,cancelAnimationFrame:prior.cancel})){
   if(value===undefined)delete globalThis[key];else globalThis[key]=value;
  }
 }
});

test('late Mock reflow uses the real shared arranger to move Pressure/Taper into More',()=>{
 const prior={observer:globalThis.ResizeObserver,raf:globalThis.requestAnimationFrame,
  cancel:globalThis.cancelAnimationFrame,document:globalThis.document};
 const frames=new Map();
 let nextFrame=0,observer;
 globalThis.ResizeObserver=class{
  constructor(callback){this.callback=callback;observer=this}
  observe(){}
  disconnect(){}
  fire(){this.callback()}
 };
 globalThis.requestAnimationFrame=callback=>{const id=++nextFrame;frames.set(id,callback);return id};
 globalThis.cancelAnimationFrame=id=>frames.delete(id);
 const flush=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback())};
 globalThis.document={createElement:tag=>({
  tag,setAttribute(){},addEventListener(){},children:[],
  prepend(part){part.inMore=true;this.children.unshift(part)}
 })};
 try{
  const labels=['Size px','Opacity %','Smoothing %','Pressure %','Taper %']
   .map(label=>({label,inMore:false,closest(){return null}}));
  const root={getBoundingClientRect(){return {width:1280}}};
  let laidOut=false,appended=[],arranged=false;
  const bar={clientWidth:454,get scrollWidth(){
   if(!laidOut)return 454;
   return 80+105*labels.filter(item=>!item.inMore).length+(appended.length?45:0);
  }};
  const options={
   firstElementChild:{},
   querySelectorAll(){return labels},
   append(...elements){appended=elements}
  };
  const abort=new AbortController();
  const stop=observeMockContextWidth(root,bar,()=>{
   arranged=arrangeToolOptions(options,bar,abort.signal,{expanded:true});
  },abort.signal);
  assert.equal(appended.length,0,'initial paint has no More before final reflow');
  laidOut=true;observer.fire();flush();
  assert.equal(arranged,true,'same Public function detects real overflow after layout');
  assert.deepEqual(appended.map(x=>x.tag),['button','div'],'exactly two real More DOM nodes');
  assert.equal(appended[0].className,'context-drawing-more');
  assert.equal(appended[1].id,'toolOptionsMore');
  assert.deepEqual(labels.filter(x=>!x.inMore).map(x=>x.label),
   ['Size px','Opacity %','Smoothing %']);
  assert.deepEqual(labels.filter(x=>x.inMore).map(x=>x.label),
   ['Pressure %','Taper %']);
  assert.ok(bar.scrollWidth<=bar.clientWidth,'More actually resolves the measured overflow');
  observer.fire();flush();
  assert.equal(frames.size,0,'settled geometry causes no repaint loop');
  abort.abort();stop();
 }finally{
  for(const [key,value] of Object.entries({
   ResizeObserver:prior.observer,requestAnimationFrame:prior.raf,
   cancelAnimationFrame:prior.cancel,document:prior.document
  })){
   if(value===undefined)delete globalThis[key];else globalThis[key]=value;
  }
 }
});
