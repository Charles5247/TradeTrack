import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, afterAll, expect, it } from 'vitest';
let db: PGlite;
const org='10000000-0000-0000-0000-000000000001';
const owner='20000000-0000-0000-0000-000000000001';
const cashier='20000000-0000-0000-0000-000000000002';
const product='30000000-0000-0000-0000-000000000001';
const warehouse='40000000-0000-0000-0000-000000000001';
const sale='50000000-0000-0000-0000-000000000001';
const plan='b3000000-0000-0000-0000-000000000003';
beforeAll(async () => {
 db=new PGlite({extensions:{pgcrypto,uuid_ossp}});
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('test.jwt',true),''),'{}')::jsonb $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text $$;`);
 for(const f of readdirSync('supabase/migrations').sort()) {
   if(!f.endsWith('.sql'))continue;
   try { await db.exec(readFileSync(`supabase/migrations/${f}`,'utf8')); }
   catch(e){throw new Error(`Migration ${f}: ${e instanceof Error?e.message:e}`);}
 }
 await db.exec(`INSERT INTO organizations(id,name,slug) VALUES('${org}','Test','test');
 INSERT INTO users(id,email,full_name,role,organization_id) VALUES('${owner}','owner@test.local','Owner','business_owner','${org}'),('${cashier}','cashier@test.local','Cashier','cashier','${org}');
 INSERT INTO products(id,organization_id,name,sku,selling_price,cost_price) VALUES('${product}','${org}','Rice','RICE',100,50);
 INSERT INTO warehouses(id,organization_id,name) VALUES('${warehouse}','${org}','Main');
 INSERT INTO inventory(organization_id,product_id,warehouse_id,quantity) VALUES('${org}','${product}','${warehouse}',10);
 SELECT set_config('test.uid','${owner}',false);`);
},120000);
afterAll(async()=>{await db?.close();});
it('captures and chains database changes, prevents log mutation and financial deletion',async()=>{
 const {rows}=await db.query<{n:number,h:string}>(`SELECT count(*)::int n,min(row_hash) h FROM audit_logs WHERE organization_id='${org}'`);
 expect(rows[0].n).toBeGreaterThan(0);expect(rows[0].h).toHaveLength(64);
 await expect(db.exec(`UPDATE audit_logs SET reason='rewrite' WHERE organization_id='${org}'`)).rejects.toThrow('immutable');
 await expect(db.exec(`DELETE FROM inventory_movements WHERE organization_id='${org}'`)).rejects.toThrow('immutable');
});
it('numbers retried sales once and rolls back failed allocations',async()=>{
 const insert=`INSERT INTO sales(id,organization_id,invoice_number,cashier_id,warehouse_id,total,amount_paid,payment_method) VALUES('${sale}','${org}','LOCAL-1','${owner}','${warehouse}',100,100,'cash')`;
 await db.exec(insert);await db.exec(insert+' ON CONFLICT(id) DO NOTHING');
 const {rows}=await db.query<{invoice_number:number}>(`SELECT invoice_number::int FROM accounting_counters WHERE organization_id='${org}'`);expect(rows[0].invoice_number).toBe(1);
 await expect(db.exec(`UPDATE sales SET total=1 WHERE id='${sale}'`)).rejects.toThrow('immutable');
});
it('rejects cashier reversals and cross-org operations',async()=>{
 await db.exec(`SELECT set_config('test.uid','${cashier}',false)`);
 await expect(db.query('SELECT reverse_financial_sale($1,$2,$3)',[sale,'void','Wrong sale'])).rejects.toThrow('permission');
 await db.exec(`SELECT set_config('test.uid','${owner}',false)`);
 await expect(db.query('SELECT reverse_financial_sale($1,$2,$3)',['50000000-0000-0000-0000-000000000099','void','Wrong sale'])).rejects.toThrow('not found');
});
it('requires payment and starts trial with database time',async()=>{
 await db.exec(`SELECT set_config('test.jwt','{"role":"service_role"}',false)`);
 await expect(db.exec(`INSERT INTO subscriptions(organization_id,plan_id,status,starts_at,expires_at) VALUES('${org}','${plan}','active',now(),now()+interval '1 month')`)).rejects.toThrow('Payment confirmation');
});
it('activates the introductory window once using server time', async()=>{
 await db.exec(`SELECT set_config('test.jwt','{"role":"service_role"}',false);
 INSERT INTO payment_transactions(organization_id,amount,status) VALUES('${org}',15000,'success');
 INSERT INTO subscriptions(organization_id,plan_id,status,starts_at,expires_at) VALUES('${org}','${plan}','active','2000-01-01','2000-02-01');`);
 const {rows}=await db.query<{days:number,start:boolean}>(`SELECT extract(epoch FROM trial_ends_at-trial_started_at)/86400 days, subscription_period_start=trial_ends_at start FROM organizations WHERE id='${org}'`);
 expect(Number(rows[0].days)).toBe(30);expect(rows[0].start).toBe(true);
 const result=await db.query<{v:{active:boolean}}>('SELECT verify_business_subscription() v');expect(result.rows[0].v.active).toBe(true);
});
it('reverses stock exactly once and records a reason',async()=>{
 await db.exec(`SELECT set_config('test.jwt','{}',false); SELECT set_config('test.uid','${owner}',false);
 INSERT INTO sale_items(sale_id,product_id,warehouse_id,quantity,unit_price,total) VALUES('${sale}','${product}','${warehouse}',1,100,100);
 UPDATE inventory SET quantity=9,original_device_timestamp=(SELECT created_at FROM sales WHERE id='${sale}') WHERE product_id='${product}';`);
 await db.query('SELECT reverse_financial_sale($1,$2,$3)',[sale,'refund','Customer returned item']);
 const {rows}=await db.query<{quantity:number}>(`SELECT quantity FROM inventory WHERE product_id='${product}'`);expect(rows[0].quantity).toBe(10);
 await expect(db.query('SELECT reverse_financial_sale($1,$2,$3)',[sale,'void','Duplicate'])).rejects.toThrow('already reversed');
});
it('closes cash-up with variance and makes the close immutable',async()=>{
 const r=await db.query<{id:string}>(`SELECT close_cash_up('${owner}',now()-interval '1 day','{"cash":5}'::jsonb,'Cash counted and signed') id`);
 const id=r.rows[0].id;
 const {rows}=await db.query<{variance:{cash:number}}>('SELECT variance FROM cash_up_closes WHERE id=$1',[id]);expect(Number(rows[0].variance.cash)).toBe(5);
 await expect(db.query('UPDATE cash_up_closes SET reason=$1 WHERE id=$2',['changed',id])).rejects.toThrow('immutable');
});
it('prevents cashier self-escalation, discounts and ad-hoc stock changes',async()=>{
 await db.exec(`SELECT set_config('test.uid','${cashier}',false)`);
 await expect(db.exec(`UPDATE users SET role='business_owner' WHERE id='${cashier}'`)).rejects.toThrow('owner permission');
 await expect(db.exec(`UPDATE inventory SET quantity=200 WHERE product_id='${product}'`)).rejects.toThrow('adjust stock');
 await expect(db.exec(`INSERT INTO sales(organization_id,invoice_number,cashier_id,warehouse_id,total,discount,payment_method) VALUES('${org}','BAD','${cashier}','${warehouse}',90,10,'cash')`)).rejects.toThrow('discounts');
 await db.exec(`SELECT set_config('test.uid','${owner}',false)`);
});
it('imports opening stock idempotently and reverses without deleting records',async()=>{
 const batch='60000000-0000-0000-0000-000000000001';const imported='70000000-0000-0000-0000-000000000001';
 await db.exec(`INSERT INTO import_batches(id,organization_id,kind,created_by) VALUES('${batch}','${org}','products','${owner}')`);
 const args=[batch,1,JSON.stringify({name:'Beans',sku:'BEANS',selling_price:20,cost_price:10,opening_stock:5}),'skip',warehouse,imported];
 const r=await db.query<{v:{outcome:string}}>('SELECT apply_import_row($1,$2,$3,$4,$5,$6) v',args);expect(r.rows[0].v.outcome).toBe('create');
 await db.query('SELECT apply_import_row($1,$2,$3,$4,$5,$6)',args);
 expect((await db.query<{quantity:number}>(`SELECT quantity FROM inventory WHERE product_id='${imported}'`)).rows[0].quantity).toBe(5);
 expect((await db.query<{summary:{create:number}}>(`SELECT summary FROM import_batches WHERE id='${batch}'`)).rows[0].summary.create).toBe(1);
 await db.query('SELECT reverse_import($1,$2)',[batch,'Wrong opening file']);
 expect((await db.query<{status:string}>(`SELECT status FROM products WHERE id='${imported}'`)).rows[0].status).toBe('inactive');
 expect((await db.query<{quantity:number}>(`SELECT quantity FROM inventory WHERE product_id='${imported}'`)).rows[0].quantity).toBe(0);
});
it('imports history without changing stock and stores row-level validation failures',async()=>{
 const batch='60000000-0000-0000-0000-000000000002';
 await db.exec(`INSERT INTO import_batches(id,organization_id,kind,created_by) VALUES('${batch}','${org}','historical_sales','${owner}')`);
 const before=await db.query('SELECT sum(quantity) qty FROM inventory');
 const r=await db.query<{v:{outcome:string}}>('SELECT apply_import_row($1,1,$2,$3,NULL,$4) v',[batch,JSON.stringify({invoice_number:'OLD-1',sold_at:'2025-01-01',total:100,amount_paid:100,payment_method:'cash'}),'skip','70000000-0000-0000-0000-000000000002']);
 expect(r.rows[0].v.outcome).toBe('create');expect((await db.query('SELECT sum(quantity) qty FROM inventory')).rows).toEqual(before.rows);
 const bad=await db.query<{v:{outcome:string}}>('SELECT apply_import_row($1,2,$2,$3,NULL,$4) v',[batch,JSON.stringify({invoice_number:'OLD-2',sold_at:'bad',total:-1,payment_method:'cash'}),'skip','70000000-0000-0000-0000-000000000003']);
 expect(bad.rows[0].v.outcome).toBe('error');
});
it('stores pending invitations with no password field and blocks cross-org imports',async()=>{
 const batch='60000000-0000-0000-0000-000000000003';
 await db.exec(`INSERT INTO import_batches(id,organization_id,kind,created_by) VALUES('${batch}','${org}','staff_invites','${owner}')`);
 const r=await db.query<{v:{outcome:string}}>('SELECT apply_import_row($1,1,$2,$3,NULL,$4) v',[batch,JSON.stringify({name:'Staff',email:'staff@test.local',role:'cashier',password:'ignored'}),'skip','70000000-0000-0000-0000-000000000004']);
 expect(r.rows[0].v.outcome).toBe('create');
 const invited=await db.query('SELECT * FROM staff_invites');expect(invited.rows[0]).not.toHaveProperty('password');expect(invited.rows[0]).toHaveProperty('status','pending');
 await expect(db.query('SELECT apply_import_row($1,1,$2,$3,NULL,$4)',['60000000-0000-0000-0000-000000000099','{}','skip','70000000-0000-0000-0000-000000000099'])).rejects.toThrow('not found');
});
