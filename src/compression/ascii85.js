// PDF ASCII85Decode data filter, not a program interpreter. Hard output bound.
export function decodeAscii85(source,{maxOutputBytes=4*1024*1024}={}){
 const fail=()=>{throw new Error('INK_AI_ASCII85_INVALID_OR_BUDGET');};
 if(typeof source!=='string'||!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<1||maxOutputBytes>4*1024*1024)fail();
 const output=[];let group=[],ended=false;
 function write(digits,count=4){let value=0;for(const d of digits)value=value*85+d;if(value>0xffffffff||output.length+count>maxOutputBytes)fail();for(let i=0;i<count;i++)output.push(Math.floor(value/2**(24-8*i))&255);}
 for(let i=0;i<source.length;i++){
  const c=source[i];if(/[\x00\x09\x0a\x0c\x0d\x20]/.test(c))continue;if(ended)fail();
  if(c==='~'){if(source[++i]!=='>')fail();ended=true;continue;}
  if(c==='z'){if(group.length)fail();write([0,0,0,0,0]);continue;}
  const d=c.charCodeAt(0)-33;if(d<0||d>84)fail();group.push(d);if(group.length===5){write(group);group=[];}
 }
 if(!ended||group.length===1)fail();if(group.length){const count=group.length-1;while(group.length<5)group.push(84);write(group,count);}
 return Uint8Array.from(output);
}
