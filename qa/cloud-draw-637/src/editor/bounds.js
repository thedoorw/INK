import { Matrix, transformBounds, unionBounds } from '../core/index.js';

export const EMPTY_GROUP_GEOMETRY_SIZE = 1;

export function frameLocalGeometryBounds(frame) {
  return {
    x: 0,
    y: 0,
    w: Number.isFinite(+frame?.width) && +frame.width > 0 ? +frame.width : 1,
    h: Number.isFinite(+frame?.height) && +frame.height > 0 ? +frame.height : 1
  };
}

export function frameWorldGeometryBounds(frame, parentWorldMatrix = Matrix.identity()) {
  return transformBounds(
    frameLocalGeometryBounds(frame),
    Matrix.toWorld(parentWorldMatrix, frame?.matrix || Matrix.identity())
  );
}

export function groupWorldGeometryBounds(group, parentWorldMatrix = Matrix.identity(), worldBoundsForObject) {
  const groupWorld = Matrix.toWorld(parentWorldMatrix, group?.matrix || Matrix.identity());
  let bounds = null;
  for (const child of group?.children || []) {
    bounds = unionBounds(bounds, worldBoundsForObject?.(child, groupWorld) || null);
  }
  return bounds || {
    x: groupWorld[4],
    y: groupWorld[5],
    w: EMPTY_GROUP_GEOMETRY_SIZE,
    h: EMPTY_GROUP_GEOMETRY_SIZE
  };
}

export function collapseTransformRoots(foundObjects = []) {
  const ids = new Set(foundObjects.filter(Boolean).map(found => found.object?.id).filter(Boolean));
  return foundObjects.filter(found =>
    found?.object && !(found.ancestorIds || []).some(ancestorId => ids.has(ancestorId))
  );
}

export function selectionWorldGeometryBounds(foundObjects = [], worldBoundsForFound) {
  let bounds = null;
  for (const found of collapseTransformRoots(foundObjects)) {
    bounds = unionBounds(bounds, worldBoundsForFound?.(found) || null);
  }
  return bounds;
}

export function resizeFrameGeometry(frame, { width = null, height = null, preserveAspect = false } = {}) {
  if (frame?.type !== 'frame') return false;
  const oldWidth = Number.isFinite(+frame.width) && +frame.width > 0 ? +frame.width : 1;
  const oldHeight = Number.isFinite(+frame.height) && +frame.height > 0 ? +frame.height : 1;
  let nextWidth = width == null ? oldWidth : +width;
  let nextHeight = height == null ? oldHeight : +height;
  if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight) || nextWidth <= 0 || nextHeight <= 0) return false;
  if (preserveAspect && width != null && height == null) nextHeight = oldHeight * (nextWidth / oldWidth);
  else if (preserveAspect && height != null && width == null) nextWidth = oldWidth * (nextHeight / oldHeight);
  frame.width = nextWidth;
  frame.height = nextHeight;
  return true;
}
