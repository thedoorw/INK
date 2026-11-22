/* INK portable bootstrap.
 * The authoritative Runtime remains src/ink.js; this file only bridges delivery mode. */
(async()=>{
  try { await import('./startup/ink-boot.mjs'); }
  catch (error) { console.error('INK_COMPAT_BOOTSTRAP_FAILED', error); throw error; }
})();
