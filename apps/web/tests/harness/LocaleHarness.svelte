<script lang="ts">
  /**
   * The harness of the language selector.
   *
   * It renders the shell and the selector together, exactly as the sidebar
   * does: the tests need a screen whose visible text changes with the
   * language, and a control that changes it.
   */
  import AppShell from '$lib/components/AppShell.svelte';
  import LocaleSelector from '$lib/components/LocaleSelector.svelte';
</script>

<AppShell title="VozLab">
  <LocaleSelector />
</AppShell>
