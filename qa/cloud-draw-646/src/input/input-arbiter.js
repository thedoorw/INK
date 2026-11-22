export class InputArbiter {
  constructor() {
    this.pointers = new Map();
  }

  register(event, data, context) {
    this.pointers.set(event.pointerId, data);
    return this.decide(event, context);
  }

  update(event, data) {
    if (!this.pointers.has(event.pointerId)) return false;
    this.pointers.set(event.pointerId, data);
    return true;
  }

  release(pointerId) {
    const data = this.pointers.get(pointerId) || null;
    this.pointers.delete(pointerId);
    return data;
  }

  decide(event, { fingerDraw = false, spaceDown = false, tool = '', drawTools = new Set() } = {}) {
    if (this.pointers.size >= 2) return { role: 'gesture', reason: 'multi-pointer' };
    if (event.pointerType === 'touch' && !fingerDraw) {
      return { role: 'navigate', reason: 'touch-navigation-default' };
    }
    if (event.button === 1 || event.button === 2 || spaceDown || tool === 'pan') {
      return { role: 'navigate', reason: 'explicit-pan' };
    }
    return {
      role: 'tool',
      reason: drawTools.has(tool) ? 'drawing-tool' : 'active-tool'
    };
  }

  firstTwo() {
    return [...this.pointers.values()].slice(0, 2);
  }

  get size() {
    return this.pointers.size;
  }

  clear() {
    this.pointers.clear();
  }
}
