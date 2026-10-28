# Zainpay subscription checkout and Vercel

## Environment classification

| Variable | Vercel type | Exposure |
| --- | --- | --- |
| `ZAINPAY_PUBLIC_KEY` | Secret | Server only: this is a bearer credential despite its name |
| `ZAINPAY_PRIVATE_KEY` | Secret | Server only; retained for other provider operations |
| `ZAINPAY_WEBHOOK_SECRET` | Secret | Server only |
| `ZAINPAY_SECRET_KEY` | Secret | Server only, only if required by an existing integration |
| `ZAINPAY_MODE` | Config | `test` or `live`, server only |
| `ZAINPAY_BASE_URL` | Config | Server only; legacy mode inference |
| `ZAINPAY_DEFAULT_ZAINBOX` / `ZAINPAY_ZAINBOX_CODE` | Config | Destination identifier, server only |
| `NEXT_PUBLIC_APP_URL` | Config | Public canonical app origin |
| `NEXT_PUBLIC_SUPABASE_URL` and anon/publishable key | Config | Public; access protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Server only |
| `RESEND_API_KEY`, database passwords/connection URLs | Secret | Server only |

The same classifications apply to `ZAINPAY_TEST_*` and `ZAINPAY_LIVE_*` variants. Never create `NEXT_PUBLIC_ZAINPAY_*` credentials. Existing encrypted identifiers/URLs may stay encrypted; no need to expose or replace them.

Existing Vercel legacy key names are supported. Do not partially add mode-prefixed credentials: when any exist, the resolver uses only credentials for the selected mode and does not fall back to legacy keys. With explicit `ZAINPAY_MODE`, the resolver uses that mode's standard API URL unless its mode-prefixed base URL is configured.

## Deployment order

1. Run route, database, billing-period and import tests, typecheck, lint and build. Apply only the tested `20261028195903_verified_subscription_checkout.sql` migration after checking hosted schema drift; do not push unrelated historical migrations.
2. Development/Preview use sandbox credentials. Production requires live credentials. Sandbox payments verify without granting a paid subscription; production checkout rejects test mode.
3. Set the production app origin to `https://trackasuwa.vercel.app` until the custom domain is configured. Configure the provider webhook as `https://trackasuwa.vercel.app/api/webhooks/zainpay`. Confirm its signing protocol matches the existing SHA-512 signature handler before relying on delivery.
4. Deploy after configuration and migration. Environment changes need a new deployment. Confirm `/api/payments/initialize` reports the intended mode and configuration; this probe does not prove credentials work.
5. Complete a provider checkout and reconcile its gross amount, destination, subscription period, invoice and duplicate webhook/callback behavior. A real charge requires an authorized payer; never report a live payment test based solely on mocked fixtures.

## Behavior

The owner sends only a plan ID and billing period. The server reads the current paid monthly plan price and stores an immutable checkout snapshot before contacting Zainpay. Quarterly costs three monthly payments; six-month costs six; annual retains the existing 20% discount. Renewals preserve remaining time. A different paid plan starts immediately and replaces the current plan, as disclosed before checkout. Unused trial time is retained.

The provider's v2 verification must match the exact reference, destination Zainbox, deposit type and gross kobo amount. The server-only database function saves the payment, subscription, invoice and checkout completion atomically. Repeated verification cannot extend access twice. Failed verification grants no access; an accounting failure leaves the checkout retryable. Original records remain for audit.

Provider sources: [official PHP SDK](https://github.com/zainpay/zainpay-php-sdk), [card endpoint implementation](https://github.com/zainpay/zainpay-php-sdk/blob/main/src/Card.php).
