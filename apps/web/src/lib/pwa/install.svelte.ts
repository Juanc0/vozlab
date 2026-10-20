/**
 * The install prompt of the PWA.
 *
 * Chromium fires `beforeinstallprompt` when the app may be installed. The
 * event is **captured** — its default is prevented, so the browser does not
 * show its own mini-infobar — and the app offers an "Install" control that
 * calls `prompt()` on it.
 *
 * Firefox and Safari **never fire the event**: there is nothing to capture,
 * so the control must not appear. A button that does nothing is worse than
 * no button at all.
 *
 * `appinstalled` ends the offer: the app is installed, there is nothing left
 * to prompt.
 */

import { browser } from '$app/environment';

/** The event Chromium fires when the app may be installed. */
export interface BeforeInstallPromptEvent extends Event {
  /** Opens the browser's own install dialog. */
  prompt(): Promise<void>;
  /** What the user chose in that dialog. */
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** What the install attempt ended with. */
export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

class InstallState {
  /** `true` while the browser's install offer is open. */
  canInstall = $state(false);

  /** `true` once the app was installed. */
  installed = $state(false);

  /** The captured offer, or `null` when there is none. */
  #deferred: BeforeInstallPromptEvent | null = null;

  /** The listeners are attached once per tab. */
  #attached = false;

  /**
   * Listens for the install offer.
   *
   * The listener must be attached **before** the browser fires the event,
   * which happens once the manifest is registered — the root layout does it
   * on mount, before the app asks for anything.
   */
  attach(): void {
    if (!browser || this.#attached) {
      return;
    }

    this.#attached = true;

    window.addEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', this.handleAppInstalled);

    // An app that already runs in its own window is installed: the browser
    // will not offer it again.
    if (window.matchMedia?.('(display-mode: standalone)').matches === true) {
      this.installed = true;
    }
  }

  private readonly handleBeforeInstallPrompt = (event: Event): void => {
    const deferred = event as BeforeInstallPromptEvent;

    // The browser would show its own banner: the app offers the install
    // itself, so the default is prevented.
    deferred.preventDefault();

    this.#deferred = deferred;
    this.canInstall = true;
  };

  private readonly handleAppInstalled = (): void => {
    this.#deferred = null;
    this.canInstall = false;
    this.installed = true;
  };

  /**
   * Opens the browser's install dialog.
   *
   * `unavailable` means there was no offer to make: the browser never fired
   * the event, or the offer was already used. The control disappears either
   * way — the app never shows a button that cannot do anything.
   */
  async install(): Promise<InstallOutcome> {
    const deferred = this.#deferred;

    if (deferred === null) {
      this.canInstall = false;
      return 'unavailable';
    }

    this.canInstall = false;

    try {
      await deferred.prompt();
    } catch {
      // The browser refused the dialog (it may be rate-limited): the offer
      // is dropped and the control disappears.
      this.#deferred = null;
      return 'unavailable';
    }

    const choice = await deferred.userChoice;
    this.#deferred = null;

    return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
  }
}

export const installState = new InstallState();
