import { AICommandLayer, ChatIntegrationAdapter, DeterministicTestClient, LocalJSONCommandClient, ManualCommandConsole, MockAIClient, createCommand } from './ai-core.js';
import { ManualJSONClient, RuntimeDeterministicTestClient, createChatRuntime } from './chat-runtime.js';
import { DocumentToPlanRuntime, ImageToPlanLocalAnalyzer, VersionConflictControl } from './plan-analyzers.js';
import { createCreativeMemoryAdapter } from '../memory/creative-memory.js';
import { createResearchCreationBridgeAdapter } from '../research/research-creation-bridge.js';

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

export function installAICommandLayer(app) {
  const layer=new AICommandLayer({app}),adapter=new ChatIntegrationAdapter(layer),localClient=new LocalJSONCommandClient(adapter),testClient=new DeterministicTestClient(adapter),mockClient=new MockAIClient(adapter),manualConsole=new ManualCommandConsole(localClient);
  const creativeMemoryProvider=app?.creativeMemoryProvider||createCreativeMemoryAdapter({getRecords:()=>Array.isArray(app?.creativeMemoryRecords)?app.creativeMemoryRecords:[]});
  const researchCreationProvider=app?.researchCreationProvider||createResearchCreationBridgeAdapter({
    getEvidence:()=>Array.isArray(app?.researchCreationEvidence)?app.researchCreationEvidence:[],
    getPrinciples:()=>Array.isArray(app?.researchCreationPrinciples)?app.researchCreationPrinciples:[],
    getConstraints:()=>Array.isArray(app?.researchCreationConstraints)?app.researchCreationConstraints:[]
  });
  const runtime=createChatRuntime(layer,{creativeMemoryProvider,researchCreationProvider}),imageAnalyzer=new ImageToPlanLocalAnalyzer(),documentRuntime=new DocumentToPlanRuntime(layer),conflicts=new VersionConflictControl(layer);
  const state={plan:null,preview:null,approval:null,execution:null,sessionId:null,runtimeClient:'manual-json',imageAnalysis:null,imagePayload:null,lastContext:null,manualJSON:null};
  runtime.manager.register('deterministic-test',new RuntimeDeterministicTestClient({planFactory:request=>layer.createPlan(request.prompt,{type:'text'})}));
  runtime.manager.register('manual-json',new ManualJSONClient({valueProvider:()=>{const value=state.manualJSON;if(value==null||value==='')return null;const parsed=typeof value==='string'?JSON.parse(value):clone(value);return parsed?.plan||parsed;}}));
  const refresh=()=>Object.freeze({plan:state.plan?clone(state.plan):null,preview:state.preview?clone(state.preview):null,approval:state.approval?clone(state.approval):null,execution:state.execution?clone(state.execution):null,runtimeClient:state.runtimeClient,sessionId:state.sessionId});
  globalThis.addEventListener?.('beforeunload',()=>runtime.credentialStore.clearAll(),{once:true});
  globalThis.INK_AI={
    version:'1.6.0',layer,adapter,runtime,creativeMemoryProvider,researchCreationProvider,uiState:state,localClient,testClient,mockClient,manualConsole,createCommand,stateReader:layer.stateReader,manifest:layer.manifest,semantics:layer.semantics,imageAnalyzer,documentRuntime,conflicts,
    textToPlan:(text,options)=>layer.createPlan(text,{type:'text',...options}),imageToPlan:(image,options)=>layer.createPlan(image,{type:'image',...options}),documentToPlan:(goal,options)=>layer.createPlan(goal,{type:'document',...options}),planFromSteps:(intent,steps,options)=>layer.createPlanFromSteps(intent,steps,options),editPlan:(id,change)=>layer.editPlan(id,change),preview:(id,options)=>layer.preview(id,options),approve:(id,options)=>layer.approve(id,options),execute:id=>layer.executeApproval(id),rollback:id=>layer.rollback(id),audit:()=>layer.audit.list(),networkAudit:()=>runtime.auditBridge.report(),negotiate:request=>adapter.negotiate(request),refreshUI:refresh
  };
  return globalThis.INK_AI;
}
