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
  import { isWorkspacePath } from '$lib/layout/workspace';
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
  const navWide = new MediaQuery('(min-width: 1024px)');

  /**
   * Whether the page is a **workspace**.
   *
   * A workspace fills the window: the column of the navigation and the
   * page are as tall as the area the shell leaves them, and neither of
   * them scrolls.
   */
  const isWorkspace = $derived(isWorkspacePath(page.url.pathname));

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

  <div
    class="grid {navWide.matches
      ? 'lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] lg:gap-7'
      : ''} {isWorkspace ? 'h-full min-h-0' : ''}"
  >
    {#if navWide.matches}
      <!--
        The column of the navigation.

        It is **flat**: it shares the ground of the page and a single 1px
        rule divides it from the content. It sticks under the bar of the
        shell, so the destinations and the session are always within reach
        of the pointer.

        In a **workspace** the column is not sticky: the window does not
        scroll, the column is as tall as the window and it scrolls inside
        itself.
      -->
      <aside
        aria-label={t('app.workspaceAndSections')}
        class="hidden min-w-0 border-r border-rule lg:block lg:overflow-y-auto {isWorkspace
          ? 'h-full pl-4 pr-6 sm:pl-6'
          : 'sticky top-16 h-[calc(100dvh-4rem)] pr-6'}"
      >
        <AppSidebar />
      </aside>
    {/if}

    <div class="min-w-0 {isWorkspace ? 'h-full min-h-0' : ''}">
      {#if status === 'no-membership'}
        <section class="rounded-card bg-surface p-6">
          <h1>{t('app.noWorkspaceHeading')}</h1>
          <p class="mt-2 max-w-measure text-body text-muted">
            {t('app.noWorkspaceText')}
          </p>
          <a href="/join" class="btn btn-secondary mt-4">
            {t('common.joinWithCode')}
          </a>
        </section>
      {:else}
        {@render children?.()}
      {/if}
    </div>
  </div>
{:else if status === 'failed'}
  <section role="alert" class="max-w-measure rounded-card bg-surface p-6">
    <h1 class="text-section font-sans">{t('app.restoreFailedHeading')}</h1>
    <p class="mt-2 text-body text-muted">
      {#if connectivityState.offline}
        {t('app.restoreFailedOffline')}
      {:else}
        {failure}
      {/if}
    </p>
    <button type="button" class="btn btn-primary mt-4" onclick={restore}>
      {t('common.tryAgain')}
    </button>
  </section>
{:else}
  <div role="status" aria-live="polite">
    <h1 class="text-section font-sans">{t('app.restoring')}</h1>
  </div>
{/if}
