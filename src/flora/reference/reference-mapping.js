export const FLORA_REFERENCE_MAPPING_SCHEMA_VERSION = '0.1';
const REF_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$/;
const refMapFiniteInt = value => Number.isSafeInteger(value);
const refMapClone = value => structuredClone(value);
const refMapError = (code, path, detail = null) => ({ code, path, ...(detail === null ? {} : { detail }) });

export function expectedMonthSheet(month, day) {
  if (!refMapFiniteInt(month) || month < 1 || month > 12 || !refMapFiniteInt(day) || day < 1 || day > 31) return null;
  return `${month}-${day <= 16 ? 'A' : 'B'}.png`;
}

export function expectedMonthSlot(day) {
  if (!refMapFiniteInt(day) || day < 1 || day > 31) return null;
  return day <= 16 ? day : day - 16;
}

export function validateReferenceIdentity(record) {
  const refMapErrors = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { ok: false, errors: [refMapError('INVALID_RECORD', '$')] };
  if (!REF_ID_RE.test(record.profileId || '')) refMapErrors.push(refMapError('PROFILE_ID', '$.profileId'));
  if (typeof record.date !== 'string' || !/^\d{2}-\d{2}$/.test(record.date)) refMapErrors.push(refMapError('DATE', '$.date'));
  if (!refMapFiniteInt(record.month) || record.month < 1 || record.month > 12) refMapErrors.push(refMapError('MONTH', '$.month'));
  if (!refMapFiniteInt(record.day) || record.day < 1 || record.day > 31) refMapErrors.push(refMapError('DAY', '$.day'));
  if (!refMapFiniteInt(record.slot) || record.slot < 1 || record.slot > 16) refMapErrors.push(refMapError('SLOT', '$.slot'));
  if (typeof record.dCode !== 'string' || !/^D\d{3}$/.test(record.dCode)) refMapErrors.push(refMapError('D_CODE', '$.dCode'));
  for (const key of ['chineseName', 'englishName', 'scientificName']) if (typeof record[key] !== 'string' || !record[key].trim()) refMapErrors.push(refMapError('IDENTITY_FIELD', `$.${key}`));
  const [mm, dd] = String(record.date || '').split('-').map(Number);
  if (mm !== record.month || dd !== record.day) refMapErrors.push(refMapError('DATE_COMPONENT_CONFLICT', '$.date'));
  if (expectedMonthSlot(record.day) !== record.slot) refMapErrors.push(refMapError('DATE_SLOT_CONFLICT', '$.slot'));
  return refMapErrors.length ? { ok: false, errors: refMapErrors } : { ok: true, record: refMapClone(record) };
}

export function resolveReferenceMapping(recordInput, manifest, { requestedFiles = [] } = {}) {
  const checked = validateReferenceIdentity(recordInput);
  if (!checked.ok) return { ok: false, status: 'REFERENCE_MAPPING_CONFLICT', errors: checked.errors };
  const record = checked.record, expectedFile = expectedMonthSheet(record.month, record.day), expectedSlot = expectedMonthSlot(record.day);
  const refMapErrors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) refMapErrors.push(refMapError('MANIFEST_REQUIRED', '$.manifest'));
  const sheet = manifest?.sheets?.find(item => item.fileName === expectedFile);
  if (!sheet) refMapErrors.push(refMapError('MONTH_SHEET_NOT_FOUND', '$.manifest.sheets', expectedFile));
  const entry = sheet?.entries?.find(item => item.slot === expectedSlot || item.dCode === record.dCode);
  if (!entry) refMapErrors.push(refMapError('REFERENCE_ENTRY_NOT_FOUND', '$.manifest.sheets.entries', `${expectedFile}#${expectedSlot}`));
  const comparisons = entry ? {
    month: sheet.month === record.month,
    day: entry.day === record.day,
    slot: entry.slot === record.slot,
    dCode: entry.dCode === record.dCode,
    chineseName: entry.chineseName === record.chineseName,
    scientificName: entry.scientificName === record.scientificName
  } : {};
  const matchCount = Object.values(comparisons).filter(Boolean).length;
  if (entry && matchCount < 4) refMapErrors.push(refMapError('IDENTITY_MATCH_THRESHOLD', '$.manifest.entry', { matchCount, comparisons }));
  for (const fileName of requestedFiles) if (fileName !== expectedFile) refMapErrors.push(refMapError('FORBIDDEN_FILENAME_INFERENCE', '$.requestedFiles', { requested: fileName, expected: expectedFile }));
  if (refMapErrors.length) return { ok: false, status: 'REFERENCE_MAPPING_CONFLICT', errors: refMapErrors, expectedFile, expectedSlot, comparisons, matchCount };
  return {
    ok: true, status: 'VERIFIED', schemaVersion: FLORA_REFERENCE_MAPPING_SCHEMA_VERSION,
    mappingId: `reference:${record.profileId}:${record.dCode}`,
    profileId: record.profileId, monthSheet: expectedFile, month: record.month, day: record.day,
    date: record.date, slot: record.slot, dCode: record.dCode, chineseName: record.chineseName,
    englishName: record.englishName, scientificName: record.scientificName,
    sourceCrop: refMapClone(entry.sourceCrop), comparisons, matchCount,
    governance: { filenameTailInference: false, dateIsNotMonth: true, minimumIdentityMatches: 4 },
    metadata: { source: 'flora-reference-mapping', label: `${record.profileId} verified at ${expectedFile} slot ${record.slot}` }
  };
}

export function referenceMappingRoundtrip(mapping) { return JSON.parse(JSON.stringify(mapping)); }
