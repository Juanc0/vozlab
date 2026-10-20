import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import UpdatePrompt from '$lib/components/UpdatePrompt.svelte';
import { pwaState } from '$lib/pwa/state.svelte';

describe('the update prompt', () => {
  it('offers nothing while no new service worker is waiting', () => {
    render(UpdatePrompt);

    expect(screen.queryByText(/new version/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reload/i })).not.toBeInTheDocument();
  });

  it('appears when a new service worker is waiting', async () => {
    render(UpdatePrompt);

    pwaState.setNeedRefresh(vi.fn(async () => {}));

    await waitFor(() => {
      expect(screen.getByText(/A new version of VozLab is available/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  it('applies the waiting worker when the user accepts the reload', async () => {
    const applyUpdate = vi.fn(async () => {});

    render(UpdatePrompt);
    pwaState.setNeedRefresh(applyUpdate);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: /reload/i }));

    await waitFor(() => {
      expect(applyUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it('never applies the update without the user accepting it', async () => {
    const applyUpdate = vi.fn(async () => {});

    render(UpdatePrompt);
    pwaState.setNeedRefresh(applyUpdate);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    });

    // The worker waits: the assets are never swapped in the middle of a
    // session without the user saying so.
    expect(applyUpdate).not.toHaveBeenCalled();

    // The prompt stays until the user acts on it.
    expect(screen.getByText(/A new version of VozLab is available/i)).toBeInTheDocument();
  });

  it('disappears once the update was applied', async () => {
    const applyUpdate = vi.fn(async () => {});

    render(UpdatePrompt);
    pwaState.setNeedRefresh(applyUpdate);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: /reload/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /reload/i })).not.toBeInTheDocument();
    });
  });
});
