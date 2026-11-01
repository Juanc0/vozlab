<script lang="ts">
  /**
   * The "Contenido" tab of the inspector: **what the selected thing is**.
   *
   * A node shows its title, its description, its class, its status, its
   * author pseudonym, its community score and its dates — and its score
   * can be voted. A relation shows its key, its two ends and its score.
   *
   * The vote buttons live here: the score of a node and of a relation is
   * the score the community gives it, and the vote is optimistic (it moves
   * before the request leaves the app and rolls back when the API refuses
   * it).
   */
  import type { EdgeDto, NodeDto } from '$lib/api/types';
  import type { VoteLedger } from '$lib/governance/vote.svelte';
  import { displayName } from '$lib/i18n/display-name';
  import { formatDate, formatNumber } from '$lib/i18n';
  import { getLocaleState, getSessionState, getWorkspaceState, getApiClient } from '$lib/state/context';
  import { connectivityState } from '$lib/pwa/connectivity.svelte';
  import { OfflineError } from '$lib/api/errors';
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import { activateEdge, activateNode, autoActivateEdge, autoActivateNode, rejectEdge, rejectNode } from '$lib/api/graph';
  import VoteButtons from './VoteButtons.svelte';

  interface Props {
    /** The selected node — `null` when a relation (or nothing) is selected. */
    node?: NodeDto | null;
    /** The selected relation — `null` when a node (or nothing) is selected. */
    edge?: EdgeDto | null;
    /** The nodes of the view on screen — the ends of a relation are among them. */
    nodes?: NodeDto[];
    /** The session-local state of the votes. */
    ledger: VoteLedger;
    /**
     * Re-reads the score of a relation after the API counted the vote.
     *
     * The API has no read for the interactions, so the client cannot know
     * whether a vote was counted — the same type is idempotent and does not
     * move the counter again.
     */
    reconcileEdge?: (edgeId: string) => Promise<number | null>;
    /**
     * Re-reads the score of a node after the API counted the vote.
     *
     * The vote of a node is the same optimistic move as the vote of a
     * relation: it moves before the request leaves the app, and the
     * server's number replaces it once it is known.
     */
    reconcileNode?: (nodeId: string) => Promise<number | null>;
    /** Called when the user wants to relate the selected node to another one. */
    onrelate?: (node: NodeDto) => void;
  }

  let {
    node: nodeProp = null,
    edge: edgeProp = null,
    nodes = [],
    ledger,
    reconcileEdge,
    reconcileNode,
    onrelate
  }: Props = $props();

  // Local copies so the governance actions can update the status optimistically.
  // svelte-ignore state_referenced_locally
  let node = $state<NodeDto | null>(nodeProp);
  // svelte-ignore state_referenced_locally
  let edge = $state<EdgeDto | null>(edgeProp);
  $effect(() => {
    node = nodeProp;
  });
  $effect(() => {
    edge = edgeProp;
  });

  const session = getSessionState();
  const workspace = getWorkspaceState();
  const api = getApiClient();
  const locale = getLocaleState();
  const t = locale.t;

  const authorHash = $derived(session.user?.authorHash ?? null);

  const isAuthorNode = $derived(
    node !== null && authorHash !== null && authorHash !== '' && node.authorHash === authorHash
  );
  const isAuthorEdge = $derived(
    edge !== null && authorHash !== null && authorHash !== '' && edge.authorHash === authorHash
  );

  const canGovernNode = $derived(isAuthorNode || workspace.isModerator);
  const canGovernEdge = $derived(isAuthorEdge || workspace.isModerator);

  const canAutoNode = $derived(workspace.isModerator && (node?.communityScore ?? 0) >= 10);
  const canAutoEdge = $derived(workspace.isModerator && (edge?.communityScore ?? 0) >= 10);

  let resolving = $state(false);
  let actionError = $state<ApiFailure | null>(null);
  let notice = $state<string | null>(null);

  async function governNode(action: 'approve' | 'reject' | 'auto'): Promise<void> {
    if (node === null) return;
    await govern('node', action, node.id);
  }
  async function governEdge(action: 'approve' | 'reject' | 'auto'): Promise<void> {
    if (edge === null) return;
    await govern('edge', action, edge.id);
  }

  async function govern(kind: 'node' | 'edge', action: 'approve' | 'reject' | 'auto', id: string): Promise<void> {
    if (resolving) return;
    resolving = true;
    actionError = null;
    notice = null;

    if (connectivityState.offline) {
      actionError = describeFailure(new OfflineError(), t);
      resolving = false;
      return;
    }

    const previousNodeStatus = node?.status;
    const previousEdgeStatus = edge?.status;
    const optimisticStatus = action === 'reject' ? 'REJECTED' : 'ACTIVE';

    if (kind === 'node' && node !== null) {
      node = { ...node, status: optimisticStatus as NodeDto['status'] };
    }
    if (kind === 'edge' && edge !== null) {
      edge = { ...edge, status: optimisticStatus as EdgeDto['status'] };
    }

    try {
      const result =
        kind === 'node'
          ? action === 'approve'
            ? await activateNode(api, id)
            : action === 'reject'
              ? await rejectNode(api, id)
              : await autoActivateNode(api, id)
          : action === 'approve'
            ? await activateEdge(api, id)
            : action === 'reject'
              ? await rejectEdge(api, id)
              : await autoActivateEdge(api, id);

      if (kind === 'node' && node !== null) {
        node = { ...node, status: result.status as NodeDto['status'] };
      }
      if (kind === 'edge' && edge !== null) {
        edge = { ...edge, status: result.status as EdgeDto['status'] };
      }
      notice = t('inspector.nowStatus', {
        status: locale.status(kind === 'node' ? 'node' : 'edge', result.status)
      });
    } catch (caught) {
      if (kind === 'node' && node !== null && previousNodeStatus !== undefined) {
        node = { ...node, status: previousNodeStatus };
      }
      if (kind === 'edge' && edge !== null && previousEdgeStatus !== undefined) {
        edge = { ...edge, status: previousEdgeStatus };
      }
      actionError = describeFailure(caught, t);
    } finally {
      resolving = false;
    }
  }

  /** The title of a node of the view — the ends of a relation are among them. */
  function titleOf(nodeId: string): string {
    return nodes.find((candidate) => candidate.id === nodeId)?.title ?? nodeId;
  }
</script>

{#if node !== null}
  <article class="space-y-4">
    <header>
      <h3 class="text-section font-semibold">{node.title}</h3>
      <p class="mt-1 text-body text-muted">
        {#if node.description}
          {node.description}
        {:else}
          <span class="italic">{t('node.noDescription')}</span>
        {/if}
      </p>
    </header>

    <dl class="grid gap-x-4 gap-y-2 text-body sm:grid-cols-[auto_1fr]">
      <dt class="text-muted">{t('inspector.nodeType')}</dt>
      <dd>{displayName(node.typeDisplayNames, locale.locale, node.typeKey)}</dd>

      <dt class="text-muted">{t('inspector.status')}</dt>
      <dd>{locale.status('node', node.status)}</dd>

      <dt class="text-muted">{t('inspector.score')}</dt>
      <dd>{formatNumber(locale.locale, ledger.score(node.id, node.communityScore))}</dd>

      <dt class="text-muted">{t('inspector.author')}</dt>
      <dd class="font-mono text-small break-all">{node.authorHash}</dd>

      <dt class="text-muted">{t('inspector.created')}</dt>
      <dd>
        <time datetime={node.createdAt}>{formatDate(locale.locale, node.createdAt)}</time>
      </dd>
    </dl>

    <!--
      The vote of the node: the same optimistic move as the vote of a
      relation. The score the reader sees is the one the ledger holds —
      the server's number, plus or minus the votes in flight.
    -->
    <section aria-labelledby="inspector-node-vote-heading">
      <h3 id="inspector-node-vote-heading">
        {t('vote.score')}
      </h3>
      <div class="mt-1">
        <VoteButtons
          {ledger}
          targetId={node.id}
          targetType="NODE"
          score={node.communityScore}
          label={node!.title}
          reconcile={reconcileNode ? () => reconcileNode(node!.id) : undefined}
        />
      </div>
    </section>

    {#if onrelate}
      <button
        type="button"
        class="btn btn-secondary"
        onclick={() => onrelate(node!)}
      >
        {t('inspector.relate')}
      </button>
    {/if}

    {#if canGovernNode}
      <section aria-labelledby="inspector-node-governance-heading">
        <h3 id="inspector-node-governance-heading">{t('inspector.actionsHeading')}</h3>
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="btn btn-primary"
            disabled={resolving}
            onclick={() => void governNode('approve')}
          >
            {t('inspector.approve')}
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            disabled={resolving}
            onclick={() => void governNode('reject')}
          >
            {t('inspector.reject')}
          </button>
          {#if canAutoNode}
            <button
              type="button"
              class="btn btn-secondary"
              disabled={resolving}
              onclick={() => void governNode('auto')}
            >
              {t('proposals.autoApply')}
            </button>
          {/if}
        </div>
        {#if notice}
          <p role="status" class="mt-1 rounded-control bg-raised p-2 text-body">
            {notice}
          </p>
        {/if}
        {#if actionError}
          <p role="alert" class="mt-1 rounded-control bg-pill-negative-bg p-2 text-body text-pill-negative-ink">
            <span class="font-mono">{actionError.code}</span> — {actionError.message}
          </p>
        {/if}
      </section>
    {/if}
  </article>
{:else if edge !== null}
  <article class="space-y-4">
    <header>
      <h3 class="text-section font-semibold">
        {displayName(edge.relationDisplayNames, locale.locale, edge.relationKey)}
      </h3>
    </header>

    <dl class="grid gap-x-4 gap-y-2 text-body sm:grid-cols-[auto_1fr]">
      <dt class="text-muted">{t('inspector.relationKey')}</dt>
      <dd>{edge.relationKey}</dd>

      <dt class="text-muted">{t('inspector.source')}</dt>
      <dd>
        {titleOf(edge.sourceNodeId)}
        <span class="block font-mono text-small break-all text-muted">{edge.sourceNodeId}</span>
      </dd>

      <dt class="text-muted">{t('inspector.target')}</dt>
      <dd>
        {titleOf(edge.targetNodeId)}
        <span class="block font-mono text-small break-all text-muted">{edge.targetNodeId}</span>
      </dd>
      <dt class="text-muted">{t('inspector.status')}</dt>
      <dd>{locale.status('edge', edge.status)}</dd>

      <dt class="text-muted">{t('inspector.score')}</dt>
      <dd>{formatNumber(locale.locale, edge.communityScore)}</dd>

      <dt class="text-muted">{t('inspector.author')}</dt>
      <dd class="font-mono text-small break-all">{edge.authorHash}</dd>

      <dt class="text-muted">{t('inspector.created')}</dt>
      <dd>
        <time datetime={edge.createdAt}>{formatDate(locale.locale, edge.createdAt)}</time>
      </dd>
    </dl>

    <section aria-labelledby="inspector-vote-heading">
      <h3 id="inspector-vote-heading">
        {t('vote.score')}
      </h3>
      <div class="mt-1">
        <VoteButtons
          {ledger}
          targetId={edge.id}
          targetType="EDGE"
          score={edge.communityScore}
          label={t('graph.voteRelationLabel', {
            relationKey: displayName(edge.relationDisplayNames, locale.locale, edge.relationKey)
          })}
          reconcile={reconcileEdge ? () => reconcileEdge(edge!.id) : undefined}
        />
      </div>
    </section>

    {#if canGovernEdge}
      <section aria-labelledby="inspector-edge-governance-heading">
        <h3 id="inspector-edge-governance-heading">{t('inspector.actionsHeading')}</h3>
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="btn btn-primary"
            disabled={resolving}
            onclick={() => void governEdge('approve')}
          >
            {t('inspector.approve')}
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            disabled={resolving}
            onclick={() => void governEdge('reject')}
          >
            {t('inspector.reject')}
          </button>
          {#if canAutoEdge}
            <button
              type="button"
              class="btn btn-secondary"
              disabled={resolving}
              onclick={() => void governEdge('auto')}
            >
              {t('proposals.autoApply')}
            </button>
          {/if}
        </div>
        {#if notice}
          <p role="status" class="mt-1 rounded-control bg-raised p-2 text-body">
            {notice}
          </p>
        {/if}
        {#if actionError}
          <p role="alert" class="mt-1 rounded-control bg-pill-negative-bg p-2 text-body text-pill-negative-ink">
            <span class="font-mono">{actionError.code}</span> — {actionError.message}
          </p>
        {/if}
      </section>
    {/if}
  </article>
{:else}
  <p class="text-body text-muted">{t('inspector.emptySelection')}</p>
{/if}
