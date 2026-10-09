const escapeText=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const run=(ctx,id,args={})=>{
  try{
    const result=ctx.commands.execute(id,args);
    if(result?.then)return result.then(value=>{if(value?.ok===false)ctx.services.report(value.error?.message||'操作失敗');return value;}).catch(error=>ctx.services.report(error?.message||String(error)));
    if(result?.ok===false)ctx.services.report(result.error?.message||'操作失敗');
    return result;
  }catch(error){ctx.services.report(error?.message||String(error));return null;}
};
const button=(action,label,pressed=false)=>'<button type="button" data-action="'+action+'"'+(pressed?' aria-pressed="true"':'')+'>'+label+'</button>';

export function createMinimalControlsModule(){
  return Object.freeze({id:'minimal.controls.v1',slot:'controls',mount(ctx){
    const render=()=>{
      const tool=ctx.selectors.get('tool.current'),history=ctx.selectors.get('history.summary')||{},doc=ctx.selectors.get('document.current')||{};
      const sessions=ctx.selectors.get('session.list')||[],comparison=ctx.selectors.get('session.compare')||{},clip=ctx.selectors.get('session.transfer')||{},views=ctx.selectors.get('session.views')||{layout:1};
      const sessionButtons=sessions.map(item=>'<button type="button" data-action="session-select" data-session-id="'+escapeText(item.sessionId)+'" aria-pressed="'+Boolean(item.active)+'" title="'+escapeText(item.title)+'">'+escapeText(item.title||'Untitled')+(item.dirty?' *':'')+'</button>').join('');
      const compareCandidate=sessions.find(item=>!item.active&&item.sessionId!==comparison.secondary);
      const compareToggle=comparison.secondary?'Compare off':compareCandidate?'Compare '+escapeText(compareCandidate.title||'B'):'Compare (open B)';

      ctx.root.innerHTML=
        '<div class="ink-control-group">'+button('new-a4','New A4')+button('open','Open')+button('save','Save')+'</div>'+
        '<div class="ink-control-group ink-session-buttons">'+sessionButtons+button('session-close','Close')+(views.enabled?'':button('session-compare',compareToggle))+button('view-1','1 view',views.enabled&&views.layout===1)+button('view-2','2 views',views.enabled&&views.layout===2)+button('view-4','4 views',views.enabled&&views.layout===4)+button('session-copy','Copy selected')+button('session-paste','Paste'+(clip.ready?' ('+clip.count+')':''))+'</div>'+
        '<div class="ink-control-group">'+button('tool-select','Select',tool==='select')+button('tool-pen','Pen',tool==='pen')+button('tool-brush','Brush',tool==='brush')+button('tool-pan','Pan',tool==='pan')+'</div>'+
        '<div class="ink-control-group">'+button('undo','Undo',false)+(button('redo','Redo',false))+button('fit','Fit')+button('zoom100','100%')+'</div>'+
        '<div class="ink-control-group">'+button('preview','Preview',ctx.services.isPreviewVisible())+button('export-png','PNG')+button('export-svg','SVG')+button('export-pdf','PDF')+'</div>'+
        '<span class="ink-control-spacer"></span><span class="ink-state-meta">'+escapeText(doc.open?(doc.dirty?'dirty':'saved'):'no document')+' · '+(history.applied||0)+' history</span>';
    };
    let frame=0;const schedule=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;render();});};
    render();
    ctx.listen(ctx.root,'click',event=>{
      const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;
      if(action==='session-select'){run(ctx,'session.activate.v1',{sessionId:event.target.closest('[data-session-id]')?.dataset.sessionId});return;}
      if(/^view-[124]$/.test(action)){run(ctx,'session.view.layout.v1',{layout:Number(action.slice(5))});return;}
      if(action==='session-copy'){run(ctx,'session.copy.v1');return;}
      if(action==='session-paste'){run(ctx,'session.paste.v1');return;}
      if(action==='session-compare'){
        const comparison=ctx.selectors.get('session.compare')||{},sessions=ctx.selectors.get('session.list')||[];
        const candidate=sessions.find(item=>!item.active&&item.sessionId!==comparison.secondary);
        run(ctx,'session.compare.v1',{sessionId:comparison.secondary?null:candidate?.sessionId||null});return;
      }
      if(action==='session-close'){
        const sessions=ctx.selectors.get('session.list')||[],active=sessions.find(item=>item.active);
        if(!active)return;
        let decision='discard';
        if(active.dirty){
          decision=window.prompt('Close dirty document: enter save / discard / cancel','cancel');
          if(!['save','discard'].includes(decision))return;
        }
        run(ctx,'session.close.v1',{sessionId:active.sessionId,decision});return;
      }
      if(action==='new-a4')run(ctx,'document.new.v1',{preset:'A4',units:'mm',width:210,height:297,ppi:300,orientation:'portrait'});
      else if(action==='open')ctx.services.openProject();
      else if(action==='save')run(ctx,'document.save.v1');
      else if(action.startsWith('tool-'))run(ctx,'tool.activate.v1',{tool:action.slice(5)});
      else if(action==='undo')run(ctx,'history.undo.v1');
      else if(action==='redo')run(ctx,'history.redo.v1');
      else if(action==='fit')run(ctx,'view.fit.content.v1');
      else if(action==='zoom100')run(ctx,'view.zoom.set.v1',{scale:1});
      else if(action==='preview')ctx.services.togglePreview();
      else if(action.startsWith('export-'))ctx.services.exportDocument({format:action.slice(7),scope:'artboard',ppi:300,background:true}).catch(error=>ctx.services.report(error?.message||String(error)));
    });
    ctx.selectors.subscribe(schedule);ctx.cleanup(()=>{if(frame)cancelAnimationFrame(frame);});ctx.cleanup(ctx.services.bindPreview(schedule));
  }});
}

export function createMinimalStateModule(){
  return Object.freeze({id:'minimal.state.v1',slot:'state',mount(ctx){
    const render=()=>{
      const doc=ctx.selectors.get('document.current')||{},page=ctx.selectors.get('page.active')||{},layers=ctx.selectors.get('layer.list')||[],history=ctx.selectors.get('history.summary')||{entries:[],applied:0};
      const preview=ctx.services.isPreviewVisible()?ctx.selectors.get('page.preview',{width:240,height:160}):null;
      const layerRows=layers.slice().reverse().map(layer=>'<div class="ink-state-row"><button type="button" class="'+(layer.active?'active':'')+'" data-layer-id="'+escapeText(layer.id)+'">'+escapeText(layer.name)+'</button><span class="ink-state-meta">'+layer.objectCount+'</span></div>').join('');
      const historyRows=(history.entries||[]).map((entry,index)=>'<button type="button" class="ink-history-row'+(history.applied===index+1?' active':'')+'" data-history-applied="'+(index+1)+'"><span>'+escapeText(entry.label)+'</span><span>'+(entry.applied?'✓':'↺')+'</span></button>').join('');
      ctx.root.innerHTML=
        '<section class="ink-state-section"><h2>Document</h2><div class="ink-state-body"><div>'+escapeText(doc.title||'Untitled')+'</div><div class="ink-state-meta">'+escapeText(page.name||'')+' · '+(doc.dirty?'dirty':'clean')+'</div></div></section>'+
        '<details class="ink-state-section"><summary>New custom</summary><div class="ink-state-body"><div class="ink-custom-grid"><label>Width mm<input data-custom="width" type="number" min="10" max="5000" value="210"></label><label>Height mm<input data-custom="height" type="number" min="10" max="5000" value="297"></label><label>PPI<select data-custom="ppi"><option>72</option><option>96</option><option>150</option><option selected>300</option><option>600</option></select></label><label>Orientation<select data-custom="orientation"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label></div><button type="button" data-new-custom class="ink-block-action ink-block-action-primary">Create</button></div></details>'+
        '<section class="ink-state-section"><h2>Layers</h2><div class="ink-state-body">'+layerRows+'<button type="button" data-layer-add class="ink-block-action">+ Layer</button></div></section>'+
        '<section class="ink-state-section"><h2>History</h2><div class="ink-state-body">'+historyRows+'</div></section>'+
        (ctx.services.isPreviewVisible()?'<section class="ink-state-section"><h2>Preview</h2><div class="ink-state-body">'+(preview?.dataUrl?'<img class="ink-preview" alt="Current page preview" src="'+preview.dataUrl+'">':'<div class="ink-state-meta">No preview</div>')+'</div></section>':'');
      const appRoot=document.getElementById('app');if(appRoot)appRoot.dataset.documentActive=String(Boolean(doc.open));
    };
    let frame=0;const schedule=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;render();});};
    render();
    ctx.listen(ctx.root,'click',event=>{
      const layerId=event.target.closest('[data-layer-id]')?.dataset.layerId;
      if(layerId){run(ctx,'layer.activate.v1',{layerId});return;}
      const historyButton=event.target.closest('[data-history-applied]');
      if(historyButton){run(ctx,'history.jump.v1',{applied:Number(historyButton.dataset.historyApplied)});return;}
      if(event.target.closest('[data-layer-add]')){run(ctx,'layer.create.v1');return;}
      if(event.target.closest('[data-new-custom]')){
        const value=key=>ctx.root.querySelector('[data-custom="'+key+'"]')?.value;
        run(ctx,'document.new.v1',{preset:'custom',units:'mm',width:Number(value('width')),height:Number(value('height')),ppi:Number(value('ppi')),orientation:value('orientation')});
      }
    });
    ctx.selectors.subscribe(schedule);ctx.cleanup(()=>{if(frame)cancelAnimationFrame(frame);});ctx.cleanup(ctx.services.bindPreview(schedule));
  }});
}

export function createMinimalStatusModule(){
  return Object.freeze({id:'minimal.status.v1',slot:'status',mount(ctx){
    const render=()=>{
      const doc=ctx.selectors.get('document.current')||{},view=ctx.selectors.get('view.current')||{},tool=ctx.selectors.get('tool.current')||'',identity=ctx.services.buildIdentity();
      const worker=identity.worker||{};
      ctx.root.innerHTML='<span>INK minimal test shell</span><span>'+escapeText(tool)+'</span><span>'+Math.round((view.scale||1)*100)+'%</span><span>source '+escapeText(identity.sourceBuildId||'unbound')+'</span><span>SW '+escapeText(worker.state||'idle')+'</span><span>'+escapeText(doc.dirty?'autosave pending/dirty':'ready')+'</span>';
    };
    let frame=0;const schedule=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;render();});};
    render();ctx.selectors.subscribe(schedule);ctx.cleanup(()=>{if(frame)cancelAnimationFrame(frame);});
  }});
}
