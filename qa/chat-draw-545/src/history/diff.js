import { deepClone } from '../core/index.js';

const isObject = value => value !== null && typeof value === 'object';
const sameContainerKind = (a, b) => Array.isArray(a) === Array.isArray(b);
const isIdArray = value => Array.isArray(value) && value.every(item => item && typeof item === 'object' && typeof item.id === 'string') && new Set(value.map(item => item.id)).size === value.length;

function pushSet(forward, inverse, path, before, after) {
  forward.push({ op: 'set', path: [...path], value: deepClone(after) });
  inverse.unshift(before === undefined
    ? { op: 'delete', path: [...path] }
    : { op: 'set', path: [...path], value: deepClone(before) });
}

function diffIdArray(oldValue, newValue, path, forward, inverse, visit) {
  const oldById = new Map(oldValue.map(item => [item.id, item]));
  const newById = new Map(newValue.map(item => [item.id, item]));
  const current = oldValue.map(item => item.id);

  for (let index = current.length - 1; index >= 0; index -= 1) {
    const id = current[index];
    if (newById.has(id)) continue;
    forward.push({ op: 'array-delete', path: [...path], index, id });
    inverse.unshift({ op: 'array-insert', path: [...path], index, value: deepClone(oldById.get(id)) });
    current.splice(index, 1);
  }

  for (let targetIndex = 0; targetIndex < newValue.length; targetIndex += 1) {
    const id = newValue[targetIndex].id;
    const currentIndex = current.indexOf(id);
    if (currentIndex < 0) {
      forward.push({ op: 'array-insert', path: [...path], index: targetIndex, value: deepClone(newValue[targetIndex]) });
      inverse.unshift({ op: 'array-delete', path: [...path], index: targetIndex, id });
      current.splice(targetIndex, 0, id);
    } else if (currentIndex !== targetIndex) {
      forward.push({ op: 'array-move', path: [...path], from: currentIndex, to: targetIndex, id });
      inverse.unshift({ op: 'array-move', path: [...path], from: targetIndex, to: currentIndex, id });
      current.splice(targetIndex, 0, current.splice(currentIndex, 1)[0]);
    }
  }

  for (let index = 0; index < newValue.length; index += 1) {
    const id = newValue[index].id;
    if (oldById.has(id)) visit(oldById.get(id), newById.get(id), [...path, index]);
  }
}

export function createPatchPair(before, after) {
  const forward = [];
  const inverse = [];

  const visit = (oldValue, newValue, path) => {
    if (Object.is(oldValue, newValue)) return;
    if (!isObject(oldValue) || !isObject(newValue) || !sameContainerKind(oldValue, newValue)) {
      pushSet(forward, inverse, path, oldValue, newValue);
      return;
    }

    if (Array.isArray(oldValue)) {
      if (isIdArray(oldValue) && isIdArray(newValue)) {
        diffIdArray(oldValue, newValue, path, forward, inverse, visit);
        return;
      }
      if (oldValue.length !== newValue.length) {
        pushSet(forward, inverse, path, oldValue, newValue);
        return;
      }
      for (let index = 0; index < oldValue.length; index += 1) visit(oldValue[index], newValue[index], [...path, index]);
      return;
    }

    const keys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
    for (const key of keys) {
      const hasOld = Object.prototype.hasOwnProperty.call(oldValue, key);
      const hasNew = Object.prototype.hasOwnProperty.call(newValue, key);
      const nextPath = [...path, key];
      if (!hasNew) {
        forward.push({ op: 'delete', path: nextPath });
        inverse.unshift({ op: 'set', path: nextPath, value: deepClone(oldValue[key]) });
      } else if (!hasOld) {
        forward.push({ op: 'set', path: nextPath, value: deepClone(newValue[key]) });
        inverse.unshift({ op: 'delete', path: nextPath });
      } else visit(oldValue[key], newValue[key], nextPath);
    }
  };

  visit(before, after, []);
  return { forward, inverse };
}

function valueAt(root, path) {
  let value = root;
  for (const key of path) value = value[key];
  return value;
}

function parentAt(root, path) {
  let parent = root;
  for (let index = 0; index < path.length - 1; index += 1) parent = parent[path[index]];
  return parent;
}

export function applyPatches(target, patches) {
  let root = target;
  for (const patch of patches) {
    if (patch.op.startsWith('array-')) {
      const array = valueAt(root, patch.path);
      if (!Array.isArray(array)) throw new TypeError(`History array path is not an array: ${patch.path.join('.')}`);
      if (patch.op === 'array-insert') array.splice(Math.max(0, Math.min(array.length, patch.index)), 0, deepClone(patch.value));
      else if (patch.op === 'array-delete') {
        const index = array[patch.index]?.id === patch.id ? patch.index : array.findIndex(item => item?.id === patch.id);
        if (index >= 0) array.splice(index, 1);
      } else if (patch.op === 'array-move') {
        const from = array[patch.from]?.id === patch.id ? patch.from : array.findIndex(item => item?.id === patch.id);
        if (from >= 0) array.splice(Math.max(0, Math.min(array.length, patch.to)), 0, array.splice(from, 1)[0]);
      }
      continue;
    }
    if (patch.path.length === 0) {
      root = patch.op === 'delete' ? undefined : deepClone(patch.value);
      continue;
    }
    const parent = parentAt(root, patch.path);
    const key = patch.path[patch.path.length - 1];
    if (patch.op === 'delete') {
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete parent[key];
    } else parent[key] = deepClone(patch.value);
  }
  return root;
}

export function patchByteSize(patches) {
  return new TextEncoder().encode(JSON.stringify(patches)).byteLength;
}

export function patchObjectIds(patches) {
  const ids = new Set();
  for (const patch of patches) {
    if (patch.id) ids.add(patch.id);
    if (patch.value?.id) ids.add(patch.value.id);
  }
  return [...ids];
}
