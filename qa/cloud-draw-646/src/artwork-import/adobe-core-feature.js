// #559 bounded Adobe-format import feature gate.
// ONE removal switch: set enabled:false in a product candidate to stop all
// Adobe-format admission. This must never disable or mutate INK Native,
// existing .ink documents, History, Renderer, or ordinary image imports.
//
// This is a source/build switch, not a user-accessible runtime privilege.
// Keep all per-format external SDK/third-party engines behind adobe-core.js;
// product acceptance and license qualification are separate from this flag.
export const INK_ADOBE_CORE_FEATURE = Object.freeze({
 schema: 'INK_ADOBE_CORE_FEATURE_V1',
 id: 'ink-adobe-optional-import',
 enabled: true,
 ownership: 'OPTIONAL_FORMAT_IMPORT_ONLY',
 entrypoint: 'product/source/src/artwork-import/adobe-core.js',
 removable: true,
 affects: Object.freeze(['psd','psb','ai']),
 mustNotAffect: Object.freeze(['ink-native','native-history','native-renderer','png','svg']),
});

// Optional external engines are distinct from existing INK format decoders.
// OFF never disables the first-party RGB8 PSD/PSB or PDF-compatible AI path.
// `photoshop` means a trusted PhotoshopAPI host may be selected when bound;
// no third-party package is loaded or distributed by this flag.
export const INK_ADOBE_EXTERNAL_ENGINE_FEATURES = Object.freeze({
  photoshop: true,
  agPsd: true, // exact package 34.1.0; lazy browser import; independent Native mapper
  illustrator: true, // Trusted Node host fallback when specifically bound
  illustratorBrowser: true, // Browser lazy npm package + bounded Deflate shim
});
