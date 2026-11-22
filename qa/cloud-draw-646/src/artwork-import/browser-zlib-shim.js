// Browser-only node:zlib adapter for @create-design/ai@0.0.17.
// Dependency: pako@2.1.0, MIT AND Zlib. No custom Deflate implementation.
import {Inflate} from 'pako';
const fail=message=>{throw new Error(message);};
export function inflateSync(input,{maxOutputLength=64*1024*1024,strictStream=false}={}){
 if(!(input instanceof Uint8Array)&&!(input instanceof ArrayBuffer))fail('INK_BROWSER_DEFLATE_BYTES_REQUIRED');
 if(!Number.isSafeInteger(maxOutputLength)||maxOutputLength<1||maxOutputLength>64*1024*1024)
  fail('INK_BROWSER_DEFLATE_LIMIT_INVALID');
 const chunks=[];let length=0;
 const decoder=new Inflate({chunkSize:65536});
 decoder.onData=chunk=>{
  length+=chunk.length;
  if(length>maxOutputLength)fail('INK_BROWSER_DEFLATE_OUTPUT_LARGER_THAN_LIMIT');
  chunks.push(chunk);
 };
 decoder.push(input,true);
 if(decoder.err)fail('INK_BROWSER_DEFLATE_INVALID:'+decoder.msg);
 if(strictStream===true && (decoder.ended!==true || decoder.strm?.avail_in!==0))
  fail('INK_BROWSER_DEFLATE_TRAILING_OR_INCOMPLETE_STREAM');
 const out=new Uint8Array(length);let offset=0;
 for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}
 return out;
}
// zstdDecompressSync is deliberately absent. Upstream then reports its
// ai.import.zstd-unavailable diagnostic without inventing support.
