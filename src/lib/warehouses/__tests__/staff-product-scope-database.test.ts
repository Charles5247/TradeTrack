import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';

const org = '10000000-0000-0000-0000-000000000001';
const owner = '20000000-0000-0000-0000-000000000001';
const admin = '20000000-0000-0000-0000-000000000002';
const cashier = '20000000-0000-0000-0000-000000000003';
const unassigned = '20000000-0000-0000-0000-000000000004';
const kano = '30000000-0000-0000-0000-000000000001';
const lagos = '30000000-0000-0000-0000-000000000002';
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE SCHEMA track_private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE users(id uuid PRIMARY KEY, organization_id uuid, role text, status text DEFAULT 'active');
    CREATE TABLE warehouses(id uuid PRIMARY KEY, organization_id uuid, name text);
    CREATE TABLE products(id uuid PRIMARY KEY, organization_id uuid, name text);
    CREATE TABLE inventory(id uuid PRIMARY KEY, organization_id uuid, product_id uuid, warehouse_id uuid, quantity integer);
    CREATE TABLE warehouse_staff(organization_id uuid, warehouse_id uuid, user_id uuid);
    CREATE TABLE product_cost_history(id uuid,source_id uuid,organization_id uuid,product_id uuid,warehouse_id uuid,received_quantity integer,unit_cost numeric,new_average_cost numeric);
    CREATE FUNCTION track_private.apply_purchase_cost_receipt(uuid,uuid,uuid,uuid,uuid,integer,numeric,uuid,boolean,text) RETURNS numeric LANGUAGE sql AS $$ SELECT 0::numeric $$;
    CREATE FUNCTION public.get_user_org_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT organization_id FROM public.users WHERE id=auth.uid() $$;
    CREATE FUNCTION public.get_user_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT role FROM public.users WHERE id=auth.uid() $$;
    ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
    ALTER TABLE products ENABLE ROW LEVEL SECURITY;
    ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
    ALTER TABLE warehouse_staff ENABLE ROW LEVEL SECURITY;
    CREATE POLICY org_warehouses ON warehouses FOR SELECT TO authenticated USING (organization_id=public.get_user_org_id());
    CREATE POLICY org_products ON products FOR SELECT TO authenticated USING (organization_id=public.get_user_org_id());
    CREATE POLICY org_products_insert ON products FOR INSERT TO authenticated WITH CHECK (organization_id=public.get_user_org_id());
    CREATE POLICY org_inventory ON inventory FOR SELECT TO authenticated USING (organization_id=public.get_user_org_id());
    CREATE POLICY org_inventory_insert ON inventory FOR INSERT TO authenticated WITH CHECK (organization_id=public.get_user_org_id());
    CREATE POLICY org_inventory_update ON inventory FOR UPDATE TO authenticated USING (organization_id=public.get_user_org_id()) WITH CHECK (organization_id=public.get_user_org_id());
    CREATE POLICY org_assignments ON warehouse_staff FOR SELECT TO authenticated USING (organization_id=public.get_user_org_id());
    GRANT USAGE ON SCHEMA public,auth TO authenticated;
    GRANT SELECT ON users,warehouses,products,inventory,warehouse_staff TO authenticated;
    GRANT INSERT,UPDATE ON inventory TO authenticated;
    GRANT INSERT ON products TO authenticated;
    INSERT INTO users VALUES ('${owner}','${org}','business_owner'),('${admin}','${org}','admin'),('${cashier}','${org}','cashier'),('${unassigned}','${org}','admin');
    INSERT INTO warehouses VALUES ('${kano}','${org}','Kano'),('${lagos}','${org}','Lagos');
    INSERT INTO products VALUES
      ('40000000-0000-0000-0000-000000000001','${org}','Kano item'),
      ('40000000-0000-0000-0000-000000000002','${org}','Lagos item');
    INSERT INTO inventory VALUES
      ('50000000-0000-0000-0000-000000000001','${org}','40000000-0000-0000-0000-000000000001','${kano}',2),
      ('50000000-0000-0000-0000-000000000002','${org}','40000000-0000-0000-0000-000000000002','${lagos}',0);
    INSERT INTO warehouse_staff VALUES ('${org}','${kano}','${admin}'),('${org}','${lagos}','${cashier}');
  `);
  await db.exec(readFileSync('supabase/migrations/20261111100000_staff_warehouse_product_scope.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });

it.each([
  [owner, ['Kano item', 'Lagos item'], ['Kano', 'Lagos']],
  [admin, ['Kano item'], ['Kano']],
  [cashier, ['Lagos item'], ['Lagos']],
  [unassigned, [], []],
])('limits products and locations for %s', async (user, products, warehouses) => {
  await db.exec(`SELECT set_config('test.uid','${user}',false); SET ROLE authenticated;`);
  try {
    expect((await db.query<{ name: string }>('SELECT name FROM products ORDER BY name')).rows.map(row => row.name)).toEqual(products);
    expect((await db.query<{ name: string }>('SELECT name FROM warehouses ORDER BY name')).rows.map(row => row.name)).toEqual(warehouses);
    expect((await db.query<{ quantity: number }>('SELECT quantity FROM inventory ORDER BY quantity')).rows).toHaveLength(warehouses.length);
  } finally { await db.exec('RESET ROLE'); }
});

it('prevents staff stock edits in another warehouse while allowing their own', async () => {
  await db.exec(`SELECT set_config('test.uid','${admin}',false); SET ROLE authenticated;`);
  try {
    expect((await db.query(`UPDATE inventory SET quantity=7 WHERE warehouse_id='${lagos}' RETURNING id`)).rows).toHaveLength(0);
    expect((await db.query(`UPDATE inventory SET quantity=3 WHERE warehouse_id='${kano}' RETURNING id`)).rows).toHaveLength(1);
    await expect(db.exec(`INSERT INTO inventory VALUES (gen_random_uuid(),'${org}','40000000-0000-0000-0000-000000000001','${lagos}',1)`)).rejects.toThrow();
  } finally { await db.exec('RESET ROLE'); }
});

it('allows an admin to create a zero-stock product for their assigned warehouse', async () => {
  await db.exec(`SELECT set_config('test.uid','${admin}',false); SET ROLE authenticated;`);
  try {
    const id = '40000000-0000-0000-0000-000000000003';
    await db.exec(`INSERT INTO products VALUES ('${id}','${org}','New item')`);
    expect((await db.query(`SELECT id FROM products WHERE id='${id}'`)).rows).toHaveLength(0);
    await db.exec(`INSERT INTO inventory VALUES (gen_random_uuid(),'${org}','${id}','${kano}',0)`);
    expect((await db.query(`SELECT id FROM products WHERE id='${id}'`)).rows).toHaveLength(1);
  } finally { await db.exec('RESET ROLE'); }
});

it('blocks costed stock receipts in another warehouse despite the privileged function', async () => {
  await db.exec(`SELECT set_config('test.uid','${admin}',false); SET ROLE authenticated;`);
  try {
    await expect(db.exec(`SELECT public.receive_stock_at_cost(gen_random_uuid(),'40000000-0000-0000-0000-000000000001','${lagos}',1,10,NULL)`)).rejects.toThrow('not assigned');
    expect((await db.query(`SELECT public.receive_stock_at_cost(gen_random_uuid(),'40000000-0000-0000-0000-000000000001','${kano}',1,10,NULL) AS cost`)).rows[0]).toMatchObject({ cost: '0' });
  } finally { await db.exec('RESET ROLE'); }
});
