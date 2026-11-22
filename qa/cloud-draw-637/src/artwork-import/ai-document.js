import { decodeAscii85 } from '../compression/ascii85.js';
import { createNormalizedPayload } from '../image/formats/normalized-payload.js';
import { formatPayloadToDocumentImageState } from '../image/format-interoperability.js';
import { runInflatingDecoder } from '../compression/bounded-deflate.js';
import { provenanceFor } from '../image/formats/normalized-payload.js';
import { createPath } from '../vector/vector-core.js';
import { createTextObject } from '../editor/text-object.js';
import { admitIdentityHType0Font, decodeIdentityHText } from './ai-cid-font.js';
import { decodeBoundedAxialRGB, AI_SHADING_BANDS } from './ai-shading.js';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const inverse = m => { const d=m[0]*m[3]-m[1]*m[2];if(!Number.isFinite(d)||Math.abs(d)<1e-12)fail('INK_AI_SINGULAR_MATRIX');return [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d]; };
const I = () => [1,0,0,1,0,0];
const mul = (a,b) => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];

export function probeAiDocument(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  const header = String.fromCharCode(...b.subarray(0,32));
  if (header.startsWith('%PDF-')) return { family:'PDF_COMPATIBLE', supported:'BOUNDED_SUBSET' };
  if (header.startsWith('%!PS-Adobe-')) return { family:'LEGACY_POSTSCRIPT', supported:false };
  return { family:'OPAQUE_OR_INVALID', supported:false };
}

// A bounded PDF data reader, never a PostScript/JavaScript interpreter.
// This initial route admits uncompressed, single-page PDF-compatible .ai; Flate streams use the async route.
class Reader {
  constructor(source) { this.s=source; this.p=0; this.nodes=0; }
  ws() { while(this.p<this.s.length){ if(/[\s\0]/.test(this.s[this.p]))this.p++;else if(this.s[this.p]==='%'){while(this.p<this.s.length&&!/[\r\n]/.test(this.s[this.p]))this.p++;}else break; } }
  word() { this.ws(); const m=this.s.slice(this.p).match(/^[^\s\0<>()[\]{}\/%]+/);if(!m)fail('INK_AI_PDF_TOKEN');this.p+=m[0].length;return m[0]; }
  value(depth=0) {
    if(depth>32||++this.nodes>100000)fail('INK_AI_PDF_COMPLEXITY');this.ws();const s=this.s;
    if(s.startsWith('<<',this.p)){this.p+=2;const d=Object.create(null);while(true){this.ws();if(s.startsWith('>>',this.p)){this.p+=2;return d;}const k=this.value(depth+1);if(!k?.name||Object.hasOwn(d,k.name))fail('INK_AI_PDF_DICTIONARY');d[k.name]=this.value(depth+1);} }
    if(s[this.p]==='['){this.p++;const a=[];while(true){this.ws();if(s[this.p]===']'){this.p++;return a;}a.push(this.value(depth+1));if(a.length>10000)fail('INK_AI_PDF_ARRAY_BUDGET');} }
    if(s[this.p]==='/'){this.p++;const start=this.p;while(this.p<s.length&&!/[\s\0<>()[\]{}\/%]/.test(s[this.p]))this.p++;const raw=s.slice(start,this.p);if(!raw||/#(?![a-f\d]{2})/i.test(raw))fail('INK_AI_PDF_NAME');return {name:raw.replace(/#([a-f\d]{2})/gi,(_,n)=>String.fromCharCode(parseInt(n,16)))};}
    if(s[this.p]==='('){this.p++;let out='',nest=1;while(this.p<s.length&&nest){let c=s[this.p++];if(c==='\\'){c=s[this.p++];if(/[0-7]/.test(c)){let oct=c;for(let i=0;i<2&&/[0-7]/.test(s[this.p]||'x');i++)oct+=s[this.p++];out+=String.fromCharCode(parseInt(oct,8));}else if(c==='\r'||c==='\n'){if(c==='\r'&&s[this.p]==='\n')this.p++;}else out+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'}[c]??c);}else if(c==='('){nest++;out+=c;}else if(c===')'){if(--nest)out+=c;}else out+=c;if(out.length>65536)fail('INK_AI_PDF_STRING_BUDGET');}if(nest)fail('INK_AI_PDF_STRING');return {text:out};}
    if(s[this.p]==='<'){this.p++;const stop=s.indexOf('>',this.p);if(stop<0)fail('INK_AI_PDF_HEX');let h=s.slice(this.p,stop).replace(/\s/g,'');if(!/^[a-f\d]*$/i.test(h))fail('INK_AI_PDF_HEX');if(h.length%2)h+='0';this.p=stop+1;return {text:h.replace(/../g,n=>String.fromCharCode(parseInt(n,16)))};}
    const word=this.word();
    if(/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(word)){
      const n=Number(word);if(!Number.isFinite(n)||Math.abs(n)>1e8)fail('INK_AI_PDF_NUMBER');const at=this.p;
      // Indirect references have integer object and generation numbers.
      if(Number.isInteger(n)&&n>=0){const m=s.slice(this.p).match(/^\s+(\d+)\s+R\b/);if(m){this.p+=m[0].length;return {ref:`${n} ${Number(m[1])}`};}}
      this.p=at;return n;
    }
    if(word==='true')return true;if(word==='false')return false;if(word==='null')return null;
    return {op:word};
  }
}

function* readPdf(source) {
  const r=new Reader(source),objects=new Map(),offsets=new Map();
  // Skip the PDF header and optional binary comment using the regular comment reader.
  while(true){r.ws();if(source.startsWith('xref',r.p)||source.startsWith('trailer',r.p)||source.startsWith('startxref',r.p))break;
    const offset=r.p,n=r.word(),g=r.word();if(!/^\d+$/.test(n)||!/^\d+$/.test(g)||r.word()!=='obj')fail('INK_AI_PDF_OBJECT_HEADER');
    const key=`${Number(n)} ${Number(g)}`;if(objects.has(key)||objects.size>=4096)fail('INK_AI_PDF_OBJECT_BUDGET_OR_DUPLICATE');
    const value=r.value();r.ws();let stream=null;
    if(source.startsWith('stream',r.p)){
      r.p+=6;if(source.startsWith('\r\n',r.p))r.p+=2;else if(/[\r\n]/.test(source[r.p]||''))r.p++;else fail('INK_AI_PDF_STREAM_EOL');
      if(!value||!Number.isInteger(value.Length)||value.Length<0||value.Length>4*1024*1024||value.DecodeParms||value.F)fail('INK_AI_PDF_COMPRESSED_OR_INDIRECT_STREAM_UNSUPPORTED');
      stream=source.slice(r.p,r.p+value.Length);if(stream.length!==value.Length)fail('INK_AI_PDF_STREAM_BOUNDS');r.p+=value.Length;r.ws();if(r.word()!=='endstream')fail('INK_AI_PDF_ENDSTREAM');
      if(value.Filter){
        const filters=Array.isArray(value.Filter)?value.Filter:[value.Filter];
        if(!filters.length||filters.length>2||filters.some(f=>!['ASCII85Decode','FlateDecode'].includes(f?.name)))fail('INK_AI_PDF_FILTER_UNSUPPORTED');
        for(const f of filters){
          const expanded=f.name==='ASCII85Decode'?decodeAscii85(stream):yield {bytes:Uint8Array.from(stream,c=>c.charCodeAt(0)),maxOutputBytes:4*1024*1024};
          stream='';for(let i=0;i<expanded.length;i+=8192)stream+=String.fromCharCode(...expanded.subarray(i,i+8192));
        }
      }
    }
    if(r.word()!=='endobj')fail('INK_AI_PDF_ENDOBJ');objects.set(key,{value,stream});offsets.set(key,offset);
  }
  if(!/%%EOF\s*$/.test(source)||!objects.size)fail('INK_AI_PDF_EOF');
  const xrefOffset=r.p;if(r.word()!=='xref')fail('INK_AI_PDF_CLASSIC_XREF_REQUIRED');
  const xrefKeys=new Set();let entries=0;
  while(true){r.ws();if(source.startsWith('trailer',r.p)){r.word();break;}
    const first=Number(r.word()),count=Number(r.word());if(!Number.isSafeInteger(first)||first<0||!Number.isSafeInteger(count)||count<0||first+count>16384||(entries+=count)>16384)fail('INK_AI_PDF_XREF_BOUNDS');
    for(let i=0;i<count;i++){const offset=Number(r.word()),generation=Number(r.word()),kind=r.word(),key=`${first+i} ${generation}`;
      if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(generation)||xrefKeys.has(key)||!['n','f'].includes(kind))fail('INK_AI_PDF_XREF_ENTRY');
      xrefKeys.add(key);if(kind==='n'&&offsets.get(key)!==offset)fail('INK_AI_PDF_XREF_OFFSET');
    }
  }
  const trailer=r.value();if(!trailer||trailer.Prev||trailer.XRefStm||trailer.Encrypt||!Number.isSafeInteger(trailer.Size)||trailer.Size>16384)fail('INK_AI_PDF_TRAILER_UNSUPPORTED');
  if(r.word()!=='startxref'||Number(r.word())!==xrefOffset)fail('INK_AI_PDF_STARTXREF');r.ws();if(r.p!==source.length)fail('INK_AI_PDF_TRAILING');
  for(const key of objects.keys())if(!xrefKeys.has(key))fail('INK_AI_PDF_XREF_MISSING');
  const get=ref=>{if(!ref?.ref||!objects.has(ref.ref))fail('INK_AI_PDF_REFERENCE');return objects.get(ref.ref);};
  const resolve=value=>value?.ref?get(value).value:value;
  const catalogs=[...objects.values()].filter(o=>o.value?.Type?.name==='Catalog');if(catalogs.length!==1)fail('INK_AI_PDF_CATALOG');
  for(const {value} of objects.values())if(value&&(value.Encrypt||value.JavaScript||value.JS||value.OpenAction||value.AA||value.Launch||value.EmbeddedFiles))fail('INK_AI_ACTIVE_CONTENT_REJECTED');
  // No incremental updates/object streams, encrypted files, attachments or arbitrary actions.
  if(/\/Encrypt\b/.test(source))fail('INK_AI_ENCRYPTED_UNSUPPORTED');
  if(!trailer.Root?.ref||objects.get(trailer.Root.ref)!==catalogs[0])fail('INK_AI_PDF_ROOT');
  const catalog=catalogs[0].value,pages=[];let visited=new Set();
  // Preserve inheritable page properties; reject recursive trees and oversized documents.
  function walk(ref,depth=0,inherited={}) {
    if(depth>16||visited.has(ref?.ref))fail('INK_AI_PAGE_TREE');
    visited.add(ref?.ref);const p=resolve(ref);
    if(p?.Type?.name==='Page') {
      if(pages.length>=128)fail('INK_AI_ARTBOARD_COUNT_BUDGET');
      pages.push({...inherited,...p});
    } else if(p?.Type?.name==='Pages'&&Array.isArray(p.Kids)) {
      if(!Number.isSafeInteger(p.Count)||p.Count<0||p.Count>128)fail('INK_AI_ARTBOARD_COUNT_BUDGET');
      const next={...inherited};
      for(const key of ['MediaBox','CropBox','Resources','Rotate','UserUnit'])if(p[key]!==undefined)next[key]=p[key];
      for(const child of p.Kids)walk(child,depth+1,next);
    } else fail('INK_AI_PAGE_TREE');
  }
  walk(catalog.Pages);
  if(!pages.length)fail('INK_AI_EDITABLE_CONTENT_REQUIRED');
  return {objects,get,resolve,catalog,pages};
}

function* decodeAiDocumentSteps(input,{uid}={}) {
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.length>8*1024*1024)fail('INK_AI_INPUT_BUDGET');
  const probe=probeAiDocument(bytes);if(probe.family!=='PDF_COMPATIBLE')fail(`INK_AI_${probe.family}_UNSUPPORTED`);
  if(typeof uid!=='function')fail('INK_AI_ID_FACTORY_REQUIRED');
  let source='';for(let i=0;i<bytes.length;i+=8192)source+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const pdf=yield* readPdf(source);const {pages,resolve,get,catalog}=pdf;
  const layers=[],mappings=[],artboards=[],losses=[{code:'PDF_DISPLAY_TREE_IS_NOT_ILLUSTRATOR_PRIVATE_LAYER_TREE'},{code:'ILLUSTRATOR_PRIVATE_EFFECTS_AND_EDITING_DATA_NOT_DECODED'}];
  let totalObjects=0,totalArea=0,displayX=0;
  const oc=resolve(catalog.OCProperties),ocgs=resolve(oc?.OCGs)||[],off=resolve(resolve(oc?.D)?.OFF)||[];
  if(resolve(oc?.D)?.BaseState&&resolve(oc?.D).BaseState.name!=='ON')fail('INK_AI_OCG_BASE_STATE_UNSUPPORTED');
  const policy=resolve(oc?.D)||{};
  const validOcgRef=ref=>ocgs.some(v=>v?.ref===ref?.ref);
  if(policy.AS){
    const rules=resolve(policy.AS);
    if(!Array.isArray(rules)||rules.length>32)fail('INK_AI_OCG_POLICY_UNSUPPORTED');
    for(const ref of rules){
      const rule=resolve(ref),items=resolve(rule?.OCGs),category=resolve(rule?.Category);
      if(!['View','Print','Export'].includes(rule?.Event?.name)||!Array.isArray(items)||items.length>256||
        !items.every(validOcgRef)||!Array.isArray(category)||category.length>8||
        !category.every(c=>c?.name&&['View','Print','Export','Zoom','Language','User'].includes(c.name)))
        fail('INK_AI_OCG_POLICY_UNSUPPORTED');
    }
    losses.push({code:'OCG_USAGE_AUTO_VISIBILITY_POLICY_NOT_NATIVE_EDITABLE'});
  }
  if(policy.RBGroups){
    const radio=resolve(policy.RBGroups);
    if(!Array.isArray(radio)||radio.length>256||radio.some(g=>!Array.isArray(g)||g.length>256||!g.every(validOcgRef)))fail('INK_AI_OCG_POLICY_UNSUPPORTED');
    losses.push({code:'OCG_RADIO_GROUP_POLICY_NOT_NATIVE_EDITABLE'});
  }
  const lockedOcg=resolve(policy.Locked)||[];
  if(!Array.isArray(lockedOcg)||lockedOcg.length>256||!lockedOcg.every(validOcgRef))fail('INK_AI_OCG_POLICY_UNSUPPORTED');
  if(lockedOcg.length)losses.push({code:'OCG_LAYER_LOCK_MAPPED_TO_NATIVE_LOCK'});
  for(const [artboardIndex,page] of pages.entries()){
  const box=resolve(page.MediaBox);
  if(!Array.isArray(box)||box.length!==4||!box.every(Number.isFinite)||box[2]<=box[0]||box[3]<=box[1]||page.Rotate&&page.Rotate!==0||page.UserUnit&&page.UserUnit!==1)fail('INK_AI_ARTBOARD_UNSUPPORTED');
  const width=box[2]-box[0],height=box[3]-box[1];
  if(width>32768||height>32768||(totalArea+=width*height)>8*1024*1024||displayX+width>32768)fail('INK_AI_ARTBOARD_AREA_BUDGET');
  if(page.CropBox&&JSON.stringify(resolve(page.CropBox))!==JSON.stringify(box))fail('INK_AI_CROPBOX_UNSUPPORTED');
  if(page.Annots||page.Trans||page.Dur)fail('INK_AI_PAGE_SEMANTICS_UNSUPPORTED');
  // A simple RGB transparency page group can be represented as a Native group,
  // but PDF group isolation/blending must remain explicitly qualified as partial.
  const pageGroup=resolve(page.Group);
  if(pageGroup){
    const keys=Object.keys(pageGroup);
    if(pageGroup.S?.name!=='Transparency'||keys.some(k=>!['S','CS','I','K'].includes(k))||pageGroup.K===true||
       (pageGroup.CS&&resolve(pageGroup.CS)?.name!=='DeviceRGB')||
       (pageGroup.I!==undefined&&typeof pageGroup.I!=='boolean'))fail('INK_AI_PAGE_SEMANTICS_UNSUPPORTED');
    losses.push({sourceArtboardIndex:artboardIndex,code:'TRANSPARENCY_PAGE_GROUP_ISOLATION_NOT_VERIFIED'});
  }
  let resources=resolve(page.Resources)||{},props=resolve(resources.Properties)||{},fonts=resolve(resources.Font)||{},ext=resolve(resources.ExtGState)||{};
  const pageLayers=[],layerByRef=new Map();
  const newLayer=(name,visible=true)=>{const l={id:uid(),name:pages.length>1?`Artboard ${artboardIndex+1} / ${name}`:name,visible,locked:false,opacity:1,objects:[]};pageLayers.push(l);return l;};
  for(const ref of ocgs){const d=resolve(ref);if(d?.Type?.name!=='OCG'||typeof d.Name?.text!=='string')fail('INK_AI_OCG_UNSUPPORTED');if(layerByRef.has(ref.ref))fail('INK_AI_OCG_DUPLICATE');const l=newLayer(d.Name.text,!off.some(x=>x.ref===ref.ref));l.locked=lockedOcg.some(x=>x.ref===ref.ref);layerByRef.set(ref.ref,l);mappings.push({sourceArtboardIndex:artboardIndex,sourceRef:ref.ref,nativeLayerId:l.id,type:'PDF_OPTIONAL_CONTENT_GROUP'});}
  let fallback=null;
  let xobjects=resolve(resources.XObject)||{};let rasterPixels=0,expandedFormBytes=0;
  const contents=Array.isArray(page.Contents)?page.Contents:[page.Contents];
  const streams=contents.map(ref=>{const o=get(ref);if(o.stream===null)fail('INK_AI_CONTENT_STREAM_REQUIRED');return o.stream;});
  let r=new Reader(streams.join('\n'));const formStack=[],activeForms=new Set();let compatibilityDepth=0,compatibilityIgnored=0;let operands=[],path=[],sub=null,pendingClip=null,groups=[],marked=[],state={matrix:I(),fill:'#000000',stroke:'#000000',width:1,opacity:1,clip:null,font:null,fontInfo:null,fontSize:12,textMatrix:I(),inText:false},states=[],objects=0;
  const color=values=>{if(!values.every(x=>Number.isFinite(x)&&x>=0&&x<=1))fail('INK_AI_COLOR_RANGE');return '#'+values.map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');};
  const nums=n=>{if(operands.length!==n||!operands.every(Number.isFinite))fail('INK_AI_OPERATOR_OPERANDS');return operands;};
  let lastLayer=null;const paintOrder=[];
  const layer=()=>{
    for(let i=marked.length-1;i>=0;i--)if(marked[i].layer)return marked[i].layer;
    return fallback??=newLayer('PDF display content');
  };
  const place=o=>{if(++objects>10000||++totalObjects>10000)fail('INK_AI_OBJECT_BUDGET');const l=layer(),g=groups.at(-1);if(l!==lastLayer){if(paintOrder.includes(l))fail('INK_AI_INTERLEAVED_OCG_UNSUPPORTED');paintOrder.push(l);lastLayer=l;}if(g){if(g.layer!==l)fail('INK_AI_LAYER_CROSSES_GROUP');o.parentId=g.object.id;g.object.children.push(o);}else l.objects.push(o);mappings.push({sourceArtboardIndex:artboardIndex,sourceOperatorOffset:r.p,nativeObjectId:o.id,nativeLayerId:l.id,type:o.type});};

  // PDF 'q/Q' saves/restores graphics state; it is not Illustrator group semantics.
  // An empty q-group cannot paint and need not enter Native Document/History.
  // Keep actual Form/OCG/artboard groups untouched for coordinate semantics.
  const discardEmptyGraphicsGroup=frame=>{
    if(frame?.object?.name!=='PDF graphics group'||frame.object.children.length)return;
    const siblings=groups.length?groups.at(-1).object.children:frame.layer.objects;
    const at=siblings.indexOf(frame.object);
    if(at<0)fail('INK_AI_GRAPHICS_GROUP_OWNERSHIP');
    siblings.splice(at,1);
    const mi=mappings.findIndex(m=>m.nativeObjectId===frame.object.id);
    if(mi<0)fail('INK_AI_GRAPHICS_GROUP_MAPPING');
    mappings.splice(mi,1);objects--;totalObjects--;
  };
  const anchor=(x,y)=>({x,y,in:{x:0,y:0},out:{x:0,y:0},mode:'corner'});
  const line=(x,y)=>{if(!sub||sub.closed)fail('INK_AI_PATH_CURRENT_POINT');sub.anchors.push(anchor(x,y));};
  const close=()=>{if(!sub)fail('INK_AI_PATH_CURRENT_POINT');sub.closed=true;};
  const clipCopy=()=>{if(!state.clip)return null;const c=structuredClone(state.clip);c.path.matrix=mul(inverse(state.matrix),c.path.matrix);return c;};
  const emit=(fill,stroke,evenOdd=false)=>{
    if(!path.length)fail('INK_AI_PATH_REQUIRED');
    const o=createPath({id:uid(),subpaths:path,fill:fill?state.fill:'none',stroke:stroke?state.stroke:'none',strokeWidth:state.width,fillRule:evenOdd?'evenodd':'nonzero',matrix:state.matrix,opacity:state.opacity,clipPath:clipCopy(),lineCap:'butt',lineJoin:'miter',metadata:{sourceFormat:'AI_PDF_DISPLAY',operatorOffset:r.p}});place(o);
  };
  const finish=()=>{if(pendingClip){if(state.clip)fail('INK_AI_INTERSECTING_CLIPS_UNSUPPORTED');state.clip={id:uid(),path:createPath({id:uid(),subpaths:path,fill:'#fff',stroke:'none',fillRule:pendingClip==='W*'?'evenodd':'nonzero',matrix:state.matrix})};}path=[];sub=null;pendingClip=null;};

  const showText=encoded=>{
    if(!state.inText||!state.font||typeof encoded!=='string')fail('INK_AI_TEXT_ENCODING_UNSUPPORTED');
    const composite=state.fontInfo?.kind==='IDENTITY_H_CID';
    if(!composite&&!/^[\x20-\x7e]*$/.test(encoded))fail('INK_AI_TEXT_ENCODING_UNSUPPORTED');
    const decoded=composite?decodeIdentityHText(encoded,state.fontInfo):{text:encoded,advance:0};
    if(!decoded.text)return;
    if(state.clip)fail('INK_AI_CLIPPED_TEXT_UNSUPPORTED');
    const o=createTextObject({id:uid(),text:decoded.text,matrix:mul(state.matrix,mul(state.textMatrix,[1,0,0,-1,0,0])),
      fontFamily:state.font==='Times-Roman'?'Times New Roman':state.font,fontSize:state.fontSize,color:state.fill,opacity:state.opacity});
    place(o);
    losses.push({nativeObjectId:o.id,code:composite?'CID_TYPE0_TOUNICODE_NATIVE_EDITABLE_TEXT_WITH_FONT_SUBSTITUTION':'FONT_SUBSTITUTION_METRICS_UNVERIFIED'});
    if(composite)state.textMatrix=mul(state.textMatrix,[1,0,0,1,decoded.advance*state.fontSize/1000,0]);
  };

  while(true){
    r.ws();
    if(r.p>=r.s.length){
      if(!formStack.length)break;
      const frame=formStack.pop();
      if(states.length!==frame.savedStateDepth+1||groups.length!==frame.savedGroupDepth+1||
         marked.length!==frame.savedMarkDepth||path.length||sub||pendingClip||state.inText||operands.length)
        fail('INK_AI_FORM_CONTENT_UNBALANCED');
      state=states.pop();groups.pop();
      activeForms.delete(frame.ref);
      r=frame.reader;resources=frame.resources;props=frame.props;fonts=frame.fonts;ext=frame.ext;xobjects=frame.xobjects;
      continue;
    }
    const v=r.value();if(!v?.op){operands.push(v);if(operands.length>64)fail('INK_AI_OPERAND_BUDGET');continue;}const op=v.op;
    if(pendingClip&&!['n','f','f*','S','s','B','B*','b','b*'].includes(op))fail('INK_AI_CLIP_TERMINATOR');
    switch(op){
      case 'q': {nums(0);if(path.length||state.inText||states.length>=32)fail('INK_AI_GRAPHICS_STATE');states.push(structuredClone(state));const g={id:uid(),type:'group',name:'PDF graphics group',matrix:I(),opacity:1,visible:true,locked:false,children:[]};place(g);groups.push({object:g,layer:layer()});break;}
      case 'Q':{nums(0);if(path.length||state.inText||!states.length||groups.at(-1)?.object.name!=='PDF graphics group')fail('INK_AI_GRAPHICS_STATE');state=states.pop();const frame=groups.pop();discardEmptyGraphicsGroup(frame);break;}
      case 'cm': if(path.length)fail('INK_AI_MATRIX_INSIDE_PATH_UNSUPPORTED');state.matrix=mul(state.matrix,nums(6));inverse(state.matrix);break;
      case 'rg': state.fill=color(nums(3));break;case 'RG':state.stroke=color(nums(3));break;
      case 'g': {const [v]=nums(1);state.fill=color([v,v,v]);break;}case 'G':{const [v]=nums(1);state.stroke=color([v,v,v]);break;}
      case 'w':state.width=nums(1)[0];if(state.width<=0)fail('INK_AI_HAIRLINE_UNSUPPORTED');break;
      case 'm':{const [x,y]=nums(2);sub={closed:false,role:'outer',anchors:[anchor(x,y)]};path.push(sub);break;}
      case 'l':{const [x,y]=nums(2);line(x,y);break;}
      case 'c':{const [x1,y1,x2,y2,x,y]=nums(6);if(!sub?.anchors.length||sub.closed)fail('INK_AI_PATH_CURRENT_POINT');const a=sub.anchors.at(-1);a.out={x:x1-a.x,y:y1-a.y};const b=anchor(x,y);b.in={x:x2-x,y:y2-y};sub.anchors.push(b);break;}
      case 'v':{const [x2,y2,x,y]=nums(4);if(!sub?.anchors.length||sub.closed)fail('INK_AI_PATH_CURRENT_POINT');const b=anchor(x,y);b.in={x:x2-x,y:y2-y};sub.anchors.push(b);break;}
      case 'y':{const [x1,y1,x,y]=nums(4);if(!sub?.anchors.length||sub.closed)fail('INK_AI_PATH_CURRENT_POINT');const a=sub.anchors.at(-1);a.out={x:x1-a.x,y:y1-a.y};sub.anchors.push(anchor(x,y));break;}
      case 'h':nums(0);close();break;
      case 're':{const [x,y,w,h]=nums(4);sub={closed:true,role:'outer',anchors:[anchor(x,y),anchor(x+w,y),anchor(x+w,y+h),anchor(x,y+h)]};path.push(sub);break;}
      case 'W':case 'W*':nums(0);if(!path.length)fail('INK_AI_CLIP_PATH_REQUIRED');pendingClip=op;break;
      case 'f':case 'f*':case 'S':case 's':case 'B':case 'B*':case 'b':case 'b*':nums(0);if(['s','b','b*'].includes(op))close();emit(!['S','s'].includes(op),!['f','f*'].includes(op),op.endsWith('*'));finish();break;
      case 'n':nums(0);finish();break;
      case 'BMC':{
        if(operands.length!==1||!operands[0]?.name||operands[0].name==='OC'||marked.length>=32)fail('INK_AI_MARKED_CONTENT_UNSUPPORTED');
        marked.push({tag:operands[0].name,layer:null,groupDepth:groups.length});break;
      }
      case 'BDC':{
        if(operands.length!==2||!operands[0]?.name||marked.length>=32)fail('INK_AI_MARKED_CONTENT_UNSUPPORTED');
        const tag=operands[0].name,property=operands[1];
        if(tag==='OC'){
          const ref=property?.name?props[property.name]:property,l=layerByRef.get(ref?.ref);
          if(!l||marked.some(x=>x.layer))fail('INK_AI_OCG_REFERENCE');
          marked.push({tag,layer:l,groupDepth:groups.length});
        } else {
          const dict=property?.name?resolve(props[property.name]):property;
          if(!dict||Array.isArray(dict)||Object.keys(dict).length>32||
             Object.keys(dict).some(k=>['OC','OCMD'].includes(k)))
            fail('INK_AI_MARKED_CONTENT_UNSUPPORTED');
          marked.push({tag,layer:null,groupDepth:groups.length});
          losses.push({sourceArtboardIndex:artboardIndex,code:'PDF_TAGGED_CONTENT_ATTRIBUTES_NOT_NATIVE_EDITABLE'});
        }
        break;
      }
      case 'EMC':{
         nums(0);if(!marked.length)fail('INK_AI_MARKED_CONTENT_BALANCE:EMPTY');
         const tag=marked.at(-1);
         if(groups.length!==tag.groupDepth){
           if(tag.layer)losses.push({sourceArtboardIndex:artboardIndex,code:'PDF_OCG_MARKED_SCOPE_CROSSES_GRAPHICS_GROUP_BOUNDARY'});
           losses.push({sourceArtboardIndex:artboardIndex,code:'PDF_TAGGED_CONTENT_GRAPHICS_GROUP_SCOPE_NOT_PRESERVED'});
         }
         marked.pop();break;
       }
      case 'gs':{
        if(operands.length!==1||!operands[0]?.name)fail('INK_AI_EXTGSTATE');
        const d=resolve(ext[operands[0].name]);
        if(!d||typeof d!=='object')fail('INK_AI_EXTGSTATE_UNSUPPORTED:INVALID');
        const allowed=new Set(['Type','ca','CA','BM','SMask','AIS','TK','OP','op','OPM','SA']);
        const other=Object.keys(d).filter(k=>!allowed.has(k));
        if(other.length)fail('INK_AI_EXTGSTATE_UNSUPPORTED_KEYS:'+other.join(','));
        const neutral=d.SMask===undefined||d.SMask?.name==='None';
        if(!neutral||d.AIS===true||d.TK===true||d.OP===true||d.op===true||
           (d.OPM!==undefined&&!([0,1].includes(d.OPM)))||
           (d.SA!==undefined&&typeof d.SA!=='boolean')){
          const flags=[!neutral&&'SMask',d.AIS===true&&'AIS',d.TK===true&&'TK',d.OP===true&&'OP',d.op===true&&'op',d.OPM!==undefined&&d.OPM!==0&&'OPM',d.SA===true&&'SA'].filter(Boolean);
          fail('INK_AI_EXTGSTATE_UNSUPPORTED:NONNEUTRAL:'+flags.join(','));
        }
        const bm=d.BM?.name??(Array.isArray(d.BM)?d.BM[0]?.name:undefined);
        if(bm&&bm!=='Normal')fail('INK_AI_EXTGSTATE_UNSUPPORTED_BLEND:'+bm);
        const fillAlpha=d.ca??1,strokeAlpha=d.CA??1;
        if(!Number.isFinite(fillAlpha)||!Number.isFinite(strokeAlpha)||fillAlpha<0||fillAlpha>1||strokeAlpha<0||strokeAlpha>1)
          fail('INK_AI_EXTGSTATE_UNSUPPORTED:ALPHA');
        if(fillAlpha!==strokeAlpha)fail('INK_AI_EXTGSTATE_UNSUPPORTED:INDEPENDENT_FILL_STROKE_ALPHA');
        if(d.OPM===1)losses.push({sourceArtboardIndex:artboardIndex,code:'PDF_OVERPRINT_MODE_INACTIVE_WHEN_OVERPRINT_DISABLED'});
        if(d.SA===true)losses.push({sourceArtboardIndex:artboardIndex,code:'PDF_STROKE_ADJUSTMENT_APPROXIMATED_IN_NATIVE'});
        state.opacity=fillAlpha;break;
      }
      case 'Do':{
        if(operands.length!==1||!operands[0]?.name)fail('INK_AI_XOBJECT_NAME');
        const ref=xobjects[operands[0].name],entry=get(ref),d=entry.value;
        if(d?.Subtype?.name==='Form'){
          if(formStack.length>=8||activeForms.has(ref.ref))fail('INK_AI_FORM_CYCLE_OR_DEPTH');
          if(typeof entry.stream!=='string'||entry.stream.length>1024*1024||(expandedFormBytes+=entry.stream.length)>8*1024*1024)
            fail('INK_AI_FORM_STREAM_BUDGET');
          const formBox=resolve(d.BBox),formMatrix=resolve(d.Matrix)||I();
          if(!Array.isArray(formBox)||formBox.length!==4||!formBox.every(Number.isFinite))fail('INK_AI_FORM_BOUNDS:NOT_NUMERIC_BOX');
          if(formBox[2]<=formBox[0]||formBox[3]<=formBox[1]){
            // The Form's BBox admits no positive-area painting region.
            // Do not create visible artwork from a malformed/inverted box.
            const paintOperators=entry.stream.match(/(?:^|\s)(?:rg|RG|f\*?|S|Do)(?=\s|$)/g)||[];
            const colors=[...entry.stream.matchAll(/(?:^|\s)((?:\d+(?:\.\d+)?\s+){2}\d+(?:\.\d+)?)\s+rg\b/g)].slice(0,12).map(m=>m[1].trim());
            losses.push({sourceArtboardIndex:artboardIndex,code:'PDF_NONPOSITIVE_FORM_BBOX_SKIPPED',sourceRef:ref.ref,
              originalBBox:[...formBox],formBytes:entry.stream.length,paintOperators:paintOperators.length,declaredRGB:colors.slice(0,8)});
            break;
          }
          if(!Array.isArray(formMatrix)||formMatrix.length!==6||!formMatrix.every(Number.isFinite))fail('INK_AI_FORM_BOUNDS:INVALID_MATRIX');
          inverse(formMatrix);
          if(!d.Resources||state.clip)fail('INK_AI_FORM_RESOURCES_OR_INTERSECTING_CLIP_UNSUPPORTED');
          if(d.Group){
            const g=resolve(d.Group);
            if(g?.S?.name!=='Transparency'||g.K===true||Object.keys(g).some(k=>!['S','CS','I','K'].includes(k))||
               (g.CS&&resolve(g.CS)?.name!=='DeviceRGB'))fail('INK_AI_FORM_TRANSPARENCY_UNSUPPORTED');
            losses.push({sourceArtboardIndex:artboardIndex,code:'PDF_FORM_TRANSPARENCY_GROUP_NOT_VISUALLY_VERIFIED'});
          }
          const local=resolve(d.Resources);
          if(!local||typeof local!=='object'||Object.keys(local).some(k=>!['XObject','Font','ExtGState','Properties','ColorSpace','ProcSet'].includes(k)))
            fail('INK_AI_FORM_RESOURCES_UNSUPPORTED');
          const snapshot=structuredClone(state);
          if(states.length>=32)fail('INK_AI_GRAPHICS_STATE');
          const frame={ref:ref.ref,reader:r,resources,props,fonts,ext,xobjects,
            savedStateDepth:states.length,savedGroupDepth:groups.length,savedMarkDepth:marked.length};
          states.push(snapshot);
          const group={id:uid(),type:'group',name:'PDF Form XObject',matrix:I(),opacity:1,visible:true,locked:false,
            children:[],metadata:{sourceFormat:'AI_PDF_DISPLAY',pdfFormRef:ref.ref}};
          place(group);groups.push({object:group,layer:layer()});
          state.matrix=mul(state.matrix,formMatrix);inverse(state.matrix);
          const [x0,y0,x1,y1]=formBox;
          const corners=[anchor(x0,y0),anchor(x1,y0),anchor(x1,y1),anchor(x0,y1)];
          state.clip={id:uid(),path:createPath({id:uid(),subpaths:[{closed:true,role:'outer',anchors:corners}],
            fill:'#ffffff',stroke:'none',matrix:state.matrix})};
          losses.push({sourceArtboardIndex:artboardIndex,sourceRef:ref.ref,code:'PDF_FORM_SUBSET_BOUNDING_CLIP_PATH_EMITTED'});
          formStack.push(frame);activeForms.add(ref.ref);
          r=new Reader(entry.stream);resources=local;props=resolve(local.Properties)||{};
          fonts=resolve(local.Font)||{};ext=resolve(local.ExtGState)||{};xobjects=resolve(local.XObject)||{};
          break;
        }
        if(d?.Subtype?.name!=='Image')fail('INK_AI_XOBJECT_SUBTYPE_UNSUPPORTED:'+(d?.Subtype?.name||'MISSING'));
        const forbidden=['ImageMask','Mask','Decode','Intent','Alternates','OPI','Interpolate'].filter(key=>d[key]!==undefined);
        if(forbidden.length||d.BitsPerComponent!==8)
          fail('INK_AI_XOBJECT_IMAGE_UNSUPPORTED:'+(forbidden.length?forbidden.join(','):'BIT_DEPTH'));
        const w=d.Width,h=d.Height,color=resolve(d.ColorSpace)?.name,channels=color==='DeviceRGB'?3:color==='DeviceGray'?1:0;
        if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<=0||h<=0||!channels||(rasterPixels+=w*h)>4*1024*1024)
          fail('INK_AI_IMAGE_PIXEL_BUDGET_OR_COLOR');
        if(typeof entry.stream!=='string'||entry.stream.length!==w*h*channels)fail('INK_AI_IMAGE_LENGTH');
        let alpha=null;
        if(d.SMask){const mask=get(d.SMask),m=mask.value;
          if(m?.Subtype?.name!=='Image'||m.Width!==w||m.Height!==h||m.BitsPerComponent!==8||resolve(m.ColorSpace)?.name!=='DeviceGray'||m.SMask||m.Mask||m.ImageMask||m.Decode||m.Matte||typeof mask.stream!=='string'||mask.stream.length!==w*h)
            fail('INK_AI_IMAGE_SOFTMASK_UNSUPPORTED');
          alpha=Uint8Array.from(mask.stream,c=>c.charCodeAt(0));
        }
        const data=new Uint8Array(w*h*3);for(let p=0;p<w*h;p++)for(let c=0;c<3;c++)data[p*3+c]=entry.stream.charCodeAt(p*channels+(channels===1?0:c));
        const payload=createNormalizedPayload({format:'AI_PDF_IMAGE',width:w,height:h,bitDepth:8,colorMode:'RGB',data,alpha,provenance:{pdfObject:ref.ref}});
        place({id:uid(),type:'image',name:'PDF placed image '+ref.ref,w,h,matrix:mul(state.matrix,[1/w,0,0,-1/h,0,1]),opacity:state.opacity,clipPath:null,rasterState:formatPayloadToDocumentImageState(payload),metadata:{sourceFormat:'AI_PDF_DISPLAY',sourceObject:ref.ref}});
        if(state.clip)fail('INK_AI_CLIPPED_IMAGE_UNSUPPORTED');
        break;
      }
      case 'BX':nums(0);if(++compatibilityDepth>8)fail('INK_AI_COMPATIBILITY_DEPTH');break;
      case 'EX':nums(0);if(compatibilityDepth===0)fail('INK_AI_COMPATIBILITY_UNBALANCED');compatibilityDepth--;break;
      case 'BT':nums(0);if(state.inText)fail('INK_AI_TEXT_BALANCE');state.inText=true;state.textMatrix=I();state.textLineMatrix=I();break;
      case 'ET':nums(0);if(!state.inText)fail('INK_AI_TEXT_BALANCE');state.inText=false;break;
      case 'Tf':{
        if(!state.inText||operands.length!==2||!operands[0]?.name||!Number.isFinite(operands[1])||operands[1]<=0)
          fail('INK_AI_FONT');
        const d=resolve(fonts[operands[0].name]),subtype=d?.Subtype?.name,baseFont=d?.BaseFont?.name;
        if(!['Type1','TrueType','Type0'].includes(subtype))fail('INK_AI_FONT_UNSUPPORTED:SUBTYPE_'+(subtype||'MISSING'));
        if(typeof baseFont!=='string'||baseFont.length>128||!/^[A-Za-z0-9+_.-]+$/.test(baseFont))
          fail('INK_AI_FONT_UNSUPPORTED:BASE_FONT_NAME');
        if(subtype==='Type0'){
          state.fontInfo=admitIdentityHType0Font(d,{resolve,get});
          losses.push({sourceArtboardIndex:artboardIndex,code:'TYPE0_IDENTITY_H_TOUNICODE_EDITABLE_TEXT_FONT_OUTLINES_SUBSTITUTED'});
          losses.push({sourceArtboardIndex:artboardIndex,code:'PDF_CID_GLYPH_METRICS_AND_EMBEDDED_FONT_NOT_NATIVE'});
        }else{
          state.fontInfo=null;
          const encoding=d.Encoding?.name;
          if(d.Encoding&&!['WinAnsiEncoding','StandardEncoding'].includes(encoding))
            fail('INK_AI_FONT_UNSUPPORTED:ENCODING');
          if(subtype==='Type1'&&!['Helvetica','Times-Roman','Courier'].includes(baseFont))
            fail('INK_AI_FONT_UNSUPPORTED:NONSTANDARD_TYPE1');
          if(subtype==='Type1'&&d.FontDescriptor)fail('INK_AI_FONT_UNSUPPORTED:FONT_DESCRIPTOR');
          if(subtype==='TrueType'){
            if(d.ToUnicode)fail('INK_AI_FONT_UNSUPPORTED:TO_UNICODE_MAPPING');
            losses.push({sourceArtboardIndex:artboardIndex,code:'TRUETYPE_FONT_SUBSTITUTED_ASCII_ONLY_METRICS_UNVERIFIED'});
          }
        }
        state.font=baseFont.length>7&&baseFont.charCodeAt(6)===43&&/^[A-Z]{6}$/.test(baseFont.slice(0,6))?baseFont.slice(7):baseFont;state.fontSize=operands[1];break;
      }
      case 'Tm':if(!state.inText)fail('INK_AI_TEXT_BALANCE');state.textMatrix=[...nums(6)];state.textLineMatrix=[...state.textMatrix];break;
      case 'Td':case 'TD':{
        if(!state.inText)fail('INK_AI_TEXT_BALANCE');
        const [tx,ty]=nums(2);
        if(op==='TD')state.textLeading=-ty;
        state.textLineMatrix=mul(state.textLineMatrix??I(),[1,0,0,1,tx,ty]);
        state.textMatrix=[...state.textLineMatrix];break;
      }
      case 'TL':{
        if(!state.inText)fail('INK_AI_TEXT_BALANCE');
        state.textLeading=nums(1)[0];break;
      }
      case 'T*':{
        nums(0);if(!state.inText)fail('INK_AI_TEXT_BALANCE');
        state.textLineMatrix=mul(state.textLineMatrix??I(),[1,0,0,1,0,-(state.textLeading??0)]);
        state.textMatrix=[...state.textLineMatrix];break;
      }
      case 'Tj':{
        if(operands.length!==1||typeof operands[0]?.text!=='string')fail('INK_AI_TEXT_ENCODING_UNSUPPORTED');
        showText(operands[0].text);break;
      }
      case 'TJ':{
        if(!state.inText||!state.font||operands.length!==1||!Array.isArray(operands[0])||operands[0].length>4096)
          fail('INK_AI_TEXT_KERNING_ARRAY_UNSUPPORTED');
        for(const item of operands[0]){
          if(typeof item?.text==='string')showText(item.text);
          else if(typeof item==='number'&&Number.isFinite(item)&&Math.abs(item)<100000){
            state.textMatrix=mul(state.textMatrix,[1,0,0,1,-item*state.fontSize/1000,0]);
          }else fail('INK_AI_TEXT_KERNING_ENTRY_UNSUPPORTED');
        }
        losses.push({sourceArtboardIndex:artboardIndex,code:'PDF_TJ_KERNING_SEPARATED_EDITABLE_TEXT_RUNS_NOT_GLYPH_EXACT'});
        break;
      }
      case 'sh':{
        if(operands.length!==1||!operands[0]?.name)fail('INK_AI_SHADING_OPERAND');
        const resourcesShading=resolve(resources.Shading),shadeRef=resourcesShading?.[operands[0].name];
        if(!shadeRef)fail('INK_AI_SHADING_RESOURCE_MISSING');
        const shade=decodeBoundedAxialRGB(resolve(shadeRef),resolve);
        // Shading paints in the current PDF graphics state, bounded by the
        // active clipping path. Never create an infinite un-clipped gradient.
        const clip=clipCopy();
        if(!clip?.path?.subpaths?.length)fail('INK_AI_SHADING_CLIP_REQUIRED');
        const m=clip.path.matrix||I(),samples=[];
        for(const subpath of clip.path.subpaths)for(const a of subpath.anchors||[]){
          for(const p of [a,{x:a.x+(a.in?.x||0),y:a.y+(a.in?.y||0)},{x:a.x+(a.out?.x||0),y:a.y+(a.out?.y||0)}])
            samples.push([m[0]*p.x+m[2]*p.y+m[4],m[1]*p.x+m[3]*p.y+m[5]]);
        }
        if(!samples.length||samples.length>8192||samples.some(p=>!p.every(Number.isFinite)))
          fail('INK_AI_SHADING_CLIP_BUDGET');
        const xs=samples.map(p=>p[0]),ys=samples.map(p=>p[1]);
        const extent=Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))*2+2;
        if(!Number.isFinite(extent)||extent>65536)fail('INK_AI_SHADING_CLIP_EXTENT');
        const [x0,y0,x1,y1]=shade.coords,dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy),px=-dy/len*extent,py=dx/len*extent;
        const point=(t,side)=>({x:x0+dx*t+px*side,y:y0+dy*t+py*side});
        const emitStrip=(lo,hi,t,index)=>{
          const loL=point(lo,-1),hiL=point(hi,-1),hiR=point(hi,1),loR=point(lo,1);
          const poly=[loL,hiL,hiR,loR];
          const o=createPath({id:uid(),subpaths:[{closed:true,role:'outer',anchors:poly.map(p=>anchor(p.x,p.y))}],
            fill:color(shade.sample(t)),stroke:'none',strokeWidth:0,matrix:state.matrix,opacity:state.opacity,
            clipPath:structuredClone(clip),
            metadata:{sourceFormat:'AI_PDF_DISPLAY',operatorOffset:r.p,pdfShading:operands[0].name,
              pdfShadingRef:shadeRef.ref??null,shadeBand:index,shadeBands:AI_SHADING_BANDS}});
          place(o);
        };
        for(let i=0;i<AI_SHADING_BANDS;i++)emitStrip(i/AI_SHADING_BANDS,(i+1)/AI_SHADING_BANDS,(i+.5)/AI_SHADING_BANDS,i);
        // Complete any real clipped area outside the axial domain with the
        // required endpoint color only when the PDF declares Extend.
        const projections=samples.map(([x,y])=>((x-x0)*dx+(y-y0)*dy)/(len*len));
        const low=Math.min(...projections),high=Math.max(...projections);
        if(low<0&&shade.extend[0])emitStrip(Math.max(-65536,low-1),0,0,-1);
        if(high>1&&shade.extend[1])emitStrip(1,Math.min(65536,high+1),1,AI_SHADING_BANDS);
        losses.push({sourceArtboardIndex:artboardIndex,code:'PDF_AXIAL_RGB_TYPE2_STITCHED_GRADIENT_NATIVE_SAMPLED_STRIPS_PARTIAL',
          resourceName:operands[0].name,sourceRef:shadeRef.ref??null,bands:AI_SHADING_BANDS,
          clipping:'PRESERVED_PATH',sourceFunction:'TYPE3_SINGLE_TYPE2'});
        break;
      }
      default:{
        if(compatibilityDepth>0){
          if(++compatibilityIgnored>256||op.length>64)fail('INK_AI_COMPATIBILITY_OPERATOR_BUDGET');
          const shadeRef=op==='sh'&&operands.length===1&&operands[0]?.name?resolve(resources.Shading)?.[operands[0].name]:null;
          const shade=shadeRef?resolve(shadeRef):null;
          losses.push({sourceArtboardIndex:artboardIndex,code:'PDF_COMPATIBILITY_SECTION_UNRECOGNIZED_OPERATOR_IGNORED',operator:op,
            ...(op==='sh'?{shadingType:shade?.ShadingType??null,shadingKeys:Object.keys(shade||{}).slice(0,24),
              colorSpace:resolve(shade?.ColorSpace)?.name??null,coords:resolve(shade?.Coords)??null,
              shadingRef:shadeRef?.ref??null,resourceName:operands[0]?.name??null,shadingFunction:(()=>{const fn=resolve(shade?.Function);return fn?{type:fn.FunctionType,c0:resolve(fn.C0),c1:resolve(fn.C1),n:fn.N,domain:resolve(fn.Domain),range:resolve(fn.Range),bounds:resolve(fn.Bounds),encode:resolve(fn.Encode),functions:(resolve(fn.Functions)||[]).slice(0,6).map(f=>{const x=resolve(f);return{type:x?.FunctionType,c0:resolve(x?.C0),c1:resolve(x?.C1),n:x?.N,domain:resolve(x?.Domain)};})}:null;})(),hasClip:Boolean(state.clip),clipPoints:state.clip?.path?.subpaths?.[0]?.anchors?.length??null}: {})});
          break;
        }
        fail(`INK_AI_PDF_OPERATOR_UNSUPPORTED:${op}`);
      }
    }
    operands=[];
  }
  if(formStack.length||states.length||marked.length||operands.length||path.length||state.inText||pendingClip||compatibilityDepth)fail('INK_AI_PDF_CONTENT_UNBALANCED');
  // Keep PDF page content on a distinct Native layer/group with explicit bounds.
  // Layout groups side by side, never silently overlay multiple PDF pages.
  // OCGs are PDF-document-wide; a page generally paints only a small subset.
  // Do not create a Native layer and artboard root for every *unused* global OCG
  // on every page: 73 Adobe PDF pages otherwise materialize thousands of empty
  // objects/layers, saturating the Chromium layer panel and renderer.
  const retainedLayers=pageLayers.filter(l=>l.objects.length);
  const omittedIds=new Set(pageLayers.filter(l=>!l.objects.length).map(l=>l.id));
  if(omittedIds.size){
    for(let i=mappings.length-1;i>=0;i--)if(mappings[i].sourceArtboardIndex===artboardIndex&&omittedIds.has(mappings[i].nativeLayerId))mappings.splice(i,1);
    losses.push({sourceArtboardIndex:artboardIndex,code:'PDF_EMPTY_PAGE_OCG_LAYERS_ELIDED_NO_PAINT',count:omittedIds.size});
  }
  // Even a completely blank source PDF page needs a preserved Native artboard
  // coordinate group; it must not silently vanish from the page sequence.
  if(!retainedLayers.length)retainedLayers.push(newLayer('Empty PDF page'));
  const groupIds=[];
  for(const l of retainedLayers){
    const root={id:uid(),type:'group',name:`PDF artboard ${artboardIndex+1} coordinates`,
      matrix:[1,0,0,-1,displayX-box[0],box[3]],opacity:1,visible:true,locked:false,children:l.objects,
      metadata:{aiArtboard:{index:artboardIndex,mediaBox:[...box],displayOffset:[displayX,0]}}};
    for(const o of root.children)o.parentId=root.id;l.objects=[root];groupIds.push(root.id);
  }
  layers.push(...paintOrder.filter(l=>retainedLayers.includes(l)),...retainedLayers.filter(l=>!paintOrder.includes(l)));
  artboards.push({sourceIndex:artboardIndex,mediaBox:[...box],displayOffset:[displayX,0],nativeRootGroupIds:groupIds,sourceObjects:objects});
  displayX+=width+24;
  }
  if(!totalObjects)fail('INK_AI_EDITABLE_CONTENT_REQUIRED');
  if(pages.length>1)losses.push({code:'PDF_PAGES_AS_OFFSET_NATIVE_GROUPS_NOT_INK_ARTBOARDS'});
  return {layers,receipt:{schema:'INK_AI_IMPORT_FIDELITY_V2',status:'VISUAL_IMPORT_PARTIAL',family:probe.family,sourceBytes:bytes.length,source:provenanceFor(bytes),sourceArtboard:artboards.length===1?artboards[0].mediaBox:null,sourceArtboards:artboards,sourceArtboardCount:artboards.length,sourceLayerTree:'UNKNOWN_ADOBE_PRIVATE',sourceOptionalContentGroups:ocgs.length,nativeLayers:layers.length,nativeObjects:totalObjects,mappings,losses,unsupported:['LEGACY_POSTSCRIPT','NON_FLATE_PDF_FILTERS','ADOBE_PRIVATE_OBJECTS','NON_RGB8_OR_COMPLEX_PLACED_RASTER','GRADIENTS','COMPLEX_TEXT','INTERSECTING_CLIPS'],fullLayerFidelity:false}};
}

export function decodeAiDocument(input,options={}) {
  const step=decodeAiDocumentSteps(input,options).next();
  if(!step.done)throw new Error('INK_AI_ASYNC_FLATE_DECODE_REQUIRED');
  return step.value;
}
export function decodeAiDocumentAsync(input,options={}) {
  return runInflatingDecoder(decodeAiDocumentSteps(input,options),{maxExpandedBytes:8*1024*1024});
}
