<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<section class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">Graph</h1>
    <p class="mt-2 max-w-prose text-ink-muted">
      The Cytoscape canvas with the <code>dagre</code> layout arrives in batch 3.4. This route
      names the batch it belongs to; it draws nothing yet and reads nothing from the API.
    </p>
  </div>

  <dl class="grid gap-4 rounded-card border border-line bg-surface p-4 sm:grid-cols-2">
    <div>
      <dt class="text-sm text-ink-muted">API base URL</dt>
      <dd class="mt-1 font-mono text-sm break-all"><code>{data.apiBaseUrl}</code></dd>
    </div>
    <div>
      <dt class="text-sm text-ink-muted">Source of truth</dt>
      <dd class="mt-1 text-sm">
        <code>PUBLIC_API_BASE_URL</code> — read at runtime on the server.
      </dd>
    </div>
  </dl>
</section>
