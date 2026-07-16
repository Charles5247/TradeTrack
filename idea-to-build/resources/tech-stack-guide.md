# Tech Stack Guide

> Decision tree for recommending the right tech stack based on project requirements. Use this during Phase 1 (PRD Generation) to make informed stack recommendations.

---

## Frontend Framework

### Web App

**Default: Next.js**

- Use Next.js (App Router) for all web applications
- Reasons: SSR/SSG support, API routes, file-based routing, React ecosystem, Vercel deployment

### Mobile App

**Choose based on requirements:**

| Criteria                                 | Flutter                 | React Native (Expo)           |
| ---------------------------------------- | ----------------------- | ----------------------------- |
| Performance-critical (animations, 60fps) | ✅ Preferred            | Good enough                   |
| Heavy platform-specific features         | ✅ Better native access | Expo modules cover most cases |
| User knows Dart                          | ✅ Use Flutter          | —                             |
| User knows React/JS                      | —                       | ✅ Use Expo                   |
| Code sharing with web (Next.js)          | Separate codebase       | Can share logic/types         |
| Rapid prototyping                        | Good                    | ✅ Faster with Expo           |

**Default recommendation:** Flutter if performance or native feel is critical. React Native (Expo) if the user already has a Next.js web app and wants to share code.

### Both Web + Mobile

- **Option A:** Next.js (web) + Flutter (mobile) — separate codebases, shared backend
- **Option B:** Next.js (web) + React Native Expo (mobile) — can share TypeScript types and some logic

---

## Backend / Database

### Firebase (Default for most projects)

**Use when:**

- Solo developer or small team
- Need real-time data syncing
- Want managed auth with multiple providers
- Need file storage (images, PDFs)
- Budget-conscious (generous free tier)
- NoSQL data model works for the domain

**Includes:** Firestore (database), Firebase Auth, Cloud Functions, Cloud Storage, Hosting

### Supabase

**Use when:**

- Need relational data (SQL, joins, foreign keys)
- Want PostgreSQL features (full-text search, JSON columns)
- Need Row Level Security (built-in)
- Want real-time subscriptions on SQL data
- Open-source preference

**Includes:** PostgreSQL, Auth, Edge Functions, Storage, Realtime

### Custom Backend (FastAPI / Node.js + PostgreSQL)

**Use when:**

- Complex business logic requiring full control
- Need advanced SQL features (stored procedures, triggers)
- Integration with many third-party services
- AI/ML workloads (Python ecosystem preferred)
- Enterprise requirements
- Team has backend expertise

**FastAPI (Python):** Preferred when the project has AI agents, LLM integrations, or ML pipelines — the Python ecosystem (LangChain, LangGraph, CCXT, pandas, scikit-learn) is far richer than Node.js for these use cases.

**Node.js/Express:** Preferred when the project is primarily a CRUD API with no ML workloads and the team is JS-native.

---

## Component Libraries

### Next.js Projects

| Library                 | When to Use                                                                 |
| ----------------------- | --------------------------------------------------------------------------- |
| **shadcn/ui** (default) | Modern, customizable, built on Radix UI + Tailwind. Best for most projects. |
| **Material UI (MUI)**   | Enterprise/dashboard apps. Heavy but feature-rich.                          |
| **Chakra UI**           | Clean, accessible. Good middle ground.                                      |
| **Headless UI**         | When you want full control over styling.                                    |

### Flutter Projects

| Library                  | When to Use                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| **Material 3** (default) | Built-in, follows Google's design system. Best for most projects. |
| **Cupertino**            | iOS-native look and feel.                                         |
| **Custom**               | When the app needs a unique brand identity.                       |

### React Native Projects

| Library                          | When to Use                                     |
| -------------------------------- | ----------------------------------------------- |
| **NativeWind + Paper** (default) | Tailwind-style utilities + Material components. |
| **Tamagui**                      | Cross-platform with web support.                |
| **Gluestack UI**                 | Accessible, themeable.                          |

---

## Icons

| Stack        | Default Library                   |
| ------------ | --------------------------------- |
| Next.js      | Lucide React                      |
| Flutter      | Material Icons (built-in)         |
| React Native | Lucide React Native or Expo Icons |

---

## State Management

| Stack        | Default                  | Alternative          |
| ------------ | ------------------------ | -------------------- |
| Next.js      | Zustand + TanStack Query | Redux Toolkit, Jotai |
| Flutter      | Riverpod                 | BLoC, Provider       |
| React Native | Zustand + TanStack Query | Redux Toolkit        |

---

## Hosting / Deployment

| Stack              | Default                    | Alternative                         |
| ------------------ | -------------------------- | ----------------------------------- |
| Next.js            | Vercel                     | Firebase Hosting, Railway, Netlify  |
| Flutter (web)      | Firebase Hosting           | Vercel, Netlify                     |
| Flutter (mobile)   | Google Play + App Store    | Firebase App Distribution (testing) |
| React Native       | Expo EAS Build + Submit    | Manual builds                       |
| Backend (Firebase) | Firebase (automatic)       | —                                   |
| Backend (Supabase) | Supabase Cloud (automatic) | Self-hosted                         |
| Backend (Custom)   | Railway, Render, Fly.io    | AWS, GCP, DigitalOcean              |

---

## Advanced / Non-Standard Project Stacks

Use this section when the project goes beyond a standard CRUD web or mobile app.

### AI Agent Systems

For systems with autonomous agents, LLM orchestration, or multi-agent voting/coordination:

| Layer               | Recommended                     | Why                                                                                           |
| ------------------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| Agent orchestration | LangGraph                       | Native support for agent loops, state machines, conditional branching, and multi-agent graphs |
| LLM provider        | Anthropic Claude API            | Best tool use, instruction following, and long-context performance                            |
| Agent communication | Redis pub/sub                   | Fast, lightweight message bus between agents                                                  |
| Backend             | FastAPI (Python)                | Python ecosystem matches AI/ML libraries; async support for concurrent agent calls            |
| Prompt caching      | Anthropic cache_control markers | Essential for long-running agents — 90% cost reduction on input tokens                        |
| Memory/state        | PostgreSQL + Redis              | PostgreSQL for persistent agent logs and decisions; Redis for ephemeral working state         |
| Task queue          | Celery + Redis                  | For long-running agent tasks that should not block the API                                    |

**Phase order note:** Use the Extended AI Agent Phase Order in `phase-order.md`. Agent infrastructure (Phases 4–7 of that track) must be complete and producing correct output in a terminal/test harness before any UI phases (Phases 9–11) are started. Never build the UI before the agent system is proven in isolation.

### Real-Time Trading Systems (Forex / Crypto)

| Layer                | Recommended                            | Why                                                                 |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| Market data          | CCXT (crypto) / broker REST+WS         | CCXT provides unified API for 100+ crypto exchanges                 |
| Time-series database | TimescaleDB (PostgreSQL extension)     | Optimised for OHLCV candle data; SQL compatible                     |
| Operational database | PostgreSQL                             | Positions, trades, agent logs, voting records                       |
| Cache / message bus  | Redis                                  | Real-time price feeds, agent communication, circuit breaker state   |
| Backend              | FastAPI (Python)                       | Python ecosystem: CCXT, pandas, TA-Lib, scikit-learn                |
| Paper trading engine | Custom (build first)                   | Simulate order fills against live price feeds before any real money |
| WebSocket management | websockets (Python) / CCXT WS          | Feed health monitoring, reconnection logic, stale data detection    |
| Dashboard frontend   | Next.js + shadcn/ui                    | Web dashboard for positions, agent activity, risk metrics           |
| Notifications        | Telegram Bot API (python-telegram-bot) | Real-time trade alerts to mobile without building a mobile app      |
| Deployment           | Single VPS (Railway / Hetzner)         | Cost-effective for solo trading infrastructure                      |

**Critical rule:** Paper trading engine must be complete and validated before any real-money execution code is written.

### Real-Time Collaborative / Event-Driven Apps

| Layer                  | Recommended                               | Why                                                  |
| ---------------------- | ----------------------------------------- | ---------------------------------------------------- |
| WebSocket server       | Socket.io (Node.js) or FastAPI WebSockets | Bidirectional real-time communication                |
| Pub/Sub                | Redis pub/sub                             | Broadcasting events across multiple server instances |
| Database               | Supabase (PostgreSQL + Realtime)          | Built-in real-time subscriptions on SQL tables       |
| Operational transforms | Y.js (if collaborative editing)           | CRDT-based conflict resolution for concurrent edits  |

### ML / Model Training Pipelines

| Layer                | Recommended                                        | Why                                                            |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| Training framework   | scikit-learn (classical) / PyTorch (deep learning) | Depends on complexity of model                                 |
| Experiment tracking  | MLflow                                             | Track model versions, parameters, and metrics                  |
| Shadow mode          | Custom evaluation harness                          | Run new models in parallel with production, compare outputs    |
| Model promotion gate | Automated evaluation script                        | Only promote a model if it beats baseline on held-out test set |
| Feature store        | PostgreSQL or Redis                                | Serve pre-computed features to models at inference time        |

---

## Notification & Analytics Stack

### Push Notifications

| Stack               | Recommended                    | Why                                                           |
| ------------------- | ------------------------------ | ------------------------------------------------------------- |
| Firebase projects   | Firebase Cloud Messaging (FCM) | Free, integrates with Firebase Auth, works on Android + iOS   |
| Flutter iOS         | APNs via FCM (FCM wraps APNs)  | FCM handles the APNs certificate complexity                   |
| React Native (Expo) | Expo Notifications             | Handles FCM + APNs unified; Expo EAS makes configuration easy |
| Next.js (web)       | Web Push API + FCM             | FCM supports web push via VAPID keys                          |

### Email Notifications

| Provider                 | When to Use                                                                      |
| ------------------------ | -------------------------------------------------------------------------------- |
| **Resend** (default)     | Clean API, great developer experience, good deliverability, free tier covers MVP |
| **SendGrid**             | High volume (>10,000 emails/day), advanced analytics needed                      |
| Firebase Email Extension | Simple transactional emails triggered by Firestore writes, minimal code          |

### In-App Notifications

| Approach                                       | When to Use                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| Firestore `notifications` collection (default) | Simple, real-time via Firestore listener, free                                   |
| Novu                                           | Complex notification routing, multi-channel (push + email + in-app) from one API |

### Analytics

| Provider                         | When to Use                                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Firebase Analytics** (default) | Free, integrates with Crashlytics and Firebase console, good for mobile                        |
| **PostHog**                      | Open-source, self-hostable, better for product analytics (funnels, cohorts, session recording) |
| Mixpanel                         | Advanced behavioral analytics, strong mobile SDK                                               |

### Crash Reporting

| Provider                           | When to Use                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| **Firebase Crashlytics** (default) | Free, integrates with Firebase console, excellent for Flutter and React Native |
| **Sentry**                         | Better error context and source maps for web (Next.js), better stack traces    |

---

## Decision Checklist

When recommending a stack, verify:

- [ ] Frontend framework matches the platform (web/mobile/both)
- [ ] Backend language matches the workload (Python for AI/ML, Node.js/TS for CRUD)
- [ ] Backend matches the data model complexity (NoSQL vs SQL vs time-series)
- [ ] Auth solution matches the required providers (email, Google, Apple, etc.)
- [ ] Component library matches the desired aesthetic
- [ ] Hosting solution fits the budget (free tier sufficient for MVP?)
- [ ] The user has experience with the recommended stack (or is willing to learn)
- [ ] All required third-party integrations are compatible
- [ ] If agents are involved: LangGraph + FastAPI + Redis are in the stack
- [ ] If trading is involved: CCXT + TimescaleDB + paper engine are in the stack
- [ ] If real-time feeds are involved: WebSocket management and stale-data detection are planned
- [ ] Notification delivery method chosen (FCM / APNs / Expo) and backend trigger mechanism defined
- [ ] Analytics provider chosen and key events to track identified in the PRD
- [ ] Crash reporting provider chosen and added to the Tech Stack table in the PRD
