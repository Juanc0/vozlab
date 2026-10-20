<script lang="ts">
  import { page } from '$app/state';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import { loadNodeProposalHistory, type NodeProposalHistory } from '$lib/api/proposals';
  import type { NodeDto } from '$lib/api/types';
  import { redirectToLoginOnAuthFailure } from '$lib/auth/require-session';
  import { formatDate, formatNumber } from '$lib/i18n';
  import { getApiClient, getLocaleState, getWorkspaceState } from '$lib/state/context';

  interface Props {
    /** The selected node, or `null` when nothing is selected. */
    node?: NodeDto | null;
    /** Called when the user wants to relate this node to another one. */
    onrelate?: (node: NodeDto) => void;
    /**
     * Called when the user wants to propose a correction of this node.
     *
     * Any member of the workspace may propose one (FR-10): the control is
     * not gated on a role, and the API re-checks everything.
     */
    onsuggest?: (node: NodeDto) => void;
  }

  let { node = null, onrelate, onsuggest }: Props = $props();

  const api = getApiClient();
  const workspace = getWorkspaceState();
  const locale = getLocaleState();
  const t = locale.t;

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

        historyError = describeFailure(caught, t);
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
      return t('common.emptyValue');
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
</script>

{#if node === null}
  <p class="text-sm text-ink-muted">
    {t('node.selectPrompt')}
  </p>
{:else}
  <div class="space-y-4">
    <div>
      <h3 class="text-base font-semibold tracking-tight">{node.title}</h3>
      <p class="mt-1 text-sm text-ink-muted">
        {#if node.description}
          {node.description}
        {:else}
          <span class="italic">{t('node.noDescription')}</span>
        {/if}
      </p>

      <div class="mt-3 flex flex-wrap gap-2">
        {#if onrelate}
          <button
            type="button"
            class="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
            onclick={() => onrelate(node)}
          >
            {t('node.relate')}
          </button>
        {/if}

        <!--
          The correction of a node is a proposal: it changes nothing until
          the author of the node approves it. Any member may propose one.
        -->
        {#if onsuggest}
          <button
            type="button"
            class="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
            aria-label={t('node.suggestCorrectionLabel', { title: node.title })}
            onclick={() => onsuggest(node)}
          >
            {t('graph.suggestCorrection')}
          </button>
        {/if}

        <!--
          The discussion of a node lives in the discussions screen; the
          target is named in the query string (the workspace never is).
        -->
        <a
          href="/discussions?target={node.id}&type=NODE"
          class="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
        >
          {t('node.discuss')}
        </a>
      </div>
    </div>

    <dl class="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
      <dt class="text-ink-muted">{t('node.ontologyClass')}</dt>
      <dd>{node.typeKey}</dd>

      <dt class="text-ink-muted">{t('node.status')}</dt>
      <dd>{node.status}</dd>

      <dt class="text-ink-muted">{t('node.communityScore')}</dt>
      <dd>{formatNumber(locale.locale, node.communityScore)}</dd>

      <dt class="text-ink-muted">{t('node.author')}</dt>
      <dd class="font-mono text-xs break-all">{node.authorHash}</dd>

      <dt class="text-ink-muted">{t('node.created')}</dt>
      <dd>
        <time datetime={node.createdAt}>{formatDate(locale.locale, node.createdAt)}</time>
      </dd>
    </dl>

    <section aria-labelledby="node-attributes-heading">
      <h4 id="node-attributes-heading" class="text-xs font-semibold tracking-wide uppercase">
        {t('node.attributesHeading')}
      </h4>

      {#if attributeEntries.length === 0}
        <p class="mt-1 text-sm text-ink-muted">{t('node.noAttributes')}</p>
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
        {t('node.proposalHistoryHeading')}
      </h4>
      {#if loadingHistory}
        <p role="status" class="mt-1 text-sm text-ink-muted">{t('node.loadingProposals')}</p>
      {:else if historyError}
        <p role="alert" class="mt-1 text-sm text-negative">
          <span class="font-mono">{historyError.code}</span> — {historyError.message}
        </p>
      {:else if history === null || history.proposals.length === 0}
        <p class="mt-1 text-sm text-ink-muted">{t('node.noProposals')}</p>
      {:else}
        <ul class="mt-2 space-y-2">
          {#each history.proposals as proposal (proposal.id)}
            <li class="rounded-md border border-line bg-surface-muted/40 p-2 text-sm">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-semibold">{proposal.kind}</span>
                <span class="rounded bg-surface px-1.5 py-0.5 text-xs text-ink-muted">
                  {proposal.status}
                </span>
                <span class="text-xs text-ink-muted">
                  {formatDate(locale.locale, proposal.createdAt)}
                </span>
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
          {t('node.historyTruncated')}
        </p>
      {/if}
    </section>
  </div>
{/if}
