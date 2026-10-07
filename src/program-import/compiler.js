import { deterministicHash } from './canonical-operation.js';
import { toUserTranslationStatus } from './workflow-ir.js';

const clone = value => JSON.parse(JSON.stringify(value));

const supported = (recipeOp, params = {}, extra = {}) => ({ recipeOp, params, ...extra });
const MAP = Object.freeze({
  'document.create': () => supported('document', { action: 'ensure' }),
  'document.close': () => null,
  'image.resize': operation => supported('image', { action: 'resize', width: Number(operation.parameters?.width), height: operation.parameters?.height == null ? null : Number(operation.parameters.height), unit: operation.parameters?.unit || 'px', preserveAspectRatio: operation.parameters?.preserveAspectRatio !== false }),
  'layer.create': operation => supported('layer', { name: operation.parameters?.name || operation.target?.id || 'Imported Layer', kind: 'content' }),
  'layer.visibility': operation => supported('layer', { action: 'visibility', visible: operation.parameters?.visible !== false, name: operation.parameters?.name || null }),
  'group.create': operation => supported('group', { name: operation.parameters?.name || operation.target?.id || 'Imported Group' }),
  'object.create': operation => supported('object', { action: 'create', source: operation.parameters }),
  'object.add': operation => supported('object', { action: 'create', source: operation.parameters }),
  'object.duplicate': operation => supported('object', { action: 'duplicate', ...operation.parameters }),
  'object.instance': operation => supported('object', { action: 'instance', ...operation.parameters }),
  'object.set': operation => Object.keys(operation.parameters || {}).length ? supported('object', { action: 'set', values: operation.parameters }) : null,
  'path.create': operation => supported('path', { shape: 'path', attributes: operation.parameters }),
  'path.setAnchors': operation => supported('path', { action: 'setAnchors', attributes: operation.parameters }),
  'path.ellipse': operation => supported('path', { shape: 'ellipse', attributes: operation.parameters }),
  'path.rectangle': operation => supported('path', { shape: 'rectangle', attributes: operation.parameters }),
  'path.polygon': operation => supported('path', { shape: 'polygon', attributes: operation.parameters }),
  'path.polyline': operation => supported('path', { shape: 'polyline', attributes: operation.parameters }),
  'path.createMesh': operation => supported('path', { shape: 'mesh', attributes: operation.parameters }, { quality: 'PARTIAL' }),
  'selection.set': operation => supported('selection', { action: 'set', ...operation.parameters }),
  'selection.all': () => supported('selection', { action: 'all' }),
  'selection.clear': () => supported('selection', { action: 'clear' }),
  'selection.invert': () => supported('selection', { action: 'invert' }),
  'selection.feather': operation => supported('selection', { action: 'feather', ...operation.parameters }),
  'selection.expand': operation => supported('selection', { action: 'expand', ...operation.parameters }),
  'selection.contract': operation => supported('selection', { action: 'contract', ...operation.parameters }),
  'mask.vector': operation => supported('mask', operation.parameters),
  'mask.clippingPath': operation => supported('mask', { type: 'clipping', ...operation.parameters }),
  'mask.gradient': operation => supported('mask', { type: 'gradient', ...operation.parameters }, { quality: 'APPROXIMATED' }),
  'transform.translate': operation => supported('transform', { action: 'translate', ...operation.parameters }),
  'transform.rotate': operation => supported('transform', { action: 'rotate', ...operation.parameters }),
  'transform.scale': operation => supported('transform', { action: 'scale', ...operation.parameters }),
  'transform.matrix': operation => supported('transform', { action: 'matrix', ...operation.parameters }),
  'fill.apply': operation => supported('style', { fill: operation.parameters?.color || operation.parameters?.fill || '#000000' }),
  'stroke.apply': operation => supported('style', { stroke: operation.parameters?.color || operation.parameters?.stroke || '#000000', strokeWidth: operation.parameters?.width || 1 }),
  'style.apply': operation => supported('style', operation.parameters),
  'gradient.linear': operation => supported('style', { gradient: { type: 'linear', ...operation.parameters } }),
  'gradient.radial': operation => supported('style', { gradient: { type: 'radial', ...operation.parameters } }),
  'gradient.apply': operation => supported('style', { gradient: operation.parameters }),
  'boolean.apply': operation => supported('boolean', { operation: operation.parameters?.operation || 'union', ...operation.parameters }),
  'repeat.apply': operation => supported('repeat', operation.parameters),
  'repeat.radial': operation => supported('repeat', { mode: 'radial', count: operation.parameters?.count || 7, angleStart: operation.parameters?.angleStart || 0, angleEnd: operation.parameters?.angleEnd || 360, center: operation.parameters?.center || { x: 0, y: 0 } }, { deterministic: !operation.parameters?.seedRequired }),
  'repeat.grid': operation => supported('repeat', { mode: 'grid', columns: operation.parameters?.columns || 3, rows: operation.parameters?.rows || 3, dx: operation.parameters?.dx || 80, dy: operation.parameters?.dy || 80 }),
  'brush.stroke': operation => supported('paint', { brushId: operation.parameters?.brushId || 'opaque-paint', color: operation.parameters?.color || '#222222', seed: operation.parameters?.seed || 1, samples: operation.parameters?.samples }),
  'brush.watercolor-petal': operation => supported('brush', { action: 'watercolor-petal', brushId: operation.parameters?.brushId, brushVersion: operation.parameters?.brushVersion || undefined, seed: operation.parameters?.seed ?? 1, color: operation.parameters?.color || undefined, scale: operation.parameters?.scale ?? undefined, id: operation.parameters?.id || undefined, replaceTarget: operation.parameters?.replaceTarget === true }, { quality: 'APPROXIMATED' }),
  'brush.watercolor-stroke': operation => supported('brush', { action: 'watercolor-stroke', brushId: operation.parameters?.brushId, brushVersion: operation.parameters?.brushVersion || undefined, seed: operation.parameters?.seed ?? 1, color: operation.parameters?.color || undefined, scale: operation.parameters?.scale ?? undefined, id: operation.parameters?.id || undefined, replaceTarget: operation.parameters?.replaceTarget === true }, { quality: 'APPROXIMATED' }),
  'texture.apply': operation => supported('texture', operation.parameters),
  'texture.brushFill': operation => supported('paint', { brushId: operation.parameters?.brushId || 'texture-brush', color: operation.parameters?.color || '#777777', seed: operation.parameters?.seed || 1 }, { quality: 'APPROXIMATED' }),
  'adjustment.apply': operation => supported('adjustment', { type: operation.parameters?.type || 'brightnessContrast', parameters: operation.parameters }),
  'adjustment.levels': operation => supported('adjustment', { type: 'levels', parameters: operation.parameters }),
  'adjustment.curves': operation => supported('adjustment', { type: 'curves', parameters: operation.parameters }),
  'adjustment.hueSaturation': operation => supported('adjustment', { type: 'hueSaturation', parameters: operation.parameters }),
  'filter.apply': operation => supported('filter', { type: operation.parameters?.type || 'gaussianBlur', parameters: operation.parameters }),
  'filter.gaussianBlur': operation => supported('filter', { type: 'gaussianBlur', parameters: operation.parameters }),
  'filter.sharpen': operation => supported('filter', { type: 'sharpen', parameters: operation.parameters }),
  'filter.highPass': operation => supported('filter', { type: 'highPass', parameters: operation.parameters }),
  'filter.edgeDetection': operation => supported('filter', { type: 'edgeDetection', parameters: operation.parameters }),
  'filter.noiseGrain': operation => supported('filter', { type: 'noiseGrain', parameters: operation.parameters }),
  'blend.opacity': operation => supported('style', { opacity: operation.parameters?.opacity ?? 1 }),
  'blend.mode': operation => supported('style', { blendMode: operation.parameters?.blendMode || 'source-over' }),
  'import.raster': operation => supported('import', { type: 'raster', ...operation.parameters }, { quality: 'PARTIAL' }),
  'export.file': operation => supported('export', operation.parameters, { quality: 'PARTIAL' }),
  'snapshot.create': operation => supported('snapshot', { includeDocument: false, ...operation.parameters }),
  'input.parameter': operation => supported('input', { action: 'declare-parameter', ...operation.parameters }),
  'expression.evaluate': operation => supported('expression', { expression: operation.parameters?.expression || operation.sourceCommand, seed: operation.parameters?.seed || 1 }, { deterministic: true }),
  'illustrator.pathpoint.fleurify': operation => supported('pathpoint', { action: 'fleurify', percentage: { $param: 'percentage' }, preserveAnchors: true, selectedOnly: true })
});

function gapFor(operation, reason = null) {
  if (operation.conversionStatus === 'REJECTED') return 'FILE_FORMAT_LIMIT';
  if (operation.category === 'External Dependency') return 'EXTERNAL_SOFTWARE_REQUIRED';
  if (!operation.deterministic) return 'NON_DETERMINISTIC';
  if (/parameter|descriptor/i.test(reason || operation.unsupportedReason || '')) return 'PARAMETER_MISSING';
  return 'CAPABILITY_MISSING';
}

export class ActionRecipeCompiler {
  constructor({ inkVersion = '1.5.0', schemaVersion = 3 } = {}) {
    this.inkVersion = inkVersion;
    this.schemaVersion = schemaVersion;
  }

  mapOperation(operation, index) {
    const mapper = MAP[operation.canonicalOperation];
    if (!mapper || operation.conversionStatus === 'REJECTED') return { operation, status: operation.conversionStatus === 'REJECTED' ? 'REJECTED' : 'PARTIAL', step: null, gapCategory: gapFor(operation) };
    const result = mapper(operation);
    if (!result) return { operation, status: 'MANUAL STEP REQUIRED', step: null, gapCategory: gapFor(operation) };
    if (result.recipeOp === 'path') {
      const attributes = result.params?.attributes || {}, shape = result.params?.shape;
      const hasGeometry = Boolean(attributes.d || attributes.points || (shape === 'ellipse' && (attributes.r !== undefined || attributes.rx !== undefined)) || (shape === 'rectangle' && attributes.width !== undefined && attributes.height !== undefined));
      if (!hasGeometry) return { operation, status: 'PARTIAL', step: null, gapCategory: 'PARAMETER_MISSING' };
    }
    if (result.recipeOp === 'image' && result.params?.action === 'resize' && !(Number.isFinite(result.params.width) && result.params.width > 0)) return { operation, status: 'PARTIAL', step: null, gapCategory: 'PARAMETER_MISSING' };
    if (result.recipeOp === 'transform' && !Object.keys(result.params || {}).some(key => ['x', 'y', 'dx', 'dy', 'angle', 'rotation', 'scale', 'scaleX', 'scaleY', 'matrix'].includes(key))) return { operation, status: 'PARTIAL', step: null, gapCategory: 'PARAMETER_MISSING' };
    if (result.recipeOp === 'object' && result.params?.action === 'create' && !Object.keys(result.params?.source || {}).length) return { operation, status: 'PARTIAL', step: null, gapCategory: 'PARAMETER_MISSING' };
    let status = operation.conversionStatus;
    if (result.quality === 'APPROXIMATED') status = 'APPROXIMATED';
    if (result.quality === 'PARTIAL' && !['APPROXIMATED', 'REJECTED'].includes(status)) status = 'PARTIAL';
    if (result.deterministic === false) status = 'APPROXIMATED';
    const requiresTarget = result.recipeOp === 'group'
      ? operation.target?.kind !== 'g'
      : ['image', 'object', 'style', 'mask', 'transform', 'repeat', 'paint', 'brush', 'pathpoint'].includes(result.recipeOp) || (result.recipeOp === 'layer' && result.params?.action === 'visibility');
    return {
      operation,
      status,
      step: {
        id: `import-${String(index + 1).padStart(3, '0')}-${operation.canonicalOperation.replace(/[^a-z0-9]+/gi, '-')}`,
        enabled: true,
        op: result.recipeOp,
        role: requiresTarget ? 'target' : undefined,
        optional: false,
        repeatOver: false,
        params: clone(result.params),
        sourceOperationId: operation.operationId,
        conversionStatus: status
      },
      gapCategory: ['DIRECT', 'EQUIVALENT'].includes(status) ? null : gapFor(operation)
    };
  }

  compile(program, { name = null, license = null } = {}) {
    const workflowIR = program?.format === 'INK-WORKFLOW-IR' ? program : null;
    program = workflowIR?.canonicalProgram || program;
    if (program?.format !== 'INK-CANONICAL-PROGRAM') throw new Error('INK_CANONICAL_PROGRAM_REQUIRED');
    const workflowById = new Map((workflowIR?.operations || []).map(operation => [operation.operationId, operation]));
    const mappings = program.operations.map((operation, index) => this.mapOperation(operation, index));
    for (const mapping of mappings) {
      const sourceWorkflow = workflowById.get(mapping.operation.operationId) || null;
      mapping.translationStatus = toUserTranslationStatus(mapping.status, { gapCategory: mapping.gapCategory });
      if (mapping.step && sourceWorkflow) mapping.step.sourceWorkflow = clone({ order: sourceWorkflow.order, condition: sourceWorkflow.condition, repeat: sourceWorkflow.repeat, dependency: sourceWorkflow.dependency, input: sourceWorkflow.input, output: sourceWorkflow.output, unsupportedStep: sourceWorkflow.unsupportedStep });
    }
    const steps = mappings.filter(mapping => mapping.step).map(mapping => mapping.step);
    steps.push({ id: 'import-checkpoint', enabled: true, op: 'checkpoint', checkpoint: true, params: {} });
    const statuses = Object.fromEntries(['DIRECT', 'EQUIVALENT', 'APPROXIMATED', 'PARTIAL', 'MANUAL STEP REQUIRED', 'EXTERNAL EXECUTION REQUIRED', 'REJECTED'].map(status => [status, mappings.filter(mapping => mapping.status === status).length]));
    const translationStatuses = Object.fromEntries(['DIRECT_TRANSLATION', 'SEMANTIC_TRANSLATION', 'PARTIAL', 'UNSUPPORTED', 'FORMAT_BLOCKED'].map(status => [status, mappings.filter(mapping => mapping.translationStatus === status).length]));
    const recipe = {
      format: 'INK-RECIPE', schemaVersion: this.schemaVersion,
      id: `ink.import.${program.id}`, name: name || `Imported ${program.metadata?.name || program.source?.name || 'Program'}`, version: 1,
      roleSchema: 'ink.import.target.v1', input: { types: ['document', 'layer', 'path', 'region', 'mask', 'object', 'selection', 'image', 'raster-layer'] },
      documentState: {}, targets: [{ role: 'target', required: steps.some(step => step.role === 'target') }],
      parameters: Object.fromEntries(program.operations.filter(operation => operation.canonicalOperation === 'illustrator.pathpoint.fleurify').flatMap(operation => [['percentage', operation.parameters.percentage]])), dependencies: clone(program.dependencies), intermediateStates: [],
      expectedOutput: { sourceProgramId: program.id, compiledStepCount: steps.length },
      qaRules: [{ type: 'document-integrity' }, { type: 'rollback-on-failure' }], failureConditions: ['unsupported-required-operation', 'security-rejection', 'missing-target'],
      versionRequirements: { inkMin: this.inkVersion }, license: clone(license || program.metadata?.license || { spdx: 'NOASSERTION' }),
      sourceProgram: { id: program.id, format: program.source?.format, hash: program.deterministicHash, workflowIrId: workflowIR?.id || null }, steps
    };
    const unsupported = mappings.filter(mapping => !mapping.step || !['DIRECT', 'EQUIVALENT'].includes(mapping.status)).map(mapping => ({ operationId: mapping.operation.operationId, canonicalOperation: mapping.operation.canonicalOperation, status: mapping.status, translationStatus: mapping.translationStatus, reason: mapping.operation.unsupportedReason || mapping.gapCategory, gapCategory: mapping.gapCategory }));
    const report = {
      format: 'INK-CONVERSION-REPORT', schemaVersion: 2, id: `conversion_${deterministicHash({ program: program.id, recipe })}`,
      sourceSummary: { id: program.id, name: program.metadata?.name || program.source?.name, format: program.source?.format, software: program.metadata?.sourceSoftware, operationCount: program.operations.length },
      normalizedOperations: mappings.map(mapping => { const workflow = workflowById.get(mapping.operation.operationId); return { operationId: mapping.operation.operationId, canonicalOperation: mapping.operation.canonicalOperation, category: mapping.operation.category, status: mapping.status, translationStatus: mapping.translationStatus, order: workflow?.order ?? null, condition: clone(workflow?.condition ?? null), repeat: clone(workflow?.repeat ?? null), dependency: clone(workflow?.dependency ?? mapping.operation.dependencies ?? []), input: clone(workflow?.input ?? mapping.operation.inputState ?? {}), output: clone(workflow?.output ?? mapping.operation.outputState ?? {}), unsupportedStep: Boolean(workflow?.unsupportedStep) }; }),
      recipeId: recipe.id, parameters: clone(recipe.parameters), externalDependencies: clone(program.dependencies),
      unsupportedOperations: unsupported, alternativeOperations: mappings.filter(mapping => ['EQUIVALENT', 'APPROXIMATED'].includes(mapping.status)).map(mapping => ({ operationId: mapping.operation.operationId, status: mapping.status, recipeOp: mapping.step?.op })),
      risks: mappings.filter(mapping => !mapping.operation.deterministic).map(mapping => ({ operationId: mapping.operation.operationId, risk: 'NON_DETERMINISTIC' })),
      compatibleVersions: { inkMin: this.inkVersion, sourceVersion: program.metadata?.version || 'unknown' },
      expectedInput: clone(recipe.input), expectedOutput: clone(recipe.expectedOutput), replayConditions: { fixedSeed: mappings.some(mapping => !mapping.operation.deterministic), declaredDependencies: true },
      statusCounts: statuses, translationStatusCounts: translationStatuses, workflowIrId: workflowIR?.id || null, compileStatus: unsupported.some(item => item.status === 'REJECTED') ? 'PARTIAL' : unsupported.length ? 'PARTIAL' : 'COMPLETE',
      deterministicHash: deterministicHash({ recipe, mappings: mappings.map(mapping => mapping.status) })
    };
    return { recipe, report, mappings };
  }
}

export const COMPILER_OPERATION_MAP = Object.freeze(Object.keys(MAP));
