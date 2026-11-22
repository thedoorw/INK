import { artboardTrimBounds, CSS_PPI } from '../document/artboard.js';
import { Matrix } from '../core/math.js';

// Imported frames are opt-in. Unmarked Native recipes keep world coordinates.
export const ARTBOARD_LOCAL_PT_FRAME = 'artboard-local-pt-v1';
export const SVG_VIEWPORT_FRAME = 'svg-viewport-v1';

function svgViewportToWorld(frame, page) {
  const box = frame.viewBox;
  if (!Array.isArray(box) || box.length !== 4 || !box.every(value => typeof value === 'number' && Number.isFinite(value)) || box[2] <= 0 || box[3] <= 0)
    throw new Error('INK_SVG_VIEWBOX_INVALID');
  const bounds = artboardTrimBounds(page);
  if (!(bounds.w > 0 && bounds.h > 0)) throw new Error('INK_IMPORT_ARTBOARD_BOUNDS_INVALID');
  const [minX, minY, width, height] = box;
  const raw = String(frame.preserveAspectRatio || 'xMidYMid meet').trim().replace(/^defer\s+/i, '');
  const tokens = raw.split(/\s+/);
  const sx = bounds.w / width, sy = bounds.h / height;
  if (tokens[0].toLowerCase() === 'none' && tokens.length === 1)
    return [sx, 0, 0, sy, bounds.x - minX * sx, bounds.y - minY * sy];
  const align = /^x(min|mid|max)y(min|mid|max)$/i.exec(tokens[0]);
  if (!align || tokens.length > 2 || (tokens[1] && !/^(meet|slice)$/i.test(tokens[1])))
    throw new Error('INK_SVG_PRESERVE_ASPECT_RATIO_UNSUPPORTED');
  const factor = !tokens[1] || tokens[1].toLowerCase() === 'meet' ? Math.min(sx, sy) : Math.max(sx, sy);
  const fraction = value => ({ min: 0, mid: 0.5, max: 1 })[value.toLowerCase()];
  const tx = bounds.x + (bounds.w - width * factor) * fraction(align[1]) - minX * factor;
  const ty = bounds.y + (bounds.h - height * factor) * fraction(align[2]) - minY * factor;
  return [factor, 0, 0, factor, tx, ty];
}

export function importedCoordinateMatrix(frame, page, matrix, { operation = false } = {}) {
  if (frame == null) return matrix;
  let sourceToWorld;
  if (frame === ARTBOARD_LOCAL_PT_FRAME) {
    const { x, y } = artboardTrimBounds(page), scale = CSS_PPI / 72;
    sourceToWorld = [scale, 0, 0, scale, x, y];
  } else if (frame?.kind === SVG_VIEWPORT_FRAME) {
    sourceToWorld = svgViewportToWorld(frame, page);
  } else {
    throw new Error('INK_IMPORT_COORDINATE_FRAME_UNSUPPORTED');
  }
  if (!operation) return Matrix.multiply(sourceToWorld, matrix);
  // Conjugate subsequent source-space transforms around the same source origin.
  return Matrix.multiply(Matrix.multiply(sourceToWorld, matrix), Matrix.invert(sourceToWorld));
}
