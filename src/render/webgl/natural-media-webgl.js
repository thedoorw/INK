import { clamp } from '../../core/index.js';
import { GPUResourceBudget, estimateTextureBytes } from '../gpu-resource-budget.js';
import {
  buildNaturalMediaStamps, isNaturalMediaStroke, mediaHexToRGBA,
  naturalMediaFingerprint, naturalMediaRasterScale
} from '../natural-media-utils.js';

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
in float a_seed;
in float a_pressure;
in float a_opacity;
in float a_softness;
uniform vec2 u_resolution;
out vec2 v_uv;
out float v_seed;
out float v_pressure;
out float v_opacity;
out float v_softness;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;v_seed = a_seed;v_pressure = a_pressure;v_opacity = a_opacity;v_softness = a_softness;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_seed;
in float v_pressure;
in float v_opacity;
in float v_softness;
uniform vec4 u_color;
uniform float u_flow;
uniform float u_wetness;
uniform float u_grain;
uniform float u_bristle;
uniform float u_softness;
uniform float u_kind;
uniform vec2 u_worldOrigin;
uniform float u_rasterScale;
uniform float u_strokeSeed;
out vec4 outColor;
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));p += dot(p, p + 34.345 + u_strokeSeed*.0001);return fract(p.x * p.y);
}
float field(vec2 p){
  float a=hash21(floor(p*.018)+fract(p*.018));
  float b=hash21(floor(p*.061)+fract(p*.061)+19.7);
  float c=hash21(floor(p*.143)+fract(p*.143)+47.2);
  return a*.52+b*.34+c*.14;
}
void main() {
  float d = length(v_uv);
  float softness = clamp(mix(u_softness, v_softness, .55), .05, 1.0);
  float featherStart = mix(.46, .86, softness);
  if (u_kind < .5) featherStart = mix(.36, .76, softness);
  float body = 1.0 - smoothstep(featherStart, 1.0, d);
  vec2 world = u_worldOrigin + gl_FragCoord.xy / max(.001,u_rasterScale);
  float paperField = field(world);
  float cluster = field(world*.43+vec2(v_seed*17.0, v_seed*29.0));
  float paper = mix(1.0, .72 + paperField*.28, u_grain);
  float bristleContact = mix(1.0, smoothstep(.22,.78,cluster), u_bristle*.72);
  float dryFactor = u_kind > 1.5 ? mix(.55, bristleContact, .82) : mix(1.0, bristleContact, u_bristle*.18);
  float wetEdge = exp(-pow((d-.79)/.18,2.0))*u_wetness*.12;
  float alpha = clamp((body*paper*dryFactor+wetEdge)*u_flow*mix(.72,1.0,v_pressure)*v_opacity,0.0,1.0);
  if(alpha<.006)discard;
  vec3 premultiplied=u_color.rgb*(u_color.a*alpha);
  outColor=vec4(premultiplied,u_color.a*alpha);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader) || 'Unknown shader error';
    gl.deleteShader(shader);throw new Error(error);
  }
  return shader;
}

function createProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();gl.attachShader(program, vertex);gl.attachShader(program, fragment);gl.linkProgram(program);
  gl.deleteShader(vertex);gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program) || 'Unknown program link error';
    gl.deleteProgram(program);throw new Error(error);
  }
  return program;
}

const defaultCanvasFactory = () => document.createElement('canvas');

export class WebGLNaturalMediaRenderer {
  constructor({ canvasFactory = defaultCanvasFactory, cacheLimit = 48, maxDimension = 3072, resourceBudgetBytes = 96 * 1024 * 1024, onStatusChange = null } = {}) {
    this.canvasFactory = canvasFactory;this.cacheLimit = cacheLimit;this.maxDimension = maxDimension;this.onStatusChange = onStatusChange;
    this.resourceBudget = new GPUResourceBudget({ budgetBytes: resourceBudgetBytes });this.capabilities = null;this.selfTestResult = null;
    this.canvas = null;this.gl = null;this.program = null;this.buffer = null;this.locations = null;
    this.cache = new Map();this.state = 'idle';this.lastError = null;
    this.stats = { backend: 'webgl2', drawCalls: 0, cacheHits: 0, cacheMisses: 0, evictions: 0, contextLosses: 0, restores: 0, vertices: 0 };
  }

  initialize() {
    if (this.state === 'ready' && this.gl) return true;
    if (['unavailable', 'lost', 'disposed'].includes(this.state)) return false;
    try {
      this.canvas = this.canvas || this.canvasFactory();
      this.canvas.addEventListener?.('webglcontextlost', event => {
        event.preventDefault?.();this.state = 'lost';this.stats.contextLosses++;this.clearCache();this.resourceBudget.clear();this.onStatusChange?.(this.diagnostics());
      });
      this.canvas.addEventListener?.('webglcontextrestored', () => {
        this.state = 'idle';this.gl = null;this.program = null;this.buffer = null;this.stats.restores++;this.initialize();this.onStatusChange?.(this.diagnostics());
      });
      const gl = this.canvas.getContext('webgl2', {
        alpha: true, antialias: false, premultipliedAlpha: true,
        preserveDrawingBuffer: true, depth: false, stencil: false,
        powerPreference: 'high-performance'
      });
      if (!gl) throw new Error('WebGL2 context unavailable');
      this.gl = gl;this.program = createProgram(gl);this.buffer = gl.createBuffer();this.capabilities = this.readCapabilities(gl);
      this.locations = {
        position: gl.getAttribLocation(this.program, 'a_position'), uv: gl.getAttribLocation(this.program, 'a_uv'),
        seed: gl.getAttribLocation(this.program, 'a_seed'), pressure: gl.getAttribLocation(this.program, 'a_pressure'),
        opacity: gl.getAttribLocation(this.program, 'a_opacity'), stampSoftness: gl.getAttribLocation(this.program, 'a_softness'),
        resolution: gl.getUniformLocation(this.program, 'u_resolution'), color: gl.getUniformLocation(this.program, 'u_color'),
        flow: gl.getUniformLocation(this.program, 'u_flow'), wetness: gl.getUniformLocation(this.program, 'u_wetness'),
        grain: gl.getUniformLocation(this.program, 'u_grain'), bristle: gl.getUniformLocation(this.program, 'u_bristle'),
        softness: gl.getUniformLocation(this.program, 'u_softness'), kind: gl.getUniformLocation(this.program, 'u_kind'),
        worldOrigin: gl.getUniformLocation(this.program, 'u_worldOrigin'), rasterScale: gl.getUniformLocation(this.program, 'u_rasterScale'), strokeSeed: gl.getUniformLocation(this.program, 'u_strokeSeed')
      };
      this.state = 'ready';this.lastError = null;this.onStatusChange?.(this.diagnostics());return true;
    } catch (error) {
      this.state = 'unavailable';this.lastError = error instanceof Error ? error.message : String(error);this.onStatusChange?.(this.diagnostics());return false;
    }
  }

  supports(stroke) { return isNaturalMediaStroke(stroke); }
  isReady() { return this.state === 'ready' && Boolean(this.gl && this.program); }

  render(stroke) {
    if (!this.supports(stroke)) return null;
    if (!this.initialize()) return null;
    const prepared = buildNaturalMediaStamps(stroke);
    if (!prepared.bounds || !prepared.stamps.length) return null;
    const scale = naturalMediaRasterScale(prepared.bounds, 2, this.maxDimension);
    const key = `${naturalMediaFingerprint(stroke, scale)}:${Math.round(prepared.bounds.x * 10)}:${Math.round(prepared.bounds.y * 10)}`;
    if (this.cache.has(key)) {
      const entry = this.cache.get(key);this.cache.delete(key);this.cache.set(key, entry);this.resourceBudget.touch(`stroke-cache:${key}`);this.stats.cacheHits++;return entry;
    }
    this.stats.cacheMisses++;
    const result = this.renderPrepared(stroke, prepared, scale);
    if (!result) return null;
    const bytes=estimateTextureBytes(result.canvas.width,result.canvas.height);if(this.resourceBudget.reserve(`stroke-cache:${key}`,bytes,{type:'raster-cache'})){this.cache.set(key,result);this.trimCache();}return result;
  }

  renderPrepared(stroke, prepared, scale) {
    const gl = this.gl, bounds = prepared.bounds;
    const width = Math.max(1, Math.min(this.maxDimension, Math.ceil(bounds.w * scale)));
    const height = Math.max(1, Math.min(this.maxDimension, Math.ceil(bounds.h * scale)));
    if (!width || !height) return null;
    this.canvas.width = width;this.canvas.height = height;gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendEquation(stroke.kind === 'airbrush' ? gl.MAX : gl.FUNC_ADD);gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.program);
    const vertices = [];
    for (const stamp of prepared.stamps) {
      const cx = (stamp.x - bounds.x) * scale, cy = (stamp.y - bounds.y) * scale;
      const rx = stamp.radiusX * scale, ry = stamp.radiusY * scale;
      const cosine = Math.cos(stamp.angle), sine = Math.sin(stamp.angle);
      const corner = (u, v) => ({ x: cx + u * rx * cosine - v * ry * sine, y: cy + u * rx * sine + v * ry * cosine });
      const a = corner(-1, -1), b = corner(1, -1), c = corner(1, 1), d = corner(-1, 1);
      const push = (point, u, v) => vertices.push(point.x, point.y, u, v, stamp.seed, stamp.pressure, stamp.opacity ?? 1, stamp.softness ?? .72);
      push(a, -1, -1);push(b, 1, -1);push(c, 1, 1);push(a, -1, -1);push(c, 1, 1);push(d, -1, 1);
    }
    const data = new Float32Array(vertices);gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    const stride = 8 * 4;
    gl.enableVertexAttribArray(this.locations.position);gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.locations.uv);gl.vertexAttribPointer(this.locations.uv, 2, gl.FLOAT, false, stride, 2 * 4);
    gl.enableVertexAttribArray(this.locations.seed);gl.vertexAttribPointer(this.locations.seed, 1, gl.FLOAT, false, stride, 4 * 4);
    gl.enableVertexAttribArray(this.locations.pressure);gl.vertexAttribPointer(this.locations.pressure, 1, gl.FLOAT, false, stride, 5 * 4);
    gl.enableVertexAttribArray(this.locations.opacity);gl.vertexAttribPointer(this.locations.opacity, 1, gl.FLOAT, false, stride, 6 * 4);
    gl.enableVertexAttribArray(this.locations.stampSoftness);gl.vertexAttribPointer(this.locations.stampSoftness, 1, gl.FLOAT, false, stride, 7 * 4);
    const color = mediaHexToRGBA(stroke.color || '#202020', 1);
    gl.uniform2f(this.locations.resolution, width, height);gl.uniform4f(this.locations.color, ...color);
    gl.uniform1f(this.locations.flow, clamp(stroke.flow ?? .82, .04, 1));gl.uniform1f(this.locations.wetness, clamp(stroke.wetness ?? 0, 0, 1));
    gl.uniform1f(this.locations.grain, clamp(stroke.grain ?? (stroke.kind === 'drybrush' ? .78 : .1), 0, 1));
    gl.uniform1f(this.locations.bristle, clamp(stroke.bristle ?? .2, 0, 1));gl.uniform1f(this.locations.softness, clamp(stroke.softness ?? .72, .05, 1));
    gl.uniform1f(this.locations.kind, stroke.kind === 'airbrush' ? 0 : stroke.kind === 'drybrush' ? 2 : 1);
    gl.uniform2f(this.locations.worldOrigin, bounds.x, bounds.y);gl.uniform1f(this.locations.rasterScale, scale);
    gl.uniform1f(this.locations.strokeSeed, prepared.stamps[0]?.strokeSeed ?? 0);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 8);gl.flush();
    const output = this.canvasFactory();output.width = width;output.height = height;
    const context = output.getContext('2d');if (!context) return null;context.clearRect(0, 0, width, height);context.drawImage(this.canvas, 0, 0);
    this.stats.drawCalls++;this.stats.vertices += data.length / 8;
    return { canvas: output, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, scale, stamps: prepared.stamps.length, backend: 'webgl2' };
  }

  trimCache() {
    while (this.cache.size > this.cacheLimit) {
      const key = this.cache.keys().next().value;this.cache.delete(key);this.resourceBudget.release(`stroke-cache:${key}`,{evicted:true});this.stats.evictions++;
    }
  }
  clearCache() { for (const key of this.cache.keys()) this.resourceBudget.release(`stroke-cache:${key}`);this.cache.clear(); }
  readCapabilities(gl=this.gl) {
    if (!gl) return null;
    const debug=gl.getExtension?.('WEBGL_debug_renderer_info');
    return {
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      maxViewportDims: Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS)||[]),
      maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
      vendor: debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),
      renderer: debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
    };
  }
  selfTest() {
    const started=Number(globalThis.performance?.now?.()??Date.now());
    if(!this.initialize()){this.selfTestResult={passed:false,state:this.state,error:this.lastError,durationMs:0};return this.selfTestResult;}
    try{
      const testStroke={id:'gpu-self-test',type:'stroke',kind:'brush',color:'#202020',size:12,opacity:1,pressure:.9,taper:.2,flow:.8,wetness:.5,grain:.2,bristle:.2,points:[{x:0,y:0,p:.2},{x:16,y:-4,p:.8},{x:32,y:2,p:.4}]};
      const result=this.render(testStroke);const error=this.gl.getError();
      let visible=false;const context=result?.canvas?.getContext?.('2d');if(context?.getImageData){const data=context.getImageData(0,0,result.canvas.width,result.canvas.height).data;for(let i=3;i<data.length;i+=4){if(data[i]>0){visible=true;break;}}}
      this.selfTestResult={passed:Boolean(result&&visible&&error===this.gl.NO_ERROR),visible,glError:error,drawCalls:this.stats.drawCalls,durationMs:Number(globalThis.performance?.now?.()??Date.now())-started,capabilities:this.capabilities};
    }catch(error){this.selfTestResult={passed:false,error:error instanceof Error?error.message:String(error),durationMs:Number(globalThis.performance?.now?.()??Date.now())-started};}
    return this.selfTestResult;
  }
  retry() { if (this.state === 'disposed') return false;this.state = 'idle';this.lastError = null;return this.initialize(); }
  loseContextForTest() { const extension = this.gl?.getExtension('WEBGL_lose_context');if (!extension) return false;extension.loseContext();return true; }
  restoreContextForTest() { const extension = this.gl?.getExtension('WEBGL_lose_context');if (!extension) return false;extension.restoreContext();return true; }
  diagnostics() { return { ...this.stats, state: this.state, available: this.isReady(), cacheEntries: this.cache.size, lastError: this.lastError, capabilities: this.capabilities, resources: this.resourceBudget.diagnostics(), selfTest: this.selfTestResult }; }
  dispose() {
    this.clearCache();if (this.gl) { if (this.buffer) this.gl.deleteBuffer(this.buffer);if (this.program) this.gl.deleteProgram(this.program); }
    this.resourceBudget.clear();this.gl = null;this.program = null;this.buffer = null;this.state = 'disposed';
  }
}
