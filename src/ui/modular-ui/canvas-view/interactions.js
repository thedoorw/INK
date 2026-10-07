const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;

export function workspaceGestureIdentity(state={}){
  const page=state.page||{},workspace=state.workspace||{},viewport=workspace.layoutViewport||{};
  return [
    String(page.id||''),
    String(workspace.activeSpace||'creation'),
    finite(viewport.x),finite(viewport.y),finite(viewport.scale,1),finite(viewport.rotation)
  ].join('|');
}

export function viewStateKey(state={}){
  const page=state.page||{},camera=state.camera||{},workspace=state.workspace||{},artboard=page.artboard||{};
  const guides=(page.guides||[]).map(guide=>[
    guide?.id,guide?.orientation,finite(guide?.position),Boolean(guide?.locked),guide?.visible!==false
  ].join(':')).join(';');
  return [
    Boolean(state.document?.open),state.document?.id||'',state.document?.title||'',page.name||'',
    finite(camera.x),finite(camera.y),finite(camera.scale,1),finite(camera.rotation),
    workspaceGestureIdentity(state),
    artboard.preset||'',artboard.orientation||'',finite(artboard.widthMm),finite(artboard.heightMm),finite(artboard.bleedMm),
    guides
  ].join('|');
}

export function beginGuideGesture(state,descriptor,pointerId,position){
  if(!descriptor||!['horizontal','vertical'].includes(descriptor.orientation))return null;
  if(descriptor.locked||descriptor.visible===false)return null;
  return {
    kind:descriptor.kind==='existing'?'existing':'new',
    id:descriptor.id==null?null:String(descriptor.id),
    orientation:descriptor.orientation,
    pointerId,
    position:finite(position),
    startPosition:descriptor.startPosition==null?finite(position):finite(descriptor.startPosition),
    workspaceIdentity:workspaceGestureIdentity(state)
  };
}

export function updateGuideGesture(gesture,state,pointerId,position){
  if(!gesture||gesture.pointerId!==pointerId)return null;
  if(gesture.workspaceIdentity!==workspaceGestureIdentity(state))return null;
  return {...gesture,position:finite(position)};
}

export function completeGuideGesture(gesture,state,pointerId,{inStage=false,onOwnRuler=false}={}){
  if(!gesture||gesture.pointerId!==pointerId)return null;
  if(gesture.workspaceIdentity!==workspaceGestureIdentity(state))return null;
  if(gesture.kind==='new'){
    return inStage?{command:'guide.add.v1',args:{orientation:gesture.orientation,position:gesture.position}}:null;
  }
  if(onOwnRuler)return {command:'guide.remove.v1',args:{guideId:gesture.id}};
  if(inStage&&Math.abs(gesture.position-gesture.startPosition)>1e-7){
    return {command:'guide.move.v1',args:{guideId:gesture.id,position:gesture.position}};
  }
  return null;
}

export function consumeGuideDeleteKey(event,guide,execute){
  if(!event||!guide||!['Delete','Backspace'].includes(event.key))return false;
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
  if(!guide.locked&&guide.visible!==false)execute?.('guide.remove.v1',{guideId:String(guide.id)});
  return true;
}

export function createPrimaryPointerTracker(){
  let pointerId=null;
  return Object.freeze({
    begin(event){
      if(pointerId!==null)return false;
      if(event?.button!=null&&event.button!==0)return false;
      if(event?.isPrimary===false)return false;
      pointerId=event?.pointerId;
      return pointerId!==undefined&&pointerId!==null;
    },
    matches:event=>pointerId!==null&&event?.pointerId===pointerId,
    finish(event){
      if(pointerId===null||event?.pointerId!==pointerId)return false;
      pointerId=null;return true;
    },
    cancel(){
      const active=pointerId!==null;
      pointerId=null;
      return active;
    },
    active:()=>pointerId
  });
}

export function createViewSyncLoop({
  read,
  render,
  key=viewStateKey,
  subscribe=()=>()=>{},
  requestFrame=callback=>globalThis.requestAnimationFrame(callback),
  cancelFrame=id=>globalThis.cancelAnimationFrame(id)
}={}){
  if(typeof read!=='function'||typeof render!=='function')throw new TypeError('INK_D_VIEW_SYNC_CALLBACKS_REQUIRED');
  let disposed=false,frame=0,last='';
  const invalidate=()=>{last='';};
  const flush=()=>{
    frame=0;
    if(disposed)return;
    const state=read(),next=key(state);
    if(next!==last){last=next;render(state);}
    frame=requestFrame(flush);
  };
  const unsubscribe=subscribe(invalidate)||(()=>{});
  frame=requestFrame(flush);
  return Object.freeze({
    invalidate,
    dispose(){
      if(disposed)return false;
      disposed=true;
      if(frame)cancelFrame(frame);
      frame=0;
      unsubscribe?.();
      return true;
    },
    diagnostics:()=>Object.freeze({disposed,frameActive:Boolean(frame),key:last})
  });
}
