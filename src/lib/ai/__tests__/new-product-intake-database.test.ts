import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('creates one product and receipt, replays the same approval, and rejects changed or duplicate effects', async () => {
  const db = new PGlite();
  const org = '10000000-0000-0000-0000-000000000001';
  const owner = '20000000-0000-0000-0000-000000000002';
  const warehouse = '30000000-0000-0000-0000-000000000003';
  const job = '40000000-0000-0000-0000-000000000004';
  try {
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth; CREATE SCHEMA track_private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${owner}'::uuid $$;
      CREATE FUNCTION public.get_user_org_id() RETURNS uuid LANGUAGE sql AS $$ SELECT '${org}'::uuid $$;
      CREATE FUNCTION track_private.assert_ai_access() RETURNS uuid LANGUAGE sql AS $$ SELECT '${org}'::uuid $$;
      CREATE TABLE public.organizations(id uuid PRIMARY KEY);
      CREATE TABLE public.users(id uuid PRIMARY KEY, organization_id uuid, role text, status text);
      CREATE TABLE public.ai_jobs(id uuid PRIMARY KEY, organization_id uuid, user_id uuid, kind text, status text, result jsonb);
      CREATE TABLE public.warehouses(id uuid PRIMARY KEY, organization_id uuid);
      CREATE TABLE public.products(id uuid PRIMARY KEY, organization_id uuid, name text, sku text, stock_unit text,
        selling_price numeric, cost_price numeric, created_by uuid);
      CREATE TABLE public.subscription_plans(id uuid PRIMARY KEY, max_products integer);
      CREATE TABLE public.subscriptions(id uuid PRIMARY KEY, organization_id uuid, plan_id uuid,
        status text, created_at timestamptz);
      CREATE TABLE public.ai_stock_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid,
        job_id uuid, row_index integer, approved_by uuid, product_id uuid, warehouse_id uuid,
        quantity integer, unit_cost numeric, average_cost numeric, UNIQUE(job_id,row_index));
      CREATE TABLE public.audit_logs(organization_id uuid,user_id uuid,action text,resource_type text,
        resource_id uuid,new_values jsonb,correlation_id uuid);
      CREATE FUNCTION public.apply_ai_stock_receipt(p_job_id uuid,p_row_index integer,p_product_id uuid,
        p_warehouse_id uuid,p_quantity integer,p_unit_cost numeric) RETURNS numeric LANGUAGE plpgsql AS $$
      BEGIN
        IF p_unit_cost = 901 THEN RAISE EXCEPTION 'Receipt failed'; END IF;
        INSERT INTO public.ai_stock_receipts(organization_id,job_id,row_index,approved_by,product_id,
          warehouse_id,quantity,unit_cost,average_cost)
        VALUES ('${org}',p_job_id,p_row_index,'${owner}',p_product_id,p_warehouse_id,p_quantity,p_unit_cost,p_unit_cost);
        RETURN p_unit_cost;
      END $$;
      INSERT INTO public.organizations VALUES ('${org}');
      INSERT INTO public.users VALUES ('${owner}','${org}','business_owner','active');
      INSERT INTO public.warehouses VALUES ('${warehouse}','${org}');
      INSERT INTO public.ai_jobs VALUES ('${job}','${org}','${owner}','inventory','ready','{"rows":[{"name":"Oil"},{"name":"Rice"}]}');
      INSERT INTO public.subscription_plans VALUES ('50000000-0000-0000-0000-000000000005',100);
      INSERT INTO public.subscriptions VALUES ('60000000-0000-0000-0000-000000000006','${org}',
        '50000000-0000-0000-0000-000000000005','active',now());
    `);
    await db.exec(readFileSync(resolve('supabase/migrations/20261115130000_ai_new_product_intake.sql'), 'utf8'));
    const args = `'${job}',0,'Oil','OIL-1','bottle',1200,'${warehouse}',3,900`;
    const first = await db.query<{ apply_ai_new_product_receipt: string }>(`SELECT public.apply_ai_new_product_receipt(${args})`);
    const replay = await db.query<{ apply_ai_new_product_receipt: string }>(`SELECT public.apply_ai_new_product_receipt(${args})`);
    expect(replay.rows[0].apply_ai_new_product_receipt).toBe(first.rows[0].apply_ai_new_product_receipt);
    expect((await db.query<{ count: string }>('SELECT count(*) FROM public.products')).rows[0].count).toBe(1);
    expect((await db.query<{ count: string }>('SELECT count(*) FROM public.ai_stock_receipts')).rows[0].count).toBe(1);
    await expect(db.query(`SELECT public.apply_ai_new_product_receipt('${job}',0,'Oil','OIL-1','bottle',1300,'${warehouse}',3,900)`)).rejects.toThrow('different changes');
    await expect(db.query(`SELECT public.apply_ai_new_product_receipt('${job}',1,'Rice','RICE-1','bag',1200,'${warehouse}',2,901)`)).rejects.toThrow('Receipt failed');
    expect((await db.query<{ count: string }>('SELECT count(*) FROM public.products')).rows[0].count).toBe(1);
    await expect(db.query(`SELECT public.apply_ai_new_product_receipt('${job}',1,'Oil','OIL-2','bottle',1200,'${warehouse}',2,900)`)).rejects.toThrow('already exists');
    expect((await db.query<{ count: string }>('SELECT count(*) FROM public.products')).rows[0].count).toBe(1);
    await db.exec(`UPDATE public.users SET role = 'admin' WHERE id = '${owner}'`);
    await expect(db.query(`SELECT public.apply_ai_new_product_receipt('${job}',1,'Rice','RICE-1','bag',1200,'${warehouse}',2,900)`)).rejects.toThrow('business owner');
  } finally { await db.close(); }
}, 15000);
