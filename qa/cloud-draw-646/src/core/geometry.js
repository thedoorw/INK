import { Matrix } from './math.js';

export const unionBounds = (a, b) => {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: x2 - x, h: y2 - y };
};

export const transformBounds = (bounds, matrix) => {
  const points = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.w, y: bounds.y },
    { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
    { x: bounds.x, y: bounds.y + bounds.h }
  ].map(point => Matrix.point(matrix, point));
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys)
  };
};

export const boundsContains = (outer, inner) =>
  inner.x >= outer.x && inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

export const boundsIntersect = (a, b) =>
  a.x <= b.x + b.w && a.x + a.w >= b.x &&
  a.y <= b.y + b.h && a.y + a.h >= b.y;
