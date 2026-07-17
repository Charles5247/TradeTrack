# Concept Brief

> This document captures the locked-in concept after the idea intake discussion. It serves as the foundation for the PRD and all subsequent planning.

## Project Name

[Project name — short, memorable, descriptive]

## One-Line Description

[What this app does in one sentence. Example: "A mobile app that helps Nigerian small business owners track expenses and stay tax-compliant."]

## Problem Statement

[What problem does this solve? Who has this problem? Why do existing solutions fail?]

## Target Users

[Who are the primary users? Be specific about demographics, role, tech-savviness.]

- **Primary user:** [description]
- **Secondary user (if any):** [description]

## Core Loop

[What is the ONE thing a user does most often?]

A successful session looks like: [describe what the user accomplishes in a typical use]

## Platform

- [ ] Web app (Next.js)
- [ ] Mobile app (Flutter)
- [ ] Mobile app (React Native / Expo)
- [ ] Both web and mobile

## Features

### MVP (Must ship at launch)

1. [Feature name] — [one-line description of what it does]
2. [Feature name] — [one-line description]
3. [Feature name] — [one-line description]
   ...

### Phase 2 (Nice-to-have, post-launch)

1. [Feature name] — [one-line description]
2. [Feature name] — [one-line description]
   ...

### Explicitly Out of Scope

1. [Feature you will NOT build]
2. [Feature you will NOT build]

## Domain-Specific Requirements

- **Industry rules / compliance:** [any regulations, standards, or legal requirements — e.g., CBN regulations for fintech, HIPAA for health, GDPR for EU users. If none, write "None identified."]
- **Compliance flags:** [List any flagged compliance concerns from intake discussion. These must be resolved before the PRD is approved.]
- **Region-specific:** [currency, language, tax laws, date formats, etc.]
- **Terminology:** [any domain-specific terms the app uses — define them here]

## AI & Agent Components

> Complete this section if the project involves LLM integrations, autonomous agents, or AI-powered features. Leave blank if not applicable.

- **AI features:** [List every AI-powered feature — e.g., "council of 9 voting agents", "sentiment analysis", "LLM chat interface"]
- **Agent roles:** [If multi-agent: list each agent's name and one-line responsibility]
- **Orchestration pattern:** [How agents coordinate — e.g., "LangGraph state machine", "voting council with quorum", "single agent loop"]
- **LLM provider:** [Anthropic Claude / OpenAI / Gemini / other]
- **Autonomy level:** [Fully autonomous / human-in-the-loop / human-on-the-loop]
- **Data sources agents read:** [e.g., "live market feeds, Gong transcripts, Slack"]
- **Actions agents can take:** [e.g., "place orders, send alerts, update dashboard"]
- **Safety constraints:** [e.g., "Risk Agent has override authority", "circuit breakers at 2/5/10% drawdown"]

## Inspiration & Aesthetics

- **Inspired by:** [apps, websites, or designs that influenced this idea]
- **Visual references:** [links to Pinterest, Dribbble, screenshots, etc.]
- **Desired aesthetic:** [dark mode, minimalist, vibrant, corporate, playful, etc.]

## Tech Stack Recommendation

- **Frontend:** [Next.js / Flutter / React Native Expo]
- **Backend:** [Firebase / Supabase / FastAPI / custom Node.js / etc.]
- **Database:** [Firestore / PostgreSQL / TimescaleDB / MongoDB / etc.]
- **Auth:** [Firebase Auth / Supabase Auth / NextAuth / etc.]
- **Hosting:** [Vercel / Firebase Hosting / Railway / Hetzner / etc.]
- **Component library:** [shadcn/ui / Material 3 / NativeWind / etc.]
- **Icons:** [Lucide React / Material Icons / Heroicons / etc.]
- **AI/Agent stack (if applicable):** [LangGraph / LangChain / CCXT / Redis / etc.]
- **Reasoning:** [why this stack was chosen]

## Constraints

- **Budget:** [any cost constraints — free tier, limited API calls, etc.]
- **Timeline:** [any deadline or time pressure]
- **Team:** [solo developer / small team / etc.]
- **Existing code:** [is this greenfield or building on existing code?]

## Open Questions (Resolved)

[Document any questions that came up during discussion and their answers]

1. Q: [question] → A: [answer]
2. Q: [question] → A: [answer]

---

**Status:** ☐ Draft | ☐ Locked ← user confirms "locked" before moving to PRD
