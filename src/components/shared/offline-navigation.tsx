'use client';
import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/store';
import { getNavGroupsForRole } from '@/components/layout/nav-config';

/** Cache complete documents: Next's RSC prefetch only survives in memory. */
export function OfflineNavigation() {
  const user = useAuthStore(state => state.user);
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!user || !('serviceWorker' in navigator) || !('caches' in window)) return;
    let cancelled = false;
    let preparing = false;
    const navigate = (event: MouseEvent) => {
      if (navigator.onLine || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.download || (anchor.target && anchor.target !== '_self')) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || /^\/(api|auth|login)(\/|$)/.test(url.pathname)) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      event.preventDefault();
      event.stopPropagation();
      location.assign(url.href);
    };
    const prepare = async () => {
      if (preparing || !navigator.onLine || cancelled) return;
      preparing = true;
      setStatus('Preparing pages for offline use...');
      try {
        const registration = await navigator.serviceWorker.ready;
        if (cancelled || !registration.active) return;
        const version = new URL(registration.active.scriptURL).searchParams.get('build') || 'v6';
        const account = user.id + ':' + (user.organization_id || 'platform');
        if (localStorage.getItem('TracKasuwa-page-account') !== account) {
          await Promise.all((await caches.keys()).filter(key => key.startsWith('TracKasuwa-pages-')).map(key => caches.delete(key)));
          localStorage.setItem('TracKasuwa-page-account', account);
        }
        const pages = await caches.open(`TracKasuwa-pages-${version}`);
        const assets = await caches.open(`TracKasuwa-static-${version}`);
        const routes = [...new Set([location.pathname, ...getNavGroupsForRole(user.role).flatMap(group => group.items.map(item => item.href))])];
        let completed = 0;
        for (const route of routes) {
          if (cancelled || !navigator.onLine) break;
          try {
            const response = await fetch(route, { credentials: 'same-origin', headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(15000) });
            if (!response.ok || response.redirected || !response.headers.get('content-type')?.includes('text/html')) continue;
            const html = await response.clone().text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const urls = [...new Set(Array.from(doc.querySelectorAll('script[src],link[rel="stylesheet"][href],link[rel="preload"][as="script"][href]')).map(element => new URL(element.getAttribute('src') || element.getAttribute('href')!, location.origin)).filter(url => url.origin === location.origin && url.pathname.startsWith('/_next/static/')).map(url => url.href))];
            await Promise.all(urls.map(async url => {
              if (await assets.match(url)) return;
              const asset = await fetch(url, { signal: AbortSignal.timeout(15000) });
              if (!asset.ok) throw new Error('Asset unavailable');
              await assets.put(url, asset);
            }));
            if (cancelled) return;
            await pages.put(new Request(new URL(route, location.origin)), response);
            completed++;
          } catch { /* Keep good cached pages; retry on reconnect. */ }
        }
        if (!cancelled) setStatus(completed === routes.length ? 'Pages ready offline. Keep online until data sync finishes.' : 'Some pages are not ready offline. Reconnect to finish downloading.');
      } catch {
        if (!cancelled) setStatus('Offline page storage unavailable. Keep this page open.');
      } finally { preparing = false; }
    };
    document.addEventListener('click', navigate, true);
    window.addEventListener('online', prepare);
    navigator.serviceWorker.addEventListener('controllerchange', prepare);
    void prepare();
    return () => {
      cancelled = true;
      document.removeEventListener('click', navigate, true);
      window.removeEventListener('online', prepare);
      navigator.serviceWorker.removeEventListener('controllerchange', prepare);
    };
  }, [user]);
  return status ? <div role="status" className="px-3 py-1 text-xs text-[var(--c-text-muted)]">{status}</div> : null;
}
