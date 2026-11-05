import { tracePath } from '../vector/vector-core.js';
// Minimal adapter for the imported AI display subset. Existing unrelated paths
// retain their previous behavior. Clip matrix is relative to the owning Path.
export function applyAiPathClip(ctx,object) {
  if(object?.metadata?.sourceFormat!=='AI_PDF_DISPLAY'||!object.clipPath?.path)return false;
  const clip=object.clipPath.path;
  ctx.save();
  try {ctx.transform(...clip.matrix);tracePath(ctx,clip);} finally {ctx.restore();}
  ctx.clip(clip.fillRule==='evenodd'?'evenodd':'nonzero');
  return true;
}
