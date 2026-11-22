const clamp=(v,a=0,b=255)=>Math.max(a,Math.min(b,v));
const clamp01=v=>clamp(Number(v)||0,0,1);
const byte=v=>clamp(Math.round(Number(v)||0),0,255);
const numberOr=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const cloneData=data=>new Uint8ClampedArray(data);

function assertImageData(imageData){
  const width=Math.floor(Number(imageData?.width)),height=Math.floor(Number(imageData?.height));
  if(!(width>0&&height>0)||!imageData?.data||imageData.data.length!==width*height*4)throw new Error('INK_ADVANCED_RASTER_INVALID_IMAGE_DATA');
  return{width,height,data:imageData.data};
}
function maskAlpha(mask,index,total){
  if(!mask)return 1;
  const alpha=mask.alpha||mask;
  if(!alpha||alpha.length!==total)throw new Error('INK_ADVANCED_RASTER_MASK_SIZE_MISMATCH');
  return clamp01((alpha[index]||0)/255);
}
function mixProcessed(source,processed,{opacity=1,mask=null}={}){
  const {width,height,data}=assertImageData(source),processedData=processed?.data||processed,out=cloneData(data),amount=clamp01(opacity),total=width*height;
  if(!processedData||processedData.length!==data.length)throw new Error('INK_ADVANCED_RASTER_PROCESSED_SIZE_MISMATCH');
  for(let i=0;i<total;i++){
    const local=amount*maskAlpha(mask,i,total),o=i*4;
    for(let c=0;c<3;c++)out[o+c]=byte(data[o+c]+(processedData[o+c]-data[o+c])*local);
    out[o+3]=data[o+3];
  }
  return{width,height,data:out};
}
const rgbToHsl=(r,g,b)=>{r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,d=max-min;let h=0,s=0;if(d){s=l>.5?d/(2-max-min):d/(max+min);if(max===r)h=(g-b)/d+(g<b?6:0);else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h/=6;}return[h,s,l];};
const hslToRgb=(h,s,l)=>{if(!s){const v=l*255;return[v,v,v];}const hue=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;},q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;return[hue(p,q,h+1/3)*255,hue(p,q,h)*255,hue(p,q,h-1/3)*255];};
const luminance=(r,g,b)=>r*.2126+g*.7152+b*.0722;

export const ADVANCED_ADJUSTMENTS=Object.freeze([
  'exposure','vibrance','blackWhite','photoFilter','channelMixer','colorLookup','invert','posterize','threshold','selectiveColor'
]);
export const ADVANCED_FILTERS=Object.freeze(['motionBlur','median','unsharpMask','emboss','mosaic','minimum','maximum','reduceNoise']);
export const FILTER_GALLERY=Object.freeze([
  {id:'motionBlur',category:'blur'}, {id:'median',category:'noise'}, {id:'unsharpMask',category:'sharpen'}, {id:'emboss',category:'stylize'},
  {id:'mosaic',category:'pixelate'}, {id:'minimum',category:'other'}, {id:'maximum',category:'other'}, {id:'reduceNoise',category:'noise'}
]);

function normalizeColor(value,fallback=[255,255,255]){
  if(Array.isArray(value))return[value[0]??fallback[0],value[1]??fallback[1],value[2]??fallback[2]].map(byte);
  if(value&&typeof value==='object')return[byte(value.r??fallback[0]),byte(value.g??fallback[1]),byte(value.b??fallback[2])];
  const s=String(value||'').replace(/^#/,'');if(/^[0-9a-f]{6}$/i.test(s))return[parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)];return[...fallback];
}
function lookup3d(rgb,lut){
  const size=Math.max(2,Math.floor(Number(lut?.size)||0));
  const table=lut?.data;
  if(!table||table.length!==size*size*size*3)throw new Error('INK_ADVANCED_LUT_INVALID');
  const coord=rgb.map(v=>clamp(v/255,0,1)*(size-1)),lo=coord.map(Math.floor),hi=coord.map(v=>Math.min(size-1,Math.ceil(v))),t=coord.map((v,i)=>v-lo[i]);
  const sample=(r,g,b,c)=>{const idx=(((b*size+g)*size+r)*3+c),v=Number(table[idx]);return Number.isFinite(v)?(v<=1&&v>=0?v*255:v):0;};
  const out=[];
  for(let c=0;c<3;c++){
    const c000=sample(lo[0],lo[1],lo[2],c),c100=sample(hi[0],lo[1],lo[2],c),c010=sample(lo[0],hi[1],lo[2],c),c110=sample(hi[0],hi[1],lo[2],c);
    const c001=sample(lo[0],lo[1],hi[2],c),c101=sample(hi[0],lo[1],hi[2],c),c011=sample(lo[0],hi[1],hi[2],c),c111=sample(hi[0],hi[1],hi[2],c);
    const x00=c000+(c100-c000)*t[0],x10=c010+(c110-c010)*t[0],x01=c001+(c101-c001)*t[0],x11=c011+(c111-c011)*t[0];
    const y0=x00+(x10-x00)*t[1],y1=x01+(x11-x01)*t[1];out[c]=y0+(y1-y0)*t[2];
  }
  return out;
}

export function applyAdvancedAdjustment(imageData,{type,params={},opacity=1,mask=null}={}){
  if(!ADVANCED_ADJUSTMENTS.includes(type))throw new Error(`INK_ADVANCED_ADJUSTMENT_UNSUPPORTED:${type}`);
  const {width,height,data}=assertImageData(imageData),processed=cloneData(data),total=width*height;
  for(let i=0;i<total;i++){
    const o=i*4,r=data[o],g=data[o+1],b=data[o+2];let rgb=[r,g,b];
    if(type==='exposure'){
      const exposure=clamp(Number(params.exposure)||0,-8,8),offset=clamp(Number(params.offset)||0,-1,1)*255,gamma=Math.max(.01,Math.min(10,Number(params.gamma)||1)),scale=2**exposure;
      rgb=rgb.map(v=>255*Math.pow(clamp((v*scale+offset)/255,0,1),1/gamma));
    }else if(type==='vibrance'){
      const amount=clamp(Number(params.amount)||0,-100,100)/100,[h,s,l]=rgbToHsl(r,g,b),boost=amount>=0?amount*(1-s):amount;
      rgb=hslToRgb(h,clamp(s+boost,0,1),l);
    }else if(type==='blackWhite'){
      const weights=params.weights||{},wr=Number(weights.r??.3),wg=Number(weights.g??.59),wb=Number(weights.b??.11),sum=Math.abs(wr)+Math.abs(wg)+Math.abs(wb)||1,v=(r*wr+g*wg+b*wb)/sum;
      rgb=[v,v,v];
    }else if(type==='photoFilter'){
      const color=normalizeColor(params.color,[255,180,80]),density=clamp01(numberOr(params.density,25)/100),preserve=params.preserveLuminosity!==false,baseLum=luminance(r,g,b);
      rgb=rgb.map((v,c)=>v+(color[c]-v)*density);if(preserve){const newLum=luminance(...rgb)||1,rating=baseLum/newLum;rgb=rgb.map(v=>v*rating);}
    }else if(type==='channelMixer'){
      const m=params.matrix||[[1,0,0],[0,1,0],[0,0,1]],k=params.constant||[0,0,0];
      rgb=[0,1,2].map(row=>(m[row]?.[0]??(row===0?1:0))*r+(m[row]?.[1]??(row===1?1:0))*g+(m[row]?.[2]??(row===2?1:0))*b+(Number(k[row])||0)*255);
    }else if(type==='colorLookup')rgb=lookup3d(rgb,params.lut||params);
    else if(type==='invert')rgb=[255-r,255-g,255-b];
    else if(type==='posterize'){
      const levels=clamp(Math.round(Number(params.levels)||4),2,256),step=255/(levels-1);rgb=rgb.map(v=>Math.round(v/step)*step);
    }else if(type==='threshold'){
      const level=clamp(numberOr(params.level,128),0,255),v=luminance(r,g,b)>=level?255:0;rgb=[v,v,v];
    }else if(type==='selectiveColor'){
      const corrections=params.corrections||{},max=Math.max(r,g,b),min=Math.min(r,g,b),range=max-min,target=max<64?'blacks':min>192?'whites':range<24?'neutrals':max===r?'reds':max===g?'greens':'blues',c=corrections[target]||corrections.neutrals||{};
      rgb=[r+(Number(c.red)||0)*2.55,g+(Number(c.green)||0)*2.55,b+(Number(c.blue)||0)*2.55];
    }
    processed[o]=byte(rgb[0]);processed[o+1]=byte(rgb[1]);processed[o+2]=byte(rgb[2]);processed[o+3]=data[o+3];
  }
  return mixProcessed(imageData,processed,{opacity,mask});
}

function pixel(data,w,h,x,y,c){x=clamp(x,0,w-1);y=clamp(y,0,h-1);return data[(y*w+x)*4+c];}
function convolveRgb(imageData,kernel,side,bias=0,divisor=1){const {width:w,height:h,data}=assertImageData(imageData),out=cloneData(data),half=side>>1;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const o=(y*w+x)*4;for(let c=0;c<3;c++){let sum=0;for(let ky=0;ky<side;ky++)for(let kx=0;kx<side;kx++)sum+=pixel(data,w,h,x+kx-half,y+ky-half,c)*kernel[ky*side+kx];out[o+c]=byte(sum/divisor+bias);}out[o+3]=data[o+3];}return{width:w,height:h,data:out};}
function boxBlur(imageData,radius){const {width:w,height:h,data}=assertImageData(imageData),r=clamp(Math.round(Number(radius)||1),1,12),out=cloneData(data);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const o=(y*w+x)*4;for(let c=0;c<3;c++){let sum=0,count=0;for(let yy=y-r;yy<=y+r;yy++)for(let xx=x-r;xx<=x+r;xx++){sum+=pixel(data,w,h,xx,yy,c);count++;}out[o+c]=byte(sum/count);}out[o+3]=data[o+3];}return{width:w,height:h,data:out};}
function neighborhoodValues(data,w,h,x,y,c,r){const values=[];for(let yy=y-r;yy<=y+r;yy++)for(let xx=x-r;xx<=x+r;xx++)values.push(pixel(data,w,h,xx,yy,c));return values;}

export function applyAdvancedFilter(imageData,{type,params={},opacity=1,mask=null}={}){
  if(!ADVANCED_FILTERS.includes(type))throw new Error(`INK_ADVANCED_FILTER_UNSUPPORTED:${type}`);
  const {width:w,height:h,data}=assertImageData(imageData);let result;
  if(type==='motionBlur'){
    const distance=clamp(Math.round(Number(params.distance)||4),1,64),angle=(Number(params.angle)||0)*Math.PI/180,dx=Math.cos(angle),dy=Math.sin(angle),out=cloneData(data);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const o=(y*w+x)*4;for(let c=0;c<3;c++){let sum=0,count=0;for(let step=-distance;step<=distance;step++){sum+=pixel(data,w,h,Math.round(x+dx*step),Math.round(y+dy*step),c);count++;}out[o+c]=byte(sum/count);}out[o+3]=data[o+3];}result={width:w,height:h,data:out};
  }else if(type==='median'||type==='minimum'||type==='maximum'){
    const r=clamp(Math.round(Number(params.radius)||1),1,6),out=cloneData(data);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const o=(y*w+x)*4;for(let c=0;c<3;c++){const values=neighborhoodValues(data,w,h,x,y,c,r);if(type==='median'){values.sort((a,b)=>a-b);out[o+c]=values[values.length>>1];}else out[o+c]=type==='minimum'?Math.min(...values):Math.max(...values);}out[o+3]=data[o+3];}result={width:w,height:h,data:out};
  }else if(type==='unsharpMask'){
    const radius=clamp(Math.round(Number(params.radius)||1),1,8),amount=clamp(numberOr(params.amount,100),0,500)/100,threshold=clamp(Number(params.threshold)||0,0,255),blur=boxBlur(imageData,radius),out=cloneData(data);for(let i=0;i<w*h;i++){const o=i*4;for(let c=0;c<3;c++){const d=data[o+c]-blur.data[o+c];out[o+c]=Math.abs(d)>=threshold?byte(data[o+c]+d*amount):data[o+c];}}result={width:w,height:h,data:out};
  }else if(type==='emboss'){
    const strength=clamp(numberOr(params.strength,1),0,4),kernel=[-2,-1,0,-1,1,1,0,1,2].map(v=>v*strength);result=convolveRgb(imageData,kernel,3,128,1);
  }else if(type==='mosaic'){
    const size=clamp(Math.round(Number(params.size)||4),1,64),out=cloneData(data);for(let by=0;by<h;by+=size)for(let bx=0;bx<w;bx+=size){const sums=[0,0,0],pixels=[];for(let y=by;y<Math.min(h,by+size);y++)for(let x=bx;x<Math.min(w,bx+size);x++){pixels.push(y*w+x);const o=(y*w+x)*4;for(let c=0;c<3;c++)sums[c]+=data[o+c];}const avg=sums.map(v=>byte(v/pixels.length));for(const i of pixels){const o=i*4;for(let c=0;c<3;c++)out[o+c]=avg[c];}}result={width:w,height:h,data:out};
  }else if(type==='reduceNoise'){
    const radius=clamp(Math.round(Number(params.radius)||1),1,4),strength=clamp01(numberOr(params.strength,50)/100),preserve=clamp(numberOr(params.preserveEdges,24),0,255),blur=boxBlur(imageData,radius),out=cloneData(data);for(let i=0;i<w*h;i++){const o=i*4;for(let c=0;c<3;c++){const d=Math.abs(data[o+c]-blur.data[o+c]),local=d>preserve?strength*.25:strength;out[o+c]=byte(data[o+c]+(blur.data[o+c]-data[o+c])*local);}}result={width:w,height:h,data:out};
  }
  return mixProcessed(imageData,result,{opacity,mask});
}

function bilinear(data,w,h,x,y,c){const x0=Math.floor(x),y0=Math.floor(y),x1=x0+1,y1=y0+1,tx=x-x0,ty=y-y0,a=pixel(data,w,h,x0,y0,c),b=pixel(data,w,h,x1,y0,c),d=pixel(data,w,h,x0,y1,c),e=pixel(data,w,h,x1,y1,c);return(a+(b-a)*tx)+(d+(e-d)*tx-(a+(b-a)*tx))*ty;}
function liquifyMask(mask,index,total){if(!mask)return 0;const alpha=mask.alpha||mask;if(!alpha||alpha.length!==total)throw new Error('INK_LIQUIFY_FREEZE_MASK_SIZE_MISMATCH');return clamp01((alpha[index]||0)/255);}
export const LIQUIFY_OPERATIONS=Object.freeze(['forwardWarp','twirl','pucker','bloat','reconstruct']);

export function liquifyRaster(imageData,{operations=[],freezeMask=null,maxWork=null}={}){
  const {width:w,height:h,data}=assertImageData(imageData),total=w*h;if(!Array.isArray(operations))throw new Error('INK_LIQUIFY_OPERATIONS_INVALID');
  const limit=maxWork==null?Math.max(total*Math.max(1,operations.length)*3,64):Math.max(1,Math.floor(Number(maxWork)||0));let work=0;const consume=()=>{if(++work>limit)throw new Error('INK_LIQUIFY_WORK_LIMIT');};
  const dx=new Float32Array(total),dy=new Float32Array(total);
  for(const op of operations){if(!LIQUIFY_OPERATIONS.includes(op?.type))throw new Error(`INK_LIQUIFY_OPERATION_UNSUPPORTED:${op?.type}`);const cx=Number(op.x)||0,cy=Number(op.y)||0,radius=clamp(Number(op.radius)||32,1,Math.max(w,h)*2),strength=clamp(Number(op.strength??.5)||0,-1,1),vx=Number(op.dx)||0,vy=Number(op.dy)||0,angle=(Number(op.angle??strength*30)||0)*Math.PI/180;
    for(let y=Math.max(0,Math.floor(cy-radius));y<=Math.min(h-1,Math.ceil(cy+radius));y++)for(let x=Math.max(0,Math.floor(cx-radius));x<=Math.min(w-1,Math.ceil(cx+radius));x++){consume();const i=y*w+x,rx=x-cx,ry=y-cy,d=Math.hypot(rx,ry);if(d>radius)continue;const freeze=liquifyMask(freezeMask,i,total);if(freeze>=1)continue;const falloff=(1-d/radius)**2*(1-freeze);
      if(op.type==='forwardWarp'){dx[i]+=vx*strength*falloff;dy[i]+=vy*strength*falloff;}
      else if(op.type==='twirl'){const a=angle*falloff,cs=Math.cos(a),sn=Math.sin(a),nx=rx*cs-ry*sn,ny=rx*sn+ry*cs;dx[i]+=nx-rx;dy[i]+=ny-ry;}
      else if(op.type==='pucker'||op.type==='bloat'){const sign=op.type==='pucker'?-1:1,scale=1+sign*strength*.35*falloff;dx[i]+=rx*(scale-1);dy[i]+=ry*(scale-1);}
      else if(op.type==='reconstruct'){const amount=clamp01(Math.abs(strength)||.5)*falloff;dx[i]*=1-amount;dy[i]*=1-amount;}
    }
  }
  const out=new Uint8ClampedArray(data.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){consume();const i=y*w+x,o=i*4,sx=x-dx[i],sy=y-dy[i];for(let c=0;c<4;c++)out[o+c]=byte(bilinear(data,w,h,sx,sy,c));}
  return{width:w,height:h,data:out,metadata:{source:'liquify-core',work,operations:operations.map(op=>({type:op.type,x:Number(op.x)||0,y:Number(op.y)||0,radius:clamp(Number(op.radius)||32,1,Math.max(w,h)*2),strength:clamp(Number(op.strength??.5)||0,-1,1)}))}};
}
