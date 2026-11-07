/* INK Path repaint/material appearance contract v0.1.
 * Authoritative Path geometry/composition remain independent from paint/material appearance. */

export const PATH_MATERIAL_APPEARANCE_FORMAT = 'INK-PATH-MATERIAL-APPEARANCE';
export const PATH_MATERIAL_APPEARANCE_VERSION = 1;
export const PATH_MATERIAL_APPEARANCE_EXTENSION = 'ink.path-material-appearance.v1';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const text = (value, fallback = null) => typeof value === 'string' && value.trim() ? value.trim() : fallback;
const clamp = value => Math.max(0, Math.min(1, Number(value)));

function fail(code, details = {}) {
  throw Object.assign(new Error(`INK_PATH_APPEARANCE_${code}`), { code: `PATH_APPEARANCE_${code}`, ...details });
}

function paintToken(value, fallback = 'none') {
  if (value == null) return fallback;
  const normalized = text(String(value));
  if (!normalized) fail('PAINT_TOKEN_INVALID');
  return normalized;
}

export function normalizePathRepaint(raw = {}, fallback = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('REPAINT_PATCH_INVALID');
  const patch = {};
  if (own(raw, 'fill')) patch.fill = paintToken(raw.fill, paintToken(fallback.fill, 'none'));
  if (own(raw, 'stroke')) patch.stroke = paintToken(raw.stroke, paintToken(fallback.stroke, 'none'));
  if (own(raw, 'opacity')) {
    const opacity = Number(raw.opacity);
    if (!Number.isFinite(opacity)) fail('OPACITY_INVALID');
    patch.opacity = clamp(opacity);
  }
  if (own(raw, 'expressiveStrokeColor')) {
    patch.expressiveStrokeColor = paintToken(raw.expressiveStrokeColor, paintToken(fallback.expressiveStrokeColor, fallback.stroke || '#202020'));
  }
  return patch;
}

export function normalizePathMaterialAppearance(raw = {}, fallback = {}) {
  if (raw == null || raw === false) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('MATERIAL_INVALID');
  const templateId = text(raw.templateId ?? raw.materialRef?.templateId);
  if (!templateId) fail('MATERIAL_TEMPLATE_REQUIRED');
  const sourceFallback = raw.fallback && typeof raw.fallback === 'object' ? raw.fallback : {};
  return {
    format: PATH_MATERIAL_APPEARANCE_FORMAT,
    version: PATH_MATERIAL_APPEARANCE_VERSION,
    mode: 'material-ref',
    templateId,
    templateVersion: text(raw.templateVersion ?? raw.materialRef?.templateVersion),
    parameterOverrides: raw.parameterOverrides && typeof raw.parameterOverrides === 'object' && !Array.isArray(raw.parameterOverrides)
      ? clone(raw.parameterOverrides)
      : {},
    fallback: {
      fill: paintToken(sourceFallback.fill, paintToken(fallback.fill, 'none')),
      stroke: paintToken(sourceFallback.stroke, paintToken(fallback.stroke, 'none'))
    }
  };
}

function materialTemplate(document, templateId) {
  return document?.materialLibrary?.templates?.find(template => template?.templateId === templateId) || null;
}

function templatePathAppearance(template) {
  const candidate = template?.pathAppearance ?? template?.metadata?.pathAppearance;
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : null;
}

export function resolvePathPaintAppearance(path, document = null) {
  const ordinary = {
    fill: paintToken(path?.fill, 'none'),
    stroke: paintToken(path?.stroke, 'none')
  };
  const material = path?.materialAppearance == null
    ? null
    : normalizePathMaterialAppearance(path.materialAppearance, ordinary);
  if (!material) {
    return {
      ...ordinary,
      material: null,
      diagnostics: {
        mode: 'ordinary-vector',
        templateFound: false,
        unsupportedMaterialEffect: false,
        ignoredParameterOverrides: [],
        unsupportedAppearanceKeys: []
      }
    };
  }

  const template = materialTemplate(document, material.templateId);
  const appearance = templatePathAppearance(template);
  const allowed = new Set(['fill', 'stroke']);
  const unsupportedAppearanceKeys = appearance
    ? Object.keys(appearance).filter(key => !allowed.has(key)).sort()
    : [];
  const ignoredParameterOverrides = Object.keys(material.parameterOverrides || {}).sort();
  const fill = appearance && own(appearance, 'fill')
    ? paintToken(appearance.fill, material.fallback.fill)
    : material.fallback.fill;
  const stroke = appearance && own(appearance, 'stroke')
    ? paintToken(appearance.stroke, material.fallback.stroke)
    : material.fallback.stroke;

  return {
    fill,
    stroke,
    material,
    diagnostics: {
      mode: appearance ? 'material-template-path-appearance' : 'ordinary-vector-fallback',
      templateFound: Boolean(template),
      templateVersion: template?.templateVersion || material.templateVersion || null,
      materialType: template?.materialType || null,
      unsupportedMaterialEffect: !appearance || unsupportedAppearanceKeys.length > 0 || ignoredParameterOverrides.length > 0,
      ignoredParameterOverrides,
      unsupportedAppearanceKeys
    }
  };
}

export function pathAppearanceState(path) {
  return {
    fill: paintToken(path?.fill, 'none'),
    stroke: paintToken(path?.stroke, 'none'),
    opacity: Number.isFinite(Number(path?.opacity)) ? clamp(path.opacity) : 1,
    expressiveStroke: clone(path?.expressiveStroke ?? null),
    materialAppearance: path?.materialAppearance == null
      ? null
      : normalizePathMaterialAppearance(path.materialAppearance, { fill: path?.fill, stroke: path?.stroke })
  };
}
