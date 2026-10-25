# Resend setup

Resend OAuth was authorized in Codex on 21 October 2026. The application does not receive that full-access credential.

Production activation is pending purchase of `trackasuwa.com`. Proposed sending domain: `mail.trackasuwa.com`; sender: `TracKasuwa <notifications@mail.trackasuwa.com>`. Do not configure or send from that domain until ownership and DNS verification are complete.

Once purchased:

1. Add the sending domain in Resend, review the returned DNS records, obtain approval for DNS changes, then verify it.
2. Create a sending-only API key restricted to the verified domain. Store it as server-only `RESEND_API_KEY` in Vercel.
3. Set `CONTACT_EMAIL_FROM` to the verified sender. Set `CONTACT_EMAIL_TO=trackasuwa@gmail.com` only after the inbox exists and its ownership is confirmed. Until configured, the code retains the existing business inbox.
4. Redeploy and submit one approved test contact request through the app. Confirm delivery in Resend; API acceptance alone is not delivery confirmation.

The contact route stores submissions before attempting email, uses the official Resend SDK with a five-second timeout and a contact-record idempotency key, and leaves unsuccessful notifications pending for owner follow-up. It does not implement automatic retries. A `sent` database status means the provider accepted the send, not confirmed delivery.

Signup/password-reset email uses a separate authentication flow; this contact integration does not configure Supabase Auth SMTP. Hosted templates and delivery webhooks remain future setup steps after account tools and the verified domain are available.

References: https://resend.com/setup.md and https://resend.com/docs/send-with-nextjs.md
