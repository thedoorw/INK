import { createWorkflowIR } from '../workflow-ir.js';
import { SOURCE_ADAPTER_CONTRACT, createAdapterDetection, extensionOf } from '../source-adapters.js';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function parsePayload(text) {
  let payload;
  try { payload = JSON.parse(String(text || '')); }
  catch { throw Object.assign(new Error('INK_CANVA_AUTOFILL_JSON_REQUIRED'), { code: 'MALFORMED_ASSET' }); }
  const fields = payload?.template?.fields || payload?.fields;
  const rows = payload?.rows || payload?.dataset?.rows;
  const layout = payload?.template?.layout ?? null;
  const mappings = payload?.template?.mappings ?? payload?.mappings ?? null;
  if (!Array.isArray(fields) || !fields.length || !Array.isArray(rows) || !rows.length) {
    throw Object.assign(new Error('INK_CANVA_AUTOFILL_SCHEMA_ROWS_REQUIRED'), { code: 'MALFORMED_ASSET' });
  }
  return { payload, fields, rows, layout, mappings };
}

function variantFileName(pattern, row, index, format) {
  const source = pattern || `variant-{row.id}.${format}`;
  return source
    .replace(/\{row\.id\}/g, String(row.id || `row-${index + 1}`))
    .replace(/\{rowIndex\}/g, String(index + 1));
}

function analyzeLayout(layout) {
  if (layout == null) return { present: false, raw: null, supported: true, unsupported: [] };
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
    return { present: true, raw: clone(layout), supported: false, unsupported: ['layout must be an object'] };
  }
  const unsupported = [];
  const width = Number(layout.width);
  const height = Number(layout.height);
  if (!(Number.isFinite(width) && width > 0)) unsupported.push('layout.width must be a positive number');
  if (!(Number.isFinite(height) && height > 0)) unsupported.push('layout.height must be a positive number');
  if (layout.unit != null && String(layout.unit).toLowerCase() !== 'px') unsupported.push('layout.unit supports px only');
  const extraKeys = Object.keys(layout).filter(key => !['width', 'height', 'unit'].includes(key));
  if (extraKeys.length) unsupported.push('unsupported layout keys: ' + extraKeys.join(', '));
  return {
    present: true,
    raw: clone(layout),
    normalized: {
      ...(Number.isFinite(width) ? { width } : {}),
      ...(Number.isFinite(height) ? { height } : {}),
      ...(layout.unit != null ? { unit: String(layout.unit).toLowerCase() } : { unit: 'px' })
    },
    supported: unsupported.length === 0,
    unsupported
  };
}

function analyzeMappings(fields, mappings) {
  const fieldKeys = new Set(fields.map((field, index) => String(field.key || field.name || 'field-' + (index + 1))));
  const normalized = {};
  const unsupported = [];
  const source = mappings && typeof mappings === 'object' && !Array.isArray(mappings) ? mappings : {};
  if (mappings != null && source !== mappings) unsupported.push({ fieldKey: null, reason: 'template.mappings must be an object', mapping: clone(mappings) });

  for (const [fieldKey, mapping] of Object.entries(source)) {
    if (!fieldKeys.has(fieldKey)) {
      unsupported.push({ fieldKey, reason: 'mapping references unknown field', mapping: clone(mapping) });
      continue;
    }
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
      unsupported.push({ fieldKey, reason: 'mapping must be an object', mapping: clone(mapping) });
      continue;
    }
    const target = String(mapping.target || '').trim();
    const property = String(mapping.property || '').trim();
    const field = fields.find((candidate, index) => String(candidate.key || candidate.name || 'field-' + (index + 1)) === fieldKey);
    const type = String(field?.type || 'text').toLowerCase();
    const allowedProperties = type === 'image' || type === 'media' ? ['source', 'media'] : ['text', 'content'];
    const reasons = [];
    if (!target) reasons.push('mapping.target is required');
    if (!property) reasons.push('mapping.property is required');
    else if (!allowedProperties.includes(property.toLowerCase())) reasons.push('mapping.property ' + property + ' unsupported for field type ' + type);
    normalized[fieldKey] = { target: target || null, property: property || null, raw: clone(mapping), supported: reasons.length === 0, unsupported: reasons };
    if (reasons.length) unsupported.push({ fieldKey, reason: reasons.join('; '), mapping: clone(mapping) });
  }
  return { present: mappings != null, raw: clone(mappings), normalized, unsupported };
}

function operationsFor(payload, fields, rows, layoutAnalysis, mappingAnalysis) {
  const operations = [];
  const output = payload.output || {};
  let order = 0;

  if (layoutAnalysis.present) {
    order += 1;
    operations.push({
      operationId: 'canva_template_layout_001',
      order,
      sourceSoftware: 'Canva',
      sourceCommand: 'Preserve template layout',
      dependency: [],
      condition: null,
      repeat: null,
      destructive: false,
      deterministic: true,
      confidence: 0.98,
      evidence: [{ label: 'Canva template layout', source: clone(layoutAnalysis.raw) }],
      operation: 'external.canvaTemplateLayout',
      category: 'Layout',
      target: { kind: 'template', selector: payload.template?.id || 'template' },
      parameters: {
        sourceLayout: clone(layoutAnalysis.raw),
        normalizedLayout: clone(layoutAnalysis.normalized || null),
        unsupported: clone(layoutAnalysis.unsupported)
      },
      input: { kind: 'canva-template-layout', source: clone(layoutAnalysis.raw) },
      output: { kind: 'layout-intent', preserved: true, materialized: false },
      inkCapabilityMapping: null,
      fallbackCandidate: 'preserve layout intent for a future bounded layout authority',
      unsupportedReason: layoutAnalysis.supported
        ? 'template layout is preserved as source-faithful layout intent; Canva-native layout materialization is outside this package'
        : 'template layout contains unsupported values: ' + layoutAnalysis.unsupported.join('; '),
      unsupportedStep: true,
      conversionStatus: 'PARTIAL'
    });
  }

  for (const unsupportedMapping of mappingAnalysis.unsupported.filter(item => !fields.some((field, index) => String(field.key || field.name || 'field-' + (index + 1)) === item.fieldKey))) {
    order += 1;
    operations.push({
      operationId: 'canva_template_mapping_' + String(order).padStart(3, '0'),
      order,
      sourceSoftware: 'Canva',
      sourceCommand: 'Preserve unsupported field mapping',
      dependency: [],
      condition: null,
      repeat: null,
      destructive: false,
      deterministic: true,
      confidence: 0.98,
      evidence: [{ label: 'Canva template mapping', field: unsupportedMapping.fieldKey, mapping: clone(unsupportedMapping.mapping) }],
      operation: 'external.canvaFieldMapping',
      category: 'Mapping',
      target: { kind: 'template-field', selector: unsupportedMapping.fieldKey || 'unknown' },
      parameters: { fieldKey: unsupportedMapping.fieldKey, mapping: clone(unsupportedMapping.mapping) },
      input: { kind: 'canva-template-mapping' },
      output: { kind: 'mapping-review-required' },
      inkCapabilityMapping: null,
      fallbackCandidate: 'manual mapping review',
      unsupportedReason: unsupportedMapping.reason,
      unsupportedStep: true,
      conversionStatus: 'PARTIAL'
    });
  }

  rows.forEach((row, rowIndex) => {
    const rowId = String(row.id || 'row-' + (rowIndex + 1));
    const repeat = { mode: 'dataset-row', rowIndex, rowId, count: rows.length };
    const fieldOperationIds = [];

    fields.forEach((field, fieldIndex) => {
      const key = String(field.key || field.name || 'field-' + (fieldIndex + 1));
      const value = row[key];
      const type = String(field.type || 'text').toLowerCase();
      const operationId = 'canva_row_' + String(rowIndex + 1).padStart(3, '0') + '_field_' + key.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
      const mapping = mappingAnalysis.normalized[key] || null;
      const mappingExpected = mappingAnalysis.present;
      const mappingSupported = !mappingExpected || Boolean(mapping?.supported);
      const selector = mapping?.target || key;
      const property = mapping?.property || null;
      fieldOperationIds.push(operationId);
      order += 1;

      const common = {
        operationId,
        order,
        sourceSoftware: 'Canva',
        sourceCommand: 'Autofill ' + key + ' for ' + rowId,
        dependency: [],
        condition: null,
        repeat,
        destructive: false,
        deterministic: true,
        confidence: 0.98,
        evidence: [{
          label: 'Canva controlled dataset',
          row: rowIndex + 1,
          field: key,
          mapping: mapping ? clone(mapping.raw) : null
        }]
      };
      const mappingReason = !mappingExpected
        ? null
        : !mapping
          ? 'template.mappings is present but no mapping is declared for field ' + key
          : mapping.supported
            ? null
            : mapping.unsupported.join('; ');

      if (type === 'image' || type === 'media') {
        operations.push({
          ...common,
          operation: 'import.raster',
          category: 'Import',
          target: { kind: 'template-field', selector, role: field.role || 'image', property },
          parameters: { source: value, fieldKey: key, role: field.role || 'image', rowId, linked: true, mapping: mapping ? clone(mapping.raw) : null, target: selector, property },
          input: { datasetRow: rowId, fieldKey: key, valueType: type, mapping: mapping ? clone(mapping.raw) : null },
          output: { kind: 'raster-import-intent', role: field.role || 'image', target: selector, property },
          inkCapabilityMapping: 'import.raster',
          fallbackCandidate: 'resolve linked media through the host import authority',
          unsupportedReason: mappingReason || 'controlled fixture preserves image-role/source semantics as an INK raster import intent; external media bytes are not embedded',
          unsupportedStep: !mappingSupported,
          conversionStatus: 'PARTIAL'
        });
      } else {
        operations.push({
          ...common,
          operation: 'input.parameter',
          category: 'Parameter',
          target: { kind: 'template-field', selector, role: field.role || 'text', property },
          parameters: { name: key + '@' + rowId, value, fieldKey: key, role: field.role || 'text', rowId, valueType: type, mapping: mapping ? clone(mapping.raw) : null, target: selector, property },
          input: { datasetRow: rowId, fieldKey: key, valueType: type, mapping: mapping ? clone(mapping.raw) : null },
          output: { kind: 'parameter-request', name: key + '@' + rowId, target: selector, property },
          inkCapabilityMapping: 'input.parameter',
          fallbackCandidate: mappingSupported ? null : 'manual field mapping review',
          unsupportedReason: mappingReason,
          unsupportedStep: !mappingSupported,
          conversionStatus: mappingSupported ? 'DIRECT' : 'PARTIAL'
        });
      }
    });

    order += 1;
    const format = String(output.format || 'png').toLowerCase();
    const fileName = variantFileName(output.variantPattern, row, rowIndex, format);
    operations.push({
      operationId: 'canva_row_' + String(rowIndex + 1).padStart(3, '0') + '_variant',
      order,
      sourceSoftware: 'Canva',
      sourceCommand: 'Generate variant ' + rowId,
      dependency: fieldOperationIds,
      condition: null,
      repeat,
      destructive: false,
      deterministic: true,
      confidence: 0.98,
      evidence: [{ label: 'Canva controlled dataset variant', row: rowIndex + 1, rowId }],
      operation: 'export.file',
      category: 'Export',
      target: { kind: 'variant', selector: rowId },
      parameters: { format, variantId: rowId, fileName, sourceRowIndex: rowIndex },
      input: { kind: 'autofill-row', rowId },
      output: { kind: 'variant-output-intent', format, fileName },
      inkCapabilityMapping: 'export.file',
      fallbackCandidate: 'materialize variant output through the host export authority',
      unsupportedReason: 'RecipeEngine records variant export intent; Canva-native rendering and external file materialization are not claimed',
      unsupportedStep: false,
      conversionStatus: 'PARTIAL'
    });
  });

  return operations;
}

export const CANVA_AUTOFILL_DATASET_MODULE = Object.freeze({
  id: 'canva-autofill-dataset-v1',
  contract: SOURCE_ADAPTER_CONTRACT,
  version: 1,
  sourceTypes: ['CANVA_AUTOFILL_DATASET'],
  sourceSoftware: 'Canva',

  detect({ name = '', text = '', bytes = null } = {}) {
    if (bytes) return { accepted: false, confidence: 0 };
    const source = String(text || '');
    const markers = [
      /"format"\s*:\s*"CANVA_AUTOFILL_DATASET"/i.test(source),
      /"rows"\s*:/i.test(source),
      /"fields"\s*:/i.test(source)
    ];
    const confidence = markers.filter(Boolean).length / markers.length;
    return {
      accepted: confidence === 1,
      confidence,
      detection: createAdapterDetection({
        format: 'CANVA_AUTOFILL_DATASET',
        sourceSoftware: 'Canva',
        confidence,
        extension: extensionOf(name),
        evidence: 'controlled Canva autofill schema/dataset markers'
      })
    };
  },

  parse({ name = 'canva-autofill.json', text = '', metadata = {} } = {}) {
    const { payload, fields, rows, layout, mappings } = parsePayload(text);
    const layoutAnalysis = analyzeLayout(layout);
    const mappingAnalysis = analyzeMappings(fields, mappings);
    const operations = operationsFor(payload, fields, rows, layoutAnalysis, mappingAnalysis);
    const fidelityWarnings = [
      ...layoutAnalysis.unsupported.map(reason => 'Canva layout: ' + reason),
      ...mappingAnalysis.unsupported.map(item => 'Canva mapping ' + (item.fieldKey || 'unknown') + ': ' + item.reason)
    ];
    return createWorkflowIR({
      source: metadata.source || { name, format: 'CANVA_AUTOFILL_DATASET', sourceSoftware: 'Canva' },
      metadata: {
        ...clone(metadata),
        name: payload.name || name,
        sourceSoftware: 'Canva',
        sourceFormat: 'CANVA_AUTOFILL_DATASET',
        templateId: payload.template?.id || null,
        fieldCount: fields.length,
        rowCount: rows.length,
        templateSchema: clone(fields),
        templateLayout: clone(layout),
        templateMappings: clone(mappings),
        layoutFidelity: clone(layoutAnalysis),
        mappingFidelity: clone(mappingAnalysis),
        readOnly: true
      },
      operations,
      dependencies: [],
      warnings: [
        'Canva-native rendering equivalence is not claimed; layout is preserved as intent and image fields/variant outputs use existing INK import/export authorities',
        ...fidelityWarnings
      ],
      adapter: {
        id: this.id,
        contract: this.contract,
        version: this.version,
        boundary: 'controlled reusable field schema + dataset/autofill rows; generic Canva macro recording and native rendering are excluded'
      }
    });
  }
});

export const CANVA_AUTOFILL_DATASET_ADAPTER = CANVA_AUTOFILL_DATASET_MODULE;
