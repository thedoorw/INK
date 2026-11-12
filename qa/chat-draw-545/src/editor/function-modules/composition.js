import { FunctionModuleHost } from './module-host.js';
import { createNativeFunctionServicePorts } from './native-service-ports.js';
import { createFirstPartyFunctionModules } from './providers.js';

export const FUNCTION_MODULE_BASE_CAPABILITIES=Object.freeze([
  'native.history','native.document','native.persistence','native.export','native.precision-layout',
  'native.renderer','native.selection','native.tools','native.view'
]);

export function installFunctionModuleComposition(app){
  if(!app?.commands)throw new TypeError('INK function module composition requires command authority');
  if(app.functionModules instanceof FunctionModuleHost)return app.functionModules;
  const host=new FunctionModuleHost({
    commands:app.commands,
    services:createNativeFunctionServicePorts(app),
    baseCapabilities:FUNCTION_MODULE_BASE_CAPABILITIES,
    isTransactionActive:()=>Boolean(app.history?.pending)
  });
  try{
    for(const module of createFirstPartyFunctionModules())host.install(module,{optional:Boolean(module.optional)});
  }catch(error){
    for(const item of [...host.list()].reverse()){try{host.remove(item.id);}catch{}}
    throw error;
  }
  Object.defineProperty(app,'functionModules',{value:host,configurable:true});
  return host;
}

export function bindTranslationFunctionProvider(app,programImporter){
  const host=app?.functionModules;
  if(!(host instanceof FunctionModuleHost)||host.has('external-workflow-translation'))return host?.describe?.('external-workflow-translation')||null;
  const module=Object.freeze({
    id:'external-workflow-translation',
    implementationVersion:'1.0.0',
    hostContractVersion:1,
    commandContractVersion:1,
    servicePort:null,
    providedCommands:Object.freeze([]),
    providedSelectors:Object.freeze([]),
    providedCapabilities:Object.freeze(['external-workflow-translation']),
    requiredCapabilities:Object.freeze([]),
    optionalCapabilities:Object.freeze([]),
    stateOwners:Object.freeze(['UniversalProgramImporter','TranslationAdapterRegistry','WorkflowIR','RecipeEngine']),
    initialize(){
      if(!programImporter?.sourceAdapters?.list)throw Object.assign(new Error('Existing TranslationAdapterRegistry unavailable'),{code:'TRANSLATION_REGISTRY_UNAVAILABLE'});
      return Object.freeze({importer:programImporter,registry:programImporter.sourceAdapters});
    },
    dispose(){return true;}
  });
  return host.install(module,{optional:true});
}
