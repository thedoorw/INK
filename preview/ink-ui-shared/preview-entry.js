// This entry imports the exact Public UI source at the same Git commit.
// It intentionally does not import Native entry.js, native-host.js or Core.
import {mountNativeShell} from '../../src/ui/ink017/shell.js';
import {createMockHost} from './mock-host.js';

async function main(){
  const source=new URL('../../src/ui/ink017/markup.html',import.meta.url);
  const response=await fetch(source,{cache:'no-store'});
  if(!response.ok)throw Error('MOCK_UI_MARKUP_HTTP_'+response.status);
  const parsed=new DOMParser().parseFromString(await response.text(),'text/html');
  const shell=parsed.querySelector('#shell');
  if(!shell?.querySelector('#artboardStage'))throw Error('MOCK_UI_MARKUP_CONTRACT');
  shell.querySelector('#toast').id='ui017Toast';
  const stage=document.createElement('div');stage.id='mockStage';stage.setAttribute('aria-label','Mock artboard (no Native renderer)');
  stage.className='preview-page';
  shell.querySelector('#artboardStage').append(stage);
  const host=createMockHost();
  document.querySelector('#app').append(shell);
  const ui=await mountNativeShell(host,shell);
  const buttons=[...document.querySelectorAll('[data-fixture]')];
  function setFixture(fixture){
    host.setFixture(fixture);
    stage.hidden=fixture==='empty';
    buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.fixture===fixture)));
    document.documentElement.dataset.previewFixture=fixture;
  }
  buttons.forEach(button=>button.addEventListener('click',()=>setFixture(button.dataset.fixture)));
  document.querySelector('#hideFixtureControls').addEventListener('click',()=>{document.documentElement.dataset.previewClean='true'});
  if(new URLSearchParams(location.search).has('clean'))document.documentElement.dataset.previewClean='true';
  setFixture(new URLSearchParams(location.search).get('state')||'a4');
  document.documentElement.dataset.inkShellReady='true';
  window.INK_UI017=ui;
  window.INK_MOCK_PREVIEW={host,source:source.href,setFixture};
}
main().catch(error=>{console.error('INK_UI_MOCK_PREVIEW_FAILED',error);document.body.textContent='INK UI Preview failed: '+error.message;document.documentElement.dataset.inkShellReady='error'});
