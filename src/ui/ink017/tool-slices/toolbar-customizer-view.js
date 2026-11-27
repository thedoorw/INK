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

export const toolbarCustomizerView=Object.freeze({
 createDialog:createToolbarCustomizerDialog,
 createRow:createToolbarCustomizerRow,
 status:toolbarCustomizerStatus
});
