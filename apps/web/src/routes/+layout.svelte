<script lang="ts">
  import { onMount } from 'svelte';
  import AppShell from '$lib/components/AppShell.svelte';
  import { ApiClient } from '$lib/api/client';
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

  provideAppState({ session, workspace, api });

  onMount(() => {
    // The worker is registered in `prompt` mode: a new version waits until the
    // user accepts the reload. The banner that offers it lands in batch 3.6.
    void registerServiceWorker({
      onNeedRefresh: (applyUpdate) => pwaState.setNeedRefresh(applyUpdate),
      onOfflineReady: () => pwaState.setOfflineReady(),
      onRegisterError: (error) => pwaState.setError(error)
    });
  });
</script>

<AppShell title="VozLab">
  {@render children?.()}
</AppShell>
