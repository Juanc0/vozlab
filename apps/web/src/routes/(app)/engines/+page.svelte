<script lang="ts">
  /**
   * The **comparison of the engines** — a development-only surface.
   *
   * It is rendered **only** in a development build, and the code behind it
   * is imported dynamically behind a build-time constant: a production
   * build does not contain the comparison, its panels, the WebGL renderer
   * or the force layout of Cytoscape. The route answers with nothing.
   *
   * The comparison is a **client** surface: it draws on canvases and it
   * needs a browser, so it is mounted after the first paint.
   */
  import { onMount } from 'svelte';
  import { isDevelopmentBuild } from '$lib/config/environment';

  /**
   * The module of the comparison, or `null` in a production build.
   *
   * The constant is `import.meta.env.DEV`: the bundler replaces it with
   * `false` in a production build and the branch — with the import of the
   * comparison and of the two engines — is removed from the bundle.
   */
  const comparison = import.meta.env.DEV
    ? () => import('$lib/dev/engines/EngineComparison.svelte')
    : null;

  let mounted = $state(false);

  onMount(() => {
    mounted = true;
  });
</script>

{#if mounted && isDevelopmentBuild() && comparison !== null}
  {#await comparison() then { default: Comparison }}
    <Comparison />
  {/await}
{/if}
