// Narrow PDF axial DeviceRGB + type-3/single type-2 stitched function.
// Returns color samples only; caller preserves the actual PDF clipping geometry.
// Unknown PDF shading functions fail closed. This is not a general PDF interpreter.
const fail = reason => { throw Object.assign(new Error('INK_AI_SHADING_UNSUPPORTED:'+reason),{code:'INK_AI_SHADING_UNSUPPORTED:'+reason}); };
const finite = v => typeof v==='number'&&Number.isFinite(v);
const arr = (v,n) => Array.isArray(v)&&v.length===n&&v.every(finite);
const same = (a,b) => arr(a,b.length)&&a.every((v,i)=>Math.abs(v-b[i])<1e-9);
export const AI_SHADING_BANDS = 20;

export function decodeBoundedAxialRGB(raw,resolve=v=>v) {
 const d=resolve(raw);
 if(!d||d.ShadingType!==2||resolve(d.ColorSpace)?.name!=='DeviceRGB')fail('TYPE_OR_COLOR_SPACE');
 if(Object.keys(d).some(k=>!['ShadingType','ColorSpace','Coords','Domain','Extend','AntiAlias','Function','Background','BBox'].includes(k)))fail('UNKNOWN_SHADING_KEY');
 if(!arr(resolve(d.Coords),4)||resolve(d.Coords).some(n=>Math.abs(n)>32768))fail('COORDS');
 const coords=resolve(d.Coords);
 if(Math.hypot(coords[2]-coords[0],coords[3]-coords[1])<1e-9)fail('DEGENERATE_AXIS');
 const domain=resolve(d.Domain)||[0,1];
 if(!same(domain,[0,1]))fail('DOMAIN');
 const extend=resolve(d.Extend)||[false,false];
 if(!Array.isArray(extend)||extend.length!==2||extend.some(x=>typeof x!=='boolean'))fail('EXTEND');
 if(d.Background||d.BBox)fail('BACKGROUND_OR_BBOX_NOT_NATIVE');
 if(d.AntiAlias!==undefined&&typeof d.AntiAlias!=='boolean')fail('ANTIALIAS');
 const fn=resolve(d.Function);
 if(!fn||fn.FunctionType!==3||!same(resolve(fn.Domain),[0,1])||!same(resolve(fn.Bounds),[])||!same(resolve(fn.Encode),[0,1]))fail('STITCHING_FUNCTION');
 if(Object.keys(fn).some(k=>!['FunctionType','Functions','Domain','Bounds','Encode','Range'].includes(k)))fail('STITCHING_EXTRA');
 const fns=resolve(fn.Functions);
 if(!Array.isArray(fns)||fns.length!==1)fail('STITCHING_FUNCTION_COUNT');
 const f=resolve(fns[0]);
 if(!f||f.FunctionType!==2||!same(resolve(f.Domain),[0,1])||!arr(resolve(f.C0),3)||!arr(resolve(f.C1),3)||!finite(f.N)||f.N<=0||f.N>16)fail('EXPONENTIAL_FUNCTION');
 if(Object.keys(f).some(k=>!['FunctionType','C0','C1','N','Domain','Range'].includes(k)))fail('FUNCTION_EXTRA');
 if([...resolve(f.C0),...resolve(f.C1)].some(v=>v<0||v>1))fail('COLOR_RANGE');
 if(fn.Range&&!same(resolve(fn.Range),[0,1,0,1,0,1]))fail('OUTPUT_RANGE');
 if(f.Range&&!same(resolve(f.Range),[0,1,0,1,0,1]))fail('FUNCTION_RANGE');
 const c0=resolve(f.C0),c1=resolve(f.C1),exponent=f.N;
 const sample=t=>{if(!finite(t))fail('SAMPLE');const a=Math.pow(Math.max(0,Math.min(1,t)),exponent);return c0.map((v,i)=>v+(c1[i]-v)*a);};
 return {coords:[...coords],extend:[...extend],sample};
}
