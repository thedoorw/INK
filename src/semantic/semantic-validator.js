import { SEMANTIC_RELATIONS, walkSemanticObjects } from './semantic-model.js';

export function validateSemanticDocument(document) {
  const errors = [], warnings = [], entries = walkSemanticObjects(document), ids = new Set(entries.map(({ object }) => object.id)), virtual = new Set(['plant', 'flower', 'flower.petals', 'plant.leaves', 'stem', 'flower-center']);
  for (const { object } of entries) {
    if (!object.semantic?.role) errors.push({ code: 'SEMANTIC_ROLE_MISSING', objectId: object.id });
    for (const key of SEMANTIC_RELATIONS.filter(item => item !== 'parent' && item !== 'group')) if (!Array.isArray(object.semantic?.[key])) errors.push({ code: 'SEMANTIC_RELATION_INVALID', objectId: object.id, relation: key });
    for (const relation of ['parent', 'group']) { const target = object.semantic?.[relation]; if (target && !ids.has(target) && !virtual.has(target)) warnings.push({ code: 'SEMANTIC_TARGET_VIRTUAL_OR_MISSING', objectId: object.id, relation, target }); }
    if (object.semantic?.role === 'unclassified') warnings.push({ code: 'SEMANTIC_LOW_CONFIDENCE', objectId: object.id });
  }
  return { format: 'INK-SEMANTIC-VALIDATION', version: '1.0', passed: errors.length === 0, errors, warnings, metrics: { objectCount: entries.length, classifiedCount: entries.filter(({ object }) => object.semantic.role !== 'unclassified').length } };
}
