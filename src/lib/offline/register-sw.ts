'use client';

/**
 * Service worker registration helper.
 *
 * Registers /sw.js (see public/sw.js) on mount. No-ops in unsupported
 * environments (SSR, browsers without Service Worker support) and swallows
 * registration errors — a failed SW registration should never break the app.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  // Skip in local dev by default to avoid stale-cache confusion while
  // iterating — PWA behavior is meant to be verified in production builds.
  if (process.env.NODE_ENV !== 'production') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[PWA] Service worker registration failed:', err);
    });
  });
}
