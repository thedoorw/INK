import vocabulary from './flower-vocabulary-v1.json' with { type: 'json' };
import { emptyIntent } from './intent-schema.js';

const has = (text, values) => values.some(value => text.toLowerCase().includes(String(value).toLowerCase()));
const unique = values => [...new Set(values)];

function findColor(text, near = '') {
  const hex = text.match(/#[0-9a-f]{6}/i)?.[0];
  if (hex) return hex.toLowerCase();
  const source = near || text;
  const entries = Object.entries(vocabulary.colors).sort((a, b) => b[0].length - a[0].length);
  return entries.find(([name]) => source.toLowerCase().includes(name.toLowerCase()))?.[1] || null;
}

function subjectSegments(text) {
  const segments = text.split(/[，,。；;]|\band\b/iu).map(value => value.trim()).filter(Boolean);
  return segments.map(segment => ({
    text: segment,
    subjects: Object.entries(vocabulary.subjects).filter(([, aliases]) => has(segment, aliases)).map(([key]) => key),
    color: findColor(segment)
  }));
}

function numberNear(text, fallback) {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(%|％)?/);
  return match ? { value: Number(match[1]), percent: Boolean(match[2]) } : { value: fallback, percent: false };
}

export function parseIntent(prompt, { seed = 15101 } = {}) {
  const text = String(prompt || '').trim();
  const intent = emptyIntent(text);
  intent.parameters.seed = Number(seed);
  if (!text) {
    intent.status = 'USER_CHOICE_REQUIRED'; intent.unresolvedItems.push('Prompt is empty'); return intent;
  }
  if (/(3d|三維|動畫|video|影片|照片級|photoreal|複雜場景|文字排版|typography)/iu.test(text)) {
    intent.status = 'UNSUPPORTED'; intent.unsupportedItems.push('Request exceeds bounded editable flower vocabulary'); intent.confidence = 1; return intent;
  }

  intent.subjects = unique(Object.entries(vocabulary.subjects).filter(([, aliases]) => has(text, aliases)).map(([key]) => key));
  intent.composition = unique(Object.entries(vocabulary.composition).filter(([, aliases]) => has(text, aliases)).map(([key]) => key));
  intent.constraints = unique(Object.entries(vocabulary.constraints).filter(([, aliases]) => has(text, aliases)).map(([key]) => key));
  if (/保持不動|不動/u.test(text)) intent.constraints.push('preserve-all-others');
  if (/保留[^。；;]*線條/u.test(text)) intent.constraints.push('preserve-stroke');
  intent.constraints = unique(intent.constraints);

  if (has(text, vocabulary.operations.rollback)) {
    intent.operations = [{ operation: 'rollback', subjects: [], parameters: {} }];
    intent.confidence = 0.99; intent.decisions.push({ action: 'ROLLBACK', reason: 'explicit rollback phrase' }); return intent;
  }

  const create = has(text, vocabulary.operations.create) && intent.subjects.some(subject => ['flower', 'petal'].includes(subject));
  const segments = subjectSegments(text);
  const operations = [];
  if (create) {
    operations.push({ operation: 'create', subjects: unique(['flower', ...intent.subjects]), parameters: { flowerColor: findColor(text) || '#ef9eb2', leafColor: '#72a95f', background: /白底|white background/iu.test(text) ? '#ffffff' : '#ffffff', leafCount: /兩片|2\s*(片|leaves)/iu.test(text) ? 2 : 2 } });
  } else {
    for (const segment of segments) {
      const subjects = segment.subjects.filter(subject => subject !== 'flower');
      const resolvedSubjects = subjects.length ? subjects : (/整朵花|whole flower/iu.test(segment.text) ? ['petal', 'flower-center'] : []);
      if ((/改成|改為|換色|recolor|顏色|color/iu.test(segment.text) || segment.color) && resolvedSubjects.length && segment.color) operations.push({ operation: 'recolor', subjects: resolvedSubjects, parameters: { color: segment.color } });
      if (/放大|縮小|resize|scale/iu.test(segment.text) && resolvedSubjects.length) {
        const number = numberNear(segment.text, 10), direction = /縮小/iu.test(segment.text) ? -1 : 1;
        const factor = number.percent ? 1 + direction * number.value / 100 : 1 + direction * (number.value || 10) / 100;
        operations.push({ operation: 'resize', subjects: resolvedSubjects, parameters: { factor: Number(factor.toFixed(4)) } });
      }
      if (/往上|往下|往左|往右|move/iu.test(segment.text)) {
        const number = numberNear(segment.text, 20).value || 20;
        const dx = /往左/iu.test(segment.text) ? -number : /往右/iu.test(segment.text) ? number : 0;
        const dy = /往上/iu.test(segment.text) ? -number : /往下/iu.test(segment.text) ? number : 0;
        const moveSubjects = resolvedSubjects.length ? resolvedSubjects : (/整朵花|whole flower/iu.test(segment.text) ? ['petal', 'flower-center'] : []);
        if (moveSubjects.length) operations.push({ operation: 'move', subjects: moveSubjects, parameters: { dx, dy } });
      }
      if (/旋轉|rotate/iu.test(segment.text) && resolvedSubjects.length) operations.push({ operation: 'rotate', subjects: resolvedSubjects, parameters: { degrees: numberNear(segment.text, 10).value } });
      if (/複製|duplicate/iu.test(segment.text) && resolvedSubjects.length) operations.push({ operation: 'duplicate', subjects: resolvedSubjects, parameters: {} });
      if (/刪除|delete/iu.test(segment.text) && resolvedSubjects.length) operations.push({ operation: 'delete', subjects: resolvedSubjects, parameters: {} });
      if (/透明度|opacity/iu.test(segment.text) && resolvedSubjects.length) operations.push({ operation: 'adjust-opacity', subjects: resolvedSubjects, parameters: { opacity: numberNear(segment.text, 55).value / 100 } });
      if (/線寬|stroke/iu.test(segment.text) && resolvedSubjects.length) operations.push({ operation: 'adjust-stroke', subjects: resolvedSubjects, parameters: { strokeWidth: numberNear(segment.text, 2).value } });
      if (/增加一片|減少一片|數量|count/iu.test(segment.text) && resolvedSubjects.length) operations.push({ operation: 'adjust-count', subjects: resolvedSubjects, parameters: {} });
      if (/不對稱|asymmetric/iu.test(segment.text) && resolvedSubjects.length) operations.push({ operation: 'adjust-symmetry', subjects: resolvedSubjects, parameters: { mode: 'asymmetrical' } });
    }
  }

  intent.operations = operations;
  if (!operations.length) {
    intent.status = /好看|調整一下|改善/u.test(text) ? 'USER_CHOICE_REQUIRED' : 'UNSUPPORTED';
    (intent.status === 'USER_CHOICE_REQUIRED' ? intent.unresolvedItems : intent.unsupportedItems).push('No bounded executable operation could be resolved');
    intent.confidence = 0.35;
  } else {
    intent.confidence = create ? 0.96 : 0.92;
    intent.observations.push({ type: 'lexical-match', operationCount: operations.length, subjects: intent.subjects });
    intent.hypotheses.push({ candidate: 'bounded-flower-edit', confidence: intent.confidence });
    intent.decisions.push({ status: 'STRUCTURED_INTENT_ACCEPTED', seed: Number(seed) });
  }
  return intent;
}

export { vocabulary };
