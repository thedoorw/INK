const PPI_VALUES=Object.freeze([72,96,150,300,600]);
const MM_PER_INCH=25.4;
const UNITS=new Set(['mm','cm','in','px']);
const PRESET=Object.freeze({id:'A4',width:210,height:297,units:'mm',ppi:300});
const finite=value=>Number.isFinite(Number(value));
const round=value=>Math.round(Number(value)*10000)/10000;

function dimensionToMm(value,units,ppi){
  const n=Number(value);
  if(!finite(n)||n<=0)throw Object.assign(new Error('Document dimension must be positive'),{code:'ARGUMENTS_INVALID'});
  if(units==='mm')return n;if(units==='cm')return n*10;if(units==='in')return n*MM_PER_INCH;if(units==='px')return n*MM_PER_INCH/ppi;
  throw Object.assign(new Error('Document units invalid'),{code:'ARGUMENTS_INVALID'});
}
export function normalizeNewDocumentRequest(args={}){
  if(args==null||typeof args!=='object'||Array.isArray(args))throw Object.assign(new Error('New document arguments invalid'),{code:'ARGUMENTS_INVALID'});
  if(!Object.keys(args).length)return null;
  const units=String(args.units||PRESET.units);if(!UNITS.has(units))throw Object.assign(new Error('Document units invalid'),{code:'ARGUMENTS_INVALID'});
  const ppi=Number(args.ppi??PRESET.ppi);if(!PPI_VALUES.includes(ppi))throw Object.assign(new Error('Document PPI unsupported'),{code:'ARGUMENTS_INVALID',supportedPpi:[...PPI_VALUES]});
  const orientation=args.orientation==='landscape'?'landscape':'portrait';
  let width=Number(args.width??PRESET.width),height=Number(args.height??PRESET.height);
  if(!finite(width)||!finite(height)||width<=0||height<=0)throw Object.assign(new Error('Document dimensions invalid'),{code:'ARGUMENTS_INVALID'});
  let widthMm=dimensionToMm(width,units,ppi),heightMm=dimensionToMm(height,units,ppi);
  if(widthMm<10||heightMm<10||widthMm>5000||heightMm>5000)throw Object.assign(new Error('Document dimensions outside native artboard bounds'),{code:'ARGUMENTS_INVALID'});
  if((orientation==='portrait'&&widthMm>heightMm)||(orientation==='landscape'&&widthMm<heightMm)){[widthMm,heightMm]=[heightMm,widthMm];[width,height]=[height,width];}
  const preset=String(args.preset||'A4')==='A4'&&round(widthMm)===210&&round(heightMm)===297?'A4':'custom';
  return Object.freeze({preset,sourceUnits:units,width:round(width),height:round(height),ppi,orientation,artboard:Object.freeze({preset:preset==='A4'?'A4':'custom',orientation,widthMm:round(widthMm),heightMm:round(heightMm),ppi,unit:units==='px'?'px':'mm'})});
}
export function createUiB002DocumentAdapter(app){
  if(!app)throw new TypeError('INK_UI_B_002_DOCUMENT_APP_REQUIRED');
  return Object.freeze({newDocument(args={}){const spec=normalizeNewDocumentRequest(args);const nativeResult=app.newDocument?.(spec?{artboard:spec.artboard}:{});return{changed:nativeResult?.changed===true,result:{documentId:app.doc?.id||null,title:app.doc?.title||null,cancelled:Boolean(nativeResult?.cancelled),spec:spec||null}};}});
}
