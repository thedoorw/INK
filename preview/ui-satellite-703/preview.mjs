// Loads the exact product markup and menu module from the same source tree;
// it never imports native-host, native-provider, shell, boot, Drive or Core.
import {mountMenuUi} from '../../src/ui/ink017/menu-ui.js';

const source=new URL('../../src/ui/ink017/markup.html',import.meta.url);
const response=await fetch(source,{cache:'no-store'});
if(!response.ok)throw Error('UI_MARKUP_FETCH_'+response.status);
const doc=new DOMParser().parseFromString(await response.text(),'text/html');
const shell=doc.querySelector('#shell');
if(!shell?.querySelector('#mainMenu')||!shell?.querySelector('#logoButton'))throw Error('SOURCE_MARKUP_CONTRACT_CHANGED');
document.querySelector('#app').append(shell);
const stage=shell.querySelector('#artboardStage');
const canvas=document.createElement('div');
canvas.className='satellite-canvas';
canvas.textContent='UI 假資料畫布 — 不讀取、不修改 Native Document';
stage.append(canvas);

const status=document.querySelector('#satelliteStatus');
const noop=Object.freeze({docs:[],object:null,target:{refs:[]},paint:{foreground:'#222222',background:'#ffffff'}});
const selectors=Object.freeze({
 'document.current':Object.freeze({open:false}),
 'session.transfer':Object.freeze({ready:false}),
 'session.list':Object.freeze([])
});
const mockHost=Object.freeze({
 kind:'MOCK_PREVIEW',
 menuApi:Object.freeze({
  selectedRasterInfo:()=>null,
  snapState:()=>({enabled:true,categories:{}}),
  canInvokeWorkTools:()=>false,
  driveAvailable:()=>false,
  isCurrentRuntime:()=>true,
  notify:message=>{status.textContent=String(message)}
 }),
 getSnapshot:()=>noop,
 getHistory:()=>({index:0,entries:[{index:0,label:'Preview only'}]}),
 select:key=>selectors[key]??null,
 subscribe:()=>()=>{}
});
const abort=new AbortController();
const ui=mountMenuUi({
 menu:shell.querySelector('#mainMenu'),logo:shell.querySelector('#logoButton'),host:mockHost,
 invoke:key=>{status.textContent=`Mock command: ${key} (not sent to Core)`;return {ok:false,code:'MOCK_ONLY'}},
 signal:abort.signal
});
status.textContent='已載入產品 markup.html + menu-ui.js；點 INK 開啟功能表';
document.documentElement.dataset.inkSatelliteReady='true';
// Test-only readback. No Native public API, no mutation authority.
globalThis.INK_SATELLITE_PREVIEW=Object.freeze({kind:'MOCK_ONLY',source:source.pathname,openMenu:ui.open});
