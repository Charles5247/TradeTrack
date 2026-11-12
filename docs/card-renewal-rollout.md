# Card renewal rollout

Trackasuwa uses Zainpay's hosted card checkout. An owner may opt in to future charges for the same plan, amount, and billing period. Trackasuwa stores only the provider's reusable card token, encrypted with `SUBSCRIPTION_CARD_TOKEN_KEY`; it never accepts a card number or CVV. A payment without a verified provider token leaves renewal manual.

Before enabling this in production:

1. Apply `20261112100000_subscription_card_renewal.sql` after the verified checkout migration.
2. Configure `SUBSCRIPTION_CARD_TOKEN_KEY` as 32 random bytes encoded in 64 hex characters. Keep the key stable; losing it makes existing tokens unusable. Do not put it in a `NEXT_PUBLIC_` variable.
3. Configure `CRON_SECRET`, live Zainpay credentials, the Zainbox, and `NEXT_PUBLIC_APP_URL` in the Vercel production environment. Confirm Zainpay has enabled card tokenization for the merchant account.
4. Run a provider-approved test: opt in at hosted checkout, verify that a card token is returned in the verified payment response and that the subscription page says automatic renewal, then verify one renewal at the agreed amount. Test stop renewal before the next period.

The daily job reserves a checkout before making a charge. Once a charge has been requested, it only verifies that reference; it never submits the same charge again. An uncertain result needs reconciliation with Zainpay before the customer is asked to pay manually. A provider decline changes the mandate to `action_required`.
