import {mountNativeShell} from './shell.js';
import {dismissSizeDialog} from '../minimal-test-shell/modules.js';

// INK017 owns the outer keydown route; the native size-dialog module owns
// whether its in-flight Create/Apply may be dismissed. Never call child.close()
// directly here: that bypasses the native dialog's cancel event.
export function bindNativeFunctionPanelDismissal(panel,shell,closeButton){
  const child=()=>panel.querySelector('dialog[data-size-dialog][open]');
  closeButton.addEventListener('click',event=>{
    const modal=child();
    if(modal&&!dismissSizeDialog(modal,event))return;
    panel.hidden=true;
    shell.querySelector('#logoButton')?.focus();
  });
  panel.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    event.preventDefault();
    event.stopPropagation();
    const modal=child();
    if(modal){
      if(!dismissSizeDialog(modal,event))return;
      panel.querySelector('[data-size-open="'+modal.dataset.sizeDialog+'"]')?.focus();
      return;
    }
    panel.hidden=true;
    shell.querySelector('#logoButton')?.focus();
  });
}
export async function mountInk017(app){
 if(document.querySelector('#shell'))return;
 const response=await fetch(new URL('./markup.html',import.meta.url));
 if(!response.ok)throw Error('INK_SHELL_MARKUP_HTTP_'+response.status);
 const parsed=new DOMParser().parseFromString(await response.text(),'text/html'),shell=parsed.querySelector('#shell');
 if(!shell?.querySelector('#artboardStage'))throw Error('INK_SHELL_MARKUP_INVALID');
 shell.querySelector('#workspace').setAttribute('aria-label','Artwork workspace');shell.querySelector('#toast').id='ui017Toast';
 const input=document.createElement('input');input.id='importImageFile';input.type='file';input.accept='image/*';input.hidden=true;shell.append(input);
 const utilities=document.querySelector('#nativeFunctionHost');
 if(utilities){const panel=document.createElement('section');panel.id='nativeFunctionDialog';panel.className='native-function-dialog';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Native document tools');const close=document.createElement('button');close.textContent='Close';close.className='native-function-close';bindNativeFunctionPanelDismissal(panel,shell,close);panel.append(close,utilities);utilities.hidden=false;shell.append(panel);}
 app.el.app.classList.remove('ink-minimal-app');app.el.app.classList.add('ink017-native-app');
 const wrap=app.el.wrap;shell.querySelector('#artboardStage').append(wrap);document.querySelector('#app').append(shell);
 const ui=mountNativeShell(app,shell);app.renderer.resize();document.documentElement.classList.remove('ui017-loading');document.documentElement.dataset.inkShellReady='true';document.getElementById('inkBootGate')?.remove();globalThis.INK_UI017=ui;return ui;
}
if(typeof window!=='undefined'){
 const showBootError=error=>{
  const message=error?.message||String(error);
  console.error('INK_SHELL_BOOT_FAILED',error);
  document.documentElement.dataset.ui017Error=message;
  document.documentElement.dataset.inkShellReady='error';
  const gate=document.getElementById('inkBootGate');
  if(gate)gate.textContent='INK 啟動失敗：'+message+'。請重新載入頁面重試。';
 };
 const start=()=>{
  // A constructor exception must end the startup polling loop, not leave the
  // startup gate visible forever while INK_APP is permanently absent.
  if(window.INK_BOOT_ERROR){showBootError(window.INK_BOOT_ERROR);return;}
  if(window.INK_APP)mountInk017(window.INK_APP).catch(showBootError);
  else setTimeout(start,30);
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
