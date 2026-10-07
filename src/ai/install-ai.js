import { AICommandLayer, ChatIntegrationAdapter, DeterministicTestClient, LocalJSONCommandClient, ManualCommandConsole, MockAIClient, createCommand } from './ai-core.js';
import { ManualJSONClient, RuntimeDeterministicTestClient, buildTransmissionPreview, createChatRuntime, createConnectionSettings, redactSecrets } from './chat-runtime.js';
import { DocumentToPlanRuntime, ImageToPlanLocalAnalyzer, ImageTransmissionConsent, VersionConflictControl } from './plan-analyzers.js';
import { createCreativeMemoryAdapter } from '../memory/creative-memory.js';
import { createResearchCreationBridgeAdapter } from '../research/research-creation-bridge.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const json = value => JSON.stringify(value, null, 2);
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function installAICommandLayer(app) {
  const layer = new AICommandLayer({ app }), adapter = new ChatIntegrationAdapter(layer), localClient = new LocalJSONCommandClient(adapter), testClient = new DeterministicTestClient(adapter), mockClient = new MockAIClient(adapter), manualConsole = new ManualCommandConsole(localClient);
  const creativeMemoryProvider = app?.creativeMemoryProvider || createCreativeMemoryAdapter({
    getRecords: () => Array.isArray(app?.creativeMemoryRecords) ? app.creativeMemoryRecords : []
  });
  const researchCreationProvider = app?.researchCreationProvider || createResearchCreationBridgeAdapter({
    getEvidence: () => Array.isArray(app?.researchCreationEvidence) ? app.researchCreationEvidence : [],
    getPrinciples: () => Array.isArray(app?.researchCreationPrinciples) ? app.researchCreationPrinciples : [],
    getConstraints: () => Array.isArray(app?.researchCreationConstraints) ? app.researchCreationConstraints : []
  });
  const runtime = createChatRuntime(layer, { creativeMemoryProvider, researchCreationProvider }), imageAnalyzer = new ImageToPlanLocalAnalyzer(), documentRuntime = new DocumentToPlanRuntime(layer), conflicts = new VersionConflictControl(layer);
  const state = { plan: null, preview: null, approval: null, execution: null, sessionId: null, runtimeClient: 'manual-json', imageAnalysis: null, imagePayload: null, lastContext: null };

  runtime.manager.register('deterministic-test', new RuntimeDeterministicTestClient({ planFactory: request => layer.createPlan(request.prompt, { type: 'text' }) }));
  runtime.manager.register('manual-json', new ManualJSONClient({ valueProvider: () => { const value = $('#aiCommandJSON')?.value?.trim(); if (!value) return null; const parsed = JSON.parse(value); return parsed.plan || parsed; } }));

  const output = (value, status = 'pass') => { const element = $('#aiOutput'); if (element) { element.textContent = typeof value === 'string' ? value : json(redactSecrets(value)); element.dataset.state = status; } };
  const status = (value, kind = 'partial') => { const element = $('#aiConnectionStatus'); if (element) { element.textContent = value; element.dataset.state = kind; } };
  const clearVisual = () => { $('#aiVisualPreview')?.toggleAttribute('hidden', true); $('#aiApprovalSummary')?.toggleAttribute('hidden', true); };
  const currentMode = () => $('#aiStartupMode')?.value || 'STANDARD';
  const externalSelected = () => ['openai-compatible', 'http-model', 'custom-endpoint'].includes($('#aiProvider')?.value);

  const connectionSettings = () => createConnectionSettings({
    provider: $('#aiProvider')?.value, endpoint: $('#aiEndpoint')?.value?.trim(), model: $('#aiModel')?.value?.trim(), apiVersion: $('#aiApiVersion')?.value?.trim(), authenticationMethod: $('#aiAuthMethod')?.value,
    credentialAlias: $('#aiCredentialAlias')?.value?.trim(), timeout: Number($('#aiTimeout')?.value), retryCount: Number($('#aiRetry')?.value), streaming: $('#aiStreaming')?.checked,
    maximumContext: Number($('#aiMaxContext')?.value), dataTransmissionPolicy: $('#aiDataPolicy')?.value, imageTransmissionPolicy: $('#aiImagePolicy')?.value, loggingPolicy: $('#aiLoggingPolicy')?.value,
    localOnlyMode: $('#aiLocalOnly')?.checked || ['LOCAL_ONLY', 'SAFE'].includes(currentMode()), urlAllowlist: $('#aiEndpoint')?.value ? [new URL($('#aiEndpoint').value).origin] : []
  });

  const renderOverview = () => {
    const element = $('#aiPlanOverview'); if (!element) return;
    if (!state.plan) { element.innerHTML = '<p class="muted">自然語言摘要、目標、保留條件、風險與信心會顯示於此。</p>'; return; }
    const plan = state.plan, targets = plan.targetResolution || plan.orderedSteps?.flatMap(step => Array.isArray(step.target) ? step.target : [step.target]).filter(Boolean) || [];
    element.innerHTML = `<dl><dt>摘要</dt><dd>${escape(plan.userIntent)}</dd><dt>Targets</dt><dd>${escape(targets.join(', ') || '尚待指定')}</dd><dt>Preserved</dt><dd>${escape((plan.preservedElements || plan.constraints?.preserve || ['未選區域']).join(', '))}</dd><dt>Destructive</dt><dd>${escape((plan.destructiveOperations || []).map(item => item.operation || item).join(', ') || '無')}</dd><dt>Unsupported</dt><dd>${escape((plan.unsupportedFeatures || plan.unsupportedItems || []).join(', ') || '無')}</dd><dt>Confidence</dt><dd>${Math.round(Number(plan.confidence ?? 0) * 100)}%</dd><dt>Risk</dt><dd>${escape(plan.risk?.level || plan.riskLevel || 'LOW')}</dd><dt>Approval</dt><dd>${plan.approvalRequired === false ? '依政策' : '正式執行前必須核准'}</dd></dl>`;
  };

  const setPlan = plan => { state.plan = conflicts.attach(plan); state.preview = state.approval = state.execution = null; clearVisual(); refresh(); return state.plan; };
  const revalidateStep = (step, targetText, parametersText) => { state.plan = layer.editPlan(state.plan.planId, { updateStep: { stepId: step.stepId, changes: { target: JSON.parse(targetText), parameters: JSON.parse(parametersText) } } }); conflicts.attach(state.plan); output({ status: 'REVALIDATED', risk: state.plan.risk, planHash: state.plan.planHash }); refresh(); };

  const renderSteps = () => {
    const container = $('#aiPlanSteps'); if (!container) return; container.innerHTML = '';
    for (const [index, step] of (state.plan?.orderedSteps || []).entries()) {
      const row = document.createElement('details'); row.className = 'ai-step'; row.open = index === 0; row.dataset.stepId = step.stepId;
      const summary = document.createElement('summary'); summary.className = 'ai-step-summary'; const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = step.enabled !== false; enabled.setAttribute('aria-label', `Enable ${step.stepId}`);
      const title = document.createElement('strong'); title.textContent = `${step.stepId} · ${step.operation}`; const risk = document.createElement('span'); risk.className = 'ai-risk'; risk.dataset.risk = step.riskLevel || 'LOW'; risk.textContent = step.riskLevel || 'LOW'; summary.append(enabled, title, risk); row.append(summary);
      const fields = document.createElement('div'); fields.className = 'ai-step-fields';
      const targetLabel = document.createElement('label'), targetName = document.createElement('span'), target = document.createElement('textarea'); targetName.textContent = 'Target'; target.value = json(step.target ?? []); target.setAttribute('aria-label', 'Target JSON'); targetLabel.append(targetName, target);
      const parameterLabel = document.createElement('label'), parameterName = document.createElement('span'), parameters = document.createElement('textarea'); parameterName.textContent = 'Parameters'; parameters.value = json(step.parameters || {}); parameters.setAttribute('aria-label', 'Parameters JSON'); parameterLabel.append(parameterName, parameters);
      const preserved = document.createElement('small'); preserved.textContent = `Preserved: ${step.constraints?.preserveOutsideTarget === false ? '依 Step 設定' : '未選區域與可編輯結構'}`; fields.append(targetLabel, parameterLabel, preserved); row.append(fields);
      const actions = document.createElement('div'), up = document.createElement('button'), down = document.createElement('button'), apply = document.createElement('button'), previewOne = document.createElement('button'), approveOne = document.createElement('button'); actions.className = 'ai-step-actions'; up.textContent = '↑'; down.textContent = '↓'; apply.textContent = '套用'; previewOne.textContent = '單步 Preview'; approveOne.textContent = '選為核准'; up.disabled = index === 0; down.disabled = index === state.plan.orderedSteps.length - 1; actions.append(up, down, apply, previewOne, approveOne); row.append(actions);
      enabled.onchange = event => { state.plan = layer.editPlan(state.plan.planId, { updateStep: { stepId: step.stepId, changes: { enabled: event.target.checked } } }); conflicts.attach(state.plan); refresh(); };
      up.onclick = () => { state.plan = layer.editPlan(state.plan.planId, { reorder: { from: index, to: index - 1 } }); conflicts.attach(state.plan); refresh(); };
      down.onclick = () => { state.plan = layer.editPlan(state.plan.planId, { reorder: { from: index, to: index + 1 } }); conflicts.attach(state.plan); refresh(); };
      apply.onclick = () => { try { revalidateStep(step, target.value, parameters.value); } catch (error) { output({ code: error.code || 'PLAN_EDIT_INVALID', message: error.message }, 'fail'); } };
      previewOne.onclick = () => preview([step.stepId]); approveOne.onclick = () => { for (const item of state.plan.orderedSteps) item.enabled = item.stepId === step.stepId; state.plan = layer.planGenerator.revalidate(layer.currentDocument(), state.plan); conflicts.attach(state.plan); refresh(); };
      container.append(row);
    }
    if (!state.plan?.orderedSteps?.length) container.innerHTML = '<p class="muted">尚無 Plan</p>';
  };

  const refresh = () => {
    const permission = $('#aiPermission'); if (permission) permission.textContent = 'PROPOSE';
    const context = $('#aiDocumentContext'); if (context) { const summary = layer.stateReader.read(app.doc, { sections: ['documentSummary', 'editableTargets', 'protectedTargets'] }); context.textContent = `${summary.documentSummary.title} · ${summary.documentSummary.layers} layers · ${summary.documentSummary.objects + summary.documentSummary.strokes} editable items`; }
    const seed = $('#aiPlanSeed'); if (seed && state.plan) seed.value = String(state.plan.seed ?? 1500);
    renderOverview(); renderSteps();
    $('#aiPreviewBtn')?.toggleAttribute('disabled', !state.plan); $('#aiApproveBtn')?.toggleAttribute('disabled', !state.preview || state.preview?.status === 'STALE'); $('#aiRejectBtn')?.toggleAttribute('disabled', !state.preview); $('#aiRollbackBtn')?.toggleAttribute('disabled', !state.execution);
  };

  const renderVisual = async previewResult => {
    if (typeof app.renderExportCanvas !== 'function') return; const formalDocument = app.doc; let beforeCanvas, afterCanvas;
    try { beforeCanvas = await app.renderExportCanvas({ scope: 'artboard', ppi: 72, background: true }); app.doc = layer.previewEngine.branch(previewResult.previewId); afterCanvas = await app.renderExportCanvas({ scope: 'artboard', ppi: 72, background: true }); } finally { app.doc = formalDocument; }
    $('#aiPreviewBefore').src = beforeCanvas.toDataURL('image/png'); $('#aiPreviewAfter').src = afterCanvas.toDataURL('image/png'); $('#aiVisualPreview').hidden = false;
    const difference = previewResult.difference || {}; $('#aiDifferenceSummary').textContent = `Added ${difference.objects?.added?.length || 0} · Deleted ${difference.objects?.deleted?.length || 0} · Modified ${(difference.objects?.modified?.length || 0) + (difference.strokes?.modified?.length || 0)} · Target bounds ${difference.regions?.length || 0}`;
    beforeCanvas.width = beforeCanvas.height = afterCanvas.width = afterCanvas.height = 1;
  };

  const preview = async selectedSteps => {
    if (!state.plan) throw new Error('尚無 Plan'); conflicts.assertCurrent(state.plan); state.preview = layer.preview(state.plan.recipeDraft.recipeId, { quality: $('#aiPreviewQuality')?.value || 'BALANCED', selectedSteps }); conflicts.markPreview(state.preview, state.plan); await renderVisual(state.preview);
    const previewStatus = $('#aiPreviewStatus'); previewStatus.textContent = state.preview.status || 'CURRENT'; previewStatus.dataset.state = state.preview.status || 'CURRENT';
    const approval = $('#aiApprovalSummary'); approval.hidden = false; approval.textContent = json({ purpose: state.plan.userIntent, selectedSteps: selectedSteps || state.plan.orderedSteps.filter(step => step.enabled !== false).map(step => step.stepId), affectedLayers: state.preview.difference.layers, affectedObjects: state.preview.difference.objects, affectedStrokes: state.preview.difference.strokes, regions: state.preview.difference.regions, irreversibleParts: state.preview.rollbackAvailable === false ? ['See unsupported warning'] : [], externalDependencies: state.plan.requiredAssets, risk: state.plan.risk, confidence: state.plan.confidence, estimatedTimeMs: state.preview.performanceEstimate.estimatedMs, estimatedMemoryBytes: state.preview.performanceEstimate.memoryBytes, checkpoint: 'WILL BE CREATED ON APPROVED EXECUTION', rollback: state.plan.rollbackStrategy, previewStatus: state.preview.status || 'CURRENT' }); output({ difference: state.preview.difference, performanceEstimate: state.preview.performanceEstimate, isolated: state.preview.isolated }); refresh();
  };

  const approve = () => { if (!state.preview) throw new Error('尚無 Preview'); conflicts.markPreview(state.preview, state.plan); if (state.preview.status === 'STALE') throw Object.assign(new Error('Preview 已失效，必須重新 Preview'), { code: 'STALE_PREVIEW' }); const selectedSteps = state.plan.orderedSteps.filter(step => step.enabled !== false).map(step => step.stepId); state.approval = layer.approve(state.preview.previewId, { decision: 'APPROVE', selectedSteps }); state.execution = layer.executeApproval(state.approval.approvalId); app.refreshAll(); output({ decision: 'APPROVED FOR THIS EXECUTION', execution: state.execution }); refresh(); };
  const reject = () => { if (!state.preview) throw new Error('尚無 Preview'); state.approval = layer.approve(state.preview.previewId, { decision: 'REJECT' }); state.preview = null; clearVisual(); output(state.approval); refresh(); };
  const rollback = () => { if (!state.execution) throw new Error('尚無可回滾執行'); const result = layer.rollback(state.execution.executionId); app.refreshAll(); output(result); state.execution = null; refresh(); };

  const showTransmission = transmissionPreview => new Promise(resolve => {
    const dialog = $('#aiTransmissionDialog'), container = $('#aiTransmissionPreview'); if (!dialog?.showModal) { resolve(false); return; }
    container.innerHTML = `<dl><dt>資料</dt><dd>${escape(Object.entries(transmissionPreview.dataCategories).filter(([, value]) => value).map(([key]) => key).join(', '))}</dd><dt>圖片</dt><dd>${transmissionPreview.imageIncluded ? '包含' : '不包含'}</dd><dt>端點</dt><dd>${escape(transmissionPreview.endpoint)}</dd><dt>模型</dt><dd>${escape(transmissionPreview.model)}</dd><dt>估計資料量</dt><dd>${transmissionPreview.estimatedBytes} bytes</dd><dt>記錄政策</dt><dd>${escape(transmissionPreview.providerRetention)}</dd><dt>風險</dt><dd>${escape(transmissionPreview.risks.join(' ') || '本地處理')}</dd></dl>`;
    const done = () => { dialog.removeEventListener('close', done); resolve(dialog.returnValue === 'approve'); }; dialog.addEventListener('close', done); dialog.showModal();
  });

  const runtimePlan = async ({ prompt, images = [], contextOptions = {} }) => {
    if (!state.sessionId) state.sessionId = runtime.manager.start({ client: state.runtimeClient }).sessionId;
    let result = await runtime.manager.requestPlan(state.sessionId, { prompt, images, contextOptions, transmissionDecision: images.length ? $('#aiImagePolicy').value : $('#aiDataPolicy').value });
    if (result.status === 'TRANSMISSION_APPROVAL_REQUIRED') { const approved = await showTransmission(result.transmissionPreview); if (!approved) throw Object.assign(new Error('使用者取消傳輸'), { code: 'USER_CANCELLED' }); result = await runtime.manager.requestPlan(state.sessionId, { prompt, images, contextOptions, transmissionDecision: images.length ? $('#aiImagePolicy').value : $('#aiDataPolicy').value, userConsent: true, onToken: token => status(`Streaming… ${token.length ? '接收中' : ''}`) }); }
    state.lastContext = result.plan?.context || null; return setPlan(result.plan);
  };

  const generate = async () => { const prompt = $('#aiPrompt')?.value?.trim(); if (!prompt) throw new Error('請輸入作品要求'); if (currentMode() === 'AI_ASSISTED' && externalSelected()) await runtimePlan({ prompt, contextOptions: { level: 'DOCUMENT_SUMMARY', tokenBudget: Number($('#aiMaxContext').value) } }); else setPlan(layer.createPlan(prompt, { type: 'text' })); output({ summary: state.plan.userIntent, risk: state.plan.risk, confidence: state.plan.confidence, unsupported: state.plan.unsupportedFeatures, steps: state.plan.orderedSteps, client: currentMode() === 'AI_ASSISTED' ? state.runtimeClient : 'LOCAL PLAN GENERATOR' }); };

  const decodeImage = async file => { const bitmap = await createImageBitmap(file), maximum = 2048, scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); return { pixels: context.getImageData(0, 0, canvas.width, canvas.height), dataUrl: canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.82), original: { width: file.width, height: file.height }, thumbnail: canvas.toDataURL('image/jpeg', 0.55), bytes: file.size }; };
  const imagePicked = async file => { if (!file) return; const decoded = await decodeImage(file); state.imageAnalysis = imageAnalyzer.analyze(decoded.pixels, { mimeType: file.type, fileName: file.name }); state.imagePayload = { dataUrl: decoded.dataUrl, thumbnail: decoded.thumbnail, bytes: decoded.bytes, size: { width: state.imageAnalysis.source.width, height: state.imageAnalysis.source.height }, transmissionResolution: { maximumDimension: Math.max(decoded.pixels.width, decoded.pixels.height) }, cropped: false, externalAsset: true };
    const element = $('#aiImageAnalysis'); element.hidden = false; element.innerHTML = `<strong>本地分析完成 · 尚未寫入文件</strong><br>${escape(state.imageAnalysis.observations.join(' · '))}<br>Vector: ${escape(state.imageAnalysis.candidateModes.vector.join(', ') || 'none')} · Hand: ${escape(state.imageAnalysis.candidateModes.handDrawn.join(', ') || 'none')} · Image: ${escape(state.imageAnalysis.candidateModes.imageProcessing.join(', '))}<br>下一狀態：PROPOSE`;
    if (currentMode() === 'AI_ASSISTED' && externalSelected()) { const consent = new ImageTransmissionConsent({ analysis: state.imageAnalysis, provider: $('#aiProvider').value, endpoint: $('#aiEndpoint').value, model: $('#aiModel').value, option: $('#aiImagePolicy').value, thumbnail: decoded.thumbnail }); if ($('#aiImagePolicy').value === 'NO_IMAGE') await runtimePlan({ prompt: $('#aiPrompt').value || '依本地圖片分析建立可編輯 Plan', contextOptions: { level: 'DOCUMENT_SUMMARY', tokenBudget: Number($('#aiMaxContext').value) } }); else await runtimePlan({ prompt: $('#aiPrompt').value || '依圖片建立可編輯 Plan', images: [{ ...state.imagePayload, consent: consent.consentId }], contextOptions: { level: 'TARGET_CONTEXT', includeImage: false, tokenBudget: Number($('#aiMaxContext').value) } }); }
    else setPlan(layer.createPlan(decoded.pixels, { type: 'image' })); output({ localAnalysis: state.imageAnalysis, transmission: currentMode() === 'AI_ASSISTED' ? $('#aiImagePolicy').value : 'NO EXTERNAL REQUEST', plan: state.plan });
  };

  const documentPlan = () => { const analysis = documentRuntime.analyze({ goal: $('#aiPrompt').value?.trim() || '依目前文件狀態提出下一步修改' }); output(analysis, analysis.requiredUserChoices.length ? 'partial' : 'pass'); try { setPlan(documentRuntime.toPlan(analysis, {})); } catch (error) { output({ analysis, result: 'USER EDIT REQUIRED', error: { code: error.code, message: error.message } }, 'partial'); } };

  const saveCredential = async () => { const alias = $('#aiCredentialAlias').value.trim(), value = $('#aiCredential').value; await runtime.credentialStore.set(alias, value, { persistence: 'SESSION_ONLY' }); $('#aiCredential').value = ''; status(`憑證 ${alias} 僅保留於本次 Session`, 'pass'); };
  const connect = () => { runtime.manager.setMode(currentMode()); if (externalSelected()) { const settings = connectionSettings(); state.runtimeClient = `configured:${settings.provider}`; runtime.configure(state.runtimeClient, settings); } else state.runtimeClient = $('#aiProvider').value; if (state.sessionId) runtime.manager.end(state.sessionId, { clearCredentials: false }); state.sessionId = runtime.manager.start({ client: state.runtimeClient }).sessionId; status(`${currentMode()} · ${state.runtimeClient} · 尚未送出外部請求`, 'pass'); };
  const disconnect = () => { if (state.sessionId) runtime.manager.end(state.sessionId); state.sessionId = null; runtime.credentialStore.clearAll(); status('已中斷；Session Credential 已清除', 'partial'); };

  const bind = (selector, handler) => { const element = $(selector); if (element) element.onclick = async () => { try { await handler(); } catch (error) { output({ code: error.code || 'AI_UI_ERROR', message: error.message, details: error.details }, 'fail'); } }; };
  bind('#aiGeneratePlan', generate); bind('#aiPreviewBtn', () => preview()); bind('#aiApproveBtn', approve); bind('#aiRejectBtn', reject); bind('#aiRollbackBtn', rollback); bind('#aiInspectBtn', () => output(layer.stateReader.read(app.doc, { limit: 100 }))); bind('#aiCapabilitiesBtn', () => output(runtime.capabilityProvider.get())); bind('#aiAuditBtn', () => output({ ai: layer.audit.list(), network: runtime.auditBridge.report() })); bind('#aiCancelBtn', () => { if (state.plan) layer.cancel(state.plan.recipeDraft.recipeId); output('Execution cancelled'); }); bind('#aiRunJSON', async () => output(await manualConsole.execute($('#aiCommandJSON').value, { onProgress: item => output(item) })));
  bind('#aiSaveCredential', saveCredential); bind('#aiConnect', connect); bind('#aiDisconnect', disconnect); bind('#aiImagePick', () => $('#aiImageInput').click()); bind('#aiDocumentPlan', documentPlan);
  $('#aiImageInput')?.addEventListener('change', event => imagePicked(event.target.files?.[0]).catch(error => output({ code: error.code || 'IMAGE_TO_PLAN_FAILED', message: error.message }, 'fail')));
  $('#aiStartupMode')?.addEventListener('change', event => { runtime.manager.setMode(event.target.value); if (['LOCAL_ONLY', 'SAFE'].includes(event.target.value)) { $('#aiLocalOnly').checked = true; disconnect(); } status(`${event.target.value} · 設定已套用`, 'partial'); });
  $('#aiPlanSeed')?.addEventListener('change', event => { if (!state.plan) return; state.plan = layer.editPlan(state.plan.planId, { seed: Number.parseInt(event.target.value, 10) }); conflicts.attach(state.plan); output({ status: 'REVALIDATED', seed: state.plan.seed, planHash: state.plan.planHash }); refresh(); });
  $$('.ai-preview-toolbar button').forEach(button => button.addEventListener('click', () => { $('#aiVisualPreview').dataset.view = button.dataset.aiPreviewView; }));
  $('#aiPreviewSlider')?.addEventListener('input', event => { $('#aiPreviewAfter').style.clipPath = `inset(0 0 0 ${event.target.value}%)`; });
  window.addEventListener('beforeunload', () => runtime.credentialStore.clearAll(), { once: true });

  window.INK_AI = { version: '1.6.0', layer, adapter, runtime, creativeMemoryProvider, researchCreationProvider, uiState: state, localClient, testClient, mockClient, manualConsole, createCommand, stateReader: layer.stateReader, manifest: layer.manifest, semantics: layer.semantics, imageAnalyzer, documentRuntime, conflicts, textToPlan: (text, options) => layer.createPlan(text, { type: 'text', ...options }), imageToPlan: (image, options) => layer.createPlan(image, { type: 'image', ...options }), documentToPlan: (goal, options) => layer.createPlan(goal, { type: 'document', ...options }), planFromSteps: (intent, steps, options) => layer.createPlanFromSteps(intent, steps, options), editPlan: (id, change) => layer.editPlan(id, change), preview: (id, options) => layer.preview(id, options), approve: (id, options) => layer.approve(id, options), execute: id => layer.executeApproval(id), rollback: id => layer.rollback(id), audit: () => layer.audit.list(), networkAudit: () => runtime.auditBridge.report(), negotiate: request => adapter.negotiate(request), refreshUI: refresh };
  refresh(); return window.INK_AI;
}
