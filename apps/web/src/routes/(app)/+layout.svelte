<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { restoreSession } from '$lib/auth/restore';
  import {
    forgetDevelopmentToken,
    readRememberedDevelopmentToken,
    signInWithDevelopmentToken
  } from '$lib/auth/dev-sign-in';
  import AppSidebar from '$lib/components/AppSidebar.svelte';
  import Drawer from '$lib/components/Drawer.svelte';
  import { MediaQuery } from '$lib/layout/media.svelte';
  import { connectivityState } from '$lib/pwa/connectivity.svelte';
  import { getApiClient, getLocaleState, getSessionState, getWorkspaceState } from '$lib/state/context';
  import { shellState } from '$lib/state/shell.svelte';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();

  const api = getApiClient();
  const session = getSessionState();
  const workspace = getWorkspaceState();
  const locale = getLocaleState();
  const t = locale.t;

  /**
   * The width at which the navigation is a column.
   *
   * Below it the navigation is a drawer that comes over the content: a
   * column of fifteen rems on a phone of twenty rems leaves nothing for
   * the graph.
   */
  const navWide = new MediaQuery('(min-width: 768px)');

  onMount(() => {
    navWide.attach();

    return () => {
      navWide.destroy();
    };
  });

  /** The route the drawer was opened on. */
  let navPath: string | null = null;

  /**
   * The drawer closes when the route changes.
   *
   * The user picked a section of the navigation: the drawer has done its
   * work, and the new page is the one they asked for.
   */
  $effect(() => {
    // The path is the dependency of the effect: the drawer follows the
    // route, not the other way round.
    const path = page.url.pathname;

    untrack(() => {
      if (path === navPath) {
        return;
      }

      navPath = path;
      shellState.closeNav();
    });
  });

  /**
   * The drawer closes when the window becomes wide.
   *
   * Above `md` the navigation is the column, and a drawer that is open
   * behind it would be a panel nobody can see.
   */
  $effect(() => {
    const wide = navWide.matches;

    untrack(() => {
      if (wide) {
        shellState.closeNav();
      }
    });
  });

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
  <!--
    The navigation is a **drawer** below `md` and a **column** above it.

    The two are never in the DOM at the same time: the navigation carries
    the ids of its controls, and two copies of it would be two elements
    with the same id.
  -->
  {#if !navWide.matches}
    <Drawer open={shellState.navOpen} onclose={() => shellState.closeNav()}>
      <AppSidebar />
    </Drawer>
  {/if}

  <div class="grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)]">
    {#if navWide.matches}
      <aside aria-label={t('app.workspaceAndSections')} class="hidden min-w-0 md:block">
        <AppSidebar />
      </aside>
    {/if}

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
