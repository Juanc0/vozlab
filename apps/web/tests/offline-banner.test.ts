import { render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppShell from '$lib/components/AppShell.svelte';
import { connectivityState } from '$lib/pwa/connectivity.svelte';
import { localeContext } from './harness/locale';

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
    render(AppShell, { props: {}, context: localeContext() });

    expect(screen.queryByText(/Estás sin conexión/i)).not.toBeInTheDocument();
  });

  it('appears when the browser goes offline', async () => {
    render(AppShell, { props: {}, context: localeContext() });

    goOffline();

    await waitFor(() => {
      expect(screen.getByText(/Estás sin conexión/i)).toBeInTheDocument();
    });
  });

  it('disappears when the browser comes back', async () => {
    render(AppShell, { props: {}, context: localeContext() });

    goOffline();
    await waitFor(() => {
      expect(screen.getByText(/Estás sin conexión/i)).toBeInTheDocument();
    });

    goOnline();

    await waitFor(() => {
      expect(screen.queryByText(/Estás sin conexión/i)).not.toBeInTheDocument();
    });
  });

  it('says what is blocked and that nothing is queued', async () => {
    render(AppShell, { props: {}, context: localeContext() });

    goOffline();

    await waitFor(() => {
      expect(screen.getByText(/Estás sin conexión/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/bloqueados hasta que vuelva la conexión/i)).toBeInTheDocument();
    expect(screen.getByText(/no se encola nada/i)).toBeInTheDocument();
  });

  it('is a polite live region: the change is announced, the focus is not stolen', async () => {
    render(AppShell, { props: {}, context: localeContext() });

    goOffline();

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Estás sin conexión/i);
    });
    expect(document.activeElement).toBe(document.body);
  });
});
