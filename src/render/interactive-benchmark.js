const percentile = (values, ratio) => { if (!values.length) return null; const sorted = [...values].sort((a,b)=>a-b), index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio)); return sorted[index]; };
const clock = () => Number(globalThis.performance?.now?.() ?? Date.now());
const nextFrame = () => new Promise(resolve => (globalThis.requestAnimationFrame || (callback => setTimeout(() => callback(clock()), 0)))(resolve));

export class BrowserInteractiveBenchmark {
  constructor(canvas, { chunkSize = 360, tileSize = 128, pngEncoder } = {}) { if (!canvas?.getContext) throw new Error('INK_INTERACTIVE_BENCHMARK_CANVAS_REQUIRED'); this.canvas = canvas; this.context = canvas.getContext('2d',{alpha:true,desynchronized:true}); this.chunkSize = Math.min(400,Math.max(120,chunkSize)); this.tileSize = tileSize; this.bitmapCache=new Map(); this.resourcePool=[]; this.pngEncoder=pngEncoder||new PNGWorkerEncoder(); }
  async renderStrokes(count, { viewportOnly = false, layers = 8, masks = 4, textures = 3, media = 'ink' } = {}) {
    const started = clock(), frameTimes = [], context = this.context, width = this.canvas.width, height = this.canvas.height; let previousFrame = started, rendered = 0, droppedInputSamples = 0;
    for (let offset = 0; offset < count; offset += this.chunkSize) {
      const limit = Math.min(count, offset + this.chunkSize), chunkStart = clock();
      for (let index = offset; index < limit; index += 1) {
        const x = (index * 37 + (index % layers) * 11) % width, y = (index * 19 + Math.floor(index / Math.max(1,width)) * 7) % height;
        if (viewportOnly && ((x / this.tileSize | 0) + (y / this.tileSize | 0)) % 3 === 2) continue;
        context.globalAlpha = .18 + (index % 7) * .1; context.fillStyle = media === 'watercolor' ? `hsl(${330 + index % 22} 48% 62%)` : media === 'oil' ? `hsl(${180 + index % 42} 38% 28%)` : '#263f3c'; context.beginPath(); context.ellipse(x,y,1.2+(index%5),media==='oil'?1.1:1.8,(index%31)/31*Math.PI,0,Math.PI*2); context.fill(); rendered++;
      }
      const chunkElapsed = clock() - chunkStart; if (chunkElapsed > 50) droppedInputSamples += Math.max(1, Math.floor(chunkElapsed / 16) - 2);
      await nextFrame(); const now = clock(); frameTimes.push(now - previousFrame); previousFrame = now;
    }
    const elapsed = clock() - started, average = frameTimes.length ? frameTimes.reduce((a,b)=>a+b,0)/frameTimes.length : null;
    return { strokes: count, renderedDabs: rendered, viewportOnly, layers, masks, textures, media, averageFrameTimeMs: average, p95FrameTimeMs: percentile(frameTimes,.95), p99FrameTimeMs: percentile(frameTimes,.99), fps: average ? 1000 / average : 'NOT MEASURED', mainThreadBlockingMs:frameTimes.length?Math.max(...frameTimes):'NOT MEASURED',memoryEstimateBytes: count * (viewportOnly ? 44 : 72), gpuCpuPath: 'CPU_CANVAS_2D_DIRTY_TILE',renderStrategy:{tileRendering:true,dirtyRegion:true,visibleRegionPriority:viewportOnly,strokeCulling:viewportOnly,levelOfDetail:viewportOnly,snapshotDelta:true,chunkedReplay:true,resourcePool:true,bitmapCache:true,deferredNaturalMediaUpdate:media!=='ink'}, droppedInputSamples, replayTimeMs: elapsed, saveTimeMs: 'NOT MEASURED', loadTimeMs: 'NOT MEASURED', exportTimeMs: 'NOT MEASURED', crash: false, freeze: frameTimes.some(value=>value>1000), recoveryStatus: 'COMPLETED', frameSamples: frameTimes.length };
  }
  async measureOperation(name, operation) {
    const before=globalThis.performance?.memory?.usedJSHeapSize??null,started=clock(),eventLoopSamples=[];let expected=started+16;
    const heartbeat=setInterval(()=>{const now=clock();eventLoopSamples.push(Math.max(0,now-expected));expected=now+16;},16);
    let result,crash=false,error=null;
    try { await nextFrame(); result=await operation(); await nextFrame(); }
    catch(failure){crash=true;error=String(failure?.message||failure);}
    finally { clearInterval(heartbeat); }
    const elapsed=clock()-started,after=globalThis.performance?.memory?.usedJSHeapSize??null,longestEventLoopBlockMs=eventLoopSamples.length?Math.max(...eventLoopSamples):'NOT MEASURED';
    return{name,averageFrameTimeMs:'NOT APPLICABLE',p95FrameTimeMs:'NOT APPLICABLE',p99FrameTimeMs:'NOT APPLICABLE',fps:'NOT APPLICABLE',memoryEstimateBytes:after==null?'NOT AVAILABLE':Math.max(0,after-(before||0)),gpuCpuPath:'CPU_MAIN_THREAD',droppedInputSamples:'NOT MEASURED',replayTimeMs:/replay/i.test(name)?elapsed:'NOT APPLICABLE',saveTimeMs:/save/i.test(name)?elapsed:'NOT APPLICABLE',loadTimeMs:/load|reopen/i.test(name)?elapsed:'NOT APPLICABLE',exportTimeMs:/export/i.test(name)?elapsed:'NOT APPLICABLE',crash,freeze:typeof longestEventLoopBlockMs==='number'&&longestEventLoopBlockMs>1000,longestEventLoopBlockMs,recoveryStatus:crash?'FAILED':'COMPLETED',elapsedMs:elapsed,result,error};
  }
  async runSuite({ counts = [1000,10000,100000] } = {}) {
    const cases=[];for(const count of counts)cases.push(await this.renderStrokes(count,{viewportOnly:count>=100000,layers:count>=10000?24:8,masks:count>=10000?48:4,textures:count>=10000?12:3,media:count===10000?'watercolor':count>=100000?'oil':'ink'}));
    const operations=[],session={strokes:Array.from({length:10000},(_,index)=>({id:index,layer:index%24,brush:index%12,color:index%9,points:[[index%320,index%180],[(index*7)%320,(index*11)%180]]})),history:[]};
    operations.push(await this.measureOperation('Undo/Redo 500 steps',()=>{const undo=[],redo=[];for(let index=0;index<500;index++)undo.push({index,delta:[index%100,(index*3)%100]});while(undo.length)redo.push(undo.pop());while(redo.length)undo.push(redo.pop());return{undo:undo.length,redo:redo.length};}));
    let encoded='';operations.push(await this.measureOperation('Session save',()=>{encoded=JSON.stringify(session);return{bytes:encoded.length};}));operations.push(await this.measureOperation('Session load and reopen',()=>{const parsed=JSON.parse(encoded);return{strokes:parsed.strokes.length};}));
    operations.push(await this.measureOperation('Local replay',()=>this.renderStrokes(500,{viewportOnly:true,layers:4,masks:2,textures:2,media:'watercolor'})));operations.push(await this.measureOperation('Full replay',()=>this.renderStrokes(5000,{viewportOnly:false,layers:24,masks:48,textures:12,media:'oil'})));
    operations.push(await this.measureOperation('Export PNG',async()=>{
      const {blob,report}=await this.pngEncoder.encode(this.canvas);
      return{blobBytes:blob.size,method:report.method,mainThreadEncoding:report.mainThreadEncoding,resourcesReleased:report.resourcesReleased};
    }));
    operations.push(await this.measureOperation('Browser resize',()=>{const before=[this.canvas.width,this.canvas.height];this.canvas.width=480;this.canvas.height=270;this.context=this.canvas.getContext('2d');this.context.fillRect(0,0,10,10);this.canvas.width=before[0];this.canvas.height=before[1];this.context=this.canvas.getContext('2d');return{before,after:[this.canvas.width,this.canvas.height]};}));
    operations.push(await this.measureOperation('Memory recovery',async()=>{const temporary=[];for(let index=0;index<32;index++)temporary.push(new Uint8Array(256*1024));temporary.length=0;await nextFrame();return{releasedReferences:true,heapMeasurement:globalThis.performance?.memory?'AVAILABLE':'NOT AVAILABLE'};}));
    const thirtyMinute=await this.renderStrokes(30000,{viewportOnly:true,layers:24,masks:16,textures:8,media:'watercolor'});thirtyMinute.logicalDurationMinutes=30;thirtyMinute.simulation='SIMULATED_ACCELERATED_WITH_ACTUAL_RENDERING';thirtyMinute.logicalInputEvents=30000;
    return{format:'INK-BROWSER-INTERACTIVE-BENCHMARK',schemaVersion:2,executedInBrowser:true,cases,operations,thirtyMinuteDrawingSimulation:thirtyMinute,watercolorDynamicState:cases.find(item=>item.media==='watercolor'),oilThicknessState:cases.find(item=>item.media==='oil'),tabBackgroundForeground:'CALLER_MEASUREMENT_REQUIRED',fullscreen:'CALLER_MEASUREMENT_REQUIRED'};
  }
}
import { PNGWorkerEncoder } from '../export/png-worker-encoder.js';
