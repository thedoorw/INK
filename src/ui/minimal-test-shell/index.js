import { ModularUIHost } from '../modular-ui/module-host.js';
import { createMinimalControlsModule, createMinimalStateModule, createMinimalStatusModule } from './modules.js';

export function installMinimalTestShell(app,services){
  if(!app?.commands||!services)throw new TypeError('INK_MINIMAL_SHELL_DEPENDENCIES_REQUIRED');
  const root=document.getElementById('minimalHost');
  if(!root)throw new Error('INK_MINIMAL_SHELL_ROOT_REQUIRED');
  const slots={};
  root.querySelectorAll('[data-slot]').forEach(node=>{slots[node.dataset.slot]=node;});
  for(const name of ['controls','state','status'])if(!slots[name])throw new Error('INK_MINIMAL_SHELL_SLOT_REQUIRED:'+name);
  const host=new ModularUIHost({root,slots,commands:app.commands,selectors:(id,args)=>app.commands.select(id,args),services});
  try{
    host.mount(createMinimalControlsModule());
    host.mount(createMinimalStateModule());
    host.mount(createMinimalStatusModule());
    document.documentElement.dataset.inkShellReady='true';
    document.getElementById('inkBootGate')?.remove();
    app.commands.notify('minimal-shell-ready');
  }catch(error){
    document.documentElement.dataset.inkShellReady='error';
    const gate=document.getElementById('inkBootGate');
    if(gate){gate.textContent='INK minimal shell 啟動失敗：'+(error?.message||String(error));gate.style.display='grid';}
    throw error;
  }
  let disposed=false;
  const dispose=()=>{if(disposed)return false;disposed=true;host.dispose();return true;};
  return Object.freeze({schema:'INK-MINIMAL-TEST-SHELL',version:1,host,ports:services.ports,dispose,state:()=>({disposed,host:host.diagnostics(),previewVisible:services.isPreviewVisible()})});
}
