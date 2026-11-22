// Product engine selection. No service, optional SDK, executable source or
// flattened fallback is installed by this adapter. Existing Native decoders
// remain the sole source of editable objects and detailed fidelity receipts.
import {INK_ADOBE_CORE_FEATURE, INK_ADOBE_EXTERNAL_ENGINE_FEATURES} from './adobe-core-feature.js';
import {choosePhotoshopCore,decodePhotoshopCore,PHOTOSHOP_CORE_MODULE} from './photoshop-core.js';
import {chooseIllustratorCore,decodeIllustratorCore,ILLUSTRATOR_CORE_MODULE} from './illustrator-core.js';
export const INK_ADOBE_CORE_MODULES=Object.freeze({photoshop:PHOTOSHOP_CORE_MODULE,illustrator:ILLUSTRATOR_CORE_MODULE});
const fail = (code, plan) => { throw Object.assign(new Error(code), { code, adobeCore: plan }); };
const bytesOf = input => {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  fail('INK_ADOBE_BYTES_REQUIRED');
};
export function planAdobeImport(input, { format = null, nativeEngine = null, moduleEnabled = INK_ADOBE_CORE_FEATURE.enabled,
  externalEngineFeatures = INK_ADOBE_EXTERNAL_ENGINE_FEATURES,illustratorEngine=null,preferExtended=false } = {}) {
  if(moduleEnabled !== true) fail('INK_ADOBE_CORE_DISABLED');
  const bytes = bytesOf(input);
  const ascii = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  let detected = null, bitDepth = null, colorMode = null, width = null, height = null, engine = null;
  if (ascii(0, 4) === '8BPS') {
    if (bytes.length < 26) fail('INK_ADOBE_HEADER_TRUNCATED');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = view.getUint16(4);
    if (![1, 2].includes(version)) fail('INK_PSD_VERSION_UNSUPPORTED');
    detected = version === 2 ? 'psb' : 'psd';
    bitDepth = view.getUint16(22); colorMode = view.getUint16(24);
    height = view.getUint32(14); width = view.getUint32(18);
    engine = choosePhotoshopCore({bitDepth,colorMode,nativeEngine,
      optionalHostEnabled: externalEngineFeatures?.photoshop === true,
      agPsdEnabled:externalEngineFeatures?.agPsd === true,preferExtended});
  } else if (ascii(0, 5) === '%PDF-') {
    detected = 'ai'; engine = chooseIllustratorCore({isPdfCompatible:true,illustratorEngine,
      optionalNodeEnabled:externalEngineFeatures?.illustrator === true,
      optionalBrowserEnabled:externalEngineFeatures?.illustratorBrowser === true});
  } else if (ascii(0, 11) === '%!PS-Adobe-') {
    detected = 'ai'; engine = chooseIllustratorCore({isPdfCompatible:false,illustratorEngine,
      optionalNodeEnabled:externalEngineFeatures?.illustrator === true});
  } else fail('INK_ADOBE_SIGNATURE_UNSUPPORTED');
  const plan = {
    schema: 'INK_ADOBE_ENGINE_PLAN_V1', format: detected, sourceBytes: bytes.length,
    bitDepth, colorMode, width, height, engine,
    status: engine ? 'BOUNDED_SUBSET' : 'UNSUPPORTED', fullFidelity: false,
    maxBytes: detected === 'ai' ? 8 * 1024 * 1024 : 32 * 1024 * 1024,
    blockers: engine ? [] : [detected === 'ai' ? 'LEGACY_POSTSCRIPT_ENGINE_NOT_DEPLOYED' : 'HIGH_DEPTH_OR_COLOR_ENGINE_NOT_DEPLOYED']
  };
  if (format !== null && !(format === 'photoshop' ? detected === 'psd' || detected === 'psb' : format === detected)) fail('INK_ADOBE_FORMAT_SIGNATURE_MISMATCH', plan);
  if (bytes.length > plan.maxBytes) fail('INK_ADOBE_INPUT_BUDGET', plan);
  if (detected !== 'ai' && (!width || !height || width * height > 4 * 1024 * 1024)) fail('INK_PSD_PIXEL_BUDGET', plan);
  if(engine==='photoshopapi-0.9.1-rgb16'&&width*height>1024*1024)fail('INK_PSAPI_PIXEL_LIMIT',plan);
  if (!engine) fail(detected === 'ai' ? 'INK_AI_LEGACY_POSTSCRIPT_UNSUPPORTED' : 'INK_PSD_LAYERED_REQUIRES_RGB8', plan);
  return plan;
}

export async function decodeAdobeArtwork(input, options = {}) {
  const plan = planAdobeImport(input, { format: options.format ?? null, nativeEngine:options.nativeEngine,
    moduleEnabled:options.moduleEnabled ?? INK_ADOBE_CORE_FEATURE.enabled,
    externalEngineFeatures: options.externalEngineFeatures ?? INK_ADOBE_EXTERNAL_ENGINE_FEATURES,
    illustratorEngine: options.illustratorEngine ?? null,preferExtended:options.preferExtended===true });
  // Snapshot before the dynamic import yields, just as the original decoders
  // copy bytes before inflating. A caller cannot switch source after selection.
  const bytes = new Uint8Array(bytesOf(input));
  const { format, nativeEngine, illustratorEngine, moduleEnabled, externalEngineFeatures, preferExtended, ...decoderOptions } = options;
  decoderOptions.maxBytes = Math.min(options.maxBytes ?? plan.maxBytes, plan.maxBytes);
  decoderOptions.maxPixels = Math.min(options.maxPixels ?? 4 * 1024 * 1024, 4 * 1024 * 1024);
  // Reuse the exact same bounded decoder for File/Open, agent import and preview.
  const result = plan.format === 'ai'
    ? await decodeIllustratorCore(bytes,{engine:plan.engine,illustratorEngine,...decoderOptions})
    : await decodePhotoshopCore(bytes,{engine:plan.engine,nativeEngine,plan,...decoderOptions});
  result.receipt.adobeCore = plan;
  return result;
}
