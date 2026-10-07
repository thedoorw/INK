import { Matrix, uid } from '../core/index.js';

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const WRITING_MODES = new Set(['horizontal-tb', 'vertical-rl', 'vertical-lr']);
const PARAGRAPH_ALIGN = new Set(['left', 'center', 'right']);
const PATH_OVERFLOW = new Set(['clip', 'visible']);

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function opacity(value, fallback = 1) {
  return Math.max(0, Math.min(1, finite(value, fallback)));
}

function textMatrix({ matrix = null, x = 0, y = 0 } = {}) {
  if (Array.isArray(matrix) && matrix.length === 6 && matrix.every(value => Number.isFinite(Number(value)))) {
    return matrix.map(Number);
  }
  return Matrix.translate(finite(x, 0), finite(y, 0));
}

function fontWeight(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (Number.isFinite(number)) return Math.max(1, Math.min(1000, number));
  return String(value);
}

function textBox(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    width: positive(value.width, 1),
    height: positive(value.height, 1)
  };
}

function writingMode(value) {
  return WRITING_MODES.has(value) ? value : 'horizontal-tb';
}

function paragraphAlign(value) {
  return PARAGRAPH_ALIGN.has(value) ? value : 'left';
}

function pathText(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const pathId = value.pathId == null ? null : String(value.pathId);
  return {
    pathId,
    startOffset: Math.max(0, finite(value.startOffset, 0)),
    overflow: PATH_OVERFLOW.has(value.overflow) ? value.overflow : 'clip'
  };
}

export function createTextObject({
  id = uid(),
  text = '',
  matrix = null,
  x = 0,
  y = 0,
  opacity: objectOpacity = 1,
  color = '#202020',
  fontFamily = 'system-ui',
  fontSize = 32,
  lineHeight = 1.25,
  fontWeight: objectFontWeight = null,
  textBox: objectTextBox = null,
  paragraphAlign: objectParagraphAlign = 'left',
  writingMode: objectWritingMode = 'horizontal-tb',
  pathText: objectPathText = null
} = {}) {
  const object = {
    id,
    type: 'text',
    matrix: textMatrix({ matrix, x, y }),
    opacity: opacity(objectOpacity),
    text: String(text ?? ''),
    color: String(color || '#202020'),
    fontFamily: String(fontFamily || 'system-ui'),
    fontSize: positive(fontSize, 32),
    lineHeight: positive(lineHeight, 1.25)
  };
  const weight = fontWeight(objectFontWeight);
  if (weight != null) object.fontWeight = weight;
  const box = textBox(objectTextBox);
  if (box) object.textBox = box;
  if (objectParagraphAlign !== 'left' || box) object.paragraphAlign = paragraphAlign(objectParagraphAlign);
  if (objectWritingMode !== 'horizontal-tb') object.writingMode = writingMode(objectWritingMode);
  const path = pathText(objectPathText);
  if (path) object.pathText = path;
  return object;
}

export function updateTextObject(object, patch = {}) {
  if (object?.type !== 'text') return false;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;

  if (hasOwn(patch, 'text')) object.text = String(patch.text ?? '');
  if (hasOwn(patch, 'opacity')) object.opacity = opacity(patch.opacity, object.opacity ?? 1);
  if (hasOwn(patch, 'color')) object.color = String(patch.color || '#202020');
  if (hasOwn(patch, 'fontFamily')) object.fontFamily = String(patch.fontFamily || 'system-ui');
  if (hasOwn(patch, 'fontSize')) object.fontSize = positive(patch.fontSize, object.fontSize || 32);
  if (hasOwn(patch, 'lineHeight')) object.lineHeight = positive(patch.lineHeight, object.lineHeight || 1.25);
  if (hasOwn(patch, 'fontWeight')) {
    const weight = fontWeight(patch.fontWeight);
    if (weight == null) delete object.fontWeight;
    else object.fontWeight = weight;
  }
  if (hasOwn(patch, 'matrix')) object.matrix = textMatrix({ matrix: patch.matrix });
  if (hasOwn(patch, 'x') || hasOwn(patch, 'y')) {
    const matrix = Array.isArray(object.matrix) && object.matrix.length === 6
      ? object.matrix.map(Number)
      : Matrix.identity();
    if (hasOwn(patch, 'x')) matrix[4] = finite(patch.x, matrix[4] || 0);
    if (hasOwn(patch, 'y')) matrix[5] = finite(patch.y, matrix[5] || 0);
    object.matrix = matrix;
  }
  if (hasOwn(patch, 'textBox')) {
    const box = textBox(patch.textBox);
    if (box) object.textBox = box;
    else delete object.textBox;
  }
  if (hasOwn(patch, 'paragraphAlign')) object.paragraphAlign = paragraphAlign(patch.paragraphAlign);
  if (hasOwn(patch, 'writingMode')) {
    const mode = writingMode(patch.writingMode);
    if (mode === 'horizontal-tb') delete object.writingMode;
    else object.writingMode = mode;
  }
  if (hasOwn(patch, 'pathText')) {
    const path = pathText(patch.pathText);
    if (path) object.pathText = path;
    else delete object.pathText;
  }
  return true;
}
