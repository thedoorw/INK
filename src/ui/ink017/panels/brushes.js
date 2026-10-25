import {lifecycle,esc,range,wireRange,nativeToolEmptyState,wireNativeToolEmptyState} from '../shared-controls.js';
const parameters=[['opacity','不透明度','Brush opacity'],['flow','流量','Brush flow'],['smoothing','平滑','Brush smoothing'],['pressure','壓力','Brush pressure'],['taper','筆鋒','Brush taper'],['wetness','濕度','Brush wetness'],['grain','紋理','Brush grain'],['bristle','刷毛','Brush bristle']];
const sampleNames=['柔邊圓形','實邊圓形','柔邊圓形 2','實邊圓形 2','一般筆刷','乾筆刷'];
let previewSize=60;
export default lifecycle('brushes',(s,h)=>{
 const state=h.select('tool.presets'),settings=h.select('tool.settings',{tool:'brush'});
 const available=!!s.docs.length&&s.tool==='brush'&&state.status==='AVAILABLE'&&state.tool==='brush'&&!!settings;
 const actual=settings||{},presets=state.tool==='brush'?(state.presets||[]):[];
 const active=state.selected?.toolPresetId||null,size=Number(actual.size)||24;
 const rows=parameters.filter(([key])=>Number.isFinite(actual[key])).map(([key,label,name])=>range(name,Math.round(actual[key]*100),0,100).replace('<span>'+name+'</span>','<span>'+label+'</span>'));
 const sampleHeads=Array.from({length:5},(_,i)=>'<button type="button" disabled class="ps-native-brush-head head-'+i+'" title="筆頭形狀參考（不可套用）" aria-label="筆頭形狀 '+(i+1)+'（參考）"><span></span></button>').join('');
 const presetRows=presets.map((p,i)=>'<button type="button" class="ps-native-brush-preset" data-preset="'+esc(p.toolPresetId)+'" aria-pressed="'+(p.toolPresetId===active)+'"'+(available?'':' disabled')+'><span class="ps-native-brush-stroke" aria-hidden="true"></span><span>'+esc(p.name||p.toolPresetId)+'</span></button>').join('');
 const references=sampleNames.map((name,i)=>'<div class="ps-native-brush-preset brush-ref-'+i+'" aria-label="'+name+'（外觀參考）"><span class="ps-native-brush-stroke" aria-hidden="true"></span><span>'+name+'</span></div>').join('');
 return '<div class="ps-native-brushes">'+
  (available||!s.docs.length?'':nativeToolEmptyState('請先啟動筆刷工具','brush','使用筆刷工具',s))+
  '<div class="ps-native-brush-size-top"><span>尺寸：</span><output data-brush-size-display>'+size+' px</output><button type="button" data-brush-reset aria-label="重設筆刷尺寸"'+(available?'':' disabled')+'>↶</button><button type="button" disabled title="更多筆刷選項尚未支援">◩</button></div>'+
  '<fieldset'+(available?'':' disabled')+'><div class="ps-native-brush-size-track">'+range('Brush size',size,1,300)+'</div></fieldset>'+
  '<div class="ps-native-brush-heads" role="list" aria-label="五個參考筆頭">'+sampleHeads+'</div>'+
  '<div class="ps-native-brush-scroll"><div class="ps-native-brush-folder">⌄ <span aria-hidden="true">▣</span> 一般筆刷</div>'+
  (presetRows||references)+'<details class="ps-native-brush-settings" data-disclosure="brush-options"><summary>INK 原生筆刷參數</summary><fieldset'+(available?'':' disabled')+'><div class="brush-settings">'+rows.slice(0,2).join('')+'<details data-disclosure="brush-more"><summary>更多選項</summary>'+rows.slice(2).join('')+'</details></div></fieldset></details></div>'+
  '<div class="ps-native-brush-preview-slider">'+range('Brush preview size',previewSize,25,100).replace('<span>Brush preview size</span>','<span>筆頭預覽</span>')+'</div>'+
  '<div class="ps-native-brush-footer"><button disabled title="新增筆刷群組" aria-label="新增筆刷群組">▣</button><button disabled title="新增筆刷" aria-label="新增筆刷">⊞</button><button disabled title="刪除筆刷" aria-label="刪除筆刷">⌫</button></div></div>';
},(r,h,signal)=>{
 wireNativeToolEmptyState(r,h,signal);
 wireRange(r,'Brush size',value=>{if(h.getSnapshot().tool==='brush')h.dispatch({type:'tool.option',key:'brush.size',value,source:'brushes'})},signal);
 for(const [key,,name] of parameters)wireRange(r,name,value=>{if(h.getSnapshot().tool==='brush')h.dispatch({type:'tool.option',key:'brush.'+key,value:value/100,source:'brushes'})},signal);
 const preview=r.querySelector('[aria-label="Brush preview size"]');
 preview?.addEventListener('input',()=>{previewSize=Number(preview.value);r.style.setProperty('--brush-preview-scale',String(previewSize/60))},{signal});
 r.style.setProperty('--brush-preview-scale',String(previewSize/60));
 r.addEventListener('click',e=>{
  const b=e.target.closest('[data-preset]'),reset=e.target.closest('[data-brush-reset]');
  if(reset&&!reset.disabled&&h.getSnapshot().tool==='brush')h.dispatch({type:'tool.option',key:'brush.size',value:24,source:'brushes'});
  if(b&&!b.disabled&&h.getSnapshot().tool==='brush')h.execute('tool.preset.apply.v1',{toolPresetId:b.dataset.preset});
 },{signal});
});
