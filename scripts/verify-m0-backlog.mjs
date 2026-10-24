// Isolated timing proof without a test-worker startup dependency. Synthetic only.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

mkdirSync('.m0-local', { recursive: true });
await build({ stdin: { contents: "export {persistOfflineSale} from './src/lib/offline/sales'; export {getDB} from './src/lib/offline/db';", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', outfile: '.m0-local/backlog.mjs', packages: 'external' });
const { getDB, persistOfflineSale } = await import(pathToFileURL(`${process.cwd()}/.m0-local/backlog.mjs`).href);
const db = await getDB();
const results = [];
for (const status of ['pending', 'synced']) {
  for (const table of ['sales','sale_items','sync_queue','inventory']) await db.clear(table);
  await db.put('inventory', { id:'stock',organization_id:'synthetic',product_id:'product',warehouse_id:'location',quantity:100,updated_at:'2026-10-19T10:00:00.123456Z' });
  const tx = db.transaction('sync_queue','readwrite');
  const work = [];
  for (let index=0;index<30000;index++) work.push(tx.store.add({ id:`seed-${index}`,table_name:'sales',operation:'INSERT',record_id:`seed-${index}`,payload:{},status,retry_count:0,created_at:'2026-01-01T00:00:00Z' }));
  await Promise.all([...work,tx.done]);
  const started = performance.now();
  await persistOfflineSale({cashier_id:'cashier',organization_id:'synthetic',warehouse_id:'location',invoice_number:`BENCH-${status}`,
    items:[{product_id:'product',warehouse_id:'location',quantity:1,unit_price:100,cost_price:50,discount:0,total:100}],
    subtotal:100,discount:0,tax:0,total:100,amount_paid:100,change_amount:0,payment_method:'cash'});
  const elapsedMs = performance.now()-started;
  assert.ok(elapsedMs<300, `${status} backlog checkout took ${elapsedMs.toFixed(2)}ms, limit 300ms`);
  assert.equal((await db.get('inventory','stock')).quantity,99);
  assert.equal(await db.count('sales'),1);
  assert.equal(await db.count('sale_items'),1);
  assert.equal(await db.count('sync_queue'),30003);
  results.push({status,seedRows:30000,elapsedMs,limitMs:300,result:'passed'});
}
db.close();
mkdirSync('build-evidence/m0',{recursive:true});
writeFileSync('build-evidence/m0/backlog-direct-result.json',JSON.stringify({generatedAt:new Date().toISOString(),synthetic:true,results},null,2)+'\n');
console.log(JSON.stringify(results));
