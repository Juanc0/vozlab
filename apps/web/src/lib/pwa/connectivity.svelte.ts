/**
 * The connectivity of the browser.
 *
 * The PWA is **online-first** and **read-only offline**: the reads may come
 * from the cache, the writes are refused while the browser is offline.
 *
 * The state is a module-level singleton, and it is safe: it holds **no user
 * data**. The server always renders the neutral state (online), because
 * `navigator.onLine` is only read in the browser — a request can therefore
 * never see another user's connectivity. (The session and the workspace are
 * the states that must not be shared, and they live in the context.)
 */

import { browser } from '$app/environment';

class ConnectivityState {
  /** `false` while the browser says it is offline. */
  online = $state(true);

  /** The listeners are attached once per tab. */
  #attached = false;

  /** `true` while the browser is offline. */
  get offline(): boolean {
    return !this.online;
  }

  /**
   * Reads the current connectivity and follows the changes.
   *
   * `navigator.onLine` alone is only a snapshot: the `online` and `offline`
   * events of the window are what says that the connectivity changed.
   */
  attach(): void {
    if (!browser || this.#attached) {
      return;
    }

    this.#attached = true;
    this.online = navigator.onLine;

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  private readonly handleOnline = (): void => {
    this.online = true;
  };

  private readonly handleOffline = (): void => {
    this.online = false;
  };
}

export const connectivityState = new ConnectivityState();
