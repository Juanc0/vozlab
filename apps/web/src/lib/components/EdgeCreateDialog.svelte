<script lang="ts">
  /**
   * The relation creation form (FR-08).
   *
   * The source is the node the user picked in the canvas or in the list; the
   * relation and the target are chosen here.
   *
   * The picker only offers the relations the API would accept: the domain of
   * the relation must be the class of the source node, and the target must
   * satisfy the range. A form that offers an invalid relation teaches the
   * user to fail — the server would answer `422
   * ERR_INVALID_RELATION_DOMAIN_RANGE`.
   *
   * The server stays the authority: it re-checks the rule and its answer is
   * what the user sees when it refuses.
   */
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import { createEdge } from '$lib/api/graph';
  import type { NodeDto, OntologyResponseDto, SubgraphEdgeDto } from '$lib/api/types';
  import {
    displayNameOf,
    relationAccepts,
    relationsForSource
  } from '$lib/ontology/node-form';
  import { getApiClient } from '$lib/state/context';
  import ModalDialog from './ModalDialog.svelte';

  interface Props {
    /** `true` while the dialog is open. */
    open: boolean;
    /** The active ontology of the workspace; `null` while it is loading. */
    ontology: OntologyResponseDto | null;
    /** The source node of the relation. */
    source: NodeDto | null;
    /** The nodes of the workspace — the candidates for the target. */
    nodes?: NodeDto[];
    /** Called when the dialog must close. */
    onclose: () => void;
    /** Called with the relation the API created. */
    oncreated?: (edge: SubgraphEdgeDto) => void;
  }

  let { open, ontology, source, nodes = [], onclose, oncreated }: Props = $props();

  const api = getApiClient();
  const uid = $props.id();

  const introId = `edge-form-intro-${uid}`;
  const relationId = `edge-relation-${uid}`;
  const targetId = `edge-target-${uid}`;

  /** The relation the user picked. */
  let relationKey = $state('');

  /** The node the relation points at. */
  let targetNodeId = $state('');

  /** The messages of the invalid fields, keyed by the field key. */
  let errors = $state<Record<string, string>>({});

  /** The envelope of a failed creation. */
  let failure = $state<ApiFailure | null>(null);

  /** `true` while the request is in flight. */
  let submitting = $state(false);

  /** The relations the API would accept for the source node. */
  const relations = $derived(source === null ? [] : relationsForSource(ontology, source.typeKey));

  /** The relation the user picked. */
  const relation = $derived(
    relations.find((candidate) => candidate.systemKey === relationKey) ?? null
  );

  /** The name of the range class of the chosen relation. */
  const rangeLabel = $derived(
    relation === null
      ? null
      : displayNameOf(
          ontology?.classes.find((cls) => cls.systemKey === relation.rangeClassKey)?.displayNames,
          relation.rangeClassKey
        )
  );

  /** The nodes the API would accept as the target of the chosen relation. */
  const targets = $derived(
    relation === null || source === null
      ? []
      : nodes.filter(
          (node) =>
            node.id !== source.id &&
            relationAccepts(relation, source.typeKey, node.typeKey)
        )
  );

  /** The node the user picked as the target. */
  const target = $derived(targets.find((node) => node.id === targetNodeId) ?? null);
  /** A fresh form every time the dialog opens. */
  $effect(() => {
    if (!open) {
      return;
    }

    relationKey = '';
    targetNodeId = '';
    errors = {};
    failure = null;
  });

  /** The first relation, when the user has not picked one. */
  $effect(() => {
    if (relationKey === '' && relations.length > 0) {
      relationKey = relations[0].systemKey;
    }
  });

  /** Picks the relation; the target of the previous one does not apply. */
  function selectRelation(key: string): void {
    relationKey = key;
    targetNodeId = '';
  }

  /** Sends the form. */
  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    failure = null;

    const current = relation;
    const currentSource = source;

    if (current === null || currentSource === null) {
      return;
    }

    const nextErrors: Record<string, string> = {};

    if (targetNodeId === '') {
      nextErrors['target'] = 'Pick the node the relation points at.';
    }

    errors = nextErrors;

    if (Object.keys(nextErrors).length > 0) {
      document.getElementById(targetId)?.focus();
      return;
    }

    submitting = true;

    let created: SubgraphEdgeDto;
    try {
      created = await createEdge(api, {
        sourceNodeId: currentSource.id,
        targetNodeId,
        relationKey: current.systemKey,
        attributes: {}
      });
    } catch (caught) {
      // The envelope of the API — the code and the message — is what the
      // user sees. The form keeps what the user typed.
      failure = describeFailure(caught);
      submitting = false;
      return;
    }

    submitting = false;
    oncreated?.(created);
    onclose();
  }
</script>

<ModalDialog {open} title="Relate two nodes" {onclose} describedby={introId}>
  <p id={introId} class="text-sm text-ink-muted">
    A relation is created <strong>pending</strong>: the community reviews it before it joins the
    graph. Only the relations the ontology allows for this node are offered.
  </p>

  {#if source === null}
    <p class="mt-4 text-sm text-ink-muted">
      Pick a node in the canvas or in the list before relating it to another one.
    </p>
  {:else if ontology === null}
    <p role="status" class="mt-4 text-sm text-ink-muted">Loading the ontology…</p>
  {:else if relations.length === 0}
    <p class="mt-4 text-sm text-ink-muted">
      The active ontology declares no relation whose domain is
      <span class="font-mono text-xs">{source.typeKey}</span>: there is nothing to relate this node
      with yet.
    </p>
  {:else}
    <form class="mt-4 space-y-5" onsubmit={submit} novalidate>
      <div>
        <span class="block text-sm font-medium text-ink">From</span>
        <p class="mt-1 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm">
          {source.title}
          <span class="block text-xs text-ink-muted">{source.typeKey}</span>
        </p>
      </div>

      <div>
        <label for={relationId} class="block text-sm font-medium text-ink">
          Relation <span class="font-normal text-ink-muted">(required)</span>
        </label>
        <select
          id={relationId}
          class="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
          value={relationKey}
          onchange={(event) => {
            selectRelation(event.currentTarget.value);
          }}
        >
          {#each relations as candidate (candidate.systemKey)}
            <option value={candidate.systemKey}>
              {displayNameOf(candidate.displayNames, candidate.systemKey)}
            </option>
          {/each}
        </select>
        {#if relation !== null}
          <p class="mt-1 text-xs text-ink-muted">
            <span class="font-mono">{relation.systemKey}</span> — from
            <span class="font-mono">{relation.domainClassKey}</span> to
            <span class="font-mono">{relation.rangeClassKey}</span>.
          </p>
        {/if}
      </div>

      <div>
        <label for={targetId} class="block text-sm font-medium text-ink">
          To <span class="font-normal text-ink-muted">(required)</span>
        </label>
        <select
          id={targetId}
          class="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
          aria-invalid={errors['target'] === undefined ? undefined : 'true'}
          aria-describedby={errors['target'] === undefined ? undefined : `${targetId}-error`}
          value={targetNodeId}
          onchange={(event) => {
            targetNodeId = event.currentTarget.value;
          }}
        >
          <option value="">—</option>
          {#each targets as candidate (candidate.id)}
            <option value={candidate.id}>{candidate.title}</option>
          {/each}
        </select>

        {#if targets.length === 0}
          <p class="mt-1 text-xs text-ink-muted">
            No node of the range class
            {#if rangeLabel !== null}
              <span class="font-mono">{rangeLabel}</span>
            {/if}
            exists in this workspace: create one first.
          </p>
        {:else if target !== null}
          <p class="mt-1 text-xs text-ink-muted">
            The relation will point at <span class="font-medium">{target.title}</span>.
          </p>
        {/if}

        <p class="mt-1 text-xs text-ink-muted">
          The candidates are taken from the {nodes.length}
          {nodes.length === 1 ? 'node' : 'nodes'} of the workspace that the list above holds.
        </p>

        {#if errors['target'] !== undefined}
          <p id={`${targetId}-error`} class="mt-1 text-sm text-negative">{errors['target']}</p>
        {/if}
      </div>

      {#if failure !== null}
        <div role="alert" class="rounded-md border border-negative/30 bg-negative/5 p-3 text-sm">
          <p class="font-mono font-semibold text-negative">{failure.code}</p>
          <p class="mt-1 text-ink">{failure.message}</p>
          <p class="mt-1 text-xs text-ink-muted">
            The form kept what you typed: nothing was created.
          </p>
        </div>
      {/if}

      <div class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          class="rounded-md bg-brand-900 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting}
        >
          {submitting ? 'Creating…' : 'Create the relation'}
        </button>
        <button
          type="button"
          class="rounded-md border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
          onclick={onclose}
        >
          Cancel
        </button>
      </div>
    </form>
  {/if}
</ModalDialog>
