import {installNativeUiProvider} from './native-provider.js';
import {createUiB002ColorRuntime} from '../../editor/function-modules/ui-b-002-tools-runtime.js';
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
export function createNativeHost(app){
 const provider=installNativeUiProvider(app),listeners=new Set(),receipts=new Set();
 const colorRuntime=createUiB002ColorRuntime(app,{notify:()=>app.commands.notify('native-color')});
 let aspect=false,activeAdjustment=null; // view/editor state only
 const select=(id,args={})=>app.commands.select(id,args);
 const target=()=>provider.capture();
 const execute=(id,args={})=>app.commands.execute(id,args,'human-ui');
 function getSnapshot(){
  const p=app.page(),open=!!app.documentOpen,color=select('tool.color'),settings=select('tool.settings'),b=app.renderer.selectionWorldBounds?.(),found=app.selectedObjects?.()||[],single=found.length===1?found[0]:null,o=single?.object;
  const t=target();let object=o?{id:o.id,objectId:o.id,target:t,type:o.type,locked:!!single.layer.locked||!!o.locked,x:b?.x??0,y:b?.y??0,w:b?.w??0,h:b?.h??0,rotate:Math.atan2((single.worldMatrix||o.matrix)[1],(single.worldMatrix||o.matrix)[0])*180/Math.PI,font:o.fontFamily||'system-ui',weight:o.fontWeight||400,size:o.fontSize||32,leading:(o.lineHeight||1.25)*(o.fontSize||32),tracking:o.tracking||0,textColor:o.color||'#202020',text:o.text||'',align:o.paragraph?.align||o.paragraphAlign||'left',paragraph:clone(o.paragraph||{}),textBox:clone(o.textBox),textPresentation:clone(o.textPresentation||{}),fill:o.type==='path'?o.fill:o.fillColor||o.color,blendMode:o.blendMode||'source-over',adjustments:clone(o.adjustments||[]),raster:clone(o.rasterState?.colorRaster?{width:o.rasterState.colorRaster.width,height:o.rasterState.colorRaster.height}:null)}:null;
  if(!object&&found.length>1)object={id:null,target:t,type:'selection',locked:found.some(f=>f.effectiveLocked||f.layer.locked||f.object.locked),x:b?.x||0,y:b?.y||0,w:b?.w||0,h:b?.h||0,rotate:0};
  const layers=open?select('layer.list').reverse().map(l=>({...l,opacity:l.opacity*100,target:{...provider.identity()},preview:select('layer.preview.state',{layerId:l.id,width:48,height:40,documentId:app.doc.id,pageId:p.id})})):[];
  const doc=open?{id:app.doc.id,name:app.doc.title||'Untitled',width:p.artboard.widthMm,height:p.artboard.heightMm,ppi:p.artboard.ppi,units:p.artboard.unit||'mm',artboard:clone(p.artboard),selection:p.activeLayerId,layers,camera:{zoom:(p.camera.scale||1)*100,x:p.camera.x||0,y:p.camera.y||0},guides:clone(p.guides||[]),canvasMode:p.workspace?.mode||'document'}:null;
  return {kind:'NATIVE',docs:doc?[doc]:[],activeDoc:doc?.id||null,object,target:t,tool:app.tool||'select',paint:{foreground:color.color||'#000000',background:colorRuntime.colors().background,alpha:(settings?.opacity??1)*100},swatches:[{id:'recent',name:'Recent colors',open:true,colors:color.recentColors||[]}],swatchSelection:'recent',toolOptions:{'select.aspect':aspect?1:0,'brush.size':settings?.size||24},guides:{show:true,lock:false,snap:true},layout:1,adjustmentEditorId:activeAdjustment,capabilities:{foreground:color.status==='AVAILABLE',background:open}};
 }
 const getHistory=()=>{const h=select('history.summary');return{index:h.applied,limit:h.limit,entries:[{index:0,label:'History start'},...h.entries.map((e,i)=>({...e,index:i+1}))]}};
 const emit=()=>{for(const f of listeners)f(getSnapshot())};
 const unsub=app.commands.subscribe(emit);
 let last='',raf;
 const poll=()=>{const p=app.page(),h=select('history.summary'),key=JSON.stringify([app.doc?.id,provider.identity().generation,p?.id,app.documentOpen,app.tool,p?.activeLayerId,app.selection,h.applied,h.retainedCount,app.doc?.modifiedAt]);if(key!==last){last=key;emit()}raf=requestAnimationFrame(poll)};
 raf=requestAnimationFrame(poll);
 function dispatch(c){
  let r;const s=getSnapshot(),l=s.docs[0]?.layers.find(l=>l.id===s.docs[0].selection),o=s.object,t=c.target||o?.target||target();
  try{
   if(c.type==='history.undo'||c.type==='history.redo')r=execute(c.type+'.v1');
   else if(c.type==='history.jump')r=execute('history.jump.v1',{applied:c.index});
   else if(c.type==='tool.option'&&c.key==='select.aspect'){aspect=!!c.value;r={ok:true,changed:false}}
   else if(c.type==='tool.set')r=execute('tool.activate.v1',{tool:c.value});
   else if(c.type==='tool.option'){const key=c.key.split('.').pop();if(!['size','opacity','hardness','stabilizer','smoothing','pressure','taper','flow','wetness','grain','softness','bristle'].includes(key))throw Error('Setting unavailable');if(!Number.isFinite(c.value)||(key==='size'?(c.value<1||c.value>300):!['hardness','stabilizer'].includes(key)&&(c.value<0||c.value>1)))throw Error('Setting outside supported range');r=execute('tool.setting.set.v1',{key,value:c.value,tool:app.tool})}
   else if(c.type==='layer.select')r=execute('layer.activate.v1',{layerId:c.targetId});
   else if(c.type==='layer.add')r=execute('layer.create.v1');
   else if(c.type==='layer.duplicate'||c.type==='layer.delete'){
    if(c.object){provider.requireSelection(t);r=execute(c.type==='layer.delete'?'selection.delete.v1':'selection.duplicate.v1')}
    else{if(l?.locked)throw Error('Layer locked');r=execute(c.type==='layer.delete'?'layer.delete.v1':'layer.duplicate.v1',{layerId:c.targetId})}
   }
   else if(c.type==='layer.lock'||c.type==='layer.visible')r=execute(c.type==='layer.lock'?'layer.lock.set.v1':'layer.visibility.set.v1',{layerId:c.targetId,[c.type==='layer.lock'?'locked':'visible']:c.value});
   else if(c.type==='layer.reorder'){
    const list=s.docs[0].layers,src=list.find(x=>x.id===c.targetId),dst=list[c.index];if(!src||!dst||src.locked)throw Error('Layer unavailable');r=src===dst?{ok:true,changed:false}:execute('layer.reorder.v1',{sourceId:src.id,targetId:dst.id,position:list.indexOf(src)<c.index?'after':'before'});
   }
   else if(c.type==='layer.patch'){
    const p=c.patch,keys=Object.keys(p);if(keys.length!==1)throw Error('Commit one native field at a time');const k=keys[0],value=p[k];
    if(k==='opacity'){if(!l||l.locked)throw Error('Layer locked');r=execute('layer.opacity.set.v1',{layerId:l.id,opacity:value/100})}
    else if(k==='name')r=execute('ui017.layer.rename.v1',{target:s.target,layerId:c.targetId,name:value});
    else if(['x','y','w','h','rotate'].includes(k))r=execute('ui017.transform.field.v1',{target:t,key:k,value,preserveAspect:aspect});
    else{
     const map={font:'fontFamily',weight:'fontWeight',size:'fontSize',leading:'lineHeight',tracking:'tracking',textColor:'color',text:'text'};
     const patch=k==='align'?{paragraph:{...o.paragraph,align:String(value).toLowerCase()}}:k==='indent'?{paragraph:{...o.paragraph,indentLeft:value}}:{[map[k]||k]:k==='leading'?value/o.size:k==='weight'?Number(value):value};
     r=execute('ui017.text.edit.v1',{target:t,patch});
    }
   }
   else if(c.type==='text.patch')r=execute('ui017.text.edit.v1',{target:t,patch:c.patch});
   else if(c.type==='paint.patch'){
    provider.requireDocument(t);if(app.interaction||app.history?.pending)throw Error('Finish the current interaction');const keys=Object.keys(c.patch);if(keys.length!==1||!['foreground','background'].includes(keys[0]))throw Error('Color role unavailable');if(keys[0]==='foreground')r=execute('tool.color.set.v1',{color:c.patch.foreground});else r={ok:true,...colorRuntime.setBackgroundColor(c.patch.background)};
   }
   else if(c.type==='paint.swap'||c.type==='paint.reset'){provider.requireDocument(t);if(app.interaction||app.history?.pending)throw Error('Finish the current interaction');r={ok:true,changed:true,result:c.type==='paint.swap'?colorRuntime.swapColors():colorRuntime.resetColors()};}
   else if(c.type==='camera.patch'){
    if('zoom'in c.patch)r=execute('view.zoom.set.v1',{scale:c.patch.zoom/100});
    else r=execute('view.pan.v1',{dx:c.patch.x??0,dy:c.patch.y??0});
   }
   else if(c.type==='adjustment.select'){activeAdjustment=c.id;r={ok:true,changed:false}}
   else if(c.type.startsWith('adjustment.'))r=execute('ui017.'+c.type+'.v1',{...c,type:c.adjustmentType||c.type,target:t});
   else if(c.type==='blend.set')r=execute('ui017.blend.set.v1',{target:t,mode:c.mode});
   else if(c.type==='fill.set')r=execute('ui017.fill.set.v1',{target:t,color:c.color});
   else if(c.type==='swatch.toggle'){r={ok:true,changed:false}}
   else throw Error('This control has no Native receiver');
  }catch(e){r={ok:false,changed:false,error:{code:e.code||'CAPABILITY_UNAVAILABLE',message:e.message}}}
  const result={...r,error:r?.error?.message||r?.error};for(const f of receipts)f({...c,result});emit();return result;
 }
 return {kind:'NATIVE',app,provider,execute,select,target,getSnapshot,getHistory,dispatch,subscribe(f){listeners.add(f);return()=>listeners.delete(f)},subscribeCommands(f){receipts.add(f);return()=>receipts.delete(f)},getSelection:()=>select('selection.current'),getCapabilities:()=>({core:'available',history:'available',renderer:'available'}),dispose(){cancelAnimationFrame(raf);unsub();listeners.clear();receipts.clear();provider.dispose()}};
}
