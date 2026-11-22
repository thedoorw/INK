import {lifecycle,field,esc} from './shared-controls.js';
import {NAVIGATOR_ZOOM_MIN,NAVIGATOR_ZOOM_MAX,navigatorZoomText} from './panels/navigator-zoom-curve.mjs';
const drawing=new Set(['pen','pencil','marker','brush','airbrush']);
const labels={size:'Size px',opacity:'Opacity %',flow:'Flow %',smoothing:'Smoothing %',pressure:'Pressure %',taper:'Taper %',wetness:'Wetness %',grain:'Grain %',bristle:'Bristle %',softness:'Softness %'};
const numberField=(key,label,value,min,max)=>field(key,label,value).replace('step="any"','step="any" min="'+min+'" max="'+max+'"');
export function toolOptionsMarkup(s,h){
 if(!s.docs.length)return '';
 const tool=s.tool,options=h.select('tool.options')||{},settings=h.select('tool.settings',{tool});
 let body='';
 if(drawing.has(tool)&&settings){
  const keys=['size','opacity','flow','smoothing','pressure','taper','wetness','grain','bristle','softness'].filter(key=>Number.isFinite(settings[key]));
  const primary=['size','opacity','flow','smoothing'].filter(key=>keys.includes(key));
  const fieldFor=key=>numberField('setting:'+key,labels[key],key==='size'?settings[key]:Math.round(settings[key]*100),key==='size'?1:0,key==='size'?300:100);
  body='<div class="context-parameter-group context-drawing-primary" role="group" aria-label="Drawing parameters">'+primary.map(key=>primary.indexOf(key)>1?'<span class="context-optional-inline">'+fieldFor(key)+'</span>':fieldFor(key)).join('')+'</div>';
  const remaining=keys.filter(key=>!['size','opacity'].includes(key));
  if(remaining.length)body+='<button type="button" class="context-drawing-more'+(keys.every(key=>primary.includes(key))?' context-more-responsive-only':'')+'" data-options-more aria-haspopup="true" aria-expanded="false" aria-controls="contextDrawingMore">更多設定</button><div id="contextDrawingMore" class="context-more-menu" data-options-more-menu popover="auto" role="group" aria-label="繪圖進階設定">'+remaining.map(key=>'<div '+(primary.includes(key)?'class="context-more-responsive-field"':'')+'>'+fieldFor(key)+'</div>').join('')+'</div>';
 }
 if(tool==='shape')body='<div class="context-parameter-group" role="group" aria-label="New shape settings">'+field('shape','Shape',options.shapeType||'line','text',['line','arrow','rect','ellipse','triangle'])+field('shapeFill','Fill new shape',options.shapeFill?'On':'Off','text',['Off','On'])+'</div>';
 if(tool==='text'){
  const text=s.object?.type==='text'?s.object:null,locked=!!text?.locked;
  body='<fieldset '+(locked?'disabled':'')+'><div class="context-parameter-group" role="group" aria-label="'+(text?'Selected text':'New text settings')+'">'+field(text?'text:font':'default:family','Font',text?.font||options.font?.family||'system-ui','text')+numberField(text?'text:size':'default:size','Size px',text?.size||options.font?.size||32,text?1:4,text?1000:512)+(text?numberField('text:weight','Weight',text.weight,100,900)+field('text:textColor','Color',text.textColor,'color'):'')+'</div></fieldset>';
 }
 if(tool==='pan')body='<div class="context-parameter-group" role="group" aria-label="View controls">'+numberField('zoom','Zoom %',navigatorZoomText(s.docs[0].camera.zoom),NAVIGATOR_ZOOM_MIN,NAVIGATOR_ZOOM_MAX)+'<button type="button" data-view="fit">Fit content</button><button type="button" data-view="artboard">Fit artboard</button><button type="button" data-view="100">100%</button></div>';
 return body?'<div data-options-tool="'+esc(tool)+'">'+body+'</div>':'';
}
export function wireToolOptions(r,h,signal){
 const valid=()=>{const s=h.getSnapshot(),tool=r.querySelector('[data-options-tool]')?.dataset.optionsTool;if(!s.docs.length||s.tool!==tool)return null;h.provider.requireDocument(JSON.parse(r.dataset.nativeTarget));return s};
 const report=result=>{if(result?.ok===false)throw Error(result.error?.message||result.error||'Setting unavailable')};
 const change=event=>{
  const el=event.target,key=el.dataset.key;if(!key)return;
  try{
   const s=valid();if(!s)return;
   if(!el.checkValidity()){el.reportValidity();return}
   if(key.startsWith('setting:')){const k=key.slice(8),value=Number(el.value);report(h.dispatch({type:'tool.option',key:s.tool+'.'+k,value:k==='size'?value:value/100,source:'context.tool'}))}
   else if(key==='shape')report(h.execute('tool.shape.set.v1',{shape:el.value}));
   else if(key==='shapeFill')report(h.execute('tool.shape.fill.set.v1',{fill:el.value==='On'}));
   else if(key.startsWith('default:'))report(h.execute('tool.text.setting.set.v1',{key:key.slice(8),value:el.type==='number'?Number(el.value):el.value}));
   else if(key.startsWith('text:'))report(h.dispatch({type:'layer.patch',target:JSON.parse(r.dataset.nativeTarget),patch:{[key.slice(5)]:el.type==='number'?Number(el.value):el.value},source:'context.text'}));
   else if(key==='zoom')report(h.execute('view.zoom.set.v1',{scale:Number(el.value)/100}));
  }catch(error){h.app.toast?.(error.message)}
 };
 r.addEventListener('change',change,{signal});
 const more=r.querySelector('[data-options-more-menu]'),opener=r.querySelector('[data-options-more]');
 if(more&&opener){
  const opened=()=>more.matches(':popover-open');
  opener.addEventListener('click',()=>{
   if(opened()){more.hidePopover();return}
   const rect=opener.getBoundingClientRect();
   more.style.left=Math.max(8,Math.min(rect.left,innerWidth-268))+'px';
   more.style.bottom=Math.max(8,innerHeight-rect.top+4)+'px';
   more.showPopover();
   more.querySelector('input:not(:disabled)')?.focus();
  },{signal});
  more.addEventListener('toggle',()=>opener.setAttribute('aria-expanded',String(opened())),{signal});
  more.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();more.hidePopover();opener.focus()}},{signal});
 }
 r.addEventListener('click',event=>{const b=event.target.closest('[data-view]');if(!b)return;try{if(!valid())return;report(h.execute(b.dataset.view==='fit'?'view.fit.content.v1':b.dataset.view==='artboard'?'view.fit.artboard.v1':'view.zoom.set.v1',b.dataset.view==='100'?{scale:1}:{}))}catch(error){h.app.toast?.(error.message)}},{signal});
}
export default lifecycle('context-tool-options',toolOptionsMarkup,wireToolOptions);
