<script lang="ts">
  /**
   * The install offer.
   *
   * The control appears **only** when the browser captured a
   * `beforeinstallprompt` event: Firefox and Safari never fire it, and a
   * button that cannot do anything must not be shown. `appinstalled` takes
   * the offer away.
   */
  import { installState } from '$lib/pwa/install.svelte';
  import { getLocaleState } from '$lib/state/context';

  const locale = getLocaleState();
  const t = locale.t;
</script>

{#if installState.canInstall}
  <div class="border-b border-line bg-surface">
    <div
      class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm"
    >
      <p class="text-ink">{t('install.message')}</p>
      <button
        type="button"
        class="rounded-md border border-line-strong-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
        onclick={() => void installState.install()}
      >
        {t('install.action')}
      </button>
    </div>
  </div>
{/if}
