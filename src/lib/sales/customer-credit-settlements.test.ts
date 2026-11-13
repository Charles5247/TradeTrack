import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('records partial payment, prevents overpayment, and closes debt with an audited write off', async () => {
  const db = new PGlite();
  const org = '10000000-0000-0000-0000-000000000001';
  const owner = '20000000-0000-0000-0000-000000000001';
  const sale = '30000000-0000-0000-0000-000000000001';
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE SCHEMA track_private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
      CREATE FUNCTION track_private.immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable'; END $$;
      CREATE FUNCTION track_private.capture_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      CREATE TABLE public.organizations(id uuid PRIMARY KEY);
      CREATE TABLE public.users(id uuid PRIMARY KEY, organization_id uuid, role text, status text);
      CREATE TABLE public.sales(id uuid PRIMARY KEY, organization_id uuid, total numeric, amount_paid numeric, status text);
      CREATE TABLE public.historical_sales(id uuid PRIMARY KEY, organization_id uuid, total numeric, amount_paid numeric, status text);
      CREATE TABLE public.financial_reversals(sale_id uuid, kind text);
      CREATE FUNCTION public.get_user_org_id() RETURNS uuid LANGUAGE sql AS $$ SELECT organization_id FROM public.users WHERE id=auth.uid() $$;
      CREATE FUNCTION public.get_user_role() RETURNS text LANGUAGE sql AS $$ SELECT role FROM public.users WHERE id=auth.uid() $$;
      INSERT INTO public.organizations VALUES ('${org}');
      INSERT INTO public.users VALUES ('${owner}','${org}','business_owner','active');
      INSERT INTO public.sales VALUES ('${sale}','${org}',100,20,'completed');
      SELECT set_config('test.uid','${owner}',false);`);
    await db.exec(readFileSync('supabase/migrations/20261113100000_customer_credit_settlements.sql', 'utf8'));
    const call = (id: string, kind: string, amount: number, reason = 'Uncollectible debt') => db.query(
      'SELECT (public.record_customer_credit_settlement($1,$2,false,$3,$4,$5,NULL,$6)).id AS id',
      [id, sale, kind, amount, kind === 'payment' ? 'cash' : null, reason],
    );
    const paymentId = '40000000-0000-0000-0000-000000000001';
    await call(paymentId, 'payment', 30);
    expect((await call(paymentId, 'payment', 30)).rows).toHaveLength(1);
    await expect(call('40000000-0000-0000-0000-000000000002', 'payment', 60)).rejects.toThrow('exceeds');
    await call('40000000-0000-0000-0000-000000000003', 'write_off', 50);
    expect(Number((await db.query<{ amount: string }>('SELECT sum(amount)::numeric AS amount FROM public.customer_credit_settlements')).rows[0].amount)).toBe(80);
    await expect(call('40000000-0000-0000-0000-000000000004', 'payment', 1)).rejects.toThrow('exceeds');
    await expect(db.exec(`DELETE FROM public.customer_credit_settlements WHERE id='${paymentId}'`)).rejects.toThrow('immutable');
  } finally { await db.close(); }
}, 30000);
