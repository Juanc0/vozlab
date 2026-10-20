<script lang="ts">
  /**
   * The form that proposes a correction of a node or of a relation (FR-10).
   *
   * A proposal is a **diff**: the form shows the current value of every
   * field and the value the proposal would set, and it marks the ones that
   * actually change. A diff the reader cannot see is a proposal nobody can
   * judge.
   *
   * The delta it sends carries **only** the fields the API applies for the
   * kind of the target (`title`, `description` and `attributes` for a node;
   * `relationKey` and `attributes` for a relation) and **only** the ones
   * that change — see `$lib/governance/correction`.
   *
   * The proposal is created `PENDING`: it changes nothing until the author
   * of the target approves it.
   */
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import { formatNumber } from '$lib/i18n';
  import { getEdge } from '$lib/api/graph';
  import { createProposal, type CreatedProposal } from '$lib/api/proposals';
  import type { OntologyResponseDto } from '$lib/api/types';
  import {
    ATTRIBUTE_VALUE_TYPES,
    ATTRIBUTE_VALUE_TYPE_LABELS,
    appendAttributeRow,
    buildCorrection,
    edgeSnapshot,
    initialAttributeRows,
    nodeSnapshot,
    retypeAttributeRow,
    type AttributeRow,
    type AttributeValueType,
    type CorrectionSnapshot,
    type CorrectionTarget
  } from '$lib/governance/correction';
  import { getApiClient, getLocaleState } from '$lib/state/context';
  import ModalDialog from './ModalDialog.svelte';
  import RichText from './RichText.svelte';

  interface Props {
    /** `true` while the dialog is open. */
    open: boolean;
    /** The target of the correction — a node or a relation. */
    target: CorrectionTarget | null;
    /** The active ontology — it offers the relation keys of the editor. */
    ontology?: OntologyResponseDto | null;
    /** Called when the dialog must close. */
    onclose: () => void;
    /** Called with the proposal the API created. */
    oncreated?: (created: CreatedProposal) => void;
  }

  let { open, target, ontology = null, onclose, oncreated }: Props = $props();

  const api = getApiClient();
  const locale = getLocaleState();
  const t = locale.t;

  const uid = $props.id();

  const introId = `correction-intro-${uid}`;
  const titleId = `correction-title-${uid}`;
  const descriptionId = `correction-description-${uid}`;
  const relationKeyId = `correction-relationKey-${uid}`;
  const justificationId = `correction-justification-${uid}`;
  const diffHeadingId = `correction-diff-${uid}`;
  const attributesNoteId = `correction-attributes-note-${uid}`;
  const descriptionNoteId = `correction-description-note-${uid}`;
  const relationKeyListId = `correction-relation-keys-${uid}`;

  /** The state of the target as it is today. */
  let snapshot = $state.raw<CorrectionSnapshot | null>(null);
  let loading = $state(false);
  let loadError = $state<ApiFailure | null>(null);

  /** What the user typed. */
  let title = $state('');
  let description = $state('');
  let relationKey = $state('');
  let justification = $state('');
  let rows = $state<AttributeRow[]>([]);

  /** The envelope of a failed creation. */
  let failure = $state<ApiFailure | null>(null);

  /** `true` while the request is in flight. */
  let submitting = $state(false);

  /** `true` once the user tried to send the form. */
  let attempted = $state(false);

  /**
   * `true` when the form already took the focus for the current target.
   *
   * The form appears one tick after the dialog opens — the target of a
   * relation is read first — so the shell cannot focus the first field: the
   * form takes the focus itself, once, and never takes it back.
   */
  let focusedForm = $state(false);

  /** The counter of the rows of the editor. */
  let rowCounter = 0;

  /** The counter that discards the answer of a superseded read. */
  let request = 0;

  /** The id of the target the form is for. */
  const targetId = $derived(
    target === null ? null : target.kind === 'node' ? target.node.id : target.edge.id
  );

  /** The relation keys the ontology declares — the editor offers them. */
  const relationKeyOptions = $derived(
    (ontology?.objectProperties ?? []).map((property) => property.systemKey).sort()
  );

  /** The delta and the diff of the form. */
  const build = $derived.by(() => {
    const current = snapshot;

    if (current === null) {
      return null;
    }

    if (current.kind === 'NODE') {
      return buildCorrection(current, {
        kind: 'NODE',
        title,
        description,
        rows,
        justification
      });
    }

    return buildCorrection(current, {
      kind: 'EDGE',
      relationKey,
      rows,
      justification
    });
  });

  /** The fields the form refuses to send. */
  const invalid = $derived(build?.invalid ?? []);

  /** The fields the proposal changes. */
  const changedFields = $derived(build?.changed ?? []);

  /**
   * Reads the target of the correction.
   *
   * A node is already in memory; a relation is not — the subgraph carries
   * the **narrower** projection of a relation, without its attributes — so
   * the relation itself is read.
   */
  $effect(() => {
    const id = targetId;
    const current = target;

    if (!open || id === null || current === null) {
      return;
    }

    const token = (request += 1);
    snapshot = null;
    loadError = null;
    failure = null;
    attempted = false;

    if (current.kind === 'node') {
      snapshot = nodeSnapshot(current.node);
      loading = false;
      return;
    }

    loading = true;

    void getEdge(api, current.edge.id)
      .then((edge) => {
        if (token !== request) {
          return;
        }
        snapshot = edgeSnapshot(edge);
        loading = false;
      })
      .catch((caught: unknown) => {
        if (token !== request) {
          return;
        }
        loadError = describeFailure(caught, t);
        loading = false;
      });
  });

  /**
   * Fills the form with the state of the target.
   *
   * The effect reads the snapshot and nothing else: what the user types is
   * never overwritten by it.
   */
  $effect(() => {
    const current = snapshot;

    if (current === null) {
      title = '';
      description = '';
      relationKey = '';
      justification = '';
      rows = [];
      return;
    }

    if (current.kind === 'NODE') {
      title = current.title;
      description = current.description ?? '';
      relationKey = '';
    } else {
      title = '';
      description = '';
      relationKey = current.relationKey;
    }

    rows = initialAttributeRows(current.attributes, nextRowId);
    justification = '';
  });

  /**
   * The form takes the focus when it appears.
   *
   * The shell of the dialog focuses the first control it finds when it
   * opens, but the form of a correction appears one tick later — the target
   * of a relation is read first. The form therefore takes the focus itself,
   * once, and never takes it back from the user.
   */
  $effect(() => {
    const current = build;

    if (current === null || !open) {
      focusedForm = false;
      return;
    }

    if (focusedForm) {
      return;
    }

    focusedForm = true;

    const first =
      snapshot?.kind === 'EDGE'
        ? document.getElementById(relationKeyId)
        : document.getElementById(titleId);

    first?.focus();
  });

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

  /** Sends the form. */
  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    failure = null;
    attempted = true;

    const current = build;
    const currentTarget = target;

    if (current === null || currentTarget === null) {
      return;
    }

    if (!current.valid) {
      focusFirstInvalid();
      return;
    }

    submitting = true;

    try {
      const created = await createProposal(api, {
        targetId:
          currentTarget.kind === 'node' ? currentTarget.node.id : currentTarget.edge.id,
        targetType: currentTarget.kind === 'node' ? 'NODE' : 'EDGE',
        proposedChanges: current.proposedChanges,
        justification
      });

      oncreated?.(created);
      onclose();
    } catch (caught) {
      // The envelope of the API — the code and the message — is what the
      // user sees. The form keeps what the user typed.
      failure = describeFailure(caught, t);
    } finally {
      submitting = false;
    }
  }

  /** Moves the focus to the first field that is not valid. */
  function focusFirstInvalid(): void {
    const first = invalid[0];
    if (first === undefined) {
      return;
    }

    focusField(first.key);
  }

  /** Moves the focus to the control of a field. */
  function focusField(key: string): void {
    if (key.startsWith('attributes.')) {
      const [rowId, part] = key.slice('attributes.'.length).split(':');
      const suffix = part === 'key' ? '-key' : '-value';
      document.getElementById(`${uid}-attr-${rowId}${suffix}`)?.focus();
      return;
    }

    const ids: Record<string, string> = {
      title: titleId,
      description: descriptionId,
      relationKey: relationKeyId,
      justification: justificationId
    };

    document.getElementById(ids[key] ?? '')?.focus();
  }

  /** The message of the error of a field, when it has one. */
  function errorOf(key: string): string | null {
    const message = invalid.find((field) => field.key === key)?.message;
    return message === undefined ? null : t(message.key, message.params);
  }
</script>

<ModalDialog {open} title={t('correction.title')} {onclose} describedby={introId}>
  <p id={introId} class="text-sm text-ink-muted">
    <RichText text={t('correction.intro')} />
  </p>

  {#if target === null}
    <p class="mt-4 text-sm text-ink-muted">
      {t('correction.pickTarget')}
    </p>
  {:else if loading}
    <p role="status" class="mt-4 text-sm text-ink-muted">{t('correction.readingTarget')}</p>
  {:else if loadError !== null}
    <p role="alert" class="mt-4 rounded-md border border-negative/30 bg-negative/5 p-3 text-sm">
      <span class="font-mono">{loadError.code}</span> — {loadError.message}
    </p>
  {:else if build === null}
    <p role="status" class="mt-4 text-sm text-ink-muted">{t('correction.loadingTarget')}</p>
  {:else}
    <form class="mt-4 space-y-5" onsubmit={submit} novalidate>
      {#if target.kind === 'node'}
        <div>
          <label for={titleId} class="block text-sm font-medium text-ink">
            {t('node.titleLabel')} <span class="font-normal text-ink-muted">{t('common.required')}</span>
          </label>
          <input
            id={titleId}
            type="text"
            data-autofocus
            maxlength="255"
            aria-invalid={errorOf('title') === null ? undefined : 'true'}
            aria-describedby={errorOf('title') === null ? undefined : `${titleId}-error`}
            class="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
            value={title}
            oninput={(event) => {
              title = event.currentTarget.value;
            }}
          />
          {#if errorOf('title') !== null}
            <p id={`${titleId}-error`} class="mt-1 text-sm text-negative">{errorOf('title')}</p>
          {/if}
        </div>

        <div>
          <label for={descriptionId} class="block text-sm font-medium text-ink">
            {t('node.descriptionLabel')} <span class="font-normal text-ink-muted">{t('common.optional')}</span>
          </label>
          <textarea
            id={descriptionId}
            rows="3"
            aria-describedby={descriptionNoteId}
            class="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
            value={description}
            oninput={(event) => {
              description = event.currentTarget.value;
            }}
          ></textarea>
          <p id={descriptionNoteId} class="mt-1 text-xs text-ink-muted">
            {t('correction.emptyDescription')}
          </p>
        </div>
      {:else}
        <div>
          <label for={relationKeyId} class="block text-sm font-medium text-ink">
            {t('correction.relationKeyLabel')} <span class="font-normal text-ink-muted">{t('common.required')}</span>
          </label>
          <input
            id={relationKeyId}
            type="text"
            data-autofocus
            list={relationKeyListId}
            maxlength="100"
            aria-invalid={errorOf('relationKey') === null ? undefined : 'true'}
            aria-describedby={errorOf('relationKey') === null ? undefined : `${relationKeyId}-error`}
            class="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
            value={relationKey}
            oninput={(event) => {
              relationKey = event.currentTarget.value;
            }}
          />
          <datalist id={relationKeyListId}>
            {#each relationKeyOptions as option (option)}
              <option value={option}></option>
            {/each}
          </datalist>
          {#if errorOf('relationKey') !== null}
            <p id={`${relationKeyId}-error`} class="mt-1 text-sm text-negative">
              {errorOf('relationKey')}
            </p>
          {/if}
        </div>
      {/if}

      <fieldset aria-describedby={attributesNoteId}>
        <legend class="text-sm font-semibold tracking-tight">{t('correction.attributesLegend')}</legend>
        <p id={attributesNoteId} class="mt-1 text-xs text-ink-muted">
          {t('correction.attributesNote')}
        </p>

        {#if rows.length === 0}
          <p class="mt-2 text-sm text-ink-muted">{t('correction.noAttributes')}</p>
        {:else}
          <ul class="mt-2 space-y-2">
            {#each rows as row, index (row.id)}
              <li
                class="grid items-end gap-2 rounded-md border border-line bg-surface-muted/40 p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_auto]"
              >
                <div>
                  <label for={keyInputId(row)} class="sr-only">
                    {t('correction.keyLabel', { index: index + 1 })}
                  </label>
                  <input
                    id={keyInputId(row)}
                    type="text"
                    readonly={row.exists}
                    aria-invalid={errorOf(`attributes.${row.id}`) === null &&
                    errorOf(`attributes.${row.id}:key`) === null
                      ? undefined
                      : 'true'}
                    class="w-full rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm"
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
                      class="size-4 rounded border-line-strong"
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
                      aria-invalid={errorOf(`attributes.${row.id}`) === null ? undefined : 'true'}
                      class="w-full rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm"
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
                    class="w-full rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm"
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
                    <span class="text-xs text-ink-muted">{t('correction.kept')}</span>
                  {:else}
                    <button
                      type="button"
                      class="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
                      aria-label={t('correction.removeLabel', { index: index + 1 })}
                      onclick={() => removeRow(row.id)}
                    >
                      {t('correction.remove')}
                    </button>
                  {/if}
                </div>

                {#if !row.editable}
                  <p class="text-xs text-ink-muted sm:col-span-4">
                    {t('correction.notEditable')}
                  </p>
                {/if}

                {#if errorOf(`attributes.${row.id}`) !== null}
                  <p class="text-sm text-negative sm:col-span-4">
                    {errorOf(`attributes.${row.id}`)}
                  </p>
                {/if}
                {#if errorOf(`attributes.${row.id}:key`) !== null}
                  <p class="text-sm text-negative sm:col-span-4">
                    {errorOf(`attributes.${row.id}:key`)}
                  </p>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}

        <button
          type="button"
          class="mt-2 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
          onclick={addRow}
        >
          {t('correction.addAttribute')}
        </button>
      </fieldset>

      <section aria-labelledby={diffHeadingId}>
        <h3 id={diffHeadingId} class="text-sm font-semibold tracking-tight">
          {t('correction.changesHeading')}
        </h3>
        <p class="mt-1 text-xs text-ink-muted">
          {#if changedFields.length === 0}
            {t('correction.noChanges')}
          {:else if changedFields.length === 1}
            {t('correction.oneChange')}
          {:else}
            {t('correction.manyChanges', { count: formatNumber(locale.locale, changedFields.length) })}
          {/if}
        </p>

        <div class="mt-2 overflow-x-auto rounded-card border border-line">
          <table class="w-full border-collapse text-left text-sm">
            <caption class="sr-only">
              {t('correction.tableCaption')}
            </caption>
            <thead class="bg-surface-muted text-xs tracking-wide text-ink-muted uppercase">
              <tr>
                <th scope="col" class="px-3 py-2 font-semibold">{t('correction.columnField')}</th>
                <th scope="col" class="px-3 py-2 font-semibold">{t('correction.columnCurrent')}</th>
                <th scope="col" class="px-3 py-2 font-semibold">{t('correction.columnProposed')}</th>
                <th scope="col" class="px-3 py-2 font-semibold">{t('correction.columnChange')}</th>
              </tr>
            </thead>
            <tbody>
              {#each build.diff as entry (entry.field)}
                <tr class="border-t border-line">
                  <th scope="row" class="px-3 py-2 font-normal">
                    <span class="font-mono text-xs">{t(entry.label.key, entry.label.params)}</span>
                  </th>
                  <td class="px-3 py-2 break-words text-ink-muted">{entry.current}</td>
                  <td class="px-3 py-2 break-words">{entry.proposed}</td>
                  <td class="px-3 py-2">
                    {#if entry.changed}
                      <span class="font-semibold text-brand-900">{t('correction.changes')}</span>
                    {:else}
                      <span class="text-ink-muted">{t('correction.unchanged')}</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>

      <div>
        <label for={justificationId} class="block text-sm font-medium text-ink">
          {t('correction.justificationLabel')} <span class="font-normal text-ink-muted">{t('common.optional')}</span>
        </label>
        <textarea
          id={justificationId}
          rows="3"
          maxlength="5000"
          aria-invalid={errorOf('justification') === null ? undefined : 'true'}
          aria-describedby={errorOf('justification') === null ? undefined : `${justificationId}-error`}
          class="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
          value={justification}
          oninput={(event) => {
            justification = event.currentTarget.value;
          }}
        ></textarea>
        <p class="mt-1 text-xs text-ink-muted">
          {t('correction.justificationHelp')}
        </p>
        {#if errorOf('justification') !== null}
          <p id={`${justificationId}-error`} class="mt-1 text-sm text-negative">
            {errorOf('justification')}
          </p>
        {/if}
      </div>

      {#if attempted && invalid.length > 0}
        <div role="alert" class="rounded-md border border-negative/30 bg-negative/5 p-3 text-sm">
          <p class="font-semibold">
            {invalid.length === 1
              ? t('correction.formProblem', { count: formatNumber(locale.locale, invalid.length) })
              : t('correction.formProblems', { count: formatNumber(locale.locale, invalid.length) })}
          </p>
          <ul class="mt-1 list-disc pl-5">
            {#each invalid as field (field.key)}
              <li>
                <a
                  href={`#${field.key}`}
                  class="underline"
                  onclick={(event) => {
                    event.preventDefault();
                    focusField(field.key);
                  }}
                >
                  {t(field.label.key, field.label.params)}: {t(field.message.key, field.message.params)}
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if attempted && invalid.length === 0 && !build.hasChanges}
        <p role="alert" class="rounded-md border border-negative/30 bg-negative/5 p-3 text-sm">
          {t('correction.nothingToPropose')}
        </p>
      {/if}

      {#if failure !== null}
        <div role="alert" class="rounded-md border border-negative/30 bg-negative/5 p-3 text-sm">
          <p class="font-mono font-semibold text-negative">{failure.code}</p>
          <p class="mt-1 text-ink">{failure.message}</p>
          <p class="mt-1 text-xs text-ink-muted">
            {t('correction.formKept')}
          </p>
        </div>
      {/if}

      <div class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          class="rounded-md bg-brand-900 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting}
        >
          {submitting ? t('correction.proposing') : t('correction.proposeSubmit')}
        </button>
        <button
          type="button"
          class="rounded-md border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
          onclick={onclose}
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  {/if}
</ModalDialog>
