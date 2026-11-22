export class ServiceWorkerUpdateManager {
  constructor({
    scriptURL = './service-worker-runtime.js',
    scope = './',
    buildId = null,
    deploymentIdentityURL = './pages-build-identity.txt',
    onStatusChange = null,
    autoActivate = true,
    reloadOnActivate = false,
    canReload = () => true
  } = {}) {
    this.scriptURL = scriptURL;
    this.scope = scope;
    this.buildId = buildId;
    this.deploymentIdentityURL = deploymentIdentityURL;
    this.onStatusChange = onStatusChange;
    this.autoActivate = autoActivate;
    this.reloadOnActivate = reloadOnActivate;
    this.canReload = typeof canReload === 'function' ? canReload : () => true;
    this.registration = null;
    this.waiting = null;
    this.state = 'idle';
    this.error = null;
    this.controllerChanged = false;
    this.controllerAtRegister = false;
    this.reloadIssued = false;
    this.reloadDeferred = false;
    this.migrationListenerBound = false;
    this.controllerListenerBound = false;
    this.publishedRevision = null;
    this.identitySource = buildId ? 'source-fallback' : 'unknown';
    this.resolvedScriptURL = scriptURL;
  }

  supported() { return Boolean(globalThis.navigator?.serviceWorker); }

  emit(extra = {}) {
    const status = this.diagnostics(extra);
    this.onStatusChange?.(status);
    return status;
  }

  scopeURL() {
    try { return new URL(this.scope, globalThis.location?.href || 'http://ink.local/').href; }
    catch { return this.scope; }
  }

  scriptURLForBuild(buildId = this.buildId) {
    try {
      const url = new URL(this.scriptURL, globalThis.location?.href || 'http://ink.local/');
      if (buildId) url.searchParams.set('build', buildId);
      return url.href;
    } catch {
      return this.scriptURL;
    }
  }

  async resolvePublishedIdentity() {
    if (globalThis.navigator?.onLine === false || typeof globalThis.fetch !== 'function') return null;
    try {
      const url = new URL(this.deploymentIdentityURL, globalThis.location?.href || 'http://ink.local/');
      url.searchParams.set('ink_identity_probe', String(Date.now()));
      const response = await fetch(url.href, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return null;
      const revision = (await response.text()).trim().toLowerCase();
      if (!/^[a-f0-9]{40}$/.test(revision)) return null;
      this.publishedRevision = revision;
      this.buildId = `pages-${revision}`;
      this.identitySource = 'pages-jekyll-build-revision';
      return this.buildId;
    } catch {
      return null;
    }
  }

  bindMigrationSafety() {
    if (this.migrationListenerBound || !this.supported()) return;
    this.migrationListenerBound = true;
    navigator.serviceWorker.addEventListener?.('message', event => {
      const message = event.data || {};
      if (message.type !== 'INK_MIGRATION_SAFETY_QUERY' || !message.token) return;
      let safe = false;
      try { safe = Boolean(this.canReload()); } catch {}
      const target = navigator.serviceWorker.controller || event.source;
      target?.postMessage?.({ type:'INK_MIGRATION_CLIENT_STATE', token:message.token, safe });
    });
  }

  bindControllerChange() {
    if (this.controllerListenerBound || !this.supported()) return;
    this.controllerListenerBound = true;
    this.bindMigrationSafety();
    navigator.serviceWorker.addEventListener?.('controllerchange', async () => {
      this.controllerChanged = true;
      this.state = 'activated';
      try { await this.refreshWorkerIdentity(); } catch {}
      this.emit();
      if (this.reloadOnActivate && this.controllerAtRegister && !this.reloadIssued) {
        let safe=false;try{safe=Boolean(this.canReload());}catch{}
        if (safe) { this.reloadIssued = true; globalThis.location?.reload?.(); }
        else { this.reloadDeferred = true; this.state = 'reload-deferred'; this.emit({ reloadDeferred:true }); }
      }
    });
  }

  async reuseOfflineRegistration() {
    if (globalThis.navigator?.onLine !== false || !navigator.serviceWorker.getRegistration) return null;
    const existing = await navigator.serviceWorker.getRegistration(this.scopeURL()).catch(() => null);
    if (!existing?.active) return null;
    this.registration = existing;
    this.bindControllerChange();
    try { await this.refreshWorkerIdentity(); } catch {}
    this.state = 'ready';
    return this.emit({ offlineReuse: true });
  }

  async register() {
    if (!this.supported()) { this.state = 'unsupported'; return this.emit(); }
    this.state = 'registering'; this.emit();
    try {
      const offlineReuse = await this.reuseOfflineRegistration();
      if (offlineReuse) return offlineReuse;

      this.controllerAtRegister = Boolean(navigator.serviceWorker.controller);
      this.bindControllerChange();
      await this.resolvePublishedIdentity();
      this.resolvedScriptURL = this.scriptURLForBuild();

      this.registration = await navigator.serviceWorker.register(this.resolvedScriptURL, {
        scope: this.scope,
        updateViaCache: 'none'
      });
      this.registration.addEventListener?.('updatefound', () => this.trackInstalling(this.registration.installing));
      await this.registration.update();
      this.waiting = this.registration.waiting || null;
      if (this.waiting && this.autoActivate) this.activateUpdate();
      else this.state = this.waiting ? 'update-ready' : 'ready';
      try { await this.refreshWorkerIdentity(); } catch {}
      return this.emit();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.state = 'error';
      return this.emit();
    }
  }

  trackInstalling(worker) {
    if (!worker) return;
    this.state = 'installing'; this.emit();
    worker.addEventListener?.('statechange', () => {
      if (worker.state === 'installed') {
        this.waiting = this.registration?.waiting || worker;
        this.state = navigator.serviceWorker.controller ? 'update-ready' : 'ready';
        if (this.autoActivate && navigator.serviceWorker.controller) this.activateUpdate();
      } else if (worker.state === 'activated') {
        this.state = 'activated';
        this.refreshWorkerIdentity().then(() => this.emit({ workerState: worker.state })).catch(() => {});
        return;
      } else if (worker.state === 'redundant') this.state = 'error';
      this.emit({ workerState: worker.state });
    });
  }

  async refreshWorkerIdentity() {
    const worker = this.registration?.waiting
      || this.registration?.installing
      || this.registration?.active
      || navigator.serviceWorker.controller;
    if (!worker || typeof MessageChannel === 'undefined') return null;
    const detail = await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => reject(new Error('Service Worker identity timeout')), 3000);
      channel.port1.onmessage = event => {
        clearTimeout(timer);
        resolve(event.data || null);
      };
      worker.postMessage({ type: 'INK_GET_VERSION' }, [channel.port2]);
    });
    if (detail?.buildId && !detail?.migration) {
      this.buildId = detail.buildId;
      if (detail?.publishedRevision) {
        this.publishedRevision = detail.publishedRevision;
        this.identitySource = 'runtime-worker';
      }
    }
    return detail;
  }

  async checkForUpdate() {
    if (!this.registration) return { ...this.emit(), checked: false };
    try {
      const previousBuildId = this.buildId;
      await this.resolvePublishedIdentity();
      const desiredScriptURL = this.scriptURLForBuild();
      const currentScriptURL = this.registration?.active?.scriptURL
        || this.registration?.waiting?.scriptURL
        || this.registration?.installing?.scriptURL
        || this.resolvedScriptURL;
      if (this.buildId && this.buildId !== previousBuildId && desiredScriptURL !== currentScriptURL) {
        this.resolvedScriptURL = desiredScriptURL;
        this.registration = await navigator.serviceWorker.register(desiredScriptURL, {
          scope: this.scope,
          updateViaCache: 'none'
        });
      }
      await this.registration.update();
      this.waiting = this.registration.waiting || this.waiting;
      if (this.waiting) {
        this.state = 'update-ready';
        if (this.autoActivate) this.activateUpdate();
      }
      return { ...this.emit(), checked: true };
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.state = 'error';
      return { ...this.emit(), checked: false };
    }
  }

  activateUpdate() {
    const worker = this.registration?.waiting || this.waiting;
    if (!worker) return false;
    worker.postMessage({ type: 'INK_SKIP_WAITING' });
    this.state = 'activating';
    this.emit();
    return true;
  }

  diagnostics(extra = {}) {
    return {
      supported: this.supported(),
      state: this.state,
      hasRegistration: Boolean(this.registration),
      updateReady: Boolean(this.registration?.waiting || this.waiting),
      controllerChanged: this.controllerChanged,
      reloadIssued: this.reloadIssued,
      reloadDeferred: this.reloadDeferred,
      autoActivate: this.autoActivate,
      error: this.error,
      buildId: this.buildId,
      publishedRevision: this.publishedRevision,
      identitySource: this.identitySource,
      deploymentIdentityURL: this.deploymentIdentityURL,
      registrationScriptURL: this.registration?.active?.scriptURL
        || this.registration?.waiting?.scriptURL
        || this.registration?.installing?.scriptURL
        || this.resolvedScriptURL
        || this.scriptURL,
      ...extra
    };
  }
}
