import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('alerts the owner once for an unusually large sale without changing sales', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE sales(id uuid PRIMARY KEY, organization_id uuid, total numeric, invoice_number text, created_at timestamptz, status text);
      CREATE TABLE financial_reversals(sale_id uuid, kind text);
      CREATE TABLE users(id uuid PRIMARY KEY, organization_id uuid, role text, status text);
      CREATE TABLE notifications(organization_id uuid,user_id uuid,recipient_role text,type text,title text,message text,body text,severity text,entity_type text,entity_id uuid,dedupe_key text,data jsonb);
      CREATE UNIQUE INDEX notifications_org_dedupe_key ON notifications(organization_id,dedupe_key) WHERE dedupe_key IS NOT NULL;
      INSERT INTO users VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','business_owner','active');`);
    await db.exec(readFileSync('supabase/migrations/20261115090000_unusual_sale_notifications.sql', 'utf8'));
    for (let i = 1; i <= 10; i++) await db.query(`INSERT INTO sales VALUES ($1,$2,1000,$3,now()-interval '1 day' * $4,'completed')`,
      [`10000000-0000-0000-0000-${String(i).padStart(12, '0')}`, '00000000-0000-0000-0000-000000000002', `S-${i}`, 20 - i]);
    await db.exec(`INSERT INTO sales VALUES ('10000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000002',100000,'BIG',now(),'completed');`);
    expect((await db.query<{ generate_unusual_sale_notifications: number }>('SELECT generate_unusual_sale_notifications()')).rows[0].generate_unusual_sale_notifications).toBe(1);
    expect((await db.query<{ generate_unusual_sale_notifications: number }>('SELECT generate_unusual_sale_notifications()')).rows[0].generate_unusual_sale_notifications).toBe(0);
    expect((await db.query('SELECT id FROM sales')).rows).toHaveLength(11);
  } finally { await db.close(); }
// Includes cold PGlite/WASM bootstrap; avoid a machine-speed failure on 4 GB.
}, 120000);
