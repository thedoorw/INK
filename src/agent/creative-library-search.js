import { isStructuralContainer, walkPageObjects } from '../document/hierarchy.js';

export const INK_CREATIVE_LIBRARY_REF_SCHEMA = 'INK_CREATIVE_LIBRARY_REF';
export const INK_CREATIVE_LIBRARY_REF_VERSION = 1;
export const INK_CREATIVE_LIBRARY_QUERY_SCHEMA = 'INK_CREATIVE_LIBRARY_QUERY_RESULT';
export const INK_CREATIVE_LIBRARY_QUERY_VERSION = 1;

export const INK_CREATIVE_LIBRARY_TYPES = Object.freeze([
  'component',
  'material',
  'recipe',
  'parametric-structure',
  'reference-derived-structure'
]);

export const INK_CREATIVE_LIBRARY_REUSE = Object.freeze({
  AVAILABLE: 'REUSE_AVAILABLE_EXISTING_AUTHORITY',
  READ_ONLY: 'READ_ONLY_NO_ACCEPTED_MUTATION_ROUTE',
  INVALID: 'STALE_OR_INVALID'
});

const TYPE_ORDER = new Map(INK_CREATIVE_LIBRARY_TYPES.map((type, index) => [type, index]));
const MAX_RESULTS = 50;
const DEFAULT_LIMIT = 20;
const MAX_TEXT = 240;

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const text = value => typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';
const normalized = value => text(value).normalize('NFKC').toLocaleLowerCase('en-US');
const fail = (code, details = {}) => {
  throw Object.assign(new Error(code), { code, ...details });
};

function activePage(document) {
  return document?.pages?.find(page => page.id === document.activePageId) || document?.pages?.[0] || null;
}

function normalizeLimit(value) {
  if (value == null) return DEFAULT_LIMIT;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) fail('INK_CREATIVE_LIBRARY_LIMIT_INVALID', { field: 'limit', actual: value });
  return Math.min(number, MAX_RESULTS);
}

function normalizeTypes(value) {
  if (value == null) return [...INK_CREATIVE_LIBRARY_TYPES];
  const list = Array.isArray(value) ? value : [value];
  const selected = new Set();
  for (const item of list) {
    const type = text(item);
    if (!TYPE_ORDER.has(type)) fail('INK_CREATIVE_LIBRARY_TYPE_INVALID', { field: 'types', actual: item });
    selected.add(type);
  }
  return INK_CREATIVE_LIBRARY_TYPES.filter(type => selected.has(type));
}

function boundedStringList(value, limit = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => typeof item === 'string' && item.trim())
    .slice(0, limit)
    .map(item => text(item));
}

function boundedValue(value, depth = 0) {
  if (value == null || typeof value === 'boolean') return value ?? null;
  if (typeof value === 'string') return text(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (depth >= 3) return null;
  if (Array.isArray(value)) return value.slice(0, 12).map(item => boundedValue(item, depth + 1));
  if (record(value)) {
    const entries = Object.entries(value).slice(0, 16);
    return Object.fromEntries(entries.map(([key, item]) => [text(key), boundedValue(item, depth + 1)]));
  }
  return null;
}

function searchableStrings(value, depth = 0) {
  if (value == null || depth >= 4) return [];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.slice(0, 16).flatMap(item => searchableStrings(item, depth + 1));
  if (record(value)) return Object.entries(value).slice(0, 24).flatMap(([key, item]) => [key, ...searchableStrings(item, depth + 1)]);
  return [];
}

function containsComponentInstance(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (value.type === 'component-instance') return true;
  return Object.values(value).some(child => containsComponentInstance(child, seen));
}

function objectIndex(document) {
  const entries = [];
  const byId = new Map();
  for (const page of document?.pages || []) {
    for (const found of walkPageObjects(page)) {
      const entry = { page, ...found };
      entries.push(entry);
      if (typeof found.object?.id === 'string' && found.object.id) {
        if (!byId.has(found.object.id)) byId.set(found.object.id, []);
        byId.get(found.object.id).push(entry);
      }
    }
  }
  return { entries, byId };
}

function objectScope(document, entry) {
  return {
    documentId: document.id || null,
    pageId: entry.page?.id || null,
    layerId: entry.layer?.id || null
  };
}

function makeRef({ type, document, id, source, pageId = null, layerId = null }) {
  return {
    schema: INK_CREATIVE_LIBRARY_REF_SCHEMA,
    version: INK_CREATIVE_LIBRARY_REF_VERSION,
    type,
    scope: {
      documentId: document?.id || null,
      ...(pageId ? { pageId } : {}),
      ...(layerId ? { layerId } : {})
    },
    id: String(id),
    source: String(source)
  };
}

function componentReuse(definitionId, valid) {
  if (!valid) return {
    classification: INK_CREATIVE_LIBRARY_REUSE.INVALID,
    authority: 'document/components.js',
    reason: 'COMPONENT_SOURCE_ROOT_UNAVAILABLE'
  };
  return {
    classification: INK_CREATIVE_LIBRARY_REUSE.AVAILABLE,
    authority: 'document/components.js:createComponentInstance',
    namedTool: 'propose_ink_edit',
    operation: 'component.instance.create.v1',
    arguments: { definitionId }
  };
}

function materialReuse(template) {
  return {
    classification: INK_CREATIVE_LIBRARY_REUSE.AVAILABLE,
    authority: 'material/material-library.js + bounded edit',
    namedTool: 'propose_ink_edit',
    operation: 'path.material.apply.v1',
    arguments: {
      templateId: template.templateId,
      ...(template.templateVersion ? { templateVersion: template.templateVersion } : {})
    }
  };
}

function recipeReuse() {
  return {
    classification: INK_CREATIVE_LIBRARY_REUSE.READ_ONLY,
    authority: 'flora/recipe/painting-recipe-runtime.js',
    reason: 'NO_ACCEPTED_CHAT_USER_GOVERNED_RECIPE_EXECUTION_ENTRYPOINT'
  };
}

function objectCloneReuse(object, source) {
  return {
    classification: INK_CREATIVE_LIBRARY_REUSE.AVAILABLE,
    authority: source,
    namedTool: 'propose_ink_edit',
    operation: 'object.clone.v1',
    targetObjectId: object.id
  };
}

function componentCandidates(document, index) {
  const definitions = Array.isArray(document?.components?.definitions) ? document.components.definitions : [];
  return definitions
    .filter(definition => record(definition) && typeof definition.id === 'string' && definition.id.trim())
    .map(definition => {
      const sourceEntries = index.byId.get(definition.sourceRootId) || [];
      const sourceEntry = sourceEntries.length === 1 ? sourceEntries[0] : null;
      const subtree = sourceEntry
        ? index.entries.filter(entry => entry === sourceEntry || entry.ancestorIds?.includes(sourceEntry.object.id))
        : [];
      const subtreeIds = subtree.map(entry => entry.object?.id).filter(id => typeof id === 'string' && id.trim());
      const sourceValid = Boolean(
        sourceEntry
        && isStructuralContainer(sourceEntry.object)
        && text(definition.name)
        && subtreeIds.length === subtree.length
        && new Set(subtreeIds).size === subtreeIds.length
        && !containsComponentInstance(sourceEntry.object)
      );
      const label = text(definition.name) || text(definition.id);
      const ref = makeRef({
        type: 'component',
        document,
        id: definition.id,
        source: 'document.components.definitions'
      });
      return {
        ref,
        type: 'component',
        label,
        metadata: {
          definitionId: text(definition.id),
          sourceRootId: text(definition.sourceRootId),
          sourceRootPresent: sourceValid
        },
        provenance: {
          source: 'document.components.definitions'
        },
        reuse: componentReuse(definition.id, sourceValid)
      };
    });
}

function materialCandidates(document) {
  const templates = Array.isArray(document?.materialLibrary?.templates) ? document.materialLibrary.templates : [];
  return templates
    .filter(template => record(template) && typeof template.templateId === 'string' && template.templateId.trim())
    .map(template => {
      const templateId = text(template.templateId);
      const templateVersion = text(template.templateVersion);
      const label = text(template.name || template.label || template.semanticRole || templateId) || templateId;
      const stableId = templateVersion ? `${templateId}@${templateVersion}` : templateId;
      const ref = makeRef({
        type: 'material',
        document,
        id: stableId,
        source: 'document.materialLibrary.templates'
      });
      return {
        ref,
        type: 'material',
        label,
        metadata: {
          templateId,
          templateVersion: templateVersion || null,
          materialType: text(template.materialType) || null,
          semanticRole: text(template.semanticRole) || null,
          validationState: boundedValue(template.validationState)
        },
        provenance: {
          source: 'document.materialLibrary.templates',
          sourceBenchmark: boundedValue(template.sourceBenchmark)
        },
        reuse: materialReuse(template)
      };
    });
}

function recipeCandidates(document) {
  const results = [];
  for (const page of document?.pages || []) {
    const recipes = record(page?.floraRecipeState?.recipes) ? page.floraRecipeState.recipes : {};
    for (const [key, entry] of Object.entries(recipes)) {
      if (!record(entry)) continue;
      const recipe = record(entry.recipe) ? entry.recipe : entry;
      const recipeId = text(recipe.recipeId || entry.recipeId || key);
      if (!recipeId) continue;
      const label = text(recipe.metadata?.label || recipe.title || recipe.name || entry.metadata?.label || recipeId) || recipeId;
      const ref = makeRef({
        type: 'recipe',
        document,
        id: recipeId,
        source: 'page.floraRecipeState.recipes',
        pageId: page.id
      });
      results.push({
        ref,
        type: 'recipe',
        label,
        metadata: {
          recipeId,
          schemaVersion: text(recipe.schemaVersion || entry.schemaVersion) || null,
          operation: text(recipe.operation || entry.operation) || null,
          targetRegionId: text(recipe.targetRegionId || entry.targetRegionId) || null,
          palette: boundedStringList(recipe.palette || entry.palette),
          revision: Number.isFinite(Number(entry.revision)) ? Number(entry.revision) : null
        },
        provenance: {
          source: 'page.floraRecipeState.recipes',
          pageId: page.id,
          compileHash: text(entry.compileHash) || null,
          layerId: text(entry.layerId) || null
        },
        reuse: recipeReuse()
      });
    }
  }
  return results;
}

function parametricCandidates(document, index) {
  return index.entries
    .filter(entry => entry.object?.type === 'repeat')
    .map(entry => {
      const object = entry.object;
      const ref = makeRef({
        type: 'parametric-structure',
        document,
        id: object.id,
        source: 'document.page.objects.repeat',
        pageId: entry.page.id,
        layerId: entry.layer.id
      });
      return {
        ref,
        type: 'parametric-structure',
        label: text(object.name) || text(object.id),
        metadata: {
          objectId: text(object.id),
          nativeType: 'repeat',
          mode: text(object.mode) || null,
          count: Number.isFinite(Number(object.count)) ? Number(object.count) : null,
          linked: object.linked !== false,
          sourceObjectId: text(object.sourceObjectId) || null,
          semanticRole: text(object.semanticRole) || null
        },
        provenance: {
          source: 'document.page.objects.repeat',
          extractionReferenceObjectId: text(object.metadata?.extraction?.referenceObjectId || object.metadata?.structureAware?.referenceObjectId) || null
        },
        reuse: objectCloneReuse(object, 'bounded edit object.clone.v1')
      };
    });
}

function isReferenceDerived(object) {
  if (!record(object?.metadata)) return false;
  const decomposition = object.metadata.decomposition;
  const extraction = object.metadata.extraction;
  const structureAware = object.metadata.structureAware;
  return Boolean(
    record(decomposition) && decomposition.referenceObjectId
    || record(extraction) && extraction.referenceObjectId
    || record(structureAware) && structureAware.referenceObjectId
  );
}

function referenceDerivedCandidates(document, index) {
  return index.entries
    .filter(entry => typeof entry.object?.id === 'string' && isReferenceDerived(entry.object))
    .map(entry => {
      const object = entry.object;
      const decomposition = object.metadata?.decomposition || null;
      const extraction = object.metadata?.extraction || null;
      const structureAware = object.metadata?.structureAware || null;
      const referenceObjectId = text(
        decomposition?.referenceObjectId
        || extraction?.referenceObjectId
        || structureAware?.referenceObjectId
      );
      const sourceSha256 = text(
        decomposition?.sourceSha256
        || extraction?.source?.sha256
        || structureAware?.source?.sha256
      );
      const role = text(decomposition?.role) || (object.type === 'repeat' ? 'structure' : 'extracted-object');
      const ref = makeRef({
        type: 'reference-derived-structure',
        document,
        id: object.id,
        source: 'object.metadata.reference-derived',
        pageId: entry.page.id,
        layerId: entry.layer.id
      });
      return {
        ref,
        type: 'reference-derived-structure',
        label: text(object.name) || text(object.id),
        metadata: {
          objectId: text(object.id),
          nativeType: text(object.type) || null,
          role,
          referenceObjectId: referenceObjectId || null,
          batchId: text(decomposition?.batchId || extraction?.batchId) || null,
          sourceColorObjectId: text(decomposition?.sourceColorObjectId) || null
        },
        provenance: {
          source: 'object.metadata.decomposition/extraction/structureAware',
          sourceSha256: sourceSha256 || null,
          sourceName: text(extraction?.source?.name || structureAware?.source?.name || object.metadata?.source?.name) || null
        },
        reuse: objectCloneReuse(object, 'bounded edit object.clone.v1')
      };
    });
}

function allCandidates(document) {
  const index = objectIndex(document);
  return [
    ...componentCandidates(document, index),
    ...materialCandidates(document),
    ...recipeCandidates(document),
    ...parametricCandidates(document, index),
    ...referenceDerivedCandidates(document, index)
  ];
}

function candidateSort(a, b) {
  return (TYPE_ORDER.get(a.type) - TYPE_ORDER.get(b.type))
    || normalized(a.label).localeCompare(normalized(b.label))
    || String(a.ref.id).localeCompare(String(b.ref.id))
    || String(a.ref.scope?.pageId || '').localeCompare(String(b.ref.scope?.pageId || ''))
    || String(a.ref.scope?.layerId || '').localeCompare(String(b.ref.scope?.layerId || ''));
}

function searchableText(item) {
  const pieces = [
    item.type,
    item.label,
    item.ref.id,
    item.metadata,
    item.provenance
  ];
  return pieces
    .flatMap(value => searchableStrings(value))
    .filter(Boolean)
    .map(value => normalized(value))
    .filter(Boolean)
    .join(' ');
}

function matchesQuery(item, query) {
  if (!query) return true;
  return searchableText(item).includes(query);
}

function validateRef(ref, document) {
  if (!record(ref)
      || ref.schema !== INK_CREATIVE_LIBRARY_REF_SCHEMA
      || ref.version !== INK_CREATIVE_LIBRARY_REF_VERSION
      || !TYPE_ORDER.has(ref.type)
      || !record(ref.scope)
      || typeof ref.id !== 'string'
      || !ref.id
      || typeof ref.source !== 'string'
      || !ref.source) {
    fail('INK_CREATIVE_LIBRARY_REF_INVALID', { field: 'ref' });
  }
  if (ref.scope.documentId !== (document?.id || null)) {
    fail('INK_CREATIVE_LIBRARY_REF_STALE', {
      field: 'ref.scope.documentId',
      expected: document?.id || null,
      actual: ref.scope.documentId
    });
  }
}

function sameRef(a, b) {
  return a.schema === b.schema
    && a.version === b.version
    && a.type === b.type
    && a.id === b.id
    && a.source === b.source
    && JSON.stringify(a.scope) === JSON.stringify(b.scope);
}

function inspectRef(document, ref) {
  validateRef(ref, document);
  const candidates = allCandidates(document).filter(item => item.type === ref.type && item.ref.id === ref.id);
  const exact = candidates.filter(item => sameRef(item.ref, ref));
  if (exact.length !== 1) {
    fail('INK_CREATIVE_LIBRARY_REF_STALE', {
      field: 'ref',
      actual: clone(ref),
      matches: exact.length
    });
  }
  return exact[0];
}

export function createCreativeLibrarySearch(app) {
  if (!app?.doc) throw new TypeError('INK Creative Library search requires an app Document');
  return Object.freeze({
    query(input = {}) {
      if (!record(input)) fail('INK_CREATIVE_LIBRARY_INPUT_INVALID');
      const action = text(input.action || 'search');
      if (action === 'search') {
        const query = normalized(input.query || '');
        const types = normalizeTypes(input.types);
        const limit = normalizeLimit(input.limit);
        const typeSet = new Set(types);
        const matched = allCandidates(app.doc)
          .filter(item => typeSet.has(item.type) && matchesQuery(item, query))
          .sort(candidateSort);
        return {
          schema: INK_CREATIVE_LIBRARY_QUERY_SCHEMA,
          version: INK_CREATIVE_LIBRARY_QUERY_VERSION,
          action: 'search',
          query,
          types,
          limit,
          totalMatched: matched.length,
          results: clone(matched.slice(0, limit))
        };
      }
      if (action === 'inspect') {
        const item = inspectRef(app.doc, input.ref);
        return {
          schema: INK_CREATIVE_LIBRARY_QUERY_SCHEMA,
          version: INK_CREATIVE_LIBRARY_QUERY_VERSION,
          action: 'inspect',
          ref: clone(item.ref),
          valid: true,
          item: clone(item)
        };
      }
      fail('INK_CREATIVE_LIBRARY_ACTION_UNSUPPORTED', { field: 'action', actual: action });
    }
  });
}
