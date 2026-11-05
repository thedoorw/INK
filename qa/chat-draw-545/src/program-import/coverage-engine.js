import { GAP_CATEGORIES, MATURITY_LEVELS, deterministicHash } from './canonical-operation.js';

const clone = value => JSON.parse(JSON.stringify(value));
const count = (values, predicate) => values.filter(predicate).length;

export function capabilityCoverage({ program, conversionReport, replayReport = null, differenceReport = null, roundtrip = null, rollback = null } = {}) {
  const operations = program?.operations || [];
  const unsupported = conversionReport?.unsupportedOperations || [];
  const status = operation => conversionReport?.normalizedOperations?.find(item => item.operationId === operation.operationId)?.status || operation.conversionStatus;
  const executionStates = replayReport?.states || [];
  const criticalCategories = ['Mask', 'Blend', 'Brush Stroke', 'Filter'];
  const criticalGaps = unsupported.filter(item => criticalCategories.includes(operations.find(operation => operation.operationId === item.operationId)?.category));
  const direct = count(operations, operation => status(operation) === 'DIRECT');
  const equivalent = count(operations, operation => status(operation) === 'EQUIVALENT');
  const approximated = count(operations, operation => status(operation) === 'APPROXIMATED');
  const partial = count(operations, operation => status(operation) === 'PARTIAL');
  const rejected = count(operations, operation => status(operation) === 'REJECTED');
  const manual = count(operations, operation => status(operation) === 'MANUAL STEP REQUIRED');
  const external = count(operations, operation => status(operation) === 'EXTERNAL EXECUTION REQUIRED');
  const weight = operations.length || 1;
  const compatibility = Math.max(0, Math.min(1, (direct + equivalent * 0.9 + approximated * 0.55 + partial * 0.3) / weight));
  return {
    format: 'INK-CAPABILITY-COVERAGE-REPORT', schemaVersion: 2,
    id: `coverage_${deterministicHash({ program: program?.id, conversion: conversionReport?.id, replay: replayReport?.id })}`,
    sourceProgramId: program?.id || null,
    metrics: {
      totalSteps: operations.length,
      parsedSteps: operations.length,
      directMappings: direct,
      equivalentMappings: equivalent,
      approximatedMappings: approximated,
      partialSupport: partial,
      unsupported: rejected + count(unsupported, item => !['PARTIAL', 'APPROXIMATED', 'MANUAL STEP REQUIRED', 'EXTERNAL EXECUTION REQUIRED', 'REJECTED'].includes(item.status)),
      manualInput: manual,
      externalSoftware: external + count(unsupported, item => item.gapCategory === 'EXTERNAL_SOFTWARE_REQUIRED'),
      executionSucceeded: count(executionStates, state => state.status === 'ok'),
      executionFailed: count(executionStates, state => state.status === 'failed') + (replayReport?.status === 'failed' ? 1 : 0),
      rollbackSucceeded: rollback?.succeeded ?? replayReport?.rolledBack ?? null,
      saveReopenConsistent: roundtrip?.consistent ?? null,
      deterministicReplayConsistent: replayReport?.deterministicConsistent ?? null,
      outputStructureRetention: differenceReport?.structure?.retention ?? null,
      visualDifference: differenceReport?.visual ?? null,
      overallCompatibility: compatibility
    },
    criticalGaps,
    complete: compatibility === 1 && criticalGaps.length === 0 && rejected === 0 && partial === 0 && approximated === 0,
    decision: criticalGaps.length ? 'NOT_COMPLETE_CRITICAL_GAP' : compatibility === 1 ? 'COMPLETE' : 'PARTIAL',
    warnings: criticalGaps.length ? ['核心 Mask／Blend／Brush／Filter 缺口禁止標示完整成功'] : []
  };
}

export class GapFrequencyRanking {
  constructor() { this.records = new Map(); }
  add({ program, conversionReport, assetTypes = [] }) {
    const operations = new Map((program?.operations || []).map(operation => [operation.operationId, operation]));
    for (const gap of conversionReport?.unsupportedOperations || []) {
      const category = GAP_CATEGORIES.includes(gap.gapCategory) ? gap.gapCategory : 'UNKNOWN_OPERATION';
      const key = `${category}:${gap.canonicalOperation}`;
      const current = this.records.get(key) || { category, operation: gap.canonicalOperation, occurrences: 0, blockedPrograms: new Set(), affectedAssetTypes: new Set(), affectedSoftware: new Set(), affectedProgramTypes: new Set(), blocksCompleteWork: false, approximateFallback: false, estimatedRepairCost: 'MEDIUM', repairRisk: 'MEDIUM' };
      current.occurrences += 1;
      current.blockedPrograms.add(program?.id);
      assetTypes.forEach(type => current.affectedAssetTypes.add(type));
      const source = operations.get(gap.operationId);
      if (source?.sourceSoftware) current.affectedSoftware.add(source.sourceSoftware);
      if (source?.category) current.affectedProgramTypes.add(source.category);
      current.blocksCompleteWork ||= ['Mask', 'Blend', 'Brush Stroke', 'Filter', 'Conditional', 'Loop'].includes(source?.category) || gap.blocksCompleteWork === true;
      current.approximateFallback ||= Boolean(source?.fallbackCandidate);
      if (['SECURITY_REJECTED', 'LICENSE_REJECTED', 'EXTERNAL_SOFTWARE_REQUIRED'].includes(category)) current.estimatedRepairCost = 'EXTERNAL';
      if (['PARAMETER_MISSING', 'UNKNOWN_OPERATION'].includes(category)) current.estimatedRepairCost = 'LOW_TO_MEDIUM';
      this.records.set(key, current);
    }
    return this;
  }
  report() {
    const ranking = [...this.records.values()].map(record => ({ ...record, blockedPrograms: [...record.blockedPrograms], affectedAssetTypes: [...record.affectedAssetTypes], affectedSoftware: [...record.affectedSoftware], affectedProgramTypes: [...record.affectedProgramTypes], impactAssetCount: record.blockedPrograms.size, equivalentAlternative: record.approximateFallback, coverageGainIfFixed: record.blockedPrograms.size, priorityScore: record.occurrences * (record.blocksCompleteWork ? 2 : 1) * (record.approximateFallback ? 1 : 1.5) * (record.estimatedRepairCost === 'EXTERNAL' ? 0.35 : 1) })).sort((a, b) => b.priorityScore - a.priorityScore || b.occurrences - a.occurrences);
    return { format: 'INK-GAP-FREQUENCY-RANKING', schemaVersion: 2, generatedAt: new Date().toISOString(), ranking };
  }
}

const maturityDimensions = ['EXISTENCE', 'COVERAGE', 'CORRECTNESS', 'STABILITY', 'EDITABILITY', 'REPLAYABILITY', 'DETERMINISM', 'INTEROPERABILITY', 'VISUAL_EQUIVALENCE', 'PRODUCTION_READINESS'];
export function maturityAssessment({ capability, evidence = [] }) {
  const successful = evidence.filter(item => item?.passed === true), failed = evidence.filter(item => item?.passed === false);
  const distinctAssets = new Set(successful.map(item => item?.assetId).filter(Boolean)).size;
  const distinctInputs = new Set(successful.map(item => item?.inputId).filter(Boolean)).size;
  const realReferences = successful.filter(item => item.kind === 'external-reference' && item.originalProgramExecuted === true);
  const mature = realReferences.length >= 5 && distinctAssets >= 5 && distinctInputs >= 2 && realReferences.every(item => item.structureCorrect === true && item.roundtripConsistent === true && item.replayConsistent === true && item.rollbackMajorIssue !== true && item.withinThreshold === true && item.approximated !== true);
  let level = mature ? 'MATURE' : failed.length ? 'PARTIAL' : successful.length >= 5 && distinctAssets >= 3 ? 'OPERATIONAL' : successful.length ? 'EXPERIMENTAL' : 'MISSING';
  if (evidence.some(item => item?.rejected === true) && successful.length === 0) level = 'REJECTED';
  const dimensions = Object.fromEntries(maturityDimensions.map(dimension => [dimension, MATURITY_LEVELS.includes(level) ? level : 'MISSING']));
  return { format: 'INK-MATURITY-ASSESSMENT', schemaVersion: 2, capability, level, dimensions, evidence: clone(evidence), matureCriteria: { successfulRealPrograms: realReferences.length, distinctAssets, distinctInputs, minimumPrograms: 5, minimumInputs: 2, structureCorrect: mature, roundtripConsistent: mature, replayConsistent: mature, noMajorRollbackIssue: mature, withinThreshold: mature, noApproximationAsEquivalent: mature }, rule: 'MATURE requires at least five real external programs, two inputs, correct structure, roundtrip, replay, rollback, threshold and equivalence evidence' };
}
