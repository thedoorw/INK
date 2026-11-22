// Minimal bounded pure-JS LZ4 block codec for portable History text.
// Synchronous, lossless and deterministic in Node 22 and Chromium.
// Byte limits, exact output length, checksum, key shape and JSON parse guard
// ensure the compressed branch cannot bypass History's document validation.
const MAX_SOURCE=32*1024*1024;
const fail=reason=>{throw Object.assign(new Error('INK_HISTORY_CHECKPOINT_INVALID'),{reason:'PORTABLE_LZ4_'+reason});};
const hex=n=>(n>>>0).toString(16).padStart(8,'0');
function checksum(bytes){let h=0x811c9dc5;for(const byte of bytes)h=Math.imul(h^byte,0x01000193);return hex(h);}
const base64Encode=a=>{let s='';for(let i=0;i<a.length;i+=6144)s+=btoa(String.fromCharCode(...a.subarray(i,i+6144)));return s;};
const base64Decode=s=>{
 if(typeof s!=='string'||s.length>11*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))fail('BASE64_SYNTAX');
 let raw;try{raw=atob(s);}catch{fail('BASE64_DECODE');}
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
};
function encodeBlock(bytes){
 const table=new Int32Array(1<<16).fill(-1),len=bytes.length;
 const out=new Uint8Array(len+Math.ceil(len/255)+32);let op=0,anchor=0,i=0;
 const extra=n=>{while(n>=255){out[op++]=255;n-=255;}out[op++]=n;};
 const hash=pos=>(Math.imul((bytes[pos]|bytes[pos+1]<<8|bytes[pos+2]<<16|bytes[pos+3]<<24),0x9e3779b1)>>>16)&65535;
 while(i+4<len){
  const h=hash(i),prev=table[h];table[h]=i;
  if(prev>=0&&i-prev<=65535&&bytes[prev]===bytes[i]&&bytes[prev+1]===bytes[i+1]&&bytes[prev+2]===bytes[i+2]&&bytes[prev+3]===bytes[i+3]){
   let match=4;while(i+match<len&&bytes[prev+match]===bytes[i+match])match++;
   const literal=i-anchor,matched=match-4,at=op++;
   out[at]=(Math.min(literal,15)<<4)|Math.min(matched,15);
   if(literal>=15)extra(literal-15);
   out.set(bytes.subarray(anchor,i),op);op+=literal;
   const offset=i-prev;out[op++]=offset&255;out[op++]=offset>>>8;
   if(matched>=15)extra(matched-15);
   i+=match;anchor=i;
  }else i++;
 }
 if(anchor<len){
  const literal=len-anchor,at=op++;out[at]=Math.min(literal,15)<<4;
  if(literal>=15)extra(literal-15);
  out.set(bytes.subarray(anchor),op);op+=literal;
 }
 if(op>out.length)fail('OUTPUT_BOUNDS');
 return out.subarray(0,op);
}
function decodeBlock(bytes,expected){
 if(!Number.isSafeInteger(expected)||expected<2||expected>MAX_SOURCE)fail('DECODED_LENGTH');
 const out=new Uint8Array(expected);let ip=0,op=0;
 const extension=base=>{let n=base;if(n===15){let part;do{if(ip>=bytes.length)fail('EXTENSION_EOF');part=bytes[ip++];n+=part;if(n>MAX_SOURCE)fail('EXTENSION_BUDGET');}while(part===255);}return n;};
 while(ip<bytes.length){
  const token=bytes[ip++],literals=extension(token>>>4);
  if(ip+literals>bytes.length||op+literals>expected)fail('LITERAL_BOUNDS');
  out.set(bytes.subarray(ip,ip+literals),op);ip+=literals;op+=literals;
  if(ip===bytes.length)break;
  if(ip+2>bytes.length)fail('OFFSET_EOF');
  const offset=bytes[ip++]|(bytes[ip++]<<8);
  if(!offset||offset>op)fail('OFFSET');
  const match=extension(token&15)+4;
  if(op+match>expected)fail('MATCH_BOUNDS');
  for(let i=0;i<match;i++)out[op+i]=out[op+i-offset];
  op+=match;
 }
 if(op!==expected)fail('TRUNCATED');
 return out;
}
export function encodePortableHistoryBundle(bundle){
 const serialized=JSON.stringify(bundle),bytes=new TextEncoder().encode(serialized);
 if(bytes.length<2||bytes.length>MAX_SOURCE)fail('ENCODE_BUDGET');
 const compressed=encodeBlock(bytes);
 return {encoding:'INK_LZ4_BLOCK_JSON_V1',length:bytes.length,checksum:checksum(bytes),data:base64Encode(compressed)};
}
export function decodePortableHistoryBundle(envelope){
 if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||
   Object.keys(envelope).sort().join(',')!=='checksum,data,encoding,length'||
   envelope.encoding!=='INK_LZ4_BLOCK_JSON_V1'||typeof envelope.checksum!=='string'||!/^[0-9a-f]{8}$/.test(envelope.checksum))
   fail('ENVELOPE');
 const bytes=decodeBlock(base64Decode(envelope.data),envelope.length);
 if(checksum(bytes)!==envelope.checksum)fail('CHECKSUM');
 let decoded;try{decoded=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('JSON');}
 if(!decoded||Array.isArray(decoded)||typeof decoded!=='object'||Object.keys(decoded).sort().join(',')!=='keyTable,states')fail('BUNDLE');
 return decoded;
}
