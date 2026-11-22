import {
  createRuntimeBridgeRelayTransport,
  installInkRuntimeBridge,
  mountInkRuntimeBridgeControls
} from './index.js';

export const INK_RUNTIME_BRIDGE_STARTUP_SCHEMA = 'INK-RUNTIME-BRIDGE-STARTUP';
export const INK_RUNTIME_BRIDGE_STARTUP_VERSION = 1;

function compactError(error) {
  return Object.freeze({
    code: String(error?.code || 'INK_RUNTIME_STARTUP_FAILED').slice(0, 120),
    message: String(error?.message || error || 'Runtime Bridge startup failed').slice(0, 300)
  });
}

function readExplicitConfig(globalObject) {
  const config = globalObject?.INK_RUNTIME_BRIDGE_CONFIG;
  if (!config || typeof config !== 'object' || config.install !== true) return null;
  return config;
}

function resolveTransport(config) {
  if (config.transport && typeof config.transport === 'object') return config.transport;
  if (typeof config.relayUrl !== 'string' || !config.relayUrl.trim()) {
    const error = new Error('Explicit Runtime Bridge opt-in requires relayUrl or injected transport');
    error.code = 'INK_RUNTIME_STARTUP_TRANSPORT_REQUIRED';
    throw error;
  }
  return createRuntimeBridgeRelayTransport({
    baseUrl: config.relayUrl,
    pairingChallengeHandler: typeof config.pairingChallengeHandler === 'function'
      ? config.pairingChallengeHandler
      : null
  });
}

export function installConfiguredRuntimeBridge(app, {
  globalObject = globalThis,
  documentObject = typeof document === 'undefined' ? null : document
} = {}) {
  const config = readExplicitConfig(globalObject);
  if (!config) {
    return Object.freeze({
      schema: INK_RUNTIME_BRIDGE_STARTUP_SCHEMA,
      version: INK_RUNTIME_BRIDGE_STARTUP_VERSION,
      installed: false,
      status: 'OFF',
      bridge: null,
      controls: null,
      host: null,
      error: null,
      dispose: async () => {}
    });
  }

  const shell = documentObject?.querySelector?.('#documentStatusStrip');
  if (!shell) {
    return Object.freeze({
      schema: INK_RUNTIME_BRIDGE_STARTUP_SCHEMA,
      version: INK_RUNTIME_BRIDGE_STARTUP_VERSION,
      installed: false,
      status: 'FAILED',
      bridge: null,
      controls: null,
      host: null,
      error: Object.freeze({
        code: 'INK_RUNTIME_STARTUP_MOUNT_UNAVAILABLE',
        message: 'Runtime Bridge status-strip mount is unavailable'
      }),
      dispose: async () => {}
    });
  }

  let transport = null;
  let bridge = null;
  let controls = null;
  let host = null;
  let disposed = false;
  let pagehide = null;

  try {
    transport = resolveTransport(config);
    bridge = installInkRuntimeBridge(app, { transport, enabled: false });

    host = documentObject.createElement('div');
    host.className = 'status-cluster runtime-bridge-status-cluster';
    host.setAttribute('data-ink-runtime-bridge-host', '1');
    host.setAttribute('aria-label', 'CHAT Runtime Bridge');
    shell.append(host);

    controls = mountInkRuntimeBridgeControls(bridge, host, {
      pairOptionsProvider: typeof config.pairOptionsProvider === 'function'
        ? config.pairOptionsProvider
        : null
    });

    const handle = {
      schema: INK_RUNTIME_BRIDGE_STARTUP_SCHEMA,
      version: INK_RUNTIME_BRIDGE_STARTUP_VERSION,
      installed: true,
      status: 'INSTALLED_OFF',
      bridge,
      controls,
      host,
      error: null,
      async dispose() {
        if (disposed) return;
        disposed = true;
        if (pagehide && typeof globalObject?.removeEventListener === 'function') {
          globalObject.removeEventListener('pagehide', pagehide);
        }
        controls?.dispose?.();
        host?.remove?.();
        await bridge?.dispose?.();
      }
    };

    pagehide = () => { void handle.dispose(); };
    if (typeof globalObject?.addEventListener === 'function') {
      globalObject.addEventListener('pagehide', pagehide, { once: true });
    }
    return Object.freeze(handle);
  } catch (error) {
    controls?.dispose?.();
    host?.remove?.();
    if (bridge && app?.runtimeBridge === bridge) {
      try { delete app.runtimeBridge; } catch {}
      void bridge.dispose?.();
    } else {
      void transport?.dispose?.();
    }
    return Object.freeze({
      schema: INK_RUNTIME_BRIDGE_STARTUP_SCHEMA,
      version: INK_RUNTIME_BRIDGE_STARTUP_VERSION,
      installed: false,
      status: 'FAILED',
      bridge: null,
      controls: null,
      host: null,
      error: compactError(error),
      dispose: async () => {}
    });
  }
}
