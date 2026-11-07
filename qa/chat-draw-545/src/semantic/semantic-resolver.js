import { buildRelationshipGraph } from './relationship-graph.js';
import { walkSemanticObjects } from './semantic-model.js';

const roleMatches = (role, wanted) => wanted.some(value => { const normalized = value === 'petal' ? 'petals' : value; return role === normalized || role.startsWith(`${normalized}.`); });

export function semanticQueryFromText(text = '') {
  const value = String(text).toLowerCase(), roles = [];
  if (/外圈花瓣|outer petals?|petals\.outer/.test(value)) roles.push('petals.outer');
  else if (/內圈花瓣|inner petals?|petals\.inner/.test(value)) roles.push('petals.inner');
  else if (/花瓣|petals?/.test(value)) roles.push('petals');
  if (/花心|flower[- ]?center|centre/.test(value)) roles.push('flower-center');
  if (/左葉|left leaf/.test(value)) roles.push('leaf.left');
  else if (/右葉|right leaf/.test(value)) roles.push('leaf.right');
  else if (/葉片|葉子|leaves|leaf/.test(value)) roles.push('leaf');
  if (/莖|stem/.test(value)) roles.push('stem');
  if (/整朵花|whole flower|flower without/.test(value)) roles.push('flower');
  const exclude = [];
  if (/保留花心|preserve (the )?flower[- ]?center/.test(value)) exclude.push('flower-center');
  if (/不包含莖|without stem/.test(value)) exclude.push('stem');
  if (/不包含葉|without (the )?leaves/.test(value)) exclude.push('leaf');
  return { roles: [...new Set(roles)], exclude, includeAttached: /依附物件一併|include attached/.test(value), parentOrChildren: /父物件|子物件|parent|children/.test(value) };
}

export function resolveSemanticTargets(document, query, { allowUnclassified = false } = {}) {
  const normalized = typeof query === 'string' ? semanticQueryFromText(query) : query || {}, graph = buildRelationshipGraph(document), entries = walkSemanticObjects(document);
  const roles = normalized.roles || [], ids = new Set();
  for (const { object } of entries) {
    const role = object.semantic.role;
    if (roles.includes('flower') ? role.startsWith('petals.') || role === 'flower-center' : roleMatches(role, roles)) ids.add(object.id);
  }
  for (const { object } of entries) if ((normalized.exclude || []).some(value => object.semantic.role === value || object.semantic.role.startsWith(`${value}.`))) ids.delete(object.id);
  if (normalized.includeAttached) for (const id of [...ids]) for (const edge of [...graph.outgoing(id, 'attachedTo'), ...graph.incoming(id, 'attachedTo')]) if (graph.nodes.get(edge.to)?.object) ids.add(edge.to); else if (graph.nodes.get(edge.from)?.object) ids.add(edge.from);
  if (normalized.parentOrChildren) for (const id of [...ids]) for (const child of graph.descendants(id)) if (graph.nodes.get(child)?.object) ids.add(child);
  const targets = entries.filter(({ object }) => ids.has(object.id) && (allowUnclassified || object.semantic.role !== 'unclassified')).map(({ object }) => object.id);
  return { status: targets.length ? 'RESOLVED' : 'UNRESOLVED', targets, query: normalized, graph: graph.toJSON() };
}
