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
  const ui=await mountNativeShell(host,shell);
  const fixtureControl=document.getElementById('mockFixture');
  const status=document.getElementById('mockLiveStatus');
  function setFixture(fixture){
    const chosen=host.setFixture(fixture);
    stage.hidden=chosen==='empty';
    fixtureControl.value=chosen;
    document.documentElement.dataset.previewFixture=chosen;
    status.textContent='狀態：'+fixtureControl.selectedOptions[0].textContent+' · Mock only';
    return chosen;
  }
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
  else if(params.get('menu')==='open')shell.querySelector('#logoButton').click();
  document.documentElement.dataset.inkShellReady='true';
  window.INK_UI017=ui;
  window.INK_MOCK_PREVIEW=Object.freeze({host,source:source.href,setFixture,
    getSnapshot:()=>host.getSnapshot(),getHistory:()=>host.getHistory()});
}
main().catch(error=>{console.error('INK_UI_MOCK_PREVIEW_FAILED',error);document.body.textContent='INK UI Preview failed: '+error.message;document.documentElement.dataset.inkShellReady='error'});
