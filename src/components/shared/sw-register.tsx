'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/i18n';
import { registerServiceWorker } from '@/lib/offline/register-sw';

/**
 * Mount-only component that registers the PWA service worker. Renders
 * nothing — purely a side-effect hook wrapped in a component so it can sit
 * declaratively in the root layout tree.
 */
export function ServiceWorkerRegister() {
  const { t } = useI18n();
  const common = useRef(t.common);
  common.current = t.common;

  useEffect(() => {
    return registerServiceWorker((activateUpdate) => {
      const copy = common.current;
      toast.info(copy.app_update_available, {
        description: copy.app_update_description,
        duration: Infinity,
        action: {
          label: copy.app_update_now,
          onClick: activateUpdate,
        },
      });
    });
  }, []);

  return null;
}
