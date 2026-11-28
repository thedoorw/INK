// Public presentation only. The private Native comparison adapter keeps its
// immutable session proxy, Renderer, lifecycle and read-only enforcement.
export function createReadonlyCompareView(documentObject=globalThis.document){
 const pair=documentObject.createElement('div');
 pair.id='inkDocumentPair';
 pair.className='ink-document-pair';
 const sidebar=documentObject.createElement('section');
 sidebar.className='ink-compare-readonly';
 sidebar.setAttribute('aria-label','唯讀比較文件');
 sidebar.innerHTML='<div class="ink-compare-label">Secondary · Read only</div><div class="ink-compare-canvas"><canvas aria-label="INK secondary read-only canvas"></canvas></div>';
 const host=sidebar.querySelector('.ink-compare-canvas');
 const canvas=sidebar.querySelector('canvas');
 if(!host||!canvas)throw Error('INK_UI_COMPARE_VIEW_CONTRACT');
 return {pair,sidebar,host,canvas};
}
