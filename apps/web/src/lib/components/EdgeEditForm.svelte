<script lang="ts">
  /**
   * The **direct** edition of a relation (`PATCH /api/v1/edges/:id`).
   *
   * This is the one place where the interface changes something without a
   * proposal: the API lets the **author** of a relation edit its key and
   * its attributes in place. A node has no such route — the only way to
   * change a node is a correction proposal, and the author of the node
   * decides.
   *
   * The form sends **only what changes**: the attributes are merged into
   * the ones of the relation, so an unchanged attribute in the body would
   * claim a change that is not one. The API re-checks the authorship and
   * answers `403 ERR_AUTHORIZATION_FAILED` otherwise; the refusal is shown
   * with its code and its message, and the form **keeps what was typed**.
   */
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import { updateEdge, type UpdateEdgeInput } from '$lib/api/graph';
  import type { EdgeDto } from '$lib/api/types';
  import {
    ATTRIBUTE_VALUE_TYPES,
    ATTRIBUTE_VALUE_TYPE_LABELS,
    appendAttributeRow,
    buildCorrection,
    edgeSnapshot,
    initialAttributeRows,
    retypeAttributeRow,
    type AttributeRow,
    type AttributeValueType
  } from '$lib/governance/correction';
  import { isPlainObject } from '$lib/governance/delta';
  import { formatNumber } from '$lib/i18n';
  import { getApiClient, getLocaleState } from '$lib/state/context';

  interface Props {
    /** The relation to edit. */
    edge: EdgeDto;
    /** Called with the relation the API saved. */
    onsaved?: (edge: EdgeDto) => void;
    /** Called when the user closes the form. */
    oncancel?: () => void;
  }

  let { edge, onsaved, oncancel }: Props = $props();

  const api = getApiClient();
  const locale = getLocaleState();
  const t = locale.t;

  const uid = $props.id();
  const relationKeyId = `edge-edit-relationKey-${uid}`;
  const changesHeadingId = `edge-edit-changes-${uid}`;

  /** What the user typed. */
  let relationKey = $state('');
  let rows = $state<AttributeRow[]>([]);

  /** The outcome of the last save. */
  let failure = $state<ApiFailure | null>(null);
  let notice = $state<string | null>(null);

  /** `true` while the request is in flight. */
  let submitting = $state(false);

  /** `true` once the user tried to save the form. */
  let attempted = $state(false);

  /** The counter of the rows of the editor. */
  let rowCounter = 0;

  /**
   * Fills the form with the state of the relation.
   *
   * The effect reads the relation and nothing else: what the user types is
   * never overwritten by it.
   */
  $effect(() => {
    const current = edge;

    relationKey = current.relationKey;
    rows = initialAttributeRows(current.attributes ?? {}, nextRowId);
  });

  /** The delta and the diff of the form. */
  const build = $derived.by(() =>
    buildCorrection(edgeSnapshot(edge), {
      kind: 'EDGE',
      relationKey,
      rows,
      justification: ''
    })
  );

  /** The fields the form refuses to send. */
  const invalid = $derived(build.invalid);

  /** The fields the edition changes. */
  const changed = $derived(build.changed);

  /** The id of the next row of the editor. */
  function nextRowId(): string {
    rowCounter += 1;
    return `row-${rowCounter}`;
  }

  /** The id of the key input of a row. */
  function keyInputId(row: AttributeRow): string {
    return `${uid}-attr-${row.id}-key`;
  }

  /** The id of the value input of a row. */
  function valueInputId(row: AttributeRow): string {
    return `${uid}-attr-${row.id}-value`;
  }

  /** The id of the type picker of a row. */
  function typeInputId(row: AttributeRow): string {
    return `${uid}-attr-${row.id}-type`;
  }

  /** Adds an empty attribute row. */
  function addRow(): void {
    rows = appendAttributeRow(rows, nextRowId);
  }

  /** Removes a row the user added. */
  function removeRow(rowId: string): void {
    rows = rows.filter((row) => row.id !== rowId);
  }

  /** Changes the declared type of a row. */
  function changeType(rowId: string, type: AttributeValueType): void {
    rows = rows.map((row) => (row.id === rowId ? retypeAttributeRow(row, type) : row));
  }

  /**
   * The body of the request.
   *
   * The API takes `relationKey` and `attributes`; the form only sends the
   * ones that change.
   */
  function payloadOf(changes: Record<string, unknown>): UpdateEdgeInput {
    const payload: { relationKey?: string; attributes?: Record<string, unknown> } = {};

    const key = changes['relationKey'];
    if (typeof key === 'string') {
      payload.relationKey = key;
    }

    const attributes = changes['attributes'];
    if (isPlainObject(attributes)) {
      payload.attributes = attributes;
    }

    return payload;
  }

  /** Saves the edition. */
  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    failure = null;
    notice = null;
    attempted = true;

    const current = build;

    if (current.invalid.length > 0 || !current.hasChanges) {
      return;
    }

    submitting = true;

    try {
      const updated = await updateEdge(api, edge.id, payloadOf(current.proposedChanges));
      notice = t('inspector.edgeSaved');
      onsaved?.(updated);
    } catch (caught) {
      // The envelope of the API — the code and the message — is what the
      // user sees. The form keeps what the user typed.
      failure = describeFailure(caught, t);
    } finally {
      submitting = false;
    }
  }

  /** The message of the error of a field, when it has one. */
  function errorOf(key: string): string | null {
    const message = invalid.find((field) => field.key === key)?.message;
    return message === undefined ? null : t(message.key, message.params);
  }
</script>

<form class="mt-3 space-y-3 rounded-control bg-raised p-3" onsubmit={submit} novalidate>
  <div>
    <label for={relationKeyId} class="field-label">
      {t('correction.relationKeyLabel')}
    </label>
    <input
      id={relationKeyId}
      type="text"
      maxlength="100"
      aria-invalid={errorOf('relationKey') === null ? undefined : 'true'}
      aria-describedby={errorOf('relationKey') === null ? undefined : `${relationKeyId}-error`}
      class="field mt-1 w-full"
      value={relationKey}
      oninput={(event) => {
        relationKey = event.currentTarget.value;
      }}
    />
    {#if errorOf('relationKey') !== null}
      <p id={`${relationKeyId}-error`} class="mt-1 text-body text-pill-negative-ink">{errorOf('relationKey')}</p>
    {/if}
  </div>

  <fieldset>
    <legend class="font-semibold">{t('correction.attributesLegend')}</legend>

    {#if rows.length === 0}
      <p class="mt-1 text-body text-muted">{t('correction.noAttributes')}</p>
    {:else}
      <ul class="mt-2 space-y-2">
        {#each rows as row, index (row.id)}
          <li
            class="grid items-end gap-2 rounded-control bg-surface p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_auto]"
          >
            <div>
              <label for={keyInputId(row)} class="sr-only">
                {t('correction.keyLabel', { index: index + 1 })}
              </label>
              <input
                id={keyInputId(row)}
                type="text"
                readonly={row.exists}
                class="field w-full"
                value={row.key}
                oninput={(event) => {
                  row.key = event.currentTarget.value;
                }}
              />
            </div>

            <div>
              <label for={valueInputId(row)} class="sr-only">
                {t('correction.valueLabel', { index: index + 1 })}
              </label>
              {#if row.type === 'checkbox'}
                <input
                  id={valueInputId(row)}
                  type="checkbox"
                  class="size-[18px] accent-accent"
                  checked={row.checked}
                  onchange={(event) => {
                    row.checked = event.currentTarget.checked;
                  }}
                />
              {:else}
                <input
                  id={valueInputId(row)}
                  type="text"
                  inputmode={row.type === 'number' ? 'decimal' : undefined}
                  readonly={!row.editable}
                  class="field w-full"
                  value={row.text}
                  oninput={(event) => {
                    row.text = event.currentTarget.value;
                  }}
                />
              {/if}
            </div>

            <div>
              <label for={typeInputId(row)} class="sr-only">
                {t('correction.typeLabel', { index: index + 1 })}
              </label>
              <select
                id={typeInputId(row)}
                disabled={!row.editable}
                class="field w-full"
                value={row.type}
                onchange={(event) => {
                  changeType(row.id, event.currentTarget.value as AttributeValueType);
                }}
              >
                {#each ATTRIBUTE_VALUE_TYPES as type (type)}
                  <option value={type}>{t(ATTRIBUTE_VALUE_TYPE_LABELS[type])}</option>
                {/each}
              </select>
            </div>

            <div>
              {#if row.exists}
                <span class="text-small text-muted">{t('correction.kept')}</span>
              {:else}
                <button
                  type="button"
                  class="btn btn-secondary"
                  aria-label={t('correction.removeLabel', { index: index + 1 })}
                  onclick={() => removeRow(row.id)}
                >
                  {t('correction.remove')}
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    <button
      type="button"
      class="btn btn-secondary mt-2"
      onclick={addRow}
    >
      {t('correction.addAttribute')}
    </button>
  </fieldset>

  <section aria-labelledby={changesHeadingId}>
    <h3 id={changesHeadingId}>
      {t('inspector.edgeChanges')}
    </h3>
    {#if changed.length === 0}
      <p class="mt-1 text-small text-muted">{t('inspector.edgeNothingToSave')}</p>
    {:else}
      <ul class="mt-1 space-y-1 text-small">
        {#each build.diff.filter((entry) => entry.changed) as entry (entry.field)}
          <li>
            <span class="font-medium">{t(entry.label.key, entry.label.params)}</span>
            <span class="text-muted">— {entry.current} → {entry.proposed}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if attempted && invalid.length > 0}
    <div role="alert" class="rounded-control bg-pill-negative-bg p-3 text-body text-pill-negative-ink">
      <p class="font-semibold">
        {invalid.length === 1
          ? t('correction.formProblem', { count: formatNumber(locale.locale, invalid.length) })
          : t('correction.formProblems', { count: formatNumber(locale.locale, invalid.length) })}
      </p>
      <ul class="mt-1 list-disc pl-5">
        {#each invalid as field (field.key)}
          <li>{t(field.label.key, field.label.params)}: {t(field.message.key, field.message.params)}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if attempted && invalid.length === 0 && !build.hasChanges}
    <p role="alert" class="rounded-control bg-pill-negative-bg p-3 text-body text-pill-negative-ink">
      {t('inspector.edgeNothingToSave')}
    </p>
  {/if}

  {#if failure !== null}
    <div role="alert" class="rounded-control bg-pill-negative-bg p-3 text-body text-pill-negative-ink">
      <p class="font-mono font-semibold text-pill-negative-ink">{failure.code}</p>
      <p class="mt-1 text-text">{failure.message}</p>
      <p class="mt-1 text-small text-muted">{t('inspector.edgeFormKept')}</p>
    </div>
  {/if}

  {#if notice !== null}
    <p role="status" class="rounded-control bg-raised p-2 text-body">{notice}</p>
  {/if}

  <div class="flex flex-wrap items-center gap-3">
    <button
      type="submit"
      class="btn btn-primary"
      disabled={submitting}
    >
      {submitting ? t('inspector.edgeSaving') : t('inspector.edgeSave')}
    </button>

    {#if oncancel}
      <button
        type="button"
        class="btn btn-secondary"
        onclick={oncancel}
      >
        {t('common.cancel')}
      </button>
    {/if}
  </div>
</form>
