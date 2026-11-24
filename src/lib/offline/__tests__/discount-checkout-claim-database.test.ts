import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const actor = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
const org = '20000000-0000-0000-0000-000000000001';
const request = '30000000-0000-0000-0000-000000000001';
const sale = '40000000-0000-0000-0000-000000000001';
const hash = 'a'.repeat(64);

it('binds an approved discount to one checkout and accepts its later upload', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth; CREATE SCHEMA track_private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE TABLE public.organizations(id uuid PRIMARY KEY, max_discount_percent numeric);
      CREATE TABLE public.users(id uuid PRIMARY KEY, organization_id uuid, role text, status text,
        can_give_discounts boolean, max_discount_percent numeric);
      CREATE TABLE public.sales(id uuid PRIMARY KEY, organization_id uuid, cashier_id uuid,
        subtotal numeric, discount numeric, discount_request_id uuid, discount_cart_hash text,
        discount_authorized_by uuid, discount_permission_snapshot jsonb, discount_reason text,
        updated_at timestamptz, official_invoice_number text);
      CREATE TABLE public.discount_requests(id uuid PRIMARY KEY, organization_id uuid,
        requester_id uuid, cart_hash text, cart_subtotal numeric, discount_amount numeric,
        status text, used_at timestamptz, expires_at timestamptz, sale_id uuid REFERENCES public.sales(id),
        decider_id uuid, reason text);
      CREATE TABLE public.audit_logs(organization_id uuid, user_id uuid, action text,
        resource_type text, resource_id uuid, new_values jsonb, reason text);
      INSERT INTO public.organizations VALUES ('${org}', 100);
      INSERT INTO public.users VALUES ('${actor}', '${org}', 'cashier', 'active', false, null),
        ('${other}', '${org}', 'cashier', 'active', false, null);
      INSERT INTO public.discount_requests VALUES
        ('${request}', '${org}', '${actor}', '${hash}', 10000, 88, 'approved', null,
         now() + interval '15 minutes', null, '${other}', 'Customer discount');
      SET request.jwt.claim.sub = '${actor}';
    `);
    const source = readFileSync('supabase/migrations/20261113120000_reconcile_live_sale_item_fixes.sql', 'utf8');
    const guard = source.match(/CREATE OR REPLACE FUNCTION track_private\.guard_financial_change\(\)[\s\S]*?\$function\$;/)?.[0];
    if (!guard) throw new Error('Financial guard definition not found');
    await db.exec(guard);
    await db.exec(`CREATE TRIGGER sale_controls BEFORE INSERT ON public.sales
      FOR EACH ROW EXECUTE FUNCTION track_private.guard_financial_change()`);
    await db.exec(readFileSync('supabase/migrations/20261124120000_bind_discount_approval_to_checkout.sql', 'utf8'));

    const claim = (checkout: string, amount = 88) => db.query(
      'SELECT public.claim_discount_checkout($1,$2,$3,$4,$5)',
      [request, checkout, hash, 10000, amount],
    );
    await expect(claim(sale, 89)).rejects.toThrow('cannot be claimed');
    await db.exec(`SET request.jwt.claim.sub = '${other}'`);
    await expect(claim(sale)).rejects.toThrow('cannot be claimed');
    await db.exec(`SET request.jwt.claim.sub = '${actor}'`);
    await expect(claim(sale)).resolves.toBeDefined();
    await expect(claim(sale)).resolves.toBeDefined();
    await expect(claim('40000000-0000-0000-0000-000000000002')).rejects.toThrow('another checkout');
    await db.exec(`UPDATE public.discount_requests SET expires_at = checkout_claimed_at + interval '1 millisecond' WHERE id = '${request}'`);
    await new Promise(resolve => setTimeout(resolve, 20));
    await expect(db.exec(`INSERT INTO public.sales(id, organization_id, cashier_id, subtotal, discount,
      discount_request_id, discount_cart_hash, discount_reason)
      VALUES ('40000000-0000-0000-0000-000000000002', '${org}', '${actor}', 10000, 88,
        '${request}', '${hash}', 'Owner approved')`)).rejects.toThrow('invalid, expired');
    await expect(db.exec(`INSERT INTO public.sales(id, organization_id, cashier_id, subtotal, discount,
      discount_request_id, discount_cart_hash, discount_reason)
      VALUES ('${sale}', '${org}', '${actor}', 10000, 89,
        '${request}', '${hash}', 'Owner approved')`)).rejects.toThrow('invalid, expired');
    await db.exec(`INSERT INTO public.sales(id, organization_id, cashier_id, subtotal, discount,
      discount_request_id, discount_cart_hash, discount_reason)
      VALUES ('${sale}', '${org}', '${actor}', 10000, 88, '${request}', '${hash}', 'Owner approved')`);
    const result = await db.query<{ sale_id: string; used_at: Date | null }>(
      `SELECT sale_id, used_at FROM public.discount_requests WHERE id = '${request}'`,
    );
    expect(result.rows[0].sale_id).toBe(sale);
    expect(result.rows[0].used_at).not.toBeNull();
  } finally {
    await db.close();
  }
}, 120000);
