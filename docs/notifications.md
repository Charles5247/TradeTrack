# Notification delivery

In-app delivery is the default and needs no third-party service. Email delivery uses Resend when `RESEND_API_KEY` and a verified `RESEND_FROM` sender are present; until the domain is verified, the outbox records a clear skipped/failed reason and in-app delivery remains available.

SMS stays disabled until a provider is selected. The provider adapter must implement `SmsProvider` in `src/lib/notifications/sms-provider.ts`. Candidate Nigerian options:

- **Termii:** Nigeria-focused routing, sender-ID tooling and local support; confirm current DND-route coverage, pricing and delivery receipts before choosing.
- **Africa's Talking:** broader multi-country API and consolidated reporting; confirm Nigerian sender-ID onboarding, local route pricing and support response times before choosing.

After a provider decision, configure these only in Vercel encrypted environment variables:

- `SMS_PROVIDER` — configuration, safe to expose only server-side anyway.
- `SMS_API_KEY` — **secret**.
- `SMS_SENDER_ID` — configuration.
- Provider webhook/signing token — **secret**, using the adapter-specific variable documented with that adapter.

The per-message selling price is database configuration in `notification_channel_settings.sms_unit_price_kobo`; it is not an environment variable or hard-coded application constant. A business must buy credits through the Zainpay SMS-credit checkout. `consume_sms_credit` locks and decrements atomically, refuses a zero balance and never permits a negative balance.
