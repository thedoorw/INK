import { createRasterToolController, UI_B_RASTER_TOOL_IDS } from '../../../ui/capability-raster-tools.js';
import { bindUiB002RasterPointerEvents, createUiB002ToolRuntime } from './ui-b-002-tools-runtime.js';

async function imageDataFromPatternFile(file){
  if(!file||!String(file.type||'').startsWith('image/'))throw new TypeError('INK_UI_B_002_PATTERN_FILE_INVALID');
  if(typeof createImageBitmap!=='function')throw new Error('INK_UI_B_002_PATTERN_BITMAP_UNAVAILABLE');
  const bitmap=await createImageBitmap(file),max=256,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context){bitmap.close?.();throw new Error('INK_UI_B_002_PATTERN_CONTEXT_UNAVAILABLE');}
  context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
  return context.getImageData(0,0,canvas.width,canvas.height);
}

export function createUiB002ToolsAdapter(app,{notify=()=>{},commands=app?.commands}={}){
  if(!app)throw new TypeError('INK_UI_B_002_NATIVE_APP_REQUIRED');
  const raster=createRasterToolController(app,{onStateChange:()=>notify('raster-state')});
  const runtime=createUiB002ToolRuntime(app,{raster,isRasterTool:tool=>UI_B_RASTER_TOOL_IDS.has(tool),commands,notify});
  const releasePointer=bindUiB002RasterPointerEvents(app.el?.canvas,raster);
  let disposed=false;
  const loadPatternFile=async file=>runtime.setPatternImage(await imageDataFromPatternFile(file),file?.name||'Pattern');
  const rasterSelection=()=>raster.selection();
  const refineSelection=options=>raster.refineSelection(options||{});
  const dispose=()=>{if(disposed)return false;disposed=true;releasePointer();runtime.dispose();return true;};
  return Object.freeze({...runtime,schema:'INK-UI-B-002-NATIVE-TOOLS',version:2,loadPatternFile,rasterSelection,refineSelection,dispose});
}
