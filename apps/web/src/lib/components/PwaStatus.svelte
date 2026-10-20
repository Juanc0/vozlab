<script lang="ts">
  /**
   * The state of the PWA itself.
   *
   * Two things the user must know about the offline support: the app is
   * ready to work offline (the shell is cached on the device), or the
   * service worker could not be registered (the app keeps working, but it
   * will not be available offline).
   */
  import { pwaState } from '$lib/pwa/state.svelte';

  /** The "ready to work offline" notice is dismissed by the user. */
  let dismissed = $state(false);
</script>

{#if pwaState.error !== null}
  <div role="alert" class="border-b border-negative/30 bg-negative/5">
    <div
      class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm"
    >
      <p class="text-ink">
        The offline support could not be enabled
        <span class="font-mono text-negative">{pwaState.error}</span>. The app keeps working, but it
        will not be available offline.
      </p>
    </div>
  </div>
{:else if pwaState.offlineReady && !dismissed}
  <div role="status" class="border-b border-line bg-surface">
    <div
      class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm"
    >
      <p class="text-ink">VozLab is ready to work offline: the app is cached on this device.</p>
      <button
        type="button"
        class="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
        onclick={() => {
          dismissed = true;
        }}
      >
        Got it
      </button>
    </div>
  </div>
{/if}
