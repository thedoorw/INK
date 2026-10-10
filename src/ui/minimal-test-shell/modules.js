import { ARTBOARD_PPI_MAX, ARTBOARD_PPI_MIN } from '../../document/artboard.js';
import { canvasSizePreview, dimensionToMm, mmToDimension, normalizeNewDocumentSizeRequest } from '../../document/size.js';

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
      else if(action.startsWith('export-'))ctx.services.exportDocument({format:action.slice(7),scope:'artboard',background:true}).catch(error=>ctx.services.report(error?.message||String(error)));
    });
    ctx.selectors.subscribe(schedule);ctx.cleanup(()=>{if(frame)cancelAnimationFrame(frame);});ctx.cleanup(ctx.services.bindPreview(schedule));
  }});
}

export function createMinimalStateModule(){
  return Object.freeze({id:'minimal.state.v1',slot:'state',mount(ctx){
    const presetKey='ink-document-size-presets-v1';
    const activeSession=()=>{const list=ctx.selectors.get('session.list')||[];return list.find(item=>item.active)||null;};
    const loadPresets=()=>{try{const value=JSON.parse(localStorage.getItem(presetKey)||'[]');return Array.isArray(value)?value.slice(0,24):[];}catch{return[];}};
    const savePresets=value=>{try{localStorage.setItem(presetKey,JSON.stringify(value.slice(0,24)));return true;}catch{return false;}};
    const anchorOptions=()=>['top-left','top','top-right','left','center','right','bottom-left','bottom','bottom-right']
      .map(value=>'<label class="ink-anchor-cell"><input type="radio" name="size-anchor" value="'+value+'"'+(value==='center'?' checked':'')+'><span>'+value+'</span></label>').join('');
    const dialogOpen=()=>ctx.root.querySelector('dialog[open]');
    const bindTarget=dialog=>{
      const session=activeSession(),page=ctx.selectors.get('page.active')||{};
      dialog.dataset.sessionId=session?.sessionId||'';dialog.dataset.documentId=session?.documentId||'';dialog.dataset.pageId=page.id||'';
    };
    const targetCurrent=dialog=>{
      const session=activeSession(),page=ctx.selectors.get('page.active')||{};
      return Boolean(session&&session.sessionId===dialog.dataset.sessionId&&session.documentId===dialog.dataset.documentId&&page.id===dialog.dataset.pageId);
    };
    const input=(dialog,name)=>dialog.querySelector('[data-size-field="'+name+'"]');
    const number=(dialog,name)=>Number(input(dialog,name)?.value);
    const unit=(dialog)=>input(dialog,'units')?.value||'mm';
    const ppi=(dialog)=>{const raw=input(dialog,'ppi')?.value;return raw==null||raw.trim()===''?NaN:Number(raw);};
    const syncRatio=dialog=>{const w=number(dialog,'width'),h=number(dialog,'height');if(Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0)dialog.dataset.ratio=String(w/h);};
    const changeUnits=(dialog,next)=>{const old=dialog.dataset.units||unit(dialog),page=ctx.selectors.get('page.active')||{},ppiValue=dialog.dataset.sizeDialog==='new'?ppi(dialog):page.artboard?.ppi||300;try{const converted=[];for(const name of ['width','height']){const field=input(dialog,name);if(!field)continue;const raw=field.value.trim();if(raw===''||field.validity.badInput)throw new Error('Enter valid dimensions before changing units');const value=Number(raw);if(!Number.isFinite(value))throw new Error('Enter valid dimensions before changing units');const mm=dimensionToMm(value,old,ppiValue,{delta:dialog.dataset.sizeDialog==='canvas'&&input(dialog,'mode')?.value==='relative'});converted.push([field,String(mmToDimension(mm,next,ppiValue))]);}for(const [field,value] of converted)field.value=value;dialog.dataset.units=next;syncRatio(dialog);return true;}catch(error){input(dialog,'units').value=old;dialog.querySelector('[data-size-preview]').textContent=error?.message||String(error);return false;}};
    const selectedAnchor=dialog=>dialog.querySelector('input[name="size-anchor"]:checked')?.value||'center';
    const updateNewPreview=dialog=>{
      try{
        const spec=normalizeNewDocumentSizeRequest({preset:'custom',units:unit(dialog),width:number(dialog,'width'),height:number(dialog,'height'),ppi:ppi(dialog)});
        dialog.querySelector('[data-size-preview]').textContent=spec.width+' × '+spec.height+' '+spec.sourceUnits+' · '+spec.orientation+' · '+spec.pixels.width+' × '+spec.pixels.height+' px';
      }catch(error){dialog.querySelector('[data-size-preview]').textContent=error?.message||String(error);}
    };
    const updateCanvasPreview=dialog=>{
      try{
        const page=ctx.selectors.get('page.active')||{},preview=canvasSizePreview(page,{
          relative:input(dialog,'mode')?.value==='relative',units:unit(dialog),width:number(dialog,'width'),height:number(dialog,'height'),anchor:selectedAnchor(dialog)
        });
        const node=dialog.querySelector('[data-size-preview]');
        node.textContent=preview.before.widthMm+' × '+preview.before.heightMm+' mm → '+preview.after.widthMm+' × '+preview.after.heightMm+' mm · outside content preserved / clipped at bounds';
        const before=dialog.querySelector('.ink-canvas-before'),after=dialog.querySelector('.ink-canvas-after');
        if(before&&after){const max=Math.max(preview.before.widthMm,preview.before.heightMm,preview.after.widthMm,preview.after.heightMm);before.style.width=(preview.before.widthMm/max*100)+'%';before.style.height=(preview.before.heightMm/max*100)+'%';after.style.width=(preview.after.widthMm/max*100)+'%';after.style.height=(preview.after.heightMm/max*100)+'%';}
      }catch(error){dialog.querySelector('[data-size-preview]').textContent=error?.message||String(error);}
    };
    const initializeDialog=(dialog,kind)=>{
      const page=ctx.selectors.get('page.active')||{},art=page.artboard||{widthMm:210,heightMm:297,ppi:300,unit:'mm'};
      bindTarget(dialog);
      if(kind==='new'){input(dialog,'units').value='mm';input(dialog,'width').value=210;input(dialog,'height').value=297;input(dialog,'ppi').value=300;dialog.dataset.ratio=String(210/297);updateNewPreview(dialog);}
      else if(kind==='canvas'){input(dialog,'units').value=art.unit||'mm';input(dialog,'mode').value='absolute';input(dialog,'width').value=mmToDimension(art.widthMm,unit(dialog),art.ppi);input(dialog,'height').value=mmToDimension(art.heightMm,unit(dialog),art.ppi);updateCanvasPreview(dialog);}
      else if(kind==='ppi'){input(dialog,'ppi').value=art.ppi||300;dialog.querySelector('[data-size-preview]').textContent='Current '+art.widthMm+' × '+art.heightMm+' mm';}
      else if(kind==='artwork'){input(dialog,'units').value=art.unit||'mm';input(dialog,'width').value=mmToDimension(art.widthMm,unit(dialog),art.ppi);input(dialog,'height').value=mmToDimension(art.heightMm,unit(dialog),art.ppi);dialog.dataset.ratio=String(art.widthMm/art.heightMm);dialog.querySelector('[data-size-preview]').textContent='Canvas and root artwork scale together; raster source pixels remain unchanged.';}
      dialog.dataset.units=unit(dialog)||'mm';dialog.showModal();setTimeout(()=>dialog.querySelector('input,select,button')?.focus(),0);
    };
    const render=()=>{
      const doc=ctx.selectors.get('document.current')||{},page=ctx.selectors.get('page.active')||{},layers=ctx.selectors.get('layer.list')||[],history=ctx.selectors.get('history.summary')||{entries:[],applied:0};
      const preview=ctx.services.isPreviewVisible()?ctx.selectors.get('page.preview',{width:240,height:160}):null;
      const layerRows=layers.slice().reverse().map(layer=>'<div class="ink-state-row"><button type="button" class="'+(layer.active?'active':'')+'" data-layer-id="'+escapeText(layer.id)+'">'+escapeText(layer.name)+'</button><span class="ink-state-meta">'+layer.objectCount+'</span></div>').join('');
      const historyRows=(history.entries||[]).map((entry,index)=>'<button type="button" class="ink-history-row'+(history.applied===index+1?' active':'')+'" data-history-applied="'+(index+1)+'"><span>'+escapeText(entry.label)+'</span><span>'+(entry.applied?'✓':'↺')+'</span></button>').join('');
      const presetOptions=loadPresets().map((item,index)=>'<option value="'+index+'">'+escapeText(item.name||('Preset '+(index+1)))+'</option>').join('');
      ctx.root.innerHTML=
        '<section class="ink-state-section"><h2>Document</h2><div class="ink-state-body"><div>'+escapeText(doc.title||'Untitled')+'</div><div class="ink-state-meta">'+escapeText(page.name||'')+' · '+(doc.dirty?'dirty':'clean')+'</div><div class="ink-size-actions"><button data-size-open="new">New…</button><button data-size-open="canvas">Canvas Size…</button><button data-size-open="ppi">Output PPI…</button><button data-size-open="artwork">Resize Artwork…</button></div></div></section>'+
        '<section class="ink-state-section"><h2>Layers</h2><div class="ink-state-body">'+layerRows+'<button type="button" data-layer-add class="ink-block-action">+ Layer</button></div></section>'+
        '<section class="ink-state-section"><h2>History</h2><div class="ink-state-body">'+historyRows+'</div></section>'+
        (ctx.services.isPreviewVisible()?'<section class="ink-state-section"><h2>Preview</h2><div class="ink-state-body">'+(preview?.dataUrl?'<img class="ink-preview" alt="Current page preview" src="'+preview.dataUrl+'">':'<div class="ink-state-meta">No preview</div>')+'</div></section>':'')+
        '<dialog class="ink-size-dialog" data-size-dialog="new" aria-labelledby="ink-new-title"><h2 id="ink-new-title">New Document</h2><div class="ink-size-grid"><label>Units<select data-size-field="units"><option>px</option><option selected>mm</option><option>cm</option><option>in</option></select></label><label>Width<input data-size-field="width" type="number" step="any"></label><label>Height<input data-size-field="height" type="number" step="any"></label><label>PPI<input data-size-field="ppi" type="number" min="'+ARTBOARD_PPI_MIN+'" max="'+ARTBOARD_PPI_MAX+'" step="1"></label></div><label><input data-size-field="lock" type="checkbox" checked> Lock proportions</label><div class="ink-size-row"><button data-size-swap type="button">Swap orientation</button><select data-size-preset><option value="">Local preset…</option>'+presetOptions+'</select><button data-size-save-preset type="button">Save preset</button></div><div class="ink-size-preview" data-size-preview></div><div class="ink-size-dialog-actions"><button data-size-cancel type="button">Cancel</button><button data-size-apply type="button">Create</button></div></dialog>'+
        '<dialog class="ink-size-dialog" data-size-dialog="canvas" aria-labelledby="ink-canvas-title"><h2 id="ink-canvas-title">Canvas Size</h2><div class="ink-size-grid"><label>Mode<select data-size-field="mode"><option value="absolute">Absolute</option><option value="relative">Relative</option></select></label><label>Units<select data-size-field="units"><option>px</option><option>mm</option><option>cm</option><option>in</option></select></label><label>Width<input data-size-field="width" type="number" step="any"></label><label>Height<input data-size-field="height" type="number" step="any"></label></div><fieldset class="ink-anchor-grid"><legend>Anchor</legend>'+anchorOptions()+'</fieldset><div class="ink-canvas-preview" aria-hidden="true"><span class="ink-canvas-before"></span><span class="ink-canvas-after"></span></div><div class="ink-size-preview" data-size-preview></div><div class="ink-size-dialog-actions"><button data-size-cancel type="button">Cancel</button><button data-size-apply type="button">Apply</button></div></dialog>'+
        '<dialog class="ink-size-dialog" data-size-dialog="ppi" aria-labelledby="ink-ppi-title"><h2 id="ink-ppi-title">Output Resolution</h2><label>PPI<input data-size-field="ppi" type="number" min="'+ARTBOARD_PPI_MIN+'" max="'+ARTBOARD_PPI_MAX+'" step="1"></label><div class="ink-size-preview" data-size-preview></div><p class="ink-state-meta">Geometry and raster source pixels are preserved.</p><div class="ink-size-dialog-actions"><button data-size-cancel type="button">Cancel</button><button data-size-apply type="button">Apply</button></div></dialog>'+
        '<dialog class="ink-size-dialog" data-size-dialog="artwork" aria-labelledby="ink-artwork-title"><h2 id="ink-artwork-title">Resize Whole Artwork</h2><div class="ink-size-grid"><label>Units<select data-size-field="units"><option>px</option><option>mm</option><option>cm</option><option>in</option></select></label><label>Width<input data-size-field="width" type="number" step="any"></label><label>Height<input data-size-field="height" type="number" step="any"></label></div><label><input data-size-field="lock" type="checkbox" checked> Lock proportions</label><fieldset class="ink-anchor-grid"><legend>Anchor</legend>'+anchorOptions()+'</fieldset><div class="ink-size-preview" data-size-preview></div><div class="ink-size-dialog-actions"><button data-size-cancel type="button">Cancel</button><button data-size-apply type="button">Apply</button></div></dialog>';
      const appRoot=document.getElementById('app');if(appRoot)appRoot.dataset.documentActive=String(Boolean(doc.open));
    };
    let frame=0;const schedule=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;const open=dialogOpen();if(open){if(!targetCurrent(open)){open.close();ctx.services.report('Document changed while size dialog was open');render();}return;}render();});};
    render();
    ctx.listen(ctx.root,'click',event=>{
      const opener=event.target.closest('[data-size-open]');if(opener){const d=ctx.root.querySelector('[data-size-dialog="'+opener.dataset.sizeOpen+'"]');if(d)initializeDialog(d,opener.dataset.sizeOpen);return;}
      const dialog=event.target.closest('dialog[data-size-dialog]');
      if(dialog&&event.target.closest('[data-size-cancel]')){dialog.close();return;}
      if(dialog&&event.target.closest('[data-size-swap]')){const w=input(dialog,'width').value;input(dialog,'width').value=input(dialog,'height').value;input(dialog,'height').value=w;syncRatio(dialog);updateNewPreview(dialog);return;}
      if(dialog&&event.target.closest('[data-size-save-preset]')){try{const spec=normalizeNewDocumentSizeRequest({preset:'custom',units:unit(dialog),width:number(dialog,'width'),height:number(dialog,'height'),ppi:ppi(dialog)});const name=window.prompt('Preset name','Custom');if(!name?.trim())return;const presets=loadPresets();presets.push({name:name.trim(),units:spec.sourceUnits,width:spec.width,height:spec.height,ppi:spec.ppi});savePresets(presets);ctx.services.report('Preset saved');dialog.close();render();}catch(error){ctx.services.report(error?.message||String(error));}return;}
      
      if(dialog&&event.target.closest('[data-size-apply]')){
        if(!targetCurrent(dialog)){dialog.close();ctx.services.report('Document changed while size dialog was open');return;}
        const kind=dialog.dataset.sizeDialog;let result=null;
        if(kind==='new')result=run(ctx,'document.new.v1',{preset:'custom',units:unit(dialog),width:number(dialog,'width'),height:number(dialog,'height'),ppi:ppi(dialog)});
        else if(kind==='canvas')result=run(ctx,'page.canvas.resize.v1',{relative:input(dialog,'mode').value==='relative',units:unit(dialog),width:number(dialog,'width'),height:number(dialog,'height'),anchor:selectedAnchor(dialog)});
        else if(kind==='ppi')result=run(ctx,'page.output-ppi.set.v1',{ppi:ppi(dialog)});
        else result=run(ctx,'page.artwork.resize.v1',{units:unit(dialog),width:number(dialog,'width'),height:number(dialog,'height'),preserveAspect:Boolean(input(dialog,'lock')?.checked),primary:'width',anchor:selectedAnchor(dialog)});
        if(result?.then)result.then(value=>{if(value?.ok!==false)dialog.close();});else if(result?.ok!==false)dialog.close();return;
      }
      const layerId=event.target.closest('[data-layer-id]')?.dataset.layerId;if(layerId){run(ctx,'layer.activate.v1',{layerId});return;}
      const historyButton=event.target.closest('[data-history-applied]');if(historyButton){run(ctx,'history.jump.v1',{applied:Number(historyButton.dataset.historyApplied)});return;}
      if(event.target.closest('[data-layer-add]'))run(ctx,'layer.create.v1');
    });
    ctx.listen(ctx.root,'input',event=>{
      const dialog=event.target.closest('dialog[data-size-dialog]');if(!dialog)return;
      const changed=event.target.dataset.sizeField;
      if(event.target.matches('[data-size-preset]')){const chosen=event.target.value;if(chosen!==''){const preset=loadPresets()[Number(chosen)];if(preset){input(dialog,'units').value=preset.units;input(dialog,'width').value=preset.width;input(dialog,'height').value=preset.height;input(dialog,'ppi').value=preset.ppi;dialog.dataset.units=preset.units;syncRatio(dialog);updateNewPreview(dialog);}}return;}
      if(changed==='mode'&&dialog.dataset.sizeDialog==='canvas'){const relative=input(dialog,'mode').value==='relative',page=ctx.selectors.get('page.active')||{},art=page.artboard||{};for(const name of ['width','height'])input(dialog,name).value=relative?'0':String(mmToDimension(art[name==='width'?'widthMm':'heightMm'],unit(dialog),art.ppi));updateCanvasPreview(dialog);return;}
      if(changed==='units'){if(!changeUnits(dialog,unit(dialog)))return;if(dialog.dataset.sizeDialog==='canvas')updateCanvasPreview(dialog);else if(dialog.dataset.sizeDialog==='new')updateNewPreview(dialog);return;}
      if(dialog.dataset.sizeDialog==='new'||dialog.dataset.sizeDialog==='artwork'){
        const locked=Boolean(input(dialog,'lock')?.checked),field=event.target.dataset.sizeField;
        if((field==='width'||field==='height')&&locked){
          const w=number(dialog,'width'),h=number(dialog,'height'),ratio=Number(dialog.dataset.ratio);if(!Number.isFinite(ratio)||ratio<=0)return;
          if(field==='width'&&Number.isFinite(w))input(dialog,'height').value=Number((w/ratio).toFixed(4));
          else if(Number.isFinite(h))input(dialog,'width').value=Number((h*ratio).toFixed(4));
        }else if((field==='width'||field==='height')&&!locked){
          const w=number(dialog,'width'),h=number(dialog,'height');if(Number.isFinite(w)&&Number.isFinite(h)&&h>0)dialog.dataset.ratio=String(w/h);
        }
        if(dialog.dataset.sizeDialog==='new')updateNewPreview(dialog);
      }else if(dialog.dataset.sizeDialog==='canvas')updateCanvasPreview(dialog);
      else if(dialog.dataset.sizeDialog==='ppi'){const page=ctx.selectors.get('page.active')||{},art=page.artboard||{};try{const spec=normalizeNewDocumentSizeRequest({preset:'custom',units:'mm',width:art.widthMm,height:art.heightMm,ppi:ppi(dialog)});dialog.querySelector('[data-size-preview]').textContent=spec.pixels.width+' × '+spec.pixels.height+' px';}catch(error){dialog.querySelector('[data-size-preview]').textContent=error?.message||String(error);}
      }
    });
    ctx.listen(ctx.root,'change',event=>{if(event.target.matches('[data-size-preset]'))event.target.dispatchEvent(new Event('input',{bubbles:true}));});
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
