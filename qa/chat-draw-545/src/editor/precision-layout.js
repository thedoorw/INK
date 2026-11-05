import { stableCompositeId } from '../core/stable-id.js';

function fail(code, details = {}) {
  throw Object.assign(new Error(`INK_PRECISION_LAYOUT_${code}`), { code: `PRECISION_LAYOUT_${code}`, ...details });
}

const clone = value => JSON.parse(JSON.stringify(value));

function normalizeBounds(bounds, label = 'bounds') {
  if (!bounds || ![bounds.x,bounds.y,bounds.w,bounds.h].every(Number.isFinite) || bounds.w < 0 || bounds.h < 0) fail('BOUNDS_INVALID', { label });
  return { x:+bounds.x, y:+bounds.y, w:+bounds.w, h:+bounds.h };
}

export function normalizeRulerGuide(raw = {}) {
  const orientation = raw.orientation === 'vertical' ? 'vertical' : raw.orientation === 'horizontal' ? 'horizontal' : null;
  if (!orientation || !Number.isFinite(+raw.position)) fail('GUIDE_INVALID');
  const position = +raw.position;
  const id = raw.id == null ? stableCompositeId('guide', [orientation, String(position)]) : String(raw.id);
  return { id, orientation, position, locked: Boolean(raw.locked), visible: raw.visible !== false };
}

export function addRulerGuide(guides = [], guide) {
  if (!Array.isArray(guides)) fail('GUIDE_STATE_INVALID');
  const next = normalizeRulerGuide(guide);
  if (guides.some(item => item?.id === next.id)) fail('GUIDE_ID_DUPLICATE', { id: next.id });
  return [...guides.map(item => normalizeRulerGuide(item)), next];
}

export function moveRulerGuide(guides = [], id, position) {
  if (!Array.isArray(guides) || !Number.isFinite(+position)) fail('GUIDE_STATE_INVALID');
  let found = false;
  const next = guides.map(item => {
    const guide = normalizeRulerGuide(item);
    if (guide.id !== id) return guide;
    found = true;
    if (guide.locked) fail('GUIDE_LOCKED', { id });
    return { ...guide, position:+position };
  });
  if (!found) fail('GUIDE_NOT_FOUND', { id });
  return next;
}

export function removeRulerGuide(guides = [], id) {
  if (!Array.isArray(guides)) fail('GUIDE_STATE_INVALID');
  const normalized = guides.map(item => normalizeRulerGuide(item));
  if (!normalized.some(item => item.id === id)) fail('GUIDE_NOT_FOUND', { id });
  return normalized.filter(item => item.id !== id);
}

function axisValues(bounds, axis) {
  return axis === 'x'
    ? { start:bounds.x, end:bounds.x+bounds.w, size:bounds.w }
    : { start:bounds.y, end:bounds.y+bounds.h, size:bounds.h };
}

function equalGapCandidates(moving, peers, axis) {
  const source = axisValues(moving, axis);
  const peerValues = peers.map((bounds,index)=>({ ...axisValues(bounds,axis), index })).sort((a,b)=>a.start-b.start || a.end-b.end || a.index-b.index);
  const candidates = [];
  for (let leftIndex=0; leftIndex<peerValues.length; leftIndex+=1) {
    for (let rightIndex=leftIndex+1; rightIndex<peerValues.length; rightIndex+=1) {
      const left=peerValues[leftIndex], right=peerValues[rightIndex];
      const existingGap=right.start-left.end;
      if (existingGap < 0) continue;
      const betweenStart=left.end+(right.start-left.end-source.size)/2;
      const betweenGap=betweenStart-left.end;
      if (betweenGap >= 0) candidates.push({ delta:betweenStart-source.start, evidence:{type:'equal-between',axis,leftPeer:left.index,rightPeer:right.index,gap:betweenGap} });
      candidates.push({ delta:(right.end+existingGap)-source.start, evidence:{type:'match-existing-gap-after',axis,leftPeer:left.index,rightPeer:right.index,gap:existingGap} });
      candidates.push({ delta:(left.start-existingGap-source.size)-source.start, evidence:{type:'match-existing-gap-before',axis,leftPeer:left.index,rightPeer:right.index,gap:existingGap} });
    }
  }
  return candidates;
}

function chooseCandidate(candidates, tolerance) {
  return candidates.filter(candidate=>Math.abs(candidate.delta)<=tolerance).sort((a,b)=>
    Math.abs(a.delta)-Math.abs(b.delta) ||
    a.delta-b.delta ||
    a.evidence.type.localeCompare(b.evidence.type) ||
    a.evidence.leftPeer-b.evidence.leftPeer ||
    a.evidence.rightPeer-b.evidence.rightPeer
  )[0] || null;
}

export function equalDistanceSmartSnap(movingBounds, peerBounds = [], { tolerance = 4 } = {}) {
  const moving = normalizeBounds(movingBounds, 'moving');
  if (!Array.isArray(peerBounds) || !Number.isFinite(+tolerance) || +tolerance < 0) fail('SNAP_INPUT_INVALID');
  const peers = peerBounds.map((bounds,index)=>normalizeBounds(bounds, `peer:${index}`));
  const x = chooseCandidate(equalGapCandidates(moving, peers, 'x'), +tolerance);
  const y = chooseCandidate(equalGapCandidates(moving, peers, 'y'), +tolerance);
  return {
    delta: { x:x?.delta || 0, y:y?.delta || 0 },
    snapped: { x:Boolean(x), y:Boolean(y) },
    evidence: { x:x?.evidence || null, y:y?.evidence || null }
  };
}

export function measurePoints(from, to) {
  if (!from || !to || ![from.x,from.y,to.x,to.y].every(Number.isFinite)) fail('MEASURE_POINT_INVALID');
  const dx=to.x-from.x, dy=to.y-from.y;
  return { from:{x:from.x,y:from.y}, to:{x:to.x,y:to.y}, dx, dy, distance:Math.hypot(dx,dy), angleDegrees:Math.atan2(dy,dx)*180/Math.PI };
}

export function measureBounds(bounds) {
  const value=normalizeBounds(bounds);
  return { ...clone(value), width:value.w, height:value.h, center:{x:value.x+value.w/2,y:value.y+value.h/2} };
}


export const SNAP_CATEGORIES = Object.freeze(['guides','edges','centers','grid','angle','equalDistance']);

export function normalizeSnapSettings(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const categories = source.categories && typeof source.categories === 'object' ? source.categories : {};
  const tolerance = Number.isFinite(+source.tolerance) ? Math.max(0.1, Math.min(64, +source.tolerance)) : 7;
  const hysteresis = Number.isFinite(+source.hysteresis) ? Math.max(0, Math.min(32, +source.hysteresis)) : 2;
  const angleStep = Number.isFinite(+source.angleStep) ? Math.max(0.1, Math.min(180, +source.angleStep)) : 15;
  return {
    enabled: source.enabled !== false,
    categories: {
      guides: categories.guides !== false,
      edges: categories.edges !== false,
      centers: categories.centers !== false,
      grid: categories.grid === true,
      angle: categories.angle !== false,
      equalDistance: categories.equalDistance !== false
    },
    tolerance,
    hysteresis,
    angleStep
  };
}

export function setSnapEnabled(settings, enabled) {
  const next = normalizeSnapSettings(settings);
  next.enabled = Boolean(enabled);
  return next;
}

export function setSnapCategory(settings, category, enabled) {
  if (!SNAP_CATEGORIES.includes(category)) fail('SNAP_CATEGORY_INVALID', { category });
  const next = normalizeSnapSettings(settings);
  next.categories[category] = Boolean(enabled);
  return next;
}

export function setRulerGuideLocked(guides = [], id, locked = true) {
  if (!Array.isArray(guides)) fail('GUIDE_STATE_INVALID');
  let found = false;
  const next = guides.map(item => {
    const guide = normalizeRulerGuide(item);
    if (guide.id !== id) return guide;
    found = true;
    return { ...guide, locked: Boolean(locked) };
  });
  if (!found) fail('GUIDE_NOT_FOUND', { id });
  return next;
}

export function setRulerGuideVisibility(guides = [], id, visible = true) {
  if (!Array.isArray(guides)) fail('GUIDE_STATE_INVALID');
  let found = false;
  const next = guides.map(item => {
    const guide = normalizeRulerGuide(item);
    if (guide.id !== id) return guide;
    found = true;
    return { ...guide, visible: Boolean(visible) };
  });
  if (!found) fail('GUIDE_NOT_FOUND', { id });
  return next;
}

function snapFeatures(bounds, axis) {
  const values = axisValues(bounds, axis);
  return [
    { role: 'start', value: values.start },
    { role: 'center', value: values.start + values.size / 2 },
    { role: 'end', value: values.end }
  ];
}

function snapCandidate(delta, targetValue, evidence) {
  return { delta, targetValue, evidence };
}

function bestSnapCandidate(candidates, tolerance, previousEvidence = null, hysteresis = 0) {
  const valid = candidates.filter(candidate => Number.isFinite(candidate?.delta) && Math.abs(candidate.delta) <= tolerance);
  const previous = previousEvidence?.candidateKey;
  if (previous) {
    const held = candidates
      .filter(candidate => candidate?.evidence?.candidateKey === previous && Math.abs(candidate.delta) <= tolerance + hysteresis)
      .sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta))[0];
    if (held) return held;
  }
  return valid.sort((a,b)=>
    Math.abs(a.delta)-Math.abs(b.delta) ||
    String(a.evidence?.candidateKey || '').localeCompare(String(b.evidence?.candidateKey || ''))
  )[0] || null;
}

function axisSnapCandidates(moving, peers, guides, axis, settings, gridSize) {
  const candidates = [];
  const features = snapFeatures(moving, axis);
  const addTarget = (targetValue, type, targetId = null, targetRole = null) => {
    for (const feature of features) {
      const delta = targetValue - feature.value;
      candidates.push(snapCandidate(delta, targetValue, {
        type,
        axis,
        sourceRole: feature.role,
        targetRole,
        targetId,
        candidateKey: [type, axis, feature.role, targetId ?? targetValue, targetRole ?? ''].join(':')
      }));
    }
  };
  if (settings.categories.guides) {
    for (const raw of guides || []) {
      const guide = normalizeRulerGuide(raw);
      if (!guide.visible) continue;
      if ((axis === 'x' && guide.orientation !== 'vertical') || (axis === 'y' && guide.orientation !== 'horizontal')) continue;
      addTarget(guide.position, 'guide', guide.id, 'guide');
    }
  }
  if (settings.categories.edges || settings.categories.centers) {
    addTarget(0, 'origin', 'document-origin', axis);
    peers.forEach((bounds, index) => {
      const values = axisValues(bounds, axis);
      if (settings.categories.edges) {
        addTarget(values.start, 'edge', index, 'start');
        addTarget(values.end, 'edge', index, 'end');
      }
      if (settings.categories.centers) addTarget(values.start + values.size / 2, 'center', index, 'center');
    });
  }
  if (settings.categories.grid && Number.isFinite(+gridSize) && +gridSize > 0) {
    const step = +gridSize;
    for (const feature of features) {
      const targetValue = Math.round(feature.value / step) * step;
      candidates.push(snapCandidate(targetValue - feature.value, targetValue, {
        type: 'grid',
        axis,
        sourceRole: feature.role,
        targetRole: 'grid',
        targetId: String(Math.round(targetValue / step)),
        candidateKey: ['grid',axis,feature.role,Math.round(targetValue / step)].join(':')
      }));
    }
  }
  return candidates;
}

export function resolveManipulationSnap(movingBounds, peerBounds = [], {
  delta = { x: 0, y: 0 },
  guides = [],
  gridSize = null,
  settings = {},
  tolerance = null,
  hysteresis = null,
  previousEvidence = null,
  bypass = false
} = {}) {
  const moving = normalizeBounds(movingBounds, 'moving');
  const peers = Array.isArray(peerBounds) ? peerBounds.map((bounds,index)=>normalizeBounds(bounds, `peer:${index}`)) : [];
  const normalized = normalizeSnapSettings(settings);
  const threshold = tolerance == null ? normalized.tolerance : Math.max(0, +tolerance || 0);
  const hold = hysteresis == null ? normalized.hysteresis : Math.max(0, +hysteresis || 0);
  const proposed = { x: moving.x + (+delta.x || 0), y: moving.y + (+delta.y || 0), w: moving.w, h: moving.h };
  if (bypass || !normalized.enabled) {
    return { delta: { x: +delta.x || 0, y: +delta.y || 0 }, snapped: { x: false, y: false }, evidence: { x: null, y: null }, bypassed: Boolean(bypass) };
  }
  const xCandidates = axisSnapCandidates(proposed, peers, guides, 'x', normalized, gridSize);
  const yCandidates = axisSnapCandidates(proposed, peers, guides, 'y', normalized, gridSize);
  if (normalized.categories.equalDistance && peers.length >= 2) {
    const equal = equalDistanceSmartSnap(proposed, peers, { tolerance: threshold });
    if (equal.snapped.x) xCandidates.push(snapCandidate(equal.delta.x, proposed.x + equal.delta.x, {
      ...equal.evidence.x, type: 'equal-distance', axis: 'x',
      candidateKey: ['equal-distance','x',equal.evidence.x?.type,equal.evidence.x?.leftPeer,equal.evidence.x?.rightPeer].join(':')
    }));
    if (equal.snapped.y) yCandidates.push(snapCandidate(equal.delta.y, proposed.y + equal.delta.y, {
      ...equal.evidence.y, type: 'equal-distance', axis: 'y',
      candidateKey: ['equal-distance','y',equal.evidence.y?.type,equal.evidence.y?.leftPeer,equal.evidence.y?.rightPeer].join(':')
    }));
  }
  const x = bestSnapCandidate(xCandidates, threshold, previousEvidence?.x, hold);
  const y = bestSnapCandidate(yCandidates, threshold, previousEvidence?.y, hold);
  const evidence = {
    x: x ? { ...x.evidence, correction: x.delta, targetValue: x.targetValue, line: { axis: 'x', value: x.targetValue } } : null,
    y: y ? { ...y.evidence, correction: y.delta, targetValue: y.targetValue, line: { axis: 'y', value: y.targetValue } } : null
  };
  return {
    delta: { x: (+delta.x || 0) + (x?.delta || 0), y: (+delta.y || 0) + (y?.delta || 0) },
    snapped: { x: Boolean(x), y: Boolean(y) },
    evidence,
    bypassed: false
  };
}

export function resolveAngleSnap(angleRadians, { settings = {}, bypass = false, force = false } = {}) {
  const normalized = normalizeSnapSettings(settings);
  const angle = Number(angleRadians);
  if (!Number.isFinite(angle)) fail('SNAP_ANGLE_INVALID');
  if (bypass || (!force && (!normalized.enabled || !normalized.categories.angle))) {
    return { angle, snapped: false, evidence: null, bypassed: Boolean(bypass) };
  }
  const step = normalized.angleStep * Math.PI / 180;
  const snapped = Math.round(angle / step) * step;
  return {
    angle: snapped,
    snapped: Math.abs(snapped - angle) > 1e-12,
    evidence: { type: 'angle', stepDegrees: normalized.angleStep, sourceRadians: angle, snappedRadians: snapped },
    bypassed: false
  };
}
