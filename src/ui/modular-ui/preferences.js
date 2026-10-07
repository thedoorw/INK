import { UI_PREFERENCE_SCHEMA_VERSION, UI_REGION_GEOMETRY } from './contract.js';

const STORAGE_KEY='ink.modular-ui.preferences.v1';
const GROUP_TAB_IDS=Object.freeze({
  'group-a':Object.freeze(['navigator','swatches','color']),
  'group-b':Object.freeze(['character','paragraph']),
  'group-c':Object.freeze(['layers','history'])
});
const GROUP_HEIGHT_LIMITS=Object.freeze({
  'group-a':Object.freeze({min:72,max:800}),
  'group-b':Object.freeze({min:72,max:800}),
  'group-c':Object.freeze({min:96,max:1000})
});
const DEFAULT_STATE=Object.freeze({
  schemaVersion:UI_PREFERENCE_SCHEMA_VERSION,
  toolsExpanded:false,
  panelsExpanded:false,
  rulersVisible:true,
  panelWidth:UI_REGION_GEOMETRY.panelsExpanded,
  groupTabs:Object.freeze({'group-a':'navigator','group-b':'character','group-c':'layers'}),
  groupHeights:Object.freeze({'group-a':269,'group-b':261,'group-c':384})
});

const clone=value=>JSON.parse(JSON.stringify(value));
const finite=value=>Number.isFinite(Number(value));
const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)));

function viewportMetrics(viewport){
  let candidate=null;
  try{candidate=viewport?.()||null;}catch{}
  let width=Number(candidate?.width);
  let height=Number(candidate?.height);
  if(!Number.isFinite(width)){
    try{width=Number(globalThis.innerWidth);}catch{}
  }
  if(!Number.isFinite(height)){
    try{height=Number(globalThis.innerHeight);}catch{}
  }
  return {
    width:Math.max(320,Number.isFinite(width)&&width>0?width:1280),
    height:Math.max(0,Number.isFinite(height)&&height>=0?height:800)
  };
}

function preferenceBounds(viewport){
  const {width,height}=viewportMetrics(viewport);
  const panelMax=Math.max(UI_REGION_GEOMETRY.panelsCollapsed,Math.min(420,width-160));
  const panelHeightBudget=Math.max(0,Math.floor(height-UI_REGION_GEOMETRY.menuHeight-UI_REGION_GEOMETRY.optionsHeight-UI_REGION_GEOMETRY.statusHeight));
  return {width,height,panelMax,panelHeightBudget};
}

function fitGroupHeights(source,budget){
  const ids=Object.keys(GROUP_HEIGHT_LIMITS);
  const requested={};
  const minimums={};
  let requestedTotal=0,minTotal=0;
  for(const id of ids){
    const limits=GROUP_HEIGHT_LIMITS[id];
    const fallback=DEFAULT_STATE.groupHeights[id];
    const value=finite(source?.[id])?Math.round(Number(source[id])):fallback;
    requested[id]=clamp(value,limits.min,limits.max);
    minimums[id]=limits.min;
    requestedTotal+=requested[id];
    minTotal+=limits.min;
  }
  const usable=Math.max(0,Math.floor(Number(budget)||0));
  if(usable===0)return Object.fromEntries(ids.map(id=>[id,0]));
  if(usable<minTotal){
    let used=0;
    const scaled={};
    ids.forEach((id,index)=>{
      const value=index===ids.length-1?usable-used:Math.floor(minimums[id]*usable/minTotal);
      scaled[id]=Math.max(0,value);
      used+=scaled[id];
    });
    return scaled;
  }
  if(requestedTotal<=usable)return requested;
  const extraBudget=usable-minTotal;
  const extraTotal=ids.reduce((sum,id)=>sum+Math.max(0,requested[id]-minimums[id]),0);
  const scale=extraTotal>0?Math.min(1,extraBudget/extraTotal):0;
  const fitted={};
  let used=0;
  for(const id of ids){
    fitted[id]=minimums[id]+Math.floor((requested[id]-minimums[id])*scale);
    used+=fitted[id];
  }
  let remaining=Math.max(0,usable-used);
  while(remaining>0){
    let moved=false;
    for(const id of ids){
      if(remaining<=0)break;
      if(fitted[id]<requested[id]){fitted[id]++;remaining--;moved=true;}
    }
    if(!moved)break;
  }
  return fitted;
}

function sanitize(input,viewport){
  const bounds=preferenceBounds(viewport);
  const source=input&&input.schemaVersion===UI_PREFERENCE_SCHEMA_VERSION?input:DEFAULT_STATE;
  const tabs=source.groupTabs&&typeof source.groupTabs==='object'?source.groupTabs:{};
  const heights=source.groupHeights&&typeof source.groupHeights==='object'?source.groupHeights:{};
  const groupTabs={};
  for(const [groupId,known] of Object.entries(GROUP_TAB_IDS)){
    const candidate=typeof tabs[groupId]==='string'?tabs[groupId]:'';
    groupTabs[groupId]=known.includes(candidate)?candidate:DEFAULT_STATE.groupTabs[groupId];
  }
  const groupHeights=fitGroupHeights(heights,bounds.panelHeightBudget);
  const panelCandidate=finite(source.panelWidth)?Number(source.panelWidth):DEFAULT_STATE.panelWidth;
  return {
    schemaVersion:UI_PREFERENCE_SCHEMA_VERSION,
    toolsExpanded:typeof source.toolsExpanded==='boolean'?source.toolsExpanded:DEFAULT_STATE.toolsExpanded,
    panelsExpanded:typeof source.panelsExpanded==='boolean'?source.panelsExpanded:DEFAULT_STATE.panelsExpanded,
    rulersVisible:typeof source.rulersVisible==='boolean'?source.rulersVisible:DEFAULT_STATE.rulersVisible,
    panelWidth:clamp(panelCandidate,UI_REGION_GEOMETRY.panelsCollapsed,bounds.panelMax),
    groupTabs,
    groupHeights
  };
}

export function createUiPreferenceService(options={}){
  const viewport=typeof options.viewport==='function'?options.viewport:()=>({width:globalThis.innerWidth,height:globalThis.innerHeight});
  const transientExpansion=options.transientExpansion===true;
  const listeners=new Set();
  const hasStorageOption=Object.prototype.hasOwnProperty.call(options,'storage');
  let storage=hasStorageOption?options.storage:null;
  let storageAvailable=Boolean(storage);
  if(!hasStorageOption){
    try{storage=globalThis.localStorage;storageAvailable=Boolean(storage);}
    catch{storage=null;storageAvailable=false;}
  }
  let state=sanitize(DEFAULT_STATE,viewport);
  let raw=null;
  if(storageAvailable){
    try{raw=storage?.getItem?.(STORAGE_KEY)??null;}
    catch{storageAvailable=false;raw=null;}
  }
  if(raw!=null){
    try{state=sanitize(JSON.parse(raw),viewport);}
    catch{state=sanitize(DEFAULT_STATE,viewport);}
  }
  if(transientExpansion)state=sanitize({...state,toolsExpanded:DEFAULT_STATE.toolsExpanded,panelsExpanded:DEFAULT_STATE.panelsExpanded},viewport);
  const emit=()=>{const snapshot=service.get();for(const listener of [...listeners]){try{listener(snapshot);}catch{}}};
  const persist=()=>{
    if(!storageAvailable)return false;
    const stored=transientExpansion?{...state,toolsExpanded:DEFAULT_STATE.toolsExpanded,panelsExpanded:DEFAULT_STATE.panelsExpanded}:state;
    try{storage?.setItem?.(STORAGE_KEY,JSON.stringify(stored));return true;}
    catch{storageAvailable=false;return false;}
  };
  const service=Object.freeze({
    schema:'INK-UI-PREFERENCES',version:UI_PREFERENCE_SCHEMA_VERSION,key:STORAGE_KEY,
    get:()=>Object.freeze(clone(state)),
    bounds:()=>Object.freeze({...preferenceBounds(viewport)}),
    set(patch={}){
      const next=sanitize({
        ...state,...patch,
        groupTabs:{...state.groupTabs,...(patch.groupTabs&&typeof patch.groupTabs==='object'?patch.groupTabs:{})},
        groupHeights:{...state.groupHeights,...(patch.groupHeights&&typeof patch.groupHeights==='object'?patch.groupHeights:{})}
      },viewport);
      state=next;persist();emit();return service.get();
    },
    setGroupTab(groupId,tabId){return service.set({groupTabs:{[groupId]:tabId}});},
    setGroupHeight(groupId,height){return service.set({groupHeights:{[groupId]:height}});},
    reset(){state=sanitize(DEFAULT_STATE,viewport);persist();emit();return service.get();},
    reclamp(){state=sanitize(state,viewport);persist();emit();return service.get();},
    subscribe(listener){if(typeof listener!=='function')throw new TypeError('INK_UI_PREFERENCE_LISTENER_REQUIRED');listeners.add(listener);return()=>listeners.delete(listener);},
    diagnostics:()=>Object.freeze({storageAvailable,transientExpansion,listeners:listeners.size,schemaVersion:UI_PREFERENCE_SCHEMA_VERSION,bounds:preferenceBounds(viewport)})
  });
  return service;
}

export { STORAGE_KEY as UI_PREFERENCE_STORAGE_KEY, GROUP_TAB_IDS as UI_PREFERENCE_GROUP_TABS };
