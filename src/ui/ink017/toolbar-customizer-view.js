// Public presentation only. Toolbar IDs, persistence and Native operations
// remain with the compiled Workbench/controller.
export function toolbarCustomizerMarkup(){
 return '<header class="ink-toolbar-customize-head"><strong>自訂工具列</strong><button type="button" data-tb-action="cancel" aria-label="關閉">×</button></header>'+
  '<p class="ink-toolbar-customize-description">自訂單欄工具組的排列與顯示。隱藏的工具可隨時從右側移回，所有 Native 工具功能仍保留。</p>'+
  '<div class="ink-toolbar-customize-columns"><section><h3>工具列</h3><div class="ink-toolbar-customize-list" data-tb-list="visible"></div></section>'+
  '<section><h3>輔助項目工具</h3><div class="ink-toolbar-customize-list" data-tb-list="extra"></div></section></div>'+
  '<p class="ink-toolbar-customize-status" role="status" aria-live="polite"></p>'+
  '<footer class="ink-toolbar-customize-actions"><button type="button" data-tb-action="reset">恢復預設</button>'+
  '<button type="button" data-tb-action="save">儲存預設…</button><button type="button" data-tb-action="load">載入預設…</button>'+
  '<span class="ink-toolbar-customize-actions-spacer"></span><button type="button" data-tb-action="cancel">取消</button>'+
  '<button type="button" class="ink-toolbar-customize-primary" data-tb-action="apply">完成</button></footer>';
}

export function createToolbarCustomizerRow(group,{kind,index,visibleCount}){
 const id=group.id,el=document.createElement('div');
 el.className='ink-toolbar-customize-row';
 const picture=document.createElement('span');picture.className='ink-toolbar-customize-icon';picture.innerHTML=group.icon;picture.setAttribute('aria-hidden','true');
 const label=document.createElement('span');label.className='ink-toolbar-customize-label';label.textContent=group.label;
 el.append(picture,label);
 function action(name,labelText,disabled=false){
  const b=document.createElement('button');b.type='button';b.textContent=labelText;b.dataset.tbAction=name;b.dataset.tbId=id;
  b.disabled=disabled;b.setAttribute('aria-label',group.label+'：'+labelText);el.append(b);
 }
 if(kind==='visible'){
  action('up','↑',index===0);action('down','↓',index===visibleCount-1);
  action('hide','移出',visibleCount===1);
 }else action('show','加入');
 return el;
}

export const toolbarCustomizerPresentation=Object.freeze({toolbarCustomizerMarkup,createToolbarCustomizerRow});
