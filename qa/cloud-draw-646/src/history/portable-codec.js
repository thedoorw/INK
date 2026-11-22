// Bounded lossless portable History V2 document codec.
// V1 remains readable. V2 interns repeated document object keys across states
// and packs large byte arrays. It does not execute code or revive prototypes.
const fail = reason => {throw Object.assign(new Error('INK_HISTORY_CHECKPOINT_INVALID'),{reason:'PORTABLE_CODEC_'+reason});};
const MAX_TOTAL=32*1024*1024,MAX_SINGLE=8*1024*1024,MAX_KEYS=8192,MAX_NODES=400000;
export const PORTABLE_HISTORY_V2='INK_NATIVE_HISTORY_CHECKPOINTS_V2';
const forbidden=new Set(['__proto__','prototype','constructor','inkSessionHistory']);
const isByteArray=a=>a.length>=256&&a.length<=MAX_SINGLE&&a.every(v=>Number.isInteger(v)&&v>=0&&v<=255);
const toBase64=a=>{
 let s='';for(let i=0;i<a.length;i+=6144)s+=btoa(String.fromCharCode(...a.slice(i,i+6144)));
 return s;
};
function fromBase64(s,n) {
 if(typeof s!=='string'||s.length!==4*Math.ceil(n/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))fail('BASE64_SYNTAX');
 let data;try{data=atob(s);}catch{fail('BASE64_DECODE');}
 if(data.length!==n)fail('BASE64_LENGTH');
 return Array.from(data,ch=>ch.charCodeAt(0));
}
export function packPortableStates(states) {
 if(!Array.isArray(states)||states.length>51)fail('STATES');
 const table=[],keyToId=new Map();let nodes=0,bytes=0;
 function visit(v,depth=0) {
  if(v===null||typeof v!=='object')return v;
  if(++nodes>MAX_NODES||depth>64)fail('STRUCTURE');
  if(Array.isArray(v)){
   if(isByteArray(v)){
    if((bytes+=v.length)>MAX_TOTAL)fail('BYTES');
    return {'~':[v.length,toBase64(v)]};
   }
   return v.map(item=>visit(item,depth+1));
  }
  if(v&&typeof v==='object'){
   const out=Object.create(null);
   for(const [k,value]of Object.entries(v)){
    if(forbidden.has(k)||k.length>512)fail('UNSAFE_KEY');
    let id=keyToId.get(k);
    if(id===undefined){if(table.length>=MAX_KEYS)fail('KEY_TABLE');id=table.length;keyToId.set(k,id);table.push(k);}
    out[String(id)]=visit(value,depth+1);
   }
   return out;
  }
  return v;
 }
 return {states:states.map(value=>visit(value)),keyTable:table};
}
export function unpackPortableStates(states,keyTable) {
 if(!Array.isArray(states)||states.length>51||!Array.isArray(keyTable)||keyTable.length>MAX_KEYS)fail('TABLE_SHAPE');
 const seen=new Set();
 for(const k of keyTable){
  if(typeof k!=='string'||!k.length||k.length>512||forbidden.has(k)||seen.has(k))fail('TABLE_KEY');
  seen.add(k);
 }
 let nodes=0,bytes=0;
 function visit(v,depth=0){
  if(v===null||typeof v!=='object')return v;
  if(++nodes>MAX_NODES||depth>64)fail('STRUCTURE');
  if(Array.isArray(v))return v.map(item=>visit(item,depth+1));
  if(v&&typeof v==='object'){
   if(Object.hasOwn(v,'~')){
    const descriptor=v['~'];
    if(Object.keys(v).length!==1||!Array.isArray(descriptor)||descriptor.length!==2||
       !Number.isSafeInteger(descriptor[0])||descriptor[0]<256||descriptor[0]>MAX_SINGLE||
       (bytes+=descriptor[0])>MAX_TOTAL)fail('BYTE_DESCRIPTOR');
    return fromBase64(descriptor[1],descriptor[0]);
   }
   const out=Object.create(null);
   for(const [id,value]of Object.entries(v)){
    if(!/^(0|[1-9][0-9]*)$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)>=keyTable.length)fail('OBJECT_FIELD');
    const key=keyTable[Number(id)];
    if(Object.hasOwn(out,key))fail('OBJECT_DUPLICATE');
    out[key]=visit(value,depth+1);
   }
   return out;
  }
  return v;
 }
 return states.map(value=>visit(value));
}
