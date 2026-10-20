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
</script>

{#if installState.canInstall}
  <div class="border-b border-line bg-surface">
    <div
      class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm"
    >
      <p class="text-ink">VozLab can be installed on this device and open in its own window.</p>
      <button
        type="button"
        class="rounded-md border border-line-strong-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
        onclick={() => void installState.install()}
      >
        Install VozLab
      </button>
    </div>
  </div>
{/if}
