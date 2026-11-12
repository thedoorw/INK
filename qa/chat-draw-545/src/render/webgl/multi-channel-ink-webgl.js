import { clamp } from '../../core/index.js';
import { GPUResourceBudget, estimateTextureBytes } from '../gpu-resource-budget.js';
import { mediaHexToRGBA, naturalMediaFingerprint, naturalMediaRasterScale } from '../natural-media-utils.js';
import { paperProfileFingerprint, normalizePaperProfile } from '../paper-profile.js';
import { prepareNaturalMediaRun, supportsNaturalMediaRun } from '../natural-media-run-utils.js';

const MC_DEPOSIT_VERTEX = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
in float a_seed;
in float a_pressure;
in float a_opacity;
uniform vec2 u_resolution;
out vec2 v_uv;
out float v_seed;
out float v_pressure;
out float v_opacity;
void main(){
  vec2 clip=(a_position/u_resolution)*2.0-1.0;
  gl_Position=vec4(clip.x,-clip.y,0.0,1.0);
  v_uv=a_uv;v_seed=a_seed;v_pressure=a_pressure;v_opacity=a_opacity;
}`;

const MC_DEPOSIT_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_seed;
in float v_pressure;
in float v_opacity;
uniform vec4 u_color;
uniform float u_flow;
uniform float u_wetness;
uniform float u_grain;
uniform float u_bristle;
uniform vec2 u_worldOrigin;
uniform float u_rasterScale;
uniform float u_strokeSeed;
layout(location=0) out vec4 outPigment;
layout(location=1) out vec4 outWater;
float hash21(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345+u_strokeSeed*.0001);return fract(p.x*p.y);}
float field(vec2 p){float a=hash21(floor(p*.018)+fract(p*.018));float b=hash21(floor(p*.061)+fract(p*.061)+13.4);float c=hash21(floor(p*.143)+fract(p*.143)+41.8);return a*.52+b*.34+c*.14;}
void main(){
  float d=length(v_uv);float body=1.0-smoothstep(.62,1.03,d);
  vec2 world=u_worldOrigin+gl_FragCoord.xy/max(.001,u_rasterScale);
  float paperField=field(world);float cluster=field(world*.47+vec2(v_seed*17.0,v_seed*23.0));
  float paper=mix(1.0,.74+paperField*.26,u_grain);
  float contact=mix(1.0,smoothstep(.2,.8,cluster),u_bristle*.68);
  float mask=body*paper*contact*mix(.62,1.0,v_pressure)*v_opacity;
  if(mask<.004)discard;
  float pigment=mask*u_flow*.27*u_color.a;float water=mask*u_wetness*.24;
  outPigment=vec4(u_color.rgb*pigment,pigment);outWater=vec4(water,0.0,0.0,water);
}`;

const MC_FULLSCREEN_VERTEX = `#version 300 es
precision highp float;
out vec2 v_uv;
void main(){
  vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
  v_uv=p;gl_Position=vec4(p*2.0-1.0,0.0,1.0);
}`;

const MC_SIMULATE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_pigment;
uniform sampler2D u_water;
uniform vec2 u_texel;
uniform float u_diffusion;
uniform float u_evaporation;
uniform float u_absorbency;
uniform float u_sizing;
uniform float u_roughness;
uniform float u_fiberStrength;
uniform float u_fiberAngle;
uniform float u_granulation;
uniform float u_seed;
uniform vec2 u_worldOrigin;
uniform float u_rasterScale;
layout(location=0) out vec4 outPigment;
layout(location=1) out vec4 outWater;
float hash21(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345+u_seed);return fract(p.x*p.y);}
void main(){
  vec4 pigment=texture(u_pigment,v_uv);float water=texture(u_water,v_uv).r;
  float wl=texture(u_water,v_uv-vec2(u_texel.x,0)).r;
  float wr=texture(u_water,v_uv+vec2(u_texel.x,0)).r;
  float wu=texture(u_water,v_uv-vec2(0,u_texel.y)).r;
  float wd=texture(u_water,v_uv+vec2(0,u_texel.y)).r;
  float angle=radians(u_fiberAngle);float hw=.5+abs(cos(angle))*u_fiberStrength*.32;float vw=.5+abs(sin(angle))*u_fiberStrength*.32;
  float avg=(wl+wr)*hw+(wu+wd)*vw;avg/=2.0*(hw+vw);
  vec2 world=u_worldOrigin+gl_FragCoord.xy/max(.001,u_rasterScale);float paper=hash21(world*.021);float absorb=clamp(u_absorbency*(1.0-u_sizing*.58)*(.78+paper*.36),0.0,1.0);
  float resistance=clamp(u_sizing*.72+(1.0-paper)*u_roughness*.35,0.0,1.0);
  float nextWater=water+(avg-water)*u_diffusion*(1.0-resistance*.72)*(.45+water*.55);
  float absorbed=min(nextWater,nextWater*absorb*.11);nextWater=max(0.0,nextWater-absorbed-u_evaporation);
  vec4 pl=texture(u_pigment,v_uv-vec2(u_texel.x,0));vec4 pr=texture(u_pigment,v_uv+vec2(u_texel.x,0));
  vec4 pu=texture(u_pigment,v_uv-vec2(0,u_texel.y));vec4 pd=texture(u_pigment,v_uv+vec2(0,u_texel.y));
  vec4 neighbor=(pl+pr+pu+pd)*.25;float mobility=clamp(water*.48,0.0,.34)*(1.0-resistance*.6);
  vec4 moved=mix(pigment,neighbor,mobility);float settle=absorbed*(1.0+u_granulation*(1.0-paper));
  moved.a=clamp(moved.a+settle*.55,0.0,1.0);moved.rgb*=1.0+settle*.08;
  outPigment=clamp(moved,0.0,1.0);outWater=vec4(nextWater,absorbed,0.0,nextWater);
}`;

const MC_COMPOSITE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_pigment;
uniform sampler2D u_water;
out vec4 outColor;
void main(){
  vec4 p=texture(u_pigment,v_uv);vec4 w=texture(u_water,v_uv);
  float amount=max(.0001,p.a);vec3 color=p.rgb/amount;
  float edge=clamp(w.g*.28+w.r*.06,0.0,.28);color*=1.0-edge;
  float alpha=clamp(1.0-exp(-p.a*2.2),0.0,1.0);
  if(alpha<.004)discard;outColor=vec4(clamp(color,0.0,1.0)*alpha,alpha);
}`;

function mcCompileShader(gl,type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(shader)||'Shader compile error';gl.deleteShader(shader);throw new Error(error);}return shader;}
function mcCreateProgram(gl,vertexSource,fragmentSource){const vertex=mcCompileShader(gl,gl.VERTEX_SHADER,vertexSource),fragment=mcCompileShader(gl,gl.FRAGMENT_SHADER,fragmentSource),program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);if(!gl.getProgramParameter(program,gl.LINK_STATUS)){const error=gl.getProgramInfoLog(program)||'Program link error';gl.deleteProgram(program);throw new Error(error);}return program;}
const mcDefaultCanvasFactory=()=>document.createElement('canvas');

export class WebGLMultiChannelInkRenderer {
  constructor({canvasFactory=mcDefaultCanvasFactory,cacheLimit=12,maxDimension=2048,maxPixels=1900000,resourceBudgetBytes=160*1024*1024,onStatusChange=null}={}){
    this.canvasFactory=canvasFactory;this.cacheLimit=cacheLimit;this.maxDimension=maxDimension;this.maxPixels=maxPixels;this.onStatusChange=onStatusChange;
    this.resourceBudget=new GPUResourceBudget({budgetBytes:resourceBudgetBytes});this.capabilities=null;this.selfTestResult=null;
    this.canvas=null;this.gl=null;this.programs=null;this.buffers=null;this.locations=null;this.targets=null;this.cache=new Map();this.state='idle';this.lastError=null;
    this.stats={backend:'webgl2-multichannel',runs:0,strokes:0,drawCalls:0,simulationPasses:0,cacheHits:0,cacheMisses:0,evictions:0,contextLosses:0,restores:0};
  }
  initialize(){
    if(this.state==='ready'&&this.gl)return true;if(['unavailable','lost','disposed'].includes(this.state))return false;
    try{
      this.canvas=this.canvas||this.canvasFactory();this.canvas.addEventListener?.('webglcontextlost',event=>{event.preventDefault?.();this.state='lost';this.stats.contextLosses++;this.disposeTargets();this.clearCache();this.resourceBudget.clear();this.onStatusChange?.(this.diagnostics());});
      this.canvas.addEventListener?.('webglcontextrestored',()=>{this.state='idle';this.gl=null;this.programs=null;this.buffers=null;this.targets=null;this.stats.restores++;this.initialize();this.onStatusChange?.(this.diagnostics());});
      const gl=this.canvas.getContext('webgl2',{alpha:true,antialias:false,premultipliedAlpha:true,preserveDrawingBuffer:true,depth:false,stencil:false,powerPreference:'high-performance'});if(!gl)throw new Error('WebGL2 context unavailable');
      const maxDrawBuffers=gl.getParameter(gl.MAX_DRAW_BUFFERS);if(maxDrawBuffers<2)throw new Error('WebGL2 multiple render targets unavailable');this.capabilities=this.readCapabilities(gl);
      this.gl=gl;this.programs={deposit:mcCreateProgram(gl,MC_DEPOSIT_VERTEX,MC_DEPOSIT_FRAGMENT),simulate:mcCreateProgram(gl,MC_FULLSCREEN_VERTEX,MC_SIMULATE_FRAGMENT),composite:mcCreateProgram(gl,MC_FULLSCREEN_VERTEX,MC_COMPOSITE_FRAGMENT)};
      this.buffers={stamp:gl.createBuffer()};
      const deposit=this.programs.deposit,simulate=this.programs.simulate,composite=this.programs.composite;
      this.locations={
        deposit:{position:gl.getAttribLocation(deposit,'a_position'),uv:gl.getAttribLocation(deposit,'a_uv'),seed:gl.getAttribLocation(deposit,'a_seed'),pressure:gl.getAttribLocation(deposit,'a_pressure'),opacity:gl.getAttribLocation(deposit,'a_opacity'),resolution:gl.getUniformLocation(deposit,'u_resolution'),color:gl.getUniformLocation(deposit,'u_color'),flow:gl.getUniformLocation(deposit,'u_flow'),wetness:gl.getUniformLocation(deposit,'u_wetness'),grain:gl.getUniformLocation(deposit,'u_grain'),bristle:gl.getUniformLocation(deposit,'u_bristle'),worldOrigin:gl.getUniformLocation(deposit,'u_worldOrigin'),rasterScale:gl.getUniformLocation(deposit,'u_rasterScale'),strokeSeed:gl.getUniformLocation(deposit,'u_strokeSeed')},
        simulate:{pigment:gl.getUniformLocation(simulate,'u_pigment'),water:gl.getUniformLocation(simulate,'u_water'),texel:gl.getUniformLocation(simulate,'u_texel'),diffusion:gl.getUniformLocation(simulate,'u_diffusion'),evaporation:gl.getUniformLocation(simulate,'u_evaporation'),absorbency:gl.getUniformLocation(simulate,'u_absorbency'),sizing:gl.getUniformLocation(simulate,'u_sizing'),roughness:gl.getUniformLocation(simulate,'u_roughness'),fiberStrength:gl.getUniformLocation(simulate,'u_fiberStrength'),fiberAngle:gl.getUniformLocation(simulate,'u_fiberAngle'),granulation:gl.getUniformLocation(simulate,'u_granulation'),seed:gl.getUniformLocation(simulate,'u_seed'),worldOrigin:gl.getUniformLocation(simulate,'u_worldOrigin'),rasterScale:gl.getUniformLocation(simulate,'u_rasterScale')},
        composite:{pigment:gl.getUniformLocation(composite,'u_pigment'),water:gl.getUniformLocation(composite,'u_water')}
      };
      this.state='ready';this.lastError=null;this.onStatusChange?.(this.diagnostics());return true;
    }catch(error){this.state='unavailable';this.lastError=error instanceof Error?error.message:String(error);this.onStatusChange?.(this.diagnostics());return false;}
  }
  supports(entries,{minimum=2}={}){return supportsNaturalMediaRun(entries,{minimum});}
  createTexture(width,height){const gl=this.gl,texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);return texture;}
  createTarget(width,height,index=0){const gl=this.gl,pigment=this.createTexture(width,height),water=this.createTexture(width,height),fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,pigment,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,water,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Multi-channel framebuffer incomplete');const id=`mrt-target:${index}`;const bytes=estimateTextureBytes(width,height,{attachments:2});if(!this.resourceBudget.reserve(id,bytes,{pinned:true,type:'mrt-target'})){gl.deleteFramebuffer(fbo);gl.deleteTexture(pigment);gl.deleteTexture(water);throw new Error('GPU resource budget exceeded');}return{fbo,pigment,water,width,height,id};}
  ensureTargets(width,height){if(this.targets?.[0]?.width===width&&this.targets?.[0]?.height===height)return;this.disposeTargets();this.targets=[this.createTarget(width,height,0),this.createTarget(width,height,1)];}
  disposeTargets(){if(!this.gl||!this.targets)return;for(const target of this.targets){this.gl.deleteFramebuffer(target.fbo);this.gl.deleteTexture(target.pigment);this.gl.deleteTexture(target.water);this.resourceBudget.release(target.id);}this.targets=null;}
  bindTexture(unit,texture){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);}
  render(entries,paper={},options={}){
    const minimumStrokes=Math.max(1,Math.trunc(options.minimumStrokes??2));
    if(!this.supports(entries,{minimum:minimumStrokes})||!this.initialize())return null;const run=prepareNaturalMediaRun(entries);if(!run.bounds)return null;
    const preferredScale=clamp(options.preferredScale??1.55,.2,6),maxDimension=Math.max(128,options.maxDimension??this.maxDimension),maxPixels=Math.max(65536,options.maxPixels??this.maxPixels);let scale=naturalMediaRasterScale(run.bounds,preferredScale,maxDimension);const projected=run.bounds.w*scale*run.bounds.h*scale;if(projected>maxPixels)scale*=Math.sqrt(maxPixels/projected);scale=clamp(scale,.2,preferredScale);
    const key=`${paperProfileFingerprint(paper)}|${Math.round(scale*1000)}|${run.strokes.map(entry=>`${naturalMediaFingerprint(entry.stroke,scale)}:${entry.matrix.map(v=>Math.round(v*1000)).join(',')}:${Math.round(entry.opacity*1000)}`).join('|')}`;
    const cacheable=options.transient!==true;if(cacheable&&this.cache.has(key)){const result=this.cache.get(key);this.cache.delete(key);this.cache.set(key,result);this.resourceBudget.touch(`run-cache:${key}`);this.stats.cacheHits++;return result;}this.stats.cacheMisses++;
    try{
      const gl=this.gl,width=Math.max(1,Math.ceil(run.bounds.w*scale)),height=Math.max(1,Math.ceil(run.bounds.h*scale));this.canvas.width=width;this.canvas.height=height;this.ensureTargets(width,height);gl.viewport(0,0,width,height);
      let current=0;gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[current].fbo);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.clearBufferfv(gl.COLOR,0,new Float32Array([0,0,0,0]));gl.clearBufferfv(gl.COLOR,1,new Float32Array([0,0,0,0]));gl.useProgram(this.programs.deposit);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.buffers.stamp);const stride=7*4,loc=this.locations.deposit;gl.enableVertexAttribArray(loc.position);gl.vertexAttribPointer(loc.position,2,gl.FLOAT,false,stride,0);gl.enableVertexAttribArray(loc.uv);gl.vertexAttribPointer(loc.uv,2,gl.FLOAT,false,stride,2*4);gl.enableVertexAttribArray(loc.seed);gl.vertexAttribPointer(loc.seed,1,gl.FLOAT,false,stride,4*4);gl.enableVertexAttribArray(loc.pressure);gl.vertexAttribPointer(loc.pressure,1,gl.FLOAT,false,stride,5*4);gl.enableVertexAttribArray(loc.opacity);gl.vertexAttribPointer(loc.opacity,1,gl.FLOAT,false,stride,6*4);gl.uniform2f(loc.resolution,width,height);gl.uniform2f(loc.worldOrigin,run.bounds.x,run.bounds.y);gl.uniform1f(loc.rasterScale,scale);
      for(const entry of run.strokes){const vertices=[];for(const stamp of entry.stamps){const cx=(stamp.x-run.bounds.x)*scale,cy=(stamp.y-run.bounds.y)*scale,rx=stamp.radiusX*scale,ry=stamp.radiusY*scale,ca=Math.cos(stamp.angle),sa=Math.sin(stamp.angle);const corner=(u,v)=>({x:cx+u*rx*ca-v*ry*sa,y:cy+u*rx*sa+v*ry*ca});const a=corner(-1,-1),b=corner(1,-1),c=corner(1,1),d=corner(-1,1);const push=(p,u,v)=>vertices.push(p.x,p.y,u,v,stamp.seed,stamp.pressure,stamp.opacity??1);push(a,-1,-1);push(b,1,-1);push(c,1,1);push(a,-1,-1);push(c,1,1);push(d,-1,1);}const data=new Float32Array(vertices);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STREAM_DRAW);const color=mediaHexToRGBA(entry.stroke.color||'#202020',entry.opacity);gl.uniform4f(loc.color,...color);gl.uniform1f(loc.flow,clamp(entry.stroke.flow??.82,.04,1));gl.uniform1f(loc.wetness,clamp(entry.stroke.wetness??.35,0,1));gl.uniform1f(loc.grain,clamp(entry.stroke.grain??.18,0,1));gl.uniform1f(loc.bristle,clamp(entry.stroke.bristle??.2,0,1));gl.uniform1f(loc.strokeSeed,entry.stamps[0]?.strokeSeed??0);gl.drawArrays(gl.TRIANGLES,0,data.length/7);this.stats.drawCalls++;}
      gl.disable(gl.BLEND);const profile=normalizePaperProfile(paper),sim=this.locations.simulate;for(let pass=0;pass<4;pass++){const next=1-current;gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[next].fbo);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.useProgram(this.programs.simulate);this.bindTexture(0,this.targets[current].pigment);this.bindTexture(1,this.targets[current].water);gl.uniform1i(sim.pigment,0);gl.uniform1i(sim.water,1);gl.uniform2f(sim.texel,1/width,1/height);gl.uniform1f(sim.diffusion,.14+pass*.018);gl.uniform1f(sim.evaporation,.018+pass*.006);gl.uniform1f(sim.absorbency,profile.absorbency);gl.uniform1f(sim.sizing,profile.sizing);gl.uniform1f(sim.roughness,profile.roughness);gl.uniform1f(sim.fiberStrength,profile.fiberStrength);gl.uniform1f(sim.fiberAngle,profile.fiberAngle);gl.uniform1f(sim.granulation,profile.granulation);gl.uniform1f(sim.seed,profile.seed%997);gl.uniform2f(sim.worldOrigin,run.bounds.x,run.bounds.y);gl.uniform1f(sim.rasterScale,scale);gl.drawArrays(gl.TRIANGLES,0,3);current=next;this.stats.simulationPasses++;}
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(this.programs.composite);this.bindTexture(0,this.targets[current].pigment);this.bindTexture(1,this.targets[current].water);gl.uniform1i(this.locations.composite.pigment,0);gl.uniform1i(this.locations.composite.water,1);gl.drawArrays(gl.TRIANGLES,0,3);gl.flush();
      const output=this.canvasFactory();output.width=width;output.height=height;const context=output.getContext?.('2d');if(!context)return null;context.clearRect(0,0,width,height);context.drawImage(this.canvas,0,0);
      const result={canvas:output,x:run.bounds.x,y:run.bounds.y,w:run.bounds.w,h:run.bounds.h,scale,strokes:run.strokes.length,backend:'webgl2-multichannel'};if(cacheable){const bytes=estimateTextureBytes(width,height);if(this.resourceBudget.reserve(`run-cache:${key}`,bytes,{type:'raster-cache'})){this.cache.set(key,result);this.trimCache();}}this.stats.runs++;this.stats.strokes+=run.strokes.length;return result;
    }catch(error){this.lastError=error instanceof Error?error.message:String(error);this.state='unavailable';this.onStatusChange?.(this.diagnostics());return null;}
  }
  trimCache(){while(this.cache.size>this.cacheLimit){const key=this.cache.keys().next().value;this.cache.delete(key);this.resourceBudget.release(`run-cache:${key}`,{evicted:true});this.stats.evictions++;}}
  clearCache(){for(const key of this.cache.keys())this.resourceBudget.release(`run-cache:${key}`);this.cache.clear();}
  readCapabilities(gl=this.gl){if(!gl)return null;const debug=gl.getExtension?.('WEBGL_debug_renderer_info');return{maxTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE),maxRenderbufferSize:gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),maxDrawBuffers:gl.getParameter(gl.MAX_DRAW_BUFFERS),maxColorAttachments:gl.getParameter(gl.MAX_COLOR_ATTACHMENTS),maxViewportDims:Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS)||[]),vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION)};}
  selfTest(){const started=Number(globalThis.performance?.now?.()??Date.now());if(!this.initialize()){this.selfTestResult={passed:false,state:this.state,error:this.lastError,durationMs:0};return this.selfTestResult;}try{const make=(id,color,y)=>({stroke:{id,type:'stroke',kind:'brush',color,size:12,opacity:1,pressure:.9,taper:.2,flow:.82,wetness:.72,grain:.18,bristle:.2,points:[{x:0,y:0,p:.35},{x:20,y:-4,p:.8},{x:42,y:2,p:.55}]},matrix:[1,0,0,1,0,y],opacity:1});const result=this.render([make('gpu-mrt-a','#202020',0),make('gpu-mrt-b','#2f718f',3)],{absorbency:.6,roughness:.4},{transient:true,maxDimension:256,maxPixels:65536});const error=this.gl.getError();let visible=false;const context=result?.canvas?.getContext?.('2d');if(context?.getImageData){const data=context.getImageData(0,0,result.canvas.width,result.canvas.height).data;for(let i=3;i<data.length;i+=4){if(data[i]>0){visible=true;break;}}}this.selfTestResult={passed:Boolean(result&&visible&&error===this.gl.NO_ERROR),visible,glError:error,runs:this.stats.runs,durationMs:Number(globalThis.performance?.now?.()??Date.now())-started,capabilities:this.capabilities};}catch(error){this.selfTestResult={passed:false,error:error instanceof Error?error.message:String(error),durationMs:Number(globalThis.performance?.now?.()??Date.now())-started};}return this.selfTestResult;}
  loseContextForTest(){const extension=this.gl?.getExtension('WEBGL_lose_context');if(!extension)return false;extension.loseContext();return true;}
  restoreContextForTest(){const extension=this.gl?.getExtension('WEBGL_lose_context');if(!extension)return false;extension.restoreContext();return true;}
  retry(){if(this.state==='disposed')return false;this.state='idle';this.lastError=null;return this.initialize();}
  diagnostics(){return{...this.stats,state:this.state,available:this.state==='ready'&&Boolean(this.gl),cacheEntries:this.cache.size,lastError:this.lastError,targets:this.targets?this.targets[0].width+'x'+this.targets[0].height:null,capabilities:this.capabilities,resources:this.resourceBudget.diagnostics(),selfTest:this.selfTestResult};}
  dispose(){this.clearCache();this.disposeTargets();if(this.gl){if(this.buffers?.stamp)this.gl.deleteBuffer(this.buffers.stamp);if(this.programs)for(const program of Object.values(this.programs))this.gl.deleteProgram(program);}this.resourceBudget.clear();this.gl=null;this.programs=null;this.buffers=null;this.state='disposed';}
}
