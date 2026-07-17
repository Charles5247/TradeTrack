/**
 * verify-env.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pre-build / pre-deploy sanity check that all required environment
 * variables are present. Run manually with:
 *
 *   npx tsx scripts/verify-env.ts
 *
 * or via the npm script:
 *
 *   npm run verify:env
 *
 * Exits with code 1 (and a clear, actionable error message) if any required
 * variable is missing. Exits with code 0 if everything required is present.
 *
 * Variables are split into two tiers:
 *   - REQUIRED_VARS: the app cannot start / build correctly without these.
 *   - RECOMMENDED_VARS: the app will run, but a specific feature area
 *     (Zainpay billing/payments) will be degraded or disabled without them.
 */

type VarSpec = {
  name: string;
  description: string;
};

const REQUIRED_VARS: VarSpec[] = [
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    description: 'Supabase project URL (Settings → API)',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    description: 'Supabase anonymous/public API key (Settings → API)',
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    description:
      'Supabase service role key — required for admin operations (e.g. scripts/setup-demo-users.ts)',
  },
  {
    name: 'NEXT_PUBLIC_APP_URL',
    description: 'Public base URL of the deployed app (used for auth/payment redirects)',
  },
];

const RECOMMENDED_VARS: VarSpec[] = [
  {
    name: 'ZAINPAY_PUBLIC_KEY',
    description: 'Zainpay public API key — required to initialize payments',
  },
  {
    name: 'ZAINPAY_PRIVATE_KEY',
    description: 'Zainpay private API key — required for server-to-server calls',
  },
  {
    name: 'ZAINPAY_BASE_URL',
    description:
      'Zainpay API base URL (defaults to sandbox https://sandbox.zainpay.ng if unset)',
  },
  {
    name: 'ZAINPAY_DEFAULT_ZAINBOX',
    description: 'Default Zainbox code used when initializing payments',
  },
  {
    name: 'ZAINPAY_WEBHOOK_SECRET',
    description:
      'HMAC secret used to verify Zainpay webhook signatures (skipped if unset — insecure for production)',
  },
];

function check(vars: VarSpec[]): VarSpec[] {
  return vars.filter((v) => {
    const val = process.env[v.name];
    return !val || val.trim() === '';
  });
}

function main() {
  console.log('🔎  Verifying environment variables...\n');

  const missingRequired = check(REQUIRED_VARS);
  const missingRecommended = check(RECOMMENDED_VARS);

  if (missingRequired.length === 0) {
    console.log('✅  All required environment variables are set.\n');
  } else {
    console.error('❌  Missing REQUIRED environment variables:\n');
    for (const v of missingRequired) {
      console.error(`   - ${v.name}\n     ${v.description}`);
    }
    console.error(
      '\nCopy .env.example to .env.local and fill in the missing values, then re-run this check.\n'
    );
  }

  if (missingRecommended.length > 0) {
    console.warn('⚠️   Missing RECOMMENDED environment variables (payment features affected):\n');
    for (const v of missingRecommended) {
      console.warn(`   - ${v.name}\n     ${v.description}`);
    }
    console.warn('');
  } else {
    console.log('✅  All recommended (Zainpay) environment variables are set.\n');
  }

  if (missingRequired.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log('🎉  Environment verification passed.');
}

main();
