import { Matrix } from '../core/math.js';
import { stableCompositeId, stableHash, stableStringify } from '../core/stable-id.js';

export const PARAMETRIC_STRUCTURE_SCHEMA = 'INK-PARAMETRIC-STRUCTURE';
export const PARAMETRIC_STRUCTURE_PLAN_SCHEMA = 'INK-PARAMETRIC-STRUCTURE-PLAN';
export const PARAMETRIC_STRUCTURE_VERSION = 1;
export const PARAMETRIC_STRUCTURE_FORMAT_VERSION = 4;

const DEFAULT_LIMITS = Object.freeze({
  maxParameters: 64,
  maxNodes: 512,
  maxTemplates: 128,
  maxRelationships: 512,
  maxProvenanceRefs: 128,
  maxBytes: 256 * 1024
});

const HARD_LIMITS = Object.freeze({
  maxParameters: 256,
  maxNodes: 4096,
  maxTemplates: 1024,
  maxRelationships: 4096,
  maxProvenanceRefs: 1024,
  maxBytes: 2 * 1024 * 1024
});

const PARAMETER_TYPES = new Set(['number', 'integer', 'string', 'boolean', 'enum']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

export class ParametricStructureError extends Error {
  constructor(code, details = {}) {
    super(`INK_PARAMETRIC_STRUCTURE_${code}`);
    this.name = 'ParametricStructureError';
    this.code = `PARAMETRIC_STRUCTURE_${code}`;
    Object.assign(this, details);
  }
}

const fail = (code, details = {}) => { throw new ParametricStructureError(code, details); };

function text(value, field, { required = false, max = 240 } = {}) {
  if (value == null || value === '') {
    if (required) fail('FIELD_REQUIRED', { field });
    return null;
  }
  if (typeof value !== 'string') fail('FIELD_INVALID', { field });
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max) fail('FIELD_INVALID', { field });
  return normalized || null;
}

function boundedInteger(value, fallback, hardMax, field) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > hardMax) fail('LIMIT_INVALID', { field, value });
  return number;
}

function limitsFrom(raw = {}) {
  if (!record(raw)) fail('LIMITS_INVALID');
  return {
    maxParameters: boundedInteger(raw.maxParameters, DEFAULT_LIMITS.maxParameters, HARD_LIMITS.maxParameters, 'maxParameters'),
    maxNodes: boundedInteger(raw.maxNodes, DEFAULT_LIMITS.maxNodes, HARD_LIMITS.maxNodes, 'maxNodes'),
    maxTemplates: boundedInteger(raw.maxTemplates, DEFAULT_LIMITS.maxTemplates, HARD_LIMITS.maxTemplates, 'maxTemplates'),
    maxRelationships: boundedInteger(raw.maxRelationships, DEFAULT_LIMITS.maxRelationships, HARD_LIMITS.maxRelationships, 'maxRelationships'),
    maxProvenanceRefs: boundedInteger(raw.maxProvenanceRefs, DEFAULT_LIMITS.maxProvenanceRefs, HARD_LIMITS.maxProvenanceRefs, 'maxProvenanceRefs'),
    maxBytes: boundedInteger(raw.maxBytes, DEFAULT_LIMITS.maxBytes, HARD_LIMITS.maxBytes, 'maxBytes')
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value)) {
    const output = {};
    for (const key of Object.keys(value).sort()) output[key] = canonical(value[key]);
    return output;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) fail('NON_JSON_VALUE');
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') fail('NON_JSON_VALUE');
  return value === undefined ? null : value;
}

function byteLength(value) {
  const serialized = stableStringify(value);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(serialized).byteLength;
  return unescape(encodeURIComponent(serialized)).length;
}

function finiteNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail('NUMBER_INVALID', { field, value });
  return number;
}

function normalizeMatrix(raw, field) {
  if (!Array.isArray(raw) || raw.length !== 6) fail('TRANSFORM_MATRIX_INVALID', { field });
  return raw.map((value, index) => finiteNumber(value, `${field}[${index}]`));
}

export function normalizeStructureTransform(raw = null, field = 'transform') {
  if (raw == null) return { matrix: Matrix.identity(), source: 'identity' };
  if (Array.isArray(raw)) return { matrix: normalizeMatrix(raw, field), source: 'matrix' };
  if (!record(raw)) fail('TRANSFORM_INVALID', { field });
  if (raw.matrix != null) return { matrix: normalizeMatrix(raw.matrix, `${field}.matrix`), source: 'matrix' };

  const translate = raw.translate == null ? { x: 0, y: 0 } : {
    x: finiteNumber(raw.translate?.x ?? raw.translate?.[0] ?? 0, `${field}.translate.x`),
    y: finiteNumber(raw.translate?.y ?? raw.translate?.[1] ?? 0, `${field}.translate.y`)
  };
  const scale = raw.scale == null ? { x: 1, y: 1 } : {
    x: finiteNumber(raw.scale?.x ?? raw.scale?.[0] ?? raw.scale ?? 1, `${field}.scale.x`),
    y: finiteNumber(raw.scale?.y ?? raw.scale?.[1] ?? raw.scale ?? 1, `${field}.scale.y`)
  };
  const rotation = finiteNumber(raw.rotateRadians ?? 0, `${field}.rotateRadians`);
  const matrix = Matrix.multiply(
    Matrix.translate(translate.x, translate.y),
    Matrix.multiply(Matrix.rotate(rotation), Matrix.scale(scale.x, scale.y))
  );
  return {
    matrix,
    source: 'descriptor',
    descriptor: { translate, scale, rotateRadians: rotation }
  };
}

function normalizeSeed(value) {
  if (value == null) return null;
  if (!['string', 'number', 'boolean'].includes(typeof value)) fail('SEED_INVALID');
  if (typeof value === 'number' && !Number.isFinite(value)) fail('SEED_INVALID');
  return value;
}

function normalizeParameterDefinitions(raw, limits) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) fail('PARAMETERS_INVALID');
  if (raw.length > limits.maxParameters) fail('PARAMETER_LIMIT_EXCEEDED', { actual: raw.length, max: limits.maxParameters });
  const names = new Set();
  const definitions = raw.map((item, index) => {
    if (!record(item)) fail('PARAMETER_DEFINITION_INVALID', { index });
    const name = text(item.name, `parameters[${index}].name`, { required: true, max: 120 });
    if (names.has(name)) fail('PARAMETER_DUPLICATE', { name });
    names.add(name);
    const type = text(item.type, `parameters[${index}].type`, { required: true, max: 40 });
    const definition = {
      name,
      type,
      required: item.required === true,
      default: item.default === undefined ? null : canonical(item.default),
      min: item.min == null ? null : finiteNumber(item.min, `parameters[${index}].min`),
      max: item.max == null ? null : finiteNumber(item.max, `parameters[${index}].max`),
      values: item.values == null ? [] : [...new Set(item.values.map((value, valueIndex) =>
        text(value, `parameters[${index}].values[${valueIndex}]`, { required: true, max: 160 })
      ))].sort((a, b) => a.localeCompare(b))
    };
    if (definition.min != null && definition.max != null && definition.min > definition.max) {
      fail('PARAMETER_CONSTRAINT_INVALID', { name });
    }
    if (type === 'enum' && !definition.values.length) fail('PARAMETER_CONSTRAINT_INVALID', { name, reason: 'ENUM_VALUES_REQUIRED' });
    return definition;
  });
  return definitions.sort((a, b) => a.name.localeCompare(b.name));
}

function validateParameterValue(definition, raw) {
  if (!PARAMETER_TYPES.has(definition.type)) {
    return { status: 'UNSUPPORTED', value: null, code: 'PARAMETER_TYPE_UNSUPPORTED' };
  }
  if (raw == null) {
    if (definition.required) return { status: 'UNRESOLVED', value: null, code: 'PARAMETER_REQUIRED' };
    return { status: 'RESOLVED', value: null };
  }

  let value = raw;
  if (definition.type === 'number' || definition.type === 'integer') {
    value = Number(raw);
    if (!Number.isFinite(value) || (definition.type === 'integer' && !Number.isInteger(value))) {
      return { status: 'UNRESOLVED', value: null, code: 'PARAMETER_VALUE_INVALID' };
    }
    if (definition.min != null && value < definition.min) return { status: 'UNRESOLVED', value: null, code: 'PARAMETER_BELOW_MIN' };
    if (definition.max != null && value > definition.max) return { status: 'UNRESOLVED', value: null, code: 'PARAMETER_ABOVE_MAX' };
  } else if (definition.type === 'string') {
    if (typeof raw !== 'string') return { status: 'UNRESOLVED', value: null, code: 'PARAMETER_VALUE_INVALID' };
    value = raw;
  } else if (definition.type === 'boolean') {
    if (typeof raw !== 'boolean') return { status: 'UNRESOLVED', value: null, code: 'PARAMETER_VALUE_INVALID' };
  } else if (definition.type === 'enum') {
    if (typeof raw !== 'string' || !definition.values.includes(raw)) return { status: 'UNRESOLVED', value: null, code: 'PARAMETER_VALUE_INVALID' };
  }
  return { status: 'RESOLVED', value: canonical(value) };
}

function resolveParameters(definitions, supplied, unresolved) {
  if (supplied != null && !record(supplied)) fail('PARAMETER_VALUES_INVALID');
  const input = supplied || {};
  const known = new Set(definitions.map(item => item.name));
  for (const name of Object.keys(input).sort()) {
    if (!known.has(name)) unresolved.push({ code: 'PARAMETER_UNDECLARED', parameter: name });
  }
  return definitions.map(definition => {
    const raw = Object.prototype.hasOwnProperty.call(input, definition.name) ? input[definition.name] : definition.default;
    const result = validateParameterValue(definition, raw);
    if (result.status !== 'RESOLVED') unresolved.push({ code: result.code, parameter: definition.name, type: definition.type });
    return { ...definition, resolvedValue: result.value, status: result.status };
  });
}

function parameterLookup(parameters) {
  return new Map(parameters.map(item => [item.name, item]));
}

function scalarReference(raw, parameters, field, unresolved) {
  if (typeof raw === 'string' && raw.startsWith('$')) {
    const name = raw.slice(1);
    const parameter = parameters.get(name);
    if (!parameter || parameter.status !== 'RESOLVED') {
      unresolved.push({ code: 'PARAMETER_REFERENCE_UNRESOLVED', field, parameter: name });
      return null;
    }
    return parameter.resolvedValue;
  }
  if (record(raw) && typeof raw.parameter === 'string') {
    const parameter = parameters.get(raw.parameter);
    if (!parameter || parameter.status !== 'RESOLVED') {
      unresolved.push({ code: 'PARAMETER_REFERENCE_UNRESOLVED', field, parameter: raw.parameter });
      return null;
    }
    return parameter.resolvedValue;
  }
  return raw;
}

function normalizeProvenanceRefs(raw, limits, field) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) fail('PROVENANCE_REFS_INVALID', { field });
  const map = new Map();
  raw.forEach((item, index) => {
    const ref = typeof item === 'string'
      ? { type: 'evidence', id: text(item, `${field}[${index}]`, { required: true }) }
      : {
          type: text(item?.type || 'evidence', `${field}[${index}].type`, { required: true, max: 80 }),
          id: text(item?.id, `${field}[${index}].id`, { required: true })
        };
    map.set(`${ref.type}\u0000${ref.id}`, ref);
  });
  const refs = [...map.values()].sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
  if (refs.length > limits.maxProvenanceRefs) fail('PROVENANCE_REF_LIMIT_EXCEEDED', { field, actual: refs.length, max: limits.maxProvenanceRefs });
  return refs;
}

function normalizeSource(raw, limits, field) {
  if (raw == null) return { objectId: null, semanticRegionRef: null, provenanceRefs: [], evidence: null };
  if (!record(raw)) fail('SOURCE_INVALID', { field });
  return {
    objectId: text(raw.objectId, `${field}.objectId`),
    semanticRegionRef: text(raw.semanticRegionRef ?? raw.semanticRegionId, `${field}.semanticRegionRef`),
    provenanceRefs: normalizeProvenanceRefs(raw.provenanceRefs, limits, `${field}.provenanceRefs`),
    evidence: raw.evidence == null ? null : canonical(raw.evidence)
  };
}

function normalizeRepeat(raw, parameters, unresolved, field) {
  if (raw == null) return { count: 1, stepTransform: normalizeStructureTransform(null), transforms: [] };
  if (!record(raw)) fail('REPEAT_INVALID', { field });
  const countRaw = scalarReference(raw.count ?? 1, parameters, `${field}.count`, unresolved);
  if (countRaw == null) return { count: 0, stepTransform: normalizeStructureTransform(raw.stepTransform, `${field}.stepTransform`), transforms: [] };
  const count = Number(countRaw);
  if (!Number.isInteger(count) || count < 0) {
    unresolved.push({ code: 'REPEAT_COUNT_INVALID', field, value: canonical(countRaw) });
    return { count: 0, stepTransform: normalizeStructureTransform(raw.stepTransform, `${field}.stepTransform`), transforms: [] };
  }
  const transforms = raw.transforms == null ? [] : raw.transforms.map((item, index) =>
    normalizeStructureTransform(item, `${field}.transforms[${index}]`)
  );
  return {
    count,
    stepTransform: normalizeStructureTransform(raw.stepTransform, `${field}.stepTransform`),
    transforms
  };
}

function normalizeNodeTemplates(raw, parameters, limits, unresolved) {
  if (!Array.isArray(raw) || !raw.length) fail('NODES_REQUIRED');
  if (raw.length > limits.maxTemplates) fail('TEMPLATE_LIMIT_EXCEEDED', { actual: raw.length, max: limits.maxTemplates });
  const keys = new Set();
  const templates = raw.map((item, index) => {
    if (!record(item)) fail('NODE_TEMPLATE_INVALID', { index });
    const key = text(item.key ?? item.id, `nodes[${index}].key`, { required: true, max: 160 });
    if (keys.has(key)) fail('NODE_KEY_DUPLICATE', { key });
    keys.add(key);
    const role = text(item.role || 'part', `nodes[${index}].role`, { required: true, max: 120 });
    return {
      key,
      role,
      parentKey: text(item.parentKey, `nodes[${index}].parentKey`, { max: 160 }),
      source: normalizeSource(item.source, limits, `nodes[${index}].source`),
      transform: normalizeStructureTransform(item.transform, `nodes[${index}].transform`),
      repeat: normalizeRepeat(item.repeat, parameters, unresolved, `nodes[${index}].repeat`),
      metadata: item.metadata == null ? null : canonical(item.metadata)
    };
  }).sort((a, b) => a.key.localeCompare(b.key));
  for (const node of templates) {
    if (node.parentKey && !keys.has(node.parentKey)) unresolved.push({ code: 'PARENT_NODE_UNRESOLVED', nodeKey: node.key, parentKey: node.parentKey });
  }
  return templates;
}

function normalizeRelationships(raw, keys, limits, unresolved) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) fail('RELATIONSHIPS_INVALID');
  if (raw.length > limits.maxRelationships) fail('RELATIONSHIP_LIMIT_EXCEEDED', { actual: raw.length, max: limits.maxRelationships });
  const output = raw.map((item, index) => {
    if (!record(item)) fail('RELATIONSHIP_INVALID', { index });
    const from = text(item.from, `relationships[${index}].from`, { required: true, max: 160 });
    const to = text(item.to, `relationships[${index}].to`, { required: true, max: 160 });
    const type = text(item.type, `relationships[${index}].type`, { required: true, max: 120 });
    if (!keys.has(from)) unresolved.push({ code: 'RELATIONSHIP_ENDPOINT_UNRESOLVED', endpoint: 'from', key: from, type });
    if (!keys.has(to)) unresolved.push({ code: 'RELATIONSHIP_ENDPOINT_UNRESOLVED', endpoint: 'to', key: to, type });
    return { from, type, to, metadata: item.metadata == null ? null : canonical(item.metadata) };
  });
  const map = new Map(output.map(item => [stableStringify(item), item]));
  return [...map.values()].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
}

function powerTransform(step, index) {
  let output = Matrix.identity();
  for (let i = 0; i < index; i += 1) output = Matrix.multiply(output, step);
  return output;
}

function generatedId(structureId, seed, template, index) {
  const evidenceHash = stableHash({
    role: template.role,
    objectId: template.source.objectId,
    semanticRegionRef: template.source.semanticRegionRef,
    provenanceRefs: template.source.provenanceRefs,
    seed
  }).split(':').at(-1);
  return stableCompositeId('structure-node', [structureId, template.key, index, evidenceHash]);
}

function expandTemplates(structureId, seed, templates, limits, unresolved) {
  let total = 0;
  for (const template of templates) total += template.repeat.count;
  if (total > limits.maxNodes) fail('NODE_LIMIT_EXCEEDED', { actual: total, max: limits.maxNodes });

  const byKey = new Map();
  const nodes = [];
  for (const template of templates) {
    const generated = [];
    for (let index = 0; index < template.repeat.count; index += 1) {
      const repeatTransform = template.repeat.transforms[index]?.matrix
        || powerTransform(template.repeat.stepTransform.matrix, index);
      const matrix = Matrix.multiply(template.transform.matrix, repeatTransform);
      const node = {
        nodeId: generatedId(structureId, seed, template, index),
        templateKey: template.key,
        role: template.role,
        index,
        parentKey: template.parentKey,
        parentNodeId: null,
        source: clone(template.source),
        transform: { matrix },
        metadata: clone(template.metadata)
      };
      generated.push(node);
      nodes.push(node);
    }
    byKey.set(template.key, generated);
  }

  for (const node of nodes) {
    if (!node.parentKey) continue;
    const parents = byKey.get(node.parentKey) || [];
    if (parents.length === 1) node.parentNodeId = parents[0].nodeId;
    else if (parents[node.index]) node.parentNodeId = parents[node.index].nodeId;
    else unresolved.push({
      code: 'PARENT_CARDINALITY_UNRESOLVED',
      nodeId: node.nodeId,
      parentKey: node.parentKey,
      parentCount: parents.length,
      childIndex: node.index
    });
  }

  return nodes.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

function normalizeDescriptor(raw, options) {
  if (!record(raw)) fail('DESCRIPTOR_INVALID');
  if (raw.schema != null && raw.schema !== PARAMETRIC_STRUCTURE_SCHEMA) fail('SCHEMA_UNSUPPORTED', { schema: raw.schema });
  if (raw.version != null && Number(raw.version) !== PARAMETRIC_STRUCTURE_VERSION) fail('VERSION_UNSUPPORTED', { version: raw.version });
  const structureId = text(raw.structureId ?? raw.id, 'structureId', { required: true });
  const limits = limitsFrom(options.limits || {});
  const unresolved = [];
  const parameterDefinitions = normalizeParameterDefinitions(raw.parameters, limits);
  const parameters = resolveParameters(parameterDefinitions, raw.values ?? raw.parameterValues, unresolved);
  const lookup = parameterLookup(parameters);
  const nodes = normalizeNodeTemplates(raw.nodes, lookup, limits, unresolved);
  const keys = new Set(nodes.map(item => item.key));
  const relationships = normalizeRelationships(raw.relationships, keys, limits, unresolved);
  return {
    structureId,
    seed: normalizeSeed(raw.seed),
    label: text(raw.label, 'label', { max: 240 }),
    parameters,
    nodes,
    relationships,
    unresolved,
    limits
  };
}

function finalize(plan, maxBytes) {
  const unresolved = [...plan.unresolved].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  const payload = canonical({ ...plan, unresolved, structureFingerprint: null, bounds: { ...plan.bounds, outputBytes: null } });
  const structureFingerprint = stableHash(payload);
  const output = { ...payload, structureFingerprint };
  output.bounds.outputBytes = byteLength(output);
  if (output.bounds.outputBytes > maxBytes) fail('OUTPUT_BOUNDS_EXCEEDED', { actual: output.bounds.outputBytes, max: maxBytes });
  return output;
}

export function resolveParametricStructure(descriptor, options = {}) {
  if (!record(options)) fail('OPTIONS_INVALID');
  const normalized = normalizeDescriptor(descriptor, options);
  const generatedNodes = expandTemplates(
    normalized.structureId,
    normalized.seed,
    normalized.nodes,
    normalized.limits,
    normalized.unresolved
  );

  return finalize({
    schema: PARAMETRIC_STRUCTURE_PLAN_SCHEMA,
    version: PARAMETRIC_STRUCTURE_VERSION,
    formatVersion: PARAMETRIC_STRUCTURE_FORMAT_VERSION,
    structureId: normalized.structureId,
    label: normalized.label,
    seed: normalized.seed,
    parameters: normalized.parameters,
    templates: normalized.nodes,
    generatedNodes,
    relationships: normalized.relationships,
    unresolved: normalized.unresolved,
    status: normalized.unresolved.length ? 'PARTIAL' : 'RESOLVED',
    bounds: {
      maxNodes: normalized.limits.maxNodes,
      generatedNodeCount: generatedNodes.length,
      outputBytes: null
    },
    authority: {
      geometry: 'EXISTING_MATRIX_ONLY',
      documentWrite: false,
      historyWrite: false,
      revisionWrite: false,
      renderer: false
    },
    structureFingerprint: null
  }, normalized.limits.maxBytes);
}

function providerResult(provider, id) {
  if (provider == null) return null;
  const value = provider(id);
  return value == null ? null : clone(value);
}

function evidenceSummary(value, kind, id) {
  if (!record(value)) return null;
  if (kind === 'object') {
    return {
      objectId: id,
      type: typeof value.type === 'string' ? value.type : null,
      name: typeof value.name === 'string' ? value.name : null,
      matrix: Array.isArray(value.matrix) && value.matrix.length === 6 ? [...value.matrix] : null
    };
  }
  if (kind === 'semantic-region') {
    return {
      semanticRegionRef: id,
      regionId: typeof value.regionId === 'string' ? value.regionId : id,
      role: typeof value.role === 'string' ? value.role : null,
      status: typeof value.status === 'string' ? value.status : null,
      fingerprint: typeof value.fingerprint === 'string' ? value.fingerprint : null
    };
  }
  return { type: value.type || 'evidence', id: value.id || id };
}

export function createParametricStructureAdapter({
  getObject = null,
  getSemanticRegion = null,
  getProvenanceRef = null
} = {}) {
  for (const [name, provider] of Object.entries({ getObject, getSemanticRegion, getProvenanceRef })) {
    if (provider != null && typeof provider !== 'function') fail('ADAPTER_PROVIDER_INVALID', { provider: name });
  }

  const prepare = descriptor => {
    const prepared = clone(descriptor);
    if (!Array.isArray(prepared?.nodes)) fail('NODES_REQUIRED');
    prepared.nodes = prepared.nodes.map((node, index) => {
      const next = clone(node);
      const source = record(next.source) ? next.source : {};
      const adapterEvidence = [];
      const unresolved = [];

      if (source.objectId) {
        const value = providerResult(getObject, source.objectId);
        if (value) adapterEvidence.push(evidenceSummary(value, 'object', source.objectId));
        else unresolved.push({ code: 'SOURCE_OBJECT_UNRESOLVED', objectId: source.objectId });
      }
      const regionRef = source.semanticRegionRef ?? source.semanticRegionId;
      if (regionRef) {
        const value = providerResult(getSemanticRegion, regionRef);
        if (value) adapterEvidence.push(evidenceSummary(value, 'semantic-region', regionRef));
        else unresolved.push({ code: 'SEMANTIC_REGION_UNRESOLVED', semanticRegionRef: regionRef });
      }

      const refs = Array.isArray(source.provenanceRefs) ? source.provenanceRefs : [];
      for (const ref of refs) {
        const normalized = typeof ref === 'string' ? { type: 'evidence', id: ref } : ref;
        if (!normalized?.id) continue;
        const value = providerResult(getProvenanceRef, normalized.id);
        if (getProvenanceRef && !value) unresolved.push({ code: 'PROVENANCE_REF_UNRESOLVED', id: normalized.id, type: normalized.type || 'evidence' });
        if (value) adapterEvidence.push(evidenceSummary(value, 'provenance', normalized.id));
      }

      next.source = {
        ...source,
        evidence: {
          supplied: source.evidence == null ? null : canonical(source.evidence),
          adapter: adapterEvidence.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
          unresolved: unresolved.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)))
        }
      };
      next.metadata = {
        ...(record(next.metadata) ? next.metadata : {}),
        adapterUnresolved: unresolved
      };
      return next;
    });
    return prepared;
  };

  return Object.freeze({
    prepare,
    resolve: (descriptor, options = {}) => {
      const prepared = prepare(descriptor);
      const plan = resolveParametricStructure(prepared, options);
      const adapterUnresolved = [];
      for (const template of plan.templates) {
        for (const item of template.metadata?.adapterUnresolved || []) {
          adapterUnresolved.push({ ...item, nodeKey: template.key });
        }
      }
      if (!adapterUnresolved.length) return plan;
      const withoutFingerprint = {
        ...plan,
        unresolved: [...plan.unresolved, ...adapterUnresolved].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
        status: 'PARTIAL',
        structureFingerprint: null,
        bounds: { ...plan.bounds, outputBytes: null }
      };
      return finalize(withoutFingerprint, options?.limits?.maxBytes || DEFAULT_LIMITS.maxBytes);
    }
  });
}
