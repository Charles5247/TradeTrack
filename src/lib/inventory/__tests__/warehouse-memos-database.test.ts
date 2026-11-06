import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';

const org='10000000-0000-0000-0000-000000000001';
const owner='20000000-0000-0000-0000-000000000001';
const cashier='20000000-0000-0000-0000-000000000002';
const unassigned='20000000-0000-0000-0000-000000000003';
const warehouse='30000000-0000-0000-0000-000000000001';
const product='40000000-0000-0000-0000-000000000001';
let db: PGlite;
let memo: string;

beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE SCHEMA track_private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE organizations(id uuid PRIMARY KEY);
    CREATE TABLE users(id uuid PRIMARY KEY,organization_id uuid,role text,status text DEFAULT 'active');
    CREATE TABLE warehouses(id uuid PRIMARY KEY,organization_id uuid,name text,UNIQUE(organization_id,id));
    CREATE TABLE products(id uuid PRIMARY KEY,organization_id uuid,status text DEFAULT 'active');
    CREATE TABLE warehouse_staff(organization_id uuid,warehouse_id uuid,user_id uuid);
    CREATE TABLE inventory(organization_id uuid,product_id uuid,warehouse_id uuid,quantity integer NOT NULL,UNIQUE(product_id,warehouse_id));
    CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,user_id uuid,type text,title text,message text,body text,data jsonb);
    CREATE FUNCTION public.get_user_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT organization_id FROM users WHERE id=auth.uid() $$;
    CREATE FUNCTION public.is_business_owner() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM users WHERE id=auth.uid() AND role='business_owner') $$;
    CREATE FUNCTION track_private.immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable'; END $$;
    CREATE FUNCTION track_private.guard_financial_change() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE role_name text;
    BEGIN SELECT role INTO role_name FROM public.users WHERE id=auth.uid();
      IF role_name='cashier' THEN RAISE EXCEPTION 'Cashiers cannot adjust stock'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER financial_guard BEFORE INSERT OR UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION track_private.guard_financial_change();
    INSERT INTO organizations VALUES('${org}');
    INSERT INTO users(id,organization_id,role) VALUES('${owner}','${org}','business_owner'),('${cashier}','${org}','cashier'),('${unassigned}','${org}','cashier');
    INSERT INTO warehouses VALUES('${warehouse}','${org}','Main');
    INSERT INTO products VALUES('${product}','${org}','active');
    INSERT INTO warehouse_staff VALUES('${org}','${warehouse}','${cashier}');
    GRANT USAGE ON SCHEMA public,auth TO authenticated;
    GRANT SELECT ON users,warehouses,products,warehouse_staff,inventory,notifications TO authenticated;`);
  const migration=readFileSync('supabase/migrations/20261106112119_warehouse_memos.sql','utf8');
  await db.exec(migration);
  await db.exec(migration);
},30000);
afterAll(async()=>{await db?.close();});

it('locks staff submissions, records stock and owner corrections, and isolates warehouse access',async()=>{
  await db.exec(`SELECT set_config('test.uid','${owner}',false); SET ROLE authenticated;`);
  try {
    const result=await db.query<{create_warehouse_memo:string}>(`SELECT public.create_warehouse_memo('${warehouse}','in','Laptop shipment','[{"product_id":"${product}","quantity":10}]'::jsonb,true)`);
    memo=result.rows[0].create_warehouse_memo;
    expect((await db.query('SELECT count(*)::integer AS n FROM notifications')).rows[0]).toMatchObject({n:1});
    await db.exec(`SELECT set_config('test.uid','${cashier}',false);`);
    await db.exec(`SELECT public.submit_warehouse_memo('${memo}','[{"product_id":"${product}","quantity":8}]'::jsonb);`);
    expect((await db.query('SELECT quantity FROM inventory')).rows[0]).toMatchObject({quantity:8});
    await expect(db.exec(`SELECT public.submit_warehouse_memo('${memo}','[{"product_id":"${product}","quantity":9}]'::jsonb);`)).rejects.toThrow('already submitted');
    await expect(db.exec(`UPDATE warehouse_memo_effects SET quantity_delta=99 WHERE memo_id='${memo}'`)).rejects.toThrow();
    await db.exec(`SELECT set_config('test.uid','${owner}',false);`);
    await db.exec(`SELECT public.review_warehouse_memo('${memo}','[{"product_id":"${product}","quantity":9}]'::jsonb,'Counted one more laptop');`);
    expect((await db.query('SELECT quantity FROM inventory')).rows[0]).toMatchObject({quantity:9});
    expect((await db.query('SELECT stage,quantity_delta FROM warehouse_memo_effects ORDER BY created_at')).rows).toMatchObject([{stage:'submission',quantity_delta:8},{stage:'correction',quantity_delta:1}]);
  } finally { await db.exec('RESET ROLE'); }
});

it('hides drafts from staff and rejects submissions from unassigned cashiers',async()=>{
  await db.exec(`SELECT set_config('test.uid','${owner}',false); SET ROLE authenticated;`);
  try {
    const result=await db.query<{create_warehouse_memo:string}>(`SELECT public.create_warehouse_memo('${warehouse}','in','Another shipment','[{"product_id":"${product}","quantity":4}]'::jsonb,false)`);
    const draft=result.rows[0].create_warehouse_memo;
    await db.exec(`SELECT set_config('test.uid','${cashier}',false);`);
    expect((await db.query(`SELECT id FROM warehouse_memos WHERE id='${draft}'`)).rows).toHaveLength(0);
    await db.exec(`SELECT set_config('test.uid','${owner}',false); SELECT public.send_warehouse_memo('${draft}');`);
    await db.exec(`SELECT set_config('test.uid','${cashier}',false);`);
    expect((await db.query(`SELECT id FROM warehouse_memos WHERE id='${draft}'`)).rows).toHaveLength(1);
    await expect(db.exec(`UPDATE warehouse_memos SET reference='Changed' WHERE id='${draft}'`)).rejects.toThrow();
    await db.exec(`SELECT set_config('test.uid','${unassigned}',false);`);
    await expect(db.exec(`SELECT public.submit_warehouse_memo('${draft}','[{"product_id":"${product}","quantity":4}]'::jsonb);`)).rejects.toThrow('not assigned');
  } finally { await db.exec('RESET ROLE'); }
});
