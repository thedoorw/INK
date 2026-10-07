// INK legacy cache migration worker.
// Keep this URL stable for browsers still registered against ./service-worker.js.
// It exists only to migrate stale cache-first clients onto the publication-bound
// runtime worker without requiring Ctrl+F5, cache clearing, or unregister.
const MIGRATION_ID = 'ink-pwa-cache-migration-v4';
const MIGRATION_PARAM = 'ink-pwa-migrate';
const CACHE_PREFIX = 'ink-build-';

function isOwnedInkCache(key) {
  return key.startsWith(CACHE_PREFIX) || key.startsWith('ink-v');
}

async function clearLegacyInkCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter(isOwnedInkCache).map(key => caches.delete(key)));
}

async function navigateWindows() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    try {
      const url = new URL(client.url);
      if (url.origin !== self.location.origin) continue;
      if (url.searchParams.get(MIGRATION_PARAM) === MIGRATION_ID) continue;
      url.searchParams.set(MIGRATION_PARAM, MIGRATION_ID);
      client.navigate?.(url.href).catch(() => null);
    } catch (_) {}
  }
}

// Set the takeover flag immediately, then repeat it inside install. Clear the
// stale cache-first build before takeover, but do not navigate clients from the
// install event: that can race a candidate-page runtime-worker registration
// against this worker while Chromium still considers it waiting. Client
// navigation is serialized after activate + claim below.
self.skipWaiting();

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await clearLegacyInkCaches();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await navigateWindows();
  })());
});

async function migrationNetworkFirst(request) {
  try {
    const response = await fetch(new Request(request, { cache: 'reload' }));
    if (response) return response;
  } catch (_) {}
  return await caches.match(request, { ignoreSearch: true })
    || await caches.match('./index.html')
    || Response.error();
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(migrationNetworkFirst(event.request));
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'INK_GET_VERSION') return;
  const target = event.ports?.[0] || event.source;
  target?.postMessage?.({
    type: 'INK_VERSION',
    version: '0.1',
    buildId: MIGRATION_ID,
    shellCache: null,
    runtimeCache: null,
    navigationStrategy: 'migration-network-first',
    assetStrategy: 'migration-network-first',
    migration: true
  });
});
