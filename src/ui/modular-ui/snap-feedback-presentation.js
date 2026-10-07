const display=value=>{
  const number=Number(value);
  if(!Number.isFinite(number))return null;
  return number.toFixed(Math.abs(number)<10?1:0);
};

export function snapFeedbackText(evidence={}){
  const parts=[];
  for(const axis of ['x','y']){
    const item=evidence?.[axis];
    if(!item)continue;
    const label=axis.toUpperCase();
    if(item.type==='equal-distance'&&Number.isFinite(Number(item.gap))){
      parts.push(label+' gap '+display(item.gap)+' px');
      continue;
    }
    if(Number.isFinite(Number(item.correction))&&Math.abs(Number(item.correction))>1e-9){
      parts.push('Δ'+label+' '+display(item.correction)+' px');
      continue;
    }
    if(Number.isFinite(Number(item.targetValue)))parts.push(label+' '+display(item.targetValue)+' px');
  }
  return parts.join(' · ');
}

export function createSnapFeedbackPresentation({document=globalThis.document}={}){
  if(!document?.querySelector||!document?.createElement)throw new TypeError('INK_SNAP_FEEDBACK_DOCUMENT_REQUIRED');
  let mounted=false,readout=null,area=null;
  const diagnostics=()=>Object.freeze({
    mounted,
    readoutPresent:Boolean(readout?.isConnected),
    hidden:readout?.hidden??null,
    text:readout?.textContent||'',
    mode:readout?.dataset?.mode||null
  });
  const clear=()=>{
    if(!readout)return false;
    readout.hidden=true;
    readout.value='';
    readout.textContent='';
    delete readout.dataset.mode;
    return true;
  };
  const mount=()=>{
    if(mounted)return false;
    area=document.querySelector('[data-d-stage-area]');
    if(!area)throw new Error('INK_SNAP_FEEDBACK_STAGE_AREA_REQUIRED');
    if(document.getElementById?.('shellSnapReadout'))throw new Error('INK_SNAP_FEEDBACK_DUPLICATE_READOUT');
    readout=document.createElement('output');
    readout.id='shellSnapReadout';
    readout.className='ink-d-guide-readout ink-d-snap-readout';
    readout.hidden=true;
    readout.setAttribute('aria-live','polite');
    readout.setAttribute('aria-label','Snap feedback');
    area.append(readout);
    mounted=true;
    return true;
  };
  const show=(evidence={},point={})=>{
    if(!mounted||!readout?.isConnected||!area?.isConnected)return false;
    const text=snapFeedbackText(evidence);
    if(!text){clear();return false;}
    const rect=area.getBoundingClientRect();
    const clientX=Number.isFinite(Number(point.clientX))?Number(point.clientX):rect.left+24;
    const clientY=Number.isFinite(Number(point.clientY))?Number(point.clientY):rect.top+24;
    const x=clientX-rect.left,y=clientY-rect.top;
    readout.value=text;
    readout.textContent=text;
    readout.dataset.mode=Object.values(evidence||{}).some(item=>item?.type==='equal-distance')?'equal-spacing':'snap';
    readout.style.left=Math.max(6,Math.min(Math.max(6,rect.width-180),x+12))+'px';
    readout.style.top=Math.max(6,Math.min(Math.max(6,rect.height-28),y+12))+'px';
    readout.hidden=false;
    return true;
  };
  const dispose=()=>{
    if(!mounted)return false;
    clear();
    try{readout?.remove?.();}catch{}
    readout=null;area=null;mounted=false;
    return true;
  };
  return Object.freeze({mount,show,clear,dispose,diagnostics,get mounted(){return mounted;}});
}
