// Real PostgreSQL proof using isolated synthetic data; never reads .env files.
import { execFile, execFileSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const execute = promisify(execFile);
const psql = process.env.M0_PSQL ?? (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe' : 'psql');
const port = process.env.M0_PG_PORT ?? '55439';
if (!/^\d+$/.test(port) || Number(port)<1024) throw new Error('Use a dedicated unprivileged local test port');
const database = `m0_verify_${randomUUID().replaceAll('-','')}`;
const base = ['-h','127.0.0.1','-p',port,'-U','m0_test','-X','-qAt','-v','ON_ERROR_STOP=1'];
const quote = value => `'${String(value).replaceAll("'","''")}'`;
const org='10000000-0000-0000-0000-000000000001', owner='20000000-0000-0000-0000-000000000001', cashier='20000000-0000-0000-0000-000000000002';
const platform='20000000-0000-0000-0000-000000000010', product='30000000-0000-0000-0000-000000000001', warehouse='40000000-0000-0000-0000-000000000001';
const product2='30000000-0000-0000-0000-000000000002';
const results=[];
async function sql(statement, actor, app='m0-verification') {
  const prefix=actor ? `SET ROLE authenticated; SET "test.uid"=${quote(actor)}; ` : '';
  const result=await execute(psql,[...base,'-d',database,'-c',prefix+statement],{env:{...process.env,PGAPPNAME:app},maxBuffer:4*1024*1024});
  return result.stdout.trim();
}
const rpc=(command, recovery=false, actor=cashier) => sql(`SELECT public.post_pos_checkout(${quote(JSON.stringify(command))}::jsonb,${recovery},${recovery ? quote('Reviewed saved original receipt') : 'NULL'})`,actor);
let sequence=0;
function receipt(quantity=1) {
  const id=randomUUID(), time=new Date(Date.UTC(2026,9,19,15,0,0,++sequence)).toISOString();
  return { sale:{id,organization_id:org,invoice_number:`LOCAL-${id}`,cashier_id:cashier,warehouse_id:warehouse,
    customer_name:null,customer_phone:null,subtotal:quantity*100,discount:0,tax:0,total:quantity*100,amount_paid:0,change_amount:0,
    payment_method:'partial',status:'completed',notes:null,receipt_url:null,created_at:time},
    items:[{id:randomUUID(),sale_id:id,product_id:product,warehouse_id:warehouse,quantity,unit_price:100,cost_price:50,discount:0,total:quantity*100}] };
}
const quantity=async()=>Number(await sql(`SELECT quantity FROM inventory WHERE product_id='${product}' AND warehouse_id='${warehouse}'`));
async function check(name, callback) { await callback(); results.push({name,status:'passed'}); process.stdout.write(`PASS ${name}\n`); }
async function holdInventoryRow() {
  const child=spawn(psql,[...base,'-d',database],{stdio:['pipe','pipe','pipe'],env:{...process.env,PGAPPNAME:'m0-lock-blocker'}});
  let output='',errors='',started=false;
  let signalReady,failReady;
  const ready=new Promise((resolve,reject)=>{signalReady=resolve;failReady=reject;});
  const completed=new Promise((resolve,reject)=>{
    child.once('error',error=>{failReady(error);reject(error);});
    child.once('close',code=>{if(!started)failReady(new Error(`Lock holder exited before readiness: ${errors}`));if(code===0)resolve();else reject(new Error(`Lock holder failed: ${errors}`));});
  });
  void completed.catch(()=>{});
  child.stdout.on('data',chunk=>{output+=String(chunk);if(!started&&output.includes('M0_LOCK_READY')){started=true;signalReady();}});
  child.stderr.on('data',chunk=>{errors+=String(chunk);});
  const timer=setTimeout(()=>{failReady(new Error('Lock holder startup exceeded 60 seconds'));child.kill();},60000);
  child.stdin.write(`BEGIN; SELECT id FROM inventory WHERE product_id='${product}' AND warehouse_id='${warehouse}' FOR UPDATE; SELECT 'M0_LOCK_READY';\n`);
  try {await ready;} catch(error){child.kill();throw error;} finally {clearTimeout(timer);}
  return async()=>{child.stdin.end('COMMIT;\n');await completed;};
}
async function legacy(command, withEffect=false) {
  const s=command.sale, i=command.items[0];
  await sql(`INSERT INTO public.sales(id,organization_id,invoice_number,cashier_id,warehouse_id,subtotal,discount,tax,total,amount_paid,change_amount,payment_method,status,created_at)
    VALUES(${quote(s.id)},'${org}',${quote(s.invoice_number)},'${cashier}','${warehouse}',${s.subtotal},0,0,${s.total},0,0,'partial','completed',${quote(s.created_at)});
    INSERT INTO public.sale_items(id,sale_id,product_id,warehouse_id,quantity,unit_price,cost_price,discount,total)
    VALUES(${quote(i.id)},${quote(s.id)},'${product}','${warehouse}',${i.quantity},100,50,0,${i.total});
    ${withEffect ? `UPDATE inventory SET quantity=quantity-${i.quantity},original_device_timestamp=${quote(s.created_at)} WHERE product_id='${product}' AND warehouse_id='${warehouse}';` : ''}`,cashier);
}

execFileSync(psql,[...base,'-d','postgres','-c',`CREATE DATABASE ${database}`],{stdio:'pipe'});
try {
  await sql(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('test.jwt',true),''),'{}')::jsonb $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;`);
  const migrationFiles=readdirSync('supabase/migrations').filter(file=>file.endsWith('.sql')).sort();
  if(process.argv.includes('--m2'))await sql(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.sub',true),''),NULLIF(current_setting('test.uid',true),''))::uuid $$;
    CREATE SCHEMA storage; CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text NOT NULL,name text NOT NULL,metadata jsonb,UNIQUE(bucket_id,name));
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT USAGE ON SCHEMA storage TO authenticated,anon;GRANT INSERT,SELECT ON storage.objects TO authenticated,anon;`);
  for(const file of migrationFiles.filter(file=>file<'20261019123240_m0_stock_access_guards.sql')) {
    await execute(psql,[...base,'-d',database,'-f',join(process.cwd(),'supabase/migrations',file)],{maxBuffer:4*1024*1024});
  }
  await sql(`INSERT INTO organizations(id,name,slug) VALUES('${org}','M0 synthetic shop','m0-synthetic');
    INSERT INTO users(id,email,full_name,role,organization_id) VALUES('${owner}','owner@m0.invalid','M0 Owner','business_owner','${org}'),('${cashier}','cashier@m0.invalid','M0 Cashier','cashier','${org}'),('${platform}','platform@m0.invalid','M0 Platform','platform_owner',NULL);
    INSERT INTO merchants(organization_id,business_name,registration_number,contact_name,contact_email,business_owner_user_id)
      VALUES('${org}','M0 synthetic shop','M0-ONLY','M0 Owner','owner@m0.invalid','${owner}');
    SET "test.uid"='${platform}'; UPDATE merchants SET verification_status='verified' WHERE organization_id='${org}';
    SET "test.uid"='${owner}';
    INSERT INTO products(id,organization_id,name,sku,selling_price,cost_price) VALUES('${product}','${org}','Synthetic rice','M0-RICE',100,50),('${product2}','${org}','Synthetic beans','M0-BEANS',100,50);
    INSERT INTO warehouses(id,organization_id,name) VALUES('${warehouse}','${org}','Synthetic location');
    INSERT INTO inventory(organization_id,product_id,warehouse_id,quantity) VALUES('${org}','${product}','${warehouse}',30),('${org}','${product2}','${warehouse}',10);`);
  // Simulate a populated legacy upgrade, including an intentionally invalid
  // historical relationship. NOT VALID must preserve it for explicit repair.
  const legacyOrg='10000000-0000-0000-0000-000000000055',legacyProduct='30000000-0000-0000-0000-000000000055',legacyWarehouse='40000000-0000-0000-0000-000000000055';
  await sql(`INSERT INTO organizations(id,name,slug) VALUES('${legacyOrg}','M0 legacy relationship','m0-legacy-link');
    INSERT INTO products(id,organization_id,name,sku,selling_price,cost_price) VALUES('${legacyProduct}','${legacyOrg}','Legacy item','M0-LEGACY',100,50);
    INSERT INTO warehouses(id,organization_id,name) VALUES('${legacyWarehouse}','${legacyOrg}','Legacy location');
    INSERT INTO inventory(organization_id,product_id,warehouse_id,quantity) VALUES('${legacyOrg}','${product}','${legacyWarehouse}',0);`);
  for(const file of migrationFiles.filter(file=>file>='20261019123240_m0_stock_access_guards.sql')) {
    await execute(psql,[...base,'-d',database,'-f',join(process.cwd(),'supabase/migrations',file)],{maxBuffer:4*1024*1024});
  }
  await check('populated upgrade retains balances and historical violations without rewriting them',async()=>{
    assert.equal(await quantity(),30);
    assert.equal(await sql(`SELECT count(*) FROM inventory WHERE organization_id='${legacyOrg}' AND product_id='${product}' AND quantity=0`),'1');
    await assert.rejects(()=>sql(`INSERT INTO inventory(organization_id,product_id,warehouse_id,quantity) VALUES('${org}','${legacyProduct}','${warehouse}',0)`,owner),/inventory_product_tenant_fk/);
  });
  await check('disabled by default and no partial effects',async()=>{
    const command=receipt(); await assert.rejects(()=>rpc(command),/disabled/);
    assert.equal(await sql(`SELECT count(*) FROM sales WHERE id=${quote(command.sale.id)}`),'0');
    await sql('UPDATE track_private.stock_command_settings SET enabled=true');
  });
  await check('concurrent cashier checkouts and duplicate replay',async()=>{
    const first=receipt(), second=receipt(); const before=await quantity();
    const [a]=await Promise.all([rpc(first),rpc(second)]);
    assert.equal(await quantity(),before-2); assert.equal(await rpc(first),a);
    assert.equal(await quantity(),before-2);
    assert.equal(await sql(`SELECT count(*) FROM inventory_movements WHERE original_device_timestamp IN (${quote(first.sale.created_at)},${quote(second.sale.created_at)}) AND reference_type='inventory_ledger'`),'2');
    first.sale.notes='Changed after approval'; await assert.rejects(()=>rpc(first),/differs/);
  });
  await check('all-line rollback and validation',async()=>{
    const command=receipt(), before=await quantity();
    command.items.push({...command.items[0],id:randomUUID(),product_id:product2,quantity:999,total:99900});
    command.sale.subtotal=command.sale.total=100000;
    await assert.rejects(()=>rpc(command),/Insufficient stock/);
    assert.equal(await quantity(),before);
    assert.equal(await sql(`SELECT count(*) FROM sales WHERE id=${quote(command.sale.id)}`),'0');
    assert.equal(await sql(`SELECT count(*) FROM sale_items WHERE sale_id=${quote(command.sale.id)}`),'0');
    const invalid=receipt(); invalid.sale.total=1; await assert.rejects(()=>rpc(invalid),/amounts/);
    const price=receipt(); price.items[0].unit_price=price.items[0].total=90; price.sale.subtotal=price.sale.total=90;
    await assert.rejects(()=>rpc(price),/Manager approval/);
  });
  await check('suspension, foreign location and anonymous invocation',async()=>{
    await sql(`SET "test.uid"='${platform}'; UPDATE users SET status='suspended' WHERE id='${cashier}'`);
    await assert.rejects(()=>rpc(receipt()),/Active business user/);
    assert.equal(await sql('SELECT count(*) FROM users',cashier),'0');
    assert.equal(await sql('SELECT count(*) FROM v_merchant_summary',cashier),'0');
    await sql(`SET "test.uid"='${platform}'; UPDATE users SET status='active' WHERE id='${cashier}'`);
    const invalid=receipt(); invalid.sale.warehouse_id=randomUUID(); await assert.rejects(()=>rpc(invalid),/location/);
    await assert.rejects(()=>sql(`SET ROLE anon; SELECT public.post_pos_checkout('{}')`),/permission denied/);
  });
  await check('legacy missing lines and missing stock effects reconcile once',async()=>{
    const command=receipt(), before=await quantity();
    command.items.push({...command.items[0],id:randomUUID(),product_id:product2}); command.sale.subtotal=command.sale.total=200;
    await legacy(command);
    await assert.rejects(()=>rpc(command),/explicit reconciliation/);
    await rpc(command,true); await rpc(command,true);
    assert.equal(await quantity(),before-1);
    assert.equal(await sql(`SELECT count(*) FROM sale_items WHERE sale_id=${quote(command.sale.id)}`),'2');
  });
  await check('legacy committed stock acknowledgment loss is not applied twice',async()=>{
    const command=receipt(), before=await quantity(); await legacy(command,true);
    assert.equal(await quantity(),before-1); await rpc(command,true); assert.equal(await quantity(),before-1);
  });
  await check('timestamp collisions and unknown ledger effects fail closed',async()=>{
    const command=receipt(); await rpc(command);
    const collision=receipt(); collision.sale.created_at=command.sale.created_at;
    await assert.rejects(()=>rpc(collision),/Ambiguous sale timestamp/);
    const ambiguous=receipt(); await legacy(ambiguous);
    await sql(`UPDATE inventory SET quantity=quantity-2,original_device_timestamp=${quote(ambiguous.sale.created_at)} WHERE product_id='${product}' AND warehouse_id='${warehouse}'`,owner);
    await assert.rejects(()=>rpc(ambiguous,true),/Ambiguous stock history/);
  });
  await check('legacy recovery cannot post missing effects after a financial reversal',async()=>{
    const command=receipt();await legacy(command,true);
    await sql(`SELECT public.reverse_financial_sale(${quote(command.sale.id)},'refund','Synthetic refund before recovery')`,owner);
    const before=await quantity();await assert.rejects(()=>rpc(command,true),/Reversed receipt/);assert.equal(await quantity(),before);
  });
  await check('real multi-connection row locking preserves concurrent delivery increment',async()=>{
    const before=await quantity();
    const release=await holdInventoryRow();
    const checkout=rpc(receipt());
    const delivery=sql(`UPDATE inventory SET quantity=quantity+5,original_device_timestamp=NULL WHERE product_id='${product}'`,owner,'m0-delivery');
    void checkout.catch(()=>{});void delivery.catch(()=>{});
    let blocked=false;
    try {for(let attempt=0;attempt<60;attempt++) {
      if(Number(await sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'"))>=2) {blocked=true;break;}
      await new Promise(resolve=>setTimeout(resolve,100));
    }} finally {await release();}
    await Promise.all([checkout,delivery]); assert.equal(blocked,true,'Both independent writers must wait on the held row');
    assert.equal(await quantity(),before+4);
  });
  await check('legacy grants, views, audit policies and tenant constraints',async()=>{
    assert.equal(await sql(`SELECT count(*) FROM audit_logs`,cashier),'0');
    await assert.rejects(()=>sql(`INSERT INTO audit_logs(action,resource_type) VALUES('forged','inventory')`,cashier),/permission denied/);
    await assert.rejects(()=>sql('SELECT * FROM offline_sync_queue',cashier),/permission denied/);
    await assert.rejects(()=>sql('UPDATE invoices SET amount=0',cashier),/permission denied/);
    assert.equal(await sql("SELECT count(*) FROM pg_class WHERE relname IN ('v_merchant_summary','v_subscription_revenue') AND 'security_invoker=true'=ANY(reloptions)"),'2');
    assert.equal(await sql("SELECT count(*) FROM v_merchant_summary",platform),'1');
    // Repair only this explicitly fabricated test violation, then validate.
    await sql(`UPDATE inventory SET product_id='${legacyProduct}' WHERE organization_id='${legacyOrg}' AND product_id='${product}' AND warehouse_id='${legacyWarehouse}'`);
    for(const constraint of ['inventory_product_tenant_fk','inventory_warehouse_tenant_fk','sales_cashier_tenant_fk','sales_warehouse_tenant_fk']) {
      await sql(`ALTER TABLE ${constraint.startsWith('inventory') ? 'inventory' : 'sales'} VALIDATE CONSTRAINT ${constraint}`);
    }
  });
  await check('manual stock delta, replay and concurrent checkout share locked inventory',async()=>{
    const command={id:randomUUID(),organization_id:org,user_id:owner,product_id:product,warehouse_id:warehouse,quantity_change:3,reason:'Synthetic received adjustment'};
    const adjust=()=>sql(`SELECT public.apply_inventory_adjustment(${quote(JSON.stringify(command))}::jsonb)`,owner);
    const before=await quantity();
    await Promise.all([adjust(),rpc(receipt())]);assert.equal(await quantity(),before+2);
    await adjust();assert.equal(await quantity(),before+2);
    command.quantity_change=4;await assert.rejects(adjust,/differs/);
    command.id=randomUUID();command.quantity_change=-999;await assert.rejects(adjust,/insufficient stock/);
    command.id=randomUUID();command.quantity_change=1;
    await assert.rejects(()=>sql(`SELECT public.apply_inventory_adjustment(${quote(JSON.stringify(command))}::jsonb)`,cashier),/manager/);
  });
  await check('atomic transfer receipt, duplicate replay, checkout concurrency and cancellation',async()=>{
    const destination=randomUUID();
    await sql(`INSERT INTO warehouses(id,organization_id,name) VALUES('${destination}','${org}','M0 destination')`);
    const create=async(qty=2,to=destination)=>{
      const id=randomUUID();
      await sql(`INSERT INTO warehouse_transfers(id,organization_id,from_warehouse_id,to_warehouse_id,product_id,quantity,sent_by) VALUES('${id}','${org}','${warehouse}','${to}','${product}',${qty},'${owner}')`,owner);
      return id;
    };
    const finish=(id,status='received',actor=owner)=>sql(`SELECT public.complete_warehouse_transfer('${id}','${status}')`,actor);
    const before=await quantity(),id=await create();
    // Hold the source so both writers pause before inventory. A transfer that
    // inserts its destination first would hold the audit counter and invert
    // checkout's inventory -> counter order, producing an intermittent deadlock.
    const release=await holdInventoryRow();
    const completion=finish(id),duplicate=finish(id),checkout=rpc(receipt());
    for(const pending of [completion,duplicate,checkout])void pending.catch(()=>{});
    let blocked=false;
    try{
      for(let attempt=0;attempt<60;attempt++){
        if(Number(await sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'"))>=3){blocked=true;break;}
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert.equal(blocked,true,'Transfer, duplicate and checkout must wait on held locks');
      await sql(`BEGIN;SELECT organization_id FROM accounting_counters WHERE organization_id='${org}' FOR UPDATE NOWAIT;ROLLBACK;`);
    }finally{await release();}
    await Promise.all([completion,duplicate,checkout]);
    assert.equal(await quantity(),before-3);
    assert.equal(await sql(`SELECT quantity FROM inventory WHERE warehouse_id='${destination}' AND product_id='${product}'`),'2');
    await finish(id);assert.equal(await quantity(),before-3);
    await assert.rejects(()=>finish(id,'cancelled'),/finalized/);
    const failed=await create(999);await assert.rejects(()=>finish(failed),/Insufficient/);
    assert.equal(await quantity(),before-3);
    assert.equal(await sql(`SELECT status FROM warehouse_transfers WHERE id='${failed}'`),'pending');
    await finish(failed,'cancelled');await finish(failed,'cancelled');
    await assert.rejects(()=>sql(`UPDATE warehouse_transfers SET status='received' WHERE id='${failed}'`,owner),/permission denied/);
    await assert.rejects(()=>create(1,warehouse),/Valid pending transfer/);
    await assert.rejects(()=>create(1,randomUUID()),/Valid pending transfer/);
    await assert.rejects(()=>finish(id,'received',cashier),/manager/);
    await assert.rejects(()=>sql(`SET ROLE anon; SELECT public.complete_warehouse_transfer('${id}','received')`),/permission denied/);
    const legacy=await create();await sql(`UPDATE warehouse_transfers SET stock_command_version=NULL WHERE id='${legacy}'`);
    await assert.rejects(()=>finish(legacy),/Legacy transfer requires/);
    assert.equal(await quantity(),before-3);
  });
  if(process.argv.includes('--m1')||process.argv.includes('--m2')) {
    const {verifyManualIntake}=await import('./verify-m1-postgres.mjs');
    await verifyManualIntake({sql,rpc,receipt,quantity,org,owner,cashier,platform,product,product2,warehouse});
  }
  if(process.argv.includes('--m2')){
    const {verifySpreadsheetIntake}=await import('./verify-m2-postgres.mjs');
    const {createLocalIntakeSql}=await import('./local-intake-sql.mjs');
    await verifySpreadsheetIntake({sql:createLocalIntakeSql({host:'127.0.0.1',user:'m0_test',database,port},psql),org,owner,cashier,platform,product,warehouse});
  }
  mkdirSync('build-evidence/m0',{recursive:true});
  writeFileSync('build-evidence/m0/postgres-result.json',JSON.stringify({generatedAt:new Date().toISOString(),version:await sql('SELECT version()'),synthetic:true,results},null,2)+'\n');
  if(process.env.M0_KEEP_DB==='true') {
    mkdirSync('.m0-local',{recursive:true}); writeFileSync('.m0-local/active-target.json',JSON.stringify({database,port,host:'127.0.0.1',user:'m0_test'}));
  }
} finally {
  if(process.env.M0_KEEP_DB!=='true') execFileSync(psql,[...base,'-d','postgres','-c',`DROP DATABASE ${database} WITH (FORCE)`],{stdio:'pipe'});
}
