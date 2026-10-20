<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { restoreSession } from '$lib/auth/restore';
  import AppSidebar from '$lib/components/AppSidebar.svelte';
  import { connectivityState } from '$lib/pwa/connectivity.svelte';
  import { getApiClient, getSessionState, getWorkspaceState } from '$lib/state/context';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  const api = getApiClient();
  const session = getSessionState();
  const workspace = getWorkspaceState();

  /**
   * The state of the guard.
   *
   * - `restoring`: the session is being restored (the server renders exactly
   *   this state, so the first client render matches it and there is no
   *   hydration mismatch);
   * - `ready`: the session is valid and a workspace is active;
   * - `no-membership`: the session is valid but the user belongs to no
   *   workspace of this institution;
   * - `failed`: the API could not be reached.
   */
  type GuardStatus = 'restoring' | 'ready' | 'no-membership' | 'failed';

  let status = $state<GuardStatus>('restoring');
  let failure = $state<string | null>(null);

  async function restore(): Promise<void> {
    status = 'restoring';
    failure = null;

    const outcome = await restoreSession({ client: api, session, workspace });

    if (outcome.status === 'unauthenticated') {
      // No session and no way to get one: the login page is the only way in.
      // The path is kept so the login can bring the user back to it.
      await goto(`/login?next=${encodeURIComponent(page.url.pathname)}`);
      return;
    }

    if (outcome.status === 'failed') {
      status = 'failed';
      failure = outcome.error?.message ?? 'The API could not be reached.';
      return;
    }

    status = outcome.status === 'restored' ? 'ready' : 'no-membership';
  }

  onMount(() => {
    void restore();
  });
</script>

{#if status === 'ready' || status === 'no-membership'}
  <div class="grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)]">
    <aside aria-label="Workspace and sections" class="min-w-0">
      <AppSidebar />
    </aside>

    <div class="min-w-0">
      {#if status === 'no-membership'}
        <section class="rounded-card border border-line bg-surface p-6">
          <h1 class="text-lg font-semibold tracking-tight">No workspace in this institution</h1>
          <p class="mt-2 text-sm text-ink-muted">
            Your account is valid, but it is not a member of any workspace of this institution. Ask
            an administrator to add you to one, or join an event with a code.
          </p>
          <a
            href="/join"
            class="mt-4 inline-block rounded-md border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
          >
            Join with an event code
          </a>
        </section>
      {:else}
        {@render children?.()}
      {/if}
    </div>
  </div>
{:else if status === 'failed'}
  <section role="alert" class="rounded-card border border-line bg-surface p-6">
    <h1 class="text-lg font-semibold tracking-tight">The session could not be restored</h1>
    <p class="mt-2 text-sm text-ink-muted">
      {#if connectivityState.offline}
        The browser is offline: the session needs the network to be restored. The pages that need
        the server cannot be loaded until the connection is back.
      {:else}
        {failure}
      {/if}
    </p>
    <button
      type="button"
      class="mt-4 rounded-md bg-brand-900 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
      onclick={restore}
    >
      Try again
    </button>
  </section>
{:else}
  <div role="status" aria-live="polite">
    <h1 class="text-lg font-semibold tracking-tight">Restoring your session…</h1>
  </div>
{/if}
