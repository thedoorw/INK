import { deepClone } from '../core/index.js';
import { findPageObject, isFrame, walkPageObjects } from './hierarchy.js';

export const LAYOUT_SCHEMA = 'INK-LAYOUT-1';
export const LAYOUT_ITEM_SCHEMA = 'INK-LAYOUT-ITEM-1';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value, fallback = 0) => Number.isFinite(+value) ? +value : fallback;
const nonNegative = (value, fallback = 0) => Math.max(0, finite(value, fallback));
const oneOf = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;

export function normalizeFrameLayout(value) {
  if (value === undefined) return undefined;
  if (!record(value) || value.schema !== LAYOUT_SCHEMA) return deepClone(value);
  const padding = record(value.padding) ? value.padding : {};
  const sizing = record(value.sizing) ? value.sizing : {};
  return {
    ...deepClone(value),
    schema: LAYOUT_SCHEMA,
    mode: oneOf(value.mode, ['manual', 'horizontal', 'vertical'], 'manual'),
    gap: nonNegative(value.gap),
    padding: {
      ...deepClone(padding),
      top: nonNegative(padding.top), right: nonNegative(padding.right),
      bottom: nonNegative(padding.bottom), left: nonNegative(padding.left)
    },
    align: {
      ...deepClone(record(value.align) ? value.align : {}),
      main: oneOf(value.align?.main, ['start', 'center', 'end', 'space-between'], 'start'),
      cross: oneOf(value.align?.cross, ['start', 'center', 'end', 'stretch'], 'start')
    },
    sizing: {
      ...deepClone(sizing),
      horizontal: oneOf(sizing.horizontal, ['fixed', 'hug'], 'fixed'),
      vertical: oneOf(sizing.vertical, ['fixed', 'hug'], 'fixed')
    }
  };
}

export function normalizeLayoutItem(value) {
  if (value === undefined) return undefined;
  if (!record(value) || value.schema !== LAYOUT_ITEM_SCHEMA) return deepClone(value);
  const sizing = record(value.sizing) ? value.sizing : {};
  const fixedSize = record(value.fixedSize) ? value.fixedSize : {};
  const constraints = record(value.constraints) ? value.constraints : {};
  return {
    ...deepClone(value),
    schema: LAYOUT_ITEM_SCHEMA,
    participation: oneOf(value.participation, ['flow', 'absolute'], 'flow'),
    sizing: {
      ...deepClone(sizing),
      horizontal: oneOf(sizing.horizontal, ['fixed', 'fill', 'hug'], 'hug'),
      vertical: oneOf(sizing.vertical, ['fixed', 'fill', 'hug'], 'hug')
    },
    fixedSize: {
      ...deepClone(fixedSize),
      width: nonNegative(fixedSize.width, 1), height: nonNegative(fixedSize.height, 1)
    },
    constraints: {
      ...deepClone(constraints),
      horizontal: oneOf(constraints.horizontal, ['start', 'end', 'center', 'scale', 'stretch'], 'start'),
      vertical: oneOf(constraints.vertical, ['start', 'end', 'center', 'scale', 'stretch'], 'start')
    }
  };
}

export function normalizeObjectLayout(object) {
  if (!object || typeof object !== 'object') return object;
  if (object.layout !== undefined && isFrame(object)) object.layout = normalizeFrameLayout(object.layout);
  if (object.layoutItem !== undefined) object.layoutItem = normalizeLayoutItem(object.layoutItem);
  return object;
}

function intrinsicSize(object, boundsForObject) {
  const supplied = boundsForObject?.(object);
  if (supplied && Number.isFinite(+supplied.w) && Number.isFinite(+supplied.h)) {
    return { width: Math.max(0, +supplied.w), height: Math.max(0, +supplied.h) };
  }
  if (object?.type === 'frame') return { width: nonNegative(object.width, 1), height: nonNegative(object.height, 1) };
  return { width: nonNegative(object?.w, 1), height: nonNegative(object?.h, 1) };
}

function sized(object, item, frame, axis, available, intrinsic, fillUsesIntrinsic = false) {
  const key = axis === 'horizontal' ? 'width' : 'height';
  const mode = item.sizing[axis];
  if (mode === 'fill') return fillUsesIntrinsic ? intrinsic[key] : Math.max(0, available);
  if (mode === 'hug') return intrinsic[key];
  return nonNegative(item.fixedSize[key], intrinsic[key]);
}

// Produces a disposable plan. Metadata is intent authority; ordinary matrices and
// Frame/object geometry remain committed geometry until an explicit future command applies a plan.
export function evaluateFrameLayout(frame, { boundsForObject = null } = {}) {
  if (!isFrame(frame)) throw Object.assign(new Error('layout-frame-required'), { code: 'layout-frame-required' });
  const layout = normalizeFrameLayout(frame.layout);
  if (!layout) return { schema: LAYOUT_SCHEMA, status: 'no-layout', frameId: frame.id, items: [] };
  if (layout.schema !== LAYOUT_SCHEMA) return { schema: LAYOUT_SCHEMA, status: 'unsupported-layout-schema', frameId: frame.id, items: [], diagnostics: [{ code: 'layout-unsupported-schema' }] };
  if (layout.mode === 'manual') return { schema: LAYOUT_SCHEMA, status: 'manual', frameId: frame.id, frameSize: { width: frame.width, height: frame.height }, items: [] };
  const horizontal = layout.mode === 'horizontal';
  const mainPadding = horizontal ? layout.padding.left + layout.padding.right : layout.padding.top + layout.padding.bottom;
  const crossPadding = horizontal ? layout.padding.top + layout.padding.bottom : layout.padding.left + layout.padding.right;
  const frameMain = horizontal ? frame.width : frame.height;
  const frameCross = horizontal ? frame.height : frame.width;
  const flow = (frame.children || []).filter(child => normalizeLayoutItem(child.layoutItem)?.participation !== 'absolute');
  const absolute = (frame.children || []).filter(child => normalizeLayoutItem(child.layoutItem)?.participation === 'absolute');
  const details = flow.map(object => {
    if (object.layoutItem !== undefined && object.layoutItem?.schema !== LAYOUT_ITEM_SCHEMA) {
      throw Object.assign(new Error('layout-item-unsupported-schema'), { code: 'layout-item-unsupported-schema', objectId: object.id });
    }
    return { object, item: normalizeLayoutItem(object.layoutItem) || normalizeLayoutItem({ schema: LAYOUT_ITEM_SCHEMA }), intrinsic: intrinsicSize(object, boundsForObject) };
  });
  const mainAxis = horizontal ? 'horizontal' : 'vertical', crossAxis = horizontal ? 'vertical' : 'horizontal';
  const mainHug = layout.sizing[mainAxis] === 'hug', crossHug = layout.sizing[crossAxis] === 'hug';
  const fill = mainHug ? [] : details.filter(({ item }) => item.sizing[mainAxis] === 'fill');
  const nonFillMain = details.filter(detail => !fill.includes(detail)).reduce((sum, detail) => sum + sized(detail.object, detail.item, frame, mainAxis, 0, detail.intrinsic, mainHug), 0);
  const baseGap = Math.max(0, details.length - 1) * layout.gap;
  const remaining = Math.max(0, frameMain - mainPadding - baseGap - nonFillMain);
  const fillShare = fill.length ? remaining / fill.length : 0;
  const measured = details.map(detail => {
    const main = sized(detail.object, detail.item, frame, mainAxis, fillShare, detail.intrinsic, mainHug);
    const cross = sized(detail.object, detail.item, frame, crossAxis, Math.max(0, frameCross - crossPadding), detail.intrinsic, crossHug);
    return { ...detail, main, cross };
  });
  const contentMain = measured.reduce((sum, item) => sum + item.main, 0) + baseGap;
  const free = mainHug ? 0 : Math.max(0, frameMain - mainPadding - contentMain);
  let cursor = horizontal ? layout.padding.left : layout.padding.top;
  let gap = layout.gap;
  if (layout.align.main === 'center') cursor += free / 2;
  else if (layout.align.main === 'end') cursor += free;
  else if (layout.align.main === 'space-between' && measured.length > 1) gap += free / (measured.length - 1);
  const items = measured.map(({ object, main, cross }) => {
    const availableCross = Math.max(0, frameCross - crossPadding);
    const finalCross = layout.align.cross === 'stretch' && !crossHug ? availableCross : cross;
    let crossPosition = horizontal ? layout.padding.top : layout.padding.left;
    if (layout.align.cross === 'center') crossPosition += (availableCross - finalCross) / 2;
    else if (layout.align.cross === 'end') crossPosition += availableCross - finalCross;
    const x = horizontal ? cursor : crossPosition;
    const y = horizontal ? crossPosition : cursor;
    const width = horizontal ? main : finalCross;
    const height = horizontal ? finalCross : main;
    cursor += main + gap;
    return { objectId: object.id, x, y, width, height, matrix: [...(object.matrix || [1, 0, 0, 1, 0, 0]).slice(0, 4), x, y] };
  });
  const hugWidth = horizontal ? contentMain + mainPadding : Math.max(0, ...items.map(item => item.width)) + crossPadding;
  const hugHeight = horizontal ? Math.max(0, ...items.map(item => item.height)) + crossPadding : contentMain + mainPadding;
  return {
    schema: LAYOUT_SCHEMA, status: 'resolved', frameId: frame.id, mode: layout.mode,
    frameSize: {
      width: layout.sizing.horizontal === 'hug' ? hugWidth : frame.width,
      height: layout.sizing.vertical === 'hug' ? hugHeight : frame.height
    },
    items,
    absoluteObjectIds: absolute.map(object => object.id),
    diagnostics: details.filter(({ item }) =>
      (mainHug && item.sizing[mainAxis] === 'fill') || (crossHug && item.sizing[crossAxis] === 'fill')
    ).map(({ object }) => ({ code: 'layout-fill-in-hug-axis-uses-intrinsic', objectId: object.id }))
  };
}

export function evaluateResizeConstraints(frame, { previousWidth, previousHeight, width, height, boundsForObject = null } = {}) {
  if (!isFrame(frame)) throw Object.assign(new Error('layout-frame-required'), { code: 'layout-frame-required' });
  const oldW = Math.max(1e-9, finite(previousWidth, frame.width));
  const oldH = Math.max(1e-9, finite(previousHeight, frame.height));
  const nextW = nonNegative(width, frame.width), nextH = nonNegative(height, frame.height);
  const axis = (position, size, oldSize, nextSize, intent) => {
    if (intent === 'end') return { position: nextSize - (oldSize - position), size };
    if (intent === 'center') return { position: position + (nextSize - oldSize) / 2, size };
    if (intent === 'scale') return { position: position * nextSize / oldSize, size: size * nextSize / oldSize };
    if (intent === 'stretch') return { position, size: Math.max(0, size + nextSize - oldSize) };
    return { position, size };
  };
  return {
    schema: LAYOUT_SCHEMA, status: 'resolved-constraints', frameId: frame.id,
    frameSize: { width: nextW, height: nextH },
    items: (frame.children || []).map(object => {
      if (object.layoutItem !== undefined && object.layoutItem?.schema !== LAYOUT_ITEM_SCHEMA) {
        throw Object.assign(new Error('layout-item-unsupported-schema'), { code: 'layout-item-unsupported-schema', objectId: object.id });
      }
      const item = normalizeLayoutItem(object.layoutItem) || normalizeLayoutItem({ schema: LAYOUT_ITEM_SCHEMA });
      const size = intrinsicSize(object, boundsForObject), matrix = object.matrix || [1, 0, 0, 1, 0, 0];
      const horizontal = axis(finite(matrix[4]), size.width, oldW, nextW, item.constraints.horizontal);
      const vertical = axis(finite(matrix[5]), size.height, oldH, nextH, item.constraints.vertical);
      return { objectId: object.id, x: horizontal.position, y: vertical.position, width: horizontal.size, height: vertical.size, matrix: [...matrix.slice(0, 4), horizontal.position, vertical.position] };
    })
  };
}

export function inspectLayouts(document) {
  const diagnostics = [];
  for (const entry of (document.pages || []).flatMap(page => walkPageObjects(page))) {
    const object = entry.object;
    if (object.layout !== undefined) {
      if (!isFrame(object)) diagnostics.push({ code: 'layout-non-frame-container', objectId: object.id });
      else if (!record(object.layout) || object.layout.schema !== LAYOUT_SCHEMA) diagnostics.push({ code: 'layout-unknown-or-invalid-schema', objectId: object.id });
      else {
        const normalized = normalizeFrameLayout(object.layout);
        const known = object.layout;
        if (known.mode !== normalized.mode || known.gap !== normalized.gap ||
            known.padding?.top !== normalized.padding.top || known.padding?.right !== normalized.padding.right ||
            known.padding?.bottom !== normalized.padding.bottom || known.padding?.left !== normalized.padding.left ||
            known.align?.main !== normalized.align.main || known.align?.cross !== normalized.align.cross ||
            known.sizing?.horizontal !== normalized.sizing.horizontal || known.sizing?.vertical !== normalized.sizing.vertical) {
          diagnostics.push({ code: 'layout-known-fields-not-normalized', objectId: object.id });
        }
      }
    }
    if (object.layoutItem !== undefined) {
      if (!entry.parentObject || !isFrame(entry.parentObject)) diagnostics.push({ code: 'layout-item-outside-frame', objectId: object.id });
      if (!record(object.layoutItem) || object.layoutItem.schema !== LAYOUT_ITEM_SCHEMA) diagnostics.push({ code: 'layout-item-unknown-or-invalid-schema', objectId: object.id });
      else {
        const normalized = normalizeLayoutItem(object.layoutItem), known = object.layoutItem;
        if (known.participation !== normalized.participation ||
            known.sizing?.horizontal !== normalized.sizing.horizontal || known.sizing?.vertical !== normalized.sizing.vertical ||
            known.fixedSize?.width !== normalized.fixedSize.width || known.fixedSize?.height !== normalized.fixedSize.height ||
            known.constraints?.horizontal !== normalized.constraints.horizontal || known.constraints?.vertical !== normalized.constraints.vertical) {
          diagnostics.push({ code: 'layout-item-known-fields-not-normalized', objectId: object.id });
        }
      }
    }
  }
  return diagnostics;
}

function transact(app, label, targets, operation) {
  if (!app?.history || app.history.pending) throw Object.assign(new Error('layout-history-busy'), { code: 'layout-history-busy' });
  let result;
  app.history.pushScoped(label, targets, () => { result = operation(); });
  app.spatialDirty = true;
  app.refreshAll?.();
  return result;
}

function entryPath(document, objectId) {
  for (let pageIndex = 0; pageIndex < (document.pages || []).length; pageIndex++) {
    const page = document.pages[pageIndex], entry = findPageObject(page, objectId);
    if (entry) return { entry, path: ['pages', pageIndex, ...entry.path] };
  }
  throw Object.assign(new Error('layout-object-not-found'), { code: 'layout-object-not-found' });
}

export function setFrameLayout(app, frameId, layout) {
  const { entry, path } = entryPath(app.doc, frameId);
  if (!isFrame(entry.object)) throw Object.assign(new Error('layout-frame-required'), { code: 'layout-frame-required' });
  const normalized = layout === null ? null : normalizeFrameLayout({ schema: LAYOUT_SCHEMA, ...layout });
  return transact(app, layout === null ? 'Remove Frame Layout' : 'Set Frame Layout', [[...path, 'layout']], () => {
    if (normalized === null) delete entry.object.layout;
    else entry.object.layout = normalized;
    return entry.object;
  });
}

export function setChildLayoutItem(app, objectId, item) {
  const { entry, path } = entryPath(app.doc, objectId);
  if (!entry.parentObject || !isFrame(entry.parentObject)) throw Object.assign(new Error('layout-item-frame-parent-required'), { code: 'layout-item-frame-parent-required' });
  const normalized = item === null ? null : normalizeLayoutItem({ schema: LAYOUT_ITEM_SCHEMA, ...item });
  return transact(app, item === null ? 'Remove Child Layout Metadata' : 'Set Child Layout Metadata', [[...path, 'layoutItem']], () => {
    if (normalized === null) delete entry.object.layoutItem;
    else entry.object.layoutItem = normalized;
    return entry.object;
  });
}
