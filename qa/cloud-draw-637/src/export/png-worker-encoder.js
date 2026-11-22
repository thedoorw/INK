const workerSource = `
self.onmessage = async event => {
  const { id, bitmap, width, height, type, quality } = event.data;
  try {
    self.postMessage({ id, phase: 'COMPOSITE', progress: .35 });
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    self.postMessage({ id, phase: 'ENCODE', progress: .7 });
    const blob = await canvas.convertToBlob({ type, quality });
    const bytes = await blob.arrayBuffer();
    canvas.width = 1; canvas.height = 1;
    self.postMessage({ id, phase: 'DONE', progress: 1, bytes, blobType: blob.type }, [bytes]);
  } catch (error) {
    self.postMessage({ id, phase: 'FAILED', error: String(error?.message || error) });
  }
};`;

let jobSequence = 0;
const cancellationError = () => Object.assign(new Error('PNG export cancelled'), { name: 'TiledExportCancelledError' });

export function supportsPNGWorkerEncoding(target=globalThis){
  return typeof target.Worker === 'function' && typeof target.OffscreenCanvas === 'function' && typeof target.createImageBitmap === 'function';
}

export class PNGWorkerEncoder {
  constructor({ target=globalThis }={}) { this.target=target; this.active=new Map(); }
  async encode(canvas,{type='image/png',quality,onProgress,signal}={}){
    if(signal?.aborted)throw cancellationError();
    if(!supportsPNGWorkerEncoding(this.target))return this.fallback(canvas,{type,quality,onProgress,signal,reason:'Worker/OffscreenCanvas unsupported'});
    const id=`png-${Date.now().toString(36)}-${(++jobSequence).toString(36)}`,url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'})),worker=new Worker(url),bitmap=await createImageBitmap(canvas),started=performance.now();
    if(signal?.aborted){worker.terminate();URL.revokeObjectURL(url);bitmap.close?.();throw cancellationError();}
    return await new Promise((resolve,reject)=>{
      let settled=false;
      const cleanup=()=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);worker.terminate();URL.revokeObjectURL(url);bitmap.close?.();this.active.delete(id);};
      const abort=()=>{cleanup();reject(cancellationError());};
      signal?.addEventListener('abort',abort,{once:true});this.active.set(id,{worker,abort});
      const recover=reason=>{cleanup();this.fallback(canvas,{type,quality,onProgress,signal,reason}).then(({blob,report})=>resolve({blob,report:{...report,recoveredFromWorkerFailure:true}}),reject);};
      worker.onmessage=event=>{const message=event.data;if(message.id!==id)return;onProgress?.({phase:message.phase,progress:message.progress,method:'WORKER_OFFSCREEN'});if(message.phase==='FAILED')recover(`PNG worker failed: ${message.error}`);if(message.phase==='DONE'){const blob=new Blob([message.bytes],{type:message.blobType||type}),report={method:'WORKER_OFFSCREEN',durationMs:performance.now()-started,bytes:blob.size,mainThreadEncoding:false,cancelled:false,resourcesReleased:true};cleanup();resolve({blob,report});}};
      worker.onerror=event=>recover(`PNG worker crashed: ${event.message}`);
      worker.postMessage({id,bitmap,width:canvas.width,height:canvas.height,type,quality},[bitmap]);
    });
  }
  async fallback(canvas,{type='image/png',quality,onProgress,signal,reason='Worker unavailable'}={}){if(signal?.aborted)throw cancellationError();const started=performance.now();onProgress?.({phase:'FALLBACK_ENCODING',progress:.5,method:'MAIN_THREAD_FALLBACK',warning:reason});const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG encoding failed')),type,quality));if(signal?.aborted)throw cancellationError();onProgress?.({phase:'DONE',progress:1,method:'MAIN_THREAD_FALLBACK'});return{blob,report:{method:'MAIN_THREAD_FALLBACK',durationMs:performance.now()-started,bytes:blob.size,mainThreadEncoding:true,warning:reason,cancelled:false,resourcesReleased:true}};}
  cancel(id){const job=this.active.get(id);if(!job)return false;job.abort();return true;}
}
