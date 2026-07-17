/**
 * TradeTrack Service Worker
 * ─────────────────────────────────────────────────────────────────────────────
 * Hand-rolled, dependency-free service worker (no Workbox/next-pwa — those
 * packages pin webpack 4 / workbox 4 and are not compatible with this
 * project's Next.js 16 build pipeline).
 *
 * Responsibilities:
 *  - Precache the app shell (offline fallback page + core icons) on install.
 *  - Serve static assets (icons, manifest, fonts, images) cache-first.
 *  - Serve page navigations network-first, falling back to a cached copy
 *    (or the offline fallback page) when the network is unavailable.
 *  - Never intercept API calls (/api/*) or Supabase requests — those are
 *    handled by the app's own IndexedDB-backed sync engine
 *    (src/lib/offline/sync-engine.ts), which already has its own
 *    online/offline + retry logic. The service worker's job here is purely
 *    "make the app shell load when there's no network", not to duplicate
 *    data sync.
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `tradetrack-static-${CACHE_VERSION}`;
const PAGES_CACHE = `tradetrack-pages-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== PAGES_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isApiOrAuthRequest(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.hostname.endsWith('supabase.co')
  );
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|css|js)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept API / auth / Supabase calls — let the app's own
  // fetch + sync-engine logic handle those.
  if (isApiOrAuthRequest(url)) return;

  // Static assets: cache-first, fall back to network, then update cache.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);
      })
    );
    return;
  }

  // Page navigations: network-first, fall back to cached page, then the
  // offline fallback page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(PAGES_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(request);
          if (cachedPage) return cachedPage;
          const offlinePage = await caches.match(OFFLINE_URL);
          return offlinePage || Response.error();
        })
    );
  }
});
