import { buildRelationshipGraph } from './relationship-graph.js';
import { walkSemanticObjects } from './semantic-model.js';
import { validateSemanticDocument } from './semantic-validator.js';

export function migrateSemanticDocument(document) {
  let before = 0;
  const count = objects => { for (const object of objects || []) { if (object.semantic) before += 1; if (object.type === 'group') count(object.children); } };
  for (const page of document.pages || []) for (const layer of page.layers || []) count(layer.objects);
  const entries = walkSemanticObjects(document);
  document.semanticModel = {
    format: 'INK-SEMANTIC-MODEL', version: '1.0', migrationStrategy: before === entries.length ? 'PRESERVED' : 'LOW_RISK_DEFAULTS',
    relationshipGraph: buildRelationshipGraph(document).toJSON()
  };
  const validation = validateSemanticDocument(document);
  return { document, report: { format: 'INK-SEMANTIC-MIGRATION', version: '1.0', migratedObjects: entries.length - before, preservedObjects: before, validation } };
}
