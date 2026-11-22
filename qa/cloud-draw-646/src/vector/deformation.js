import { createProjectiveTransform, mapProjectivePoint } from '../editor/transform-advanced.js';
import { pathBounds } from './vector-core.js';
const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function transformPoint(point, bounds, params) {
  const cx = bounds.x + bounds.w / 2, cy = bounds.y + bounds.h / 2;
  const nx = bounds.w ? (point.x - cx) / (bounds.w / 2) : 0;
  const ny = bounds.h ? (point.y - bounds.y) / bounds.h : .5;
  const foreshortening = clamp(Number(params.foreshortening ?? params.perspective ?? 1), .05, 2);
  const taper = clamp(Number(params.taper ?? 0), -1, 1);
  const bend = Number(params.bend ?? 0);
  const perspectiveY = Number(params.perspectiveY ?? 0);
  const foldAxis = clamp(Number(params.foldAxis ?? .5), 0, 1);
  const foldAngle = Number(params.foldAngle ?? 0) * Math.PI / 180;
  let x = cx + nx * bounds.w / 2 * foreshortening * (1 + taper * (ny - .5));
  let y = point.y + perspectiveY * nx;
  x += Math.sin(ny * Math.PI) * bend;
  if (ny < foldAxis && foldAngle) {
    const distance = (foldAxis - ny) * bounds.h;
    x += Math.sin(foldAngle) * distance;
    y += (1 - Math.cos(foldAngle)) * distance;
  }
  return { x, y };
}

export function applyNonDestructiveDeformation(path, parameters = {}) {
  if (!path || path.type !== 'path') throw new Error('INK_DEFORMATION_PATH_REQUIRED');
  const baseSubpaths = clone(path.deformation?.baseSubpaths || path.subpaths);
  const basePath = { ...path, subpaths: baseSubpaths }, bounds = pathBounds(basePath);
  const canonical = clone(parameters);
  let mapper = point => transformPoint(point, bounds, canonical);
  if (canonical.projective) {
    const mapping = canonical.projective;
    if (!['distort', 'perspective'].includes(mapping.mode)) throw new Error('INK_DEFORMATION_PROJECTIVE_MODE_INVALID');
    // Rebuild from inspectable semantic quads; never persist an opaque callback.
    mapping.matrix = createProjectiveTransform(mapping.sourceQuad, mapping.destinationQuad);
    mapper = point => mapProjectivePoint(mapping.matrix, point);
  }
  const transformed = basePath.subpaths.map(subpath => ({ ...subpath, anchors: subpath.anchors.map(anchor => {
    const center = mapper(anchor);
    const incomingEnd = mapper({ x: anchor.x + (anchor.in?.x || 0), y: anchor.y + (anchor.in?.y || 0) });
    const outgoingEnd = mapper({ x: anchor.x + (anchor.out?.x || 0), y: anchor.y + (anchor.out?.y || 0) });
    return { ...anchor, x: center.x, y: center.y, in: { x: incomingEnd.x - center.x, y: incomingEnd.y - center.y }, out: { x: outgoingEnd.x - center.x, y: outgoingEnd.y - center.y } };
  }) }));
  path.subpaths = transformed;
  path.deformation = { ...path.deformation, baseSubpaths: clone(baseSubpaths), type: 'INK-NON-DESTRUCTIVE-DEFORMATION', version: '1.0', parameters: canonical, frontBack: parameters.frontBack || 'front', reversible: true, revision: (path.deformation?.revision || 0) + 1 };
  return path;
}

export function resetNonDestructiveDeformation(path) {
  if (!path?.deformation?.baseSubpaths) return path;
  path.subpaths = clone(path.deformation.baseSubpaths); delete path.deformation; return path;
}

export function deformationReport(path) {
  return { objectId: path?.id || null, active: Boolean(path?.deformation), parameters: clone(path?.deformation?.parameters || {}), stableIdPreserved: Boolean(path?.id), reversible: Boolean(path?.deformation?.reversible) };
}
