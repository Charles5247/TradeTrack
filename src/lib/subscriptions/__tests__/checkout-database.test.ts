import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('finalizes once, preserves renewal time, denies browser writes and rolls back failed accounting', async () => {
 const db = new PGlite();
 try {
  await db.exec(`
   CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE TABLE organizations(id uuid PRIMARY KEY,trial_ends_at timestamptz,subscription_status text,subscription_plan_id uuid);
   CREATE TABLE users(id uuid PRIMARY KEY);
   CREATE TABLE subscription_plans(id uuid PRIMARY KEY);
   CREATE TABLE subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,plan_id uuid,status text,starts_at timestamptz,expires_at timestamptz,created_by uuid,billing_cycle text);
   CREATE TABLE payment_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,subscription_id uuid,amount numeric,currency text,status text,payment_method text,reference text UNIQUE,metadata jsonb);
   CREATE TABLE invoices(id uuid DEFAULT gen_random_uuid(),organization_id uuid,subscription_id uuid,payment_transaction_id uuid,invoice_number text UNIQUE,amount numeric,currency text,status text,paid_at timestamptz);
   INSERT INTO organizations VALUES('00000000-0000-0000-0000-000000000001',null,'expired',null);
   INSERT INTO users VALUES('00000000-0000-0000-0000-000000000002');
   INSERT INTO subscription_plans VALUES('00000000-0000-0000-0000-000000000003');
  `);
  const sql=readFileSync('supabase/migrations/20261028195903_verified_subscription_checkout.sql','utf8');
  await db.exec(sql);await db.exec(sql);
  const insert=async(ref:string,cycle:string,mode='live')=>db.query(`INSERT INTO subscription_checkouts(reference,organization_id,user_id,plan_id,plan_name,billing_cycle,amount_kobo,mode,zainbox_code) VALUES($1,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','Business',$2,6000000,$3,'box')`,[ref,cycle,mode]);
  const finish=(ref:string,amount=6000000)=>db.query(`SELECT finalize_subscription_checkout($1,$2,'{}') AS result`,[ref,amount]);
  await insert('one','quarterly');
  await expect(finish('one',1)).rejects.toThrow('mismatch');
  await finish('one');
  await finish('one');
  expect((await db.query<{count:number}>(`SELECT count(*)::int count FROM invoices`)).rows[0].count).toBe(1);
  const first=(await db.query<{expires_at:Date}>(`SELECT expires_at FROM subscriptions WHERE status='active'`)).rows[0].expires_at;
  await insert('two','biannual');await finish('two');
  const second=(await db.query<{expires_at:Date}>(`SELECT expires_at FROM subscriptions WHERE status='active'`)).rows[0].expires_at;
  expect(new Date(second).getTime()-new Date(first).getTime()).toBeGreaterThan(180*86400000);
  await insert('sandbox','monthly','test');await expect(finish('sandbox')).rejects.toThrow('Sandbox');
  await insert('broken','yearly');
  await db.exec(`ALTER TABLE invoices ADD CONSTRAINT simulated_failure CHECK(invoice_number <> 'INV-broken');`);
  await expect(finish('broken')).rejects.toThrow();
  expect((await db.query<{status:string}>(`SELECT status FROM subscription_checkouts WHERE reference='broken'`)).rows[0].status).toBe('pending');
  expect((await db.query<{count:number}>(`SELECT count(*)::int count FROM payment_transactions`)).rows[0].count).toBe(2);
  const permissions=await db.query<{rpc:boolean;write:boolean}>(`SELECT has_function_privilege('authenticated','public.finalize_subscription_checkout(text,bigint,jsonb)','EXECUTE') rpc,has_table_privilege('authenticated','subscription_checkouts','INSERT') write`);
  expect(permissions.rows[0]).toEqual({rpc:false,write:false});
 } finally {await db.close();}
},120000);
