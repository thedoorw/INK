const PPI_VALUES=Object.freeze([72,96,150,300,600]);
const MM_PER_INCH=25.4;
const UNITS=new Set(['mm','cm','in','px']);
const PRESETS=Object.freeze({A4:Object.freeze({id:'A4',label:'A4',width:210,height:297,units:'mm',ppi:300})});

const finite=value=>Number.isFinite(Number(value));
const round=value=>Math.round(Number(value)*10000)/10000;

export const UI_B_002_NEW_DOCUMENT_PRESETS=PRESETS;
export const UI_B_002_NEW_DOCUMENT_PPI=PPI_VALUES;

export function dimensionToMm(value,units,ppi){
  const n=Number(value);
  if(!finite(n)||n<=0)throw Object.assign(new Error('Document dimension must be positive'),{code:'ARGUMENTS_INVALID'});
  if(units==='mm')return n;
  if(units==='cm')return n*10;
  if(units==='in')return n*MM_PER_INCH;
  if(units==='px')return n*MM_PER_INCH/ppi;
  throw Object.assign(new Error('Document units invalid'),{code:'ARGUMENTS_INVALID'});
}

export function normalizeNewDocumentRequest(args={}){
  if(args==null||typeof args!=='object'||Array.isArray(args))throw Object.assign(new Error('New document arguments invalid'),{code:'ARGUMENTS_INVALID'});
  if(!Object.keys(args).length)return null;
  const presetId=String(args.preset||'A4');
  const preset=PRESETS[presetId]||PRESETS.A4;
  const units=String(args.units||preset.units);
  if(!UNITS.has(units))throw Object.assign(new Error('Document units invalid'),{code:'ARGUMENTS_INVALID'});
  const ppi=Number(args.ppi??preset.ppi);
  if(!PPI_VALUES.includes(ppi))throw Object.assign(new Error('Document PPI unsupported'),{code:'ARGUMENTS_INVALID',supportedPpi:[...PPI_VALUES]});
  const orientation=args.orientation==='landscape'?'landscape':'portrait';
  let width=Number(args.width??preset.width),height=Number(args.height??preset.height);
  if(!finite(width)||!finite(height)||width<=0||height<=0)throw Object.assign(new Error('Document dimensions invalid'),{code:'ARGUMENTS_INVALID'});
  let widthMm=dimensionToMm(width,units,ppi),heightMm=dimensionToMm(height,units,ppi);
  if(widthMm<10||heightMm<10||widthMm>5000||heightMm>5000)throw Object.assign(new Error('Document dimensions outside native artboard bounds'),{code:'ARGUMENTS_INVALID'});
  if((orientation==='portrait'&&widthMm>heightMm)||(orientation==='landscape'&&widthMm<heightMm)){
    [widthMm,heightMm]=[heightMm,widthMm];
    [width,height]=[height,width];
  }
  return Object.freeze({
    preset:presetId==='A4'?'A4':'custom',sourceUnits:units,width:round(width),height:round(height),ppi,orientation,
    artboard:Object.freeze({preset:'A4',orientation,widthMm:round(widthMm),heightMm:round(heightMm),ppi,unit:units==='px'?'px':'mm'})
  });
}
