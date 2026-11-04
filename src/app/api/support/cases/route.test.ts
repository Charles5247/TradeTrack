import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: { id: 'reporter' } as { id: string } | null,
  profile: { id: 'reporter', organization_id: 'org-one', role: 'cashier', status: 'active' },
  inserted: null as Record<string, unknown> | null,
  notify: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user } }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: state.profile }) }) }) }),
}) }));
vi.mock('@/lib/platform/support', () => ({
  platformDb: () => ({ from: () => ({ insert: (value: Record<string, unknown>) => {
    state.inserted = value;
    return { select: () => ({ single: async () => ({ data: { id: 'case-one' }, error: null }) }) };
  } }) }),
  notifyPlatformOwners: state.notify,
  notifyMerchantOwners: vi.fn(),
}));
import { PATCH, POST } from './route';

beforeEach(() => {
  state.user = { id: 'reporter' };
  state.profile = { id: 'reporter', organization_id: 'org-one', role: 'cashier', status: 'active' };
  state.inserted = null;
  state.notify.mockReset();
});

it('lets a cashier report an issue only under their own authenticated organization', async () => {
  const response = await POST(new Request('http://localhost/api/support/cases', {
    method: 'POST', body: JSON.stringify({ title: 'Sale upload failed', detail: 'The upload queue has shown an error for an hour.', organization_id: 'another-org' }),
  }));
  expect(response.status).toBe(201);
  expect(state.inserted).toMatchObject({ organization_id: 'org-one', reporter_id: 'reporter', source: 'merchant' });
  expect(state.notify).toHaveBeenCalledOnce();
});

it('blocks a cashier from changing case status', async () => {
  const response = await PATCH(new Request('http://localhost/api/support/cases', {
    method: 'PATCH', body: JSON.stringify({ id: 'a255643b-7f9b-4141-af2d-f76a7c00f619', status: 'resolved' }),
  }));
  expect(response.status).toBe(403);
  expect(state.inserted).toBeNull();
});

it('requires sign-in before accepting a report', async () => {
  state.user = null;
  const response = await POST(new Request('http://localhost/api/support/cases', {
    method: 'POST', body: JSON.stringify({ title: 'Sale upload failed', detail: 'Upload queue rejected the sale.' }),
  }));
  expect(response.status).toBe(403);
  expect(state.inserted).toBeNull();
});
