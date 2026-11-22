export const MODULAR_UI_CONTRACT_VERSION = 2;

function assertModule(module) {
  if (!module || typeof module !== 'object') throw new TypeError('INK modular UI module object required');
  if (!module.id || !module.slot || typeof module.mount !== 'function') {
    throw new TypeError('INK modular UI module requires id, slot and mount(context)');
  }
  return module;
}

function focusTarget(root, fallback) {
  const target = root?.querySelector?.('[data-module-focus],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])');
  if (target?.focus) {
    try { target.focus({ preventScroll:true }); return; } catch {}
  }
  try { fallback?.focus?.({ preventScroll:true }); } catch {}
}

function normalizeSlotEntry(name, value) {
  const node = value?.node || value;
  if (!node) throw new TypeError('INK_MODULAR_UI_SLOT_NODE_REQUIRED:'+name);
  return { name, node, ownerRecord:null, parentSlot:null, depth:0 };
}

export class ModularUIHost {
  constructor({ root, slots, commands, selectors, tokens = {}, services = {} }) {
    if (!root || !commands || !selectors) throw new TypeError('INK modular UI host missing root/commands/selectors');
    this.root = root;
    this.slots = new Map();
    for (const [name,value] of Object.entries(slots || {})) this.slots.set(name,normalizeSlotEntry(name,value));
    this.commands = commands;
    this.selectors = selectors;
    this.tokens = Object.freeze({ ...tokens });
    this.services = Object.freeze({ ...services });
    this.active = new Map();
    this.mountingRecords = new Set();
    this.lifecycleListeners = new Set();
    this.disposing = false;
    this.disposed = false;
    this.stats = {
      mounts:0, unmounts:0, swaps:0, failedMounts:0, failedSwaps:0, recoveries:0,
      registeredSlots:0, unregisteredSlots:0, ownershipRejects:0,
      activeListeners:0, activeResources:0, cleanupRuns:0
    };
  }

  slotMeta(name) {
    const entry = this.slots.get(name);
    if (!entry) throw new Error('INK_MODULAR_UI_SLOT_NOT_FOUND:'+name);
    return entry;
  }

  slot(name) { return this.slotMeta(name).node; }

  recordIsLive(record) {
    if (!record || this.disposed || this.disposing || record.phase === 'tearing-down' || record.phase === 'disposed') return false;
    if (record.phase === 'mounting') return this.mountingRecords.has(record);
    return record.phase === 'active' && this.active.get(record.module.slot) === record;
  }

  assertRecordLive(record, name='context') {
    if (this.recordIsLive(record)) return record;
    this.stats.ownershipRejects++;
    if (this.disposed || this.disposing) throw new Error('INK_MODULAR_UI_HOST_DISPOSED');
    throw new Error('INK_MODULAR_UI_SLOT_OWNER_STALE:'+name);
  }

  subscribeLifecycle(listener) {
    if (typeof listener !== 'function') throw new TypeError('INK_MODULAR_UI_LIFECYCLE_LISTENER_REQUIRED');
    if (this.disposed) return () => false;
    this.lifecycleListeners.add(listener);
    let active=true;
    return () => {
      if (!active) return false;
      active=false;
      return this.lifecycleListeners.delete(listener);
    };
  }

  emitLifecycle(event) {
    for (const listener of [...this.lifecycleListeners]) {
      try { listener(Object.freeze({ ...event })); }
      catch (error) { console.warn('INK_MODULAR_UI_LIFECYCLE_LISTENER_FAILED',error); }
    }
  }

  ownsSlot(record, slotName) {
    return this.slots.get(slotName)?.ownerRecord === record;
  }

  registerOwnedSlot(record,name,node) {
    this.assertRecordLive(record,name);
    if (!name || !node) throw new TypeError('INK_MODULAR_UI_OWNED_SLOT_REQUIRED');
    if (this.slots.has(name)) {
      this.stats.ownershipRejects++;
      throw new Error('INK_MODULAR_UI_SLOT_ALREADY_REGISTERED:'+name);
    }
    if (!record.moduleRoot?.contains?.(node)) {
      this.stats.ownershipRejects++;
      throw new Error('INK_MODULAR_UI_SLOT_OUTSIDE_OWNER:'+name);
    }
    const parentMeta=this.slotMeta(record.module.slot);
    const entry={name,node,ownerRecord:record,parentSlot:record.module.slot,depth:(parentMeta.depth||0)+1};
    this.slots.set(name,entry);
    record.childSlots.add(name);
    this.stats.registeredSlots++;
    return node;
  }

  unregisterOwnedSlot(record,name) {
    this.assertRecordLive(record,name);
    return this.removeOwnedSlot(record,name);
  }

  removeOwnedSlot(record,name) {
    const entry=this.slots.get(name);
    if (!entry) return false;
    if (entry.ownerRecord!==record) {
      this.stats.ownershipRejects++;
      throw new Error('INK_MODULAR_UI_SLOT_FOREIGN_OWNER:'+name);
    }
    if (this.active.has(name)) this.unmount(name);
    this.slots.delete(name);
    record.childSlots.delete(name);
    this.stats.unregisteredSlots++;
    return true;
  }

  captureSubtree(slotName) {
    const record=this.active.get(slotName);
    if (!record) return null;
    const children=[];
    for (const childSlot of record.childSlots) {
      const child=this.captureSubtree(childSlot);
      if (child) children.push(child);
    }
    return { slot:slotName, module:record.module, children };
  }

  restoreSubtree(snapshot) {
    if (!snapshot) return null;
    let root=this.active.get(snapshot.slot)?.moduleRoot || null;
    if (!root) root=this.mount(snapshot.module);
    for (const child of snapshot.children || []) {
      if (!this.slots.has(child.slot)) throw new Error('INK_MODULAR_UI_RECOVERY_SLOT_MISSING:'+child.slot);
      const active=this.active.get(child.slot);
      if (active) {
        if (active.module.id!==child.module.id) throw new Error('INK_MODULAR_UI_RECOVERY_SLOT_OCCUPIED:'+child.slot);
      } else this.mount(child.module);
      this.restoreSubtree(child);
    }
    return root;
  }

  contextFor(record) {
    const {module,moduleRoot}=record;
    const localCleanups = record.cleanups;
    const addCleanup = cleanup => {
      this.assertRecordLive(record,'cleanup');
      if (typeof cleanup !== 'function') return cleanup;
      let active = true;
      const tracked = () => {
        if (!active) return false;
        active = false;
        localCleanups.delete(tracked);
        try { cleanup(); }
        finally {
          this.stats.activeResources = Math.max(0,this.stats.activeResources-1);
          this.stats.cleanupRuns++;
        }
        return true;
      };
      localCleanups.add(tracked);
      this.stats.activeResources++;
      return tracked;
    };
    const subscribe = listener => {
      this.assertRecordLive(record,'selectors.subscribe');
      if (typeof listener !== 'function') throw new TypeError('INK_MODULAR_UI_SELECTOR_LISTENER_REQUIRED');
      let subscriptionActive = true;
      const guardedListener = (...args) => {
        if (!subscriptionActive || !this.recordIsLive(record)) return;
        return listener(...args);
      };
      const cleanup = this.commands.subscribe(guardedListener);
      this.stats.activeListeners++;
      return addCleanup(() => {
        subscriptionActive = false;
        try { cleanup(); }
        finally { this.stats.activeListeners = Math.max(0,this.stats.activeListeners-1); }
      });
    };
    const listen = (target,type,listener,options) => {
      this.assertRecordLive(record,'listen');
      if (!target?.addEventListener) throw new TypeError('INK_MODULAR_UI_EVENT_TARGET_REQUIRED');
      target.addEventListener(type,listener,options);
      return addCleanup(() => target.removeEventListener(type,listener,options));
    };
    const scopedSlots=Object.freeze({
      register:(name,node)=>this.registerOwnedSlot(record,name,node),
      registerFromSelector:(name,selector)=>{
        const node=moduleRoot.querySelector?.(selector);
        if(!node)throw new Error('INK_MODULAR_UI_SLOT_SELECTOR_NOT_FOUND:'+selector);
        return this.registerOwnedSlot(record,name,node);
      },
      has:name=>{this.assertRecordLive(record,name);return this.ownsSlot(record,name);},
      list:()=>{this.assertRecordLive(record,module.slot);return [...record.childSlots];},
      mount:child=>{
        this.assertRecordLive(record,child?.slot||module.slot);
        assertModule(child);
        if(!this.ownsSlot(record,child.slot)){
          this.stats.ownershipRejects++;
          throw new Error('INK_MODULAR_UI_CHILD_SLOT_NOT_OWNED:'+child.slot);
        }
        return this.mount(child);
      },
      swap:(name,child)=>{
        this.assertRecordLive(record,name);
        if(!this.ownsSlot(record,name)){
          this.stats.ownershipRejects++;
          throw new Error('INK_MODULAR_UI_CHILD_SLOT_NOT_OWNED:'+name);
        }
        return this.swap(name,child);
      },
      unmount:(name,options)=>{
        this.assertRecordLive(record,name);
        if(!this.ownsSlot(record,name)){
          this.stats.ownershipRejects++;
          throw new Error('INK_MODULAR_UI_CHILD_SLOT_NOT_OWNED:'+name);
        }
        return this.unmount(name,options);
      },
      unregister:name=>this.unregisterOwnedSlot(record,name)
    });
    return Object.freeze({
      contractVersion: MODULAR_UI_CONTRACT_VERSION,
      id: module.id,
      slot: module.slot,
      root: moduleRoot,
      tokens: this.tokens,
      commands: Object.freeze({
        // Lifecycle revocation is synchronous admission control. Already-admitted async command work is not cancelled here.
        execute:(id,args={})=>{this.assertRecordLive(record,'commands.execute');return this.commands.execute(id,args,'human-ui');},
        has:id=>{this.assertRecordLive(record,'commands.has');return this.commands.has(id);},
        list:()=>{this.assertRecordLive(record,'commands.list');return this.commands.list();}
      }),
      selectors: Object.freeze({
        get:(id,args={})=>{this.assertRecordLive(record,'selectors.get');return this.selectors(id,args);},
        subscribe
      }),
      slots:scopedSlots,
      services: this.services,
      cleanup:addCleanup,
      listen
    });
  }

  cleanupRecord(record,{ failed = false }={}) {
    if (!record) return;
    record.mounting=false;
    record.phase='tearing-down';
    this.mountingRecords.delete(record);
    const childSlots=[...record.childSlots].sort((a,b)=>(this.slots.get(b)?.depth||0)-(this.slots.get(a)?.depth||0));
    for (const childSlot of childSlots) {
      if (this.active.has(childSlot)) this.unmount(childSlot);
      if (this.slots.get(childSlot)?.ownerRecord===record) this.removeOwnedSlot(record,childSlot);
    }
    try { record.module.unmount?.(); } catch (error) { console.warn('INK_MODULAR_UI_UNMOUNT_FAILED',record.module.id,error); }
    for (const cleanup of [...record.cleanups].reverse()) {
      try { cleanup(); } catch (error) { console.warn('INK_MODULAR_UI_CLEANUP_FAILED',record.module.id,error); }
    }
    try { record.module.dispose?.(); } catch (error) { console.warn('INK_MODULAR_UI_DISPOSE_FAILED',record.module.id,error); }
    try { record.moduleRoot.remove(); } catch {}
    record.phase='disposed';
    if (failed) this.stats.failedMounts++;
  }

  mount(module) {
    if (this.disposed) throw new Error('INK_MODULAR_UI_HOST_DISPOSED');
    assertModule(module);
    const slot = this.slot(module.slot);
    if (this.active.has(module.slot)) throw new Error('INK_MODULAR_UI_SLOT_OCCUPIED:'+module.slot);
    const moduleRoot = document.createElement('section');
    moduleRoot.className = 'ink-ui-module ink-ui-module--'+String(module.id).replace(/[^a-z0-9_-]+/gi,'-');
    moduleRoot.dataset.moduleId = module.id;
    moduleRoot.dataset.moduleSlot = module.slot;
    slot.replaceChildren(moduleRoot);
    const record = { module,moduleRoot,cleanups:new Set(),childSlots:new Set(),mounting:true,phase:'mounting' };
    this.mountingRecords.add(record);
    const context=this.contextFor(record);
    try {
      const mountReturn = module.mount(context);
      const dispose = typeof mountReturn === 'function'
        ? mountReturn
        : typeof mountReturn?.dispose === 'function'
          ? () => mountReturn.dispose()
          : null;
      if (dispose) context.cleanup(dispose);
      record.mounting=false;
      record.phase='active';
      this.mountingRecords.delete(record);
      this.active.set(module.slot,record);
      this.stats.mounts++;
      this.emitLifecycle({type:'mount',slot:module.slot,id:module.id,root:moduleRoot});
      return moduleRoot;
    } catch (error) {
      record.mounting=false;
      this.mountingRecords.delete(record);
      this.cleanupRecord(record,{failed:true});
      if (slot.contains?.(moduleRoot)) moduleRoot.remove();
      throw error;
    }
  }

  unmount(slotName,{ focus = false }={}) {
    const record = this.active.get(slotName);
    if (!record) return false;
    this.active.delete(slotName);
    this.cleanupRecord(record);
    this.stats.unmounts++;
    this.emitLifecycle({type:'unmount',slot:slotName,id:record.module.id,root:record.moduleRoot});
    if (focus) focusTarget(this.root,this.services.focusFallback?.());
    return true;
  }

  swap(slotName,module) {
    if (this.disposed) throw new Error('INK_MODULAR_UI_HOST_DISPOSED');
    assertModule(module);
    if (module.slot !== slotName) throw new Error('INK_MODULAR_UI_SWAP_SLOT_MISMATCH');
    const previous = this.captureSubtree(slotName);
    if (previous) this.unmount(slotName);
    try {
      const root = this.mount(module);
      this.stats.swaps++;
      focusTarget(root,this.services.focusFallback?.());
      return root;
    } catch (error) {
      this.stats.failedSwaps++;
      let recoveryError = null;
      if (previous) {
        try {
          const recovered = this.restoreSubtree(previous);
          this.stats.recoveries++;
          focusTarget(recovered,this.services.focusFallback?.());
        } catch (recovery) {
          recoveryError = recovery;
          console.error('INK_MODULAR_UI_SWAP_RECOVERY_FAILED',slotName,recovery);
        }
      }
      if (recoveryError) {
        error.recoveryError = recoveryError;
        error.code = error.code || 'INK_MODULAR_UI_SWAP_AND_RECOVERY_FAILED';
      }
      throw error;
    }
  }

  diagnostics() {
    return {
      contractVersion:MODULAR_UI_CONTRACT_VERSION,
      disposed:this.disposed,
      disposing:this.disposing,
      active:[...this.active.entries()].map(([slot,record])=>({slot,id:record.module.id})),
      slots:[...this.slots.values()].map(entry=>({name:entry.name,parentSlot:entry.parentSlot,ownerId:entry.ownerRecord?.module?.id||null,depth:entry.depth})),
      ...this.stats
    };
  }

  dispose() {
    if (this.disposed || this.disposing) return false;
    this.disposing = true;
    const topLevel=[...this.active.keys()].filter(name=>!this.slots.get(name)?.ownerRecord);
    for (const slot of topLevel) this.unmount(slot);
    for (const slot of [...this.active.keys()]) this.unmount(slot);
    this.mountingRecords.clear();
    this.disposed = true;
    this.disposing = false;
    this.emitLifecycle({type:'dispose',slot:null,id:null,root:this.root});
    this.lifecycleListeners.clear();
    this.root.remove();
    return true;
  }
}
