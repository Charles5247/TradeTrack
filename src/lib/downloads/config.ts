/** Shared server-side release metadata for the page and native update checks. */
export function releaseUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (url.hostname === 'example.com' || url.hostname.endsWith('.example.com') || url.hostname.endsWith('.invalid')) return null;
    return url.href;
  } catch { return null; }
}

export function getDownloadInfo() {
  return {
    api_version: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',
    latest: {
      android: {
        version: process.env.TracKasuwa_ANDROID_LATEST_VERSION || null,
        file_size: process.env.TracKasuwa_ANDROID_FILE_SIZE || null,
        download_url: releaseUrl(process.env.NEXT_PUBLIC_ANDROID_APK_URL ?? process.env.TracKasuwa_ANDROID_DOWNLOAD_URL),
        unknown_sources_help_url: releaseUrl(process.env.TracKasuwa_ANDROID_UNKNOWN_SOURCES_HELP_URL),
      },
      windows: {
        version: process.env.TracKasuwa_WINDOWS_LATEST_VERSION || null,
        file_size: process.env.TracKasuwa_WINDOWS_FILE_SIZE || null,
        download_url: releaseUrl(process.env.NEXT_PUBLIC_WINDOWS_EXE_URL ?? process.env.TracKasuwa_WINDOWS_DOWNLOAD_URL),
      },
    },
  };
}
export type DownloadInfo = ReturnType<typeof getDownloadInfo>;
