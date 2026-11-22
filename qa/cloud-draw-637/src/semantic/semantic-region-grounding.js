import { stableCompositeId, stableHash } from '../core/stable-id.js';
import { walkPageObjects } from '../document/hierarchy.js';
import { intersectPathSegments } from '../vector/geometry-kernel.js';
import { booleanPaths, pathMetrics, pathToMultiPolygon, pointInRing } from '../vector/vector-core.js';

export const SEMANTIC_REGION_SCHEMA = 'INK-SEMANTIC-REGION-GRAPH';
export const SEMANTIC_REGION_VERSION = 1;
export const SEMANTIC_REGION_RELATIONS = Object.freeze([
  'contains', 'inside', 'intersects', 'overlaps', 'adjacent', 'crossing', 'gap', 'bridge'
]);

const DEFAULT_LIMITS = Object.freeze({ maxRegions: 128, maxPairs: 8192, maxEvidence: 512 });
const HARD_LIMITS = Object.freeze({ maxRegions: 512, maxPairs: 131072, maxEvidence: 4096 });
const SOURCE_EVIDENCE_RELATIONS = new Set(['adjacent', 'crossing', 'gap', 'bridge']);
const SYMMETRIC_RELATIONS = new Set(['intersects', 'overlaps', 'adjacent', 'crossing', 'gap']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => value == null || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const round = (value, digits = 9) => Number(Number(value).toFixed(digits));

export class SemanticRegionGroundingError extends Error {
  constructor(code, details = {}) {
    super(`INK_SEMANTIC_REGION_${code}`);
    this.name = 'SemanticRegionGroundingError';
    this.code = `SEMANTIC_REGION_${code}`;
    Object.assign(this, details);
  }
}

function fail(code, details = {}) {
  throw new SemanticRegionGroundingError(code, details);
}

function text(value, field, { required = false, max = 220 } = {}) {
  if (value == null || value === '') {
    if (required) fail('FIELD_REQUIRED', { field });
    return null;
  }
  if (typeof value !== 'string') fail('FIELD_INVALID', { field });
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max) fail('FIELD_INVALID', { field });
  return normalized || null;
}

function normalizeLimit(value, fallback, hardMax, field) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > hardMax) fail('LIMIT_INVALID', { field, value });
  return number;
}

function limitsFrom(raw = {}) {
  if (!record(raw)) fail('LIMITS_INVALID');
  return {
    maxRegions: normalizeLimit(raw.maxRegions, DEFAULT_LIMITS.maxRegions, HARD_LIMITS.maxRegions, 'maxRegions'),
    maxPairs: normalizeLimit(raw.maxPairs, DEFAULT_LIMITS.maxPairs, HARD_LIMITS.maxPairs, 'maxPairs'),
    maxEvidence: normalizeLimit(raw.maxEvidence, DEFAULT_LIMITS.maxEvidence, HARD_LIMITS.maxEvidence, 'maxEvidence')
  };
}

function validateDocument(document) {
  if (!record(document) || document.format !== 'INK') fail('DOCUMENT_INVALID');
  if (Number(document.formatVersion) !== 4) fail('FORMAT_VERSION_UNSUPPORTED', { actual: document.formatVersion ?? null, expected: 4 });
  text(document.id, 'document.id', { required: true });
  if (!Array.isArray(document.pages) || !document.pages.length) fail('DOCUMENT_PAGES_INVALID');
  const page = document.pages.find(item => item?.id === document.activePageId);
  if (!page) fail('ACTIVE_PAGE_MISSING', { activePageId: document.activePageId ?? null });
  if (!Array.isArray(page.layers)) fail('PAGE_LAYERS_INVALID', { pageId: page.id ?? null });
  return page;
}

function validatePath(path, objectId) {
  if (!record(path) || path.type !== 'path' || !Array.isArray(path.subpaths)) fail('PATH_INVALID', { objectId });
  if (!path.subpaths.length) fail('PATH_EMPTY', { objectId });
  for (const [subpathIndex, subpath] of path.subpaths.entries()) {
    if (!record(subpath) || !Array.isArray(subpath.anchors) || subpath.closed === false) {
      fail('REGION_REQUIRES_CLOSED_SUBPATH', { objectId, subpathIndex });
    }
    if (subpath.anchors.length < 3) fail('REGION_DEGENERATE_SUBPATH', { objectId, subpathIndex });
    for (const [anchorIndex, anchor] of subpath.anchors.entries()) {
      if (!record(anchor) || finite(anchor.x) == null || finite(anchor.y) == null) fail('ANCHOR_INVALID', { objectId, subpathIndex, anchorIndex });
      for (const side of ['in', 'out']) {
        if (anchor[side] != null && (!record(anchor[side]) || finite(anchor[side].x) == null || finite(anchor[side].y) == null)) {
          fail('HANDLE_INVALID', { objectId, subpathIndex, anchorIndex, side });
        }
      }
    }
  }
}

function geometryPath(found, subpath, regionId) {
  return {
    id: `geometry:${regionId}`,
    type: 'path',
    name: found.object?.name || regionId,
    matrix: [...found.worldMatrix],
    fill: found.object?.fill ?? '#000000',
    stroke: found.object?.stroke ?? 'none',
    strokeWidth: finite(found.object?.strokeWidth) ?? 0,
    fillRule: found.object?.fillRule || 'evenodd',
    opacity: finite(found.object?.opacity) ?? 1,
    subpaths: [clone(subpath)]
  };
}

function ringFor(regionPath, regionId) {
  const polygons = pathToMultiPolygon(regionPath, 0.5);
  const ring = polygons?.[0]?.[0];
  if (!Array.isArray(ring) || ring.length < 4) fail('REGION_RING_INVALID', { regionId });
  return ring.slice(0, -1).map(([x, y]) => ({ x: Number(x), y: Number(y) }));
}

function sourceProvenance(object) {
  const metadata = record(object?.metadata) ? object.metadata : {};
  if (record(metadata.extraction)) {
    return {
      kind: 'extraction',
      schema: text(metadata.extraction.schema, 'metadata.extraction.schema'),
      batchId: text(metadata.extraction.batchId, 'metadata.extraction.batchId'),
      referenceObjectId: text(metadata.extraction.referenceObjectId, 'metadata.extraction.referenceObjectId'),
      sourceName: text(metadata.extraction.source?.name ?? metadata.extraction.sourceName, 'metadata.extraction.sourceName')
    };
  }
  if (record(metadata.source)) {
    return {
      kind: 'source',
      id: text(metadata.source.id, 'metadata.source.id'),
      name: text(metadata.source.name, 'metadata.source.name'),
      type: text(metadata.source.type, 'metadata.source.type')
    };
  }
  return null;
}

function semanticSummary(object) {
  const semantic = record(object?.semantic) ? object.semantic : {};
  const metadata = record(object?.metadata) ? object.metadata : {};
  return {
    role: text(semantic.role ?? metadata.semanticLabel ?? metadata.role, `object.${object.id}.semantic.role`, { max: 120 }),
    confidence: finite(semantic.confidence ?? metadata.semanticConfidence),
    sourceRecipeId: text(semantic.sourceRecipeId ?? metadata.sourceRecipeId, `object.${object.id}.semantic.sourceRecipeId`),
    sourceStepId: text(semantic.sourceStepId ?? metadata.sourceStepId, `object.${object.id}.semantic.sourceStepId`)
  };
}

function regionRole(sourceRole) {
  const normalized = String(sourceRole || 'outer').toLowerCase();
  if (normalized === 'outer' || normalized === 'hole' || normalized === 'island') return normalized;
  return 'unresolved';
}

function buildRegionEntries(document, page, options, limits) {
  const wanted = options.objectIds == null ? null : new Set(options.objectIds.map((id, index) => text(id, `objectIds[${index}]`, { required: true })));
  const objectIds = new Set();
  const regions = [];
  for (const found of walkPageObjects(page)) {
    const object = found.object;
    if (!record(object)) continue;
    if (objectIds.has(object.id)) fail('DUPLICATE_OBJECT_ID', { objectId: object.id });
    objectIds.add(object.id);
    if (object.type !== 'path' || (wanted && !wanted.has(object.id))) continue;
    validatePath(object, object.id);
    const semantic = semanticSummary(object);
    for (const [subpathIndex, subpath] of object.subpaths.entries()) {
      const subpathId = text(subpath.id, `object.${object.id}.subpaths[${subpathIndex}].id`) || `subpath-${subpathIndex}`;
      const regionId = stableCompositeId('semantic-region', [object.id, subpathId]);
      const path = geometryPath(found, subpath, regionId);
      const metrics = pathMetrics(path);
      if (!(metrics.area > 1e-9)) fail('REGION_ZERO_AREA', { objectId: object.id, subpathIndex });
      const ring = ringFor(path, regionId);
      const sourceRole = String(subpath.role || 'outer').toLowerCase();
      const role = regionRole(sourceRole);
      const base = {
        regionId,
        ref: { pageId: page.id, layerId: found.layer.id, objectId: object.id, subpathId, subpathIndex },
        sourceRole,
        role,
        status: role === 'unresolved' ? 'UNRESOLVED' : 'RESOLVED',
        unresolvedReasons: role === 'unresolved' ? ['SUBPATH_ROLE_UNSUPPORTED'] : [],
        geometry: {
          bounds: {
            x: round(metrics.bounds.x), y: round(metrics.bounds.y),
            w: round(metrics.bounds.w), h: round(metrics.bounds.h)
          },
          area: round(metrics.area),
          centroid: { x: round(metrics.centroid.x), y: round(metrics.centroid.y) },
          boundaryFingerprint: stableHash({ objectId: object.id, subpathId, subpathIndex, matrix: found.worldMatrix, subpath })
        },
        semantic,
        confidence: role === 'unresolved' ? null : (semantic.confidence ?? 1),
        provenance: sourceProvenance(object)
      };
      regions.push({ descriptor: { ...base, fingerprint: stableHash(base) }, path, ring });
    }
  }
  if (wanted) {
    const foundIds = new Set(regions.map(item => item.descriptor.ref.objectId));
    const missing = [...wanted].filter(id => !foundIds.has(id)).sort();
    if (missing.length) fail('PATH_TARGET_MISSING', { objectIds: missing });
  }
  if (regions.length > limits.maxRegions) fail('REGION_LIMIT_EXCEEDED', { actual: regions.length, maxRegions: limits.maxRegions });
  const regionIds = new Set();
  for (const item of regions) {
    if (regionIds.has(item.descriptor.regionId)) fail('DUPLICATE_REGION_ID', { regionId: item.descriptor.regionId });
    regionIds.add(item.descriptor.regionId);
  }
  return regions.sort((a, b) => a.descriptor.regionId.localeCompare(b.descriptor.regionId));
}

function classifyIslands(regions) {
  const holesByObject = new Map();
  for (const item of regions) {
    if (item.descriptor.role !== 'hole') continue;
    const objectId = item.descriptor.ref.objectId;
    if (!holesByObject.has(objectId)) holesByObject.set(objectId, []);
    holesByObject.get(objectId).push(item);
  }
  return regions.map(item => {
    if (item.descriptor.role !== 'outer') return item;
    const holes = holesByObject.get(item.descriptor.ref.objectId) || [];
    const probe = item.ring[0];
    const containingHole = holes.find(hole => pointInRing(probe, hole.ring));
    if (!containingHole) return item;
    const descriptor = {
      ...item.descriptor,
      role: 'island',
      derivedRoleEvidence: { type: 'inside-hole', holeRegionId: containingHole.descriptor.regionId },
      confidence: 1
    };
    const { fingerprint: _fingerprint, ...withoutFingerprint } = descriptor;
    descriptor.fingerprint = stableHash(withoutFingerprint);
    return { ...item, descriptor };
  });
}

function boundsMayTouch(a, b) {
  const ab = a.geometry.bounds, bb = b.geometry.bounds;
  return ab.x <= bb.x + bb.w && ab.x + ab.w >= bb.x && ab.y <= bb.y + bb.h && ab.y + ab.h >= bb.y;
}

function segmentCount(path) {
  const subpath = path.subpaths[0];
  return subpath.closed ? subpath.anchors.length : Math.max(0, subpath.anchors.length - 1);
}

function boundaryIntersections(a, b) {
  const points = new Map();
  for (let ia = 0; ia < segmentCount(a.path); ia += 1) {
    for (let ib = 0; ib < segmentCount(b.path); ib += 1) {
      const result = intersectPathSegments(a.path, { subpathIndex: 0, segmentIndex: ia }, b.path, { subpathIndex: 0, segmentIndex: ib });
      for (const point of result.intersections || []) {
        const key = `${round(point.x, 6)}:${round(point.y, 6)}`;
        points.set(key, { x: round(point.x), y: round(point.y) });
      }
    }
  }
  return [...points.values()].sort((p, q) => p.x - q.x || p.y - q.y);
}

function intersectionArea(a, b) {
  const intersection = booleanPaths([a.path, b.path], 'intersection', { tolerance: 0.5, fitTolerance: 0.75, maxAnchors: 128 });
  if (!intersection?.subpaths?.length) return 0;
  return pathMetrics(intersection).area;
}

function edgeKey(edge) {
  return `${edge.from}\u0000${edge.type}\u0000${edge.to}`;
}

function normalizeEvidenceList(evidence) {
  return [...evidence].sort((a, b) => stableHash(a).localeCompare(stableHash(b)));
}

function addEdge(map, edge) {
  const normalized = {
    from: edge.from,
    type: edge.type,
    to: edge.to,
    status: 'RESOLVED',
    confidence: finite(edge.confidence),
    evidence: normalizeEvidenceList(edge.evidence || [])
  };
  const key = edgeKey(normalized);
  const prior = map.get(key);
  if (!prior) {
    map.set(key, normalized);
    return;
  }
  const evidence = normalizeEvidenceList([...prior.evidence, ...normalized.evidence]);
  const confidences = [prior.confidence, normalized.confidence].filter(value => value != null);
  map.set(key, { ...prior, confidence: confidences.length ? Math.max(...confidences) : null, evidence: [...new Map(evidence.map(item => [stableHash(item), item])).values()] });
}

function geometryRelationships(regions, limits, options) {
  const edges = new Map();
  const unresolved = [];
  const pairs = regions.length * (regions.length - 1) / 2;
  if (pairs > limits.maxPairs) fail('PAIR_LIMIT_EXCEEDED', { actual: pairs, maxPairs: limits.maxPairs });
  const areaEpsilon = finite(options.areaEpsilon) ?? 1e-6;
  if (!(areaEpsilon >= 0)) fail('AREA_EPSILON_INVALID');

  for (let i = 0; i < regions.length; i += 1) {
    for (let j = i + 1; j < regions.length; j += 1) {
      const a = regions[i], b = regions[j];
      if (!boundsMayTouch(a.descriptor, b.descriptor)) continue;
      try {
        const intersections = boundaryIntersections(a, b);
        const overlapArea = intersectionArea(a, b);
        const areaA = a.descriptor.geometry.area, areaB = b.descriptor.geometry.area;
        const minimumArea = Math.min(areaA, areaB);
        const tolerance = Math.max(areaEpsilon, minimumArea * 1e-6);
        const containsMinimum = overlapArea >= minimumArea - tolerance;
        if (intersections.length || overlapArea > areaEpsilon) {
          const evidence = intersections.length
            ? [{ kind: 'geometry-kernel', operation: 'segment-intersection', pointCount: intersections.length, points: intersections.slice(0, 32), truncated: intersections.length > 32 }]
            : [{ kind: 'vector-boolean', operation: 'intersection', area: round(overlapArea) }];
          addEdge(edges, { from: a.descriptor.regionId, type: 'intersects', to: b.descriptor.regionId, confidence: 1, evidence });
          addEdge(edges, { from: b.descriptor.regionId, type: 'intersects', to: a.descriptor.regionId, confidence: 1, evidence });
        }
        if (overlapArea > areaEpsilon) {
          const evidence = [{ kind: 'vector-boolean', operation: 'intersection', area: round(overlapArea) }];
          if (containsMinimum && Math.abs(areaA - areaB) > tolerance) {
            const outer = areaA > areaB ? a : b;
            const inner = areaA > areaB ? b : a;
            addEdge(edges, { from: outer.descriptor.regionId, type: 'contains', to: inner.descriptor.regionId, confidence: 1, evidence });
            addEdge(edges, { from: inner.descriptor.regionId, type: 'inside', to: outer.descriptor.regionId, confidence: 1, evidence });
          } else {
            addEdge(edges, { from: a.descriptor.regionId, type: 'overlaps', to: b.descriptor.regionId, confidence: 1, evidence });
            addEdge(edges, { from: b.descriptor.regionId, type: 'overlaps', to: a.descriptor.regionId, confidence: 1, evidence });
          }
        }
      } catch (error) {
        unresolved.push({
          from: a.descriptor.regionId,
          to: b.descriptor.regionId,
          relation: 'geometry',
          status: 'UNRESOLVED',
          reason: 'GEOMETRY_RELATION_UNRESOLVED',
          diagnostic: String(error?.code || error?.message || 'unknown')
        });
      }
    }
  }
  return { edges, unresolved };
}

function normalizeRelation(value) {
  const relation = String(value || '').trim();
  const aliases = { adjacency: 'adjacent', crosses: 'crossing', intersect: 'intersects', overlap: 'overlaps' };
  return aliases[relation] || relation;
}

function objectRegionMap(regions) {
  const map = new Map();
  for (const item of regions) {
    const objectId = item.descriptor.ref.objectId;
    if (!map.has(objectId)) map.set(objectId, []);
    map.get(objectId).push(item.descriptor.regionId);
  }
  for (const value of map.values()) value.sort();
  return map;
}

function evidenceInputs(document, options, limits) {
  const items = [];
  const graph = document.semanticModel?.relationshipGraph;
  if (record(graph) && Array.isArray(graph.edges)) {
    for (const [index, edge] of graph.edges.entries()) {
      if (!record(edge)) continue;
      const relation = normalizeRelation(edge.type);
      if (!SEMANTIC_REGION_RELATIONS.includes(relation)) continue;
      const source = 'semanticModel.relationshipGraph';
      items.push({ ...clone(edge), relation, source, sourceKey: stableHash({ source, edge }) });
    }
  }
  if (options.relationshipEvidence != null) {
    if (!Array.isArray(options.relationshipEvidence)) fail('RELATIONSHIP_EVIDENCE_INVALID');
    for (const [index, edge] of options.relationshipEvidence.entries()) {
      if (!record(edge)) fail('RELATIONSHIP_EVIDENCE_INVALID', { index });
      const source = 'relationshipEvidence';
      const relation = normalizeRelation(edge.relation ?? edge.type);
      items.push({ ...clone(edge), relation, source, sourceKey: stableHash({ source, relation, edge }) });
    }
  }
  if (items.length > limits.maxEvidence) fail('EVIDENCE_LIMIT_EXCEEDED', { actual: items.length, maxEvidence: limits.maxEvidence });
  return items;
}

function resolveEvidenceEndpoint(item, side, regionIds, byObject) {
  const regionId = text(item[`${side}RegionId`], `${side}RegionId`);
  if (regionId) return regionIds.has(regionId) ? { regionId } : { unresolved: 'REGION_NOT_FOUND', candidates: [] };
  const objectId = text(item[`${side}ObjectId`] ?? item[side], `${side}ObjectId`);
  if (!objectId) return { unresolved: 'ENDPOINT_MISSING', candidates: [] };
  const candidates = byObject.get(objectId) || [];
  if (candidates.length === 1) return { regionId: candidates[0] };
  return { unresolved: candidates.length ? 'OBJECT_REGION_AMBIGUOUS' : 'OBJECT_REGION_NOT_FOUND', candidates };
}

function sourceRelationships(document, regions, options, limits, edges, unresolved) {
  const regionIds = new Set(regions.map(item => item.descriptor.regionId));
  const byObject = objectRegionMap(regions);
  for (const item of evidenceInputs(document, options, limits)) {
    const relation = normalizeRelation(item.relation);
    if (!SEMANTIC_REGION_RELATIONS.includes(relation)) {
      unresolved.push({ relation, status: 'UNRESOLVED', reason: 'RELATION_UNSUPPORTED', source: item.source, sourceKey: item.sourceKey });
      continue;
    }
    const from = resolveEvidenceEndpoint(item, 'from', regionIds, byObject);
    const to = resolveEvidenceEndpoint(item, 'to', regionIds, byObject);
    const explicitlyUnresolved = String(item.status || '').toUpperCase() === 'UNRESOLVED';
    if (explicitlyUnresolved || from.unresolved || to.unresolved) {
      unresolved.push({
        relation,
        status: 'UNRESOLVED',
        reason: item.reason || from.unresolved || to.unresolved || 'SOURCE_MARKED_UNRESOLVED',
        fromRegionId: from.regionId || null,
        toRegionId: to.regionId || null,
        fromCandidates: from.candidates || [],
        toCandidates: to.candidates || [],
        source: item.source,
        sourceKey: item.sourceKey
      });
      continue;
    }
    if (SOURCE_EVIDENCE_RELATIONS.has(relation) && item.supported === false) {
      unresolved.push({ fromRegionId: from.regionId, toRegionId: to.regionId, relation, status: 'UNRESOLVED', reason: 'SOURCE_EVIDENCE_NOT_SUPPORTED', source: item.source, sourceKey: item.sourceKey });
      continue;
    }
    const evidence = [{ kind: 'source-evidence', source: item.source, sourceKey: item.sourceKey, evidenceRef: item.evidenceRef ?? item.sourceRef ?? null }];
    addEdge(edges, { from: from.regionId, type: relation, to: to.regionId, confidence: finite(item.confidence), evidence });
    if (SYMMETRIC_RELATIONS.has(relation)) addEdge(edges, { from: to.regionId, type: relation, to: from.regionId, confidence: finite(item.confidence), evidence });
    if (relation === 'contains') addEdge(edges, { from: to.regionId, type: 'inside', to: from.regionId, confidence: finite(item.confidence), evidence });
    if (relation === 'inside') addEdge(edges, { from: to.regionId, type: 'contains', to: from.regionId, confidence: finite(item.confidence), evidence });
  }
}

function graphPayload(document, page, regions, edges, unresolved, limits) {
  const descriptors = regions.map(item => item.descriptor).sort((a, b) => a.regionId.localeCompare(b.regionId));
  const edgeList = [...edges.values()].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)));
  const unresolvedList = [...unresolved].sort((a, b) => stableHash(a).localeCompare(stableHash(b)));
  const base = {
    schema: SEMANTIC_REGION_SCHEMA,
    version: SEMANTIC_REGION_VERSION,
    document: { id: document.id, formatVersion: Number(document.formatVersion) },
    active: { pageId: page.id, activeLayerId: page.activeLayerId || null },
    regions: descriptors,
    relationships: { edges: edgeList, unresolved: unresolvedList },
    bounds: { maxRegions: limits.maxRegions, maxPairs: limits.maxPairs, maxEvidence: limits.maxEvidence, regionCount: descriptors.length, relationshipCount: edgeList.length, unresolvedCount: unresolvedList.length }
  };
  return { ...base, fingerprint: stableHash(base) };
}

export function groundSemanticRegions(document, options = {}) {
  if (!record(options)) fail('OPTIONS_INVALID');
  const page = validateDocument(document);
  const limits = limitsFrom(options.limits || {});
  const regions = classifyIslands(buildRegionEntries(document, page, options, limits));
  const geometry = geometryRelationships(regions, limits, options);
  sourceRelationships(document, regions, options, limits, geometry.edges, geometry.unresolved);
  return graphPayload(document, page, regions, geometry.edges, geometry.unresolved, limits);
}

export function semanticRegionBridgeContext(graph) {
  if (!record(graph) || graph.schema !== SEMANTIC_REGION_SCHEMA || graph.version !== SEMANTIC_REGION_VERSION) fail('GRAPH_INVALID');
  return {
    schema: 'INK-AI-DOCUMENT-BRIDGE-SEMANTIC-REGIONS',
    version: 1,
    documentId: graph.document?.id || null,
    pageId: graph.active?.pageId || null,
    semanticRegionFingerprint: graph.fingerprint,
    semanticRegions: (graph.regions || []).map(region => ({
      regionId: region.regionId,
      ref: clone(region.ref),
      role: region.role,
      bounds: clone(region.geometry?.bounds || null),
      area: finite(region.geometry?.area),
      centroid: clone(region.geometry?.centroid || null),
      semanticRole: region.semantic?.role || null,
      confidence: finite(region.confidence),
      status: region.status
    })),
    semanticRegionRelationships: {
      edges: clone(graph.relationships?.edges || []),
      unresolvedCount: graph.relationships?.unresolved?.length || 0
    }
  };
}

export function createSemanticRegionGroundingAdapter({ getDocument, getRelationshipEvidence = null } = {}) {
  if (typeof getDocument !== 'function') fail('ADAPTER_DOCUMENT_PROVIDER_REQUIRED');
  if (getRelationshipEvidence != null && typeof getRelationshipEvidence !== 'function') fail('ADAPTER_EVIDENCE_PROVIDER_INVALID');
  return Object.freeze({
    read(options = {}) {
      if (!record(options)) fail('OPTIONS_INVALID');
      const next = { ...options };
      if (next.relationshipEvidence == null && getRelationshipEvidence) next.relationshipEvidence = getRelationshipEvidence();
      return groundSemanticRegions(getDocument(), next);
    },
    readBridgeContext(options = {}) {
      return semanticRegionBridgeContext(this.read(options));
    }
  });
}
