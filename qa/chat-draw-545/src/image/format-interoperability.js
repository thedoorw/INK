import {probePsd,parsePsd,encodeFlattenedPsd} from './formats/psd.js';
import {probeTiff,parseTiff,encodeBaselineTiff} from './formats/tiff.js';
import {probeExr,parseExr,encodeBasicExr} from './formats/exr.js';
import {createRawAdapterRegistry} from './formats/adapters/raw-adapter.js';
import {createNormalizedPayload} from './formats/normalized-payload.js';
import {createColorRaster,deserializeColorRaster,serializeColorRaster} from './color-management-core.js';
export const rawAdapters=createRawAdapterRegistry();
export function probeFormat(input){for(const fn of [probePsd,probeTiff,probeExr]){const p=fn(input);if(p.matched)return p;}const r=rawAdapters.probe(input);return r.matched?r:{matched:false,format:null,status:r.status};}
export async function decodeFormat(input,{format=null,...options}={}){const p=format?{format}:probeFormat(input);if(p.format==='PSD'||p.format==='PSB')return parsePsd(input,options);if(p.format==='TIFF')return parseTiff(input,options);if(p.format==='EXR')return parseExr(input,options);if(p.format==='RAW')return rawAdapters.decode(input);throw new Error('INK_FORMAT_UNRECOGNIZED');}
export function encodeFormat(format,payload,options={}){if(format==='PSD')return encodeFlattenedPsd(payload,options);if(format==='TIFF')return encodeBaselineTiff(payload,options);if(format==='EXR')return encodeBasicExr(payload,options);if(format==='PSB')throw new Error('INK_PSB_ENCODE_ADAPTER_REQUIRED');if(format==='RAW')throw new Error('INK_RAW_EXPORT_NOT_REQUIRED');throw new Error(`INK_FORMAT_ENCODE_UNSUPPORTED:${format}`);}
export {probePsd,parsePsd,encodeFlattenedPsd,probeTiff,parseTiff,encodeBaselineTiff,probeExr,parseExr,encodeBasicExr,createRawAdapterRegistry};


function jsonSafe(value) {
  if (value == null || typeof value !== 'object') return value;
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
  if (Array.isArray(value)) return value.map(jsonSafe);
  return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,jsonSafe(item)]));
}

function serializeAuxiliaryPlane(plane) {
  return {
    id: plane.id || null,
    name: plane.name || null,
    kind: plane.kind || null,
    data: plane.data ? Array.from(plane.data) : null,
    previewColor: plane.previewColor ? [...plane.previewColor] : null,
    solidity: plane.solidity ?? null
  };
}

export function formatPayloadToDocumentImageState(payload) {
  if (!payload || payload.type !== 'ink-format-interoperability-payload' || !payload.compositeRaster) throw new Error('INK_FORMAT_PAYLOAD_REQUIRED');
  const raster = serializeColorRaster(payload.compositeRaster);
  const auxiliary = Array.isArray(payload.channels?.auxiliary) ? payload.channels.auxiliary : [];
  let primaryAlphaConsumed = !raster.alpha;
  const alphaChannels = [];
  const spotChannels = [];
  for (const plane of auxiliary) {
    if (plane.kind === 'alpha' && !primaryAlphaConsumed) {
      primaryAlphaConsumed = true;
      continue;
    }
    if (plane.kind === 'alpha') alphaChannels.push(serializeAuxiliaryPlane(plane));
    else if (plane.kind === 'spot') spotChannels.push(serializeAuxiliaryPlane(plane));
  }
  return {
    type: 'ink-image-state',
    version: 1,
    colorRaster: raster,
    icc: {
      bytes: payload.icc?.bytes ? Array.from(payload.icc.bytes) : null,
      inspection: jsonSafe(payload.icc?.inspection || null)
    },
    channelLayout: jsonSafe(payload.channelLayout || null),
    alphaChannels,
    spotChannels,
    additionalChannels: jsonSafe(payload.additionalChannels || []),
    source: {
      format: payload.format,
      version: payload.version ?? null,
      compression: jsonSafe(payload.compression ?? null),
      orientation: jsonSafe(payload.orientation ?? null),
      resolution: jsonSafe(payload.resolution ?? null)
    },
    layers: jsonSafe(payload.layers || []),
    groups: jsonSafe(payload.groups || []),
    metadata: jsonSafe(payload.metadata || {}),
    opaque: jsonSafe(payload.opaque || {}),
    warnings: jsonSafe(payload.warnings || []),
    losses: jsonSafe(payload.losses || []),
    provenance: jsonSafe(payload.provenance || {}),
    capabilities: jsonSafe(payload.capabilities || {})
  };
}

export function webRasterImageDataToDocumentState(imageData, {
  format = 'WEB_RASTER',
  metadata = {},
  provenance = {},
  capabilities = {}
} = {}) {
  const width = Math.floor(Number(imageData?.width));
  const height = Math.floor(Number(imageData?.height));
  const rgba = imageData?.data;
  if (!(width > 0 && height > 0) || !rgba || rgba.length !== width * height * 4) {
    throw new Error('INK_WEB_RASTER_IMAGE_DATA_INVALID');
  }
  const pixels = width * height;
  const rgb = new Uint8Array(pixels * 3);
  const alpha = new Uint8Array(pixels);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const sourceOffset = pixel * 4;
    const targetOffset = pixel * 3;
    rgb[targetOffset] = rgba[sourceOffset];
    rgb[targetOffset + 1] = rgba[sourceOffset + 1];
    rgb[targetOffset + 2] = rgba[sourceOffset + 2];
    alpha[pixel] = rgba[sourceOffset + 3];
  }
  const raster = createColorRaster({
    width,
    height,
    bitDepth: 8,
    colorMode: 'RGB',
    data: rgb,
    alpha
  });
  const payload = createNormalizedPayload({
    format: String(format || 'WEB_RASTER'),
    width,
    height,
    bitDepth: 8,
    colorMode: 'RGB',
    compositeRaster: raster,
    alpha,
    metadata: jsonSafe(metadata || {}),
    provenance: jsonSafe(provenance || {}),
    capabilities: { editableRaster: true, webRasterBridge: true, ...jsonSafe(capabilities || {}) }
  });
  return formatPayloadToDocumentImageState(payload);
}

export function documentImageStateToFormatPayload(state, { format = null, version = null } = {}) {
  if (!state || state.type !== 'ink-image-state' || !state.colorRaster) throw new Error('INK_DOCUMENT_IMAGE_STATE_REQUIRED');
  const raster = deserializeColorRaster(state.colorRaster);
  const alphaChannels = (state.alphaChannels || []).map(channel => ({ ...channel, data: channel.data ? [...channel.data] : null }));
  const spotChannels = (state.spotChannels || []).map(channel => ({ ...channel, data: channel.data ? [...channel.data] : null }));
  return createNormalizedPayload({
    format: format || state.source?.format || 'INK',
    version: version ?? state.source?.version ?? null,
    width: raster.width,
    height: raster.height,
    bitDepth: raster.bitDepth,
    colorMode: raster.colorMode,
    channelCount: raster.channelCount,
    channelNames: raster.channelNames,
    compositeRaster: raster,
    alpha: raster.alpha,
    alphaChannels,
    spotChannels,
    additionalChannels: state.additionalChannels || [],
    icc: state.icc?.bytes ? Uint8Array.from(state.icc.bytes) : null,
    layers: state.layers || [],
    groups: state.groups || [],
    compression: state.source?.compression ?? null,
    orientation: state.source?.orientation ?? null,
    resolution: state.source?.resolution ?? null,
    metadata: state.metadata || {},
    opaque: state.opaque || {},
    warnings: state.warnings || [],
    losses: state.losses || [],
    provenance: state.provenance || {},
    capabilities: state.capabilities || {}
  });
}
