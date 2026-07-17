'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/offline/register-sw';

/**
 * Mount-only component that registers the PWA service worker. Renders
 * nothing — purely a side-effect hook wrapped in a component so it can sit
 * declaratively in the root layout tree.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return null;
}
