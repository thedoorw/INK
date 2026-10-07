import { boundsContains, boundsIntersect } from '../core/index.js';

const normalizeBounds = bounds => ({
  x: Math.min(bounds.x, bounds.x + bounds.w),
  y: Math.min(bounds.y, bounds.y + bounds.h),
  w: Math.abs(bounds.w),
  h: Math.abs(bounds.h)
});

export class Quadtree {
  constructor(bounds, { capacity = 12, maxDepth = 8, depth = 0 } = {}) {
    this.bounds = normalizeBounds(bounds);
    this.capacity = capacity;
    this.maxDepth = maxDepth;
    this.depth = depth;
    this.items = [];
    this.children = null;
  }

  clear() {
    this.items = [];
    this.children = null;
  }

  subdivide() {
    if (this.children) return;
    const { x, y, w, h } = this.bounds;
    const hw = w / 2;
    const hh = h / 2;
    const options = { capacity: this.capacity, maxDepth: this.maxDepth, depth: this.depth + 1 };
    this.children = [
      new Quadtree({ x, y, w: hw, h: hh }, options),
      new Quadtree({ x: x + hw, y, w: hw, h: hh }, options),
      new Quadtree({ x, y: y + hh, w: hw, h: hh }, options),
      new Quadtree({ x: x + hw, y: y + hh, w: hw, h: hh }, options)
    ];
  }

  insert(item) {
    if (!boundsIntersect(this.bounds, item.bounds)) return false;
    if (this.children) {
      const child = this.children.find(candidate => boundsContains(candidate.bounds, item.bounds));
      if (child) return child.insert(item);
    }
    this.items.push(item);
    if (!this.children && this.items.length > this.capacity && this.depth < this.maxDepth) {
      this.subdivide();
      const remaining = [];
      for (const entry of this.items) {
        const child = this.children.find(candidate => boundsContains(candidate.bounds, entry.bounds));
        if (child) child.insert(entry);
        else remaining.push(entry);
      }
      this.items = remaining;
    }
    return true;
  }

  remove(predicate) {
    const before = this.items.length;
    this.items = this.items.filter(item => !predicate(item));
    let removed = before - this.items.length;
    if (this.children) {
      for (const child of this.children) removed += child.remove(predicate);
      const childItems = this.children.reduce((sum, child) => sum + child.totalItems(), 0);
      if (childItems + this.items.length <= this.capacity) {
        this.items.push(...this.children.flatMap(child => child.flatten()));
        this.children = null;
      }
    }
    return removed;
  }

  flatten(output = []) {
    output.push(...this.items);
    if (this.children) for (const child of this.children) child.flatten(output);
    return output;
  }

  totalItems() {
    return this.items.length + (this.children?.reduce((sum, child) => sum + child.totalItems(), 0) || 0);
  }

  query(range, output = []) {
    if (!boundsIntersect(this.bounds, range)) return output;
    for (const item of this.items) if (boundsIntersect(item.bounds, range)) output.push(item);
    if (this.children) for (const child of this.children) child.query(range, output);
    return output;
  }

  countNodes() {
    return 1 + (this.children?.reduce((sum, child) => sum + child.countNodes(), 0) || 0);
  }
}
