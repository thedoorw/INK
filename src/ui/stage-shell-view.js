// Public-owned first-paint chrome for startup, empty canvas, text editing and
// non-document status. Existing root IDs and all Native event wiring stay put.
export function renderStageShellView(documentObject=document){
  const boot=documentObject.querySelector('#inkBootGate .ink-boot-visually-hidden');
  const hint=documentObject.getElementById('emptyHint');
  const editor=documentObject.getElementById('textEditor');
  const snap=documentObject.getElementById('snapFeedback');
  const zoom=documentObject.getElementById('zoomHud');
  if(!boot||!hint||!editor||!snap||!zoom)throw Error('INK_UI_STAGE_VIEW_ROOT_CONTRACT');
  boot.textContent='INK 正在啟動';
  hint.innerHTML='<strong>建立或開啟 INK 文件開始創作</strong>';
  editor.innerHTML='<textarea id="textInput" rows="2" placeholder="輸入文字"></textarea>'+
    '<div class="text-editor-actions"><button id="textCancel" type="button">取消</button>'+
    '<button id="textCommit" type="button">完成</button></div>';
  snap.textContent='SNAP';
  zoom.textContent='100%';
  if(!editor.querySelector('#textInput')||!editor.querySelector('#textCancel')||
    !editor.querySelector('#textCommit'))throw Error('INK_UI_STAGE_TEXT_EDITOR_CONTRACT');
}

if(typeof document!=='undefined')renderStageShellView(document);
