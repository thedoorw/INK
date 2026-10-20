import {lifecycle,esc,range,wireRange,nativeToolEmptyState,wireNativeToolEmptyState} from '../shared-controls.js';
const parameters=[['opacity','不透明度','Brush opacity'],['flow','流量','Brush flow'],['smoothing','平滑','Brush smoothing'],['pressure','壓力','Brush pressure'],['taper','收筆','Brush taper'],['wetness','濕度','Brush wetness'],['grain','顆粒','Brush grain'],['bristle','鬃毛','Brush bristle']];
export default lifecycle('brushes',(s,h)=>{
 if(!s.docs.length)return nativeToolEmptyState('開啟文件後使用筆刷。', 'brush', 'Use Brush tool', s);
 if(s.tool!=='brush')return nativeToolEmptyState('啟用筆刷以調整參數。', 'brush', 'Use Brush tool', s);
 const state=h.select('tool.presets'),settings=h.select('tool.settings',{tool:'brush'});
 if(state.status!=='AVAILABLE'||state.tool!=='brush'||!settings)return '<p class="capability-empty">筆刷目前無法使用</p>';
 const presets=state.presets||[],active=state.selected?.toolPresetId||null,size=Number(settings.size)||24;
 const rows=parameters.filter(([key])=>Number.isFinite(settings[key])).map(([key,label,name])=>range(name,Math.round(settings[key]*100),0,100).replace('<span>'+name+'</span>','<span>'+label+'</span>'));
 return `<div class="brush-settings">${range('Brush size',size,1,300).replace('<span>Brush size</span>','<span>尺寸 px</span>')}${rows.slice(0,2).join('')}<details data-disclosure="brush-more"><summary>進階筆刷參數</summary>${rows.slice(2).join('')}</details></div><div class="brush-presets">${presets.map(p=>`<button type="button" data-preset="${esc(p.toolPresetId)}" aria-pressed="${p.toolPresetId===active}">${esc(p.name||p.toolPresetId)}</button>`).join('')||'<p class="capability-empty">沒有可用預設集</p>'}</div>`;
},(r,h,signal)=>{
 wireNativeToolEmptyState(r,h,signal);
 wireRange(r,'Brush size',value=>{if(h.getSnapshot().tool==='brush')h.dispatch({type:'tool.option',key:'brush.size',value,source:'brushes'})},signal);
 for(const [key,,name] of parameters)wireRange(r,name,value=>{if(h.getSnapshot().tool==='brush')h.dispatch({type:'tool.option',key:'brush.'+key,value:value/100,source:'brushes'})},signal);
 r.addEventListener('click',e=>{const b=e.target.closest('[data-preset]');if(b&&!b.disabled&&h.getSnapshot().tool==='brush')h.execute('tool.preset.apply.v1',{toolPresetId:b.dataset.preset})},{signal});
});
