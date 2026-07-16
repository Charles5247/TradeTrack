/**
 * Creates Supabase Auth users matching seed profile UUIDs in supabase/seed/001_seed_data.sql
 *
 * Usage:
 *   1. Copy .env.example → .env.local and set SUPABASE_* vars
 *   2. Run migrations 001–005 + seed SQL in Supabase first
 *   3. node scripts/seed-auth-users.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  const envPath = resolve(root, '.env.local');
  if (!existsSync(envPath)) {
    console.error('Missing .env.local — copy .env.example and set SUPABASE vars.');
    process.exit(1);
  }
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Must match UUIDs in supabase/seed/001_seed_data.sql */
const DEMO_USERS = [
  {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'superadmin@tradetrack.ng',
    password: 'demo1234',
    user_metadata: { full_name: 'Super Admin' },
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'admin@demo.com',
    password: 'demo1234',
    user_metadata: { full_name: 'Demo Admin' },
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    email: 'cashier@demo.com',
    password: 'demo1234',
    user_metadata: { full_name: 'Demo Cashier' },
  },
];

async function upsertAuthUser(user) {
  const { data: existing } = await supabase.auth.admin.getUserById(user.id);

  if (existing?.user) {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: user.user_metadata,
    });
    if (error) throw error;
    console.log(`Updated auth user: ${user.email}`);
    return;
  }

  const { error } = await supabase.auth.admin.createUser({
    id: user.id,
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: user.user_metadata,
  });
  if (error) throw error;
  console.log(`Created auth user: ${user.email}`);
}

async function main() {
  console.log('Seeding Supabase Auth users for TradeTrack demo accounts...\n');
  for (const user of DEMO_USERS) {
    try {
      await upsertAuthUser(user);
    } catch (err) {
      console.error(`Failed for ${user.email}:`, err.message ?? err);
      process.exit(1);
    }
  }
  console.log('\nDone. Demo logins:');
  console.log('  superadmin@tradetrack.ng / demo1234  (platform owner → /admin)');
  console.log('  admin@demo.com / demo1234             (merchant admin)');
  console.log('  cashier@demo.com / demo1234         (cashier)');
}

main();
