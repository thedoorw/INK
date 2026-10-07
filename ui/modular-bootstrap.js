(() => {
  'use strict';
  let modular = globalThis.__INK_MODULAR_UI__ === true;
  try {
    const url = new URL(globalThis.location?.href || 'http://ink.local/');
    modular = modular || url.searchParams.get('ui') === 'modular' || url.searchParams.get('ink-ui') === 'modular';
  } catch {}
  const root=document.documentElement;
  root.dataset.inkUiRequested=modular?'modular':'legacy';
  if(!modular){
    document.write('<link rel="stylesheet" href="styles.css?v=0.1-ui-20261002-current-main-recovery">');
    return;
  }
  root.dataset.inkUiBoot='modular';
  const prebootStyle=document.createElement('style');
  prebootStyle.id='inkModularPrebootStyle';
  prebootStyle.textContent='body>.svg-sprite{position:absolute!important;width:0!important;height:0!important;overflow:hidden!important;pointer-events:none!important}';
  document.head.append(prebootStyle);
  root.style.background='#e7e7e7';
  root.style.color='#262626';
  globalThis.__INK_MODULAR_PREBOOT__=Object.freeze({
    diagnostics:()=>Object.freeze({sourceClean:true,removed:{},legacyStylesheet:Boolean(document.querySelector('link[href*="styles.css"]'))})
  });
  const onFailure=()=>{if(root.dataset.inkUiBoot!=='modular-ready')root.dataset.inkUiBoot='modular-failed';};
  globalThis.addEventListener('error',onFailure,{capture:true,once:true});
  globalThis.addEventListener('unhandledrejection',onFailure,{capture:true,once:true});
})();
