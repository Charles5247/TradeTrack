# Example: Scaffolding Prompts (Phase 1)

> Shows what Phase 1 prompts look like. All examples use **Finora** — a personal finance tracker built with Next.js 14 (App Router) + Firebase + shadcn/ui + TanStack Query.

---

## [ ] [1] We're setting up the complete Finora project structure, every dependency, environment variables, and the base app shell so every subsequent prompt has a consistent foundation to build on.

**Project init —** Finora is a Next.js 14 application using the App Router with TypeScript in strict mode. The project is initialized with Tailwind CSS and shadcn/ui. The root package.json must list every package we will use in this project, installed in a single `npm install` command — never add packages later unless a new dependency is discovered.

**Dependencies —** Every production and development dependency must be installed in prompt [1]. Do not assume any package will be installed later. The complete list:

- Core: `next@14`, `react`, `react-dom`, `typescript`
- Firebase: `firebase` (client SDK), `firebase-admin` (server SDK)
- UI: `@radix-ui/react-*` packages (via shadcn/ui init), `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`
- Data fetching: `@tanstack/react-query`, `@tanstack/react-query-devtools`
- State: `zustand`
- Forms: `react-hook-form`, `@hookform/resolvers`, `zod`
- Dates: `date-fns`
- Utilities: `nanoid`
- Dev: `@types/node`, `@types/react`, `@types/react-dom`, `eslint`, `eslint-config-next`, `prettier`, `prettier-plugin-tailwindcss`

**Folder structure —** The following directories must be created with `.gitkeep` files to establish the project architecture:

```
app/
  (auth)/login, (auth)/register, (auth)/forgot-password
  (app)/dashboard, (app)/transactions, (app)/categories, (app)/reports, (app)/settings
  api/auth/login, api/auth/register, api/auth/logout
  api/transactions, api/categories, api/reports
components/
  ui/          ← shadcn/ui auto-generated components
  shared/      ← our reusable components (built in Phase 6)
lib/
  firebase/    ← client.ts, admin.ts, firestore.ts, auth.ts
  hooks/       ← data-fetching hooks (built in Phase 5)
  stores/      ← zustand stores (built in Phase 5)
  utils/       ← shared utilities
  types/       ← TypeScript interfaces
  validators/  ← Zod schemas
  constants/   ← app-wide constants
  errors/      ← error type definitions
docs/
  architecture/, design/mockups/
```

**Environment variables —** Create both `.env.local` (with actual values from the user) and `.env.example` (with placeholder strings, committed to git). Required variables:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`
- `FIREBASE_ADMIN_PRIVATE_KEY` (server-only, contains newlines — store as JSON string)
- `FIREBASE_ADMIN_CLIENT_EMAIL` (server-only)
- `NEXTAUTH_SECRET` (server-only, 32 char random string)

**Base theme —** Initialize `app/globals.css` with all CSS custom property tokens from `docs/architecture/design.md`. The tokens must be declared in both `:root` (dark mode defaults) and `[data-theme="light"]`. Do not hardcode any color, spacing, radius, shadow, or animation value in any component — all must reference a CSS variable.

**App shell —** Create `app/(app)/layout.tsx` with a sidebar (desktop ≥ 1024px) and bottom navigation bar (mobile < 1024px). The sidebar and bottom nav are empty shells — no links yet, those are wired in Phase 8 (Integration).

## Instructions

**Project initialization —**

1. Run: `npx create-next-app@latest finora --typescript --tailwind --eslint --app --src-dir=no --import-alias="@/*"`
2. Run: `npx shadcn@latest init` — select: style=New York, base color=Zinc, CSS variables=yes
3. Install all production dependencies: `npm install firebase firebase-admin @tanstack/react-query @tanstack/react-query-devtools zustand react-hook-form @hookform/resolvers zod date-fns nanoid lucide-react clsx tailwind-merge class-variance-authority`
4. Install all dev dependencies: `npm install -D prettier prettier-plugin-tailwindcss`

**next.config.ts —** Set: `experimental.serverComponentsExternalPackages: ['firebase-admin']`. This prevents the Firebase Admin SDK from being bundled for the client.

**tsconfig.json —** Verify `strict: true` is set. Add path alias: `"@/*": ["./*"]`.

**Environment files —**

- `.env.local`: fill from user's Firebase project settings. Mark FIREBASE_ADMIN_PRIVATE_KEY as a JSON-stringified private key: `FIREBASE_ADMIN_PRIVATE_KEY='{"type":"service_account","private_key":"-----BEGIN RSA PRIVATE KEY-----\n..."}'`
- `.env.example`: replace all values with `"your_value_here"` and commit this file

**Folder structure —** Create every directory listed in the specification using `mkdir -p`. Add a `.gitkeep` to each empty directory so they appear in git.

**globals.css —** Copy every CSS token from `docs/architecture/design.md` exactly. Structure:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* paste all tokens from design.md here */
  }
  [data-theme='light'] {
    /* paste light mode overrides */
  }
}
```

**App shell layout —** `app/(app)/layout.tsx`:

- Import `QueryProvider` from `lib/providers/query-provider.tsx` (create this file: wraps children in `QueryClientProvider`)
- The layout renders: `<QueryProvider>` → `<div className="flex min-h-screen">` → `<Sidebar />` (desktop only) → `<main>` → `{children}` → `</main>` → `<BottomNav />` (mobile only)
- `Sidebar` component: fixed left, 240px wide, dark background using `--color-surface`, empty of links for now, shows "Finora" logo text at top
- `BottomNav` component: fixed bottom, full width, 60px height, 5 icon slots (empty for now), uses `--color-surface-elevated` background
- Both components live in `components/shared/layout/`

**lib/constants/index.ts —** Export: `APP_NAME = 'Finora'`, `APP_VERSION = '0.1.0'`, `SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'NGN', 'CAD', 'AUD']`

**lib/errors/index.ts —** Export a `AppError` class extending `Error` with fields: `code: string`, `message: string`, `statusCode: number`. Export constants for error codes: `AUTH_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `VALIDATION_ERROR`, `SERVER_ERROR`.

## Verification

I'll verify this implementation automatically. I can:

- Run `npm run build` — expect no TypeScript errors and no build failures.
- Run `npm run lint` — expect zero ESLint warnings or errors.
- Import `@tanstack/react-query` from a test file — expect no "module not found" errors.
- Check that `.env.example` is committed to git but `.env.local` is in `.gitignore`.
- Check that `docs/architecture/` and `docs/design/mockups/` directories exist.
- Verify that `globals.css` declares CSS variables that match the token names in `docs/architecture/design.md` — no missing tokens.
- Run `npm run dev` — expect the app shell to render at `localhost:3000` with a sidebar (desktop) and empty bottom nav (mobile) and no console errors.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Open `localhost:3000` in a browser at ≥1024px width → expect sidebar to be visible on the left, main content area on the right.
- Resize browser to <1024px → expect sidebar to disappear, bottom nav to appear fixed at the bottom.
- Open browser DevTools console → expect zero errors or warnings.

Then give me your honest assessment of:

- Whether the Firebase Admin SDK `FIREBASE_ADMIN_PRIVATE_KEY` JSON-string approach handles newlines correctly across all deployment environments — specifically, whether Vercel's environment variable editor strips the newlines and breaks the private key parsing at runtime.

---

## [ ] [2] We're initializing the Firebase client SDK, Firebase Admin SDK, and Firestore/Auth/Storage instances as singletons that any module in Finora can import without causing multiple-initialization errors.

**Singleton pattern —** Next.js hot reloads the module system during development. A naive `initializeApp()` on every import will throw "Firebase app already exists." Both the client SDK and the Admin SDK require a guard: check if an instance already exists before initializing. The client-side instances are safe to use in React components and API routes that run on the browser. The Admin SDK instances must never be imported from client-facing code — they contain the private key.

**Client SDK —** The client Firebase app is initialized in `lib/firebase/client.ts`. This file exports: `firebaseApp` (the app instance), `auth` (the Auth instance), `firestore` (the Firestore instance), `storage` (the Storage instance). All are lazy-initialized on first import.

**Admin SDK —** The Admin SDK is initialized in `lib/firebase/admin.ts`. This file is marked `server-only` at the top (using the `server-only` npm package) to prevent it from being accidentally imported by client components. It exports: `adminApp`, `adminAuth`, `adminFirestore`. The private key is parsed from `process.env.FIREBASE_ADMIN_PRIVATE_KEY` using `JSON.parse()`.

## Instructions

**`lib/firebase/client.ts` —**

```
import { getApps, initializeApp, getApp } from 'firebase/app'
const config = { apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, ... } // all 7 env vars
const firebaseApp = getApps().length ? getApp() : initializeApp(config)
export const auth = getAuth(firebaseApp)
export const firestore = getFirestore(firebaseApp)
export const storage = getStorage(firebaseApp)
export { firebaseApp }
```

**`lib/firebase/admin.ts` —**

- First line: `import 'server-only'` — this causes a build error if imported from a client component
- Parse the private key: `const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_PRIVATE_KEY!)` — the private key string in the JSON object contains `\n` as literal characters; replace them: `serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')`
- Guard: `const adminApp = getApps().find(a => a.name === 'admin') ?? initializeApp({ credential: cert(serviceAccount) }, 'admin')`
- Export `adminAuth = getAuth(adminApp)` and `adminFirestore = getFirestore(adminApp)`

**`lib/providers/query-provider.tsx` —** Create this file with `'use client'` at top. Creates the `QueryClient` with default options: `staleTime: 30_000`, `retry: 2`, `retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30_000)`. Wraps children in `QueryClientProvider` and `ReactQueryDevtools` (dev only).

**If Next.js:** The `server-only` package must be installed: `npm install server-only`. Without it, accidentally importing `admin.ts` in a client component produces a silent runtime error rather than a helpful build error.

## Verification

I'll verify this implementation automatically. I can:

- Import `firestore` from `lib/firebase/client.ts` in a test file — expect no initialization error.
- Import `lib/firebase/client.ts` a second time — expect the same instance (no "already initialized" error).
- Import `lib/firebase/admin.ts` from a file marked `'use client'` — expect a build error ("this module cannot be imported from a Client Component").
- Run `npm run build` — expect a clean build with no TypeScript errors.
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- Open `localhost:3000` in development mode → check the terminal for any Firebase initialization errors.
- Open browser DevTools → Network tab → look for any Firebase SDK requests confirming the client is initialized.

Then give me your honest assessment of:

- Whether `JSON.parse(process.env.FIREBASE_ADMIN_PRIVATE_KEY!)` correctly handles the private key in all environments (local, Vercel, Railway) — and whether there's a case where the key is stored without the JSON wrapper that would make this approach fail silently.
