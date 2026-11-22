import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { deliverPushJobs } = vi.hoisted(() => ({ deliverPushJobs: vi.fn() }));
vi.mock('@/lib/notifications/push-delivery', () => ({ deliverPushJobs }));

import { GET } from './route';

const request = (secret?: string) => new NextRequest('https://trackasuwa.example/api/cron/push-notifications', {
  headers: secret ? { authorization: `Bearer ${secret}` } : {},
});

describe('push notification scheduler', () => {
  beforeEach(() => {
    deliverPushJobs.mockReset();
    vi.stubEnv('PUSH_CRON_SECRET', 'scheduler-secret');
  });

  it('rejects unauthenticated requests without touching the outbox', async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request('wrong'))).status).toBe(401);
    vi.stubEnv('PUSH_CRON_SECRET', '');
    expect((await GET(request('scheduler-secret'))).status).toBe(401);
    expect(deliverPushJobs).not.toHaveBeenCalled();
  });

  it('delivers push jobs for the scheduler', async () => {
    deliverPushJobs.mockResolvedValue({ sent: 2 });
    const response = await GET(request('scheduler-secret'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 2 });
    expect(deliverPushJobs).toHaveBeenCalledOnce();
  });

  it('reports missing push configuration as a failure', async () => {
    deliverPushJobs.mockResolvedValue({ sent: 0, skipped: 'not_configured' });
    expect((await GET(request('scheduler-secret'))).status).toBe(503);
  });
});
