import { TranslationAdapterRegistry } from '../source-adapters.js';
import { UniversalProgramImporter } from '../importer.js';
import {
  PHOTOSHOP_ACTION_TEXT_MODULE,
  PHOTOSHOP_ACTION_TEXT_ADAPTER
} from './photoshop-action-text.js';
import {
  FIGMA_SKILL_MARKDOWN_MODULE,
  FIGMA_SKILL_MARKDOWN_ADAPTER
} from './figma-skill-markdown.js';
import {
  CANVA_AUTOFILL_DATASET_MODULE,
  CANVA_AUTOFILL_DATASET_ADAPTER
} from './canva-autofill-dataset.js';
import {
  ILLUSTRATOR_JSX_MODULE,
  ILLUSTRATOR_JSX_ADAPTER,
  ILLUSTRATOR_JSX_CANDIDATE_MATRIX
} from './illustrator-jsx.js';

export {
  PHOTOSHOP_ACTION_TEXT_MODULE,
  PHOTOSHOP_ACTION_TEXT_ADAPTER,
  FIGMA_SKILL_MARKDOWN_MODULE,
  FIGMA_SKILL_MARKDOWN_ADAPTER,
  CANVA_AUTOFILL_DATASET_MODULE,
  CANVA_AUTOFILL_DATASET_ADAPTER,
  ILLUSTRATOR_JSX_MODULE,
  ILLUSTRATOR_JSX_ADAPTER,
  ILLUSTRATOR_JSX_CANDIDATE_MATRIX
};

export const FIRST_PARTY_TRANSLATION_MODULES = Object.freeze([
  PHOTOSHOP_ACTION_TEXT_MODULE,
  FIGMA_SKILL_MARKDOWN_MODULE,
  CANVA_AUTOFILL_DATASET_MODULE,
  ILLUSTRATOR_JSX_MODULE
]);

export function createDefaultTranslationAdapterRegistry() {
  return new TranslationAdapterRegistry(FIRST_PARTY_TRANSLATION_MODULES);
}

export function createFirstPartyProgramImporter(options = {}) {
  const sourceAdapters = options.sourceAdapters || createDefaultTranslationAdapterRegistry();
  return new UniversalProgramImporter({ ...options, sourceAdapters });
}

// Compatibility name retained for #159 callers.
export const createDefaultSourceAdapterRegistry = createDefaultTranslationAdapterRegistry;
