import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, afterAll, expect, it } from 'vitest';
let db: PGlite;
const org='10000000-0000-0000-0000-000000000001';
const owner='20000000-0000-0000-0000-000000000001';
const cashier='20000000-0000-0000-0000-000000000002';
const platformOwner='20000000-0000-0000-0000-000000000010';
const product='30000000-0000-0000-0000-000000000001';
const warehouse='40000000-0000-0000-0000-000000000001';
const sale='50000000-0000-0000-0000-000000000001';
const plan='b3000000-0000-0000-0000-000000000003';
beforeAll(async () => {
 db=new PGlite({extensions:{pgcrypto,uuid_ossp}});
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('test.jwt',true),''),'{}')::jsonb $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text $$;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;`);
 for(const f of readdirSync('supabase/migrations').sort()) {
   if(!f.endsWith('.sql'))continue;
   try { await db.exec(readFileSync(`supabase/migrations/${f}`,'utf8')); }
   catch(e){throw new Error(`Migration ${f}: ${e instanceof Error?e.message:e}`);}
 }
 await db.exec(readFileSync('supabase/migrations/20261030062000_notification_delivery_system.sql','utf8'));
 await db.exec(`INSERT INTO organizations(id,name,slug) VALUES('${org}','Test','test');
 INSERT INTO users(id,email,full_name,role,organization_id) VALUES('${owner}','owner@test.local','Owner','business_owner','${org}'),('${cashier}','cashier@test.local','Cashier','cashier','${org}'),('${platformOwner}','platform@test.local','Platform Owner','platform_owner',NULL);
 INSERT INTO merchants(organization_id,business_name,registration_number,contact_name,contact_email,business_owner_user_id)
 VALUES('${org}','Test','RC-BASE-1','Owner','owner@test.local','${owner}');
 SELECT set_config('test.uid','${platformOwner}',false);
 UPDATE merchants SET verification_status='verified',business_type='pharmacy' WHERE organization_id='${org}';
 SELECT set_config('test.uid','${owner}',false);
 INSERT INTO products(id,organization_id,name,sku,selling_price,cost_price) VALUES('${product}','${org}','Rice','RICE',100,50);
 INSERT INTO warehouses(id,organization_id,name) VALUES('${warehouse}','${org}','Main');
 INSERT INTO inventory(organization_id,product_id,warehouse_id,quantity) VALUES('${org}','${product}','${warehouse}',10);
 SELECT set_config('test.uid','${owner}',false);`);
},120000);
afterAll(async()=>{await db?.close();});
it('preserves legacy piece quantities and prevents unit changes after stock history',async()=>{
 expect((await db.query<{stock_unit:string}>(`SELECT stock_unit FROM products WHERE id='${product}'`)).rows[0].stock_unit).toBe('piece');
 await expect(db.exec(`UPDATE products SET stock_unit='pair' WHERE id='${product}'`)).rejects.toThrow('stock history');
 await db.exec(`INSERT INTO products(id,organization_id,name,sku,selling_price,cost_price,stock_unit,variant_size,variant_colour) VALUES('30000000-0000-0000-0000-000000009955','${org}','Shoes','SHOE-42-BLACK',100,50,'pair','42','Black')`);
 expect((await db.query<{stock_unit:string}>(`SELECT stock_unit FROM products WHERE sku='SHOE-42-BLACK'`)).rows[0].stock_unit).toBe('pair');
 await expect(db.exec(`UPDATE products SET stock_unit='invalid' WHERE sku='SHOE-42-BLACK'`)).rejects.toThrow('check constraint');
});
it('rejects direct medical RPC calls by ordinary retail businesses',async()=>{
 for(const industry of ['electronics','fashion','retail']) {
  await db.exec(`UPDATE merchants SET business_type='${industry}' WHERE organization_id='${org}'; SET ROLE authenticated;`);
  try {
   await expect(db.exec(`SELECT public.register_medical_product('${product}','item',1,'general')`)).rejects.toThrow('medical business industry');
   await expect(db.exec(`SELECT public.receive_medical_batch('60000000-0000-0000-0000-000000000097','${product}','${warehouse}','TEST','2099-12-31',1,'invoice','reason')`)).rejects.toThrow('medical business industry');
   await expect(db.exec(`SELECT public.issue_medical_stock('60000000-0000-0000-0000-000000000096','${product}','${warehouse}',1,'sale','customer','reason',100,'cash')`)).rejects.toThrow('medical business industry');
  } finally {await db.exec(`RESET ROLE; UPDATE merchants SET business_type='pharmacy' WHERE organization_id='${org}';`);}
 }
});
it('creates one owner notification per sale and keeps the final item count', async () => {
 await db.exec(`SELECT set_config('test.uid','${cashier}',false);
  INSERT INTO sales(id,organization_id,invoice_number,cashier_id,warehouse_id,subtotal,total,amount_paid,payment_method)
  VALUES('${sale}','${org}','NOTIFY-001','${cashier}','${warehouse}',300,300,300,'cash');
  INSERT INTO sale_items(sale_id,product_id,warehouse_id,quantity,unit_price,cost_price,total)
  VALUES('${sale}','${product}','${warehouse}',3,100,50,300);`);
 const result=await db.query<{type:string;items_count:number}>(`SELECT type,(data->>'items_count')::int items_count FROM notifications WHERE dedupe_key LIKE 'sale:${sale}:%'`);
 expect(result.rows).toEqual([{type:'sale_made',items_count:3}]);
});
it('isolates medical batch receipts, preserves expiry and makes retries exactly-once',async()=>{
 const med='30000000-0000-0000-0000-000000009901';
 const receipt='60000000-0000-0000-0000-000000000099';
 await db.exec(`SELECT set_config('test.uid','${owner}',false);
 INSERT INTO products(id,organization_id,name,sku,selling_price,cost_price) VALUES('${med}','${org}','Medical stock test','MED-TEST',10,5);
 SELECT public.register_medical_product('${med}','tablet',30,'general'); SET ROLE authenticated;`);
 try {
  const call=`SELECT public.receive_medical_batch('${receipt}','${med}','${warehouse}','LOT-001','2099-12-31',60,'Supplier invoice 1','Opening batch receipt')`;
  await db.exec(call);await db.exec(call);
  expect((await db.query<{quantity:number}>('SELECT quantity FROM medical_batches')).rows).toEqual([{quantity:60}]);
  await expect(db.exec(call.replace(',60,',',61,'))).rejects.toThrow('different request');
  await expect(db.exec(`SELECT public.receive_medical_batch('60000000-0000-0000-0000-000000000098','${med}','${warehouse}','LOT-001','2099-11-30',1,'Supplier invoice 2','Conflicting date')`)).rejects.toThrow('expiry conflicts');
  await expect(db.exec(`UPDATE medical_batches SET quantity=999`)).rejects.toThrow('permission denied');
  await expect(db.exec(`UPDATE products SET medical_stock_managed=false WHERE id='${med}'`)).rejects.toThrow('product enrollment');
  await expect(db.exec(`INSERT INTO inventory(organization_id,product_id,warehouse_id,quantity) VALUES('${org}','${med}','${warehouse}',10)`)).rejects.toThrow('medical batch workflow');
  await db.exec(`SELECT set_config('test.uid','${cashier}',false)`);
  await expect(db.exec(call)).rejects.toThrow('owner or admin');
 }finally{await db.exec(`RESET ROLE; SELECT set_config('test.uid','${owner}',false);`);}
});
it('issues FEFO stock atomically, records free issues without revenue, and rejects unsupported dispensing',async()=>{
 const med='30000000-0000-0000-0000-000000009902';
 await db.exec(`SELECT set_config('test.uid','${owner}',false);
 INSERT INTO products(id,organization_id,name,sku,selling_price,cost_price) VALUES('${med}','${org}','Issue test','MED-ISSUE',10,5);
 SELECT public.register_medical_product('${med}','bottle',1,'general');
 SELECT public.receive_medical_batch('60000000-0000-0000-0000-000000009901','${med}','${warehouse}','LATER','2099-12-31',10,'Delivery 1','Received stock');
 SELECT public.receive_medical_batch('60000000-0000-0000-0000-000000009902','${med}','${warehouse}','EARLIER','2099-11-30',3,'Delivery 2','Received stock');
 SELECT public.receive_medical_batch('60000000-0000-0000-0000-000000009903','${med}','${warehouse}','EXPIRED','2000-01-01',100,'Delivery 3','Quarantine opening stock'); SET ROLE authenticated;`);
 try {
  const issue=`SELECT public.issue_medical_stock('70000000-0000-0000-0000-000000009901','${med}','${warehouse}',5,'free_issue','Ward reference 1','Ward supplies',0,'cash')`;
  await db.exec(issue);await db.exec(issue);
  const rows=(await db.query<{batch_number:string;quantity:number;status:string}>(`SELECT batch_number,quantity,status FROM medical_batches WHERE product_id='${med}' ORDER BY batch_number`)).rows;
  expect(rows).toEqual([{batch_number:'EARLIER',quantity:0,status:'available'},{batch_number:'EXPIRED',quantity:100,status:'quarantined'},{batch_number:'LATER',quantity:8,status:'available'}]);
  expect((await db.query(`SELECT id FROM sales WHERE id='70000000-0000-0000-0000-000000009901'`)).rows).toHaveLength(0);
  await expect(db.exec(issue.replace('000000009901','000000009904').replace(",5,'free_issue'",",9,'free_issue'"))).rejects.toThrow('Insufficient');
  expect((await db.query<{quantity:number}>(`SELECT quantity FROM medical_batches WHERE product_id='${med}' AND batch_number='LATER'`)).rows[0].quantity).toBe(8);
  await db.exec(`SELECT public.issue_medical_stock('70000000-0000-0000-0000-000000009905','${med}','${warehouse}',2,'sale','Customer reference 1','Stock sale',10,'cash')`);
  expect((await db.query<{total:string}>(`SELECT total FROM sales WHERE id='70000000-0000-0000-0000-000000009905'`)).rows[0].total).toBe('20.00');
  await db.exec(`SELECT set_config('test.uid','${cashier}',false)`);
  await expect(db.exec(issue.replace('000000009901','000000009906'))).rejects.toThrow('Manager approval');
 }finally{await db.exec(`RESET ROLE; SELECT set_config('test.uid','${owner}',false);`);}
 const rx='30000000-0000-0000-0000-000000009903';
 await db.exec(`INSERT INTO products(id,organization_id,name,sku,selling_price,cost_price) VALUES('${rx}','${org}','Rx test','MED-RX',1,1);
 SELECT public.register_medical_product('${rx}','tablet',10,'prescription');`);
 await expect(db.exec(`SELECT public.issue_medical_stock('70000000-0000-0000-0000-000000009907','${rx}','${warehouse}',1,'sale','Prescription reference','Dispensing attempt',1,'cash')`)).rejects.toThrow('not enabled');
});
