/*
 * INK UI-B raster tool session adapter.
 * UI interaction only: delegates all pixel algorithms to the promoted image authority.
 */
import { Matrix as M } from '../src/core/index.js';
import { createPath, createAnchor } from '../src/vector/vector-core.js';
import {
  colorRasterToRgba8, createColorRaster, serializeColorRaster, deserializeColorRaster,
  magicWandSelection, quickSelection, polygonalLassoSelection, magneticLassoSelection, objectSelection,
  refineRasterSelection, rasterizePathMask, sampleRasterColor, gradientFill, paintBucketFill,
  cloneStamp, patternStamp, healingBrush, spotHealing, patchRaster, smudge, clipRasterSelection,
  dodge, burn, sponge, localBlur, localSharpen, colorReplacementBrush
} from '../src/image/image-core.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const copyImage=image=>({width:image.width,height:image.height,data:new Uint8ClampedArray(image.data)});

export function createMarqueeSelection(width,height,start,end,ellipse=false){
  const x=Math.max(0,Math.min(width,start.x,end.x)),y=Math.max(0,Math.min(height,start.y,end.y));
  const right=Math.min(width,Math.max(0,start.x,end.x)),bottom=Math.min(height,Math.max(0,start.y,end.y));
  if(right<=x||bottom<=y)return null;
  if(!ellipse)return polygonalLassoSelection(width,height,[{x,y},{x:right,y},{x:right,y:bottom},{x,y:bottom}]);
  const cx=(x+right)/2,cy=(y+bottom)/2,rx=(right-x)/2,ry=(bottom-y)/2,k=.5522847498307936;
  const path=createPath({subpaths:[{closed:true,anchors:[
    createAnchor(cx+rx,cy,{x:0,y:-ry*k},{x:0,y:ry*k}),
    createAnchor(cx,cy+ry,{x:rx*k,y:0},{x:-rx*k,y:0}),
    createAnchor(cx-rx,cy,{x:0,y:ry*k},{x:0,y:-ry*k}),
    createAnchor(cx,cy-ry,{x:-rx*k,y:0},{x:rx*k,y:0})
  ]}]});
  return {...rasterizePathMask(path,width,height),type:'selection',source:'ellipse-marquee',bounds:{x,y,w:right-x,h:bottom-y}};
}

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
  'rectangleMarquee','ellipseMarquee',
  'polygonalLasso','magneticLasso','quickSelection','magicWand','objectSelection',
  'gradient','paintBucket','eyedropper','colorSampler','measure',
  'cloneStamp','patternStamp','healingBrush','spotHealing','patch',
  'dodge','burn','sponge','localBlur','localSharpen','smudge','colorReplacement'
]));

export function createRasterToolController(app,{onStateChange=()=>{}}={}){
  let selectionLease=null,sourceLease=null,polygonLease=null;
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
      radius:18,strength:.55,opacity:1,hardness:.85,sampleRadius:0,feather:2,
      gradientType:'linear',gradientStart:'#202020',gradientEnd:'#ffffff',
      replacementColor:'#3b63fb',spongeMode:'saturate'
    }
  };

  const notify=()=>onStateChange({...state,options:{...state.options}});

  function selectionTargetValid(target,lease=selectionLease){
    if(!target?.image||!lease||!app.documentOpen)return false;
    const items=app.selectedObjects();
    const current=items[0],matrix=current?.worldMatrix||current?.object?.matrix;
    if(!matrix||matrix.length!==6||!Array.from(matrix).every(Number.isFinite)||!M.tryInvert(matrix)||!(current.object.w>0&&current.object.h>0))return false;
    return items.length===1&&items[0].object===lease.object&&items[0].layer===lease.layer&&
      app.doc===lease.document&&app.page()===lease.page&&
      target.found.object.rasterState.colorRaster===lease.raster&&
      JSON.stringify([matrix,current.object.w,current.object.h])===lease.geometry&&
      !items[0].effectiveLocked&&!items[0].layer.locked&&!items[0].object.locked&&
      items[0].effectiveVisible!==false&&items[0].interactionExposed!==false&&items[0].layer.visible!==false;
  }
  const captureSelectionTarget=target=>({document:app.doc,page:app.page(),object:target.found.object,layer:target.found.layer,raster:target.found.object.rasterState.colorRaster,geometry:JSON.stringify([target.found.worldMatrix||target.found.object.matrix,target.found.object.w,target.found.object.h])});
  function selection(){
    if(state.selection&&!selectionTargetValid(selectedRaster())){state.selection=null;selectionLease=null;}
    return state.selection;
  }
  function clearSelection(){state.selection=null;selectionLease=null;cancelActiveInteraction({restore:true});notify();return true;}
  function selectionPreview(){
    const target=selectedRaster(),drag=state.drag;
    if(polygonLease&&!selectionTargetValid(target,polygonLease)){state.polygonPoints=[];polygonLease=null;}
    if(state.polygonPoints.length)return{type:'polygon',points:state.polygonPoints,cursor:state.polygonCursor,width:target.image.width,height:target.image.height};
    return drag&&selectionTargetValid(target,drag.lease)?{...drag,width:drag.target.image.width,height:drag.target.image.height}:null;
  }
  function sourceInfo(){if(sourceLease&&!selectionTargetValid(selectedRaster(),sourceLease)){sourceLease=null;state.sourcePoint=null;}return state.sourcePoint?{...state.sourcePoint}:null;}
  function resetSource(){sourceLease=null;state.sourcePoint=null;notify();}
  function finishPolygon(){
    const target=requireRaster();if(!target||!selectionTargetValid(target,polygonLease))throw Error('Selection target changed');
    if(state.polygonPoints.length<3)throw Error('至少需要三個節點');
    const next=state.tool==='polygonalLasso'?polygonalLassoSelection(target.image.width,target.image.height,state.polygonPoints):magneticLassoSelection(target.image,{anchors:state.polygonPoints,close:true,searchRadius:state.options.searchRadius,edgeSensitivity:state.options.edgeThreshold});
    state.polygonPoints=[];polygonLease=null;setSelection(next,target);return true;
  }
  function removePolygonPoint(){state.polygonPoints.pop();notify();}


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
    const old=target.found.object.rasterState.colorRaster,mask=selection();
    image=clipRasterSelection(target.image,image,mask);
    const next=rgbaToSerializedRaster(image);
    target.found.object.rasterState.colorRaster=next;
    for(const lease of [selectionLease,sourceLease,state.stroke?.lease])if(lease?.raster===old&&lease.object===target.found.object)lease.raster=next;
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
    if(!selectionTargetValid(target,captureSelectionTarget(target))){app.toast('請選取單一可編輯影像');return null;}
    return target;
  }

  function setSelection(next,target=selectedRaster()){
    const lease=captureSelectionTarget(target);
    if(!selectionTargetValid(target,lease))throw Error('Selection target is unavailable');
    state.selection=alphaCombine(selection(),next,state.options.selectionMode);
    selectionLease=lease;
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
      if(!sourceInfo())throw new Error('請先 Alt/Option 點擊設定來源');
      return cloneStamp(image,{...common,sourcePoint:state.stroke?.sourceStart?{x:state.stroke.sourceStart.x+point.x-state.stroke.start.x,y:state.stroke.sourceStart.y+point.y-state.stroke.start.y}:state.sourcePoint});
    }
    if(tool==='patternStamp'){
      if(!state.patternImage)throw new Error('請先載入 Pattern image');
      return patternStamp(image,{...common,pattern:state.patternImage,origin:{x:0,y:0}});
    }
    if(tool==='healingBrush'){
      if(!sourceInfo())throw new Error('請先 Alt/Option 點擊設定來源');
      return healingBrush(image,{...common,sourcePoint:state.stroke?.sourceStart?{x:state.stroke.sourceStart.x+point.x-state.stroke.start.x,y:state.stroke.sourceStart.y+point.y-state.stroke.start.y}:state.sourcePoint});
    }
    if(tool==='spotHealing')return spotHealing(image,{...common,neighborRadius:2});
    if(tool==='smudge')return smudge(image,{...common,previousPoint:state.stroke?.last||point});
    if(tool==='dodge')return dodge(image,{...common});
    if(tool==='burn')return burn(image,{...common});
    if(tool==='sponge')return sponge(image,{...common,mode:state.options.spongeMode});
    if(tool==='localBlur')return localBlur(image,{...common,radius:2});
    if(tool==='localSharpen')return localSharpen(image,{...common,radius:2,amount:state.options.strength*2});
    if(tool==='colorReplacement')return colorReplacementBrush(image,{...common,replacementColor:state.options.replacementColor,tolerance:state.options.tolerance});
    return image;
  }

  function pointerDown(event){
    if(!state.tool||!UI_B_RASTER_TOOL_IDS.has(state.tool)||app.spaceDown||(event.button!=null&&event.button!==0))return false;
    const target=requireRaster();if(!target)return true;
    const point=pointForEvent(event,target);if(!point)return true;
    event.preventDefault();event.stopImmediatePropagation();
    app.el.canvas.setPointerCapture?.(event.pointerId);

    try{
      if(['cloneStamp','healingBrush'].includes(state.tool)&&event.altKey){
        sourceLease=captureSelectionTarget(target);state.sourcePoint={x:point.x,y:point.y};app.toast('來源點已設定');notify();return true;
      }
      if(state.tool==='magicWand'){setSelection(magicWandSelection(target.image,{x:point.x,y:point.y,tolerance:state.options.tolerance,contiguous:state.options.contiguous}));return true;}
      if(state.tool==='rectangleMarquee'||state.tool==='ellipseMarquee'){
        const lease=captureSelectionTarget(target);if(!selectionTargetValid(target,lease))throw Error('Select one unlocked visible RGB image');
        const start={x:clamp(point.local.x/target.found.object.w*target.image.width,0,target.image.width),y:clamp(point.local.y/target.found.object.h*target.image.height,0,target.image.height)};
        state.drag={type:'marquee',pointerId:event.pointerId,target,lease,start,current:start,ellipse:state.tool==='ellipseMarquee'};notify();return true;
      }
      if(state.tool==='quickSelection'){setSelection(quickSelection(target.image,{samples:[{x:point.x,y:point.y}],tolerance:state.options.tolerance,edgeThreshold:state.options.edgeThreshold,initialSelection:state.options.selectionMode==='add'?state.selection:null}));return true;}
      if(state.tool==='objectSelection'){setSelection(objectSelection(target.image,{seed:{x:point.x,y:point.y},colorThreshold:state.options.tolerance,edgeThreshold:state.options.edgeThreshold,alphaThreshold:1,minComponentSize:1}));return true;}
      if(state.tool==='polygonalLasso'||state.tool==='magneticLasso'){
        if(!selectionTargetValid(target,polygonLease)){state.polygonPoints=[];polygonLease=captureSelectionTarget(target);}
        const last=state.polygonPoints.at(-1);
        if(!last||last.x!==point.x||last.y!==point.y)state.polygonPoints.push({x:point.x,y:point.y});
        if(event.detail>=2&&state.polygonPoints.length>=3)finishPolygon();else{app.toast('加入節點；Enter 或雙擊完成');notify();}
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
        state.drag={type:'gradient',pointerId:event.pointerId,target,lease:captureSelectionTarget(target),start:{x:point.x,y:point.y},current:{x:point.x,y:point.y}};notify();return true;
      }
      if(state.tool==='patch'){
        const mask=selection();if(!mask?.alpha?.some(a=>a>0))throw Error('請先建立修補選區，再拖曳至來源');
        if(!mask.alpha[Math.floor(point.y)*mask.width+Math.floor(point.x)])throw Error('請從修補選區內開始拖曳');
        state.drag={type:'patch',pointerId:event.pointerId,target,lease:captureSelectionTarget(target),start:point,current:point,mask};notify();return true;
      }
      if(state.tool==='smudge'){
        state.stroke={pointerId:event.pointerId,target,lease:captureSelectionTarget(target),tool:state.tool,start:point,last:point,changed:false};return true;
      }
      const image=applyRetouch(state.tool,target,point);
      app.history.begin('Raster '+state.tool,{targets:[app.objectPath(target.found)]});
      writeRaster(target,image);
      state.stroke={pointerId:event.pointerId,target,lease:captureSelectionTarget(target),sourceStart:sourceInfo(),start:point,tool:state.tool,last:{x:point.x,y:point.y},changed:true};
      app.renderer.render();notify();return true;
    }catch(error){app.toast(error.message||'Raster tool failed',3000);return true;}finally{if(!state.drag&&!state.stroke)try{app.el.canvas.releasePointerCapture?.(event.pointerId)}catch{}}
  }

  function pointerMove(event){
    if(state.polygonPoints.length){selectionPreview();const p=pointForEvent(event);if(p)state.polygonCursor=p;}

    if(state.drag?.pointerId===event.pointerId&&state.drag.type==='marquee'){
      event.preventDefault();event.stopImmediatePropagation();
      if(!selectionTargetValid(selectedRaster(),state.drag.lease)){cancelActiveInteraction();return true;}
      const p=pointForEvent(event,state.drag.target),t=state.drag.target;
      if(p)state.drag.current={x:clamp(p.local.x/t.found.object.w*t.image.width,0,t.image.width),y:clamp(p.local.y/t.found.object.h*t.image.height,0,t.image.height)};
      return true;
    }
    if(state.drag?.pointerId===event.pointerId&&['gradient','patch'].includes(state.drag.type)){
      if(!selectionTargetValid(selectedRaster(),state.drag.lease)){cancelActiveInteraction();return true;}
      const point=pointForEvent(event,state.drag.target);if(point)state.drag.current={x:point.x,y:point.y};return true;
    }
    if(state.stroke?.pointerId!==event.pointerId||!event.buttons)return false;
    event.preventDefault();event.stopImmediatePropagation();
    const target=selectedRaster();if(!selectionTargetValid(target,state.stroke.lease)){cancelActiveInteraction();return true;}
    const point=pointForEvent(event,target);if(!point)return true;
    if(point.x===state.stroke.last.x&&point.y===state.stroke.last.y)return true;
    try{
      const image=applyRetouch(state.stroke.tool,target,point);
      if(!state.stroke.changed)app.history.begin('Raster '+state.stroke.tool,{targets:[app.objectPath(target.found)]});
      writeRaster(target,image);state.stroke.target=target;state.stroke.last={x:point.x,y:point.y};state.stroke.changed=true;app.renderer.render();
    }catch(error){app.toast(error.message||'Raster tool failed',2500);}
    return true;
  }

  function pointerUp(event,cancelled=false){
    if(state.drag?.pointerId===event.pointerId){
      event.preventDefault();event.stopImmediatePropagation();
      const drag=state.drag;state.drag=null;
      if(drag.type==='marquee'){
        if(!cancelled&&selectionTargetValid(selectedRaster(),drag.lease)){
          const p=pointForEvent(event,drag.target),t=drag.target;
          if(p)drag.current={x:clamp(p.local.x/t.found.object.w*t.image.width,0,t.image.width),y:clamp(p.local.y/t.found.object.h*t.image.height,0,t.image.height)};
          const next=createMarqueeSelection(t.image.width,t.image.height,drag.start,drag.current,drag.ellipse);
          if(next)setSelection(next,t);else clearSelection();
        }
        try{app.el.canvas.releasePointerCapture?.(event.pointerId);}catch{}
        notify();return true;
      }
      try{app.el.canvas.releasePointerCapture?.(event.pointerId)}catch{}
      if(drag.type==='patch'){
        if(!cancelled&&selectionTargetValid(selectedRaster(),drag.lease)){
          const p=pointForEvent(event,drag.target)||drag.current,dx=Math.round(p.x-drag.start.x),dy=Math.round(p.y-drag.start.y);
          if(dx||dy){
            const m=drag.mask;let x0=m.width,y0=m.height,x1=0,y1=0;
            for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++)if(m.alpha[y*m.width+x]){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);}
            // Keep source and destination geometry equal when the source meets an edge.
            const x=Math.max(x0,-dx),y=Math.max(y0,-dy),w=Math.min(x1,m.width-dx)-x,h=Math.min(y1,m.height-dy)-y;
            if(w>0&&h>0)commitOne('Patch',drag.target,patchRaster(drag.target.image,{sourceRegion:{x:x+dx,y:y+dy,w,h},targetRegion:{x,y,w,h},opacity:state.options.opacity,feather:state.options.feather}));
          }
        }
        notify();return true;
      }
      if(!cancelled&&selectionTargetValid(selectedRaster(),drag.lease)){
        const stops=[{offset:0,color:state.options.gradientStart},{offset:1,color:state.options.gradientEnd}];
        const fill=gradientFill(drag.target.image.width,drag.target.image.height,{type:state.options.gradientType,stops,start:drag.start,end:drag.current,center:drag.start,radius:Math.hypot(drag.current.x-drag.start.x,drag.current.y-drag.start.y),opacity:state.options.opacity});
        commitOne('Gradient Fill',drag.target,fill);
      }
      notify();return true;
    }
    if(state.stroke?.pointerId===event.pointerId){
      event.preventDefault();event.stopImmediatePropagation();
      const valid=selectionTargetValid(selectedRaster(),state.stroke.lease),changed=state.stroke.changed;state.stroke=null;
      try{app.el.canvas.releasePointerCapture?.(event.pointerId)}catch{}
      cancelled=cancelled||!valid;
      if(cancelled||!changed){if(changed)app.history.cancel({restore:true});}else{app.history.commit();app.markDirty?.();}
      app.renderer.render();notify();return true;
    }
    return false;
  }

  function cancelActiveInteraction({restore=true}={}){
    const pointerId=state.stroke?.pointerId??state.drag?.pointerId??null;
    const hadStroke=Boolean(state.stroke),hadInteraction=hadStroke||Boolean(state.drag)||Boolean(state.polygonPoints.length);
    if(state.stroke?.changed)app.history.cancel({restore:Boolean(restore)});
    state.stroke=null;state.drag=null;state.polygonPoints=[];polygonLease=null;
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
  function refineSelection(options={}){if(!selection())throw new Error('INK_UI_B_SELECTION_REQUIRED');state.selection=refineRasterSelection(state.selection,options);notify();return state.selection;}
  function options(){return{...state.options};}
  function activeTool(){return state.tool;}

  return{state,sourceInfo,resetSource,finishPolygon,removePolygonPoint,setTool,clearTool,cancelActiveInteraction,setOption,setPattern,selection,clearSelection,selectionPreview,options,activeTool,selectedRaster,pointForEvent,pointerDown,pointerMove,pointerUp,refineSelection};
}

