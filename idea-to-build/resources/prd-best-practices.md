# PRD Best Practices

> Quality standards for writing a Product Requirements Document. Reference this during Phase 1 to ensure the PRD is comprehensive, clear, and actionable.

---

## What Makes a Great PRD

### 1. It Answers "What" and "Why", Not "How"

- A PRD defines what the product does and why each feature exists
- Implementation details belong in architecture docs, not the PRD
- Exception: tech stack choice belongs in the PRD because it constrains everything downstream

### 2. Every Feature Has Clear Boundaries

Bad: "Users can manage their profile"
Good: "Users can view and edit their display name, email, and profile photo. They cannot change their account ID or registration date. Profile updates are saved immediately and reflected across all pages."

### 3. MVP Is Ruthlessly Scoped

- MVP should be the smallest set of features that solves the core problem
- If a feature is "nice to have," it's P2 — no exceptions
- Every MVP feature must directly support the core loop
- Rule of thumb: if the app works without it, it's not MVP

### 4. Features Are Specific, Not Vague

Bad: "The app should have notifications"
Good: "The app sends push notifications for: new transaction (immediate), weekly spending summary (every Monday 9am), budget threshold exceeded (when spending hits 80% of monthly budget). Users can toggle each notification type independently in Settings."

### 5. Dependencies Are Explicit

- Show which features depend on which
- The dependency map determines build order
- Circular dependencies are a design smell — resolve them

### 6. Out of Scope Is Stated Clearly

- Explicitly list things you will NOT build
- Prevents scope creep and miscommunication
- Examples: "No social features", "No multi-language support in MVP", "No offline mode"

### 7. Non-Functional Requirements Are Specified

- Performance targets (page load time, API response time)
- Security requirements (encryption, auth, rate limiting)
- Accessibility level (WCAG 2.1 AA)
- Scalability expectations (concurrent users, data volume)

### 8. Compliance and Domain Risk Is Addressed Explicitly

If the project operates in a regulated domain, the PRD must address it — not leave it to the architecture docs or build prompts. Regulated domains include:

- **Fintech / Trading:** CBN regulations (Nigeria), SEC rules, broker/exchange terms of service, "not financial advice" disclaimers
- **Health:** HIPAA (US), patient data handling, clinical liability
- **Education (minors):** COPPA, parental consent requirements
- **Data / Privacy:** GDPR (EU users), NDPR (Nigeria), data residency requirements
- **Payments:** PCI-DSS for card data

**If you encounter a regulated domain you don't fully understand:** Flag it explicitly in the PRD rather than guessing. Write "Compliance research needed: [specific regulation]" and note what the user needs to investigate before the architecture doc phase. Do not silently proceed.

---

## Common PRD Mistakes

| Mistake                                  | Problem                                | Fix                                                                   |
| ---------------------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| Too vague                                | Agent makes assumptions                | Add specific behaviors, field names, edge cases                       |
| Too broad MVP                            | Never ships                            | Cut to core loop + auth only                                          |
| Missing error states                     | Agent builds happy path only           | Specify what happens when things go wrong                             |
| No success metrics                       | Can't tell if feature works            | Add measurable outcomes                                               |
| Tech stack without reasoning             | Bad choices go unchallenged            | Explain why each choice was made                                      |
| Missing constraints                      | Unrealistic expectations               | Document budget, timeline, team size                                  |
| No user personas                         | Building for nobody                    | Describe 1-3 specific users                                           |
| Features without user stories            | No motivation for the feature          | Add "As a [user], I want [action] so that [benefit]"                  |
| Skipping compliance section              | Legal/regulatory problems surface late | Address it in the PRD, not after launch                               |
| Treating AI agents as a single "feature" | Agents are a system, not a checkbox    | Each agent, its role, its inputs, and its authority must be specified |

---

## PRD Review Checklist

Before approving the PRD, verify:

### Completeness

- [ ] Problem statement clearly describes the pain point
- [ ] Target audience is specific (not "everyone")
- [ ] At least 1 user persona is defined
- [ ] Every feature has a description and user story
- [ ] Every feature is marked MVP or P2
- [ ] Dependencies between features are mapped
- [ ] Out-of-scope items are listed
- [ ] Tech stack is chosen with reasoning
- [ ] Compliance section is completed or explicitly marked "None identified"
- [ ] If AI agents: agent roster, orchestration design, and safety constraints are defined

### Quality

- [ ] Features describe WHAT, not HOW
- [ ] Features have clear boundaries (what's included and excluded)
- [ ] MVP is genuinely minimal (solves core problem only)
- [ ] No vague language ("should be nice", "user-friendly", "intuitive")
- [ ] Error cases and edge cases are mentioned
- [ ] Non-functional requirements have specific numbers

### Consistency

- [ ] Feature names are consistent throughout the doc
- [ ] No contradictions between features
- [ ] Dependency map matches the feature list
- [ ] Success metrics align with the stated problem

---

## Helpful Framing Questions

When the user's idea is vague, use these to extract clarity:

- "If this app could only do ONE thing, what would it be?"
- "Walk me through what a user does in their first 5 minutes"
- "What would make a user come back tomorrow?"
- "What's the most annoying thing about how they do this today?"
- "If you had to launch in 2 weeks, what would you cut?"
- "Who pays for this? How does it make money?"
- "What data does this app absolutely need to store?"
- "What happens when the user has no data yet?"

### Additional questions for AI agent projects:

- "What happens when two agents disagree?"
- "What happens when an agent returns no signal (abstains)?"
- "What is the worst thing the system could do autonomously, and how do we prevent it?"
- "How do you validate that the agents are performing correctly before trusting them with real actions?"
- "Is there a human-in-the-loop checkpoint before irreversible actions?"
