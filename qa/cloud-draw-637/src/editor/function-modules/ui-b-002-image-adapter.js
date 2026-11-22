import {
  colorRasterToRgba8, convertBitDepth, convertColor, createColorRaster, cropImageData,
  deserializeColorRaster, readNormalizedSample, resizeImageData, serializeColorRaster, writeNormalizedSample
} from '../../image/image-core.js';
import { createUiB002ImageRuntime } from './ui-b-002-image-runtime.js';

const IMAGE_API=Object.freeze({colorRasterToRgba8,convertBitDepth,convertColor,createColorRaster,cropImageData,deserializeColorRaster,readNormalizedSample,resizeImageData,serializeColorRaster,writeNormalizedSample});
export function createUiB002ImageAdapter(app){return createUiB002ImageRuntime(app,IMAGE_API);}
