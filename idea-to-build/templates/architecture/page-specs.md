# Page Specs

> Every page/screen in the application, specified with route, sections, data sources, all UI states, and user interactions. These exact route paths are referenced in build prompts.

---

## Page: [PageName]

**Route:** `/[path]` (e.g., `/dashboard`, `/transactions/:id`)
**Auth Required:** Yes / No
**Role Required:** user / admin / any

### Purpose

[One sentence: what the user accomplishes on this page]

### Layout Sections

#### Header

- [What appears in the header — title, breadcrumbs, action buttons]

#### Body

- [Main content area — describe each section top-to-bottom]
- Section 1: [description]
- Section 2: [description]

#### Sidebar (if applicable)

- [What appears in the sidebar]

#### Footer (if applicable)

- [What appears in the footer]

### Data Sources

| Data        | Source Endpoint       | When Fetched     |
| ----------- | --------------------- | ---------------- |
| [Data name] | `GET /api/[endpoint]` | On page load     |
| [Data name] | `GET /api/[endpoint]` | On filter change |

### UI States

**Loading:**

- [What the user sees while data is loading — skeleton cards, shimmer, spinner]
- [Specific skeleton structure — e.g., "Show 5 skeleton rows matching the table structure"]

**Empty:**

- [What the user sees when there is no data]
- [Specific message and call-to-action — e.g., "'No transactions yet.' Button: 'Upload Statement'"]

**Error:**

- [What the user sees when something fails]
- [Specific message and retry action — e.g., "'Failed to load transactions.' Button: 'Retry'"]

**Success:**

- [Normal state with data populated]

**Partial (if applicable):**

- [What happens when some data loads but other parts fail]

### User Interactions

| Element            | Action           | Result                                                  |
| ------------------ | ---------------- | ------------------------------------------------------- |
| [Button/Link name] | Click/Tap        | [What happens — navigate to X, open modal, submit form] |
| [Filter dropdown]  | Change value     | [What happens — re-fetch with new filter]               |
| [Search input]     | Type (debounced) | [What happens — filter list]                            |
| [Table row]        | Click            | [What happens — navigate to detail page]                |
| [Scroll to bottom] | Scroll           | [What happens — load next page of results]              |

### Mobile Responsiveness

- [How the layout adapts on mobile — e.g., "Filter panel becomes a bottom sheet"]
- [Touch targets — minimum 44x44px]
- [Any mobile-specific behavior — e.g., "Pull-to-refresh reloads the list"]

### Navigation

- **Comes from:** [Which page(s) link here]
- **Goes to:** [Which page(s) this page links to]
- **Back behavior:** [What the back button does]

---

## Page: [NextPageName]

[Repeat for every page...]

---

## Page Summary Table

| Page          | Route        | Auth   | Description     |
| ------------- | ------------ | ------ | --------------- |
| LoginPage     | `/login`     | No     | User login form |
| DashboardPage | `/dashboard` | Yes    | Main dashboard  |
| [etc.]        | [etc.]       | [etc.] | [etc.]          |
