import { createWorkflowIR } from '../workflow-ir.js';
import { SOURCE_ADAPTER_CONTRACT, createAdapterDetection, extensionOf } from '../source-adapters.js';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const normalizeKey = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

function finiteNumber(value, fallback = NaN) {
  const match = String(value ?? '').match(/[-+]?\d+(?:\.\d+)?/);
  const number = match ? Number(match[0]) : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function markdownStepBlocks(text) {
  const blocks = [];
  let current = null;
  const lines = String(text).split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const header = line.match(/^\s*#{1,6}\s*Step\s+(\d+)\s*(?::|[-–—])\s*(.+?)\s*$/i)
      || line.match(/^\s*(\d+)\.\s*\*\*(.+?)\*\*\s*$/);
    if (header) {
      current = { order: Number(header[1]), title: header[2].trim(), line: index + 1, fields: {}, raw: [line.trim()] };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    const field = line.match(/^\s*[-*]\s*([^:]+?)\s*:\s*(.*?)\s*$/)
      || line.match(/^\s*([^:#][^:]*?)\s*:\s*(.*?)\s*$/);
    if (field) current.fields[normalizeKey(field[1])] = field[2].trim();
    if (line.trim()) current.raw.push(line.trim());
  }
  return blocks;
}

function lineEvidence(block) {
  return [{ label: 'Figma Skill Markdown', line: block.line, excerpt: block.raw.join(' | ').slice(0, 260) }];
}

function dependency(value) {
  if (!value) return [];
  const source = String(value);
  const numbers = [...source.matchAll(/\d+/g)].map(match => match[0]);
  if (numbers.length) return numbers.map(number => 'figma_skill_step_' + String(Number(number)).padStart(3, '0'));
  return source.split(',').map(token => token.trim()).filter(Boolean);
}

function repeat(value) {
  if (!value) return null;
  const count = finiteNumber(value);
  return Number.isFinite(count) ? { count, source: String(value) } : { source: String(value) };
}

function common(block) {
  return {
    operationId: 'figma_skill_step_' + String(block.order).padStart(3, '0'),
    order: block.order,
    sourceSoftware: 'Figma',
    sourceCommand: block.title,
    dependency: dependency(block.fields['depends on'] || block.fields.dependency || block.fields.dependencies),
    condition: block.fields.condition ? { source: block.fields.condition } : null,
    repeat: repeat(block.fields.repeat),
    destructive: false,
    deterministic: true,
    confidence: 0.95,
    evidence: lineEvidence(block)
  };
}

function canonicalStep(block) {
  const base = common(block);

  if (/create\s+rectangle|rectangle/i.test(block.title)) {
    const has = key => Object.prototype.hasOwnProperty.call(block.fields, key) && String(block.fields[key]).trim() !== '';
    const parameters = {};
    const missing = [];
    const invalid = [];
    for (const key of ['x', 'y', 'width', 'height', 'fill', 'stroke', 'stroke width']) if (!has(key)) missing.push(key);

    if (has('x')) {
      const value = finiteNumber(block.fields.x);
      Number.isFinite(value) ? parameters.x = value : invalid.push('x');
    }
    if (has('y')) {
      const value = finiteNumber(block.fields.y);
      Number.isFinite(value) ? parameters.y = value : invalid.push('y');
    }
    if (has('width')) {
      const value = finiteNumber(block.fields.width);
      Number.isFinite(value) && value > 0 ? parameters.width = value : invalid.push('width');
    }
    if (has('height')) {
      const value = finiteNumber(block.fields.height);
      Number.isFinite(value) && value > 0 ? parameters.height = value : invalid.push('height');
    }
    if (has('fill')) parameters.fill = block.fields.fill;
    if (has('stroke')) parameters.stroke = block.fields.stroke;
    if (has('stroke width')) {
      const value = finiteNumber(block.fields['stroke width']);
      Number.isFinite(value) && value >= 0 ? parameters['stroke-width'] = value : invalid.push('stroke width');
    }

    const issues = [...missing.map(field => 'missing:' + field), ...invalid.map(field => 'invalid:' + field)];
    const exact = issues.length === 0;
    return {
      ...base,
      operation: 'path.rectangle',
      category: 'Vector Operation',
      target: { kind: 'active-canvas', selector: block.fields.target || 'active' },
      parameters,
      input: {
        kind: 'active-canvas',
        sourceParametersProvided: Object.keys(block.fields),
        missingRequiredFields: missing,
        invalidRequiredFields: invalid
      },
      output: { kind: 'path', shape: 'rectangle', width: parameters.width ?? null, height: parameters.height ?? null },
      inkCapabilityMapping: 'path.rectangle',
      fallbackCandidate: exact ? null : 'request missing/invalid rectangle source parameters before claiming exact translation',
      unsupportedReason: exact ? null : 'rectangle is underspecified; no defaults invented; ' + issues.join(', '),
      unsupportedStep: !exact,
      conversionStatus: exact ? 'DIRECT' : 'PARTIAL'
    };
  }

  if (/create\s+ellipse|ellipse|circle/i.test(block.title)) {
    const has = key => Object.prototype.hasOwnProperty.call(block.fields, key) && String(block.fields[key]).trim() !== '';
    const parameters = {};
    const missing = [];
    const invalid = [];

    const hasCx = has('cx') || has('center x');
    const hasCy = has('cy') || has('center y');
    const hasRadius = has('radius');
    const hasRx = has('rx');
    const hasRy = has('ry');
    if (!hasCx) missing.push('center x');
    if (!hasCy) missing.push('center y');
    if (!(hasRadius || hasRx)) missing.push('radius/rx');
    if (!(hasRadius || hasRy)) missing.push('radius/ry');
    for (const key of ['fill', 'stroke', 'stroke width']) if (!has(key)) missing.push(key);

    if (hasCx) {
      const value = finiteNumber(has('cx') ? block.fields.cx : block.fields['center x']);
      Number.isFinite(value) ? parameters.cx = value : invalid.push('center x');
    }
    if (hasCy) {
      const value = finiteNumber(has('cy') ? block.fields.cy : block.fields['center y']);
      Number.isFinite(value) ? parameters.cy = value : invalid.push('center y');
    }
    if (hasRadius || hasRx) {
      const value = finiteNumber(has('rx') ? block.fields.rx : block.fields.radius);
      Number.isFinite(value) && value > 0 ? parameters.rx = value : invalid.push('radius/rx');
    }
    if (hasRadius || hasRy) {
      const value = finiteNumber(has('ry') ? block.fields.ry : block.fields.radius);
      Number.isFinite(value) && value > 0 ? parameters.ry = value : invalid.push('radius/ry');
    }
    if (has('fill')) parameters.fill = block.fields.fill;
    if (has('stroke')) parameters.stroke = block.fields.stroke;
    if (has('stroke width')) {
      const value = finiteNumber(block.fields['stroke width']);
      Number.isFinite(value) && value >= 0 ? parameters['stroke-width'] = value : invalid.push('stroke width');
    }

    const issues = [...missing.map(field => 'missing:' + field), ...invalid.map(field => 'invalid:' + field)];
    const exact = issues.length === 0;
    return {
      ...base,
      operation: 'path.ellipse',
      category: 'Vector Operation',
      target: { kind: 'active-canvas', selector: block.fields.target || 'active' },
      parameters,
      input: {
        kind: 'active-canvas',
        sourceParametersProvided: Object.keys(block.fields),
        missingRequiredFields: missing,
        invalidRequiredFields: invalid
      },
      output: { kind: 'path', shape: 'ellipse', rx: parameters.rx ?? null, ry: parameters.ry ?? null },
      inkCapabilityMapping: 'path.ellipse',
      fallbackCandidate: exact ? null : 'request missing/invalid ellipse source parameters before claiming exact translation',
      unsupportedReason: exact ? null : 'ellipse is underspecified; no defaults invented; ' + issues.join(', '),
      unsupportedStep: !exact,
      conversionStatus: exact ? 'DIRECT' : 'PARTIAL'
    };
  }

  const judgment = /polish|balance|refine|harmoni[sz]e|make\s+.*feel|visually|judg/i.test(block.title + ' ' + JSON.stringify(block.fields));
  return {
    ...base,
    operation: 'external.figmaSkillJudgment',
    category: 'External Dependency',
    target: { kind: 'design-judgment', selector: block.fields.target || 'active' },
    parameters: { instruction: block.title, fields: clone(block.fields) },
    input: { kind: 'figma-skill-markdown' },
    output: { kind: 'review-required' },
    inkCapabilityMapping: null,
    fallbackCandidate: 'human/agent design judgment after translated executable steps',
    unsupportedReason: judgment
      ? 'judgment-based Figma Skill instruction has no exact source parameters; retained without inventing values'
      : 'Figma Skill step is outside the bounded Markdown module mapping',
    unsupportedStep: true,
    conversionStatus: 'PARTIAL'
  };
}

export const FIGMA_SKILL_MARKDOWN_MODULE = Object.freeze({
  id: 'figma-skill-markdown-v1',
  contract: SOURCE_ADAPTER_CONTRACT,
  version: 1,
  sourceTypes: ['FIGMA_SKILL_MARKDOWN'],
  sourceSoftware: 'Figma',

  detect({ name = '', text = '', bytes = null } = {}) {
    if (bytes) return { accepted: false, confidence: 0 };
    const source = String(text || '');
    const markers = [
      /Figma/i.test(source),
      /\bSkill\b/i.test(source),
      /^\s*#{1,6}\s*Step\s+1\s*(?::|[-–—])/mi.test(source)
    ];
    const confidence = markers.filter(Boolean).length / markers.length;
    return {
      accepted: confidence === 1,
      confidence,
      detection: createAdapterDetection({
        format: 'FIGMA_SKILL_MARKDOWN',
        sourceSoftware: 'Figma',
        confidence,
        extension: extensionOf(name),
        evidence: 'readable Figma Skill Markdown markers'
      })
    };
  },

  parse({ name = 'figma-skill.md', text = '', metadata = {} } = {}) {
    const skillName = String(text).match(/^\s*#\s*(?:Figma\s+Skill\s*[:—-]?\s*)?(.+?)\s*$/mi)?.[1]?.trim() || name;
    const blocks = markdownStepBlocks(text);
    if (!blocks.length) throw Object.assign(new Error('INK_READABLE_WORKFLOW_STEPS_REQUIRED'), { code: 'MALFORMED_ASSET' });
    const operations = blocks.map(canonicalStep);
    return createWorkflowIR({
      source: metadata.source || { name, format: 'FIGMA_SKILL_MARKDOWN', sourceSoftware: 'Figma' },
      metadata: { ...clone(metadata), name: skillName, sourceSoftware: 'Figma', sourceFormat: 'FIGMA_SKILL_MARKDOWN', readOnly: true },
      operations,
      dependencies: [],
      warnings: operations.some(operation => operation.unsupportedStep) ? ['one or more Figma Skill instructions require bounded semantic/judgment handling'] : [],
      adapter: {
        id: this.id,
        contract: this.contract,
        version: this.version,
        boundary: 'readable Markdown Skill instructions only; full Weave graph access/execution is explicitly excluded'
      }
    });
  }
});

export const FIGMA_SKILL_MARKDOWN_ADAPTER = FIGMA_SKILL_MARKDOWN_MODULE;
