export function deviceId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    const key = 'TracKasuwa-device-id';
    const value = localStorage.getItem(key) || crypto.randomUUID();
    localStorage.setItem(key, value);
    return value;
  } catch { return 'browser-storage-unavailable'; }
}
