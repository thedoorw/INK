import { createWorkflowIR } from '../workflow-ir.js';
import { SOURCE_ADAPTER_CONTRACT, createAdapterDetection, extensionOf } from '../source-adapters.js';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const normalizeKey = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

function parseBoolean(value, fallback = true) {
  if (value == null) return fallback;
  if (/^(true|yes|on|1)$/i.test(String(value).trim())) return true;
  if (/^(false|no|off|0)$/i.test(String(value).trim())) return false;
  return fallback;
}

function stepBlocks(text) {
  const blocks = [];
  let current = null;
  const lines = String(text).split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const header = line.match(/^\s*Step\s+(\d+)\s*:\s*(.+?)\s*$/i);
    if (header) {
      current = { order: Number(header[1]), title: header[2].trim(), line: index + 1, fields: {}, raw: [line.trim()] };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    const field = line.match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);
    if (field) current.fields[normalizeKey(field[1])] = field[2].trim();
    if (line.trim()) current.raw.push(line.trim());
  }
  return blocks;
}

function lineEvidence(block) {
  return [{ label: 'readable action text', line: block.line, excerpt: block.raw.join(' | ').slice(0, 260) }];
}

function canonicalStep(block, previousId) {
  const operationId = 'ps_action_step_' + String(block.order).padStart(3, '0');
  const common = {
    operationId,
    order: block.order,
    sourceSoftware: 'Adobe Photoshop',
    sourceCommand: block.title,
    dependency: previousId ? [previousId] : [],
    condition: null,
    repeat: null,
    destructive: false,
    deterministic: true,
    confidence: 0.95,
    evidence: lineEvidence(block)
  };

  if (/image\s*size|resize/i.test(block.title)) {
    const widthMatch = String(block.fields.width || '').match(/([-+]?\d+(?:\.\d+)?)\s*(px|pixels?)?/i);
    const width = widthMatch ? Number(widthMatch[1]) : NaN;
    return {
      ...common,
      operation: 'image.resize',
      category: 'Raster Operation',
      target: { kind: 'active-raster-image', selector: 'active' },
      parameters: { width, unit: 'px', preserveAspectRatio: parseBoolean(block.fields['constrain proportions'], true) },
      input: { kind: 'active-raster-image', width: 'source' },
      output: { kind: 'active-raster-image', width, unit: 'px' },
      inkCapabilityMapping: 'image.resize',
      fallbackCandidate: null,
      unsupportedReason: Number.isFinite(width) && width > 0 ? null : 'readable Image Size step is missing a positive pixel width',
      unsupportedStep: !(Number.isFinite(width) && width > 0),
      conversionStatus: Number.isFinite(width) && width > 0 ? 'EQUIVALENT' : 'PARTIAL'
    };
  }

  if (/hue\s*\/?\s*saturation/i.test(block.title)) {
    const saturation = Number(String(block.fields.saturation || '0').replace(/[^\d+.-]/g, ''));
    return {
      ...common,
      operation: 'adjustment.hueSaturation',
      category: 'Adjustment',
      target: { kind: 'active-layer', selector: 'active' },
      parameters: { saturation: Number.isFinite(saturation) ? saturation : 0, mode: block.fields.mode || 'Non-Destructive Adjustment' },
      input: { kind: 'active-layer' },
      output: { adjustment: 'hueSaturation', saturation: Number.isFinite(saturation) ? saturation : 0 },
      inkCapabilityMapping: 'adjustment.hueSaturation',
      fallbackCandidate: null,
      unsupportedReason: null,
      unsupportedStep: false,
      conversionStatus: 'DIRECT'
    };
  }

  if (/export|save\s+for\s+web/i.test(block.title)) {
    const format = String(block.fields.format || 'PNG').trim().toLowerCase();
    return {
      ...common,
      operation: 'export.file',
      category: 'Export',
      target: { kind: 'active-image', selector: 'active' },
      parameters: { format, scope: 'active-image' },
      input: { kind: 'active-image' },
      output: { format, materialization: 'host-export-authority' },
      inkCapabilityMapping: 'export.file',
      fallbackCandidate: 'materialize the generated export intent through the host PNG export authority',
      unsupportedReason: 'RecipeEngine export records an export intent; it does not materialize an external file',
      unsupportedStep: false,
      conversionStatus: 'PARTIAL'
    };
  }

  return {
    ...common,
    operation: 'external.photoshopActionStep',
    category: 'External Dependency',
    target: { kind: 'unknown' },
    parameters: { fields: clone(block.fields), title: block.title },
    input: {},
    output: {},
    inkCapabilityMapping: null,
    fallbackCandidate: 'manual mapping review',
    unsupportedReason: 'readable Photoshop Action step is outside the bounded Issue #159 PoC',
    unsupportedStep: true,
    conversionStatus: 'PARTIAL'
  };
}

export const PHOTOSHOP_ACTION_TEXT_MODULE = Object.freeze({
  id: 'photoshop-action-readable-text-v1',
  contract: SOURCE_ADAPTER_CONTRACT,
  version: 1,
  sourceTypes: ['PHOTOSHOP_ACTION_TEXT'],
  sourceSoftware: 'Adobe Photoshop',

  detect({ name = '', text = '', bytes = null } = {}) {
    if (bytes && extensionOf(name) === 'atn') return { accepted: false, confidence: 0 };
    const source = String(text || '');
    const markers = [
      /Adobe\s+Photoshop/i.test(source),
      /^\s*Action\s*:/mi.test(source),
      /^\s*Step\s+1\s*:/mi.test(source),
      /Image\s*Size|Hue\s*\/?\s*Saturation|Export/i.test(source)
    ];
    const confidence = markers.filter(Boolean).length / markers.length;
    return {
      accepted: confidence === 1,
      confidence,
      detection: createAdapterDetection({
        format: 'PHOTOSHOP_ACTION_TEXT',
        sourceSoftware: 'Adobe Photoshop',
        confidence,
        extension: extensionOf(name),
        evidence: 'readable Photoshop Action transcript markers'
      })
    };
  },

  parse({ name = 'photoshop-action.txt', text = '', metadata = {} } = {}) {
    const actionName = String(text).match(/^\s*Action\s*:\s*(.+?)\s*$/mi)?.[1]?.trim() || name;
    const blocks = stepBlocks(text);
    if (!blocks.length) throw Object.assign(new Error('INK_READABLE_WORKFLOW_STEPS_REQUIRED'), { code: 'MALFORMED_ASSET' });
    let previousId = null;
    const operations = blocks.map(block => {
      const operation = canonicalStep(block, previousId);
      previousId = operation.operationId;
      return operation;
    });
    return createWorkflowIR({
      source: metadata.source || { name, format: 'PHOTOSHOP_ACTION_TEXT', sourceSoftware: 'Adobe Photoshop' },
      metadata: { ...clone(metadata), name: actionName, sourceSoftware: 'Adobe Photoshop', sourceFormat: 'PHOTOSHOP_ACTION_TEXT', readOnly: true },
      operations,
      dependencies: [],
      warnings: operations.some(operation => operation.unsupportedStep) ? ['one or more readable action steps require manual mapping'] : [],
      adapter: {
        id: this.id,
        contract: this.contract,
        version: this.version,
        boundary: 'human-readable Photoshop Action transcript only; .atn binary parsing is explicitly excluded'
      }
    });
  }
});

export const PHOTOSHOP_ACTION_TEXT_ADAPTER = PHOTOSHOP_ACTION_TEXT_MODULE;
