import { hashValue } from '../ai-core.js';
import { resolveSemanticTargets } from '../../semantic/semantic-resolver.js';

const clone = value => structuredClone(value);

function shape(id, name, semanticLabel, cx, cy, width, height, fill, stroke, strokeWidth = 1.6) {
  return { operation: 'vector.createShape', target: 'layer-artwork', parameters: { id, name, semanticLabel, shape: 'ellipse', cx, cy, width, height, fill, stroke, strokeWidth } };
}

function flowerCreateSteps(operation) {
  const { flowerColor = '#ef9eb2', leafColor = '#72a95f' } = operation.parameters;
  const accent = flowerColor === '#ef9eb2' ? '#f3afbf' : flowerColor;
  const steps = [
    { operation: 'document.create', target: null, parameters: { title: 'INK Headless Flower', widthMm: 210, heightMm: 297 } },
    { operation: 'layer.rename', target: null, parameters: { name: '保留基底' } },
    { operation: 'layer.create', target: null, parameters: { id: 'layer-artwork', name: '花卉主體', kind: 'vector' } },
    shape('stem', '花莖', 'stem', 397, 650, 18, 360, '#6f9d5d', '#3d6c3a')
  ];
  const petals = [
    [397, 355, 104, 184], [457, 375, 108, 178], [492, 429, 112, 174],
    [470, 485, 112, 178], [420, 515, 108, 182], [365, 510, 108, 182],
    [320, 475, 112, 178], [306, 416, 112, 174], [338, 370, 108, 178]
  ];
  petals.forEach((values, index) => steps.push(shape(`petal-${index + 1}`, `花瓣 ${index + 1}`, 'petal', ...values, index % 2 ? flowerColor : accent, '#9e5366')));
  steps.push(shape('flower-center-outer', '花心外圈', 'flower-center', 397, 435, 105, 105, '#e9b64e', '#98752b'));
  steps.push(shape('flower-center-inner', '花心內圈', 'flower-center', 397, 435, 54, 54, '#8b5e28', '#704719'));
  steps.push(shape('leaf-left', '左葉', 'leaf', 304, 700, 165, 90, leafColor, '#3d7041'));
  steps.push(shape('leaf-right', '右葉', 'leaf', 490, 700, 165, 90, leafColor, '#3d7041'));
  return steps;
}

function objectEntries(document) {
  const page = document.pages.find(item => item.id === document.activePageId) || document.pages[0];
  return page.layers.flatMap(layer => (layer.objects || []).map(object => ({ layer, object })));
}

function objectCenter(object) {
  const points = object.subpaths?.flatMap(subpath => subpath.anchors || []) || object.points || [];
  if (!points.length) return { x: 0, y: 0 };
  const matrix = object.matrix || [1, 0, 0, 1, 0, 0];
  const transformed = points.map(point => ({ x: matrix[0] * point.x + matrix[2] * point.y + matrix[4], y: matrix[1] * point.x + matrix[3] * point.y + matrix[5] }));
  return { x: transformed.reduce((sum, point) => sum + point.x, 0) / transformed.length, y: transformed.reduce((sum, point) => sum + point.y, 0) / transformed.length };
}

function targetsFor(document, subjects) {
  return resolveSemanticTargets(document, { roles: subjects }).targets;
}

function unsupportedPlan(intent, status, items) {
  return {
    format: 'INK-EDITABLE-PLAN', version: '1.0', status, planId: `plan:${hashValue([intent.prompt, status])}`,
    userIntent: intent.prompt, parsedIntent: clone(intent), targets: [], observations: clone(intent.observations),
    hypotheses: clone(intent.hypotheses), decisions: clone(intent.decisions), unresolvedItems: clone(intent.unresolvedItems),
    unsupportedItems: items, orderedSteps: [], constraints: clone(intent.constraints), expectedDifferences: [],
    confidence: intent.confidence, risk: 'NONE', recipeDraft: null
  };
}

export function intentToPlan(layer, intent) {
  if (intent.status !== 'READY') return unsupportedPlan(intent, intent.status, intent.unsupportedItems || []);
  if (intent.operations.some(item => item.operation === 'rollback')) return unsupportedPlan(intent, 'ROLLBACK_REQUESTED', []);
  const document = layer.currentDocument();
  layer.semantics.build(document, { persist: true });
  const steps = [], expectedDifferences = [], unsupported = [];
  for (const operation of intent.operations) {
    if (operation.operation === 'create') {
      steps.push(...flowerCreateSteps(operation)); expectedDifferences.push({ type: 'ADD', targets: ['stem', 'petal-*', 'flower-center-*', 'leaf-*'] }); continue;
    }
    const targetIds = targetsFor(document, operation.subjects);
    if (!targetIds.length) { unsupported.push({ operation: operation.operation, subjects: operation.subjects, reason: 'TARGET_NOT_FOUND' }); continue; }
    if (operation.operation === 'recolor' || operation.operation === 'adjust-fill') {
      steps.push({ operation: 'vector.setFill', target: targetIds, parameters: { fill: operation.parameters.color } });
      expectedDifferences.push({ type: 'FILL', targets: targetIds, value: operation.parameters.color });
    } else if (operation.operation === 'resize') {
      for (const id of targetIds) {
        const object = objectEntries(document).find(item => item.object.id === id)?.object, center = objectCenter(object), factor = operation.parameters.factor;
        steps.push({ operation: 'vector.transform', target: id, parameters: { matrix: [factor, 0, 0, factor, center.x * (1 - factor), center.y * (1 - factor)] } });
      }
      expectedDifferences.push({ type: 'SCALE', targets: targetIds, factor: operation.parameters.factor });
    } else if (operation.operation === 'move') {
      steps.push({ operation: 'vector.transform', target: targetIds, parameters: { matrix: [1, 0, 0, 1, operation.parameters.dx, operation.parameters.dy] } });
      expectedDifferences.push({ type: 'MOVE', targets: targetIds, dx: operation.parameters.dx, dy: operation.parameters.dy });
    } else if (operation.operation === 'rotate') {
      const radians = operation.parameters.degrees * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
      for (const id of targetIds) {
        const object = objectEntries(document).find(item => item.object.id === id)?.object, center = objectCenter(object);
        steps.push({ operation: 'vector.transform', target: id, parameters: { matrix: [c, s, -s, c, center.x - c * center.x + s * center.y, center.y - s * center.x - c * center.y] } });
      }
      expectedDifferences.push({ type: 'ROTATE', targets: targetIds, degrees: operation.parameters.degrees });
    } else if (operation.operation === 'adjust-stroke') {
      steps.push({ operation: 'vector.setStroke', target: targetIds, parameters: { strokeWidth: operation.parameters.strokeWidth } });
      expectedDifferences.push({ type: 'STROKE', targets: targetIds, strokeWidth: operation.parameters.strokeWidth });
    } else if (operation.operation === 'adjust-symmetry') {
      steps.push({ operation: 'vector.transform', target: targetIds.slice(0, 1), parameters: { matrix: [1, 0.06, -0.02, 1, 6, -2] } });
      expectedDifferences.push({ type: 'LOCAL_TRANSFORM', targets: targetIds.slice(0, 1) });
    } else if (operation.operation === 'adjust-count') {
      unsupported.push({ operation: operation.operation, reason: 'FULL_REGENERATION_REQUIRED', targets: targetIds });
    } else {
      unsupported.push({ operation: operation.operation, reason: 'CURRENT_VECTOR_EXECUTOR_UNSUPPORTED', targets: targetIds });
    }
  }
  if (unsupported.length) {
    const full = unsupported.some(item => item.reason === 'FULL_REGENERATION_REQUIRED');
    return unsupportedPlan(intent, full ? 'FULL_REGENERATION_REQUIRED' : 'UNSUPPORTED', unsupported);
  }
  const plan = layer.createPlanFromSteps(intent.prompt, steps, {
    confidence: intent.confidence, seed: intent.parameters.seed, observations: intent.observations,
    hypotheses: intent.hypotheses, decisions: intent.decisions, unresolvedItems: intent.unresolvedItems
  });
  plan.status = 'READY';
  plan.parsedIntent = clone(intent);
  plan.targets = [...new Set(steps.flatMap(step => Array.isArray(step.target) ? step.target : step.target ? [step.target] : []))];
  plan.unsupportedItems = [];
  plan.expectedDifferences = expectedDifferences;
  plan.constraints = {
    ...plan.constraints, requested: clone(intent.constraints), preserveAllOthers: intent.constraints.includes('preserve-all-others') || !intent.operations.some(item => item.operation === 'create'),
    preserveIds: true, localEditOnly: !intent.operations.some(item => item.operation === 'create')
  };
  plan.recipeDraft.constraints = clone(plan.constraints);
  return plan;
}
