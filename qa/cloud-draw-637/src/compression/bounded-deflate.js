const fail=code=>{throw Object.assign(new Error(code),{code});};
// Browser-native zlib only: no dependency, CDN, executable or external converter.
export async function inflateBounded(input,{maxOutputBytes,expectedLength=null}={}) {
  if(!(input instanceof Uint8Array)||!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<0||maxOutputBytes>32*1024*1024)
    fail('INK_DEFLATE_BOUNDS_INVALID');
  if(typeof DecompressionStream!=='function')fail('INK_DEFLATE_BROWSER_ADAPTER_UNAVAILABLE');
  const reader=new Blob([input]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const chunks=[];let size=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>maxOutputBytes)fail('INK_DEFLATE_EXPANSION_LIMIT');chunks.push(value);}
    if(expectedLength!==null&&size!==expectedLength)fail('INK_DEFLATE_LENGTH_MISMATCH');
    const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
  }catch(error){if(error.code)throw error;fail('INK_DEFLATE_INVALID_STREAM');}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function runInflatingDecoder(steps,{maxExpandedBytes=32*1024*1024}={}) {
  let expanded=0,answer;
  for(;;){const step=steps.next(answer);if(step.done)return step.value;
    const {bytes,maxOutputBytes,expectedLength=null}=step.value;
    const limit=Math.min(maxOutputBytes,maxExpandedBytes-expanded);
    if(limit<0)fail('INK_DEFLATE_TOTAL_EXPANSION_LIMIT');
    answer=await inflateBounded(bytes,{maxOutputBytes:limit,expectedLength});expanded+=answer.length;
  }
}
