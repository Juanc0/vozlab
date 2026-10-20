import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InstallPrompt from '$lib/components/InstallPrompt.svelte';
import { installState, type BeforeInstallPromptEvent } from '$lib/pwa/install.svelte';

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

/** The event Chromium fires when the app may be installed. */
function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted'): {
  prompt: ReturnType<typeof vi.fn>;
} {
  const prompt = vi.fn(async () => {});

  const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent;

  // The event carries the two members the app uses; they are defined rather
  // than assigned because the type declares them as read-only.
  Object.defineProperty(event, 'prompt', { value: prompt });
  Object.defineProperty(event, 'userChoice', {
    value: Promise.resolve({ outcome, platform: 'web' })
  });

  window.dispatchEvent(event);

  return { prompt };
}

describe('the install prompt', () => {
  beforeEach(() => {
    installState.attach();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers nothing while the browser never fired the event', () => {
    // Firefox and Safari never fire `beforeinstallprompt`: a button that
    // cannot do anything must not be shown.
    render(InstallPrompt);

    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument();
  });

  it('appears once the browser captured the offer', async () => {
    render(InstallPrompt);

    fireBeforeInstallPrompt();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
    });
  });

  it('opens the browser install dialog when the user accepts', async () => {
    render(InstallPrompt);

    const { prompt } = fireBeforeInstallPrompt('accepted');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: /install/i }));

    await waitFor(() => {
      expect(prompt).toHaveBeenCalledTimes(1);
    });
  });

  it('takes the offer away when the app was installed', async () => {
    render(InstallPrompt);

    fireBeforeInstallPrompt();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
    });

    window.dispatchEvent(new Event('appinstalled'));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument();
    });
  });

  it('takes the offer away when the user dismissed the browser dialog', async () => {
    render(InstallPrompt);

    fireBeforeInstallPrompt('dismissed');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: /install/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument();
    });
  });
});
