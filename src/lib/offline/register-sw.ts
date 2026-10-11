'use client';

type UpdateAvailableHandler = (activateUpdate: () => void) => void;
type ServiceWorkerHandle = Pick<
  ServiceWorker,
  'state' | 'postMessage' | 'addEventListener' | 'removeEventListener'
>;
type ServiceWorkerRegistrationHandle = Pick<
  ServiceWorkerRegistration,
  'waiting' | 'installing' | 'update' | 'addEventListener' | 'removeEventListener'
>;
type ServiceWorkerContainerHandle = Pick<
  ServiceWorkerContainer,
  'addEventListener' | 'removeEventListener'
> & {
  controller: ServiceWorkerHandle | null;
  register(
    scriptURL: string,
    options?: RegistrationOptions,
  ): Promise<ServiceWorkerRegistrationHandle>;
};

/**
 * Service worker registration helper.
 *
 * Reads the live deployment ID before checking the worker. This lets
 * already-open clients discover commits newer than their own bundled code.
 */
export function registerServiceWorker(
  onUpdateAvailable: UpdateAvailableHandler,
): () => void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }
  // Skip in local dev by default to avoid stale-cache confusion while
  // iterating — PWA behavior is meant to be verified in production builds.
  if (process.env.NODE_ENV !== 'production') return () => {};

  const serviceWorker: ServiceWorkerContainerHandle = navigator.serviceWorker;
  let disposed = false;
  let registration: ServiceWorkerRegistrationHandle | null = null;
  let installingWorker: ServiceWorkerHandle | null = null;
  let installingStateHandler: (() => void) | null = null;
  let notifiedWorker: ServiceWorkerHandle | null = null;
  let registeredDeploymentId: string | null = null;
  let reloaded = false;
  let checkingForUpdate = false;
  const hadController = Boolean(serviceWorker.controller);
  const bundledDeploymentId = process.env.NEXT_PUBLIC_DEPLOYMENT_ID ?? 'local';

  const notifyIfWaiting = () => {
    const waitingWorker = registration?.waiting;
    if (!waitingWorker || waitingWorker === notifiedWorker) return;

    notifiedWorker = waitingWorker;
    onUpdateAvailable(() => {
      registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    });
  };

  const onUpdateFound = () => {
    if (installingWorker && installingStateHandler) {
      installingWorker.removeEventListener('statechange', installingStateHandler);
    }

    installingWorker = registration?.installing ?? null;
    if (!installingWorker) return;

    installingStateHandler = () => {
      if (installingWorker?.state === 'installed' && hadController) {
        notifyIfWaiting();
      }
    };
    installingWorker.addEventListener('statechange', installingStateHandler);
  };

  const registerForDeployment = async (deploymentId: string) => {
    const scriptUrl = `/sw.js?build=${encodeURIComponent(deploymentId)}`;
    const result = await serviceWorker.register(scriptUrl, { updateViaCache: 'none' });
    if (disposed) return;

    if (registration !== result) {
      registration?.removeEventListener('updatefound', onUpdateFound);
      registration = result;
      registration.addEventListener('updatefound', onUpdateFound);
    }
    registeredDeploymentId = deploymentId;
    notifyIfWaiting();
  };

  const onControllerChange = () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  };

  const getLatestDeploymentId = async () => {
    const response = await fetch('/api/version', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Version check failed with status ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('deployment_id' in payload) ||
      typeof payload.deployment_id !== 'string' ||
      payload.deployment_id.length === 0
    ) {
      throw new Error('Version response did not include a deployment ID');
    }
    return payload.deployment_id;
  };

  const checkForUpdate = async () => {
    if (
      disposed ||
      checkingForUpdate ||
      document.visibilityState !== 'visible'
    ) {
      return;
    }

    checkingForUpdate = true;
    try {
      const latestDeploymentId = await getLatestDeploymentId();
      if (latestDeploymentId !== registeredDeploymentId) {
        await registerForDeployment(latestDeploymentId);
      } else {
        await registration?.update();
      }
    } catch (error: unknown) {
      console.warn('[PWA] Service worker update check failed:', error);
      try {
        if (!registration) {
          await registerForDeployment(bundledDeploymentId);
        } else {
          await registration.update();
        }
      } catch (registrationError: unknown) {
        console.warn('[PWA] Service worker registration failed:', registrationError);
      }
    } finally {
      checkingForUpdate = false;
    }
  };

  const onLoad = () => void checkForUpdate();
  let updateCheckTimer: number | undefined;
  serviceWorker.addEventListener('controllerchange', onControllerChange);
  window.addEventListener('focus', checkForUpdate);
  document.addEventListener('visibilitychange', checkForUpdate);
  window.addEventListener('online', checkForUpdate);
  updateCheckTimer = window.setInterval(checkForUpdate, 60 * 60 * 1000);
  if (document.readyState === 'complete') {
    void checkForUpdate();
  } else {
    window.addEventListener('load', onLoad, { once: true });
  }

  return () => {
    disposed = true;
    window.removeEventListener('load', onLoad);
    serviceWorker.removeEventListener('controllerchange', onControllerChange);
    window.removeEventListener('focus', checkForUpdate);
    document.removeEventListener('visibilitychange', checkForUpdate);
    window.removeEventListener('online', checkForUpdate);
    if (updateCheckTimer !== undefined) window.clearInterval(updateCheckTimer);
    registration?.removeEventListener('updatefound', onUpdateFound);
    if (installingWorker && installingStateHandler) {
      installingWorker.removeEventListener('statechange', installingStateHandler);
    }
  };
}
