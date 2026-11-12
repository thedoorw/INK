// Extraction is an input adapter; INK remains the geometry/History authority.
import { Matrix } from '../core/index.js';
import { createPath, importSVGPaths, pointInRing, flattenSubpath } from '../vector/vector-core.js';
export const EXTRACTION_SCHEMA = 'INK-EXTRACTION/1';
export const LIMITS = Object.freeze({ pixels: 4_000_000, paths: 20000, nodes: 200000, svgBytes: 8_000_000 });
const copy = value => JSON.parse(JSON.stringify(value));
export function requireValue(ok, code) { if (!ok) throw Object.assign(new Error(code), { code }); }
export function checkAbort(signal) { requireValue(!signal?.aborted, 'EXTRACTION_CANCELLED'); }
export async function sha256(bytes) {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data)), n => n.toString(16).padStart(2, '0')).join('');
}
export function validateRaster(raster) {
  const { width, height, data } = raster || {};
  requireValue(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0 && width * height <= LIMITS.pixels, 'EXTRACTION_RASTER_SIZE');
  requireValue((data instanceof Uint8Array || data instanceof Uint8ClampedArray) && data.length === width * height * 4, 'EXTRACTION_RGBA_REQUIRED');
}
export function validateMask(mask, source, raster) {
  if (!mask) return;
  requireValue(mask.sourceSha256 === source.sha256 && mask.width === raster.width && mask.height === raster.height, 'EXTRACTION_MASK_IDENTITY');
  requireValue(mask.data?.length === raster.width * raster.height && Array.from(mask.data).every(n => n === 0 || n === 255), 'EXTRACTION_BINARY_MASK_REQUIRED');
  requireValue(typeof mask.provider === 'string' && mask.provider.length > 0, 'EXTRACTION_MASK_PROVIDER_REQUIRED');
}
export function contoursToPaths(contours) {
  requireValue(Array.isArray(contours) && contours.length <= LIMITS.paths, 'EXTRACTION_CONTOUR_LIMIT');
  const depths = contours.map((c, i) => {
    requireValue(Array.isArray(c.points) && c.points.length >= 3, 'EXTRACTION_CONTOUR_POINTS');
    const seen = new Set([i]); let parent = c.parent ?? -1, depth = 0;
    while (parent !== -1) {
      requireValue(Number.isInteger(parent) && parent >= 0 && parent < contours.length && !seen.has(parent), 'EXTRACTION_CONTOUR_HIERARCHY');
      seen.add(parent); depth++; parent = contours[parent].parent ?? -1;
    }
    return depth;
  });
  // A compound even-odd path preserves holes and islands without a new hierarchy.
  return contours.length ? [createPath({ id: 'extracted', fill: '#202020', stroke: null, fillRule: 'evenodd', subpaths: contours.map((c, i) => ({
    id: `contour-${i}`, role: depths[i] % 2 ? 'hole' : 'outer', closed: true,
    anchors: c.points.map(([x, y], n) => { requireValue(Number.isFinite(x) && Number.isFinite(y), 'EXTRACTION_NONFINITE'); return { id: `c${i}-n${n}`, x, y }; })
  })) })] : [];
}
export function normalizePaths(raw, prefix, provenance) {
  requireValue(Array.isArray(raw) && raw.length > 0 && raw.length <= LIMITS.paths, 'EXTRACTION_EMPTY_OR_PATH_LIMIT');
  let nodes = 0;
  const paths = raw.map((p, i) => {
    requireValue(p.type === 'path' && p.matrix?.length === 6 && p.matrix.every(Number.isFinite), 'EXTRACTION_PATH_INVALID');
    const out = copy(p); out.id = `${prefix}-p${i}`; out.name = `Extracted path ${i + 1}`;
    for (const [j, s] of out.subpaths.entries()) {
      requireValue(s.closed && s.anchors.length >= 3, 'EXTRACTION_CLOSED_PATH_REQUIRED');
      s.id = `${out.id}-s${j}`;
      for (const [k, a] of s.anchors.entries()) {
        requireValue([a.x,a.y,a.in.x,a.in.y,a.out.x,a.out.y].every(n => Number.isFinite(n) && Math.abs(n) < 1e8), 'EXTRACTION_NONFINITE');
        a.id = `${s.id}-n${k}`; nodes++;
      }
    }
    out.metadata = { ...out.metadata, extraction: copy(provenance) }; return out;
  });
  requireValue(nodes <= LIMITS.nodes, 'EXTRACTION_NODE_LIMIT');
  return { paths, nodes };
}
export async function executeExtraction(request, adapter, { signal } = {}) {
  checkAbort(signal);
  const { raster, source, mask = null, parameters = {} } = request || {};
  validateRaster(raster);
  requireValue(/^[a-f0-9]{64}$/.test(source?.sha256 || '') && typeof source?.name === 'string', 'EXTRACTION_SOURCE_IDENTITY');
  validateMask(mask, source, raster);
  requireValue(typeof adapter?.extract === 'function' && adapter.id && adapter.version, 'EXTRACTION_ADAPTER_REQUIRED');
  const pixelSha256 = await sha256(raster.data), maskSha256 = mask ? await sha256(new Uint8Array(mask.data)) : null;
  const provenance = { schema: EXTRACTION_SCHEMA, source: copy(source), width: raster.width, height: raster.height,
    pixelSha256, mask: mask ? { provider: mask.provider, sha256: maskSha256, model: mask.model || null } : null,
    adapter: { id: adapter.id, version: adapter.version }, parameters: copy(parameters), coordinateSpace: 'source-pixels' };
  const prefix = `extract-${(await sha256(JSON.stringify(provenance))).slice(0,24)}`;
  checkAbort(signal);
  const start = performance.now();
  const result = await adapter.extract({ raster, mask, parameters, signal });
  checkAbort(signal);
  let raw;
  if (result.contours) raw = contoursToPaths(result.contours);
  else {
    requireValue(typeof result.svg === 'string' && result.svg.length <= LIMITS.svgBytes && !/<(?:script|image|foreignObject|use)\b/i.test(result.svg), 'EXTRACTION_SVG_INVALID');
    raw = importSVGPaths(result.svg);
    for (const path of raw) {
      // Restore nesting roles from geometry instead of treating every later ring as a hole.
      const rings = path.subpaths.map(s => flattenSubpath(s));
      path.subpaths.forEach((s,i) => { s.role = rings.filter((r,j) => j !== i && pointInRing(rings[i][0],r)).length % 2 ? 'hole' : 'outer'; });
    }
  }
  if(result.coordinateScale){
    const scaleX=Number(result.coordinateScale.x),scaleY=Number(result.coordinateScale.y);
    requireValue(Number.isFinite(scaleX)&&scaleX>0&&Number.isFinite(scaleY)&&scaleY>0,'EXTRACTION_COORDINATE_SCALE');
    const sourceScale=Matrix.scale(scaleX,scaleY);
    for(const path of raw)path.matrix=Matrix.multiply(sourceScale,path.matrix);
    provenance.traceRaster=result.traceRaster?copy(result.traceRaster):null;
    provenance.coordinateScale={x:scaleX,y:scaleY};
  }
  const { paths, nodes } = normalizePaths(raw, prefix, provenance);
  return { schema: EXTRACTION_SCHEMA, id: prefix, provenance, paths,
    diagnostics: { adapter: adapter.id, paths: paths.length, nodes, subpaths: paths.reduce((n,p)=>n+p.subpaths.length,0),
      holes: paths.reduce((n,p)=>n+p.subpaths.filter(s=>s.role==='hole').length,0), geometrySha256: await sha256(JSON.stringify(paths)),
      elapsedMs: performance.now()-start, traceRaster:result.traceRaster?copy(result.traceRaster):null,
      coordinateScale:result.coordinateScale?copy(result.coordinateScale):null, warnings: copy(result.warnings || []) } };
}
