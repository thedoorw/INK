// #788 Public presentation for the existing Native/diagnostic document shell.
// Renderers accept detached display data only; the Private modules retain all
// command, selector subscription, persistence and authorization handlers.
import {sizeDialogMarkup} from './size-dialog-view.js';

const escapeText=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const button=(action,label,pressed=false)=>'<button type="button" data-action="'+action+'"'+(pressed?' aria-pressed="true"':'')+'>'+label+'</button>';

export function renderMinimalControlsView({tool,history,doc,sessions,comparison,clip,views,
  recovery,brandLogo,previewVisible,ink017}){
  const recoveryOptions=recovery.length
    ?'<option value="">Choose saved document…</option>'+recovery.map(item=>'<option value="'+escapeText(item.key)+'">'+escapeText(item.title||item.documentId||'Untitled')+(item.kind==='legacy'?' (legacy)':'')+'</option>').join('')
    :'<option value="">No recoverable documents</option>';
  const sessionButtons=sessions.map(item=>'<button type="button" data-action="session-select" data-session-id="'+escapeText(item.sessionId)+'" aria-pressed="'+Boolean(item.active)+'" title="'+escapeText(item.title)+'">'+escapeText(item.title||'Untitled')+(item.dirty?' *':'')+'</button>').join('');
  const compareCandidate=sessions.find(item=>!item.active&&item.sessionId!==comparison.secondary);
  const compareToggle=comparison.secondary?'Compare off':compareCandidate?'Compare '+escapeText(compareCandidate.title||'B'):'Compare (open B)';
  const specialist=
    '<div class="ink-control-group ink-branding-launch"><img data-ink-brand-logo class="ink-branding-logo-toolbar" alt="INK LOGO" src="'+escapeText(brandLogo)+'">'+button('branding-open','品牌')+'</div>'+
    '<div class="ink-control-group">'+button('new-a4','New A4')+button('open','Open')+button('save','Save')+'</div>'+
    '<div class="ink-control-group ink-recovery-controls"><label>Recover <select data-recovery-key aria-label="Recover existing document">'+recoveryOptions+'</select></label>'+button('session-restore','Restore')+'</div>'+
    '<div class="ink-control-group ink-session-buttons">'+sessionButtons+button('session-close','Close')+(views.enabled?'':button('session-compare',compareToggle))+button('view-1','1 view',views.enabled&&views.layout===1)+button('view-2','2 views',views.enabled&&views.layout===2)+button('view-4','4 views',views.enabled&&views.layout===4)+button('session-copy','Copy selected')+button('session-paste','Paste'+(clip.ready?' ('+clip.count+')':''))+'</div>'+
    '<div class="ink-control-group">'+button('tool-select','Select',tool==='select')+button('tool-pen','Pen',tool==='pen')+button('tool-brush','Brush',tool==='brush')+button('tool-pan','Pan',tool==='pan')+'</div>'+
    '<div class="ink-control-group">'+button('undo','Undo',false)+(button('redo','Redo',false))+button('fit','Fit')+button('zoom100','100%')+'</div>'+
    '<div class="ink-control-group">'+button('preview','Preview',previewVisible)+button('export-png','PNG')+button('export-svg','SVG')+button('export-pdf','PDF')+'</div>'+
    '<span class="ink-control-spacer"></span><span class="ink-state-meta">'+escapeText(doc.open?(doc.dirty?'dirty':'saved'):'no document')+' · '+(history.applied||0)+' history</span>';
  return ink017
    ?'<section class="ink-tools-group"><h2>Recover saved document</h2><div class="ink-tools-action-row"><select data-recovery-key aria-label="Recover existing document">'+recoveryOptions+'</select>'+button('session-restore','Restore')+'</div></section>'+
      '<section class="ink-tools-group"><h2>Open documents</h2><div class="ink-session-buttons">'+(sessionButtons||'<span class="ink-state-meta">No open documents</span>')+'</div></section>'+
      '<details class="ink-tools-diagnostics"><summary>Document preview</summary><div class="ink-tools-specialist">'+button('preview','Preview',previewVisible)+'</div></details>'
    :specialist;
}

export function renderMinimalStateView({doc,page,layers,history,preview,inspect,previewVisible,
  presets,anchorOptions,ppiMin,ppiMax}){
  const layerRows=layers.slice().reverse().map(layer=>'<div class="ink-state-row"><button type="button" class="'+(layer.active?'active':'')+'" data-layer-id="'+escapeText(layer.id)+'">'+escapeText(layer.name)+'</button><span class="ink-state-meta">'+layer.objectCount+'</span></div>').join('');
  const historyRows=(history.entries||[]).map((entry,index)=>'<button type="button" class="ink-history-row'+(history.applied===index+1?' active':'')+'" data-history-applied="'+(index+1)+'"><span>'+escapeText(entry.label)+'</span><span>'+(entry.applied?'✓':'↺')+'</span></button>').join('');
  const presetOptions=presets.map((item,index)=>'<option value="'+index+'">'+escapeText(item.name||('Preset '+(index+1)))+'</option>').join('');
  return '<section class="ink-state-section"><h2>Document</h2><div class="ink-state-body"><div>'+escapeText(doc.open?(doc.title||'Untitled'):'No document')+'</div><div class="ink-state-meta">'+(doc.open?escapeText(page.name||'')+' · '+(doc.dirty?'dirty':'clean'):'New, Open or Recover a saved document')+'</div><div class="ink-size-actions"><button type="button" data-size-open="new">New…</button><button data-size-open="canvas"'+(doc.open?'':' disabled')+'>Canvas Size…</button><button data-size-open="ppi"'+(doc.open?'':' disabled')+'>Output PPI…</button><button data-size-open="artwork"'+(doc.open?'':' disabled')+'>Resize Artwork…</button></div></div></section>'+
    (inspect?'<details class="ink-tools-diagnostics"><summary>Inspect layers and history</summary>':'')+'<section class="ink-state-section"><h2>Layers</h2><div class="ink-state-body">'+layerRows+'<button type="button" data-layer-add class="ink-block-action">+ Layer</button></div></section>'+
    '<section class="ink-state-section"><h2>History</h2><div class="ink-state-body">'+historyRows+'</div></section>'+
    (inspect?'</details>':'')+(previewVisible?'<section class="ink-state-section"><h2>Preview</h2><div class="ink-state-body">'+(preview?.dataUrl?'<img class="ink-preview" alt="Current page preview" src="'+preview.dataUrl+'">':'<div class="ink-state-meta">No preview</div>')+'</div></section>':'')+
    sizeDialogMarkup({presetOptions,anchorOptions,ppiMin,ppiMax});
}

export function renderMinimalStatusView({tool,scale,sourceBuildId,workerState,dirty}){
  return '<span>INK minimal test shell</span><span>'+escapeText(tool)+'</span><span>'+Math.round((scale||1)*100)+'%</span><span>source '+escapeText(sourceBuildId||'unbound')+'</span><span>SW '+escapeText(workerState||'idle')+'</span><span>'+escapeText(dirty?'autosave pending/dirty':'ready')+'</span>';
}
