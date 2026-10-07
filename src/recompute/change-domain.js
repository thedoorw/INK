export const CHANGE_DOMAINS = Object.freeze([
  'GEOMETRY_CHANGE',
  'MATERIAL_CHANGE',
  'STYLE_CHANGE',
  'SEMANTIC_CHANGE',
  'TRANSFORM_CHANGE',
  'HIERARCHY_CHANGE',
  'PARAMETER_CHANGE'
]);

const OPERATION_DOMAIN = Object.freeze({
  deformation: 'GEOMETRY_CHANGE',
  bend: 'GEOMETRY_CHANGE',
  resize: 'GEOMETRY_CHANGE',
  reshape: 'GEOMETRY_CHANGE',
  'edit-path': 'GEOMETRY_CHANGE',
  'adjust-count': 'GEOMETRY_CHANGE',
  'replace-structure': 'GEOMETRY_CHANGE',
  'boolean-topology': 'GEOMETRY_CHANGE',
  material: 'MATERIAL_CHANGE',
  'update-material': 'MATERIAL_CHANGE',
  brush: 'MATERIAL_CHANGE',
  style: 'STYLE_CHANGE',
  recolor: 'STYLE_CHANGE',
  opacity: 'STYLE_CHANGE',
  blend: 'STYLE_CHANGE',
  semantic: 'SEMANTIC_CHANGE',
  role: 'SEMANTIC_CHANGE',
  transform: 'TRANSFORM_CHANGE',
  move: 'TRANSFORM_CHANGE',
  rotate: 'TRANSFORM_CHANGE',
  scale: 'TRANSFORM_CHANGE',
  hierarchy: 'HIERARCHY_CHANGE',
  reparent: 'HIERARCHY_CHANGE',
  parameter: 'PARAMETER_CHANGE'
});

export function normalizeChangeDomain(value, operation = null) {
  const candidate = String(value || '').trim().toUpperCase();
  if (CHANGE_DOMAINS.includes(candidate)) return candidate;
  const inferred = OPERATION_DOMAIN[String(operation || '').trim().toLowerCase()];
  return inferred || 'STYLE_CHANGE';
}

export function changeDomainForOperation(operation) {
  return normalizeChangeDomain(null, operation);
}
