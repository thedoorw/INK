import transform from './panels/properties.js';
import toolOptions from './context-tool-options.js';
import {iconButton} from './shared-controls.js';

// View-only projection of the existing Native snapshot; no document/tool state owner.
export function mountContextToolbar(root,host,invoke,feedback,signal){
 const bar=root.querySelector('.context-float'),toggle=root.querySelector('#contextToggle'),identity=root.querySelector('#contextIdentity'),controls=root.querySelector('#contextControls');
 controls.innerHTML='<span data-context-status class="capability-empty"></span><div id="contextToolOptions"></div><div class="context-actions" role="group" aria-label="Selected object actions">'+[['duplicate','Duplicate'],['delete','Delete'],['align','Align']].map(([key,label])=>iconButton(key,label,'data-context="'+key+'"')).join('')+'</div><div id="transformControls"></div><div data-context-fill><label class="field-row"><span>Fill</span><input data-fill type="color" aria-label="Object fill"></label></div>';
 const status=controls.querySelector('[data-context-status]'),actions=controls.querySelector('.context-actions'),fields=controls.querySelector('#transformControls'),fill=controls.querySelector('[data-fill]'),fillRow=controls.querySelector('[data-context-fill]');
 transform.mount(fields,host);
 toolOptions.mount(controls.querySelector('#contextToolOptions'),host);
 function expand(value){
  bar.classList.toggle('expanded',value);
  toggle.setAttribute('aria-expanded',String(value));
  const label=value?'Collapse tool settings':'Expand tool settings';
  toggle.setAttribute('aria-label',label);toggle.title=label;
  toggle.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="'+(value?'M6 9l6 6 6-6':'M6 15l6-6 6 6')+'" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  render(host.getSnapshot());
 }
 toggle.addEventListener('click',()=>expand(!bar.classList.contains('expanded')),{signal});
 controls.addEventListener('click',event=>{
  const button=event.target.closest('[data-context]');
  if(button&&!button.disabled)Promise.resolve(invoke(button.dataset.context)).catch(error=>feedback(error.message));
 },{signal});
 let fillTarget=host.target();
 const captureFillTarget=()=>{fillTarget=host.target()};
 fill.addEventListener('focus',captureFillTarget,{signal});
 fill.addEventListener('pointerdown',captureFillTarget,{signal});
 fill.addEventListener('change',()=>host.dispatch({type:'fill.set',color:fill.value,target:fillTarget,source:'fill'}),{signal});
 function render(snapshot){
  const object=snapshot.object,count=snapshot.target?.refs?.length||0,open=!!snapshot.docs.length;
  identity.textContent=({pan:'Hand',select:'Select',pen:'手繪筆',pencil:'鉛筆',marker:'麥克筆',brush:'筆刷',airbrush:'噴槍',shape:'Shape',text:'Text',eraser:'Eraser'}[snapshot.tool]||snapshot.tool);
  bar.classList.toggle('drawing-context',['pen','pencil','marker','brush','airbrush'].includes(snapshot.tool));
  const applicable=open&&count>0&&!!object;
  status.textContent=!open?'No document':!applicable?'No selection':count>1?count+' objects':({path:'Path',shape:'Shape',text:'Text',image:'Image'}[object.type]||object.type)+(object.locked?' · Locked':'');
  status.hidden=open&&!applicable&&!['select','eraser'].includes(snapshot.tool);
  actions.hidden=!applicable;fields.hidden=!applicable;
  const expandable=open&&(applicable||!!controls.querySelector('[data-context-advanced]'));
  toggle.disabled=!expandable;
  if(!expandable&&bar.classList.contains('expanded')){expand(false);return}
  controls.querySelectorAll('[data-context]').forEach(button=>button.disabled=!applicable||object.locked||(button.dataset.context==='align'&&count<2));
  fillRow.hidden=!bar.classList.contains('expanded')||!applicable||!['path','shape'].includes(object.type);
  fill.disabled=!applicable||object.locked||!['path','shape'].includes(object.type);
  if(/^#[0-9a-f]{6}$/i.test(object?.fill))fill.value=object.fill;
 }
 expand(bar.classList.contains('expanded'));
 return {render,expand,dispose(){toolOptions.unmount();transform.unmount();controls.replaceChildren()}};
}
