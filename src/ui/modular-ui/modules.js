const button = (label, action, extra='') => `<button type="button" data-action="${action}" ${extra}>${label}</button>`;
const iconButton = (label, action, glyph) => `<button type="button" class="mui-icon-btn" data-action="${action}" aria-label="${label}" title="${label}">${glyph}</button>`;

function run(ctx,id,args={}) {
  const result=ctx.commands.execute(id,args);
  if(result && typeof result.then==='function') {
    return result.then(value=>{ if(!value?.ok)ctx.services.report?.(value?.error?.message||id); return value; });
  }
  if(!result?.ok)ctx.services.report?.(result?.error?.message||id);
  return result;
}

function escapeSelector(value) {
  if (globalThis.CSS?.escape) return CSS.escape(String(value));
  return String(value).replace(/[^a-z0-9_-]/gi,char=>'\\\\'+char);
}

function focusDescriptor(root,node) {
  if (!node || !root.contains(node)) return null;
  const layer=node.closest?.('[data-layer-id]');
  if(layer&&node.dataset?.layerAction)return `[data-layer-id="${escapeSelector(layer.dataset.layerId)}"] [data-layer-action="${escapeSelector(node.dataset.layerAction)}"]`;
  for(const key of ['action','tool','option','panelAction','pageId','historyApplied']){
    if(node.dataset?.[key]!=null){
      const attr=key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase());
      return `[data-${attr}="${escapeSelector(node.dataset[key])}"]`;
    }
  }
  return null;
}

function rerenderOnState(ctx,render) {
  let frameId=0,dirty=false,disposed=false;
  const flush=()=>{
    frameId=0;
    if(disposed)return;
    const active=document.activeElement;
    if(active&&ctx.root.contains(active)&&active.matches?.('input,select,textarea,[contenteditable="true"]')){
      dirty=true;
      return;
    }
    const focusSelector=focusDescriptor(ctx.root,active);
    dirty=false;
    render();
    if(focusSelector){
      const next=ctx.root.querySelector(focusSelector);
      try{next?.focus?.({preventScroll:true});}catch{}
    }
  };
  const queue=()=>{
    dirty=true;
    if(frameId)return;
    frameId=requestAnimationFrame(flush);
  };
  ctx.selectors.subscribe(queue);
  ctx.listen(ctx.root,'focusout',()=>{if(dirty)queue();},true);
  ctx.cleanup(()=>{disposed=true;if(frameId)cancelAnimationFrame(frameId);frameId=0;});
  return queue;
}

export function createMenuModule() {
  return {
    id:'menu.common.v1', slot:'menu',
    mount(ctx) {
      ctx.root.innerHTML=`
        <div class="mui-menu-brand"><strong>INK</strong><span>MODULAR</span></div>
        <nav class="mui-menu-groups" aria-label="主選單">
          <div class="mui-menu-group"><span>檔案</span>
            ${button('新增','new')}${button('開啟','open')}${button('儲存','save')}${button('匯出 PNG','export')}
          </div>
          <div class="mui-menu-group"><span>編輯</span>
            ${button('復原','undo')}${button('重做','redo')}
          </div>
          <div class="mui-menu-group"><span>檢視</span>
            ${button('符合內容','fit')}${button('100%','zoom100')}
          </div>
          <div class="mui-menu-group"><span>工作區</span>
            ${button('創作','creation')}${button('圖紙','layout')}
          </div>
        </nav>`;
      const onClick=event=>{
        const action=event.target.closest('[data-action]')?.dataset.action;
        if(!action)return;
        if(action==='new')run(ctx,'document.new.v1');
        else if(action==='open')ctx.services.openProject?.();
        else if(action==='save')run(ctx,'document.save.v1');
        else if(action==='export')run(ctx,'export.png.v1',{download:true});
        else if(action==='undo')run(ctx,'history.undo.v1');
        else if(action==='redo')run(ctx,'history.redo.v1');
        else if(action==='fit')run(ctx,'view.fit.content.v1');
        else if(action==='zoom100')run(ctx,'view.zoom.set.v1',{scale:1});
        else if(action==='creation'||action==='layout')run(ctx,'workspace.activate.v1',{space:action});
      };
      ctx.listen(ctx.root,'click',onClick);
    }
  };
}

export function createToolsModule() {
  const tools=[
    ['select','選取','V'],['pen','鋼筆','B'],['brush','毛筆','I'],['eraser','橡皮擦','E'],
    ['shape','幾何','S'],['text','文字','T'],['pan','移動畫布','H']
  ];
  return {
    id:'tools.common.v1', slot:'tools',
    mount(ctx) {
      const render=()=>{
        const current=ctx.selectors.get('tool.current');
        ctx.root.innerHTML=`<div class="mui-tools" role="toolbar" aria-label="工具">${tools.map(([id,label,key])=>
          `<button type="button" data-tool="${id}" class="${current===id?'active':''}" aria-pressed="${current===id}" title="${label} (${key})"><span class="mui-tool-glyph">${label.slice(0,1)}</span><span>${label}</span></button>`).join('')}</div>`;
      };
      const onClick=event=>{const tool=event.target.closest('[data-tool]')?.dataset.tool;if(tool)run(ctx,'tool.activate.v1',{tool});};
      ctx.listen(ctx.root,'click',onClick);
      rerenderOnState(ctx,render);
      render();
    }
  };
}

export function createOptionsModule() {
  const drawTools=new Set(['pen','pencil','marker','brush','airbrush','eraser']);
  const shapes=[['line','線'],['arrow','箭頭'],['rect','矩形'],['ellipse','橢圓'],['triangle','三角形']];
  return {
    id:'options.context.v1', slot:'options',
    mount(ctx) {
      const render=()=>{
        const tool=ctx.selectors.get('tool.current');
        const settings=ctx.selectors.get('tool.settings',{tool:drawTools.has(tool)?tool:undefined})||{};
        const opts=ctx.selectors.get('tool.options')||{};
        let body=`<span class="mui-options-label">${tool||'工具'}</span>`;
        if(drawTools.has(tool)){
          body+=`<label>顏色 <input data-option="color" type="color" value="${settings.color||'#202020'}"></label>
            <label>大小 <input data-option="size" type="range" min=".5" max="120" step=".5" value="${settings.size||4}"><output>${Math.round((settings.size||4)*10)/10}</output></label>
            <label>透明度 <input data-option="opacity" type="range" min="1" max="100" value="${Math.round((settings.opacity??1)*100)}"><output>${Math.round((settings.opacity??1)*100)}%</output></label>`;
        } else if(tool==='shape') {
          body+=`<label>形狀 <select data-option="shape">${shapes.map(([id,label])=>`<option value="${id}" ${opts.shapeType===id?'selected':''}>${label}</option>`).join('')}</select></label>
            <label class="mui-check"><input data-option="shapeFill" type="checkbox" ${opts.shapeFill?'checked':''}> 填色</label>`;
        } else if(tool==='text') {
          body+=`<label>字型 <select data-option="fontFamily">
            <option value="system-ui">System UI</option><option value="serif" ${opts.font?.family==='serif'?'selected':''}>Serif</option><option value="sans-serif" ${opts.font?.family==='sans-serif'?'selected':''}>Sans</option>
            </select></label><label>字級 <input data-option="fontSize" type="number" min="4" max="512" value="${opts.font?.size||32}"></label>`;
        } else if(tool==='select') {
          body+=`<span class="mui-options-note">拖曳物件移動；控制點縮放／旋轉</span>`;
        } else if(tool==='pan') {
          body+=`<span class="mui-options-note">拖曳畫布平移；滾輪縮放</span>`;
        }
        ctx.root.innerHTML=`<div class="mui-options">${body}</div>`;
      };
      const apply=event=>{
        const node=event.target.closest('[data-option]');if(!node)return;
        const key=node.dataset.option;
        if(key==='color')run(ctx,'tool.color.set.v1',{color:node.value});
        else if(key==='size')run(ctx,'tool.setting.set.v1',{key:'size',value:Number(node.value)});
        else if(key==='opacity')run(ctx,'tool.setting.set.v1',{key:'opacity',value:Number(node.value)/100});
        else if(key==='shape')run(ctx,'tool.shape.set.v1',{shape:node.value});
        else if(key==='shapeFill')run(ctx,'tool.shape.fill.set.v1',{fill:node.checked});
        else if(key==='fontFamily')run(ctx,'tool.text.setting.set.v1',{key:'family',value:node.value});
        else if(key==='fontSize')run(ctx,'tool.text.setting.set.v1',{key:'size',value:Number(node.value)});
        const out=node.parentElement?.querySelector('output');
        if(out)out.value=key==='opacity'?node.value+'%':node.value;
      };
      ctx.listen(ctx.root,'input',apply);
      ctx.listen(ctx.root,'change',apply);
      rerenderOnState(ctx,render);
      render();
    }
  };
}

function createCanvasChromeModuleAtSlot(slot='canvas') {
  return {
    id:'canvas.chrome.v1', slot,
    mount(ctx) {
      ctx.root.innerHTML=`<div class="mui-canvas-toolbar" aria-label="畫布導覽">
        ${iconButton('縮小','zoomOut','−')}${iconButton('放大','zoomIn','+')}${button('符合內容','fit')}${button('符合圖紙','fitArtboard')}${button('重設','reset')}
        <span class="mui-canvas-spacer"></span><span data-zoom-readout>100%</span>
      </div><div class="mui-stage-host" data-stage-host></div>`;
      const stageHost=ctx.root.querySelector('[data-stage-host]');
      const release=ctx.services.takeStage?.(stageHost);
      const render=()=>{
        const camera=ctx.selectors.get('view.current');
        const readout=ctx.root.querySelector('[data-zoom-readout]');
        if(readout)readout.textContent=Math.round((camera?.scale||1)*100)+'%';
      };
      const onClick=event=>{
        const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;
        if(action==='zoomOut')run(ctx,'view.zoom.by.v1',{factor:1/1.2});
        else if(action==='zoomIn')run(ctx,'view.zoom.by.v1',{factor:1.2});
        else if(action==='fit')run(ctx,'view.fit.content.v1');
        else if(action==='fitArtboard')run(ctx,'view.fit.artboard.v1');
        else if(action==='reset')run(ctx,'view.reset.v1');
      };
      ctx.listen(ctx.root,'click',onClick);
      if(release)ctx.cleanup(release);
      rerenderOnState(ctx,render);
      render();
    }
  };
}

export function createCanvasChromeModule() { return createCanvasChromeModuleAtSlot('canvas'); }
export function createCanvasChromeModuleForSlot(slot='canvas.viewport') { return createCanvasChromeModuleAtSlot(slot); }

export function createCanvasShellModule() {
  return {
    id:'canvas.shell.v2', slot:'canvas',
    mount(ctx) {
      ctx.root.innerHTML='<div class="mui-canvas-shell"><div class="mui-canvas-chrome-slot" data-slot="canvas.chrome"></div><div class="mui-canvas-viewport-slot" data-slot="canvas.viewport"></div></div>';
      ctx.slots.registerFromSelector('canvas.chrome','[data-slot="canvas.chrome"]');
      ctx.slots.registerFromSelector('canvas.viewport','[data-slot="canvas.viewport"]');
    }
  };
}

function layerRows(ctx,variant) {
  const layers=[...(ctx.selectors.get('layer.list')||[])].reverse();
  return layers.map(layer=>`<div class="mui-layer-row ${layer.active?'active':''} ${variant==='compact'?'compact':''}" draggable="true" data-layer-id="${layer.id}">
    <button type="button" data-layer-action="visible" aria-label="${layer.visible?'隱藏':'顯示'}">${layer.visible?'◉':'○'}</button>
    <button type="button" class="mui-layer-name" data-layer-action="activate"><strong>${escapeText(layer.name)}</strong>${variant==='standard'?'<small>'+layer.objectCount+' 個物件</small>':''}</button>
    <button type="button" data-layer-action="lock" aria-label="${layer.locked?'解除鎖定':'鎖定'}">${layer.locked?'●':'○'}</button>
  </div>`).join('');
}

function escapeText(value) {
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function pageRows(ctx) {
  return (ctx.selectors.get('page.list')||[]).map(page=>`<button type="button" class="mui-page-row ${page.active?'active':''}" data-page-id="${page.id}">
    <strong>${escapeText(page.name)}</strong><small>${page.objectCount} 個物件</small>
  </button>`).join('');
}

function historyRows(ctx) {
  const history=ctx.selectors.get('history.summary')||{entries:[],applied:0};
  const start=`<button type="button" class="mui-history-row ${history.applied===0?'active':''}" data-history-applied="0">歷史起點</button>`;
  return start+history.entries.map((entry,index)=>`<button type="button" class="mui-history-row ${history.applied===index+1?'active':''}" data-history-applied="${index+1}"><span>${escapeText(entry.label)}</span><small>${entry.applied?'已套用':'可重做'}</small></button>`).join('');
}


const PANEL_GROUPS=Object.freeze({
  'group-a':Object.freeze(['navigator','swatches','color']),
  'group-b':Object.freeze(['character','paragraph']),
  'group-c':Object.freeze(['layers','history'])
});

export function createPanelGroupShellModule(groupId) {
  const panelIds=PANEL_GROUPS[groupId];
  if(!panelIds)throw new Error('INK_MODULAR_UI_PANEL_GROUP_UNKNOWN:'+groupId);
  const slot='panels.'+groupId;
  return {
    id:'panels.'+groupId+'.shell.v2', slot,
    mount(ctx) {
      ctx.root.innerHTML='<section class="mui-panel-group-shell" data-panel-group="'+groupId+'">'+panelIds.map(panelId=>'<div class="mui-panel-slot" data-slot="'+slot+'.'+panelId+'" data-panel-slot="'+panelId+'"></div>').join('')+'</section>';
      for(const panelId of panelIds)ctx.slots.registerFromSelector(slot+'.'+panelId,'[data-panel-slot="'+panelId+'"]');
    }
  };
}

export function createPanelsShellModule() {
  return {
    id:'panels.shell.v2', slot:'panels',
    mount(ctx) {
      ctx.root.innerHTML='<div class="mui-panels-shell"><div data-slot="panels.group-a"></div><div data-slot="panels.group-b"></div><div data-slot="panels.group-c"></div></div>';
      for(const groupId of Object.keys(PANEL_GROUPS)){
        const childSlot='panels.'+groupId;
        ctx.slots.registerFromSelector(childSlot,'[data-slot="'+childSlot+'"]');
        ctx.slots.mount(createPanelGroupShellModule(groupId));
      }
    }
  };
}

export function createLayersModule(variant='standard') { return createLayersModuleForSlot('panels',variant); }

export function createLayersModuleForSlot(slot='panels',variant='standard') {
  const normalized=variant==='compact'?'compact':'standard';
  return {
    id:`layers.${normalized}.v1`, slot,
    mount(ctx) {
      let dragId=null;
      const render=()=>{
        const active=ctx.selectors.get('layer.active');
        const history=ctx.selectors.get('history.summary')||{};
        ctx.root.innerHTML=`
          <div class="mui-panel-head"><strong>圖層</strong><span>可抽換模組</span>
            <button type="button" data-panel-action="swap" data-module-focus>${normalized==='standard'?'精簡':'標準'}</button>
          </div>
          <div class="mui-layer-toolbar">
            ${button('＋','add','aria-label="新增圖層"')}${button('複製','duplicate')}${button('刪除','delete')}
            <label>不透明度 <input data-layer-opacity type="range" min="0" max="100" value="${Math.round((active?.opacity??1)*100)}"><output>${Math.round((active?.opacity??1)*100)}%</output></label>
          </div>
          <div class="mui-layer-list" role="listbox">${layerRows(ctx,normalized)}</div>
          <details class="mui-panel-section" open><summary>頁面</summary><div class="mui-pages">${pageRows(ctx)}</div>
            <div class="mui-inline-actions">${button('新增頁','pageAdd')}${button('複製頁','pageDuplicate')}${button('刪除頁','pageDelete')}</div>
          </details>
          <details class="mui-panel-section" open><summary>歷史 <small>${history.applied||0}/${history.retainedCount||0}</small></summary>
            <div class="mui-inline-actions">${button('復原','undo')}${button('重做','redo')}</div>
            <div class="mui-history">${historyRows(ctx)}</div>
          </details>`;
      };
      const onClick=event=>{
        const panelAction=event.target.closest('[data-panel-action]')?.dataset.panelAction;
        if(panelAction==='swap'){ctx.services.swapLayers?.(normalized==='standard'?'compact':'standard');return;}
        const action=event.target.closest('[data-action]')?.dataset.action;
        if(action){
          const active=ctx.selectors.get('layer.active');
          const page=ctx.selectors.get('page.active');
          if(action==='add')run(ctx,'layer.create.v1');
          else if(action==='duplicate'&&active)run(ctx,'layer.duplicate.v1',{layerId:active.id});
          else if(action==='delete'&&active)run(ctx,'layer.delete.v1',{layerId:active.id});
          else if(action==='pageAdd')run(ctx,'page.create.v1');
          else if(action==='pageDuplicate'&&page)run(ctx,'page.duplicate.v1',{pageId:page.id});
          else if(action==='pageDelete'&&page)run(ctx,'page.delete.v1',{pageId:page.id});
          else if(action==='undo')run(ctx,'history.undo.v1');
          else if(action==='redo')run(ctx,'history.redo.v1');
          return;
        }
        const pageRow=event.target.closest('[data-page-id]');
        if(pageRow){run(ctx,'page.activate.v1',{pageId:pageRow.dataset.pageId});return;}
        const historyRow=event.target.closest('[data-history-applied]');
        if(historyRow){run(ctx,'history.jump.v1',{applied:Number(historyRow.dataset.historyApplied)});return;}
        const row=event.target.closest('[data-layer-id]');
        const layerAction=event.target.closest('[data-layer-action]')?.dataset.layerAction;
        if(!row||!layerAction)return;
        const layers=ctx.selectors.get('layer.list')||[],layer=layers.find(item=>item.id===row.dataset.layerId);if(!layer)return;
        if(layerAction==='activate')run(ctx,'layer.activate.v1',{layerId:layer.id});
        else if(layerAction==='visible')run(ctx,'layer.visibility.set.v1',{layerId:layer.id,visible:!layer.visible});
        else if(layerAction==='lock')run(ctx,'layer.lock.set.v1',{layerId:layer.id,locked:!layer.locked});
      };
      const onChange=event=>{
        if(!event.target.matches('[data-layer-opacity]'))return;
        const active=ctx.selectors.get('layer.active');if(active)run(ctx,'layer.opacity.set.v1',{layerId:active.id,opacity:Number(event.target.value)/100});
      };
      const onInput=event=>{if(event.target.matches('[data-layer-opacity]')){const out=event.target.parentElement.querySelector('output');if(out)out.value=event.target.value+'%';}};
      const onDragStart=event=>{const row=event.target.closest('[data-layer-id]');if(!row)return;dragId=row.dataset.layerId;event.dataTransfer?.setData('text/plain',dragId);};
      const onDragOver=event=>{if(event.target.closest('[data-layer-id]'))event.preventDefault();};
      const onDrop=event=>{
        const target=event.target.closest('[data-layer-id]');if(!target)return;event.preventDefault();
        const source=event.dataTransfer?.getData('text/plain')||dragId;if(!source||source===target.dataset.layerId)return;
        const rect=target.getBoundingClientRect(),position=event.clientY<rect.top+rect.height/2?'before':'after';
        run(ctx,'layer.reorder.v1',{sourceId:source,targetId:target.dataset.layerId,position});dragId=null;
      };
      ctx.listen(ctx.root,'click',onClick);
      ctx.listen(ctx.root,'change',onChange);
      ctx.listen(ctx.root,'input',onInput);
      ctx.listen(ctx.root,'dragstart',onDragStart);
      ctx.listen(ctx.root,'dragover',onDragOver);
      ctx.listen(ctx.root,'drop',onDrop);
      rerenderOnState(ctx,render);
      render();
    }
  };
}

export function createStatusModule() {
  return {
    id:'status.common.v1', slot:'status',
    mount(ctx) {
      const render=()=>{
        const doc=ctx.selectors.get('document.current')||{},page=ctx.selectors.get('page.active')||{},layer=ctx.selectors.get('layer.active')||{},camera=ctx.selectors.get('view.current')||{},history=ctx.selectors.get('history.summary')||{};
        ctx.root.innerHTML=`<div class="mui-status"><span>${escapeText(doc.title||'INK')}</span><span>${escapeText(page.name||'')}</span><span>${escapeText(layer.name||'')}</span><span>${Math.round((camera.scale||1)*100)}%</span><span>歷史 ${history.applied||0}</span><span class="mui-status-message" data-status-message></span></div>`;
      };
      rerenderOnState(ctx,render);render();
      const statusCleanup=ctx.services.bindStatus?.(message=>{const node=ctx.root.querySelector('[data-status-message]');if(node)node.textContent=message||'';});
      if(statusCleanup)ctx.cleanup(statusCleanup);
    }
  };
}

export function createDialogsModule() {
  return {
    id:'dialogs.host.v2', slot:'dialogs',
    mount(ctx) {
      ctx.root.innerHTML='<div class="mui-dialog-layer" aria-live="polite" data-slot="dialogs.content"></div>';
      ctx.slots.registerFromSelector('dialogs.content','[data-slot="dialogs.content"]');
    }
  };
}
