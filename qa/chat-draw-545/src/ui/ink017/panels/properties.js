import {lifecycle,selected,selectedFields,field,iconButton} from '../shared-controls.js';
export default lifecycle('transform',s=>selectedFields(s,l=>`<div class="transform-fields">${['x','y','w','h','rotate'].map(k=>field(k,({x:'X',y:'Y',w:'W',h:'H',rotate:'Rotate'})[k],l[k])).join('')}${iconButton(s.toolOptions['select.aspect']?'lock':'unlock','Lock aspect ratio',`data-aspect aria-pressed="${!!s.toolOptions['select.aspect']}"`)}</div>`),(r,h,signal)=>{
 if(selected(h.getSnapshot())?.type==='selection')r.querySelectorAll('[data-key=w],[data-key=h],[data-key=rotate]').forEach(el=>el.disabled=true);
 r.addEventListener('click',e=>{if(e.target.closest('[data-aspect]'))h.dispatch({type:'tool.option',key:'select.aspect',value:h.getSnapshot().toolOptions['select.aspect']?0:1,source:'transform.aspect'})},{signal});
 r.addEventListener('change',e=>{const k=e.target.dataset.key;if(!k)return;const s=h.getSnapshot(),l=selected(s);if(!l||l.locked)return;const value=Number(e.target.value),patch={[k]:value};const result=h.dispatch({type:'layer.patch',targetId:l.id,patch,target:JSON.parse(r.dataset.nativeTarget),source:'transform.field'});if(!result.ok)e.target.value=l[k]},{signal});
});
