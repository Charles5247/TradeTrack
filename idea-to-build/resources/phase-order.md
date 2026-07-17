# Phase Order Reference

> Defines the sequencing rules for build prompts. The standard 12-phase order below works for most web and mobile projects. Adapt per project based on the feature dependency map in the PRD.

---

## Standard 12-Phase Order (Web / Mobile Apps)

| #   | Phase File                | What It Covers                                                                                                                                                                                                                                        | Dependencies                                                |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | `01-scaffolding.md`       | Project init, folder structure, ALL dependencies, SDK config, env files, base theme, navigation shell, constants, error types, seed scripts, asset generation                                                                                         | None — always first                                         |
| 2   | `02-database.md`          | Every data model/schema/collection, security rules, index definitions, seed data. Each model includes serialization + round-trip unit test                                                                                                            | Phase 1 (SDK configured)                                    |
| 3   | `03-auth.md`              | Sign up, sign in, sign out, stay signed in. User document creation on first sign-up. Auth state provider. Route guard. Every SSO provider in the PRD. Every auth error code → human-readable message. No raw error codes ever shown to users          | Phase 2 (users collection exists)                           |
| 4   | `04-backend-features.md`  | API endpoints (establish contract first), services, repositories, Cloud Functions, scheduled jobs, native plugins, notification backend (triggers, payloads, delivery API integration)                                                                | Phase 3 (auth model established)                            |
| 5   | `05-frontend-features.md` | Data-fetching hooks, state providers / view models, client-side caching config (TanStack Query / SWR / Riverpod), pagination logic, filter and search logic, multi-step form wizards, client-side data transformations                                | Phase 4 (endpoints define the contract)                     |
| 6   | `06-ui-components.md`     | Every reusable component: buttons, cards, modals, form fields, empty states, skeleton loaders, charts. Pure / stateless. Uses design tokens from Phase 2.5. No page-level state. Accessibility requirements per component                             | Phase 2.5 (design tokens locked), Phase 5 (types for props) |
| 7   | `07-pages.md`             | Every full screen/page. Each prompt covers loading, error, empty, and success states explicitly. Composes Phase 6 components wired to Phase 5 state. No "same as X" shortcuts — every page gets its own prompt. Accessibility requirements per screen | Phases 5–6                                                  |
| 8   | `08-integration.md`       | Navigation/routing wiring, deep linking, real-time listeners (WebSockets, Firestore listeners), analytics event instrumentation, cross-feature communication, frontend-to-backend wiring                                                              | Phases 4–7                                                  |
| 9   | `09-security.md`          | Auth middleware on every endpoint, rate limiting, data isolation per user, input sanitization, field-level write rules, secrets audit, API key rotation                                                                                               | Phase 4 (endpoints exist)                                   |
| 10  | `10-error-handling.md`    | Graceful failure for every networked operation, user-facing messages (no raw error codes ever), retry logic, fallback UI, offline behavior                                                                                                            | Phases 7–8 (UI and wiring exist)                            |
| 11  | `11-testing.md`           | Test infrastructure first (helpers, mocks, fake implementations), unit tests per service, component/widget tests per critical screen, integration tests for key flows, security rule tests, accessibility tests, coverage enforcement                 | All prior phases                                            |
| 12  | `12-deployment.md`        | CI pipeline, CD pipeline, platform-specific release config, environment/flavor setup, crash reporting integration, analytics verification, bundle analysis, CDN config, image optimization, app store submission requirements, launch checklist       | Phase 11 validated                                          |

---

## Within-Phase Ordering Rules

### Phase 1 — Scaffolding

Order by dependency:

1. Project init and package manager setup
2. All dependency installation (run once — list every package)
3. Environment variable files (`.env.local`, `.env.example`, all flavors)
4. SDK initialization (Firebase, Supabase, or custom backend client)
5. Base theme and design token files (CSS variables, theme extensions)
6. Navigation shell (routing config, app entry point, bottom nav / sidebar skeleton)
7. Shared constants (`lib/constants/`, `core/constants/`)
8. Shared error types (`lib/errors/`, `core/errors/`)
9. Seed scripts and asset generation (if applicable)

**If Flutter:** Create `pubspec.yaml` with all packages declared before any Dart files.
**If Next.js:** Create `package.json` with all dependencies declared, run `npm install`, then set up `app/layout.tsx` before any feature folders.

### Phase 2 — Database

Order by data dependency:

1. User-related collections first (`users`, `sessions`, `profiles`)
2. Core entity collections (the main entities the app manages)
3. Junction/relationship collections (many-to-many joins)
4. Supporting collections (`notifications`, `audit_logs`, `feature_flags`)
5. Security rules for all collections (one prompt — rules are interdependent)
6. Composite indexes (one prompt per feature's indexes)
7. Seed data (one prompt per collection that needs initial data)

Each collection prompt includes the serialization round-trip unit test.

### Phase 3 — Auth

Order by user flow:

1. Sign-up flow (registration, email verification)
2. Sign-in flow (email/password, plus any SSO providers from PRD)
3. Sign-out and session management
4. Password reset / forgot password
5. Auth state provider and route guard
6. User document creation Cloud Function (fires on `auth.user().onCreate`)
7. Auth error mapping (every Firebase/Supabase error code → human-readable message)

### Phase 4 — Backend Features

Order by contract → implementation → notification:

1. Auth-adjacent endpoints (profile read/update, account deletion)
2. Core entity CRUD endpoints (establish the contract for each feature)
3. Action endpoints (bulk operations, status changes, aggregations)
4. Export endpoints (CSV, PDF, data download)
5. Services implementing each endpoint's logic
6. Repositories handling data access (one per entity)
7. Cloud Functions (event-triggered, then scheduled)
8. Native plugins (platform-specific capabilities)
9. Notification backend (triggers, payloads, FCM/APNs/email delivery setup)
10. Admin endpoints (always last)

### Phase 5 — Frontend Features

Order by foundation → feature-specific:

1. Data-fetching layer configuration (TanStack Query provider, SWR config, Riverpod override)
2. Auth state hook/provider (shared by everything — build first)
3. Feature hooks/providers in PRD feature order (match the order from Phase 4)
4. Pagination and infinite scroll utilities
5. Filter and search state logic
6. Client-side data transformation helpers
7. Multi-step form wizard state (if applicable)

**Conditional notes:**

- **If Flutter (Riverpod):** Create `AsyncNotifierProvider` for each feature. Use `ref.invalidate()` for cache invalidation. Don't use `StateProvider` for complex async state.
- **If Next.js (TanStack Query):** Use `useQuery` for reads, `useMutation` for writes. Set `staleTime: 30_000` as the default unless the feature requires fresh data on every focus.
- **If React Native (Zustand + TanStack Query):** Use Zustand for UI state (modals, filters, selections) and TanStack Query for server state (fetched data). Never mix the two in the same store.

### Phase 6 — UI Components

Order by atomic → complex:

1. Design token application (load theme, verify tokens render correctly)
2. Atomic components (buttons, inputs, badges, avatars, icons)
3. Molecular components (cards, list items, form groups, toggle groups)
4. Organism components (modals, drawers, empty state illustrations, skeleton loaders)
5. Feature-specific components (transaction cards, agent vote displays, chart components)
6. Notification UI components (toast/snackbar system, in-app notification bell)

Every component prompt must include accessibility requirements (ARIA labels, keyboard navigation, focus behavior, contrast ratios).

**Conditional notes:**

- **If Next.js:** Use shadcn/ui as the base. Import from `@/components/ui/`. Every custom component lives in `components/shared/`. Export from barrel files.
- **If Flutter:** Use Material 3 as the base. Every custom widget lives in `core/widgets/` (shared) or `features/{feature}/widgets/` (feature-specific). Never use `BuildContext` across widget boundaries.
- **If React Native:** Use NativeWind for styling. Every component must work on both iOS and Android. Test touch target sizes (minimum 44pt).

### Phase 7 — Pages

Order by user flow:

1. Auth pages (login, register, forgot password, verify email)
2. Onboarding screens (if PRD includes onboarding)
3. Main/dashboard pages
4. Feature CRUD screens (list → detail → create/edit)
5. Settings pages (profile, notifications, preferences, account)
6. Admin pages (always last)

Every page prompt must specify:

- Loading state (skeleton matching the page shape)
- Empty state (illustration, message, primary CTA)
- Error state (error card, retry button, specific error message)
- Success state (confirmation, redirect, or updated UI)
- Accessibility (focus management, screen reader announcements, keyboard navigation)

No page is "basically the same as X" — every page gets its own prompt.

**Conditional notes:**

- **If Next.js:** Every page is a Server Component by default. Add `"use client"` only when the page requires browser-only APIs or React hooks. Use `loading.tsx` for streaming skeleton states.
- **If Flutter:** Every screen is a `ConsumerWidget` (Riverpod) with an explicit build method. Use `GoRouter` for navigation — no `Navigator.push` directly.
- **If React Native:** Every screen is exported from the screens barrel. Use the `useNavigation` hook — never pass `navigation` as a prop.

### Phase 8 — Integration

Order by foundation → feature-specific → analytics:

1. Navigation/routing configuration (register all routes, deep link handling)
2. Push notification handling (foreground, background, tap-to-navigate)
3. Real-time listener setup per feature (Firestore listeners, WebSocket connections)
4. Cross-feature communication (shared events, broadcast channels)
5. Analytics event instrumentation (one prompt per feature area — log every user action defined in the PRD)
6. Performance monitoring integration

**Analytics placement rule:** Analytics event logging is instrumented in Phase 8, not in earlier phases. This prevents analytics calls from blocking or complicating feature implementation. Each analytics prompt lists the exact events to log for one feature area, with event names, properties, and trigger conditions.

### Phase 9 — Security

Order by criticality:

1. Auth middleware verification (every endpoint validates session)
2. Rate limiting (per-IP and per-user limits on all endpoints)
3. Input sanitization (every endpoint validates and sanitizes input)
4. Data isolation audit (every query verifies userId matches auth.uid)
5. Field-level write rules (fields that must never be writable from client)
6. Secrets audit (verify no API keys in client code, all in env vars)
7. API key rotation procedures (documented process, not code)

### Phase 10 — Error Handling

Order by user-facing impact (highest visibility first):

1. Network failure handling (offline detection, retry logic)
2. Auth failure handling (session expiry → redirect, token refresh)
3. Feature-specific error states (one prompt per feature area)
4. Rate limit error handling (user-friendly backoff messaging)
5. Fallback UI for complete failures (generic error page with recovery CTA)
6. Error logging and monitoring (log errors to crash reporter without PII)

### Phase 11 — Testing

Order by foundation → unit → integration → E2E:

1. Test infrastructure (helpers, mocks, fake Firebase/Supabase implementations)
2. Unit tests per service (one prompt per service from Phase 4)
3. Unit tests per frontend feature (one prompt per hook/provider from Phase 5)
4. Component/widget tests per critical screen
5. Integration tests for key user flows (from `user-flows.md`)
6. API endpoint tests (one prompt per endpoint group from Phase 4)
7. Security rule tests (one prompt — tests every blocked operation)
8. Accessibility tests (automated axe/a11y audit per screen)
9. Coverage threshold enforcement (fail CI if below threshold)

### Phase 12 — Deployment

Order by infrastructure → config → verification → launch:

1. CI pipeline (lint, type-check, unit tests on every PR)
2. CD pipeline (auto-deploy to staging on merge to main, manual promote to prod)
3. Environment/flavor configuration (dev, staging, production — separate Firebase projects)
4. Crash reporting integration (Sentry or Firebase Crashlytics with source maps)
5. Analytics verification (verify events arrive in production dashboard)
6. Bundle analysis and performance audit (web: Lighthouse ≥90, mobile: build size report)
7. CDN and image optimization config (Next.js Image, Firebase Hosting cache headers)
8. App store submission config (iOS: App Store Connect, Android: Play Console, Expo EAS for RN)
9. Launch checklist (final pre-launch verification pass)

---

## Extended Phase Order: AI Agent Systems

Use this order for projects with LLM agents, multi-agent orchestration, or autonomous task execution. The agent system must be provably working in a terminal/test harness before any UI code is written.

> **Relationship to standard track:** This track replaces Phases 4–8 of the standard track. Phases 1–3 (Scaffolding, Database, Auth) and Phases 9–12 (Security, Error Handling, Testing, Deployment) follow the standard track.

| #     | Phase File                | What It Covers                                                                                                                                |
| ----- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–3   | Standard                  | Scaffolding, Database, Auth (as above)                                                                                                        |
| 4     | `04-agent-tools.md`       | Every external tool the agents can call (web search, calculator, API client). Each tool: input schema, output schema, error handling, timeout |
| 5     | `05-agent-base.md`        | Base agent class with standard interface: `invoke()`, `get_confidence()`, `format_output()`                                                   |
| 6     | `06-individual-agents.md` | Each agent implementation — one prompt per agent. Each agent: role, inputs, decision logic, confidence score format                           |
| 7     | `07-orchestrator.md`      | Orchestrator / voting mechanism / quorum logic. Define every edge case: abstentions, ties, veto authority                                     |
| 8     | `08-backend-api.md`       | Backend API exposing the agent system to clients                                                                                              |
| 9     | `09-frontend-features.md` | State hooks/providers for agent system (same as standard Phase 5)                                                                             |
| 10    | `10-ui-components.md`     | Agent-specific UI components (vote displays, confidence bars, agent status)                                                                   |
| 11    | `11-pages.md`             | Dashboard pages                                                                                                                               |
| 12    | `12-integration.md`       | Navigation, real-time agent output streaming, analytics                                                                                       |
| 13–16 | Standard (renumbered)     | Security, Error Handling, Testing, Deployment                                                                                                 |

**Critical rules:**

- Never write orchestrator code before all individual agents are tested in isolation
- Never build the UI before the agent system produces correct output in a terminal/test harness
- Never go to live execution before paper/simulation mode is fully validated

---

## Extended Phase Order: Real-Time Trading Systems

> **Relationship to standard track:** This track replaces Phases 4–8. Phases 1–3 and Phases 9–12 follow the standard track (renumbered).

| #     | Phase File                  | What It Covers                                                                                       |
| ----- | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1–3   | Standard                    | Scaffolding, Database, Auth                                                                          |
| 4     | `04-market-data.md`         | WebSocket feed manager, OHLCV ingestion, feed health monitoring, stale-data detection                |
| 5     | `05-paper-engine.md`        | Paper trading engine: simulated order fills, position tracking, P&L calculation, slippage simulation |
| 6     | `06-agent-base.md`          | Base agent class with standard interface                                                             |
| 7     | `07-individual-agents.md`   | Each trading agent — one prompt per agent                                                            |
| 8     | `08-risk-agent.md`          | Risk Agent with circuit breaker authority — separate process, override capability                    |
| 9     | `09-voting-orchestrator.md` | Council voting mechanism, quorum rules, trade proposal lifecycle                                     |
| 10    | `10-execution-agent.md`     | Order placement, modification, cancellation — paper mode only initially                              |
| 11    | `11-backend-api.md`         | Backend API for dashboard and Telegram bot                                                           |
| 12    | `12-telegram-bot.md`        | Trade alerts, daily summaries, conversational interface                                              |
| 13    | `13-frontend-features.md`   | Real-time state, WebSocket listeners, chart data providers                                           |
| 14    | `14-ui-components.md`       | Dashboard UI components (charts, position cards, agent activity)                                     |
| 15    | `15-pages.md`               | Dashboard pages                                                                                      |
| 16    | `16-integration.md`         | Full system wiring, analytics                                                                        |
| 17–20 | Standard (renumbered)       | Security, Error Handling, Testing, Deployment                                                        |
| 21    | `21-live-execution.md`      | Switch from paper to live — ONLY after paper mode validated for minimum 4 weeks                      |

**Critical rules:**

- Phase 21 (live execution) must never be generated until paper mode has been validated
- Risk Agent (Phase 8) must be tested as a separate process with genuine override capability before any execution code is written
- The paper engine (Phase 5) must accurately simulate slippage, partial fills, and rejected orders — not just ideal fills

---

## Adapting Order Per Project

| Project type                     | Adjust phases                                                         |
| -------------------------------- | --------------------------------------------------------------------- |
| API-first (headless backend)     | Run Phases 1–4, 9–12. Skip Phases 5–8 (no frontend)                   |
| Frontend-only (external API)     | Run Phases 1, 5–8, 10–12. Skip Phases 2–4 (no backend)                |
| Web + Mobile (shared backend)    | Run backend phases once. Then run Phases 5–12 separately per platform |
| Real-time features (non-trading) | Add a WebSocket/listener phase between Phase 4 and Phase 5            |
| AI/ML features                   | Use the Extended Agent Phase Order above                              |

---

## Prompt Density Guide

| Phase                 | Typical Prompt Count | Rule of Thumb                                                        |
| --------------------- | -------------------- | -------------------------------------------------------------------- |
| 1 — Scaffolding       | 8–20                 | 1 per feature area + 1 for SDK config + 1 for theme                  |
| 2 — Database          | 5–15                 | 1 per feature's collections + 1 for security rules + 1 for indexes   |
| 3 — Auth              | 5–10                 | 1 per auth flow (sign-up, sign-in, SSO provider, reset, guard)       |
| 4 — Backend Features  | 15–40                | 1 per endpoint group + 1 per service + 1 per Cloud Function          |
| 5 — Frontend Features | 8–20                 | 1 per feature's hooks/providers + 1 for caching config               |
| 6 — UI Components     | 10–25                | 1 per component group (atomic, molecular, organism)                  |
| 7 — Pages             | 15–40                | 1 per page — no exceptions                                           |
| 8 — Integration       | 6–12                 | 1 per integration concern (routing, realtime, analytics, deep links) |
| 9 — Security          | 5–10                 | 1 per security concern                                               |
| 10 — Error Handling   | 8–20                 | 1 per feature area                                                   |
| 11 — Testing          | 15–35                | 1 per service + 1 per critical screen + 1 per integration flow       |
| 12 — Deployment       | 6–10                 | 1 per deployment concern                                             |

**Total range:**

- Simple app: ~120–180 prompts
- Standard app: ~200–350 prompts
- Complex app: ~350–500 prompts
- AI agent system: ~400–600 prompts
- Trading system: ~500–700 prompts
