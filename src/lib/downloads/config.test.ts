import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDownloadInfo, releaseUrl } from './config';
afterEach(() => vi.unstubAllEnvs());
describe('installer configuration', () => {
  it('rejects missing, unsafe and example URLs', () => {
    for (const url of [undefined, '', 'not a URL', 'http://github.com/file.apk', 'https://example.com/file.apk', 'https://user:password@github.com/file.apk']) expect(releaseUrl(url)).toBeNull();
  });
  it('uses the public URL and release metadata', () => {
    vi.stubEnv('NEXT_PUBLIC_ANDROID_APK_URL', 'https://github.com/org/releases/releases/download/v1/app.apk');
    vi.stubEnv('TracKasuwa_ANDROID_DOWNLOAD_URL', 'https://github.com/old.apk');
    vi.stubEnv('TracKasuwa_ANDROID_LATEST_VERSION', '1.2.0');
    vi.stubEnv('TracKasuwa_ANDROID_FILE_SIZE', '12 MB');
    expect(getDownloadInfo().latest.android).toMatchObject({ version: '1.2.0', file_size: '12 MB', download_url: 'https://github.com/org/releases/releases/download/v1/app.apk' });
  });
  it('allows explicitly disabling a legacy installer URL', () => {
    vi.stubEnv('TracKasuwa_WINDOWS_DOWNLOAD_URL', 'https://github.com/old.exe');
    vi.stubEnv('NEXT_PUBLIC_WINDOWS_EXE_URL', '');
    expect(getDownloadInfo().latest.windows.download_url).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_WINDOWS_EXE_URL', undefined);
    expect(getDownloadInfo().latest.windows.download_url).toBe('https://github.com/old.exe');
  });
});
