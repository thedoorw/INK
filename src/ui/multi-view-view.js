// Public-only presentation for the Native 1/2/4-document view workspace.
// The protected controller still owns session leases, editing focus, pointer
// admission, Renderer instances and command dispatch.
export function createMultiViewPane(documentObject=globalThis.document){
 const cell=documentObject.createElement('section');
 cell.className='ink-view-pane';
 cell.innerHTML='<header class="ink-view-header"><button type="button" data-view-focus class="ink-view-title"></button><span class="ink-view-mode"></span><button type="button" data-view-readonly></button><button type="button" data-view-hide aria-label="Hide view">×</button></header><div class="ink-view-body"></div>';
 return cell;
}

export function updateMultiViewPane(cell,{title,dirty=false,readOnly=false,active=false}={}){
 const heading=cell.querySelector('.ink-view-title');
 const mode=cell.querySelector('.ink-view-mode');
 const toggle=cell.querySelector('[data-view-readonly]');
 if(!heading||!mode||!toggle||!cell.querySelector('.ink-view-body')||!cell.querySelector('[data-view-hide]'))
  throw Error('INK_UI_MULTI_VIEW_CONTRACT');
 heading.textContent=String(title||'Untitled')+(dirty?' *':'');
 mode.textContent=readOnly?'Reference · Read only':active?'Editing':'Editable';
 toggle.textContent=readOnly?'Unlock':'Read only';
 toggle.setAttribute('aria-pressed',String(readOnly));
}

export function createMultiViewGrid(documentObject=globalThis.document){
 const grid=documentObject.createElement('div');
 grid.className='ink-view-grid';
 grid.setAttribute('aria-label','INK document views');
 return grid;
}

export function createFixedDocumentCanvas(documentObject=globalThis.document,title=''){
 const canvas=documentObject.createElement('canvas');
 canvas.setAttribute('aria-label','INK document '+String(title)+' canvas');
 canvas.className='ink-fixed-view-canvas';
 return canvas;
}
