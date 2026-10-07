const clone = value => structuredClone(value);

export const SEMANTIC_MODEL_VERSION = '1.0';
export const SEMANTIC_RELATIONS = Object.freeze(['parent', 'children', 'group', 'attachedTo', 'surrounds', 'overlaps', 'occludes', 'behind']);

export function inferSemanticRole(object = {}) {
  const explicit = object.semantic?.role || object.metadata?.semanticLabel || object.metadata?.role;
  const value = `${object.id || ''} ${object.name || ''}`.toLowerCase();
  if (explicit) {
    if (explicit === 'petal') return /inner|內圈/.test(value) ? 'petals.inner' : 'petals.outer';
    if (explicit === 'leaf') return /left|左/.test(value) ? 'leaf.left' : /right|右/.test(value) ? 'leaf.right' : 'leaf';
    return explicit;
  }
  if (/flower[- ]?center|花心/.test(value)) return 'flower-center';
  if (/petal|花瓣/.test(value)) return /inner|內圈/.test(value) ? 'petals.inner' : 'petals.outer';
  if (/leaf[- ]?left|左葉/.test(value)) return 'leaf.left';
  if (/leaf[- ]?right|右葉/.test(value)) return 'leaf.right';
  if (/leaf|葉/.test(value)) return 'leaf';
  if (/stem|花莖|莖/.test(value)) return 'stem';
  if (/bud|花苞/.test(value)) return 'bud';
  if (/background|背景/.test(value)) return 'background';
  return 'unclassified';
}

export function defaultSemantic(object = {}) {
  const role = inferSemanticRole(object);
  const parent = role.startsWith('petals.') || role === 'flower-center' ? 'flower' : role.startsWith('leaf.') || role === 'leaf' ? 'plant' : role === 'stem' ? 'plant' : null;
  const attachedTo = role === 'flower-center' ? ['flower'] : role.startsWith('leaf') ? ['stem'] : role === 'stem' ? ['flower'] : [];
  return {
    version: SEMANTIC_MODEL_VERSION,
    role,
    parent,
    children: [],
    group: role.startsWith('petals.') ? 'flower.petals' : role.startsWith('leaf') ? 'plant.leaves' : null,
    attachedTo,
    surrounds: role.startsWith('petals.') ? ['flower-center'] : [],
    overlaps: [],
    occludes: role.startsWith('petals.') || role === 'flower-center' ? ['stem'] : [],
    behind: role === 'stem' ? ['flower'] : [],
    sourceRecipeId: object.semantic?.sourceRecipeId || object.metadata?.sourceRecipeId || null,
    sourceStepId: object.semantic?.sourceStepId || object.metadata?.sourceStepId || null,
    editableParameters: clone(object.semantic?.editableParameters || {}),
    protectedProperties: [...new Set(object.semantic?.protectedProperties || object.metadata?.protectedProperties || [])],
    dependencyIds: [...new Set(object.semantic?.dependencyIds || [])],
    constraintIds: [...new Set(object.semantic?.constraintIds || [])],
    confidence: role === 'unclassified' ? 0.25 : object.metadata?.semanticLabel ? 1 : 0.7,
    migration: object.semantic ? null : 'LOW_RISK_DEFAULT'
  };
}

export function normalizeSemantic(object) {
  const defaults = defaultSemantic(object), source = object.semantic || {};
  object.semantic = { ...defaults, ...clone(source) };
  for (const key of ['children', 'attachedTo', 'surrounds', 'overlaps', 'occludes', 'behind', 'protectedProperties', 'dependencyIds', 'constraintIds']) {
    object.semantic[key] = [...new Set(Array.isArray(object.semantic[key]) ? object.semantic[key].filter(Boolean) : [])];
  }
  object.metadata = { ...(object.metadata || {}), semanticLabel: object.metadata?.semanticLabel || object.semantic.role };
  return object;
}

export function walkSemanticObjects(document) {
  const output = [];
  const walk = (objects, layer, parentObject = null) => {
    for (const object of objects || []) {
      normalizeSemantic(object);
      if (parentObject && !object.semantic.parent) object.semantic.parent = parentObject.id;
      output.push({ object, layer, parentObject });
      if (object.type === 'group' || object.type === 'frame') walk(object.children, layer, object);
    }
  };
  for (const page of document.pages || []) for (const layer of page.layers || []) walk(layer.objects, layer);
  return output;
}
