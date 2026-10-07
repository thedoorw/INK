import { stableHash } from '../core/stable-id.js';
import { edgeSupportsChangeDomain } from './dependency-graph.js';
import { normalizeChangeDomain } from './change-domain.js';

function brushNodes(graph, id) {
  return [...graph.nodes.keys()].filter(nodeId => nodeId.startsWith(`brush:${id}@`)).sort();
}

function startNodesFor(graph, id, changeDomain) {
  if (graph.nodes.has(id)) return [id];
  const byDomain = {
    GEOMETRY_CHANGE: [`object:${id}:geometry`, `generator:${id}`],
    MATERIAL_CHANGE: [`template:${id}`, ...brushNodes(graph, id), `object:${id}:material`],
    STYLE_CHANGE: [`object:${id}:style`],
    SEMANTIC_CHANGE: [`semantic:${id}`],
    TRANSFORM_CHANGE: [`object:${id}:transform`],
    HIERARCHY_CHANGE: [`object:${id}:hierarchy`],
    PARAMETER_CHANGE: [`parameter:${id}`, `template:${id}`, ...brushNodes(graph, id), `generator:${id}`]
  };
  return [...new Set((byDomain[changeDomain] || []).filter(candidate => graph.nodes.has(candidate)))].sort();
}

function objectIdsForNodes(graph, nodeIds) {
  return [...new Set(nodeIds.map(id => graph.nodes.get(id)?.objectId).filter(Boolean))].sort();
}

function immediateAffected(graph, starts, edgeFilter) {
  const result = new Set(starts);
  for (const start of starts) {
    for (const edge of graph.edges.filter(item => item.from === start && edgeFilter(item))) result.add(edge.to);
  }
  return [...result].sort();
}

function excludedSiblings(graph, targetObjectIds, affectedObjectIds) {
  const affected = new Set(affectedObjectIds), parents = new Set();
  for (const node of graph.nodes.values()) if (node.objectId && targetObjectIds.includes(node.objectId) && node.parentObjectId) parents.add(node.parentObjectId);
  const siblings = new Set();
  for (const node of graph.nodes.values()) {
    if (node.kind === 'geometry' && node.parentObjectId && parents.has(node.parentObjectId) && !affected.has(node.objectId)) siblings.add(node.objectId);
  }
  return [...siblings].sort();
}

export function affectedScope(graph, { targetIds = [], operation = 'style', changeDomain = null, allowFallback = false } = {}) {
  const domain = normalizeChangeDomain(changeDomain, operation);
  const cycles = graph.cycles || graph.detectCycles?.() || [];
  if (cycles.length) {
    return {
      status: 'REJECTED', code: 'DEPENDENCY_CYCLE', reason: 'DEPENDENCY_GRAPH_CYCLE',
      targetIds, changeDomain: domain, cycles, fallbackScope: 'FULL_DOCUMENT', approvalRequired: true,
      affectedNodes: [], affectedObjectIds: [], recomputeSetHash: stableHash([])
    };
  }
  if (graph.missingDependencies?.length) {
    return {
      status: allowFallback ? 'FULL_REGENERATION_APPROVAL_REQUIRED' : 'REJECTED',
      code: 'UNRESOLVED_DEPENDENCY', reason: 'DEPENDENCY_GRAPH_INCOMPLETE', targetIds, changeDomain: domain,
      missingDependencies: graph.missingDependencies, fallbackScope: 'FULL_DOCUMENT', approvalRequired: true,
      affectedNodes: [], affectedObjectIds: [], recomputeSetHash: stableHash([])
    };
  }

  const startsByTarget = Object.fromEntries(targetIds.map(id => [id, startNodesFor(graph, id, domain)]));
  const missingTargets = targetIds.filter(id => startsByTarget[id].length === 0);
  if (missingTargets.length) return {
    status: 'REJECTED', code: 'DEPENDENCY_TARGET_MISSING', reason: 'SEMANTIC_TARGET_MISSING', missingTargets,
    targetIds, changeDomain: domain, affectedNodes: [], affectedObjectIds: [], recomputeSetHash: stableHash([])
  };
  const starts = [...new Set(Object.values(startsByTarget).flat())].sort();

  const structural = ['adjust-count', 'replace-structure', 'boolean-topology'].includes(operation);
  const repeatAware = targetIds.some(id => graph.nodes.has(`generator:${id}`));
  if (structural && !repeatAware) return {
    status: 'FULL_REGENERATION_REQUIRED', reason: 'STRUCTURAL_OPERATION_NOT_LOCALLY_RECOMPUTABLE',
    targetIds, changeDomain: domain, affectedNodes: [], affectedObjectIds: [], recomputeSetHash: stableHash([])
  };

  const edgeFilter = edge => edgeSupportsChangeDomain(edge, domain);
  const affectedNodes = graph.downstream(starts, { edgeFilter });
  const directAffectedNodes = immediateAffected(graph, starts, edgeFilter);
  const affectedObjectIds = objectIdsForNodes(graph, affectedNodes);
  const directAffectedObjectIds = objectIdsForNodes(graph, directAffectedNodes);
  const pathDetails = graph.pathsFrom(starts, { edgeFilter });
  const reasonTrace = affectedNodes.filter(node => pathDetails[node]).map(node => ({
    node,
    objectId: graph.nodes.get(node)?.objectId || null,
    changeDomain: domain,
    path: pathDetails[node].nodes,
    edges: pathDetails[node].edges
  }));
  const targetObjectIds = [...new Set(starts.map(id => graph.nodes.get(id)?.objectId).filter(Boolean))].sort();
  const excludedSiblingObjectIds = excludedSiblings(graph, targetObjectIds, affectedObjectIds);
  const detachedExcludedObjectIds = [...new Set([...graph.nodes.values()].filter(node => node.kind === 'geometry' && node.detached && !affectedObjectIds.includes(node.objectId)).map(node => node.objectId))].sort();
  const recomputeSet = affectedObjectIds;
  return {
    status: 'LOCAL_RECOMPUTE_READY', operation, changeDomain: domain, targetIds,
    startsByTarget, startNodes: starts, directAffectedNodes, directAffectedObjectIds,
    affectedNodes, affectedObjectIds, recomputeSet, recomputeSetHash: stableHash(recomputeSet),
    dependencyPaths: Object.fromEntries(reasonTrace.map(item => [item.node, item.path])),
    reasonTrace,
    excludedSiblingObjectIds,
    detachedExcludedObjectIds,
    exportAffected: affectedNodes.includes('export:document')
  };
}
