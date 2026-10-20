<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { restoreSession } from '$lib/auth/restore';
  import {
    forgetDevelopmentToken,
    readRememberedDevelopmentToken,
    signInWithDevelopmentToken
  } from '$lib/auth/dev-sign-in';
  import AppSidebar from '$lib/components/AppSidebar.svelte';
  import { connectivityState } from '$lib/pwa/connectivity.svelte';
  import { getApiClient, getLocaleState, getSessionState, getWorkspaceState } from '$lib/state/context';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  const api = getApiClient();
  const session = getSessionState();
  const workspace = getWorkspaceState();
  const locale = getLocaleState();
  const t = locale.t;

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

    // A development token comes first: it is the identity the presenter
    // chose, and the refresh cookie of another session must not take it
    // away.
    const remembered = readRememberedDevelopmentToken();
    if (remembered !== null) {
      const devOutcome = await signInWithDevelopmentToken(
        { client: api, session, workspace },
        remembered
      );

      if (devOutcome.status === 'signed-in') {
        status = devOutcome.workspaces.length === 0 ? 'no-membership' : 'ready';
        return;
      }

      // The remembered token no longer works: forget it and fall through to
      // the ordinary restore.
      forgetDevelopmentToken();
    }

    const outcome = await restoreSession({ client: api, session, workspace });

    if (outcome.status === 'unauthenticated') {
      // No session and no way to get one: the login page is the only way in.
      // The path is kept so the login can bring the user back to it.
      await goto(`/login?next=${encodeURIComponent(page.url.pathname)}`);
      return;
    }

    if (outcome.status === 'failed') {
      status = 'failed';
      failure = outcome.error?.message ?? t('login.devErrorUnreachable');
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
    <aside aria-label={t('app.workspaceAndSections')} class="min-w-0">
      <AppSidebar />
    </aside>

    <div class="min-w-0">
      {#if status === 'no-membership'}
        <section class="rounded-card border border-line bg-surface p-6">
          <h1 class="text-lg font-semibold tracking-tight">{t('app.noWorkspaceHeading')}</h1>
          <p class="mt-2 text-sm text-ink-muted">
            {t('app.noWorkspaceText')}
          </p>
          <a
            href="/join"
            class="mt-4 inline-block rounded-md border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
          >
            {t('common.joinWithCode')}
          </a>
        </section>
      {:else}
        {@render children?.()}
      {/if}
    </div>
  </div>
{:else if status === 'failed'}
  <section role="alert" class="rounded-card border border-line bg-surface p-6">
    <h1 class="text-lg font-semibold tracking-tight">{t('app.restoreFailedHeading')}</h1>
    <p class="mt-2 text-sm text-ink-muted">
      {#if connectivityState.offline}
        {t('app.restoreFailedOffline')}
      {:else}
        {failure}
      {/if}
    </p>
    <button
      type="button"
      class="mt-4 rounded-md bg-brand-900 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
      onclick={restore}
    >
      {t('common.tryAgain')}
    </button>
  </section>
{:else}
  <div role="status" aria-live="polite">
    <h1 class="text-lg font-semibold tracking-tight">{t('app.restoring')}</h1>
  </div>
{/if}
