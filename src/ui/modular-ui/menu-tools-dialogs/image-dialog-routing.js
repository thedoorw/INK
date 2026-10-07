export function firstSelectionTarget(selection){
  return Array.isArray(selection)&&selection.length?selection[0]:null;
}

export function numericFormParams(values,{exclude=[]}={}){
  const blocked=new Set(exclude),out={};
  for(const [key,value] of Object.entries(values||{}))if(!blocked.has(key)){
    const numeric=Number(value);
    if(!Number.isFinite(numeric))throw Object.assign(new Error('Image dialog parameter invalid: '+key),{code:'ARGUMENTS_INVALID'});
    out[key]=numeric;
  }
  return out;
}

export function createImageStackCommandArgs({selection,type,values={},kind}={}){
  const target=firstSelectionTarget(selection);
  if(!target)throw Object.assign(new Error('Raster selection required'),{code:'TARGET_NOT_FOUND'});
  const opacity=Number(values.opacity??1);
  if(!Number.isFinite(opacity)||opacity<0||opacity>1)throw Object.assign(new Error('Opacity invalid'),{code:'ARGUMENTS_INVALID'});
  const params=numericFormParams(values,{exclude:['opacity']});
  if(!type)throw Object.assign(new Error('Image operation type required'),{code:'ARGUMENTS_INVALID'});
  if(kind!=='adjustment'&&kind!=='filter')throw Object.assign(new Error('Image operation kind invalid'),{code:'ARGUMENTS_INVALID'});
  return Object.freeze({type,params,opacity,targetRefs:[target]});
}

export function imageDialogCapability(ctx,kind){
  if(kind==='adjustment')return Boolean(ctx?.commands?.has?.('image.adjustment.add.v1'));
  if(kind==='filter')return Boolean(ctx?.commands?.has?.('image.filter.add.v1'));
  if(kind==='resize'||kind==='crop')return Boolean(ctx?.services?.uiBImage);
  return false;
}
