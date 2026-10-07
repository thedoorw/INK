(() => {
  'use strict';
  let modular=globalThis.__INK_MODULAR_UI__===true;
  try{const url=new URL(globalThis.location?.href||'http://ink.local/');modular=modular||url.searchParams.get('ui')==='modular'||url.searchParams.get('ink-ui')==='modular';}catch{}
  if(modular)return;
  const script=document.currentScript,src=script?.dataset?.legacyCompatSrc;
  if(!src)throw new Error('INK_LEGACY_COMPAT_SOURCE_MISSING');
  document.write('<script src="'+src.replace(/"/g,'&quot;')+'"><\/script>');
  document.write('<script src="web-shell.js?v=0.1-ui-20261002-sup08-11"><\/script>');
})();
