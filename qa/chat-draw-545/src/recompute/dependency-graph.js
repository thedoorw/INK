import { walkSemanticObjects } from '../semantic/semantic-model.js';
import { CHANGE_DOMAINS } from './change-domain.js';

export const DEPENDENCY_RELATION_TYPES = Object.freeze([
  'PARENT_OF', 'CHILD_OF', 'INSTANCE_OF', 'GENERATED_BY', 'DEPENDS_ON_PARAMETER',
  'USES_MATERIAL', 'MASKED_BY', 'CLIPPED_BY', 'POSITIONED_RELATIVE_TO', 'SHARES_CENTER_WITH'
]);

const clone = value => structuredClone(value);
const ALL_DOMAINS = [...CHANGE_DOMAINS];
const domains = (...values) => [...new Set(values.flat().filter(Boolean))].sort();
const domainMetadata = (metadata, values) => ({ ...clone(metadata || {}), changeDomains: domains(metadata?.changeDomains || [], values) });

export function edgeSupportsChangeDomain(edge, changeDomain) {
  if (!changeDomain || changeDomain === 'PARAMETER_CHANGE') return true;
  const allowed = edge?.metadata?.changeDomains;
  return !Array.isArray(allowed) || allowed.length === 0 || allowed.includes(changeDomain);
}

export function ensureDependencyModel(document) {
  if (!document.dependencyModel || typeof document.dependencyModel !== 'object') {
    document.dependencyModel = { format: 'INK-DOCUMENT-DEPENDENCY-MODEL', version: '1.0', edges: [] };
  }
  document.dependencyModel.format = 'INK-DOCUMENT-DEPENDENCY-MODEL';
  document.dependencyModel.version = '1.0';
  document.dependencyModel.edges = Array.isArray(document.dependencyModel.edges) ? document.dependencyModel.edges : [];
  return document.dependencyModel;
}

export function addDependencyRelation(document, { from, to, type, metadata = {} } = {}) {
  if (!from || !to) throw Object.assign(new Error('INK_DEPENDENCY_ENDPOINT_REQUIRED'), { code: 'DEPENDENCY_ENDPOINT_REQUIRED' });
  if (!DEPENDENCY_RELATION_TYPES.includes(type)) throw Object.assign(new Error(`INK_DEPENDENCY_TYPE_UNSUPPORTED:${type}`), { code: 'DEPENDENCY_TYPE_UNSUPPORTED', type });
  const model = ensureDependencyModel(document);
  const existing = model.edges.find(edge => edge.from === from && edge.to === to && edge.type === type);
  if (existing) {
    existing.metadata = { ...(existing.metadata || {}), ...clone(metadata) };
    return existing;
  }
  const edge = { from, to, type, metadata: clone(metadata) };
  model.edges.push(edge);
  model.edges.sort((a, b) => `${a.from}|${a.to}|${a.type}`.localeCompare(`${b.from}|${b.to}|${b.type}`));
  return edge;
}

export function removeDependencyRelation(document, { from, to, type = null } = {}) {
  const model = ensureDependencyModel(document);
  const before = model.edges.length;
  model.edges = model.edges.filter(edge => !(edge.from === from && edge.to === to && (!type || edge.type === type)));
  return before - model.edges.length;
}

export function setParentRelation(document, childId, parentId, metadata = {}) {
  const objects = walkSemanticObjects(document).map(entry => entry.object);
  const child = objects.find(object => object.id === childId);
  const parent = objects.find(object => object.id === parentId);
  if (!child || !parent) throw Object.assign(new Error(`INK_HIERARCHY_NODE_MISSING:${parentId}->${childId}`), { code: 'HIERARCHY_NODE_MISSING', parentId, childId });
  child.parentId = parentId;
  child.semantic = { ...(child.semantic || {}), parent: parentId };
  addDependencyRelation(document, { from: parentId, to: childId, type: 'PARENT_OF', metadata });
  return { childId, parentId };
}

export class DependencyGraph {
  constructor() { this.nodes = new Map(); this.edges = []; this.missingDependencies = []; }
  node(id, data = {}) {
    const previous = this.nodes.get(id) || { id };
    this.nodes.set(id, { ...previous, ...data, id });
    return this;
  }
  edge(from, to, type = 'DEPENDS_ON', metadata = {}) {
    if (!this.nodes.has(from) || !this.nodes.has(to)) {
      throw Object.assign(new Error(`Missing dependency node: ${from} -> ${to}`), { code: 'DEPENDENCY_NODE_MISSING', details: { from, to, type } });
    }
    const existing = this.edges.find(item => item.from === from && item.to === to && item.type === type);
    if (existing) existing.metadata = domainMetadata({ ...(existing.metadata || {}), ...clone(metadata) }, []);
    else this.edges.push({ from, to, type, metadata: clone(metadata) });
    return this;
  }
  removeEdge(from, to, type = null) {
    const before = this.edges.length;
    this.edges = this.edges.filter(edge => !(edge.from === from && edge.to === to && (!type || edge.type === type)));
    return before - this.edges.length;
  }
  downstream(ids, { edgeFilter = null } = {}) {
    const found = new Set(ids), queue = [...ids].sort();
    while (queue.length) {
      const current = queue.shift();
      const outgoing = this.edges.filter(item => item.from === current && (!edgeFilter || edgeFilter(item))).sort((a, b) => `${a.to}|${a.type}`.localeCompare(`${b.to}|${b.type}`));
      for (const edge of outgoing) if (!found.has(edge.to)) { found.add(edge.to); queue.push(edge.to); queue.sort(); }
    }
    return [...found].sort();
  }
  pathsFrom(ids, { edgeFilter = null } = {}) {
    const paths = Object.fromEntries([...ids].sort().map(id => [id, { nodes: [id], edges: [] }]));
    const queue = [...ids].sort();
    while (queue.length) {
      const current = queue.shift();
      const outgoing = this.edges.filter(item => item.from === current && (!edgeFilter || edgeFilter(item))).sort((a, b) => `${a.to}|${a.type}`.localeCompare(`${b.to}|${b.type}`));
      for (const edge of outgoing) {
        if (!paths[edge.to]) {
          paths[edge.to] = {
            nodes: [...paths[current].nodes, edge.to],
            edges: [...paths[current].edges, { from: edge.from, to: edge.to, type: edge.type, metadata: clone(edge.metadata || {}) }]
          };
          queue.push(edge.to); queue.sort();
        }
      }
    }
    return paths;
  }
  detectCycles() {
    const adjacency = new Map([...this.nodes.keys()].map(id => [id, []]));
    for (const edge of this.edges) adjacency.get(edge.from)?.push(edge.to);
    for (const values of adjacency.values()) values.sort();
    const state = new Map(), stack = [], cycles = [], keys = new Set();
    const visit = id => {
      state.set(id, 1); stack.push(id);
      for (const next of adjacency.get(id) || []) {
        if (!state.has(next)) visit(next);
        else if (state.get(next) === 1) {
          const start = stack.lastIndexOf(next), cycle = [...stack.slice(start), next], key = cycle.join('>');
          if (!keys.has(key)) { keys.add(key); cycles.push(cycle); }
        }
      }
      stack.pop(); state.set(id, 2);
    };
    for (const id of [...adjacency.keys()].sort()) if (!state.has(id)) visit(id);
    return cycles;
  }
  topologicalOrder() {
    const indegree = new Map([...this.nodes.keys()].map(id => [id, 0]));
    for (const edge of this.edges) indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
    const queue = [...indegree.entries()].filter(([, value]) => value === 0).map(([id]) => id).sort();
    const order = [];
    while (queue.length) {
      const current = queue.shift(); order.push(current);
      for (const edge of this.edges.filter(item => item.from === current).sort((a, b) => `${a.to}|${a.type}`.localeCompare(`${b.to}|${b.type}`))) {
        indegree.set(edge.to, indegree.get(edge.to) - 1);
        if (indegree.get(edge.to) === 0) { queue.push(edge.to); queue.sort(); }
      }
    }
    const cycles = order.length === this.nodes.size ? [] : this.detectCycles();
    return { status: cycles.length ? 'CYCLE' : 'ORDERED', order, cycles, unresolvedNodes: [...this.nodes.keys()].filter(id => !order.includes(id)).sort() };
  }
  toJSON() {
    const topology = this.topologicalOrder();
    return { format: 'INK-DEPENDENCY-GRAPH', version: '1.2', nodes: [...this.nodes.values()].sort((a, b) => a.id.localeCompare(b.id)), edges: clone(this.edges).sort((a, b) => `${a.from}|${a.to}|${a.type}`.localeCompare(`${b.from}|${b.to}|${b.type}`)), topology };
  }
}

function addObjectPipeline(graph, objectId, data = {}) {
  const prefix = `object:${objectId}`;
  const nodes = {
    parameter: `parameter:${objectId}`,
    semantic: `semantic:${objectId}`,
    geometry: `${prefix}:geometry`,
    transform: `${prefix}:transform`,
    hierarchy: `${prefix}:hierarchy`,
    material: `${prefix}:material`,
    style: `${prefix}:style`,
    constraint: `${prefix}:constraint`,
    render: `${prefix}:render`
  };
  for (const [kind, id] of Object.entries(nodes)) graph.node(id, { kind, objectId, ...data });
  graph.edge(nodes.parameter, nodes.semantic, 'PARAMETER_TO_SEMANTIC', domainMetadata({}, ['PARAMETER_CHANGE']))
    .edge(nodes.parameter, nodes.geometry, 'PARAMETER_TO_GEOMETRY', domainMetadata({}, ['PARAMETER_CHANGE']))
    .edge(nodes.parameter, nodes.transform, 'PARAMETER_TO_TRANSFORM', domainMetadata({}, ['PARAMETER_CHANGE']))
    .edge(nodes.parameter, nodes.hierarchy, 'PARAMETER_TO_HIERARCHY', domainMetadata({}, ['PARAMETER_CHANGE']))
    .edge(nodes.parameter, nodes.material, 'PARAMETER_TO_MATERIAL', domainMetadata({}, ['PARAMETER_CHANGE']))
    .edge(nodes.parameter, nodes.style, 'PARAMETER_TO_STYLE', domainMetadata({}, ['PARAMETER_CHANGE']))
    .edge(nodes.semantic, nodes.constraint, 'SEMANTIC_CONSTRAINT', domainMetadata({}, ['SEMANTIC_CHANGE', 'PARAMETER_CHANGE']))
    .edge(nodes.geometry, nodes.constraint, 'GEOMETRY_CONSTRAINT', domainMetadata({}, ['GEOMETRY_CHANGE', 'PARAMETER_CHANGE']))
    .edge(nodes.transform, nodes.constraint, 'TRANSFORM_CONSTRAINT', domainMetadata({}, ['TRANSFORM_CHANGE', 'PARAMETER_CHANGE']))
    .edge(nodes.hierarchy, nodes.constraint, 'HIERARCHY_CONSTRAINT', domainMetadata({}, ['HIERARCHY_CHANGE', 'PARAMETER_CHANGE']))
    .edge(nodes.material, nodes.style, 'MATERIAL_STYLE', domainMetadata({}, ['MATERIAL_CHANGE', 'PARAMETER_CHANGE']))
    .edge(nodes.style, nodes.render, 'STYLE_RENDER', domainMetadata({}, ['STYLE_CHANGE', 'MATERIAL_CHANGE', 'PARAMETER_CHANGE']))
    .edge(nodes.constraint, nodes.render, 'CONSTRAINT_RENDER', domainMetadata({}, ['GEOMETRY_CHANGE', 'TRANSFORM_CHANGE', 'HIERARCHY_CHANGE', 'SEMANTIC_CHANGE', 'PARAMETER_CHANGE']))
    .edge(nodes.render, 'export:document', 'EXPORT_DEPENDENCY', domainMetadata({}, ALL_DOMAINS));
  return nodes;
}

const nodeForObject = (graph, reference, kind) => graph.nodes.has(`object:${reference}:${kind}`) ? `object:${reference}:${kind}` : null;
const firstExisting = (graph, candidates) => candidates.find(candidate => graph.nodes.has(candidate)) || null;

function brushNodeIds(graph, brushId, brushVersion = null) {
  return [...graph.nodes.keys()].filter(id => id.startsWith(`brush:${brushId}@`) && (!brushVersion || id === `brush:${brushId}@${brushVersion}`)).sort();
}

function isSurfaceComposite(object = {}) {
  return Boolean(object.watercolorComposite || object.vectorBrushInstance || object.materialInstance || object.metadata?.watercolorV2 || object.metadata?.semanticRole?.includes?.('watercolor'));
}

function addNestedRelations(graph, parent, child, source) {
  const childDetached = Boolean(child.detached || child.metadata?.detachedFromParent || child.materialInstance?.detached || child.vectorBrushInstance?.detached);
  const metadata = { persistedBy: source, parentObjectId: parent.id, childObjectId: child.id, childDetached };
  graph.edge(`object:${parent.id}:geometry`, `object:${child.id}:geometry`, 'NESTED_GEOMETRY', domainMetadata(metadata, ['GEOMETRY_CHANGE', 'PARAMETER_CHANGE']));
  if (!childDetached) graph.edge(`object:${parent.id}:transform`, `object:${child.id}:transform`, 'PARENT_TRANSFORM', domainMetadata(metadata, ['TRANSFORM_CHANGE', 'PARAMETER_CHANGE']));
  graph.edge(`object:${parent.id}:hierarchy`, `object:${child.id}:hierarchy`, 'PARENT_HIERARCHY', domainMetadata(metadata, ['HIERARCHY_CHANGE', 'PARAMETER_CHANGE']));
  graph.edge(`semantic:${parent.id}`, `semantic:${child.id}`, 'PARENT_SEMANTIC', domainMetadata(metadata, ['SEMANTIC_CHANGE', 'PARAMETER_CHANGE']));
  graph.edge(`object:${parent.id}:style`, `object:${child.id}:style`, 'INHERITED_STYLE', domainMetadata(metadata, ['STYLE_CHANGE', 'PARAMETER_CHANGE']));
  if (isSurfaceComposite(parent)) {
    graph.edge(`object:${parent.id}:material`, `object:${child.id}:material`, 'COMPOSITE_MATERIAL', domainMetadata(metadata, ['MATERIAL_CHANGE', 'PARAMETER_CHANGE']));
    graph.edge(`object:${parent.id}:material`, `object:${child.id}:geometry`, 'RENDER_GEOMETRY_FROM_MATERIAL', domainMetadata(metadata, ['MATERIAL_CHANGE', 'PARAMETER_CHANGE']));
    graph.edge(`object:${parent.id}:style`, `object:${child.id}:style`, 'COMPOSITE_STYLE', domainMetadata(metadata, ['MATERIAL_CHANGE']));
  }
}

function explicitRelationEdges(graph, relation) {
  const metadata = relation.metadata || {};
  const sourceGeometry = nodeForObject(graph, relation.from, 'geometry');
  const targetGeometry = nodeForObject(graph, relation.to, 'geometry');
  const sourceTransform = nodeForObject(graph, relation.from, 'transform');
  const targetTransform = nodeForObject(graph, relation.to, 'transform');
  const sourceHierarchy = nodeForObject(graph, relation.from, 'hierarchy');
  const targetHierarchy = nodeForObject(graph, relation.to, 'hierarchy');
  const sourceSemantic = firstExisting(graph, [`semantic:${relation.from}`, relation.from]);
  const targetSemantic = firstExisting(graph, [`semantic:${relation.to}`, relation.to]);
  const targetMaterial = nodeForObject(graph, relation.to, 'material');
  const targetConstraint = nodeForObject(graph, relation.to, 'constraint');
  const sourceMaterial = firstExisting(graph, [
    `template:${relation.from}`,
    ...brushNodeIds(graph, relation.from),
    nodeForObject(graph, relation.from, 'material'),
    relation.from
  ].filter(Boolean));
  const generator = firstExisting(graph, [`generator:${relation.from}`, sourceGeometry, relation.from].filter(Boolean));
  const parameter = firstExisting(graph, [`parameter:${relation.from}`, relation.from]);
  const output = [];
  const add = (from, to, type, ds) => { if (from && to) output.push({ from, to, type, metadata: domainMetadata(metadata, ds) }); };
  switch (relation.type) {
    case 'PARENT_OF':
      add(sourceHierarchy, targetHierarchy, relation.type, ['HIERARCHY_CHANGE', 'PARAMETER_CHANGE']);
      add(sourceTransform, targetTransform, 'PARENT_TRANSFORM', ['TRANSFORM_CHANGE', 'PARAMETER_CHANGE']);
      break;
    case 'CHILD_OF':
      add(sourceHierarchy, targetHierarchy, relation.type, ['HIERARCHY_CHANGE', 'PARAMETER_CHANGE']);
      break;
    case 'POSITIONED_RELATIVE_TO':
    case 'SHARES_CENTER_WITH':
      add(sourceGeometry, targetGeometry, relation.type, ['GEOMETRY_CHANGE', 'PARAMETER_CHANGE']);
      add(sourceTransform, targetTransform, `${relation.type}_TRANSFORM`, ['TRANSFORM_CHANGE', 'PARAMETER_CHANGE']);
      break;
    case 'INSTANCE_OF':
    case 'USES_MATERIAL':
      add(sourceMaterial, targetMaterial, relation.type, ['MATERIAL_CHANGE', 'PARAMETER_CHANGE']);
      break;
    case 'GENERATED_BY':
      add(generator, targetGeometry, relation.type, ['GEOMETRY_CHANGE', 'PARAMETER_CHANGE']);
      break;
    case 'DEPENDS_ON_PARAMETER': {
      const domain = metadata.changeDomain || 'GEOMETRY_CHANGE';
      const kind = { MATERIAL_CHANGE: 'material', STYLE_CHANGE: 'style', SEMANTIC_CHANGE: 'semantic', TRANSFORM_CHANGE: 'transform', HIERARCHY_CHANGE: 'hierarchy' }[domain] || 'geometry';
      const target = kind === 'semantic' ? targetSemantic : nodeForObject(graph, relation.to, kind);
      add(parameter, target, relation.type, [domain, 'PARAMETER_CHANGE']);
      break;
    }
    case 'MASKED_BY':
    case 'CLIPPED_BY':
      add(sourceGeometry, targetConstraint, relation.type, ['GEOMETRY_CHANGE', 'PARAMETER_CHANGE']);
      break;
    default:
      add(sourceGeometry || sourceSemantic, targetConstraint || targetSemantic, relation.type, ALL_DOMAINS);
  }
  return output;
}

export function buildDependencyGraph(document) {
  const graph = new DependencyGraph(), entries = walkSemanticObjects(document), ids = new Set(entries.map(({ object }) => object.id));
  graph.node('export:document', { kind: 'export' });
  const missingDependencies = [];

  for (const template of document.materialLibrary?.templates || []) {
    graph.node(`template:${template.templateId}`, { kind: 'material-template', templateId: template.templateId, templateVersion: template.templateVersion });
    for (const parameter of Object.keys(template.editableParameters || {})) {
      graph.node(`template-parameter:${template.templateId}:${parameter}`, { kind: 'template-parameter', templateId: template.templateId, parameter });
      graph.edge(`template-parameter:${template.templateId}:${parameter}`, `template:${template.templateId}`, 'DEPENDS_ON_PARAMETER', domainMetadata({}, ['PARAMETER_CHANGE', 'MATERIAL_CHANGE']));
    }
  }

  for (const material of document.vectorBrushLibrary?.materials || []) {
    const id = `brush:${material.brushId}@${material.brushVersion || '1.0.0'}`;
    graph.node(id, { kind: 'brush-material', brushId: material.brushId, brushVersion: material.brushVersion || '1.0.0', materialHash: material.materialHash || null });
  }

  for (const { object, parentObject } of entries) {
    addObjectPipeline(graph, object.id, { objectType: object.type, parentObjectId: parentObject?.id || object.parentId || null, detached: Boolean(object.detached || object.metadata?.detachedFromParent || object.materialInstance?.detached || object.vectorBrushInstance?.detached) });
    if (object.type === 'repeat') {
      graph.node(`generator:${object.id}`, { kind: 'repeat-generator', objectId: object.id, ringIndex: object.ringIndex || 0 });
      for (const instance of object.instances || []) addObjectPipeline(graph, instance.instanceId, { virtual: true, generatorId: object.id, ringIndex: instance.ringIndex, instanceIndex: instance.instanceIndex, parentObjectId: object.id });
    }
  }

  for (const { object, parentObject } of entries) {
    if (parentObject) addNestedRelations(graph, parentObject, object, 'nested-group');
    if (object.parentId && ids.has(object.parentId) && object.parentId !== parentObject?.id) {
      const parent = entries.find(entry => entry.object.id === object.parentId)?.object;
      if (parent) addNestedRelations(graph, parent, object, 'parentId');
    }
    for (const dependencyId of object.semantic?.dependencyIds || []) {
      if (!ids.has(dependencyId)) missingDependencies.push({ objectId: object.id, dependencyId, relation: 'semantic.dependencyIds' });
      else {
        graph.edge(`object:${dependencyId}:geometry`, `object:${object.id}:geometry`, 'GEOMETRY_DEPENDENCY', domainMetadata({}, ['GEOMETRY_CHANGE', 'PARAMETER_CHANGE']));
        graph.edge(`semantic:${dependencyId}`, `semantic:${object.id}`, 'SEMANTIC_DEPENDENCY', domainMetadata({}, ['SEMANTIC_CHANGE', 'PARAMETER_CHANGE']));
      }
    }

    const material = object.materialInstance;
    if (material && !material.detached) {
      const templateNode = `template:${material.templateId}`;
      if (!graph.nodes.has(templateNode)) missingDependencies.push({ objectId: object.id, dependencyId: material.templateId, relation: 'INSTANCE_OF' });
      else {
        graph.edge(templateNode, `object:${object.id}:material`, 'INSTANCE_OF', domainMetadata({}, ['MATERIAL_CHANGE', 'PARAMETER_CHANGE']));
        for (const parameter of Object.keys(material.parameterOverrides || {})) {
          const node = `template-parameter:${material.templateId}:${parameter}`;
          if (graph.nodes.has(node)) graph.edge(node, `object:${object.id}:material`, 'DEPENDS_ON_PARAMETER', domainMetadata({}, ['PARAMETER_CHANGE', 'MATERIAL_CHANGE']));
        }
      }
    }

    const brushRefs = new Map();
    const addBrushRef = (brushId, version = null) => { if (brushId) brushRefs.set(`${brushId}@${version || '*'}`, { brushId, version }); };
    addBrushRef(object.vectorBrushInstance?.brushId, object.vectorBrushInstance?.brushVersion);
    addBrushRef(object.metadata?.brushId, object.metadata?.brushVersion);
    addBrushRef(object.watercolorComposite?.brushId, object.watercolorComposite?.brushVersion);
    if (!object.vectorBrushInstance?.detached) {
      for (const ref of brushRefs.values()) {
        const nodes = brushNodeIds(graph, ref.brushId, ref.version);
        if (!nodes.length) missingDependencies.push({ objectId: object.id, dependencyId: ref.brushId, relation: 'USES_VECTOR_BRUSH' });
        for (const node of nodes) graph.edge(node, `object:${object.id}:material`, 'USES_MATERIAL', domainMetadata({ brushId: ref.brushId, brushVersion: ref.version }, ['MATERIAL_CHANGE', 'PARAMETER_CHANGE']));
      }
    }

    if (object.type === 'repeat') {
      const generatorNode = `generator:${object.id}`;
      graph.edge(`parameter:${object.id}`, generatorNode, 'DEPENDS_ON_PARAMETER', domainMetadata({}, ['PARAMETER_CHANGE', 'GEOMETRY_CHANGE']));
      graph.edge(generatorNode, `object:${object.id}:geometry`, 'GENERATOR_STATE', domainMetadata({}, ['GEOMETRY_CHANGE', 'PARAMETER_CHANGE']));
      if (object.sourceObjectId && ids.has(object.sourceObjectId)) graph.edge(`object:${object.sourceObjectId}:geometry`, generatorNode, 'USES_SOURCE_GEOMETRY', domainMetadata({}, ['GEOMETRY_CHANGE', 'PARAMETER_CHANGE']));
      if (object.templateId && graph.nodes.has(`template:${object.templateId}`)) graph.edge(`template:${object.templateId}`, generatorNode, 'USES_MATERIAL', domainMetadata({}, ['MATERIAL_CHANGE', 'PARAMETER_CHANGE']));
      for (const instance of object.instances || []) graph.edge(generatorNode, `object:${instance.instanceId}:geometry`, 'GENERATED_BY', domainMetadata({}, ['GEOMETRY_CHANGE', 'PARAMETER_CHANGE']));
    }
    if (object.mask?.path?.id && ids.has(object.mask.path.id)) graph.edge(`object:${object.mask.path.id}:geometry`, `object:${object.id}:constraint`, 'MASKED_BY', domainMetadata({}, ['GEOMETRY_CHANGE', 'PARAMETER_CHANGE']));
    if (object.clipPath?.path?.id && ids.has(object.clipPath.path.id)) graph.edge(`object:${object.clipPath.path.id}:geometry`, `object:${object.id}:constraint`, 'CLIPPED_BY', domainMetadata({}, ['GEOMETRY_CHANGE', 'PARAMETER_CHANGE']));
  }

  for (const relation of ensureDependencyModel(document).edges) {
    const translated = explicitRelationEdges(graph, relation);
    if (!translated.length) {
      missingDependencies.push({ objectId: relation.to, dependencyId: relation.from, relation: relation.type, unresolvedFrom: true, unresolvedTo: true });
      continue;
    }
    for (const edge of translated) graph.edge(edge.from, edge.to, edge.type, edge.metadata);
  }
  graph.missingDependencies = missingDependencies;
  graph.cycles = graph.detectCycles();
  return graph;
}
