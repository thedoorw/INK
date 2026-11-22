import { buildAIDocumentBridge } from './document-bridge.js';
import { groundSemanticRegions, semanticRegionBridgeContext } from '../semantic/semantic-region-grounding.js';
import { buildRevisionProvenanceGraph, provenanceBridgeContext } from '../provenance/provenance-graph.js';
import { compareVisualSubjects } from '../compare/visual-compare.js';
import { resolveParametricStructure } from '../structure/parametric-structure.js';
import { walkPageObjects } from '../document/hierarchy.js';
import { stableHash, stableStringify } from '../core/stable-id.js';
import { CREATIVE_MEMORY_ADVISORY_SCHEMA } from '../memory/creative-memory.js';
import { RESEARCH_CREATION_ADVISORY_SCHEMA } from '../research/research-creation-bridge.js';

export const CREATIVE_INTELLIGENCE_CONTEXT_SCHEMA = 'INK-GROUNDED-CREATIVE-INTELLIGENCE-CONTEXT';
export const CREATIVE_INTELLIGENCE_CONTEXT_VERSION = 1;
export const CREATIVE_INTELLIGENCE_FORMAT_VERSION = 4;

const DEFAULT_LIMITS = Object.freeze({ maxBytes: 192 * 1024, maxUnresolved: 256 });
const HARD_LIMITS = Object.freeze({ maxBytes: 1024 * 1024, maxUnresolved: 2048 });
const DEFAULT_DOCUMENT_BRIDGE_LIMITS = Object.freeze({ maxObjects: 64, maxRelationships: 128, maxBytes: 64 * 1024 });
const DEFAULT_SEMANTIC_LIMITS = Object.freeze({ maxRegions: 96, maxPairs: 4096, maxEvidence: 256 });
const DEFAULT_PROVENANCE_LIMITS = Object.freeze({ maxEvents: 128, maxEdges: 256, maxUnresolved: 128, maxConflicts: 64, maxBytes: 72 * 1024 });
const DEFAULT_PROVENANCE_BRIDGE_LIMITS = Object.freeze({ maxEvents: 64, maxEdges: 128 });
const DEFAULT_CREATIVE_MEMORY_INTEGRATION_OPTIONS = Object.freeze({ maxRecords: 16, maxBytes: 32 * 1024 });
const DEFAULT_RESEARCH_CREATION_INTEGRATION_OPTIONS = Object.freeze({
  maxEvidence: 16,
  maxPrinciples: 16,
  maxConstraints: 16,
  maxBytes: 48 * 1024
});

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

export class CreativeIntelligenceContextError extends Error {
  constructor(code, details = {}) {
    super(`INK_CREATIVE_INTELLIGENCE_CONTEXT_${code}`);
    this.name = 'CreativeIntelligenceContextError';
    this.code = `CREATIVE_INTELLIGENCE_CONTEXT_${code}`;
    Object.assign(this, details);
  }
}

function fail(code, details = {}) {
  throw new CreativeIntelligenceContextError(code, details);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value)) {
    const output = {};
    for (const key of Object.keys(value).sort()) output[key] = canonical(value[key]);
    return output;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') fail('NON_JSON_VALUE');
  return value === undefined ? null : value;
}

function byteLength(value) {
  const serialized = stableStringify(canonical(value));
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(serialized).byteLength;
  let bytes = 0;
  for (const character of serialized) {
    const code = character.codePointAt(0);
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function boundedInteger(value, fallback, hardMax, field) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > hardMax) fail('LIMIT_INVALID', { field, value });
  return number;
}

function normalizeLimits(raw = {}) {
  if (!record(raw)) fail('LIMITS_INVALID');
  return {
    maxBytes: boundedInteger(raw.maxBytes, DEFAULT_LIMITS.maxBytes, HARD_LIMITS.maxBytes, 'maxBytes'),
    maxUnresolved: boundedInteger(raw.maxUnresolved, DEFAULT_LIMITS.maxUnresolved, HARD_LIMITS.maxUnresolved, 'maxUnresolved')
  };
}

function validateDocument(document) {
  if (!record(document) || document.format !== 'INK') fail('DOCUMENT_INVALID');
  if (Number(document.formatVersion) !== CREATIVE_INTELLIGENCE_FORMAT_VERSION) {
    fail('FORMAT_VERSION_UNSUPPORTED', { actual: document.formatVersion ?? null, expected: CREATIVE_INTELLIGENCE_FORMAT_VERSION });
  }
  if (typeof document.id !== 'string' || !document.id.trim()) fail('DOCUMENT_ID_INVALID');
  if (!Array.isArray(document.pages) || !document.pages.length) fail('DOCUMENT_PAGES_INVALID');
  return document;
}

function normalizeStringList(values, field) {
  if (values == null) return null;
  if (!Array.isArray(values)) fail('LIST_INVALID', { field });
  const output = values.map((value, index) => {
    if (typeof value !== 'string' || !value.trim()) fail('LIST_ITEM_INVALID', { field, index });
    return value.trim();
  });
  return [...new Set(output)].sort((a, b) => a.localeCompare(b));
}

function documentObjectIds(document) {
  const ids = new Set();
  for (const page of document.pages || []) {
    for (const found of walkPageObjects(page)) {
      if (typeof found.object?.id === 'string') ids.add(found.object.id);
    }
  }
  return ids;
}

function normalizeProjection(document, allowedObjectIds) {
  if (allowedObjectIds == null) return null;
  return {
    allowed: new Set(normalizeStringList(allowedObjectIds, 'allowedObjectIds')),
    known: documentObjectIds(document)
  };
}

function endpointAllowed(id, projection) {
  return !projection || !projection.known.has(id) || projection.allowed.has(id);
}

function projectDocumentBridge(context, projection) {
  if (!projection) return clone(context);
  const objects = (context.objects || []).filter(item => projection.allowed.has(item.ref?.objectId));
  const relationships = (context.relationships?.edges || []).filter(edge =>
    endpointAllowed(edge.from, projection) && endpointAllowed(edge.to, projection));
  const output = clone(context);
  output.objects = objects;
  output.selection = {
    ...(output.selection || {}),
    objectIds: (output.selection?.objectIds || []).filter(id => projection.allowed.has(id)),
    unresolvedObjectIds: []
  };
  output.focus = {
    ...(output.focus || {}),
    objectIds: (output.focus?.objectIds || []).filter(id => projection.allowed.has(id))
  };
  output.relationships = { ...(output.relationships || {}), edges: relationships };
  if (output.bounds?.objects) {
    output.bounds.objects.returned = objects.length;
    output.bounds.objects.truncated = output.bounds.objects.truncated || objects.length < (context.objects?.length || 0);
  }
  if (output.bounds?.relationships) {
    output.bounds.relationships.returned = relationships.length;
    output.bounds.relationships.truncated = output.bounds.relationships.truncated || relationships.length < (context.relationships?.edges?.length || 0);
  }
  output.transmissionProjection = {
    policy: 'EXISTING_CHAT_DISCLOSURE_POLICY',
    applied: true,
    returnedObjectCount: objects.length
  };
  return output;
}

function projectSemanticContext(context, projection) {
  if (!projection) return clone(context);
  const regions = (context.semanticRegions || []).filter(region => projection.allowed.has(region.ref?.objectId));
  const regionIds = new Set(regions.map(region => region.regionId));
  const edges = (context.semanticRegionRelationships?.edges || []).filter(edge => regionIds.has(edge.from) && regionIds.has(edge.to));
  return {
    ...clone(context),
    semanticRegions: regions,
    semanticRegionRelationships: { ...(clone(context.semanticRegionRelationships) || {}), edges },
    transmissionProjection: {
      policy: 'EXISTING_CHAT_DISCLOSURE_POLICY',
      applied: true,
      returnedRegionCount: regions.length
    }
  };
}

function eventTouchesHiddenObject(event, projection) {
  if (!projection) return false;
  for (const entity of [event?.source, event?.target]) {
    if (entity?.type === 'object' && projection.known.has(entity.id) && !projection.allowed.has(entity.id)) return true;
  }
  return false;
}

function projectProvenanceContext(context, projection) {
  if (!projection) return clone(context);
  const events = (context.events || [])
    .filter(event => !eventTouchesHiddenObject(event, projection))
    .map(event => ({
      ...clone(event),
      objectIds: Array.isArray(event.objectIds)
        ? event.objectIds.filter(id => !projection.known.has(id) || projection.allowed.has(id))
        : event.objectIds
    }));
  const eventIds = new Set(events.map(event => event.eventId));
  for (const event of events) {
    if (Array.isArray(event.sourceEventIds)) event.sourceEventIds = event.sourceEventIds.filter(id => eventIds.has(id));
    if (Array.isArray(event.parentEventIds)) event.parentEventIds = event.parentEventIds.filter(id => eventIds.has(id));
  }
  const edges = (context.edges || []).filter(edge => eventIds.has(edge.from) && eventIds.has(edge.to));
  return {
    ...clone(context),
    events,
    edges,
    transmissionProjection: {
      policy: 'EXISTING_CHAT_DISCLOSURE_POLICY',
      applied: true,
      returnedEventCount: events.length
    }
  };
}

function scrubHiddenObjectRefs(value, projection) {
  if (!projection) return clone(value);
  if (Array.isArray(value)) return value.map(item => scrubHiddenObjectRefs(item, projection));
  if (!record(value)) return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'objectId' && typeof item === 'string' && projection.known.has(item) && !projection.allowed.has(item)) {
      output[key] = null;
      continue;
    }
    if (key === 'objectIds' && Array.isArray(item)) {
      output[key] = item.filter(id => !projection.known.has(id) || projection.allowed.has(id));
      continue;
    }
    output[key] = scrubHiddenObjectRefs(item, projection);
  }
  return output;
}

function moduleError(module, error) {
  return { module, code: typeof error?.code === 'string' ? error.code : 'MODULE_UNAVAILABLE' };
}

function moduleUnresolved(module, items) {
  if (!Array.isArray(items)) return [];
  return items.map(item => ({ module, ...(record(item) ? canonical(item) : { code: String(item) }) }));
}

function safeModule(module, operation, unresolved) {
  try {
    return { ok: true, value: operation() };
  } catch (error) {
    unresolved.push(moduleError(module, error));
    return { ok: false, value: null, error };
  }
}

function validateAdvisoryContext(raw, { module, schema } = {}) {
  if (!record(raw)) fail('ADVISORY_CONTEXT_INVALID', { module });
  if (raw.schema !== schema) fail('ADVISORY_CONTEXT_SCHEMA_UNSUPPORTED', { module, schema: raw.schema ?? null });
  if (Number(raw.formatVersion) !== CREATIVE_INTELLIGENCE_FORMAT_VERSION) {
    fail('ADVISORY_CONTEXT_FORMAT_VERSION_UNSUPPORTED', {
      module,
      actual: raw.formatVersion ?? null,
      expected: CREATIVE_INTELLIGENCE_FORMAT_VERSION
    });
  }
  if (typeof raw.contextFingerprint !== 'string' || !raw.contextFingerprint.trim()) {
    fail('ADVISORY_CONTEXT_FINGERPRINT_REQUIRED', { module });
  }
  const authority = raw.authority;
  if (!record(authority) ||
      authority.documentWrite !== false ||
      authority.historyWrite !== false ||
      authority.revisionWrite !== false ||
      authority.geometryWrite !== false ||
      authority.renderer !== false ||
      authority.execution !== false ||
      authority.networkRequired !== false) {
    fail('ADVISORY_CONTEXT_AUTHORITY_INVALID', { module });
  }
  if (module === 'research-creation' && authority.creativeMemoryAutoWrite !== false) {
    fail('ADVISORY_CONTEXT_AUTO_WRITE_INVALID', { module });
  }
  return clone(raw);
}

function advisoryModule(raw, config, projection, unresolved) {
  if (raw == null) return null;
  const result = safeModule(config.module, () => validateAdvisoryContext(raw, config), unresolved);
  if (!result.value) return null;
  const context = scrubHiddenObjectRefs(result.value, projection);
  unresolved.push(...moduleUnresolved(config.module, result.value.unresolvedEvidence || []));
  return {
    status: 'AVAILABLE',
    fingerprint: result.value.contextFingerprint,
    authority: clone(result.value.authority),
    context
  };
}

function providerIssue(module, error) {
  return { module, code: typeof error?.code === 'string' ? error.code : 'ADVISORY_PROVIDER_UNAVAILABLE' };
}

function finalize(payload, limits) {
  const unresolved = [...new Map((payload.unresolved || []).map(item => [stableHash(item), canonical(item)])).values()]
    .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  const truncated = unresolved.length > limits.maxUnresolved;
  const bounded = unresolved.slice(0, limits.maxUnresolved);
  if (truncated && bounded.length) {
    bounded[bounded.length - 1] = {
      module: 'integration',
      code: 'UNRESOLVED_EVIDENCE_TRUNCATED',
      totalAvailable: unresolved.length
    };
  }

  const base = canonical({
    ...payload,
    unresolved: bounded,
    contextFingerprint: null,
    bounds: {
      limits,
      unresolved: { totalAvailable: unresolved.length, returned: bounded.length, truncated },
      outputBytes: null
    }
  });
  const fingerprintPayload = canonical({
    ...base,
    contextFingerprint: null,
    bounds: { ...base.bounds, outputBytes: null }
  });
  base.contextFingerprint = stableHash(fingerprintPayload);
  base.bounds.outputBytes = 0;
  for (let pass = 0; pass < 4; pass += 1) {
    const measured = byteLength(base);
    if (measured === base.bounds.outputBytes) break;
    base.bounds.outputBytes = measured;
  }
  const measured = byteLength(base);
  if (measured > limits.maxBytes) fail('OUTPUT_BOUNDS_EXCEEDED', { actualBytes: measured, maxBytes: limits.maxBytes });
  return base;
}

export function buildCreativeIntelligenceContext(input = {}, options = {}) {
  if (!record(input) || !record(options)) fail('INPUT_INVALID');
  const document = validateDocument(input.document);
  const limits = normalizeLimits(options.limits || {});
  const projection = normalizeProjection(document, options.allowedObjectIds ?? input.allowedObjectIds);
  const unresolved = [];
  for (const issue of Array.isArray(input.advisoryProviderIssues) ? input.advisoryProviderIssues : []) {
    if (record(issue) && typeof issue.module === 'string' && typeof issue.code === 'string') unresolved.push(canonical(issue));
  }

  const documentBridgeOptions = {
    ...clone(options.documentBridge || {}),
    limits: { ...DEFAULT_DOCUMENT_BRIDGE_LIMITS, ...(clone(options.documentBridge?.limits) || {}) },
    ...(input.selectedObjectIds != null ? { selectedObjectIds: clone(input.selectedObjectIds) } : {}),
    ...(input.revisionId !== undefined ? { revisionId: input.revisionId } : {})
  };
  const documentBridge = buildAIDocumentBridge(document, documentBridgeOptions);
  const projectedDocumentBridge = projectDocumentBridge(documentBridge, projection);
  const hiddenSelectionCount = projection
    ? (documentBridge.selection?.objectIds || []).filter(id => !projection.allowed.has(id)).length
    : 0;
  const unresolvedSelectionCount = (documentBridge.selection?.unresolvedObjectIds || []).length + hiddenSelectionCount;
  if (unresolvedSelectionCount) {
    unresolved.push({
      module: 'document-bridge',
      code: 'SELECTION_UNRESOLVED_OR_NOT_TRANSMITTABLE',
      count: unresolvedSelectionCount
    });
  }

  const semanticResult = safeModule('semantic-regions', () =>
    groundSemanticRegions(document, {
      ...(clone(options.semanticRegions) || {}),
      limits: { ...DEFAULT_SEMANTIC_LIMITS, ...(clone(options.semanticRegions?.limits) || {}) },
      ...(input.relationshipEvidence != null ? { relationshipEvidence: clone(input.relationshipEvidence) } : {})
    }), unresolved);

  const semanticGraph = semanticResult.value;
  let semanticContext = null;
  if (semanticGraph) {
    semanticContext = projectSemanticContext(semanticRegionBridgeContext(semanticGraph), projection);
    if (semanticGraph.relationships?.unresolved?.length) {
      unresolved.push({
        module: 'semantic-regions',
        code: 'RELATIONSHIP_EVIDENCE_UNRESOLVED',
        count: semanticGraph.relationships.unresolved.length
      });
    }
  }

  const provenanceInput = {
    document,
    revisionRecords: clone(input.revisionRecords || []),
    revisionComparisons: clone(input.revisionComparisons || []),
    fileEnvelopes: clone(input.fileEnvelopes || []),
    historyEntries: clone(input.historyEntries || []),
    recipeEvidence: clone(input.recipeEvidence || []),
    chatEvidence: clone(input.chatEvidence || []),
    semanticRegionGraphs: semanticGraph
      ? [semanticGraph, ...(clone(input.semanticRegionGraphs || []))]
      : clone(input.semanticRegionGraphs || [])
  };
  const provenanceResult = safeModule('provenance', () =>
    buildRevisionProvenanceGraph(provenanceInput, {
      ...(clone(options.provenance) || {}),
      limits: { ...DEFAULT_PROVENANCE_LIMITS, ...(clone(options.provenance?.limits) || {}) }
    }), unresolved);

  const provenanceGraph = provenanceResult.value;
  let provenanceContext = null;
  if (provenanceGraph) {
    provenanceContext = projectProvenanceContext(
      provenanceBridgeContext(provenanceGraph, {
        ...DEFAULT_PROVENANCE_BRIDGE_LIMITS,
        ...(clone(options.provenanceBridge) || {})
      }),
      projection
    );
    if (provenanceGraph.unresolved?.length) unresolved.push({ module: 'provenance', code: 'LINEAGE_UNRESOLVED', count: provenanceGraph.unresolved.length });
    if (provenanceGraph.conflicts?.length) unresolved.push({ module: 'provenance', code: 'LINEAGE_CONFLICT', count: provenanceGraph.conflicts.length });
  }

  let comparison = null;
  if (input.comparison != null) {
    if (!record(input.comparison) || !input.comparison.subjectA || !input.comparison.subjectB) {
      unresolved.push({ module: 'visual-compare', code: 'EXPLICIT_COMPARISON_SUBJECTS_REQUIRED' });
    } else {
      const comparisonResult = safeModule('visual-compare', () =>
        compareVisualSubjects(
          clone(input.comparison.subjectA),
          clone(input.comparison.subjectB),
          { ...(clone(options.visualCompare) || {}), ...(clone(input.comparison.options) || {}) }
        ), unresolved);
      if (comparisonResult.value) {
        comparison = scrubHiddenObjectRefs(comparisonResult.value, projection);
        unresolved.push(...moduleUnresolved('visual-compare', comparisonResult.value.unresolved || []));
      }
    }
  }

  const creativeMemory = advisoryModule(input.creativeMemory, {
    module: 'creative-memory',
    schema: CREATIVE_MEMORY_ADVISORY_SCHEMA
  }, projection, unresolved);
  const researchCreation = advisoryModule(input.researchCreation, {
    module: 'research-creation',
    schema: RESEARCH_CREATION_ADVISORY_SCHEMA
  }, projection, unresolved);

  let parametricStructure = null;
  if (input.parametricDescriptor != null) {
    const structureResult = safeModule('parametric-structure', () =>
      resolveParametricStructure(clone(input.parametricDescriptor), clone(options.parametricStructure || {})), unresolved);
    if (structureResult.value) {
      parametricStructure = scrubHiddenObjectRefs(structureResult.value, projection);
      unresolved.push(...moduleUnresolved('parametric-structure', structureResult.value.unresolved || []));
    }
  }

  return finalize({
    schema: CREATIVE_INTELLIGENCE_CONTEXT_SCHEMA,
    version: CREATIVE_INTELLIGENCE_CONTEXT_VERSION,
    formatVersion: CREATIVE_INTELLIGENCE_FORMAT_VERSION,
    authority: {
      role: 'ADVISORY_READ_ONLY_CONTEXT',
      documentWrite: false,
      historyWrite: false,
      revisionWrite: false,
      geometryWrite: false,
      renderer: false,
      execution: false,
      networkRequired: false
    },
    identity: {
      documentId: document.id,
      activePageId: document.activePageId || null,
      revisionId: documentBridge.revision?.revisionId ?? null
    },
    modules: {
      documentBridge: {
        status: 'AVAILABLE',
        fingerprint: documentBridge.contextFingerprint,
        context: projectedDocumentBridge
      },
      semanticRegions: semanticGraph ? {
        status: 'AVAILABLE',
        fingerprint: semanticGraph.fingerprint,
        context: semanticContext
      } : { status: 'UNAVAILABLE', fingerprint: null, context: null },
      provenance: provenanceGraph ? {
        status: 'AVAILABLE',
        fingerprint: provenanceGraph.fingerprint,
        context: provenanceContext
      } : { status: 'UNAVAILABLE', fingerprint: null, context: null },
      visualCompare: comparison ? {
        status: 'AVAILABLE',
        fingerprint: comparison.comparisonFingerprint,
        evidence: comparison
      } : { status: input.comparison == null ? 'NOT_REQUESTED' : 'UNAVAILABLE', fingerprint: null, evidence: null },
      parametricStructure: parametricStructure ? {
        status: 'AVAILABLE',
        fingerprint: parametricStructure.structureFingerprint,
        evidence: parametricStructure
      } : { status: input.parametricDescriptor == null ? 'NOT_REQUESTED' : 'UNAVAILABLE', fingerprint: null, evidence: null },
      ...(creativeMemory ? { creativeMemory } : {}),
      ...(researchCreation ? { researchCreation } : {})
    },
    transmission: {
      policy: projection ? 'EXISTING_CHAT_DISCLOSURE_POLICY' : 'UNPROJECTED_LOCAL_CONTEXT',
      objectProjectionApplied: Boolean(projection)
    },
    unresolved
  }, limits);
}

export function createCreativeIntelligenceContextAdapter({
  getDocument,
  getSelectedObjectIds = null,
  getRevisionId = null,
  getRelationshipEvidence = null,
  getRevisionRecords = null,
  getRevisionComparisons = null,
  getFileEnvelopes = null,
  getHistoryEntries = null,
  getRecipeEvidence = null,
  getChatEvidence = null,
  getSemanticRegionGraphs = null,
  creativeMemoryProvider = null,
  researchCreationProvider = null
} = {}) {
  if (typeof getDocument !== 'function') fail('ADAPTER_DOCUMENT_PROVIDER_REQUIRED');
  for (const [name, provider] of Object.entries({
    getSelectedObjectIds,
    getRevisionId,
    getRelationshipEvidence,
    getRevisionRecords,
    getRevisionComparisons,
    getFileEnvelopes,
    getHistoryEntries,
    getRecipeEvidence,
    getChatEvidence,
    getSemanticRegionGraphs
  })) {
    if (provider != null && typeof provider !== 'function') fail('ADAPTER_PROVIDER_INVALID', { provider: name });
  }
  if (creativeMemoryProvider != null && typeof creativeMemoryProvider?.readAdvisoryContext !== 'function') {
    fail('ADAPTER_PROVIDER_INVALID', { provider: 'creativeMemoryProvider' });
  }
  if (researchCreationProvider != null && typeof researchCreationProvider?.advisory !== 'function') {
    fail('ADAPTER_PROVIDER_INVALID', { provider: 'researchCreationProvider' });
  }

  const readCreativeMemory = ({ query = {}, options = {} } = {}) => {
    if (!creativeMemoryProvider) return null;
    return clone(creativeMemoryProvider.readAdvisoryContext(clone(query), clone(options)));
  };
  const readResearchCreation = ({ selection = {}, options = {} } = {}) => {
    if (!researchCreationProvider) return null;
    return clone(researchCreationProvider.advisory(clone(selection), clone(options)));
  };

  return Object.freeze({
    readCreativeMemory,
    readResearchCreation,
    read(options = {}) {
      if (!record(options)) fail('OPTIONS_INVALID');
      const advisoryProviderIssues = [];
      let creativeMemory = own(options, 'creativeMemory') ? clone(options.creativeMemory) : null;
      let researchCreation = own(options, 'researchCreation') ? clone(options.researchCreation) : null;
      if (!own(options, 'creativeMemory') && creativeMemoryProvider) {
        try {
          creativeMemory = readCreativeMemory({
            query: clone(options.creativeMemoryQuery || {}),
            options: { ...DEFAULT_CREATIVE_MEMORY_INTEGRATION_OPTIONS, ...(clone(options.creativeMemoryOptions) || {}) }
          });
        } catch (error) {
          advisoryProviderIssues.push(providerIssue('creative-memory', error));
        }
      }
      if (!own(options, 'researchCreation') && researchCreationProvider) {
        try {
          researchCreation = readResearchCreation({
            selection: clone(options.researchCreationSelection || {}),
            options: { ...DEFAULT_RESEARCH_CREATION_INTEGRATION_OPTIONS, ...(clone(options.researchCreationOptions) || {}) }
          });
        } catch (error) {
          advisoryProviderIssues.push(providerIssue('research-creation', error));
        }
      }

      const input = {
        document: clone(getDocument()),
        selectedObjectIds: own(options, 'selectedObjectIds') ? clone(options.selectedObjectIds) : clone(getSelectedObjectIds?.() || []),
        revisionId: own(options, 'revisionId') ? options.revisionId : (getRevisionId?.() ?? null),
        relationshipEvidence: own(options, 'relationshipEvidence') ? clone(options.relationshipEvidence) : clone(getRelationshipEvidence?.() || []),
        revisionRecords: own(options, 'revisionRecords') ? clone(options.revisionRecords) : clone(getRevisionRecords?.() || []),
        revisionComparisons: own(options, 'revisionComparisons') ? clone(options.revisionComparisons) : clone(getRevisionComparisons?.() || []),
        fileEnvelopes: own(options, 'fileEnvelopes') ? clone(options.fileEnvelopes) : clone(getFileEnvelopes?.() || []),
        historyEntries: own(options, 'historyEntries') ? clone(options.historyEntries) : clone(getHistoryEntries?.() || []),
        recipeEvidence: own(options, 'recipeEvidence') ? clone(options.recipeEvidence) : clone(getRecipeEvidence?.() || []),
        chatEvidence: own(options, 'chatEvidence') ? clone(options.chatEvidence) : clone(getChatEvidence?.() || []),
        semanticRegionGraphs: own(options, 'semanticRegionGraphs') ? clone(options.semanticRegionGraphs) : clone(getSemanticRegionGraphs?.() || []),
        comparison: own(options, 'comparison') ? clone(options.comparison) : null,
        parametricDescriptor: own(options, 'parametricDescriptor') ? clone(options.parametricDescriptor) : null,
        creativeMemory,
        researchCreation,
        advisoryProviderIssues
      };
      const builderOptions = {
        ...(clone(options.builderOptions) || {}),
        ...(own(options, 'allowedObjectIds') ? { allowedObjectIds: clone(options.allowedObjectIds) } : {})
      };
      return buildCreativeIntelligenceContext(input, builderOptions);
    }
  });
}
