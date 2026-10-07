import { installFullCapabilityControls } from '../../ui/full-capability-controls.js';
import { installModularUIShell, modularUiRequested } from './modular-ui/index.js';
import { createLegacyUiAdapter } from './legacy-ui-adapter.js';
import { createTextEditorPresentation } from './text-editor-presentation.js';
import { createRevocablePresentationPort } from './presentation-port.js';

function presentationOf(owner){
  const value=owner?.presentation;
  if(!value||typeof value!=='object')throw new Error('INK_WORKSTATION_PRESENTATION_REQUIRED');
  return value;
}

export function createWorkstationComposition(app,{legacyOptions={}}={}){
  if(!app)throw new TypeError('INK_WORKSTATION_COMPOSITION_APP_REQUIRED');
  const mode=modularUiRequested()?'modular':'legacy';
  const legacyUi=mode==='legacy'?createLegacyUiAdapter(app,legacyOptions):null;
  const textEditorPresentation=mode==='modular'?createTextEditorPresentation(app):null;
  const presentationPort=createRevocablePresentationPort();
  let modularUi=null;
  let preludeMounted=false;
  let workstationMounted=false;
  let state='idle';
  let generation=0;
  let failures=0;
  let lastError=null;

  const recordFailure=error=>{
    failures+=1;
    lastError=String(error?.message||error||'INK_WORKSTATION_COMPOSITION_FAILURE');
    state='failed';
  };
  const detachCurrent=()=>{
    presentationPort.revoke();
    const owner=modularUi;
    modularUi=null;
    workstationMounted=false;
    preludeMounted=false;
    if(mode==='modular'&&app.modularUi===owner)app.modularUi=null;
    let disposed=false;
    if(mode==='modular'){
      try{disposed=Boolean(owner?.dispose?.()??owner?.qa?.dispose?.());}catch(error){console.warn('INK_WORKSTATION_OWNER_DISPOSE_FAILED',error);}
      try{textEditorPresentation?.dispose?.();}catch(error){console.warn('INK_TEXT_PRESENTATION_DISPOSE_FAILED',error);}
    }else{
      try{disposed=Boolean(legacyUi?.dispose?.());}catch(error){console.warn('INK_LEGACY_UI_DISPOSE_FAILED',error);}
    }
    return disposed;
  };

  const api={
    schema:'INK-WORKSTATION-COMPOSITION',
    version:2,
    mode,
    legacyUi,
    textEditorPresentation,
    get modularUi(){return modularUi;},
    get presentation(){return presentationPort.presentation;},
    mountPrelude(){
      if(preludeMounted)return false;
      state='mounting-prelude';
      try{
        if(mode==='legacy')legacyUi.mount();
        preludeMounted=true;
        state='prelude-mounted';
        lastError=null;
        return true;
      }catch(error){
        presentationPort.revoke();
        try{legacyUi?.dispose?.();}catch{}
        preludeMounted=false;
        workstationMounted=false;
        recordFailure(error);
        throw error;
      }
    },
    mount(){
      if(workstationMounted)return mode==='modular'?modularUi:true;
      if(!preludeMounted)this.mountPrelude();
      state='mounting';
      let candidate=null;
      try{
        if(mode==='modular'){
          candidate=installModularUIShell(app);
          if(!candidate)throw new Error('INK_MODULAR_WORKSTATION_OWNER_REQUIRED');
          presentationPort.bind(presentationOf(candidate));
          modularUi=candidate;
          app.modularUi=candidate;
        }else{
          installFullCapabilityControls(app);
          presentationPort.bind(presentationOf(legacyUi));
        }
        workstationMounted=true;
        generation+=1;
        state='mounted';
        lastError=null;
        return mode==='modular'?modularUi:true;
      }catch(error){
        presentationPort.revoke();
        if(mode==='modular'){
          try{candidate?.dispose?.()??candidate?.qa?.dispose?.();}catch{}
          try{textEditorPresentation?.dispose?.();}catch{}
          if(app.modularUi===candidate)app.modularUi=null;
          modularUi=null;
        }else{
          try{legacyUi?.dispose?.();}catch{}
        }
        preludeMounted=false;
        workstationMounted=false;
        recordFailure(error);
        throw error;
      }
    },
    dispose(){
      const hadLifecycle=preludeMounted||workstationMounted||Boolean(modularUi);
      state='disposing';
      const ownerDisposed=detachCurrent();
      state='detached';
      lastError=null;
      return hadLifecycle||ownerDisposed;
    },
    remount(){
      if(preludeMounted||workstationMounted||modularUi)this.dispose();
      this.mountPrelude();
      return this.mount();
    },
    diagnostics:()=>Object.freeze({
      mode,state,generation,failures,lastError,
      preludeMounted,workstationMounted,
      hasPresentation:presentationPort.diagnostics().bound,
      presentationGeneration:presentationPort.diagnostics().generation
    })
  };
  return Object.freeze(api);
}
