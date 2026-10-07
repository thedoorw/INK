import { walkSemanticObjects } from './semantic-model.js';

export class RelationshipGraph {
  constructor() { this.nodes = new Map(); this.edges = []; }
  addNode(id, value = {}) { if (id) this.nodes.set(id, { id, ...value }); return this; }
  addEdge(from, type, to) { if (from && type && to && !this.edges.some(edge => edge.from === from && edge.type === type && edge.to === to)) this.edges.push({ from, type, to }); return this; }
  outgoing(id, type = null) { return this.edges.filter(edge => edge.from === id && (!type || edge.type === type)); }
  incoming(id, type = null) { return this.edges.filter(edge => edge.to === id && (!type || edge.type === type)); }
  descendants(id) { const found = new Set(), visit = value => { for (const edge of this.outgoing(value, 'parent-of')) if (!found.has(edge.to)) { found.add(edge.to); visit(edge.to); } }; visit(id); return [...found]; }
  toJSON() { return { format: 'INK-SEMANTIC-RELATIONSHIP-GRAPH', version: '1.0', nodes: [...this.nodes.values()], edges: this.edges }; }
}

export function buildRelationshipGraph(document) {
  const graph = new RelationshipGraph();
  for (const id of ['plant', 'flower', 'flower.petals', 'plant.leaves']) graph.addNode(id, { virtual: true });
  graph.addEdge('plant', 'parent-of', 'flower').addEdge('plant', 'parent-of', 'plant.leaves').addEdge('flower', 'parent-of', 'flower.petals');
  for (const { object } of walkSemanticObjects(document)) {
    const semantic = object.semantic;
    graph.addNode(object.id, { role: semantic.role, virtual: false, object });
    if (semantic.parent) graph.addEdge(semantic.parent, 'parent-of', object.id);
    if (semantic.group) graph.addEdge(semantic.group, 'groups', object.id);
    for (const relation of ['attachedTo', 'surrounds', 'overlaps', 'occludes', 'behind']) for (const target of semantic[relation] || []) graph.addEdge(object.id, relation, target);
    for (const child of semantic.children || []) graph.addEdge(object.id, 'parent-of', child);
  }
  return graph;
}
