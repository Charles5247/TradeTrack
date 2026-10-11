// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { registerServiceWorker } from './register-sw';

const serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  if (serviceWorkerDescriptor) {
    Object.defineProperty(navigator, 'serviceWorker', serviceWorkerDescriptor);
  } else {
    Reflect.deleteProperty(navigator, 'serviceWorker');
  }
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('notifies for a waiting deployment update and activates it only when requested', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_DEPLOYMENT_ID', 'commit-old');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ deployment_id: 'commit-abc' }),
  }));

  const waitingWorker = Object.assign(new EventTarget(), {
    state: 'installed' as const,
    postMessage: vi.fn(),
  });
  const registration = Object.assign(new EventTarget(), {
    waiting: waitingWorker,
    installing: null,
    update: vi.fn().mockResolvedValue(undefined),
  });
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: waitingWorker,
    register: vi.fn(async () => registration),
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  });

  const onUpdateAvailable = vi.fn<(activateUpdate: () => void) => void>();
  cleanup = registerServiceWorker(onUpdateAvailable);

  await vi.waitFor(() => expect(serviceWorker.register).toHaveBeenCalled());
  expect(serviceWorker.register).toHaveBeenCalledWith(
    '/sw.js?build=commit-abc',
    { updateViaCache: 'none' },
  );
  expect(onUpdateAvailable).toHaveBeenCalledTimes(1);

  onUpdateAvailable.mock.calls[0][0]();
  expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
});
