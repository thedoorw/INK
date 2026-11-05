// Exact static-include verification. Dependency source is never executed or fetched.
const utf8=s=>new TextEncoder().encode(s);
const validName=s=>typeof s==='string'&&/^[A-Za-z0-9._/-]{1,160}$/.test(s)&&!s.startsWith('/')&&!s.split('/').some(x=>!x||x==='.'||x==='..');
const rot=(x,n)=>(x<<n)|(x>>>(32-n));
export function gitBlobSha1(source){
  if(typeof source!=='string')throw Error('INK_INCLUDE_BYTES_REQUIRED');
  const data=utf8(source);
  if(data.length>131072)throw Error('INK_INCLUDE_SIZE_LIMIT');
  const prefix=utf8('blob '+data.length+'\0'),n=prefix.length+data.length;
  const padded=Math.ceil((n+9)/64)*64,bytes=new Uint8Array(padded);
  bytes.set(prefix);bytes.set(data,prefix.length);bytes[n]=128;
  const view=new DataView(bytes.buffer),bitLength=n*8;
  view.setUint32(padded-8,Math.floor(bitLength/4294967296),false);
  view.setUint32(padded-4,bitLength>>>0,false);
  let h=[0x67452301,0xefcdab89,0x98badcfe,0x10325476,0xc3d2e1f0];
  const w=new Int32Array(80);
  for(let off=0;off<padded;off+=64){
    for(let i=0;i<16;i++)w[i]=view.getInt32(off+i*4,false);
    for(let i=16;i<80;i++)w[i]=rot(w[i-3]^w[i-8]^w[i-14]^w[i-16],1);
    let [a,b,c,d,e]=h;
    for(let i=0;i<80;i++){
      let f,k;
      if(i<20){f=(b&c)|((~b)&d);k=0x5a827999;}
      else if(i<40){f=b^c^d;k=0x6ed9eba1;}
      else if(i<60){f=(b&c)|(b&d)|(c&d);k=0x8f1bbcdc;}
      else{f=b^c^d;k=0xca62c1d6;}
      const t=(rot(a,5)+f+e+k+w[i])|0;
      e=d;d=c;c=rot(b,30);b=a;a=t;
    }
    h=h.map((x,i)=>(x+[a,b,c,d,e][i])|0);
  }
  return h.map(x=>(x>>>0).toString(16).padStart(8,'0')).join('');
}
// Retains exact offsets and source quotes; strips comments only when scanning directive.
function mask(source,strings=false){
  const out=source.split('');let state='code',q='',escaped=false;
  const blank=i=>{if(out[i]!=='\r'&&out[i]!=='\n')out[i]=' ';};
  for(let i=0;i<out.length;i++){
    const ch=source[i],n=source[i+1];
    if(state==='line'){if(ch==='\r'||ch==='\n')state='code';else blank(i);continue;}
    if(state==='block'){if(ch==='*'&&n==='/'){blank(i);blank(i+1);i++;state='code';}else blank(i);continue;}
    if(state==='string'){
      if(strings)blank(i);
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch===q){q='';state='code';}
      continue;
    }
    if(ch==='/'&&n==='/'){blank(i);blank(i+1);i++;state='line';continue;}
    if(ch==='/'&&n==='*'){blank(i);blank(i+1);i++;state='block';continue;}
    if(ch==='"'||ch==="'"||ch===String.fromCharCode(96)){q=ch;state='string';if(strings)blank(i);}
  }
  return out.join('');
}
export const codeOnlyForSecurity=text=>mask(String(text),true);
export function verifyStaticIncludeBundle({text='',bundle=[],sourceRevision=null}={}){
  const masked=mask(String(text));
  if(!Array.isArray(bundle)||bundle.length>12)return{ok:false,reason:'INK_INCLUDE_BUNDLE_INVALID',includes:[],manifest:[]};
  const includes=[];
  for(const m of masked.matchAll(/^[ \t]*#[ \t]*include\b([^\r\n]*)/gm)){
    const literal=m[1].trim().match(/^(["'])([^"']+)\1[ \t]*$/);
    if(!literal||!validName(literal[2]))return{ok:false,reason:'INK_INCLUDE_NONLITERAL_OR_REMOTE',includes,manifest:[]};
    includes.push(literal[2]);
  }
  if(new Set(includes).size!==includes.length)return{ok:false,reason:'INK_INCLUDE_DUPLICATE_DIRECTIVE',includes,manifest:[]};
  if(bundle.length!==includes.length)return{ok:false,reason:'INK_INCLUDE_MISSING_OR_EXTRA',includes,manifest:[]};
  const seen=new Set(),manifest=[];
  for(const dep of bundle){
    if(!dep||!validName(dep.name)||seen.has(dep.name)||!includes.includes(dep.name)||typeof dep.text!=='string'||
       !/^[0-9a-f]{40}$/i.test(String(dep.blobSha1||''))||
       !/^[0-9a-f]{40}$/i.test(String(dep.provenance?.revision||''))||
       typeof dep.provenance?.sourceUrl!=='string'||!dep.provenance.sourceUrl.startsWith('https://github.com/'))
       return{ok:false,reason:'INK_INCLUDE_PROVENANCE_INVALID',includes,manifest:[]};
    if(sourceRevision&&dep.provenance.revision.toLowerCase()!==String(sourceRevision).toLowerCase())
       return{ok:false,reason:'INK_INCLUDE_REVISION_MISMATCH',includes,manifest:[]};
    let sha;
    try{sha=gitBlobSha1(dep.text);}catch{return{ok:false,reason:'INK_INCLUDE_SIZE_OR_ENCODING',includes,manifest:[]};}
    if(sha!==dep.blobSha1.toLowerCase())return{ok:false,reason:'INK_INCLUDE_HASH_MISMATCH',includes,manifest:[]};
    manifest.push({name:dep.name,blobSha1:sha,provenance:{sourceUrl:dep.provenance.sourceUrl,revision:dep.provenance.revision}});
    seen.add(dep.name);
  }
  return{ok:true,reason:null,includes,manifest};
}
