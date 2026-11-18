import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('queues push only for the targeted subscribed user and keeps device keys private', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA track_private;
      CREATE TABLE public.organizations(id uuid PRIMARY KEY);
      CREATE TABLE public.users(id uuid PRIMARY KEY, organization_id uuid);
      CREATE TABLE public.notifications(id uuid PRIMARY KEY, user_id uuid, organization_id uuid,
        in_app_visible boolean NOT NULL, title text);
      INSERT INTO public.organizations VALUES ('10000000-0000-4000-8000-000000000001');
      INSERT INTO public.users VALUES
        ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
        ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');
    `);
    await db.exec(readFileSync('supabase/migrations/20261118150000_web_push_notifications.sql', 'utf8'));
    await db.exec(`
      INSERT INTO public.notification_push_subscriptions(user_id,organization_id,endpoint,p256dh,auth_secret)
      VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
        'https://web.push.apple.com/test','key','secret');
      INSERT INTO public.notifications VALUES
        ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',true,'New sale'),
        ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',true,'Other staff'),
        ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',false,'Hidden');
    `);
    expect((await db.query('SELECT notification_id FROM public.notification_push_outbox')).rows)
      .toEqual([{ notification_id: '30000000-0000-4000-8000-000000000001' }]);
    await expect(db.exec('SET ROLE authenticated; SELECT * FROM public.notification_push_subscriptions'))
      .rejects.toThrow();
  } finally {
    await db.close();
  }
});
