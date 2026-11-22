import { magicWandSelection } from './raster-selection-tools.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const byte = value => clamp(Math.round(Number(value) || 0), 0, 255);

function assertImageData(imageData) {
  const width = Math.floor(Number(imageData?.width));
  const height = Math.floor(Number(imageData?.height));
  if (!(width > 0 && height > 0) || !imageData?.data || imageData.data.length !== width * height * 4) throw new Error('INK_RASTER_IMAGE_DATA_INVALID');
  return { width, height, data: imageData.data };
}

function parseHex(value) {
  let hex = String(value || '').trim().replace(/^#/, '');
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map(char => char + char).join('');
  if (hex.length !== 6 && hex.length !== 8) return null;
  const rgba = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  rgba.push(hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255);
  return rgba.every(Number.isFinite) ? rgba : null;
}

export function normalizeRgba(color) {
  if (Array.isArray(color)) return [byte(color[0]), byte(color[1]), byte(color[2]), color[3] == null ? 255 : byte(color[3])];
  if (typeof color === 'object' && color) return [byte(color.r), byte(color.g), byte(color.b), color.a == null ? 255 : byte(color.a)];
  const parsed = parseHex(color);
  if (!parsed) throw new Error('INK_RASTER_COLOR_INVALID');
  return parsed;
}

function normalizeStops(stops) {
  if (!Array.isArray(stops) || stops.length < 2) throw new Error('INK_GRADIENT_REQUIRES_TWO_STOPS');
  return stops.map((stop, index) => ({
    offset: clamp(Number(stop?.offset ?? index / Math.max(1, stops.length - 1)), 0, 1),
    rgba: normalizeRgba(stop?.color ?? stop?.rgba ?? stop),
    opacity: clamp(Number(stop?.opacity ?? 1), 0, 1)
  })).sort((a, b) => a.offset - b.offset);
}

function interpolate(stops, t) {
  t = clamp(t, 0, 1);
  const low = [...stops].reverse().find(stop => stop.offset <= t) || stops[0];
  const high = stops.find(stop => stop.offset >= t) || stops[stops.length - 1];
  const amount = high.offset === low.offset ? 0 : (t - low.offset) / (high.offset - low.offset);
  const rgba = low.rgba.map((value, channel) => value + (high.rgba[channel] - value) * amount);
  const stopOpacity = low.opacity + (high.opacity - low.opacity) * amount;
  rgba[3] *= stopOpacity;
  return rgba.map(byte);
}

export function gradientFill(width, height, {
  type = 'linear', stops,
  start = { x: 0, y: 0 }, end = { x: Math.max(0, width - 1), y: 0 },
  center = { x: (width - 1) / 2, y: (height - 1) / 2 }, radius = Math.max(width, height) / 2,
  opacity = 1
} = {}) {
  width = Math.floor(Number(width)); height = Math.floor(Number(height));
  if (!(width > 0 && height > 0)) throw new Error('INK_GRADIENT_DIMENSIONS_INVALID');
  const ordered = normalizeStops(stops);
  opacity = clamp(Number(opacity), 0, 1);
  if (!Number.isFinite(opacity)) opacity = 1;
  const output = new Uint8ClampedArray(width * height * 4);
  const dx = Number(end?.x) - Number(start?.x), dy = Number(end?.y) - Number(start?.y), lengthSq = dx * dx + dy * dy;
  const radialRadius = Math.max(1e-9, Number(radius) || 0);
  if (type !== 'linear' && type !== 'radial') throw new Error(`INK_GRADIENT_TYPE_UNSUPPORTED:${type}`);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let t;
    if (type === 'linear') t = lengthSq <= 1e-12 ? 0 : ((x - Number(start?.x)) * dx + (y - Number(start?.y)) * dy) / lengthSq;
    else t = Math.hypot(x - Number(center?.x), y - Number(center?.y)) / radialRadius;
    const rgba = interpolate(ordered, t);
    const offset = (y * width + x) * 4;
    output[offset] = rgba[0]; output[offset + 1] = rgba[1]; output[offset + 2] = rgba[2]; output[offset + 3] = byte(rgba[3] * opacity);
  }
  return { width, height, data: output };
}

function sourceOver(target, source, opacity) {
  const sa = (source[3] / 255) * opacity;
  const da = target[3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 1e-12) return [0, 0, 0, 0];
  const rgb = [0, 1, 2].map(channel => byte((source[channel] * sa + target[channel] * da * (1 - sa)) / outA));
  return [...rgb, byte(outA * 255)];
}

export function paintBucketFill(imageData, { x, y, color, tolerance = 0, contiguous = true, opacity = 1 } = {}) {
  const { width, height, data } = assertImageData(imageData);
  const fill = normalizeRgba(color);
  opacity = clamp(Number(opacity), 0, 1);
  if (!Number.isFinite(opacity)) opacity = 1;
  const selection = magicWandSelection(imageData, { x, y, tolerance, contiguous });
  const output = new Uint8ClampedArray(data);
  for (let index = 0; index < width * height; index++) {
    if (!selection.alpha[index]) continue;
    const offset = index * 4;
    const composited = sourceOver([output[offset], output[offset + 1], output[offset + 2], output[offset + 3]], fill, opacity * selection.alpha[index] / 255);
    output.set(composited, offset);
  }
  return { width, height, data: output, selection };
}
