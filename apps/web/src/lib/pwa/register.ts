/**
 * Service worker registration.
 *
 * `vite-plugin-pwa` runs with `registerType: 'prompt'`, so a new worker stays
 * in the `waiting` state until the user accepts the reload. Nothing in this
 * module activates the update by itself — assets are never swapped silently
 * in the middle of a session (see `docs/spec/web-pwa.md`).
 */

import { browser } from '$app/environment';

/** Applies the waiting service worker and reloads the page. */
export type ApplyServiceWorkerUpdate = () => Promise<void>;

export interface PwaHandlers {
  /** A new service worker is waiting: prompt the user before reloading. */
  onNeedRefresh?: (applyUpdate: ApplyServiceWorkerUpdate) => void;
  /** The application shell has been cached and the app works offline. */
  onOfflineReady?: () => void;
  /** The service worker could not be registered. */
  onRegisterError?: (error: unknown) => void;
}

/**
 * Registers the service worker.
 *
 * No-op outside the browser (SSR) so the module can be imported anywhere.
 * Returns the callback that activates a waiting worker, or `undefined` when
 * the worker could not be registered.
 */
export async function registerServiceWorker(
  handlers: PwaHandlers = {}
): Promise<ApplyServiceWorkerUpdate | undefined> {
  if (!browser) {
    return undefined;
  }

  try {
    const { registerSW } = await import('virtual:pwa-register');

    const update = registerSW({
      immediate: true,
      onNeedRefresh: () => handlers.onNeedRefresh?.(update),
      onOfflineReady: () => handlers.onOfflineReady?.(),
      onRegisterError: (error: unknown) => handlers.onRegisterError?.(error)
    });

    return update;
  } catch (error) {
    handlers.onRegisterError?.(error);
    return undefined;
  }
}
