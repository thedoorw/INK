import {dev1RasterAvailability,activateDev1RasterTool,dev1RasterActiveKey} from './raster-session.js';
// DEV1 slice: descriptive data only. No shell/menu/selection state authority.
// The UR registry renders only entries with capability === 'native' after checking the live host.
const svgPaths=Object.freeze({
 select:'<path d="M5 4l7 15 2.2-6 5.8-2z"/>',
 rectangle:'<rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3 2"/>',
 ellipse:'<ellipse cx="12" cy="12" rx="8" ry="7" stroke-dasharray="3 2"/>',
 lasso:'<path d="M5 11c0-4 3-7 7-7s7 3 7 7-3 6-7 6-7-2-7-6z"/><path d="M11 17c0 3 1 4 4 4"/>',
 polygon:'<path d="M4 8l7-4 9 6-5 10-10-2z" stroke-dasharray="3 2"/>',
 magnetic:'<path d="M4 6h5v6l6 6 5-4"/><path d="M14 6v6m-3-3h6"/>',
 wand:'<path d="M5 19L18 6M16 3v4M20 7h-4M18 10v4M12 3l2 2"/>',
 pen:'<path d="M4 19l4-1 11-11-3-3L5 15zM14 6l3 3M4 20h7"/>',
 pencil:'<path d="M4 20l4-1 12-12-4-4L4 15zM14 5l4 4M5 15l4 4"/>',
 marker:'<path d="M4 19l5-1 11-11-4-4L5 14zM12 7l4 4M3 21h9"/>',
 brush:'<path d="M4 20c5 0 6-2 6-5l8-8-3-3-8 8c-3 0-5 1-5 6 0 1 1 2 2 2z"/>',
 airbrush:'<path d="M4 10h10l4-3v9l-4-3H4zM10 13v5h4M20 6h1M21 10h1M20 14h1M19 18h1"/>',
 eraser:'<path d="M4 16l8-10 8 7-6 7H8z"/>'
});
export function dev1Icon(key){
 const paths=svgPaths[key];
 if(!paths)throw new RangeError('Unknown DEV1 icon: '+key);
 return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
}
const item=(key,label,nativeTool=null,notes='',raster=false)=>Object.freeze({
 key,label,nativeTool,capability:raster?'raster':nativeTool?'native':'gap',notes,
 icon:dev1Icon(key)
});
export const DEV1_GROUPS=Object.freeze([
 Object.freeze({row:1,key:'select',label:'選取／移動',items:Object.freeze([item('select','選取／移動','select','Object selection and native transform')])}),
 Object.freeze({row:2,key:'marquee',label:'選框',items:Object.freeze([
  item('rectangle','矩形像素選框',null,'Native Select can rectangle-select objects, not raster pixels'),
  item('ellipse','橢圓像素選框',null,'No verified canvas gesture / raster selection lifecycle')])}),
 Object.freeze({row:3,key:'lasso',label:'套索',items:Object.freeze([
  item('lasso','自由套索（物件）','lasso','Native freeform object selection, not pixel mask'),
  item('polygon','多邊形像素套索','polygonalLasso','Existing UI-B raster pointerDown: clicks add anchors, double-click completes temporary alpha mask; no History or overlay',true),
  item('magnetic','磁性像素套索','magneticLasso','Existing UI-B magneticLasso pointer route; temporary mask, no overlay/History',true)])}),
 Object.freeze({row:4,key:'wand',label:'魔術棒',items:Object.freeze([
  item('wand','魔術棒','magicWand','Existing UI-B magicWand pointer route, selected RGB8 image only; alpha mask is controller-local',true)])}),
 Object.freeze({row:7,key:'drawing',label:'繪圖',items:Object.freeze([
  item('pen','手繪筆','pen'),item('pencil','鉛筆','pencil'),
  item('marker','麥克筆','marker'),item('brush','筆刷','brush'),
  item('airbrush','噴槍','airbrush')])}),
 Object.freeze({row:10,key:'eraser',label:'橡皮擦',items:Object.freeze([
  item('eraser','橡皮擦','eraser','Actual radius follows lastDrawTool size; segment erase applies to strokes')])})
]);
const itemMap=new Map(DEV1_GROUPS.flatMap(group=>group.items.map(tool=>[tool.key,tool])));
export const DEV1_NATIVE_KEYS=Object.freeze([...itemMap.values()].filter(tool=>tool.capability==='native').map(tool=>tool.key));
export const DEV1_RASTER_KEYS=Object.freeze([...itemMap.values()].filter(tool=>tool.capability==='raster').map(tool=>tool.key));
export const DEV1_CONTEXT_KEYS=Object.freeze([...DEV1_NATIVE_KEYS,...DEV1_RASTER_KEYS]);
export function getDev1Tool(key){return itemMap.get(key)||null;}
export function getDev1Availability(key,host,snapshot=host?.getSnapshot?.()){
 const tool=itemMap.get(key);
 if(!tool)return {available:false,reason:'UNKNOWN_TOOL'};
 if(tool.capability==='gap')return {available:false,reason:'NATIVE_INTERACTION_GAP'};
 if(tool.capability==='raster')return dev1RasterAvailability(host,key);
 if(!snapshot?.docs?.length)return {available:false,reason:'NO_DOCUMENT'};
 if(host?.app?.history?.pending||host?.app?.interaction)return {available:false,reason:'INTERACTION_BUSY'};
 return {available:!!host?.dispatch,reason:host?.dispatch?null:'NATIVE_HOST_UNAVAILABLE'};
}
export function activateDev1Tool(key,host){
 const availability=getDev1Availability(key,host);
 if(!availability.available)return {ok:false,changed:false,error:{code:availability.reason,message:availability.reason}};
 if(itemMap.get(key).capability==='raster')return activateDev1RasterTool(host,key);
 const result=host.dispatch({type:'tool.set',value:itemMap.get(key).nativeTool,source:'rail.dev1'});
 return result||{ok:false,changed:false,error:{code:'NATIVE_RESULT_MISSING'}};
}
export function dev1ActiveKey(snapshot,host){
 const raster=host&&dev1RasterActiveKey(host);
 if(raster)return raster;
 return DEV1_NATIVE_KEYS.includes(snapshot?.tool)?snapshot.tool:null;
}
