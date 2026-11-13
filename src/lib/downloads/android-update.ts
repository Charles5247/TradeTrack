export function installedAndroidVersion(userAgent: string): string | null {
  const version = userAgent.match(/TrackasuwaAndroid\/(\d+\.\d+\.\d+)/i)?.[1];
  if (version) return version;
  // APKs released before the version marker still identify as Android WebView.
  return /Android/i.test(userAgent) && /; wv[);]/i.test(userAgent) ? '0.0.0' : null;
}

export function isNewerVersion(latest: string | null, installed: string | null): boolean {
  if (!latest || !installed || !/^\d+\.\d+\.\d+$/.test(latest)) return false;
  const next = latest.split('.').map(Number);
  const current = installed.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (next[i] !== current[i]) return next[i] > current[i];
  }
  return false;
}
