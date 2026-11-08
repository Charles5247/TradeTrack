import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';

const org = '10000000-0000-0000-0000-000000000001';
const owner = '20000000-0000-0000-0000-000000000001';
const cashier = '20000000-0000-0000-0000-000000000002';
const product = '30000000-0000-0000-0000-000000000001';
const warehouse = '40000000-0000-0000-0000-000000000001';
const order = '50000000-0000-0000-0000-000000000001';
const line = '60000000-0000-0000-0000-000000000001';
const receipt = '70000000-0000-0000-0000-000000000001';
let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { uuid_ossp } });
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE SCHEMA track_private;
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE public.organizations(id uuid PRIMARY KEY);
    CREATE TABLE public.users(id uuid PRIMARY KEY, organization_id uuid, role text, status text DEFAULT 'active');
    CREATE TABLE public.products(id uuid PRIMARY KEY, organization_id uuid, cost_price numeric(12,2));
    CREATE TABLE public.warehouses(id uuid PRIMARY KEY, organization_id uuid, is_main boolean DEFAULT false, created_at timestamptz DEFAULT now());
    CREATE TABLE public.inventory(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), organization_id uuid, product_id uuid, warehouse_id uuid, quantity integer, min_stock_level integer, UNIQUE(product_id, warehouse_id));
    CREATE TABLE public.inventory_movements(organization_id uuid, product_id uuid, warehouse_id uuid, movement_type text, quantity integer, reference_id uuid, reference_type text, notes text, created_by uuid);
    CREATE TABLE public.purchase_orders(id uuid PRIMARY KEY, organization_id uuid, status text, received_by uuid, received_at timestamptz);
    CREATE TABLE public.purchase_order_items(id uuid PRIMARY KEY, purchase_order_id uuid, product_id uuid, quantity_ordered integer, quantity_received integer DEFAULT 0, unit_cost numeric(12,2));
    CREATE FUNCTION public.get_user_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT organization_id FROM public.users WHERE id=auth.uid() $$;
    CREATE FUNCTION public.is_admin_or_above() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT role IN ('business_owner','admin') FROM public.users WHERE id=auth.uid() $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
    INSERT INTO public.organizations VALUES ('${org}');
    INSERT INTO public.users VALUES ('${owner}','${org}','business_owner','active'),('${cashier}','${org}','cashier','active');
    INSERT INTO public.products VALUES ('${product}','${org}',100);
    INSERT INTO public.warehouses(id,organization_id,is_main) VALUES ('${warehouse}','${org}',true);
    INSERT INTO public.inventory(organization_id,product_id,warehouse_id,quantity,min_stock_level) VALUES ('${org}','${product}','${warehouse}',10,5);
    INSERT INTO public.purchase_orders VALUES ('${order}','${org}','sent',NULL,NULL);
    INSERT INTO public.purchase_order_items VALUES ('${line}','${order}','${product}',10,0,150);
    SELECT set_config('test.uid','${owner}',false);`);
  await db.exec(readFileSync('supabase/migrations/20261108090000_purchase_cost_history.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });

it('receives the second purchase atomically and records the new average', async () => {
  await db.exec(`SET ROLE authenticated; UPDATE public.purchase_orders SET status='received',received_by='${owner}',received_at=now() WHERE id='${order}'; RESET ROLE;`);
  const result = await db.query<{ quantity: number; cost_price: string }>(`SELECT i.quantity,p.cost_price FROM public.inventory i JOIN public.products p ON p.id=i.product_id WHERE p.id='${product}'`);
  expect(result.rows[0]).toMatchObject({ quantity: 20, cost_price: '125.00' });
  const history = await db.query<{ unit_cost: string; previous_average_cost: string; new_average_cost: string; previous_stock: number }>(`SELECT unit_cost,previous_average_cost,new_average_cost,previous_stock FROM public.product_cost_history WHERE purchase_order_item_id='${line}'`);
  expect(history.rows[0]).toMatchObject({ unit_cost: '150.00', previous_average_cost: '100.00', new_average_cost: '125.00', previous_stock: 10 });
  expect((await db.query(`SELECT quantity_received FROM public.purchase_order_items WHERE id='${line}'`)).rows[0]).toMatchObject({ quantity_received: 10 });
});

it('records direct stock purchases once, including on retry', async () => {
  await db.exec(`SET ROLE authenticated; SELECT public.receive_stock_at_cost('${receipt}','${product}','${warehouse}',5,175,'Second supplier delivery'); SELECT public.receive_stock_at_cost('${receipt}','${product}','${warehouse}',5,175,'Second supplier delivery'); RESET ROLE;`);
  const result = await db.query<{ quantity: number; cost_price: string }>(`SELECT i.quantity,p.cost_price FROM public.inventory i JOIN public.products p ON p.id=i.product_id WHERE p.id='${product}'`);
  expect(result.rows[0]).toMatchObject({ quantity: 25, cost_price: '135.00' });
  expect((await db.query(`SELECT id FROM public.product_cost_history WHERE source_id='${receipt}'`)).rows).toHaveLength(1);
});

it('rejects cashier receipts and prevents cross-business history reads', async () => {
  await db.exec(`SELECT set_config('test.uid','${cashier}',false); SET ROLE authenticated;`);
  try {
    await expect(db.exec(`SELECT public.receive_stock_at_cost(uuid_generate_v4(),'${product}','${warehouse}',1,200,NULL)`)).rejects.toThrow('Only the business owner or manager');
    expect((await db.query(`SELECT id FROM public.product_cost_history`)).rows).toHaveLength(0);
  } finally {
    await db.exec(`RESET ROLE; SELECT set_config('test.uid','${owner}',false);`);
  }
});
