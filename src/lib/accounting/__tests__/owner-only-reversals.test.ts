import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';

let db: PGlite;
const owner = '00000000-0000-0000-0000-000000000001';
const manager = '00000000-0000-0000-0000-000000000002';
const org = '00000000-0000-0000-0000-000000000003';

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth; CREATE SCHEMA track_private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE public.users(id uuid PRIMARY KEY, organization_id uuid NOT NULL, role text NOT NULL, status text NOT NULL);
    CREATE TABLE public.financial_reversals(organization_id uuid NOT NULL);
    CREATE TABLE public.import_reversals(organization_id uuid NOT NULL);
    CREATE TABLE public.customer_credit_settlements(organization_id uuid NOT NULL, kind text NOT NULL);
    INSERT INTO public.users VALUES
      ('${owner}', '${org}', 'business_owner', 'active'),
      ('${manager}', '${org}', 'admin', 'active');
  `);
  await db.exec(readFileSync('supabase/migrations/20261113170000_owner_only_reversals.sql', 'utf8'));
});

afterAll(async () => { await db?.close(); });

it('blocks manager reversals and debt write-offs while allowing normal payments', async () => {
  await db.exec(`SELECT set_config('test.uid', '${manager}', false)`);
  await expect(db.exec(`INSERT INTO financial_reversals VALUES ('${org}')`)).rejects.toThrow('Business owner permission required');
  await expect(db.exec(`INSERT INTO import_reversals VALUES ('${org}')`)).rejects.toThrow('Business owner permission required');
  await expect(db.exec(`INSERT INTO customer_credit_settlements VALUES ('${org}', 'write_off')`)).rejects.toThrow('Business owner permission required');
  await db.exec(`INSERT INTO customer_credit_settlements VALUES ('${org}', 'payment')`);
  expect((await db.query('SELECT * FROM customer_credit_settlements')).rows).toHaveLength(1);
});

it('allows an active business owner to record reversals and write-offs', async () => {
  await db.exec(`SELECT set_config('test.uid', '${owner}', false)`);
  await db.exec(`INSERT INTO financial_reversals VALUES ('${org}');
    INSERT INTO import_reversals VALUES ('${org}');
    INSERT INTO customer_credit_settlements VALUES ('${org}', 'write_off');`);
  expect((await db.query('SELECT * FROM financial_reversals')).rows).toHaveLength(1);
  expect((await db.query('SELECT * FROM import_reversals')).rows).toHaveLength(1);
});
