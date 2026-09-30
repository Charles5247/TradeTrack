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
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text $$;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;`);
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
it('saves a profile under authenticated RLS without allowing role escalation',async()=>{
 await db.exec(`GRANT USAGE ON SCHEMA auth TO authenticated;
 SELECT set_config('test.uid','${cashier}',false);
 SELECT set_config('test.jwt','{"role":"authenticated"}',false);
 SET ROLE authenticated;`);
 try {
  const result=await db.query<{full_name:string}>(`UPDATE public.users SET full_name='Updated Cashier' WHERE id='${cashier}' RETURNING full_name`);
  expect(result.rows).toEqual([{full_name:'Updated Cashier'}]);
  await expect(db.exec(`UPDATE public.users SET role='platform_owner' WHERE id='${cashier}'`)).rejects.toThrow('owner permission');
 } finally {
  await db.exec(`RESET ROLE; SELECT set_config('test.uid','${owner}',false); SELECT set_config('test.jwt','{}',false);`);
 }
});
it('removes hosted default anonymous grants while retaining authorized RPC access',async()=>{
 const result=await db.query<{anonymous:boolean;authenticated:boolean;write:boolean;batch_insert:boolean}>(`SELECT has_function_privilege('anon','public.reserve_ai_job(text)','EXECUTE') anonymous,has_function_privilege('authenticated','public.reserve_ai_job(text)','EXECUTE') authenticated,has_table_privilege('authenticated','public.ai_jobs','INSERT') write,has_table_privilege('authenticated','public.import_batches','INSERT') batch_insert`);
 expect(result.rows[0]).toEqual({anonymous:false,authenticated:true,write:false,batch_insert:true});
});
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
it('protects assigned official invoice numbers from owner edits',async()=>{
 await expect(db.exec(`UPDATE sales SET official_invoice_number=999 WHERE id='${sale}'`)).rejects.toThrow('invoice numbers are immutable');
});
it('requires AI approval and opt-in before creating an in-app notification',async()=>{
 const result=await db.query<{id:string}>("SELECT reserve_ai_job('insights') id");const job=result.rows[0].id;
 await db.query('SELECT finish_ai_job($1,$2)',[job,JSON.stringify({summary:'Stub: organization data only'})]);
 await expect(db.query("SELECT reserve_ai_delivery($1,'in_app')",[job])).rejects.toThrow('Approve');
 await db.query('SELECT approve_ai_job($1)',[job]);
 await expect(db.query("SELECT reserve_ai_delivery($1,'in_app')",[job])).rejects.toThrow('Opt in');
 await db.exec('SELECT set_ai_preferences(true,false,false)');
 const delivery=await db.query<{id:string}>("SELECT reserve_ai_delivery($1,'in_app') id",[job]);
 await db.query('SELECT complete_ai_delivery($1,true)',[delivery.rows[0].id]);
 const notifications=await db.query<{message:string}>("SELECT message FROM notifications WHERE type='ai_insight'");
 expect(notifications.rows[0].message).toContain('Stub');
 await expect(db.query("SELECT reserve_ai_delivery($1,'email')",[job])).rejects.toThrow('Opt in');
 await expect(db.query('SELECT complete_ai_delivery($1,true)',[delivery.rows[0].id])).rejects.toThrow('not found');
 await db.exec(`SELECT set_config('test.uid','${cashier}',false)`);
 await expect(db.query('SELECT approve_ai_job($1)',[job])).rejects.toThrow('Owner or manager');
 await db.exec(`SELECT set_config('test.uid','${owner}',false)`);
});
it('requires an import batch for AI inventory approval and rejects inactive access',async()=>{
 const result=await db.query<{id:string}>("SELECT reserve_ai_job('inventory') id");const job=result.rows[0].id;
 await db.query('SELECT finish_ai_job($1,$2)',[job,'{"rows":[]}']);
 await expect(db.query('SELECT approve_ai_job($1)',[job])).rejects.toThrow('preview batch');
 await db.exec(`SELECT set_config('test.jwt','{"role":"service_role"}',false); UPDATE subscriptions SET status='expired' WHERE organization_id='${org}'; UPDATE organizations SET trial_ends_at=now()-interval '1 day' WHERE id='${org}';`);
 await expect(db.exec("SELECT reserve_ai_job('insights')")).rejects.toThrow('AI requires');
 await db.exec(`UPDATE subscriptions SET status='active' WHERE organization_id='${org}'; SELECT set_config('test.jwt','{}',false);`);
});
it('enforces the AI request quota in the database',async()=>{
 const before=await db.query<{n:number}>('SELECT count(*)::int n FROM ai_jobs');
 for(let i=before.rows[0].n;i<20;i++) await db.exec("SELECT reserve_ai_job('insights')");
 await expect(db.exec("SELECT reserve_ai_job('insights')")).rejects.toThrow('limit reached');
});
it('isolates AI rows with real authenticated-role RLS and denies direct writes',async()=>{
 const otherOrg='10000000-0000-0000-0000-000000000002';const otherOwner='20000000-0000-0000-0000-000000000003';
 await db.exec(`INSERT INTO organizations(id,name,slug) VALUES('${otherOrg}','Other','other'); INSERT INTO users(id,email,full_name,role,organization_id) VALUES('${otherOwner}','other@test.local','Other','business_owner','${otherOrg}'); GRANT USAGE ON SCHEMA auth TO authenticated; SELECT set_config('test.uid','${otherOwner}',false); SET ROLE authenticated;`);
 try {
  expect((await db.query('SELECT * FROM ai_jobs')).rows).toHaveLength(0);
  expect((await db.query('SELECT * FROM ai_deliveries')).rows).toHaveLength(0);
  expect((await db.query('SELECT * FROM ai_preferences')).rows).toHaveLength(0);
  await expect(db.exec(`INSERT INTO ai_jobs(organization_id,user_id,kind) VALUES('${org}','${otherOwner}','inventory')`)).rejects.toThrow();
 } finally {await db.exec(`RESET ROLE; SELECT set_config('test.uid','${owner}',false);`);}
});
it('does not count legacy unpaid signup trials as an introduction on new organizations',async()=>{
 const unpaid='10000000-0000-0000-0000-000000000002';const user='20000000-0000-0000-0000-000000000003';
 await db.exec(`SELECT set_config('test.jwt','{"role":"service_role"}',false); INSERT INTO subscriptions(organization_id,plan_id,status,starts_at,expires_at) VALUES('${unpaid}','${plan}','trial',now(),now()+interval '14 days'); SELECT set_config('test.uid','${user}',false); SELECT set_config('test.jwt','{}',false);`);
 try {
  expect((await db.query<{v:{active:boolean}}>('SELECT verify_business_subscription() v')).rows[0].v.active).toBe(false);
  await expect(db.exec("SELECT reserve_ai_job('insights')")).rejects.toThrow('AI requires');
 } finally {await db.exec(`SELECT set_config('test.uid','${owner}',false)`);}
});
