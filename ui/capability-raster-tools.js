/*
 * INK UI-B raster tool session adapter.
 * UI interaction only: delegates all pixel algorithms to the promoted image authority.
 */
import { Matrix as M } from '../src/core/index.js';
import {
  colorRasterToRgba8, createColorRaster, serializeColorRaster, deserializeColorRaster,
  magicWandSelection, quickSelection, polygonalLassoSelection, magneticLassoSelection, objectSelection,
  refineRasterSelection, sampleRasterColor, gradientFill, paintBucketFill,
  cloneStamp, patternStamp, healingBrush, spotHealing, patchRaster,
  dodge, burn, sponge, localBlur, localSharpen, colorReplacementBrush
} from '../src/image/image-core.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const copyImage=image=>({width:image.width,height:image.height,data:new Uint8ClampedArray(image.data)});

function alphaCombine(current,next,mode){
  if(!current||mode==='new')return next;
  if(current.width!==next.width||current.height!==next.height)return next;
  const alpha=new Uint8ClampedArray(current.alpha.length);
  for(let i=0;i<alpha.length;i++){
    const a=current.alpha[i]||0,b=next.alpha[i]||0;
    if(mode==='add')alpha[i]=Math.max(a,b);
    else if(mode==='subtract')alpha[i]=a&&b?0:a;
    else if(mode==='intersect')alpha[i]=Math.min(a,b);
    else alpha[i]=b;
  }
  return{...next,alpha,source:'ui-b-combined-selection'};
}

function rgbaToSerializedRaster(imageData){
  const pixels=imageData.width*imageData.height;
  const rgb=new Uint8Array(pixels*3),alpha=new Uint8Array(pixels);
  for(let i=0;i<pixels;i++){
    const o=i*4,d=i*3;
    rgb[d]=imageData.data[o];rgb[d+1]=imageData.data[o+1];rgb[d+2]=imageData.data[o+2];alpha[i]=imageData.data[o+3];
  }
  return serializeColorRaster(createColorRaster({width:imageData.width,height:imageData.height,bitDepth:8,colorMode:'RGB',data:rgb,alpha}));
}

function colorHex(sample){
  const h=value=>Math.round(clamp(value,0,255)).toString(16).padStart(2,'0');
  return '#'+h(sample.r??sample.rgba?.[0]??sample[0])+h(sample.g??sample.rgba?.[1]??sample[1])+h(sample.b??sample.rgba?.[2]??sample[2]);
}

export const UI_B_RASTER_TOOL_IDS=Object.freeze(new Set([
  'polygonalLasso','magneticLasso','quickSelection','magicWand','objectSelection',
  'gradient','paintBucket','eyedropper','colorSampler','measure',
  'cloneStamp','patternStamp','healingBrush','spotHealing','patch',
  'dodge','burn','sponge','localBlur','localSharpen','colorReplacement'
]));

export function createRasterToolController(app,{onStateChange=()=>{}}={}){
  const state={
    tool:null,
    selection:null,
    polygonPoints:[],
    sourcePoint:null,
    measureStart:null,
    drag:null,
    stroke:null,
    patternImage:null,
    patternName:null,
    options:{
      selectionMode:'new',tolerance:32,contiguous:true,edgeThreshold:40,searchRadius:8,
      radius:18,strength:.55,opacity:1,hardness:.85,sampleRadius:0,
      gradientType:'linear',gradientStart:'#202020',gradientEnd:'#ffffff',
      replacementColor:'#3b63fb',spongeMode:'saturate'
    }
  };

  const notify=()=>onStateChange({...state,options:{...state.options}});

  function selectedRaster(){
    const found=app.selectedObjects().find(item=>item.object?.type==='image'&&item.object?.rasterState?.colorRaster);
    if(!found)return null;
    const raster=deserializeColorRaster(found.object.rasterState.colorRaster);
    if(raster.bitDepth!==8||raster.colorMode!=='RGB')return{found,raster,unsupported:'Raster direct tools currently require 8-bit RGB source state'};
    const preview=colorRasterToRgba8(found.object.rasterState.colorRaster,{icc:found.object.rasterState.icc?.bytes||null});
    if(preview.status!=='ok')return{found,raster,unsupported:preview.reason||preview.status};
    return{found,raster,image:copyImage(preview.imageData)};
  }

  function pointForEvent(event,target=selectedRaster()){
    if(!target?.found||target.unsupported)return null;
    const found=target.found,world=app.eventData(event).world,inv=M.tryInvert(found.worldMatrix||found.object.matrix);
    if(!inv)return null;
    const local=M.point(inv,world),width=target.image.width,height=target.image.height;
    if(!found.object.w||!found.object.h)return null;
    const x=local.x/found.object.w*width,y=local.y/found.object.h*height;
    return{x:clamp(x,0,width-1),y:clamp(y,0,height-1),local};
  }

  function writeRaster(target,image){
    target.found.object.rasterState.colorRaster=rgbaToSerializedRaster(image);
    target.found.object.rasterState.source={...(target.found.object.rasterState.source||{}),format:'INK',uiBEdited:true};
    app.spatialDirty=true;
    app.renderer?.studioImageCache?.clear?.();
    app.renderer?.studioLayerCache?.clear?.();
  }

  function commitOne(label,target,image){
    app.history.pushScoped(label,[app.objectPath(target.found)],()=>writeRaster(target,image));
    app.markDirty?.();app.renderer.render();app.refreshSelectionUI();
  }

  function requireRaster(){
    const target=selectedRaster();
    if(!target){app.toast('請先選取含 Raster State 的影像');return null;}
    if(target.unsupported){app.toast(target.unsupported,3000);return null;}
    return target;
  }

  function setSelection(next){
    state.selection=alphaCombine(state.selection,next,state.options.selectionMode);
    notify();
    app.toast('Raster selection 已更新');
  }

  function brushRadius(target){
    const scale=target.image.width/Math.max(1,target.found.object.w);
    return Math.max(1,state.options.radius*scale);
  }

  function applyRetouch(tool,target,point){
    const common={targetPoint:point,radius:brushRadius(target),brushRadius:brushRadius(target),opacity:state.options.opacity,strength:state.options.strength,hardness:state.options.hardness};
    const image=target.image;
    if(tool==='cloneStamp'){
      if(!state.sourcePoint)throw new Error('請先 Alt/Option 點擊設定來源');
      return cloneStamp(image,{...common,sourcePoint:state.sourcePoint});
    }
    if(tool==='patternStamp'){
      if(!state.patternImage)throw new Error('請先載入 Pattern image');
      return patternStamp(image,{...common,pattern:state.patternImage,origin:{x:0,y:0}});
    }
    if(tool==='healingBrush'){
      if(!state.sourcePoint)throw new Error('請先 Alt/Option 點擊設定來源');
      return healingBrush(image,{...common,sourcePoint:state.sourcePoint});
    }
    if(tool==='spotHealing')return spotHealing(image,{...common,neighborRadius:2});
    if(tool==='patch'){
      if(!state.sourcePoint)throw new Error('請先 Alt/Option 點擊設定來源');
      const r=Math.max(2,Math.round(brushRadius(target))),w=r*2,h=r*2;
      return patchRaster(image,{sourceRegion:{x:Math.round(state.sourcePoint.x-r),y:Math.round(state.sourcePoint.y-r),w,h},targetRegion:{x:Math.round(point.x-r),y:Math.round(point.y-r),w,h},opacity:state.options.opacity,feather:Math.max(0,Math.round(r*.2))});
    }
    if(tool==='dodge')return dodge(image,{...common});
    if(tool==='burn')return burn(image,{...common});
    if(tool==='sponge')return sponge(image,{...common,mode:state.options.spongeMode});
    if(tool==='localBlur')return localBlur(image,{...common,radius:2});
    if(tool==='localSharpen')return localSharpen(image,{...common,radius:2,amount:state.options.strength*2});
    if(tool==='colorReplacement')return colorReplacementBrush(image,{...common,replacementColor:state.options.replacementColor,tolerance:state.options.tolerance});
    return image;
  }

  function pointerDown(event){
    if(!state.tool||!UI_B_RASTER_TOOL_IDS.has(state.tool))return false;
    const target=requireRaster();if(!target)return true;
    const point=pointForEvent(event,target);if(!point)return true;
    event.preventDefault();event.stopImmediatePropagation();
    app.el.canvas.setPointerCapture?.(event.pointerId);

    try{
      if(['cloneStamp','healingBrush','patch'].includes(state.tool)&&(event.altKey||event.ctrlKey)){
        state.sourcePoint={x:point.x,y:point.y};app.toast('來源點已設定');notify();return true;
      }
      if(state.tool==='magicWand'){setSelection(magicWandSelection(target.image,{x:point.x,y:point.y,tolerance:state.options.tolerance,contiguous:state.options.contiguous}));return true;}
      if(state.tool==='quickSelection'){setSelection(quickSelection(target.image,{samples:[{x:point.x,y:point.y}],tolerance:state.options.tolerance,edgeThreshold:state.options.edgeThreshold,initialSelection:state.options.selectionMode==='add'?state.selection:null}));return true;}
      if(state.tool==='objectSelection'){setSelection(objectSelection(target.image,{seed:{x:point.x,y:point.y},colorThreshold:state.options.tolerance,edgeThreshold:state.options.edgeThreshold,alphaThreshold:1,minComponentSize:1}));return true;}
      if(state.tool==='polygonalLasso'||state.tool==='magneticLasso'){
        state.polygonPoints.push({x:point.x,y:point.y});
        if(event.detail>=2&&state.polygonPoints.length>=3){
          const next=state.tool==='polygonalLasso'?polygonalLassoSelection(target.image.width,target.image.height,state.polygonPoints):magneticLassoSelection(target.image,{anchors:state.polygonPoints,close:true,searchRadius:state.options.searchRadius,edgeSensitivity:state.options.edgeThreshold});
          state.polygonPoints=[];setSelection(next);
        }else{app.toast('加入選取節點；雙擊完成');notify();}
        return true;
      }
      if(state.tool==='eyedropper'||state.tool==='colorSampler'){
        const sample=sampleRasterColor(target.image,{x:point.x,y:point.y,radius:state.options.sampleRadius});
        const hex=colorHex(sample);if(state.tool==='eyedropper')app.setColor(hex,true);
        app.toast((state.tool==='eyedropper'?'取色 ':'Sampler ')+hex);notify();return true;
      }
      if(state.tool==='measure'){
        if(!state.measureStart){state.measureStart={x:point.x,y:point.y};app.toast('Measure 起點已設定');}
        else{const dx=point.x-state.measureStart.x,dy=point.y-state.measureStart.y;app.toast('距離 '+Math.hypot(dx,dy).toFixed(1)+' px · '+(Math.atan2(dy,dx)*180/Math.PI).toFixed(1)+'°');state.measureStart=null;}
        notify();return true;
      }
      if(state.tool==='paintBucket'){
        const result=paintBucketFill(target.image,{x:point.x,y:point.y,color:app.toolSettings[app.lastDrawTool]?.color||'#202020',tolerance:state.options.tolerance,contiguous:state.options.contiguous,opacity:state.options.opacity});
        commitOne('Paint Bucket',target,result);return true;
      }
      if(state.tool==='gradient'){
        state.drag={type:'gradient',pointerId:event.pointerId,target,start:{x:point.x,y:point.y},current:{x:point.x,y:point.y}};notify();return true;
      }
      const image=applyRetouch(state.tool,target,point);
      app.history.begin('Raster '+state.tool,{targets:[app.objectPath(target.found)]});
      writeRaster(target,image);
      state.stroke={pointerId:event.pointerId,target,tool:state.tool,last:{x:point.x,y:point.y},changed:true};
      app.renderer.render();notify();return true;
    }catch(error){app.toast(error.message||'Raster tool failed',3000);return true;}
  }

  function pointerMove(event){
    if(state.drag?.pointerId===event.pointerId&&state.drag.type==='gradient'){
      const point=pointForEvent(event,state.drag.target);if(point)state.drag.current={x:point.x,y:point.y};return true;
    }
    if(state.stroke?.pointerId!==event.pointerId||!event.buttons)return false;
    event.preventDefault();event.stopImmediatePropagation();
    const target=selectedRaster();if(!target||target.unsupported)return true;
    const point=pointForEvent(event,target);if(!point)return true;
    try{
      const image=applyRetouch(state.stroke.tool,target,point);
      writeRaster(target,image);state.stroke.target=target;state.stroke.last={x:point.x,y:point.y};state.stroke.changed=true;app.renderer.render();
    }catch(error){app.toast(error.message||'Raster tool failed',2500);}
    return true;
  }

  function pointerUp(event,cancelled=false){
    if(state.drag?.pointerId===event.pointerId){
      event.preventDefault();event.stopImmediatePropagation();
      const drag=state.drag;state.drag=null;
      if(!cancelled){
        const stops=[{offset:0,color:state.options.gradientStart},{offset:1,color:state.options.gradientEnd}];
        const fill=gradientFill(drag.target.image.width,drag.target.image.height,{type:state.options.gradientType,stops,start:drag.start,end:drag.current,center:drag.start,radius:Math.hypot(drag.current.x-drag.start.x,drag.current.y-drag.start.y),opacity:state.options.opacity});
        commitOne('Gradient Fill',drag.target,fill);
      }
      notify();return true;
    }
    if(state.stroke?.pointerId===event.pointerId){
      event.preventDefault();event.stopImmediatePropagation();
      const changed=state.stroke.changed;state.stroke=null;
      if(cancelled||!changed)app.history.cancel({restore:true});else{app.history.commit();app.markDirty?.();}
      app.renderer.render();notify();return true;
    }
    return false;
  }

  function cancelActiveInteraction({restore=true}={}){
    const pointerId=state.stroke?.pointerId??state.drag?.pointerId??null;
    const hadStroke=Boolean(state.stroke),hadInteraction=hadStroke||Boolean(state.drag)||Boolean(state.polygonPoints.length);
    if(hadStroke)app.history.cancel({restore:Boolean(restore)});
    state.stroke=null;state.drag=null;state.polygonPoints=[];
    if(pointerId!=null)try{app.el.canvas.releasePointerCapture?.(pointerId);}catch{}
    if(hadStroke)app.renderer.render();
    if(hadInteraction)notify();
    return hadInteraction;
  }

  function setTool(tool){
    cancelActiveInteraction({restore:true});
    state.tool=UI_B_RASTER_TOOL_IDS.has(tool)?tool:null;
    if(state.tool){
      app.setTool('select');
      app.el.canvas.style.cursor=(state.tool==='eyedropper'||state.tool==='colorSampler')?'copy':'crosshair';
    }
    notify();
  }

  function clearTool({restore=true}={}){cancelActiveInteraction({restore});state.tool=null;notify();}
  function setOption(key,value){if(Object.prototype.hasOwnProperty.call(state.options,key)){state.options[key]=value;notify();}}
  function setPattern(imageData,name='Pattern'){if(!imageData?.width||!imageData?.height||!imageData?.data)throw new Error('INK_UI_B_PATTERN_INVALID');state.patternImage=copyImage(imageData);state.patternName=name;notify();return true;}
  function refineSelection(options={}){if(!state.selection)throw new Error('INK_UI_B_SELECTION_REQUIRED');state.selection=refineRasterSelection(state.selection,options);notify();return state.selection;}
  function selection(){return state.selection;}
  function options(){return{...state.options};}
  function activeTool(){return state.tool;}

  return{state,setTool,clearTool,cancelActiveInteraction,setOption,setPattern,selection,options,activeTool,selectedRaster,pointForEvent,pointerDown,pointerMove,pointerUp,refineSelection};
}
