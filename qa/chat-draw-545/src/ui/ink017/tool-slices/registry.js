import {DEV1_GROUPS,getDev1Availability,activateDev1Tool,dev1ActiveKey} from './dev1/catalog.js';
import {DEV2_TOOL_GROUPS,dev2Availability,activateDev2Tool,dev2ActiveId} from './dev2/index.mjs';
import {DEV3_TOOL_GROUPS,describeDev3Tools,activateDev3Tool} from './dev3/tools-context-dev3.mjs';
import {COMPLETION_GROUPS,completionFor} from './completion-tools.js';

const vector=body=>body.startsWith('<svg')?body:'<svg viewBox="0 0 24 24" aria-hidden="true">'+(body.startsWith('<')?body:'<path d="'+body+'"/>')+'</svg>';
const variantIcon=(g,t)=>g.id==='shape'?({line:'M4 20L20 4',arrow:'M4 20L20 4M10 4h10v10',rect:'M4 4h16v16H4z',ellipse:'M20 12a8 8 0 1 1-16 0a8 8 0 0 1 16 0',triangle:'M12 4l9 16H3z'})[t.id]:g.id==='text'&&t.id==='vertical-rl'?'M5 4v16M5 12h14M19 8v8':g.icon;
// Shared completion receiver owns the three former main-group gaps. Legacy
// slice-only polygon/magnetic/source retouch gaps remain withheld separately.
export const WITHHELD_GROUPS=Object.freeze([]);
export const TOOL_GROUPS=Object.freeze([
 ...COMPLETION_GROUPS,
 ...DEV1_GROUPS.filter(g=>g.row!==3).map(g=>({id:g.key,row:g.row,label:g.label,owner:1,items:g.items.filter(t=>t.capability==='native').map(t=>({id:t.key,label:t.label,icon:vector(t.icon)}))})),
 ...DEV2_TOOL_GROUPS.map(g=>({id:g.id,row:g.row,label:g.title,owner:2,items:g.items.map(t=>({id:t.id,label:t.label,icon:vector(t.icon)}))})),
 ...DEV3_TOOL_GROUPS.map(g=>({id:g.id,row:({text:15,nodes:16,shape:17,guide:18,pan:19,zoom:20})[g.id],label:g.label,owner:3,items:(g.variants.length?g.variants:[{id:g.id,label:g.label}]).map(t=>({id:t.id,label:t.label,icon:vector(variantIcon(g,t))}))}))
].filter(g=>g.items.length).sort((a,b)=>a.row-b.row));
export function rasterGeometryAvailable(host){
 const found=host.app?.selectedObjects?.()||[];if(found.length!==1)return false;
 const f=found[0],o=f.object,m=f.worldMatrix||o?.matrix;
 return f.effectiveVisible!==false&&f.interactionExposed!==false&&f.layer?.visible!==false&&o?.w>0&&o.h>0&&m?.length===6&&Array.from(m).every(Number.isFinite)&&Math.abs(m[0]*m[3]-m[1]*m[2])>=1e-12;
}
export function toolAvailability(host,group,item){
 if(group.owner===4)return completionFor(host)?.availability(item.id)||{available:false,reason:'Tool interaction receiver is not mounted'};
 if(group.owner===1)return getDev1Availability(item.id,host);
 if(group.owner===2){const a=dev2Availability(host,item.id);return a.available&&!rasterGeometryAvailable(host)?{available:false,reason:'Select one visible image with valid geometry'}:a;}
 const descriptor=describeDev3Tools(host).find(g=>g.id===group.id);
 if(!descriptor?.enabled)return {available:false,reason:group.id==='nodes'?'Select one unlocked path or stroke':'No document'};
 if(group.id==='nodes'&&host.getSnapshot().object?.type!==item.id)return {available:false,reason:'Select a '+item.id};
 return {available:true};
}
export function activeToolContext(host){
 const completed=completionFor(host)?.activeId();
 if(completed){const group=TOOL_GROUPS.find(g=>g.owner===4&&g.items.some(t=>t.id===completed));if(group)return{group,item:group.items.find(t=>t.id===completed)};}
 const raster=dev2ActiveId(host);
 if(raster){const group=TOOL_GROUPS.find(g=>g.owner===2&&g.items.some(t=>t.id===raster));return {group,item:group.items.find(t=>t.id===raster)};}
 const node=describeDev3Tools(host).find(g=>g.id==='nodes'&&g.active);
 if(node){const group=TOOL_GROUPS.find(g=>g.id==='nodes');return {group,item:group.items.find(t=>t.id===node.activeVariant)};}
 const snapshot=host.getSnapshot(),key=dev1ActiveKey(snapshot,host);
 if(key){const group=TOOL_GROUPS.find(g=>g.owner===1&&g.items.some(t=>t.id===key));if(group)return {group,item:group.items.find(t=>t.id===key)};}
 const descriptor=describeDev3Tools(host).find(g=>g.active);
 if(descriptor){const group=TOOL_GROUPS.find(g=>g.id===descriptor.id);return {group,item:group.items.find(t=>t.id===descriptor.activeVariant)||group.items[0]};}
 return null;
}
export function activateToolContext(host,group,item){
 const available=toolAvailability(host,group,item);if(!available.available)throw Error(available.reason||'Tool unavailable');
 if(group.owner===4)return completionFor(host).activate(item.id);
 completionFor(host)?.deactivate();
 if(group.owner===1)return activateDev1Tool(item.id,host);
 if(group.owner===2)return activateDev2Tool(host,item.id);
 return activateDev3Tool(host,group.id,item.id);
}

