const WORKSPACE_STAGES = Object.freeze([
  ['reference', '參考'],
  ['edit', '編輯'],
  ['compose', '構成'],
  ['chat', 'CHAT'],
  ['revision', '修訂']
]);

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;

function selectionItems(app) {
  const found = typeof app?.selectedObjects === 'function' ? app.selectedObjects() : [];
  return found.map(item => ({
    pageId: app.page?.()?.id || null,
    layerId: item.layer?.id || null,
    objectId: item.object?.id || null,
    type: item.object?.type || 'unknown',
    name: item.object?.name || null
  }));
}

function objectProvenance(object) {
  const metadata = object?.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  if (metadata.extraction && typeof metadata.extraction === 'object') {
    return {
      kind: 'extraction',
      batchId: metadata.extraction.batchId || null,
      referenceObjectId: metadata.extraction.referenceObjectId || null,
      sourceName: metadata.extraction.source?.name || metadata.extraction.sourceName || null
    };
  }
  if (metadata.extractionReference && typeof metadata.extractionReference === 'object') {
    return {
      kind: 'extraction-reference',
      sourceName: metadata.extractionReference.source?.name || null,
      sourceSha256: metadata.extractionReference.source?.sha256 || null
    };
  }
  if (metadata.source && typeof metadata.source === 'object') {
    return {
      kind: 'source',
      id: metadata.source.id || null,
      name: metadata.source.name || null,
      type: metadata.source.type || null
    };
  }
  if (metadata.composition && typeof metadata.composition === 'object') {
    return {
      kind: 'composition',
      sourceObjectId: metadata.composition.sourceObjectId || null,
      duplicatedFromObjectId: metadata.composition.duplicatedFromObjectId || null
    };
  }
  return null;
}

function selectedProvenance(app) {
  const found = typeof app?.selectedObjects === 'function' ? app.selectedObjects() : [];
  return found.map(item => ({
    objectId: item.object?.id || null,
    provenance: objectProvenance(item.object)
  })).filter(item => item.provenance);
}

function proposalSummary(app, proposalId) {
  if (!proposalId || !app?.chatBoundedEdit?.getProposal) return null;
  try {
    const proposal = app.chatBoundedEdit.getProposal(proposalId);
    if (!proposal) return null;
    return {
      proposalId: proposal.proposalId,
      state: proposal.state,
      operation: proposal.task?.operation || null,
      targets: clone(proposal.task?.targets || []),
      revisionId: proposal.revisionId ?? null
    };
  } catch {
    return null;
  }
}

function planSummary(app, planId) {
  if (!planId || !app?.chatCreativePlan?.getPlan) return null;
  try {
    const plan = app.chatCreativePlan.getPlan(planId);
    if (!plan) return null;
    return {
      planId: plan.planId,
      status: plan.status,
      intentSummary: plan.intentSummary,
      source: clone(plan.source),
      steps: clone(plan.steps || []),
      validation: clone(plan.validation || null),
      stepResults: clone(plan.stepResults || []),
      result: clone(plan.result || null)
    };
  } catch {
    return null;
  }
}

export function buildCreativeWorkspaceState(app, {
  stage = 'reference',
  activeProposalId = null,
  activePlanId = null,
  status = null
} = {}) {
  const document = app?.doc || null;
  const page = typeof app?.page === 'function' ? app.page() : null;
  const selected = selectionItems(app);
  const revisionId = document
    ? (app?.revisions?.revisionIdFor?.(document.id) ?? null)
    : null;
  return {
    schema: 'INK-CREATIVE-WORKSPACE-STATE',
    version: 1,
    document: document ? {
      id: document.id || null,
      title: document.title || null,
      formatVersion: document.formatVersion ?? null
    } : null,
    page: page ? {
      id: page.id || null,
      name: page.name || null,
      activeLayerId: page.activeLayerId || null
    } : null,
    stage,
    tool: app?.tool || null,
    context: app?.pathEditing?.active ? 'path-edit' : (app?.strokeEdit ? 'stroke-edit' : (app?.tool || null)),
    selection: {
      count: selected.length,
      items: selected
    },
    provenance: selectedProvenance(app),
    revision: {
      revisionId,
      diagnostics: clone(app?.revisions?.diagnostics?.() || null)
    },
    chat: {
      proposal: proposalSummary(app, activeProposalId),
      plan: planSummary(app, activePlanId)
    },
    history: {
      pending: Boolean(app?.history?.pending),
      undoCount: app?.history?.undoStack?.length || 0,
      redoCount: app?.history?.redoStack?.length || 0
    },
    controllers: {
      extraction: Boolean(app?.extraction),
      pathEditing: Boolean(app?.pathEditing),
      expressiveStroke: Boolean(app?.pathStrokeAppearance),
      repaintMaterial: Boolean(app?.pathRepaintMaterial),
      chatBoundedEdit: Boolean(app?.chatBoundedEdit),
      chatCreativePlan: Boolean(app?.chatCreativePlan),
      revisions: Boolean(app?.revisions)
    },
    status: status ? clone(status) : null,
    staticBrowserLocal: true,
    remoteServiceRequired: false
  };
}

export class CreativeWorkspaceController {
  constructor(app) {
    this.app = app;
    this.stage = 'reference';
    this.activeProposalId = null;
    this.activePlanId = null;
    this.status = { level: 'ready', code: 'WORKSPACE_READY', message: '創作工作區就緒' };
    this.extractionAbort = null;
    this.lastReference = null;
    this.lastExtraction = null;
    this.lastStructure = null;
    this.approvalToken = null;
    this.lastChatInspection = null;
    this.lastChatResult = null;
    this.taskSequence = 0;
    this.planSequence = 0;
    this.draftPlanSteps = [];
    this.planApprovalToken = null;
    this.lastPlanResult = null;
    this.groundedToolSequence = 0;
    this.lastGroundedContext = null;
    this.lastCreativeMemoryContext = null;
    this.lastResearchCreationContext = null;
    this.lastRevisionComparison = null;
    this.conversationMessages = [];
    this.conversationSessionId = null;
    this.conversationClient = null;
    this.conversationPending = null;
    this.lastConversationContext = null;
    this.lastTransmissionPreview = null;
    this.conversationBusy = false;
    this.revisionItems = [];
    this.lastRevisionResult = null;
  }

  mount() { return this; }
  mountSelectionCapabilityCard() { return false; }
  async callGroundedTool(name, args = {}) {
    const runtime = this.conversationRuntime();
    const router = runtime?.toolRouter;
    if (!router?.route) throw Object.assign(new Error('Grounded CHAT tool router unavailable'), { code: 'GROUNDED_TOOL_ROUTER_UNAVAILABLE' });
    const response = await router.route({
      id: `workspace-${name}-${++this.groundedToolSequence}`,
      name,
      arguments: clone(args)
    }, { permission: 'OBSERVE', scope: 'CURRENT_DOCUMENT', sessionId: 'creative-workspace' });
    return clone(response?.result ?? response ?? null);
  }

  async runCapabilityAction(action, args = {}) {
    try {
      if (action === 'grounded-context-refresh') {
        this.lastGroundedContext = await this.callGroundedTool('get_grounded_creative_context');
        this.setStatus('GROUNDED_CONTEXT_REFRESHED','Document / Semantic / Provenance context refreshed','pass');
      } else if (action === 'creative-memory-refresh') {
        this.lastCreativeMemoryContext = await this.callGroundedTool('get_creative_memory_context');
        this.setStatus('CREATIVE_MEMORY_REFRESHED','Creative Memory advisory refreshed; no write performed','pass');
      } else if (action === 'research-context-refresh') {
        this.lastResearchCreationContext = await this.callGroundedTool('get_research_creation_context');
        this.setStatus('RESEARCH_CONTEXT_REFRESHED','Local 研究 → 創作 advisory refreshed; no network request performed','pass');
      } else if (action === 'revision-compare') {
        const revisionId=text(args.revisionId);
        if(!revisionId)throw Object.assign(new Error('Select a Revision'),{code:'REVISION_REQUIRED'});
        const revisionRecord=await this.app?.revisions?.loadRecord?.(revisionId);
        if(!revisionRecord)throw Object.assign(new Error('Revision record unavailable'),{code:'REVISION_RECORD_UNAVAILABLE'});
        const mode='structural';
        this.lastRevisionComparison=await this.callGroundedTool('compare_visual_subjects',{
          subjectA:{kind:'revision',revisionRecord,label:revisionRecord.label||revisionId},
          subjectB:{kind:'current',document:this.app?.doc,label:'Current'},options:{mode}
        });
        if(!this.lastGroundedContext)this.lastGroundedContext=await this.callGroundedTool('get_grounded_creative_context');
        this.setStatus('REVISION_COMPARISON_REFRESHED',`${mode} · metadata/structural evidence only`,'pass');
      }
      return true;
    } catch(error) {
      this.setStatus(error?.code||'WORKSTATION_CAPABILITY_FAILED',error?.message||'Capability read failed','error');
      return null;
    }
  }
  async handleAction(action,args={}) {
    if(['grounded-context-refresh','creative-memory-refresh','research-context-refresh','revision-compare'].includes(action))return this.runCapabilityAction(action,args);
    if(action==='extract')return this.runExtraction(args);
    if(action==='cancel-extract')return this.cancelExtraction();
    if(action==='structure-reconstruct')return this.runStructure(args);
    if(['enter-path-edit','exit-path-edit','simplify-path','refine-path','apply-expressive-stroke','clear-expressive-stroke'].includes(action))return this.runEditAction(action,args);
    if(['duplicate','group','frame','front','back','repaint','apply-material','clear-material'].includes(action))return this.runComposeAction(action,args);
    if(['chat-conversation-inspect','chat-conversation-send','chat-conversation-clear','chat-conversation-transmit'].includes(action))return this.runConversationAction(action,args);
    if(['chat-inspect','chat-propose','chat-approve','chat-reject','chat-execute'].includes(action))return this.runChatAction(action,args);
    if(['chat-plan-add-step','chat-plan-clear','chat-plan-propose','chat-plan-approve','chat-plan-reject','chat-plan-execute'].includes(action))return this.runChatPlanAction(action,args);
    if(['revision-capture','revision-list','revision-restore'].includes(action))return this.runRevisionAction(action,args);
    return null;
  }
  referenceObjectId() {
    if (this.lastExtraction?.referenceObjectId) return this.lastExtraction.referenceObjectId;
    const selected = typeof this.app?.selectedObjects === 'function' ? this.app.selectedObjects() : [];
    for (const item of selected) {
      const id = item.object?.metadata?.extraction?.referenceObjectId;
      if (id) return id;
      if (item.object?.metadata?.extractionReference) return item.object.id;
    }
    return null;
  }

  async runExtraction({file=null,threshold=128}={}) {
    if(this.extractionAbort)return null;
    const api=this.app?.extraction;
    if(!api?.decode||!api?.extract){this.setStatus('EXTRACTION_UNAVAILABLE','目前無法擷取參考圖','error');return null;}
    if(!file){this.setStatus('EXTRACTION_REFERENCE_REQUIRED','請先選擇參考圖','error');return null;}
    const controller=new AbortController();this.extractionAbort=controller;this.setStatus('EXTRACTION_RUNNING','正在擷取參考圖','busy');
    try{
      const reference=await api.decode(file);this.lastReference=reference;
      const result=await api.extract({...reference,parameters:{threshold:Number(threshold)}},{referenceSrc:reference.referenceSrc,signal:controller.signal});
      this.lastExtraction={referenceObjectId:result.referenceObjectId,batchId:result.batchId,pathIds:(result.paths||[]).map(path=>path.id),diagnostics:clone(result.diagnostics||null),provenance:clone(result.provenance||null),source:clone(reference.source||null)};
      this.lastStructure=null;
      const firstPath=result.paths?.[0];
      if(firstPath&&typeof this.app.findObject==='function'&&typeof this.app.selectOnly==='function'){const found=this.app.findObject({objectId:firstPath.id});if(found)this.app.selectOnly(found.layer.id,firstPath.id);}
      this.app.fitContent?.();
      this.setStatus('EXTRACTION_COMPLETE',`已擷取 ${result.diagnostics?.paths??result.paths?.length??0} 條路徑、${result.diagnostics?.nodes??0} 個節點`,'pass');
      return result;
    }catch(error){const code=error?.code||'EXTRACTION_FAILED';this.setStatus(code,code==='EXTRACTION_CANCELLED'?'已取消擷取':'擷取失敗，請確認參考圖後重試',code==='EXTRACTION_CANCELLED'?'info':'error');return null;}
    finally{this.extractionAbort=null;}
  }
  async runStructure({file=null,threshold=128,count=6}={}) {
    if(this.extractionAbort)return null;
    const api=this.app?.extraction;
    if(!api?.decode||!api?.structure){this.setStatus('STRUCTURE_AWARE_UNAVAILABLE','目前無法分析結構','error');return null;}
    const referenceObjectId=this.referenceObjectId();
    if(!referenceObjectId){this.setStatus('STRUCTURE_AWARE_DIRECT_REFERENCE_REQUIRED','請先直接擷取參考圖','error');return null;}
    const controller=new AbortController();this.extractionAbort=controller;this.setStatus('STRUCTURE_AWARE_RUNNING','正在分析放射結構','busy');
    try{
      if(!this.lastReference){if(!file)throw Object.assign(new Error('請選擇直接擷取時使用的參考圖'),{code:'STRUCTURE_AWARE_REFERENCE_FILE_REQUIRED'});this.lastReference=await api.decode(file);}
      const result=await api.structure({...this.lastReference,parameters:{threshold:Number(threshold)}},{referenceObjectId,threshold:Number(threshold),count:Number(count),signal:controller.signal});
      this.lastStructure={batchId:result.batchId,repeatId:result.repeatId,referenceObjectId:result.referenceObjectId,radialCount:result.radialCount,maskIoU:result.maskIoU,prototypePathCount:result.prototypePaths?.length||0,prototypeDiagnostics:clone(result.prototypeDiagnostics||null),source:clone(this.lastReference.source||null)};
      this.app.fitContent?.();this.setStatus('STRUCTURE_AWARE_COMPLETE',`已建立 ${result.radialCount} 個放射單元`,'pass');return result;
    }catch(error){const code=error?.code||'STRUCTURE_AWARE_FAILED';this.setStatus(code,code==='EXTRACTION_CANCELLED'?'已取消分析':code==='STRUCTURE_AWARE_REFERENCE_FILE_REQUIRED'?'請選擇直接擷取時使用的參考圖':'結構分析失敗，請確認參考圖後重試',code==='EXTRACTION_CANCELLED'?'info':'error');return null;}
    finally{this.extractionAbort=null;}
  }
  cancelExtraction() {
    if (!this.extractionAbort) return false;
    this.extractionAbort.abort();
    return true;
  }

  changeOverlay(opacity) {
    const referenceObjectId = this.referenceObjectId();
    if (!referenceObjectId || !Number.isFinite(opacity)) {
      this.setStatus('EXTRACTION_OVERLAY_UNAVAILABLE', '請先直接擷取，或選取已擷取的路徑', 'error');
      return false;
    }
    try {
      this.app.extraction.overlay(referenceObjectId, opacity);
      this.setStatus('EXTRACTION_OVERLAY_UPDATED', `參考圖透明度 ${Math.round(opacity * 100)}%`, 'pass');
      return true;
    } catch (error) {
      this.setStatus(error?.code || 'EXTRACTION_OVERLAY_FAILED', '無法更新參考圖透明度，請重試', 'error');
      return false;
    }
  }

  refreshReference() { return {extraction:clone(this.lastExtraction),structure:clone(this.lastStructure)}; }
  selectedPath() {
    const selected = typeof this.app?.selectedObjects === 'function' ? this.app.selectedObjects() : [];
    return selected.length === 1 && selected[0]?.object?.type === 'path' ? selected[0] : null;
  }

  runEditAction(action,{color='#202020',baseWidth=2}={}) {
    const path=this.selectedPath();
    try{
      let result=null;
      if(action==='enter-path-edit')result=this.app.enterPathEdit?.(path?{layerId:path.layer.id,objectId:path.object.id}:null);
      else if(action==='exit-path-edit')result=this.app.exitPathEdit?.();
      else if(action==='simplify-path')result=this.app.simplifyEditedPath?.();
      else if(action==='refine-path')result=this.app.refineEditedPath?.();
      else if(action==='apply-expressive-stroke'){if(!path)throw Object.assign(new Error('Select one Path'),{code:'PATH_REQUIRED'});result=this.app.setPathStrokeFromBrush?.('ink',{color,baseWidth:Number(baseWidth)},{layerId:path.layer.id,objectId:path.object.id});}
      else if(action==='clear-expressive-stroke'){if(!path)throw Object.assign(new Error('Select one Path'),{code:'PATH_REQUIRED'});result=this.app.clearPathExpressiveStroke?.({layerId:path.layer.id,objectId:path.object.id});}
      if(result===false||(result==null&&action!=='exit-path-edit')){this.setStatus('PATH_EDIT_NO_RESULT','Path edit command did not execute','error');return result;}
      this.setStatus('PATH_EDIT_UPDATED',action,'pass');return result;
    }catch(error){this.setStatus(error?.code||'PATH_EDIT_FAILED',error?.message||'Path edit failed','error');return null;}
  }
  runComposeAction(action,{fill='#f0d9c8',templateId=null}={}) {
    try{
      let result=true;
      if(action==='duplicate')result=this.app.duplicateSelection?.();
      else if(action==='group')result=this.app.groupSelection?.();
      else if(action==='frame')result=this.app.frameSelection?.();
      else if(action==='front')result=this.app.reorderSelection?.('front');
      else if(action==='back')result=this.app.reorderSelection?.('back');
      else if(action==='repaint')result=this.app.repaintSelectedPaths?.({fill});
      else if(action==='apply-material'){const id=text(templateId);if(!id)throw Object.assign(new Error('Material template ID required'),{code:'MATERIAL_TEMPLATE_REQUIRED'});result=this.app.applySelectedPathMaterial?.({templateId:id,parameterOverrides:{},fallback:{fill}});}
      else if(action==='clear-material')result=this.app.clearSelectedPathMaterial?.();
      if((action==='repaint'||action==='apply-material'||action==='clear-material')&&!result){this.setStatus('COMPOSE_COMMAND_NO_RESULT','Selected object is not an editable Path or command was blocked','error');return result;}
      this.setStatus('COMPOSE_UPDATED',action,'pass');return result;
    }catch(error){this.setStatus(error?.code||'COMPOSE_FAILED',error?.message||'Composition command failed','error');return null;}
  }
  refreshEditCompose() { return this.state(); }
  chatTargets() {
    const page = this.app?.page?.();
    const selected = typeof this.app?.selectedObjects === 'function' ? this.app.selectedObjects() : [];
    return selected.map(item => ({
      pageId: page?.id || null,
      layerId: item.layer?.id || null,
      objectId: item.object?.id || null
    }));
  }

  createChatTask({operation='path.repaint.v1',fill='#d7a78f',dx=0,dy=0,templateId=null,arguments:explicitArguments=null}={}) {
    const targets=this.chatTargets();
    if(!targets.length)throw Object.assign(new Error('Select one or more targets'),{code:'CHAT_TARGET_REQUIRED'});
    let args=explicitArguments?clone(explicitArguments):{};
    if(!explicitArguments&&operation==='path.repaint.v1')args={fill};
    else if(!explicitArguments&&operation==='object.translate.v1')args={dx:Number(dx),dy:Number(dy)};
    else if(!explicitArguments&&operation==='path.simplify.v1')args={tolerance:.75,handleTolerance:.2,maxPasses:256};
    else if(!explicitArguments&&operation==='path.refine.v1')args={maxControlLength:48,maxAddedAnchors:128};
    else if(!explicitArguments&&operation==='path.material.apply.v1'){const id=text(templateId);if(!id)throw Object.assign(new Error('Material template ID required'),{code:'MATERIAL_TEMPLATE_REQUIRED'});args={templateId:id,parameterOverrides:{},fallback:{fill}};}
    return{schema:'INK-CHAT-EDIT-TASK',version:1,taskId:`workspace-task-${++this.taskSequence}`,operation,targets,arguments:args};
  }
  createChatPlanStep(options={}) {
    const task=this.createChatTask(options),stepId=`step-${++this.planSequence}`,prior=this.draftPlanSteps.at(-1)?.stepId;
    return{stepId,operation:task.operation,targets:clone(task.targets),arguments:clone(task.arguments),dependsOn:prior?[prior]:[]};
  }
  createChatPlan({intentSummary=null}={}) {
    if(this.draftPlanSteps.length<2)throw Object.assign(new Error('Add at least two ordered steps'),{code:'CHAT_PLAN_STEPS_REQUIRED'});
    const intent=text(intentSummary);
    if(!intent)throw Object.assign(new Error('Plan intent is required'),{code:'CHAT_PLAN_INTENT_REQUIRED'});
    return{schema:'INK-CHAT-CREATIVE-PLAN',version:1,intentSummary:intent,steps:clone(this.draftPlanSteps)};
  }
  async runChatPlanAction(action, options = {}) {
    const adapter = this.app?.chatCreativePlanAdapter;
    if (!adapter) {
      this.setStatus('CHAT_PLAN_UNAVAILABLE', 'CHAT creative-plan controller unavailable', 'error');
      return null;
    }
    try {
      let response = null;
      if (action === 'chat-plan-add-step') {
        this.draftPlanSteps.push(this.createChatPlanStep(options));
        this.setStatus('CHAT_PLAN_STEP_ADDED', `${this.draftPlanSteps.length} ordered step(s)`, 'pass');
        this.refresh();
        return clone(this.draftPlanSteps);
      }
      if (action === 'chat-plan-clear') {
        this.draftPlanSteps = [];
        this.planSequence = 0;
        this.activePlanId = null;
        this.planApprovalToken = null;
        this.lastPlanResult = null;
        this.setStatus('CHAT_PLAN_CLEARED', 'Plan draft cleared', 'info');
        this.refresh();
        return [];
      }
      if (action === 'chat-plan-propose') {
        response = adapter.propose(this.createChatPlan(options));
        if (response.ok) {
          this.activePlanId = response.result.planId;
          this.planApprovalToken = null;
          this.lastPlanResult = null;
        }
      } else if (action === 'chat-plan-approve') {
        if (!this.activePlanId) throw Object.assign(new Error('No active plan'), { code: 'CHAT_PLAN_REQUIRED' });
        response = adapter.approve(this.activePlanId);
        if (response.ok) this.planApprovalToken = response.result.approvalToken;
      } else if (action === 'chat-plan-reject') {
        if (!this.activePlanId) throw Object.assign(new Error('No active plan'), { code: 'CHAT_PLAN_REQUIRED' });
        response = adapter.reject(this.activePlanId);
        if (response.ok) this.planApprovalToken = null;
      } else if (action === 'chat-plan-execute') {
        if (!this.activePlanId) throw Object.assign(new Error('No active plan'), { code: 'CHAT_PLAN_REQUIRED' });
        if (!this.planApprovalToken) throw Object.assign(new Error('Explicit plan approval required before execution'), { code: 'CHAT_PLAN_APPROVAL_REQUIRED' });
        response = await adapter.execute(this.activePlanId, this.planApprovalToken);
        if (response.ok) {
          this.lastPlanResult = clone(response.result);
          this.planApprovalToken = null;
          if (response.result?.revision?.endingRevisionId) await this.refreshRevisionList();
        }
      }
      if (!response?.ok) {
        this.setStatus(response?.code || 'CHAT_PLAN_FAILED', response?.phase || 'CHAT plan failed', 'error');
        this.refresh();
        return response;
      }
      const level = response.result?.status === 'STOPPED' ? 'error' : 'pass';
      this.setStatus(
        response.result?.status === 'STOPPED' ? 'CHAT_PLAN_STOPPED' : 'CHAT_PLAN_UPDATED',
        response.result?.status || action,
        level
      );
      this.refresh();
      return response;
    } catch (error) {
      this.setStatus(error?.code || 'CHAT_PLAN_FAILED', error?.message || 'CHAT plan failed', 'error');
      return null;
    }
  }

  conversationRuntime() {
    return globalThis.INK_AI?.runtime || null;
  }

  conversationClientName() {
    return globalThis.INK_AI?.uiState?.runtimeClient || 'manual-json';
  }

  ensureConversationSession() {
    const runtime = this.conversationRuntime();
    if (!runtime?.manager) throw Object.assign(new Error('CHAT runtime unavailable'), { code: 'CHAT_RUNTIME_UNAVAILABLE' });
    const client = this.conversationClientName();
    if (this.conversationSessionId && this.conversationClient === client) return this.conversationSessionId;
    if (this.conversationSessionId) runtime.manager.end(this.conversationSessionId, { clearCredentials: false });
    const session = runtime.manager.start({ client });
    this.conversationSessionId = session.sessionId;
    this.conversationClient = client;
    return this.conversationSessionId;
  }

  inspectConversationContext() {
    const runtime = this.conversationRuntime();
    if (!runtime?.contextBuilder) throw Object.assign(new Error('CHAT context runtime unavailable'), { code: 'CHAT_CONTEXT_UNAVAILABLE' });
    const context = runtime.contextBuilder.build({ level: 'DOCUMENT_SUMMARY', includeHistory: false });
    this.lastConversationContext = clone(context);
    return context;
  }

  appendConversationMessage(role, content, metadata = {}) {
    this.conversationMessages.push({
      id: `conversation-${this.conversationMessages.length + 1}`,
      role,
      content: String(content || ''),
      provider: metadata.provider || null,
      source: metadata.source || null
    });
    if (this.conversationMessages.length > 40) this.conversationMessages.splice(0, this.conversationMessages.length - 40);
  }

  async runConversationAction(action, options = {}) {
    try {
      if (action === 'chat-conversation-clear') {
        const runtime = this.conversationRuntime();
        if (this.conversationSessionId) runtime?.manager?.end?.(this.conversationSessionId, { clearCredentials: false });
        this.conversationMessages = [];
        this.conversationSessionId = null;
        this.conversationClient = null;
        this.conversationPending = null;
        this.lastTransmissionPreview = null;
        this.setStatus('CHAT_CONVERSATION_CLEARED', 'Conversation cleared; document unchanged', 'info');
        this.refresh();
        return true;
      }
      if (action === 'chat-conversation-inspect') {
        const context = this.inspectConversationContext();
        this.setStatus('CHAT_DOCUMENT_CONTEXT_INSPECTED', `${context.level} · ${context.sourceVersion}`, 'pass');
        this.refresh();
        return context;
      }

      const isApprovedTransmission = action === 'chat-conversation-transmit';
      const prompt = isApprovedTransmission ? this.conversationPending?.prompt : text(options.prompt);
      if (!prompt) throw Object.assign(new Error('Enter a natural-language prompt'), { code: 'CHAT_PROMPT_REQUIRED' });

      const runtime = this.conversationRuntime();
      const sessionId = this.ensureConversationSession();
      const context = this.inspectConversationContext();
      if (!isApprovedTransmission) this.appendConversationMessage('user', prompt);
      const before = JSON.stringify(this.app?.doc || null);
      this.conversationBusy = true;
      this.refresh();
      const response = await runtime.manager.requestConversation(sessionId, {
        prompt,
        contextOptions: { level: 'DOCUMENT_SUMMARY', includeHistory: false },
        transmissionDecision: 'TEXT_SUMMARY',
        userConsent: isApprovedTransmission
      });
      if (JSON.stringify(this.app?.doc || null) !== before) {
        throw Object.assign(new Error('Conversation runtime changed the document outside the bounded edit authority'), { code: 'CHAT_CONVERSATION_MUTATED_DOCUMENT' });
      }
      if (response?.status === 'TRANSMISSION_APPROVAL_REQUIRED') {
        this.conversationPending = { prompt };
        this.lastTransmissionPreview = clone(response.transmissionPreview || null);
        this.setStatus('CHAT_TRANSMISSION_APPROVAL_REQUIRED', 'Review and approve external text/context transmission', 'info');
        this.refresh();
        return response;
      }
      this.conversationPending = null;
      this.lastTransmissionPreview = null;
      this.appendConversationMessage('assistant', response?.content || '', { provider: response?.provider, source: response?.source });
      this.setStatus('CHAT_CONVERSATION_RESPONSE', `${response?.source || 'MODEL'} · document unchanged`, 'pass');
      this.refresh();
      return response;
    } catch (error) {
      this.setStatus(error?.code || 'CHAT_CONVERSATION_FAILED', error?.message || 'Conversation failed', 'error');
      return null;
    } finally {
      this.conversationBusy = false;
      this.refresh();
    }
  }

  runChatAction(action, options = {}) {
    const adapter = this.app?.chatBoundedEditAdapter;
    if (!adapter) {
      this.setStatus('CHAT_EDIT_UNAVAILABLE', 'CHAT bounded-edit controller unavailable', 'error');
      return null;
    }
    try {
      let response;
      if (action === 'chat-inspect') {
        response = adapter.inspect();
        if (response.ok) this.lastChatInspection = response.result;
      } else if (action === 'chat-propose') {
        response = adapter.propose(this.createChatTask(options));
        if (response.ok) {
          this.activeProposalId = response.result.proposalId;
          this.approvalToken = null;
          this.lastChatResult = null;
        }
      } else if (action === 'chat-approve') {
        if (!this.activeProposalId) throw Object.assign(new Error('No active proposal'), { code: 'PROPOSAL_REQUIRED' });
        response = adapter.approve(this.activeProposalId);
        if (response.ok) this.approvalToken = response.result.approvalToken;
      } else if (action === 'chat-reject') {
        if (!this.activeProposalId) throw Object.assign(new Error('No active proposal'), { code: 'PROPOSAL_REQUIRED' });
        response = adapter.reject(this.activeProposalId);
        if (response.ok) this.approvalToken = null;
      } else if (action === 'chat-execute') {
        if (!this.activeProposalId) throw Object.assign(new Error('No active proposal'), { code: 'PROPOSAL_REQUIRED' });
        if (!this.approvalToken) throw Object.assign(new Error('Explicit approval required before execution'), { code: 'APPROVAL_REQUIRED' });
        response = adapter.execute(this.activeProposalId, this.approvalToken);
        if (response.ok) {
          this.lastChatResult = response.result;
          this.approvalToken = null;
        }
      }
      if (!response?.ok) {
        this.setStatus(response?.code || 'CHAT_EDIT_FAILED', response?.phase || 'CHAT edit failed', 'error');
        this.refresh();
        return response;
      }
      this.setStatus('CHAT_EDIT_UPDATED', action, 'pass');
      this.refresh();
      return response;
    } catch (error) {
      this.setStatus(error?.code || 'CHAT_EDIT_FAILED', error?.message || 'CHAT edit failed', 'error');
      return null;
    }
  }

  refreshConversation() { return clone(this.conversationMessages); }
  refreshCapabilityReadouts() { return {grounded:clone(this.lastGroundedContext),memory:clone(this.lastCreativeMemoryContext),research:clone(this.lastResearchCreationContext)}; }
  refreshChat() { return {proposal:proposalSummary(this.app,this.activeProposalId),plan:planSummary(this.app,this.activePlanId),messages:clone(this.conversationMessages),lastResult:clone(this.lastChatResult)}; }
  async runRevisionAction(action,{label='Workspace checkpoint',revisionId=null}={}) {
    const revisions=this.app?.revisions;
    if(!revisions){this.setStatus('REVISION_UNAVAILABLE','Revision controller unavailable','error');return null;}
    try{
      if(action==='revision-list')return await this.refreshRevisionList();
      if(action==='revision-capture'){
        const result=await revisions.capture({reason:'workspace',label:text(label)||'Workspace checkpoint'});
        this.lastRevisionResult={action:'capture',created:result.created,equivalent:result.equivalent,revisionId:result.record?.revisionId||null,comparison:clone(result.comparison||null)};
        await this.refreshRevisionList();this.setStatus(result.created?'REVISION_CAPTURED':'REVISION_EQUIVALENT',result.record?.revisionId||'Equivalent to current Revision','pass');return result;
      }
      if(action==='revision-restore'){
        const id=text(revisionId);if(!id)throw Object.assign(new Error('Select a Revision'),{code:'REVISION_REQUIRED'});
        const result=await revisions.restore(id);this.lastReference=null;this.lastExtraction=null;this.lastStructure=null;this.lastRevisionResult={action:'restore',...clone(result)};
        this.setStatus('REVISION_RESTORED',`${id} · ${result.historyBoundary}`,'pass');await this.refreshRevisionList();return result;
      }
      return null;
    }catch(error){this.setStatus(error?.code||'REVISION_FAILED',error?.message||'Revision operation failed','error');return null;}
  }
  async refreshRevisionList() {
    if(!this.app?.revisions?.list)return[];
    try{this.revisionItems=await this.app.revisions.list(this.app.doc?.id);return clone(this.revisionItems);}
    catch(error){this.setStatus(error?.code||'REVISION_LIST_FAILED',error?.message||'Revision list failed','error');return[];}
  }
  refreshRevision() { return {current:this.app?.revisions?.revisionIdFor?.(this.app?.doc?.id)??null,items:clone(this.revisionItems),result:clone(this.lastRevisionResult),comparison:clone(this.lastRevisionComparison)}; }
  setOpen() { return false; }
  setStage(stage) {
    if(!WORKSPACE_STAGES.some(([id])=>id===stage))return false;
    this.stage=stage;
    if(stage==='revision')void this.refreshRevisionList();
    return true;
  }
  setStatus(code, message, level = 'info') {
    this.status = { code: text(code) || 'WORKSPACE_STATUS', message: text(message) || String(code || ''), level };
    this.refresh();
    return clone(this.status);
  }

  state() {
    return buildCreativeWorkspaceState(this.app, {
      stage: this.stage,
      activeProposalId: this.activeProposalId,
      activePlanId: this.activePlanId,
      status: this.status
    });
  }

  refresh() { return this.state(); }
}

export function installCreativeWorkspace(app) {
  if (!app || typeof app !== 'object') throw new Error('INK_CREATIVE_WORKSPACE_APP_REQUIRED');
  if (app.creativeWorkspace instanceof CreativeWorkspaceController) return app.creativeWorkspace;
  const controller = new CreativeWorkspaceController(app);
  app.creativeWorkspace = controller;
  // Presentation retired with the PS shell. The controller remains a headless Core/CHAT surface.
  return controller;
}

