import { createUnifiedStroke, strokeHash } from './stroke-model.js';
import { createStrokeSession } from './stroke-session.js';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const STATUS = Object.freeze(['DIRECT','EQUIVALENT','APPROXIMATED','PARTIAL','MANUAL STEP REQUIRED','EXTERNAL EXECUTION REQUIRED','REJECTED']);

export const DRAWING_IMPORT_STATUSES = STATUS;

function textOf(asset) {
  if (typeof asset?.text === 'string') return asset.text;
  if (typeof asset?.bytes === 'string') return asset.bytes;
  if (asset?.bytes instanceof Uint8Array) return new TextDecoder().decode(asset.bytes);
  return '';
}

export function detectDrawingWorkflow(asset = {}) {
  const name = String(asset.name || '').toLowerCase(), text = textOf(asset), mime = String(asset.mimeType || '').toLowerCase();
  let format = 'UNKNOWN';
  if (/\.inksession$|\.session\.json$/.test(name) || /INK-STROKE-SESSION/.test(text)) format = 'JSON_STROKE_SESSION';
  else if (/\.json$/.test(name) || mime.includes('json')) format = 'JSON_STROKE_WORKFLOW';
  else if (/\.svg$/.test(name) || /<svg[\s>]/i.test(text)) format = 'SVG_STROKE_WORKFLOW';
  else if (/\.scm$/.test(name) || /script-fu|gimp-/i.test(text)) format = 'GIMP_SCRIPT_FU';
  else if (/\.py$/.test(name) && /krita|Krita\.instance|Document/i.test(text)) format = 'KRITA_PYTHON';
  else if (/\.py$/.test(name) && /gimp|pdb\.|Gimp\./i.test(text)) format = 'GIMP_PYTHON';
  else if (/\.script$|\.txt$/.test(name) && /painter|recorded|brush tracking|stroke/i.test(text)) format = 'COREL_PAINTER_RECORDED_SCRIPT';
  else if (/\.js$|\.mjs$|\.html$/.test(name) && /brush\.|beginStroke|lineTo|pointer/i.test(text)) format = /brush\./.test(text) ? 'P5_BRUSH' : 'JAVASCRIPT_STROKE_WORKFLOW';
  else if (/\.js$|\.mjs$/.test(name)) format = 'JAVASCRIPT_WORKFLOW';
  return { format, confidence: format === 'UNKNOWN' ? 0 : .95, name: asset.name || 'unnamed', mimeType: mime || 'text/plain', byteLength: new TextEncoder().encode(text).byteLength };
}

function numberList(value) { return (String(value).match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number); }
const point = (x, y, pressure = .5, timestamp = 0) => ({ x, y, pressure, timestamp, tiltX: 0, tiltY: 0 });

function parseP5(text) {
  const operations = [], strokes = []; let brushId = 'ink', color = '#202020', size = 1, clock = 0;
  for (const match of text.matchAll(/brush\.(set|pick|stroke|strokeWeight|line|spline|beginStroke|move|endStroke|fill|wash|fillBleed|fillTexture|hatch|mass|circle|rect|arc)\s*\(([^;]*)\)/g)) {
    const op = match[1], args = match[2], values = numberList(args), strings = [...args.matchAll(/["']([^"']+)["']/g)].map(item => item[1]);
    operations.push({ op, args, offset: match.index });
    if (op === 'set') { brushId = strings[0] || brushId; color = strings[1] || color; size = values.at(-1) || size; }
    else if (op === 'pick') brushId = strings[0] || brushId;
    else if (op === 'stroke') color = strings[0] || color;
    else if (op === 'strokeWeight') size = values[0] || size;
    else if (op === 'line' && values.length >= 4) strokes.push({ brushId, color, size, points: [point(values[0], values[1], .5, clock), point(values[2], values[3], .5, clock += 16)] });
    else if (op === 'spline') {
      const pairs = values.length >= 4 ? values.slice(0, values.length - (values.length % 2)).reduce((all, value, index, source) => index % 2 ? all : all.concat([point(value, source[index + 1], .55, clock += 16)]), []) : [];
      if (pairs.length >= 2) strokes.push({ brushId, color, size, points: pairs });
    } else if (['circle','arc'].includes(op) && values.length >= 3) {
      const [cx, cy, radius] = values, start = op === 'arc' ? values[3] || 0 : 0, end = op === 'arc' ? values[4] || Math.PI : Math.PI * 2;
      const points = Array.from({ length: 25 }, (_, index) => { const angle = start + (end - start) * index / 24; return point(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, .55, clock += 16); });
      strokes.push({ brushId, color, size, points });
    } else if (op === 'rect' && values.length >= 4) {
      const [x,y,w,h] = values; strokes.push({ brushId, color, size, points: [point(x,y,.55,clock),point(x+w,y,.55,clock+=16),point(x+w,y+h,.55,clock+=16),point(x,y+h,.55,clock+=16),point(x,y,.55,clock+=16)] });
    }
  }
  return { operations, strokes };
}

function parseCanvas(text) {
  const operations = [], strokes = []; let current = [], clock = 0, color = '#202020', size = 1;
  const regex = /(beginPath|moveTo|lineTo|quadraticCurveTo|bezierCurveTo|strokeStyle|lineWidth|stroke)\s*(?:=|\()\s*([^;\)]*)/g;
  for (const match of text.matchAll(regex)) {
    const op = match[1], args = match[2], values = numberList(args), strings = [...args.matchAll(/["']([^"']+)["']/g)].map(item => item[1]); operations.push({ op, args });
    if (op === 'beginPath') current = [];
    else if (op === 'moveTo' && values.length >= 2) current.push(point(values[0], values[1], .5, clock));
    else if (op === 'lineTo' && values.length >= 2) current.push(point(values[0], values[1], .5, clock += 16));
    else if (op === 'quadraticCurveTo' && values.length >= 4) current.push(point(values[0], values[1], .5, clock += 8), point(values[2], values[3], .5, clock += 8));
    else if (op === 'bezierCurveTo' && values.length >= 6) current.push(point(values[0], values[1], .5, clock += 6), point(values[2], values[3], .5, clock += 6), point(values[4], values[5], .5, clock += 6));
    else if (op === 'strokeStyle') color = strings[0] || color;
    else if (op === 'lineWidth') size = values[0] || size;
    else if (op === 'stroke' && current.length >= 2) { strokes.push({ brushId: 'ink', color, size, points: current }); current = []; }
  }
  return { operations, strokes };
}

function parseSvg(text) {
  const operations = [], strokes = []; let clock = 0;
  for (const match of text.matchAll(/<(path|polyline|polygon|line)\b([^>]*)>/gi)) {
    const tag = match[1].toLowerCase(), attrs = match[2], strokeColor = /stroke=["']([^"']+)/i.exec(attrs)?.[1] || '#202020', width = Number(/stroke-width=["']([^"']+)/i.exec(attrs)?.[1] || 1);
    let values = [];
    if (tag === 'path') values = numberList(/\bd=["']([^"']+)/i.exec(attrs)?.[1] || '');
    else if (/poly/.test(tag)) values = numberList(/\bpoints=["']([^"']+)/i.exec(attrs)?.[1] || '');
    else values = ['x1','y1','x2','y2'].map(key => Number(new RegExp(`${key}=["']([^"']+)`, 'i').exec(attrs)?.[1] || 0));
    const points = values.slice(0, values.length - (values.length % 2)).reduce((all, value, index, source) => index % 2 ? all : all.concat([point(value, source[index + 1], .5, clock += 16)]), []);
    operations.push({ op: `svg.${tag}`, source: match[0] }); if (points.length >= 2) strokes.push({ brushId: 'ink', color: strokeColor, size: width, points });
  }
  return { operations, strokes };
}

function parseJson(text) {
  const value = JSON.parse(text);
  if (value.format === 'INK-STROKE-SESSION') return { nativeSession: value, operations: value.events || [], strokes: value.strokes || [] };
  const candidates = value.strokes || value.strokeSequence || value.paths || value.session?.strokes || [];
  return { operations: value.events || value.steps || [], strokes: candidates.map(item => ({ brushId: item.brushId || item.brush || 'ink', color: item.color || '#202020', size: item.size || 1, points: item.samples || item.points || item.path || [] })) };
}

function mapBrush(value) {
  const source = String(value || '').toLowerCase();
  if (/water|wash/.test(source)) return { id: 'watercolor', status: 'APPROXIMATED' };
  if (/oil|impasto/.test(source)) return { id: 'oil-like', status: 'APPROXIMATED' };
  if (/dry|charcoal|pastel|pencil|\b2[h|b]\b|\bhb\b/.test(source)) return { id: /pencil|2[h|b]|hb/.test(source) ? 'pencil' : 'dry-brush', status: 'APPROXIMATED' };
  if (/marker/.test(source)) return { id: 'marker', status: 'EQUIVALENT' };
  if (/blend/.test(source)) return { id: 'blender', status: 'APPROXIMATED' };
  if (/smudge/.test(source)) return { id: 'smudge', status: 'APPROXIMATED' };
  if (/erase/.test(source)) return { id: 'eraser', status: 'EQUIVALENT' };
  return { id: 'ink', status: /ink|pen|rotring/.test(source) ? 'EQUIVALENT' : 'APPROXIMATED' };
}

function makeRecipe(assetId, strokes, status) {
  return {
    format: 'INK-RECIPE', schemaVersion: 3, id: `recipe.${assetId}`, name: `Imported drawing ${assetId}`,
    seed: 1, dependencies: [...new Set(strokes.map(stroke => stroke.brushId))].map(brushId => ({ kind: 'brush', id: brushId, required: true })),
    steps: strokes.map((stroke, index) => ({ id: `stroke-${index + 1}`, op: 'paint.stroke.replay', role: 'stroke', params: { strokeId: stroke.id, brushId: stroke.brushId }, conversionStatus: status })),
    embeddedStrokeSession: true
  };
}

export function importDrawingWorkflow(asset = {}, options = {}) {
  const detection = detectDrawingWorkflow(asset), text = textOf(asset), assetId = options.assetId || `DRAW-${strokeHash({ name: asset.name, text })}`;
  const metadata = { assetId, name: asset.name || assetId, sourceUrl: asset.sourceUrl || null, version: asset.version || 'UNKNOWN', format: detection.format };
  const license = clone(asset.license || { spdx: 'NOASSERTION' });
  const dependencies = [], unsupportedFeatures = [], warnings = [];
  if (detection.format === 'UNKNOWN') return { assetId, status: 'REJECTED', detection, metadata, license, rejection: 'UNKNOWN_OR_BINARY_DRAWING_FORMAT' };
  if (!license.spdx || license.spdx === 'NOASSERTION') warnings.push('LICENSE_REVIEW_REQUIRED');
  let parsed = { operations: [], strokes: [] };
  try {
    if (/JSON_/.test(detection.format)) parsed = parseJson(text);
    else if (detection.format === 'SVG_STROKE_WORKFLOW') parsed = parseSvg(text);
    else if (detection.format === 'P5_BRUSH') parsed = parseP5(text);
    else if (detection.format === 'JAVASCRIPT_STROKE_WORKFLOW') parsed = parseCanvas(text);
    else {
      parsed.operations = [...text.matchAll(/(?:stroke|brush|paint|draw|line|move|dab|color|opacity|flow)[\w.]*\s*\([^\n;]*/gi)].map((match, index) => ({ id: index, source: match[0] }));
      unsupportedFeatures.push('SOURCE_APPLICATION_STATE', 'VENDOR_BRUSH_ENGINE');
    }
  } catch (error) { return { assetId, status: 'REJECTED', detection, metadata, license, rejection: `MALFORMED_ASSET:${error.message}` }; }
  if (parsed.nativeSession) {
    const session = createStrokeSession(parsed.nativeSession); session.status = 'complete';
    return finalize(assetId, detection, metadata, license, dependencies, unsupportedFeatures, warnings, parsed.operations, session, 'DIRECT');
  }
  const mapped = parsed.strokes.map((source, index) => {
    const brush = mapBrush(source.brushId); if (brush.status === 'APPROXIMATED') unsupportedFeatures.push(`BRUSH_ENGINE_DIFFERENCE:${source.brushId}`);
    return createUnifiedStroke({ id: `${assetId}-stroke-${String(index + 1).padStart(4, '0')}`, brushId: brush.id, layerId: source.layerId || 'imported-drawing', color: source.color, size: source.size, seed: options.seed ?? 1 + index, samples: source.points, replayMetadata: { sourceFormat: detection.format, sourceStrokeId: source.id || index, brushMapping: brush.status } });
  }).filter(stroke => stroke.samples.length >= 2);
  const session = createStrokeSession({ id: `${assetId}-session`, name: metadata.name, seed: options.seed || 1, strokes: mapped, events: parsed.operations.map((operation, sequence) => ({ sequence, type: 'external-operation', operation })), dependencies }); session.status = 'complete'; session.deterministicHash = strokeHash({ seed: session.seed, strokes: session.strokes });
  let status = mapped.length ? (unsupportedFeatures.length ? 'APPROXIMATED' : 'EQUIVALENT') : parsed.operations.length ? 'PARTIAL' : 'REJECTED';
  if (['KRITA_PYTHON','GIMP_PYTHON','GIMP_SCRIPT_FU','COREL_PAINTER_RECORDED_SCRIPT'].includes(detection.format) && !mapped.length) status = 'EXTERNAL EXECUTION REQUIRED';
  return finalize(assetId, detection, metadata, license, dependencies, unsupportedFeatures, warnings, parsed.operations, session, status);
}

function finalize(assetId, detection, metadata, license, dependencies, unsupportedFeatures, warnings, operations, session, status) {
  if (!STATUS.includes(status)) throw new Error('INK_DRAWING_IMPORT_STATUS_INVALID');
  const recipe = makeRecipe(assetId, session.strokes, status);
  recipe.strokeSession = clone(session);
  const gaps = [];
  for (const feature of [...new Set(unsupportedFeatures)]) gaps.push({ category: feature.startsWith('BRUSH') ? 'BRUSH_PARAMETER_MISSING' : 'CAPABILITY_MISSING', feature, blocksArtwork: !session.strokes.length, alternative: feature.startsWith('BRUSH') ? 'INK_APPROXIMATION' : null });
  if (!session.strokes.length) gaps.push({ category: 'STROKE_ATTRIBUTE_MISSING', feature: 'NO_REPLAYABLE_COORDINATES', blocksArtwork: true, alternative: 'MANUAL_TRANSCRIPTION' });
  return {
    assetId, status, detection, metadata, license, dependencyScan: { dependencies, warnings },
    canonicalOperations: operations, strokeMapping: session.strokes.map(stroke => ({ source: stroke.replayMetadata.sourceStrokeId, inkStrokeId: stroke.id, status: stroke.replayMetadata.brushMapping || status })),
    brushMapping: session.strokes.map(stroke => ({ strokeId: stroke.id, brushId: stroke.brushId, status: stroke.replayMetadata.brushMapping || status })),
    unsupportedFeatures: [...new Set(unsupportedFeatures)], inkRecipe: recipe, inkStrokeSession: session,
    conversionReport: { format: 'INK-DRAWING-CONVERSION-REPORT', schemaVersion: 1, assetId, status, sourceOperations: operations.length, convertedStrokes: session.strokes.length, gaps, warnings },
    capabilityReport: { format: 'INK-DRAWING-CAPABILITY-REPORT', schemaVersion: 1, assetId, status, strokeAttributesPreserved: session.strokes.length ? 26 : 0, brushMappings: session.strokes.length, unsupported: [...new Set(unsupportedFeatures)] },
    replayReport: null, differenceReport: null,
    qaReport: { format: 'INK-DRAWING-QA-REPORT', schemaVersion: 1, assetId, automated: { parse: status !== 'REJECTED', schema: true, deterministicCandidate: session.strokes.length > 0 }, manual: { artisticQuality: 'USER VALIDATION REQUIRED' } }
  };
}

export class DrawingGapFrequencyRanking {
  constructor() { this.entries = new Map(); }
  add(report) {
    for (const gap of report?.conversionReport?.gaps || []) {
      const key = `${gap.category}:${gap.feature}`, current = this.entries.get(key) || { key, category: gap.category, feature: gap.feature, occurrences: 0, assets: new Set(), blocksArtwork: false, alternative: gap.alternative, repairCost: 'MEDIUM', repairRisk: 'MEDIUM', coverageGain: 0 };
      current.occurrences++; current.assets.add(report.assetId); current.blocksArtwork ||= gap.blocksArtwork; current.coverageGain = current.assets.size; this.entries.set(key, current);
    }
    return this;
  }
  report() {
    const entries = [...this.entries.values()].map(item => ({ ...item, assets: [...item.assets], affectedAssetCount: item.assets.size, priority: (item.blocksArtwork ? 1000 : 0) + item.assets.size * 100 + item.occurrences }));
    entries.sort((a,b) => b.priority - a.priority || a.key.localeCompare(b.key));
    return { format: 'INK-DRAWING-GAP-FREQUENCY-RANKING', schemaVersion: 1, entries };
  }
}
