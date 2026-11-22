import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: { id: 'owner-1' } as { id: string } | null, admin: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: mocks.user } }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'owner-1', organization_id: 'org-1', status: 'active' } }) }) }) }),
}) }));
vi.mock('@/lib/subscriptions/zainpay-checkout', () => ({ paymentAdmin: mocks.admin }));
import { GET, POST } from './route';

beforeEach(() => {
  mocks.user = { id: 'owner-1' };
  mocks.admin.mockClear();
  vi.stubEnv('WEB_PUSH_PUBLIC_KEY', 'public-key');
  vi.stubEnv('WEB_PUSH_PRIVATE_KEY', 'private-key');
  vi.stubEnv('WEB_PUSH_SUBJECT', 'mailto:support@trackasuwa.com');
});

it('does not reveal configuration or accept a device without a signed-in user', async () => {
  mocks.user = null;
  expect((await GET()).status).toBe(401);
  expect((await POST(new Request('https://trackasuwa.vercel.app/api/notifications/push', { method: 'POST', body: '{}' }))).status).toBe(401);
  expect(mocks.admin).not.toHaveBeenCalled();
});

it('rejects non-Apple endpoints before any privileged database access', async () => {
  const response = await POST(new Request('https://trackasuwa.vercel.app/api/notifications/push', {
    method: 'POST', body: JSON.stringify({ endpoint: 'https://attacker.example/collect', keys: { p256dh: 'a'.repeat(40), auth: 'b'.repeat(16) } }),
  }));
  expect(response.status).toBe(400);
  expect(mocks.admin).not.toHaveBeenCalled();
});
