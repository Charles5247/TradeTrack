'use client';

import { useEffect, useState } from 'react';

const PRELOADER_STORAGE_KEY = 'tradetrack-app-preloader-seen';
const MIN_VISIBLE_MS = 600; // avoid a flash on fast loads
const MAX_VISIBLE_MS = 4000; // never trap the user if load stalls (offline, slow network)
const FADE_MS = 250;

/**
 * Branded startup loader. Not a video: no controls, no close/skip button.
 * It dismisses itself when the page has finished loading (or after a hard
 * timeout), once per browser session, so offline/slow starts are never blocked.
 */
export function AppPreloader() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(PRELOADER_STORAGE_KEY) === '1') return;
    } catch {
      // Storage unavailable: still show, still auto-dismiss.
    }
    setVisible(true);

    const start = Date.now();
    let done = false;
    const timers: number[] = [];

    const finish = () => {
      if (done) return;
      done = true;
      try {
        sessionStorage.setItem(PRELOADER_STORAGE_KEY, '1');
      } catch {
        /* ignore */
      }
      setFading(true);
      timers.push(window.setTimeout(() => setVisible(false), FADE_MS));
    };

    const onReady = () => {
      const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - start));
      timers.push(window.setTimeout(finish, wait));
    };

    if (document.readyState === 'complete') onReady();
    else window.addEventListener('load', onReady, { once: true });

    timers.push(window.setTimeout(finish, MAX_VISIBLE_MS));

    return () => {
      window.removeEventListener('load', onReady);
      timers.forEach(window.clearTimeout);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading TracKasuwa"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-card transition-opacity"
      style={{ opacity: fading ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-192x192.png"
        alt=""
        width={96}
        height={96}
        className="h-24 w-24 rounded-2xl"
      />
      <div
        className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary"
        aria-hidden="true"
      />
      <span className="sr-only">Loading TracKasuwa…</span>
    </div>
  );
}
