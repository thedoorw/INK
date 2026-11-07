function selectedRaster(app,api){
  const found=app.selectedObjects?.().find(item=>item.object?.type==='image'&&item.object?.rasterState?.colorRaster);
  if(!found)return null;
  return{found,raster:api.deserializeColorRaster(found.object.rasterState.colorRaster)};
}
function refresh(app){app.spatialDirty=true;app.renderer?.studioImageCache?.clear?.();app.renderer?.studioLayerCache?.clear?.();app.refreshAll?.();app.renderer?.render?.();}
function targetPath(app,found){return app.objectPath?.(found)||null;}
function requireSelected(app,api){const target=selectedRaster(app,api);if(!target)throw Object.assign(new Error('請先選取含 Raster State 的影像'),{code:'TARGET_NOT_FOUND'});return target;}
function rgbaToSerialized(result,api){
  const rgb=new Uint8Array(result.width*result.height*3),alpha=new Uint8Array(result.width*result.height);
  for(let i=0;i<result.width*result.height;i++){rgb[i*3]=result.data[i*4];rgb[i*3+1]=result.data[i*4+1];rgb[i*3+2]=result.data[i*4+2];alpha[i]=result.data[i*4+3];}
  return api.serializeColorRaster(api.createColorRaster({width:result.width,height:result.height,bitDepth:8,colorMode:'RGB',data:rgb,alpha}));
}
function convertRasterMode(serialized,targetMode,api){
  const source=api.deserializeColorRaster(serialized);if(source.colorMode===targetMode)return serialized;
  if(targetMode==='Multichannel')throw Object.assign(new Error('Multichannel conversion requires explicit channel construction'),{code:'CAPABILITY_UNAVAILABLE'});
  if(!['RGB','CMYK','Lab'].includes(source.colorMode)||!['RGB','CMYK','Lab'].includes(targetMode))throw Object.assign(new Error('Unsupported color-mode conversion'),{code:'CAPABILITY_UNAVAILABLE'});
  const out=api.createColorRaster({width:source.width,height:source.height,bitDepth:source.bitDepth,colorMode:targetMode});
  for(let index=0;index<source.width*source.height;index++){
    const values=Array.from({length:source.channelCount},(_,channel)=>api.readNormalizedSample(source,index,channel));
    const converted=api.convertColor(values,source.colorMode,targetMode);
    for(let channel=0;channel<out.channelCount;channel++)api.writeNormalizedSample(out,index,channel,converted[channel]??0);
  }
  if(source.alpha&&out.alpha)out.alpha.set(source.alpha);return api.serializeColorRaster(out);
}

export function createUiB002ImageRuntime(app,api){
  if(!app||!api)throw new TypeError('INK_UI_B_002_IMAGE_RUNTIME_REQUIRED');
  const selectedInfo=()=>{const target=selectedRaster(app,api);return target?{width:target.raster.width,height:target.raster.height,bitDepth:target.raster.bitDepth,colorMode:target.raster.colorMode,name:target.found.object.name||null}:null;};
  const resize=({width,height}={})=>{
    const target=requireSelected(app,api),preview=api.colorRasterToRgba8(target.found.object.rasterState.colorRaster,{icc:target.found.object.rasterState.icc?.bytes||null});
    if(preview.status!=='ok'||target.raster.bitDepth!==8||target.raster.colorMode!=='RGB')throw Object.assign(new Error('目前影像尺寸只支援 8-bit RGB Raster'),{code:'CAPABILITY_UNAVAILABLE'});
    const w=Math.floor(Number(width)),h=Math.floor(Number(height));if(!(w>=1&&h>=1))throw Object.assign(new Error('影像尺寸無效'),{code:'ARGUMENTS_INVALID'});
    const result=api.resizeImageData(preview.imageData,w,h);app.history.pushScoped('Image Resize',[targetPath(app,target.found)],()=>{target.found.object.rasterState.colorRaster=rgbaToSerialized(result,api);target.found.object.w=w;target.found.object.h=h;});refresh(app);return{changed:true,result:{width:w,height:h}};
  };
  const crop=({x=0,y=0,w,h}={})=>{
    const target=requireSelected(app,api),preview=api.colorRasterToRgba8(target.found.object.rasterState.colorRaster,{icc:target.found.object.rasterState.icc?.bytes||null});
    if(preview.status!=='ok'||target.raster.bitDepth!==8||target.raster.colorMode!=='RGB')throw Object.assign(new Error('目前裁切只支援 8-bit RGB Raster'),{code:'CAPABILITY_UNAVAILABLE'});
    const result=api.cropImageData(preview.imageData,{x:Number(x),y:Number(y),w:Number(w)||target.raster.width,h:Number(h)||target.raster.height});app.history.pushScoped('Crop Image',[targetPath(app,target.found)],()=>{target.found.object.rasterState.colorRaster=rgbaToSerialized(result,api);target.found.object.w=result.width;target.found.object.h=result.height;});refresh(app);return{changed:true,result:{width:result.width,height:result.height}};
  };
  const setBitDepth=({depth}={})=>{const target=requireSelected(app,api),value=Number(depth);if(![8,16,32].includes(value))throw Object.assign(new Error('Bit depth invalid'),{code:'ARGUMENTS_INVALID'});app.history.pushScoped('Bit Depth '+value,[targetPath(app,target.found),['colorState']],()=>{target.found.object.rasterState.colorRaster=api.serializeColorRaster(api.convertBitDepth(api.deserializeColorRaster(target.found.object.rasterState.colorRaster),value));app.doc.colorState={...(app.doc.colorState||{}),bitDepth:value};});refresh(app);return{changed:true,result:{bitDepth:value}};};
  const setColorMode=({mode}={})=>{const target=requireSelected(app,api),value=String(mode||'');if(!['RGB','CMYK','Lab'].includes(value))throw Object.assign(new Error('Color mode invalid'),{code:'ARGUMENTS_INVALID'});app.history.pushScoped('Color Mode '+value,[targetPath(app,target.found),['colorState']],()=>{target.found.object.rasterState.colorRaster=convertRasterMode(target.found.object.rasterState.colorRaster,value,api);app.doc.colorState={...(app.doc.colorState||{}),colorMode:value};});refresh(app);return{changed:true,result:{colorMode:value}};};
  return Object.freeze({schema:'INK-UI-B-002-IMAGE-RUNTIME',version:1,selectedInfo,resize,crop,setBitDepth,setColorMode});
}
