import { inspectComponents } from './components.js';
import { inspectLayouts } from './layout.js';
import { deepClone, nowISO } from '../core/index.js';
import { validateExpressiveStroke } from '../vector/stroke-appearance.js';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function documentFingerprint(document) {
  return `fnv1a32:${fnv1a32(stableStringify(document))}`;
}

function issue(list, code, path, message, details = null) {
  list.push({ code, path, message, ...(details ? { details } : {}) });
}

export function inspectDocument(document, {
  maxObjects = 100000,
  maxPoints = 5000000,
  maxBytes = 128 * 1024 * 1024
} = {}) {
  const errors = [], warnings = [];
  const stats = {
    pages: 0, layers: 0, objects: 0, groups: 0, frames: 0, paths: 0, expressiveStrokes: 0, strokes: 0, points: 0,
    duplicateIds: 0, duplicateOwnership: 0, structuralCycles: 0, staleParentIds: 0, byteLength: 0
  };
  const ids = new Set();
  const ownedObjects = new WeakSet();
  const activeObjects = new WeakSet();
  const encoder = new TextEncoder();

  const registerId = (id, path) => {
    if (typeof id !== 'string' || !id.trim()) return issue(errors, 'missing-id', path, '缺少有效 ID');
    if (ids.has(id)) {
      stats.duplicateIds++;
      issue(errors, 'duplicate-id', path, `重複 ID：${id}`);
    }
    ids.add(id);
  };

  const scanObject = (object, path, { expectedParentId = null, topLevel = false } = {}) => {
    stats.objects++;
    if (!object || typeof object !== 'object') {
      issue(errors, 'invalid-object', path, '物件不是有效資料');
      return;
    }
    if (activeObjects.has(object)) {
      stats.structuralCycles++;
      issue(errors, 'structural-cycle', path, '結構容器形成循環 ownership');
      return;
    }
    if (ownedObjects.has(object)) {
      stats.duplicateOwnership++;
      issue(errors, 'duplicate-ownership', path, '同一物件出現在多個結構 ownership 位置');
      return;
    }
    ownedObjects.add(object);
    activeObjects.add(object);

    registerId(object.id, `${path}.id`);
    if (topLevel && object.parentId != null) {
      stats.staleParentIds++;
      issue(errors, 'stale-top-level-parent-id', `${path}.parentId`, '頂層物件不得保留 parentId');
    } else if (!topLevel && expectedParentId && object.parentId !== expectedParentId) {
      issue(errors, 'invalid-parent-id', `${path}.parentId`, '子物件 parentId 必須指向實際父容器');
    }

    if (!Array.isArray(object.matrix) || object.matrix.length !== 6 || object.matrix.some(value => !Number.isFinite(+value))) {
      issue(errors, 'invalid-matrix', `${path}.matrix`, '物件矩陣必須包含六個有限數值');
    }
    if (object.type === 'path') {
      stats.paths++;
      if (object.expressiveStroke != null) {
        stats.expressiveStrokes++;
        const validation = validateExpressiveStroke(object.expressiveStroke);
        for (const error of validation.errors) issue(errors, 'invalid-expressive-stroke', `${path}.expressiveStroke.${error}`, 'Expressive Stroke appearance payload is invalid', { field: error });
      }
    }
    if (object.type === 'stroke') {
      stats.strokes++;
      if (!Array.isArray(object.points)) issue(errors, 'invalid-points', `${path}.points`, '筆畫缺少點陣列');
      else {
        stats.points += object.points.length;
        object.points.forEach((point, pointIndex) => {
          if (!Number.isFinite(+point?.x) || !Number.isFinite(+point?.y)) {
            issue(errors, 'invalid-point', `${path}.points[${pointIndex}]`, '筆畫座標不是有限數值');
          }
        });
      }
    }

    if (object.type === 'group' || object.type === 'frame') {
      if (object.type === 'group') stats.groups++;
      else {
        stats.frames++;
        if (!Number.isFinite(+object.width) || +object.width <= 0 || !Number.isFinite(+object.height) || +object.height <= 0) {
          issue(errors, 'invalid-frame-size', path, 'Frame 尺寸必須為正的有限數值');
        }
      }
      if (!Array.isArray(object.children)) {
        issue(errors, object.type === 'frame' ? 'invalid-frame' : 'invalid-group', `${path}.children`, `${object.type === 'frame' ? 'Frame' : '群組'} 缺少 children 陣列`);
      } else {
        object.children.forEach((child, index) => {
          scanObject(child, `${path}.children[${index}]`, { expectedParentId: object.id, topLevel: false });
        });
      }
    }

    activeObjects.delete(object);
  };

  if (!document || typeof document !== 'object') issue(errors, 'invalid-document', '$', '文件不是有效物件');
  else {
    if (document.format !== 'INK') issue(errors, 'invalid-format', '$.format', '文件格式必須為 INK');
    if (!Number.isInteger(+document.formatVersion) || +document.formatVersion < 1) issue(errors, 'invalid-format-version', '$.formatVersion', '文件格式版本無效');
    registerId(document.id, '$.id');
    if (!Array.isArray(document.pages) || !document.pages.length) issue(errors, 'missing-pages', '$.pages', '文件至少需要一個頁面');
    else {
      stats.pages = document.pages.length;
      document.pages.forEach((page, pageIndex) => {
        const path = `$.pages[${pageIndex}]`;
        registerId(page?.id, `${path}.id`);
        if (page?.artboard) {
          const artboard = page.artboard;
          if (artboard.mode !== 'fixed') issue(errors, 'invalid-artboard-mode', `${path}.artboard.mode`, '畫板模式必須為 fixed；創作／版面切換由 workspace 管理');
          if (!Number.isFinite(+artboard.widthMm) || +artboard.widthMm <= 0 || !Number.isFinite(+artboard.heightMm) || +artboard.heightMm <= 0) issue(errors, 'invalid-artboard-size', `${path}.artboard`, '畫板尺寸必須為正的有限數值');
          if (!Number.isFinite(+artboard.ppi) || +artboard.ppi < 72 || +artboard.ppi > 1200) issue(errors, 'invalid-artboard-ppi', `${path}.artboard.ppi`, '畫板 PPI 必須介於 72 與 1200');
          if (!Number.isFinite(+artboard.bleedMm) || +artboard.bleedMm < 0) issue(errors, 'invalid-artboard-bleed', `${path}.artboard.bleedMm`, '出血尺寸不得為負數');
        }
        if (!page?.workspace || !['creation', 'layout'].includes(page.workspace.activeSpace)) issue(errors, 'invalid-workspace', `${path}.workspace`, '頁面必須具有 creation／layout 雙工作空間');
        else {
          const viewport = page.workspace.layoutViewport;
          if (!viewport || ![viewport.x, viewport.y, viewport.scale, viewport.rotation].every(Number.isFinite) || viewport.scale <= 0) issue(errors, 'invalid-layout-viewport', `${path}.workspace.layoutViewport`, '版面視埠必須為有效有限數值');
          for (const space of ['creation', 'layout']) {
            const camera = page.workspace.cameras?.[space];
            if (!camera || ![camera.x, camera.y, camera.scale, camera.rotation].every(Number.isFinite) || camera.scale <= 0) issue(errors, 'invalid-workspace-camera', `${path}.workspace.cameras.${space}`, '工作空間相機必須為有效有限數值');
          }
        }
        if (!Array.isArray(page?.layers) || !page.layers.length) issue(errors, 'missing-layers', `${path}.layers`, '頁面至少需要一個圖層');
        else {
          stats.layers += page.layers.length;
          page.layers.forEach((layer, layerIndex) => {
            const layerPath = `${path}.layers[${layerIndex}]`;
            registerId(layer?.id, `${layerPath}.id`);
            if (!Array.isArray(layer?.objects)) issue(errors, 'invalid-objects', `${layerPath}.objects`, '圖層物件必須為陣列');
            else layer.objects.forEach((object, objectIndex) => scanObject(object, `${layerPath}.objects[${objectIndex}]`, { topLevel: true }));
          });
          if (!page.layers.some(layer => layer.id === page.activeLayerId)) issue(warnings, 'active-layer-fallback', `${path}.activeLayerId`, '作用中圖層不存在，載入時將回復至第一圖層');
        }
      });
      if (!document.pages.some(page => page.id === document.activePageId)) issue(warnings, 'active-page-fallback', '$.activePageId', '作用中頁面不存在，載入時將回復至第一頁');
    }
    try {
      stats.byteLength = encoder.encode(stableStringify(document)).byteLength;
    } catch (error) {
      issue(errors, 'serialization-failed', '$', '文件無法序列化', { error: String(error) });
    }
  }

  if (document && !stats.structuralCycles && !stats.duplicateOwnership) {
    for (const item of inspectComponents(document)) issue(warnings, item.code, '$.components', 'Component reference diagnostic', item);
    for (const item of inspectLayouts(document)) issue(warnings, item.code, '$.layout', 'Layout / constraint diagnostic', item);
  }

  if (stats.objects > maxObjects) issue(warnings, 'object-budget', '$', `物件數 ${stats.objects} 超過建議上限 ${maxObjects}`);
  if (stats.points > maxPoints) issue(warnings, 'point-budget', '$', `筆畫點數 ${stats.points} 超過建議上限 ${maxPoints}`);
  if (stats.byteLength > maxBytes) issue(warnings, 'byte-budget', '$', `文件大小超過建議上限 ${Math.round(maxBytes / 1048576)} MiB`);
  return {
    passed: errors.length === 0,
    errors,
    warnings,
    stats,
    fingerprint: errors.some(item => item.code === 'serialization-failed') ? null : documentFingerprint(document)
  };
}

export function createDocumentSnapshot(document, metadata = {}) {
  const value = deepClone(document);
  const serialized = stableStringify(value);
  return {
    schema: 'INK_DOCUMENT_SNAPSHOT_V1',
    createdAt: nowISO(),
    fingerprint: `fnv1a32:${fnv1a32(serialized)}`,
    byteLength: new TextEncoder().encode(serialized).byteLength,
    metadata: { ...metadata },
    value
  };
}

export function verifyDocumentSnapshot(snapshot) {
  if (!snapshot || snapshot.schema !== 'INK_DOCUMENT_SNAPSHOT_V1' || !snapshot.value) return { valid: false, reason: 'invalid-schema' };
  const serialized = stableStringify(snapshot.value);
  const fingerprint = `fnv1a32:${fnv1a32(serialized)}`;
  const byteLength = new TextEncoder().encode(serialized).byteLength;
  if (fingerprint !== snapshot.fingerprint) return { valid: false, reason: 'fingerprint-mismatch', fingerprint, expected: snapshot.fingerprint };
  if (byteLength !== snapshot.byteLength) return { valid: false, reason: 'length-mismatch', byteLength, expected: snapshot.byteLength };
  const integrity = inspectDocument(snapshot.value);
  return { valid: integrity.passed, reason: integrity.passed ? null : 'document-integrity', fingerprint, byteLength, integrity };
}
