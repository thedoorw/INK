import { chatStateFingerprint } from '../editor/chat-bounded-edit.js';
import { documentFingerprint } from '../document/integrity.js';

// Bounded CHAT entry into the existing first-party UniversalProgramImporter and Studio RecipeEngine.
// No second parser, compiler, executor, History, or approval authority is created here.
const fail = (code, details = {}) => { throw Object.assign(new Error(code), { code, ...details }); };
const clone = value => JSON.parse(JSON.stringify(value));
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const MAX_SOURCE_BYTES = 32768;
const MAX_SESSIONS = 8;
const MAX_PARAMETERS_BYTES = 16384;
const MAX_TARGETS = 64;

async function sha256(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}
function safeObject(value, field) {
  if (value == null) return {};
  if (!isObject(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('INK_RECIPE_INPUT_INVALID', { field });
  const result = clone(value);
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_PARAMETERS_BYTES) fail('INK_RECIPE_INPUT_LIMIT', { field });
  return result;
}
function isWholeSourceRejected(report) {
  return report?.workflowIR?.metadata?.sourceCoverage?.wholeSourceRejected === true ||
    report?.workflowIR?.metadata?.sourceCoverage?.failClosed === true;
}
function assertCompilable(report) {
  if (!report || report.status !== 'COMPILED' || report.executionAllowed !== true ||
      report.security?.status === 'REJECTED' || isWholeSourceRejected(report) ||
      report.conversionReport?.compileStatus !== 'COMPLETE' ||
      (report.unsupportedOperations || []).length ||
      (report.conversionReport?.unsupportedOperations || []).length ||
      !report.recipe?.steps?.some(step => step.enabled !== false && step.op !== 'checkpoint')) {
    fail('INK_RECIPE_SOURCE_NOT_FULLY_EXECUTABLE', { actual: report?.status || 'MISSING' });
  }
  if ((report.recipe.steps || []).some(step => step.enabled === false || step.optional || step.sourceWorkflow?.unsupportedStep === true)) {
    fail('INK_RECIPE_UNSUPPORTED_STEP');
  }
}
function snapshot(app) {
  return {
    documentId: app?.doc?.id || null,
    pageId: app?.page?.()?.id || app?.doc?.activePageId || null,
    revisionId: app?.revisions?.revisionIdFor?.(app?.doc?.id) ?? null,
    documentFingerprint: app?.doc ? documentFingerprint(app.doc) : null,
    historyPending: Boolean(app?.history?.pending)
  };
}
function assertSameState(before, app) {
  const now = snapshot(app);
  if (now.historyPending || !before.documentId || before.documentId !== now.documentId ||
      before.pageId !== now.pageId || before.revisionId !== now.revisionId ||
      before.documentFingerprint !== now.documentFingerprint) fail('INK_RECIPE_STALE_TARGET_STATE');
}
export function createInkRecipeCreativeLoop(app) {
  const importer = app?.studio?.programImporter;
  const engine = app?.studio?.engine;
  const edit = app?.chatBoundedEditAdapter;
  if (!importer?.importAsset || !importer?.translate || !engine?.registerRecipe || !edit?.propose || !edit?.approve || !edit?.execute) {
    fail('INK_RECIPE_EXISTING_AUTHORITIES_UNAVAILABLE');
  }
  const sessions = new Map();
  const proposed = new Map();
  const get = id => {
    const session = sessions.get(String(id || ''));
    if (!session) fail('INK_RECIPE_SESSION_NOT_FOUND');
    return session;
  };
  function assertFrozenRecipe(record) {
    const live = importer.imports.get(record.importId);
    if (!live || chatStateFingerprint(live.recipe) !== record.importedRecipeFingerprint) fail('INK_RECIPE_SOURCE_CHANGED');
    if (chatStateFingerprint(engine.recipes.get(record.recipeId)) !== record.engineRecipeFingerprint) fail('INK_RECIPE_REGISTRY_CHANGED');
  }
  function describe(session) {
    const report = session.report;
    return {
      sessionId: session.id,
      importId: session.importId,
      sourceSha256: session.sourceSha256,
      adapter: report.sourceAdapter?.id || null,
      status: report.status,
      detection: report.detection,
      security: report.security,
      sourceCoverage: report.workflowIR?.metadata?.sourceCoverage || null,
      workflowIrId: report.workflowIR?.id || null,
      conversion: report.conversionReport || null,
      recipe: report.recipe || null,
      unsupportedOperations: report.unsupportedOperations || [],
      documentMutation: false
    };
  }
  return Object.freeze({
    async analyze(input = {}) {
      if (!isObject(input) || !isObject(input.source)) fail('INK_RECIPE_SOURCE_REQUIRED');
      const { source } = input;
      if (typeof source.text !== 'string' || !source.text.trim() ||
          !/^[A-Za-z0-9._-]{1,120}$/.test(String(source.name || ''))) fail('INK_RECIPE_SOURCE_INVALID');
      const length = new TextEncoder().encode(source.text).byteLength;
      if (length > MAX_SOURCE_BYTES) fail('INK_RECIPE_SOURCE_LIMIT');
      const license = safeObject(source.license, 'license');
      const provenance = safeObject(source.provenance, 'provenance');
      if (!license.spdx || /^(?:NOASSERTION|NONE|UNKNOWN)$/i.test(String(license.spdx)) ||
          (!provenance.sourceUrl && provenance.localUserProvided !== true)) fail('INK_RECIPE_PROVENANCE_REQUIRED');
      const sourceSha256 = await sha256(source.text);
      const report = importer.importAsset({
        name: source.name, mimeType: String(source.mimeType || ''), text: source.text,
        license, provenance, declaredPermissions: [], safetyMode: 'STATIC_PARSE', compile: false
      });
      const id = 'ink-recipe-session:' + sourceSha256.slice(0,20) + ':' + String(sessions.size + 1);
      if (sessions.size >= MAX_SESSIONS) fail('INK_RECIPE_SESSION_LIMIT');
      const session = { id, importId: report.id, sourceSha256, report, phase: 'ANALYZED' };
      sessions.set(id, session);
      return describe(session);
    },
    translate(input = {}) {
      const session = get(input.sessionId);
      if (session.phase !== 'ANALYZED') fail('INK_RECIPE_SESSION_PHASE_INVALID');
      const report = importer.translate(session.importId);
      session.report = report;
      session.phase = 'TRANSLATED';
      return describe(session);
    },
    inspect(input = {}) {
      return { ...describe(get(input.sessionId)), phase: get(input.sessionId).phase };
    },
    async propose(input = {}) {
      const session = get(input.sessionId);
      if (session.phase !== 'TRANSLATED') fail('INK_RECIPE_SESSION_PHASE_INVALID');
      assertCompilable(session.report);
      const parameters = safeObject(input.parameters, 'parameters');
      const inputHashes = safeObject(input.inputHashes, 'inputHashes');
      if (session.report.conversionReport?.replayConditions?.fixedSeed && parameters.seed == null) fail('INK_RECIPE_SEED_REQUIRED');
      const targets = Array.isArray(input.targetRefs) ? clone(input.targetRefs) : [];
      if (!targets.length || targets.length > MAX_TARGETS ||
          targets.some(ref => !isObject(ref) || !ref.pageId || !ref.layerId || !ref.objectId)) {
        fail('INK_RECIPE_NATIVE_TARGET_REQUIRED'); // Existing governed Recipe edit requires 1..64 Path refs.
      }
      const before = snapshot(app);
      if (before.historyPending) fail('INK_RECIPE_HISTORY_BUSY');
      const recipe = session.report.recipe;
      const importedRecipeFingerprint = chatStateFingerprint(recipe);
      // Registration is explicit at proposal stage, never a side effect of source analysis/translation.
      // A rejected native proposal must not leave an imported Recipe in the shared inventory.
      // Restore the exact original Map value (not a normalized re-registration) on failure.
      const hadPreviousRecipe = engine.recipes.has(recipe.id);
      const previousRecipe = engine.recipes.get(recipe.id);
      try {
        engine.registerRecipe(recipe);
        const engineRecipeFingerprint = chatStateFingerprint(engine.recipes.get(recipe.id));
        const task = {
          schema: 'INK-CHAT-EDIT-TASK', version: 1,
          taskId: 'recipe-loop-' + session.sourceSha256.slice(0,12) + '-' + String(proposed.size + 1),
          operation: 'recipe.studio.execute.v1', targets,
          arguments: { recipeId: recipe.id, recipeVersion: String(recipe.version), parameters, roles: targets.map(() => 'target') },
          expected: { documentId: before.documentId, pageId: before.pageId, revisionId: before.revisionId }
        };
        const bindingHash = await sha256({ sourceSha256: session.sourceSha256, importedRecipeFingerprint, engineRecipeFingerprint, parameters, inputHashes, targetRefs: targets, before });
        const raw = edit.propose(task);
        if (!raw?.ok || !raw.result?.proposalId) fail(raw?.code || 'INK_RECIPE_NATIVE_PROPOSAL_REJECTED');
        const proposalId = raw.result.proposalId;
        proposed.set(proposalId, {
          sessionId: session.id, importId: session.importId, recipeId: recipe.id, recipeFingerprint: importedRecipeFingerprint,
          sourceSha256: session.sourceSha256, inputHashes, parameters, targetRefs: targets,
          bindingHash, before, importedRecipeFingerprint, engineRecipeFingerprint, phase: 'PROPOSED'
        });
        session.phase = 'PROPOSED';
        return { sessionId: session.id, proposalId, bindingSha256: bindingHash, state: 'PROPOSED', authority: 'chatBoundedEditAdapter', nativeProposal: raw.result };
      } catch (error) {
        if (hadPreviousRecipe) engine.recipes.set(recipe.id, previousRecipe);
        else engine.recipes.delete(recipe.id);
        throw error;
      }
    },
    approve(input = {}) {
      const record = proposed.get(input.proposalId);
      if (!record || record.phase !== 'PROPOSED' || record.sessionId !== input.sessionId) fail('INK_RECIPE_PROPOSAL_NOT_FOUND');
      assertSameState(record.before, app);
      assertFrozenRecipe(record);
      const raw = edit.approve(input.proposalId);
      if (!raw?.ok || !raw.result?.approvalToken) fail(raw?.code || 'INK_RECIPE_NATIVE_APPROVAL_REJECTED');
      record.phase = 'APPROVED';
      get(record.sessionId).phase = 'APPROVED';
      return { proposalId: input.proposalId, approvalToken: raw.result.approvalToken, bindingSha256: record.bindingHash, state: 'APPROVED', nativeApproval: raw.result };
    },
    execute(input = {}) {
      const record = proposed.get(input.proposalId);
      if (!record || record.sessionId !== input.sessionId || record.phase !== 'APPROVED') fail('INK_RECIPE_APPROVAL_REQUIRED');
      assertSameState(record.before, app);
      assertFrozenRecipe(record);
      const raw = edit.execute(input.proposalId, input.approvalToken);
      if (!raw?.ok) fail(raw?.code || 'INK_RECIPE_NATIVE_EXECUTION_FAILED');
      record.phase = 'EXECUTED';
      get(record.sessionId).phase = 'EXECUTED';
      return {
        sessionId: record.sessionId, proposalId: input.proposalId, bindingSha256: record.bindingHash,
        sourceSha256: record.sourceSha256, recipeFingerprint: record.recipeFingerprint,
        documentBefore: record.before, documentAfter: snapshot(app),
        state: 'EXECUTED', nativeExecution: raw.result,
        replay: engine.replayReport() || null,
        originalSourceExecuted: false, authority: 'chatBoundedEditAdapter → Studio RecipeEngine → native History'
      };
    }
  });
}
