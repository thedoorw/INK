// First-party DOM transport only. All state still comes from inkPublicApi.
// Fixed read tools and an opt-in, staged Recipe form; no arbitrary JavaScript.
export const WORK_READ_TOOLS = Object.freeze([
  'get_ink_context', 'get_ink_capabilities', 'get_ink_recipe_inventory', 'get_ink_history'
]);

export async function invokeWorkRead(globalObject, tool) {
  if (!WORK_READ_TOOLS.includes(tool)) throw new Error('INK_WORK_READ_TOOL_NOT_ALLOWED');
  const app = globalObject.INK_APP;
  const api = app?.inkPublicApi;
  if (typeof api?.tools?.invoke !== 'function') throw new Error('INK_WORK_RUNTIME_NOT_READY');
  const requestId = globalObject.crypto.randomUUID();
  const buildId = globalObject.INK_BUILD_ID || null;
  if (!buildId) throw new Error('INK_WORK_BUILD_IDENTITY_REQUIRED');
  const result = await api.tools.invoke(tool, {});
  if (globalObject.INK_APP !== app || app.inkPublicApi !== api || globalObject.INK_BUILD_ID !== buildId) {
    throw new Error('INK_WORK_RUNTIME_CHANGED');
  }
  return { schema: 'INK-WORK-DOM-READ-RECEIPT', version: 1, requestId,
    route: 'WORK_DOM → inkPublicApi.tools.invoke', tool, buildId,
    pageUrl: globalObject.location.origin + globalObject.location.pathname,
    receivedAt: new Date().toISOString(), result };
}

export function mountWorkRuntimeReadControls({ globalObject, documentObject, entry = 'recipe-workflow', titleText = 'Recipe 匯入與執行', expectedFormat = null }) {
  let existing = documentObject.querySelector('[data-ink-work-read-controls]');
  if (existing && existing.getAttribute('data-extension-entry') !== entry) {
    existing.close(); existing.remove(); existing = null;
  }
  if (existing) {
    if (!existing.open) existing.showModal();
    return existing;
  }
  const root = documentObject.createElement('dialog');
  root.setAttribute('data-ink-work-read-controls', '1');
  root.setAttribute('data-extension-entry', entry);
  const title = documentObject.createElement('h2');
  title.textContent = titleText;
  const output = documentObject.createElement('pre');
  output.setAttribute('aria-live', 'polite');
  output.setAttribute('aria-label', 'WORK Native structured receipt');
  root.append(title);
  const caller = createWorkRecipeCaller(globalObject, { expectedFormat });
  let busy = false;
  for (const tool of WORK_READ_TOOLS) {
    const button = documentObject.createElement('button');
    button.type = 'button';
    button.textContent = tool;
    button.setAttribute('data-read-tool', tool);
    button.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      button.disabled = true;
      try { output.textContent = JSON.stringify(await caller.read(tool), null, 2); }
      catch (error) { output.textContent = JSON.stringify({ status: 'FAILED', tool, error: String(error.message || error) }); }
      finally { busy = false; button.disabled = false; }
    });
    root.append(button);
  }
  if (entry !== 'recipe-engine') mountRecipeForm(documentObject, root, caller, output);
  root.append(output);
  const close = documentObject.createElement('button');
  close.type = 'button';
  close.textContent = '關閉 WORK Recipe 呼叫';
  close.addEventListener('click', () => root.close());
  root.append(close);
  documentObject.body.append(root);
  root.showModal();
  root.querySelector(entry === 'recipe-engine' ? 'button[data-read-tool="get_ink_recipe_inventory"]' : 'button')?.focus();
  return root;
}


// Transport state only. Native RecipeEngine retains proposal, approval and execution authority.
export function createWorkRecipeCaller(globalObject, { now = () => Date.now(), expectedFormat = null } = {}) {
  const required = WORK_READ_TOOLS.slice(0, 3);
  const reads = new Set();
  let binding = null;
  let sessionId = null, proposalId = null, approvalToken = null, phase = 'READ_REQUIRED';
  let busy = false;
  const fail = code => { throw new Error(code); };
  const identity = () => ({
    app: globalObject.INK_APP,
    api: globalObject.INK_APP?.inkPublicApi,
    build: globalObject.INK_BUILD_ID,
    documentId: globalObject.INK_APP?.doc?.id || null,
    pageId: globalObject.INK_APP?.doc?.activePageId || null
  });
  function assertBinding() {
    const live = identity();
    if (!binding || now() - binding.at > 300000 ||
        ['app','api','build','documentId','pageId'].some(key => binding[key] !== live[key])) {
      reads.clear(); phase = 'READ_REQUIRED'; sessionId = proposalId = approvalToken = null;
      fail('INK_WORK_SESSION_CHANGED_OR_EXPIRED');
    }
  }
  async function exclusive(task) {
    if (busy) fail('INK_WORK_CALL_BUSY');
    busy = true;
    try { return await task(); } finally { busy = false; }
  }
  return Object.freeze({
    state: () => ({ phase, sessionId, proposalId, buildId: binding?.build || null,
      documentId: binding?.documentId || null, pageId: binding?.pageId || null,
      readToolsPassed: [...reads] }),
    read(tool) {
      return exclusive(async () => {
        const live = identity();
        if (!binding || ['app','api','build','documentId','pageId'].some(key => binding[key] !== live[key]) ||
            now() - binding.at > 300000) {
          binding = { ...live, at: now() }; reads.clear();
          phase = 'READ_REQUIRED'; sessionId = proposalId = approvalToken = null;
        }
        const receipt = await invokeWorkRead(globalObject, tool);
        assertBinding();
        if (receipt.result?.status === 'COMPLETED') reads.add(tool);
        if (phase === 'READ_REQUIRED' && required.every(name => reads.has(name))) phase = 'READY';
        return receipt;
      });
    },
    call(action, input = {}, consentProposalId = '') {
      return exclusive(async () => {
        assertBinding();
        if (!required.every(name => reads.has(name))) fail('INK_WORK_READS_REQUIRED');
        if (!binding.documentId) fail('INK_WORK_DOCUMENT_REQUIRED');
        const expected = { analyze: 'READY', translate: 'ANALYZED', propose: 'TRANSLATED',
          approve: 'PROPOSED', execute: 'APPROVED' };
        if (!Object.hasOwn(expected, action) || phase !== expected[action]) fail('INK_WORK_RECIPE_PHASE_INVALID');
        if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INK_WORK_INPUT_INVALID');
        if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 192 * 1024) fail('INK_WORK_INPUT_LIMIT');
        const allowed = action === 'analyze'
          ? ['source','staticIncludes','entrypoint','diagnosticFunctions','replayParameters']
          : action === 'propose' ? ['parameters','inputHashes','targetRefs'] : [];
        if (Object.keys(input).some(key => !allowed.includes(key))) fail('INK_WORK_INPUT_FIELD_NOT_ALLOWED');
        if ((action === 'approve' || action === 'execute') && consentProposalId !== proposalId)
          fail('INK_WORK_EXPLICIT_PROPOSAL_CONSENT_REQUIRED');
        const request = { ...input, action };
        if (sessionId) request.sessionId = sessionId;
        if (action === 'approve' || action === 'execute') request.proposalId = proposalId;
        if (action === 'execute') request.approvalToken = approvalToken;
        // Consume execution before awaiting: a lost/failed receipt must never auto-retry a mutation.
        if (action === 'execute') phase = 'EXECUTION_SENT';
        const result = await binding.api.tools.invoke('import_ink_workflow', request);
        assertBinding();
        if (!result || result.status === 'FAILED') {
          if (action === 'execute') approvalToken = null;
          return { schema: 'INK-WORK-DOM-RECIPE-RECEIPT', version: 1, action,
            ...this.state(), result: JSON.parse(JSON.stringify(result, (key, value) => /token/i.test(key) ? '[REDACTED]' : value)) };
        }
        const payload = result.result;
        if (action === 'analyze' && expectedFormat && payload?.detection?.format !== expectedFormat)
          fail('INK_WORK_SOURCE_FORMAT_MISMATCH');
        if (action === 'analyze' && !payload?.sessionId) fail('INK_WORK_SESSION_RECEIPT_INVALID');
        if (action === 'propose' && !payload?.proposalId) fail('INK_WORK_PROPOSAL_RECEIPT_INVALID');
        if (action === 'approve' && !payload?.approvalToken) fail('INK_WORK_APPROVAL_RECEIPT_INVALID');
        sessionId = payload?.sessionId || sessionId;
        proposalId = payload?.proposalId || proposalId;
        if (action === 'approve') approvalToken = payload.approvalToken;
        if (action === 'execute') approvalToken = null;
        phase = { analyze:'ANALYZED', translate:'TRANSLATED', propose:'PROPOSED',
          approve:'APPROVED', execute:'EXECUTED' }[action];
        // Approval tokens remain private to the caller, never reflected in DOM receipts.
        const visible = JSON.parse(JSON.stringify(result, (key, value) =>
          /token/i.test(key) ? '[REDACTED]' : value));
        return { schema:'INK-WORK-DOM-RECIPE-RECEIPT', version:1,
          requestId:globalObject.crypto.randomUUID(), action, ...this.state(),
          receivedAt:new Date().toISOString(), result:visible };
      });
    }
  });
}

function mountRecipeForm(doc, root, caller, output) {
  const section = doc.createElement('fieldset');
  const legend = doc.createElement('legend');
  legend.textContent = 'Recipe 分階段呼叫';
  const help = doc.createElement('p');
  help.textContent = '先完成三個唯讀呼叫並確認測試文件。逐步輸入該階段 JSON；核准及執行僅限已取得授權的提案。';
  const label = doc.createElement('label');
  label.textContent = 'Recipe 階段輸入 JSON';
  const input = doc.createElement('textarea');
  input.setAttribute('aria-label', 'Recipe 階段輸入 JSON');
  input.rows = 8; input.cols = 60; input.value = '{}';
  label.append(input);
  const consentLabel = doc.createElement('label');
  consentLabel.textContent = '本次核准或執行的 proposalId';
  const consent = doc.createElement('input');
  consent.type = 'text'; consent.autocomplete = 'off';
  consent.setAttribute('aria-label', '本次核准或執行的 proposalId');
  consentLabel.append(consent);
  const state = doc.createElement('pre');
  state.setAttribute('aria-label', 'Recipe 呼叫狀態');
  state.setAttribute('aria-live', 'polite');
  const refresh = () => { state.textContent = JSON.stringify(caller.state(), null, 2); };
  section.append(legend, help, label, consentLabel);
  let busy = false;
  for (const action of ['analyze','translate','propose','approve','execute']) {
    const button = doc.createElement('button');
    button.type = 'button'; button.textContent = 'Recipe ' + action;
    button.addEventListener('click', async () => {
      if (busy) return;
      busy = true; button.disabled = true;
      const grant = consent.value; consent.value = '';
      try {
        const value = JSON.parse(input.value);
        output.textContent = JSON.stringify(await caller.call(action, value, grant), null, 2);
      } catch (error) {
        output.textContent = JSON.stringify({ status:'FAILED', action, error:String(error.message || error) });
      } finally { busy = false; button.disabled = false; refresh(); }
    });
    section.append(button);
  }
  section.append(state); root.append(section); refresh();
}

const EXTENSION_PROFILES = Object.freeze({
  'recipe-engine': { titleText:'Recipe 引擎 — 既有 Recipe 清單' },
  'recipe-workflow': { titleText:'Recipe 匯入與執行' },
  'translate-photoshop': { titleText:'轉譯 Photoshop Action — 可讀文字', expectedFormat:'PHOTOSHOP_ACTION_TEXT' },
  'translate-illustrator': { titleText:'轉譯 Illustrator JSX', expectedFormat:'ILLUSTRATOR_JSX_READABLE_SUBSET' },
  'translate-figma': { titleText:'轉譯 Figma Skill', expectedFormat:'FIGMA_SKILL_MARKDOWN' },
  'translate-canva': { titleText:'轉譯 Canva 資料集', expectedFormat:'CANVA_AUTOFILL_DATASET' }
});
export function mountWorkExtensionControls({ entry, globalObject, documentObject }) {
  if (!Object.hasOwn(EXTENSION_PROFILES, entry)) throw new Error('INK_WORK_EXTENSION_NOT_ALLOWED');
  return mountWorkRuntimeReadControls({ globalObject, documentObject, entry, ...EXTENSION_PROFILES[entry] });
}
