import { Matrix } from '../core/math.js';
import { stableCompositeId, stableHash } from '../core/stable-id.js';
import { refreshRepeatInstances } from '../vector/vector-core.js';
import { normalizeSemantic } from '../semantic/semantic-model.js';

export const MATERIAL_LIBRARY_VERSION = '1.0';
const clone = value => structuredClone(value);

function currentPage(document) {
  return document.pages.find(page => page.id === document.activePageId) || document.pages[0];
}

export function ensureMaterialLibrary(document) {
  if (!document.materialLibrary || typeof document.materialLibrary !== 'object') {
    document.materialLibrary = { format: 'INK-MATERIAL-LIBRARY', version: MATERIAL_LIBRARY_VERSION, templates: [] };
  }
  document.materialLibrary.format = 'INK-MATERIAL-LIBRARY';
  document.materialLibrary.version = MATERIAL_LIBRARY_VERSION;
  document.materialLibrary.templates = Array.isArray(document.materialLibrary.templates) ? document.materialLibrary.templates : [];
  return document.materialLibrary;
}

function validateTemplate(template) {
  const required = ['templateId', 'templateVersion', 'materialType', 'geometry', 'defaultParameters', 'editableParameters', 'constraints', 'semanticRole', 'sourceBenchmark', 'validationState'];
  for (const field of required) if (template?.[field] === undefined || template?.[field] === null) {
    throw Object.assign(new Error(`INK_MATERIAL_TEMPLATE_FIELD_REQUIRED:${field}`), { code: 'MATERIAL_TEMPLATE_FIELD_REQUIRED', field });
  }
  if (!/^material[-_:]/.test(String(template.templateId))) throw Object.assign(new Error('INK_MATERIAL_TEMPLATE_ID_INVALID'), { code: 'MATERIAL_TEMPLATE_ID_INVALID' });
  if (!template.geometry || typeof template.geometry !== 'object') throw Object.assign(new Error('INK_MATERIAL_TEMPLATE_GEOMETRY_REQUIRED'), { code: 'MATERIAL_TEMPLATE_GEOMETRY_REQUIRED' });
  return true;
}

function templateDefaults(template) {
  const defaults = clone(template.defaultParameters || {});
  for (const [name, spec] of Object.entries(template.editableParameters || {})) {
    if (!(name in defaults) && spec && typeof spec === 'object' && 'default' in spec) defaults[name] = clone(spec.default);
  }
  return defaults;
}

function validateParameters(template, parameters) {
  for (const [name, spec] of Object.entries(template.editableParameters || {})) {
    if (!(name in parameters)) continue;
    const value = parameters[name];
    if (spec.type === 'number') {
      if (!Number.isFinite(Number(value))) throw Object.assign(new Error(`INK_MATERIAL_PARAMETER_INVALID:${name}`), { code: 'MATERIAL_PARAMETER_INVALID', parameter: name });
      if (spec.min !== undefined && Number(value) < Number(spec.min)) throw Object.assign(new Error(`INK_MATERIAL_PARAMETER_RANGE:${name}`), { code: 'MATERIAL_PARAMETER_RANGE', parameter: name });
      if (spec.max !== undefined && Number(value) > Number(spec.max)) throw Object.assign(new Error(`INK_MATERIAL_PARAMETER_RANGE:${name}`), { code: 'MATERIAL_PARAMETER_RANGE', parameter: name });
    }
    if (spec.enum && !spec.enum.includes(value)) throw Object.assign(new Error(`INK_MATERIAL_PARAMETER_ENUM:${name}`), { code: 'MATERIAL_PARAMETER_ENUM', parameter: name });
  }
  return parameters;
}

function calculate(node, parameters) {
  if ('$param' in node) {
    const name = node.$param;
    if (!(name in parameters)) throw Object.assign(new Error(`INK_MATERIAL_PARAMETER_MISSING:${name}`), { code: 'MATERIAL_PARAMETER_MISSING', parameter: name });
    return clone(parameters[name]);
  }
  const spec = node.$calc;
  const args = (spec?.args || []).map(value => resolveTemplateValue(value, parameters));
  switch (spec?.op) {
    case 'add': return args.reduce((sum, value) => Number(sum) + Number(value), 0);
    case 'subtract': return Number(args[0]) - Number(args[1]);
    case 'multiply': return args.reduce((product, value) => Number(product) * Number(value), 1);
    case 'divide': return Number(args[0]) / Number(args[1]);
    case 'negate': return -Number(args[0]);
    case 'min': return Math.min(...args.map(Number));
    case 'max': return Math.max(...args.map(Number));
    case 'round': return Math.round(Number(args[0]));
    case 'select': return args[0] ? args[1] : args[2];
    default: throw Object.assign(new Error(`INK_MATERIAL_CALC_UNSUPPORTED:${spec?.op}`), { code: 'MATERIAL_CALC_UNSUPPORTED', operation: spec?.op });
  }
}

export function resolveTemplateValue(value, parameters) {
  if (Array.isArray(value)) return value.map(item => resolveTemplateValue(item, parameters));
  if (value && typeof value === 'object') {
    if ('$param' in value || '$calc' in value) return calculate(value, parameters);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveTemplateValue(item, parameters)]));
  }
  return value;
}

function rebaseIds(value, instanceId, path = 'geometry') {
  if (Array.isArray(value)) return value.map((item, index) => rebaseIds(item, instanceId, `${path}.${index}`));
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'id') output[key] = stableCompositeId(instanceId, [item || path]);
    else output[key] = rebaseIds(item, instanceId, `${path}.${key}`);
  }
  return output;
}

function realizedGeometry(template, parameters, instanceId) {
  const resolved = resolveTemplateValue(template.geometry, parameters);
  const rebased = rebaseIds(resolved, instanceId);
  return Array.isArray(rebased) ? rebased : [rebased];
}

function normalizeMaterialTree(object, parentId = null) {
  if (parentId && !object.parentId) object.parentId = parentId;
  normalizeSemantic(object);
  if (object.type === 'group') for (const child of object.children || []) normalizeMaterialTree(child, object.id);
  return object;
}

export function findObjectEntry(document, objectId) {
  const walk = (objects, layer, parent = null) => {
    for (let index = 0; index < (objects || []).length; index++) {
      const object = objects[index];
      if (object.id === objectId) return { object, index, container: objects, layer, parent };
      if (object.type === 'group') {
        const nested = walk(object.children, layer, object);
        if (nested) return nested;
      }
    }
    return null;
  };
  for (const page of document.pages || []) for (const layer of page.layers || []) {
    const found = walk(layer.objects, layer);
    if (found) return found;
  }
  return null;
}

export function listMaterialInstances(document, templateId = null) {
  const output = [];
  const walk = objects => {
    for (const object of objects || []) {
      if (object.materialInstance && (!templateId || object.materialInstance.templateId === templateId)) output.push(object);
      if (object.type === 'group') walk(object.children);
    }
  };
  for (const page of document.pages || []) for (const layer of page.layers || []) walk(layer.objects);
  return output;
}

function insertObject(document, object, { layerId = null, parentId = null } = {}) {
  const page = currentPage(document);
  if (parentId) {
    const parent = findObjectEntry(document, parentId)?.object;
    if (!parent || parent.type !== 'group') throw Object.assign(new Error(`INK_MATERIAL_PARENT_NOT_FOUND:${parentId}`), { code: 'MATERIAL_PARENT_NOT_FOUND', parentId });
    parent.children = Array.isArray(parent.children) ? parent.children : [];
    parent.children.push(object);
    object.parentId = parentId;
    return object;
  }
  const layer = page.layers.find(item => item.id === layerId) || page.layers.find(item => item.id === page.activeLayerId) || page.layers.at(-1);
  layer.objects.push(object);
  return object;
}

export function createMaterialTemplate(document, input, { replace = false } = {}) {
  const library = ensureMaterialLibrary(document);
  const template = {
    format: 'INK-MATERIAL-TEMPLATE',
    version: MATERIAL_LIBRARY_VERSION,
    templateId: input.templateId,
    templateVersion: String(input.templateVersion || '1.0.0'),
    materialType: input.materialType,
    geometry: clone(input.geometry),
    defaultParameters: clone(input.defaultParameters || {}),
    editableParameters: clone(input.editableParameters || {}),
    constraints: clone(input.constraints || []),
    semanticRole: input.semanticRole,
    sourceBenchmark: clone(input.sourceBenchmark),
    validationState: clone(input.validationState),
    metadata: clone(input.metadata || {})
  };
  validateTemplate(template);
  const index = library.templates.findIndex(item => item.templateId === template.templateId);
  if (index >= 0 && !replace) throw Object.assign(new Error(`INK_MATERIAL_TEMPLATE_EXISTS:${template.templateId}`), { code: 'MATERIAL_TEMPLATE_EXISTS', templateId: template.templateId });
  if (index >= 0) library.templates.splice(index, 1, template); else library.templates.push(template);
  library.templates.sort((a, b) => a.templateId.localeCompare(b.templateId));
  return clone(template);
}

export function getMaterialTemplate(document, templateId) {
  const template = ensureMaterialLibrary(document).templates.find(item => item.templateId === templateId);
  if (!template) throw Object.assign(new Error(`INK_MATERIAL_TEMPLATE_NOT_FOUND:${templateId}`), { code: 'MATERIAL_TEMPLATE_NOT_FOUND', templateId });
  return template;
}

function synchronizeRepeatSources(document, instance) {
  const walk = objects => {
    for (const object of objects || []) {
      if (object.type === 'repeat' && object.sourceMaterialInstanceId === instance.id) {
        object.source = clone(instance);
        object.source.id = instance.id;
        object.templateId = instance.materialInstance?.templateId || object.templateId || null;
        object.templateVersion = instance.materialInstance?.templateVersion || object.templateVersion || null;
        refreshRepeatInstances(object);
      }
      if (object.type === 'group') walk(object.children);
    }
  };
  for (const page of document.pages || []) for (const layer of page.layers || []) walk(layer.objects);
}

function rebuildInstance(document, instance, template, { parameterOverrides = instance.materialInstance?.parameterOverrides || {}, transform = instance.matrix } = {}) {
  const parameters = validateParameters(template, { ...templateDefaults(template), ...clone(parameterOverrides) });
  const realized = realizedGeometry(template, parameters, instance.id);
  const priorGenerated = new Set(instance.materialInstance?.realizedChildIds || []);
  const retained = (instance.children || []).filter(child => !priorGenerated.has(child.id));
  instance.children = [...realized, ...retained];
  instance.matrix = Array.isArray(transform) && transform.length === 6 ? [...transform] : Matrix.identity();
  instance.name = instance.name || `${template.materialType} instance`;
  instance.semantic = { ...(instance.semantic || {}), role: instance.materialInstance?.semanticRole || template.semanticRole };
  instance.metadata = { ...(instance.metadata || {}), semanticLabel: instance.semantic.role, materialType: template.materialType };
  normalizeMaterialTree(instance);
  instance.materialInstance = {
    format: 'INK-MATERIAL-INSTANCE',
    version: MATERIAL_LIBRARY_VERSION,
    instanceId: instance.id,
    templateId: template.templateId,
    templateVersion: template.templateVersion,
    parameterOverrides: clone(parameterOverrides),
    effectiveParameters: clone(parameters),
    transform: [...instance.matrix],
    parentId: instance.parentId || null,
    semanticRole: instance.semantic.role,
    detached: false,
    localOverrideState: {
      parameters: Object.keys(parameterOverrides).sort(),
      geometryDetached: false,
      styleDetached: false
    },
    realizedChildIds: realized.map(child => child.id),
    geometryHash: stableHash(realized),
    templateSource: clone(template.sourceBenchmark)
  };
  synchronizeRepeatSources(document, instance);
  return instance;
}

export function createMaterialInstance(document, templateId, options = {}) {
  const template = getMaterialTemplate(document, templateId);
  const instanceId = options.instanceId || stableCompositeId('material-instance', [templateId, options.instanceKey || listMaterialInstances(document, templateId).length]);
  if (findObjectEntry(document, instanceId)) throw Object.assign(new Error(`INK_MATERIAL_INSTANCE_EXISTS:${instanceId}`), { code: 'MATERIAL_INSTANCE_EXISTS', instanceId });
  const instance = {
    id: instanceId,
    type: 'group',
    name: options.name || `${template.materialType} ${instanceId}`,
    matrix: Array.isArray(options.transform) && options.transform.length === 6 ? [...options.transform] : Matrix.identity(),
    opacity: Number.isFinite(Number(options.opacity)) ? Number(options.opacity) : 1,
    children: [],
    parentId: options.parentId || null,
    semantic: { role: options.semanticRole || template.semanticRole },
    materialInstance: {
      semanticRole: options.semanticRole || template.semanticRole,
      parameterOverrides: clone(options.parameterOverrides || {})
    }
  };
  rebuildInstance(document, instance, template, { parameterOverrides: options.parameterOverrides || {}, transform: instance.matrix });
  insertObject(document, instance, options);
  return instance;
}

export function updateMaterialInstance(document, instanceId, changes = {}) {
  const entry = findObjectEntry(document, instanceId);
  if (!entry?.object?.materialInstance) throw Object.assign(new Error(`INK_MATERIAL_INSTANCE_NOT_FOUND:${instanceId}`), { code: 'MATERIAL_INSTANCE_NOT_FOUND', instanceId });
  const instance = entry.object;
  const template = getMaterialTemplate(document, instance.materialInstance.templateId);
  const overrides = { ...(instance.materialInstance.parameterOverrides || {}), ...(changes.parameterOverrides || {}) };
  if (Array.isArray(changes.clearOverrides)) for (const key of changes.clearOverrides) delete overrides[key];
  if (changes.semanticRole) instance.materialInstance.semanticRole = changes.semanticRole;
  if (changes.parentId !== undefined) instance.parentId = changes.parentId;
  return rebuildInstance(document, instance, template, { parameterOverrides: overrides, transform: changes.transform || instance.matrix });
}

export function updateMaterialTemplate(document, templateId, changes = {}, options = {}) {
  const library = ensureMaterialLibrary(document);
  const index = library.templates.findIndex(item => item.templateId === templateId);
  if (index < 0) throw Object.assign(new Error(`INK_MATERIAL_TEMPLATE_NOT_FOUND:${templateId}`), { code: 'MATERIAL_TEMPLATE_NOT_FOUND', templateId });
  const previous = library.templates[index];
  const next = {
    ...clone(previous),
    ...clone(changes),
    templateId,
    templateVersion: String(changes.templateVersion || options.templateVersion || previous.templateVersion),
    defaultParameters: { ...(previous.defaultParameters || {}), ...(changes.defaultParameters || {}) },
    editableParameters: { ...(previous.editableParameters || {}), ...(changes.editableParameters || {}) },
    metadata: { ...(previous.metadata || {}), ...(changes.metadata || {}) }
  };
  validateTemplate(next);
  library.templates.splice(index, 1, next);
  const targetIds = options.instanceIds ? new Set(options.instanceIds) : null;
  const updated = [], preservedDetached = [];
  for (const instance of listMaterialInstances(document, templateId)) {
    if (instance.materialInstance.detached) { preservedDetached.push(instance.id); continue; }
    if (targetIds && !targetIds.has(instance.id)) continue;
    rebuildInstance(document, instance, next);
    updated.push(instance.id);
  }
  return { template: clone(next), updatedInstanceIds: updated, preservedDetachedInstanceIds: preservedDetached };
}

export function detachMaterialInstance(document, instanceId) {
  const entry = findObjectEntry(document, instanceId);
  if (!entry?.object?.materialInstance) throw Object.assign(new Error(`INK_MATERIAL_INSTANCE_NOT_FOUND:${instanceId}`), { code: 'MATERIAL_INSTANCE_NOT_FOUND', instanceId });
  const instance = entry.object;
  const relation = clone(instance.materialInstance);
  delete instance.materialInstance;
  instance.metadata = { ...(instance.metadata || {}), detachedFromMaterial: { templateId: relation.templateId, templateVersion: relation.templateVersion, detachedAtStateHash: stableHash(instance.children || []) } };
  return instance;
}

export function installMaterialTemplates(document, templates, { replace = false } = {}) {
  const installed = [];
  for (const template of templates || []) installed.push(createMaterialTemplate(document, template, { replace }));
  return installed;
}

export function materialLibraryReport(document) {
  const library = ensureMaterialLibrary(document);
  const instances = listMaterialInstances(document);
  return {
    format: 'INK-MATERIAL-LIBRARY-REPORT',
    version: MATERIAL_LIBRARY_VERSION,
    templateCount: library.templates.length,
    instanceCount: instances.length,
    templates: library.templates.map(template => ({ templateId: template.templateId, templateVersion: template.templateVersion, materialType: template.materialType, validationState: template.validationState })),
    instances: instances.map(instance => clone(instance.materialInstance))
  };
}

export function reparentObject(document, childId, parentId) {
  const childEntry = findObjectEntry(document, childId);
  const parentEntry = findObjectEntry(document, parentId);
  if (!childEntry || !parentEntry?.object || parentEntry.object.type !== 'group') {
    throw Object.assign(new Error(`INK_HIERARCHY_REPARENT_INVALID:${parentId}->${childId}`), { code: 'HIERARCHY_REPARENT_INVALID', parentId, childId });
  }
  if (childEntry.object === parentEntry.object) throw Object.assign(new Error('INK_HIERARCHY_SELF_PARENT'), { code: 'HIERARCHY_SELF_PARENT' });
  const child = childEntry.container.splice(childEntry.index, 1)[0];
  parentEntry.object.children = Array.isArray(parentEntry.object.children) ? parentEntry.object.children : [];
  parentEntry.object.children.push(child);
  child.parentId = parentId;
  if (child.materialInstance) child.materialInstance.parentId = parentId;
  return child;
}
