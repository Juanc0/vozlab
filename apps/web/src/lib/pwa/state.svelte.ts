/**
 * Reactive PWA flags.
 *
 * The state is only ever mutated in the browser (from the service worker
 * callbacks), so the server always renders the neutral initial values — no
 * cross-request state leaks.
 */

import { browser } from '$app/environment';
import type { ApplyServiceWorkerUpdate } from './register';

class PwaState {
  /** A new service worker is waiting for the user to accept the reload. */
  needsRefresh = $state(false);
  /** The app shell is cached and the app is usable offline. */
  offlineReady = $state(false);
  /** Last registration error, if any. */
  error = $state<string | null>(null);

  #applyUpdate: ApplyServiceWorkerUpdate | null = null;

  setNeedRefresh(applyUpdate: ApplyServiceWorkerUpdate): void {
    this.#applyUpdate = applyUpdate;
    this.needsRefresh = true;
  }

  setOfflineReady(): void {
    this.offlineReady = true;
  }

  setError(error: unknown): void {
    this.error = error instanceof Error ? error.message : String(error);
  }

  /** Activates the waiting worker. The page reloads once it takes control. */
  async applyUpdate(): Promise<void> {
    if (!browser) {
      return;
    }
    const apply = this.#applyUpdate;
    if (!apply) {
      return;
    }
    this.needsRefresh = false;
    await apply();
  }
}

export const pwaState = new PwaState();
