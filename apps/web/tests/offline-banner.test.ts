import { render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppShell from '$lib/components/AppShell.svelte';
import { connectivityState } from '$lib/pwa/connectivity.svelte';

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

/** The browser says it is offline. */
function goOffline(): void {
  window.dispatchEvent(new Event('offline'));
}

/** The browser says it is online again. */
function goOnline(): void {
  window.dispatchEvent(new Event('online'));
}

describe('the offline banner', () => {
  beforeEach(() => {
    connectivityState.attach();
    goOnline();
  });

  afterEach(() => {
    goOnline();
  });

  it('stays hidden while the browser is online', () => {
    render(AppShell, { title: 'VozLab' });

    expect(screen.queryByText(/You are offline/i)).not.toBeInTheDocument();
  });

  it('appears when the browser goes offline', async () => {
    render(AppShell, { title: 'VozLab' });

    goOffline();

    await waitFor(() => {
      expect(screen.getByText(/You are offline/i)).toBeInTheDocument();
    });
  });

  it('disappears when the browser comes back', async () => {
    render(AppShell, { title: 'VozLab' });

    goOffline();
    await waitFor(() => {
      expect(screen.getByText(/You are offline/i)).toBeInTheDocument();
    });

    goOnline();

    await waitFor(() => {
      expect(screen.queryByText(/You are offline/i)).not.toBeInTheDocument();
    });
  });

  it('says what is blocked and that nothing is queued', async () => {
    render(AppShell, { title: 'VozLab' });

    goOffline();

    await waitFor(() => {
      expect(screen.getByText(/You are offline/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/blocked until the connection is back/i)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is queued/i)).toBeInTheDocument();
  });

  it('is a polite live region: the change is announced, the focus is not stolen', async () => {
    render(AppShell, { title: 'VozLab' });

    goOffline();

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/You are offline/i);
    });
    expect(document.activeElement).toBe(document.body);
  });
});
