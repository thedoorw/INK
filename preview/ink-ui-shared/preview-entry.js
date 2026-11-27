// This entry imports the exact Public UI source at the same Git commit.
// It intentionally does not import Native entry.js, native-host.js or Core.
import {mountNativeShell} from '../../src/ui/ink017/shell.js';
import {createMockHost} from './mock-host.js';
import {renderNewDocumentSizeDialog,registerInkPublicViews} from '../../src/ui/ink017/shared-controls.js';
registerInkPublicViews();

// Same markup as Native, but the surrounding preview Host owns only a memory
// fixture. It never imports the Native state module or Document size engine.
function mountMockNewDocumentDialog(shell,host){
 const panel=document.createElement('section');panel.id='nativeFunctionDialog';
 panel.className='native-function-dialog';panel.hidden=true;
 panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Document tools');
 panel.setAttribute('aria-modal','true');
 const header=document.createElement('header');header.className='dialog-header';
 const title=document.createElement('h2');title.textContent='Document tools';
 const close=document.createElement('button');close.type='button';close.className='dialog-close native-function-close';close.textContent='×';
 close.setAttribute('aria-label','Close Document tools');header.append(title,close);
 const utilities=document.createElement('div');utilities.id='nativeFunctionHost';utilities.className='native-function-module';
 const slot=document.createElement('aside');slot.className='ink-minimal-state';slot.dataset.slot='state';
 const view=document.createElement('div');view.dataset.moduleSlot='state';
 const opener=document.createElement('button');opener.type='button';opener.dataset.sizeOpen='new';opener.textContent='New…';
 const markup=renderNewDocumentSizeDialog({ppiMin:36,ppiMax:2400,presetOptions:''});
 const modal=new DOMParser().parseFromString(markup,'text/html').querySelector('dialog[data-size-dialog="new"]');
 if(!modal)throw Error('MOCK_NEW_DOCUMENT_VIEW_CONTRACT');
 const field=name=>modal.querySelector('[data-size-field="'+name+'"]');
 const status=modal.querySelector('[data-size-preview]');
 const renderPreview=()=>{
  const width=Number(field('width').value),height=Number(field('height').value),ppi=Number(field('ppi').value);
  const unit=field('units').value,factor=({mm:1,cm:10,'in':25.4,px:25.4/ppi})[unit];
  if(!Number.isFinite(width*height*ppi*factor)||width<=0||height<=0||ppi<36||ppi>2400){status.textContent='Mock Preview: invalid size';return;}
  const wpx=Math.round(width*factor/25.4*ppi),hpx=Math.round(height*factor/25.4*ppi);
  status.textContent=width+' × '+height+' '+unit+' · '+(width<=height?'portrait':'landscape')+' · '+wpx+' × '+hpx+' px';
 };
 let onCreate=()=>host.setFixture('a4');
 const open=()=>{
  field('width').value='210';field('height').value='297';field('units').value='mm';field('ppi').value='300';
  renderPreview();modal.showModal();field('width').focus();
 };
 const dismiss=()=>{if(modal.open)modal.close()};
 opener.addEventListener('click',open);
 close.addEventListener('click',()=>{dismiss();panel.hidden=true;panel.classList.remove('size-route-active')});
 modal.addEventListener('click',event=>{
  if(event.target.closest('[data-size-cancel]'))dismiss();
  if(event.target.closest('[data-size-swap]')){
   const width=field('width').value;field('width').value=field('height').value;field('height').value=width;renderPreview();
  }
  if(event.target.closest('[data-size-apply]')){
   onCreate();dismiss(); // Only the Mock fixture changes; no file is created.
  }
 });
 modal.addEventListener('input',renderPreview);
 for(const selector of ['[data-size-save-preset]','[data-size-preset]']){
  const control=modal.querySelector(selector);if(control){control.disabled=true;control.title='Mock Preview: local presets disabled';}
 }
 view.append(opener,modal);slot.append(view);utilities.append(slot);panel.append(header,utilities);shell.append(panel);
 return {panel,modal,bindCreate:callback=>{onCreate=callback}};
}

// Brand layout and controls come from the exact Real view module. The Native
// controller with its real IO commands is NEVER loaded here.
function mountMockBrandingView(){
 const view=globalThis.INK_BRANDING_VIEW?.createBrandingView({
  ownerUpload:'https://github.com/thedoorw/INK/upload/main/assets'
 });
 if(!view)throw Error('MOCK_BRANDING_VIEW_CONTRACT');
 const initial=Object.freeze({name:'INK',title:'INK v0.1 · Web'});
 let draft={...initial};
 let previousFocus=null;
 const render=()=>{
  view.nameInput.value=draft.name;
  view.titleInput.value=draft.title;
  view.logoImage.src='../../assets/ink-mark.svg';
  view.faviconImage.src='../../assets/favicon.png?v=95de05792e06';
 };
 const close=()=>{
  if(view.backdrop.hidden)return;
  view.backdrop.hidden=true;
  previousFocus?.focus?.();
 };
 const open=()=>{
  if(!view.backdrop.hidden)return;
  previousFocus=document.activeElement;
  view.backdrop.hidden=false;
  view.nameInput.focus();
 };
 for(const kind of ['logoChoose','logoInput','candidateButton']){
  view[kind].disabled=true;
  view[kind].title='Mock Preview: file operations are unavailable';
 }
 // Keep Native appearance and href, but no Mock operation can navigate out.
 view.ownerLink.setAttribute('aria-disabled','true');
 view.ownerLink.addEventListener('click',event=>event.preventDefault());
 view.nameInput.addEventListener('input',()=>{draft.name=view.nameInput.value.slice(0,32)});
 view.titleInput.addEventListener('input',()=>{draft.title=view.titleInput.value.slice(0,100)});
 view.clearButton.addEventListener('click',()=>{
  draft={...initial};render();
  view.status.hidden=false;view.status.textContent='Mock Preview：已清除暫存欄位，無網站變更。';
 });
 for(const button of [view.close,view.dismiss])button.addEventListener('click',close);
 view.backdrop.addEventListener('click',event=>{if(event.target===view.backdrop)close()});
 view.backdrop.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();close()}
 });
 window.addEventListener('ink:branding-open',open);
 document.body.append(view.backdrop);
 render();
 return {open,close,view};
}

async function main(){
  const source=new URL('../../src/ui/ink017/markup.html',import.meta.url);
  const response=await fetch(source,{cache:'no-store'});
  if(!response.ok)throw Error('MOCK_UI_MARKUP_HTTP_'+response.status);
  const parsed=new DOMParser().parseFromString(await response.text(),'text/html');
  const shell=parsed.querySelector('#shell');
  if(!shell?.querySelector('#artboardStage'))throw Error('MOCK_UI_MARKUP_CONTRACT');
  shell.querySelector('#toast').id='ui017Toast';
  const input=document.createElement('input');
  input.id='importImageFile';input.type='file';input.accept='image/*';input.hidden=true;input.disabled=true;
  shell.append(input);
  // No local file may enter a Mock fixture through the shared menu.
  shell.querySelector('#openFile').disabled=true;
  const stage=document.createElement('div');stage.id='mockStage';stage.setAttribute('aria-label','Mock artboard (no Native renderer)');
  stage.className='preview-page';
  shell.querySelector('#artboardStage').append(stage);
  const host=createMockHost();
  document.querySelector('#app').append(shell);
  const mockNewDocument=mountMockNewDocumentDialog(shell,host);
  const mockBranding=mountMockBrandingView();
  const ui=await mountNativeShell(host,shell);
  const fixtureControl=document.getElementById('mockFixture');
  const status=document.getElementById('mockLiveStatus');
  const viewport=shell.querySelector('#artboardStage');
  shell.querySelector('.workspace').style.backgroundColor='#dedede'; // Native canvas background, Mock only.
  stage.style.backgroundColor='#fffef9';
  let fittedZoom=100;
  const syncMockStage=snapshot=>{
    const d=snapshot.docs[0];if(!d)return;
    const scale=fittedZoom/100,zoom=d.camera.zoom/fittedZoom;
    stage.style.width=(d.width*96/25.4*scale)+'px';
    stage.style.height=(d.height*96/25.4*scale)+'px';
    stage.style.transform=`translate(-50%,-50%) translate(${d.camera.x}px,${d.camera.y}px) scale(${zoom})`;
    // Native paints a 1px screen-space frame and a 5px/18px shadow; CSS
    // lengths are inverse-scaled so zoom does not make the frame thicker.
    stage.style.outline=`${1/zoom}px solid rgba(0,0,0,.58)`;
    stage.style.boxShadow=`0 ${5/zoom}px ${18/zoom}px rgba(0,0,0,.42)`;
  };
  host.subscribe(syncMockStage);
  function setFixture(fixture){
    const r=viewport.getBoundingClientRect();
    const chosen=host.setFixture(fixture,{width:r.width,height:r.height});
    fittedZoom=host.getSnapshot().docs[0]?.camera.zoom||100;
    syncMockStage(host.getSnapshot());
    stage.hidden=chosen==='empty';
    fixtureControl.value=chosen;
    document.documentElement.dataset.previewFixture=chosen;
    status.textContent='狀態：'+fixtureControl.selectedOptions[0].textContent+' · Mock only';
    return chosen;
  }
  const resizeObserver=new ResizeObserver(()=>{
    const r=viewport.getBoundingClientRect();
    fittedZoom=host.resizeViewport({width:r.width,height:r.height});
    syncMockStage(host.getSnapshot()); // Preserve camera, selected fixture, and History.
  });
  resizeObserver.observe(viewport);
  mockNewDocument.bindCreate(()=>setFixture('a4'));
  fixtureControl.addEventListener('change',()=>setFixture(fixtureControl.value));
  document.getElementById('mockDialog').addEventListener('click',()=>ui.command('history-limit'));
  document.getElementById('mockRefresh').addEventListener('click',()=>location.reload());
  document.querySelector('#hideFixtureControls').addEventListener('click',()=>{document.documentElement.dataset.previewClean='true'});
  const params=new URLSearchParams(location.search);
  if(params.has('clean'))document.documentElement.dataset.previewClean='true';
  setFixture(params.get('state')||'a4');
  // Reproducible UI-only URL fixtures: same Public modules, no Native actions.
  const panel=params.get('panel');
  if(['navigator','swatches','color','character','paragraph','brushes','adjustments','layers','history','paths'].includes(panel))ui.dock.activate(panel);
  if(params.get('tool'))host.dispatch({type:'tool.set',value:params.get('tool')});
  if(params.get('dialog')==='history-limit')ui.command('history-limit');
  else if(params.get('dialog')==='new')ui.command('new');
  else if(params.get('dialog')==='branding')mockBranding.open();
  else if(params.get('menu')==='open')shell.querySelector('#logoButton').click();
  document.documentElement.dataset.inkShellReady='true';
  window.INK_UI017=ui;
  window.INK_MOCK_PREVIEW=Object.freeze({host,source:source.href,setFixture,
    getSnapshot:()=>host.getSnapshot(),getHistory:()=>host.getHistory()});
}
main().catch(error=>{console.error('INK_UI_MOCK_PREVIEW_FAILED',error);document.body.textContent='INK UI Preview failed: '+error.message;document.documentElement.dataset.inkShellReady='error'});
