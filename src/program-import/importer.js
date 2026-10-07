import { SAFETY_MODES, deterministicHash } from './canonical-operation.js';
import { detectFormat } from './format-detector.js';
import { parseDetectedAsset } from './parsers.js';
import { scanSecurity } from './security.js';
import { ActionRecipeCompiler } from './compiler.js';
import { capabilityCoverage } from './coverage-engine.js';
import { TranslationAdapterRegistry } from './source-adapters.js';

const clone = value => JSON.parse(JSON.stringify(value));
const textDecoder = new TextDecoder('utf-8', { fatal: false });

function readMetadata({ name, text, bytes, detection, license, provenance }) {
  const author = String(text).match(/(?:author|copyright\s*\(c\)|@author)\s*[:=]?\s*([^\r\n*]{2,120})/i)?.[1]?.trim() || null;
  const version = String(text).match(/(?:program\s+version|version|@version)\s*[:=]?\s*([\w.-]+)/i)?.[1] || null;
  const detectedSoftware = String(detection?.sourceSoftware || '').trim();
  const sourceRequirements = detectedSoftware && !/^(?:unknown|ink)$/i.test(detectedSoftware)
    ? [detectedSoftware]
    : [];
  return {
    name, byteLength: bytes?.byteLength ?? new TextEncoder().encode(String(text)).byteLength,
    sourceSoftware: detection.sourceSoftware, sourceFormat: detection.format, version,
    author, sourceRequirements: [...new Set(sourceRequirements)], license: clone(license || {}), provenance: clone(provenance || {}),
    source: { name, format: detection.format, sourceSoftware: detection.sourceSoftware, sourceUrl: provenance?.sourceUrl || null, revision: provenance?.revision || null },
    readOnly: true
  };
}

function dependencyReport(program, metadata) {
  const sourceRequirements = new Set(metadata?.sourceRequirements || []);
  const dependencies = [...new Set([...(program?.dependencies || []), ...sourceRequirements])];
  return {
    format: 'INK-DEPENDENCY-REPORT',
    schemaVersion: 1,
    dependencies: dependencies.map(name => ({
      name,
      declared: true,
      availableInInk: !sourceRequirements.has(name),
      requiredForOriginalExecution: sourceRequirements.has(name)
    })),
    unresolved: dependencies.filter(name => sourceRequirements.has(name))
  };
}

function versionReport(metadata) {
  return { format: 'INK-VERSION-REPORT', schemaVersion: 1, sourceVersion: metadata.version || 'UNKNOWN', sourceRequirements: metadata.sourceRequirements, inkImporterVersion: '1.5.0', compatibility: metadata.version ? 'DECLARED_NOT_EXECUTED' : 'VERSION_UNKNOWN' };
}

function unsupportedReport(program, security) {
  const unsupported = program.operations.filter(operation => ['PARTIAL', 'MANUAL STEP REQUIRED', 'EXTERNAL EXECUTION REQUIRED', 'REJECTED'].includes(operation.conversionStatus) || operation.unsupportedReason).map(operation => ({ operationId: operation.operationId, operation: operation.canonicalOperation, status: operation.conversionStatus, reason: operation.unsupportedReason || 'mapping incomplete' }));
  if (security.status === 'REJECTED') unsupported.unshift({ operationId: null, operation: 'asset.security', status: 'REJECTED', reason: security.blockedBy.join(',') });
  return unsupported;
}

export class UniversalProgramImporter {
  constructor({ compiler = new ActionRecipeCompiler({ inkVersion: '1.5.0' }), inkVersion = '1.5.0', sourceAdapters = new TranslationAdapterRegistry() } = {}) {
    this.compiler = compiler;
    this.inkVersion = inkVersion;
    this.sourceAdapters = sourceAdapters;
    this.imports = new Map();
    this.externalRunners = new Map();
  }

  registerExternalRunner(software, runner) {
    if (!software || typeof runner !== 'function') throw new Error('INK_EXTERNAL_RUNNER_INVALID');
    this.externalRunners.set(software, runner);
  }

  importAsset({ name = 'unnamed.asset', mimeType = '', text = null, bytes = null, license = {}, provenance = {}, declaredPermissions = [], safetyMode = 'STATIC_PARSE', compile = true } = {}) {
    if (!SAFETY_MODES.includes(safetyMode)) throw new Error(`INK_IMPORT_SAFETY_MODE_INVALID:${safetyMode}`);
    const binary = bytes instanceof Uint8Array ? bytes : bytes ? new Uint8Array(bytes) : null;
    const sourceText = text === null && binary ? textDecoder.decode(binary) : String(text || '');
    const adapterMatch = this.sourceAdapters?.detect?.({ name, mimeType, text: sourceText, bytes: binary }) || null;
    const detection = adapterMatch?.detection || detectFormat({ name, mimeType, text: sourceText, bytes: binary });
    if (detection.status === 'UNKNOWN') throw Object.assign(new Error('INK_IMPORT_FORMAT_UNKNOWN'), { code: 'UNKNOWN_FORMAT', detection });
    const metadata = readMetadata({ name, text: sourceText, bytes: binary, detection, license, provenance });
    const security = scanSecurity({ text: detection.binary ? '' : sourceText, bytes: detection.binary ? binary : null, declaredPermissions, license, provenance });
    let program, workflowIR = null;
    try {
      if (adapterMatch) {
        workflowIR = this.sourceAdapters.parse(adapterMatch.adapterId, { name, mimeType, text: sourceText, bytes: binary, detection, metadata });
        program = workflowIR.canonicalProgram;
      } else program = parseDetectedAsset({ text: sourceText, bytes: binary, detection, metadata });
    }
    catch (error) {
      const rejection = { format: 'INK-IMPORT-REPORT', schemaVersion: 2, id: `import_${deterministicHash({ name, error: error.message })}`, status: 'REJECTED', safetyMode, detection, metadata, security, error: { code: error.code || 'PARSE_FAILED', message: error.message }, documentPolluted: false, rollback: { required: false, succeeded: true } };
      this.imports.set(rejection.id, rejection);
      return rejection;
    }
    const dependencies = dependencyReport(program, metadata);
    const versions = versionReport(metadata);
    let compilation = null;
    const provenanceBlocked = security.blockedBy.some(rule => ['LICENSE_UNCONFIRMED', 'SOURCE_UNCONFIRMED'].includes(rule));
    const translationBlocked = provenanceBlocked || safetyMode === 'STATIC_PARSE' || safetyMode === 'SANDBOX_ANALYSIS' || !compile;
    if (!translationBlocked) compilation = this.compiler.compile(workflowIR || program, { license });
    const unsupported = unsupportedReport(program, security);
    const report = {
      format: 'INK-IMPORT-REPORT', schemaVersion: 2,
      id: `import_${deterministicHash({ source: metadata.source, program: program.id, security: security.status, safetyMode })}`,
      importedAt: new Date().toISOString(), inkVersion: this.inkVersion,
      status: provenanceBlocked ? 'REJECTED' : compilation ? (security.status === 'REJECTED' ? 'PARTIAL_SECURITY_REJECTED' : compilation.report.compileStatus === 'COMPLETE' ? 'COMPILED' : 'PARTIAL') : security.status === 'REJECTED' ? 'ANALYZED_WITH_REJECTIONS' : 'ANALYZED',
      safetyMode, detection, metadata, security, versions, dependencies,
      sourceAdapter: adapterMatch ? { id: adapterMatch.adapterId, contract: adapterMatch.contract, version: adapterMatch.version, sourceTypes: clone(adapterMatch.sourceTypes || []) } : null,
      workflowIR,
      program, recipe: compilation?.recipe || null, conversionReport: compilation?.report || null,
      unsupportedOperations: unsupported,
      parameterList: program.operations.flatMap(operation => Object.keys(operation.parameters || {}).map(name => ({ operationId: operation.operationId, name, value: operation.parameters[name] }))),
      risks: security.findings,
      expectedInput: compilation?.recipe?.input || null,
      expectedOutput: compilation?.recipe?.expectedOutput || null,
      replayConditions: compilation?.report?.replayConditions || null,
      executionAllowed: Boolean(compilation) && !provenanceBlocked,
      securitySanitizedTranslation: Boolean(compilation) && security.status === 'REJECTED',
      originalSourceExecuted: false,
      documentPolluted: false,
      rollback: { required: false, succeeded: true },
      deterministicHash: deterministicHash({ program: program.deterministicHash, recipe: compilation?.recipe || null })
    };
    this.imports.set(report.id, report);
    return clone(report);
  }

  translate(importId) {
    const report = this.imports.get(importId);
    if (!report) throw new Error('INK_IMPORT_REPORT_NOT_FOUND');
    const provenanceBlocked = report.security.blockedBy.filter(rule => ['LICENSE_UNCONFIRMED', 'SOURCE_UNCONFIRMED'].includes(rule));
    if (provenanceBlocked.length) throw Object.assign(new Error(`INK_IMPORT_PROVENANCE_REJECTED:${provenanceBlocked.join(',')}`), { code: 'LICENSE_REJECTED' });
    const compilation = this.compiler.compile(report.workflowIR || report.program, { license: report.metadata.license });
    Object.assign(report, { recipe: compilation.recipe, conversionReport: compilation.report, status: report.security.status === 'REJECTED' ? 'PARTIAL_SECURITY_REJECTED' : compilation.report.compileStatus === 'COMPLETE' ? 'COMPILED' : 'PARTIAL', executionAllowed: true, securitySanitizedTranslation: report.security.status === 'REJECTED', safetyMode: 'TRANSLATE_ONLY' });
    return clone(report);
  }

  attachToDocument(importId, document) {
    const report = this.imports.get(importId);
    if (!report || !document) throw new Error('INK_IMPORT_ATTACH_TARGET_REQUIRED');
    document.programAssets = Array.isArray(document.programAssets) ? document.programAssets : [];
    const stored = { id: report.id, source: report.metadata.source, license: report.metadata.license, detection: report.detection, security: report.security, sourceAdapter: report.sourceAdapter || null, workflowIR: report.workflowIR || null, program: report.program, recipe: report.recipe, conversionReport: report.conversionReport, referenceRun: report.referenceRun || null, referencePackage: report.referencePackage || null, importedAt: report.importedAt };
    const index = document.programAssets.findIndex(item => item.id === report.id);
    index >= 0 ? document.programAssets.splice(index, 1, clone(stored)) : document.programAssets.push(clone(stored));
    return clone(stored);
  }

  executeExternal(importId, { userApproved = false, context = {} } = {}) {
    const report = this.imports.get(importId);
    if (!report) throw new Error('INK_IMPORT_REPORT_NOT_FOUND');
    if (!userApproved) throw Object.assign(new Error('INK_TRUSTED_EXTERNAL_RUN_USER_APPROVAL_REQUIRED'), { code: 'USER_APPROVAL_REQUIRED' });
    if (report.security.status === 'REJECTED') throw Object.assign(new Error('INK_TRUSTED_EXTERNAL_RUN_SECURITY_REJECTED'), { code: 'SECURITY_REJECTED' });
    const runner = this.externalRunners.get(report.metadata.sourceSoftware);
    if (!runner) throw Object.assign(new Error(`INK_EXTERNAL_SOFTWARE_RUNNER_UNAVAILABLE:${report.metadata.sourceSoftware}`), { code: 'EXTERNAL_SOFTWARE_REQUIRED' });
    return runner({ report: clone(report), context: clone(context) });
  }

  coverage(importId, evidence = {}) {
    const report = this.imports.get(importId);
    if (!report?.conversionReport) throw new Error('INK_IMPORT_NOT_COMPILED');
    return capabilityCoverage({ program: report.program, conversionReport: report.conversionReport, ...evidence });
  }
}
