<script lang="ts">
  /**
   * The harness of the language selector.
   *
   * The selector lives in the **shell**: the language changes the whole
   * interface, including the screens that have no navigation, so it is
   * part of the chrome and not of the navigation column.
   *
   * The harness renders the shell alone — the selector comes with it.
   */
  import AppShell from '$lib/components/AppShell.svelte';
</script>

<AppShell title="VozLab" />
