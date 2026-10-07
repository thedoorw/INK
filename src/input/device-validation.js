import { applyPressureCurve, normalizePenProfile } from './pen-calibration.js';

const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));
export const CALIBRATION_PROFILE_FORMAT = 'INK-DEVICE-CALIBRATION-PROFILE';
export const DEFAULT_DEVICE_PROFILE = Object.freeze({ format: CALIBRATION_PROFILE_FORMAT, schemaVersion: 1, id: 'ink-default-device', name: 'INK Default', deviceMatch: {}, pressureCurve: [[0,0],[.2,.1],[.5,.5],[.8,.9],[1,1]], minimumPressureThreshold: .02, maximumPressureClamp: 1, smoothing: .16, stabilization: .2, prediction: false, tiltSensitivity: 1, rotationSensitivity: 1, samplingFilter: 'COALESCED', palmRejectionPreference: true, brushSizeCompensation: 1 });

export function normalizeCalibrationProfile(input = {}) {
  const value = { ...clone(DEFAULT_DEVICE_PROFILE), ...clone(input), format: CALIBRATION_PROFILE_FORMAT, schemaVersion: 1 };
  value.id = String(value.id || 'device-profile'); value.name = String(value.name || value.id); value.minimumPressureThreshold = clamp(value.minimumPressureThreshold, 0, .95); value.maximumPressureClamp = clamp(value.maximumPressureClamp, value.minimumPressureThreshold + .01, 1); value.smoothing = clamp(value.smoothing, 0, .95); value.stabilization = clamp(value.stabilization, 0, .95); value.tiltSensitivity = clamp(value.tiltSensitivity, 0, 2); value.rotationSensitivity = clamp(value.rotationSensitivity, 0, 2); value.brushSizeCompensation = clamp(value.brushSizeCompensation, .25, 4); value.prediction = value.prediction === true; value.palmRejectionPreference = value.palmRejectionPreference !== false;
  if (!Array.isArray(value.pressureCurve) || value.pressureCurve.length < 2) value.pressureCurve = clone(DEFAULT_DEVICE_PROFILE.pressureCurve);
  return value;
}

export function calibrationToPenProfile(profile) { const p = normalizeCalibrationProfile(profile); return normalizePenProfile({ pressureMin: p.minimumPressureThreshold, pressureMax: p.maximumPressureClamp, pressureSmoothing: p.smoothing, tiltSensitivity: p.tiltSensitivity, useCoalescedEvents: p.samplingFilter === 'COALESCED', usePredictedEvents: p.prediction, palmRejection: p.palmRejectionPreference }); }
export function applyCalibration(sample, profile) { const p = normalizeCalibrationProfile(profile), pen = calibrationToPenProfile(p); return { ...clone(sample), pressure: applyPressureCurve(sample.pressure, pen), tiltX: (Number(sample.tiltX) || 0) * p.tiltSensitivity, tiltY: (Number(sample.tiltY) || 0) * p.tiltSensitivity, rotation: (Number(sample.rotation) || 0) * p.rotationSensitivity, size: (Number(sample.size) || 1) * p.brushSizeCompensation, calibrationProfileId: p.id }; }

export class CalibrationProfileStore {
  constructor({ storage = null, key = 'ink-device-calibration-profiles-v1' } = {}) { this.storage = storage; this.key = key; this.profiles = new Map([[DEFAULT_DEVICE_PROFILE.id, normalizeCalibrationProfile(DEFAULT_DEVICE_PROFILE)]]); this.activeId = DEFAULT_DEVICE_PROFILE.id; this.load(); }
  load() { try { const raw = this.storage?.getItem?.(this.key); if (raw) { const value = JSON.parse(raw); for (const profile of value.profiles || []) this.profiles.set(profile.id, normalizeCalibrationProfile(profile)); if (this.profiles.has(value.activeId)) this.activeId = value.activeId; } } catch {} return this; }
  persist() { try { this.storage?.setItem?.(this.key, JSON.stringify({ activeId: this.activeId, profiles: [...this.profiles.values()] })); } catch {} }
  save(profile) { const value = normalizeCalibrationProfile(profile); this.profiles.set(value.id, value); this.persist(); return clone(value); }
  list() { return [...this.profiles.values()].map(clone); }
  active() { return clone(this.profiles.get(this.activeId) || DEFAULT_DEVICE_PROFILE); }
  select(id) { if (!this.profiles.has(id)) throw new Error(`INK_CALIBRATION_PROFILE_NOT_FOUND:${id}`); this.activeId = id; this.persist(); return this.active(); }
  reset() { this.profiles = new Map([[DEFAULT_DEVICE_PROFILE.id, normalizeCalibrationProfile(DEFAULT_DEVICE_PROFILE)]]); this.activeId = DEFAULT_DEVICE_PROFILE.id; this.persist(); return this.active(); }
  export(id = this.activeId) { const profile = this.profiles.get(id); if (!profile) throw new Error(`INK_CALIBRATION_PROFILE_NOT_FOUND:${id}`); return JSON.stringify(profile, null, 2); }
  import(raw) { const value = normalizeCalibrationProfile(typeof raw === 'string' ? JSON.parse(raw) : raw); if (value.format !== CALIBRATION_PROFILE_FORMAT) throw new Error('INK_CALIBRATION_PROFILE_INVALID'); return this.save(value); }
  embed(document, { profileId = this.activeId, replaySelection = 'ORIGINAL_PROFILE' } = {}) { document.deviceCalibrationProfiles = document.deviceCalibrationProfiles || []; const profile = this.profiles.get(profileId); if (!profile) throw new Error(`INK_CALIBRATION_PROFILE_NOT_FOUND:${profileId}`); document.deviceCalibrationProfiles = document.deviceCalibrationProfiles.filter(item => item.id !== profileId).concat(clone(profile)); document.deviceReplayProfileSelection = replaySelection; return document; }
}
