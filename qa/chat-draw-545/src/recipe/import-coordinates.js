import { artboardTrimBounds, CSS_PPI } from '../document/artboard.js';
import { Matrix } from '../core/math.js';

// This frame is opt-in for newly imported Illustrator geometry only. Native
// recipes and operations on pre-existing targets keep their world coordinates.
export const ARTBOARD_LOCAL_PT_FRAME = 'artboard-local-pt-v1';

export function importedCoordinateMatrix(frame, page, matrix, { operation = false } = {}) {
  if (frame == null) return matrix;
  if (frame !== ARTBOARD_LOCAL_PT_FRAME) throw new Error('INK_IMPORT_COORDINATE_FRAME_UNSUPPORTED');
  const { x, y } = artboardTrimBounds(page), scale = CSS_PPI / 72;
  const sourceToWorld = [scale, 0, 0, scale, x, y];
  if (!operation) return Matrix.multiply(sourceToWorld, matrix);
  // Conjugate subsequent source-space transforms so translations remain in pt
  // and rotations/scales use the same source origin as the created path.
  return Matrix.multiply(Matrix.multiply(sourceToWorld, matrix), Matrix.invert(sourceToWorld));
}
