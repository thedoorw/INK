import { CHAT_EDIT_OPERATIONS, CHAT_PAGE_OPERATIONS, CHAT_OBJECT_ALIGN_MODES, CHAT_PRECISION_LAYOUT_OPERATIONS, CHAT_MATERIAL_OPERATIONS, CHAT_RECIPE_OPERATIONS, CHAT_SNAP_KEYS, CHAT_ARTBOARD_KEYS, CHAT_PAINT_SESSION_BRUSH_IDS, CHAT_STROKE_KINDS, CHAT_IMAGE_ADJUSTMENT_TYPES, CHAT_IMAGE_FILTER_TYPES, CHAT_IMAGE_BLEND_MODES, CHAT_IMAGE_EFFECT_TYPES, CHAT_IMAGE_LIQUIFY_OPERATION_TYPES, CHAT_IMAGE_LOCAL_RETOUCH_TYPES, CHAT_IMAGE_SOURCE_RETOUCH_TYPES } from '../editor/chat-bounded-edit.js';

export const INK_CAPABILITY_DESCRIPTOR_SCHEMA = 'INK_CAPABILITY_DESCRIPTOR';
export const INK_CAPABILITY_DESCRIPTOR_VERSION = 1;

export const INK_CAPABILITY_INPUT_SCHEMA_KEYWORDS = Object.freeze([
  'type', 'properties', 'required', 'items', 'enum', 'const',
  'minimum', 'maximum', 'minItems', 'maxItems',
  'additionalProperties', 'description', 'default'
]);

export const INK_CAPABILITY_TARGET_TYPES = Object.freeze([
  'Document', 'Page', 'Layer', 'Object', 'Path', 'Image', 'Recipe',
  'ReferenceImage', 'INK_OUTPUT_HANDLE', 'Revision', 'None'
]);

const RESULT_ENVELOPE = 'INK_AGENT_RESULT';
const OUTPUT_HANDLE = 'INK_OUTPUT_HANDLE / 1';

const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) freeze(item);
  return value;
};

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const num = (description, extra = {}) => ({ type: 'number', description, ...extra });
const bool = (description, extra = {}) => ({ type: 'boolean', description, ...extra });
const arr = (items, description, extra = {}) => ({ type: 'array', items, description, ...extra });
const obj = (properties = {}, required = [], description = '', additionalProperties = false) => ({
  type: 'object',
  properties,
  required,
  additionalProperties,
  description
});

const objectRefSchema = obj({
  pageId: str('Stable page id.'),
  layerId: str('Stable layer id.'),
  objectId: str('Stable object id.')
}, ['pageId', 'layerId', 'objectId'], 'Stable INK object reference.');

const bridgeOptionsSchema = obj({
  selectedObjectIds: arr(str('Selected object id.'), 'Optional selected object ids.', { maxItems: 32 }),
  objectIds: arr(str('Focused object id.'), 'Optional focused object ids.', { maxItems: 512 }),
  revisionId: str('Optional revision id.'),
  limits: obj({
    maxObjects: { type: 'integer', minimum: 1, maximum: 512, default: 96, description: 'Maximum object summaries.' },
    maxRelationships: { type: 'integer', minimum: 1, maximum: 1024, default: 192, description: 'Maximum relationship edges.' },
    maxBytes: { type: 'integer', minimum: 1, maximum: 524288, default: 98304, description: 'Maximum JSON payload bytes.' }
  }, [], 'Document Bridge output limits.')
}, [], 'Grounded Document Bridge options.');

const expectedStateSchema = obj({
  documentId: str('Expected document id.'),
  pageId: str('Expected page id.'),
  paperFingerprint: str('Expected active-page paper fingerprint; captured automatically for page.paper.set.v1.'),
  artboardFingerprint: str('Expected active-page artboard fingerprint; captured automatically for page.artboard.set.v1.'),
  precisionFingerprint: str('Expected active-page snap/guides fingerprint; captured automatically for Cluster C3 precision-layout operations.'),
  materialLibraryFingerprint: str('Expected native Document material-library fingerprint for Cluster D material creation.'),
  recipeRegistryFingerprint: str('Expected existing Studio RecipeEngine registry fingerprint for Cluster D recipe execution.'),
  revisionId: str('Expected revision id; omit when not constraining revision.'),
  targetFingerprints: { type: 'object', properties: {}, additionalProperties: true, description: 'Optional target fingerprint map.' }
}, [], 'Optional optimistic-concurrency preconditions.');

const targetArraySchema = arr(objectRefSchema, 'Stable edit targets.', { minItems: 1, maxItems: 64 });

const editTaskSchema = (operationSchema, argumentSchema, maxTargets = 64, minTargets = 1) => obj({
  schema: { type: 'string', const: 'INK-CHAT-EDIT-TASK', default: 'INK-CHAT-EDIT-TASK', description: 'Bounded edit task schema.' },
  version: { type: 'integer', const: 1, default: 1, description: 'Bounded edit task version.' },
  taskId: str('Caller supplied stable task id.'),
  operation: operationSchema,
  targets: { ...targetArraySchema, minItems: minTargets, maxItems: maxTargets },
  arguments: argumentSchema,
  expected: expectedStateSchema
}, ['taskId', 'operation', 'targets', 'arguments'], 'Input accepted by propose_ink_edit / edit.propose.');

const genericEditArguments = { type: 'object', properties: {}, additionalProperties: true, description: 'Operation-specific arguments; inspect the operation descriptor for exact fields.' };

const creativePlanSourceSchema = obj({
  documentId: str('Source document id.'),
  pageId: str('Source page id.'),
  revisionId: { description: 'Source Revision id or null when the document has no captured Revision.' },
  documentFingerprint: str('Exact source document fingerprint.')
}, ['documentId', 'pageId', 'documentFingerprint'], 'Exact Chat Creative Plan source identity.');

const creativePlanStepSchema = obj({
  stepId: str('Stable plan step id.'),
  taskId: str('Optional compatibility task id; the existing plan authority derives its own bounded task identity.'),
  operation: { type: 'string', enum: CHAT_EDIT_OPERATIONS, description: 'Existing bounded-edit operation.' },
  targets: { ...targetArraySchema, minItems: 0 },
  arguments: genericEditArguments,
  dependsOn: arr(str('Earlier step id dependency.'), 'Earlier step dependencies.', { maxItems: 32 })
}, ['stepId', 'operation', 'targets', 'arguments'], 'One existing bounded-edit step in a Chat Creative Plan.');

const creativePlanSchema = obj({
  schema: { type: 'string', const: 'INK-CHAT-CREATIVE-PLAN', default: 'INK-CHAT-CREATIVE-PLAN', description: 'Existing Chat Creative Plan schema.' },
  version: { type: 'integer', const: 1, default: 1, description: 'Existing Chat Creative Plan version.' },
  planId: str('Optional stable plan id; when omitted the existing authority derives it deterministically.'),
  source: creativePlanSourceSchema,
  intentSummary: str('Bounded human-readable plan intent summary.'),
  steps: arr(creativePlanStepSchema, 'Ordered bounded-edit steps.', { minItems: 2, maxItems: 32 })
}, ['intentSummary', 'steps'], 'Existing INK-CHAT-CREATIVE-PLAN / 1 proposal. Source may be omitted so the existing authority can bind current state.');

const useInkSchema = obj({
  action: { type: 'string', enum: ['inspect', 'propose', 'approve', 'execute', 'cancel'], description: 'Programmable composition action.' },
  plan: creativePlanSchema,
  planId: str('Existing Chat Creative Plan id.'),
  approvalToken: str('Explicit plan approval token returned by the existing plan authority.')
}, ['action'], 'Declarative use_ink request. Action-specific fields are validated by the existing Chat Creative Plan authority.');

const editSchemas = {
  'material.template.create.v1': editTaskSchema(
    { type: 'string', const: 'material.template.create.v1', description: 'Create one reusable template in the existing native Document materialLibrary.' },
    obj({
      template: obj({
        templateId: str('Stable material template id; must use the native material-* namespace.'),
        templateVersion: str('Explicit native template version.'),
        materialType: str('Existing material type token.'),
        geometry: { type: 'object', properties: {}, additionalProperties: true, description: 'Existing native Material geometry template. Only native $param/$calc tokens are accepted by the bounded route.' },
        defaultParameters: { type: 'object', properties: {}, additionalProperties: true, description: 'Native template default parameters.' },
        editableParameters: { type: 'object', properties: {}, additionalProperties: true, description: 'Native editable-parameter declarations.' },
        constraints: arr({ type: 'object', properties: {}, additionalProperties: true, description: 'Native material constraint.' }, 'Native material constraints.', { maxItems: 128 }),
        semanticRole: str('Native semantic role.'),
        sourceBenchmark: { type: 'object', properties: {}, additionalProperties: true, description: 'Bounded source/provenance metadata required by the native template authority.' },
        validationState: { type: 'object', properties: {}, additionalProperties: true, description: 'Bounded validation metadata required by the native template authority.' },
        metadata: { type: 'object', properties: {}, additionalProperties: true, description: 'Optional native metadata. metadata.pathAppearance is limited to fill/stroke by the bounded route.' }
      }, ['templateId','templateVersion','materialType','geometry','defaultParameters','editableParameters','constraints','semanticRole','sourceBenchmark','validationState'], 'Existing native Material template payload.')
    }, ['template'], 'Creates a reusable native material template; no second Material engine.'),
    0, 0
  ),
  'material.instance.create.v1': editTaskSchema(
    { type: 'string', const: 'material.instance.create.v1', description: 'Create one native reusable Material instance from an existing template.' },
    obj({
      templateId: str('Existing native material template id.'),
      templateVersion: str('Exact existing template version.'),
      instanceId: str('Optional stable instance id.'),
      instanceKey: str('Optional stable instance key.'),
      name: str('Optional instance name.'),
      layerId: str('Explicit destination layer on the active page.'),
      parameterOverrides: { type: 'object', properties: {}, additionalProperties: true, description: 'Bounded native parameter overrides.' },
      transform: arr(num('Affine matrix coefficient.'), 'Optional six-number affine matrix.', { minItems: 6, maxItems: 6 }),
      semanticRole: str('Optional native semantic role.')
    }, ['templateId','templateVersion','layerId'], 'Existing createMaterialInstance() contract, bounded for CHAT.'),
    0, 0
  ),
  'recipe.studio.execute.v1': editTaskSchema(
    { type: 'string', const: 'recipe.studio.execute.v1', description: 'Execute one already-registered recipe through the existing Studio RecipeEngine under CHAT proposal/approval governance.' },
    obj({
      recipeId: str('Existing registered Studio RecipeEngine recipe id.'),
      recipeVersion: str('Exact recipe version returned by recipe.inventory.'),
      parameters: { type: 'object', properties: {}, additionalProperties: true, description: 'Bounded parameter overrides passed to the existing recipe engine.' },
      roles: arr(str('Explicit role bound by index to the stable target ref at the same position.'), 'Role binding for every target.', { minItems: 1, maxItems: 64 })
    }, ['recipeId','recipeVersion','roles'], 'Existing Studio RecipeEngine execution contract; inline recipes and Workflow IR are not accepted.'),
    64, 1
  ),
  'page.create.v1': editTaskSchema(
    { type: 'string', const: 'page.create.v1', description: 'Create one native page through the existing InkApp.addPage() authority.' },
    obj({}, [], 'No arguments; the native defaultPage() authority determines initial page state.'),
    0, 0
  ),
  'page.duplicate.v1': editTaskSchema(
    { type: 'string', const: 'page.duplicate.v1', description: 'Duplicate one existing native page through InkApp.duplicatePage().' },
    obj({ pageId: str('Stable source page id.') }, ['pageId'], 'Explicit page identity; page/layer/object identities are regenerated by the existing page authority.'),
    0, 0
  ),
  'page.delete.v1': editTaskSchema(
    { type: 'string', const: 'page.delete.v1', description: 'Delete one existing native page through InkApp.deletePage() while preserving the minimum-one-page invariant.' },
    obj({ pageId: str('Stable page id to delete.') }, ['pageId'], 'Explicit page identity.'),
    0, 0
  ),
  'page.rename.v1': editTaskSchema(
    { type: 'string', const: 'page.rename.v1', description: 'Rename one existing native page through existing page-path scoped History.' },
    obj({ pageId: str('Stable page id to rename.'), name: str('New non-empty page name.') }, ['pageId', 'name'], 'Explicit page identity and bounded name.'),
    0, 0
  ),
  'page.activate.v1': editTaskSchema(
    { type: 'string', const: 'page.activate.v1', description: 'Activate one existing native page through InkApp.switchPage(); this is navigation and does not create a History entry.' },
    obj({ pageId: str('Stable page id to activate.') }, ['pageId'], 'Explicit page identity.'),
    0, 0
  ),
  'page.paper.set.v1': editTaskSchema(
    { type: 'string', const: 'page.paper.set.v1', description: 'Set one existing active-page paper field through InkApp.changePaper and scoped History.' },
    obj({
      key: { type: 'string', enum: ['type', 'color', 'gridSize', 'absorbency', 'roughness', 'fiberStrength', 'fiberAngle', 'sizing', 'granulation', 'seed', 'textureVisible'], description: 'Existing page.paper field.' },
      value: { description: 'Field-specific scalar: type=blank/dots/grid/ruled; color=#RRGGBB; gridSize=8..100; fiberAngle=-90..90; seed=uint32; textureVisible=boolean; other profile values=0..1. Validated by the existing bounded edit authority.' }
    }, ['key', 'value'], 'One field per atomic History entry; no-op, unknown fields, active paper preview and stale paper proposals are rejected.'),
    0, 0
  ),
  'page.artboard.set.v1': editTaskSchema(
    { type: 'string', const: 'page.artboard.set.v1', description: 'Set one existing active-page Artboard field through InkApp.changeArtboard() and scoped History.' },
    obj({
      key: { type: 'string', enum: [...CHAT_ARTBOARD_KEYS], description: 'Existing bounded Artboard field.' },
      value: { description: 'Field-specific scalar: orientation=portrait/landscape; ppi=72/96/150/300/600; bleedMm=0..25; safeMarginMm=0..half the shorter Artboard dimension; unit=mm/px; visibility/clip fields=boolean.' }
    }, ['key', 'value'], 'One atomic Artboard mutation; width/height/custom-paper/New Document architecture is intentionally outside this operation.'),
    0, 0
  ),
  'page.snap.set.v1': editTaskSchema(
    { type: 'string', const: 'page.snap.set.v1', description: 'Set one existing active-page snap enable/category boolean through InkApp snap-state wrappers and scoped History.' },
    obj({
      key: { type: 'string', enum: [...CHAT_SNAP_KEYS], description: 'Overall enabled state or one existing native snap category.' },
      value: bool('Boolean snap state.')
    }, ['key', 'value'], 'One atomic snap-state mutation; current scalar tolerance/hysteresis/angleStep values are intentionally not expanded by this package.'),
    0, 0
  ),
  'guide.add.v1': editTaskSchema(
    { type: 'string', const: 'guide.add.v1', description: 'Add one active-page ruler guide through InkApp.addGuide().' },
    obj({
      id: str('Optional caller-supplied stable guide id.'),
      orientation: { type: 'string', enum: ['horizontal', 'vertical'], description: 'Native ruler-guide orientation.' },
      position: num('World-space ruler-guide position.', { minimum: -1000000, maximum: 1000000 }),
      locked: bool('Optional initial lock state.', { default: false }),
      visible: bool('Optional initial visibility.', { default: true })
    }, ['orientation', 'position'], 'Native ruler-guide descriptor; id may be omitted so the existing guide authority derives it.'),
    0, 0
  ),
  'guide.move.v1': editTaskSchema(
    { type: 'string', const: 'guide.move.v1', description: 'Move one existing active-page ruler guide through InkApp.moveGuide().' },
    obj({ guideId: str('Stable guide id.'), position: num('New world-space ruler-guide position.', { minimum: -1000000, maximum: 1000000 }) }, ['guideId', 'position'], 'Explicit guide id and position.'),
    0, 0
  ),
  'guide.remove.v1': editTaskSchema(
    { type: 'string', const: 'guide.remove.v1', description: 'Remove one existing active-page ruler guide through InkApp.removeGuide().' },
    obj({ guideId: str('Stable guide id.') }, ['guideId'], 'Explicit guide id.'),
    0, 0
  ),
  'guide.lock.set.v1': editTaskSchema(
    { type: 'string', const: 'guide.lock.set.v1', description: 'Set one existing ruler guide lock state through InkApp.setGuideLocked().' },
    obj({ guideId: str('Stable guide id.'), locked: bool('Desired lock state.') }, ['guideId', 'locked'], 'Explicit guide id and lock state.'),
    0, 0
  ),
  'guide.visibility.set.v1': editTaskSchema(
    { type: 'string', const: 'guide.visibility.set.v1', description: 'Set one existing ruler guide visibility through InkApp.setGuideVisible().' },
    obj({ guideId: str('Stable guide id.'), visible: bool('Desired visibility state.') }, ['guideId', 'visible'], 'Explicit guide id and visibility state.'),
    0, 0
  ),
  'path.repaint.v1': editTaskSchema(
    { type: 'string', const: 'path.repaint.v1', description: 'Repaint Path appearance.' },
    obj({
      fill: str('Fill paint token.'),
      stroke: str('Stroke paint token.'),
      opacity: num('Opacity.', { minimum: 0, maximum: 1 }),
      expressiveStrokeColor: str('Expressive-stroke color token.')
    }, [], 'At least one of fill, stroke, opacity, or expressiveStrokeColor is required; empty arguments are rejected by the edit authority.'),
    64
  ),
  'path.material.apply.v1': editTaskSchema(
    { type: 'string', const: 'path.material.apply.v1', description: 'Apply material appearance to Path.' },
    obj({
      templateId: str('Material template id.'),
      templateVersion: str('Optional template version.'),
      parameterOverrides: { type: 'object', properties: {}, additionalProperties: true, description: 'Bounded parameter override object.' },
      fallback: obj({ fill: str('Fallback fill.'), stroke: str('Fallback stroke.') }, [], 'Optional fallback appearance.')
    }, ['templateId'], 'Material application arguments.'),
    64
  ),
  'path.material.remove.v1': editTaskSchema(
    { type: 'string', const: 'path.material.remove.v1', description: 'Remove material appearance from Path.' },
    obj({}, [], 'No arguments.', false),
    64
  ),
  'object.translate.v1': editTaskSchema(
    { type: 'string', const: 'object.translate.v1', description: 'Translate editable objects.' },
    obj({ dx: num('World-space X delta.', { minimum: -1000000, maximum: 1000000 }), dy: num('World-space Y delta.', { minimum: -1000000, maximum: 1000000 }) }, ['dx', 'dy'], 'Translation arguments.'),
    64
  ),
  'object.align.v1': editTaskSchema(
    { type: 'string', const: 'object.align.v1', description: 'Align or distribute explicit editable objects through the existing InkApp.alignSelection() and applyWorldTransformBatch() authority.' },
    obj({
      mode: { type: 'string', enum: [...CHAT_OBJECT_ALIGN_MODES], description: 'Existing align/distribute mode.' }
    }, ['mode'], 'Explicit-target alignment/distribution. Alignment requires at least two targets; distribution requires at least three.'),
    64, 2
  ),
  'path.simplify.v1': editTaskSchema(
    { type: 'string', const: 'path.simplify.v1', description: 'Simplify one Path.' },
    obj({
      tolerance: num('Simplification tolerance.', { minimum: 0, maximum: 1000000, default: 0.75 }),
      handleTolerance: num('Handle tolerance.', { minimum: 0, maximum: 1000000 }),
      maxPasses: { type: 'integer', minimum: 1, maximum: 4096, default: 256, description: 'Maximum simplification passes.' }
    }, [], 'Path simplification arguments.'),
    1
  ),
  'path.refine.v1': editTaskSchema(
    { type: 'string', const: 'path.refine.v1', description: 'Refine one Path.' },
    obj({
      maxControlLength: num('Maximum control length; must be greater than zero.', { minimum: Number.EPSILON, maximum: 1000000, default: 48 }),
      maxAddedAnchors: { type: 'integer', minimum: 1, maximum: 4096, default: 128, description: 'Maximum added anchors.' }
    }, [], 'Path refinement arguments.'),
    1
  ),
  'path.create.v1': editTaskSchema(
    { type: 'string', const: 'path.create.v1', description: 'Create one native editable Path or geometric primitive on the active layer.' },
    obj({
      shape: { type: 'string', enum: ['path', 'ellipse', 'circle', 'rectangle', 'polygon', 'polyline'], description: 'Geometry constructor.' },
      objectId: str('Optional caller-supplied stable object id; collisions are rejected.'),
      name: str('Path name.'),
      fill: str('Fill paint token.'),
      stroke: str('Stroke paint token.'),
      strokeWidth: num('Stroke width.', { minimum: 0, maximum: 100000 }),
      opacity: num('Opacity.', { minimum: 0, maximum: 1 }),
      subpaths: arr({ type: 'object', properties: {}, additionalProperties: true, description: 'Subpath with bounded anchors.' }, 'Custom Path subpaths.', { maxItems: 64 }),
      cx: num('Ellipse/circle center X.'), cy: num('Ellipse/circle center Y.'),
      r: num('Circle radius.', { minimum: Number.EPSILON }), rx: num('Ellipse X radius.', { minimum: Number.EPSILON }), ry: num('Ellipse Y radius.', { minimum: Number.EPSILON }),
      x: num('Rectangle X.'), y: num('Rectangle Y.'), width: num('Rectangle width.', { minimum: Number.EPSILON }), height: num('Rectangle height.', { minimum: Number.EPSILON }),
      points: arr(obj({ x: num('Point X.'), y: num('Point Y.') }, ['x', 'y'], 'Point.'), 'Polygon/polyline points.', { maxItems: 4096 })
    }, ['shape'], 'Shape-specific geometry is validated by the bounded edit authority.'),
    0, 0
  ),
  'stroke.create.v1': editTaskSchema(
    { type: 'string', const: 'stroke.create.v1', description: 'Create one native interactive-compatible Stroke on the active layer through existing History, spatial-index, Renderer, and NaturalMediaController authorities.' },
    obj({
      objectId: str('Optional caller-supplied stable stroke object id; collisions are rejected.'),
      name: str('Stroke name.'),
      kind: { type: 'string', enum: [...CHAT_STROKE_KINDS], description: 'Existing native stroke kind. Blender and Smudge are run-only natural-media mixer strokes; Eraser remains a separate targeted operation.' },
      color: str('Stroke color token.'),
      size: num('Native stroke size.', { minimum: .25, maximum: 512, default: 12 }),
      opacity: num('Stroke opacity.', { minimum: 0, maximum: 1, default: 1 }),
      smoothing: num('Stored native smoothing parameter.', { minimum: 0, maximum: .95, default: .5 }),
      pressure: num('Pressure influence.', { minimum: 0, maximum: 1, default: .8 }),
      taper: num('Stroke taper.', { minimum: 0, maximum: 1, default: 0 }),
      grain: num('Stroke grain.', { minimum: 0, maximum: 1, default: 0 }),
      softness: num('Airbrush softness.', { minimum: 0, maximum: 1, default: .7 }),
      flow: num('Natural-media flow.', { minimum: 0, maximum: 1, default: 1 }),
      wetness: num('Natural-media wetness.', { minimum: 0, maximum: 1, default: 0 }),
      bristle: num('Natural-media bristle amount.', { minimum: 0, maximum: 1, default: 0 }),
      blend: num('Blender mixing strength.', { minimum: 0, maximum: 1, default: 0 }),
      smudge: num('Pigment pickup/transport strength.', { minimum: 0, maximum: 1, default: 0 }),
      drag: num('Smudge transport distance factor.', { minimum: 0, maximum: 1, default: 0 }),
      samples: arr(obj({
        x: num('World-space sample X.'),
        y: num('World-space sample Y.'),
        pressure: num('Sample pressure.', { minimum: 0, maximum: 1, default: .5 }),
        timestamp: num('Monotonic sample timestamp in milliseconds.', { minimum: 0, maximum: 1000000000 }),
        tiltX: num('Tilt X degrees.', { minimum: -90, maximum: 90, default: 0 }),
        tiltY: num('Tilt Y degrees.', { minimum: -90, maximum: 90, default: 0 }),
        azimuth: num('Azimuth.', { minimum: -1000, maximum: 1000, default: 0 }),
        altitude: num('Altitude degrees.', { minimum: 0, maximum: 90, default: 90 }),
        twist: num('Pointer twist.', { minimum: -360000, maximum: 360000, default: 0 })
      }, ['x', 'y'], 'One bounded native stroke sample.'), 'World-space samples; at least two are required.', { minItems: 2, maxItems: 4096 })
    }, ['kind', 'samples'], 'Creates the same native type=stroke document object used by interactive drawing. Brush/drybrush/airbrush use existing natural-v2 deposit rendering; Blender/Smudge participate only in contiguous multi-channel runs and mutate existing pigment without depositing their own color.'),
    0, 0
  ),
  'stroke.erase.circle.v1': editTaskSchema(
    { type: 'string', const: 'stroke.erase.circle.v1', description: 'Erase explicit native Stroke targets with one bounded world-space circle through the existing eraseStrokeWithCircle() geometry authority.' },
    obj({
      x: num('World-space eraser center X.'),
      y: num('World-space eraser center Y.'),
      radius: num('World-space eraser radius.', { minimum: Number.EPSILON, maximum: 1000000 })
    }, ['x', 'y', 'radius'], 'Targeted Eraser geometry. No hit-test, pointer simulation, or area-wide target discovery is performed.'),
    64, 1
  ),
  'paint.session.create.v1': editTaskSchema(
    { type: 'string', const: 'paint.session.create.v1', description: 'Create one native deterministic Paint / Stroke Session on the active layer through the existing Brush Engine and Stroke Session authority.' },
    obj({
      objectId: str('Optional caller-supplied stable paint-session object id; collisions are rejected.'),
      name: str('Paint Session name.'),
      seed: { type: 'integer', minimum: 0, maximum: 4294967295, default: 1, description: 'Deterministic session seed.' },
      opacity: num('Paint Session object opacity.', { minimum: 0, maximum: 1, default: 1 }),
      strokes: arr(obj({
        id: str('Optional stable stroke id inside the session.'),
        brushId: { type: 'string', enum: [...CHAT_PAINT_SESSION_BRUSH_IDS], description: 'Accepted existing built-in Brush Engine preset. Blender, Smudge, and Eraser remain excluded until their render integration is separately qualified.' },
        color: str('Stroke color token.'),
        seed: { type: 'integer', minimum: 0, maximum: 4294967295, description: 'Optional deterministic stroke seed.' },
        samples: arr(obj({
          x: num('World-space sample X.'),
          y: num('World-space sample Y.'),
          pressure: num('Pressure.', { minimum: 0, maximum: 1, default: .5 }),
          timestamp: num('Monotonic sample timestamp in milliseconds.', { minimum: 0, maximum: 1000000000 }),
          tiltX: num('Tilt X degrees.', { minimum: -90, maximum: 90, default: 0 }),
          tiltY: num('Tilt Y degrees.', { minimum: -90, maximum: 90, default: 0 }),
          azimuth: num('Azimuth.', { minimum: -1000, maximum: 1000, default: 0 }),
          altitude: num('Altitude degrees.', { minimum: 0, maximum: 90, default: 90 })
        }, ['x', 'y'], 'One deterministic stroke sample.'), 'Stroke samples; at least two are required.', { minItems: 2, maxItems: 4096 })
      }, ['brushId', 'samples'], 'One existing Brush Engine stroke.'), 'Bounded Paint Session strokes.', { minItems: 1, maxItems: 64 })
    }, ['strokes'], 'Total samples are bounded to 16,384. Uses existing StrokeSessionRecorder → replayStrokeSession → History/Renderer authority.'),
    0, 0
  ),
  'image.adjustment.add.v1': editTaskSchema(
    { type: 'string', const: 'image.adjustment.add.v1', description: 'Append one existing non-destructive adjustment to an editable raster image.' },
    obj({
      type: { type: 'string', enum: [...CHAT_IMAGE_ADJUSTMENT_TYPES], description: 'Qualified existing adjustment type.' },
      params: { type: 'object', properties: {}, additionalProperties: true, description: 'Structurally bounded existing adjustment parameters; maximum 8 KiB / depth 4 / 64 keys.' },
      opacity: num('Adjustment opacity.', { minimum: 0, maximum: 1, default: 1 })
    }, ['type'], 'Existing image-core createAdjustment() arguments.'),
    1
  ),
  'image.filter.add.v1': editTaskSchema(
    { type: 'string', const: 'image.filter.add.v1', description: 'Append one existing non-destructive filter to an editable raster image.' },
    obj({
      type: { type: 'string', enum: [...CHAT_IMAGE_FILTER_TYPES], description: 'Qualified existing filter type.' },
      params: { type: 'object', properties: {}, additionalProperties: true, description: 'Structurally bounded existing filter parameters; maximum 8 KiB / depth 4 / 64 keys.' },
      opacity: num('Filter opacity.', { minimum: 0, maximum: 1, default: 1 })
    }, ['type'], 'Existing image-core createFilter() arguments.'),
    1
  ),
  'image.blend.set.v1': editTaskSchema(
    { type: 'string', const: 'image.blend.set.v1', description: 'Set the existing native image blendMode through bounded History mutation.' },
    obj({
      mode: { type: 'string', enum: [...CHAT_IMAGE_BLEND_MODES], description: 'Existing supported image blend mode.' }
    }, ['mode'], 'Existing image blendMode argument.'),
    1
  ),
  'image.effect.add.v1': editTaskSchema(
    { type: 'string', const: 'image.effect.add.v1', description: 'Append one existing native layer effect to an editable raster image.' },
    obj({
      type: { type: 'string', enum: [...CHAT_IMAGE_EFFECT_TYPES], description: 'Existing supported layer effect type.' },
      params: { type: 'object', properties: {}, additionalProperties: true, description: 'Structurally bounded existing effect parameters; maximum 8 KiB / depth 4 / 64 keys.' },
      opacity: num('Effect opacity.', { minimum: 0, maximum: 1, default: 1 })
    }, ['type'], 'Existing image-core createLayerEffect() arguments.'),
    1
  ),
  'image.raster.spotHeal.v1': editTaskSchema(
    { type: 'string', const: 'image.raster.spotHeal.v1', description: 'Apply one bounded Spot Healing edit to an editable native 8-bit RGB raster through the existing spotHealing() pixel authority.' },
    obj({
      x: num('Raster-local target X.', { minimum: 0, maximum: 1000000 }),
      y: num('Raster-local target Y.', { minimum: 0, maximum: 1000000 }),
      radius: num('Healing brush radius.', { minimum: Number.EPSILON, maximum: 512, default: 12 }),
      opacity: num('Healing opacity.', { minimum: 0, maximum: 1, default: 1 }),
      hardness: num('Healing brush hardness.', { minimum: 0, maximum: 1, default: .85 }),
      neighborRadius: { type: 'integer', minimum: 1, maximum: 64, default: 2, description: 'Neighbor search radius used by existing Spot Healing authority.' }
    }, ['x','y'], 'One-shot structured local retouch. No pointer stroke or raw mask is accepted.'),
    1
  ),
  'image.raster.localRetouch.v1': editTaskSchema(
    { type: 'string', const: 'image.raster.localRetouch.v1', description: 'Apply one bounded non-source local destructive retouch edit to an editable native 8-bit RGB raster through existing raster-retouch algorithms.' },
    obj({
      type: { type: 'string', enum: [...CHAT_IMAGE_LOCAL_RETOUCH_TYPES], description: 'Qualified non-source local retouch family. Spot Healing is a separate operation; Clone/Healing/Patch/Pattern Stamp are excluded.' },
      x: num('Raster-local center X.', { minimum: 0, maximum: 1000000 }),
      y: num('Raster-local center Y.', { minimum: 0, maximum: 1000000 }),
      radius: num('Local brush radius.', { minimum: Number.EPSILON, maximum: 512, default: 18 }),
      hardness: num('Local brush hardness.', { minimum: 0, maximum: 1, default: .85 }),
      strength: num('Dodge/Burn/Sponge/Local Blur/Color Replacement strength.', { minimum: 0, maximum: 1, default: .55 }),
      mode: { type: 'string', enum: ['saturate','desaturate'], default: 'saturate', description: 'Sponge mode.' },
      kernelRadius: { type: 'integer', minimum: 1, maximum: 16, default: 2, description: 'Local Blur/Sharpen sampling radius.' },
      amount: num('Local Sharpen amount.', { minimum: 0, maximum: 4, default: 1 }),
      replacementColor: str('Color Replacement target hue/saturation as #RRGGBB or #RRGGBBAA. Required when type=colorReplacement.'),
      referenceColor: str('Optional Color Replacement reference color; defaults to center pixel.'),
      tolerance: num('Color Replacement tolerance.', { minimum: 0, maximum: 255, default: 32 })
    }, ['type','x','y'], 'One-shot raster-local retouch. Tool-specific parameters are validated by the bounded edit normalizer; raw masks, pointer strokes and source-point inference are not accepted.'),
    1
  ),
  'image.raster.sourceRetouch.v1': editTaskSchema(
    { type: 'string', const: 'image.raster.sourceRetouch.v1', description: 'Apply one bounded source-dependent destructive retouch edit to one editable native 8-bit RGB raster through existing Clone Stamp / Healing Brush / Patch pixel authorities.' },
    obj({
      type: { type: 'string', enum: [...CHAT_IMAGE_SOURCE_RETOUCH_TYPES], description: 'Qualified source-dependent retouch family. Pattern Stamp remains excluded until a separate pattern-asset contract is defined.' },
      sourceX: num('Raster-local source X for Clone Stamp / Healing Brush.', { minimum: 0, maximum: 1000000 }),
      sourceY: num('Raster-local source Y for Clone Stamp / Healing Brush.', { minimum: 0, maximum: 1000000 }),
      targetX: num('Raster-local target X for Clone Stamp / Healing Brush.', { minimum: 0, maximum: 1000000 }),
      targetY: num('Raster-local target Y for Clone Stamp / Healing Brush.', { minimum: 0, maximum: 1000000 }),
      radius: num('Clone / Healing brush radius.', { minimum: Number.EPSILON, maximum: 512, default: 18 }),
      opacity: num('Retouch opacity.', { minimum: 0, maximum: 1, default: 1 }),
      hardness: num('Clone / Healing brush hardness.', { minimum: 0, maximum: 1, default: .85 }),
      sourceRegion: obj({
        x: num('Raster-local source-region X.', { minimum: 0, maximum: 1000000 }),
        y: num('Raster-local source-region Y.', { minimum: 0, maximum: 1000000 }),
        width: num('Source-region width.', { minimum: Number.EPSILON, maximum: 1000000 }),
        height: num('Source-region height.', { minimum: Number.EPSILON, maximum: 1000000 })
      }, ['x','y','width','height'], 'Patch source region.'),
      targetRegion: obj({
        x: num('Raster-local target-region X.', { minimum: 0, maximum: 1000000 }),
        y: num('Raster-local target-region Y.', { minimum: 0, maximum: 1000000 }),
        width: num('Target-region width.', { minimum: Number.EPSILON, maximum: 1000000 }),
        height: num('Target-region height.', { minimum: Number.EPSILON, maximum: 1000000 })
      }, ['x','y','width','height'], 'Patch target region; dimensions must exactly match sourceRegion.'),
      feather: num('Patch edge feather.', { minimum: 0, maximum: 512, default: 0 })
    }, ['type'], 'Explicit raster-local source contract only. Clone/Healing require sourceX/sourceY/targetX/targetY; Patch requires equal-sized sourceRegion/targetRegion. No pointer gestures, source inference, cross-image source, raw mask or pattern payload is accepted.'),
    1
  ),
  'image.mask.raster.set.v1': editTaskSchema(
    { type: 'string', const: 'image.mask.raster.set.v1', description: 'Set one native raster mask on an editable image from bounded raster-local geometry through the existing rasterizePathMask()/renderImageStack() authority.' },
    obj({
      shape: { type: 'string', enum: ['rectangle'], default: 'rectangle', description: 'Initial bounded geometry family.' },
      x: num('Raster-local rectangle X.', { minimum: 0, maximum: 1000000 }),
      y: num('Raster-local rectangle Y.', { minimum: 0, maximum: 1000000 }),
      width: num('Rectangle width.', { minimum: Number.EPSILON, maximum: 1000000 }),
      height: num('Rectangle height.', { minimum: Number.EPSILON, maximum: 1000000 }),
      invert: bool('Invert mask.', { default: false }),
      feather: num('Existing mask feather radius.', { minimum: 0, maximum: 256, default: 0 }),
      expand: { type: 'integer', minimum: -256, maximum: 256, default: 0, description: 'Existing mask expand/contract amount.' }
    }, ['x','y','width','height'], 'Bounded raster-mask geometry. Raw alpha pixel arrays are not accepted from CHAT.'),
    1
  ),
  'image.raster.paintBucket.v1': editTaskSchema(
    { type: 'string', const: 'image.raster.paintBucket.v1', description: 'Destructively fill one bounded region of an editable native 8-bit RGB raster image through the existing paintBucketFill() pixel authority.' },
    obj({
      x: num('Raster-local seed X.', { minimum: 0, maximum: 1000000 }),
      y: num('Raster-local seed Y.', { minimum: 0, maximum: 1000000 }),
      color: str('Fill color as #RRGGBB or #RRGGBBAA.'),
      tolerance: num('Existing magic-wand color tolerance.', { minimum: 0, maximum: 255, default: 0 }),
      contiguous: bool('Limit fill to the connected seed region.', { default: true }),
      opacity: num('Fill opacity.', { minimum: 0, maximum: 1, default: 1 })
    }, ['x','y','color'], 'Raster-local Paint Bucket arguments. The seed must fall within the raster dimensions at execution time.'),
    1
  ),
  'image.liquify.add.v1': editTaskSchema(
    { type: 'string', const: 'image.liquify.add.v1', description: 'Append one existing native Liquify filter to an editable raster image.' },
    obj({
      operations: arr(obj({
        type: { type: 'string', enum: [...CHAT_IMAGE_LIQUIFY_OPERATION_TYPES], description: 'Existing Liquify operation type.' },
        x: num('Raster-space center X.'),
        y: num('Raster-space center Y.'),
        radius: num('Operation radius.', { minimum: 1, maximum: 1000000, default: 32 }),
        strength: num('Operation strength.', { minimum: -1, maximum: 1, default: .5 }),
        dx: num('Forward-warp X displacement.'),
        dy: num('Forward-warp Y displacement.'),
        angle: num('Optional angle in degrees.', { minimum: -360000, maximum: 360000 })
      }, ['type','x','y'], 'One bounded existing Liquify operation.'), 'Liquify operations.', { minItems: 1, maxItems: 32 }),
      opacity: num('Liquify filter opacity.', { minimum: 0, maximum: 1, default: 1 }),
      maxWork: { type: 'integer', minimum: 1, maximum: 50000000, description: 'Optional existing Liquify work ceiling.' }
    }, ['operations'], 'Existing image-core createLiquifyFilter() arguments. Freeze-mask pixel arrays are intentionally excluded.'),
    1
  ),
  'path.warp.v1': editTaskSchema(
    { type: 'string', const: 'path.warp.v1', description: 'Apply the existing reversible native bend-x deformation to one editable Path.' },
    obj({
      strength: num('Normalized warp strength.', { minimum: -1, maximum: 1 }),
      maxDisplacement: num('Maximum normalized horizontal displacement ratio.', { minimum: 0, maximum: .5, default: .5 })
    }, ['strength'], 'Existing createWarpDeformationPlan() arguments. Zero-effective warp is rejected as NO_OP.'),
    1
  ),
  'path.distort.v1': editTaskSchema(
    { type: 'string', const: 'path.distort.v1', description: 'Apply the existing native projective Distort transform to one editable Path.' },
    obj({
      xOffset: num('Local-space top-left / bottom-right X corner offset.', { minimum: -1000000, maximum: 1000000, default: 0 }),
      yOffset: num('Local-space top-right / bottom-left Y corner offset.', { minimum: -1000000, maximum: 1000000, default: 0 })
    }, [], 'Existing createDistortTransform() corner-offset route. Both offsets zero is rejected as NO_OP.'),
    1
  ),
  'path.perspective.v1': editTaskSchema(
    { type: 'string', const: 'path.perspective.v1', description: 'Apply the existing native projective Perspective transform to one editable Path.' },
    obj({
      xOffset: num('Local-space top-left / bottom-right X corner offset.', { minimum: -1000000, maximum: 1000000, default: 0 }),
      yOffset: num('Local-space top-right / bottom-left Y corner offset.', { minimum: -1000000, maximum: 1000000, default: 0 })
    }, [], 'Existing createPerspectiveTransform() corner-offset route. Both offsets zero is rejected as NO_OP.'),
    1
  ),
  'path.edit.v1': editTaskSchema(
    { type: 'string', const: 'path.edit.v1', description: 'Edit one Path through the existing PathEditController.' },
    obj({
      action: { type: 'string', enum: ['move-anchor', 'move-handle', 'set-anchor-mode', 'add-anchor', 'delete-anchors', 'set-subpath-closed'], description: 'Bounded Path edit action.' },
      subpathIndex: { type: 'integer', minimum: 0, maximum: 4096, description: 'Subpath index.' },
      anchorIndex: { type: 'integer', minimum: 0, maximum: 4096, description: 'Anchor index.' },
      segmentIndex: { type: 'integer', minimum: 0, maximum: 4096, description: 'Segment index.' },
      side: { type: 'string', enum: ['in', 'out'], description: 'Bezier handle side.' },
      mode: { type: 'string', enum: ['corner', 'smooth', 'symmetric'], description: 'Anchor mode.' },
      x: num('Geometry X / handle-vector X.'), y: num('Geometry Y / handle-vector Y.'),
      t: num('Segment split parameter.', { minimum: Number.EPSILON, maximum: 1 - Number.EPSILON }),
      anchors: arr(obj({
        subpathIndex: { type: 'integer', minimum: 0, maximum: 4096, description: 'Subpath index.' },
        anchorIndex: { type: 'integer', minimum: 0, maximum: 4096, description: 'Anchor index.' }
      }, ['subpathIndex', 'anchorIndex'], 'Anchor ref.'), 'Anchors to delete.', { maxItems: 512 }),
      closed: bool('Desired subpath closed state.')
    }, ['action'], 'Action-specific fields are validated by the Path edit authority.'),
    1
  ),
  'object.rotate.v1': editTaskSchema(
    { type: 'string', const: 'object.rotate.v1', description: 'Rotate editable objects in world space.' },
    obj({
      degrees: num('Rotation in degrees.', { minimum: -360000, maximum: 360000 }),
      center: obj({ x: num('World-space center X.'), y: num('World-space center Y.') }, ['x', 'y'], 'Optional explicit world-space rotation center.')
    }, ['degrees'], 'Rotation arguments.'),
    64
  ),
  'object.clone.v1': editTaskSchema(
    { type: 'string', const: 'object.clone.v1', description: 'Clone one object with fresh stable identity and composition lineage.' },
    obj({ dx: num('Optional local X offset.'), dy: num('Optional local Y offset.') }, [], 'Clone arguments.'),
    1
  ),
  'repeat.radial.v1': editTaskSchema(
    { type: 'string', const: 'repeat.radial.v1', description: 'Create one native editable radial Repeat from one source object.' },
    obj({
      count: { type: 'integer', minimum: 2, maximum: 720, description: 'Instance count.' },
      center: obj({ x: num('World-space repeat center X.'), y: num('World-space repeat center Y.') }, ['x', 'y'], 'Repeat center.'),
      sweep: num('Sweep angle in degrees.', { default: 360 }),
      startAngle: num('Start angle in degrees.', { default: 0 }),
      linked: bool('Keep native Repeat linked.', { default: true })
    }, ['count', 'center'], 'Radial Repeat arguments.'),
    1
  ),
  'boolean.apply.v1': editTaskSchema(
    { type: 'string', const: 'boolean.apply.v1', description: 'Apply native editable Boolean geometry to 2+ same-parent Paths.' },
    obj({
      operation: { type: 'string', enum: ['union', 'difference', 'intersection', 'xor', 'divide'], description: 'Boolean operation.' },
      name: str('Optional result name.'),
      tolerance: num('Geometry flattening/refit tolerance.', { minimum: Number.EPSILON, default: 0.65 })
    }, ['operation'], 'Boolean arguments.'),
    64, 2
  ),
  'group.create.v1': editTaskSchema(
    { type: 'string', const: 'group.create.v1', description: 'Group same-parent objects while preserving world appearance.' },
    obj({ name: str('Group name.') }, [], 'Group arguments.'),
    64
  ),
  'object.reparent.v1': editTaskSchema(
    { type: 'string', const: 'object.reparent.v1', description: 'Reparent one object through the native hierarchy authority.' },
    obj({
      parentObjectId: str('Target Frame object id; omit/null for layer root.'),
      targetLayerId: str('Optional target layer id; native hierarchy rules reject invalid cross-layer moves.'),
      index: { type: 'integer', minimum: 0, description: 'Optional insertion index.' }
    }, [], 'Reparent arguments.'),
    1
  ),
  'frame.create.v1': editTaskSchema(
    { type: 'string', const: 'frame.create.v1', description: 'Create one empty native Frame on the active layer.' },
    obj({
      name: str('Frame name.'),
      x: num('World X position.'),
      y: num('World Y position.'),
      width: num('Frame width.', { minimum: Number.EPSILON, maximum: 1000000, default: 320 }),
      height: num('Frame height.', { minimum: Number.EPSILON, maximum: 1000000, default: 240 }),
      opacity: num('Opacity.', { minimum: 0, maximum: 1, default: 1 })
    }, [], 'Native Frame constructor arguments.'),
    0, 0
  ),
  'text.create.v1': editTaskSchema(
    { type: 'string', const: 'text.create.v1', description: 'Create one native Text object using the editor Text object authority.' },
    obj({
      text: str('Text content.'),
      x: num('World X position.'),
      y: num('World Y position.'),
      opacity: num('Opacity.', { minimum: 0, maximum: 1, default: 1 }),
      color: str('Text color token.'),
      fontFamily: str('Existing font-family value.'),
      fontSize: num('Font size.', { minimum: Number.EPSILON, maximum: 10000 }),
      lineHeight: num('Line-height multiplier.', { minimum: Number.EPSILON, maximum: 20 }),
      fontWeight: num('Existing numeric font weight.', { minimum: 1, maximum: 1000 })
    }, ['text'], 'Bounded Text creation arguments.'),
    0, 0
  ),
  'text.edit.v1': editTaskSchema(
    { type: 'string', const: 'text.edit.v1', description: 'Edit the accepted native Text field subset on one Text object.' },
    obj({
      text: str('Text content.'),
      x: num('World X position.'),
      y: num('World Y position.'),
      opacity: num('Opacity.', { minimum: 0, maximum: 1 }),
      color: str('Text color token.'),
      fontFamily: str('Existing font-family value.'),
      fontSize: num('Font size.', { minimum: Number.EPSILON, maximum: 10000 }),
      lineHeight: num('Line-height multiplier.', { minimum: Number.EPSILON, maximum: 20 }),
      fontWeight: num('Existing numeric font weight.', { minimum: 1, maximum: 1000 })
    }, [], 'At least one accepted Text field is required.'),
    1
  ),
  'text.path.set.v1': editTaskSchema(
    { type: 'string', const: 'text.path.set.v1', description: 'Attach one native editable Text object to one explicit native Path for curved/path-text rendering.' },
    obj({
      pathRef: objectRefSchema,
      startOffset: num('Non-negative distance from the Path start to the first glyph advance.', { minimum: 0, maximum: 1000000, default: 0 }),
      overflow: { type: 'string', enum: ['clip'], default: 'clip', description: 'Initial bounded path overflow mode; clip is the only CHAT-qualified mode.' }
    }, ['pathRef'], 'The Text remains type:text. Text and Path must resolve in the same native layer/container; the Path is referenced, not mutated or converted.'),
    1
  ),
  'svg.import.v1': editTaskSchema(
    { type: 'string', const: 'svg.import.v1', description: 'Import bounded raw SVG through the native structured SVG parser.' },
    obj({
      svg: str('Raw SVG source string; maximum length and unsafe execution/network forms are rejected by the bounded authority.')
    }, ['svg'], 'Local raw SVG only; no URL fetch or external transport.'),
    0, 0
  ),
  'object.resize.v1': editTaskSchema(
    { type: 'string', const: 'object.resize.v1', description: 'Resize one object to an absolute world-space width and/or height using existing transform/bounds authority.' },
    obj({
      width: num('Absolute width.', { minimum: Number.EPSILON, maximum: 1000000 }),
      height: num('Absolute height.', { minimum: Number.EPSILON, maximum: 1000000 }),
      preserveAspect: bool('Preserve aspect when only one dimension is supplied.', { default: false })
    }, [], 'At least one of width or height is required.'),
    1
  ),
  'object.scale.v1': editTaskSchema(
    { type: 'string', const: 'object.scale.v1', description: 'Apply bounded world-space scale through Matrix/applyWorldTransformBatch.' },
    obj({
      sx: num('World-space X scale.', { minimum: -10000, maximum: 10000 }),
      sy: num('World-space Y scale; defaults to sx.', { minimum: -10000, maximum: 10000 }),
      center: obj({ x: num('World-space center X.'), y: num('World-space center Y.') }, ['x', 'y'], 'Optional explicit scale center.')
    }, ['sx'], 'Scale components must remain finite and non-singular.'),
    64
  ),
  'object.order.v1': editTaskSchema(
    { type: 'string', const: 'object.order.v1', description: 'Move same-parent objects to the front or back of the existing parent array.' },
    obj({
      action: { type: 'string', enum: ['front', 'back'], description: 'Existing native ordering action.' }
    }, ['action'], 'C2-A ordering is limited to current front/back semantics.'),
    64
  ),
  'repeat.mirror.v1': editTaskSchema(
    { type: 'string', const: 'repeat.mirror.v1', description: 'Create one native mirror Repeat adjacent to the source object.' },
    obj({
      axis: { type: 'string', enum: ['x', 'y'], default: 'y', description: 'Existing mirror axis.' },
      center: obj({ x: num('World-space mirror center X.'), y: num('World-space mirror center Y.') }, ['x', 'y'], 'Optional explicit world-space mirror center.'),
      linked: bool('Preserve existing linked Repeat semantics.', { default: true })
    }, [], 'Existing createRepeat(mode=mirror) arguments.'),
    1
  ),
  'repeat.grid.v1': editTaskSchema(
    { type: 'string', const: 'repeat.grid.v1', description: 'Create one native procedural grid Repeat adjacent to the source object.' },
    obj({
      columns: { type: 'integer', minimum: 1, maximum: 64, description: 'Repeat columns.' },
      rows: { type: 'integer', minimum: 1, maximum: 64, description: 'Repeat rows.' },
      dx: num('Existing X spacing.', { minimum: -100000, maximum: 100000 }),
      dy: num('Existing Y spacing.', { minimum: -100000, maximum: 100000 }),
      linked: bool('Preserve existing linked Repeat semantics.', { default: true })
    }, ['columns', 'rows'], 'Existing createRepeat(mode=grid) arguments; total instances are additionally bounded by the edit authority.'),
    1
  ),
  'layout.frame.set.v1': editTaskSchema(
    { type: 'string', const: 'layout.frame.set.v1', description: 'Set existing INK-LAYOUT-1 metadata on one native Frame.' },
    obj({
      mode: { type: 'string', enum: ['manual', 'horizontal', 'vertical'], default: 'manual', description: 'Existing FrameLayout mode.' },
      gap: num('Gap.', { minimum: 0, maximum: 1000000, default: 0 }),
      padding: obj({
        top: num('Top padding.', { minimum: 0, maximum: 1000000, default: 0 }),
        right: num('Right padding.', { minimum: 0, maximum: 1000000, default: 0 }),
        bottom: num('Bottom padding.', { minimum: 0, maximum: 1000000, default: 0 }),
        left: num('Left padding.', { minimum: 0, maximum: 1000000, default: 0 })
      }, [], 'Existing FrameLayout padding.'),
      align: obj({
        main: { type: 'string', enum: ['start', 'center', 'end', 'space-between'], default: 'start', description: 'Main-axis alignment.' },
        cross: { type: 'string', enum: ['start', 'center', 'end', 'stretch'], default: 'start', description: 'Cross-axis alignment.' }
      }, [], 'Existing FrameLayout alignment.'),
      sizing: obj({
        horizontal: { type: 'string', enum: ['fixed', 'hug'], default: 'fixed', description: 'Horizontal Frame sizing.' },
        vertical: { type: 'string', enum: ['fixed', 'hug'], default: 'fixed', description: 'Vertical Frame sizing.' }
      }, [], 'Existing FrameLayout sizing.')
    }, [], 'Existing INK-LAYOUT-1 metadata only.'),
    1
  ),
  'layout.frame.remove.v1': editTaskSchema(
    { type: 'string', const: 'layout.frame.remove.v1', description: 'Remove existing FrameLayout metadata from one native Frame.' },
    obj({}, [], 'No arguments.', false),
    1
  ),
  'layout.item.set.v1': editTaskSchema(
    { type: 'string', const: 'layout.item.set.v1', description: 'Set existing INK-LAYOUT-ITEM-1 metadata on one current Frame child.' },
    obj({
      participation: { type: 'string', enum: ['flow', 'absolute'], default: 'flow', description: 'Existing participation mode.' },
      sizing: obj({
        horizontal: { type: 'string', enum: ['fixed', 'fill', 'hug'], default: 'hug', description: 'Horizontal child sizing.' },
        vertical: { type: 'string', enum: ['fixed', 'fill', 'hug'], default: 'hug', description: 'Vertical child sizing.' }
      }, [], 'Existing LayoutItem sizing.'),
      fixedSize: obj({
        width: num('Fixed width.', { minimum: 0, maximum: 1000000, default: 1 }),
        height: num('Fixed height.', { minimum: 0, maximum: 1000000, default: 1 })
      }, [], 'Existing fixed size metadata.'),
      constraints: obj({
        horizontal: { type: 'string', enum: ['start', 'end', 'center', 'scale', 'stretch'], default: 'start', description: 'Horizontal constraint.' },
        vertical: { type: 'string', enum: ['start', 'end', 'center', 'scale', 'stretch'], default: 'start', description: 'Vertical constraint.' }
      }, [], 'Existing resize constraints.')
    }, [], 'Existing INK-LAYOUT-ITEM-1 metadata only.'),
    1
  ),
  'layout.item.remove.v1': editTaskSchema(
    { type: 'string', const: 'layout.item.remove.v1', description: 'Remove existing LayoutItem metadata from one current Frame child.' },
    obj({}, [], 'No arguments.', false),
    1
  ),
  'component.register.v1': editTaskSchema(
    { type: 'string', const: 'component.register.v1', description: 'Register one existing structural container as a native Component Definition.' },
    obj({ name: str('Component definition name.') }, ['name'], 'Existing registerComponentDefinition arguments.'),
    1
  ),
  'component.instance.create.v1': editTaskSchema(
    { type: 'string', const: 'component.instance.create.v1', description: 'Create one native Component Instance from an existing definition.' },
    obj({
      definitionId: str('Existing Component Definition id.'),
      pageId: str('Destination active page id.'),
      layerId: str('Destination layer id on the active page.'),
      parentId: str('Optional structural parent id.'),
      matrix: arr(num('Affine matrix component.'), 'Optional existing six-number affine matrix.', { minItems: 6, maxItems: 6 })
    }, ['definitionId', 'pageId', 'layerId'], 'Existing createComponentInstance placement contract.'),
    0, 0
  ),
  'component.override.set.v1': editTaskSchema(
    { type: 'string', const: 'component.override.set.v1', description: 'Set the existing opacity override on one Component Instance source node.' },
    obj({
      sourceNodeId: str('Source node id from the linked Component Definition.'),
      opacity: num('Existing supported opacity override.', { minimum: 0, maximum: 1 })
    }, ['sourceNodeId', 'opacity'], 'Only opacity override is supported in the current Component contract.'),
    1
  ),
  'component.override.reset.v1': editTaskSchema(
    { type: 'string', const: 'component.override.reset.v1', description: 'Reset one existing Component Instance source-node override.' },
    obj({ sourceNodeId: str('Source node id whose override is reset.') }, ['sourceNodeId'], 'Existing setComponentOverride(..., null) reset contract.'),
    1
  ),
  'component.instance.detach.v1': editTaskSchema(
    { type: 'string', const: 'component.instance.detach.v1', description: 'Detach one native Component Instance into ordinary remapped geometry.' },
    obj({}, [], 'No arguments.', false),
    1
  ),
  'component.definition.duplicate.v1': editTaskSchema(
    { type: 'string', const: 'component.definition.duplicate.v1', description: 'Duplicate one existing Component Definition and its source geometry.' },
    obj({
      definitionId: str('Existing Component Definition id.'),
      name: str('Optional duplicate definition name.')
    }, ['definitionId'], 'Existing duplicateComponentDefinition contract.'),
    0, 0
  ),
  'component.reference.repair.v1': editTaskSchema(
    { type: 'string', const: 'component.reference.repair.v1', description: 'Explicitly repair one Component Instance reference to an existing definition.' },
    obj({ definitionId: str('Existing replacement Component Definition id.') }, ['definitionId'], 'Explicit repair only; never automatic.'),
    1
  )
};

function resultContract({
  statuses = ['COMPLETED', 'FAILED'],
  createsRefs = false,
  changesRefs = false,
  returnsOutputHandles = false
} = {}) {
  return {
    resultEnvelope: RESULT_ENVELOPE,
    resultEnvelopeVersion: 1,
    outputHandleSchema: returnsOutputHandles ? OUTPUT_HANDLE : null,
    possibleStatuses: statuses,
    createsRefs,
    changesRefs,
    returnsOutputHandles
  };
}

const policy = (approvalRequired, approvalMode, historyMode, revisionMode, previewRecommended = false, previewRequired = false, previewReason = '') => ({
  approvalPolicy: { required: approvalRequired, mode: approvalMode },
  historyPolicy: { mode: historyMode },
  revisionPolicy: { mode: revisionMode },
  previewPolicy: { recommended: previewRecommended, required: previewRequired, reason: previewReason }
});

function descriptor(def) {
  return freeze({
    schema: INK_CAPABILITY_DESCRIPTOR_SCHEMA,
    version: INK_CAPABILITY_DESCRIPTOR_VERSION,
    availabilityReason: def.availability ? null : 'NOT_IMPLEMENTED_IN_CURRENT_INK_CONNECTOR',
    constraints: [],
    examples: [],
    ...def
  });
}

const primary = [
  descriptor({
    id: 'capabilities.list', title: 'List INK capabilities', description: 'List deterministic capability summaries and named-tool metadata.',
    availability: true, routingClass: 'READ_ONLY', namedTool: 'get_ink_capabilities', publicMethod: 'capabilities', role: 'READ',
    authoritativeRoute: 'Ink Public Creative API capability registry',
    inputSchema: obj({}, [], 'No input is required.'),
    targetTypes: ['None'], ...policy(false, 'NONE', 'NONE', 'NONE'),
    resultContract: resultContract(), examples: [{}], toolPrimary: true
  }),
  descriptor({
    id: 'document.context', title: 'Read document context', description: 'Read grounded document/page/layer/object context through the existing AI Document Bridge.',
    availability: true, routingClass: 'READ_ONLY', namedTool: 'get_ink_context', publicMethod: 'context', role: 'READ',
    authoritativeRoute: 'buildAIDocumentBridge',
    inputSchema: bridgeOptionsSchema, targetTypes: ['Document', 'Page', 'Layer', 'Object'],
    ...policy(false, 'NONE', 'NONE', 'READ_CURRENT'), resultContract: resultContract(), examples: [{}], toolPrimary: true
  }),
  descriptor({
    id: 'document.selection', title: 'Read selection', description: 'Read the current grounded selection through the existing AI Document Bridge.',
    availability: true, routingClass: 'READ_ONLY', namedTool: 'get_ink_selection', publicMethod: 'selection', role: 'READ',
    authoritativeRoute: 'buildAIDocumentBridge + app.selection',
    inputSchema: bridgeOptionsSchema, targetTypes: ['Object'],
    ...policy(false, 'NONE', 'NONE', 'READ_CURRENT'), resultContract: resultContract(), examples: [{}], toolPrimary: true
  }),
  descriptor({
    id: 'document.inspect', title: 'Inspect objects', description: 'Inspect explicit stable object references through the existing AI Document Bridge.',
    availability: true, routingClass: 'READ_ONLY', namedTool: 'inspect_ink_objects', publicMethod: 'inspect', role: 'READ',
    authoritativeRoute: 'buildAIDocumentBridge',
    inputSchema: obj({
      refs: arr(objectRefSchema, 'Object refs to inspect.', { minItems: 1, maxItems: 512 }),
      objectIds: arr(str('Object id.'), 'Compatibility object-id list.', { minItems: 1, maxItems: 512 }),
      options: bridgeOptionsSchema
    }, [], 'Use refs or objectIds.'), targetTypes: ['Object'],
    constraints: ['At least one stable object reference or object id is required.'],
    ...policy(false, 'NONE', 'NONE', 'READ_CURRENT'), resultContract: resultContract(),
    examples: [{ refs: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'object-1' }] }], toolPrimary: true
  }),
  descriptor({
    id: 'reference.decompose', title: 'Decompose Reference into Color + Line', description: 'Decompose an existing INK ReferenceImage through the accepted Reference Handoff/extraction authority.',
    availability: true, routingClass: 'NAMED_TOOL', namedTool: 'decompose_ink_reference', publicMethod: 'reference.decompose', role: 'WRITE',
    authoritativeRoute: 'app.chatReferenceHandoff.decomposeReference',
    inputSchema: obj({
      referenceObjectId: str('Existing ReferenceImage object id.'),
      options: obj({
        intent: str('Optional audit intent.'),
        numberOfColors: { type: 'integer', minimum: 2, maximum: 32, default: 8, description: 'Bounded color quantization target.' },
        pathOmit: { type: 'integer', minimum: 0, maximum: 4096, description: 'Existing extraction path omission control.' },
        lineStroke: str('Boundary-line stroke token.', { default: '#202020' }),
        lineStrokeWidth: num('Boundary-line stroke width.', { minimum: 0, maximum: 1000000, default: 1 })
      }, [], 'Reference decomposition options.')
    }, ['referenceObjectId'], 'Reference decomposition request.'),
    targetTypes: ['ReferenceImage'],
    constraints: ['Uses existing ImageTracerJS-backed extraction authority.', 'Retains the source ReferenceImage.'],
    ...policy(false, 'DIRECT_NAMED_TOOL', 'AUTHORITATIVE_COMMIT', 'NO_AUTO_CAPTURE', true, false, 'Preview is recommended after decomposition for visual verification.'),
    resultContract: resultContract({ createsRefs: true, changesRefs: true }), examples: [{ referenceObjectId: 'reference-1', options: { numberOfColors: 8 } }], toolPrimary: true
  }),
  descriptor({
    id: 'edit.propose', title: 'Propose bounded edit', description: 'Create a bounded edit proposal. This does not execute the edit.',
    availability: true, routingClass: 'PROPOSAL_REQUIRED', namedTool: 'propose_ink_edit', publicMethod: 'edit.propose', role: 'PROPOSAL',
    authoritativeRoute: 'app.chatBoundedEditAdapter.propose',
    inputSchema: editTaskSchema({ type: 'string', enum: CHAT_EDIT_OPERATIONS, description: 'Accepted bounded operation.' }, genericEditArguments, 64),
    targetTypes: ['Object', 'Path'],
    constraints: ['Proposal only; no mutation occurs until approval and execute.', 'Operation-specific descriptors define exact target and argument constraints.'],
    ...policy(false, 'PROPOSE_ONLY', 'NONE', 'NONE', true, false, 'Preview may be useful before approval.'),
    resultContract: resultContract({ statuses: ['PROPOSED', 'FAILED'] }),
    examples: [{ taskId: 'task-1', operation: 'path.repaint.v1', targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'path-1' }], arguments: { fill: '#ffffff' } }], toolPrimary: true
  }),
  descriptor({
    id: 'edit.approve', title: 'Approve bounded edit', description: 'Approve an existing bounded edit proposal and obtain/confirm the approval token.',
    availability: true, routingClass: 'PROPOSAL_REQUIRED', namedTool: 'approve_ink_edit', publicMethod: 'edit.approve', role: 'PROPOSAL',
    authoritativeRoute: 'app.chatBoundedEditAdapter.approve',
    inputSchema: obj({ proposalId: str('Proposal id.') }, ['proposalId'], 'Proposal approval request.'),
    targetTypes: ['None'], constraints: ['Approval does not itself execute the edit.'],
    ...policy(true, 'EXPLICIT_PROPOSAL_APPROVAL', 'NONE', 'NONE'),
    resultContract: resultContract({ statuses: ['APPROVED', 'FAILED'] }), examples: [{ proposalId: 'proposal:task-1:abcd1234' }], toolPrimary: true
  }),
  descriptor({
    id: 'edit.execute', title: 'Execute approved bounded edit', description: 'Execute an already approved bounded edit through the existing bounded-edit authority.',
    availability: true, routingClass: 'PROPOSAL_REQUIRED', namedTool: 'execute_ink_edit', publicMethod: 'edit.execute', role: 'WRITE',
    authoritativeRoute: 'app.chatBoundedEditAdapter.execute',
    inputSchema: obj({ proposalId: str('Approved proposal id.'), approvalToken: str('Approval token returned by the accepted authority.') }, ['proposalId', 'approvalToken'], 'Approved proposal execution request.'),
    targetTypes: ['Object', 'Path'], constraints: ['Requires prior proposal approval.', 'No automatic Revision capture.'],
    ...policy(true, 'APPROVED_PROPOSAL_REQUIRED', 'AUTHORITATIVE_COMMIT', 'NO_AUTO_CAPTURE', true, false, 'Preview is recommended after execution.'),
    resultContract: resultContract({ statuses: ['EXECUTED', 'FAILED'], changesRefs: true }), examples: [{ proposalId: 'proposal:task-1:abcd1234', approvalToken: 'approval-token' }], toolPrimary: true
  }),
  descriptor({
    id: 'history.inspect', title: 'Inspect History', description: 'Read existing History state without mutation.',
    availability: true, routingClass: 'READ_ONLY', namedTool: 'get_ink_history', publicMethod: 'history.inspect', role: 'READ',
    authoritativeRoute: 'app.history', inputSchema: obj({}, [], 'No input is required.'), targetTypes: ['None'],
    ...policy(false, 'NONE', 'READ_EXISTING', 'NONE'), resultContract: resultContract(), examples: [{}], toolPrimary: true
  }),
  descriptor({
    id: 'history.undo', title: 'Undo', description: 'Move the authoritative History stack one step backward.',
    availability: true, routingClass: 'NAMED_TOOL', namedTool: 'undo_ink', publicMethod: 'history.undo', role: 'WRITE',
    authoritativeRoute: 'app.history.undo', inputSchema: obj({}, [], 'No input is required.'), targetTypes: ['None'],
    ...policy(false, 'DIRECT_NAMED_TOOL', 'MOVE_EXISTING_STACK', 'NO_AUTO_CAPTURE'), resultContract: resultContract({ statuses: ['COMPLETED', 'NO_OP', 'FAILED'], changesRefs: true }), examples: [{}], toolPrimary: true
  }),
  descriptor({
    id: 'history.redo', title: 'Redo', description: 'Move the authoritative History stack one step forward.',
    availability: true, routingClass: 'NAMED_TOOL', namedTool: 'redo_ink', publicMethod: 'history.redo', role: 'WRITE',
    authoritativeRoute: 'app.history.redo', inputSchema: obj({}, [], 'No input is required.'), targetTypes: ['None'],
    ...policy(false, 'DIRECT_NAMED_TOOL', 'MOVE_EXISTING_STACK', 'NO_AUTO_CAPTURE'), resultContract: resultContract({ statuses: ['COMPLETED', 'NO_OP', 'FAILED'], changesRefs: true }), examples: [{}], toolPrimary: true
  }),
  descriptor({
    id: 'revision.list', title: 'List Revisions', description: 'List existing Revisions for a document.',
    availability: true, routingClass: 'READ_ONLY', namedTool: 'get_ink_revisions', publicMethod: 'revision.list', role: 'READ',
    authoritativeRoute: 'app.revisions.list', inputSchema: obj({ documentId: str('Document id; defaults to the current document.') }, [], 'Revision list request.'), targetTypes: ['Document', 'Revision'],
    ...policy(false, 'NONE', 'NONE', 'READ_EXISTING'), resultContract: resultContract(), examples: [{}], toolPrimary: true
  }),
  descriptor({
    id: 'revision.capture', title: 'Capture Revision', description: 'Explicitly capture a Revision through the existing Revision authority.',
    availability: true, routingClass: 'NAMED_TOOL', namedTool: 'capture_ink_revision', publicMethod: 'revision.capture', role: 'WRITE',
    authoritativeRoute: 'app.revisions.capture',
    inputSchema: obj({ reason: str('Revision reason.'), label: str('Human-readable label.') }, [], 'Revision capture options passed directly to revision.capture; the Named Tool also accepts this direct shape.'),
    targetTypes: ['Document'], constraints: ['Requires an idle History boundary.'],
    ...policy(false, 'DIRECT_NAMED_TOOL', 'REQUIRE_IDLE', 'EXPLICIT_CAPTURE'), resultContract: resultContract({ statuses: ['COMPLETED', 'NO_OP', 'FAILED'] }), examples: [{ reason: 'chat-checkpoint', label: 'CHAT checkpoint' }], toolPrimary: true
  }),
  descriptor({
    id: 'revision.restore', title: 'Restore Revision', description: 'Explicitly restore an existing Revision through the existing Revision authority.',
    availability: true, routingClass: 'NAMED_TOOL', namedTool: 'restore_ink_revision', publicMethod: 'revision.restore', role: 'WRITE',
    authoritativeRoute: 'app.revisions.restore',
    inputSchema: obj({ revisionId: str('Revision id.'), options: { type: 'object', properties: {}, additionalProperties: true, description: 'Existing restore options.' } }, ['revisionId'], 'Revision restore request.'),
    targetTypes: ['Revision'], constraints: ['Restores document state and resets History to the Revision boundary.'],
    ...policy(false, 'DIRECT_NAMED_TOOL', 'RESET_TO_REVISION', 'EXPLICIT_RESTORE'), resultContract: resultContract({ changesRefs: true }), examples: [{ revisionId: 'revision-1' }], toolPrimary: true
  }),
  descriptor({
    id: 'preview.capture', title: 'Capture Preview', description: 'Render a bounded PNG preview through the existing Renderer and return an ephemeral output handle.',
    availability: true, routingClass: 'NAMED_TOOL', namedTool: 'get_ink_preview', publicMethod: 'preview.capture', role: 'READ',
    authoritativeRoute: 'app.renderExportCanvas + existing Renderer',
    inputSchema: obj({
      scope: { type: 'string', enum: ['artboard', 'viewport', 'content'], default: 'artboard', description: 'Preview scope.' },
      maxDimension: { type: 'integer', minimum: 1, maximum: 1600, default: 1200, description: 'Maximum output dimension.' },
      scale: num('Viewport/content scale; must be greater than zero.', { minimum: Number.EPSILON }),
      ppi: num('Artboard PPI; must be greater than zero.', { minimum: Number.EPSILON }),
      background: bool('Include existing page background.', { default: true }),
      refs: arr(objectRefSchema, 'Optional semantic object bindings.', { maxItems: 512 })
    }, [], 'Preview request.'),
    targetTypes: ['Document', 'Page', 'Object'],
    constraints: ['Object refs are semantic bindings only and never define crop authority.', 'Preview is bounded to 1600 px per dimension and 2,560,000 pixels.'],
    ...policy(false, 'NONE', 'NONE', 'READ_CURRENT'), resultContract: resultContract({ returnsOutputHandles: true }), examples: [{ scope: 'artboard', maxDimension: 1200 }], toolPrimary: true
  }),
  descriptor({
    id: 'asset.inspect', title: 'Inspect output handle', description: 'Inspect an ephemeral INK_OUTPUT_HANDLE and exact-state staleness.',
    availability: true, routingClass: 'READ_ONLY', namedTool: 'inspect_ink_output', publicMethod: 'asset.inspect', role: 'READ',
    authoritativeRoute: 'Connector ephemeral INK_OUTPUT_HANDLE registry + documentFingerprint',
    inputSchema: obj({ handleId: str('INK output handle id.') }, ['handleId'], 'Output-handle inspection request.'),
    targetTypes: ['INK_OUTPUT_HANDLE'], ...policy(false, 'NONE', 'NONE', 'READ_CURRENT'), resultContract: resultContract({ returnsOutputHandles: true }), examples: [{ handleId: 'ink-output-v1:example' }], toolPrimary: true
  }),
  descriptor({
    id: 'asset.release', title: 'Release output handle payload', description: 'Release only the ephemeral payload associated with an INK_OUTPUT_HANDLE.',
    availability: true, routingClass: 'NAMED_TOOL', namedTool: 'release_ink_output', publicMethod: 'asset.release', role: 'WRITE',
    authoritativeRoute: 'Connector ephemeral INK_OUTPUT_HANDLE registry',
    inputSchema: obj({ handleId: str('INK output handle id.') }, ['handleId'], 'Output-handle release request.'),
    targetTypes: ['INK_OUTPUT_HANDLE'], constraints: ['Does not mutate Document, History, or Revision.'],
    ...policy(false, 'DIRECT_NAMED_TOOL', 'NONE', 'NONE'), resultContract: resultContract({ statuses: ['COMPLETED', 'NO_OP', 'FAILED'], returnsOutputHandles: true }), examples: [{ handleId: 'ink-output-v1:example' }], toolPrimary: true
  }),
  descriptor({
    id: 'capability.describe', title: 'Describe INK capability', description: 'Return the full canonical INK_CAPABILITY_DESCRIPTOR v1 for a capability id or registered named tool.',
    availability: true, routingClass: 'READ_ONLY', namedTool: 'describe_ink_capability', publicMethod: 'capability.describe', role: 'READ',
    authoritativeRoute: 'Ink canonical capability registry',
    inputSchema: obj({ idOrToolName: str('Capability id or registered named tool name.') }, ['idOrToolName'], 'Capability description request.'),
    targetTypes: ['None'], ...policy(false, 'NONE', 'NONE', 'NONE'), resultContract: resultContract(),
    examples: [{ idOrToolName: 'preview.capture' }], toolPrimary: true
  }),
  descriptor({
    id: 'composition.programmable', title: 'Programmable native composition', description: 'Declarative CHAT-native plan bridge over the existing Chat Creative Plan and bounded-edit authorities.',
    availability: true, routingClass: 'PROPOSAL_REQUIRED', namedTool: 'use_ink', publicMethod: 'composition.propose', role: 'PROPOSAL',
    authoritativeRoute: 'app.inkPublicApi.composition.* → app.chatCreativePlan → bounded-edit approval authority → app.commands / FunctionModuleHost provider → History → Revision',
    inputSchema: useInkSchema,
    targetTypes: ['Document', 'Page', 'Object', 'Path'],
    constraints: [
      'Declarative plan actions only; arbitrary JavaScript, arbitrary method dispatch, callbacks, and direct Document JSON writes are prohibited.',
      'propose is Document/History/Revision mutation-neutral and does not approve or execute.',
      'execute requires the explicit approval token issued by the existing Chat Creative Plan authority.',
      'Every plan step remains subject to the existing bounded-edit allowlist and state validation.',
      'History and partial/final Revision behavior are inherited from the existing Chat Creative Plan authority.',
      'Visual verification remains a separate get_ink_preview action; use_ink does not auto-capture Preview.'
    ],
    ...policy(true, 'PLAN_PROPOSE_THEN_EXPLICIT_APPROVAL_BEFORE_EXECUTE', 'EXISTING_CHAT_CREATIVE_PLAN', 'EXISTING_PARTIAL_OR_FINAL_CAPTURE', true, false, 'Call get_ink_preview separately when visual verification is needed.'),
    resultContract: resultContract({ statuses: ['PROPOSED', 'APPROVED', 'COMPLETED', 'STOPPED', 'REJECTED', 'FAILED'], changesRefs: true }),
    examples: [{
      action: 'propose',
      plan: {
        schema: 'INK-CHAT-CREATIVE-PLAN',
        version: 1,
        intentSummary: 'Repaint one path and then translate another object.',
        steps: [
          { stepId: 'repaint', operation: 'path.repaint.v1', targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'path-1' }], arguments: { fill: '#ffffff' }, dependsOn: [] },
          { stepId: 'move', operation: 'object.translate.v1', targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'object-2' }], arguments: { dx: 8, dy: 0 }, dependsOn: ['repaint'] }
        ]
      }
    }],
    toolPrimary: true
  })
];

// Append only: the accepted Connector-004 19-tool registry remains the exact prefix.
primary.push(descriptor({
  id: 'reference.import', title: 'Import Reference', description: 'Import a browser-local File/Blob through the existing CHAT Reference Handoff authority.',
  availability: true, routingClass: 'NAMED_TOOL', namedTool: 'import_ink_reference', publicMethod: 'reference.import', role: 'WRITE',
  authoritativeRoute: 'app.chatReferenceHandoff.importReference',
  inputSchema: obj({
    input: { description: 'Browser-local File or Blob, or the existing normalizeChatAttachment {file} / {blob, name, type} handoff. This is a local binary input, not JSON-encoded bytes or a remote URL.' },
    options: obj({
      name: str('Explicit file name required for a bare Blob.'),
      type: str('MIME type; defaults to the supplied binary MIME type.'),
      mimeType: str('Existing MIME type alias.'),
      lastModified: num('Optional file modification time.'),
      intent: str('Optional audit intent.'),
      actor: obj({ type: str('Actor type.'), id: str('Actor id.'), channel: str('Actor channel.') }, [], 'Existing handoff actor metadata.'),
      matrix: arr(num('Affine matrix coefficient.'), 'Optional existing Reference placement matrix.', { minItems: 6, maxItems: 6 })
    }, [], 'Existing Reference Handoff options; passed unchanged to the authority.')
  }, ['input'], 'Named Tool canonical request: {input, options?}. Public method: reference.import(input, options?).'),
  targetTypes: ['ReferenceImage'],
  constraints: [
    'Browser-local File/Blob handoff only; normalization, decoding, import, History and provenance use existing authorities.',
    'Raw File/Blob payloads never appear in the JSON-safe public result.',
    'No remote URL fetch or external transport; no automatic Revision capture.',
    'The example input is symbolic: replace <browser-local File> with the actual File/Blob object; passing the placeholder string is rejected.'
  ],
  ...policy(false, 'DIRECT_NAMED_TOOL', 'AUTHORITATIVE_COMMIT', 'NO_AUTO_CAPTURE', true, false, 'Preview is recommended after import or decomposition.'),
  resultContract: resultContract({ statuses: ['COMPLETED', 'COMMITTED_WITH_ERROR', 'FAILED'], createsRefs: true, changesRefs: true }),
  examples: [{ input: '<browser-local File>', options: { name: 'reference.png', type: 'image/png' } }], toolPrimary: true
}));


// Cluster B1 direct mutable web-raster import. Binary ingest is a named-tool boundary, not bounded-edit JSON.
primary.push(descriptor({
  id: 'raster.import',
  title: 'Import Editable Raster',
  description: 'Import a browser-local PNG, JPEG, WebP, PSD, TIFF or EXR attachment, or a RAW attachment when an approved deterministic browser-compatible RAW adapter is registered, into the existing native editable image + rasterState authority.',
  availability: true,
  routingClass: 'NAMED_TOOL',
  namedTool: 'import_ink_raster',
  publicMethod: 'raster.import',
  role: 'WRITE',
  authoritativeRoute: 'normalizeChatAttachment → existing format probe → app.importWebRaster (PNG/JPEG/WebP) or app.importImageFormat (PSD/TIFF/EXR/policy-approved RAW) → existing History / image+rasterState / Renderer',
  inputSchema: obj({
    input: { description: 'Browser-local File or Blob, or the existing normalizeChatAttachment {file} / {blob, name, type} handoff. Binary bytes are never encoded in JSON.' },
    options: obj({
      name: str('Optional object name; defaults to the local file name.'),
      type: str('MIME type for a bare Blob.'),
      mimeType: str('Existing MIME type alias for a bare Blob.'),
      lastModified: num('Optional file modification time.'),
      intent: str('Optional audit intent.'),
      matrix: arr(num('Affine matrix coefficient.'), 'Optional placement matrix.', { minItems: 6, maxItems: 6 })
    }, [], 'Mutable raster import options.')
  }, ['input'], 'Named Tool canonical request: {input, options?}.'),
  targetTypes: ['Image'],
  constraints: [
    'Qualified mutable ingest covers browser-local PNG / JPEG / WebP through the existing web-raster decoder and PSD / TIFF / EXR through the existing native format interoperability authority.',
    'RAW is conditionally routed through the existing policy-gated RAW adapter registry when its probe matches. The default runtime has no RAW decoder and fails explicitly; registered adapters must already satisfy browserCompatible=true, deterministic=true and a non-empty license.',
    'PSB is not included in this CHAT qualification even though the native parser can identify it.',
    'Creates the existing native editable image + rasterState shape; ReferenceImage remains separate and locked.',
    'Raw File/Blob, pixel arrays, data URLs and remote URLs are never returned in the public JSON result.',
    'Uses existing History and Renderer; no automatic Revision capture and no duplicate raster state owner.',
    'Advanced-format import preserves the existing normalized color raster, ICC/channel/source metadata and uses the same History/Renderer authorities; no duplicate decoder or raster owner is introduced.'
  ],
  ...policy(false, 'DIRECT_NAMED_TOOL', 'AUTHORITATIVE_COMMIT', 'NO_AUTO_CAPTURE', true, false, 'Call get_ink_preview after import for visual verification.'),
  resultContract: resultContract({ statuses: ['COMPLETED', 'FAILED'], createsRefs: true, changesRefs: true }),
  examples: [{ input: '<browser-local File>', options: { name: 'editable.png', type: 'image/png' } }, { input: '<browser-local File>', options: { name: 'editable.psd', type: 'image/vnd.adobe.photoshop' } }],
  toolPrimary: true
}));

// C2-A direct high-level export tool. Export is readback/output generation, not a bounded Document mutation.
primary.push(descriptor({
  id: 'asset.export', title: 'Export INK asset', description: 'Generate PNG, SVG or PDF through the existing INK export authorities and retain the result in the existing ephemeral output registry.',
  availability: true, routingClass: 'NAMED_TOOL', namedTool: 'export_ink_asset', publicMethod: 'asset.export', role: 'READ',
  authoritativeRoute: 'app.exportPNG / app.exportSVG / app.exportPDF → existing INK output registry',
  inputSchema: obj({
    format: { type: 'string', enum: ['png', 'svg', 'pdf', 'PNG', 'SVG', 'PDF'], description: 'Existing non-print export format.' },
    scope: { type: 'string', enum: ['artboard', 'viewport', 'content'], default: 'artboard', description: 'Existing export scope. PDF remains artboard-only.' },
    scale: num('Existing raster/content scale.', { minimum: 0.01, maximum: 64, default: 2 }),
    ppi: num('Existing artboard export PPI.', { minimum: 36, maximum: 2400, default: 300 }),
    includeBleed: bool('Use existing bleed behavior.', { default: false }),
    cropMarks: bool('Use existing crop-mark behavior.', { default: false }),
    background: bool('Include existing paper/background behavior.', { default: true })
  }, ['format'], 'Asset export request. Browser Print and automatic download are intentionally excluded.'),
  targetTypes: ['Document', 'Page', 'INK_OUTPUT_HANDLE'],
  constraints: [
    'Calls only the existing PNG/SVG/PDF export authorities; no new renderer or serializer is introduced.',
    'Export must not mutate Document, History or Revision state.',
    'Result stays INTERNAL_EPHEMERAL and is returned as INK_OUTPUT_HANDLE / 1; no browser-anchor download or external transport occurs.',
    'SVG is marked editable vector output; PNG and PDF are not marked structurally editable.',
    'PDF is artboard-only because that is the existing native export authority.'
  ],
  ...policy(false, 'DIRECT_NAMED_TOOL', 'NONE', 'READ_CURRENT', false, false, 'Export does not require automatic Preview.'),
  resultContract: resultContract({ statuses: ['COMPLETED', 'FAILED'], returnsOutputHandles: true }),
  examples: [{ format: 'svg', scope: 'artboard', background: true }],
  toolPrimary: true
}));

// Connector-005 append-only read-only Creative Library search.
// The accepted 21-tool registry remains the exact ordered prefix.
primary.push(descriptor({
  id: 'library.search',
  title: 'Search INK Creative Library',
  description: 'Search or inspect existing reusable INK structures through bounded read-only adapters over current native Document authorities.',
  availability: true,
  routingClass: 'NAMED_TOOL',
  namedTool: 'search_ink_library',
  publicMethod: 'library.query',
  role: 'READ',
  authoritativeRoute: 'app.inkPublicApi.library.query → current Document Component / Material / Recipe / Repeat / Reference-derived authorities',
  inputSchema: obj({
    action: {
      type: 'string',
      enum: ['search', 'inspect'],
      default: 'search',
      description: 'Search the current document library view or inspect one stable returned library ref.'
    },
    query: str('Optional normalized substring query for search.'),
    types: arr({
      type: 'string',
      enum: ['component', 'material', 'recipe', 'parametric-structure', 'reference-derived-structure'],
      description: 'Creative Library family.'
    }, 'Optional family filter.', { maxItems: 5 }),
    ref: obj({
      schema: { type: 'string', const: 'INK_CREATIVE_LIBRARY_REF', description: 'Stable Creative Library ref schema.' },
      version: { type: 'integer', const: 1, description: 'Stable Creative Library ref version.' },
      type: {
        type: 'string',
        enum: ['component', 'material', 'recipe', 'parametric-structure', 'reference-derived-structure'],
        description: 'Type-disambiguated Creative Library family.'
      },
      scope: obj({
        documentId: str('Owning document id.'),
        pageId: str('Owning page id when applicable.'),
        layerId: str('Owning layer id when applicable.')
      }, ['documentId'], 'Native scope used to reject stale or ambiguous refs.'),
      id: str('Stable native identity within the documented scope.'),
      source: str('Bounded native source authority identifier.')
    }, ['schema', 'version', 'type', 'scope', 'id', 'source'], 'Stable ref returned by a prior search.'),
    limit: { type: 'integer', minimum: 1, maximum: 50, default: 20, description: 'Maximum returned search results.' }
  }, [], 'Use action=search with query/types/limit, or action=inspect with ref.'),
  targetTypes: ['Document', 'Page', 'Object'],
  constraints: [
    'Read-only current-document discovery; no remote search, network fetch, registry creation, Creative Memory write, Research write, selection change, workspace change, Document mutation, History mutation, or Revision mutation.',
    'Searchable families are component, material, recipe, parametric-structure, and reference-derived-structure.',
    'Missing families return an empty result rather than fabricated assets.',
    'Returned INK_CREATIVE_LIBRARY_REF / 1 values contain only bounded JSON-safe identity metadata and no executable payload.',
    'Reuse metadata reports only existing accepted native authorities; search and inspect never apply an asset automatically.',
    'Stale or mismatched refs fail explicitly instead of resolving to a different asset.'
  ],
  ...policy(false, 'DIRECT_NAMED_TOOL', 'NONE', 'READ_CURRENT', false, false, 'Reuse, when available, remains a separate explicit proposal/approval operation.'),
  resultContract: resultContract({ statuses: ['COMPLETED', 'FAILED'] }),
  examples: [
    { action: 'search', query: 'petal', types: ['component', 'material'], limit: 10 },
    { action: 'inspect', ref: { schema: 'INK_CREATIVE_LIBRARY_REF', version: 1, type: 'component', scope: { documentId: 'doc-1' }, id: 'component-1', source: 'document.components.definitions' } }
  ],
  toolPrimary: true
}));

// Cluster D2 read-only bridge over the already-installed Studio RecipeEngine and page-stored FLORA recipe state.
primary.push(descriptor({
  id: 'recipe.inventory',
  title: 'Inspect existing Recipe inventory',
  description: 'Read the recipes already registered in the existing Studio RecipeEngine plus page-stored FLORA recipe identities without creating or importing a second Recipe registry.',
  availability: true,
  routingClass: 'NAMED_TOOL',
  namedTool: 'get_ink_recipe_inventory',
  publicMethod: 'recipe.inventory',
  role: 'READ',
  authoritativeRoute: 'app.studio.engine.list/describe + current page.floraRecipeState read-only inspection',
  inputSchema: obj({ recipeId: str('Optional exact Studio recipe id to describe.') }, [], 'Read-only Recipe inventory request.'),
  targetTypes: ['Recipe'],
  constraints: [
    'Read-only inventory only; does not register, import, translate, mutate, approve, or execute a recipe.',
    'Studio entries come directly from the existing RecipeEngine registry. Stored FLORA entries are identity summaries only.',
    'No Workflow IR or External Workflow Translation route is introduced.',
    'Execution remains a separate recipe.studio.execute.v1 proposal → approval → execute flow.'
  ],
  ...policy(false, 'DIRECT_NAMED_TOOL', 'NONE', 'READ_CURRENT', false, false, 'Preview is not required for inventory reads.'),
  resultContract: resultContract({ statuses: ['COMPLETED', 'FAILED'] }),
  examples: [{}],
  toolPrimary: true
}));

// External source -> first-party adapter -> Workflow IR/compiler -> registered Studio Recipe
// -> existing bounded edit proposal/approval/native History. Analyzed source never executes.
primary.push(descriptor({
  id: 'recipe.workflow',
  title: 'Import, translate and execute a bounded external workflow',
  description: 'Analyze actual source text using installed first-party adapters; translate and inspect diagnostics; propose, approve and execute only a fully supported compiled Recipe through existing native authorities.',
  availability: true,
  routingClass: 'PROPOSAL_REQUIRED',
  namedTool: 'import_ink_workflow',
  publicMethod: 'workflow.invoke',
  role: 'PROPOSAL',
  authoritativeRoute: 'app.studio.programImporter → first-party Workflow IR/compiler → app.studio.engine.registerRecipe → app.chatBoundedEditAdapter → native History',
  inputSchema: obj({
    action: { type: 'string', enum: ['analyze', 'translate', 'inspect', 'propose', 'approve', 'execute'], description: 'Fixed workflow stage; no arbitrary method dispatch.' },
    source: obj({
      name: str('Actual source filename (max 120 safe chars).'),
      text: str('Source text, up to 32768 UTF-8 bytes. No arbitrary code execution.'),
      mimeType: str('Optional source MIME.'),
      license: obj({spdx: str('Verified source SPDX identifier.')}, ['spdx']),
      provenance: obj({ sourceUrl: str('Original upstream source URL.'), localUserProvided: bool('Original source supplied by user.') })
    }, [], 'Required for analyze; source and license/provenance must be explicit.'),
    sessionId: str('Returned analyze session id.'),
    targetRefs: arr(objectRefSchema, 'Existing editable path refs; native route currently requires 1..64.', { minItems: 1, maxItems: 64 }),
    parameters: { type: 'object', properties: {}, additionalProperties: true },
    inputHashes: { type: 'object', properties: {}, additionalProperties: true },
    proposalId: str('Existing bounded-edit proposal id.'),
    approvalToken: str('Existing bounded-edit approval token.')
  }, ['action'], 'Fixed six-stage external Recipe entry; action-specific arguments are required.'),
  targetTypes: ['Recipe', 'Path'],
  constraints: [
    'Only installed adapters; no eval, external software execution, dynamic dispatch or inline native-command substitution.',
    'Analyzing and translating do not mutate Document/History; registration occurs at proposal.',
    'Fully supported source, explicit license/provenance, a nonempty compiled Recipe and existing Path target are required before a governed proposal.',
    'Imported Recipe is pinned to source/compiled fingerprint, parameters, target refs and document fingerprint; stale approval fails closed.',
    'Native RecipeEngine and existing bounded edit approval/History own execution and rollback; no partial or approximate execution is reported as complete.'
  ],
  ...policy(true, 'BOUNDED_STAGE_PROPOSE_APPROVE_EXECUTE', 'EXISTING_NATIVE_RECIPE_HISTORY', 'NO_AUTO_CAPTURE', true, false, 'Call get_ink_preview after the completed execution and preserve its handle as a runner artifact.'),
  resultContract: resultContract({ statuses: ['COMPLETED', 'PROPOSED', 'APPROVED', 'EXECUTED', 'FAILED'] }),
  examples: [{ action: 'inspect', sessionId: 'ink-recipe-session:...' }],
  toolPrimary: true
}));

const operationDescriptors = CHAT_EDIT_OPERATIONS.map(operation => {
  const paperOnly = operation === 'page.paper.set.v1';
  const pageOperation = CHAT_PAGE_OPERATIONS.includes(operation);
  const precisionLayoutOperation = CHAT_PRECISION_LAYOUT_OPERATIONS.includes(operation);
  const materialOperation = CHAT_MATERIAL_OPERATIONS.includes(operation);
  const recipeOperation = CHAT_RECIPE_OPERATIONS.includes(operation);
  const pathOnly = operation.startsWith('path.') && operation !== 'path.create.v1';
  const strokeOnly = operation === 'stroke.erase.circle.v1';
  const imageOnly = operation.startsWith('image.');
  const zeroTargetCreate = materialOperation || ['path.create.v1', 'paint.session.create.v1', 'frame.create.v1', 'text.create.v1', 'svg.import.v1', 'component.instance.create.v1', 'component.definition.duplicate.v1'].includes(operation);
  const operationConstraints = paperOnly
    ? ['Zero object targets; changes only the active page paper through InkApp.changePaper. Requires idle History and no pending interactive paper preview; captured paper fingerprint rejects stale proposals.']
    : precisionLayoutOperation
    ? ['Zero object targets; changes only active-page native snap settings or ruler guides through existing InkApp precision-layout wrappers. Captured precision fingerprint rejects stale proposals; no pointer simulation or duplicate snapping/guide authority is introduced.']
    : pageOperation
    ? ['Zero object targets; explicit stable page id is supplied in arguments where required. Reuses existing InkApp page mutation/navigation authority; page.activate.v1 is navigation-only and creates no History entry. New Document architecture is outside this operation family.']
    : materialOperation
    ? ['Zero object targets; reuses the existing Document materialLibrary/createMaterialTemplate/createMaterialInstance authority with native validation and History. Captured material-library fingerprint rejects stale proposals.']
    : recipeOperation
    ? ['Targets must resolve to explicit editable visible unlocked Path objects. Recipe id/version and role bindings are explicit; execution reuses the existing Studio RecipeEngine inside existing History.']
    : zeroTargetCreate
    ? ['Creation/import uses zero targets and cannot mutate before explicit approval and execute.']
    : operation === 'text.edit.v1' || operation === 'text.path.set.v1'
      ? ['Target must resolve to one editable visible unlocked Text object.']
      : imageOnly
        ? ['Target must resolve to exactly one editable visible unlocked native Image with rasterState.colorRaster. ReferenceImage and src-only images are rejected.']
        : strokeOnly
          ? ['Targets must resolve to explicit editable visible unlocked native Stroke objects.']
        : pathOnly || operation === 'boolean.apply.v1'
          ? ['Targets must resolve to editable visible unlocked Path objects.']
          : ['Targets must resolve to editable visible unlocked objects.'];
  if (operation === 'boolean.apply.v1') operationConstraints.push('All 2+ Path targets must share the same layer and structural parent.');
  if (operation === 'group.create.v1') operationConstraints.push('All targets must share the same layer and structural parent.');
  if (operation === 'object.align.v1') operationConstraints.push('Explicit stable refs are temporarily routed through the existing selection-based InkApp.alignSelection() authority and the prior user selection is restored afterward. No duplicate alignment/distribution math is introduced. Alignment needs 2+ targets; distributeX/distributeY need 3+.');
  if (operation === 'object.reparent.v1') operationConstraints.push('Native hierarchy authority currently accepts Frame parents or layer root and rejects cycles/cross-layer invalid moves.');
  if (operation === 'svg.import.v1') operationConstraints.push('Raw local SVG only; script/foreign-code/network execution forms are rejected and parser unsupported evidence is returned.');
  if (operation === 'paint.session.create.v1') operationConstraints.push('Uses only the qualified built-in Brush Engine preset subset and the existing StrokeSessionRecorder/replay authority; Blender, Smudge, Eraser, and pointer emulation are intentionally not exposed here.');
  if (operation === 'stroke.create.v1') operationConstraints.push('Blender/Smudge are native run-only mixer strokes. They require a contiguous multi-channel run containing at least one Brush/DryBrush depositor; mixing runs use the existing Canvas2D multi-channel surface until GPU transport parity is separately implemented.');
  if (operation === 'stroke.erase.circle.v1') operationConstraints.push('Explicit stable Stroke targets only; existing proposal target fingerprints and revision checks reject stale edits. Uses eraseStrokeWithCircle() directly and never calls interactive hit-test, pointer, or area-wide eraseAt().');
  if (imageOnly && operation !== 'image.raster.paintBucket.v1') operationConstraints.push('Image stack params are structurally bounded to 8 KiB, depth 4, 64 object keys, array length 128, finite numbers and 512-character strings.');
  if (operation === 'image.adjustment.add.v1') operationConstraints.push('Initial qualified adjustment allowlist: brightnessContrast, levels, curves, hueSaturation.');
  if (operation === 'image.filter.add.v1') operationConstraints.push('Initial qualified filter allowlist: gaussianBlur, sharpen, noiseGrain, textureOverlay.');
  if (operation === 'image.blend.set.v1') operationConstraints.push('Uses the existing IMAGE_CAPABILITIES blend-mode allowlist and rejects no-op assignment.');
  if (operation === 'image.effect.add.v1') operationConstraints.push('Initial effect allowlist: dropShadow, innerShadow, outerGlow, colorOverlay, stroke; qualification coverage is recorded per tested effect type.');
  if (operation === 'image.liquify.add.v1') operationConstraints.push('Maximum 32 operations; uses existing LIQUIFY_OPERATIONS/createLiquifyFilter/liquifyRaster. Arbitrary freeze-mask pixel arrays are excluded from CHAT exposure.');
  if (operation === 'image.raster.paintBucket.v1') operationConstraints.push('Destructive local raster edit. Reuses existing paintBucketFill()/magicWandSelection and existing rasterState.colorRaster. Current direct-raster qualification is limited to 8-bit RGB; no pointer emulation or automatic target discovery. Raster pixels and rasterMask participate in operation-specific optimistic-concurrency fingerprints.');
  if (operation === 'image.mask.raster.set.v1') operationConstraints.push('Initial geometry is rectangle only. Reuses existing rasterizePathMask/createRasterMask/renderImageStack; raw alpha arrays are not accepted. Raster pixels and rasterMask participate in operation-specific optimistic-concurrency fingerprints.');
  if (operation === 'image.raster.spotHeal.v1') operationConstraints.push('One-shot structured local retouch using existing spotHealing(). Current direct-raster qualification is limited to 8-bit RGB; no pointer emulation, source-point inference, or raw mask payload. Raster pixels and rasterMask participate in operation-specific optimistic-concurrency fingerprints.');
  if (operation === 'image.raster.localRetouch.v1') operationConstraints.push('Non-source one-shot local retouch only: Dodge/Burn/Sponge/Local Blur/Local Sharpen/Color Replacement. Uses existing raster-retouch algorithms, native rasterState and pixel/mask stale fingerprints. Clone/Healing/Patch/Pattern Stamp remain separate source-contract work.');
  if (operation === 'image.raster.sourceRetouch.v1') operationConstraints.push('Source-dependent one-shot retouch only: Clone Stamp / Healing Brush / Patch. Source and target are explicit raster-local coordinates/regions inside the same target raster; no pointer emulation, source inference, cross-image sampling or raw mask. Pattern Stamp remains separate asset-contract work.');
  if (operation === 'text.path.set.v1') operationConstraints.push('Requires one explicit stable native Path ref in arguments. Text and Path must share the same native container. Renderer reuses existing layoutTextOnPath(); Text remains editable type:text; Path is not mutated; Text local matrix and referenced Path transform must remain invertible; current proposal revision and both Text/Path state fingerprints protect execution from stale state.');
  if (operation === 'path.warp.v1') operationConstraints.push('Uses existing createWarpDeformationPlan() + applyNonDestructiveDeformation(); stable Path identity and editable anchor structure are preserved.');
  if (operation === 'path.distort.v1' || operation === 'path.perspective.v1') operationConstraints.push('Uses existing projective planner and applyNonDestructiveDeformation(); recomputes anchors and handles from retained baseSubpaths with serializable reversible state. Distort offsets independent corners; Perspective constrains opposing edges toward a shared center. Invalid folded quads are rejected.');
  if (operation === 'object.resize.v1' || operation === 'object.scale.v1') operationConstraints.push('Finite non-singular transform safety is required.');
  if (operation === 'object.order.v1') operationConstraints.push('Targets must share one layer and structural parent; only front/back are exposed in C2-A.');
  if (operation === 'repeat.mirror.v1' || operation === 'repeat.grid.v1') operationConstraints.push('One source object only; creates a native Repeat adjacent to the source through existing History.');
  if (operation === 'layout.frame.set.v1' || operation === 'layout.frame.remove.v1') operationConstraints.push('Target must be one native Frame; setFrameLayout remains the sole mutation authority.');
  if (operation === 'layout.item.set.v1' || operation === 'layout.item.remove.v1') operationConstraints.push('Target must be one current child of a native Frame; setChildLayoutItem remains the sole mutation authority.');
  if (operation === 'component.register.v1') operationConstraints.push('Target must satisfy the native structural-container definition rules; nested instances remain unsupported.');
  if (operation === 'component.instance.create.v1') operationConstraints.push('Zero-target creation uses an existing definition and an explicit destination on the active page.');
  if (operation === 'component.override.set.v1' || operation === 'component.override.reset.v1') operationConstraints.push('Target must be one native Component Instance; only the existing opacity override contract is exposed.');
  if (operation === 'component.instance.detach.v1') operationConstraints.push('Target must be one resolvable Component Instance; native detach remaps geometry ids and replaces the instance.');
  if (operation === 'component.definition.duplicate.v1') operationConstraints.push('Zero-target definition duplication uses the existing native definition/source duplication transaction.');
  if (operation === 'component.reference.repair.v1') operationConstraints.push('Explicit repair only; target must be one Component Instance and automatic repair remains prohibited.');
  if (operation === 'material.template.create.v1') operationConstraints.push('Template ids/versions are stable; native $param/$calc geometry tokens are allowed, arbitrary executable expressions/tokens are rejected, and optional Path appearance is limited to fill/stroke.');
  if (operation === 'material.instance.create.v1') operationConstraints.push('Requires an exact existing template version and explicit destination layer; instance creation remains createMaterialInstance().');
  if (operation === 'recipe.studio.execute.v1') operationConstraints.push('Inline recipe definitions are prohibited. Exact registered recipe identity/version, one role per stable target, bounded parameters, replay receipt, and existing History rollback are required.');
  if (operation === 'path.repaint.v1') {
    operationConstraints.push('arguments must contain at least one of fill, stroke, opacity, or expressiveStrokeColor; empty arguments are rejected with ARGUMENTS_EMPTY.');
  }
  if (operation === 'object.translate.v1') {
    operationConstraints.push('dx and dy may each be zero, but they must not both be zero; {dx:0,dy:0} is rejected as NO_OP.');
  }
  return descriptor({
    id: operation,
    title: operation,
    description: 'Operation-specific bounded edit descriptor for ' + operation + '.',
    availability: true,
    routingClass: 'PROPOSAL_REQUIRED',
    namedTool: 'propose_ink_edit',
    publicMethod: 'edit.propose',
    role: 'PROPOSAL',
    authoritativeRoute: 'app.chatBoundedEditAdapter.propose → explicit approval → app.chatBoundedEditAdapter.execute → app.commands / active FunctionModuleHost provider',
    inputSchema: editSchemas[operation],
    targetTypes: (paperOnly || pageOperation || precisionLayoutOperation) ? ['Page'] : materialOperation
      ? (operation === 'material.template.create.v1' ? ['Document'] : ['Page'])
      : recipeOperation ? ['Path', 'Recipe'] : zeroTargetCreate
      ? (operation === 'component.definition.duplicate.v1' ? ['Document'] : ['Page'])
      : operation === 'text.edit.v1' || operation === 'text.path.set.v1'
        ? ['Object']
        : imageOnly
          ? ['Image']
          : strokeOnly
            ? ['Stroke']
          : (pathOnly || operation === 'boolean.apply.v1' ? ['Path'] : ['Object']),
    constraints: operationConstraints,
    ...policy(true, 'PROPOSE_THEN_EXPLICIT_APPROVAL_BEFORE_EXECUTE', 'AUTHORITATIVE_COMMIT_ON_EXECUTE_ONLY', 'NO_AUTO_CAPTURE', true, false, 'Preview is recommended after execution.'),
    resultContract: resultContract({ statuses: ['PROPOSED', 'FAILED'] }),
    examples: operation === 'material.template.create.v1'
      ? [{ taskId: 'material-template-create-1', operation, targets: [], arguments: { template: { templateId: 'material-chat-sample', templateVersion: '1', materialType: 'vector', geometry: { type: 'path', subpaths: [] }, defaultParameters: {}, editableParameters: {}, constraints: [], semanticRole: 'sample', sourceBenchmark: { source: 'CHAT' }, validationState: { status: 'BOUNDED' }, metadata: { pathAppearance: { fill: '#b45a54', stroke: '#4d2c2a' } } } } }]
      : operation === 'material.instance.create.v1'
      ? [{ taskId: 'material-instance-create-1', operation, targets: [], arguments: { templateId: 'material-chat-sample', templateVersion: '1', layerId: 'layer-1', instanceId: 'material-instance-1' } }]
      : operation === 'recipe.studio.execute.v1'
      ? [{ taskId: 'recipe-studio-1', operation, targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'path-1' }], arguments: { recipeId: 'ink.flower.common.v1', recipeVersion: '1', parameters: {}, roles: ['petal'] } }]
      : paperOnly
      ? [{ taskId: 'paper-roughness-1', operation, targets: [], arguments: { key: 'roughness', value: .85 } }]
      : precisionLayoutOperation
      ? [operation === 'page.snap.set.v1'
          ? { taskId: 'snap-grid-1', operation, targets: [], arguments: { key: 'grid', value: true } }
          : operation === 'guide.add.v1'
            ? { taskId: 'guide-add-1', operation, targets: [], arguments: { orientation: 'vertical', position: 120 } }
            : operation === 'guide.move.v1'
              ? { taskId: 'guide-move-1', operation, targets: [], arguments: { guideId: 'guide-1', position: 180 } }
              : operation === 'guide.lock.set.v1'
                ? { taskId: 'guide-lock-1', operation, targets: [], arguments: { guideId: 'guide-1', locked: true } }
                : operation === 'guide.visibility.set.v1'
                  ? { taskId: 'guide-visible-1', operation, targets: [], arguments: { guideId: 'guide-1', visible: false } }
                  : { taskId: 'guide-remove-1', operation, targets: [], arguments: { guideId: 'guide-1' } }]
      : pageOperation
      ? [operation === 'page.create.v1'
          ? { taskId: 'page-create-1', operation, targets: [], arguments: {} }
          : operation === 'page.rename.v1'
            ? { taskId: 'page-rename-1', operation, targets: [], arguments: { pageId: 'page-2', name: 'Page 2 renamed' } }
            : { taskId: operation + '-1', operation, targets: [], arguments: { pageId: 'page-2' } }]
      : operation === 'paint.session.create.v1'
      ? [{ taskId: 'paint-session-1', operation, targets: [], arguments: { name: 'CHAT Paint Session', seed: 17, strokes: [{ brushId: 'pencil', color: '#202020', samples: [{ x: 20, y: 20, pressure: .3, timestamp: 0 }, { x: 120, y: 80, pressure: .8, timestamp: 24 }] }] } }]
      : operation === 'image.adjustment.add.v1'
        ? [{ taskId: 'image-adjust-1', operation, targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'image-1' }], arguments: { type: 'brightnessContrast', params: { brightness: 12, contrast: 8 }, opacity: 1 } }]
      : operation === 'image.filter.add.v1'
        ? [{ taskId: 'image-filter-1', operation, targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'image-1' }], arguments: { type: 'gaussianBlur', params: { radius: 2 }, opacity: 1 } }]
      : operation === 'image.blend.set.v1'
        ? [{ taskId: 'image-blend-1', operation, targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'image-1' }], arguments: { mode: 'multiply' } }]
      : operation === 'image.effect.add.v1'
        ? [{ taskId: 'image-effect-1', operation, targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'image-1' }], arguments: { type: 'colorOverlay', params: { color: '#00cc66' }, opacity: .55 } }]
      : operation === 'image.liquify.add.v1'
        ? [{ taskId: 'image-liquify-1', operation, targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'image-1' }], arguments: { operations: [{ type: 'twirl', x: 32, y: 24, radius: 18, strength: .65 }], opacity: 1, maxWork: 500000 } }]
      : operation === 'text.path.set.v1'
        ? [{ taskId: 'text-path-1', operation, targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'text-1' }], arguments: { pathRef: { pageId: 'page-1', layerId: 'layer-1', objectId: 'path-1' }, startOffset: 12, overflow: 'clip' } }]
            : operation === 'path.warp.v1'
        ? [{ taskId: 'path-warp-1', operation, targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'path-1' }], arguments: { strength: .45, maxDisplacement: .35 } }]
      : operation === 'path.distort.v1'
        ? [{ taskId: 'path-distort-1', operation, targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'path-1' }], arguments: { xOffset: 12, yOffset: 6 } }]
      : operation === 'path.perspective.v1'
        ? [{ taskId: 'path-perspective-1', operation, targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'path-1' }], arguments: { xOffset: 8, yOffset: -5 } }]
      : operation === 'object.translate.v1'
      ? [{ taskId: 'translate-1', operation, targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'object-1' }], arguments: { dx: 10, dy: 5 } }]
      : operation === 'path.repaint.v1'
        ? [{ taskId: 'repaint-1', operation, targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'path-1' }], arguments: { fill: '#ffffff' } }]
        : operation === 'path.material.apply.v1'
          ? [{ taskId: 'material-1', operation, targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'path-1' }], arguments: { templateId: 'material-template' } }]
          : operation === 'path.material.remove.v1'
            ? [{ taskId: 'material-remove-1', operation, targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'path-1' }], arguments: {} }]
            : [{ taskId: operation + '-1', operation, targets: [{ pageId: 'page-1', layerId: 'layer-1', objectId: 'path-1' }], arguments: {} }],
    toolPrimary: false
  });
});

const unavailable = [
  descriptor({
    id: 'external.transport', title: 'External connector transport', description: 'Future external transport capability; not implemented by Connector-003.',
    availability: false, availabilityReason: 'EXTERNAL_TRANSPORT_NOT_IMPLEMENTED', routingClass: 'UNAVAILABLE', namedTool: null, publicMethod: null, role: 'UNAVAILABLE',
    authoritativeRoute: 'UNAVAILABLE', inputSchema: obj({}, [], 'Unavailable capability.'), targetTypes: ['None'],
    constraints: ['Discovery only. External plugin transport is unavailable.'],
    ...policy(false, 'UNAVAILABLE', 'NONE', 'NONE'), resultContract: resultContract({ statuses: ['FAILED'] }), examples: [], toolPrimary: false
  })
];

const GOVERNED_COMMAND_CAPABILITY_IDS = new Set(CHAT_EDIT_OPERATIONS);
const DESCRIPTORS = freeze([...primary, ...operationDescriptors, ...unavailable]);
const BY_ID = new Map(DESCRIPTORS.map(item => [item.id, item]));
const BY_TOOL = new Map(primary.filter(item => item.toolPrimary && item.namedTool).map(item => [item.namedTool, item]));

if (BY_ID.size !== DESCRIPTORS.length) throw new Error('INK_CAPABILITY_ID_DUPLICATE');
if (BY_TOOL.size !== primary.filter(item => item.toolPrimary && item.namedTool).length) throw new Error('INK_NAMED_TOOL_DUPLICATE');

export function projectInkCapabilityDescriptorRuntime(descriptor, commandAuthority) {
  if (!descriptor) return null;
  const projected = clone(descriptor);
  if (!GOVERNED_COMMAND_CAPABILITY_IDS.has(projected.id)) return projected;
  const available = Boolean(commandAuthority?.has?.(projected.id));
  projected.availability = available;
  projected.availabilityReason = available ? null : 'FUNCTION_PROVIDER_UNAVAILABLE';
  projected.routingClass = available ? projected.routingClass : 'UNAVAILABLE';
  return projected;
}

export function getInkCapabilitySummariesRuntime(commandAuthority) {
  return DESCRIPTORS.map(item => {
    const projected = projectInkCapabilityDescriptorRuntime(item, commandAuthority);
    return clone({
      id: projected.id,
      title: projected.title,
      availability: projected.availability,
      availabilityReason: projected.availabilityReason,
      routingClass: projected.routingClass,
      namedTool: projected.namedTool,
      publicMethod: projected.publicMethod,
      role: projected.role,
      descriptorSchema: projected.schema,
      descriptorVersion: projected.version
    });
  });
}

export function resolveInkCapabilityDescriptorRuntime(idOrToolName, commandAuthority) {
  return projectInkCapabilityDescriptorRuntime(resolveInkCapabilityDescriptor(idOrToolName), commandAuthority);
}

export function getInkCapabilityDescriptors() {
  return clone(DESCRIPTORS);
}

export function getInkCapabilitySummaries() {
  return DESCRIPTORS.map(item => clone({
    id: item.id,
    title: item.title,
    availability: item.availability,
    availabilityReason: item.availabilityReason,
    routingClass: item.routingClass,
    namedTool: item.namedTool,
    publicMethod: item.publicMethod,
    role: item.role,
    descriptorSchema: item.schema,
    descriptorVersion: item.version
  }));
}

export function getInkNamedToolDefinitions() {
  return primary
    .filter(item => item.toolPrimary && item.namedTool)
    .map(item => clone({
      name: item.namedTool,
      publicMethod: item.publicMethod,
      role: item.role,
      authoritativeRoute: item.authoritativeRoute,
      approvalRequired: Boolean(item.approvalPolicy?.required),
      historyExpectation: item.historyPolicy?.mode || 'NONE',
      revisionExpectation: item.revisionPolicy?.mode || 'NONE',
      availability: Boolean(item.availability),
      routingClass: item.routingClass,
      resultEnvelope: item.resultContract?.resultEnvelope || RESULT_ENVELOPE,
      capabilityId: item.id,
      descriptorVersion: item.version
    }));
}

export function resolveInkCapabilityDescriptor(idOrToolName) {
  const key = String(idOrToolName || '').trim();
  if (!key) return null;
  const found = BY_ID.get(key) || BY_TOOL.get(key) || null;
  return found ? clone(found) : null;
}
