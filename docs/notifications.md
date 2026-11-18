# Notification delivery

In-app delivery is the default and needs no third-party service. Email delivery uses Resend when `RESEND_API_KEY` and a verified `RESEND_FROM` sender are present; until the domain is verified, the outbox records a clear skipped/failed reason and in-app delivery remains available.

## iPhone and iPad background alerts

iOS 16.4+ supports push and icon badges for Trackasuwa **when installed to the
Home Screen**. Safari tabs cannot receive this app's background push. In the
installed app, open Notification preferences and tap **Allow screen alerts**;
grant the system notification request. iOS Focus and per-app notification and
badge settings still control display. A notification must exist for the
specific signed-in user and have `in_app_visible = true` to be sent.

Deploy `20261118150000_web_push_notifications.sql`, then configure the same
VAPID key pair in Vercel as `WEB_PUSH_PUBLIC_KEY` and
`WEB_PUSH_PRIVATE_KEY`. Set `WEB_PUSH_SUBJECT` to a contact URI such as
`mailto:support@trackasuwa.com`. Generate one pair with
`node -e "console.log(require('web-push').generateVAPIDKeys())"`; store the
private value only in the server environment. Rotating the pair requires users
to subscribe again. The public key is returned only to authenticated users;
device endpoint and encryption keys are private database rows.

`/api/cron/notifications` delivers queued push alerts every five minutes.
This schedule needs a Vercel plan that supports more than daily cron runs;
confirm the project's plan before deploying the five-minute schedule. It is
not instantaneous delivery. The app's existing live in-app alerts and local
badge refresh continue while open. The Android APK is a WebView of the same
POS, so checkout changes ship with the web deployment; it does not need a new
APK binary for that change.

SMS stays disabled until a provider is selected. The provider adapter must implement `SmsProvider` in `src/lib/notifications/sms-provider.ts`. Candidate Nigerian options:

- **Termii:** Nigeria-focused routing, sender-ID tooling and local support; confirm current DND-route coverage, pricing and delivery receipts before choosing.
- **Africa's Talking:** broader multi-country API and consolidated reporting; confirm Nigerian sender-ID onboarding, local route pricing and support response times before choosing.

After a provider decision, configure these only in Vercel encrypted environment variables:

- `SMS_PROVIDER` — configuration, safe to expose only server-side anyway.
- `SMS_API_KEY` — **secret**.
- `SMS_SENDER_ID` — configuration.
- Provider webhook/signing token — **secret**, using the adapter-specific variable documented with that adapter.

The per-message selling price is database configuration in `notification_channel_settings.sms_unit_price_kobo`; it is not an environment variable or hard-coded application constant. A business must buy credits through the Zainpay SMS-credit checkout. `consume_sms_credit` locks and decrements atomically, refuses a zero balance and never permits a negative balance.
