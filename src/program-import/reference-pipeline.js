import { compareReference } from './comparison-engine.js';
import { capabilityCoverage } from './coverage-engine.js';
import { createReferencePackage } from './reference-package.js';

const clone = value => JSON.parse(JSON.stringify(value));

export class ReferencePipeline {
  constructor({ importer, runnerRegistry, executeInk }) {
    if (!importer || !runnerRegistry || typeof executeInk !== 'function') throw new Error('INK_REFERENCE_PIPELINE_DEPENDENCY_REQUIRED');
    this.importer = importer; this.runnerRegistry = runnerRegistry; this.executeInk = executeInk;
  }
  async run({ importId, request, compareKind = 'auto', userApproved = false, files = {} }) {
    const imported = this.importer.imports.get(importId);
    if (!imported?.recipe) throw new Error('INK_REFERENCE_PIPELINE_COMPILED_IMPORT_REQUIRED');
    const sourceRun = await this.runnerRegistry.execute(request, { userApproved });
    const inkRun = await this.executeInk(clone(imported.recipe), clone(request.input));
    const difference = sourceRun.status === 'COMPLETED'
      ? compareReference({ reference: sourceRun.output?.comparisonValue, ink: inkRun.comparisonValue, kind: compareKind, metadata: { referenceSoftware: sourceRun.software, referenceVersion: sourceRun.softwareVersion, sameInputConfirmed: true } })
      : { format: 'INK-DIFFERENCE-REPORT', schemaVersion: 3, assetId: request.assetId, decision: 'REJECTED', reason: sourceRun.status };
    const coverage = capabilityCoverage({ program: imported.program, conversionReport: imported.conversionReport, replayReport: inkRun.replayReport, differenceReport: difference, roundtrip: inkRun.roundtrip, rollback: inkRun.rollback });
    return createReferencePackage({ assetId: request.assetId, kind: compareKind, source: { referenceRun: sourceRun }, ink: inkRun, reports: { difference, coverage }, files, status: difference.decision || 'PARTIAL' });
  }
}
