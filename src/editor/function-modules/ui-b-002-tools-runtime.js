const DRAW_TOOLS=new Set(['pen','pencil','marker','brush','airbrush']);
const TEXT_DIRECTIONS=new Set(['horizontal-tb','vertical-rl','vertical-lr']);
const hex=value=>/^#[0-9a-f]{6}$/i.test(String(value||''));

export function bindUiB002RasterPointerEvents(canvas,raster){
  if(!canvas?.addEventListener||!raster)return()=>false;
  const bindings=[];
  const bind=(type,handler)=>{canvas.addEventListener(type,handler,true);bindings.push(()=>canvas.removeEventListener(type,handler,true));};
  bind('pointerdown',event=>raster.pointerDown(event));
  bind('pointermove',event=>raster.pointerMove(event));
  bind('pointerup',event=>raster.pointerUp(event,false));
  bind('pointercancel',event=>raster.pointerUp(event,true));
  let active=true;
  return()=>{if(!active)return false;active=false;for(const off of bindings.splice(0))off();return true;};
}

export function createUiB002ToolRuntime(app,{raster,isRasterTool=()=>false,commands=app?.commands,notify=()=>{}}={}){
  if(!app||!raster)throw new TypeError('INK_UI_B_002_TOOL_RUNTIME_REQUIRED');
  const listeners=new Set();
  let disposed=false;
  const announce=reason=>{if(disposed)return;notify(reason);for(const fn of [...listeners]){try{fn(reason);}catch{}}};
  const cancelRaster=reason=>{
    if(!raster.activeTool?.())return false;
    raster.cancelActiveInteraction?.({restore:true,reason});
    raster.clearTool?.({restore:false,reason});
    announce(reason||'raster-exit');
    return true;
  };
  const executeNative=tool=>{
    const response=commands?.execute?.('tool.activate.v1',{tool},'human-ui');
    if(response===undefined){const before=app.tool;app.setTool?.(tool);return{ok:true,changed:before!==app.tool,result:{tool:app.tool}};}
    return response;
  };
  const activeTool=()=>{
    const rasterTool=raster.activeTool?.();
    if(rasterTool)return rasterTool;
    if(app.tool==='shape')return `shape:${app.shapeType||'line'}`;
    if(app.tool==='text')return `text:${app.uiBTextMode||'horizontal-tb'}`;
    return app.tool||null;
  };
  const activate=tool=>{
    if(disposed)throw new Error('INK_UI_B_002_TOOL_RUNTIME_DISPOSED');
    const before=activeTool(),id=String(tool||'');
    if(isRasterTool(id)){
      if(raster.activeTool?.()!==id)raster.cancelActiveInteraction?.({restore:true,reason:'raster-switch'});
      internalRasterSelect++;
      try{raster.setTool(id);}finally{internalRasterSelect=Math.max(0,internalRasterSelect-1);}
      announce('raster-tool');
      return{ok:true,changed:before!==activeTool(),result:{tool:activeTool()}};
    }
    cancelRaster('native-tool');
    if(id.startsWith('shape:')){app.shapeType=id.slice(6)||'line';const result=executeNative('shape');announce('shape-tool');return result;}
    if(id.startsWith('text:')){const direction=id.slice(5);if(!TEXT_DIRECTIONS.has(direction))throw new TypeError('INK_UI_B_002_TEXT_DIRECTION_INVALID');app.uiBTextMode=direction;const result=executeNative('text');announce('text-tool');return result;}
    const result=executeNative(id);announce('native-tool');return result;
  };
  let internalRasterSelect=0;
  const reconcile=event=>{
    if(disposed||internalRasterSelect||!raster.activeTool?.())return;
    const toolCommand=event?.type==='command'&&event.commandId==='tool.activate.v1';
    const toolRefresh=event?.type==='state'&&event.reason==='refreshToolUI';
    if(toolCommand||toolRefresh)cancelRaster('external-native-tool');
  };
  const offCommands=commands?.subscribe?.(reconcile)||null;
  const drawingTool=()=>DRAW_TOOLS.has(app.tool)?app.tool:(app.lastDrawTool||'pen');
  const colors=()=>({foreground:app.toolSettings?.[drawingTool()]?.color||'#202020',background:app.backgroundColor||'#ffffff'});
  const setBackgroundColor=value=>{if(!hex(value))throw new TypeError('INK_UI_B_002_BACKGROUND_COLOR_INVALID');const before=app.backgroundColor;app.backgroundColor=String(value).toLowerCase();announce('background-color');return{changed:before!==app.backgroundColor,background:app.backgroundColor};};
  const swapColors=()=>{const current=colors(),before=current.foreground;app.setColor?.(current.background,true);app.backgroundColor=before;announce('swap-colors');return colors();};
  const resetColors=()=>{app.setColor?.('#000000',true);app.backgroundColor='#ffffff';announce('reset-colors');return colors();};
  const setRasterOption=(key,value)=>{raster.setOption?.(key,value);return raster.options?.()||{};};
  const setTextDirection=value=>{if(!TEXT_DIRECTIONS.has(value))throw new TypeError('INK_UI_B_002_TEXT_DIRECTION_INVALID');app.uiBTextMode=value;announce('text-direction');return value;};
  const setPatternImage=(imageData,name='Pattern')=>{raster.setPattern?.(imageData,name);announce('pattern-image');return{loaded:true,name,width:imageData?.width||0,height:imageData?.height||0};};
  const patternInfo=()=>({loaded:Boolean(raster.state?.patternImage),name:raster.state?.patternName||null});
  const subscribe=listener=>{if(typeof listener!=='function')return()=>false;listeners.add(listener);return()=>listeners.delete(listener);};
  const dispose=()=>{if(disposed)return false;disposed=true;try{offCommands?.();}catch{};try{raster.cancelActiveInteraction?.({restore:true,reason:'dispose'});}catch{};try{raster.clearTool?.({restore:false,reason:'dispose'});}catch{};listeners.clear();return true;};
  return Object.freeze({schema:'INK-UI-B-002-TOOL-RUNTIME',version:2,activeTool,activate,reconcile,drawingTool,rasterOptions:()=>raster.options?.()||{},setRasterOption,textDirection:()=>app.uiBTextMode||'horizontal-tb',setTextDirection,colors,setBackgroundColor,swapColors,resetColors,setPatternImage,patternInfo,subscribe,dispose});
}
