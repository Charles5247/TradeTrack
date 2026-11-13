'use client';

import { useEffect, useState } from 'react';
import { installedAndroidVersion, isNewerVersion } from './android-update';

type AndroidRelease = { version: string | null; download_url: string | null };

export function useAndroidUpdate() {
  const [installed, setInstalled] = useState<string | null>(null);
  const [release, setRelease] = useState<AndroidRelease | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const current = installedAndroidVersion(navigator.userAgent);
    setInstalled(current);
    if (!current) return;
    let active = true;
    async function check() {
      if (!navigator.onLine) return;
      setChecking(true);
      try {
        const response = await fetch('/api/version', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json() as { latest?: { android?: AndroidRelease } };
        if (active) setRelease(data.latest?.android ?? null);
      } catch { /* The app remains usable while offline. */ }
      finally { if (active) setChecking(false); }
    }
    void check();
    const interval = window.setInterval(check, 15 * 60 * 1000);
    window.addEventListener('online', check);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('online', check);
    };
  }, []);

  return {
    installed,
    release,
    checking,
    available: Boolean(release?.download_url && isNewerVersion(release.version, installed)),
  };
}
