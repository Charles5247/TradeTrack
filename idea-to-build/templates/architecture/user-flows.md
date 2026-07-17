# User Flows

> Key user journeys mapped step-by-step. Each flow references exact page names from page-specs.md and exact endpoint paths from api-endpoints.md. Covers happy path, error paths, and edge cases.

---

## Flow: [Flow Name] (e.g., "New User Onboarding")

**Actor:** [User role — e.g., "New user signing up for the first time"]
**Goal:** [What the user wants to accomplish]
**Trigger:** [What starts this flow — e.g., "User clicks 'Sign Up' on the landing page"]

### Happy Path

| Step | User Action          | System Response              | Page / Endpoint                   |
| ---- | -------------------- | ---------------------------- | --------------------------------- |
| 1    | [What the user does] | [What the system shows/does] | [PageName / `POST /api/endpoint`] |
| 2    | [What the user does] | [What the system shows/does] | [PageName / `GET /api/endpoint`]  |
| 3    | [What the user does] | [What the system shows/does] | [PageName]                        |

### Error Paths

| At Step | Error Condition                                      | System Response                                                                           | Recovery                                      |
| ------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1       | [What goes wrong — e.g., "Email already registered"] | [What the user sees — e.g., "Error: 'This email is already registered. Try logging in.'"] | [How to recover — e.g., "Link to login page"] |
| 2       | [What goes wrong]                                    | [What the user sees]                                                                      | [How to recover]                              |

### Edge Cases

- [Edge case 1 — e.g., "User closes the app mid-flow and returns later"]
- [Edge case 2 — e.g., "User's session expires during a multi-step form"]
- [Edge case 3 — e.g., "User navigates back after submitting"]

---

## Flow: [Next Flow Name]

[Repeat for each key user journey...]

---

## Flow Summary

| Flow        | Actor          | Pages Involved                                               | Critical? |
| ----------- | -------------- | ------------------------------------------------------------ | --------- |
| Sign Up     | New user       | LandingPage → RegisterPage → VerifyEmailPage → DashboardPage | Yes       |
| Login       | Returning user | LoginPage → DashboardPage                                    | Yes       |
| [Flow name] | [Actor]        | [Pages]                                                      | [Yes/No]  |

---

## Notes

- Every flow must reference exact page names from `page-specs.md`
- Every API call in a flow must reference exact endpoint paths from `api-endpoints.md`
- Error messages must be user-friendly — no technical codes
- Every flow must account for: loading states, network failure, and session expiry
