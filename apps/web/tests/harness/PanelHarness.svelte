<script lang="ts">
  /**
   * The harness of the drawer and of the sheet.
   *
   * The two panels are the same panel in two directions: the harness opens
   * one of them from a button, exactly as the header and the toolbar of the
   * application do, so the test can check the contract of a modal — the
   * focus goes in, it is trapped, <kbd>Escape</kbd> closes the panel and
   * the focus goes back to the button that opened it.
   */
  import Drawer from '$lib/components/Drawer.svelte';
  import Sheet from '$lib/components/Sheet.svelte';

  interface Props {
    /** Which panel the harness opens. */
    panel?: 'drawer' | 'sheet';
  }

  let { panel = 'drawer' }: Props = $props();

  let open = $state(false);
</script>

<button type="button" onclick={() => (open = true)}>Abrir el panel</button>

{#if panel === 'drawer'}
  <Drawer {open} onclose={() => (open = false)}>
    <a href="/proposals">Propuestas</a>
    <a href="/discussions">Debates</a>
  </Drawer>
{:else}
  <Sheet {open} onclose={() => (open = false)}>
    <a href="/proposals">Propuestas</a>
    <a href="/discussions">Debates</a>
  </Sheet>
{/if}
