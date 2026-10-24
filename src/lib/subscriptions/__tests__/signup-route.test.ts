import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/signup/route';
import { TRIAL_PLAN_ID } from '../signup-trial';

const mock = vi.hoisted(() => ({ inserts: [] as Array<{ table: string; value: any }>, createUser: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { admin: { createUser: mock.createUser } },
    from: (table: string) => ({
      insert: (value: unknown) => {
        mock.inserts.push({ table, value });
        return { error: null, select: () => ({ single: async () => ({ data: { id: `${table}-id` }, error: null }) }) };
      },
    }),
  }),
}));

beforeEach(() => {
  mock.inserts.length = 0;
  mock.createUser.mockResolvedValue({ data: { user: { id: 'user-id' } }, error: null });
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
});

it.each(['pharmacy','medical_wholesale','electronics','fashion'])('saves industry %s without changing the trial', async industry => {
  const response = await POST(new NextRequest('http://localhost/api/auth/signup', {method:'POST',body:JSON.stringify({business_name:'Test shop',full_name:'Owner',email:'test@example.com',password:'test-password',industry})}));
  expect(response.status).toBe(201);
  expect(mock.inserts.find(row=>row.table==='merchants')?.value).toMatchObject({business_type:industry,subscription_plan_id:TRIAL_PLAN_ID});
});

it('rejects unknown industry before creating any account records', async () => {
  const response = await POST(new NextRequest('http://localhost/api/auth/signup', {method:'POST',body:JSON.stringify({business_name:'Test shop',full_name:'Owner',email:'test@example.com',password:'test-password',industry:'fake'})}));
  expect(response.status).toBe(400);
  expect(mock.inserts).toHaveLength(0);
});

it.each([undefined, 'b2000000-0000-0000-0000-000000000002', 'invalid'])('starts the same free trial with preference %s', async (plan_id) => {
  const response = await POST(new NextRequest('http://localhost/api/auth/signup', {
    method: 'POST', body: JSON.stringify({ business_name: 'Test shop', full_name: 'Test owner', email: 'test@example.com', password: 'test-password', plan_id }),
  }));
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ trial_status: 'active', plan: { id: TRIAL_PLAN_ID } });
  expect(mock.inserts.find(row => row.table === 'organizations')?.value).toMatchObject({
    subscription_plan_id: TRIAL_PLAN_ID,
    subscription_status: 'trial',
    settings: { _signup_trial: true, preferred_plan_id: plan_id?.startsWith('b200') ? plan_id : null },
  });
  expect(mock.inserts.some(row => row.table === 'payment_transactions')).toBe(false);
});
