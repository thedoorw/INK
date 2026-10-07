import { boundsContains, boundsIntersect, polygonContains } from '../core/index.js';

export function marqueeCandidates(index, worldBounds, screenBox, mode, screenBoundsForObject) {
  const candidates = index.query(worldBounds);
  return candidates.filter(item => {
    const bounds = screenBoundsForObject(item.object, item);
    return mode === 'contain' ? boundsContains(screenBox, bounds) : boundsIntersect(screenBox, bounds);
  });
}

export function lassoCandidates(index, polygon, worldBounds, worldBoundsForObject) {
  return index.query(worldBounds).filter(item => {
    const bounds = worldBoundsForObject(item.object, item);
    const points = [
      { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 },
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
      { x: bounds.x, y: bounds.y + bounds.h }
    ];
    return points.some(point => polygonContains(point, polygon));
  });
}

export function polygonBounds(points) {
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
