import {lifecycle,esc,nativeToolEmptyState,wireNativeToolEmptyState} from '../shared-controls.js';
export default lifecycle('paths',(s,h)=>{
 const state=h.select('path.list'),paths=state.paths||[],hasEditable=paths.some(path=>path.canEdit);
 const rows=paths.map(path=>{
  const ref={documentId:path.documentId,pageId:path.pageId,layerId:path.layerId,objectId:path.objectId};
  const value=esc(JSON.stringify(ref)),name=esc(path.name||'Path');
  const unavailable=path.canEdit?'':`disabled title="${esc(path.unavailableReason||'Path unavailable')}"`;
  return `<div class="list-row"><button type="button" class="list-name" data-path="${value}" aria-pressed="${!!path.selected}" ${unavailable}>${name}</button><button type="button" class="icon-button" data-path-edit="${value}" aria-label="Edit ${name}" ${unavailable}>✎</button></div>`;
 }).join('');
  const emptyMessage=paths.length?'':s.docs?.length?'<div class="ps-paths-empty" aria-label="目前沒有路徑"></div>':nativeToolEmptyState('No editable paths. The Pen tool draws strokes; activating it does not create an editable path.', 'pen', 'Use Pen tool', s);
 // The Photoshop footer is visible in an empty Paths panel; unsupported commands stay disabled.
 const footer=[['填滿路徑','●'],['描邊路徑','◯'],['路徑轉選取範圍','◌'],['選取範圍轉路徑','◎'],['新增路徑','＋'],['新增路徑遮色片','▧'],['刪除路徑','⌫']].map(([label,glyph])=>`<button type="button" disabled aria-label="${label}（未實作）" title="${label}（未實作）"><span aria-hidden="true">${glyph}</span></button>`).join('');
 return `<div class="swatch-groups ps-path-list">${rows}${emptyMessage}</div><div class="ps-paths-footer" role="toolbar" aria-label="路徑工具">${footer}</div>`;
},(r,h,signal)=>{
 wireNativeToolEmptyState(r,h,signal);
 r.addEventListener('click',e=>{const b=e.target.closest('[data-path],[data-path-edit]');if(!b||b.disabled)return;const ref=JSON.parse(b.dataset.path||b.dataset.pathEdit);h.execute(b.hasAttribute('data-path')?'path.select.v1':'path.edit.enter.v1',ref)},{signal});
});
