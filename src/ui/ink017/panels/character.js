import {lifecycle,selected,field,esc,iconButton,nativeToolEmptyState,wireNativeToolEmptyState} from '../shared-controls.js';
import {baselineAvailable,baselinePatch,eligibleKerningPairs,kerningPairPatch} from './character-typography.js';

let pairSelection={id:null,start:null},lastError='';
// PS-observed Character additions use the existing text.patch -> ui017.text.edit.v1
// History owner. Only current native-supported text objects can edit them.
export default lifecycle('character',s=>{
 const found=selected(s),hasText=found?.type==='text',o=hasText?found:{font:'',weight:'',size:'',leading:'',tracking:'',textColor:'#000000',text:'',w:0,h:0};
 const disabled=!hasText||o.locked,base=hasText&&baselineAvailable(o),pairs=hasText?eligibleKerningPairs(o):[];
 if(pairSelection.id!==o.id){pairSelection={id:o.id,start:null};lastError='';}
 const savedPair=o.kerningPairs?.find(p=>pairs.some(x=>x.start===p.start));
 const pairStart=pairs.some(p=>p.start===pairSelection.start)?pairSelection.start:(savedPair?.start??pairs[0]?.start??0);
 const kerning=o.kerningPairs?.find(p=>p.start===pairStart)?.adjustment??0,baseline=o.textRuns?.[0]?.baselineShift??0;
 const pairControl=pairs.length?`<label class="field-row"><span>Pair</span><select data-kerning-pair aria-label="Manual kerning pair">${pairs.map(p=>`<option value="${p.start}" ${p.start===pairStart?'selected':''}>${esc(p.text)} · ${p.start}</option>`).join('')}</select></label>`:'<p class="capability-empty">Pair kerning: ASCII single line and text box only.</p>';
 return `${hasText?'':nativeToolEmptyState('Select text to edit.','text','Use Text tool',s)}
 <fieldset class="character-first-screen" ${disabled?'disabled':''}>
 <div class="character-font-row">${field('font','Font',o.font,'text',undefined,'Font')}${field('weight','Style',o.weight,'number',undefined,'Style (weight)')}</div>
 <div class="pair-grid character-metrics">${field('size','Size px',o.size,'number',undefined,'Size')}${field('leading','Lead px',o.leading,'number',undefined,'Leading')}${field('tracking','Tracking',o.tracking,'number',undefined,'Tracking')}${field('textColor','Color',o.textColor,'color',undefined,'Text color')}${field('boxWidth','Box W',hasText?(o.textBox?.width||Math.max(10,o.w)):'','number',undefined,'Box W')}${field('boxHeight','Box H',hasText?(o.textBox?.height||Math.max(10,o.h)):'','number',undefined,'Box H')}</div>
 ${lastError?`<p class="capability-empty" role="status">${esc(lastError)}</p>`:'' }
 <div class="character-native-typography" aria-label="Native text typography">
 <div class="character-font-row">${pairControl}${base?field('baseline','Base px',baseline,'number',undefined,'Whole-line baseline shift px'):'<p class="capability-empty">Baseline: single line without partial runs only.</p>'}</div>
 ${pairs.length?field('kerningAdjust','Kern px',kerning,'number',undefined,'Selected pair manual kerning px'):''}
 </div>
 <div class="character-style-controls" role="toolbar" aria-label="Supported text presentation">${o.textBox?iconButton('transform','Uppercase',`data-presentation="case" aria-pressed="${o.textPresentation?.case==='upper'}"`):'<span class="capability-empty">Presentation case requires a text box.</span>'}</div>
 <div class="character-text-edit">${field('text','Text',o.text,'text',undefined,'Text')}</div>
 <p class="unit-hint">Size/leading, baseline and manual pair kerning: px. Text edits reset source-indexed typography; Undo restores it.</p>
 </fieldset>`;
},(r,h,signal,paint)=>{
 wireNativeToolEmptyState(r,h,signal);
 const send=patch=>{
  const result=h.dispatch({type:'text.patch',patch,target:JSON.parse(r.dataset.nativeTarget),source:'character'});
  lastError=result.ok?'':String(result.error?.message||result.error||'Text operation unavailable');
  if(!result.ok)paint();
  return result;
 };
 const unsupported=message=>{lastError=message;paint();};
 r.addEventListener('change',e=>{
  if(e.target.matches('[data-kerning-pair]')){
   const o=selected(h.getSnapshot()),start=Number(e.target.value);
   pairSelection={id:o?.id,start};
   const input=r.querySelector('[data-key="kerningAdjust"]');
   if(input)input.value=String(o?.kerningPairs?.find(p=>p.start===start)?.adjustment??0);
   return;
  }
  const k=e.target.dataset.key;if(!k)return;
  const o=selected(h.getSnapshot());if(o?.type!=='text'||o.locked)return;
  const value=e.target.type==='number'?Number(e.target.value):e.target.value;
  if(k==='baseline'){const patch=baselinePatch(o,value);if(patch)send(patch);else unsupported('Baseline shift unavailable for this text or value.');return;}
  if(k==='kerningAdjust'){
   const start=Number(r.querySelector('[data-kerning-pair]')?.value);
   const patch=kerningPairPatch(o,start,value);if(patch)send(patch);else unsupported('Manual kerning requires a supported pair and finite value.');
   return;
  }
  if(k==='boxWidth'||k==='boxHeight')send({textBox:{width:o.textBox?.width||Math.max(10,o.w),height:o.textBox?.height||Math.max(10,o.h),[k==='boxWidth'?'width':'height']:value}});
  else if(k==='text'){
   const changed=value!==o.text;
   send(changed&&(o.textRuns?.length||o.kerningPairs?.length)?{text:value,textRuns:null,kerningPairs:null}:{text:value});
  }
  else{const keys={font:'fontFamily',weight:'fontWeight',size:'fontSize',leading:'lineHeight',tracking:'tracking',textColor:'color'};send({[keys[k]]:k==='leading'?value/o.size:value})}
 },{signal});
 r.addEventListener('click',e=>{const b=e.target.closest('[data-presentation]');if(!b||b.disabled)return;const o=selected(h.getSnapshot()),key=b.dataset.presentation;if(!o||o.locked)return;send({textPresentation:{...o.textPresentation,[key]:key==='case'?(o.textPresentation.case==='upper'?'none':'upper'):!o.textPresentation[key]}})},{signal});
});
