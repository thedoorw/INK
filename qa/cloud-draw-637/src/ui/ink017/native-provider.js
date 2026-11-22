// UI-B candidate provider. Reuses the installed command authority, History and renderer.
// No Document, History, revision or raster engine is implemented here.
import {createAdjustment,updateStackItem,toggleStackItem,reorderStack,removeStackItem,IMAGE_CAPABILITIES,createColorRaster,serializeColorRaster} from '../../image/image-core.js';
import {createUiB002ImageAdapter} from '../../editor/function-modules/ui-b-002-image-adapter.js';
import {createUiB002NativeAppAdapter} from '../../editor/function-modules/ui-b-002-native-app-adapter.js';
import {updateTextObject} from '../../editor/text-object.js';
import {resolveConfiguredParagraphPlacement} from '../../editor/text-placement-consumer.js';

export const ADJUSTMENTS=Object.freeze(['brightnessContrast','levels','curves','hueSaturation','colorBalance','gradientMap']);
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code})};
const num=(x,min=-1e7,max=1e7)=>{if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)fail('ARGUMENTS_INVALID');return x};
const hex=x=>{if(!/^#[0-9a-f]{6}$/i.test(String(x)))fail('ARGUMENTS_INVALID');return x.toLowerCase()};
export function adjustmentParams(type,p={}){
 if(!ADJUSTMENTS.includes(type)||!p||typeof p!=='object'||Array.isArray(p))fail('ARGUMENTS_INVALID');
 const keys={brightnessContrast:['brightness','contrast'],levels:['black','white','gamma'],curves:['points'],hueSaturation:['hue','saturation','lightness'],colorBalance:['red','green','blue'],gradientMap:['stops']}[type];
 if(Object.keys(p).some(k=>!keys.includes(k)))fail('ARGUMENTS_INVALID');
 if(type==='brightnessContrast')return{brightness:num(p.brightness??0,-100,100),contrast:num(p.contrast??0,-100,100)};
 if(type==='levels'){const black=num(p.black??0,0,254),white=num(p.white??255,1,255);if(black>=white)fail('ARGUMENTS_INVALID');return{black,white,gamma:num(p.gamma??1,.01,10)}}
 if(type==='curves'){
  const points=p.points;if(!Array.isArray(points)||points.length<2||points.length>32)fail('ARGUMENTS_INVALID');
  let previous=-1;return{points:points.map(v=>{if(!Array.isArray(v)||v.length!==2)fail('ARGUMENTS_INVALID');num(v[0],0,255);num(v[1],0,255);if(v[0]<=previous)fail('ARGUMENTS_INVALID');previous=v[0];return [...v]})};
 }
 if(type==='hueSaturation')return{hue:num(p.hue??0,-180,180),saturation:num(p.saturation??0,-100,100),lightness:num(p.lightness??0,-100,100)};
 if(type==='colorBalance')return Object.fromEntries(['red','green','blue'].map(k=>[k,num(p[k]??0,-255,255)]));
 if(!Array.isArray(p.stops)||p.stops.length<2||p.stops.length>16)fail('ARGUMENTS_INVALID');
 let previous=-1;const stops=p.stops.map(s=>{num(s.offset,0,1);if(s.offset<=previous)fail('ARGUMENTS_INVALID');previous=s.offset;return{offset:s.offset,color:hex(s.color)}});
 if(stops[0].offset!==0||stops.at(-1).offset!==1)fail('ARGUMENTS_INVALID');return{stops};
}

export function installNativeUiProvider(app){
 if(app.commands.ownerOf('ui017.adjustment.add.v1'))return app.__ui017Provider;
 const image=createUiB002ImageAdapter(app),native=createUiB002NativeAppAdapter(app);
 const generations=new WeakMap();let serial=0;
 const generation=()=>{if(!app.doc)return null;if(!generations.has(app.doc))generations.set(app.doc,++serial);return generations.get(app.doc)};
 const page=()=>app.page();
 const identity=()=>({documentId:app.doc?.id,pageId:page()?.id,generation:generation()});
 function requireDocument(t){
  if(!app.documentOpen||!app.doc||!page())fail('DOCUMENT_UNAVAILABLE');
  if(t&&(t.documentId!==app.doc.id||t.pageId!==page().id||t.generation!==generation()))fail('TARGET_STALE');
  if(app.history?.pending||app.interaction)fail('INTERACTION_BUSY');
 }
 const selection=()=>app.selectedObjects?.()||[];
 const capture=()=>({...identity(),refs:selection().map(f=>({layerId:f.layer.id,objectId:f.object.id}))});
 function requireSelection(t,{single=false,type=null}={}){
  requireDocument(t);if(!t||!Array.isArray(t.refs)||!t.refs.length)fail('TARGET_NOT_FOUND');
  const current=selection(),refs=current.map(f=>({layerId:f.layer.id,objectId:f.object.id}));
  if(JSON.stringify(refs)!==JSON.stringify(t.refs))fail('TARGET_STALE');
  if(single&&current.length!==1)fail('TARGET_COUNT_INVALID');
  if(current.some(f=>f.effectiveLocked||f.layer.locked||f.object.locked||f.ancestors?.some(o=>o.locked)))fail('TARGET_LOCKED');
  if(type&&current.some(f=>f.object.type!==type))fail(type==='image'?'RASTER_IMAGE_REQUIRED':'TEXT_REQUIRED');
  return current;
 }
 function refresh(){app.spatialDirty=true;app.renderer?.studioImageCache?.clear();app.renderer?.studioLayerCache?.clear();app.markDirty?.();app.refreshAll?.();app.renderer?.render();app.commands.notify('ui017-native')}
 function commit(found,label,next){
  if(JSON.stringify(found.object)===JSON.stringify(next))return{changed:false};
  app.history.pushScoped(label,[app.objectPath(found)],()=>{for(const key of Object.keys(found.object))delete found.object[key];Object.assign(found.object,next)});refresh();return{changed:true,result:{...identity(),layerId:found.layer.id,objectId:found.object.id}};
 }
 const stackTarget=t=>{const [f]=requireSelection(t,{single:true,type:'image'});if(!f.object.rasterState?.colorRaster)fail('RASTER_IMAGE_REQUIRED');return f};
 function stackEdit(args,kind){
  const f=stackTarget(args.target),next=clone(f.object);next.adjustments=next.adjustments||[];
  if(kind==='add'){
   if(next.adjustments.length>=64)fail('STACK_LIMIT');
   const params=adjustmentParams(args.type,args.params),id=globalThis.crypto?.randomUUID?.()||`ui017-${Date.now()}-${++serial}`;
   next.adjustments.push(createAdjustment(args.type,params,{id,opacity:num(args.opacity??1,0,1)}));
  }else{
   const i=next.adjustments.findIndex(a=>a.id===args.id);if(i<0)fail('TARGET_STALE');
   if(kind==='update')updateStackItem(next.adjustments,args.id,{params:adjustmentParams(next.adjustments[i].type,args.params),opacity:num(args.opacity??next.adjustments[i].opacity??1,0,1)});
   if(kind==='toggle'){if(typeof args.enabled!=='boolean')fail('ARGUMENTS_INVALID');toggleStackItem(next.adjustments,args.id,args.enabled)}
   if(kind==='delete')removeStackItem(next.adjustments,args.id);
   if(kind==='reorder'){if(!Number.isInteger(args.index)||args.index<0||args.index>=next.adjustments.length)fail('ARGUMENTS_INVALID');next.adjustments=reorderStack(next.adjustments,i,args.index)}
  }
  return commit(f,`Adjustment ${kind}`,next);
 }
 function transform(a){
  const found=requireSelection(a.target),b=app.renderer.selectionWorldBounds();if(!b)fail('BOUNDS_UNAVAILABLE');
  const value=num(a.value),refs=found.map(f=>({pageId:page().id,layerId:f.layer.id,objectId:f.object.id}));
  const run=(id,args)=>{const r=app.commands.execute(id,{...args,targetRefs:refs},'human-ui');if(!r.ok)fail(r.error.code,r.error.message);return{changed:r.changed,result:r.result}};
  if(a.key==='x'||a.key==='y'){const delta=value-b[a.key];if(Math.abs(delta)<1e-9)return{changed:false};return run('object.translate.v1',{dx:a.key==='x'?delta:0,dy:a.key==='y'?delta:0})}
  if(a.key==='w'||a.key==='h'){
   num(value,.001,1e7);if(found.length!==1)fail('TARGET_COUNT_INVALID');if(Math.abs(value-b[a.key])<1e-9)return{changed:false};
   return run('object.resize.v1',{[a.key==='w'?'width':'height']:value,preserveAspect:!!a.preserveAspect});
  }
  if(a.key==='rotate'){
   if(found.length!==1)fail('TARGET_COUNT_INVALID');const matrix=found[0].worldMatrix||found[0].object.matrix,current=Math.atan2(matrix[1],matrix[0])*180/Math.PI,delta=value-current;
   if(Math.abs(delta)<1e-9)return{changed:false};return run('object.rotate.v1',{degrees:delta,center:{x:b.x+b.w/2,y:b.y+b.h/2}});
  }
  fail('ARGUMENTS_INVALID');
 }
 function textEdit(a){
  const [f]=requireSelection(a.target,{single:true,type:'text'}),next=clone(f.object),p=a.patch||{};
  const allowed=['fontFamily','fontWeight','fontSize','lineHeight','tracking','color','text','paragraph','textPresentation','textRuns','kerningPairs','textBox'];
  if(Object.keys(p).some(k=>!allowed.includes(k)))fail('ARGUMENTS_INVALID');
  for(const k of ['fontSize','lineHeight'])if(k in p)num(p[k],.01,4096);
  if('fontWeight'in p)num(p.fontWeight,100,900);if('color'in p)hex(p.color);
  if('text'in p&&(typeof p.text!=='string'||p.text.length>100000))fail('ARGUMENTS_INVALID');
  if('fontFamily'in p&&(typeof p.fontFamily!=='string'||p.fontFamily.length>200))fail('ARGUMENTS_INVALID');
  // Existing TextObject validator runs on a detached candidate BEFORE History capture.
  if(!updateTextObject(next,p))fail('TEXT_REQUIRED');resolveConfiguredParagraphPlacement(next,app.renderer.measureCtx);return commit(f,'Text formatting',next);
 }
 function imageOperation(a,kind){
  const f=stackTarget(a.target),r=f.object.rasterState.colorRaster;
  if(kind==='resize'){
   for(const k of ['width','height'])if(!Number.isInteger(a[k])||a[k]<1||a[k]>8192)fail('ARGUMENTS_INVALID');
   if(a.width*a.height>16777216)fail('ARGUMENTS_BOUNDS');
   if(a.resampling&&a.resampling!=='nearest')fail('CAPABILITY_UNAVAILABLE');
   if(r.width===a.width&&r.height===a.height)return{changed:false};return image.resize({width:a.width,height:a.height});
  }
  for(const k of ['x','y','w','h'])if(!Number.isInteger(a[k]))fail('ARGUMENTS_INVALID');
  if(a.x<0||a.y<0||a.w<1||a.h<1||a.x+a.w>r.width||a.y+a.h>r.height)fail('ARGUMENTS_INVALID');
  if(a.x===0&&a.y===0&&a.w===r.width&&a.h===r.height)return{changed:false};return image.crop({x:a.x,y:a.y,w:a.w,h:a.h});
 }
 const command=(id,run,extra={})=>({id,definition:{history:'PRESERVE_EXISTING_ROUTE',invalidation:'FULL_RENDER',mutationScope:'EXISTING_NATIVE_HISTORY',run,...extra}});
 const commands=[command('ui017.transform.field.v1',transform),...['add','update','toggle','delete','reorder'].map(kind=>command(`ui017.adjustment.${kind}.v1`,a=>stackEdit(a,kind))),command('ui017.text.edit.v1',textEdit),command('ui017.image.resize.v1',a=>imageOperation(a,'resize')),command('ui017.image.crop.v1',a=>imageOperation(a,'crop')),command('ui017.image.mode.v1',a=>{stackTarget(a.target);return image.setColorMode({mode:a.mode})}),command('ui017.image.depth.v1',a=>{stackTarget(a.target);return image.setBitDepth({depth:a.depth})}),command('ui017.canvas.resize.v1',a=>{requireDocument(a.target);const {target,...args}=a;const r=app.commands.execute('page.canvas.resize.v1',args,'human-ui');if(!r.ok)fail(r.error.code,r.error.message);return{changed:r.changed,result:r.result}}),
  command('ui017.image.import.v1',async a=>{
   requireDocument(a.target);const layer=page().layers.find(l=>l.id===a.layerId);if(!layer||layer.locked||page().activeLayerId!==layer.id)fail('TARGET_LOCKED');
   if(!a.file||!String(a.file.type).startsWith('image/')||a.file.size>33554432)fail('ARGUMENTS_INVALID');
   const bitmap=await createImageBitmap(a.file);try{requireDocument(a.target);if(page().activeLayerId!==layer.id||layer.locked)fail('TARGET_STALE');const w=bitmap.width,h=bitmap.height;if(w*h>16777216||w>8192||h>8192)fail('ARGUMENTS_BOUNDS');
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,w,h),rgb=new Uint8Array(w*h*3),alpha=new Uint8Array(w*h);for(let i=0;i<w*h;i++){rgb.set(pixels.data.subarray(i*4,i*4+3),i*3);alpha[i]=pixels.data[i*4+3]}
   const object={id:crypto.randomUUID(),type:'image',name:a.file.name,matrix:[1,0,0,1,0,0],opacity:1,w,h,src:canvas.toDataURL('image/png'),rasterState:{colorRaster:serializeColorRaster(createColorRaster({width:w,height:h,bitDepth:8,colorMode:'RGB',data:rgb,alpha})),source:{format:'INK',name:a.file.name}}};
   app.history.pushScoped('Import image',[app.layerObjectsPath(layer)],()=>layer.objects.push(object));app.selection=[{layerId:layer.id,objectId:object.id}];refresh();return{changed:true,result:{objectId:object.id,width:w,height:h}};
   }finally{bitmap.close()}
  },{async:true,documentPolicy:'SAME_DOCUMENT'}),
  command('ui017.layer.rename.v1',a=>{requireDocument(a.target);const l=page().layers.find(x=>x.id===a.layerId);if(!l)fail('TARGET_STALE');if(l.locked)fail('TARGET_LOCKED');if(typeof a.name!=='string'||!a.name.trim()||a.name.length>200)fail('ARGUMENTS_INVALID');if(l.name===a.name.trim())return{changed:false};app.history.pushScoped('Rename layer',[app.layerPath(l)],()=>{l.name=a.name.trim()});refresh();return{changed:true}}),
  command('ui017.blend.set.v1',a=>{const[f]=requireSelection(a.target,{single:true});if(!['image','path','shape'].includes(f.object.type)||!IMAGE_CAPABILITIES.blendModes.includes(a.mode))fail('CAPABILITY_UNAVAILABLE');return commit(f,'Object blend',{...clone(f.object),blendMode:a.mode})}),
  command('ui017.fill.set.v1',a=>{const[f]=requireSelection(a.target,{single:true});if(!['path','shape'].includes(f.object.type))fail('CAPABILITY_UNAVAILABLE');const color=hex(a.color);return commit(f,'Object fill',{...clone(f.object),...(f.object.type==='path'?{fill:color}:{fill:true,fillColor:color})})})
 ];
 app.commands.registerOwned('ui017-native',{commands,selectors:[{id:'ui017.target',selector:capture},{id:'ui017.adjustments',selector:()=>{const f=selection();return f.length===1&&f[0].object.type==='image'?{target:capture(),items:clone(f[0].object.adjustments||[])}:null}}]});
 const provider=Object.freeze({capture,identity,requireDocument,requireSelection,native,image,dispose:()=>app.commands.unregisterOwned('ui017-native')});
 Object.defineProperty(app,'__ui017Provider',{value:provider,configurable:true});return provider;
}
