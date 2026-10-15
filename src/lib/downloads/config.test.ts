import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDownloadInfo, releaseUrl } from './config';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('installer configuration', () => {
  it('rejects missing, unsafe and non-release URLs', () => {
    for (const url of [
      undefined,
      '',
      'not a URL',
      'http://github.com/owner/repo/releases/download/v1/app.apk',
      'https://example.com/owner/repo/releases/download/v1/app.apk',
      'https://github.com/owner/repo/releases/tag/v1',
      'https://github.com/owner/repo/releases/download/v1/app.exe',
      '******github.com/file.apk',
    ]) {
      expect(releaseUrl(url, '.apk')).toBeNull();
    }
  });

  it('uses the public URL only when the GitHub release asset exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    vi.stubEnv('NEXT_PUBLIC_ANDROID_APK_URL', 'https://github.com/org/releases/releases/download/v1/app.apk');
    vi.stubEnv('TracKasuwa_ANDROID_DOWNLOAD_URL', 'https://github.com/org/old/releases/download/v1/old.apk');
    vi.stubEnv('TracKasuwa_ANDROID_LATEST_VERSION', '1.2.0');
    vi.stubEnv('TracKasuwa_ANDROID_FILE_SIZE', '12 MB');

    const info = await getDownloadInfo();
    expect(info.latest.android).toMatchObject({
      version: '1.2.0',
      file_size: '12 MB',
      download_url: 'https://github.com/org/releases/releases/download/v1/app.apk',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://github.com/org/releases/releases/download/v1/app.apk',
      expect.objectContaining({ method: 'HEAD' }),
    );
  });

  it('shows no Windows download when the configured release asset is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    vi.stubEnv('TracKasuwa_WINDOWS_DOWNLOAD_URL', 'https://github.com/org/old/releases/download/v1/old.exe');
    vi.stubEnv('NEXT_PUBLIC_WINDOWS_EXE_URL', '');

    expect((await getDownloadInfo()).latest.windows.download_url).toBeNull();
  });

  it('allows explicitly disabling a legacy installer URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    vi.stubEnv('TracKasuwa_WINDOWS_DOWNLOAD_URL', 'https://github.com/org/old/releases/download/v1/old.exe');
    vi.stubEnv('NEXT_PUBLIC_WINDOWS_EXE_URL', '');
    expect((await getDownloadInfo()).latest.windows.download_url).toBeNull();

    vi.stubEnv('NEXT_PUBLIC_WINDOWS_EXE_URL', undefined);
    expect((await getDownloadInfo()).latest.windows.download_url).toBe('https://github.com/org/old/releases/download/v1/old.exe');
  });
});
