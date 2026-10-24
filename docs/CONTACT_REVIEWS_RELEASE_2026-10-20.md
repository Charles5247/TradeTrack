# Contact and reviews release

## Included

- Public `/contact`: WhatsApp, telephone, email, location, support hours, contact form, installation pricing and a WhatsApp setup request link.
- Contact submissions are stored privately in the database. Platform owners can read them at `/admin/contact`, linked from the dashboard.
- Optional email delivery uses `RESEND_API_KEY` and a verified `CONTACT_EMAIL_FROM`. Without them, submissions stay saved with `email_status=pending`. The UI does not claim email delivery.
- Public `/reviews` and homepage reviews: real database records only, clear empty/error states, signed-in business-owner submission and editing, one review per account, optional ratings, account prefill.
- Platform owners can add real merchant reviews and hide/restore reviews. Admin additions are marked in the database. No fake reviews are seeded.
- Public header/footer links and floating WhatsApp contact. The floating button is limited to marketing pages, outside POS/checkout.
- Opt-in local drafts for contact messages and reviews. Drafts require an explicit send after reconnecting; no background submission is claimed.
- New copy goes through i18n. Machine translations are marked for native-speaker review.

## Validation

- Final production build and TypeScript passed, including the inbox and navigation additions.
- Local HTTP checks: `/contact` and `/reviews` return 200 with headings, navigation and the correct WhatsApp destination.
- Database tests prove review author isolation, one-per-account uniqueness, owner hide/restore, anonymous public visibility and private contact-message access.
- Contact API tests cover validation, durable save and storage failure.
- No browser surface is connected in this environment. Screenshots, iPhone 12/low-end Android visual checks and interactive browser submission have not been performed.

## Deployment and assumptions

PR #19 was merged at `44972fca0dfdd1596fd5a242127b95aa53876180`. GitHub reports the production Vercel deployment succeeded. Live HTTP checks on 20 October 2026 confirmed that `https://trackasuwa.vercel.app/contact` and `/reviews` return 200 with their headings, navigation links and WhatsApp destination. Earlier preview deployments failed; they do not describe the successful production deployment.

The additive `20261019210808_public_contact_reviews.sql` migration has been applied to the linked production project. No existing customer records were modified. No test reviews or contact messages were added to production.

This release assumes published reviews are public as requested. Email requires sender configuration; it is not verified live. Onsite requests currently use WhatsApp. The structured booking form with installation-history pricing, referral credits and other later-phase requirements remain outstanding; this release does not claim the whole Phase 4 scope is complete.
