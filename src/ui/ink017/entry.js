import {mountNativeShell} from './shell.js';
export async function mountInk017(app){
 if(document.querySelector('#shell'))return;
 const response=await fetch(new URL('./markup.html',import.meta.url));
 if(!response.ok)throw Error('INK_SHELL_MARKUP_HTTP_'+response.status);
 const parsed=new DOMParser().parseFromString(await response.text(),'text/html'),shell=parsed.querySelector('#shell');
 if(!shell?.querySelector('#artboardStage'))throw Error('INK_SHELL_MARKUP_INVALID');
 shell.querySelector('#workspace').setAttribute('aria-label','Artwork workspace');shell.querySelector('#toast').id='ui017Toast';
 const input=document.createElement('input');input.id='importImageFile';input.type='file';input.accept='image/*';input.hidden=true;shell.append(input);
 const utilities=document.querySelector('#nativeFunctionHost');
 if(utilities){const panel=document.createElement('section');panel.id='nativeFunctionDialog';panel.className='native-function-dialog';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Native document tools');const close=document.createElement('button');close.textContent='Close';close.className='native-function-close';close.addEventListener('click',()=>{panel.hidden=true;shell.querySelector('#logoButton').focus()});panel.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const child=panel.querySelector('dialog[data-size-dialog][open]');e.preventDefault();e.stopPropagation();if(child){child.close();panel.querySelector('[data-size-open="'+child.dataset.sizeDialog+'"]')?.focus();return;}panel.hidden=true;shell.querySelector('#logoButton').focus()});panel.append(close,utilities);utilities.hidden=false;shell.append(panel);}
 app.el.app.classList.remove('ink-minimal-app');app.el.app.classList.add('ink017-native-app');
 const wrap=app.el.wrap;shell.querySelector('#artboardStage').append(wrap);document.querySelector('#app').append(shell);
 const ui=mountNativeShell(app,shell);app.renderer.resize();document.documentElement.classList.remove('ui017-loading');document.documentElement.dataset.inkShellReady='true';document.getElementById('inkBootGate')?.remove();globalThis.INK_UI017=ui;return ui;
}
if(typeof window!=='undefined'){
 const start=()=>{if(window.INK_APP)mountInk017(window.INK_APP).catch(error=>{console.error(error);document.documentElement.dataset.ui017Error=error.message;document.documentElement.dataset.inkShellReady='error';const gate=document.getElementById('inkBootGate');if(gate)gate.textContent='INK 啟動失敗：'+error.message});else setTimeout(start,30)};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
