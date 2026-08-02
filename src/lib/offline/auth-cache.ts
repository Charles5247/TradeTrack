const OFFLINE_AUTH_STORAGE_KEY = "tradetrack-offline-auth";
const REMEMBERED_LOGIN_STORAGE_KEY = "tradetrack-remembered-login";
const OFFLINE_NAMESPACE_STORAGE_KEY = "tradetrack-offline-namespace";
const OFFLINE_AUTH_COOKIE_NAME = "tradetrack-offline-session";
const REMEMBER_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export interface OfflineAuthSession {
  email: string;
  profile: Record<string, unknown>;
  createdAt: string;
}

export interface RememberedLoginPayload {
  email: string;
  // Never store the raw password — see hashPassword()/verifyPassword()
  // below. salt is per-entry (random, stored alongside) so the same
  // password doesn't produce the same stored hash across accounts.
  salt: string;
  passwordHash: string;
  profile: Record<string, unknown>;
  createdAt: string;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomSaltHex(): string {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

// Salted SHA-256 — this is a "remember this device for offline sign-in"
// cache, not the account's real password store (Supabase Auth still owns
// that, and still gates every online sign-in). The threat this defends
// against is a plaintext credential sitting in localStorage being
// trivially readable via devtools or an XSS payload; it is not meant to
// resist offline brute-force the way bcrypt/argon2 would, which is an
// acceptable tradeoff for a POS terminal's local "stay logged in offline"
// cache rather than a primary credential store.
async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

// Separate from Supabase's own sb-*-auth-token cookie: supabase-js clears
// THAT cookie itself whenever a background token-refresh attempt fails
// (which happens routinely while offline, roughly whenever the access
// token's ~1hr lifetime is up) — so it can't be used as evidence of "this
// device is allowed offline access". This cookie is app-owned, has no
// bearing on Supabase's own session state, and is set on every successful
// login (online or via the offline cached-credential fallback). Server
// gatekeepers (middleware.ts, (dashboard)/layout.tsx) check THIS, not
// Supabase's cookie, when getUser() can't be verified live.
// NOTE: the literal cookie name is duplicated (not imported) in
// middleware.ts and (dashboard)/layout.tsx to avoid pulling this
// browser-only module (window/document/localStorage) into their bundles
// (one is an Edge Runtime bundle) — keep the three in sync if renamed.
export const OFFLINE_SESSION_COOKIE = "tt_offline_session";
const OFFLINE_SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, matches REMEMBER_DURATION_MS

function setOfflineSessionCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${OFFLINE_SESSION_COOKIE}=1; max-age=${OFFLINE_SESSION_COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
}

function clearOfflineSessionCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${OFFLINE_SESSION_COOKIE}=; max-age=0; path=/; SameSite=Lax`;
}

function readStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures.
  }
}

function removeStorage(key: string): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

function setOfflineAuthCookie(): void {
  if (typeof window === "undefined") return;

  try {
    const expires = new Date(Date.now() + REMEMBER_DURATION_MS).toUTCString();
    window.document.cookie = `${OFFLINE_AUTH_COOKIE_NAME}=1; Path=/; Max-Age=${Math.floor(REMEMBER_DURATION_MS / 1000)}; Expires=${expires}; SameSite=Lax`;
  } catch {
    // Ignore cookie failures.
  }
}

function clearOfflineAuthCookie(): void {
  if (typeof window === "undefined") return;

  try {
    window.document.cookie = `${OFFLINE_AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  } catch {
    // Ignore cookie failures.
  }
}

export function setOfflineAccountNamespace(
  profile?: Record<string, unknown> | null,
): void {
  if (typeof window === "undefined") return;

  try {
    const rawName =
      (profile?.full_name as string | undefined) ||
      (profile?.email as string | undefined) ||
      (profile?.id as string | undefined) ||
      "default";

    const slug =
      String(rawName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "default";

    const suffix =
      typeof profile?.id === "string" && profile.id
        ? profile.id.slice(0, 8)
        : "default";
    const namespace = `${slug}-${suffix}`;

    window.localStorage.setItem(OFFLINE_NAMESPACE_STORAGE_KEY, namespace);
  } catch {
    // Ignore storage failures.
  }
}

export function getOfflineAccountNamespace(): string {
  if (typeof window === "undefined") return "default";

  try {
    const stored = window.localStorage.getItem(OFFLINE_NAMESPACE_STORAGE_KEY);
    return stored || "default";
  } catch {
    return "default";
  }
}

export function saveOfflineAuthSession(
  email: string,
  profile: Record<string, unknown>,
): void {
  const payload: OfflineAuthSession = {
    email,
    profile,
    createdAt: new Date().toISOString(),
  };

  setOfflineAccountNamespace(profile);
  writeStorage(OFFLINE_AUTH_STORAGE_KEY, payload);
<<<<<<< HEAD
  setOfflineSessionCookie();
=======
  setOfflineAuthCookie();
>>>>>>> bc81cdde09fe9e08d926018710b30e283dc5c220
}

export function getOfflineAuthSession(): OfflineAuthSession | null {
  const session = readStorage<OfflineAuthSession>(OFFLINE_AUTH_STORAGE_KEY);
  if (!session) return null;

  return session;
}

export function clearOfflineAuthSession(): void {
  removeStorage(OFFLINE_AUTH_STORAGE_KEY);
  removeStorage(REMEMBERED_LOGIN_STORAGE_KEY);
<<<<<<< HEAD
  clearOfflineSessionCookie();
=======
  clearOfflineAuthCookie();
>>>>>>> bc81cdde09fe9e08d926018710b30e283dc5c220
}

export async function saveRememberedLogin(
  email: string,
  password: string,
  profile: Record<string, unknown>,
): Promise<void> {
  setOfflineAccountNamespace(profile);
  const salt = randomSaltHex();
  const passwordHash = await hashPassword(password, salt);
  const payload: RememberedLoginPayload = {
    email,
    salt,
    passwordHash,
    profile,
    createdAt: new Date().toISOString(),
  };

  writeStorage(REMEMBERED_LOGIN_STORAGE_KEY, payload);
  setOfflineSessionCookie();
}

export async function verifyRememberedLogin(
  email: string,
  password: string,
): Promise<Record<string, unknown> | null> {
  const entry = readStorage<RememberedLoginPayload>(
    REMEMBERED_LOGIN_STORAGE_KEY,
  );
  if (!entry) return null;

  if (entry.email !== email) return null;

  const age = Date.now() - new Date(entry.createdAt).getTime();
  if (age > REMEMBER_DURATION_MS) {
    removeStorage(REMEMBERED_LOGIN_STORAGE_KEY);
    return null;
  }

  const candidateHash = await hashPassword(password, entry.salt);
  if (candidateHash !== entry.passwordHash) return null;

  return entry.profile;
}
