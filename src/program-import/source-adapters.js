const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

export const SOURCE_ADAPTER_CONTRACT = 'INK-READABLE-WORKFLOW-ADAPTER';
export const SOURCE_ADAPTER_CONTRACT_VERSION = 1;

export const extensionOf = name => String(name || '').toLowerCase().match(/\.([^.]+)$/)?.[1] || '';

export function createAdapterDetection({
  format = 'READABLE_WORKFLOW',
  sourceSoftware = 'External',
  confidence = 1,
  extension = '',
  binary = false,
  evidence = []
} = {}) {
  return {
    format,
    sourceSoftware,
    confidence,
    extension,
    binary,
    candidates: [{ id: format, score: confidence, sourceSoftware }],
    evidence: Array.isArray(evidence) ? evidence : [evidence],
    status: 'DETECTED'
  };
}

export class TranslationAdapterRegistry {
  constructor(adapters = []) {
    this.adapters = new Map();
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter) {
    if (!adapter?.id
      || adapter.contract !== SOURCE_ADAPTER_CONTRACT
      || !Number.isFinite(Number(adapter.version))
      || !Array.isArray(adapter.sourceTypes)
      || !adapter.sourceTypes.length
      || typeof adapter.detect !== 'function'
      || typeof adapter.parse !== 'function') {
      throw new Error('INK_SOURCE_ADAPTER_INVALID');
    }
    this.adapters.set(adapter.id, adapter);
    return adapter.id;
  }

  unregister(adapterId) {
    return this.adapters.delete(adapterId);
  }

  detect(input = {}) {
    const matches = [...this.adapters.values()]
      .map(adapter => ({ adapter, result: adapter.detect(input) }))
      .filter(item => item.result?.accepted)
      .sort((a, b) => Number(b.result.confidence || 0) - Number(a.result.confidence || 0));
    const match = matches[0];
    if (!match) return null;
    const confidence = Number(match.result.confidence || 0);
    return {
      adapterId: match.adapter.id,
      contract: match.adapter.contract,
      version: Number(match.adapter.version),
      sourceTypes: clone(match.adapter.sourceTypes),
      confidence,
      detection: clone(match.result.detection || createAdapterDetection({
        format: match.adapter.sourceTypes[0],
        sourceSoftware: match.adapter.sourceSoftware || 'External',
        confidence,
        extension: extensionOf(input.name),
        binary: Boolean(input.bytes),
        evidence: ['adapter:' + match.adapter.id]
      }))
    };
  }

  parse(adapterId, input = {}) {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) throw new Error('INK_SOURCE_ADAPTER_NOT_FOUND:' + adapterId);
    return adapter.parse(input);
  }

  list() {
    return [...this.adapters.values()].map(adapter => ({
      id: adapter.id,
      contract: adapter.contract,
      version: Number(adapter.version),
      sourceTypes: clone(adapter.sourceTypes)
    }));
  }
}

// Compatibility alias for the accepted #159 internal API name.
export const SourceAdapterRegistry = TranslationAdapterRegistry;
