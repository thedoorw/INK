export const INTENT_STATUS = Object.freeze(['READY', 'UNSUPPORTED', 'USER_CHOICE_REQUIRED', 'FULL_REGENERATION_REQUIRED']);

export const INTENT_SUBJECTS = Object.freeze(['flower', 'petal', 'flower-center', 'leaf', 'stem', 'bud', 'background']);
export const INTENT_OPERATIONS = Object.freeze(['create', 'recolor', 'resize', 'move', 'rotate', 'duplicate', 'delete', 'replace', 'adjust-symmetry', 'adjust-count', 'adjust-opacity', 'adjust-stroke', 'adjust-fill', 'rollback']);
export const INTENT_COMPOSITIONS = Object.freeze(['centered', 'slightly-left', 'slightly-right', 'upper', 'lower', 'symmetrical', 'asymmetrical', 'sparse', 'dense', 'cropped', 'full-subject']);
export const INTENT_CONSTRAINTS = Object.freeze(['preserve-all-others', 'preserve-ids', 'preserve-structure', 'preserve-composition', 'preserve-palette', 'preserve-stroke', 'local-edit-only']);

export function emptyIntent(prompt = '') {
  return {
    format: 'INK-STRUCTURED-INTENT', version: '1.0', status: 'READY', prompt,
    language: /[\u3400-\u9fff]/.test(prompt) ? 'zh' : 'en', subjects: [], operations: [],
    composition: [], constraints: [], parameters: {}, observations: [], hypotheses: [],
    decisions: [], unresolvedItems: [], unsupportedItems: [], confidence: 0
  };
}
