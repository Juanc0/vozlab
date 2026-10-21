<script lang="ts">
  /**
   * The "Atributos" tab of the inspector: the attributes of the selected
   * thing and the **actions** that may change it.
   *
   * The API is not symmetric here, and the interface says so:
   *
   * - a **relation** can be edited directly (`PATCH /api/v1/edges/:id`),
   *   but only by the person who created it;
   * - a **node** has no direct edition at all: the only way to change one
   *   is to propose a correction, and the author of the node decides.
   *
   * So the correction is always offered, and the direct edition only to the
   * author of a relation. The action that is not available is never a dead
   * button: it is either absent, or disabled **with the reason** next to it.
   */
  import type { EdgeDto, NodeDto } from '$lib/api/types';
  import type { CorrectionTarget } from '$lib/governance/correction';
  import { formatDeltaValue } from '$lib/governance/delta';
  import { getLocaleState, getSessionState } from '$lib/state/context';
  import EdgeEditForm from './EdgeEditForm.svelte';

  interface Props {
    /** The selected node — `null` when a relation (or nothing) is selected. */
    node?: NodeDto | null;
    /** The selected relation — `null` when a node (or nothing) is selected. */
    edge?: EdgeDto | null;
    /** Called when the user wants to propose a correction of the selection. */
    onsuggest?: (target: CorrectionTarget) => void;
    /** Called when the API saved a direct edition of the relation. */
    onsaved?: (edge: EdgeDto) => void;
  }

  let { node = null, edge = null, onsuggest, onsaved }: Props = $props();

  const locale = getLocaleState();
  const session = getSessionState();
  const t = locale.t;

  /** The pseudonym of the signed-in user — the comparison the API makes. */
  const authorHash = $derived(session.user?.authorHash ?? null);

  /**
   * `true` when the signed-in user created the selected relation.
   *
   * The API compares the caller's pseudonym with the author of the relation
   * and answers `403 ERR_AUTHORIZATION_FAILED` otherwise. The UI only
   * offers the action to the author — and it still shows the refusal.
   */
  const isAuthor = $derived(
    edge !== null && authorHash !== null && authorHash !== '' && edge.authorHash === authorHash
  );

  /** The attributes of the selected thing. */
  const attributes = $derived(node?.attributes ?? edge?.attributes ?? {});

  /** The attributes, as a list of pairs sorted by key. */
  const attributeEntries = $derived(
    Object.entries(attributes).sort(([left], [right]) => left.localeCompare(right))
  );

  /** `true` while the direct edition form is open. */
  let editing = $state(false);

  /**
   * Why the direct edition is not available — `null` when it is.
   *
   * The reason is never hidden: the action that is not offered says why,
   * in words, right where the reader is looking.
   */
  const directEditReason = $derived(
    edge !== null && !isAuthor
      ? t('inspector.editDirectlyForbidden')
      : node !== null
        ? t('inspector.nodeHasNoDirectEdit')
        : null
  );

  /**
   * The ids of the sections and of the reason.
   *
   * The component may be rendered more than once on a page, so the ids
   * cannot be fixed.
   */
  const uid = $props.id();
  const attributesHeadingId = `${uid}-attributes-heading`;
  const actionsHeadingId = `${uid}-actions-heading`;
  const reasonId = `${uid}-direct-edit-reason`;

  /** The relation the direct edition form is for. */
  const editableEdge = $derived(editing && isAuthor ? edge : null);

  /** Proposes a correction of the selection. */
  function suggest(): void {
    if (node !== null) {
      onsuggest?.({ kind: 'node', node });
      return;
    }

    if (edge !== null) {
      onsuggest?.({ kind: 'edge', edge });
    }
  }

  /**
   * The relation was edited: the inspector adopts the new state.
   *
   * The form stays open: it now shows the state the API saved, and the
   * user closes it when they are done.
   */
  function handleSaved(updated: EdgeDto): void {
    onsaved?.(updated);
  }
</script>

<section aria-labelledby={attributesHeadingId} class="space-y-3">
  <h3 id={attributesHeadingId}>
    {node !== null ? t('inspector.attributesOfNode') : t('inspector.attributesOfRelation')}
  </h3>

  {#if attributeEntries.length === 0}
    <p class="text-body text-muted">{t('inspector.noAttributes')}</p>
  {:else}
    <dl class="grid gap-x-4 gap-y-1 text-body sm:grid-cols-[auto_1fr]">
      {#each attributeEntries as [key, value] (key)}
        <dt class="text-muted">{key}</dt>
        <dd class="break-words">{formatDeltaValue(value)}</dd>
      {/each}
    </dl>
  {/if}
</section>

<section aria-labelledby={actionsHeadingId} class="space-y-2">
  <h3 id={actionsHeadingId}>
    {t('inspector.actionsHeading')}
  </h3>

  <div class="flex flex-wrap items-center gap-2">
    <!--
      The correction is always available: any member of the workspace may
      propose one, and it changes nothing until the author of the target
      approves it.
    -->
    <button
      type="button"
      class="btn btn-secondary"
      disabled={node === null && edge === null}
      aria-label={node !== null
        ? t('inspector.suggestCorrectionOfNode', { title: node.title })
        : edge !== null
          ? t('inspector.suggestCorrectionOfRelation', { relationKey: edge.relationKey })
          : undefined}
      onclick={suggest}
    >
      {t('inspector.suggestCorrection')}
    </button>

    <!--
      The direct edition of a relation is the author's alone. The button is
      shown but disabled when the user is not the author, and the reason is
      right next to it.
    -->
    {#if edge !== null}
      <button
        type="button"
        class="btn btn-secondary"
        disabled={!isAuthor}
        aria-describedby={directEditReason === null ? undefined : reasonId}
        onclick={() => {
          editing = !editing;
        }}
      >
        {t('inspector.editDirectly')}
      </button>
    {/if}
  </div>

  {#if directEditReason !== null}
    <p id={reasonId} class="text-small text-muted">
      {directEditReason}
    </p>
  {/if}

  {#if editableEdge !== null}
    <EdgeEditForm
      edge={editableEdge}
      onsaved={handleSaved}
      oncancel={() => {
        editing = false;
      }}
    />
  {/if}
</section>
