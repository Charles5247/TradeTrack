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
 await db.exec(`INSERT INTO organizations(id,name,slug) VALUES('${org}','Test','test');
 INSERT INTO users(id,email,full_name,role,organization_id) VALUES('${owner}','owner@test.local','Owner','business_owner','${org}'),('${cashier}','cashier@test.local','Cashier','cashier','${org}'),('${platformOwner}','platform@test.local','Platform Owner','platform_owner',NULL);
 INSERT INTO merchants(organization_id,business_name,registration_number,contact_name,contact_email,business_owner_user_id)
 VALUES('${org}','Test','RC-BASE-1','Owner','owner@test.local','${owner}');
 SELECT set_config('test.uid','${platformOwner}',false);
 UPDATE merchants SET verification_status='verified' WHERE organization_id='${org}';
 SELECT set_config('test.uid','${owner}',false);
 INSERT INTO products(id,organization_id,name,sku,selling_price,cost_price) VALUES('${product}','${org}','Rice','RICE',100,50);
 INSERT INTO warehouses(id,organization_id,name) VALUES('${warehouse}','${org}','Main');
 INSERT INTO inventory(organization_id,product_id,warehouse_id,quantity) VALUES('${org}','${product}','${warehouse}',10);
 SELECT set_config('test.uid','${owner}',false);`);
},120000);
afterAll(async()=>{await db?.close();});
it('denies an inactive cashier stock access under authenticated RLS and retains inventory', async () => {
 await db.exec(`GRANT USAGE ON SCHEMA auth TO authenticated;
 SELECT set_config('test.uid','${platformOwner}',false);
 UPDATE public.users SET status='suspended' WHERE id='${cashier}';
 SELECT set_config('test.uid','${cashier}',false); SET ROLE authenticated;`);
 try {
  const helpers=await db.query<{org:string|null;role:string|null}>('SELECT public.get_user_org_id() org,public.get_user_role() role');
  expect(helpers.rows[0]).toEqual({org:null,role:null});
  expect((await db.query('SELECT id FROM public.inventory')).rows).toEqual([]);
  expect((await db.query('UPDATE public.inventory SET quantity=0 RETURNING id')).rows).toEqual([]);
 } finally {
  await db.exec(`RESET ROLE; SELECT set_config('test.uid','${platformOwner}',false);
  UPDATE public.users SET status='active' WHERE id='${cashier}'; SELECT set_config('test.uid','${owner}',false);`);
 }
});
it('rejects stock and sale links that cross business boundaries even when individual IDs exist', async () => {
 const otherOrg='10000000-0000-0000-0000-000000000088';
 const otherProduct='30000000-0000-0000-0000-000000000088';
 const otherWarehouse='40000000-0000-0000-0000-000000000088';
 await db.exec(`INSERT INTO public.organizations(id,name,slug) VALUES('${otherOrg}','Other','other-m0');
 INSERT INTO public.products(id,organization_id,name,sku,selling_price,cost_price) VALUES('${otherProduct}','${otherOrg}','Other product','OTHER',100,50);
 INSERT INTO public.warehouses(id,organization_id,name) VALUES('${otherWarehouse}','${otherOrg}','Other');`);
 await expect(db.query('INSERT INTO public.inventory(organization_id,product_id,warehouse_id,quantity) VALUES($1,$2,$3,1)',[org,otherProduct,warehouse]))
  .rejects.toThrow('inventory_product_tenant_fk');
 await expect(db.query('INSERT INTO public.inventory(organization_id,product_id,warehouse_id,quantity) VALUES($1,$2,$3,1)',[org,product,otherWarehouse]))
  .rejects.toThrow('inventory_warehouse_tenant_fk');
});
it('accepts consecutive cashier stock effects once, with their own sale timestamps and ledger rows', async () => {
 const item='30000000-0000-0000-0000-000000000077';
 await db.exec(`BEGIN; SELECT set_config('test.uid','${owner}',false);
 INSERT INTO public.products(id,organization_id,name,sku,selling_price,cost_price) VALUES('${item}','${org}','M0 stock','M0-STOCK',100,50);
 INSERT INTO public.inventory(organization_id,product_id,warehouse_id,quantity) VALUES('${org}','${item}','${warehouse}',10);
 SELECT set_config('test.uid','${cashier}',false); SET LOCAL ROLE authenticated;`);
 try {
  for (let index=1;index<=2;index++) {
   const id=`50000000-0000-0000-0000-00000000007${index}`;
   const time=`2026-10-19T12:00:00.00${index}Z`;
   await db.query(`INSERT INTO public.sales(id,organization_id,invoice_number,cashier_id,warehouse_id,subtotal,total,amount_paid,payment_method,created_at)
    VALUES($1,$2,$3,$4,$5,100,100,100,'cash',$6)`,[id,org,`M0-${index}`,cashier,warehouse,time]);
   await db.query(`INSERT INTO public.sale_items(sale_id,product_id,warehouse_id,quantity,unit_price,cost_price,total) VALUES($1,$2,$3,1,100,50,100)`,[id,item,warehouse]);
   const result=await db.query<{quantity:number}>(`UPDATE public.inventory SET quantity=$1,original_device_timestamp=$2
    WHERE organization_id=$3 AND product_id=$4 RETURNING quantity`,[10-index,time,org,item]);
   expect(result.rows).toEqual([{quantity:10-index}]);
  }
  const movements=await db.query<{quantity:number}>(`SELECT quantity FROM public.inventory_movements WHERE product_id=$1 AND created_by=$2 ORDER BY created_at,id`,[item,cashier]);
  expect(movements.rows).toEqual([{quantity:-1},{quantity:-1}]);
 } finally { await db.exec(`ROLLBACK; SELECT set_config('test.uid','${owner}',false);`); }
});
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
 const unpaid='10000000-0000-0000-0000-000000000096';
 const unpaidOwner='20000000-0000-0000-0000-000000000096';
 await db.exec(`INSERT INTO organizations(id,name,slug) VALUES('${unpaid}','Unpaid','unpaid');
 INSERT INTO users(id,email,full_name,role,organization_id) VALUES('${unpaidOwner}','unpaid@test.local','Unpaid Owner','business_owner','${unpaid}');`);
 await db.exec(`SELECT set_config('test.jwt','{"role":"service_role"}',false)`);
 await expect(db.exec(`INSERT INTO subscriptions(organization_id,plan_id,status,starts_at,expires_at) VALUES('${unpaid}','${plan}','active',now(),now()+interval '1 month')`)).rejects.toThrow('Payment confirmation');
 await db.exec(`SELECT set_config('test.jwt','{}',false); SELECT set_config('test.uid','${owner}',false);`);
});
it('starts the 30-day introductory window when a platform owner approves registration', async()=>{
 const trialOrg='10000000-0000-0000-0000-000000000097';
 const trialOwner='20000000-0000-0000-0000-000000000097';
 await db.exec(`INSERT INTO organizations(id,name,slug) VALUES('${trialOrg}','Verified trial','verified-trial');
 INSERT INTO users(id,email,full_name,role,organization_id) VALUES('${trialOwner}','trial-owner@test.local','Trial Owner','business_owner','${trialOrg}');
 INSERT INTO merchants(organization_id,business_name,registration_number,contact_name,contact_email,business_owner_user_id)
 VALUES('${trialOrg}','Verified trial','RC-VERIFY-97','Trial Owner','trial-owner@test.local','${trialOwner}');
 SELECT set_config('test.uid','${owner}',false);`);
 await expect(db.exec(`UPDATE merchants SET verification_status='verified' WHERE organization_id='${trialOrg}'`))
   .rejects.toThrow('Only a platform owner');
 await db.exec(`SELECT set_config('test.uid','${platformOwner}',false);
 UPDATE merchants SET verification_status='verified' WHERE organization_id='${trialOrg}';
 SELECT set_config('test.uid','${trialOwner}',false);`);
 const trial=await db.query<{plan:string;days:number;pending:boolean}>(`SELECT subscription_plan_id plan,
   extract(epoch FROM trial_ends_at-trial_started_at)/86400 days,trial_pending_verification pending
   FROM organizations WHERE id='${trialOrg}'`);
 expect(Number(trial.rows[0].days)).toBe(30);
 expect(trial.rows[0]).toMatchObject({plan:'b4000000-0000-0000-0000-000000000004',pending:false});
 const result=await db.query<{v:{active:boolean;business_verification_status:string}}>('SELECT verify_business_subscription() v');
 expect(result.rows[0].v).toMatchObject({active:true,business_verification_status:'verified'});
 const duplicateOrg='10000000-0000-0000-0000-000000000095';
 const duplicateOwner='20000000-0000-0000-0000-000000000095';
 await db.exec(`INSERT INTO organizations(id,name,slug) VALUES('${duplicateOrg}','Duplicate','duplicate');
 INSERT INTO users(id,email,full_name,role,organization_id) VALUES('${duplicateOwner}','duplicate@test.local','Duplicate Owner','business_owner','${duplicateOrg}');`);
 await expect(db.exec(`INSERT INTO merchants(organization_id,business_name,registration_number,contact_name,contact_email,business_owner_user_id)
   VALUES('${duplicateOrg}','Duplicate','rc-verify-97','Duplicate Owner','duplicate@test.local','${duplicateOwner}')`))
   .rejects.toThrow('merchants_registration_number_normalized_uidx');
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
 await db.exec(`INSERT INTO payment_transactions(organization_id,amount,status,reference)
   VALUES('${org}',15000,'success','test-ai-restored-subscription');
   UPDATE subscriptions SET status='active',expires_at=now()+interval '1 month' WHERE organization_id='${org}';
   SELECT set_config('test.jwt','{}',false);`);
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
it('isolates supplier catalogs and lets only owners assign warehouse staff', async () => {
 const other='10000000-0000-0000-0000-000000000099';
 const supplier='60000000-0000-0000-0000-000000000001';
 const foreignProduct='30000000-0000-0000-0000-000000000099';
 await db.exec(`INSERT INTO organizations(id,name,slug) VALUES('${other}','Supplier boundary','supplier-boundary');
 INSERT INTO suppliers(id,organization_id,name) VALUES('${supplier}','${org}','Supplier');
 INSERT INTO products(id,organization_id,name,sku,cost_price,selling_price) VALUES('${foreignProduct}','${other}','Other item','OTHER',1,2);
 SELECT set_config('test.uid','${owner}',false); SET ROLE authenticated;`);
 try {
  await db.exec(`INSERT INTO warehouse_staff(organization_id,warehouse_id,user_id,assignment_role) VALUES('${org}','${warehouse}','${cashier}','cashier');`);
  await expect(db.exec(`UPDATE warehouse_staff SET assignment_role='manager' WHERE warehouse_id='${warehouse}'`)).rejects.toThrow();
  await db.exec(`INSERT INTO supplier_products(organization_id,supplier_id,product_id) VALUES('${org}','${supplier}','${product}')`);
  await expect(db.exec(`INSERT INTO supplier_products(organization_id,supplier_id,product_id) VALUES('${org}','${supplier}','${foreignProduct}')`)).rejects.toThrow();
  await db.exec(`SELECT set_config('test.uid','${cashier}',false);`);
  expect((await db.query('SELECT * FROM warehouse_staff')).rows).toHaveLength(1);
  expect((await db.query('DELETE FROM warehouse_staff RETURNING *')).rows).toHaveLength(0);
  await expect(db.exec(`INSERT INTO warehouse_staff(organization_id,warehouse_id,user_id,assignment_role) VALUES('${org}','${warehouse}','${owner}','manager')`)).rejects.toThrow();
 } finally { await db.exec(`RESET ROLE; SELECT set_config('test.uid','${owner}',false);`); }
});

it('keeps a new business locked until verified, then permits transactions only through its 30-day trial', async () => {
 const trialOrg='10000000-0000-0000-0000-000000000098';
 const trialOwner='20000000-0000-0000-0000-000000000098';
 const trialWarehouse='40000000-0000-0000-0000-000000000098';
 const firstSale='50000000-0000-0000-0000-000000000098';
 const secondSale='50000000-0000-0000-0000-000000000099';
 await db.exec(`INSERT INTO organizations(id,name,slug) VALUES('${trialOrg}','Trial boundary','trial-boundary');
 INSERT INTO users(id,email,full_name,role,organization_id) VALUES('${trialOwner}','trial-boundary@test.local','Trial Owner','business_owner','${trialOrg}');
 INSERT INTO merchants(organization_id,business_name,registration_number,contact_name,contact_email,business_owner_user_id)
 VALUES('${trialOrg}','Trial boundary','RC-BOUNDARY-98','Trial Owner','trial-boundary@test.local','${trialOwner}');
 INSERT INTO warehouses(id,organization_id,name) VALUES('${trialWarehouse}','${trialOrg}','Trial warehouse');`);
 const pending=await db.query<{status:string;pending:boolean}>(
   `SELECT subscription_status status,trial_pending_verification pending FROM organizations WHERE id='${trialOrg}'`);
 expect(pending.rows[0]).toEqual({status:'suspended',pending:true});
 const orgDetails=await db.query<{plan:string;days:number;status:string}>(`SELECT subscription_plan_id plan,
   extract(epoch FROM trial_ends_at-trial_started_at)/86400 days,subscription_status status
   FROM organizations WHERE id='${trialOrg}'`);
 const insertSale=(id:string,invoice:string)=>`INSERT INTO sales(id,organization_id,invoice_number,cashier_id,warehouse_id,total,amount_paid,payment_method)
   VALUES('${id}','${trialOrg}','${invoice}','${trialOwner}','${trialWarehouse}',10,10,'cash')`;
 await expect(db.exec(insertSale(firstSale,'TRIAL-1'))).rejects.toThrow('verification');
 await db.exec(`SELECT set_config('test.uid','${platformOwner}',false);
 UPDATE merchants SET verification_status='verified' WHERE organization_id='${trialOrg}';
 SELECT set_config('test.uid','${trialOwner}',false);`);
 expect(orgDetails.rows[0].status).toBe('suspended');
 const verified=await db.query<{plan:string;days:number;status:string}>(`SELECT subscription_plan_id plan,
   extract(epoch FROM trial_ends_at-trial_started_at)/86400 days,subscription_status status
   FROM organizations WHERE id='${trialOrg}'`);
 expect(verified.rows[0]).toMatchObject({
   plan:'b4000000-0000-0000-0000-000000000004',
   status:'trial',
 });
 expect(Number(verified.rows[0].days)).toBe(30);

 await db.exec(insertSale(firstSale,'TRIAL-1'));
 await db.exec(`UPDATE organizations SET trial_ends_at=statement_timestamp()-interval '1 second' WHERE id='${trialOrg}';
 UPDATE subscriptions SET expires_at=statement_timestamp()-interval '1 second' WHERE organization_id='${trialOrg}' AND status='trial'`);
 await expect(db.exec(insertSale(secondSale,'TRIAL-2'))).rejects.toThrow('Trial ended');
 const existingSales=await db.query<{count:number}>(`SELECT count(*)::int count FROM sales WHERE organization_id='${trialOrg}'`);
 expect(existingSales.rows[0].count).toBe(1);
});
