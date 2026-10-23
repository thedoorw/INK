import { Matrix as M } from '../../core/index.js';
import {
  FILTER_GALLERY, createFilter, createLiquifyFilter, createRasterMask, deserializeColorRaster,
  inspectIccProfile, parseIccProfile
} from '../../image/image-core.js';
import { createSkewMatrix, createProjectiveTransform, mapProjectivePoint, createWarpDeformationPlan } from '../transform-advanced.js';
import { applyNonDestructiveDeformation } from '../../vector/deformation.js';
import { normalizeGradientFill, normalizePatternFill } from '../../vector/fill-appearance.js';
import { updateTextObject } from '../text-object.js';
import { verifyStorageRecord } from '../../document/storage.js';
import { inspectDocument } from '../../document/integrity.js';
import { createUiEntryCompletion003Runtime } from './ui-entry-completion-003-runtime.js';

const API=Object.freeze({
  M,FILTER_GALLERY,createFilter,createLiquifyFilter,createRasterMask,deserializeColorRaster,
  inspectIccProfile,parseIccProfile,createSkewMatrix,createProjectiveTransform,mapProjectivePoint,
  createWarpDeformationPlan,applyNonDestructiveDeformation,normalizeGradientFill,normalizePatternFill,
  updateTextObject,verifyStorageRecord,inspectDocument
});
export function createUiEntryCompletion003Adapter(app,{uiBTools=null}={}){return createUiEntryCompletion003Runtime(app,API,{uiBTools});}
