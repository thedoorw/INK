import { INTENT_COMPOSITIONS, INTENT_CONSTRAINTS, INTENT_OPERATIONS, INTENT_STATUS, INTENT_SUBJECTS } from './intent-schema.js';

export function validateIntent(intent) {
  const errors = [];
  if (!intent || intent.format !== 'INK-STRUCTURED-INTENT') errors.push('INVALID_FORMAT');
  if (!INTENT_STATUS.includes(intent?.status)) errors.push('INVALID_STATUS');
  for (const value of intent?.subjects || []) if (!INTENT_SUBJECTS.includes(value)) errors.push(`INVALID_SUBJECT:${value}`);
  for (const value of intent?.composition || []) if (!INTENT_COMPOSITIONS.includes(value)) errors.push(`INVALID_COMPOSITION:${value}`);
  for (const value of intent?.constraints || []) if (!INTENT_CONSTRAINTS.includes(value)) errors.push(`INVALID_CONSTRAINT:${value}`);
  for (const item of intent?.operations || []) if (!INTENT_OPERATIONS.includes(item.operation)) errors.push(`INVALID_OPERATION:${item.operation}`);
  return { valid: errors.length === 0, errors };
}
