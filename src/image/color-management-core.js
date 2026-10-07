const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const finite=(v,name='value')=>{const n=Number(v);if(!Number.isFinite(n))throw new Error(`INK_COLOR_NONFINITE:${name}`);return n;};
export const BIT_DEPTHS=Object.freeze([8,16,32]);
export const COLOR_MODES=Object.freeze({
  RGB:Object.freeze({name:'RGB',channels:['R','G','B'],channelCount:3,pcsFallback:'XYZ D50 via sRGB D65 + Bradford'}),
  CMYK:Object.freeze({name:'CMYK',channels:['C','M','Y','K'],channelCount:4,pcsFallback:'device-independent bounded formula; not press-proof'}),
  Lab:Object.freeze({name:'Lab',channels:['L','a','b'],channelCount:3,whitePoint:'D50'}),
  Multichannel:Object.freeze({name:'Multichannel',channels:null,channelCount:null})
});
export const BUILT_IN_PROFILES=Object.freeze({
  sRGB:Object.freeze({id:'builtin-srgb-d65',name:'sRGB IEC61966-2.1 fallback',colorSpace:'RGB ',pcs:'XYZ ',whitePoint:'D65',transform:'matrix-trc-standard'}),
  LabPCS:Object.freeze({id:'builtin-lab-d50',name:'Lab PCS reference',colorSpace:'Lab ',pcs:'Lab ',whitePoint:'D50',transform:'pcs-reference'})
});

export function getColorModeDescriptor(mode,channelCount=null,names=null){
  const descriptor=COLOR_MODES[mode];if(!descriptor)throw new Error(`INK_COLOR_MODE_UNSUPPORTED:${mode}`);
  if(mode==='Multichannel'){
    const count=Math.floor(Number(channelCount));if(!(count>0))throw new Error('INK_MULTICHANNEL_REQUIRES_CHANNEL_COUNT');
    const channelNames=Array.isArray(names)&&names.length===count?names.map(String):Array.from({length:count},(_,i)=>`Channel ${i+1}`);
    return{name:'Multichannel',channels:channelNames,channelCount:count};
  }
  if(channelCount!=null&&Number(channelCount)!==descriptor.channelCount)throw new Error('INK_COLOR_MODE_CHANNEL_COUNT_MISMATCH');
  return descriptor;
}
export function validateBitDepth(bitDepth){bitDepth=Number(bitDepth);if(!BIT_DEPTHS.includes(bitDepth))throw new Error(`INK_BIT_DEPTH_UNSUPPORTED:${bitDepth}`);return bitDepth;}
function ctor(bitDepth){return bitDepth===8?Uint8Array:bitDepth===16?Uint16Array:Float32Array;}
export function createSampleArray(bitDepth,length,values=null){
  bitDepth=validateBitDepth(bitDepth);length=Math.floor(Number(length));if(!(length>=0))throw new Error('INK_SAMPLE_ARRAY_LENGTH_INVALID');const C=ctor(bitDepth),out=new C(length),max=bitDepth===8?255:65535;
  if(values){if(values.length!==length)throw new Error('INK_SAMPLE_ARRAY_SIZE_MISMATCH');for(let i=0;i<length;i++){const v=finite(values[i],`sample-${i}`);out[i]=bitDepth===32?v:Math.round(clamp(v,0,max));}}
  return out;
}
export function sampleToNormalized(value,bitDepth){bitDepth=validateBitDepth(bitDepth);value=finite(value);return bitDepth===32?value:value/(bitDepth===8?255:65535);}
export function normalizedToSample(value,bitDepth){bitDepth=validateBitDepth(bitDepth);value=finite(value);if(bitDepth===32)return value;return Math.round(clamp(value,0,1)*(bitDepth===8?255:65535));}

export function createColorRaster({width,height,bitDepth=8,colorMode='RGB',channelCount=null,channelNames=null,data=null,alpha=null}={}){
  width=Math.floor(Number(width));height=Math.floor(Number(height));if(!(width>0&&height>0))throw new Error('INK_COLOR_RASTER_DIMENSIONS_INVALID');bitDepth=validateBitDepth(bitDepth);
  const descriptor=getColorModeDescriptor(colorMode,channelCount,channelNames),count=descriptor.channelCount,pixels=width*height;
  const samples=createSampleArray(bitDepth,pixels*count,data||null);const alphaPlane=alpha==null?null:createSampleArray(bitDepth,pixels,alpha);
  return{type:'color-raster',width,height,bitDepth,colorMode,channelCount:count,channelNames:[...descriptor.channels],data:samples,alpha:alphaPlane,float32Policy:bitDepth===32?'finite values preserved, including HDR outside 0..1; integer export clamps to 0..1':null};
}
export function cloneColorRaster(raster){return{...raster,channelNames:[...raster.channelNames],data:new (raster.data.constructor)(raster.data),alpha:raster.alpha?new (raster.alpha.constructor)(raster.alpha):null};}
export function readNormalizedSample(raster,pixelIndex,channelIndex){const pixels=raster.width*raster.height;if(pixelIndex<0||pixelIndex>=pixels||channelIndex<0||channelIndex>=raster.channelCount)throw new Error('INK_COLOR_SAMPLE_INDEX_OUT_OF_RANGE');return sampleToNormalized(raster.data[pixelIndex*raster.channelCount+channelIndex],raster.bitDepth);}
export function writeNormalizedSample(raster,pixelIndex,channelIndex,value){const pixels=raster.width*raster.height;if(pixelIndex<0||pixelIndex>=pixels||channelIndex<0||channelIndex>=raster.channelCount)throw new Error('INK_COLOR_SAMPLE_INDEX_OUT_OF_RANGE');raster.data[pixelIndex*raster.channelCount+channelIndex]=normalizedToSample(value,raster.bitDepth);return raster;}
export function convertBitDepth(raster,targetBitDepth){
  targetBitDepth=validateBitDepth(targetBitDepth);const out=createColorRaster({width:raster.width,height:raster.height,bitDepth:targetBitDepth,colorMode:raster.colorMode,channelCount:raster.channelCount,channelNames:raster.channelNames});
  for(let i=0;i<raster.data.length;i++)out.data[i]=normalizedToSample(sampleToNormalized(raster.data[i],raster.bitDepth),targetBitDepth);
  if(raster.alpha){out.alpha=createSampleArray(targetBitDepth,raster.alpha.length);for(let i=0;i<raster.alpha.length;i++)out.alpha[i]=normalizedToSample(sampleToNormalized(raster.alpha[i],raster.bitDepth),targetBitDepth);}
  return out;
}

const D50=[0.96422,1,0.82521],D65=[0.95047,1,1.08883];
const SRGB_TO_XYZ_D65=[[0.4124564,0.3575761,0.1804375],[0.2126729,0.7151522,0.0721750],[0.0193339,0.1191920,0.9503041]];
const XYZ_D65_TO_SRGB=[[3.2404542,-1.5371385,-0.4985314],[-0.9692660,1.8760108,0.0415560],[0.0556434,-0.2040259,1.0572252]];
const BRADFORD_D65_D50=[[1.0478112,0.0228866,-0.0501270],[0.0295424,0.9904844,-0.0170491],[-0.0092345,0.0150436,0.7521316]];
const BRADFORD_D50_D65=[[0.9555766,-0.0230393,0.0631636],[-0.0282895,1.0099416,0.0210077],[0.0122982,-0.0204830,1.3299098]];
const mul3=(m,v)=>m.map(r=>r[0]*v[0]+r[1]*v[1]+r[2]*v[2]);
const srgbDecode=v=>{v=clamp(finite(v),0,1);return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;};
const srgbEncode=v=>{v=Math.max(0,finite(v));return v<=0.0031308?12.92*v:1.055*(v**(1/2.4))-0.055;};
export function rgbToXyz(rgb,{pcsWhite='D50'}={}){const linear=rgb.map(srgbDecode),d65=mul3(SRGB_TO_XYZ_D65,linear);return pcsWhite==='D65'?d65:mul3(BRADFORD_D65_D50,d65);}
export function xyzToRgb(xyz,{pcsWhite='D50',clampOutput=true}={}){const d65=pcsWhite==='D65'?xyz.map(finite):mul3(BRADFORD_D50_D65,xyz.map(finite)),linear=mul3(XYZ_D65_TO_SRGB,d65),rgb=linear.map(srgbEncode);return clampOutput?rgb.map(v=>clamp(v,0,1)):rgb;}
const labF=t=>t>216/24389?Math.cbrt(t):(841/108)*t+4/29;
const labFinv=t=>t**3>216/24389?t**3:(108/841)*(t-4/29);
export function xyzToLab(xyz){const f=xyz.map((v,i)=>labF(finite(v)/D50[i]));return[116*f[1]-16,500*(f[0]-f[1]),200*(f[1]-f[2])];}
export function labToXyz(lab){const L=finite(lab[0]),a=finite(lab[1]),b=finite(lab[2]),fy=(L+16)/116,fx=fy+a/500,fz=fy-b/200;return[labFinv(fx)*D50[0],labFinv(fy)*D50[1],labFinv(fz)*D50[2]];}
export const rgbToLab=rgb=>xyzToLab(rgbToXyz(rgb));
export const labToRgb=lab=>xyzToRgb(labToXyz(lab));
export function rgbToCmyk(rgb){const [r,g,b]=rgb.map(v=>clamp(finite(v),0,1)),k=1-Math.max(r,g,b);if(k>=1-1e-12)return[0,0,0,1];return[(1-r-k)/(1-k),(1-g-k)/(1-k),(1-b-k)/(1-k),k].map(v=>clamp(v,0,1));}
export function cmykToRgb(cmyk){const [c,m,y,k]=cmyk.map(v=>clamp(finite(v),0,1));return[(1-c)*(1-k),(1-m)*(1-k),(1-y)*(1-k)];}
export function convertColor(values,from,to){if(from===to)return values.map(finite);if(from==='RGB'&&to==='Lab')return rgbToLab(values);if(from==='Lab'&&to==='RGB')return labToRgb(values);if(from==='RGB'&&to==='CMYK')return rgbToCmyk(values);if(from==='CMYK'&&to==='RGB')return cmykToRgb(values);if(from==='Lab'&&to==='CMYK')return rgbToCmyk(labToRgb(values));if(from==='CMYK'&&to==='Lab')return rgbToLab(cmykToRgb(values));throw new Error(`INK_COLOR_CONVERSION_UNSUPPORTED:${from}->${to}`);}

const sig=(bytes,offset)=>String.fromCharCode(...bytes.slice(offset,offset+4));
const u32=(view,offset)=>view.getUint32(offset,false);
const s15f16=(view,offset)=>view.getInt32(offset,false)/65536;
function fingerprint(bytes){let h=2166136261;for(const b of bytes){h^=b;h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,'0');}
export function parseIccProfile(input){
  const bytes=input instanceof Uint8Array?new Uint8Array(input):input instanceof ArrayBuffer?new Uint8Array(input):new Uint8Array(input||[]);if(bytes.length<132)throw new Error('INK_ICC_PROFILE_TOO_SMALL');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),size=u32(view,0);if(size<132||size>bytes.length)throw new Error('INK_ICC_PROFILE_SIZE_OUT_OF_BOUNDS');
  const major=bytes[8],signature=sig(bytes,36);if(signature!=='acsp')throw new Error('INK_ICC_SIGNATURE_INVALID');if(major!==2&&major!==4)throw new Error(`INK_ICC_VERSION_UNSUPPORTED:${major}`);
  const tagCount=u32(view,128),tableEnd=132+tagCount*12;if(tableEnd>size)throw new Error('INK_ICC_TAG_TABLE_OUT_OF_BOUNDS');const tags={};
  for(let i=0;i<tagCount;i++){const base=132+i*12,name=sig(bytes,base),offset=u32(view,base+4),length=u32(view,base+8);if(offset<0||length<0||offset+length>size)throw new Error(`INK_ICC_TAG_OUT_OF_BOUNDS:${name}`);tags[name]={signature:name,offset,size:length,type:length>=4?sig(bytes,offset):null};}
  return{type:'icc-profile',versionMajor:major,profileClass:sig(bytes,12),colorSpace:sig(bytes,16),pcs:sig(bytes,20),declaredSize:size,tags,fingerprint:fingerprint(bytes.slice(0,size)),embeddedBytes:new Uint8Array(bytes.slice(0,size))};
}
function profileBytes(profile){return profile?.embeddedBytes instanceof Uint8Array?profile.embeddedBytes:null;}
function parseXyzTag(profile,name){const tag=profile.tags?.[name],bytes=profileBytes(profile);if(!tag||!bytes||tag.size<20||tag.type!=='XYZ ')return null;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return[s15f16(view,tag.offset+8),s15f16(view,tag.offset+12),s15f16(view,tag.offset+16)];}
function parseCurve(profile,name){const tag=profile.tags?.[name],bytes=profileBytes(profile);if(!tag||!bytes||tag.size<12)return null;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),type=tag.type;if(type==='curv'){
    const count=u32(view,tag.offset+8);if(count===0)return{kind:'identity'};if(count===1){if(tag.size<14)return null;return{kind:'gamma',gamma:view.getUint16(tag.offset+12,false)/256};}if(tag.size<12+count*2)return null;const table=[];for(let i=0;i<count;i++)table.push(view.getUint16(tag.offset+12+i*2,false)/65535);return{kind:'table',table};
  }if(type==='para'&&tag.size>=16){const fn=view.getUint16(tag.offset+8,false);if(fn!==0)return null;return{kind:'gamma',gamma:s15f16(view,tag.offset+12)};}return null;
}
function applyCurve(curve,v){v=clamp(finite(v),0,1);if(curve.kind==='identity')return v;if(curve.kind==='gamma')return v**curve.gamma;const table=curve.table,pos=v*(table.length-1),lo=Math.floor(pos),hi=Math.min(table.length-1,Math.ceil(pos)),t=pos-lo;return table[lo]+(table[hi]-table[lo])*t;}
function parseSf32Matrix(profile,name='chad'){const tag=profile.tags?.[name],bytes=profileBytes(profile);if(!tag||!bytes||tag.type!=='sf32'||tag.size<44)return null;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),m=[];for(let r=0;r<3;r++){m[r]=[];for(let c=0;c<3;c++)m[r][c]=s15f16(view,tag.offset+8+(r*3+c)*4);}return m;}
function invert3(m){const a=m[0][0],b=m[0][1],c=m[0][2],d=m[1][0],e=m[1][1],f=m[1][2],g=m[2][0],h=m[2][1],i=m[2][2],A=e*i-f*h,B=-(d*i-f*g),C=d*h-e*g,D=-(b*i-c*h),E=a*i-c*g,F=-(a*h-b*g),G=b*f-c*e,H=-(a*f-c*d),I=a*e-b*d,det=a*A+b*B+c*C;if(!Number.isFinite(det)||Math.abs(det)<1e-12)throw new Error('INK_ICC_CHAD_NONINVERTIBLE');return[[A/det,D/det,G/det],[B/det,E/det,H/det],[C/det,F/det,I/det]];}
function normalizeXyz(xyz){if(!Array.isArray(xyz)||xyz.length!==3)throw new Error('INK_ICC_XYZ_INVALID');return xyz.map((v,i)=>finite(v,`xyz-${i}`));}
export function inspectIccProfile(input){const p=input?.type==='icc-profile'?input:parseIccProfile(input),chad=parseSf32Matrix(p);return{versionMajor:p.versionMajor,profileClass:p.profileClass,colorSpace:p.colorSpace,pcs:p.pcs,fingerprint:p.fingerprint,tagSignatures:Object.keys(p.tags).sort(),embeddedByteLength:p.embeddedBytes.length,hasChromaticAdaptation:Boolean(chad),chromaticAdaptationMatrix:chad?chad.map(row=>[...row]):null};}
export function nativeIlluminantXyzToPcs(input,xyz){const profile=input?.type==='icc-profile'?input:parseIccProfile(input),chad=parseSf32Matrix(profile);if(!chad)return{status:'unsupported-transform',reason:'chad-tag-missing',profileFingerprint:profile.fingerprint};return{status:'ok',values:mul3(chad,normalizeXyz(xyz)),profileFingerprint:profile.fingerprint,direction:'native-illuminant-to-pcs'};}
export function pcsXyzToNativeIlluminant(input,xyz){const profile=input?.type==='icc-profile'?input:parseIccProfile(input),chad=parseSf32Matrix(profile);if(!chad)return{status:'unsupported-transform',reason:'chad-tag-missing',profileFingerprint:profile.fingerprint};return{status:'ok',values:mul3(invert3(chad),normalizeXyz(xyz)),profileFingerprint:profile.fingerprint,direction:'pcs-to-native-illuminant'};}
export function transformRgbWithIcc(input,rgb){
  const profile=input?.type==='icc-profile'?input:parseIccProfile(input);if(profile.colorSpace!=='RGB ')return{status:'unsupported-transform',reason:'non-rgb-profile',profileFingerprint:profile.fingerprint};if(profile.pcs!=='XYZ '&&profile.pcs!=='Lab ')return{status:'unsupported-transform',reason:'unsupported-pcs',profileFingerprint:profile.fingerprint};
  const primaries=['rXYZ','gXYZ','bXYZ'].map(n=>parseXyzTag(profile,n)),curves=['rTRC','gTRC','bTRC'].map(n=>parseCurve(profile,n));if(primaries.some(v=>!v)||curves.some(v=>!v))return{status:'unsupported-transform',reason:'matrix-trc-tags-missing-or-unsupported',profileFingerprint:profile.fingerprint};
  const linear=rgb.map((v,i)=>applyCurve(curves[i],v)),xyz=[0,1,2].map(row=>primaries[0][row]*linear[0]+primaries[1][row]*linear[1]+primaries[2][row]*linear[2]),chad=parseSf32Matrix(profile),wtpt=parseXyzTag(profile,'wtpt'),values=profile.pcs==='Lab '?xyzToLab(xyz):xyz;
  return{status:'ok',pcs:profile.pcs,values,profileFingerprint:profile.fingerprint,whitePoint:wtpt,chromaticAdaptationTagPresent:Boolean(chad),chromaticAdaptationApplied:false};
}


export function serializeColorRaster(raster) {
  if (!raster || raster.type !== 'color-raster') throw new Error('INK_COLOR_RASTER_REQUIRED');
  const normalized = createColorRaster({
    width: raster.width,
    height: raster.height,
    bitDepth: raster.bitDepth,
    colorMode: raster.colorMode,
    channelCount: raster.channelCount,
    channelNames: raster.channelNames,
    data: raster.data,
    alpha: raster.alpha
  });
  return {
    type: 'color-raster',
    width: normalized.width,
    height: normalized.height,
    bitDepth: normalized.bitDepth,
    colorMode: normalized.colorMode,
    channelCount: normalized.channelCount,
    channelNames: [...normalized.channelNames],
    data: Array.from(normalized.data),
    alpha: normalized.alpha ? Array.from(normalized.alpha) : null,
    float32Policy: normalized.float32Policy
  };
}

export function deserializeColorRaster(state) {
  if (!state || state.type !== 'color-raster') throw new Error('INK_COLOR_RASTER_STATE_REQUIRED');
  return createColorRaster({
    width: state.width,
    height: state.height,
    bitDepth: state.bitDepth,
    colorMode: state.colorMode,
    channelCount: state.channelCount,
    channelNames: state.channelNames,
    data: state.data,
    alpha: state.alpha
  });
}

export function colorRasterToRgba8(input, { icc = null } = {}) {
  let raster;
  try {
    raster = input?.data && ArrayBuffer.isView(input.data) ? cloneColorRaster(input) : deserializeColorRaster(input);
  } catch (error) {
    return { status: 'unsupported-render', reason: 'invalid-raster', error: String(error?.message || error) };
  }
  if (raster.colorMode === 'Lab' || raster.colorMode === 'Multichannel') {
    return { status: 'unsupported-render', reason: `color-mode:${raster.colorMode}`, sourceBitDepth: raster.bitDepth, colorMode: raster.colorMode };
  }
  const profileBytes = icc?.bytes ?? icc;
  let profile = null;
  if (profileBytes?.length) {
    try { profile = parseIccProfile(Uint8Array.from(profileBytes)); }
    catch (error) {
      return { status: 'unsupported-render', reason: 'icc-invalid-or-unsupported', error: String(error?.message || error), sourceBitDepth: raster.bitDepth, colorMode: raster.colorMode };
    }
  }
  if (profile && raster.colorMode !== 'RGB') {
    return { status: 'unsupported-render', reason: 'icc-transform-non-rgb-not-implemented', sourceBitDepth: raster.bitDepth, colorMode: raster.colorMode };
  }
  const pixels = raster.width * raster.height;
  const data = new Uint8ClampedArray(pixels * 4);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const values = Array.from({ length: raster.channelCount }, (_, channel) => readNormalizedSample(raster, pixel, channel));
    let rgb;
    if (raster.colorMode === 'CMYK') rgb = cmykToRgb(values);
    else {
      rgb = values.slice(0, 3);
      if (profile) {
        const transformed = transformRgbWithIcc(profile, rgb);
        if (transformed.status !== 'ok') {
          return {
            status: 'unsupported-render',
            reason: transformed.reason || 'icc-transform-unsupported',
            profileFingerprint: transformed.profileFingerprint || profile.fingerprint,
            sourceBitDepth: raster.bitDepth,
            colorMode: raster.colorMode
          };
        }
        if (transformed.pcs === 'XYZ ') rgb = xyzToRgb(transformed.values, { pcsWhite: 'D50' });
        else if (transformed.pcs === 'Lab ') rgb = labToRgb(transformed.values);
        else return { status: 'unsupported-render', reason: 'icc-pcs-unsupported', sourceBitDepth: raster.bitDepth, colorMode: raster.colorMode };
      }
    }
    const offset = pixel * 4;
    data[offset] = Math.round(clamp(rgb[0], 0, 1) * 255);
    data[offset + 1] = Math.round(clamp(rgb[1], 0, 1) * 255);
    data[offset + 2] = Math.round(clamp(rgb[2], 0, 1) * 255);
    data[offset + 3] = raster.alpha ? Math.round(clamp(sampleToNormalized(raster.alpha[pixel], raster.bitDepth), 0, 1) * 255) : 255;
  }
  return {
    status: 'ok',
    imageData: { width: raster.width, height: raster.height, data },
    sourceBitDepth: raster.bitDepth,
    colorMode: raster.colorMode,
    displayConversion: raster.bitDepth === 8 && !profile && raster.colorMode === 'RGB' ? 'identity-rgb8' : 'bounded-preview-to-rgba8'
  };
}
