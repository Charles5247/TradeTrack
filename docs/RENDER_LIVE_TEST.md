# Deploy this build to Render for testing

## What is ready, and what is not

Deploy the Next.js app as a **Node Web Service**, not a Static Site. Its API
routes, authentication and server rendering require a running Node server.
The repository already includes `render.yaml`.

You can test existing-account login, the UI, catalog and existing operational
flows. **Adding Zainpay keys does not finish paid signup or subscription checkout.**
The current subscription page still attempts a direct subscription upsert;
it does not call `/api/payments/initialize`. The newer database requires
verified payment. An unpaid test organization can therefore be blocked from
paid functionality. Do not weaken the database guard to make a demo pass.

The payment routes also need a focused integration pass before real money:
the verification handler accepts the plan identifier from its callback URL,
uses an amount-unit heuristic, and needs binding to a trusted pending purchase
and the server's catalog price. No real-money end-to-end payment was performed
in this UI batch. Use Zainpay sandbox for payment integration work.

## Render setup

1. Push the completed commit to `Charles5247/TradeTrack` (the batch pushes to
   `main`). In Render, select **New → Blueprint**, connect that repository,
   and select its `render.yaml`. For an existing service, deploy the updated
   commit instead of creating a second production service.
2. Review the service/region/plan. The blueprint retains `plan: free`; free
   services can sleep and are unsuitable for dependable payment callbacks.
   Choose a paid always-on instance when testing callback timing or serving
   traders. No paid instance was purchased by this batch.
3. Settings: root `.`, Node `22`, build
   `npm ci --include=dev && npm run verify:env && npm run build`, start
   `npm start`, health check `/`. Next starts on Render's injected `PORT`.
   To reduce Free-instance sleeping during a test, configure a Cron-job.org
   GET request to `https://YOUR-SERVICE.onrender.com/api/health` every
   10 minutes; this is not a production-availability guarantee.
4. Enter the variables below in **Environment**. They must be present before
   the build. Use Render's assigned HTTPS hostname for `NEXT_PUBLIC_APP_URL`.
5. Deploy, confirm the build succeeds and the service becomes Live, then visit
   `/login`. A rebuild is required after changing `NEXT_PUBLIC_*` variables.
   Render does not read the `.env.local` on your laptop.

See [Render's Next.js deployment guide](https://render.com/docs/deploy-nextjs-app),
[Node version selection](https://render.com/docs/node-version), and
[environment variables](https://render.com/docs/configure-environment-variables).

## Environment values

| Variable | Value / source |
|---|---|
| `NODE_ENV` | `production` (blueprint sets this) |
| `NEXT_PUBLIC_APP_URL` | `https://YOUR-SERVICE.onrender.com`, or your HTTPS custom domain |
| `NEXT_PUBLIC_APP_VERSION` | Your release label |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ajrflgewbsosthsjtvuj.supabase.co` **only if intentionally using the existing live database** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key from that same Supabase project's API settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service-role key from the same project; never prefix with `NEXT_PUBLIC_` |
| `ZAINPAY_MODE` | `test` for this test deployment; switch to `live` only when ready for real payments |
| `ZAINPAY_TEST_PUBLIC_KEY` | Test-mode key used by checkout initialization and verification |
| `ZAINPAY_TEST_PRIVATE_KEY` | Test-mode private credential |
| `ZAINPAY_TEST_DEFAULT_ZAINBOX` | Test Zainbox code for checkout |
| `ZAINPAY_TEST_WEBHOOK_SECRET` | Test webhook signing secret; configure for signed test callbacks |
| `ZAINPAY_TEST_SECRET_KEY` | Server-only test bearer credential for virtual-account onboarding |
| `ZAINPAY_TEST_ZAINBOX_CODE` | Test Zainbox used by virtual-account onboarding |
| `AI_PROVIDER` | `mock`; external AI providers are not implemented |

Use the selected mode's variables consistently for the gateway, checkout,
virtual-account and webhook credentials. The runtime routes all use the same
mode configuration. Keep test and live keys in separate Vercel/Render
environment scopes, and never add them to a committed `.env`. Use a separate
Supabase test project for destructive tests; a sandbox gateway alone does not
isolate live data.

The webhook currently skips signature validation when its secret is absent.
Until that behavior is hardened, configure a nonempty secret even for an
app-only public test deployment and leave Zainpay callbacks unregistered if
payments are not being tested. For actual sandbox callbacks, confirm the
provider's signing contract matches the implemented HMAC-SHA512 header handling.

For local development, copy `.env.example` to untracked `.env.local` and fill
the values. Next loads it automatically. To run the standalone environment
check with that file loaded:

```powershell
node --env-file=.env.local --import tsx scripts/verify-env.ts
```

Do not rerun old migrations or seed data against the existing live project.
Its deployed migration receipt is in `docs/LIVE_MIGRATION_RECEIPT.md`; the
profile-helper follow-up is recorded in `docs/PROFILE_SAVE_FIX.md`.

## Supabase and Zainpay URLs

In Supabase **Authentication → URL Configuration**, set the deployed Site URL
and retain localhost entries for local work. The forgot-password screen requests
a redirect to `https://YOUR-SERVICE.onrender.com/reset-password`, but that route
is not currently implemented in this checkout. Adding an allowed redirect alone
will not complete email recovery. Test existing-account login and authenticated
Settings password changes; schedule the recovery page before inviting users
who will need email recovery. Do not advertise email recovery as working yet.

For Zainpay sandbox, use your deployed endpoint:
`https://YOUR-SERVICE.onrender.com/api/webhooks/zainpay`.
Checkout initialization builds its own callback URL from `NEXT_PUBLIC_APP_URL`
and sends it to Zainpay. Do not substitute localhost on Render.
See [Zainpay's official API overview](https://zainpay.ng/developers/) for
environment hosts and current endpoint contracts.

## Demo login details

These are **source-defined seed credentials**, not a confirmation that their
current passwords still match the live database:

| Role | Seed email | Seed password |
|---|---|---|
| Platform owner | `platformowner@TracKasuwa.ng` | `demo1234` |
| Business owner | `owner@demo.com` | `demo1234` |
| Admin | `admin@demo.com` | `demo1234` |
| Cashier | `cashier@demo.com` | `demo1234` |

The demo credential panel is intentionally hidden in production; enter the
credentials manually. Existing Supabase users keep their current credentials
when the frontend moves to Render. Deployment does not create or reset users.

Do not run `npm run setup:demo` against the live project merely to deploy:
it resets seed passwords and can delete/recreate mismatched Auth users.
`npm run seed:auth` is older and still includes obsolete manager/super-admin
role assumptions. For an isolated disposable test project, provision matching
Auth users and `public.users` profiles deliberately; use the current four roles,
matching IDs, and a valid organization/subscription. Do not publish a shared
platform-owner password on a public demo. Rotate any retained seed credentials
before exposing production access.

## Live test order

1. Login with an existing account; save profile and reload to confirm persistence.
   Existing PWA installs serve cached pages first and revalidate in the
   background. If an old screen remains after deployment, reconnect, reload,
   allow the refresh request to finish, then reload again. Do not clear site
   data/IndexedDB while unsynced sales or orders exist.
2. Check each of the six migrated pages at 375px and desktop width; open their
   dialogs, check long names, tab through actions, and check dark mode.
3. On Products, try all four photo-menu choices. Confirm matched-code saves
   update the existing product. Test unsupported scanning with manual entry.
4. Load data online, disconnect, then test previously supported offline POS,
   purchase orders and imports. Reconnect and confirm each record syncs once.
   Photo uploads and original product-form saves remain online operations.
5. Check sandbox payment initialization, rejection, verification, duplicate
   callbacks and exactly-once activation only after the checkout integration
   work above is complete. Never interpret a green Render deploy as payment
   certification.

Xavier decisions: isolated test database versus controlled live data; private
testing versus public demo; Render instance plan; Zainpay sandbox credentials
and signing contract; priority for completing the paid checkout integration.
