import { AICommandError, hashValue } from './ai-core.js';
import { CHAT_RUNTIME_VERSION, RuntimeError } from './chat-runtime.js';

const clone = value => value === undefined ? undefined : structuredClone(value);
const now = () => new Date().toISOString();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rgbToHex = (r, g, b) => `#${[r, g, b].map(value => value.toString(16).padStart(2, '0')).join('')}`;
const luminance = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function assertPixels(input) {
  if (!input || !Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 1 || input.height < 1) throw new RuntimeError('DAMAGED_IMAGE', 'Image dimensions are missing or damaged.');
  if (!input.data || input.data.length < input.width * input.height * 4) throw new RuntimeError('DAMAGED_IMAGE', 'Decoded RGBA pixels are incomplete.');
  if (input.width * input.height > 100_000_000) throw new RuntimeError('IMAGE_TOO_LARGE', 'Image exceeds the local analyzer safety limit.', { width: input.width, height: input.height });
  return input;
}

function quantizedPalette(image, step) {
  const bins = new Map(), data = image.data;
  for (let index = 0; index < data.length; index += 4 * step) {
    if (data[index + 3] < 16) continue;
    const r = Math.round(data[index] / 32) * 32, g = Math.round(data[index + 1] / 32) * 32, b = Math.round(data[index + 2] / 32) * 32, key = `${clamp(r, 0, 255)},${clamp(g, 0, 255)},${clamp(b, 0, 255)}`;
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  const total = [...bins.values()].reduce((sum, value) => sum + value, 0) || 1;
  return [...bins].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, count]) => { const [r, g, b] = key.split(',').map(Number); return { color: rgbToHex(r, g, b), ratio: count / total, luminance: luminance(r, g, b) }; });
}

function analyzeGrid(image, sampleStep) {
  const { width, height, data } = image, cells = Array.from({ length: 16 }, () => ({ light: 0, alpha: 0, edge: 0, samples: 0 }));
  let transparent = 0, samples = 0, totalLight = 0, totalEdge = 0, horizontalEdge = 0, verticalEdge = 0;
  const at = (x, y) => { const i = (y * width + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  for (let y = 1; y < height - 1; y += sampleStep) for (let x = 1; x < width - 1; x += sampleStep) {
    const [r, g, b, a] = at(x, y), light = luminance(r, g, b), left = at(x - 1, y), right = at(x + 1, y), up = at(x, y - 1), down = at(x, y + 1);
    const gx = Math.abs(luminance(...right) - luminance(...left)), gy = Math.abs(luminance(...down) - luminance(...up)), edge = Math.min(1, Math.sqrt(gx * gx + gy * gy));
    const cell = cells[Math.min(3, Math.floor(y / height * 4)) * 4 + Math.min(3, Math.floor(x / width * 4))]; cell.light += light; cell.alpha += a / 255; cell.edge += edge; cell.samples++;
    samples++; totalLight += light; totalEdge += edge; horizontalEdge += gx; verticalEdge += gy; if (a < 250) transparent++;
  }
  for (const cell of cells) { const count = cell.samples || 1; cell.light /= count; cell.alpha /= count; cell.edge /= count; }
  return { cells, samples, meanLuminance: totalLight / (samples || 1), edgeDensity: totalEdge / (samples || 1), horizontalEdge: horizontalEdge / (samples || 1), verticalEdge: verticalEdge / (samples || 1), transparencyRatio: transparent / (samples || 1) };
}

function regionsFromGrid(grid) {
  const lights = grid.cells.map(cell => cell.light), mean = lights.reduce((a, b) => a + b, 0) / lights.length;
  const groups = [], visited = new Set(), neighbors = index => { const x = index % 4, y = Math.floor(index / 4), out = []; if (x) out.push(index - 1); if (x < 3) out.push(index + 1); if (y) out.push(index - 4); if (y < 3) out.push(index + 4); return out; };
  for (let start = 0; start < 16; start++) { if (visited.has(start)) continue; const dark = lights[start] < mean, queue = [start], members = []; visited.add(start); while (queue.length) { const current = queue.shift(); members.push(current); for (const next of neighbors(current)) if (!visited.has(next) && (lights[next] < mean) === dark) { visited.add(next); queue.push(next); } } groups.push({ type: dark ? 'DARK' : 'LIGHT', cells: members }); }
  return groups.sort((a, b) => b.cells.length - a.cells.length).slice(0, 6).map((group, index) => { const xs = group.cells.map(cell => cell % 4), ys = group.cells.map(cell => Math.floor(cell / 4)); return { regionId: `local-region-${index + 1}`, kind: group.type, boundsNormalized: { x: Math.min(...xs) / 4, y: Math.min(...ys) / 4, w: (Math.max(...xs) - Math.min(...xs) + 1) / 4, h: (Math.max(...ys) - Math.min(...ys) + 1) / 4 }, cellCount: group.cells.length, confidence: group.cells.length >= 3 ? 0.74 : 0.52 }; });
}

export class ImageToPlanLocalAnalyzer {
  analyze(raw, { mimeType = raw?.type || 'image/rgba', fileName = null } = {}) {
    if (mimeType && !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/rgba'].includes(mimeType)) throw new RuntimeError('UNSUPPORTED_IMAGE', 'Unsupported image type.', { mimeType });
    const image = assertPixels(raw), pixels = image.width * image.height, step = Math.max(1, Math.floor(Math.sqrt(pixels / 40000))), palette = quantizedPalette(image, step), grid = analyzeGrid(image, step), regions = regionsFromGrid(grid);
    const aspect = image.width / image.height, regularity = 1 - Math.min(1, Math.abs(grid.horizontalEdge - grid.verticalEdge) / Math.max(0.001, grid.edgeDensity)), repeatedCells = grid.cells.filter((cell, index, cells) => cells.some((other, otherIndex) => otherIndex !== index && Math.abs(cell.light - other.light) < 0.025 && Math.abs(cell.edge - other.edge) < 0.02)).length;
    const geometric = grid.edgeDensity > 0.09 && regularity > 0.58, lowResolution = Math.min(image.width, image.height) < 256, transparent = grid.transparencyRatio > 0.01;
    return {
      format: 'INK-LOCAL-IMAGE-ANALYSIS', version: CHAT_RUNTIME_VERSION, analysisId: `image-analysis:${hashValue([image.width, image.height, [...image.data.slice(0, 2048)]])}`, source: { fileName, mimeType, width: image.width, height: image.height, aspectRatio: aspect, pixels, lowResolution, alpha: transparent, transparencyRatio: grid.transparencyRatio },
      palette, luminanceZones: grid.cells.map((cell, index) => ({ cell: index, luminance: cell.light, alpha: cell.alpha })), edgeDistribution: { density: grid.edgeDensity, horizontal: grid.horizontalEdge, vertical: grid.verticalEdge }, majorRegions: regions,
      foregroundBackgroundCandidates: regions.slice(0, 2).map((region, index) => ({ ...region, role: index === 0 ? 'BACKGROUND_CANDIDATE' : 'FOREGROUND_CANDIDATE' })),
      geometryCandidates: geometric ? [{ type: 'GRID_OR_AXIS_ALIGNED', confidence: Math.min(0.9, regularity) }, { type: Math.abs(aspect - 1) < 0.08 ? 'RADIAL_OR_SQUARE' : 'RECTANGULAR_COMPOSITION', confidence: 0.65 }] : [],
      repetitionCandidates: repeatedCells >= 6 ? [{ type: 'REPEATED_TONAL_OR_TEXTURE_CELL', countEstimate: repeatedCells, confidence: 0.61 }] : [],
      textureStatistics: { edgeDensity: grid.edgeDensity, complexity: clamp(grid.edgeDensity * 4, 0, 1), regularity },
      candidateModes: { vector: geometric || grid.edgeDensity > 0.13 ? ['EDGE_PATHS', 'GEOMETRIC_REGIONS'] : [], handDrawn: grid.edgeDensity > 0.035 ? ['CONTOUR_GUIDES', 'TEXTURE_STROKES'] : [], imageProcessing: ['PALETTE_ADJUSTMENT', 'REGIONAL_CONTRAST', ...(transparent ? ['ALPHA_PRESERVATION'] : [])] },
      observations: [`${image.width}×${image.height} ${mimeType}`, `${palette.length} dominant quantized colors`, `${regions.length} coarse luminance regions`, transparent ? 'Transparency detected' : 'No material transparency detected'],
      hypotheses: [{ label: geometric ? 'geometry-led image' : 'organic or photographic image', confidence: geometric ? 0.72 : 0.64 }, { label: lowResolution ? 'detail recovery is limited' : 'resolution supports regional planning', confidence: lowResolution ? 0.96 : 0.81 }],
      rejectedCandidates: geometric ? [] : [{ label: 'strict geometric formalization', reason: 'edge regularity is insufficient' }], unresolvedAreas: regions.filter(region => region.confidence < 0.6),
      supportedTransmissionChoices: ['NO_IMAGE', 'TEXT_SUMMARY', 'SELECTED_REGION', 'LOW_RES_PREVIEW', 'FULL_IMAGE'], defaultTransmission: 'NO_IMAGE', formalDocumentMutation: false, nextState: 'PROPOSE'
    };
  }
}

export class ImageTransmissionConsent {
  constructor({ analysis, provider, endpoint, model, option = 'NO_IMAGE', region = null, transmissionResolution = null, thumbnail = null, providerSavesData = 'UNKNOWN' } = {}) {
    if (!analysis?.analysisId) throw new RuntimeError('IMAGE_ANALYSIS_REQUIRED', 'Local image analysis is required before consent.');
    if (!analysis.supportedTransmissionChoices.includes(option)) throw new RuntimeError('IMAGE_POLICY_INVALID', 'Image transmission option is not supported.', { option });
    if (option === 'SELECTED_REGION' && !region) throw new RuntimeError('IMAGE_REGION_REQUIRED', 'A selected region is required.');
    this.format = 'INK-IMAGE-TRANSMISSION-CONSENT'; this.version = CHAT_RUNTIME_VERSION; this.consentId = `consent:${hashValue([analysis.analysisId, option, now()])}`; this.analysisId = analysis.analysisId; this.thumbnail = thumbnail; this.size = { width: analysis.source.width, height: analysis.source.height }; this.transmissionResolution = option === 'LOW_RES_PREVIEW' ? transmissionResolution || { maximumDimension: 768 } : transmissionResolution; this.cropped = option === 'SELECTED_REGION'; this.region = region; this.provider = provider; this.endpoint = endpoint; this.model = model; this.providerSavesData = providerSavesData; this.option = option; this.risks = option === 'NO_IMAGE' ? [] : ['External processing and provider retention policy may apply.']; this.approved = false; this.createdAt = now();
  }
  approve() { this.approved = true; this.decidedAt = now(); return clone(this); }
  cancel() { this.approved = false; this.cancelled = true; this.decidedAt = now(); return clone(this); }
}

export function imageAnalysisToModelPlan(analysis, response = {}) {
  return { format: 'INK-MODEL-PLAN', version: CHAT_RUNTIME_VERSION, userIntent: response.userIntent || '依圖片建立可編輯操作計畫', observation: response.observation || analysis.observations, hypothesis: response.hypothesis || analysis.hypotheses, targetCandidates: response.targetCandidates || analysis.majorRegions, semanticLabels: response.semanticLabels || [], confidence: Number(response.confidence ?? Math.min(...analysis.hypotheses.map(item => item.confidence))), rejectedCandidates: response.rejectedCandidates || analysis.rejectedCandidates, unresolvedAreas: response.unresolvedAreas || analysis.unresolvedAreas, proposedWorkflow: response.proposedWorkflow || ['review local analysis', 'resolve targets', 'preview editable operations'], orderedSteps: response.orderedSteps || [], unsupportedItems: response.unsupportedItems || (analysis.source.lowResolution ? ['fine-detail reconstruction'] : []), rollbackStrategy: 'CHECKPOINT_AND_INVERSE_PATCH', destructiveOperations: [], requestedAction: 'PROPOSE', localAnalysisId: analysis.analysisId };
}

export class DocumentToPlanRuntime {
  constructor(layer) { this.layer = layer; }
  analyze({ goal = '提出下一步修改方案', largeDocumentThreshold = 50000 } = {}) {
    const state = this.layer.stateReader.read(this.layer.currentDocument(), { limit: 2000 }), layers = state.layerTree || [], objects = [...(state.objectIndex || []), ...(state.strokeIndex || [])], objective = [], subjective = [], choices = [], safe = [], destructive = [], unsupported = [];
    if (!objects.length) objective.push({ issue: 'EMPTY_DOCUMENT', evidence: { objectCount: 0 } });
    if (layers.some(layer => !layer.name || /^Layer \d+$/i.test(layer.name))) objective.push({ issue: 'GENERIC_LAYER_NAMES', evidence: { layerIds: layers.filter(layer => !layer.name || /^Layer \d+$/i.test(layer.name)).map(layer => layer.layerId) } });
    const names = new Map(); for (const layer of layers) names.set(layer.name, (names.get(layer.name) || 0) + 1); if ([...names.values()].some(count => count > 1)) objective.push({ issue: 'DUPLICATE_LAYER_NAMES', evidence: [...names].filter(([, count]) => count > 1) });
    const duplicateStrokes = new Map(); for (const stroke of state.strokeIndex || []) { const key = hashValue([stroke.layerId, stroke.brushId, stroke.pointCount, stroke.bounds]); duplicateStrokes.set(key, [...(duplicateStrokes.get(key) || []), stroke.strokeId]); } if ([...duplicateStrokes.values()].some(ids => ids.length > 1)) objective.push({ issue: 'POSSIBLE_DUPLICATE_STROKES', evidence: [...duplicateStrokes.values()].filter(ids => ids.length > 1) });
    const locked = layers.filter(layer => layer.locked).map(layer => layer.layerId), protectedTargets = state.protectedTargets || []; if (locked.length || protectedTargets.length) choices.push({ choice: 'PROTECTED_CONTENT_POLICY', lockedLayers: locked, protectedTargets });
    if ((state.palette || []).length > 12) subjective.push({ suggestion: 'CONSIDER_PALETTE_CONSOLIDATION', basis: 'palette contains more than 12 recent colors', notObjectiveError: true });
    if (layers.find(layer => /background|背景/i.test(layer.name) && (layer.opacity ?? 1) > 0.85)) subjective.push({ suggestion: 'REVIEW_BACKGROUND_STRENGTH', basis: 'background layer opacity is high', notObjectiveError: true });
    if (!state.selection?.length && objects.length > 1) choices.push({ choice: 'TARGET_REQUIRED', reason: 'No current selection; artistic scope must be chosen by the user.' });
    for (const issue of objective) if (['GENERIC_LAYER_NAMES', 'DUPLICATE_LAYER_NAMES'].includes(issue.issue)) safe.push({ operation: 'layer.rename', target: issue.evidence.layerIds || [], parameters: {}, requiresUserNames: true });
    if (locked.length) destructive.push({ operation: 'layer.delete', target: locked, blocked: true, reason: 'locked layer' });
    if (state.query.total > largeDocumentThreshold) unsupported.push({ edit: 'FULL_DOCUMENT_DETAILED_CONTEXT', reason: 'large document must use target context' });
    return { format: 'INK-DOCUMENT-TO-PLAN-ANALYSIS', version: CHAT_RUNTIME_VERSION, goal, documentVersion: state.documentVersion, documentHash: state.documentHash, layerHash: hashValue(state.layerTree), targetHash: hashValue([state.objectIndex, state.strokeIndex, state.regionIndex]), selectionHash: hashValue(state.selection), capabilityVersion: state.capabilityState.version, assetHash: hashValue(this.layer.currentDocument().assets || []), observation: { layers: layers.length, objects: objects.length, strokes: state.strokeIndex.length, unsaved: Boolean(this.layer.currentDocument().dirty), largeDocument: state.query.total > largeDocumentThreshold }, objectiveIssues: objective, subjectiveSuggestions: subjective, requiredUserChoices: choices, safeAutomaticEdits: safe, destructiveEdits: destructive, unsupportedEdits: unsupported, permission: 'PROPOSE', confidence: choices.length ? 0.64 : 0.84 };
  }
  toPlan(analysis, choices = {}) {
    const steps = analysis.safeAutomaticEdits.filter(step => !step.requiresUserNames || choices.layerNames).map((step, index) => ({ stepId: `document-step-${index + 1}`, enabled: true, operation: step.operation, target: step.target, parameters: step.requiresUserNames ? { names: choices.layerNames } : step.parameters, constraints: { preserveOutsideTarget: true } }));
    if (!steps.length) throw new AICommandError('USER_EDIT_REQUIRED', 'Document analysis needs a user choice before it can create executable steps.', { choices: analysis.requiredUserChoices });
    return this.layer.createPlanFromSteps(analysis.goal, steps, { confidence: analysis.confidence, observations: analysis.objectiveIssues, hypotheses: analysis.subjectiveSuggestions, unresolvedItems: analysis.requiredUserChoices, rollbackStrategy: 'CHECKPOINT_AND_INVERSE_PATCH', baseDocumentVersion: analysis.documentVersion, layerHash: analysis.layerHash, targetHash: analysis.targetHash, selectionHash: analysis.selectionHash, capabilityVersion: analysis.capabilityVersion, assetHash: analysis.assetHash });
  }
}

export class VersionConflictControl {
  constructor(layer) { this.layer = layer; }
  snapshot() { const state = this.layer.stateReader.read(this.layer.currentDocument(), { limit: 2000 }); return { baseDocumentVersion: state.documentVersion, documentHash: state.documentHash, layerHash: hashValue(state.layerTree), targetHash: hashValue([state.objectIndex, state.strokeIndex, state.regionIndex]), selectionHash: hashValue(state.selection), capabilityVersion: state.capabilityState.version, assetHash: hashValue(this.layer.currentDocument().assets || []) }; }
  attach(plan) { return Object.assign(plan, this.snapshot(), { planHash: hashValue({ steps: plan.orderedSteps, base: this.snapshot() }) }); }
  check(plan) { const current = this.snapshot(), expected = { baseDocumentVersion: plan.baseDocumentVersion, documentHash: plan.documentHash || plan.preconditions?.[0]?.documentHash, layerHash: plan.layerHash, targetHash: plan.targetHash, selectionHash: plan.selectionHash, capabilityVersion: plan.capabilityVersion, assetHash: plan.assetHash }, conflicts = Object.entries(expected).filter(([, value]) => value != null).filter(([key, value]) => current[key] !== value).map(([key, expectedValue]) => ({ field: key, expected: expectedValue, actual: current[key] })); return { valid: conflicts.length === 0, stale: conflicts.length > 0, conflicts, affectedSteps: conflicts.length ? (plan.orderedSteps || []).map(step => step.stepId) : [], actions: conflicts.length ? ['REBASE', 'REPREVIEW', 'CANCEL'] : ['CONTINUE'] }; }
  assertCurrent(plan) { const result = this.check(plan); if (!result.valid) throw new RuntimeError('DOCUMENT_VERSION_CONFLICT', 'Plan base no longer matches the formal document.', result); return result; }
  markPreview(preview, plan) { const result = this.check(plan); preview.status = result.stale ? 'STALE' : preview.status; preview.approvalBlocked = result.stale; preview.conflicts = result.conflicts; return preview; }
}
