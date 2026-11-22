// Bounded PDF Type0 / Identity-H / CIDFontType2 admission.
// Never executes PostScript CMap programs; only parses declared ToUnicode tables.
// Glyph outlines, actual embedded fonts and kerning are NOT preserved as Native fonts.
const reject = (why) => { const code='INK_AI_CID_FONT_UNSUPPORTED:'+why;throw Object.assign(new Error(code),{code}); };
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const hexBytes=s=>{if(s.length%2||!s.length||!/^[a-fA-F0-9]+$/.test(s))reject('CMAP_HEX');return s.length/2;};
function utf16be(hex){
  if(hexBytes(hex)>32||hex.length%4)reject('UNICODE_LENGTH');
  let str='';for(let i=0;i<hex.length;i+=4)str+=String.fromCharCode(parseInt(hex.slice(i,i+4),16));
  for(let i=0;i<str.length;i++){
    const c=str.charCodeAt(i);
    if(c>=0xd800&&c<=0xdbff){const next=str.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))reject('UNICODE_SURROGATE');}
    else if(c>=0xdc00&&c<=0xdfff)reject('UNICODE_SURROGATE');
  }
  if(!str||str.includes('\0'))reject('UNICODE_EMPTY_OR_NULL');return str;
}
function readSection(cmap,token,entryPattern,parseLine){
  const re=new RegExp('(\\d+)\\s+begin'+token+'\\b([\\s\\S]*?)end'+token,'g');
  const result=[];let m;
  while((m=re.exec(cmap))!==null){
    const count=Number(m[1]);
    if(!integer(count,1,4096)||result.length+count>4096)reject('CMAP_TABLE_BUDGET');
    const lines=m[2].trim().split(/\r?\n|\r/g).map(x=>x.trim()).filter(Boolean);
    if(lines.length!==count)reject('CMAP_ENTRY_COUNT');
    for(const line of lines)result.push(parseLine(line,entryPattern));
  }
  if(result.length===0&&new RegExp('\\bbegin'+token+'\\b').test(cmap))reject('CMAP_INVALID_TABLE');
  return result;
}
export function parseIdentityHUnicodeCMap(source) {
  if(typeof source!=='string'||source.length<50||source.length>128*1024)reject('CMAP_STREAM_BUDGET');
  const cmap=source.replace(/%[^\r\n]*/g,'');
  if(/\busecmap\b|\bbegincid(?:char|range)\b|\bbeginnotdef(?:char|range)\b/.test(cmap))reject('CMAP_DEPENDENCY_OR_CID_OPERATOR');
  const spaces=readSection(cmap,'codespacerange',/^<([a-f\d]+)>\s*<([a-f\d]+)>$/i,(line,re)=>{
    const match=line.match(re);if(!match||hexBytes(match[1])!==2||hexBytes(match[2])!==2)reject('CMAP_CODESPACE');
    return [parseInt(match[1],16),parseInt(match[2],16)];
  });
  if(spaces.length!==1||spaces[0][0]!==0||spaces[0][1]!==65535)reject('CMAP_CODESPACE');
  const glyphs=Object.create(null);
  const add=(code,unicode)=>{
    if(!integer(code,0,65535)||Object.hasOwn(glyphs,code))reject('CMAP_DUPLICATE_OR_RANGE');
    glyphs[code]=unicode;
    if(Object.keys(glyphs).length>4096)reject('CMAP_GLYPH_BUDGET');
  };
  const chars=readSection(cmap,'bfchar',/^<([a-f\d]{4})>\s*<([a-f\d]+)>$/i,(line,re)=>{
    const m=line.match(re);if(!m)reject('CMAP_BFCHAR');return [parseInt(m[1],16),utf16be(m[2])];
  });
  for(const [code,value] of chars)add(code,value);
  const ranges=readSection(cmap,'bfrange',/^<([a-f\d]{4})>\s*<([a-f\d]{4})>\s*<([a-f\d]+)>$/i,(line,re)=>{
    const m=line.match(re);if(!m)reject('CMAP_BFRANGE');
    return [parseInt(m[1],16),parseInt(m[2],16),m[3]];
  });
  for(const [start,end,unicodeStart]of ranges){
    if(end<start||end-start>4096||unicodeStart.length!==4)reject('CMAP_BFRANGE_BUDGET');
    const base=parseInt(unicodeStart,16);
    for(let code=start;code<=end;code++){
      const val=base+code-start;if(val>65535||val>=0xd800&&val<=0xdfff)reject('CMAP_BFRANGE_UNICODE');
      add(code,utf16be(val.toString(16).padStart(4,'0')));
    }
  }
  if(!Object.keys(glyphs).length)reject('CMAP_NO_GLYPHS');
  return glyphs;
}
function cidWidths(desc,resolve){
  const def=desc.DW===undefined?1000:desc.DW;
  if(!Number.isFinite(def)||def<0||def>10000)reject('DEFAULT_WIDTH');
  const w=desc.W===undefined?[]:resolve(desc.W);
  if(!Array.isArray(w)||w.length>8192)reject('WIDTH_ARRAY');
  const widths=Object.create(null);
  let count=0;
  function put(cid,width){
    if(!integer(cid,0,65535)||!Number.isFinite(width)||width<0||width>10000||Object.hasOwn(widths,cid)||++count>8192)reject('WIDTH_VALUE_OR_OVERLAP');
    widths[cid]=width;
  }
  for(let i=0;i<w.length;){
    const first=w[i++];
    if(!integer(first,0,65535)||i>=w.length)reject('WIDTH_START');
    const second=resolve(w[i++]);
    if(Array.isArray(second)){
      if(!second.length||second.length>8192||first+second.length>65536)reject('WIDTH_LIST_BUDGET');
      for(let p=0;p<second.length;p++)put(first+p,second[p]);
    }else{
      if(!integer(second,first,65535)||i>=w.length||second-first>8192)reject('WIDTH_RANGE');
      const value=w[i++];for(let cid=first;cid<=second;cid++)put(cid,value);
    }
  }
  return {defaultWidth:def,widths};
}
export function admitIdentityHType0Font(font,{resolve,get}){
  if(font?.Subtype?.name!=='Type0'||font?.Encoding?.name!=='Identity-H')reject('ENCODING_OR_SUBTYPE');
  const entries=resolve(font.DescendantFonts);
  if(!Array.isArray(entries)||entries.length!==1)reject('DESCENDANT_COUNT');
  const descendant=resolve(entries[0]);
  if(descendant?.Type?.name!=='Font'||descendant?.Subtype?.name!=='CIDFontType2')reject('DESCENDANT_SUBTYPE');
  const system=resolve(descendant.CIDSystemInfo);
  if(system?.Registry?.text!=='Adobe'||system?.Ordering?.text!=='Identity'||!integer(system.Supplement,0,100))
    reject('CID_SYSTEM_INFO');
  if(descendant.CIDToGIDMap?.name!=='Identity')reject('CID_TO_GID_MAP');
  const cmap=font.ToUnicode?.ref?get(font.ToUnicode):null;
  if(!cmap||typeof cmap.stream!=='string')reject('TO_UNICODE_REQUIRED');
  const glyphs=parseIdentityHUnicodeCMap(cmap.stream);
  const {widths,defaultWidth}=cidWidths(descendant,resolve);
  return {kind:'IDENTITY_H_CID',glyphs,widths,defaultWidth};
}
export function decodeIdentityHText(encoded,font){
  if(typeof encoded!=='string'||encoded.length%2||encoded.length>8192)reject('ENCODED_TEXT_LENGTH');
  let text='',advance=0;
  for(let i=0;i<encoded.length;i+=2){
    const code=encoded.charCodeAt(i)*256+encoded.charCodeAt(i+1);
    if(!Object.hasOwn(font.glyphs,code))reject('UNMAPPED_CID');
    text+=font.glyphs[code];advance+=Object.hasOwn(font.widths,code)?font.widths[code]:font.defaultWidth;
    if(text.length>8192)reject('UNICODE_TEXT_BUDGET');
  }
  return {text,advance};
}
