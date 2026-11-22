// Called by the owner-operated Runtime's first-party bootstrap, never a tool.
// The secret stays in a closure. No arbitrary source URL, cross-origin fetch,
// Google token, raw byte JSON relay or model-provided Native document is used.
export function createAdobeLoopbackClient({origin=globalThis.location?.origin,secret,fetchImpl=globalThis.fetch}={}){
  const url=new URL(origin);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.origin!==origin||
    globalThis.location&&globalThis.location.origin!==origin||typeof secret!=='string'||secret.length<32||typeof fetchImpl!=='function')
    throw new Error('INK_ADOBE_LOOPBACK_CONFIG_REQUIRED');
  return Object.freeze({schema:'INK_ADOBE_NATIVE_ENGINE_V1',id:'photoshopapi-0.9.1',async decode(bytes,{sourceSHA256,format}){
    if(!(bytes instanceof Uint8Array)||bytes.length>32*1024*1024||!/^[a-f0-9]{64}$/.test(sourceSHA256)||!['psd','psb'].includes(format))
      throw new Error('INK_ADOBE_LOCAL_SOURCE_INVALID');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),35000);
    let reader;
    try{
      const response=await fetchImpl(origin+'/__ink_adobe_decode',{method:'POST',body:bytes,cache:'no-store',credentials:'omit',redirect:'error',
        headers:{'Content-Type':'application/octet-stream','X-INK-Adobe-Session':secret,'X-INK-Source-SHA256':sourceSHA256,'X-INK-Source-Format':format},signal:controller.signal});
      if(!response.ok){
        let code='INK_ADOBE_LOCAL_ENGINE_REJECTED';
        if(response.body?.getReader){reader=response.body.getReader();let text='',size=0;const decoder=new TextDecoder();
          for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096)break;text+=decoder.decode(value,{stream:true});}
          try{const error=JSON.parse(text).error;if(typeof error==='string'&&/^INK_[A-Z0-9_]{1,160}$/.test(error))code=error;}catch{}
        }
        throw Object.assign(new Error(code),{code});
      }
      const length=response.headers.get('content-length');
      if(length!==null&&(!/^\d+$/.test(length)||Number(length)>64*1024*1024))throw new Error('INK_ADOBE_LOCAL_OUTPUT_BUDGET');
      if(!response.body?.getReader)throw new Error('INK_ADOBE_LOCAL_STREAM_REQUIRED');
      reader=response.body.getReader();const chunks=[];let total=0;
      for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;
        if(total>64*1024*1024)throw new Error('INK_ADOBE_LOCAL_OUTPUT_BUDGET');chunks.push(value);}
      const out=new Uint8Array(total);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(out));
    }finally{clearTimeout(timer);await reader?.cancel().catch(()=>{});}
  }});
}
