// Synchronize genuine linked Repeat generators only when their original
// sibling source changes inside one Native History transaction.
// The sibling/origin restriction prevents cross-layer accidental binding.
import { walkPageObjects } from '../document/hierarchy.js';

const containsPath = (parent, child) =>
  parent.length <= child.length && parent.every((value, index) => value === child[index]);

const clone = value => JSON.parse(JSON.stringify(value));

function valueAt(root, path) {
  let result = root;
  for (const key of path) {
    if (result == null || !Object.prototype.hasOwnProperty.call(Object(result), key))
      return null;
    result = result[key];
  }
  return result;
}

export function collectLinkedRepeatDependencies(document, selectedPaths = null) {
  const pairs = [];
  for (const [pageIndex, page] of (document?.pages || []).entries()) {
    // An ordinary scoped edit of page N must not walk every other page.
    // Root/pages-wide mutations and full History snapshots still cover all.
    if (selectedPaths && !selectedPaths.some(path =>
      path.length === 0 || (path[0] === 'pages' &&
        (path.length === 1 || path[1] === pageIndex)))) continue;
    const entries = walkPageObjects(page);
    const prefix = ['pages', pageIndex];
    const sources = new Map();
    for (const item of entries) {
      if (!item.object?.id) continue;
      const key = item.layer.id + ':' + item.object.id;
      if (!sources.has(key)) sources.set(key, []);
      sources.get(key).push(item);
    }
    for (const repeat of entries) {
      const object = repeat.object;
      if (object?.type !== 'repeat' || object.linked !== true ||
          !object.sourceObjectId || !object.source) continue;
      const candidates = sources.get(repeat.layer.id + ':' + object.sourceObjectId) || [];
      const siblings = candidates.filter(item =>
        item !== repeat && item.parentArray === repeat.parentArray);
      // Duplicate source IDs in one parent make the master ambiguous.
      // Never silently bind the first matching object and overwrite art.
      if (siblings.length !== 1) continue;
      const source = siblings[0];
      const sourcePath = [...prefix, ...source.path];
      if (selectedPaths && !selectedPaths.some(target =>
        containsPath(target, sourcePath) || containsPath(sourcePath, target))) continue;
      pairs.push({
        sourcePath,
        repeatPath: [...prefix, ...repeat.path],
        sourceId: source.object.id,
        repeatId: object.id,
        sourceBefore: JSON.stringify(source.object)
      });
    }
  }
  return pairs;
}

export function synchronizeLinkedRepeatDependencies(document, pairs, app = null) {
  let updated = 0;
  for (const dependency of pairs || []) {
    const source = valueAt(document, dependency.sourcePath);
    const repeat = valueAt(document, dependency.repeatPath);
    if (!source || !repeat || source.id !== dependency.sourceId ||
        repeat.id !== dependency.repeatId || repeat.type !== 'repeat' ||
        repeat.linked !== true || repeat.sourceObjectId !== dependency.sourceId) continue;
    // Do not overwrite an independently edited Repeat snapshot when its
    // source did not change in this History transaction.
    if (JSON.stringify(source) === dependency.sourceBefore) continue;
    repeat.source = clone(source);
    // Count, instance IDs, radial transforms and Repeat identity stay intact.
    app?.queueSpatialObject?.(repeat.id);
    updated++;
  }
  if (updated && app) app.spatialDirty = true;
  return updated;
}
