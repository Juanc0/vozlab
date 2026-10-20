<script lang="ts">
  /**
   * The connectivity banner.
   *
   * The app is online-first and read-only offline: the reads may come from
   * the cache, the writes are refused. The banner says so **before** the
   * user tries, and it says that nothing is queued in the meantime — there
   * is no background sync of the mutations.
   *
   * It is a `status` region: the change of the connectivity is announced
   * without stealing the focus.
   */
  import { connectivityState } from '$lib/pwa/connectivity.svelte';
  import { getLocaleState } from '$lib/state/context';

  const locale = getLocaleState();
  const t = locale.t;
</script>

{#if connectivityState.offline}
  <div role="status" class="border-b border-warning/40 bg-warning/10">
    <div
      class="mx-auto flex w-full max-w-6xl flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-2 text-sm text-ink"
    >
      <span class="font-semibold">{t('offline.heading')}</span>
      <span>{t('offline.text')}</span>
    </div>
  </div>
{/if}
