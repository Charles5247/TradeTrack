import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';

const org='10000000-0000-0000-0000-000000000001';
const owner='20000000-0000-0000-0000-000000000001';
const sender='20000000-0000-0000-0000-000000000002';
const receiver='20000000-0000-0000-0000-000000000003';
const source='30000000-0000-0000-0000-000000000001';
const destination='30000000-0000-0000-0000-000000000002';
const product='40000000-0000-0000-0000-000000000001';
let db:PGlite;

beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE SCHEMA track_private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE organizations(id uuid PRIMARY KEY);
    CREATE TABLE users(id uuid PRIMARY KEY,organization_id uuid,role text,status text DEFAULT 'active',full_name text,created_at timestamptz DEFAULT now());
    CREATE TABLE warehouses(id uuid PRIMARY KEY,organization_id uuid,name text);
    CREATE TABLE products(id uuid PRIMARY KEY,organization_id uuid,status text DEFAULT 'active');
    CREATE TABLE warehouse_staff(organization_id uuid,warehouse_id uuid,user_id uuid);
    CREATE TABLE inventory(organization_id uuid,product_id uuid,warehouse_id uuid,quantity integer NOT NULL,UNIQUE(product_id,warehouse_id));
    CREATE TABLE inventory_movements(organization_id uuid,product_id uuid,warehouse_id uuid,movement_type text,quantity integer,reference_id uuid,reference_type text,notes text,created_by uuid);
    CREATE TABLE purchase_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,supplier_id uuid,status text DEFAULT 'draft',notes text,expected_date date,total_value numeric,created_by uuid,sent_at timestamptz);
    CREATE TABLE purchase_order_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),purchase_order_id uuid,product_id uuid,quantity_ordered integer,unit_cost numeric);
    CREATE TABLE warehouse_transfers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,from_warehouse_id uuid,to_warehouse_id uuid,product_id uuid,quantity integer,status text DEFAULT 'pending' CHECK(status IN ('pending','received','cancelled')),notes text,sent_by uuid,received_by uuid,date_received timestamptz,updated_at timestamptz,approved_by text);
    CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,user_id uuid,recipient_role text,type text,title text,message text,body text,severity text,entity_type text,entity_id uuid,dedupe_key text,data jsonb);
    CREATE FUNCTION public.get_user_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT organization_id FROM public.users WHERE id=auth.uid() $$;
    CREATE FUNCTION public.get_user_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT role FROM public.users WHERE id=auth.uid() $$;
    CREATE FUNCTION track_private.guard_financial_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF role_name='cashier' THEN RETURN NEW; END IF; RETURN NEW; END $$;
    ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY org_update ON organizations FOR UPDATE USING(true);
    ALTER TABLE warehouse_transfers ENABLE ROW LEVEL SECURITY;
    CREATE POLICY transfers_select_org ON warehouse_transfers FOR SELECT USING (organization_id=public.get_user_org_id());
    CREATE POLICY transfers_insert_admin ON warehouse_transfers FOR INSERT WITH CHECK(true);
    CREATE POLICY transfers_update_admin ON warehouse_transfers FOR UPDATE USING(true);
    INSERT INTO organizations VALUES('${org}');
    INSERT INTO users(id,organization_id,role,full_name) VALUES('${owner}','${org}','business_owner','Owner'),('${sender}','${org}','admin','Sender'),('${receiver}','${org}','cashier','Receiver');
    INSERT INTO warehouses VALUES('${source}','${org}','Source'),('${destination}','${org}','Destination');
    INSERT INTO products VALUES('${product}','${org}','active');
    INSERT INTO warehouse_staff VALUES('${org}','${source}','${sender}'),('${org}','${destination}','${receiver}');
    INSERT INTO inventory VALUES('${org}','${product}','${source}',10);
    GRANT USAGE ON SCHEMA public,auth TO authenticated;
    GRANT SELECT ON users,organizations,warehouses,products,warehouse_staff,inventory,warehouse_transfers,notifications,purchase_orders,purchase_order_items TO authenticated;
    GRANT INSERT,UPDATE ON purchase_orders,purchase_order_items TO authenticated;`);
  const migration=readFileSync('supabase/migrations/20261106153000_transfer_approval_and_owner_settings.sql','utf8');
  await db.exec(migration);
  await db.exec(readFileSync('supabase/migrations/20261106160000_purchase_order_merchant_decisions.sql','utf8'));
},30000);
afterAll(async()=>{await db?.close();});

it('requires owner authorization and records one receiving count atomically',async()=>{
  await db.exec(`SELECT set_config('test.uid','${sender}',false); SET ROLE authenticated;`);
  try {
    const result=await db.query<{request_warehouse_transfer:string}>(`SELECT (public.request_warehouse_transfer('${source}','${destination}','${product}',6,'Restock')).id AS request_warehouse_transfer`);
    const id=result.rows[0].request_warehouse_transfer;
    await expect(db.exec(`SELECT public.decide_warehouse_transfer('${id}',true)`)).rejects.toThrow('Only the merchant');
    await expect(db.exec(`UPDATE warehouse_transfers SET status='received' WHERE id='${id}'`)).rejects.toThrow();
    await db.exec(`SELECT set_config('test.uid','${owner}',false); SELECT public.decide_warehouse_transfer('${id}',true);`);
    expect((await db.query('SELECT quantity FROM inventory WHERE warehouse_id=$1',[source])).rows[0]).toMatchObject({quantity:4});
    await db.exec(`SELECT set_config('test.uid','${receiver}',false); SELECT public.receive_warehouse_transfer('${id}',5,'One unit missing');`);
    expect((await db.query('SELECT quantity FROM inventory WHERE warehouse_id=$1',[destination])).rows[0]).toMatchObject({quantity:5});
    expect((await db.query('SELECT received_quantity,status FROM warehouse_transfers WHERE id=$1',[id])).rows[0]).toMatchObject({received_quantity:5,status:'received'});
    await expect(db.exec(`SELECT public.receive_warehouse_transfer('${id}',5,'Again')`)).rejects.toThrow('not awaiting receipt');
  } finally { await db.exec('RESET ROLE'); }
});

it('allows an admin draft but reserves sending and editing for the merchant',async()=>{
  await db.exec(`SELECT set_config('test.uid','${sender}',false); SET ROLE authenticated;`);
  try {
    const result=await db.query<{id:string,line_id:string}>(`WITH po AS (
      INSERT INTO public.purchase_orders(organization_id,supplier_id,status,total_value,created_by)
      VALUES('${org}',gen_random_uuid(),'draft',20,'${sender}') RETURNING id
    ), line AS (
      INSERT INTO public.purchase_order_items(purchase_order_id,product_id,quantity_ordered,unit_cost)
      SELECT id,'${product}',2,10 FROM po RETURNING id,purchase_order_id
    ) SELECT po.id,line.id AS line_id FROM po JOIN line ON line.purchase_order_id=po.id`);
    const {id,line_id}=result.rows[0];
    await expect(db.exec(`UPDATE purchase_orders SET status='sent' WHERE id='${id}'`)).rejects.toThrow('Only the merchant');
    await expect(db.exec(`SELECT public.merchant_edit_purchase_order('${id}','[{"id":"${line_id}","quantity":3,"unit_cost":12}]','Ready',NULL)`)).rejects.toThrow('Only the merchant');
    await db.exec(`SELECT set_config('test.uid','${owner}',false); SELECT public.merchant_edit_purchase_order('${id}','[{"id":"${line_id}","quantity":3,"unit_cost":12}]','Ready',NULL);`);
    expect((await db.query('SELECT total_value FROM purchase_orders WHERE id=$1',[id])).rows[0]).toMatchObject({total_value:'36'});
    await db.exec(`UPDATE purchase_orders SET status='sent' WHERE id='${id}'`);
    expect((await db.query('SELECT status FROM purchase_orders WHERE id=$1',[id])).rows[0]).toMatchObject({status:'sent'});
  } finally { await db.exec('RESET ROLE'); }
});
