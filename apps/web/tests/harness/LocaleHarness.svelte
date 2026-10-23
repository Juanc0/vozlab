<script lang="ts">
  /**
   * The harness of the language selector.
   *
   * The selector sits at the bottom of the **navigation column**: the
   * language changes the whole interface, and the column is the one
   * surface every signed-in screen keeps. The shell renders besides it so
   * a switch of the language is also a switch of the copy of the chrome.
   */
  import AppSidebar from '$lib/components/AppSidebar.svelte';
  import AppShell from '$lib/components/AppShell.svelte';
</script>

<AppShell />
<AppSidebar />
