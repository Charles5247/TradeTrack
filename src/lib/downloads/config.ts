import { isNewerVersion } from './android-update';

const PHOTO_FIX_VERSION = '1.0.2';
const PHOTO_FIX_APK_URL = 'https://github.com/Charles5247/TradeTrack/releases/download/v1.0.2/TracKasuwa-1.0.2.apk';

function safeHttpsUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (url.hostname === 'example.com' || url.hostname.endsWith('.example.com') || url.hostname.endsWith('.invalid')) return null;
    return url.href;
  } catch { return null; }
}

/** Only expose direct APK/EXE assets from a public GitHub Release. */
export function releaseUrl(value: string | undefined, extension?: '.apk' | '.exe'): string | null {
  const result = safeHttpsUrl(value);
  if (!result) return null;
  const url = new URL(result);
  if (url.hostname !== 'github.com' || !/^\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/[^/]+$/i.test(url.pathname)) return null;
  if (extension && !url.pathname.toLowerCase().endsWith(extension)) return null;
  return result;
}

async function verifyReleaseAsset(url: string | null, label: string): Promise<string | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (response.ok) return url;
    console.warn(`[downloads] ${label} release asset returned HTTP ${response.status}; hiding the unavailable download.`);
    return null;
  } catch (error) {
    console.warn(`[downloads] Could not verify the ${label} release asset; hiding the download.`, error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getDownloadInfo() {
  const configuredAndroidVersion = process.env.TracKasuwa_ANDROID_LATEST_VERSION || null;
  const usePhotoFixRelease = !configuredAndroidVersion || isNewerVersion(PHOTO_FIX_VERSION, configuredAndroidVersion);
  const androidVersion = usePhotoFixRelease ? PHOTO_FIX_VERSION : configuredAndroidVersion;
  const configuredAndroidUrl = process.env.NEXT_PUBLIC_ANDROID_APK_URL ?? process.env.TracKasuwa_ANDROID_DOWNLOAD_URL;
  const androidReleaseUrl = usePhotoFixRelease || !configuredAndroidUrl ? PHOTO_FIX_APK_URL : configuredAndroidUrl;
  const [androidUrl, windowsUrl] = await Promise.all([
    verifyReleaseAsset(
      releaseUrl(androidReleaseUrl, '.apk'),
      'Android',
    ),
    verifyReleaseAsset(
      releaseUrl(process.env.NEXT_PUBLIC_WINDOWS_EXE_URL ?? process.env.TracKasuwa_WINDOWS_DOWNLOAD_URL, '.exe'),
      'Windows',
    ),
  ]);
  return {
    api_version: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',
    latest: {
      android: {
        version: androidVersion,
        file_size: process.env.TracKasuwa_ANDROID_FILE_SIZE || null,
        download_url: androidUrl,
        unknown_sources_help_url: safeHttpsUrl(process.env.TracKasuwa_ANDROID_UNKNOWN_SOURCES_HELP_URL),
      },
      windows: {
        version: process.env.TracKasuwa_WINDOWS_LATEST_VERSION || null,
        file_size: process.env.TracKasuwa_WINDOWS_FILE_SIZE || null,
        download_url: windowsUrl,
      },
    },
  };
}
export type DownloadInfo = Awaited<ReturnType<typeof getDownloadInfo>>;
