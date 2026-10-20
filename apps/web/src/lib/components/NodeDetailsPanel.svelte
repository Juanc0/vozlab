<script lang="ts">
  import { page } from '$app/state';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import { loadNodeProposalHistory, type NodeProposalHistory } from '$lib/api/proposals';
  import type { NodeDto } from '$lib/api/types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';
  import { getApiClient, getWorkspaceState } from '$lib/state/context';

  interface Props {
    /** The selected node, or `null` when nothing is selected. */
    node?: NodeDto | null;
  }

  let { node = null }: Props = $props();

  const api = getApiClient();
  const workspace = getWorkspaceState();

  let history = $state.raw<NodeProposalHistory | null>(null);
  let historyError = $state<ApiFailure | null>(null);
  let loadingHistory = $state(false);

  /** The id of the selected node; the history is reloaded when it changes. */
  const nodeId = $derived(node?.id ?? null);

  /** The counter that discards the answer of a superseded request. */
  let request = 0;

  $effect(() => {
    const id = nodeId;

    if (id === null) {
      history = null;
      historyError = null;
      loadingHistory = false;
      return;
    }

    const current = (request += 1);
    loadingHistory = true;
    historyError = null;
    history = null;

    void loadNodeProposalHistory(api, id)
      .then((result) => {
        if (current !== request) {
          return;
        }
        history = result;
        loadingHistory = false;
      })
      .catch(async (caught: unknown) => {
        if (current !== request) {
          return;
        }

        if (await redirectToLoginOnAuthFailure(caught, workspace, page.url.pathname)) {
          loadingHistory = false;
          return;
        }

        historyError = describeFailure(caught);
        loadingHistory = false;
      });
  });

  /** The attributes of the node, as a list of pairs. */
  const attributeEntries = $derived(
    Object.entries(node?.attributes ?? {}).sort(([left], [right]) => left.localeCompare(right))
  );

  /** Renders an attribute value: a string as it is, anything else as JSON. */
  function formatValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (value === null || value === undefined) {
      return '—';
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  /** A readable instant. */
  function formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
  }
</script>

{#if node === null}
  <p class="text-sm text-ink-muted">
    Select a node in the canvas or in the list to see its details.
  </p>
{:else}
  <div class="space-y-4">
    <div>
      <h3 class="text-base font-semibold tracking-tight">{node.title}</h3>
      <p class="mt-1 text-sm text-ink-muted">
        {#if node.description}
          {node.description}
        {:else}
          <span class="italic">No description.</span>
        {/if}
      </p>
    </div>

    <dl class="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
      <dt class="text-ink-muted">Ontology class</dt>
      <dd>{node.typeKey}</dd>

      <dt class="text-ink-muted">Status</dt>
      <dd>{node.status}</dd>

      <dt class="text-ink-muted">Community score</dt>
      <dd>{node.communityScore}</dd>

      <dt class="text-ink-muted">Author</dt>
      <dd class="font-mono text-xs break-all">{node.authorHash}</dd>

      <dt class="text-ink-muted">Created</dt>
      <dd>{formatDate(node.createdAt)}</dd>
    </dl>

    <section aria-labelledby="node-attributes-heading">
      <h4 id="node-attributes-heading" class="text-xs font-semibold tracking-wide uppercase">
        Ontology attributes
      </h4>

      {#if attributeEntries.length === 0}
        <p class="mt-1 text-sm text-ink-muted">This node carries no attribute.</p>
      {:else}
        <dl class="mt-1 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {#each attributeEntries as [key, value] (key)}
            <dt class="text-ink-muted">{key}</dt>
            <dd class="break-words">{formatValue(value)}</dd>
          {/each}
        </dl>
      {/if}
    </section>

    <section aria-labelledby="node-proposals-heading">
      <h4 id="node-proposals-heading" class="text-xs font-semibold tracking-wide uppercase">
        Edit-proposal history
      </h4>

      {#if loadingHistory}
        <p role="status" class="mt-1 text-sm text-ink-muted">Loading the proposals…</p>
      {:else if historyError}
        <p role="alert" class="mt-1 text-sm text-negative">
          <span class="font-mono">{historyError.code}</span> — {historyError.message}
        </p>
      {:else if history === null || history.proposals.length === 0}
        <p class="mt-1 text-sm text-ink-muted">No proposal targets this node.</p>
      {:else}
        <ul class="mt-2 space-y-2">
          {#each history.proposals as proposal (proposal.id)}
            <li class="rounded-md border border-line bg-surface-muted/40 p-2 text-sm">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-semibold">{proposal.kind}</span>
                <span class="rounded bg-surface px-1.5 py-0.5 text-xs text-ink-muted">
                  {proposal.status}
                </span>
                <span class="text-xs text-ink-muted">{formatDate(proposal.createdAt)}</span>
              </div>
              {#if proposal.justification}
                <p class="mt-1 text-ink-muted">{proposal.justification}</p>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      {#if history?.truncated}
        <p class="mt-2 text-xs text-warning">
          This history is <strong>partial</strong>: the API returned one bounded page of the
          workspace's proposals and more exist beyond it. The API cannot filter by target, so the
          history of this node is filtered from that page.
        </p>
      {/if}
    </section>
  </div>
{/if}
