// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const update = vi.hoisted(() => ({ installed: '1.0.1' as string | null, release: { version: '1.0.1', download_url: 'https://github.com/owner/repo/releases/download/v1.0.1/TracKasuwa-1.0.1.apk' } as { version: string; download_url: string } | null, checking: false, available: false }));
vi.mock('@/lib/downloads/use-android-update', () => ({ useAndroidUpdate: () => update }));
import AppUpdatePage from './page';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  update.installed = '1.0.1';
  update.release = { version: '1.0.1', download_url: 'https://github.com/owner/repo/releases/download/v1.0.1/TracKasuwa-1.0.1.apk' };
  update.available = false;
});

it('does not offer the old APK as a repair for Android photos', async () => {
  await act(() => root.render(<AppUpdatePage />));
  expect(host.textContent).toContain('reinstalling version 1.0.1 will not repair photos');
  expect(host.querySelector('a[href$=".apk"]')).toBeNull();
});

it('offers a copyable link when the fixed APK is published for an old shell', async () => {
  update.release = { version: '1.0.2', download_url: 'https://github.com/owner/repo/releases/download/v1.0.2/TracKasuwa-1.0.2.apk' };
  update.available = true;
  await act(() => root.render(<AppUpdatePage />));
  expect(host.querySelector('button')?.textContent).toBe('Copy update link');
  expect(host.textContent).toContain('TracKasuwa-1.0.2.apk');
});
