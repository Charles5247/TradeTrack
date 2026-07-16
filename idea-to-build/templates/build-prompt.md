# Build Prompt Template

> Every build prompt follows this exact 4-section structure. The executing AI agent has zero decisions to make — it only executes what is specified here.

---

## Format Overview

### Numbering & Title

```
## [ ] [N] A plain English sentence describing exactly what will exist when this step is done.
```

- `[ ]` = incomplete checkbox. Change to `[x]` when done.
- `[N]` = sequential number across the whole project (not per-phase).
- The title is a **complete sentence**, not a label or heading.

**Approved title formats:**

- `We're building the [X] that [handles/manages/enforces] [Y] and [Z].`
- `Let's set up the [X] that [protects/computes/validates] [Y].`
- `We need the [ScreenName] — the [role it plays] in the app.`
- `Let's create the [X] Cloud Function that fires when [Y] happens.`

**Never use generic titles:** `"Set up auth"`, `"Build the database"`, `"Create the page"` — these say nothing about what exists when the step is done.

---

### Section 1 — Specification Paragraphs

2–6 paragraphs of plain English. Use **bold labels followed by an em dash** to organize sections. Be exhaustive. Pull actual names from the architecture docs.

Do **NOT** write code here. Do **NOT** list file paths as instructions. Describe _behavior and requirements only_.

### Section 2 — Instructions

The executable specification. Complete enough that a skilled developer who has never read the PRD can implement this step correctly from this section alone.

### Section 3 — Verification

Uses "I'll verify" language. Exact automated checks, a manual test walkthrough, and 1–2 focused honest advice questions.

---

## Template

---

## [ ] [N] [A plain English sentence. What exactly will exist when this step is done?]

**[Label] —** [First specification paragraph. Describe this aspect exhaustively. Cover every field, every validation rule, every edge case, every state transition, every user-facing behavior. Write it the way a senior engineer would brief a teammate who has never seen the PRD. Reference actual field names, collection paths, enum values, and business rules from the documents. Do NOT write code here. Do NOT list file paths. Describe behavior and requirements only.]

**[Label] —** [Second paragraph covering another dimension of this step. Use bullet points for lists of items:]

- [Specific item with exact values — never vague descriptions]
- [Specific item with exact values]
- [Specific item with exact values]

**[Label] —** [Third paragraph: edge cases, security constraints, business rules written as explicit conditions. State transitions as: [trigger] → [old state] becomes [new state]. Name exactly who can write each field. Call out anything that must never be written from client code.]

**[Label] —** [Fourth paragraph if needed: performance constraints, ordering dependencies ("X must complete before Y"), or domain/platform/regulatory requirements pulled from the PRD. These are the constraints most likely to be missed.]

## Instructions

**[Label] —** [Organized with the same bold-label sections as above, now expanded to execution-level detail:]

- Exact file path: `path/to/file.ts`
- Every field: `fieldName` (`type`, required/optional, default: `value`, validation: `rule`)
- Business rule: if [condition], then [exact outcome] — never "handle appropriately"
- Error response: `[HTTP code]` with body `{ code: "ERROR_CODE", message: "Exact user-facing message" }`
- Do not [common mistake that would break this step]
- This must write to [X] before [Y]

**If Next.js:**
[Stack-specific file paths, import statements, component names, and patterns for Next.js. Example: Create the file at `app/api/auth/login/route.ts`. Import `auth` from `@/lib/firebase/admin`. Use the `loginSchema` from `@/lib/validators/auth.ts`.]

**If Flutter:**
[Stack-specific file path, widget/class names, provider patterns, and conventions for Flutter. Example: Create the file at `lib/features/auth/providers/auth_provider.dart`. Use `AsyncNotifierProvider` from Riverpod. Import `GoRouter` from `go_router: ^14.0.0`.]

**If React Native (Expo):**
[Stack-specific file path, component names, and patterns. Example: Create the file at `src/features/auth/screens/LoginScreen.tsx`. Use `NativeWind` for styling. Import from `@/lib/api`.]

## Verification

I'll verify this implementation automatically. I can:

- [Exact automated check: describe the specific action and the specific expected result. Never "verify it works." Example: "Submit the form with an empty email field — expect the submit button to remain disabled and no network request to fire."]
- [Security check: attempt the action that should be blocked — expect exact error. Example: "Sign in as User A, attempt to fetch User B's private document at `users/{userBId}/private` — expect `403 Forbidden`, not `404 Not Found`."]
- [Edge case check: the non-obvious failure that breaks naive implementations. Example: "Create two transactions at the exact same millisecond — expect both to appear in the list with distinct IDs, not overwriting each other."]
- [Data integrity check: verify computed fields, counters, or derived state. Example: "After soft-deleting a transaction, query `users/{uid}/transactions` where `isDeleted == false` — expect the deleted item not to appear."]
- [Build check: "The project still builds and all existing tests still pass after this step."]
- Suggest improvements before we move to the next step.

For manual testing, I'll guide you step-by-step through:

- [Specific user action → what they should see. Example: "Open `/login` → enter a valid email and password → click Sign in → expect redirect to `/dashboard` within 1 second."]
- [A second path through the feature. Example: "Enter the correct email but wrong password → click Sign in → expect 'Invalid email or password' to appear above the form, no redirect."]
- [Test for the failure or empty state. Example: "Disconnect Wi-Fi → click Sign in → expect 'Network error. Check your connection.' toast notification, no spinner stuck."]

Then give me your honest assessment of:

- [The single most likely failure mode or architectural risk in this step, phrased as a specific question the agent should investigate and report on. Example: "Whether the session cookie approach handles concurrent tab sessions correctly — specifically, what happens if the user is logged in on two tabs and logs out in one: does the other tab detect the session expiry immediately or only on next navigation?"]

---

## Usage Notes

### Cross-Referencing Prior Prompts

When a prompt depends on work from a previous step, reference it by **both number and artifact description**:

✅ Correct: `"Call the login endpoint built in [12] We're building the POST /api/auth/login endpoint that validates credentials and issues a session cookie."`

❌ Wrong: `"Call the login endpoint we built earlier."`

### When to Group Into One Prompt

**Group together:**

- A data model + its serialization unit test
- A screen + its skeleton loader + its error widget (if only used by this screen)
- A Cloud Function + the utility function it calls
- A Firestore security rules file (rules are interdependent — always one prompt)

**Keep separate:**

- Two services with distinct logic and distinct failure modes
- Two screens even if they look similar (each has different data requirements)
- A repository and the state hook/provider that uses it (different layers)
- A scheduled Cloud Function and an event-triggered Cloud Function

### Splitting Large Features

When a feature is too large for one prompt, split by **vertical slice** — each slice must be independently deployable and testable.

Split by:

1. Read operations vs. write operations
2. Authenticated paths vs. public paths
3. Happy path vs. edge case handling

Never split a prompt mid-function or mid-component. Always cut at a clean architectural boundary.

### Accessibility (UI Prompts Only)

Every prompt that creates a UI component or screen must include in its Instructions:

- ARIA labels for interactive elements
- Keyboard navigation behavior (Tab order, Enter/Space activation)
- Focus management (where focus moves after modal open/close, form submit)
- Minimum contrast ratio (4.5:1 for body text, 3:1 for large text)

### Writing Quality Checklist

Before finalizing any prompt, verify:

**Format**

- [ ] Title is a descriptive sentence using an approved format
- [ ] Specification has 2–6 paragraphs with bold-label — em dash sections
- [ ] Specification describes behavior only (no code, no file paths)
- [ ] Instructions section uses exact names from architecture docs

**Specificity**

- [ ] Every file path is explicit
- [ ] Every field name matches data-models.md exactly
- [ ] Every endpoint path matches api-endpoints.md exactly
- [ ] Prior work referenced by [N] + short artifact description
- [ ] No decisions left to the executing agent

**Coverage**

- [ ] Every UI state specified: loading, empty, error, success
- [ ] Every error has exact HTTP code + exact user-facing message
- [ ] Stack-conditional sections present where behavior differs
- [ ] Accessibility requirements included in every UI prompt

**Security**

- [ ] Who can write each field is explicitly named
- [ ] Who can read each collection or endpoint is explicitly named
- [ ] What happens on unauthorized request is specified

**Verification**

- [ ] Every automated check is a specific action with a specific expected outcome
- [ ] Manual walkthrough covers at least one happy path and one failure path
- [ ] Honest advice has 1–2 questions (never generic "what could go wrong?")
- [ ] Context cross-references use [N] + description format
