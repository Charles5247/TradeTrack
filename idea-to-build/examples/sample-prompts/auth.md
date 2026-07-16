# Example: Auth Prompts (Phase 3)

> Shows what Phase 3 prompts look like. Auth is built as a complete, isolated feature before any application logic begins. Context: Finora (Next.js + Firebase). Phases 1–2 complete — `users` collection defined in [8].

---

## [ ] [14] We're building the POST /api/auth/register endpoint that creates a Firebase Auth account, sends email verification, and sets a session cookie so the user is immediately signed in after registration.

**Registration flow —** When a user registers, three things happen in sequence: (1) Firebase Auth creates the account, (2) this endpoint issues a session cookie, (3) a separate Cloud Function (built in [18]) listens for the Auth `onCreate` event and creates the `users/{uid}` document in Firestore. This endpoint does NOT create the Firestore user document — that is the Cloud Function's responsibility. The separation exists because creating a Firebase Auth account and creating the user document are two distinct operations with distinct failure modes.

**Input validation —** The request body must contain: `email` (required, valid email format, max 254 characters), `password` (required, 8–128 characters, must contain at least one uppercase letter and one digit), `displayName` (required, 1–50 characters, only letters, spaces, hyphens, and apostrophes allowed — no special characters).

**After successful auth creation —** Call `adminAuth.createSessionCookie(idToken, { expiresIn: 7 * 24 * 60 * 60 * 1000 })` to create a 7-day session cookie. Set it as: `httpOnly: true`, `secure: true` (production only), `sameSite: 'strict'`, `path: '/'`, `name: 'session'`. Then send the Firebase email verification link. Return 201 with the user's basic profile.

**Error handling —** If Firebase returns `auth/email-already-in-use`: return 409 with `{ code: 'EMAIL_IN_USE', message: 'An account with this email already exists. Try signing in instead.' }`. Never return a generic "email already taken" that would allow email enumeration attacks.

## Instructions

**File:** `app/api/auth/register/route.ts`

**Zod schema (`lib/validators/auth.ts`):**

```typescript
export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one digit'),
  displayName: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z\s'-]+$/, 'Only letters, spaces, hyphens, and apostrophes'),
});
```

**Processing order:**

1. Parse + validate request body with `registerSchema`. On error: return 400 with field-level Zod error details.
2. Check rate limit (5 registrations per minute per IP). On limit hit: return 429 with `{ code: 'RATE_LIMITED', message: 'Too many registration attempts. Please wait a moment and try again.', retryAfter: 60 }` + `Retry-After: 60` header.
3. Call `adminAuth.createUser({ email, password, displayName })`.
4. If Firebase error `auth/email-already-in-use`: return 409 with `{ code: 'EMAIL_IN_USE', message: 'An account with this email already exists. Try signing in instead.' }`.
5. Call `adminAuth.createCustomToken(uid)` → call client `signInWithCustomToken()` → get `idToken` from the result.
6. Call `adminAuth.createSessionCookie(idToken, { expiresIn: 604800000 })`.
7. Set cookie on response: `name=session`, `httpOnly=true`, `secure=process.env.NODE_ENV==='production'`, `sameSite=strict`, `path=/`, `maxAge=604800`.
8. Call `adminAuth.generateEmailVerificationLink(email)` and send via the email service.
9. Return 201: `{ user: { id: uid, email, displayName, role: 'user', currency: 'USD' } }`.

**If Next.js:** Import `adminAuth` from `lib/firebase/admin.ts`. Use `NextResponse.json()` for responses. Get client IP from `request.headers.get('x-forwarded-for')`.

## Verification

I'll verify this implementation automatically. I can:

- POST `/api/auth/register` with valid data → expect 201 response with `user` object and `Set-Cookie: session=...` header.
- POST `/api/auth/register` with the same email twice → expect 409 with code `EMAIL_IN_USE`.
- POST `/api/auth/register` with `password: 'password'` (no uppercase, no digit) → expect 400 with validation error identifying the password field.
- POST `/api/auth/register` 6 times from the same IP in 60 seconds → expect the 6th to return 429.
- POST `/api/auth/register` with `displayName: 'Test<script>'` → expect 400 (special characters not allowed).
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Open the Finora registration page → fill in a valid email, password, and display name → submit → expect redirect to `/dashboard` with no errors.
- Open browser DevTools → Application → Cookies → verify a `session` cookie exists with `HttpOnly` flag set.
- Check the Firebase Auth console → verify the new account appears.

Then give me your honest assessment of:

- Whether the custom token → id token → session cookie flow introduces unnecessary latency vs. using the Firebase Admin SDK to create the session cookie directly — and whether there is a simpler, equally secure approach.

---

## [ ] [16] We're building the auth state provider, Zustand auth store, and route guard that protect all Finora app routes and keep the signed-in user's profile synchronized across the entire frontend.

**What needs to exist —** The frontend needs: (1) a Zustand store holding the signed-in user's Finora profile (not the Firebase User object, which lacks our custom fields), (2) a hook that listens to Firebase Auth state changes and syncs the Finora user document from Firestore, (3) a route guard in the `(app)` layout that redirects unauthenticated users to `/login`, (4) a redirect in the `(auth)` layout that redirects authenticated users away from login/register to `/dashboard`.

**Auth store —** The Zustand store holds: `{ user: User | null, isLoading: boolean }`. It exposes `setUser(user: User | null)` and `setLoading(loading: boolean)`. The loading state is `true` until Firebase Auth has reported its first state (either a logged-in user or null). This prevents the protected route from flashing the login page before auth is determined.

**Firestore user sync —** When Firebase Auth reports a logged-in user (a `FirebaseUser`), the hook fetches the `users/{uid}` document from Firestore to get the full Finora `User` profile (which includes `currency`, `onboardingCompleted`, `role`, etc. that the `FirebaseUser` does not have). If the Firestore document does not yet exist (Cloud Function is still creating it), retry up to 5 times with 500ms delay before giving up with an error.

**Route guard behavior —** In `app/(app)/layout.tsx`: if `isLoading === true`, render a full-screen loading skeleton (not null, not blank — a skeleton that matches the app shell). If `user === null` after loading completes, call `router.replace('/login?redirect=' + encodeURIComponent(pathname))`. If `user.onboardingCompleted === false`, redirect to `/onboarding` instead of allowing app access.

## Instructions

**`lib/stores/auth-store.ts`:**

```typescript
import { create } from 'zustand';
import { User } from '@/lib/types/user';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
}));
```

**`lib/hooks/useAuthSync.ts`:**

- `'use client'` directive at top
- `useEffect` that calls `onAuthStateChanged(auth, async (firebaseUser) => { ... })`
- Inside the callback: if `firebaseUser === null` → `setUser(null)`, `setLoading(false)`, return.
- If `firebaseUser !== null` → fetch `users/{uid}` from Firestore → retry up to 5 times with 500ms delay if the document doesn't exist yet → call `setUser(finoraUser)`, `setLoading(false)`.
- Call this hook once in `app/(app)/layout.tsx` — it starts the listener and keeps the store in sync.
- Return the cleanup function from `onAuthStateChanged` in the `useEffect` return.

**`app/(app)/layout.tsx`** — update from the shell built in [1]:

```
const { user, isLoading } = useAuthStore()
useAuthSync() // starts the listener

if (isLoading) return <AppShellSkeleton />
if (!user) { router.replace('/login?redirect=' + pathname); return null }
if (!user.onboardingCompleted) { router.replace('/onboarding'); return null }
```

**`app/(auth)/layout.tsx`** — redirect authenticated users:

```
if (isLoading) return <FullScreenSpinner />
if (user) { router.replace('/dashboard'); return null }
return <>{children}</>
```

**If Next.js:** Use `usePathname()` from `next/navigation` to get the current path for the redirect param. Use `useRouter()` for the redirect. Mark the guard logic as `'use client'`.

## Verification

I'll verify this implementation automatically. I can:

- Visit `/dashboard` while logged out → expect redirect to `/login?redirect=%2Fdashboard` with no flash of the dashboard.
- Visit `/login` while logged in → expect redirect to `/dashboard` with no flash of the login page.
- Sign in → expect the Zustand store to contain the full Finora `User` object (with `currency`, `role`, `onboardingCompleted` from Firestore), not just the Firebase Auth user.
- Sign in as a user with `onboardingCompleted: false` → expect redirect to `/onboarding`.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Sign out → navigate directly to `/transactions` → expect redirect to `/login?redirect=%2Ftransactions`.
- Sign in → expect redirect to `/transactions` (the redirect param is honored).
- Refresh the page while signed in → expect NO flash of the login screen (loading skeleton appears briefly, then the dashboard renders).

Then give me your honest assessment of:

- Whether the 5-retry approach for the missing Firestore document creates a noticeable delay on first sign-up — specifically, how long is 5 × 500ms = 2.5 seconds of waiting and whether this is acceptable or whether we should show a "Setting up your account..." message during this wait.
