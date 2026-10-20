<script lang="ts">
  import { onMount } from 'svelte';
  import AppShell from '$lib/components/AppShell.svelte';
  import { registerServiceWorker } from '$lib/pwa/register';
  import { pwaState } from '$lib/pwa/state.svelte';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

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
