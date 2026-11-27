import test from 'node:test';
import assert from 'node:assert/strict';
import {observeMockContextWidth} from '../../preview/ink-ui-shared/mock-host.js';

test('Mock context rebuilds once per actual width change, including 454 ↔ 340 px',()=>{
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
  const bar={clientWidth:255};
  const abort=new AbortController(),actual=[];
  const dispose=observeMockContextWidth(root,bar,()=>actual.push([root.width,bar.clientWidth]),abort.signal);
  const observer=instances[0];
  assert.deepEqual(observer.observed,[bar,root]);
  observer.fire();flush();
  assert.deepEqual(actual,[],'initial observe callback does not repaint');

  // Preview must rebuild Public option markup before overflow arrangement:
  // on a live shrink 454→340 Native moves Shape fields into More.
  root.width=340;bar.clientWidth=122;
  observer.fire();observer.fire();observer.fire();
  assert.equal(frames.size,1,'rapid notifications coalesce into one animation frame');
  flush();assert.deepEqual(actual,[[340,122]]);
  observer.fire();flush();assert.equal(actual.length,1,'unchanged width does not repaint');

  root.width=454;bar.clientWidth=255;
  observer.fire();flush();
  assert.deepEqual(actual,[[340,122],[454,255]],'expanding restores full Shape fields');

  root.width=340;bar.clientWidth=122;
  observer.fire();
  abort.abort();flush();
  assert.equal(observer.disconnected,true);
  assert.equal(actual.length,2,'aborted queued resize is inert');
  dispose();
 }finally{
  for(const [key,value] of Object.entries({ResizeObserver:prior.observer,requestAnimationFrame:prior.raf,cancelAnimationFrame:prior.cancel})){
   if(value===undefined)delete globalThis[key];else globalThis[key]=value;
  }
 }
});
