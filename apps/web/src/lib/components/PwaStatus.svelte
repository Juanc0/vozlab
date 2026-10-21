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
  import { getLocaleState } from '$lib/state/context';

  const locale = getLocaleState();
  const t = locale.t;

  /** The "ready to work offline" notice is dismissed by the user. */
  let dismissed = $state(false);
</script>

{#if pwaState.error !== null}
  <div role="alert" class="border-b border-rule bg-surface">
    <div
      class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-body"
    >
      <p class="text-text">
        {t('pwa.errorTitle')}
        <span class="font-mono text-pill-negative-ink">{pwaState.error}</span>. {t('pwa.errorHint')}
      </p>
    </div>
  </div>
{:else if pwaState.offlineReady && !dismissed}
  <div role="status" class="border-b border-rule bg-surface">
    <div
      class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-body"
    >
      <p class="text-text">{t('pwa.offlineReady')}</p>
      <button
        type="button"
        class="btn btn-secondary"
        onclick={() => {
          dismissed = true;
        }}
      >
        {t('pwa.dismiss')}
      </button>
    </div>
  </div>
{/if}
