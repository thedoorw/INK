import { stableHash } from '../core/stable-id.js';
import { walkSemanticObjects } from '../semantic/semantic-model.js';
import { affectedScope } from './affected-scope.js';
import { buildDependencyGraph, DependencyGraph } from './dependency-graph.js';
import { normalizeChangeDomain } from './change-domain.js';

const clone = value => value === undefined ? undefined : structuredClone(value);
const geometryTreeProjection = object => object ? ({
  id: object.id,
  type: object.type,
  subpaths: clone(object.subpaths),
  matrix: clone(object.matrix),
  children: object.children?.map(geometryTreeProjection)
}) : null;
const geometryProjection = object => ({
  id: object.id,
  type: object.type,
  subpaths: clone(object.subpaths),
  children: object.children?.map(child => child.id),
  source: geometryTreeProjection(object.source),
  mode: object.mode,
  count: object.count,
  center: clone(object.center),
  sweep: object.sweep,
  startAngle: object.startAngle,
  axis: clone(object.axis),
  dx: object.dx,
  dy: object.dy,
  columns: object.columns,
  rows: object.rows,
  instances: clone(object.instances)
});
const transformProjection = object => ({ matrix: clone(object.matrix), parentId: object.parentId || null });
const styleProjection = object => ({
  fill: object.fill,
  stroke: object.stroke,
  strokeWidth: object.strokeWidth,
  opacity: object.opacity,
  gradient: clone(object.gradient),
  blendMode: object.blendMode,
  mask: clone(object.mask),
  clipPath: clone(object.clipPath),
  dash: clone(object.dash),
  lineCap: object.lineCap,
  lineJoin: object.lineJoin
});
const materialProjection = object => {
  const vectorBrushInstance = clone(object.vectorBrushInstance);
  if (vectorBrushInstance) delete vectorBrushInstance.editablePath;
  return {
    materialInstance: clone(object.materialInstance),
    vectorBrushInstance,
    watercolorComposite: clone(object.watercolorComposite),
    brushId: object.metadata?.brushId || null,
    brushVersion: object.metadata?.brushVersion || null,
    seed: object.metadata?.seed ?? null
  };
};
const semanticProjection = object => ({
  semantic: clone(object.semantic),
  semanticRole: object.metadata?.semanticRole || object.metadata?.semanticLabel || null,
  frontBack: object.metadata?.frontBack || null,
  petalFamily: object.metadata?.petalFamily || null,
  depthLayer: object.metadata?.depthLayer || null
});

function hashes(document) {
  return Object.fromEntries(walkSemanticObjects(document).map(({ object }) => {
    const geometry = geometryProjection(object), transform = transformProjection(object), style = styleProjection(object), material = materialProjection(object), semantic = semanticProjection(object);
    const full = { geometry, transform, style, material, semantic, repeatInstance: clone(object.repeatInstance), metadata: clone(object.metadata) };
    return [object.id, {
      full: stableHash(full),
      geometry: stableHash(geometry),
      transform: stableHash(transform),
      style: stableHash(style),
      material: stableHash(material),
      semantic: stableHash(semantic)
    }];
  }));
}

function normalizedChanges(plan, targetIds, operations) {
  if (Array.isArray(plan.changes) && plan.changes.length) return plan.changes.map((change, index) => ({
    targetId: change.targetId || change.id,
    operation: change.operation || operations[index] || operations[0] || 'style',
    changeDomain: normalizeChangeDomain(change.changeDomain, change.operation || operations[index] || operations[0])
  })).filter(change => change.targetId);
  const operation = operations[0] || 'style';
  const domain = normalizeChangeDomain(plan.changeDomain, operation);
  return targetIds.map(targetId => ({ targetId, operation, changeDomain: domain }));
}

function combineScopes(scopes, changes) {
  const failed = scopes.find(scope => scope.status !== 'LOCAL_RECOMPUTE_READY');
  if (failed) return { ...failed, changes, scopes };
  const union = key => [...new Set(scopes.flatMap(scope => scope[key] || []))].sort();
  const reasonTrace = scopes.flatMap((scope, index) => (scope.reasonTrace || []).map(trace => ({ ...trace, changeId: `${changes[index].targetId}:${changes[index].changeDomain}` })));
  const affectedObjectIds = union('affectedObjectIds');
  return {
    status: 'LOCAL_RECOMPUTE_READY',
    operation: [...new Set(changes.map(change => change.operation))].sort().join('+'),
    changeDomains: [...new Set(changes.map(change => change.changeDomain))].sort(),
    changes,
    targetIds: [...new Set(changes.map(change => change.targetId))].sort(),
    startNodes: union('startNodes'),
    directAffectedNodes: union('directAffectedNodes'),
    directAffectedObjectIds: union('directAffectedObjectIds'),
    affectedNodes: union('affectedNodes'),
    affectedObjectIds,
    recomputeSet: affectedObjectIds,
    recomputeSetHash: stableHash(affectedObjectIds),
    excludedSiblingObjectIds: union('excludedSiblingObjectIds'),
    detachedExcludedObjectIds: union('detachedExcludedObjectIds'),
    reasonTrace,
    dependencyPaths: Object.fromEntries(reasonTrace.map(item => [item.node, item.path])),
    exportAffected: scopes.some(scope => scope.exportAffected),
    scopes
  };
}


function mergedDependencyGraph(before, after) {
  const beforeGraph = buildDependencyGraph(before), afterGraph = buildDependencyGraph(after);
  const graph = new DependencyGraph();
  for (const source of [beforeGraph, afterGraph]) {
    for (const node of source.nodes.values()) graph.node(node.id, clone(node));
  }
  for (const source of [beforeGraph, afterGraph]) {
    for (const edge of source.edges) graph.edge(edge.from, edge.to, edge.type, clone(edge.metadata || {}));
  }
  const missing = [...beforeGraph.missingDependencies, ...afterGraph.missingDependencies];
  graph.missingDependencies = [...new Map(missing.map(item => [stableHash(item), item])).values()];
  graph.cycles = graph.detectCycles();
  graph.sourceGraphs = { before: beforeGraph.toJSON(), after: afterGraph.toJSON() };
  return graph;
}

function changedIds(beforeHashes, afterHashes, key) {
  const allIds = [...new Set([...Object.keys(beforeHashes), ...Object.keys(afterHashes)])].sort();
  return allIds.filter(id => beforeHashes[id]?.[key] !== afterHashes[id]?.[key]);
}

export function analyzeLocalRecompute(before, after, plan = {}) {
  const graph = mergedDependencyGraph(before, after);
  const targetIds = [...new Set(plan.targets || plan.targetResolution || [])];
  const operations = plan.parsedIntent?.operations?.map(item => item.operation) || [];
  const changes = normalizedChanges(plan, targetIds, operations);
  const scopes = changes.map(change => affectedScope(graph, {
    targetIds: [change.targetId],
    operation: change.operation,
    changeDomain: change.changeDomain,
    allowFallback: Boolean(plan.allowFallback)
  }));
  const scope = combineScopes(scopes, changes);
  if (scope.status !== 'LOCAL_RECOMPUTE_READY') return { ...scope, dependencyGraph: graph.toJSON(), missingDependencies: graph.missingDependencies };

  const beforeHashes = hashes(before), afterHashes = hashes(after);
  const changedObjectIds = changedIds(beforeHashes, afterHashes, 'full');
  const changedGeometryIds = changedIds(beforeHashes, afterHashes, 'geometry');
  const changedTransformIds = changedIds(beforeHashes, afterHashes, 'transform');
  const changedStyleIds = changedIds(beforeHashes, afterHashes, 'style');
  const changedMaterialIds = changedIds(beforeHashes, afterHashes, 'material');
  const changedSemanticIds = changedIds(beforeHashes, afterHashes, 'semantic');
  const allowed = new Set(scope.affectedObjectIds);
  const overRecomputed = changedObjectIds.filter(id => !allowed.has(id));
  const requiredAffected = [...new Set(plan.requiredAffectedObjectIds || [])].sort();
  const requiredChanged = [...new Set(plan.requiredChangedObjectIds || [])].sort();
  const underRecomputed = requiredAffected.filter(id => !allowed.has(id));
  const unchangedRequired = requiredChanged.filter(id => !changedObjectIds.includes(id));
  const allBeforeIds = Object.keys(beforeHashes).sort();
  const unaffectedIds = allBeforeIds.filter(id => !allowed.has(id));
  const unaffectedChangedObjectIds = unaffectedIds.filter(id => beforeHashes[id]?.full !== afterHashes[id]?.full);
  const preservedObjectIds = allBeforeIds.filter(id => afterHashes[id]?.full === beforeHashes[id].full);
  const preservedHashes = Object.fromEntries(preservedObjectIds.map(id => [id, beforeHashes[id].full]));
  const preservedGeometryHashes = Object.fromEntries(preservedObjectIds.map(id => [id, beforeHashes[id].geometry]));
  const preservedStyleHashes = Object.fromEntries(preservedObjectIds.map(id => [id, beforeHashes[id].style]));
  const preservedMaterialHashes = Object.fromEntries(preservedObjectIds.map(id => [id, beforeHashes[id].material]));
  const preservedTransformHashes = Object.fromEntries(preservedObjectIds.map(id => [id, beforeHashes[id].transform]));
  const rejected = overRecomputed.length || underRecomputed.length || unchangedRequired.length || unaffectedChangedObjectIds.length;
  return {
    format: 'INK-LOCAL-RECOMPUTE-REPORT',
    version: '1.2',
    status: rejected ? 'REJECTED' : 'LOCAL_RECOMPUTE_COMPLETED',
    recomputeScope: scope,
    recomputeReasons: scope.reasonTrace,
    changedObjectIds,
    changedGeometryIds,
    changedTransformIds,
    changedStyleIds,
    changedMaterialIds,
    changedSemanticIds,
    preservedObjectIds,
    preservedHashes,
    preservedGeometryHashes,
    preservedStyleHashes,
    preservedMaterialHashes,
    preservedTransformHashes,
    beforeHashes,
    afterHashes,
    overRecomputed,
    overRecomputeDetected: overRecomputed.length > 0,
    underRecomputed,
    underRecomputeDetected: underRecomputed.length > 0,
    unchangedRequiredObjectIds: unchangedRequired,
    unaffectedChangedObjectIds,
    unaffectedPreservationPassed: unaffectedChangedObjectIds.length === 0,
    missingDependencies: [],
    cycles: [],
    dependencyGraph: graph.toJSON()
  };
}

export async function localRecompute(document, request, apply) {
  const before = structuredClone(document), graph = buildDependencyGraph(before);
  const changes = Array.isArray(request.changes) && request.changes.length ? request.changes : (request.targetIds || []).map(targetId => ({ targetId, operation: request.operation, changeDomain: request.changeDomain }));
  const scopes = changes.map(change => affectedScope(graph, { targetIds: [change.targetId], operation: change.operation || request.operation, changeDomain: change.changeDomain || request.changeDomain, allowFallback: request.allowFallback }));
  const scope = combineScopes(scopes, changes.map(change => ({ ...change, changeDomain: normalizeChangeDomain(change.changeDomain || request.changeDomain, change.operation || request.operation) })));
  if (scope.status !== 'LOCAL_RECOMPUTE_READY') return { document: before, report: { ...scope, dependencyGraph: graph.toJSON() } };
  const after = await apply(structuredClone(before), scope);
  const report = analyzeLocalRecompute(before, after, {
    targets: request.targetIds,
    changes,
    changeDomain: request.changeDomain,
    parsedIntent: { operations: [{ operation: request.operation }] },
    requiredAffectedObjectIds: request.requiredAffectedObjectIds,
    requiredChangedObjectIds: request.requiredChangedObjectIds
  });
  return report.status === 'LOCAL_RECOMPUTE_COMPLETED' ? { document: after, report } : { document: before, report: { ...report, automaticRollback: true } };
}
