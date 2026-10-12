// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { DownloadClient } from './download-client';
vi.mock('@/i18n/text', () => ({ TranslatedText: ({ text }: { text: string }) => text, useCopy: () => (text: string) => text }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let unmount: (() => void) | undefined;
afterEach(() => { if (unmount) act(unmount); document.body.innerHTML = ''; vi.restoreAllMocks(); });
it.each(['Android', 'Windows NT 10.0', 'iPhone', 'Macintosh'])('keeps all cards in order on %s and highlights only the recommendation', async (ua) => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); unmount = () => root.unmount();
  await act(async () => root.render(<DownloadClient versionInfo={null} />));
  expect([...container.querySelectorAll('[id]')].map(e => e.id)).toEqual(['android', 'windows', 'web']);
  expect(container.querySelectorAll('button:disabled')).toHaveLength(2);
  expect(container.querySelectorAll('a')).toHaveLength(0);
  const platform = ua === 'Android' ? 'android' : ua.startsWith('Windows') ? 'windows' : 'web';
  expect(container.querySelector('#' + platform)?.textContent).toContain('Recommended for your device');
});
it('renders real installer URLs and optional metadata', async () => {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); unmount = () => root.unmount();
  await act(async () => root.render(<DownloadClient versionInfo={{ api_version: '1', latest: {
    android: { download_url: 'https://github.com/org/repo/releases/download/v1/app.apk', version: '1.0', file_size: '12 MB', unknown_sources_help_url: null },
    windows: { download_url: 'https://github.com/org/repo/releases/download/v1/app.exe', version: null, file_size: null },
  } }} />));
  expect(container.querySelector('#android a')?.getAttribute('href')).toContain('/app.apk');
  expect(container.querySelector('#windows a')?.getAttribute('href')).toContain('/app.exe');
  expect(container.querySelector('#android')?.textContent).toContain('1.0 · 12 MB');
});
