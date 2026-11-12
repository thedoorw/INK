import { validateFloraAction } from './flora-action-validator.js';
import { errorResult } from './flora-action-errors.js';

export class FloraCommandDispatcher {
  constructor(adapter) { this.adapter = adapter; }
  dispatch(action) {
    const before = this.adapter.documentHash(), checked = validateFloraAction(action, this.adapter);
    if (!checked.ok) return errorResult('VALIDATION_FAILED', 'AI Action rejected', { errors: checked.errors, documentHash: before });
    try { return this.adapter.execute(checked.action); }
    catch (error) {
      this.adapter.maskCache?.clear();
      return errorResult('DISPATCH_FAILED', error.message, { documentHash: this.adapter.documentHash(), beforeHash: before });
    }
  }
  dispatchMany(actions) {
    if (!Array.isArray(actions) || !actions.length) return errorResult('BATCH_INVALID', 'Batch must contain actions', { results: [] });
    const app = this.adapter.app, beforeHash = this.adapter.documentHash(), beforeUndo = app.history.undoStack.length,
      beforeRedo = app.history.redoStack.length, beforeMap = new Map(this.adapter.actionObjectMap), results = [];
    app.history.begin(`AI · Atomic batch (${actions.length})`);
    try {
      for (const action of actions) {
        const checked = validateFloraAction(action, this.adapter);
        if (!checked.ok) {
          const error = new Error('Atomic batch validation failed');
          error.validation = { actionId: action?.actionId, errors: checked.errors };
          throw error;
        }
        const result = this.adapter.execute(checked.action, { history: false });
        if (!result.ok) throw new Error(`Atomic action failed: ${action.actionId}`);
        results.push(result);
      }
      app.history.commit();
      app.refreshAll?.(); app.renderer?.render?.();
      return {
        ok: true, atomic: true, results, documentHash: this.adapter.documentHash(),
        historyEntriesAdded: app.history.undoStack.length - beforeUndo
      };
    } catch (error) {
      app.history.cancel({ restore: true });
      app.history.undoStack.splice(beforeUndo); app.history.redoStack.splice(beforeRedo);
      this.adapter.actionObjectMap = beforeMap;
      this.adapter.maskCache?.clear();
      app.refreshAll?.(); app.renderer?.render?.();
      return errorResult('BATCH_ROLLBACK', error.message, {
        ...error.validation, documentHash: this.adapter.documentHash(), beforeHash,
        rolledBack: this.adapter.documentHash() === beforeHash,
        historyUnchanged: app.history.undoStack.length === beforeUndo && app.history.redoStack.length === beforeRedo,
        cacheReset: this.adapter.maskCache?.diagnostics?.().entries === 0
      });
    }
  }
}
