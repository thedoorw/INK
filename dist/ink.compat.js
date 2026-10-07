/* INK portable bootstrap.
 * The authoritative Runtime remains src/ink.js; this file only bridges delivery mode. */
(async()=>{
  try { await import('../src/ink.js'); }
  catch (error) { console.error('INK_COMPAT_BOOTSTRAP_FAILED', error); throw error; }
})();
