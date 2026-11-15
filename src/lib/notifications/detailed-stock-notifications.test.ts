import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('names the product and warehouse in stock and sale alerts', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE users(id uuid PRIMARY KEY, organization_id uuid, role text, status text, full_name text, created_at timestamptz DEFAULT now());
      CREATE TABLE products(id uuid PRIMARY KEY, organization_id uuid, name text);
      CREATE TABLE warehouses(id uuid PRIMARY KEY, organization_id uuid, name text);
      CREATE TABLE inventory(id uuid PRIMARY KEY, organization_id uuid, product_id uuid, warehouse_id uuid, quantity integer, min_stock_level integer, updated_at timestamptz DEFAULT now());
      CREATE TABLE sales(id uuid PRIMARY KEY, organization_id uuid, cashier_id uuid, warehouse_id uuid, total numeric, payment_method text, invoice_number text);
      CREATE TABLE sale_items(id uuid PRIMARY KEY, sale_id uuid, product_id uuid, quantity integer);
      CREATE TABLE inventory_movements(id uuid PRIMARY KEY, organization_id uuid, product_id uuid, warehouse_id uuid, movement_type text, quantity integer, created_by uuid);
      CREATE TABLE notifications(organization_id uuid,user_id uuid,recipient_role text,staff_user_id uuid,type text,title text,message text,body text,severity text,entity_type text,entity_id uuid,dedupe_key text,data jsonb);
      CREATE UNIQUE INDEX notifications_org_dedupe_key ON notifications(organization_id,dedupe_key) WHERE dedupe_key IS NOT NULL;
      INSERT INTO users(id,organization_id,role,status,full_name) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','business_owner','active','Owner');
      INSERT INTO products VALUES ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','Paracetamol');
      INSERT INTO warehouses VALUES ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','Main Pharmacy');
    `);
    await db.exec(readFileSync('supabase/migrations/20261115160000_detailed_stock_notifications.sql', 'utf8'));
    await db.exec(`
      CREATE TRIGGER detailed_movement AFTER INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION notify_owner_for_stock_movement();
      CREATE TRIGGER detailed_low_stock AFTER INSERT ON inventory FOR EACH ROW EXECUTE FUNCTION notify_owner_for_low_stock();
      CREATE CONSTRAINT TRIGGER detailed_sale AFTER INSERT ON sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION notify_owner_for_sale();
      CREATE TRIGGER detailed_sale_items AFTER INSERT ON sale_items FOR EACH ROW EXECUTE FUNCTION refresh_sale_notification_item_count();
      INSERT INTO inventory VALUES ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',0,5,now());
      INSERT INTO inventory_movements VALUES ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','sale',1,'00000000-0000-0000-0000-000000000001');
      BEGIN;
      INSERT INTO sales VALUES ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004',500,'cash','INV-1');
      INSERT INTO sale_items VALUES ('00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000003',2);
      COMMIT;
    `);
    const { rows } = await db.query<{ type: string; message: string }>('SELECT type,message FROM notifications ORDER BY type');
    expect(rows.find(row => row.type === 'out_of_stock')?.message).toContain('Paracetamol at Main Pharmacy: 0 unit(s) remaining');
    expect(rows.find(row => row.type === 'stock_out')?.message).toContain('Paracetamol: 1 unit(s) removed at Main Pharmacy');
    expect(rows.find(row => row.type === 'sale_made')?.message).toContain('Products: Paracetamol x 2');
  } finally { await db.close(); }
}, 30000);
