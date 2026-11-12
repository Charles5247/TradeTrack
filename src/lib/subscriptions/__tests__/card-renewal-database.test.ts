import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('reserves one renewal per due organization and hides the mandate from browser roles', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE organizations(id uuid PRIMARY KEY);
      CREATE TABLE users(id uuid PRIMARY KEY);
      CREATE TABLE subscription_plans(id uuid PRIMARY KEY,name text);
      CREATE TABLE subscriptions(organization_id uuid,plan_id uuid,billing_cycle text,status text,expires_at timestamptz,created_at timestamptz);
      CREATE TABLE subscription_checkouts(reference text PRIMARY KEY,organization_id uuid,user_id uuid,plan_id uuid,plan_name text,billing_cycle text,amount_kobo bigint,mode text,zainbox_code text);
      INSERT INTO organizations VALUES('00000000-0000-0000-0000-000000000001');
      INSERT INTO users VALUES('00000000-0000-0000-0000-000000000002');
      INSERT INTO subscription_plans VALUES('00000000-0000-0000-0000-000000000003','Private agreement');
      INSERT INTO subscriptions VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','quarterly','active',now() + interval '12 hours',now());
    `);
    const migration = readFileSync('supabase/migrations/20261112100000_subscription_card_renewal.sql', 'utf8');
    await db.exec(migration);
    await db.exec(`INSERT INTO subscription_card_mandates(organization_id,plan_id,billing_cycle,amount_kobo,encrypted_token,mobile_number,email_address,zainbox_code,mode,consented_by)
      VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','quarterly',13500000,'ciphertext','08000000000','owner@example.com','box','live','00000000-0000-0000-0000-000000000002');`);
    const first = await db.query<{reference:string;amount_kobo:number}>(`SELECT reference,amount_kobo FROM claim_due_card_renewals(20)`);
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0].amount_kobo).toBe(13500000);
    expect((await db.query(`SELECT * FROM claim_due_card_renewals(20)`)).rows).toHaveLength(0);
    expect((await db.query<{reference:string;is_automatic:boolean}>(`SELECT reference,is_automatic FROM subscription_checkouts`)).rows[0])
      .toEqual({ reference: first.rows[0].reference, is_automatic: true });
    const access = await db.query<{readable:boolean;claimable:boolean}>(`SELECT has_table_privilege('authenticated','subscription_card_mandates','SELECT') readable,
      has_function_privilege('authenticated','public.claim_due_card_renewals(integer)','EXECUTE') claimable`);
    expect(access.rows[0]).toEqual({ readable: false, claimable: false });
  } finally { await db.close(); }
}, 120000);
