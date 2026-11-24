import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { priceChangeResultSchema } from '@/lib/ai/price-change-contract';

const org = '10000000-0000-0000-0000-000000000001';
const foreignOrg = '10000000-0000-0000-0000-000000000002';
const owner = '20000000-0000-0000-0000-000000000001';
const admin = '20000000-0000-0000-0000-000000000002';
const cashier = '20000000-0000-0000-0000-000000000003';
const foreignOwner = '20000000-0000-0000-0000-000000000004';
const product = '30000000-0000-0000-0000-000000000001';
const warehouse = '40000000-0000-0000-0000-000000000001';
const job = '50000000-0000-0000-0000-000000000001';
const approval = '80000000-0000-0000-0000-000000000001';
const operationId = '90000000-0000-0000-0000-000000000001';
const receipt = '90000000-0000-0000-0000-000000000002';
let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { uuid_ossp } });
  await db.exec(readFileSync('src/lib/ai/__tests__/fixtures/stock-review-bootstrap.sql', 'utf8'));
  await db.exec(`CREATE ROLE service_role;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.sub', true), ''),
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub',
        NULLIF(current_setting('test.uid', true), ''))::uuid
    $$;
    ALTER TABLE public.organizations ADD COLUMN currency text NOT NULL DEFAULT 'NGN';
    ALTER TABLE public.products ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp();`);
  for (const migration of ['20261108090000_purchase_cost_history.sql', '20261108160000_ai_owner_access.sql',
    '20261115120000_ai_stock_intake_receipts.sql', '20261115130000_ai_new_product_intake.sql',
    '20261116080912_ai_stock_review_approvals.sql', '20261123135156_ai_existing_product_price_approval.sql']) {
    await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
  }
}, 120000);

beforeEach(async () => {
  await db.exec('BEGIN;');
  await db.query('UPDATE public.products SET selling_price = 170 WHERE id = $1', [product]);
  await db.query(`INSERT INTO public.ai_jobs(id, organization_id, user_id, kind, status)
    VALUES ($1, $2, $3, 'inventory', 'ready')`, [job, org, owner]);
  // The earlier stock receipt suite proves execution. This fixture represents
  // one durable receipt and verifies how price review consumes its identity.
  await db.query(`INSERT INTO public.ai_stock_receipts (
      id, organization_id, job_id, row_index, approved_by, product_id, warehouse_id,
      quantity, unit_cost, average_cost, approval_id, operation_id, review_digest
    ) VALUES ($1, $2, $3, 0, $4, $5, $6, 2, 100, 100, $7, $1, $8)`,
  [receipt, org, job, owner, product, warehouse, approval, 'a'.repeat(64)]);
});
afterEach(async () => { await db.exec('RESET ROLE; ROLLBACK;'); });
afterAll(async () => { await db?.close(); });

type Input = {
  id?: string;
  actor?: string;
  tenant?: string;
  rowIndex?: number;
  amount?: number;
  digest?: string;
  role?: 'service_role' | 'authenticated';
  expiredAccess?: boolean;
};

async function call(action: 'prepare' | 'approve' | 'status', input: Input = {}) {
  await db.exec(`SAVEPOINT price_test_call; SET LOCAL ROLE ${input.role === 'authenticated' ? 'authenticated' : 'service_role'};`);
  try {
    const { rows } = await db.query<{ result: unknown }>(`SELECT public.manage_ai_price_change(
      $1::uuid, $2::uuid, $3::text, $4::uuid, $5::uuid, $6::integer, $7::bigint, $8::text,
      clock_timestamp() + CASE WHEN $9 THEN interval '-1 second' ELSE interval '1 hour' END
    ) AS result`, [
      input.actor ?? owner, input.tenant ?? org, action, input.id ?? operationId,
      action === 'prepare' ? job : null,
      action === 'prepare' ? input.rowIndex ?? 0 : null,
      action === 'prepare' ? input.amount ?? 20000 : null,
      input.digest ?? null, input.expiredAccess ?? false,
    ]);
    await db.exec('RESET ROLE; RELEASE SAVEPOINT price_test_call;');
    return priceChangeResultSchema.parse(rows[0].result);
  } catch (error) {
    await db.exec('ROLLBACK TO SAVEPOINT price_test_call; RELEASE SAVEPOINT price_test_call; RESET ROLE;');
    throw error;
  }
}

async function price() {
  return (await db.query<{ price: string }>('SELECT selling_price::text AS price FROM public.products WHERE id=$1', [product])).rows[0].price;
}

it('changes the exact price once after approval and recovers the durable outcome', async () => {
  const review = await call('prepare');
  expect(review).toMatchObject({ productId: product, oldPriceMinor: '17000', newPriceMinor: '20000', status: 'prepared' });
  expect(await call('prepare')).toEqual(review);
  expect(await price()).toBe('170.00');
  await expect(call('approve', { digest: 'b'.repeat(64) })).rejects.toThrow('PRICE_PAYLOAD_CHANGED');
  await expect(call('prepare', { amount: 20100 })).rejects.toThrow('PRICE_PAYLOAD_CHANGED');
  const result = await call('approve', { digest: review.reviewDigest });
  expect(result.status).toBe('completed');
  expect(await price()).toBe('200.00');
  expect(await call('status', { expiredAccess: true })).toEqual(result);
  expect(await call('approve', { digest: review.reviewDigest })).toEqual(result);
  expect((await db.query(`SELECT old_values, new_values, user_id, correlation_id FROM public.audit_logs
    WHERE action = 'AI_PRODUCT_PRICE_APPROVED'`)).rows).toEqual([
    { old_values: { selling_price_minor: '17000' },
      new_values: { selling_price_minor: '20000', job_id: job, receipt_id: receipt, review_digest: review.reviewDigest },
      user_id: owner, correlation_id: operationId },
  ]);
  expect((await db.query('SELECT quantity FROM public.inventory WHERE product_id=$1', [product])).rows).toEqual([{ quantity: 10 }]);
});

it('rejects a stale price or an expired review without overwriting stock or price', async () => {
  const review = await call('prepare');
  await db.query('UPDATE public.products SET selling_price = 185 WHERE id=$1', [product]);
  expect((await call('approve', { digest: review.reviewDigest })).status).toBe('conflict');
  expect(await price()).toBe('185.00');
  const otherId = '90000000-0000-0000-0000-000000000003';
  const other = await call('prepare', { id: otherId });
  await db.query(`UPDATE track_private.ai_product_price_operations
    SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`, [otherId]);
  expect((await call('approve', { id: otherId, digest: other.reviewDigest })).status).toBe('expired');
  expect(await price()).toBe('185.00');
});

it('requires the original Owner and an existing-product receipt from the current business', async () => {
  await expect(call('prepare', { role: 'authenticated' })).rejects.toThrow(/permission denied/);
  await expect(call('prepare', { actor: cashier })).rejects.toThrow('PRICE_FORBIDDEN');
  await expect(call('prepare', { actor: admin })).rejects.toThrow('PRICE_FORBIDDEN');
  await expect(call('prepare', { actor: foreignOwner, tenant: foreignOrg })).rejects.toThrow('PRICE_NOT_FOUND');
  await expect(call('prepare', { rowIndex: 1 })).rejects.toThrow('PRICE_NOT_FOUND');
  await expect(call('prepare', { expiredAccess: true })).rejects.toThrow('PRICE_FORBIDDEN');
  await db.query('UPDATE public.ai_stock_receipts SET created_product = true WHERE id=$1', [receipt]);
  await expect(call('prepare')).rejects.toThrow('PRICE_NOT_FOUND');
});

it('rechecks entitlement on approval and restores claims while status still works after suspension', async () => {
  const previousClaims = JSON.stringify({ role: 'service_role', sub: foreignOwner });
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true),
    set_config('request.jwt.claims', $2, true)`, [foreignOwner, previousClaims]);
  const review = await call('prepare');
  const claims = async () => (await db.query(`SELECT current_setting('request.jwt.claim.sub') AS sub,
    current_setting('request.jwt.claims') AS claims`)).rows;
  expect(await claims()).toEqual([{ sub: foreignOwner, claims: previousClaims }]);
  await db.query("UPDATE public.subscriptions SET status = 'suspended' WHERE organization_id = $1", [org]);
  // The helper still sends a future HTTP eligibility timestamp.
  await expect(call('approve', { digest: review.reviewDigest })).rejects.toThrow('PRICE_FORBIDDEN');
  expect(await claims()).toEqual([{ sub: foreignOwner, claims: previousClaims }]);
  expect((await call('status')).status).toBe('prepared');
  expect(await price()).toBe('170.00');
  expect((await db.query("SELECT count(*)::integer AS count FROM public.audit_logs WHERE action = 'AI_PRODUCT_PRICE_APPROVED'")).rows)
    .toEqual([{ count: 0 }]);
});

it('rolls back the selling-price update when its audit cannot be recorded', async () => {
  const review = await call('prepare');
  await db.exec(`ALTER TABLE public.audit_logs ADD CONSTRAINT fail_test_audit
    CHECK (action <> 'AI_PRODUCT_PRICE_APPROVED') NOT VALID;`);
  await expect(call('approve', { digest: review.reviewDigest })).rejects.toThrow('fail_test_audit');
  expect(await price()).toBe('170.00');
  expect((await call('status')).status).toBe('prepared');
});
