// Multi-document 002: presentation leases only. The registry and the shared InkApp
// remain the sole native document and command mutation authorities.
const fail=code=>{throw Object.assign(new Error(code),{code});};
const identity=entry=>Object.freeze({sessionId:entry.sessionId,documentId:entry.documentId,generation:entry.generation,pageId:entry.doc?.activePageId||null});
const cellCount=layout=>layout===4?4:layout===2?2:1;

export function installMultiViewWorkspace(app,{createFixedView}={}){
  if(!app?.sessions||!app?.renderer||typeof createFixedView!=='function')fail('INK_MULTIVIEW_DEPENDENCIES_REQUIRED');
  const registry=app.sessions,stage=app.el.wrap;
  let layout=1,enabled=false,grid=null,seq=0,disposed=false,rebuilding=false;
  let panes=[],views=new Map(),nodes=new Map(),hiddenIds=new Set(),referenceIds=new Set(),disposedViewCount=0;
  const assertOpen=id=>{const entry=registry.get(id);if(!entry||entry.state!=='OPEN')fail('INK_VIEW_SESSION_NOT_OPEN');return entry;};
  const active=()=>registry.activeId;
  const matches=p=>{const e=registry.get(p.target.sessionId);return !!e&&e.state==='OPEN'&&e.documentId===p.target.documentId&&e.generation===p.target.generation&&e.doc?.activePageId===p.target.pageId;};
  const find=id=>panes.find(p=>p.target.sessionId===id);
  const available=()=>[...registry.records.values()].filter(e=>e.state==='OPEN');
  // The registry may temporarily own a reference session (e.g. the last
  // editable session was closed). That is NOT an editing focus.
  const isReference=id=>Boolean(enabled&&referenceIds.has(id));
  const canEdit=()=>!enabled||(!disposed&&Boolean(registry.active()?.state==='OPEN')&&!isReference(active()));
  const assertCommandAllowed=commandId=>{
    if(canEdit())return true;
    // Recovery and document/session management are explicitly user-initiated
    // operations, never implicit editing of the current reference document.
    if(/^(session\.(?:view\.|close\.v1$|activate\.v1$|recovery\.restore\.v1$)|document\.(?:new|open)\.v1$)/.test(String(commandId)))return true;
    fail('INK_VIEW_READ_ONLY');
  };
  const fallbackAfterClose=({closedSessionId,originalActiveId}={})=>{
    if(!enabled)return null;
    const eligible=available().filter(e=>e.sessionId!==closedSessionId&&!isReference(e.sessionId));
    return eligible.find(e=>e.sessionId===originalActiveId)?.sessionId||
      eligible.find(e=>find(e.sessionId))?.sessionId||
      eligible[0]?.sessionId||null;
  };
  const summarize=()=>Object.freeze({enabled,layout,active:canEdit()?active():null,
    mode:canEdit()?'EDITING':'REFERENCE_ONLY',referenceSessionId:canEdit()?null:active(),
    visible:panes.map(p=>Object.freeze({...p.target,readOnly:p.readOnly,
      active:p.target.sessionId===active()&&!p.readOnly})),
    hidden:available().filter(e=>!find(e.sessionId)).map(e=>e.sessionId)});
  const ensureIdle=lease=>registry.assertIdle(lease);
  const shutdownView=id=>{const view=views.get(id);if(view){if(view.dispose()===true)disposedViewCount++;views.delete(id);} };
  const teardown=()=>{for(const id of [...views.keys()])shutdownView(id);views.clear();nodes.clear();};
  const stylePane=(node,p)=>{
    const current=p.target.sessionId===active()&&!p.readOnly;
    node.dataset.inkViewId=p.viewId;node.dataset.sessionId=p.target.sessionId;
    node.dataset.readOnly=String(p.readOnly);node.dataset.active=String(current);
    const title=node.querySelector('.ink-view-title'),label=node.querySelector('.ink-view-mode');
    const e=registry.get(p.target.sessionId);
    title.textContent=String(e?.doc?.title||'Untitled')+(e?.values?.dirty?' *':'');
    label.textContent=p.readOnly?'Reference · Read only':current?'Editing':'Editable';
    node.querySelector('[data-view-readonly]').textContent=p.readOnly?'Unlock':'Read only';
    node.querySelector('[data-view-readonly]').setAttribute('aria-pressed',String(p.readOnly));
  };
  function build(){
    if(!enabled||disposed)return;
    rebuilding=true;
    try{
      teardown();
      const fragment=document.createDocumentFragment();
      for(const pane of panes){
        const entry=assertOpen(pane.target.sessionId);
        const cell=document.createElement('section');cell.className='ink-view-pane';cell.dataset.inkViewId=pane.viewId;
        cell.innerHTML='<header class="ink-view-header"><button type="button" data-view-focus class="ink-view-title"></button><span class="ink-view-mode"></span><button type="button" data-view-readonly></button><button type="button" data-view-hide aria-label="Hide view">×</button></header><div class="ink-view-body"></div>';
        const body=cell.querySelector('.ink-view-body');
        if(entry.sessionId===active()&&!pane.readOnly)body.append(stage);
        else views.set(pane.viewId,createFixedView(entry,body,pane.target));
        stylePane(cell,pane);nodes.set(pane.viewId,cell);fragment.append(cell);
      }
      grid.replaceChildren(fragment);
      grid.dataset.layout=String(layout);
      app.renderer.resize();
    }finally{rebuilding=false;}
  }
  function ensureGrid(){
    if(grid)return;
    const parent=stage.parentElement;
    if(!parent)fail('INK_VIEW_STAGE_UNAVAILABLE');
    grid=document.createElement('div');grid.className='ink-view-grid';grid.setAttribute('aria-label','INK document views');
    parent.replaceChild(grid,stage);
    grid.addEventListener('pointerdown',event=>{
      const cell=event.target.closest('[data-ink-view-id]'),pane=cell&&panes.find(x=>x.viewId===cell.dataset.inkViewId);
      if(!pane||!event.target.closest('.ink-view-body'))return;
      if(pane.readOnly){event.preventDefault();event.stopImmediatePropagation();return;}
      if(pane.target.sessionId===active())return;
      event.preventDefault();event.stopImmediatePropagation();
      try{
        focus(pane.target.sessionId);
        // The original event was targeted at the inactive canvas. Re-admit the
        // pointer only after the primary native stage and target are rebound.
        if(event.isTrusted&&event.button===0)app.onPointerDown(event);
      }catch(error){app.toast?.(error.message,2200);}
    },true);
    grid.addEventListener('wheel',event=>{
      const cell=event.target.closest('[data-ink-view-id]'),pane=cell&&panes.find(x=>x.viewId===cell.dataset.inkViewId);
      if(!pane||!event.target.closest('.ink-view-body'))return;
      if(pane.readOnly){event.preventDefault();event.stopImmediatePropagation();return;}
      if(pane.target.sessionId===active())return;
      event.preventDefault();event.stopImmediatePropagation();
      try{focus(pane.target.sessionId);app.onWheel(event);}catch(error){app.toast?.(error.message,2200);}
    },{capture:true,passive:false});
    grid.addEventListener('click',event=>{
      const cell=event.target.closest('[data-ink-view-id]'),pane=cell&&panes.find(x=>x.viewId===cell.dataset.inkViewId);
      if(!pane||!matches(pane))return;
      if(event.target.closest('[data-view-focus]')){try{focus(pane.target.sessionId);}catch(error){app.toast?.(error.message,2200);}}
      else if(event.target.closest('[data-view-readonly]')){try{setReadOnly(pane.target.sessionId,!pane.readOnly);}catch(error){app.toast?.(error.message,2200);}}
      else if(event.target.closest('[data-view-hide]')){try{hide(pane.target.sessionId);}catch(error){app.toast?.(error.message,2200);}}
    });
  }
  function reconcile({includeActive=true}={}){
    if(!enabled||disposed||rebuilding)return;
    let dirty=false;
    for(const id of referenceIds)if(!registry.get(id)||registry.get(id).state==='CLOSED')referenceIds.delete(id);
    panes=panes.filter(p=>{
      const entry=registry.get(p.target.sessionId);
      if(!entry||entry.state!=='OPEN'){dirty=true;return false;}
      // A history/recovery document replacement must not reset an existing
      // reference flag when generation or page identity rotates.
      if(!matches(p)){p.target=identity(entry);dirty=true;}
      p.readOnly=isReference(entry.sessionId);
      return true;
    });
    if(includeActive&&active()&&!find(active())){
      const e=registry.active();
      if(e?.state==='OPEN'){
        if(panes.length>=cellCount(layout)){
          const drop=panes.findLastIndex(p=>!p.readOnly&&p.target.sessionId!==active());
          const index=drop>=0?drop:panes.length-1;
          panes.splice(index,1);
        }
        panes.push({viewId:'view-'+(++seq),target:identity(e),readOnly:isReference(e.sessionId)});dirty=true;
      }
    }
    while(panes.length<cellCount(layout)){
      const entry=available().find(e=>!find(e.sessionId)&&!hiddenIds.has(e.sessionId));
      if(!entry)break;
      panes.push({viewId:'view-'+(++seq),target:identity(entry),readOnly:isReference(entry.sessionId)});dirty=true;
    }
    if(dirty||nodes.size!==panes.length||panes.some(p=>(p.target.sessionId===active()&&!p.readOnly)!==!!nodes.get(p.viewId)?.querySelector('#stageWrap'))){build();return;}
    for(const pane of panes){
      const node=nodes.get(pane.viewId);
      if(node)stylePane(node,pane);
      if(pane.target.sessionId!==active()||pane.readOnly)views.get(pane.viewId)?.render();
    }
  }
  function setLayout(next,{lease=null}={}){
    if(![1,2,4].includes(Number(next)))fail('INK_VIEW_LAYOUT_UNSUPPORTED');
    ensureIdle(lease);
    const n=Number(next);
    if(app.multiDocument?.status()?.secondary)app.multiDocument.setCompare(null);
    layout=n;enabled=true;hiddenIds.clear();ensureGrid();
    if(panes.length>cellCount(layout)){
      const retained=panes.slice(0,cellCount(layout));
      if(active()&&!retained.some(p=>p.target.sessionId===active())){
        const old=panes.find(p=>p.target.sessionId===active());
        const entry=registry.active();
        if(entry)retained[retained.length-1]=old||{viewId:'view-'+(++seq),target:identity(entry),readOnly:isReference(entry.sessionId)};
      }
      panes=retained;
    }
    if(active()&&!find(active())){
      const e=registry.active();
      if(e)panes.push({viewId:'view-'+(++seq),target:identity(e),readOnly:isReference(e.sessionId)});
    }
    reconcile();if(grid)grid.dataset.layout=String(layout);app.commands?.notify?.('session-view-layout');return summarize();
  }
  function show(sessionId,{lease=null}={}){
    ensureIdle(lease);const entry=assertOpen(sessionId);
    hiddenIds.delete(sessionId);
    if(!enabled)setLayout(1,{lease});
    if(find(sessionId))return summarize();
    if(panes.length>=cellCount(layout)){
      const last=panes.findLastIndex(p=>p.target.sessionId!==active());
      if(last<0)fail('INK_VIEW_NO_REPLACEABLE_PANE');
      panes.splice(last,1);
    }
    panes.push({viewId:'view-'+(++seq),target:identity(entry),readOnly:isReference(sessionId)});
    build();app.commands?.notify?.('session-view-show');return summarize();
  }
  function focus(sessionId,{lease=null}={}){
    const entry=assertOpen(sessionId),pane=find(sessionId);
    if(pane?.readOnly||isReference(sessionId))fail('INK_VIEW_READ_ONLY');
    ensureIdle(lease);
    hiddenIds.delete(sessionId);
    if(entry.sessionId!==active())registry.activate(sessionId,{lease});
    if(enabled)reconcile();
    app.commands?.notify?.('session-view-focus');return identity(entry);
  }
  function setReadOnly(sessionId,readOnly,{lease=null}={}){
    ensureIdle(lease);
    const pane=find(sessionId);if(!pane||!matches(pane))fail('INK_VIEW_NOT_VISIBLE');
    if(readOnly&&sessionId===active()){
      const alternative=panes.find(p=>p.target.sessionId!==sessionId&&!p.readOnly&&matches(p));
      if(!alternative)fail('INK_VIEW_LAST_EDITABLE');
      focus(alternative.target.sessionId,{lease});
    }
    pane.readOnly=Boolean(readOnly);
    if(pane.readOnly)referenceIds.add(sessionId);else referenceIds.delete(sessionId);
    // Lifecycle may leave this registry session selected with no editing
    // authority. Explicit unlock rebuilds the native editor stage; it never
    // happens automatically merely because that session is selected.
    if(sessionId===active())build();
    const node=nodes.get(pane.viewId);if(node)stylePane(node,pane);
    app.commands?.notify?.('session-view-mode');return summarize();
  }
  function hide(sessionId,{lease=null}={}){
    ensureIdle(lease);const pane=find(sessionId);if(!pane)fail('INK_VIEW_NOT_VISIBLE');
    if(sessionId===active()){
      const other=panes.find(p=>p.target.sessionId!==sessionId&&!p.readOnly&&matches(p));
      if(!other)fail('INK_VIEW_LAST_EDITABLE');
      focus(other.target.sessionId,{lease});
    }
    panes=panes.filter(p=>p.viewId!==pane.viewId);
    hiddenIds.add(sessionId);
    // Keep a requested hidden document hidden until a deliberate Show/Focus.
    shutdownView(pane.viewId);
    build();app.commands?.notify?.('session-view-hide');return summarize();
  }
  const subscription=app.commands.subscribe(event=>{
    if(!enabled||rebuilding||disposed)return;
    if(['native-session-change','native-session-add','native-session-close','native-session-replaced'].includes(event.reason))reconcile();
    else if(event.type==='command'&&event.commandId?.startsWith('session.'))reconcile();
  });
  return Object.freeze({
    get enabled(){return enabled;},status:summarize,setLayout,show,focus,hide,setReadOnly,
    canEdit,assertCommandAllowed,fallbackAfterClose,
    sync:()=>reconcile(),diagnostics:()=>{
      const leasedViews=[...views.values()].map(v=>v.diagnostics());
      const primary=enabled&&canEdit()&&!!active()?1:0;
      const primaryCache=(app.renderer?.imageCache?.size||0)+(app.renderer?.paperTextureCache?.size||0)+
        (app.renderer?.studioImageCache?.size||0)+(app.renderer?.studioLayerCache?.size||0);
      return Object.freeze({layout,enabled,viewCount:panes.length,activeRendererCount:primary,
        readOnlyRenderers:views.size,totalLiveRenderers:primary+views.size,
        hiddenViewCount:hiddenIds.size,hiddenContinuousRenderers:0,disposedViewCount,
        leasedViews,cacheEntries:{primary:primaryCache,fixed:leasedViews.reduce((n,v)=>n+(v.cacheEntries||0),0)},
        autosaveTimerRefs:available().filter(e=>Boolean(e.autosaveTimer)).length});
    },
    dispose(){if(disposed)return false;disposed=true;subscription();teardown();if(grid){grid.replaceWith(stage);grid=null;app.renderer.resize();}panes=[];hiddenIds.clear();referenceIds.clear();return true;}
  });
}
