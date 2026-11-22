import { clamp } from '../core/index.js';

export const CSS_PPI = 96;
export const MM_PER_INCH = 25.4;
export const ARTBOARD_MIN_MM = 10;
export const ARTBOARD_MAX_MM = 5000;
export const ARTBOARD_PPI_MIN = 36;
export const ARTBOARD_PPI_MAX = 2400;
export const EXPORT_MAX_DIMENSION = 16384;
export const EXPORT_MAX_PIXELS = 36000000;
export const ARTBOARD_UNITS = Object.freeze(['px','mm','cm','in']);
export const ARTBOARD_PRESETS = Object.freeze({
  A4: Object.freeze({ id: 'A4', name: 'A4', widthMm: 210, heightMm: 297 })
});

export const DEFAULT_ARTBOARD = Object.freeze({
  mode: 'fixed',
  preset: 'A4',
  orientation: 'portrait',
  widthMm: 210,
  heightMm: 297,
  ppi: 300,
  bleedMm: 0,
  safeMarginMm: 10,
  unit: 'mm',
  showBleed: true,
  showSafeArea: true,
  showCenter: true,
  clipContent: true
});

export const mmToWorld = mm => Number(mm || 0) * CSS_PPI / MM_PER_INCH;
export const worldToMm = world => Number(world || 0) * MM_PER_INCH / CSS_PPI;
export const mmToPixels = (mm, ppi = 300) => Number(mm || 0) * Number(ppi || 300) / MM_PER_INCH;
export const pixelsToMm = (pixels, ppi = 300) => Number(pixels || 0) * MM_PER_INCH / Number(ppi || 300);

const near = (a,b,epsilon=.0001) => Math.abs(Number(a)-Number(b)) <= epsilon;
export const deriveArtboardOrientation = (widthMm,heightMm,fallback='portrait') => {
  if (Number(widthMm) > Number(heightMm)) return 'landscape';
  if (Number(heightMm) > Number(widthMm)) return 'portrait';
  return fallback === 'landscape' ? 'landscape' : 'portrait';
};
export const isA4Dimensions = (widthMm,heightMm) =>
  (near(widthMm,210)&&near(heightMm,297)) || (near(widthMm,297)&&near(heightMm,210));
export function validateArtboardOutputSize(widthMm,heightMm,ppi){
  const resolvedPpi=Number(ppi);
  if(!Number.isFinite(resolvedPpi)||resolvedPpi<ARTBOARD_PPI_MIN||resolvedPpi>ARTBOARD_PPI_MAX)
    throw Object.assign(new Error(`Output PPI must be between ${ARTBOARD_PPI_MIN} and ${ARTBOARD_PPI_MAX}`),{code:'ARGUMENTS_INVALID'});
  const width=Math.max(1,Math.round(mmToPixels(widthMm,resolvedPpi)));
  const height=Math.max(1,Math.round(mmToPixels(heightMm,resolvedPpi)));
  if(width>EXPORT_MAX_DIMENSION||height>EXPORT_MAX_DIMENSION||width*height>EXPORT_MAX_PIXELS)
    throw Object.assign(new Error('Output size exceeds the existing 36M pixel / 16,384 side export budget'),{
      code:'RESOURCE_LIMIT',details:{width,height,ppi:resolvedPpi,maxDimension:EXPORT_MAX_DIMENSION,maxPixels:EXPORT_MAX_PIXELS}
    });
  return {width,height,ppi:resolvedPpi};
}

export function normalizeArtboard(raw = {}, { legacyInfinite = false } = {}) {
  const fallbackPreset = ARTBOARD_PRESETS[raw?.preset] || ARTBOARD_PRESETS.A4;
  const mode = 'fixed';
  const widthMm = Number.isFinite(+raw?.widthMm) ? clamp(+raw.widthMm, ARTBOARD_MIN_MM, ARTBOARD_MAX_MM) : fallbackPreset.widthMm;
  const heightMm = Number.isFinite(+raw?.heightMm) ? clamp(+raw.heightMm, ARTBOARD_MIN_MM, ARTBOARD_MAX_MM) : fallbackPreset.heightMm;
  const orientation = deriveArtboardOrientation(widthMm,heightMm,raw?.orientation);
  const customRequested = raw?.preset === 'custom';
  const preset = !customRequested && isA4Dimensions(widthMm,heightMm) ? 'A4' : 'custom';
  const rawPpi=Number(raw?.ppi);
  const ppi=Number.isFinite(rawPpi)&&rawPpi>=ARTBOARD_PPI_MIN&&rawPpi<=ARTBOARD_PPI_MAX?rawPpi:DEFAULT_ARTBOARD.ppi;
  const unit=ARTBOARD_UNITS.includes(raw?.unit)?raw.unit:'mm';
  return {
    mode,
    preset,
    orientation,
    widthMm,
    heightMm,
    ppi,
    bleedMm: clamp(Number.isFinite(+raw?.bleedMm) ? +raw.bleedMm : DEFAULT_ARTBOARD.bleedMm, 0, 25),
    safeMarginMm: clamp(Number.isFinite(+raw?.safeMarginMm) ? +raw.safeMarginMm : DEFAULT_ARTBOARD.safeMarginMm, 0, Math.min(widthMm, heightMm) / 2),
    unit,
    showBleed: raw?.showBleed !== false,
    showSafeArea: raw?.showSafeArea !== false,
    showCenter: raw?.showCenter !== false,
    clipContent: raw?.clipContent === true
  };
}

export function createArtboard(overrides = {}) {
  return normalizeArtboard({ ...DEFAULT_ARTBOARD, ...overrides });
}

export function artboardTrimBounds(pageOrArtboard) {
  const artboard = normalizeArtboard(pageOrArtboard?.artboard || pageOrArtboard || {});
  const w = mmToWorld(artboard.widthMm);
  const h = mmToWorld(artboard.heightMm);
  return { x: -w / 2, y: -h / 2, w, h };
}

export function expandBounds(bounds, amount) {
  const value = Math.max(0, Number(amount) || 0);
  return { x: bounds.x - value, y: bounds.y - value, w: bounds.w + value * 2, h: bounds.h + value * 2 };
}

export function artboardBleedBounds(pageOrArtboard, includeBleed = true) {
  const artboard = normalizeArtboard(pageOrArtboard?.artboard || pageOrArtboard || {});
  return expandBounds(artboardTrimBounds(artboard), includeBleed ? mmToWorld(artboard.bleedMm) : 0);
}

export function thumbnailPreviewGeometry(page, width = 128, height = 96, padding = 7) {
  const fitBounds = artboardBleedBounds(page, true);
  const trimBounds = artboardTrimBounds(page);
  const resolvedWidth = Number(width) || 128;
  const resolvedHeight = Number(height) || 96;
  const resolvedPadding = Math.max(0, Number(padding) || 0);
  const scale = Math.min(
    (resolvedWidth - resolvedPadding * 2) / Math.max(1, fitBounds.w),
    (resolvedHeight - resolvedPadding * 2) / Math.max(1, fitBounds.h)
  );
  return {
    width: resolvedWidth,
    height: resolvedHeight,
    padding: resolvedPadding,
    fitBounds,
    trimBounds,
    scale
  };
}

export function artboardSafeBounds(pageOrArtboard) {
  const artboard = normalizeArtboard(pageOrArtboard?.artboard || pageOrArtboard || {});
  const trim = artboardTrimBounds(artboard);
  const margin = Math.min(mmToWorld(artboard.safeMarginMm), trim.w / 2, trim.h / 2);
  return { x: trim.x + margin, y: trim.y + margin, w: Math.max(0, trim.w - margin * 2), h: Math.max(0, trim.h - margin * 2) };
}

export function artboardPixelSize(pageOrArtboard, { ppi = null, includeBleed = false, cropMarks = false, cropMarkMarginMm = 6 } = {}) {
  const artboard = normalizeArtboard(pageOrArtboard?.artboard || pageOrArtboard || {});
  const resolvedPpi = ppi || artboard.ppi;
  const extra = (includeBleed ? artboard.bleedMm : 0) + (cropMarks ? cropMarkMarginMm : 0);
  const widthMm = artboard.widthMm + extra * 2;
  const heightMm = artboard.heightMm + extra * 2;
  return {
    width: Math.max(1, Math.round(mmToPixels(widthMm, resolvedPpi))),
    height: Math.max(1, Math.round(mmToPixels(heightMm, resolvedPpi))),
    widthMm,
    heightMm,
    ppi: resolvedPpi,
    trimWidth: Math.max(1, Math.round(mmToPixels(artboard.widthMm, resolvedPpi))),
    trimHeight: Math.max(1, Math.round(mmToPixels(artboard.heightMm, resolvedPpi)))
  };
}

export function artboardExportGeometry(pageOrArtboard, {
  ppi = null,
  includeBleed = false,
  cropMarks = false,
  cropMarkMarginMm = 6
} = {}) {
  const artboard = normalizeArtboard(pageOrArtboard?.artboard || pageOrArtboard || {});
  const trimBounds = artboardTrimBounds(artboard);
  const bleedWorld = includeBleed ? mmToWorld(artboard.bleedMm) : 0;
  const markWorld = cropMarks ? mmToWorld(cropMarkMarginMm) : 0;
  const bleedBounds = expandBounds(trimBounds, bleedWorld);
  const outputBounds = expandBounds(bleedBounds, markWorld);
  const size = artboardPixelSize(artboard, { ppi, includeBleed, cropMarks, cropMarkMarginMm });
  const scale = size.width / outputBounds.w;
  return {
    artboard,
    trimBounds,
    bleedBounds,
    outputBounds,
    scale,
    ...size,
    bleedMm: includeBleed ? artboard.bleedMm : 0,
    cropMarks,
    cropMarkMarginMm: cropMarks ? cropMarkMarginMm : 0
  };
}

export function describeArtboard(pageOrArtboard) {
  const artboard = normalizeArtboard(pageOrArtboard?.artboard || pageOrArtboard || {});
  const label=artboard.preset==='A4'?'A4':'Custom';
  return `${label} ${artboard.orientation === 'portrait' ? '直式' : '橫式'} · ${artboard.widthMm} × ${artboard.heightMm} mm · ${artboard.ppi} PPI`;
}
