import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('repairs the hosted merchant foreign-key failure and creates exactly one 30-day subscription', async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA track_private;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
   CREATE FUNCTION public.is_platform_owner() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
   CREATE TABLE subscription_plans(id uuid PRIMARY KEY,name text,price numeric,currency text,billing_cycle text,max_cashiers int,max_products int,max_warehouses int,features jsonb,is_active boolean,trial_days int,created_at timestamptz DEFAULT now());
   CREATE TABLE organizations(id uuid PRIMARY KEY,intro_eligible boolean DEFAULT true,subscription_status text DEFAULT 'trial',subscription_plan_id uuid,trial_started_at timestamptz DEFAULT now(),trial_ends_at timestamptz DEFAULT now()+interval '30 days');
   CREATE TABLE merchants(id uuid PRIMARY KEY,subscription_plan_id uuid REFERENCES subscription_plans(id));
   CREATE TABLE subscriptions(organization_id uuid,plan_id uuid REFERENCES subscription_plans(id),status text,starts_at timestamptz,expires_at timestamptz,billing_cycle text);
   INSERT INTO subscription_plans VALUES('c3d4e5f6-a7b8-9012-cdef-123456789012','Business',20000,'NGN','monthly',10,5000,-1,'["sales"]',true,0,now());`);
  await expect(db.exec(`INSERT INTO merchants VALUES('11111111-1111-1111-1111-111111111111','b4000000-0000-0000-0000-000000000004')`)).rejects.toThrow('foreign key');
  const repair=readFileSync('supabase/migrations/20261019211431_repair_live_signup_trial_plan.sql','utf8');
  await db.exec(repair);await db.exec(repair);
  await db.exec(`INSERT INTO organizations(id,subscription_plan_id) VALUES('11111111-1111-1111-1111-111111111111','b4000000-0000-0000-0000-000000000004'); INSERT INTO merchants VALUES('11111111-1111-1111-1111-111111111111','b4000000-0000-0000-0000-000000000004');`);
  const {rows}=await db.query<{days:number}>(`SELECT extract(epoch FROM expires_at-starts_at)/86400 days FROM subscriptions`);
  expect(rows).toHaveLength(1);expect(Number(rows[0].days)).toBe(30);
  const plan=await db.query<{price:string;max_cashiers:number;max_products:number;is_active:boolean}>(`SELECT price,max_cashiers,max_products,is_active FROM subscription_plans WHERE id='b4000000-0000-0000-0000-000000000004'`);
  expect(Number(plan.rows[0].price)).toBe(20000);expect(plan.rows[0]).toMatchObject({max_cashiers:10,max_products:700,is_active:false});
  expect((await db.query(`SELECT id FROM subscription_plans WHERE is_active`)).rows).toHaveLength(1);
  await db.exec('CREATE TABLE products(id uuid PRIMARY KEY, organization_id uuid)');
  const benefits=readFileSync('supabase/migrations/20261021182940_approved_trial_and_business_benefits.sql','utf8');
  await db.exec(benefits); await db.exec(benefits);
  expect((await db.query(`SELECT max_products FROM subscription_plans WHERE id='b4000000-0000-0000-0000-000000000004'`)).rows[0]).toEqual({max_products:1000});
  const business=(await db.query(`SELECT price,features FROM subscription_plans WHERE id='c3d4e5f6-a7b8-9012-cdef-123456789012'`)).rows[0];
  expect(Number(business.price)).toBe(20000);
  expect(business.features).toEqual(['low_stock_alerts','purchase_orders','sales']);
  await db.exec(`INSERT INTO products SELECT md5(n::text)::uuid,'11111111-1111-1111-1111-111111111111' FROM generate_series(1,1000) n`);
  await expect(db.exec(`INSERT INTO products VALUES(md5('1001')::uuid,'11111111-1111-1111-1111-111111111111')`)).rejects.toThrow('1000 products');

 }finally{await db.close();}
},30000);
