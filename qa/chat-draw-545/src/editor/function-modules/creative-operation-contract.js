// Command ownership contract for the existing 68 governed CHAT creative operations.
// This is routing metadata only; capability identity remains with existing CHAT descriptors and product authorities.

export const CREATIVE_OPERATION_FAMILY_COMMANDS = Object.freeze({
  'vector-path-stroke': Object.freeze([
    'path.simplify.v1','path.refine.v1','path.create.v1','stroke.create.v1','stroke.erase.circle.v1',
    'path.warp.v1','path.distort.v1','path.perspective.v1','path.edit.v1'
  ]),
  'structure-repeat-layout-components': Object.freeze([
    'object.clone.v1','repeat.radial.v1','boolean.apply.v1','group.create.v1','object.reparent.v1','frame.create.v1',
    'object.scale.v1','object.order.v1','repeat.mirror.v1','repeat.grid.v1',
    'layout.frame.set.v1','layout.frame.remove.v1','layout.item.set.v1','layout.item.remove.v1',
    'component.register.v1','component.instance.create.v1','component.override.set.v1','component.override.reset.v1',
    'component.instance.detach.v1','component.definition.duplicate.v1','component.reference.repair.v1'
  ]),
  'text-svg': Object.freeze([
    'text.create.v1','text.edit.v1','text.path.set.v1','svg.import.v1'
  ]),
  'raster-image': Object.freeze([
    'paint.session.create.v1','image.adjustment.add.v1','image.filter.add.v1','image.blend.set.v1','image.effect.add.v1',
    'image.liquify.add.v1','image.raster.paintBucket.v1','image.mask.raster.set.v1','image.raster.spotHeal.v1',
    'image.raster.localRetouch.v1','image.raster.sourceRetouch.v1'
  ]),
  'materials-appearance': Object.freeze([
    'material.template.create.v1','material.instance.create.v1','path.repaint.v1','path.material.apply.v1','path.material.remove.v1'
  ]),
  'recipe-invocation': Object.freeze(['recipe.studio.execute.v1'])
});

export const CREATIVE_EXISTING_OWNER_EXTENSIONS = Object.freeze({
  'page-layout': Object.freeze([
    'page.create.v1','page.duplicate.v1','page.delete.v1','page.rename.v1','page.activate.v1',
    'page.paper.set.v1','page.artboard.set.v1','page.snap.set.v1',
    'guide.add.v1','guide.move.v1','guide.remove.v1','guide.lock.set.v1','guide.visibility.set.v1'
  ]),
  'selection-transform': Object.freeze([
    'object.translate.v1','object.align.v1','object.resize.v1','object.rotate.v1'
  ])
});

export const CREATIVE_GOVERNED_OPERATION_COUNT = 68;

export function creativeFamilyOwns(familyId, operationId) {
  return CREATIVE_OPERATION_FAMILY_COMMANDS[familyId]?.includes(operationId) === true;
}
