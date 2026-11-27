export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const activeDoc=s=>s.docs.find(d=>d.id===s.activeDoc);
export const selected=s=>s.object;
export const selectedLayer=s=>{const d=activeDoc(s);return d?.layers.find(l=>l.id===d.selection)};
export const range=(label,value,min=0,max=100)=>`<label class="range-row"><span>${esc(label)}</span><input class="shared-slider" aria-label="${esc(label)}" type="range" min="${min}" max="${max}" value="${value}"><output>${value}</output></label>`;
export function field(key,label,value,type='number',options,accessibleName=label){return `<label class="field-row"><span>${esc(label)}</span>${options?`<select data-key="${key}" aria-label="${esc(accessibleName)}">${options.map(o=>`<option ${o===value?'selected':''}>${esc(o)}</option>`).join('')}</select>`:`<input data-key="${key}" aria-label="${esc(accessibleName)}" type="${type}" value="${esc(value)}" ${type==='number'?'step="any"':''}>`}</label>`}
// Public-owned, side-effect-free drawing-options markup. Native owns actual
// settings, validation and command listeners; Mock supplies in-memory values.
// This is one actual renderer for both hosts once the Native bundle consumes
// the updated adapter. No Core module is imported here.
const DRAW_OPTION_LABELS=Object.freeze({
 size:'Size px',opacity:'Opacity %',flow:'Flow %',smoothing:'Smoothing %',
 pressure:'Pressure %',taper:'Taper %',wetness:'Wetness %',grain:'Grain %',
 bristle:'Bristle %',softness:'Softness %'
});
export function renderDev1DrawingOptions(label,settings){
 if(!settings)return '';
 const keys=['size','opacity','flow','smoothing','pressure','taper','wetness','grain','bristle','softness']
  .filter(key=>Number.isFinite(settings[key]));
 const rows=keys.map(key=>{
  const value=key==='size'?settings[key]:Math.round(settings[key]*10000)/100;
  return field('dev1:'+key,DRAW_OPTION_LABELS[key],value,'number')
   .replace('step="any"','step="any" min="'+(key==='size'?1:0)+'" max="'+(key==='size'?300:100)+'"');
 }).join('');
 return '<div class="context-parameter-group" role="group" aria-label="'+esc(label)+' parameters">'+rows+'</div>';
}

// Same Public shape-option fields are consumed by Native's DEV3 adapter and
// the UI MASTER Mock. The adapters own values and commands, never this renderer.
export function renderDev3ShapeOptions(options={},selectedShape=null){
 const shapes=['line','arrow','rect','ellipse','triangle'];
 const shape=shapes.includes(options.shapeType)?options.shapeType:'line';
 let body=field('shape:type','Shape',shape,'text',shapes)+
  field('shape:defaultFill','Fill new',options.shapeFill?'On':'Off','text',['Off','On']);
 if(selectedShape){
  const numeric=(key,label,value,min,max)=>field(key,label,value)
   .replace('step="any"','step="any" min="'+min+'" max="'+max+'"');
  body+='<fieldset'+(selectedShape.locked?' disabled':'')+'>'+
   numeric('shape:w','W',selectedShape.w,0.001,10000000)+
   numeric('shape:h','H',selectedShape.h,0.001,10000000)+
   numeric('shape:rotate','Rotate °',selectedShape.rotate,-360000,360000)+
   field('shape:fill','Object fill',selectedShape.fill||'#202020','color')+'</fieldset>';
 }
 return '<div class="context-parameter-group" role="group" aria-label="Shape defaults and selected object">'+body+'</div>';
}

// Public-only context layout: the same bounded-row / More arrangement for
// Native and Mock. This handles DOM presentation; no command receives writes.
export function arrangeToolOptions(options,bar,signal,{expanded=true}={}){
 if(!expanded||!options?.firstElementChild||!bar||!signal)return false;
 const fields=[...options.querySelectorAll('label.field-row,span.field-row[role=status],button[data-dev1-action],button[data-dev2-action],button[data-dev3-action],button[data-completion-action]')];
 if(!fields.length||bar.scrollWidth<=bar.clientWidth+1)return false;
 const extra=document.createElement('div');
 extra.className='context-more-menu';extra.id='toolOptionsMore';
 extra.setAttribute('popover','auto');extra.setAttribute('role','group');
 extra.setAttribute('aria-label','更多工具選項');
 const more=document.createElement('button');more.type='button';
 more.className='context-drawing-more';more.textContent='更多';
 more.setAttribute('aria-expanded','false');more.setAttribute('aria-controls',extra.id);
 options.append(more,extra);
 for(const part of fields.slice().reverse()){
  if(bar.scrollWidth<=bar.clientWidth+1)break;
  if(part.closest('fieldset:disabled')){
   if(part.matches('button,input,select'))part.disabled=true;
   part.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
  }
  extra.prepend(part);
 }
 more.addEventListener('click',()=>{
  if(extra.matches(':popover-open')){extra.hidePopover();return;}
  const box=more.getBoundingClientRect();
  extra.style.left=Math.min(box.left,Math.max(8,innerWidth-276))+'px';
  extra.style.top='8px';extra.showPopover();
  extra.style.top=Math.max(8,box.top-extra.getBoundingClientRect().height-6)+'px';
  more.setAttribute('aria-expanded','true');
  extra.querySelector('input:not(:disabled),select:not(:disabled),button:not(:disabled)')?.focus();
 },{signal});
 extra.addEventListener('toggle',()=>more.setAttribute('aria-expanded',String(extra.matches(':popover-open'))),{signal});
 extra.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();extra.hidePopover();more.focus();}
 },{signal});
 return true;
}
// A panel may expose an existing Native tool without inventing a second command route.
// Keep empty-state actions honest: activation selects a tool, not an object or a document edit.
export function nativeToolEmptyState(message,tool,label,s){
 return `<div class="capability-empty"><p>${esc(message)}</p><button type="button" data-activate-native-tool="${esc(tool)}" aria-label="${esc(label)}" aria-pressed="${s.tool===tool}" ${s.docs.length?'':'disabled'}>${esc(label)}</button></div>`;
}
export function wireNativeToolEmptyState(root,host,signal){
 root.addEventListener('click',event=>{const button=event.target.closest('[data-activate-native-tool]');if(button&&!button.disabled&&root.contains(button))host.dispatch({type:'tool.set',value:button.dataset.activateNativeTool,source:'dock.empty-state'})},{signal});
}
export function lifecycle(id,render,wire,deferPaint){let root,host,abort,unsubscribe;function paint(){if(!root||deferPaint?.(root))return;const focus=root.contains(document.activeElement)?document.activeElement:null;const key=focus?.getAttribute('aria-label'),start=focus?.selectionStart,scroll=root.scrollTop,disclosures=[...root.querySelectorAll('details[data-disclosure][open]')].map(x=>x.dataset.disclosure),groups=Object.fromEntries([...root.querySelectorAll('.swatch-groups,.layer-list,.history-list')].map(x=>[x.className,x.scrollTop]));abort?.abort();abort=new AbortController();root.innerHTML=render(host.getSnapshot(),host);root.dataset.nativeTarget=JSON.stringify(host.target());root.scrollTop=scroll;for(const x of root.querySelectorAll('details[data-disclosure]'))x.open=disclosures.includes(x.dataset.disclosure);for(const x of root.querySelectorAll('.swatch-groups,.layer-list,.history-list'))x.scrollTop=groups[x.className]||0;wire?.(root,host,abort.signal,paint);if(key){const el=[...root.querySelectorAll('[aria-label]')].find(x=>x.getAttribute('aria-label')===key);el?.focus({preventScroll:true});if(el?.type==='text'&&start!==null)el.setSelectionRange(start,start)}}return {id,mount(el,h){this.unmount();root=el;host=h;unsubscribe=h.subscribe(paint);paint()},unmount(){abort?.abort();unsubscribe?.();if(root)root.replaceChildren();root=host=unsubscribe=null}}}
export function wireFields(root,host,signal){root.addEventListener('change',e=>{const el=e.target;if(!el.dataset.key)return;const l=selected(host.getSnapshot());const result=host.dispatch({type:'layer.patch',targetId:l?.id,patch:{[el.dataset.key]:el.type==='number'?Number(el.value):el.value},target:JSON.parse(root.dataset.nativeTarget),source:'panel.field'});if(!result.ok&&l)el.value=l[el.dataset.key]},{signal})}
export function selectedFields(s,markup){const l=selected(s);return `<fieldset ${!l||l.locked?'disabled':''}>${l?markup(l):'<p>No selection</p>'}</fieldset>`}
export function wireRange(root,label,onCommit,signal){const el=[...root.querySelectorAll('input[type=range]')].find(e=>e.getAttribute('aria-label')===label);if(!el)return;el.addEventListener('input',()=>{const output=el.closest('.range-row,.navigator-controls')?.querySelector('output');if(output)output.value=el.value},{signal});el.addEventListener('change',()=>onCommit(Number(el.value)),{signal})}
// Dialog headers can contain interactive descendants. Ignore those before
// preventDefault/pointer capture, otherwise their click (including Close) is lost.
export function drag(el,move,end=()=>{},signal,{ignoreSelector}={}){
 el.addEventListener('pointerdown',e=>{
  if(e.button!==0||(ignoreSelector&&e.target?.closest?.(ignoreSelector)))return;
  e.preventDefault();el.setPointerCapture(e.pointerId);
  const update=ev=>move(ev,el.getBoundingClientRect());update(e);
  const done=ev=>{el.removeEventListener('pointermove',update);el.removeEventListener('pointerup',done);el.removeEventListener('pointercancel',cancel);end(ev)};
  const cancel=ev=>done(ev);
  el.addEventListener('pointermove',update);el.addEventListener('pointerup',done);el.addEventListener('pointercancel',cancel);
  signal?.addEventListener('abort',()=>{el.removeEventListener('pointermove',update);el.removeEventListener('pointerup',done);el.removeEventListener('pointercancel',cancel)},{once:true});
 },{signal});
}


const icons={'text-left':'M4 5h16M4 10h10M4 15h16M4 20h10','text-center':'M4 5h16M7 10h10M4 15h16M7 20h10','text-right':'M4 5h16M10 10h10M4 15h16M10 20h10','text-justify':'M4 5h16M4 10h16M4 15h16M4 20h16',expand:'M6 9l6-6 6 6M12 3v18M6 15l6 6 6-6',move:'M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4',duplicate:'M8 8h12v12H8zM16 8V4H4v12h4',delete:'M4 6h16M9 6V3h6v3M7 6l1 15h8l1-15M10 10v7M14 10v7',align:'M3 3v18M6 6h14v4H6zM6 14h9v4H6z',front:'M4 8h12v12H4zM8 4h12v12M12 13V7M9 10l3-3 3 3',lock:'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5z',unlock:'M9 10V7a5 5 0 0 1 9-3M5 10h14v11H5z',undo:'M8 5l-5 5 5 5M3 10h10a7 7 0 0 1 7 7',redo:'M16 5l5 5-5 5M21 10H11a7 7 0 0 0-7 7',brightness:'M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',levels:'M3 20V4M3 20h18M7 20v-6h3v6M11 20V8h3v12M15 20V5h3v15',curves:'M3 3v18h18M4 20C15 20 8 4 20 4',hue:'M3 5h18v14H3zM7 5v14M12 5v14M17 5v14',balance:'M12 3v18M4 7h16M5 7l-3 7h6zM19 7l-3 7h6zM7 21h10',gradient:'M3 5h18v14H3zM7 5v14M10 5v14M12 5v14M14 5v14M15 5v14M16 5v14M17 5v14',eye:'M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',up:'M5 14l7-7 7 7M12 7v14',down:'M5 10l7 7 7-7M12 3v14',swap:'M3 7h17M16 3l4 4-4 4M21 17H4M8 13l-4 4 4 4',reset:'M3 3h12v12H3zM9 15v6h12V9h-6',transform:'M3 3h18v18H3zM3 12h18M12 3v18'};
export const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name]||icons.transform}"/></svg>`;
export const iconButton=(name,label,attrs='')=>`<button type="button" class="icon-button" aria-label="${esc(label)}" title="${esc(label)}" ${attrs}>${icon(name)}</button>`;
// #765 V2 leased same-source pure UI view: minimal-test-shell/size-dialog-view.js
// INK #765 — Pure New Document dialog markup shared by Native and Mock.
// No Document model, commands, storage, files or network are imported here.
export function renderNewDocumentSizeDialog({ppiMin,ppiMax,presetOptions=''}={}){
 if(!Number.isFinite(ppiMin)||!Number.isFinite(ppiMax)||ppiMin>ppiMax)
  throw Error('Invalid display-only PPI bounds');
 return '<dialog class="ink-size-dialog" data-size-dialog="new" aria-labelledby="ink-new-title"><header class="dialog-header"><h2 id="ink-new-title">New Document</h2><button type="button" class="dialog-close" data-size-cancel aria-label="Close New Document">×</button></header><div class="dialog-body"><div class="ink-new-size-groups"><div class="ink-new-size-pair" role="group" aria-label="Width and height"><label>Width<input data-size-field="width" type="number" step="any"></label><label>Height<input data-size-field="height" type="number" step="any"></label></div><div class="ink-new-size-pair ink-new-size-metadata" role="group" aria-label="Units and resolution"><label>Units<select data-size-field="units"><option>px</option><option selected>mm</option><option>cm</option><option>in</option></select></label><label>PPI<input data-size-field="ppi" type="number" min="'+ppiMin+'" max="'+ppiMax+'" step="1"></label></div><div class="ink-new-orientation" role="group" aria-label="Orientation and proportions"><label><input data-size-field="lock" type="checkbox" checked> Lock proportions</label><button data-size-swap type="button">Swap orientation</button></div><div class="ink-new-presets"><select data-size-preset><option value="">Local preset…</option>'+presetOptions+'</select><button data-size-save-preset type="button">Save preset</button></div></div><div class="ink-size-preview" data-size-preview></div></div><footer class="dialog-footer ink-size-dialog-actions"><button class="secondary" data-size-cancel type="button">Cancel</button><button class="primary" data-size-apply type="button">Create</button></footer></dialog>';
}

// Native's compiled Document/size controller calls this same Public UI module
// by reference; Mock Preview imports the named function from this exact blob.
// No document state, IO, storage or commands are exposed by the presentation.
// Registration belongs to the Native/Mock host bootstrap, not ESM evaluation:
// compiled Native helpers may import field()/esc() from this same leased file.
// Keeping the views pure allows the bundle to tree-shake them completely.

// #765 V2 leased same-source pure UI view: branding-view.js
/* #765 Pure branding view shared by Real and Mock: no IO or product commands. */
const createBrandingView=/* @__PURE__ */(() => {
  'use strict';
  const make=(tag,attrs={},text='')=>{
    const node=document.createElement(tag);
    for(const [key,value] of Object.entries(attrs)){
      if(key==='class')node.className=value;
      else node.setAttribute(key,value);
    }
    if(text)node.textContent=text;
    return node;
  };
  function createBrandingView({ownerUpload}={}){
    const backdrop=make('div',{class:'ink-branding-backdrop',hidden:''});
    backdrop.hidden=true;
    const panel=make('section',{class:'ink-branding-panel',role:'dialog','aria-modal':'true',
      'aria-label':'網站品牌設定','aria-describedby':'inkBrandHelp'});
    const header=make('header',{class:'dialog-header ink-branding-header'});
    const title=make('h2',{},'網站品牌設定');
    const close=make('button',{type:'button',class:'dialog-close','aria-label':'關閉品牌設定'},'×');
    header.append(title,close);panel.append(header);
    const body=make('div',{class:'ink-branding-pref-body'});
    const content=make('div',{class:'ink-branding-pref-content'});
    const fields=make('div',{class:'ink-branding-fields'});
    const makeText=(key,label,max)=>{
      const lab=make('label',{for:'inkBrand'+key},label);
      const input=make('input',{id:'inkBrand'+key,type:'text',maxlength:String(max)});
      fields.append(lab,input);return input;
    };
    const nameInput=makeText('name','Application Name',32);
    const titleInput=makeText('title','Browser Title',100);
    content.append(fields);
    const preview=make('div',{class:'ink-branding-preview'});
    const logoGroup=make('div',{class:'ink-branding-preview-item'});
    logoGroup.append(make('span',{class:'ink-branding-preview-label'},'Logo'));
    const logoImage=make('img',{alt:'網站 Logo 預覽'});
    logoGroup.append(logoImage);
    const faviconGroup=make('div',{class:'ink-branding-preview-item'});
    faviconGroup.append(make('span',{class:'ink-branding-preview-label'},'Favicon'));
    const faviconImage=make('img',{alt:'網站 Favicon 預覽'});
    faviconGroup.append(faviconImage);
    preview.append(logoGroup,faviconGroup);content.append(preview);
    const logoRow=make('div',{class:'ink-branding-file-row'});
    const logoHeading=make('label',{for:'inkBrandLogoFile'},'Choose Logo');
    const logoControls=make('div',{class:'ink-branding-file-controls'});
    const logoChoose=make('button',{type:'button',class:'ink-branding-file-choose','data-ink-brand-choose':'logo'},'選擇圖檔');
    const logoFilename=make('span',{class:'ink-branding-file-name'},'未選擇檔案');
    const logoInput=make('input',{id:'inkBrandLogoFile',type:'file',accept:'image/png,image/jpeg,image/webp,image/gif,image/svg+xml',hidden:''});
    logoInput.hidden=true;
    logoControls.append(logoChoose,logoFilename,logoInput);
    logoRow.append(logoHeading,logoControls);content.append(logoRow);
    const faviconRow=make('div',{class:'ink-branding-file-row'});
    const ownerLink=make('a',{
      href:ownerUpload||'',target:'_blank',rel:'noopener noreferrer',
      'data-ink-brand-owner-favicon':''
    },'在 GitHub 更換 Favicon');
    faviconRow.append(make('label',{},'Favicon'),ownerLink);content.append(faviconRow);
    content.append(make('p',{id:'inkBrandHelp',class:'ink-branding-help'},
      'Favicon：在 GitHub 上傳 favicon-user.png 並提交，重新整理 INK 即生效。其他網站設定仍由 INK PUBLISH 發布。'));
    body.append(content);panel.append(body);
    const status=make('p',{class:'ink-branding-status',role:'status','aria-live':'polite'});
    status.hidden=true;panel.append(status);
    const footer=make('div',{class:'dialog-footer ink-branding-actions'});
    const clearButton=make('button',{type:'button','data-ink-brand-clear':''},'清除');
    const candidateButton=make('button',{type:'button','data-ink-brand-public-candidate':'',class:'primary'},'下載其他設定候選');
    const dismiss=make('button',{type:'button','data-ink-brand-close':''},'關閉');
    footer.append(clearButton,candidateButton,dismiss);panel.append(footer);
    backdrop.append(panel);
    return {backdrop,panel,header,close,nameInput,titleInput,logoImage,faviconImage,
      logoChoose,logoFilename,logoInput,ownerLink,status,clearButton,candidateButton,dismiss};
  }
  return createBrandingView;
})();

export function registerInkPublicViews(){
 globalThis.INK_SIZE_DIALOG_VIEW=Object.freeze({renderNewDocumentSizeDialog});
 globalThis.INK_BRANDING_VIEW=Object.freeze({createBrandingView});
}

// #765 V2 leased same-source pure UI view: ink017/tool-slices/toolbar-customizer-view.js
// Public-owned presentation only. No persistence, file IO, Native registry,
// command dispatch or application state belongs in this ESM.
export function createToolbarCustomizerDialog(doc){
 const dialog=doc.createElement('dialog');
 dialog.className='ink-toolbar-customize';
 dialog.setAttribute('aria-label','自訂工具列');
 dialog.innerHTML='<header class="ink-toolbar-customize-head"><strong>自訂工具列</strong><button type="button" data-tb-action="cancel" aria-label="關閉">×</button></header>'+
  '<p class="ink-toolbar-customize-description">自訂單欄工具組的排列與顯示。隱藏的工具可隨時從右側移回，所有 Native 工具功能仍保留。</p>'+
  '<div class="ink-toolbar-customize-columns"><section><h3>工具列</h3><div class="ink-toolbar-customize-list" data-tb-list="visible"></div></section>'+
  '<section><h3>輔助項目工具</h3><div class="ink-toolbar-customize-list" data-tb-list="extra"></div></section></div>'+
  '<p class="ink-toolbar-customize-status" role="status" aria-live="polite"></p>'+
  '<footer class="ink-toolbar-customize-actions"><button type="button" data-tb-action="reset">恢復預設</button>'+
  '<button type="button" data-tb-action="save">儲存預設…</button><button type="button" data-tb-action="load">載入預設…</button>'+
  '<span class="ink-toolbar-customize-actions-spacer"></span><button type="button" data-tb-action="cancel">取消</button>'+
  '<button type="button" class="ink-toolbar-customize-primary" data-tb-action="apply">完成</button></footer>';
 return dialog;
}

export function createToolbarCustomizerRow(doc,{group,kind,index,visibleLength}){
 const el=doc.createElement('div');el.className='ink-toolbar-customize-row';
 const picture=doc.createElement('span');picture.className='ink-toolbar-customize-icon';
 picture.innerHTML=group.icon;picture.setAttribute('aria-hidden','true');
 const label=doc.createElement('span');label.className='ink-toolbar-customize-label';
 label.textContent=group.label;el.append(picture,label);
 const action=(name,labelText,disabled=false)=>{
  const button=doc.createElement('button');button.type='button';button.textContent=labelText;
  button.dataset.tbAction=name;button.dataset.tbId=group.id;
  button.disabled=disabled;button.setAttribute('aria-label',group.label+'：'+labelText);
  el.append(button);
 };
 if(kind==='visible'){
  action('up','↑',index===0);
  action('down','↓',index===visibleLength-1);
  action('hide','移出',visibleLength===1);
 }else action('show','加入');
 return el;
}

export function toolbarCustomizerStatus(draft){
 return '顯示 '+draft.visible.length+' 組工具，輔助 '+draft.extra.length+' 組。設定只影響此瀏覽器的工具列。';
}

export const toolbarCustomizerView=/* @__PURE__ */Object.freeze({
 createDialog:createToolbarCustomizerDialog,
 createRow:createToolbarCustomizerRow,
 status:toolbarCustomizerStatus
});
