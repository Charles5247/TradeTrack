import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('records merchant app opens only for a signed-in merchant account', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
      CREATE TABLE public.organizations (id uuid PRIMARY KEY);
      CREATE TABLE public.users (id uuid PRIMARY KEY, organization_id uuid, role text, status text);
      CREATE FUNCTION public.is_platform_owner() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      INSERT INTO public.organizations VALUES ('10000000-0000-0000-0000-000000000001');
      INSERT INTO public.users VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'cashier', 'active');`);
    await db.exec(readFileSync('supabase/migrations/20261112110000_merchant_app_activity.sql', 'utf8'));
    await db.exec(`SELECT set_config('test.uid', '20000000-0000-0000-0000-000000000001', false);
      SELECT public.record_merchant_app_open();`);
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.merchant_app_activity')).rows[0].count).toBe(1);
    await db.exec(`SELECT set_config('test.uid', '', false); SELECT public.record_merchant_app_open();`);
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.merchant_app_activity')).rows[0].count).toBe(1);
  } finally {
    await db.close();
  }
});
