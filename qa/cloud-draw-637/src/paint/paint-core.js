/* Compatibility facade for the INK v1.3 unified drawing core. */
import { createUnifiedStroke, normalizeStrokeSample as normalizeSample, migrateUnifiedStroke } from './stroke-model.js';
import { BrushPresetRegistry, BUILTIN_BRUSH_PRESETS, compileBrushStroke, migrateBrushPreset } from './brush-engine.js';
import { StrokeSessionRecorder, replayStrokeSession, selectSessionStrokes, deleteSessionStrokes, recolorSessionStrokes, transformSessionStrokes } from './stroke-session.js';

export * from './stroke-model.js';
export * from './brush-engine.js';
export * from './stroke-session.js';
export * from './drawing-workflow-import.js';
export * from './drawing-quality.js';
export * from './stroke-quality-tools.js';
export * from './natural-media-state.js';

export { BrushPresetRegistry, BUILTIN_BRUSH_PRESETS, StrokeSessionRecorder, replayStrokeSession, selectSessionStrokes, deleteSessionStrokes, recolorSessionStrokes, transformSessionStrokes };

export const PAINT_CAPABILITIES = Object.freeze({
  strokeModel: { format: 'INK-STROKE', schemaVersion: 2, editable: ['select','delete','move','scale','rotate','recolor','opacity','replaceBrush','partialReplay','fixedSeedReplay','undo','redo'] },
  sample: ['position','timestamp','pressure','tiltX','tiltY','azimuth','altitude','velocity','direction','size','opacity','flow','spacing','scatter','rotation','textureCoordinates','wetness','paintLoad','smudge','blend','glaze','seed'],
  dynamics: ['pressureSize','pressureOpacity','pressureFlow','tiltSize','tiltRotation','velocitySize','velocityOpacity','directionalRotation','spacing','scatter','jitter','texture','dualTip','grain','edgeSoftness','buildUp','smudge','blend','wetness','paintLoad','glaze','drying','pigmentAccumulation','canvasInteraction'],
  brushes: BUILTIN_BRUSH_PRESETS.map(item => ({ id: item.id, engine: item.engine, behavior: item.engine })),
  naturalMedia: { watercolor: 'APPROXIMATION_MODEL', oilLike: 'APPROXIMATION_MODEL', dryBrush: 'APPROXIMATION_MODEL' },
  session: ['record','pause','resume','finish','replay','singleStep','speed','fromStroke','breakpoint','partialReplay','replacePreset','replaceColor','fixedSeed','rollback','differenceReport']
});

export function normalizeStrokeSample(sample, previous = null, index = 0) {
  const normalized = normalizeSample(sample, previous?.position ? previous : previous ? normalizeSample(previous) : null, index);
  return { ...normalized, x: normalized.position.x, y: normalized.position.y, time: normalized.timestamp, p: normalized.pressure, tilt: Math.hypot(normalized.tiltX, normalized.tiltY) };
}

export function createStroke(options = {}) { return createUnifiedStroke(options); }

export function compileStroke(stroke, preset, options = {}) {
  const result = compileBrushStroke(migrateUnifiedStroke(stroke), migrateBrushPreset(preset), options);
  return { ...result, id: result.strokeId, points: result.dabs, composite: result.blendMode, hash: result.replayHash };
}

export function drawStrokeReplay(ctx, replay) {
  const strokes = replay?.strokes || [];
  for (const stroke of strokes) {
    const points = stroke.dabs || stroke.points || [];
    ctx.save(); ctx.globalCompositeOperation = stroke.blendMode || stroke.composite || 'source-over';
    for (const dab of points) {
      const coverage = Math.max(0, Math.min(1, dab.coverage ?? 1));
      const opacity = Math.max(0, Math.min(1, (dab.opacity ?? 1) * (dab.flow ?? 1) * coverage));
      if (opacity <= 0 && !['color-blender','pigment-transport'].includes(dab.mode)) continue;
      ctx.globalAlpha = opacity;
      ctx.fillStyle = dab.color || stroke.color || '#202020';
      const radius = Math.max(.05, (dab.size || 1) / 2), softness = Math.max(0, Math.min(1, dab.softness || 0));
      if (softness > .2 && typeof ctx.createRadialGradient === 'function') {
        const gradient = ctx.createRadialGradient(dab.x,dab.y,radius*.08,dab.x,dab.y,radius);
        gradient.addColorStop(0, dab.color || stroke.color || '#202020'); gradient.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gradient;
      }
      ctx.beginPath();
      const aspect = dab.mode === 'dry-broken-coverage-approximation' ? .3 : dab.mode === 'impasto-mixing-approximation' ? .55 : 1 - Math.min(.45, (dab.texture || 0) * .28);
      ctx.ellipse(dab.x,dab.y,radius,Math.max(.05,radius*aspect),dab.rotation||0,0,Math.PI*2); ctx.fill();
      if (dab.dualTipOffset) { ctx.globalAlpha *= .55; ctx.beginPath(); ctx.ellipse(dab.x+dab.dualTipOffset*radius,dab.y,radius*.55,radius*.4,dab.rotation||0,0,Math.PI*2); ctx.fill(); }
    }
    ctx.restore();
  }
  return true;
}

export function createBrushCapabilityReport(asset) {
  const format = String(asset?.format || asset?.name || '').toLowerCase();
  const supported = format.includes('ink-brush') || format.endsWith('.inkbrush') || format.includes('stroke-session');
  return { status: supported ? 'DIRECT' : 'REJECTED', format: asset?.format || 'unknown', supportedOperations: supported ? ['load','save','replay','parameter-substitution','migration','dependency-warning','security-scan'] : [], unsupportedOperations: supported ? [] : ['binary-vendor-engine','embedded-executable','undocumented-dynamics'], dependencies: [], conversionCandidate: supported ? 'native' : format.includes('brush') ? 'map-settings' : 'none', rejectCondition: supported ? null : 'no safe executable mapping' };
}
