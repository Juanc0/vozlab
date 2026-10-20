<script lang="ts">
  /**
   * The delta of a proposal — what it would change (FR-10).
   *
   * `proposedChanges` is a JSONB payload the DTO does not describe, so it is
   * rendered field by field and never assumed. A `MERGE` proposal is the one
   * case with a known shape: it names the **surviving** node in
   * `mergeIntoNodeId` (ADR-0026). The payload is narrowed with the shared
   * Zod schema; a malformed one is reported and the rest of the view keeps
   * working.
   */
  import type { ProposalDto } from '$lib/api/types';
  import { deltaEntries, formatDeltaValue, isPlainObject, readMergeTarget } from '$lib/governance/delta';

  interface Props {
    /** The proposal whose delta is shown. */
    proposal: ProposalDto;
    /** The title of the surviving node, when the app could read it. */
    mergeTargetLabel?: string | null;
  }

  let { proposal, mergeTargetLabel = null }: Props = $props();

  /** The fields of the delta, sorted by name. */
  const entries = $derived(deltaEntries(proposal.proposedChanges));

  /** The surviving node of a `MERGE` proposal, when the payload names one. */
  const mergeTarget = $derived(
    proposal.kind === 'MERGE' ? readMergeTarget(proposal.proposedChanges) : null
  );
</script>

{#if proposal.kind === 'MERGE' && mergeTarget !== null}
  {#if mergeTarget.kind === 'node'}
    <p class="text-sm">
      This proposal merges the target into the surviving node
      <strong>{mergeTargetLabel ?? 'the node below'}</strong>
      <span class="font-mono text-xs break-all text-ink-muted">{mergeTarget.mergeIntoNodeId}</span>
    </p>
  {:else}
    <p role="alert" class="text-sm text-negative">
      The payload of this merge proposal does not name a surviving node ({mergeTarget.reason}).
    </p>
  {/if}
{/if}

{#if entries.length === 0}
  <p class="text-sm text-ink-muted">This proposal carries no change.</p>
{:else}
  <dl class="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
    {#each entries as entry (entry.field)}
      <dt class="text-ink-muted">{entry.field}</dt>
      <dd class="break-words">
        {#if isPlainObject(entry.value)}
          <dl class="grid gap-x-3 gap-y-0.5 sm:grid-cols-[auto_1fr]">
            {#each Object.entries(entry.value) as [field, value] (field)}
              <dt class="text-ink-muted">{field}</dt>
              <dd>{formatDeltaValue(value)}</dd>
            {/each}
          </dl>
        {:else}
          {formatDeltaValue(entry.value)}
        {/if}
      </dd>
    {/each}
  </dl>
{/if}
