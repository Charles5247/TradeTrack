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
 *  - Serve page navigations CACHE-FIRST with background revalidation
 *    (stale-while-revalidate): the app renders INSTANTLY from cache whether
 *    the device is online, offline, or on a flaky connection — it never
 *    blocks the UI waiting on a network round-trip. A fresh copy is fetched
 *    in the background (when a network is available) to update the cache
 *    for next time. This is deliberate: TradeTrack is offline-first, so a
 *    trader with no signal should be able to open the app and use the POS
 *    immediately, not stare at a spinner.
 *  - Data (sales, inventory, etc.) is never cached here — that's the job of
 *    IndexedDB + the sync engine (src/lib/offline/sync-engine.ts), which the
 *    cashier now triggers manually via the "Upload" button, in addition to
 *    automatic sync on reconnect.
 *  - Never intercept API calls (/api/*) or Supabase requests — those are
 *    handled by the app's own IndexedDB-backed sync engine, which already
 *    has its own online/offline + retry logic.
 */

const CACHE_VERSION = "v1";
const STATIC_CACHE = `tradetrack-static-${CACHE_VERSION}`;
const PAGES_CACHE = `tradetrack-pages-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== PAGES_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isApiOrAuthRequest(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.hostname.endsWith("supabase.co")
  );
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|css|js)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

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
              caches
                .open(STATIC_CACHE)
                .then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);
      }),
    );
    return;
  }

  // Page navigations: CACHE-FIRST, revalidate in the background.
  //
  // Rationale: on a flaky market connection, "network-first" means every
  // navigation still has to wait on (and can be derailed by) a live request
  // — including a server redirect to /login if that request happens to hit
  // middleware while auth can't be verified. Cache-first means a page the
  // trader has already visited renders immediately, every time, regardless
  // of connectivity, and a background fetch quietly refreshes the cached
  // copy for next time whenever a network happens to be available.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cachedPage = await caches.match(request);

        // Kick off a background revalidation regardless of whether we have
        // a cached copy — this is what keeps the cache fresh. We don't
        // await it before responding.
        const revalidate = fetch(request)
          .then((response) => {
            // Only cache a genuine, non-redirected 200 for THIS URL. If the
            // browser followed a redirect (e.g. middleware bouncing an
            // unverifiable session to /login), response.redirected is true
            // and caching it here would silently overwrite a good cached
            // dashboard page with the login page. Skip caching in that case
            // — the redirect itself is still returned to the caller below
            // when there's no existing cached page to prefer instead.
            if (response && response.status === 200 && !response.redirected) {
              const clone = response.clone();
              caches
                .open(PAGES_CACHE)
                .then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => null);

        if (cachedPage) {
          // Serve instantly from cache; let revalidation happen silently.
          event.waitUntil(revalidate);
          return cachedPage;
        }

        // No cached copy yet (first visit to this page) — we have to wait
        // on the network once. If that also fails, fall back to the
        // offline shell rather than an ugly browser error.
        const networkResponse = await revalidate;
        if (networkResponse) return networkResponse;

        const offlinePage = await caches.match(OFFLINE_URL);
        return offlinePage || Response.error();
      })(),
    );
  }
});
