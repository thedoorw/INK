export function normalizedOptionValue(control){
  if(!control)return undefined;
  if(control.type==='checkbox')return Boolean(control.checked);
  if(control.type==='number'||control.type==='range')return Number(control.value);
  return control.value;
}

export function routeUiB002Option(ctx,{scope,key,value,drawingTool=null}={}){
  if(scope==='raster')return ctx.services.uiBTools?.setRasterOption?.(key,value);
  if(scope==='special'){
    if(key==='textDirection')return ctx.services.uiBTools?.setTextDirection?.(value);
    return undefined;
  }
  if(scope!=='core')return undefined;
  if(key==='color')return ctx.commands.execute('tool.color.set.v1',{color:value},'human-ui');
  if(['size','opacity','smoothing'].includes(key))return ctx.commands.execute('tool.setting.set.v1',{tool:drawingTool||undefined,key,value},'human-ui');
  if(key==='shape')return ctx.commands.execute('tool.shape.set.v1',{shape:value},'human-ui');
  if(key==='shapeFill')return ctx.commands.execute('tool.shape.fill.set.v1',{fill:value},'human-ui');
  if(key==='fontFamily')return ctx.commands.execute('tool.text.setting.set.v1',{key:'family',value},'human-ui');
  if(key==='fontSize')return ctx.commands.execute('tool.text.setting.set.v1',{key:'size',value},'human-ui');
  return undefined;
}
