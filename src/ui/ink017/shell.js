import transform from './panels/properties.js';
import {mountMenuUi} from './menu-ui.js';
import {mountDock} from './right-dock.js';
import {createNativeHost} from './native-host.js';
import {esc,selected,field,iconButton,drag} from './shared-controls.js';
export function mountNativeShell(app,root){
 const host=createNativeHost(app),$=s=>root.querySelector(s),dock=mountDock($('#rightDock'),host),abort=new AbortController(),{signal}=abort;
 const menu=$('#mainMenu'),overlay=$('#overlay'),context=$('#contextControls');let contextMounted=false,dialogAbort,importTarget,menuUi=null,dialogReturnFocus=null;
 const feedback=message=>{const toast=$('#ui017Toast');toast.textContent=message;clearTimeout(feedback.timer);feedback.timer=setTimeout(()=>toast.textContent='',4000)};
 const run=async(id,args={})=>{const r=await host.execute(id,args);if(!r.ok)feedback(r.error.message);return r};
 host.subscribeCommands(e=>{if(!e.result.ok)feedback(e.result.error)});
 const close=()=>{dialogAbort?.abort();const wasOpen=!overlay.hidden;overlay.hidden=true;overlay.replaceChildren();if(wasOpen){const focus=dialogReturnFocus;dialogReturnFocus=null;focus?.focus?.()}};
 function dialog(title,content,apply){close();dialogReturnFocus=document.activeElement;dialogAbort=new AbortController();overlay.hidden=false;overlay.innerHTML=`<section class="dialog dialog-compact" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="dialog-header"><strong>${esc(title)}</strong><button class="dialog-close" aria-label="Close">×</button></header><div class="dialog-body">${content}</div><footer class="dialog-footer"><button type="button" data-cancel>Cancel</button><button type="button" class="primary" data-apply>Apply</button></footer></section>`;
  const sig=dialogAbort.signal;overlay.querySelector('.dialog-close').addEventListener('click',close,{signal:sig});overlay.querySelector('[data-cancel]').addEventListener('click',close,{signal:sig});
  overlay.querySelector('[data-apply]').addEventListener('click',async()=>{const args=Object.fromEntries([...overlay.querySelectorAll('[data-key]')].map(e=>[e.dataset.key,e.type==='number'?Number(e.value):e.value]));try{const r=await apply(args);if(r?.ok)close()}catch(e){feedback(e.message)}},{signal:sig});
  overlay.querySelector('input,select,button')?.focus();overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}if(e.key==='Tab'){const els=[...overlay.querySelectorAll('button,input,select')].filter(e=>!e.disabled),i=els.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();els.at(-1).focus()}else if(!e.shiftKey&&i===els.length-1){e.preventDefault();els[0].focus()}}},{signal:sig});
  drag(overlay.querySelector('.dialog-header'),e=>{if(e.target.closest('button'))return;const d=overlay.querySelector('.dialog');d.style.transform=`translate(${e.clientX-innerWidth/2}px,${e.clientY-innerHeight/2}px)`},()=>{},sig);
 }
 function imageDialog(kind){const s=host.getSnapshot(),t=host.target(),o=s.object,d=s.docs[0];if(kind!=='canvas-size'&&(!o?.raster||o.locked)){feedback('Select an unlocked image');return}
  const canvas=kind==='canvas-size',crop=kind==='crop',w=canvas?d.width:o.raster.width,h=canvas?d.height:o.raster.height;
  dialog(canvas?'Canvas Size':crop?'Crop':'Image Size',`${crop?field('x','X',0)+field('y','Y',0):''}<div class="pair-grid">${field(crop?'w':'width','Width',w)}${field(crop?'h':'height','Height',h)}</div>${canvas?field('units','Units','mm','text',['mm','px','in','cm'])+field('anchor','Anchor','center','text',['top-left','top','top-right','left','center','right','bottom-left','bottom','bottom-right']):crop?'':field('resampling','Resampling','nearest','text',['nearest'])}`,a=>run(canvas?'ui017.canvas.resize.v1':crop?'ui017.image.crop.v1':'ui017.image.resize.v1',{...a,target:t}));
 }

 // Keep the existing size-dialog implementation and state owner in minimal.state.v1.
 // Only surface its native modal; the full Document tools host stays diagnostic-only.
 let sizeRouteCleanup=null;
 function openSizeRoute(kind){
  const panel=$('#nativeFunctionDialog'),opener=panel?.querySelector('[data-size-open="'+kind+'"]');
  const modal=panel?.querySelector('dialog[data-size-dialog="'+kind+'"]');
  if(!opener||!modal){feedback('Size dialog not available');return}
  if(panel.querySelector('dialog[open]')){feedback('Finish the open size dialog first');return}
  sizeRouteCleanup?.();
  const returnFocus=document.activeElement;
  panel.hidden=false;panel.classList.add('size-route-active');
  const detach=()=>{modal.removeEventListener('close',finish);if(sizeRouteCleanup===detach)sizeRouteCleanup=null};
  const finish=()=>{if(modal.open)return;detach();if(panel.querySelector('dialog[open]'))return;panel.classList.remove('size-route-active');panel.hidden=true;returnFocus?.focus?.()};
  sizeRouteCleanup=detach;
  modal.addEventListener('close',finish);
  opener.click();
  if(!modal.open)finish();
 }
 function closeDocumentDialog(){
  const sessions=host.select('session.list')||[],active=sessions.find(item=>item.active);
  if(!active){feedback('No active document');return}
  if(!active.dirty)return run('session.close.v1',{sessionId:active.sessionId,decision:'discard'});
  const name=esc(active.title||'Untitled'),sessionId=active.sessionId;
  dialog('Close Document','<p class="dialog-copy">Save changes to <strong>'+name+'</strong> before closing?</p>',async()=>({ok:false}));
  const footer=overlay.querySelector('.dialog-footer');
  footer.innerHTML='<button type="button" data-close-choice="cancel">Cancel</button><button type="button" data-close-choice="discard">Don’t Save</button><button type="button" class="primary" data-close-choice="save">Save</button>';
  footer.addEventListener('click',async e=>{
   const button=e.target.closest('[data-close-choice]');if(!button)return;
   const decision=button.dataset.closeChoice;
   if(decision==='cancel'){close();return}
   if((host.select('session.list')||[]).find(x=>x.active)?.sessionId!==sessionId){feedback('Active document changed');return}
   [...footer.querySelectorAll('button')].forEach(b=>b.disabled=true);
   try{const r=await run('session.close.v1',{sessionId,decision});if(r?.ok===true)close();}
   finally{if(!overlay.hidden)[...footer.querySelectorAll('button')].forEach(b=>b.disabled=false);}
  },{signal:dialogAbort.signal});
  footer.querySelector('[data-close-choice="save"]').focus();
 }
 function exportDialog(format='png'){
  const doc=host.select('document.current')||{};
  if(!doc.open){feedback('Open a document before export');return}
  dialog('Export','<label class="field-row"><span>Format</span><select data-key="format"><option value="png">PNG</option><option value="svg">SVG</option><option value="pdf">PDF</option></select></label><p class="dialog-copy">Artboard · background included</p>',async ({format})=>{
   const result=await host.app.runExportRequest({format,scope:'artboard',background:true,entryPolicy:'minimal'});
   if(!result?.completed)throw Error('Export did not complete');
   feedback('Exported '+result.name);return {ok:true};
  });
  overlay.querySelector('[data-key="format"]').value=format;
  overlay.querySelector('[data-apply]').textContent='Export';
 }
 const command=async key=>{
  menuUi?.close(menu.contains(document.activeElement));const s=host.getSnapshot();
  if(key==='native-tools'){const panel=root.querySelector('#nativeFunctionDialog');panel.hidden=false;panel.querySelector('button')?.focus();return}
  if(key==='undo'||key==='redo')return run('history.'+key+'.v1');
  if(key==='new')return openSizeRoute('new');
  if(key==='open')return $('#openFile').click();if(key==='import-image'){importTarget={target:host.target(),layerId:s.docs[0]?.selection};return $('#importImageFile').click()}
  if(key==='close')return closeDocumentDialog();
  if(key==='save')return run('document.save.v1');if(key.startsWith('export:'))return exportDialog(key.slice(7));
  if(key==='copy'||key==='paste')return run('session.'+key+'.v1');
  if(key==='branding'){globalThis.dispatchEvent(new Event('ink:branding-open'));return}
  if(key==='ppi'||key==='artwork'||key==='canvas-size')return openSizeRoute(key==='canvas-size'?'canvas':key);
  if(key==='fit')return run('view.fit.content.v1');if(key==='100')return run('view.zoom.set.v1',{scale:1});
  if(key==='adjustments')return dock.activate('adjustments');
  if(['image-size','crop'].includes(key))return imageDialog(key);
  if(key==='transform'){root.querySelector('.context-float').classList.add('expanded');$('#contextToggle').setAttribute('aria-expanded','true');$('#transformControls input:not(:disabled)')?.focus();return}
  if(key==='duplicate'||key==='delete')return host.dispatch({type:'layer.'+key,object:true,target:host.target(),source:'context'});
  if(key==='align'){const t=host.target();if(t.refs.length<2){feedback('Select at least two objects');return}return dialog('Align',field('mode','Align','left','text',['left','centerX','right','top','centerY','bottom','distributeX','distributeY']),a=>{host.provider.requireSelection(t);return run('object.align.v1',{...a,targetRefs:t.refs.map(r=>({...r,pageId:t.pageId}))})})}
  if(key==='history-limit'){const target=host.target(),value=host.provider.native.preferencesSnapshot().historyLimit;return dialog('History limit',field('historyLimit','Retained steps',String(value),'text',['20','30','50']),async a=>{host.provider.requireDocument(target);const limit=Number(a.historyLimit);if(![20,30,50].includes(limit))throw Error('Choose 20, 30 or 50 steps');host.provider.native.applyPreferences({historyLimit:limit});return{ok:true}})}
  if(key==='about')return dialog('INK','<p>INK</p>',async()=>({ok:true}));
  if(key.startsWith('panel:'))return dock.activate(key.slice(6));
 };
 menuUi=mountMenuUi({menu,logo:$('#logoButton'),host,invoke:command,signal});
 root.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.tool==='crop'){imageDialog('crop');return}if(b.dataset.tool==='zoom'){const scale=host.getSnapshot().docs[0]?.camera.zoom/100;if(scale)run('view.zoom.set.v1',{scale:Math.min(32,scale*1.25)});return}host.dispatch({type:'tool.set',value:b.dataset.tool==='hand'?'pan':b.dataset.tool,source:'rail'})},{signal}));
 $('#quickUndo').addEventListener('click',()=>command('undo'),{signal});$('#quickRedo').addEventListener('click',()=>command('redo'),{signal});$('#railToggle').addEventListener('click',()=>root.classList.toggle('rail-double'),{signal});
 $('#contextToggle').addEventListener('click',()=>{root.querySelector('.context-float').classList.toggle('expanded');$('#contextToggle').setAttribute('aria-expanded',String(root.querySelector('.context-float').classList.contains('expanded')))},{signal});
 $('#colorState').addEventListener('click',()=>dock.activate('color'),{signal});$('#resetColors').addEventListener('click',()=>host.dispatch({type:'paint.reset',source:'rail'}),{signal});$('#swapColors').addEventListener('click',()=>host.dispatch({type:'paint.swap',source:'rail'}),{signal});
 $('#openFile').accept='.ink,.json';$('#openFile').addEventListener('change',e=>{const file=e.target.files[0];if(file)run('document.open.v1',{file});e.target.value=''},{signal});
 $('#importImageFile').addEventListener('change',e=>{const file=e.target.files[0],s=host.getSnapshot();if(file)run('ui017.image.import.v1',{file,...importTarget});e.target.value=''},{signal});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&(!overlay.hidden||!menu.hidden)){e.preventDefault();e.stopPropagation();close();if(!menu.hidden)menuUi.close(true)}if(e.target.matches('input,textarea,select'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopPropagation();command(e.shiftKey?'redo':'undo')}},{signal});
 drag($('#dockResizer'),e=>root.style.setProperty('--dock-width',Math.max(210,Math.min(400,innerWidth-e.clientX))+'px'),()=>{},signal);
 function render(s){const h=host.getHistory(),o=s.object;$('#quickUndo').disabled=h.index===0;$('#quickRedo').disabled=h.index===h.entries.length-1;
  root.querySelectorAll('[data-tool]').forEach(b=>{b.classList.toggle('active',(b.dataset.tool==='hand'?'pan':b.dataset.tool)===s.tool);b.setAttribute('aria-pressed',String((b.dataset.tool==='hand'?'pan':b.dataset.tool)===s.tool));if(['marquee','lasso','eyedropper','gradient','guide'].includes(b.dataset.tool))b.disabled=true;else if(b.dataset.tool==='crop')b.disabled=!o?.raster||o.locked;else if(b.dataset.tool==='zoom')b.disabled=!s.docs.length});
  $('#colorState .fg').style.background=s.paint.foreground;$('#colorState .bg').hidden=false;$('#colorState .bg').style.background=s.paint.background;$('#resetColors').disabled=$('#swapColors').disabled=!s.docs.length;$('#contextIdentity').textContent=o?o.type:({pan:'Hand',select:'Select',pen:'Pen',brush:'Brush',shape:'Shape',text:'Text',eraser:'Eraser'}[s.tool]||s.tool);
  if(!contextMounted){context.innerHTML=`<div class="context-actions">${[['duplicate','Duplicate'],['delete','Delete'],['align','Align']].map(([k,label])=>iconButton(k==='duplicate'?'duplicate':k==='delete'?'delete':'align',label,`data-context="${k}"`)).join('')}</div><div id="transformControls"></div><label class="field-row"><span>Fill</span><input data-fill type="color" aria-label="Object fill"></label>`;transform.mount($('#transformControls'),host);contextMounted=true;
   context.addEventListener('click',e=>{const b=e.target.closest('[data-context]');if(b)Promise.resolve(command(b.dataset.context)).catch(e=>feedback(e.message))},{signal});context.querySelector('[data-fill]').addEventListener('change',e=>host.dispatch({type:'fill.set',color:e.target.value,source:'fill'}),{signal});
  }
  context.querySelectorAll('[data-context]').forEach(b=>b.disabled=!o||o.locked||(b.dataset.context==='align'&&s.target.refs.length<2));const fill=context.querySelector('[data-fill]');fill.disabled=!o||o.locked||!['path','shape'].includes(o.type);if(/^#[0-9a-f]{6}$/i.test(o?.fill))fill.value=o.fill;
 }
 const syncBrandName=()=>{
  const name=globalThis.INK_BRANDING?.getName?.()||'INK';
  $('#logoButton').title=name;
  $('#logoButton').setAttribute('aria-label',name+' application menu');
 };
 globalThis.addEventListener('ink:branding-changed',syncBrandName,{signal});
 syncBrandName();
 globalThis.dispatchEvent(new Event('ink:ui-shell-mounted'));
 const unsubscribe=host.subscribe(render);render(host.getSnapshot());
 return{host,dock,command,dispose(){sizeRouteCleanup?.();unsubscribe();abort.abort();close();transform.unmount();dock.unmount();host.dispose()}};
}
