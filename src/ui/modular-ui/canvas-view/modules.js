import {
  CANVAS_EDGE_SIZE, normalizeViewContract, clampViewScale, buildRulerTicks,
  screenToNative, nativeToScreen, navigatorModel, navigatorPointToNative,
  panDeltaToCenter, scrollbarThumbSize, horizontalScrollbarModel, verticalScrollbarModel,
  horizontalScrollbarPanDelta, verticalScrollbarPanDelta
} from './geometry.js';
import {
  viewStateKey, beginGuideGesture, updateGuideGesture, completeGuideGesture,
  consumeGuideDeleteKey, createPrimaryPointerTracker, createViewSyncLoop
} from './interactions.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;

let sharedViewportMetrics={width:800,height:600};
const viewportMetricListeners=new Set();
const runtimeDiagnostics={syncLoops:0,previewTimers:0,navigatorMetricSubscriptions:0,statusInstallations:0};

function setSharedViewportMetrics(width,height){
  const next={width:Math.max(1,finite(width,800)),height:Math.max(1,finite(height,600))};
  if(Math.abs(next.width-sharedViewportMetrics.width)<=.25&&Math.abs(next.height-sharedViewportMetrics.height)<=.25)return sharedViewportMetrics;
  sharedViewportMetrics=next;
  for(const listener of [...viewportMetricListeners]){try{listener({...sharedViewportMetrics});}catch{}}
  return sharedViewportMetrics;
}
function getSharedViewportMetrics(){return {...sharedViewportMetrics};}
function subscribeViewportMetrics(listener){
  viewportMetricListeners.add(listener);
  runtimeDiagnostics.navigatorMetricSubscriptions++;
  let active=true;
  return ()=>{
    if(!active)return false;
    active=false;
    runtimeDiagnostics.navigatorMetricSubscriptions=Math.max(0,runtimeDiagnostics.navigatorMetricSubscriptions-1);
    return viewportMetricListeners.delete(listener);
  };
}

export function canvasViewDiagnostics(){
  return Object.freeze({
    viewportMetricListeners:viewportMetricListeners.size,
    syncLoops:runtimeDiagnostics.syncLoops,
    previewTimers:runtimeDiagnostics.previewTimers,
    navigatorMetricSubscriptions:runtimeDiagnostics.navigatorMetricSubscriptions,
    statusInstallations:runtimeDiagnostics.statusInstallations,
    viewport:{...sharedViewportMetrics}
  });
}

function execute(ctx,id,args={}){
  if(!ctx.commands.has(id))return {ok:false,error:{code:'CAPABILITY_UNAVAILABLE',message:id}};
  const result=ctx.commands.execute(id,args);
  if(result&&typeof result.then==='function')return result.then(value=>{if(!value?.ok)ctx.services.report?.(value?.error?.message||id);return value;});
  if(!result?.ok)ctx.services.report?.(result?.error?.message||id);
  return result;
}

function readViewContract(ctx){
  const contract=ctx.selectors.get('view.contract');
  return normalizeViewContract(contract);
}

function snapshot(ctx){
  const page=ctx.selectors.get('page.active')||{};
  const camera=ctx.selectors.get('view.current')||page.camera||{x:0,y:0,scale:1,rotation:0};
  const workspace=ctx.selectors.get('workspace.current')||page.workspace||{activeSpace:'creation'};
  const documentState=ctx.selectors.get('document.current')||{};
  return {document:documentState,page,camera,workspace,contract:readViewContract(ctx)};
}

function bindNativeViewSync(ctx,render){
  runtimeDiagnostics.syncLoops++;
  const loop=createViewSyncLoop({
    read:()=>snapshot(ctx),
    render,
    key:viewStateKey,
    subscribe:listener=>ctx.selectors.subscribe(listener)
  });
  ctx.cleanup(()=>{
    try{loop.dispose();}
    finally{runtimeDiagnostics.syncLoops=Math.max(0,runtimeDiagnostics.syncLoops-1);}
  });
  return loop;
}

export function createCanvasChromeModule(slot='canvas.chrome'){
  return {
    id:'canvas-view.chrome.v2',slot,
    mount(ctx){
      // D01: retire the duplicate permanent zoom row while preserving the host slot contract.
      ctx.root.hidden=true;
      ctx.root.setAttribute('aria-hidden','true');
      ctx.root.replaceChildren();
    }
  };
}

function rulerHtml(ticks){
  return '<div class="ink-d-ruler-ticks" aria-hidden="true">'+ticks.map(tick=>
    '<span class="ink-d-ruler-tick" style="--ink-d-tick:'+tick.pixel.toFixed(2)+'px" data-level="'+tick.level+'"'+(tick.origin?' data-origin="true"':'')+'><i></i>'
      +(tick.label?'<b>'+esc(tick.label)+'</b>':'')+'</span>'
  ).join('')+'</div>';
}

function guideSvg(state,drag,width,height){
  const guides=(state.page?.guides||[]).filter(guide=>guide?.visible!==false),lines=[];
  const extent=Math.max(width,height,1000)*20;
  const endpoints=(orientation,position)=>orientation==='vertical'
    ?[
      nativeToScreen({x:position,y:-extent},{camera:state.camera,workspace:state.workspace,width,height}),
      nativeToScreen({x:position,y:extent},{camera:state.camera,workspace:state.workspace,width,height})
    ]
    :[
      nativeToScreen({x:-extent,y:position},{camera:state.camera,workspace:state.workspace,width,height}),
      nativeToScreen({x:extent,y:position},{camera:state.camera,workspace:state.workspace,width,height})
    ];
  for(const guide of guides){
    const [a,b]=endpoints(guide.orientation,guide.position);
    lines.push('<g class="ink-d-guide '+(guide.locked?'is-locked':'')+'" data-guide-group="'+esc(guide.id)+'">'
      +'<line class="ink-d-guide-hit" tabindex="0" role="button" aria-label="參考線 '+esc(guide.id)+'" data-guide-id="'+esc(guide.id)+'" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'"></line>'
      +'<line class="ink-d-guide-line" aria-hidden="true" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'"></line></g>');
  }
  if(drag){
    const [a,b]=endpoints(drag.orientation,drag.position);
    lines.push('<line class="ink-d-guide-preview" aria-hidden="true" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'"></line>');
  }
  return '<svg class="ink-d-guide-overlay" viewBox="0 0 '+Math.max(1,width)+' '+Math.max(1,height)+'" preserveAspectRatio="none">'+lines.join('')+'</svg>';
}

export function createCanvasViewportModule(slot='canvas.viewport'){
  return {
    id:'canvas-view.viewport.v2',slot,
    mount(ctx){
      ctx.root.innerHTML='<div class="ink-d-canvas-frame" style="--ink-d-edge:'+CANVAS_EDGE_SIZE+'px">'
        +'<div class="ink-d-ruler-corner" aria-label="尺規原點，單位像素"><span aria-hidden="true">px</span></div>'
        +'<div class="ink-d-ruler ink-d-ruler-horizontal" data-d-ruler="horizontal" aria-label="水平尺規，拖曳建立水平參考線"></div>'
        +'<div class="ink-d-scrollbar-corner-top" aria-hidden="true"></div>'
        +'<div class="ink-d-ruler ink-d-ruler-vertical" data-d-ruler="vertical" aria-label="垂直尺規，拖曳建立垂直參考線"></div>'
        +'<div class="ink-d-stage-area" data-d-stage-area><div class="ink-d-stage-host" data-d-stage-host></div><div class="ink-d-guide-layer" data-d-guide-layer></div><output class="ink-d-guide-readout" data-d-guide-readout aria-live="polite" hidden></output></div>'
        +'<div class="ink-d-vscroll-wrap"><input type="range" class="ink-d-scrollbar ink-d-scrollbar-vertical" data-d-vscroll aria-label="垂直捲軸"></div>'
        +'</div>';
      const area=ctx.root.querySelector('[data-d-stage-area]');
      const stageHost=ctx.root.querySelector('[data-d-stage-host]');
      const guideLayer=ctx.root.querySelector('[data-d-guide-layer]');
      const guideReadout=ctx.root.querySelector('[data-d-guide-readout]');
      const horizontal=ctx.root.querySelector('[data-d-ruler="horizontal"]');
      const vertical=ctx.root.querySelector('[data-d-ruler="vertical"]');
      const vscroll=ctx.root.querySelector('[data-d-vscroll]');
      const release=ctx.services.takeStage?.(stageHost);
      if(release)ctx.cleanup(release);
      let lastState=snapshot(ctx),drag=null;

      const dimensions=()=>{
        const rect=area.getBoundingClientRect();
        const width=Math.max(1,rect.width),height=Math.max(1,rect.height);
        setSharedViewportMetrics(width,height);
        return {rect,width,height};
      };
      const render=(state=snapshot(ctx))=>{
        lastState=state;
        const {width,height}=dimensions();
        horizontal.innerHTML=rulerHtml(buildRulerTicks({orientation:'horizontal',camera:state.camera,workspace:state.workspace,width,height}));
        vertical.innerHTML=rulerHtml(buildRulerTicks({orientation:'vertical',camera:state.camera,workspace:state.workspace,width,height}));
        guideLayer.innerHTML=guideSvg(state,drag,width,height);
        const verticalModel=verticalScrollbarModel(state.camera,height);
        vscroll.min=String(verticalModel.min);vscroll.max=String(verticalModel.max);vscroll.step=String(verticalModel.step);
        vscroll.style.setProperty('--ink-d-scroll-thumb-size',scrollbarThumbSize(verticalModel,height,height)+'px');
        if(document.activeElement!==vscroll)vscroll.value=String(verticalModel.value);
      };
      const localPoint=event=>{
        const {rect}=dimensions();
        return {x:event.clientX-rect.left,y:event.clientY-rect.top};
      };
      const positionFor=(orientation,event,state)=>{
        const point=localPoint(event),{width,height}=dimensions();
        const native=screenToNative(point,{camera:state.camera,workspace:state.workspace,width,height});
        return orientation==='vertical'?native.x:native.y;
      };
      const hideGuideReadout=()=>{if(!guideReadout)return;guideReadout.hidden=true;guideReadout.textContent='';};
      const showGuideReadout=(gesture,event)=>{
        if(!guideReadout||!gesture||!event)return hideGuideReadout();
        const point=localPoint(event),{width,height}=dimensions(),value=Number(gesture.position),axis=gesture.orientation==='vertical'?'X':'Y';
        if(!Number.isFinite(value))return hideGuideReadout();
        const shown=Math.abs(value-Math.round(value))<.05?String(Math.round(value)):value.toFixed(1);
        guideReadout.textContent=axis+' '+shown+' px';
        guideReadout.style.left=Math.max(6,Math.min(width-96,point.x+12))+'px';
        guideReadout.style.top=Math.max(6,Math.min(height-24,point.y+12))+'px';
        guideReadout.hidden=false;
      };
      const begin=(event,descriptor)=>{
        if(event.button!=null&&event.button!==0)return false;
        if(event.isPrimary===false)return false;
        const state=snapshot(ctx),position=descriptor.position??positionFor(descriptor.orientation,event,state);
        const next=beginGuideGesture(state,descriptor,event.pointerId,position);
        if(!next)return false;
        drag=next;
        event.currentTarget?.setPointerCapture?.(event.pointerId);
        render(state);showGuideReadout(drag,event);
        event.preventDefault?.();
        return true;
      };
      const move=event=>{
        if(!drag||drag.pointerId!==event.pointerId)return;
        const state=snapshot(ctx),position=positionFor(drag.orientation,event,state);
        const next=updateGuideGesture(drag,state,event.pointerId,position);
        if(!next){drag=null;render(state);hideGuideReadout();return;}
        drag=next;render(state);showGuideReadout(drag,event);event.preventDefault?.();
      };
      const finish=event=>{
        if(!drag||drag.pointerId!==event.pointerId)return;
        const state=snapshot(ctx),current=drag,point=localPoint(event),{width,height}=dimensions();
        const next=updateGuideGesture(current,state,event.pointerId,positionFor(current.orientation,event,state));
        drag=null;hideGuideReadout();
        if(next){
          const inStage=point.x>=0&&point.x<=width&&point.y>=0&&point.y<=height;
          const onOwnRuler=(next.orientation==='horizontal'&&point.y<0&&point.y>=-CANVAS_EDGE_SIZE*2)
            ||(next.orientation==='vertical'&&point.x<0&&point.x>=-CANVAS_EDGE_SIZE*2);
          const plan=completeGuideGesture(next,state,event.pointerId,{inStage,onOwnRuler});
          if(plan)execute(ctx,plan.command,plan.args);
        }
        render(snapshot(ctx));event.preventDefault?.();
      };
      const cancel=event=>{
        if(!drag||drag.pointerId!==event.pointerId)return;
        drag=null;hideGuideReadout();render(snapshot(ctx));event.preventDefault?.();
      };

      ctx.listen(horizontal,'pointerdown',event=>begin(event,{kind:'new',orientation:'horizontal'}));
      ctx.listen(vertical,'pointerdown',event=>begin(event,{kind:'new',orientation:'vertical'}));
      ctx.listen(globalThis,'pointermove',move);
      ctx.listen(globalThis,'pointerup',finish);
      ctx.listen(globalThis,'pointercancel',cancel);

      ctx.listen(guideLayer,'pointerdown',event=>{
        const line=event.target.closest('[data-guide-id]');if(!line)return;
        const guide=(lastState.page?.guides||[]).find(item=>String(item.id)===line.dataset.guideId);
        if(!guide)return;
        begin(event,{kind:'existing',id:guide.id,orientation:guide.orientation,position:guide.position,startPosition:guide.position,locked:guide.locked,visible:guide.visible});
      });
      ctx.listen(guideLayer,'keydown',event=>{
        const line=event.target.closest('[data-guide-id]');if(!line)return;
        const guide=(lastState.page?.guides||[]).find(item=>String(item.id)===line.dataset.guideId);
        consumeGuideDeleteKey(event,guide,(id,args)=>execute(ctx,id,args));
      });
      ctx.listen(vscroll,'input',()=>{
        const state=snapshot(ctx),dy=verticalScrollbarPanDelta(Number(vscroll.value),state.camera);
        if(dy)execute(ctx,'view.pan.v1',{dx:0,dy});
      });

      if(typeof ResizeObserver==='function'){
        const observer=new ResizeObserver(()=>render(snapshot(ctx)));
        observer.observe(area);
        ctx.cleanup(()=>observer.disconnect());
      }
      bindNativeViewSync(ctx,render);
      render(lastState);
    }
  };
}

export function createNavigatorModule(slot='panels.group-a.navigator'){
  return {
    id:'canvas-view.navigator.v3',slot,
    mount(ctx){
      const initial=snapshot(ctx),contract=initial.contract;
      ctx.root.innerHTML='<div class="ink-d-navigator">'
        +'<div class="ink-d-navigator-map" data-d-navigator-map role="application" aria-label="導覽器">'
        +'<img class="ink-d-navigator-preview" data-d-navigator-preview alt="" aria-hidden="true">'
        +'<svg class="ink-d-navigator-overlay" data-d-navigator-overlay aria-hidden="true" preserveAspectRatio="none">'
        +'<rect class="ink-d-navigator-artboard" data-d-navigator-artboard></rect>'
        +'<polygon class="ink-d-navigator-viewport" data-d-navigator-viewport></polygon></svg></div>'
        +'<div class="ink-d-navigator-controls"><output data-d-nav-output aria-label="縮放值"></output>'
        +'<button type="button" data-d-nav-action="out" aria-label="縮小">−</button><input type="range" data-d-nav-zoom step="1" aria-label="縮放">'
        +'<button type="button" data-d-nav-action="in" aria-label="放大">+</button></div></div>';
      const map=ctx.root.querySelector('[data-d-navigator-map]');
      const preview=ctx.root.querySelector('[data-d-navigator-preview]');
      const overlay=ctx.root.querySelector('[data-d-navigator-overlay]');
      const artboardNode=ctx.root.querySelector('[data-d-navigator-artboard]');
      const viewportNode=ctx.root.querySelector('[data-d-navigator-viewport]');
      const zoomInput=ctx.root.querySelector('[data-d-nav-zoom]');
      const zoomOutput=ctx.root.querySelector('[data-d-nav-output]');
      zoomInput.min=String(Math.round(contract.minScale*100));
      zoomInput.max=String(Math.round(contract.maxScale*100));
      const tracker=createPrimaryPointerTracker();
      let current=initial,model=null,lastPreview='',previewGeometry=null;
      const viewportSize=()=>getSharedViewportMetrics();
      const measuredMap=()=>{
        const rect=map.getBoundingClientRect();
        return {rect,width:Math.max(1,rect.width||220),height:Math.max(1,rect.height||150)};
      };
      const requestPreview=box=>{
        let result=null;
        try{result=ctx.selectors.get('page.preview',{width:Math.round(box.width),height:Math.round(box.height)});}catch(error){ctx.services.report?.(error?.message||'page.preview');}
        const dataUrl=typeof result==='string'?result:result?.dataUrl;
        if(result&&typeof result==='object'&&result.fitBounds&&result.trimBounds&&result.layoutMatrix)previewGeometry=result;
        if(dataUrl&&dataUrl!==lastPreview){preview.src=dataUrl;lastPreview=dataUrl;}
        preview.hidden=!dataUrl;
        return previewGeometry;
      };
      const createModel=(state,box,geometry=previewGeometry)=>{
        if(!geometry)return null;
        const size=viewportSize();
        return navigatorModel({
          preview:geometry,camera:state.camera,workspace:state.workspace,
          viewportWidth:size.width,viewportHeight:size.height,
          boxWidth:box.width,boxHeight:box.height
        });
      };
      const render=(state=snapshot(ctx))=>{
        current=state;
        const box=measuredMap(),geometry=requestPreview(box);
        model=createModel(state,box,geometry);
        overlay.setAttribute('viewBox','0 0 '+box.width+' '+box.height);
        if(model){
          const a=model.artboardRect;
          artboardNode.setAttribute('x',String(a.x));
          artboardNode.setAttribute('y',String(a.y));
          artboardNode.setAttribute('width',String(Math.max(0,a.w)));
          artboardNode.setAttribute('height',String(Math.max(0,a.h)));
          viewportNode.setAttribute('points',model.viewportPoints.map(point=>point.x+','+point.y).join(' '));
        }else{
          artboardNode.setAttribute('width','0');
          artboardNode.setAttribute('height','0');
          viewportNode.setAttribute('points','');
        }
        const percent=Math.round(clampViewScale(state.camera?.scale||1,contract)*100);
        if(document.activeElement!==zoomInput)zoomInput.value=String(percent);
        zoomOutput.textContent=percent+'%';
      };
      const panToEvent=event=>{
        if(!tracker.matches(event)||!previewGeometry)return;
        const box=measuredMap(),actual=snapshot(ctx);
        const actualModel=createModel(actual,box,previewGeometry);
        if(!actualModel)return;
        model=actualModel;current=actual;
        const native=navigatorPointToNative({x:event.clientX-box.rect.left,y:event.clientY-box.rect.top},actualModel);
        const size=viewportSize();
        const delta=panDeltaToCenter(native,{camera:actual.camera,workspace:actual.workspace,width:size.width,height:size.height});
        execute(ctx,'view.pan.v1',delta);
      };

      ctx.listen(map,'pointerdown',event=>{
        if(!tracker.begin(event))return;
        map.setPointerCapture?.(event.pointerId);
        panToEvent(event);event.preventDefault?.();
      });
      ctx.listen(globalThis,'pointermove',event=>{if(tracker.matches(event))panToEvent(event);});
      ctx.listen(globalThis,'pointerup',event=>{tracker.finish(event);});
      ctx.listen(globalThis,'pointercancel',event=>{tracker.finish(event);});
      ctx.listen(ctx.root,'click',event=>{
        const action=event.target.closest('[data-d-nav-action]')?.dataset.dNavAction;
        if(action==='out')execute(ctx,'view.zoom.by.v1',{factor:1/1.2});
        else if(action==='in')execute(ctx,'view.zoom.by.v1',{factor:1.2});
      });
      ctx.listen(zoomInput,'input',()=>execute(ctx,'view.zoom.set.v1',{scale:clampViewScale(Number(zoomInput.value)/100,contract)}));

      const metricsCleanup=subscribeViewportMetrics(()=>render(snapshot(ctx)));
      ctx.cleanup(metricsCleanup);
      if(typeof ResizeObserver==='function'){
        const observer=new ResizeObserver(()=>render(snapshot(ctx)));
        observer.observe(map);
        ctx.cleanup(()=>observer.disconnect());
      }
      const previewTimer=setInterval(()=>requestPreview(measuredMap()),700);
      runtimeDiagnostics.previewTimers++;
      ctx.cleanup(()=>{clearInterval(previewTimer);runtimeDiagnostics.previewTimers=Math.max(0,runtimeDiagnostics.previewTimers-1);});
      ctx.cleanup(()=>tracker.cancel());
      bindNativeViewSync(ctx,render);
      render(current);
    }
  };
}

export function createStatusBandContribution(){
  return Object.freeze({
    id:'canvas-view.status-band.v3',owner:'D',target:'status',
    mount(ctx,root){
      if(!root)throw new TypeError('INK_D_STATUS_ROOT_REQUIRED');
      const contract=readViewContract(ctx);
      root.innerHTML='<div class="ink-d-status-band">'
        +'<div class="ink-d-status-view-group" role="group" aria-label="文件檢視狀態">'
        +'<button type="button" data-d-status-action="zoom-out" aria-label="縮小">−</button>'
        +'<label class="ink-d-status-zoom-field"><input type="number" data-d-status-zoom step="1" aria-label="縮放百分比"><span>%</span></label>'
        +'<button type="button" data-d-status-action="zoom-in" aria-label="放大">+</button>'
        +'<span class="ink-d-status-document" data-d-status-document></span><select data-d-status-info aria-label="文件資訊"><option value="dimensions">文件尺寸</option><option value="workspace">工作空間</option></select><output data-d-status-info-value></output></div>'
        +'<input type="range" class="ink-d-scrollbar ink-d-scrollbar-horizontal" data-d-hscroll aria-label="水平捲軸">'
        +'<span class="ink-d-scrollbar-corner-bottom" aria-hidden="true"></span></div>';
      const scroll=root.querySelector('[data-d-hscroll]'),zoomInput=root.querySelector('[data-d-status-zoom]'),documentNode=root.querySelector('[data-d-status-document]'),outButton=root.querySelector('[data-d-status-action="zoom-out"]'),inButton=root.querySelector('[data-d-status-action="zoom-in"]');
      zoomInput.min=String(Math.round(contract.minScale*100));zoomInput.max=String(Math.round(contract.maxScale*100));
      const infoChoice=root.querySelector('[data-d-status-info]'),infoValue=root.querySelector('[data-d-status-info-value]');
      const render=()=>{
        const state=snapshot(ctx),width=getSharedViewportMetrics().width,hasDocument=state.document?.open===true;
        infoChoice.disabled=!hasDocument;const board=state.page?.artboard||{};infoValue.textContent=!hasDocument?'':infoChoice.value==='workspace'?(state.workspace?.activeSpace==='layout'?'圖紙':'手繪板'):(Number.isFinite(Number(board.widthMm))&&Number.isFinite(Number(board.heightMm))?board.widthMm+' × '+board.heightMm+' mm':'');
        const canZoomSet=hasDocument&&ctx.commands.has('view.zoom.set.v1'),canZoomBy=hasDocument&&ctx.commands.has('view.zoom.by.v1');
        zoomInput.disabled=!canZoomSet;outButton.disabled=!canZoomBy;inButton.disabled=!canZoomBy;scroll.disabled=!hasDocument||!ctx.commands.has('view.pan.v1');
        if(hasDocument){
          const model=horizontalScrollbarModel(state.camera,width);scroll.min=String(model.min);scroll.max=String(model.max);scroll.step=String(model.step);
          const track=Math.max(1,scroll.getBoundingClientRect?.().width||width);scroll.style.setProperty('--ink-d-scroll-thumb-size',scrollbarThumbSize(model,track,width)+'px');
          if(document.activeElement!==scroll)scroll.value=String(model.value);
          if(document.activeElement!==zoomInput)zoomInput.value=String(Math.round(clampViewScale(state.camera?.scale||1,contract)*100));
          documentNode.textContent=state.page?.name||state.document?.title||'作用中文件';
        }else{
          scroll.min='-1';scroll.max='1';scroll.step='1';scroll.value='0';scroll.style.setProperty('--ink-d-scroll-thumb-size','30px');
          if(document.activeElement!==zoomInput)zoomInput.value='';documentNode.textContent='無作用中文件';
        }
      };
      ctx.listen(root,'click',event=>{const action=event.target.closest('[data-d-status-action]')?.dataset.dStatusAction;if(action==='zoom-out')execute(ctx,'view.zoom.by.v1',{factor:1/1.2});else if(action==='zoom-in')execute(ctx,'view.zoom.by.v1',{factor:1.2});});
      ctx.listen(zoomInput,'change',()=>{if(zoomInput.disabled)return;const scale=clampViewScale(Number(zoomInput.value)/100,contract);zoomInput.value=String(Math.round(scale*100));execute(ctx,'view.zoom.set.v1',{scale});});
      ctx.listen(scroll,'input',()=>{if(scroll.disabled)return;const state=snapshot(ctx),dx=horizontalScrollbarPanDelta(Number(scroll.value),state.camera);if(dx)execute(ctx,'view.pan.v1',{dx,dy:0});});
      ctx.listen(infoChoice,'change',render);
      bindNativeViewSync(ctx,render);render();return ()=>{try{root.replaceChildren();}catch{root.innerHTML='';}};
    }
  });
}

export function installStatusBandContribution(ctx,root){
  const cleanup=createStatusBandContribution().mount(ctx,root);
  runtimeDiagnostics.statusInstallations++;
  const tracked=ctx.cleanup(()=>{
    try{cleanup?.();}finally{runtimeDiagnostics.statusInstallations=Math.max(0,runtimeDiagnostics.statusInstallations-1);}
  });
  return tracked;
}
