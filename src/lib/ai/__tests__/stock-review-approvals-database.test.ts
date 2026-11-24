import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { approvalSchema, executionSchema, reviewSnapshotSchema, selectionSchema, serverReviewSchema,
  type ReviewRowInput, type StockApproval, type StockSelection } from '@/lib/ai/stock-review-contract';

const org = '10000000-0000-0000-0000-000000000001';
const owner = '20000000-0000-0000-0000-000000000001';
const admin = '20000000-0000-0000-0000-000000000002';
const cashier = '20000000-0000-0000-0000-000000000003';
const foreignOwner = '20000000-0000-0000-0000-000000000004';
const product = '30000000-0000-0000-0000-000000000001';
const product2 = '30000000-0000-0000-0000-000000000002';
const foreignProduct = '30000000-0000-0000-0000-000000000003';
const warehouse = '40000000-0000-0000-0000-000000000001';
const annex = '40000000-0000-0000-0000-000000000002';
const foreignWarehouse = '40000000-0000-0000-0000-000000000003';
const job = '50000000-0000-0000-0000-000000000001';
let db: PGlite;

const row = (index = 0, patch: Partial<ReviewRowInput> = {}): ReviewRowInput => ({
  row_index: index, mode: 'existing', product_id: index === 0 ? product : product2,
  warehouse_id: warehouse, quantity: '2', unit_cost: '150.00', zero_confirmed: false,
  name: index === 0 ? 'Rice' : 'Oil', sku: index === 0 ? 'RICE' : 'OIL', stock_unit: index === 0 ? 'bag' : 'bottle',
  selling_price: null, ...patch,
});
const newRow = (index = 0, patch: Partial<ReviewRowInput> = {}) => row(index, {
  mode: 'new', product_id: null, name: `New ${index}`, sku: `NEW-${index}`, stock_unit: 'piece', selling_price: '250.00', ...patch,
});

// Savepoints let negative RPC assertions preserve the outer fixture transaction.
// Arguments are bound parameters; function names below are static test choices.
async function rpc(name: string, args: unknown[] = []): Promise<unknown> {
  await db.exec('SAVEPOINT stock_test_call; SET LOCAL ROLE authenticated;');
  try {
    const result = await db.query<{ value: unknown }>(`SELECT public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) AS value`, args);
    await db.exec('RESET ROLE; RELEASE SAVEPOINT stock_test_call;');
    return result.rows[0].value;
  } catch (error) {
    await db.exec('ROLLBACK TO SAVEPOINT stock_test_call; RELEASE SAVEPOINT stock_test_call; RESET ROLE;');
    throw error;
  }
}

async function makeJob(count = 1, purpose: 'stock_intake' | 'po_compare' = 'stock_intake', content = 'Rice,2,150.00') {
  const mapped = Array.from({ length: count }, (_, index) => ({ name: index === 0 ? 'Rice' : 'Oil' }));
  await db.query(`INSERT INTO public.ai_jobs(id,organization_id,user_id,kind,result) VALUES($1,$2,$3,'inventory',$4::jsonb)`,
    [job, org, owner, JSON.stringify({ rows: mapped })]);
  await rpc('attach_ai_stock_source', [job, 'csv', content, { purpose, file_name: 'private-source.csv' }]);
  await rpc('finish_ai_job', [job, { rows: mapped }, false]);
}
async function save(rows: ReviewRowInput[], revision: number | null = null) {
  return serverReviewSchema.parse(await rpc('save_ai_stock_review', [job, revision, rows]));
}
async function preview(indices = [0], revision = 1) {
  return selectionSchema.parse(await rpc('preview_ai_stock_selection', [job, revision, indices, true]));
}
async function approve(selection: StockSelection) {
  return approvalSchema.parse(await rpc('approve_ai_stock_selection', [job, selection.selection_id, selection.revision, selection.review_digest]));
}
async function execute(approval: StockApproval, index = 0) {
  return executionSchema.parse(await rpc('execute_ai_stock_selection_row', [job, approval.approval_id, index]));
}
async function snapshot() { return reviewSnapshotSchema.parse(await rpc('get_ai_stock_review', [job])); }
async function count(table: 'ai_stock_receipts' | 'product_cost_history' | 'inventory_movements') {
  return Number((await db.query<{ count: string }>(`SELECT count(*) FROM public.${table}`)).rows[0].count);
}
async function expire(selection: StockSelection) {
  // Controlled clock fixture, deliberately bypassing the immutable-payload
  // trigger as the disposable database administrator. No production TTL default.
  await db.exec('ALTER TABLE public.ai_stock_review_selections DISABLE TRIGGER stock_selection_immutable;');
  try { await db.query(`UPDATE public.ai_stock_review_selections SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`, [selection.selection_id]); }
  finally { await db.exec('ALTER TABLE public.ai_stock_review_selections ENABLE TRIGGER stock_selection_immutable;'); }
}

beforeAll(async () => {
  db = new PGlite({ extensions: { uuid_ossp } });
  await db.exec(readFileSync('src/lib/ai/__tests__/fixtures/stock-review-bootstrap.sql', 'utf8'));
  // The real domain helpers are required: do not substitute a fake receipt.
  for (const migration of ['20261108090000_purchase_cost_history.sql', '20261108160000_ai_owner_access.sql',
    '20261115120000_ai_stock_intake_receipts.sql', '20261115130000_ai_new_product_intake.sql',
    '20261116080912_ai_stock_review_approvals.sql']) {
    if (migration === '20261116080912_ai_stock_review_approvals.sql') {
      await db.exec('GRANT ALL ON public.ai_jobs,public.ai_stock_receipts TO authenticated,anon;');
    }
    await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
  }
}, 120000);
beforeEach(async () => { await db.exec(`BEGIN; SELECT set_config('test.uid','${owner}',false);`); });
afterEach(async () => { await db.exec('RESET ROLE; ROLLBACK;'); });
afterAll(async () => { await db?.close(); });

it('keeps the immutable original private, hashes exact submitted bytes and redacts source audit copies', async () => {
  const content = 'Rice,2,150.00\n=DO_NOT_EXECUTE("private source")';
  await makeJob(1, 'stock_intake', content);
  const restored = await snapshot();
  expect(restored.source).toEqual({ kind: 'csv', text: content, evidence_available: true,
    hash: createHash('sha256').update(content).digest('hex'), byte_length: Buffer.byteLength(content) });
  const audit = await db.query<{ text: string }>('SELECT coalesce(old_values,\'{}\')::text || coalesce(new_values,\'{}\')::text AS text FROM public.audit_logs');
  expect(audit.rows.every(item => !item.text.includes('DO_NOT_EXECUTE') && !item.text.includes('private-source.csv') && !item.text.includes('source_text'))).toBe(true);
  await db.exec('SAVEPOINT source_change;');
  try { await expect(db.query(`UPDATE public.ai_jobs SET source_text='substituted' WHERE id=$1`, [job])).rejects.toThrow('immutable'); }
  finally { await db.exec('ROLLBACK TO SAVEPOINT source_change; RELEASE SAVEPOINT source_change;'); }
});

it('returns strict saved revisions and cross-device snapshots without executing selected rows', async () => {
  await makeJob(2);
  const draft = await save([row(), row(1, { product_id: null, quantity: null, unit_cost: null })]);
  expect(draft.revision).toBe(1);
  const selected = await preview();
  expect(selected.groups[0]).toMatchObject({ quantity: 2, unit_cost_minor: '15000', cost_after_minor: '10833', stock_before: 10, stock_after: 12 });
  expect(await count('ai_stock_receipts')).toBe(0);
  expect((await snapshot()).review).toEqual(draft);
  const discovered = reviewSnapshotSchema.parse(await rpc('get_ai_stock_review'));
  expect(discovered.job).toBe(job);
});

it('retains only media fingerprints and excludes voice transcripts from both job and suggestion audits', async () => {
  await db.query(`INSERT INTO public.ai_jobs(id,organization_id,user_id,kind) VALUES($1,$2,$3,'inventory')`, [job, org, owner]);
  const content = 'data:audio/webm;base64,cHJpdmF0ZQ==';
  await rpc('attach_ai_stock_source', [job, 'audio', content, { purpose: 'stock_intake' }]);
  await rpc('finish_ai_job', [job, { rows: [{ name: 'Rice' }], transcript: 'private voice original' }, false]);
  expect((await snapshot()).source).toMatchObject({ kind: 'audio', text: null, evidence_available: false,
    hash: createHash('sha256').update(content).digest('hex') });
  const audits = await db.query<{ text: string }>(`SELECT coalesce(old_values,'{}')::text || coalesce(new_values,'{}')::text AS text FROM public.audit_logs`);
  expect(audits.rows.every(item => !item.text.includes('private voice original') && !item.text.includes(content))).toBe(true);
});

it('requires server selection approval for raw existing and new-product writes and revokes private writer grants', async () => {
  await makeJob();
  await expect(rpc('apply_ai_stock_receipt', [job, 0, product, warehouse, 2, 150])).rejects.toThrow('APPROVAL_REQUIRED');
  await expect(rpc('apply_ai_new_product_receipt', [job, 0, 'New', 'NEW', 'piece', 200, warehouse, 2, 150])).rejects.toThrow('APPROVAL_REQUIRED');
  const grants = await db.query<{ private_write: boolean; table_write: boolean }>(`SELECT
    has_function_privilege('authenticated','track_private.apply_ai_stock_receipt_base(uuid,integer,uuid,uuid,integer,numeric)','EXECUTE') AS private_write,
    has_table_privilege('authenticated','public.ai_stock_review_revisions','INSERT') AS table_write`);
  expect(grants.rows[0]).toEqual({ private_write: false, table_write: false });
  expect(await count('ai_stock_receipts')).toBe(0);
});

it('executes the reviewed receipt once with matching stock, average, history, audit and operation provenance', async () => {
  await makeJob(); await save([row()]);
  const selected = await preview(); const approved = await approve(selected);
  const first = await execute(approved); expect(first.status).toBe('completed');
  expect(await execute(approved)).toEqual(first);
  expect(await count('ai_stock_receipts')).toBe(1);
  expect(await count('product_cost_history')).toBe(1);
  expect(await count('inventory_movements')).toBe(1);
  const state = await db.query<{ quantity: number; cost_price: string }>(`SELECT i.quantity,p.cost_price FROM public.inventory i JOIN public.products p ON p.id=i.product_id WHERE p.id=$1`, [product]);
  expect(state.rows[0]).toEqual({ quantity: 12, cost_price: '108.33' });
  const receipt = await db.query<{ operation_id: string; approval_id: string; review_digest: string }>('SELECT operation_id,approval_id,review_digest FROM public.ai_stock_receipts');
  expect(receipt.rows[0]).toMatchObject({ operation_id: selected.groups[0].operation_id, approval_id: approved.approval_id, review_digest: selected.review_digest });
  const restored = await snapshot(); expect(restored.operations[0].result).toEqual(first);
  expect((await db.query(`SELECT id FROM public.audit_logs WHERE action='AI_APPROVAL'`)).rows).toHaveLength(1);
  expect((await db.query(`SELECT id FROM public.audit_logs WHERE action='AI_EXECUTED'`)).rows).toHaveLength(1);
});

it('rejects forged digest/revision, stale-tab writes and selection without physical receipt confirmation', async () => {
  await makeJob(); await save([row()]); const selected = await preview();
  await expect(rpc('approve_ai_stock_selection', [job, selected.selection_id, 1, '0'.repeat(64)])).rejects.toThrow('SELECTION_MISMATCH');
  await expect(rpc('approve_ai_stock_selection', [job, selected.selection_id, 2, selected.review_digest])).rejects.toThrow('SELECTION_MISMATCH');
  await expect(rpc('save_ai_stock_review', [job, null, [row()]])).rejects.toThrow('REVISION_CONFLICT');
  await expect(rpc('preview_ai_stock_selection', [job, 1, [0], false])).rejects.toThrow('REVIEW_NOT_READY');
  expect(await count('ai_stock_receipts')).toBe(0);
});

it.each([
  ['quantity', { quantity: '1.5' }], ['blank cost', { unit_cost: '' }], ['unknown cost', { unit_cost: null }],
  ['fractional cents', { unit_cost: '0.123' }], ['negative', { unit_cost: '-1' }], ['overflow', { quantity: '2147483648' }],
  ['unconfirmed zero', { unit_cost: '0.00', zero_confirmed: false }],
] satisfies Array<[string, Partial<ReviewRowInput>]>)('stores unresolved draft but holds %s', async (_label, patch) => {
  await makeJob(); await save([row(0, patch)]);
  await expect(preview()).rejects.toThrow('REVIEW_NOT_READY');
  expect(await count('ai_stock_receipts')).toBe(0);
});

it('supports explicitly confirmed free incoming stock without coercing missing cost', async () => {
  await makeJob(); await save([row(0, { unit_cost: '0.00', zero_confirmed: true })]);
  const selected = await preview(); expect(selected.groups[0].cost_kind).toBe('free');
  expect((await execute(await approve(selected))).status).toBe('completed');
});

it.each([
  ['product name', `UPDATE public.products SET name='Changed' WHERE id='${product}'`],
  ['unit', `UPDATE public.products SET stock_unit='piece' WHERE id='${product}'`],
  ['cost', `UPDATE public.products SET cost_price=101 WHERE id='${product}'`],
  ['warehouse', `UPDATE public.warehouses SET name='Changed' WHERE id='${warehouse}'`],
  ['stock', `UPDATE public.inventory SET quantity=11 WHERE product_id='${product}'`],
  ['new stock location', `INSERT INTO public.inventory(organization_id,product_id,warehouse_id,quantity) VALUES('${org}','${product}','${annex}',5)`],
])('returns durable no-effect after changed %s', async (_label, change) => {
  await makeJob(); await save([row()]); const approved = await approve(await preview());
  await db.exec(change);
  const result = await execute(approved);
  expect(result).toMatchObject({ status: 'no_effect', code: 'STALE_DEPENDENCIES' });
  expect(await execute(approved)).toEqual(result);
  expect((await snapshot()).operations[0].result).toEqual(result);
  expect(await count('ai_stock_receipts')).toBe(0);
});

it('uses all locations in average-cost preview while showing destination stock separately', async () => {
  await db.query(`INSERT INTO public.inventory(organization_id,product_id,warehouse_id,quantity) VALUES($1,$2,$3,10)`, [org, product, annex]);
  await makeJob(); await save([row()]); const selected = await preview();
  expect(selected.groups[0]).toMatchObject({ stock_before: 10, stock_after: 12, cost_after_minor: '10455' });
  expect(await execute(await approve(selected))).toMatchObject({ status: 'completed', average_cost: 104.55 });
});

it('requires an explicitly configured bounded expiry and does not invent a default', async () => {
  await makeJob(); await save([row()]);
  await db.query(`UPDATE public.organizations SET settings='{}' WHERE id=$1`, [org]);
  await expect(preview()).rejects.toThrow('APPROVAL_POLICY_NOT_CONFIGURED');
});

it('does not execute expired approvals, projects terminal expiry, and safely closes them', async () => {
  await makeJob(); await save([row()]); const selected = await preview(); const approved = await approve(selected);
  await expect(rpc('close_ai_stock_review', [job, 1])).rejects.toThrow('UNRESOLVED_OPERATIONS');
  await expire(selected);
  expect((await snapshot()).operations[0]).toMatchObject({ status: 'no_effect', result: { code: 'APPROVAL_EXPIRED' } });
  expect(await execute(approved)).toMatchObject({ status: 'no_effect', code: 'APPROVAL_EXPIRED' });
  await rpc('close_ai_stock_review', [job, 1]); expect(await rpc('get_ai_stock_review')).toBeNull();
  expect(await count('ai_stock_receipts')).toBe(0);
});

it('recovers completed effects after expiry and entitlement loss without another write', async () => {
  await makeJob(); await save([row()]); const selected = await preview(); const approved = await approve(selected);
  const completed = await execute(approved); await expire(selected);
  await db.query(`UPDATE public.subscriptions SET status='expired' WHERE organization_id=$1`, [org]);
  expect(await execute(approved)).toEqual(completed);
  expect((await snapshot()).operations[0].status).toBe('completed');
  expect(Number(await rpc('apply_ai_stock_receipt', [job, 0, product, warehouse, 2, 150]))).toBe(108.33);
  await expect(save([row()], 1)).rejects.toThrow('AI requires');
  expect(await count('ai_stock_receipts')).toBe(1);
});

it('preserves successful independent groups while a changed group fails and is repaired under the same receipt identity', async () => {
  await makeJob(2); await save([row(), row(1)]); const selected = await preview([0, 1]); const approved = await approve(selected);
  expect((await execute(approved)).status).toBe('completed');
  await db.query(`UPDATE public.products SET cost_price=120 WHERE id=$1`, [product2]);
  expect(await execute(approved, 1)).toMatchObject({ status: 'no_effect', code: 'STALE_DEPENDENCIES' });
  await save([row(), row(1, { quantity: '3' })], 1);
  const repaired = await preview([1], 2); expect(repaired.groups[0].receipt_id).toBe(selected.groups[1].receipt_id);
  expect(repaired.groups[0].operation_id).not.toBe(selected.groups[1].operation_id);
  expect((await execute(await approve(repaired), 1)).status).toBe('completed');
  await expect(save([row(0, { quantity: '9' }), row(1, { quantity: '3' })], 2)).rejects.toThrow('COMPLETED_ROW_IMMUTABLE');
  expect(await count('ai_stock_receipts')).toBe(2);
});

it('invalidates older unexecuted selections before delayed execution after a correction', async () => {
  await makeJob(); await save([row()]); const oldSelection = await preview(); const approved = await approve(oldSelection);
  await save([row(0, { quantity: '3' })], 1);
  expect(await execute(approved)).toMatchObject({ status: 'no_effect', code: 'STALE_REVISION' });
  expect((await execute(await approve(await preview([0], 2)))).status).toBe('completed');
  expect(await count('ai_stock_receipts')).toBe(1);
});

it('can repair and complete before the old client checks status, without confusing the old and new effects', async () => {
  await makeJob(); await save([row()]); const oldApproval = await approve(await preview());
  await save([row(0, { quantity: '3' })], 1);
  const repairedApproval = await approve(await preview([0], 2));
  expect((await execute(repairedApproval)).status).toBe('completed');
  const operations = (await snapshot()).operations;
  expect(operations.find(operation => operation.approval_id === repairedApproval.approval_id)?.status).toBe('completed');
  expect(operations.find(operation => operation.approval_id === oldApproval.approval_id)?.status).toBe('no_effect');
  expect(await execute(oldApproval)).toMatchObject({ status: 'no_effect', code: 'STALE_REVISION' });
  expect(await count('ai_stock_receipts')).toBe(1);
});

it('returns every approved operation so an older device can resolve its exact superseded selection', async () => {
  await makeJob(); await save([row()]); const oldSelection = await preview(); await approve(oldSelection);
  await save([row(0, { quantity: '3' })], 1); const newSelection = await preview([0], 2); await approve(newSelection);
  const operations = (await snapshot()).operations;
  expect(operations).toHaveLength(2);
  expect(operations.find(operation => operation.selection_id === oldSelection.selection_id)).toMatchObject({ status: 'no_effect', result: { code: 'STALE_REVISION' } });
  expect(operations.find(operation => operation.selection_id === newSelection.selection_id)).toMatchObject({ status: 'approved', result: null });
});

it('creates independent new products atomically without catalog-count invalidation', async () => {
  await makeJob(2); await save([newRow(), newRow(1)]); const selected = await preview([0, 1]); const approved = await approve(selected);
  expect((await execute(approved)).status).toBe('completed');
  expect((await execute(approved, 1)).status).toBe('completed');
  expect(await count('ai_stock_receipts')).toBe(2);
  const products = await db.query(`SELECT id FROM public.products WHERE sku IN ('NEW-0','NEW-1')`);
  expect(products.rows).toHaveLength(2);
});

it('rolls back a newly created product together with stock/history when its domain receipt fails', async () => {
  await makeJob(); await save([newRow(0, { unit_cost: '901.00' })]); const approved = await approve(await preview());
  await db.exec(`ALTER TABLE public.product_cost_history ADD CONSTRAINT test_domain_receipt_failure CHECK(unit_cost<>901);`);
  expect(await execute(approved)).toMatchObject({ status: 'no_effect', code: 'BUSINESS_RULE_REJECTED' });
  expect((await db.query(`SELECT id FROM public.products WHERE sku='NEW-0'`)).rows).toHaveLength(0);
  expect(await count('ai_stock_receipts')).toBe(0); expect(await count('product_cost_history')).toBe(0);
  expect(await count('inventory_movements')).toBe(0);
});

it('holds duplicate existing product lines instead of silently combining their effects', async () => {
  await makeJob(2); await save([row(), row(1, { product_id: product })]);
  await expect(preview()).rejects.toThrow('DUPLICATE_PRODUCT_ROWS');
});

it.each([admin, cashier, foreignOwner])('denies a non-owning or non-Owner actor %s', async actor => {
  await makeJob(); await save([row()]); const approved = await approve(await preview());
  await db.query(`SELECT set_config('test.uid',$1,false)`, [actor]);
  await expect(rpc('get_ai_stock_review', [job])).rejects.toThrow(/FORBIDDEN|NOT_FOUND/);
  await expect(execute(approved)).rejects.toThrow(/FORBIDDEN|NOT_FOUND/);
  expect(await count('ai_stock_receipts')).toBe(0);
});

it('blocks role/status/entitlement revocation before first execution while retaining current authorized result reads', async () => {
  await makeJob(); await save([row()]); const approved = await approve(await preview());
  await db.query(`UPDATE public.users SET status='suspended' WHERE id=$1`, [owner]);
  await expect(execute(approved)).rejects.toThrow('FORBIDDEN');
  await db.query(`UPDATE public.users SET status='active' WHERE id=$1`, [owner]);
  await db.query(`UPDATE public.subscriptions SET status='expired' WHERE organization_id=$1`, [org]);
  await expect(execute(approved)).rejects.toThrow('AI requires');
  expect((await snapshot()).operations[0].status).toBe('approved');
  expect(await count('ai_stock_receipts')).toBe(0);
});

it.each([{ product_id: foreignProduct }, { warehouse_id: foreignWarehouse }])('denies foreign nested resource %j', async patch => {
  await makeJob(); await save([row(0, patch)]); await expect(preview()).rejects.toThrow('REVIEW_NOT_READY');
});

it('does not discover PO-comparison jobs as stock-intake work', async () => {
  await makeJob(1, 'po_compare'); expect(await rpc('get_ai_stock_review')).toBeNull();
  await expect(snapshot()).rejects.toThrow('NOT_FOUND');
});

it('rejects actor fields in stored row shapes and refuses direct source/table writes', async () => {
  await makeJob(); await expect(rpc('save_ai_stock_review', [job, null, [{ ...row(), owner_id: foreignOwner }]])).rejects.toThrow('INVALID');
  await db.exec('SAVEPOINT direct_write; SET LOCAL ROLE authenticated;');
  try { await expect(db.exec(`UPDATE public.ai_jobs SET source_text='changed' WHERE id='${job}'`)).rejects.toThrow('permission denied'); }
  finally { await db.exec('ROLLBACK TO SAVEPOINT direct_write; RELEASE SAVEPOINT direct_write; RESET ROLE;'); }
});

it('applies active Owner and original-approver isolation to direct receipt SELECT and cleans broad default grants', async () => {
  await makeJob(); await save([row()]); await execute(await approve(await preview()));
  const readDirect = async () => {
    await db.exec('SET LOCAL ROLE authenticated;');
    try { return (await db.query('SELECT id FROM public.ai_stock_receipts')).rows.length; }
    finally { await db.exec('RESET ROLE;'); }
  };
  expect(await readDirect()).toBe(1);
  await db.query(`UPDATE public.users SET role='cashier' WHERE id=$1`, [owner]); expect(await readDirect()).toBe(0);
  await db.query(`UPDATE public.users SET role='business_owner',status='suspended' WHERE id=$1`, [owner]); expect(await readDirect()).toBe(0);
  await db.query(`UPDATE public.users SET status='active' WHERE id=$1`, [owner]);
  const otherOwner = '20000000-0000-0000-0000-000000000005';
  await db.query(`INSERT INTO public.users VALUES($1,$2,'business_owner','active')`, [otherOwner, org]);
  await db.query(`SELECT set_config('test.uid',$1,false)`, [otherOwner]); expect(await readDirect()).toBe(0);
  await db.query(`SELECT set_config('test.uid',$1,false)`, [foreignOwner]); expect(await readDirect()).toBe(0);
  const grants = await db.query<{ allowed: boolean }>(`SELECT has_table_privilege('authenticated','public.ai_stock_receipts',permission) AS allowed
    FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) permission`);
  expect(grants.rows.every(grant => grant.allowed === false)).toBe(true);
});
