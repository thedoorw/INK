// Document-owned raster pattern data. JSON-safe; no external asset or browser-local shadow copy.
export const RASTER_PATTERN_FORMAT = 'INK-RASTER-PATTERN-LIBRARY';
const limit=8, maxSide=256;
const fail=()=>{throw Error('INK_RASTER_PATTERN_LIBRARY_INVALID')};
export function emptyRasterPatternLibrary(){return {format:RASTER_PATTERN_FORMAT,version:1,patterns:[],activeId:null};}
function validName(name){return String(name||'Pattern').slice(0,160);}
function validEntry(p){
 if(!p||typeof p.id!=='string'||!p.id||typeof p.name!=='string'||p.name.length>160
   ||!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width<1||p.height<1
   ||p.width>maxSide||p.height>maxSide||typeof p.rgbaBase64!=='string'
   ||p.rgbaBase64.length!==4*Math.ceil(p.width*p.height*4/3)
   ||!/^[A-Za-z0-9+/]*={0,2}$/.test(p.rgbaBase64))fail();
 return p;
}
export function normalizeRasterPatternLibrary(raw){
 if(raw==null)return emptyRasterPatternLibrary();
 if(raw?.format!==RASTER_PATTERN_FORMAT||raw.version!==1
   ||!Array.isArray(raw.patterns)||raw.patterns.length>limit)fail();
 const patterns=raw.patterns.map(p=>({...validEntry(p)}));
 // Reject unreadable tiles on project Open rather than silently losing artwork assets.
 for(const p of patterns){let rawPixels;try{rawPixels=atob(p.rgbaBase64)}catch{fail()}
   if(rawPixels.length!==p.width*p.height*4)fail();}
 if(new Set(patterns.map(p=>p.id)).size!==patterns.length)fail();
 if(raw.activeId!=null&&!patterns.some(p=>p.id===raw.activeId))fail();
 return {format:RASTER_PATTERN_FORMAT,version:1,patterns,activeId:raw.activeId??null};
}
export function encodeRasterPattern(image,name='Pattern',id=null){
 const w=image?.width,h=image?.height;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>maxSide||h>maxSide
  ||image.data?.length!==w*h*4)fail();
 const bytes=Uint8Array.from(image.data);
 let raw='';
 for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {id:id||globalThis.crypto?.randomUUID?.()||'pattern-'+Date.now()+'-'+Math.random().toString(36).slice(2),
   name:validName(name),width:w,height:h,rgbaBase64:btoa(raw)};
}
export function decodeRasterPattern(entry){
 const e=validEntry(entry);let raw;
 try{raw=atob(e.rgbaBase64)}catch{fail()}
 if(raw.length!==e.width*e.height*4)fail();
 const data=new Uint8ClampedArray(raw.length);
 for(let i=0;i<raw.length;i++)data[i]=raw.charCodeAt(i);
 return {width:e.width,height:e.height,data};
}
export function addRasterPattern(library,image,name){
 const next=normalizeRasterPatternLibrary(library);
 if(next.patterns.length>=limit)throw Error('INK_RASTER_PATTERN_LIBRARY_FULL');
 const entry=encodeRasterPattern(image,name);
 next.patterns.push(entry);next.activeId=entry.id;
 return next;
}
export function selectRasterPattern(library,id){
 const next=normalizeRasterPatternLibrary(library);
 if(!next.patterns.some(e=>e.id===id))throw Error('INK_RASTER_PATTERN_NOT_FOUND');
 next.activeId=id;return next;
}
export function removeRasterPattern(library,id){
 const next=normalizeRasterPatternLibrary(library),index=next.patterns.findIndex(p=>p.id===id);
 if(index<0)throw Error('INK_RASTER_PATTERN_NOT_FOUND');
 next.patterns.splice(index,1);
 if(next.activeId===id)next.activeId=next.patterns[0]?.id||null;
 return next;
}
export function activeRasterPattern(library){
 const next=normalizeRasterPatternLibrary(library);
 const entry=next.patterns.find(e=>e.id===next.activeId);
 return entry?{entry,image:decodeRasterPattern(entry)}:null;
}
