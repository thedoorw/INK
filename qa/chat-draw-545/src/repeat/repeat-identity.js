import { stableCompositeId, stableHash } from '../core/stable-id.js';

export const REPEAT_IDENTITY_VERSION = '1.0';

export function repeatInstanceStableId({ generatorId, sourceObjectId = 'source', instanceIndex = 0, ringIndex = 0, semanticRole = 'instance', recipeVersion = '1' } = {}) {
  if (!generatorId) throw Object.assign(new Error('INK_REPEAT_GENERATOR_ID_REQUIRED'), { code: 'REPEAT_GENERATOR_ID_REQUIRED' });
  return stableCompositeId('repeat', [generatorId, ringIndex, instanceIndex, semanticRole, recipeVersion, sourceObjectId]);
}

export function reconcileRepeatInstances(repeat, transforms = []) {
  if (!repeat?.id) throw Object.assign(new Error('INK_REPEAT_GENERATOR_ID_REQUIRED'), { code: 'REPEAT_GENERATOR_ID_REQUIRED' });
  const previous = new Map((repeat.instances || []).map(instance => [instance.instanceId, instance]));
  const sourceObjectId = repeat.sourceObjectId || repeat.source?.id || 'source';
  const ringIndex = Number.isInteger(repeat.ringIndex) ? repeat.ringIndex : 0;
  const semanticRole = repeat.semanticRole || repeat.source?.semantic?.role || repeat.source?.metadata?.semanticLabel || 'instance';
  const recipeVersion = String(repeat.recipeVersion || '1');
  return transforms.map((transform, instanceIndex) => {
    const instanceId = repeatInstanceStableId({ generatorId: repeat.id, sourceObjectId, instanceIndex, ringIndex, semanticRole, recipeVersion });
    const prior = previous.get(instanceId) || {};
    return {
      format: 'INK-REPEAT-INSTANCE',
      version: REPEAT_IDENTITY_VERSION,
      instanceId,
      generatorId: repeat.id,
      sourceObjectId,
      templateId: repeat.templateId || repeat.source?.materialInstance?.templateId || null,
      templateVersion: repeat.templateVersion || repeat.source?.materialInstance?.templateVersion || null,
      instanceIndex,
      ringIndex,
      semanticRole,
      recipeVersion,
      transform: [...transform],
      transformHash: stableHash(transform),
      localOverrideState: prior.localOverrideState || {},
      active: true
    };
  });
}

export function repeatIdentityReport(before, after) {
  const a = new Map((before?.instances || []).map(item => [item.instanceId, item]));
  const b = new Map((after?.instances || []).map(item => [item.instanceId, item]));
  const beforeIds = [...a.keys()];
  const afterIds = [...b.keys()];
  return {
    format: 'INK-REPEAT-IDENTITY-REPORT',
    version: REPEAT_IDENTITY_VERSION,
    generatorId: after?.id || before?.id || null,
    preserved: beforeIds.filter(id => b.has(id)),
    added: afterIds.filter(id => !a.has(id)),
    removed: beforeIds.filter(id => !b.has(id)),
    unchangedTransforms: beforeIds.filter(id => b.has(id) && a.get(id).transformHash === b.get(id).transformHash),
    changedTransforms: beforeIds.filter(id => b.has(id) && a.get(id).transformHash !== b.get(id).transformHash)
  };
}
