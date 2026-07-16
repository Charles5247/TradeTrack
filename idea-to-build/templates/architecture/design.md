# Design System

> **COMPLETE THIS BEFORE GENERATING PHASE 6 OR PHASE 7 BUILD PROMPTS.** Every UI component and page prompt must reference the tokens defined here. Do not leave tokens blank — make a deliberate decision for each one.
>
> This file ships with a dark-mode-first starter palette. Adjust the values to match your brand. If you cannot justify WHY you chose a color, spacing, or radius — change it until you can.

---

## How to Use This File

1. **In Phase 2.5:** Fill in every token value. Replace any `[ADJUST]` placeholder with a real decision.
2. **In Phase 6 (UI Components):** Every component prompt references tokens from this file by name (e.g., `var(--color-primary)`, `--radius-lg`).
3. **In Phase 7 (Pages):** Every page prompt references the mockup in `docs/design/mockups/` that was generated using these tokens.
4. **Never hardcode values** in component instructions — always reference the token name.

---

## Color Palette

> **Design quality rule:** Do NOT use plain blue (#0000FF), plain red (#FF0000), or generic Bootstrap-style colors. Every token below must be a deliberate, aesthetically reasoned decision. If your primary color is "blue," specify the exact HSL value and explain why.

### Dark Mode (Default)

```css
/* Primary — the brand color used for CTAs, active states, links */
--color-primary: hsl(245, 70%, 62%); /* [ADJUST] Rich indigo */
--color-primary-hover: hsl(245, 70%, 55%); /* Darker on hover */
--color-primary-active: hsl(245, 70%, 48%); /* Pressed state */
--color-primary-foreground: hsl(0, 0%, 100%); /* Text on primary bg */
--color-primary-subtle: hsl(245, 70%, 62%, 0.12); /* Soft tint bg */

/* Secondary — supporting actions, secondary buttons */
--color-secondary: hsl(215, 20%, 65%); /* [ADJUST] Slate blue-grey */
--color-secondary-hover: hsl(215, 20%, 58%);
--color-secondary-foreground: hsl(222, 20%, 10%);

/* Surfaces — backgrounds and card layers */
--color-background: hsl(222, 22%, 8%); /* [ADJUST] Deep dark bg */
--color-surface: hsl(222, 20%, 11%); /* Card bg */
--color-surface-elevated: hsl(222, 18%, 14%); /* Elevated card, modal bg */
--color-surface-overlay: hsl(222, 18%, 18%); /* Dropdown, tooltip bg */

/* Borders */
--color-border: hsl(222, 16%, 22%); /* Default border */
--color-border-strong: hsl(222, 16%, 32%); /* Focused/active border */
--color-border-subtle: hsl(222, 16%, 16%); /* Subtle dividers */

/* Text */
--color-text-primary: hsl(220, 15%, 92%); /* Main content */
--color-text-secondary: hsl(220, 10%, 65%); /* Labels, captions */
--color-text-muted: hsl(220, 8%, 45%); /* Placeholder, disabled */
--color-text-inverse: hsl(222, 22%, 8%); /* Text on light bg */

/* Semantic — status colors */
--color-success: hsl(152, 60%, 48%); /* [ADJUST] Emerald green */
--color-success-subtle: hsl(152, 60%, 48%, 0.12);
--color-success-foreground: hsl(0, 0%, 100%);

--color-warning: hsl(38, 92%, 58%); /* [ADJUST] Amber */
--color-warning-subtle: hsl(38, 92%, 58%, 0.12);
--color-warning-foreground: hsl(38, 50%, 12%);

--color-error: hsl(4, 72%, 58%); /* [ADJUST] Warm red */
--color-error-subtle: hsl(4, 72%, 58%, 0.12);
--color-error-foreground: hsl(0, 0%, 100%);

--color-info: hsl(205, 80%, 55%); /* [ADJUST] Sky blue */
--color-info-subtle: hsl(205, 80%, 55%, 0.12);
--color-info-foreground: hsl(0, 0%, 100%);

/* Overlays */
--color-overlay: hsl(222, 22%, 4%, 0.7); /* Modal backdrop */
--color-focus-ring: hsl(245, 70%, 62%, 0.4); /* Focus outline */
```

### Light Mode Overrides

```css
[data-theme='light'] {
  --color-background: hsl(220, 20%, 97%);
  --color-surface: hsl(0, 0%, 100%);
  --color-surface-elevated: hsl(220, 20%, 98%);
  --color-surface-overlay: hsl(0, 0%, 100%);
  --color-border: hsl(220, 14%, 88%);
  --color-border-strong: hsl(220, 14%, 72%);
  --color-border-subtle: hsl(220, 14%, 93%);
  --color-text-primary: hsl(222, 22%, 10%);
  --color-text-secondary: hsl(222, 14%, 40%);
  --color-text-muted: hsl(222, 10%, 60%);
  --color-text-inverse: hsl(0, 0%, 100%);
  --color-overlay: hsl(222, 22%, 8%, 0.5);
}
```

### Design Decisions Log — Colors

| Token              | Value     | Reasoning                                      |
| ------------------ | --------- | ---------------------------------------------- |
| --color-primary    | [Fill in] | [Why this hue? Brand color? Aesthetic choice?] |
| --color-background | [Fill in] | [Why this darkness level?]                     |
| --color-success    | [Fill in] | [Why this green specifically?]                 |
| [Add more]         |           |                                                |

---

## Typography

> Use Google Fonts or system fonts. Do NOT use browser defaults (Times New Roman / Arial). Minimum: specify the font family, the size scale, and the weights you use.

### Font Families

```css
/* Load from Google Fonts or self-host */
--font-display: 'Plus Jakarta Sans', system-ui, sans-serif; /* [ADJUST] Headlines, numbers */
--font-body: 'Inter', system-ui, sans-serif; /* [ADJUST] Body text, UI */
--font-mono: 'JetBrains Mono', 'Fira Code', monospace; /* [ADJUST] Code, amounts */
```

### Type Scale

```css
--text-xs: 11px; /* Fine print, timestamps, badges */
--text-sm: 13px; /* Captions, labels, secondary info */
--text-base: 15px; /* Body text, list items, form inputs */
--text-lg: 17px; /* Subheadings, prominent labels */
--text-xl: 20px; /* Section headings, card titles */
--text-2xl: 24px; /* Page subheadings */
--text-3xl: 30px; /* Page headings */
--text-4xl: 36px; /* Hero headings */
--text-5xl: 48px; /* Display headings (rare) */
```

### Font Weights

```css
--font-regular: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

### Line Heights

```css
--leading-tight: 1.2; /* Headlines */
--leading-snug: 1.4; /* Subheadings */
--leading-normal: 1.5; /* Body text */
--leading-relaxed: 1.7; /* Long-form content */
```

### Letter Spacing

```css
--tracking-tight: -0.02em; /* Large headlines */
--tracking-normal: 0; /* Body text */
--tracking-wide: 0.04em; /* Uppercase labels, badges */
--tracking-wider: 0.08em; /* Caps-only labels */
```

---

## Spacing Scale

> 4px base. All spacing values are multiples of 4px.

```css
--space-px: 1px;
--space-0-5: 2px;
--space-1: 4px;
--space-1-5: 6px;
--space-2: 8px;
--space-2-5: 10px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-14: 56px;
--space-16: 64px;
--space-20: 80px;
--space-24: 96px;
--space-32: 128px;

/* Semantic aliases — use these in component instructions */
--space-input-y: var(--space-2-5); /* Vertical padding inside inputs */
--space-input-x: var(--space-3); /* Horizontal padding inside inputs */
--space-button-y: var(--space-2-5);
--space-button-x: var(--space-4);
--space-card: var(--space-5); /* Card inner padding */
--space-card-gap: var(--space-4); /* Gap between card elements */
--space-section: var(--space-16); /* Section padding top/bottom */
--space-page: var(--space-6); /* Page horizontal padding */
```

---

## Border Radius

> Avoid sharp corners (0px) or pill-shaped everything. Consistent radius communicates design intentionality.

```css
--radius-xs: 4px; /* Badges, tooltips, small chips */
--radius-sm: 6px; /* Buttons, inputs, small cards */
--radius-md: 10px; /* Cards, dropdowns */
--radius-lg: 16px; /* Modals, large cards */
--radius-xl: 24px; /* Bottom sheets, hero cards */
--radius-2xl: 32px; /* [ADJUST] Extra large containers */
--radius-full: 9999px; /* Pill buttons, avatars, toggles */
```

---

## Shadows

```css
--shadow-xs: 0 1px 2px hsl(222, 22%, 4%, 0.08);
--shadow-sm: 0 1px 4px hsl(222, 22%, 4%, 0.12), 0 1px 2px hsl(222, 22%, 4%, 0.08);
--shadow-md: 0 4px 12px hsl(222, 22%, 4%, 0.18), 0 2px 4px hsl(222, 22%, 4%, 0.1);
--shadow-lg: 0 8px 24px hsl(222, 22%, 4%, 0.24), 0 4px 8px hsl(222, 22%, 4%, 0.12);
--shadow-xl: 0 16px 40px hsl(222, 22%, 4%, 0.3), 0 8px 16px hsl(222, 22%, 4%, 0.14);

/* Glow effect — use sparingly on focused/highlighted elements */
--shadow-glow-primary: 0 0 0 3px var(--color-focus-ring);
--shadow-glow-success: 0 0 0 3px hsl(152, 60%, 48%, 0.25);
--shadow-glow-error: 0 0 0 3px hsl(4, 72%, 58%, 0.25);

/* Inset shadows for pressed states */
--shadow-inner: inset 0 2px 4px hsl(222, 22%, 4%, 0.1);
```

---

## Animation & Motion

> Every interactive element must use transitions. Static interfaces feel broken.

```css
/* Duration tokens */
--duration-instant: 50ms; /* Immediate feedback (checkbox check) */
--duration-fast: 120ms; /* Micro-interactions (hover, scale) */
--duration-base: 200ms; /* Standard transitions (color, shadow) */
--duration-slow: 350ms; /* Layout shifts, reveals */
--duration-slower: 500ms; /* Page transitions, modals */

/* Easing tokens */
--ease-linear: linear;
--ease-default: cubic-bezier(0.4, 0, 0.2, 1); /* Standard Material-style */
--ease-in: cubic-bezier(0.4, 0, 1, 1); /* Accelerate (exit animations) */
--ease-out: cubic-bezier(0, 0, 0.2, 1); /* Decelerate (enter animations) */
--ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275); /* Springy (interactive feedback) */
```

### Motion Rules

| Scenario            | Duration             | Easing           | Property                                    |
| ------------------- | -------------------- | ---------------- | ------------------------------------------- |
| Button hover        | `--duration-fast`    | `--ease-default` | `background-color`, `box-shadow`            |
| Button active/press | `--duration-instant` | `--ease-default` | `transform: scale(0.97)`                    |
| Card hover lift     | `--duration-fast`    | `--ease-default` | `transform: translateY(-2px)`, `box-shadow` |
| Modal open          | `--duration-slow`    | `--ease-out`     | `opacity`, `transform: scale`               |
| Modal close         | `--duration-base`    | `--ease-in`      | `opacity`, `transform: scale`               |
| Toast enter         | `--duration-slow`    | `--ease-spring`  | `transform: translateY`, `opacity`          |
| Skeleton shimmer    | 1.5s infinite        | `--ease-linear`  | `background-position`                       |
| Page transition     | `--duration-slower`  | `--ease-out`     | `opacity`                                   |
| Focus ring appear   | `--duration-instant` | `--ease-default` | `box-shadow`                                |

---

## Component State Definitions

> These apply to ALL interactive components unless overridden. Build prompts must reference these states explicitly.

| State          | Visual Change                                           | CSS Token                                        |
| -------------- | ------------------------------------------------------- | ------------------------------------------------ |
| Default        | Base appearance                                         | (component defaults)                             |
| Hover          | Slight background darken or lift + shadow increase      | `--color-surface-elevated` or `translateY(-2px)` |
| Focus          | Visible focus ring, 3px offset                          | `--shadow-glow-primary`                          |
| Active/Pressed | Scale down + darker background                          | `transform: scale(0.97)`                         |
| Disabled       | 40% opacity, `cursor: not-allowed`, no hover effect     | `opacity: 0.4`                                   |
| Loading        | Spinner replaces content or skeleton shimmer            | (component-specific)                             |
| Error          | Red border, error text below, `--color-error-subtle` bg | `--color-border: --color-error`                  |
| Success        | Green border or check icon, `--color-success-subtle` bg | (component-specific)                             |

> **Rule:** No interactive element may change opacity on hover alone — always change the background color or shadow too. Opacity-only hover creates an unpolished feel.

---

## Screen Mockup Index

> Fill this in during Phase 2.5. Every page in `page-specs.md` must have a corresponding entry below before Phase 6 or Phase 7 build prompts are generated.

| Screen                           | Mockup File                      | Tier Used                      | Status                 |
| -------------------------------- | -------------------------------- | ------------------------------ | ---------------------- |
| [Screen name from page-specs.md] | `docs/design/mockups/[filename]` | Stitch / HTML / Claude Designs | [ ] Pending / [x] Done |
|                                  |                                  |                                |                        |

---

## Design Decisions Log

> Record every major design decision and the reasoning behind it. Prevents "why did we do this?" confusion later.

| Decision             | Choice                       | Reasoning                             | Date |
| -------------------- | ---------------------------- | ------------------------------------- | ---- |
| Dark mode default    | Yes                          | [Your reasoning]                      |      |
| Primary color        | [HSL value]                  | [Brand alignment, aesthetic goal]     |      |
| Font: display        | [Font name]                  | [Why this font]                       |      |
| Font: body           | [Font name]                  | [Why this font]                       |      |
| Border radius        | [Value]                      | [Corporate vs friendly feel]          |      |
| Motion: spring ease  | Only on interactive elements | Feels premium, avoids motion sickness |      |
| [Add your decisions] |                              |                                       |      |
