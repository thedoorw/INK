import { Matrix, rad } from '../core/index.js';

const EPSILON = 1e-10;
const finitePoint = point => point && Number.isFinite(+point.x) && Number.isFinite(+point.y);

function fail(code, details = {}) {
  throw Object.assign(new Error(`INK_TRANSFORM_ADVANCED_${code}`), { code: `TRANSFORM_ADVANCED_${code}`, ...details });
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function quadArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index], b = points[(index + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function normalizeQuad(points, label) {
  if (!Array.isArray(points) || points.length !== 4 || !points.every(finitePoint)) fail('QUAD_INVALID', { label });
  const normalized = points.map(point => ({ x: +point.x, y: +point.y }));
  if (Math.abs(quadArea(normalized)) <= EPSILON) fail('QUAD_DEGENERATE', { label });
  return normalized;
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row.map(Number), Number(vector[index])]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) <= EPSILON) fail('PROJECTIVE_SINGULAR');
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (!factor) continue;
      for (let index = column; index <= size; index += 1) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  const solution = augmented.map(row => row[size]);
  if (!solution.every(Number.isFinite)) fail('PROJECTIVE_NON_FINITE');
  return solution;
}

export function createSkewMatrix({ xDegrees = 0, yDegrees = 0, pivot = { x: 0, y: 0 } } = {}) {
  if (!finitePoint(pivot) || !Number.isFinite(+xDegrees) || !Number.isFinite(+yDegrees)) fail('SKEW_INPUT_INVALID');
  const x = Math.tan(rad(+xDegrees));
  const y = Math.tan(rad(+yDegrees));
  if (![x, y].every(Number.isFinite)) fail('SKEW_NON_FINITE');
  const matrix = Matrix.around(+pivot.x, +pivot.y, [1, y, x, 1, 0, 0]);
  if (!Matrix.isFinite(matrix)) fail('SKEW_NON_FINITE');
  return matrix;
}

export function createProjectiveTransform(sourceQuad, destinationQuad) {
  const source = normalizeQuad(sourceQuad, 'source');
  const destination = normalizeQuad(destinationQuad, 'destination');
  const rows = [], values = [];
  for (let index = 0; index < 4; index += 1) {
    const { x, y } = source[index];
    const { x: u, y: v } = destination[index];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); values.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]); values.push(v);
  }
  const [h11, h12, h13, h21, h22, h23, h31, h32] = solveLinearSystem(rows, values);
  const matrix = [h11, h12, h13, h21, h22, h23, h31, h32, 1];
  if (!matrix.every(Number.isFinite)) fail('PROJECTIVE_NON_FINITE');
  return matrix;
}

export const createDistortTransform = createProjectiveTransform;
export const createPerspectiveTransform = createProjectiveTransform;

export function mapProjectivePoint(matrix, point) {
  if (!Array.isArray(matrix) || matrix.length !== 9 || !matrix.every(Number.isFinite) || !finitePoint(point)) fail('PROJECTIVE_INPUT_INVALID');
  const denominator = matrix[6] * point.x + matrix[7] * point.y + matrix[8];
  if (!Number.isFinite(denominator) || Math.abs(denominator) <= EPSILON) fail('PROJECTIVE_POINT_AT_INFINITY');
  const mapped = {
    x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / denominator,
    y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / denominator
  };
  if (!finitePoint(mapped)) fail('PROJECTIVE_NON_FINITE');
  return mapped;
}

export function invertProjectiveTransform(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 9 || !matrix.every(Number.isFinite)) fail('PROJECTIVE_INPUT_INVALID');
  const [a,b,c,d,e,f,g,h,i] = matrix;
  const A=e*i-f*h, B=-(d*i-f*g), C=d*h-e*g;
  const D=-(b*i-c*h), E=a*i-c*g, F=-(a*h-b*g);
  const G=b*f-c*e, H=-(a*f-c*d), I=a*e-b*d;
  const determinant = a*A + b*B + c*C;
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= EPSILON) fail('PROJECTIVE_SINGULAR');
  const inverse = [A,D,G,B,E,H,C,F,I].map(value => value / determinant);
  if (!inverse.every(Number.isFinite)) fail('PROJECTIVE_NON_FINITE');
  return inverse;
}

export function warpNormalizedPoint(point, { strength = 0, maxDisplacement = 0.5 } = {}) {
  if (!finitePoint(point) || !Number.isFinite(+strength) || !Number.isFinite(+maxDisplacement) || +maxDisplacement < 0) fail('WARP_INPUT_INVALID');
  const boundedStrength = Math.max(-1, Math.min(1, +strength));
  if (boundedStrength === 0) return { x: +point.x, y: +point.y };
  const displacement = Math.sin(Math.PI * +point.y) * boundedStrength * Math.min(0.5, +maxDisplacement);
  const limit = Math.min(0.5, +maxDisplacement);
  const output = {
    x: Math.max(-limit, Math.min(1 + limit, +point.x + displacement)),
    y: Math.max(-limit, Math.min(1 + limit, +point.y))
  };
  if (!finitePoint(output)) fail('WARP_NON_FINITE');
  return output;
}

export function createWarpDeformationPlan(bounds, { strength = 0, maxDisplacement = 0.5 } = {}) {
  if (!bounds || ![bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite) || bounds.w < 0 || bounds.h < 0) fail('WARP_BOUNDS_INVALID');
  const boundedStrength = Math.max(-1, Math.min(1, finite(strength)));
  const displacementRatio = Math.max(0, Math.min(0.5, finite(maxDisplacement, 0.5)));
  return {
    authority: 'INK-NON-DESTRUCTIVE-DEFORMATION',
    mode: 'bend-x',
    bounds: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h },
    normalized: { strength: boundedStrength, maxDisplacement: displacementRatio },
    parameters: { bend: boundedStrength * bounds.w * displacementRatio }
  };
}

// Bounded offset semantics, planned here so all projective consumers share math.
export function createPathProjectiveDeformationPlan(bounds, { xOffset = 0, yOffset = 0 } = {}, mode = 'distort') {
  if (!bounds || ![bounds.x, bounds.y, bounds.w, bounds.h, xOffset, yOffset].every(Number.isFinite) || bounds.w <= 0 || bounds.h <= 0) fail('PROJECTIVE_BOUNDS_INVALID');
  if (!['distort', 'perspective'].includes(mode)) fail('PROJECTIVE_MODE_INVALID');
  const { x, y, w, h } = bounds;
  const sourceQuad = [{ x, y }, { x: x+w, y }, { x: x+w, y: y+h }, { x, y: y+h }];
  const destinationQuad = sourceQuad.map(point => ({ ...point }));
  if (mode === 'distort') {
    // Independent corner offsets form a free asymmetric quadrilateral.
    destinationQuad[0].x += xOffset;
    destinationQuad[1].y += yOffset;
    // The lower edge stays fixed; the upper corners move independently.
  } else {
    // Opposing edge pairs converge about the center; no free corner movement.
    destinationQuad[0].x += xOffset; destinationQuad[1].x -= xOffset;
    destinationQuad[2].x += xOffset; destinationQuad[3].x -= xOffset;
    destinationQuad[0].y += yOffset; destinationQuad[3].y -= yOffset;
    destinationQuad[1].y -= yOffset; destinationQuad[2].y += yOffset;
  }
  // Reject inverted, concave or collapsed mappings before any native mutation.
  for (let i = 0; i < 4; i++) {
    const a = destinationQuad[i], b = destinationQuad[(i+1)%4], c = destinationQuad[(i+2)%4];
    if ((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x) <= EPSILON) fail('PROJECTIVE_QUAD_FOLDED');
  }
  return { mode, xOffset, yOffset, sourceQuad, destinationQuad,
    matrix: createProjectiveTransform(sourceQuad, destinationQuad) };
}
