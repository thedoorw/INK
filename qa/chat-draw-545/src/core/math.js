/** @typedef {[number, number, number, number, number, number]} Matrix2D */

export const AFFINE_INVERSION_EPSILON = 1e-12;

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rad = degrees => degrees * Math.PI / 180;
export const deg = radians => radians * 180 / Math.PI;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const pointSegmentDistance = (point, a, b) => {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = point.x - a.x;
  const wy = point.y - a.y;
  const lengthSquared = vx * vx + vy * vy;
  if (!lengthSquared) return Math.hypot(wx, wy);
  const t = clamp((wx * vx + wy * vy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (a.x + t * vx), point.y - (a.y + t * vy));
};

export const polygonContains = (point, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (((a.y > point.y) !== (b.y > point.y)) &&
        (point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y + 1e-12) + a.x)) {
      inside = !inside;
    }
  }
  return inside;
};

export const Matrix = {
  identity: () => [1, 0, 0, 1, 0, 0],
  isFinite: matrix => Array.isArray(matrix) && matrix.length === 6 && matrix.every(value => Number.isFinite(+value)),
  determinant: matrix => Matrix.isFinite(matrix) ? matrix[0] * matrix[3] - matrix[1] * matrix[2] : NaN,
  isInvertible: (matrix, epsilon = AFFINE_INVERSION_EPSILON) => {
    const determinant = Matrix.determinant(matrix);
    return Number.isFinite(determinant) && Math.abs(determinant) > Math.max(0, epsilon);
  },
  multiply: (a, b) => [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ],
  translate: (x, y) => [1, 0, 0, 1, x, y],
  scale: (x, y = x) => [x, 0, 0, y, 0, 0],
  rotate: angle => [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0],
  around: (cx, cy, matrix) => Matrix.multiply(
    Matrix.translate(cx, cy),
    Matrix.multiply(matrix, Matrix.translate(-cx, -cy))
  ),
  point: (matrix, point) => ({
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5]
  }),
  tryInvert: (matrix, epsilon = AFFINE_INVERSION_EPSILON) => {
    if (!Matrix.isInvertible(matrix, epsilon)) return null;
    const determinant = Matrix.determinant(matrix);
    return [
      matrix[3] / determinant,
      -matrix[1] / determinant,
      -matrix[2] / determinant,
      matrix[0] / determinant,
      (matrix[2] * matrix[5] - matrix[3] * matrix[4]) / determinant,
      (matrix[1] * matrix[4] - matrix[0] * matrix[5]) / determinant
    ];
  },
  invert: matrix => Matrix.tryInvert(matrix) || Matrix.identity(),
  toWorld: (parentWorld, localMatrix) => Matrix.multiply(parentWorld || Matrix.identity(), localMatrix || Matrix.identity()),
  toLocal: (parentWorld, worldMatrix, epsilon = AFFINE_INVERSION_EPSILON) => {
    const inverse = Matrix.tryInvert(parentWorld || Matrix.identity(), epsilon);
    return inverse ? Matrix.multiply(inverse, worldMatrix || Matrix.identity()) : null;
  },
  svg: matrix => `matrix(${matrix.map(number => Number(number.toFixed(5))).join(' ')})`
};
