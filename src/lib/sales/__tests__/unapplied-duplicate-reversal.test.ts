import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';

const org = '10000000-0000-0000-0000-000000000001';
const otherOrg = '10000000-0000-0000-0000-000000000002';
const owner = '20000000-0000-0000-0000-000000000001';
const staff = '20000000-0000-0000-0000-000000000002';
const first = '30000000-0000-0000-0000-000000000001';
const duplicate = '30000000-0000-0000-0000-000000000002';
const unrelated = '30000000-0000-0000-0000-000000000003';
const product = '40000000-0000-0000-0000-000000000001';
const warehouse = '50000000-0000-0000-0000-000000000001';
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE users(id uuid PRIMARY KEY,organization_id uuid,role text,status text);
    CREATE TABLE sales(id uuid PRIMARY KEY,organization_id uuid,status text,total numeric,created_at timestamptz);
    CREATE TABLE sale_items(sale_id uuid,product_id uuid,warehouse_id uuid,quantity integer);
    CREATE TABLE inventory_movements(organization_id uuid,product_id uuid,warehouse_id uuid,
      quantity integer,reference_type text,original_device_timestamp timestamptz);
    CREATE TABLE financial_reversals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,
      sale_id uuid,kind text,reason text,amount numeric,created_by uuid);
    INSERT INTO users VALUES ('${owner}','${org}','business_owner','active'),
      ('${staff}','${org}','cashier','active');
    INSERT INTO sales VALUES
      ('${first}','${org}','completed',79000,'2026-11-16T20:57:40Z'),
      ('${duplicate}','${org}','completed',79000,'2026-11-16T20:57:41Z'),
      ('${unrelated}','${otherOrg}','completed',79000,'2026-11-16T20:57:42Z');
    INSERT INTO sale_items VALUES ('${first}','${product}','${warehouse}',2),
      ('${duplicate}','${product}','${warehouse}',2),
      ('${unrelated}','${product}','${warehouse}',2);
    INSERT INTO inventory_movements VALUES ('${org}','${product}','${warehouse}',-2,
      'inventory_ledger','2026-11-16T20:57:40Z');
    GRANT USAGE ON SCHEMA public,auth TO authenticated;
    GRANT SELECT ON financial_reversals,inventory_movements TO authenticated;`);
  await db.exec(readFileSync('supabase/migrations/20261116120000_void_unapplied_duplicate_sale.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });

it('voids only the duplicate with no stock effect and rejects staff and foreign sales', async () => {
  await db.exec(`SELECT set_config('test.uid','${staff}',false); SET ROLE authenticated;`);
  try {
    await expect(db.exec(`SELECT public.reverse_unapplied_duplicate_sale('${duplicate}','Duplicate sale');`))
      .rejects.toThrow('Business owner permission required');
    await db.exec(`SELECT set_config('test.uid','${owner}',false);`);
    await expect(db.exec(`SELECT public.reverse_unapplied_duplicate_sale('${first}','Duplicate sale');`))
      .rejects.toThrow('stock effects');
    await expect(db.exec(`SELECT public.reverse_unapplied_duplicate_sale('${unrelated}','Duplicate sale');`))
      .rejects.toThrow('Completed sale not found');
    await db.exec(`SELECT public.reverse_unapplied_duplicate_sale('${duplicate}','Duplicate sale');`);
    expect((await db.query('SELECT sale_id,kind,amount FROM financial_reversals')).rows)
      .toMatchObject([{ sale_id: duplicate, kind: 'void', amount: '-79000' }]);
    expect((await db.query('SELECT quantity FROM inventory_movements')).rows)
      .toMatchObject([{ quantity: -2 }]);
    await expect(db.exec(`SELECT public.reverse_unapplied_duplicate_sale('${duplicate}','Duplicate sale');`))
      .rejects.toThrow('Sale already reversed');
  } finally { await db.exec('RESET ROLE'); }
});
