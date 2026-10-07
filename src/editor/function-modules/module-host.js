export const FUNCTION_MODULE_CONTRACT_VERSION = 1;

const asArray=value=>Array.isArray(value)?value:[];
const sameSet=(a,b)=>a.size===b.size&&[...a].every(item=>b.has(item));

function contractError(code, detail='') {
  return Object.assign(new Error('INK_FUNCTION_MODULE_'+code+(detail?':'+detail:'')),{code});
}

function lifecycleError(code,id,errors=[]) {
  const error=contractError(code,id);
  error.details={errors:errors.map(item=>({code:item?.code||'LIFECYCLE_ERROR',message:item?.message||String(item)}))};
  if(errors[0])error.cause=errors[0];
  return error;
}

function validateDescriptor(module) {
  if(!module||typeof module!=='object')throw contractError('DESCRIPTOR_REQUIRED');
  if(!module.id||typeof module.id!=='string')throw contractError('ID_REQUIRED');
  if(!module.implementationVersion)throw contractError('VERSION_REQUIRED',module.id);
  if(Number(module.hostContractVersion)!==FUNCTION_MODULE_CONTRACT_VERSION)throw contractError('HOST_VERSION_INCOMPATIBLE',module.id);
  if(Number(module.commandContractVersion)!==1)throw contractError('COMMAND_VERSION_INCOMPATIBLE',module.id);
  if(typeof module.initialize!=='function'||typeof module.dispose!=='function')throw contractError('LIFECYCLE_REQUIRED',module.id);
  return module;
}

export class FunctionModuleHost {
  constructor({commands,services={},baseCapabilities=[],isTransactionActive=()=>false}={}) {
    if(!commands?.registerOwned||!commands?.replaceOwned||!commands?.unregisterOwned)throw contractError('COMMAND_AUTHORITY_REQUIRED');
    this.commands=commands;
    this.services=Object.freeze({...services});
    this.baseCapabilities=new Set(baseCapabilities);
    this.isTransactionActive=isTransactionActive;
    this.active=new Map();
    this.capabilities=new Map();
    this.stats={installs:0,replacements:0,removals:0,failedInitializations:0,cleanupRuns:0,activeResources:0,activeSubscriptions:0};
  }

  availableCapabilities(excluding=null) {
    const set=new Set(this.baseCapabilities);
    for(const [id,record] of this.active) {
      if(id===excluding)continue;
      for(const capability of asArray(record.module.providedCapabilities))set.add(capability);
    }
    return set;
  }

  validateDependencies(module,{replacing=false}={}) {
    const available=this.availableCapabilities(replacing?module.id:null);
    for(const required of asArray(module.requiredCapabilities)) {
      if(!available.has(required))throw contractError('DEPENDENCY_UNAVAILABLE',module.id+'->'+required);
    }
    for(const capability of asArray(module.providedCapabilities)) {
      const owner=this.capabilities.get(capability);
      if(owner&&owner!==module.id)throw contractError('CAPABILITY_CONFLICT',capability);
    }
    return true;
  }

  validateResultingDependencies(candidate) {
    const available=this.availableCapabilities(candidate.id);
    for(const capability of asArray(candidate.providedCapabilities))available.add(capability);
    for(const [id,record] of this.active) {
      const module=id===candidate.id?candidate:record.module;
      for(const required of asArray(module.requiredCapabilities)) {
        if(!available.has(required))throw contractError('DEPENDENCY_UNAVAILABLE',module.id+'->'+required);
      }
    }
    return true;
  }

  dependencyGraph(candidate=null) {
    const records=[...this.active.values()].map(x=>x.module);
    if(candidate){
      const index=records.findIndex(x=>x.id===candidate.id);
      if(index>=0)records[index]=candidate;else records.push(candidate);
    }
    const byCapability=new Map();
    for(const module of records)for(const capability of asArray(module.providedCapabilities))byCapability.set(capability,module.id);
    const graph=new Map(records.map(module=>[module.id,new Set()]));
    for(const module of records)for(const required of asArray(module.requiredCapabilities)){
      const owner=byCapability.get(required);
      if(owner&&owner!==module.id)graph.get(module.id).add(owner);
    }
    const visiting=new Set(),visited=new Set();
    const visit=id=>{
      if(visiting.has(id))throw contractError('DEPENDENCY_CYCLE',id);
      if(visited.has(id))return;
      visiting.add(id);
      for(const next of graph.get(id)||[])visit(next);
      visiting.delete(id);visited.add(id);
    };
    for(const id of graph.keys())visit(id);
    return graph;
  }

  contextFor(module) {
    const stagedCommands=[],stagedSelectors=[],cleanups=[];
    const servicePort=module.servicePort?this.services[module.servicePort]:Object.freeze({});
    if(module.servicePort&&!servicePort)throw contractError('SERVICE_PORT_UNAVAILABLE',module.id+'->'+module.servicePort);
    const cleanup=fn=>{
      if(typeof fn!=='function')return fn;
      let active=true;
      const tracked=()=>{
        if(!active)return false;
        active=false;
        try{return fn();}finally{
          this.stats.activeResources=Math.max(0,this.stats.activeResources-1);
          this.stats.cleanupRuns++;
        }
      };
      cleanups.push(tracked);
      this.stats.activeResources++;
      return tracked;
    };
    const subscribe=listener=>{
      const release=this.commands.subscribe(listener);
      this.stats.activeSubscriptions++;
      cleanup(()=>{try{release();}finally{this.stats.activeSubscriptions=Math.max(0,this.stats.activeSubscriptions-1);}});
      return release;
    };
    return {
      context:Object.freeze({
        moduleId:module.id,
        contractVersion:FUNCTION_MODULE_CONTRACT_VERSION,
        services:servicePort,
        command:(id,definition)=>stagedCommands.push({id,definition}),
        selector:(id,selector)=>stagedSelectors.push({id,selector}),
        cleanup,
        subscribe,
        hasCapability:id=>this.availableCapabilities().has(id)
      }),
      stagedCommands, stagedSelectors, cleanups
    };
  }

  verifySurface(module,stagedCommands,stagedSelectors) {
    const declaredCommands=new Set(asArray(module.providedCommands));
    const declaredSelectors=new Set(asArray(module.providedSelectors));
    const actualCommands=new Set(stagedCommands.map(item=>item.id));
    const actualSelectors=new Set(stagedSelectors.map(item=>item.id));
    if(!sameSet(declaredCommands,actualCommands))throw contractError('COMMAND_SURFACE_MISMATCH',module.id);
    if(!sameSet(declaredSelectors,actualSelectors))throw contractError('SELECTOR_SURFACE_MISMATCH',module.id);
  }

  cleanupList(cleanups=[]) {
    const errors=[];
    for(const cleanup of [...cleanups].reverse()){try{cleanup();}catch(error){errors.push(error);}}
    return errors;
  }

  cleanupRecord(record) {
    const errors=[];
    try{record.module.dispose(record.state);}catch(error){errors.push(error);}
    errors.push(...this.cleanupList(record.cleanups));
    return errors;
  }

  clearOwnedState(id) {
    this.active.delete(id);
    for(const [capability,owner] of [...this.capabilities.entries()])if(owner===id)this.capabilities.delete(capability);
  }

  failClosed(id) {
    const errors=[];
    try{this.commands.unregisterOwned(id);}catch(error){
      errors.push(error);
      try{this.commands.disableOwned(id);}catch(disableError){errors.push(disableError);}
    }
    this.clearOwnedState(id);
    return errors;
  }

  install(rawModule,{optional=false}={}) {
    const module=validateDescriptor(rawModule);
    if(this.active.has(module.id))throw contractError('DUPLICATE_MODULE',module.id);
    this.validateDependencies(module);this.dependencyGraph(module);
    const staged=this.contextFor(module);
    let state=null;
    try{
      state=module.initialize(staged.context) ?? null;
      this.verifySurface(module,staged.stagedCommands,staged.stagedSelectors);
      this.commands.registerOwned(module.id,{commands:staged.stagedCommands,selectors:staged.stagedSelectors});
      const record={module,state,cleanups:staged.cleanups,optional:Boolean(optional)};
      this.active.set(module.id,record);
      for(const capability of asArray(module.providedCapabilities))this.capabilities.set(capability,module.id);
      this.stats.installs++;
      return this.describe(module.id);
    }catch(error){
      this.stats.failedInitializations++;
      for(const cleanup of [...staged.cleanups].reverse()){try{cleanup();}catch{}}
      if(optional)return {id:module.id,available:false,error:{code:error.code||'INITIALIZATION_FAILED',message:error.message}};
      throw error;
    }
  }

  replace(id,rawModule) {
    const current=this.active.get(id);
    if(!current)throw contractError('MODULE_UNKNOWN',id);
    const module=validateDescriptor(rawModule);
    if(module.id!==id)throw contractError('REPLACEMENT_ID_MISMATCH',module.id);
    if(this.isTransactionActive())throw contractError('TRANSACTION_ACTIVE',id);
    if(!this.commands.isOwnerIdle(id))throw contractError('PROVIDER_BUSY',id);
    const oldCommands=new Set(asArray(current.module.providedCommands)),nextCommands=new Set(asArray(module.providedCommands));
    const oldSelectors=new Set(asArray(current.module.providedSelectors)),nextSelectors=new Set(asArray(module.providedSelectors));
    if(!sameSet(oldCommands,nextCommands)||!sameSet(oldSelectors,nextSelectors))throw contractError('INCOMPATIBLE_REPLACEMENT',id);
    this.validateDependencies(module,{replacing:true});
    this.validateResultingDependencies(module);
    this.dependencyGraph(module);

    const staged=this.contextFor(module);
    let state=null;
    try{
      state=module.initialize(staged.context) ?? null;
      this.verifySurface(module,staged.stagedCommands,staged.stagedSelectors);
    }catch(error){
      this.stats.failedInitializations++;
      this.cleanupList(staged.cleanups);
      throw error;
    }

    this.commands.disableOwned(id);
    if(this.isTransactionActive()||!this.commands.isOwnerIdle(id)){
      this.commands.enableOwned(id);
      this.cleanupList(staged.cleanups);
      throw contractError('PROVIDER_BUSY',id);
    }

    const teardownErrors=this.cleanupRecord(current);
    if(teardownErrors.length){
      const stagedErrors=this.cleanupList(staged.cleanups);
      const closeErrors=this.failClosed(id);
      throw lifecycleError('REPLACEMENT_TEARDOWN_FAILED',id,[...teardownErrors,...stagedErrors,...closeErrors]);
    }

    try{
      this.commands.replaceOwned(id,{commands:staged.stagedCommands,selectors:staged.stagedSelectors});
      for(const capability of asArray(current.module.providedCapabilities))if(this.capabilities.get(capability)===id)this.capabilities.delete(capability);
      const next={module,state,cleanups:staged.cleanups,optional:current.optional};
      this.active.set(id,next);
      for(const capability of asArray(module.providedCapabilities))this.capabilities.set(capability,id);
      this.commands.enableOwned(id);
      this.stats.replacements++;
      return this.describe(id);
    }catch(error){
      const stagedErrors=this.cleanupList(staged.cleanups);
      const closeErrors=this.failClosed(id);
      if(stagedErrors.length||closeErrors.length)error.details={...(error.details||{}),cleanupErrors:[...stagedErrors,...closeErrors].map(item=>item?.message||String(item))};
      throw error;
    }
  }

  remove(id) {
    const record=this.active.get(id);
    if(!record)return false;
    if(this.isTransactionActive())throw contractError('TRANSACTION_ACTIVE',id);
    if(!this.commands.isOwnerIdle(id))throw contractError('PROVIDER_BUSY',id);
    const provided=new Set(asArray(record.module.providedCapabilities));
    for(const [otherId,other] of this.active){
      if(otherId===id)continue;
      for(const required of asArray(other.module.requiredCapabilities)){
        if(provided.has(required))throw contractError('DEPENDENT_MODULE_ACTIVE',otherId+'->'+required);
      }
    }

    this.commands.disableOwned(id);
    if(this.isTransactionActive()||!this.commands.isOwnerIdle(id)){
      this.commands.enableOwned(id);
      throw contractError('PROVIDER_BUSY',id);
    }

    const teardownErrors=this.cleanupRecord(record);
    if(teardownErrors.length){
      const closeErrors=this.failClosed(id);
      throw lifecycleError('REMOVE_TEARDOWN_FAILED',id,[...teardownErrors,...closeErrors]);
    }

    try{
      this.commands.unregisterOwned(id);
    }catch(error){
      const closeErrors=this.failClosed(id);
      if(closeErrors.length)error.details={...(error.details||{}),cleanupErrors:closeErrors.map(item=>item?.message||String(item))};
      throw error;
    }
    this.clearOwnedState(id);
    this.stats.removals++;
    return true;
  }

  has(id){return this.active.has(id);}
  capability(id){const owner=this.capabilities.get(id);return owner?{available:true,ownerId:owner}:{available:this.baseCapabilities.has(id),ownerId:this.baseCapabilities.has(id)?'_native':null};}
  describe(id){
    const record=this.active.get(id);
    if(!record)return null;
    const m=record.module;
    return {
      id:m.id,implementationVersion:m.implementationVersion,hostContractVersion:m.hostContractVersion,
      commandContractVersion:m.commandContractVersion,providedCommands:[...asArray(m.providedCommands)],
      providedSelectors:[...asArray(m.providedSelectors)],providedCapabilities:[...asArray(m.providedCapabilities)],
      requiredCapabilities:[...asArray(m.requiredCapabilities)],optionalCapabilities:[...asArray(m.optionalCapabilities)],
      stateOwners:[...asArray(m.stateOwners)],optional:record.optional,available:true
    };
  }
  list(){return [...this.active.keys()].map(id=>this.describe(id));}
  diagnostics(){return {contractVersion:FUNCTION_MODULE_CONTRACT_VERSION,modules:this.list(),capabilities:[...this.capabilities.entries()].map(([id,ownerId])=>({id,ownerId})),...this.stats};}
}
