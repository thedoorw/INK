import { boundsContains, unionBounds } from '../core/index.js';
import { findPageObject, walkPageObjects } from '../document/hierarchy.js';
import { Quadtree } from './quadtree.js';

export class PageSpatialIndex {
  constructor({ padding = 256, capacity = 12, maxDepth = 8 } = {}) {
    this.padding = padding;
    this.capacity = capacity;
    this.maxDepth = maxDepth;
    this.tree = null;
    this.items = [];
    this.itemById = new Map();
    this.pageId = null;
    this.revision = 0;
    this.incrementalUpdates = 0;
    this.fullRebuilds = 0;
  }

  makeRootBounds(world) {
    return world
      ? { x: world.x - this.padding, y: world.y - this.padding, w: Math.max(512, world.w + this.padding * 2), h: Math.max(512, world.h + this.padding * 2) }
      : { x: -2048, y: -2048, w: 4096, h: 4096 };
  }

  rebuild(page, boundsForObject) {
    this.pageId = page?.id || null;
    this.items = [];
    this.itemById.clear();
    let world = null;
    for (const entry of walkPageObjects(page)) {
      if (!entry.effectiveVisible) continue;
      const bounds = boundsForObject(entry.object, entry);
      if (!bounds) continue;
      world = unionBounds(world, bounds);
      const item = { ...entry, bounds };
      this.items.push(item);
      this.itemById.set(entry.object.id, item);
    }
    this.tree = new Quadtree(this.makeRootBounds(world), { capacity: this.capacity, maxDepth: this.maxDepth });
    for (const item of this.items) this.tree.insert(item);
    this.revision += 1;
    this.fullRebuilds += 1;
    return this;
  }

  removeObject(objectId) {
    const item = this.itemById.get(objectId);
    if (!item) return false;
    this.tree?.remove(candidate => candidate.object.id === objectId);
    this.itemById.delete(objectId);
    this.items = this.items.filter(candidate => candidate.object.id !== objectId);
    this.revision += 1;
    this.incrementalUpdates += 1;
    return true;
  }

  upsertObject(entry, bounds) {
    if (!entry?.object?.id || !bounds) return false;
    const nextItem = { ...entry, bounds };
    const outside = this.tree && !boundsContains(this.tree.bounds, bounds);
    if (outside) return false;
    this.tree?.remove(candidate => candidate.object.id === entry.object.id);
    this.items = this.items.filter(candidate => candidate.object.id !== entry.object.id);
    this.itemById.set(entry.object.id, nextItem);
    this.items.push(nextItem);
    this.tree?.insert(nextItem);
    this.revision += 1;
    this.incrementalUpdates += 1;
    return true;
  }

  syncObject(page, objectId, boundsForObject) {
    if (!this.tree || page?.id !== this.pageId) return false;
    const found = findPageObject(page, objectId);
    if (!found || !found.effectiveVisible) return this.removeObject(objectId);
    if (found.object.type === 'frame' || found.object.type === 'group' || found.ancestorTypes?.includes('group')) return false;
    const bounds = boundsForObject(found.object, found);
    return this.upsertObject(found, bounds);
  }

  syncObjects(page, objectIds, boundsForObject) {
    if (!this.tree || page?.id !== this.pageId) return false;
    const uniqueObjectIds = [...new Set(objectIds)];
    if (uniqueObjectIds.length > this.capacity) {
      this.rebuild(page, boundsForObject);
      return true;
    }
    for (const objectId of uniqueObjectIds) {
      if (!this.syncObject(page, objectId, boundsForObject)) return false;
    }
    return true;
  }

  refreshMetadata(page) {
    if (!this.tree || page?.id !== this.pageId) return false;
    const entries = new Map(walkPageObjects(page).map(entry => [entry.object.id, entry]));
    for (const item of this.items) {
      const current = entries.get(item.object.id);
      if (current) Object.assign(item, current);
    }
    return true;
  }

  query(bounds) {
    if (!this.tree) return [];
    return this.tree.query(bounds, []);
  }

  stats() {
    return {
      pageId: this.pageId,
      objects: this.items.length,
      nestedObjects: this.items.filter(item => item.depth > 0).length,
      nodes: this.tree?.countNodes() || 0,
      revision: this.revision,
      fullRebuilds: this.fullRebuilds,
      incrementalUpdates: this.incrementalUpdates,
      mode: 'incremental-quadtree-hierarchy-aware'
    };
  }
}
