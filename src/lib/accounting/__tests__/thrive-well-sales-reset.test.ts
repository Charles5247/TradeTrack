import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';

const org = '461a56a3-86f0-4385-bc17-c2d0e3694ffa';
const original = 'e1b3776a-92ad-4e6a-9d1d-e961a5b4d083';
const duplicate = '66485543-096e-495c-bcf6-22d6c8091aa8';
const request = '60000000-0000-0000-0000-000000000001';
const owner = 'ae38e198-f146-44c9-8d65-86818986ac4b';
const resetCall = `public.reset_thrive_well_sales_history('${request}')`;
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE SCHEMA track_private;
    CREATE TABLE organizations(id uuid PRIMARY KEY);
    CREATE TABLE users(id uuid PRIMARY KEY, organization_id uuid, role text, status text);
    CREATE TABLE sales(id uuid PRIMARY KEY, organization_id uuid, invoice_number text,
      status text, total numeric, created_at timestamptz);
    CREATE TABLE historical_sales(id uuid PRIMARY KEY, organization_id uuid, sold_at timestamptz,
      created_at timestamptz DEFAULT now());
    CREATE TABLE sale_items(sale_id uuid, product_id uuid, warehouse_id uuid, quantity integer);
    CREATE TABLE inventory(organization_id uuid, product_id uuid, warehouse_id uuid,
      quantity integer, original_device_timestamp timestamptz);
    CREATE TABLE inventory_movements(organization_id uuid, product_id uuid, warehouse_id uuid,
      quantity integer, reference_type text, original_device_timestamp timestamptz,
      notes text);
    CREATE TABLE financial_reversals(sale_id uuid, organization_id uuid, kind text);
    CREATE TABLE sale_reset_tombstones(sale_id uuid PRIMARY KEY, organization_id uuid);
    CREATE FUNCTION public.get_user_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT '${org}'::uuid $$;
    CREATE FUNCTION track_private.immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'immutable'; END $$;
    CREATE FUNCTION track_private.capture_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RETURN NEW; END $$;
    CREATE FUNCTION track_private.stock_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO public.inventory_movements(organization_id,product_id,warehouse_id,quantity,
          reference_type,original_device_timestamp,notes)
        VALUES(NEW.organization_id,NEW.product_id,NEW.warehouse_id,
          NEW.quantity-OLD.quantity,'inventory_ledger',NEW.original_device_timestamp,
          current_setting('track.reason',true));
        RETURN NEW;
      END $$;
    CREATE TRIGGER stock_ledger AFTER UPDATE OF quantity ON inventory
      FOR EACH ROW EXECUTE FUNCTION track_private.stock_ledger();
    ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
    ALTER TABLE historical_sales ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sale_reset_tombstones ENABLE ROW LEVEL SECURITY;
    CREATE POLICY sales_read ON sales FOR SELECT TO authenticated
      USING (organization_id=public.get_user_org_id());
    CREATE POLICY historical_read ON historical_sales FOR SELECT TO authenticated
      USING (organization_id=public.get_user_org_id());
    CREATE POLICY reset_read ON sale_reset_tombstones FOR SELECT TO authenticated
      USING (organization_id=public.get_user_org_id());
    GRANT USAGE ON SCHEMA public TO authenticated,service_role;
    GRANT SELECT ON sales,historical_sales,sale_reset_tombstones TO authenticated;
    INSERT INTO organizations VALUES ('${org}');
    INSERT INTO users VALUES ('${owner}','${org}','business_owner','active');
    INSERT INTO sales VALUES
      ('${original}','${org}','INV-99886DBB-0FFD-4C4C-BF8F-8E53675B076A',
        'completed',79000,'2026-11-16T20:57:40.224Z'),
      ('${duplicate}','${org}','INV-BD8C71D5-2849-45C9-AD47-366D9C9CA3BA',
        'completed',79000,'2026-11-16T20:57:41.495Z');
    INSERT INTO sales
      SELECT gen_random_uuid(),'${org}','OTHER-'||n,'completed',100,
        '2026-11-15T00:00:00Z'::timestamptz
      FROM generate_series(1,44) n;
    INSERT INTO historical_sales(id,organization_id,sold_at)
      SELECT gen_random_uuid(),'${org}','2026-01-01T00:00:00Z' FROM generate_series(1,1050);
    INSERT INTO sale_reset_tombstones
      SELECT id,organization_id FROM sales WHERE organization_id='${org}' LIMIT 42;
    INSERT INTO financial_reversals VALUES ('${original}','${org}','void');
    WITH lines AS (
      SELECT ('40000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid AS product_id,
        '50000000-0000-0000-0000-000000000001'::uuid AS warehouse_id,
        CASE WHEN n<=4 THEN 2 ELSE 1 END AS quantity
      FROM generate_series(1,36) n
    )
    INSERT INTO sale_items
      SELECT '${original}'::uuid,product_id,warehouse_id,quantity FROM lines
      UNION ALL SELECT '${duplicate}'::uuid,product_id,warehouse_id,quantity FROM lines;
    INSERT INTO inventory
      SELECT '${org}',product_id,warehouse_id,quantity+2,NULL
      FROM sale_items WHERE sale_id='${original}';
    INSERT INTO inventory_movements
      SELECT '${org}',product_id,warehouse_id,-quantity,'inventory_ledger',
        '2026-11-16T20:57:40.224Z',NULL
      FROM sale_items WHERE sale_id='${original}';
  `);
  await db.exec(readFileSync('supabase/migrations/20261117120000_thrive_well_sales_history_reset.sql', 'utf8'));
}, 30000);

afterAll(async () => { await db?.close(); });

it('deducts stock once and archives both sales sets without deleting evidence', async () => {
  await expect(db.exec(`SET ROLE authenticated; SELECT ${resetCall}`))
    .rejects.toThrow('Verified Thrive-Well owner authorization required');
  await db.exec('RESET ROLE');
  await db.exec(`SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)`);
  await expect(db.exec(`SET ROLE authenticated; SELECT ${resetCall}`))
    .rejects.toThrow('Verified Thrive-Well owner authorization required');
  await db.exec('RESET ROLE');
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${owner}',false)`);
  await expect(db.exec(`SET ROLE service_role; SELECT ${resetCall}`))
    .rejects.toThrow();
  await db.exec('RESET ROLE');
  const extra = '70000000-0000-0000-0000-000000000001';
  await db.exec(`INSERT INTO sales VALUES ('${extra}','${org}','NEW','completed',100,now())`);
  await expect(db.exec(`SET ROLE authenticated; SELECT ${resetCall}`))
    .rejects.toThrow('Sales counts changed');
  await db.exec('RESET ROLE');
  expect((await db.query('SELECT sum(quantity) AS units FROM inventory')).rows[0])
    .toMatchObject({ units: 112 });
  await db.exec(`DELETE FROM sales WHERE id='${extra}'`);
  await db.exec('SET ROLE authenticated');
  const result = await db.query(`SELECT ${resetCall} AS result`);
  await db.exec('RESET ROLE');
  expect(result.rows[0]).toMatchObject({ result: {
    current_sales: 46, historical_sales: 1050, stock_units_deducted: 40,
    already_applied: false,
  } });
  expect((await db.query(`SELECT sum(quantity) AS units FROM inventory`)).rows[0])
    .toMatchObject({ units: 72 });
  expect((await db.query(`SELECT count(*)::integer AS count FROM inventory_movements
    WHERE notes LIKE 'Confirmed physical sale stock correction%'`)).rows[0])
    .toMatchObject({ count: 36 });
  expect((await db.query('SELECT count(*)::integer AS count FROM sales')).rows[0])
    .toMatchObject({ count: 46 });
  expect((await db.query(`SELECT created_by FROM track_private.sales_history_reset_events WHERE id='${request}'`)).rows[0])
    .toMatchObject({ created_by: owner });
  await expect(db.exec(`INSERT INTO historical_sales(id,organization_id,sold_at)
    VALUES(gen_random_uuid(),'${org}','2026-01-01T00:00:00Z')`))
    .rejects.toThrow('predates the business history reset');
  await db.exec('SET ROLE authenticated');
  expect((await db.query('SELECT id FROM sales')).rows).toHaveLength(0);
  expect((await db.query('SELECT id FROM historical_sales')).rows).toHaveLength(0);
  await db.exec('RESET ROLE');
  await db.exec(`INSERT INTO historical_sales(id,organization_id,sold_at)
    VALUES(gen_random_uuid(),'${org}',now() + interval '1 day')`);
  await db.exec('SET ROLE authenticated');
  const retry = await db.query(`SELECT ${resetCall} AS result`);
  expect(retry.rows[0]).toMatchObject({ result: { already_applied: true } });
  await db.exec('RESET ROLE');
  await db.exec(`UPDATE users SET status='inactive' WHERE id='${owner}'`);
  await db.exec('SET ROLE authenticated');
  expect((await db.query(`SELECT ${resetCall} AS result`)).rows[0])
    .toMatchObject({ result: { already_applied: true } });
  await db.exec('RESET ROLE');
  expect((await db.query('SELECT sum(quantity) AS units FROM inventory')).rows[0])
    .toMatchObject({ units: 72 });
});
