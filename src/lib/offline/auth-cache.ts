const OFFLINE_AUTH_STORAGE_KEY = 'tradetrack-offline-auth';
const REMEMBERED_LOGIN_STORAGE_KEY = 'tradetrack-remembered-login';
const OFFLINE_NAMESPACE_STORAGE_KEY = 'tradetrack-offline-namespace';
const REMEMBER_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export interface OfflineAuthSession {
  email: string;
  profile: Record<string, unknown>;
  createdAt: string;
}

export interface RememberedLoginPayload {
  email: string;
  password: string;
  profile: Record<string, unknown>;
  createdAt: string;
}

function readStorage<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures.
  }
}

function removeStorage(key: string): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

export function setOfflineAccountNamespace(profile?: Record<string, unknown> | null): void {
  if (typeof window === 'undefined') return;

  try {
    const rawName =
      (profile?.full_name as string | undefined) ||
      (profile?.email as string | undefined) ||
      (profile?.id as string | undefined) ||
      'default';

    const slug = String(rawName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'default';

    const suffix = typeof profile?.id === 'string' && profile.id ? profile.id.slice(0, 8) : 'default';
    const namespace = `${slug}-${suffix}`;

    window.localStorage.setItem(OFFLINE_NAMESPACE_STORAGE_KEY, namespace);
  } catch {
    // Ignore storage failures.
  }
}

export function getOfflineAccountNamespace(): string {
  if (typeof window === 'undefined') return 'default';

  try {
    const stored = window.localStorage.getItem(OFFLINE_NAMESPACE_STORAGE_KEY);
    return stored || 'default';
  } catch {
    return 'default';
  }
}

export function saveOfflineAuthSession(email: string, profile: Record<string, unknown>): void {
  const payload: OfflineAuthSession = {
    email,
    profile,
    createdAt: new Date().toISOString(),
  };

  setOfflineAccountNamespace(profile);
  writeStorage(OFFLINE_AUTH_STORAGE_KEY, payload);
}

export function getOfflineAuthSession(): OfflineAuthSession | null {
  const session = readStorage<OfflineAuthSession>(OFFLINE_AUTH_STORAGE_KEY);
  if (!session) return null;

  return session;
}

export function clearOfflineAuthSession(): void {
  removeStorage(OFFLINE_AUTH_STORAGE_KEY);
  removeStorage(REMEMBERED_LOGIN_STORAGE_KEY);
}

export async function saveRememberedLogin(
  email: string,
  password: string,
  profile: Record<string, unknown>
): Promise<void> {
  setOfflineAccountNamespace(profile);
  const payload: RememberedLoginPayload = {
    email,
    password,
    profile,
    createdAt: new Date().toISOString(),
  };

  writeStorage(REMEMBERED_LOGIN_STORAGE_KEY, payload);
}

export async function verifyRememberedLogin(
  email: string,
  password: string
): Promise<Record<string, unknown> | null> {
  const entry = readStorage<RememberedLoginPayload>(REMEMBERED_LOGIN_STORAGE_KEY);
  if (!entry) return null;

  if (entry.email !== email || entry.password !== password) return null;

  const age = Date.now() - new Date(entry.createdAt).getTime();
  if (age > REMEMBER_DURATION_MS) {
    removeStorage(REMEMBERED_LOGIN_STORAGE_KEY);
    return null;
  }

  return entry.profile;
}
