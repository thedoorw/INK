const CREATE_UTTERANCE = '畫一朵正面的粉紅色花，白底，兩片綠葉，置中，簡單乾淨。';
const MODIFY_UTTERANCE = '把花瓣改成深紅色，花心改成黃色，葉子放大一點。';
const ROLLBACK_UTTERANCE = '回到上一版本。';

export const CONVERSATION_FLOWER_UTTERANCES = Object.freeze({
  create: CREATE_UTTERANCE,
  modify: MODIFY_UTTERANCE,
  rollback: ROLLBACK_UTTERANCE
});

const includesAll = (text, tokens) => tokens.every(token => text.includes(token));

function shape(id, name, semanticLabel, cx, cy, width, height, fill, stroke) {
  return {
    operation: 'vector.createShape',
    target: 'layer-artwork',
    parameters: { id, name, semanticLabel, shape: 'ellipse', cx, cy, width, height, fill, stroke, strokeWidth: 1.6 }
  };
}

function createSteps() {
  const steps = [
    { operation: 'document.create', target: null, parameters: { title: '對話式粉紅花最小閉環', widthMm: 210, heightMm: 297 } },
    { operation: 'layer.rename', target: null, parameters: { name: '保留基底' } },
    { operation: 'layer.create', target: null, parameters: { id: 'layer-artwork', name: '花卉主體', kind: 'vector' } },
    shape('stem', '花莖', 'stem', 397, 650, 18, 360, '#6f9d5d', '#3d6c3a')
  ];
  const petals = [
    [397, 355, 104, 184], [457, 375, 108, 178], [492, 429, 112, 174],
    [470, 485, 112, 178], [420, 515, 108, 182], [365, 510, 108, 182],
    [320, 475, 112, 178], [306, 416, 112, 174], [338, 370, 108, 178]
  ];
  petals.forEach((p, index) => steps.push(shape(`petal-${index + 1}`, `花瓣 ${index + 1}`, 'petal', ...p, index % 2 ? '#ef9eb2' : '#f3afbf', '#9e5366')));
  steps.push(shape('flower-center-outer', '花心外圈', 'flower-center', 397, 435, 105, 105, '#e9b64e', '#98752b'));
  steps.push(shape('flower-center-inner', '花心內圈', 'flower-center', 397, 435, 54, 54, '#8b5e28', '#704719'));
  steps.push(shape('leaf-left', '左葉', 'leaf', 304, 700, 165, 90, '#72a95f', '#3d7041'));
  steps.push(shape('leaf-right', '右葉', 'leaf', 490, 700, 165, 90, '#72a95f', '#3d7041'));
  return steps;
}

function modificationSteps(layer) {
  layer.semantics.build(layer.currentDocument(), { persist: true });
  const targets = layer.currentDocument().ai.semanticTargets;
  const ids = label => targets.filter(item => item.semanticLabel === label).map(item => item.targetId);
  const petals = ids('petal'), center = ids('flower-center');
  const left = targets.find(item => item.objectIds.includes('leaf-left'))?.targetId;
  const right = targets.find(item => item.objectIds.includes('leaf-right'))?.targetId;
  if (petals.length !== 9 || center.length !== 2 || !left || !right) throw new Error('INK_CONVERSATION_TARGET_CONTRACT_FAILED');
  return [
    { operation: 'vector.setFill', target: petals, parameters: { fill: '#9f2338', color: '#9f2338' } },
    { operation: 'vector.setFill', target: center, parameters: { fill: '#f3c623', color: '#f3c623' } },
    { operation: 'vector.transform', target: left, parameters: { matrix: [1.28, 0, 0, 1.28, -85.12, -196] } },
    { operation: 'vector.transform', target: right, parameters: { matrix: [1.28, 0, 0, 1.28, -137.2, -196] } }
  ];
}

export function parseConversationFlowerInstruction(layer, utterance) {
  const text = String(utterance || '').trim();
  if (includesAll(text, ['畫', '粉紅色花', '白底', '兩片綠葉', '置中'])) {
    return { operationType: 'CREATE', confidence: 0.98, mapping: 'BOUNDED_RULE_CONTRACT', steps: createSteps() };
  }
  if (includesAll(text, ['花瓣', '深紅色', '花心', '黃色', '葉子', '放大'])) {
    return { operationType: 'MODIFY', confidence: 0.98, mapping: 'BOUNDED_RULE_CONTRACT', steps: modificationSteps(layer) };
  }
  if (/回到上一版本|回滾/.test(text)) {
    return { operationType: 'ROLLBACK', confidence: 0.99, mapping: 'EXISTING_EXECUTION_ROLLBACK', steps: [] };
  }
  throw new Error('INK_CONVERSATION_UTTERANCE_OUT_OF_CONTRACT');
}

export function textToConversationPlan(layer, utterance) {
  const parsed = parseConversationFlowerInstruction(layer, utterance);
  if (parsed.operationType === 'ROLLBACK') return parsed;
  const plan = layer.createPlanFromSteps(utterance, parsed.steps, {
    confidence: parsed.confidence,
    seed: 15101,
    observations: [{ type: 'bounded-natural-language-contract', operationType: parsed.operationType }],
    decisions: [{ mapping: parsed.mapping, status: 'TEST_SUPPLEMENT' }]
  });
  plan.parsedIntent.operationType = parsed.operationType;
  plan.parsedIntent.mapping = parsed.mapping;
  return { ...parsed, plan };
}
