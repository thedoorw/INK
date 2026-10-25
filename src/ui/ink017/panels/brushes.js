import {lifecycle,esc,range,wireRange,nativeToolEmptyState,wireNativeToolEmptyState} from '../shared-controls.js';
const parameters=[['opacity','不透明度','Brush opacity'],['flow','流量','Brush flow'],['smoothing','平滑','Brush smoothing'],['pressure','壓力','Brush pressure'],['taper','筆鋒','Brush taper'],['wetness','濕度','Brush wetness'],['grain','紋理','Brush grain'],['bristle','刷毛','Brush bristle']];
export default lifecycle('brushes',(s,h)=>{
 const state=h.select('tool.presets'),settings=h.select('tool.settings',{tool:'brush'});
 const available=!!s.docs.length&&s.tool==='brush'&&state.status==='AVAILABLE'&&state.tool==='brush'&&!!settings;
 const actual=settings||{};
 const presets=state.tool==='brush'?(state.presets||[]):[],active=state.selected?.toolPresetId||null,size=Number(actual.size)||24;
 const rows=parameters.filter(([key])=>Number.isFinite(actual[key])).map(([key,label,name])=>range(name,Math.round(actual[key]*100),0,100).replace('<span>'+name+'</span>','<span>'+label+'</span>'));
 return `${available||!s.docs.length?'':nativeToolEmptyState('Activate Brush to edit.','brush','Use Brush tool',s)}<fieldset ${available?'':'disabled'}><div class="brush-settings">${range('Brush size',size,1,300).replace('<span>Brush size</span>','<span>尺寸</span>')}${rows.slice(0,2).join('')}<details data-disclosure="brush-more"><summary>Advanced settings</summary>${rows.slice(2).join('')}</details></div><div class="brush-presets">${presets.map(p=>`<button type="button" data-preset="${esc(p.toolPresetId)}" aria-pressed="${p.toolPresetId===active}">${esc(p.name||p.toolPresetId)}</button>`).join('')||'<p class="capability-empty">Activate Brush to show presets.</p>'}</div></fieldset>`;
},(r,h,signal)=>{
 wireNativeToolEmptyState(r,h,signal);
 wireRange(r,'Brush size',value=>{if(h.getSnapshot().tool==='brush')h.dispatch({type:'tool.option',key:'brush.size',value,source:'brushes'})},signal);
 for(const [key,,name] of parameters)wireRange(r,name,value=>{if(h.getSnapshot().tool==='brush')h.dispatch({type:'tool.option',key:'brush.'+key,value:value/100,source:'brushes'})},signal);
 r.addEventListener('click',e=>{const b=e.target.closest('[data-preset]');if(b&&!b.disabled&&h.getSnapshot().tool==='brush')h.execute('tool.preset.apply.v1',{toolPresetId:b.dataset.preset})},{signal});
});
