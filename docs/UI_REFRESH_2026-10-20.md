# Retail UI refresh

Design direction: a clear business ledger with an editorial storefront. Cool light surfaces, navy text, a single blue action colour, visible boundaries and restrained shadows. Public display headings use a system serif; operational screens retain the existing compact fonts and layout. Dark-mode tokens are preserved.

Floot's overview and design guides informed this update. No matching Floot project exists. Its platform does not support the custom service worker used here, so the existing Next.js app remains the implementation and deployment target.

## Changes

- Homepage introduces sales, stock and business decisions with an explicitly illustrative naira preview.
- Primary navigation leads directly to the existing free signup. Pricing remains accessible.
- A three-step journey links setup, app download and feature discovery.
- Investors and partners have a contact route without invented traction or financial claims.
- Reviews precede the closing signup invitation.
- Contact form and support information have distinct card surfaces.
- Shared light-mode tokens improve text and border contrast across existing screens.
- All new copy uses the translation wrapper; untranslated phrases use its existing English fallback pending local-language editorial review.

## Scope and verification

No changes to offline storage, service worker, sync queue, authentication, payments, database schema or transaction handlers. The marketing preview is static markup and adds no chart library, remote font or image request.

Production build and TypeScript passed. Focused offline sales, vendor sync and expired-write regressions passed: 13 tests across 3 files using the threads pool. The initial broader run stalled without results and was stopped. Local HTTP checks passed for homepage content and journey links, Contact and Reviews.

A connected browser is unavailable; responsive visual inspection and interactive device testing remain outstanding. Layouts use stacking grids, flexible actions and bounded content widths.
