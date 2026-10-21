<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { page } from '$app/state';
  import '../app.css';
  import AppShell from '$lib/components/AppShell.svelte';
  import { ApiClient } from '$lib/api/client';
  import { LocaleState } from '$lib/i18n';
  import { connectivityState } from '$lib/pwa/connectivity.svelte';
  import { installState } from '$lib/pwa/install.svelte';
  import { registerServiceWorker } from '$lib/pwa/register';
  import { pwaState } from '$lib/pwa/state.svelte';
  import { provideAppState } from '$lib/state/context';
  import { SessionState } from '$lib/state/session.svelte';
  import { WorkspaceState } from '$lib/state/workspace.svelte';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  // The state lives in the Svelte context, not in a module singleton: on the
  // server every request gets its own instance, in the browser every tab
  // gets its own.
  const session = new SessionState();
  const workspace = new WorkspaceState();
  const api = new ApiClient({ baseUrl: () => data.apiBaseUrl, session, workspace });

  // The language comes from the server: it read the cookie of the visitor,
  // so the first render of the client is the one of the server and there is
  // no hydration mismatch. It is read **once**: the visitor changes it
  // through the state, not through the data of the page.
  const locale = new LocaleState(untrack(() => data.locale));

  provideAppState({ session, workspace, api, locale });

  /**
   * Whether the page has a navigation.
   *
   * The button of the menu only makes sense where there is something to
   * open: the login and the join have no navigation. The **route id** says
   * which group the page belongs to — the group is a part of the route, not
   * of the URL, and the URL stays clean (FR-04).
   */
  const navigation = $derived(page.route.id?.startsWith('/(app)') ?? false);

  onMount(() => {
    // The connectivity drives the offline banner and the block of the
    // writes: both are read from the browser, never from the server.
    connectivityState.attach();

    // The install offer must be captured before the browser fires it.
    installState.attach();

    // The worker is registered in `prompt` mode: a new version waits until
    // the user accepts the reload. The banner that offers it is the update
    // prompt of the shell.
    void registerServiceWorker({
      onNeedRefresh: (applyUpdate) => pwaState.setNeedRefresh(applyUpdate),
      onOfflineReady: () => pwaState.setOfflineReady(),
      onRegisterError: (error) => pwaState.setError(error)
    });
  });
</script>

<AppShell title="VozLab" {navigation}>
  {@render children?.()}
</AppShell>
