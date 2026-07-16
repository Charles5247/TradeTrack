# Product Requirements Document (PRD)

> This is the single source of truth for what we are building. Every architecture decision, every build prompt, and every test traces back to this document.

---

## 1. Overview

### Project Name

[Name]

### One-Line Description

[What this app does in one sentence]

### Problem Statement

[What problem are we solving? For whom? Why now?]

### Target Audience

| Persona | Description                 | Primary Need                   |
| ------- | --------------------------- | ------------------------------ |
| [Name]  | [Age, role, tech-savviness] | [What they need from this app] |
| [Name]  | [Age, role, tech-savviness] | [What they need from this app] |

### Success Metrics

- [Metric 1 — e.g., "User can complete sign-up in under 60 seconds"]
- [Metric 2 — e.g., "Dashboard loads in under 2 seconds"]
- [Metric 3]

---

## 2. Tech Stack

| Layer                          | Technology                                       | Reasoning         |
| ------------------------------ | ------------------------------------------------ | ----------------- |
| Frontend                       | [Next.js / Flutter / React Native Expo]          | [Why this choice] |
| Backend                        | [Firebase / Supabase / FastAPI / Node.js]        | [Why]             |
| Database                       | [Firestore / PostgreSQL / TimescaleDB / MongoDB] | [Why]             |
| Auth                           | [Firebase Auth / Supabase Auth / NextAuth]       | [Why]             |
| Storage                        | [Firebase Storage / S3 / Cloudinary]             | [Why]             |
| Hosting                        | [Vercel / Firebase Hosting / Railway / Hetzner]  | [Why]             |
| Component Library              | [shadcn/ui / Material 3 / NativeWind]            | [Why]             |
| Icons                          | [Lucide React / Material Icons]                  | [Why]             |
| State Management               | [Zustand / TanStack Query / Riverpod / Redux]    | [Why]             |
| AI/Agent Stack (if applicable) | [LangGraph / CCXT / Redis / etc.]                | [Why]             |

### Key Libraries

| Library | Purpose        | Version               |
| ------- | -------------- | --------------------- |
| [name]  | [what it does] | [version or "latest"] |
| [name]  | [what it does] | [version or "latest"] |

---

## 3. Compliance & Regulatory Notes

> Complete this section if the project operates in a regulated domain. Leave as "None identified" if not applicable. Do not proceed past this section without resolving flagged items.

- **Applicable regulations:** [e.g., CBN guidelines for fintech, NDPR for Nigerian data, GDPR for EU users, HIPAA for health data, PCI-DSS for payment processing]
- **Flagged compliance concerns:** [Any issues raised during Phase 0 that need resolution]
- **How the product stays compliant:** [Specific measures — e.g., "All trades are on user's own account only, no third-party fund management", "User data stored in-region only", "No PII stored beyond what auth requires"]
- **Legal disclaimer requirements:** [e.g., "Not financial advice", "Not a signal service", "For personal use only"]

---

## 4. Features

### MVP Features [Launch]

#### F1: [Feature Name]

- **Description:** [What this feature does in plain English]
- **User story:** As a [user type], I want to [action] so that [benefit]
- **Key behaviors:**
  - [Behavior 1]
  - [Behavior 2]
- **Depends on:** [other feature IDs, e.g., F3]
- **Priority:** MVP

#### F2: [Feature Name]

- **Description:** [What this feature does]
- **User story:** As a [user type], I want to [action] so that [benefit]
- **Key behaviors:**
  - [Behavior 1]
  - [Behavior 2]
- **Depends on:** [dependencies]
- **Priority:** MVP

[Continue for all MVP features...]

### Phase 2 Features [Post-Launch]

#### F10: [Feature Name]

- **Description:** [What this feature does]
- **User story:** As a [user type], I want to [action] so that [benefit]
- **Priority:** P2

[Continue for all P2 features...]

### Explicitly Out of Scope

- [Thing we will NOT build, and why]
- [Thing we will NOT build, and why]

---

## 5. Feature Dependency Map

```
F1 (Auth) ──→ F2 (Profile) ──→ F5 (Settings)
     │
     └──→ F3 (Dashboard) ──→ F4 (Transactions)
                                    │
                                    └──→ F6 (Reports)
                                    └──→ F7 (Export)
```

[Describe the dependency order in plain English — which features must be built first]

---

## 6. AI Systems (Optional — complete if project has agents or LLM features)

> Skip this section entirely if the project has no AI agents or LLM integrations.

### Agent Roster

| Agent Name | Role            | Inputs          | Outputs            | Authority                     |
| ---------- | --------------- | --------------- | ------------------ | ----------------------------- |
| [Agent 1]  | [One-line role] | [What it reads] | [What it produces] | [Voter / Override / Executor] |
| [Agent 2]  | [One-line role] | [What it reads] | [What it produces] | [Voter / Override / Executor] |

### Orchestration Design

- **Pattern:** [LangGraph state machine / custom loop / voting council / hierarchical]
- **Quorum rule:** [e.g., "5 of 9 agents must vote YES for a trade to proceed"]
- **Tie-breaking:** [e.g., "Abstain = no vote; deadlock = no action taken"]
- **Override authority:** [e.g., "Risk Agent can veto any decision regardless of vote count"]
- **Escalation to human:** [When does the system pause and ask for human confirmation?]

### Safety Constraints

- [Constraint 1 — e.g., "Circuit breaker at 2% drawdown: throttle new orders"]
- [Constraint 2 — e.g., "Circuit breaker at 5% drawdown: freeze all new orders"]
- [Constraint 3 — e.g., "Circuit breaker at 10% drawdown: close all positions at market"]
- [Constraint 4 — e.g., "No single agent can initiate an action without council approval"]

### Validation Gate

- [How is the agent system validated before going to production? e.g., "Paper trading mode for minimum 4 weeks with documented performance metrics before live execution is enabled"]

---

## 7. User Roles & Permissions

| Role  | Can Do                                                | Cannot Do                                |
| ----- | ----------------------------------------------------- | ---------------------------------------- |
| Guest | View public pages, sign up                            | Access app features                      |
| User  | Full access to own data                               | Access other users' data, admin features |
| Admin | All user abilities + manage users, view system health | Delete the system                        |

---

## 8. Non-Functional Requirements

### Performance

- Page load: under [X] seconds
- API response: under [X]ms for reads, [X]ms for writes
- Support [X] concurrent users
- Agent response time: under [X] seconds per decision cycle (if applicable)

### Security

- All data encrypted in transit (HTTPS)
- Passwords hashed (bcrypt/argon2)
- API rate limiting on all endpoints
- User data isolation (users can only access own data)
- Environment variables for all secrets
- Exchange API keys stored encrypted, never in client code (if applicable)

### Accessibility

- WCAG 2.1 AA compliance
- Keyboard navigation support
- Screen reader compatible
- Minimum contrast ratios

### Localization

- Primary language: [English / etc.]
- Currency: [USD / NGN / BTC / etc.]
- Date format: [MM/DD/YYYY / DD/MM/YYYY / etc.]

---

## 9. Constraints & Assumptions

### Constraints

- [Budget constraint — e.g., "Must use free-tier services"]
- [Timeline constraint — e.g., "MVP in 4 weeks"]
- [Team constraint — e.g., "Solo developer"]

### Assumptions

- [Assumption 1 — e.g., "Users have stable internet"]
- [Assumption 2 — e.g., "Firebase free tier is sufficient for MVP"]

---

## 10. Risks & Mitigations

| Risk               | Impact       | Likelihood   | Mitigation        |
| ------------------ | ------------ | ------------ | ----------------- |
| [Risk description] | High/Med/Low | High/Med/Low | [How to mitigate] |
| [Risk description] | High/Med/Low | High/Med/Low | [How to mitigate] |

---

**Status:** ☐ Draft | ☐ Approved ← user confirms before moving to architecture
