import { createTextEditorPresentation } from './text-editor-presentation.js';
import { createRevocablePresentationPort } from './presentation-port.js';
import { createMinimalStageServices } from './stage-services.js';
import { installMinimalTestShell } from './minimal-test-shell/index.js';
import { createUiB002ToolsAdapter } from '../editor/function-modules/ui-b-002-tools-adapter.js';

export function createMinimalComposition(app){
  if(!app)throw new TypeError('INK_MINIMAL_COMPOSITION_APP_REQUIRED');
  const presentationPort=createRevocablePresentationPort();
  const textEditorPresentation=createTextEditorPresentation(app);
  let services=null,shell=null,rasterTools=null,disposed=false;
  const mount=()=>{
    if(disposed)throw new Error('INK_MINIMAL_COMPOSITION_DISPOSED');
    if(shell)return shell;
    services=createMinimalStageServices(app);
    presentationPort.bind(services.presentation);
    textEditorPresentation.mount();
    rasterTools=createUiB002ToolsAdapter(app,{commands:app.commands,notify:reason=>app.commands.notify('minimal-raster:'+reason)});
    shell=installMinimalTestShell(app,services);
    return shell;
  };
  const dispose=()=>{
    if(disposed)return false;disposed=true;
    presentationPort.revoke();
    try{shell?.dispose?.();}catch{}
    try{rasterTools?.dispose?.();}catch{}
    try{textEditorPresentation.dispose();}catch{}
    try{services?.dispose?.();}catch{}
    return true;
  };
  return Object.freeze({
    mode:'minimal',presentation:presentationPort.presentation,textEditorPresentation,mount,dispose,
    get shell(){return shell;},get rasterTools(){return rasterTools;}
  });
}
