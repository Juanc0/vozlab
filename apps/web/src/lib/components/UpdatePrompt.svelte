<script lang="ts">
  /**
   * The pending service-worker update.
   *
   * The worker is registered in `prompt` mode: a new version waits until the
   * user accepts the reload. The assets are **never** swapped silently in
   * the middle of a session — the update is offered, and only the offer
   * applies it.
   */
  import { pwaState } from '$lib/pwa/state.svelte';
  import { getLocaleState } from '$lib/state/context';

  const locale = getLocaleState();
  const t = locale.t;
</script>

{#if pwaState.needsRefresh}
  <div role="status" class="border-b border-accent-track bg-accent-soft">
    <div
      class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-body text-accent-ink"
    >
      <p class="font-medium">{t('update.available')}</p>
      <button
        type="button"
        class="btn btn-secondary"
        onclick={() => void pwaState.applyUpdate()}
      >
        {t('update.reload')}
      </button>
    </div>
  </div>
{/if}
