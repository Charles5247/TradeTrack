# Prompt Writing Rules

> Rules for writing build prompts that any AI coding agent can execute with zero ambiguity. Every prompt must be so specific that the executing agent makes no decisions — it only follows instructions.

---

## The Golden Rule

**If an AI agent could interpret your instruction in two different ways, it WILL pick the wrong one.** Eliminate all ambiguity before the prompt is written, not after it is executed.

---

## Rule 1 — Format Is Non-Negotiable

Every build prompt follows the exact 4-section structure defined in `templates/build-prompt.md`. No deviations.

```
## [ ] [N] Descriptive sentence title.

[Specification paragraphs — behavior and requirements, plain English, bold-label sections]

## Instructions
[Executable specification — file paths, field types, error codes, business rules]

## Verification
I'll verify... [automated checks, manual walkthrough, 1–2 honest advice questions]
```

**Bad:** A prompt that has code in the specification section, or instructions that describe what to think rather than what to build, or a verification section that says "make sure it works."

**Good:** A prompt where the specification paragraphs describe behavior in plain English, the instructions give the exact files and field names to implement, and the verification lists specific actions with specific expected outcomes.

**Why:** A consistent format means any executing agent — Claude, Cursor, Windsurf, Gemini — can process the prompt the same way. Format deviation creates ambiguity about what is a requirement vs. what is context.

### What is allowed in Instructions (and what is not)

The Instructions section is a **spec**, not an implementation. Use this table to decide whether a code snippet belongs:

| Content                                                                    | Allowed? | Reasoning                                                                              |
| -------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| TypeScript interface or type alias (≤10 lines)                             | ✅ Yes   | It is a spec — it defines the exact shape the agent must produce                       |
| Zod / Pydantic schema showing field names and validation rules (≤10 lines) | ✅ Yes   | It is a spec — removes ambiguity about field types and constraints                     |
| Numbered prose steps (`1. Validate → 2. Check ownership → 3. Write`)       | ✅ Yes   | Structured prose, not code                                                             |
| Enum definition showing allowed string values                              | ✅ Yes   | Spec-level — tells the agent the exact values without showing implementation           |
| Full function implementation (logic, control flow, return statements)      | ❌ No    | The agent copies instead of implementing — bugs in the prompt become bugs in the code  |
| Full React component or Flutter widget body                                | ❌ No    | Same problem — agent ships the prompt's code verbatim                                  |
| Full GitHub Actions / CI workflow YAML                                     | ❌ No    | Hides the reasoning — agent cannot adapt it when the environment differs               |
| Complete test file with all test cases written out                         | ❌ No    | Agent copies the tests; misses edge cases not listed                                   |
| Complete middleware / route handler implementation                         | ❌ No    | The most important logic (security, error handling) must be reasoned about, not copied |

**The boundary:** If removing the code block from Instructions would leave the agent unable to determine the exact shape of what to build → it is a spec and may stay. If removing the code block would leave the agent able to determine the shape but unable to skip writing the implementation → it should not be in Instructions.

**Bad:**

```typescript
// ❌ This is an implementation — remove it from Instructions
export async function middleware(request: NextRequest) {
  const session = request.cookies.get('session')?.value;
  if (!session) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
  try {
    const { adminAuth } = await import('@/lib/firebase/admin');
    const claims = await adminAuth.verifySessionCookie(session, true);
    const headers = new Headers(request.headers);
    headers.set('x-user-id', claims.uid);
    return NextResponse.next({ request: { headers } });
  } catch {
    return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
  }
}
```

**Good (replace with prose spec):**

```
**Middleware processing order —**
1. Check if the path matches a public route (list them explicitly) — if yes, return NextResponse.next() unchanged.
2. Read the `session` cookie from `request.cookies.get('session')`.
3. If missing: return 401 with `{ code: 'UNAUTHORIZED', message: 'You must be signed in.' }`.
4. Call `adminAuth.verifySessionCookie(session, true)`. On any error: return 401 with `{ code: 'UNAUTHORIZED', message: 'Your session has expired. Please sign in again.' }`.
5. Clone the request headers, set `x-user-id` to the verified `uid`.
6. Return `NextResponse.next({ request: { headers: modifiedHeaders } })`.
```

---

## Rule 2 — Grouping Logic

**Group into one prompt when files are tightly coupled and meaningless alone:**

- A data model + its serialization unit test
- A screen + its skeleton loader + its error widget (if used only by this screen)
- A Cloud Function + the utility function it calls
- A Firestore security rules file (rules are interdependent — always one prompt)
- A native plugin's Dart API + its platform implementations (Android + iOS together)

**Keep in separate prompts when each unit is independently verifiable:**

- Two services with distinct logic and distinct failure modes
- Two screens even if they look similar — each has different data requirements
- A repository and the state hook/provider that uses it (different layers, different tests)
- A Cloud Function trigger and a scheduled Cloud Function (different lifecycles)
- Auth middleware and rate limiting (distinct security concerns)

**Why:** Grouping tightly coupled code prevents the "stub everything" failure mode where the agent creates incomplete placeholders for each file. Separating distinct concerns makes each prompt verifiable in isolation.

---

## Rule 3 — Specificity Is Mandatory

Every prompt must reference **actual names from this project's architecture documents**. Never write generic instructions.

Pull from the documents:

- Actual collection paths and field names from `data-models.md`
- Actual endpoint paths and response shapes from `api-endpoints.md`
- Actual screen names and navigation routes from `page-specs.md`
- Actual component names and design tokens from `design.md`
- Actual business rules, formulas, and constraints from all documents

**Bad:** `"Create a database collection for users with the required fields."`

**Good:** `"Create a Firestore collection called users. Each document has these fields: id (string, auto-generated, immutable, equals Firebase Auth UID), email (string, required, max 254 characters, immutable), displayName (string, required, max 50 characters), role (string, required, one of: 'user' | 'admin', default: 'user'), isEmailVerified (boolean, required, default: false), lastLoginAt (timestamp, optional, server-generated), createdAt (timestamp, required, server-generated, immutable), updatedAt (timestamp, required, server-generated), isDeleted (boolean, required, default: false)."`

**Cross-referencing prior work:** When a prompt depends on a previous step, reference it by **both number and artifact description:**

✅ `"Call the endpoint built in [12] We're building the POST /api/auth/login endpoint that validates credentials and issues a session cookie."`

❌ `"Call the login endpoint we built earlier."`

**Why:** A reader who has never seen the PRD must be able to implement this step correctly using only the prompt. That is the bar. Generic instructions guarantee the agent makes assumptions — and assumptions are bugs.

---

## Rule 4 — Verification Must Be Exact

Do not write "verify it works" or "check that it renders." Write the specific action, the specific expected result, and the specific failure condition.

**Bad:**

```
- [ ] Verify form validation works
- [ ] Check that the API returns data
- [ ] Make sure security rules are correct
```

**Good:**

```
- Submit the form with an empty email field — expect the submit button to remain disabled and no network request to fire.
- Submit the form with a valid email and password — expect a 200 response with the user's profile data and a session cookie named `session` set as httpOnly, secure, sameSite=strict.
- Sign in as User A, attempt to read User B's document at `users/{userBId}` — expect `403 Forbidden`, not `404 Not Found`.
- Send 11 POST requests to /api/auth/login within 60 seconds from the same IP — expect the 11th to return 429 with the message "Too many login attempts. Please wait a moment and try again."
```

**Why:** "Verify form validation works" is not verifiable — it's a wish. Specific checks are runnable, repeatable, and catch regressions.

---

## Rule 5 — Security in Every Relevant Prompt

Any prompt that involves writing data, reading user data, handling payments, or exposing any API must include explicit security requirements in the Instructions section.

State explicitly:

- Who can **write** each field (client, Cloud Function only, admin SDK only, never)
- Who can **read** each collection or endpoint (owner only, authenticated users, public, admin only)
- What happens when an **unauthorized request** is made (exact HTTP code and response body)
- Which fields must **never appear in an API response** (passwords, internal flags, other users' data)
- Which fields must **never be written from client code** (role, createdAt, userId)

**Bad:** `"Make sure only authenticated users can access this endpoint."`

**Good:** `"This endpoint requires a valid session cookie named session. If the cookie is missing or invalid, return 401 with { code: 'UNAUTHORIZED', message: 'You must be signed in to do this.' }. If the authenticated user's uid does not match the userId in the request path, return 403 with { code: 'FORBIDDEN', message: 'You cannot access another user's data.' }. The role and createdAt fields must never be writable from this endpoint — reject any request body that includes them with 400."`

**Why:** Security requirements that are implied are security requirements that get skipped. Name them explicitly in every prompt that touches data.

---

## Rule 6 — Domain and Platform Requirements

Pull any domain-specific, legal, regulatory, cultural, or platform constraint from the PRD and flag it explicitly in the relevant prompt.

Examples:

- **Fintech/Nigeria:** "Per PRD Section 3, this is not a licensed fund manager. The UI must display 'For personal use only. Not financial advice.' on every screen that shows trade signals."
- **Health data:** "Per PRD Section 3 (HIPAA), patient identifiers must never appear in logs. Use anonymous session IDs in all server-side logging."
- **App Store (iOS):** "Per PRD Section 9, in-app purchases must use StoreKit — no external payment links allowed on iOS."
- **Flutter:** "Use `go_router: ^14.0.0` for all navigation. Do not use Navigator.push directly — all routes must be declared in the router config."

These are the requirements most likely to be missed and most expensive to fix after launch. Embedding them in the prompt that creates the relevant feature is the only reliable way to ensure they get implemented.

---

## Rule 7 — Titles Are Descriptive Sentences

Prompt titles must be sentences that describe exactly what will exist when the step is done. A reader should be able to skim the title list and understand the entire project architecture.

**Approved formats:**

- `We're building the [X] that [handles/manages/enforces] [Y] and [Z].`
- `Let's set up the [X] that [protects/computes/validates] [Y].`
- `We need the [ScreenName] — [its role in the product].`
- `Let's create the [X] Cloud Function that fires when [Y] happens.`

**Bad titles (forbidden):**

- `Set up auth` — what aspect? what stack? what does "done" look like?
- `Build the database` — which collections? which indexes?
- `Create the login page` — use the sentence form instead

**Good titles:**

- `We're building the POST /api/auth/login endpoint that validates credentials and issues a 7-day session cookie.`
- `Let's set up the Firestore security rules that enforce per-user data isolation across all collections.`
- `We need the TransactionListScreen — the primary screen where users browse, filter, and search their transactions.`
- `Let's create the onUserCreated Cloud Function that fires when Firebase Auth creates a new account and writes the initial user document to Firestore.`

**Why:** Generic titles produce generic prompts. When you force yourself to write a sentence describing the exact artifact, you are forced to know what you're building before you write the instructions.

---

## Rule 8 — Honest Advice: 1–2 Focused Questions

The "honest advice" section asks 1–2 specific questions about the most likely failure mode or architectural risk in this step. Never more than 2. Never generic.

**Bad (too many, too vague):**

```
- What do you think about the overall approach?
- Are there any security concerns?
- What would you change?
- Is the performance okay?
- What's missing?
```

**Good (1–2 specific):**

```
Then give me your honest assessment of:
- Whether the session cookie approach handles concurrent tab sessions correctly — specifically, what happens if the user is logged in on two tabs and logs out in one: does the other tab detect the session expiry immediately or only on the next navigation?
```

**Another good example:**

```
Then give me your honest assessment of:
- Whether storing the auth token in an httpOnly cookie is sufficient protection against XSS, given that our app uses a third-party chart library that runs inline scripts — and whether we need to add a Content Security Policy header to mitigate this.
- Whether the 7-day session expiry is appropriate for a financial app where users may share devices.
```

**Why:** One precise question gets one deep, useful answer. Five vague questions get five shallow platitudes. The goal is to surface the one thing most likely to cause a production incident.

---

## Rule 9 — Accessibility Is Non-Optional

Every prompt that creates a UI component or screen must include accessibility requirements in the Instructions section. These are not optional or implied.

**Minimum required for every UI prompt:**

- **ARIA labels** for every interactive element that doesn't have visible text (icon buttons, image buttons, progress bars)
- **Keyboard navigation** — Tab order, Enter/Space activation for custom controls, Escape to close modals/drawers
- **Focus management** — where focus moves after a modal opens, after a form submits, after a dialog closes
- **Contrast ratio** — minimum 4.5:1 for body text, 3:1 for large text (≥18px regular or ≥14px bold)
- **Screen reader behavior** — what `aria-live` regions announce when data changes (new transactions loaded, error appears, etc.)

**Bad:** `"Make the button accessible."`

**Good:** `"The IconButton that opens the filter drawer must have aria-label='Open filters'. When the filter drawer opens, focus moves to the first interactive element inside the drawer. When the drawer closes (via the X button or Escape key), focus returns to the 'Open filters' button. The drawer has role='dialog' and aria-label='Transaction filters'. All filter chips have a visible focus ring with a 3px offset."`

**Why:** Accessibility baked into the build prompt gets implemented. Accessibility left as "the agent will figure it out" gets skipped every time.

---

## Rule 10 — Continuation Prompts: Split by Vertical Slice

When a feature is too large for one prompt, split it by **vertical slice** — each slice must be independently deployable and testable.

**How to split:**

1. Read operations vs. write operations (GET endpoints vs. POST/PATCH/DELETE)
2. Authenticated paths vs. public paths
3. Happy path vs. edge case handling (pagination, empty states, rate limit handling)
4. Core feature vs. supplementary behavior (basic CRUD vs. bulk operations, exports)

**Never split:**

- Mid-function (a function must be complete in the prompt that creates it)
- Mid-component (a component must render correctly in the prompt that creates it)
- Across database + security rules (always in the same prompt — rules reference field names)

**Marking continuations:** When a feature spans multiple prompts, note it in the context paragraph:

```
[N] is Part 1 of 3 for the transactions feature. This prompt covers reading transactions (list + detail).
[N+1] will cover creating and updating transactions.
[N+2] will cover deleting and bulk operations.
```

**Why:** Arbitrary splits create stub functions that the next prompt depends on but that don't work. Vertical slices give each prompt a complete, testable deliverable.

---

## Quality Checklist

Before finalizing any prompt, verify all of the following:

### Format

- [ ] Title is a descriptive sentence using an approved format from Rule 7
- [ ] Specification has 2–6 paragraphs with bold-label — em dash sections
- [ ] Specification describes behavior only (no code, no file paths in spec section)
- [ ] Instructions section uses exact names from architecture docs
- [ ] Instructions section contains no full function implementations, no full component bodies, no full config files (YAML, JSON) — only prose steps, short type signatures (≤10 lines), or short schema definitions (≤10 lines) per Rule 1

### Specificity (Rule 3)

- [ ] Every file path is explicit
- [ ] Every field name matches `data-models.md` exactly
- [ ] Every endpoint path matches `api-endpoints.md` exactly
- [ ] Prior work cross-referenced by `[N]` + short artifact description
- [ ] No decisions left to the executing agent

### Coverage

- [ ] Every UI state specified: loading, empty, error, success
- [ ] Every error has exact HTTP code + exact user-facing message
- [ ] Stack-conditional sections present where behavior differs (Next.js / Flutter / React Native)

### Security (Rule 5)

- [ ] Who can write each field is explicitly named
- [ ] Who can read each collection or endpoint is explicitly named
- [ ] Unauthorized request behavior specified (exact code + message)

### Accessibility (Rule 9 — UI prompts only)

- [ ] ARIA labels for interactive elements without visible text
- [ ] Keyboard navigation behavior specified
- [ ] Focus management specified
- [ ] Contrast ratios noted for any custom color usage

### Verification (Rule 4)

- [ ] Every automated check is a specific action with a specific expected outcome
- [ ] Manual walkthrough covers happy path + at least one failure path
- [ ] Honest advice has exactly 1–2 specific questions (Rule 8)
