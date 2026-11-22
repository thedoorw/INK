import { resolvePathPaintAppearance } from './paint-appearance.js';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const repeatModes = new Set(['repeat', 'repeat-x', 'repeat-y', 'no-repeat']);

function fail(code, details = {}) {
  throw Object.assign(new Error(`INK_FILL_APPEARANCE_${code}`), { code: `FILL_APPEARANCE_${code}`, ...details });
}

const finite = (value, fallback = 0) => Number.isFinite(+value) ? +value : fallback;
const clamp = value => Math.max(0, Math.min(1, finite(value)));
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;

function point(value, fallback) {
  const source = value && typeof value === 'object' ? value : {};
  return { x: finite(source.x, fallback.x), y: finite(source.y, fallback.y) };
}

export function normalizeGradientFill(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('GRADIENT_INVALID');
  const type = raw.type === 'radial' ? 'radial' : raw.type === 'linear' ? 'linear' : null;
  if (!type) fail('GRADIENT_TYPE_INVALID');
  if (!Array.isArray(raw.stops) || raw.stops.length < 2) fail('GRADIENT_STOPS_REQUIRED');
  const stops = raw.stops.map((stop, index) => {
    const color = text(stop?.color);
    if (!color) fail('GRADIENT_STOP_COLOR_INVALID', { index });
    const offset = clamp(stop?.offset);
    const opacity = stop?.opacity == null ? 1 : clamp(stop.opacity);
    return { offset, color, opacity, sourceIndex: index };
  }).sort((a,b) => a.offset-b.offset || a.sourceIndex-b.sourceIndex).map(({sourceIndex,...stop})=>stop);
  const descriptor = { mode: 'gradient', type, stops };
  if (type === 'linear') {
    descriptor.start = point(raw.start, { x: 0, y: 0 });
    descriptor.end = point(raw.end, { x: 1, y: 0 });
  } else {
    descriptor.center = point(raw.center, { x: 0.5, y: 0.5 });
    descriptor.radius = Math.max(1e-9, finite(raw.radius, 0.5));
    descriptor.focal = point(raw.focal, descriptor.center);
  }
  return descriptor;
}

export function normalizePatternFill(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('PATTERN_INVALID');
  const patternRef = text(raw.patternRef ?? raw.ref);
  if (!patternRef) fail('PATTERN_REF_REQUIRED');
  const scaleValue = raw.scale && typeof raw.scale === 'object'
    ? { x: finite(raw.scale.x, 1), y: finite(raw.scale.y, 1) }
    : { x: finite(raw.scale, 1), y: finite(raw.scale, 1) };
  if (scaleValue.x === 0 || scaleValue.y === 0) fail('PATTERN_SCALE_ZERO');
  return {
    mode: 'pattern',
    patternRef,
    origin: point(raw.origin, { x: 0, y: 0 }),
    scale: scaleValue,
    rotation: finite(raw.rotation, 0),
    repeat: repeatModes.has(raw.repeat) ? raw.repeat : 'repeat',
    fallback: text(raw.fallback) || 'none'
  };
}

export function normalizeVectorFillAppearance(raw) {
  if (raw == null) return null;
  if (raw.mode === 'gradient' || raw.type === 'linear' || raw.type === 'radial') return normalizeGradientFill(raw);
  if (raw.mode === 'pattern' || raw.patternRef || raw.ref) return normalizePatternFill(raw);
  fail('MODE_UNSUPPORTED');
}

export function resolveVectorFillAppearance(path, { document = null, patternRegistry = null } = {}) {
  const ordinary = resolvePathPaintAppearance(path, document);
  if (path?.fillAppearance == null) return { mode: 'solid', fill: ordinary.fill, ordinary };
  const descriptor = normalizeVectorFillAppearance(path.fillAppearance);
  if (descriptor.mode === 'gradient') return { mode: 'gradient', descriptor, ordinary };
  const available = patternRegistry instanceof Set
    ? patternRegistry.has(descriptor.patternRef)
    : Array.isArray(patternRegistry)
      ? patternRegistry.includes(descriptor.patternRef)
      : patternRegistry && typeof patternRegistry === 'object'
        ? Object.prototype.hasOwnProperty.call(patternRegistry, descriptor.patternRef)
        : false;
  if (!available) return { mode: 'solid-fallback', fill: descriptor.fallback === 'none' ? ordinary.fill : descriptor.fallback, descriptor, ordinary, diagnostic: 'pattern-reference-unavailable' };
  return { mode: 'pattern', descriptor: clone(descriptor), ordinary };
}
