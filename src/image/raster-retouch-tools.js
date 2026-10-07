import { colorMatchesTolerance } from './raster-selection-tools.js';
import { normalizeRgba } from './raster-fill-tools.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const byte = value => clamp(Math.round(Number(value) || 0), 0, 255);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function assertImageData(imageData, code = 'INK_RETOUCH_IMAGE_DATA_INVALID') {
  const width = Math.floor(Number(imageData?.width));
  const height = Math.floor(Number(imageData?.height));
  if (!(width > 0 && height > 0) || !imageData?.data || imageData.data.length !== width * height * 4) throw new Error(code);
  return { width, height, data: imageData.data };
}

function normalizeUnit(value, fallback = 1) {
  const numeric = Number(value);
  return clamp(Number.isFinite(numeric) ? numeric : fallback, 0, 1);
}

function normalizePoint(point, fallback = { x: 0, y: 0 }) {
  return { x: finite(point?.x, fallback.x), y: finite(point?.y, fallback.y) };
}

function readRgba(data, width, x, y) {
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

function writeRgba(data, width, x, y, rgba) {
  const offset = (y * width + x) * 4;
  data[offset] = byte(rgba[0]); data[offset + 1] = byte(rgba[1]); data[offset + 2] = byte(rgba[2]); data[offset + 3] = byte(rgba[3]);
}

function mixRgba(target, source, amount, { preserveAlpha = false } = {}) {
  amount = normalizeUnit(amount, 1);
  return [
    byte(target[0] + (source[0] - target[0]) * amount),
    byte(target[1] + (source[1] - target[1]) * amount),
    byte(target[2] + (source[2] - target[2]) * amount),
    preserveAlpha ? target[3] : byte(target[3] + (source[3] - target[3]) * amount)
  ];
}

function normalizeRegion(region, width, height) {
  if (!region) return null;
  const x = Math.floor(finite(region.x));
  const y = Math.floor(finite(region.y));
  const w = Math.max(0, Math.floor(finite(region.w ?? region.width)));
  const h = Math.max(0, Math.floor(finite(region.h ?? region.height)));
  const x0 = clamp(x, 0, width), y0 = clamp(y, 0, height);
  const x1 = clamp(x + w, 0, width), y1 = clamp(y + h, 0, height);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

export function createLocalRetouchMask(width, height, { targetPoint = null, radius = 1, region = null, mask = null, hardness = 1 } = {}) {
  width = Math.floor(Number(width)); height = Math.floor(Number(height));
  if (!(width > 0 && height > 0)) throw new Error('INK_RETOUCH_DIMENSIONS_INVALID');
  if (mask?.alpha) {
    if (mask.width !== width || mask.height !== height || mask.alpha.length !== width * height) throw new Error('INK_RETOUCH_MASK_SIZE_MISMATCH');
    return Uint8ClampedArray.from(mask.alpha, byte);
  }
  const alpha = new Uint8ClampedArray(width * height);
  const clipped = normalizeRegion(region, width, height);
  if (clipped) {
    for (let y = clipped.y; y < clipped.y + clipped.h; y++) for (let x = clipped.x; x < clipped.x + clipped.w; x++) alpha[y * width + x] = 255;
    return alpha;
  }
  const center = normalizePoint(targetPoint);
  radius = Math.max(0, finite(radius, 1));
  hardness = normalizeUnit(hardness, 1);
  if (radius === 0) {
    const x = Math.round(center.x), y = Math.round(center.y);
    if (x >= 0 && y >= 0 && x < width && y < height) alpha[y * width + x] = 255;
    return alpha;
  }
  const minX = Math.max(0, Math.floor(center.x - radius)), maxX = Math.min(width - 1, Math.ceil(center.x + radius));
  const minY = Math.max(0, Math.floor(center.y - radius)), maxY = Math.min(height - 1, Math.ceil(center.y + radius));
  const hardRadius = radius * hardness;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const distance = Math.hypot(x - center.x, y - center.y);
    if (distance > radius) continue;
    let amount = 1;
    if (hardness < 1 && distance > hardRadius) amount = 1 - (distance - hardRadius) / Math.max(1e-9, radius - hardRadius);
    alpha[y * width + x] = byte(amount * 255);
  }
  return alpha;
}

function applyMaskedPixels(imageData, mask, transform, { opacity = 1 } = {}) {
  const { width, height, data } = assertImageData(imageData);
  if (mask.length !== width * height) throw new Error('INK_RETOUCH_MASK_SIZE_MISMATCH');
  const output = new Uint8ClampedArray(data);
  opacity = normalizeUnit(opacity, 1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const local = opacity * mask[y * width + x] / 255;
    if (local <= 0) continue;
    const target = readRgba(data, width, x, y);
    const replacement = transform({ x, y, target, local, sourceData: data, width, height });
    if (replacement) writeRgba(output, width, x, y, replacement);
  }
  return { width, height, data: output, affectedMask: Array.from(mask) };
}

export function cloneStamp(imageData, { sourcePoint, targetPoint, radius = 1, opacity = 1, hardness = 1, mask = null } = {}) {
  const { width, height, data } = assertImageData(imageData);
  const source = normalizePoint(sourcePoint), target = normalizePoint(targetPoint);
  const brush = createLocalRetouchMask(width, height, { targetPoint: target, radius, hardness, mask });
  return applyMaskedPixels(imageData, brush, ({ x, y, target: targetRgba, local }) => {
    const sx = Math.round(source.x + (x - target.x)), sy = Math.round(source.y + (y - target.y));
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) return targetRgba;
    return mixRgba(targetRgba, readRgba(data, width, sx, sy), local);
  }, { opacity });
}

export function patternStamp(imageData, { pattern, targetPoint, radius = 1, opacity = 1, hardness = 1, origin = { x: 0, y: 0 }, mask = null } = {}) {
  const { width, height } = assertImageData(imageData);
  const tile = assertImageData(pattern, 'INK_RETOUCH_PATTERN_INVALID');
  const brush = createLocalRetouchMask(width, height, { targetPoint, radius, hardness, mask });
  const phase = normalizePoint(origin);
  return applyMaskedPixels(imageData, brush, ({ x, y, target, local }) => {
    const px = ((Math.floor(x - phase.x) % tile.width) + tile.width) % tile.width;
    const py = ((Math.floor(y - phase.y) % tile.height) + tile.height) % tile.height;
    return mixRgba(target, readRgba(tile.data, tile.width, px, py), local);
  }, { opacity });
}

function meanRgbForMappedRegion(data, width, height, mask, mapper) {
  const sums = [0, 0, 0]; let count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!mask[y * width + x]) continue;
    const p = mapper(x, y);
    if (p.x < 0 || p.y < 0 || p.x >= width || p.y >= height) continue;
    const rgba = readRgba(data, width, p.x, p.y);
    sums[0] += rgba[0]; sums[1] += rgba[1]; sums[2] += rgba[2]; count++;
  }
  if (!count) return null;
  return sums.map(value => value / count);
}

export function healingBrush(imageData, { sourcePoint, targetPoint, radius = 1, opacity = 1, hardness = 1, mask = null } = {}) {
  const { width, height, data } = assertImageData(imageData);
  const source = normalizePoint(sourcePoint), target = normalizePoint(targetPoint);
  const brush = createLocalRetouchMask(width, height, { targetPoint: target, radius, hardness, mask });
  const targetMean = meanRgbForMappedRegion(data, width, height, brush, (x, y) => ({ x, y }));
  const sourceMean = meanRgbForMappedRegion(data, width, height, brush, (x, y) => ({ x: Math.round(source.x + (x - target.x)), y: Math.round(source.y + (y - target.y)) }));
  if (!targetMean || !sourceMean) throw new Error('INK_RETOUCH_HEAL_SOURCE_EMPTY');
  const delta = targetMean.map((value, channel) => value - sourceMean[channel]);
  return applyMaskedPixels(imageData, brush, ({ x, y, target: targetRgba, local }) => {
    const sx = Math.round(source.x + (x - target.x)), sy = Math.round(source.y + (y - target.y));
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) return targetRgba;
    const sampled = readRgba(data, width, sx, sy);
    const adapted = [byte(sampled[0] + delta[0]), byte(sampled[1] + delta[1]), byte(sampled[2] + delta[2]), targetRgba[3]];
    return mixRgba(targetRgba, adapted, local, { preserveAlpha: true });
  }, { opacity });
}

export function spotHealing(imageData, { targetPoint, radius = 1, opacity = 1, hardness = 1, mask = null, neighborRadius = 1 } = {}) {
  const { width, height, data } = assertImageData(imageData);
  const brush = createLocalRetouchMask(width, height, { targetPoint, radius, hardness, mask });
  neighborRadius = Math.max(1, Math.floor(finite(neighborRadius, 1)));
  const sums = [0, 0, 0]; let count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (brush[y * width + x]) continue;
    let near = false;
    for (let yy = Math.max(0, y - neighborRadius); yy <= Math.min(height - 1, y + neighborRadius) && !near; yy++) {
      for (let xx = Math.max(0, x - neighborRadius); xx <= Math.min(width - 1, x + neighborRadius); xx++) if (brush[yy * width + xx]) { near = true; break; }
    }
    if (!near) continue;
    const rgba = readRgba(data, width, x, y);
    sums[0] += rgba[0]; sums[1] += rgba[1]; sums[2] += rgba[2]; count++;
  }
  if (!count) throw new Error('INK_RETOUCH_NO_NEIGHBORS');
  const fill = sums.map(value => byte(value / count));
  return applyMaskedPixels(imageData, brush, ({ target, local }) => mixRgba(target, [...fill, target[3]], local, { preserveAlpha: true }), { opacity });
}

export function patchRaster(imageData, { sourceRegion, targetRegion, opacity = 1, feather = 0 } = {}) {
  const { width, height, data } = assertImageData(imageData);
  const source = normalizeRegion(sourceRegion, width, height), target = normalizeRegion(targetRegion, width, height);
  if (!source || !target || !source.w || !source.h || !target.w || !target.h || source.w !== target.w || source.h !== target.h) throw new Error('INK_RETOUCH_PATCH_GEOMETRY_MISMATCH');
  feather = clamp(finite(feather), 0, Math.max(target.w, target.h) / 2);
  const mask = new Uint8ClampedArray(width * height);
  for (let y = 0; y < target.h; y++) for (let x = 0; x < target.w; x++) {
    let amount = 1;
    if (feather > 0) amount = clamp(Math.min(x + 1, y + 1, target.w - x, target.h - y) / feather, 0, 1);
    mask[(target.y + y) * width + target.x + x] = byte(amount * 255);
  }
  return applyMaskedPixels(imageData, mask, ({ x, y, target: targetRgba, local }) => {
    const sx = source.x + (x - target.x), sy = source.y + (y - target.y);
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) return targetRgba;
    return mixRgba(targetRgba, readRgba(data, width, sx, sy), local);
  }, { opacity });
}

function luminance(rgb) { return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722; }

function tonalTool(imageData, { targetPoint, radius = 1, region = null, mask = null, strength = 0.5, hardness = 1 } = {}, mode) {
  const { width, height } = assertImageData(imageData);
  const localMask = createLocalRetouchMask(width, height, { targetPoint, radius, region, mask, hardness });
  strength = normalizeUnit(strength, 0.5);
  return applyMaskedPixels(imageData, localMask, ({ target, local }) => {
    const amount = strength * local;
    const rgb = target.slice(0, 3).map(value => mode === 'dodge' ? byte(value + (255 - value) * amount) : byte(value * (1 - amount)));
    return [...rgb, target[3]];
  });
}

export function dodge(imageData, options = {}) { return tonalTool(imageData, options, 'dodge'); }
export function burn(imageData, options = {}) { return tonalTool(imageData, options, 'burn'); }

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min; let h = 0, s = 0;
  if (d) { s = l > 0.5 ? d / (2 - max - min) : d / (max + min); if (max === r) h = (g - b) / d + (g < b ? 6 : 0); else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  const hue = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; };
  if (!s) return [byte(l * 255), byte(l * 255), byte(l * 255)];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [byte(hue(p, q, h + 1/3) * 255), byte(hue(p, q, h) * 255), byte(hue(p, q, h - 1/3) * 255)];
}

export function sponge(imageData, { targetPoint, radius = 1, region = null, mask = null, strength = 0.5, mode = 'saturate', hardness = 1 } = {}) {
  const { width, height } = assertImageData(imageData);
  if (!['saturate', 'desaturate'].includes(mode)) throw new Error(`INK_RETOUCH_SPONGE_MODE_UNSUPPORTED:${mode}`);
  const localMask = createLocalRetouchMask(width, height, { targetPoint, radius, region, mask, hardness });
  strength = normalizeUnit(strength, 0.5);
  return applyMaskedPixels(imageData, localMask, ({ target, local }) => {
    let [h, s, l] = rgbToHsl(target[0], target[1], target[2]);
    const amount = strength * local;
    s = mode === 'saturate' ? clamp(s + (1 - s) * amount, 0, 1) : clamp(s * (1 - amount), 0, 1);
    return [...hslToRgb(h, s, l), target[3]];
  });
}

function boxBlurAt(data, width, height, x, y, radius) {
  const sums = [0, 0, 0]; let count = 0;
  for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy++) for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx++) {
    const rgba = readRgba(data, width, xx, yy); sums[0] += rgba[0]; sums[1] += rgba[1]; sums[2] += rgba[2]; count++;
  }
  return sums.map(value => value / Math.max(1, count));
}

export function localBlur(imageData, { targetPoint, brushRadius = 1, region = null, mask = null, radius = 1, strength = 1, hardness = 1 } = {}) {
  const { width, height, data } = assertImageData(imageData);
  radius = clamp(Math.round(finite(radius, 1)), 1, 16); strength = normalizeUnit(strength, 1);
  const localMask = createLocalRetouchMask(width, height, { targetPoint, radius: brushRadius, region, mask, hardness });
  return applyMaskedPixels(imageData, localMask, ({ x, y, target, local }) => {
    const blurred = boxBlurAt(data, width, height, x, y, radius);
    return mixRgba(target, [...blurred.map(byte), target[3]], strength * local, { preserveAlpha: true });
  });
}

export function localSharpen(imageData, { targetPoint, brushRadius = 1, region = null, mask = null, radius = 1, amount = 1, hardness = 1 } = {}) {
  const { width, height, data } = assertImageData(imageData);
  radius = clamp(Math.round(finite(radius, 1)), 1, 16); amount = clamp(finite(amount, 1), 0, 4);
  const localMask = createLocalRetouchMask(width, height, { targetPoint, radius: brushRadius, region, mask, hardness });
  return applyMaskedPixels(imageData, localMask, ({ x, y, target, local }) => {
    const blurred = boxBlurAt(data, width, height, x, y, radius);
    const sharpened = target.slice(0, 3).map((value, channel) => byte(value + (value - blurred[channel]) * amount));
    return mixRgba(target, [...sharpened, target[3]], local, { preserveAlpha: true });
  });
}

export function colorReplacementBrush(imageData, { targetPoint, radius = 1, region = null, mask = null, referenceColor, replacementColor, tolerance = 0, strength = 1, hardness = 1 } = {}) {
  const { width, height, data } = assertImageData(imageData);
  const localMask = createLocalRetouchMask(width, height, { targetPoint, radius, region, mask, hardness });
  const reference = referenceColor == null ? readRgba(data, width, clamp(Math.round(finite(targetPoint?.x)), 0, width - 1), clamp(Math.round(finite(targetPoint?.y)), 0, height - 1)) : normalizeRgba(referenceColor);
  const replacement = normalizeRgba(replacementColor);
  const [rh, rs] = rgbToHsl(replacement[0], replacement[1], replacement[2]);
  tolerance = clamp(finite(tolerance), 0, 255); strength = normalizeUnit(strength, 1);
  return applyMaskedPixels(imageData, localMask, ({ target, local }) => {
    if (!colorMatchesTolerance(target, reference, tolerance)) return target;
    const [, , lightness] = rgbToHsl(target[0], target[1], target[2]);
    let replacedRgb = hslToRgb(rh, rs, lightness);
    const targetLuminance = luminance(target);
    const replacementLuminance = luminance(replacedRgb);
    if (replacementLuminance > 1e-9) {
      const scale = targetLuminance / replacementLuminance;
      replacedRgb = replacedRgb.map(value => byte(value * scale));
    }
    const replaced = [...replacedRgb, target[3]];
    return mixRgba(target, replaced, strength * local, { preserveAlpha: true });
  });
}

export const RETOUCH_METRICS = Object.freeze({ luminance });
