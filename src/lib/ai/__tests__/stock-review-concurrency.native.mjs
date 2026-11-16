// Opt-in disposable PostgreSQL concurrency proof. No dependencies, hosted
// credentials, migration deployment, existing databases or services are changed.
// Run from the repository root after the lead creates the loopback test cluster.
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const repository = process.cwd();
const metadata = JSON.parse(await readFile(join(tmpdir(), 'tradetrack-ai-review-pg-current.json'), 'utf8'));
assert(Number.isInteger(metadata.port) && metadata.port > 1024 && metadata.port < 65536, 'Invalid disposable port');
assert(typeof metadata.dataPath === 'string' && isAbsolute(metadata.dataPath), 'Missing disposable data directory');
assert(/^tradetrack-ai-review-pg-[a-f0-9]+$/i.test(basename(metadata.dataPath)), 'Refusing an unmarked cluster');
const pathIdentity = value => resolve(value).replaceAll('\\', '/').toLowerCase();
assert.equal(pathIdentity(dirname(metadata.dataPath)), pathIdentity(tmpdir()), 'Cluster must be in the test temp directory');
const psql = process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe' : 'psql';
const database = `tradetrack_ai_review_${process.pid}_${Date.now()}`;
assert(/^[a-z0-9_]{1,63}$/.test(database));
const owner = '20000000-0000-0000-0000-000000000001';
const org = '10000000-0000-0000-0000-000000000001';
const main = '40000000-0000-0000-0000-000000000001';
const annex = '40000000-0000-0000-0000-000000000002';
const sessions = new Set();
const evidence = [];
let created = false;
const environment = { ...process.env };
for (const name of Object.keys(environment)) if (name.startsWith('PG')) delete environment[name];
environment.PGCONNECT_TIMEOUT = '5';
const args = name => ['-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(metadata.port), '-U', 'ai_review_test', '-d', name];
async function query(sql, name = database) {
  const result = await exec(psql, [...args(name), '-c', sql], { env: environment, timeout: 20000, maxBuffer: 1024 * 1024, windowsHide: true });
  return result.stdout.trim();
}
function lastJson(output) {
  const line = output.trim().split(/\r?\n/).filter(item => item.startsWith('{') || item.startsWith('[')).at(-1);
  assert(line, `Expected a JSON result, received ${output.slice(0, 200)}`);
  return JSON.parse(line);
}
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));

class Session {
  constructor(label) {
    this.child = spawn(psql, args(database), { env: { ...environment, PGAPPNAME: `review_${label}_${randomUUID()}` }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.pending = null;
    this.exited = false;
    this.stderr = '';
    this.child.stdout.setEncoding('utf8'); this.child.stderr.setEncoding('utf8');
    this.child.stdin.on('error', error => this.fail(error));
    this.child.stdout.on('data', chunk => {
      if (!this.pending) return;
      this.pending.output += chunk;
      const marker = this.pending.output.indexOf(this.pending.marker);
      if (marker >= 0) {
        const pending = this.pending; this.pending = null; clearTimeout(pending.timer);
        pending.resolve(pending.output.slice(0, marker).trim());
      }
    });
    this.child.stderr.on('data', chunk => { this.stderr += chunk; });
    this.child.on('error', error => this.fail(error));
    this.child.on('exit', code => { this.exited = true; this.fail(new Error(`psql exited ${code}: ${this.stderr.trim()}`)); });
    sessions.add(this);
  }
  fail(error) {
    if (this.pending) { const pending = this.pending; this.pending = null; clearTimeout(pending.timer); pending.reject(error); }
  }
  run(sql) {
    assert(!this.pending, 'A psql session cannot run overlapping commands');
    if (this.exited) return Promise.reject(new Error(this.stderr || 'psql is closed'));
    return new Promise((resolveRun, reject) => {
      const marker = `__review_done_${randomUUID().replaceAll('-', '')}__`;
      const timer = setTimeout(() => { this.child.kill(); this.fail(new Error('Disposable psql command timed out')); }, 20000);
      this.pending = { resolve: resolveRun, reject, marker, output: '', timer };
      this.child.stdin.write(`${sql}\n\\echo ${marker}\n`);
    });
  }
  async ready() { this.pid = Number(await this.run("SET deadlock_timeout='100ms'; SELECT pg_backend_pid();")); assert(Number.isInteger(this.pid)); return this; }
  async close() {
    sessions.delete(this);
    if (this.exited) return;
    this.fail(new Error('Disposable session cleanup'));
    this.child.stdin.end('ROLLBACK;\n\\q\n');
    await Promise.race([new Promise(done => this.child.once('exit', done)), delay(1500)]);
    if (!this.exited) this.child.kill();
  }
}

async function blocked(waiter, blocker, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const output = await query(`SELECT jsonb_build_object('state',state,'wait_event_type',wait_event_type,
      'blockers',pg_blocking_pids(pid)) FROM pg_stat_activity WHERE pid=${waiter.pid} AND datname='${database}'`);
    if (output) {
      const state = JSON.parse(output);
      if (state.state === 'active' && state.wait_event_type === 'Lock' && state.blockers.includes(blocker.pid)) {
        evidence.push({ case: label, observation: 'pg_stat_activity lock wait', waiter: waiter.pid, blocker: blocker.pid, wait_event_type: state.wait_event_type });
        return;
      }
    }
    if (waiter.exited) throw new Error(`Waiter exited before lock proof: ${waiter.stderr}`);
    await delay(75);
  }
  throw new Error(`No PostgreSQL lock/blocker evidence for ${label}`);
}

async function prepare(label) {
  const job = randomUUID(); const product = randomUUID(); const sku = `LOCK-${randomUUID()}`;
  const output = await query(`BEGIN;
    SELECT set_config('test.uid','${owner}',true);
    INSERT INTO public.products(id,organization_id,name,sku,cost_price) VALUES('${product}','${org}','${label}','${sku}',100);
    INSERT INTO public.inventory(organization_id,product_id,warehouse_id,quantity) VALUES('${org}','${product}','${main}',10);
    INSERT INTO public.ai_jobs(id,organization_id,user_id,kind,result) VALUES('${job}','${org}','${owner}','inventory','{"rows":[{"name":"Synthetic delivery"}]}');
    SET LOCAL ROLE authenticated;
    SELECT public.attach_ai_stock_source('${job}','text','Synthetic delivery: two at 150','{"purpose":"stock_intake"}');
    SELECT public.finish_ai_job('${job}','{"rows":[{"name":"Synthetic delivery"}]}',false);
    SELECT public.save_ai_stock_review('${job}',NULL,jsonb_build_array(jsonb_build_object('row_index',0,'mode','existing',
      'product_id','${product}','warehouse_id','${main}','quantity','2','unit_cost','150.00','zero_confirmed',false,
      'name','${label}','sku','${sku}','stock_unit','piece','selling_price',NULL)));
    SELECT public.preview_ai_stock_selection('${job}',1,ARRAY[0],true);
    SELECT public.approve_ai_stock_selection('${job}',id,revision,review_digest) FROM public.ai_stock_review_selections WHERE job_id='${job}';
    COMMIT;`);
  return { job, product, approval: lastJson(output) };
}
const executionSql = fixture => `SELECT public.execute_ai_stock_selection_row('${fixture.job}','${fixture.approval.approval_id}',0);`;
const asOwner = sql => `SELECT set_config('test.uid','${owner}',false); SET ROLE authenticated; ${sql}`;
async function state(fixture) {
  return lastJson(await query(`SELECT jsonb_build_object('stock',COALESCE((SELECT sum(quantity) FROM public.inventory WHERE product_id='${fixture.product}'),0),
    'receipts',(SELECT count(*) FROM public.ai_stock_receipts WHERE job_id='${fixture.job}'),
    'history',(SELECT count(*) FROM public.product_cost_history WHERE product_id='${fixture.product}'),
    'movements',(SELECT count(*) FROM public.inventory_movements WHERE product_id='${fixture.product}'))`));
}
const settled = promise => promise.then(value => ({ ok: true, value }), error => ({ ok: false, error }));

async function manualBeforeAi(receive) {
  const label = receive ? 'manual receiving before AI' : 'manual inventory update before AI';
  const fixture = await prepare(label); const manual = await new Session('manual').ready(); const ai = await new Session('ai').ready();
  try {
    await manual.run(`BEGIN; SELECT set_config('test.uid','${owner}',true); ${receive
      ? `SET LOCAL ROLE authenticated; SELECT public.receive_stock_at_cost('${randomUUID()}','${fixture.product}','${main}',1,200,'Synthetic concurrent manual receipt');`
      : `UPDATE public.inventory SET quantity=quantity+1 WHERE product_id='${fixture.product}' AND warehouse_id='${main}';`}`);
    const pending = settled(ai.run(asOwner(executionSql(fixture))));
    await blocked(ai, manual, label); await manual.run('COMMIT;');
    const outcome = await pending; assert(outcome.ok, outcome.error?.message);
    const result = lastJson(outcome.value); assert.equal(result.status, 'no_effect'); assert.equal(result.code, 'STALE_DEPENDENCIES');
    assert.deepEqual(lastJson(await ai.run(executionSql(fixture))), result);
    assert.deepEqual(await state(fixture), { stock: 11, receipts: 0, history: receive ? 1 : 0, movements: receive ? 1 : 0 });
    evidence.push({ case: label, outcome: 'stale no-effect, same-operation replay, no AI receipt' });
  } finally { await Promise.all([manual.close(), ai.close()]); }
}

async function absentLocation() {
  const fixture = await prepare('absent location'); const ai = await new Session('parent_lock').ready();
  const insert = await new Session('new_location').ready(); const productProbe = await new Session('product_fk_probe').ready();
  try {
    const completed = lastJson(await ai.run(asOwner(`BEGIN; ${executionSql(fixture)}`)));
    assert.equal(completed.status, 'completed');
    // This separate probe isolates the exact product FK lock mode. The actual
    // INSERT below can first wait on the stronger organization parent barrier.
    const probePending = settled(productProbe.run(`SELECT id FROM public.products WHERE id='${fixture.product}' FOR KEY SHARE;`));
    const insertPending = settled(insert.run(`INSERT INTO public.inventory(organization_id,product_id,warehouse_id,quantity)
      VALUES('${org}','${fixture.product}','${annex}',5);`));
    await blocked(productProbe, ai, 'product FK KEY SHARE conflicts with AI product FOR UPDATE');
    await blocked(insert, ai, 'actual absent-location INSERT waits on AI parent locks');
    assert.equal((await state(fixture)).receipts, 0, 'Uncommitted AI result is invisible to another session');
    await ai.run('COMMIT;');
    const [probe, inserted] = await Promise.all([probePending, insertPending]); assert(probe.ok, probe.error?.message); assert(inserted.ok, inserted.error?.message);
    assert.equal(lastJson(await ai.run(executionSql(fixture))).status, 'completed');
    assert.deepEqual(await state(fixture), { stock: 17, receipts: 1, history: 1, movements: 1 });
    evidence.push({ case: 'absent location', outcome: 'both waits proved; insert resumes after AI commit; original effect replays once', limitation: 'actual INSERT may first wait on organization FK; separate product-mode probe establishes product barrier' });
  } finally { await Promise.all([ai.close(), insert.close(), productProbe.close()]); }
}

async function simultaneousRetries() {
  const fixture = await prepare('same approval retry'); const first = await new Session('first').ready(); const retry = await new Session('retry').ready();
  try {
    const original = lastJson(await first.run(asOwner(`BEGIN; ${executionSql(fixture)}`)));
    const pending = settled(retry.run(asOwner(executionSql(fixture))));
    await blocked(retry, first, 'concurrent exact approval retry'); await first.run('COMMIT;');
    const outcome = await pending; assert(outcome.ok, outcome.error?.message); assert.deepEqual(lastJson(outcome.value), original);
    assert.deepEqual(await state(fixture), { stock: 12, receipts: 1, history: 1, movements: 1 });
    evidence.push({ case: 'concurrent retries', outcome: 'identical durable result, exactly one business effect' });
  } finally { await Promise.all([first.close(), retry.close()]); }
}

async function deadlockRollback() {
  const fixture = await prepare('deadlock rollback'); const manual = await new Session('cycle_manual').ready(); const ai = await new Session('cycle_ai').ready();
  try {
    await manual.run(`BEGIN; UPDATE public.inventory SET quantity=quantity+1 WHERE product_id='${fixture.product}';`);
    const aiPending = settled(ai.run(asOwner(executionSql(fixture))));
    await blocked(ai, manual, 'AI waits on a manual inventory row before deliberate lock cycle');
    const manualPending = settled(manual.run(`SELECT id FROM public.products WHERE id='${fixture.product}' FOR KEY SHARE;`));
    const [aiOutcome, manualOutcome] = await Promise.all([aiPending, manualPending]);
    assert(!aiOutcome.ok || !manualOutcome.ok, 'Expected PostgreSQL to break the deliberately introduced cycle');
    const failure = [aiOutcome, manualOutcome].find(outcome => !outcome.ok);
    assert.match(failure.error.message, /deadlock detected/i);
    if (manualOutcome.ok) await manual.run('COMMIT;');
    if (aiOutcome.ok) {
      assert.equal(lastJson(aiOutcome.value).status, 'completed');
      assert.deepEqual(await state(fixture), { stock: 12, receipts: 1, history: 1, movements: 1 });
      evidence.push({ case: 'deadlock rollback', victim: 'manual', outcome: 'manual transaction rolled back; AI committed one complete group' });
    } else {
      assert.deepEqual(await state(fixture), { stock: 11, receipts: 0, history: 0, movements: 0 });
      const recovered = lastJson(await query(asOwner(executionSql(fixture))));
      assert.equal(recovered.status, 'no_effect'); assert.equal(recovered.code, 'STALE_DEPENDENCIES');
      assert.deepEqual(await state(fixture), { stock: 11, receipts: 0, history: 0, movements: 0 });
      evidence.push({ case: 'deadlock rollback', victim: 'AI', outcome: 'no half group; same-operation retry detected changed stock and persisted no-effect' });
    }
  } finally { await Promise.all([manual.close(), ai.close()]); }
}

try {
  const actualDirectory = await query("SELECT current_setting('data_directory')", 'postgres');
  assert.equal(pathIdentity(actualDirectory), pathIdentity(metadata.dataPath), 'Refusing a different PostgreSQL cluster');
  await query(`CREATE DATABASE ${database}`, 'postgres'); created = true;
  const files = ['src/lib/ai/__tests__/fixtures/stock-review-bootstrap.sql',
    'supabase/migrations/20261108090000_purchase_cost_history.sql', 'supabase/migrations/20261108160000_ai_owner_access.sql',
    'supabase/migrations/20261115120000_ai_stock_intake_receipts.sql', 'supabase/migrations/20261115130000_ai_new_product_intake.sql',
    'supabase/migrations/20261116080912_ai_stock_review_approvals.sql'];
  await exec(psql, [...args(database), ...files.flatMap(file => ['-f', resolve(repository, file)])],
    { env: environment, timeout: 60000, maxBuffer: 1024 * 1024, windowsHide: true });
  await manualBeforeAi(false); await manualBeforeAi(true); await absentLocation(); await simultaneousRetries(); await deadlockRollback();
  console.log(JSON.stringify({ status: 'passed', environment: 'disposable loopback PostgreSQL', evidence }, null, 2));
} finally {
  await Promise.all([...sessions].map(session => session.close()));
  if (created) await query(`DROP DATABASE ${database} WITH (FORCE)`, 'postgres');
}
