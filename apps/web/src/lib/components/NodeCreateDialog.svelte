<script lang="ts">
  /**
   * The node creation form (FR-06).
   *
   * The form is **built from the active ontology**: the user picks a class
   * and the fields are the active datatype properties of that class. The
   * node's own fields (`title`, `description`) are fixed — they are
   * top-level in the API contract — and an ontology property that
   * re-declares one of them is skipped and reported.
   *
   * The API does **not** validate the attributes: it stores them as JSONB
   * and only checks the `typeKey` against the ontology. The validation of
   * the attributes therefore happens here, before the request leaves the
   * app.
   */
  import { describeFailure, type ApiFailure } from '$lib/api/failure';
  import { createNode, type CreatedNode } from '$lib/api/graph';
  import type { OntologyResponseDto } from '$lib/api/types';
  import { formatNumber, type Message } from '$lib/i18n';
  import {
    buildNodeForm,
    classOptions,
    initialFieldValue,
    validateNodeForm,
    type AttributeField,
    type FormValues
  } from '$lib/ontology/node-form';
  import { getApiClient, getLocaleState } from '$lib/state/context';
  import ModalDialog from './ModalDialog.svelte';
  import RichText from './RichText.svelte';

  interface Props {
    /** `true` while the dialog is open. */
    open: boolean;
    /** The active ontology of the workspace; `null` while it is loading. */
    ontology: OntologyResponseDto | null;
    /** The failure of the ontology read, when it failed. */
    ontologyError?: ApiFailure | null;
    /** Called when the dialog must close. */
    onclose: () => void;
    /** Called with the node the API created. */
    oncreated?: (created: CreatedNode) => void;
  }

  let { open, ontology, ontologyError = null, onclose, oncreated }: Props = $props();

  const api = getApiClient();
  const locale = getLocaleState();
  const t = locale.t;

  const uid = $props.id();

  const introId = `node-form-intro-${uid}`;
  const classId = `node-class-${uid}`;
  const classDescriptionId = `node-class-description-${uid}`;
  const titleId = `node-title-${uid}`;
  const descriptionId = `node-description-${uid}`;

  /** The class the form builds. */
  let classKey = $state('');

  /** The node's own fields. */
  let title = $state('');
  let description = $state('');

  /** The raw values of the attribute fields. */
  let values = $state<FormValues>({});

  /** The messages of the invalid fields, keyed by the field key. */
  let errors = $state<Record<string, Message>>({});

  /** The envelope of a failed creation. */
  let failure = $state<ApiFailure | null>(null);

  /** `true` while the request is in flight. */
  let submitting = $state(false);

  /** The classes the user can pick. */
  const options = $derived(classOptions(ontology, locale.locale));

  /** The model of the form for the chosen class. */
  const model = $derived(
    classKey === '' ? null : buildNodeForm(ontology, classKey, locale.locale)
  );

  /** The attribute fields of the form. */
  const fields = $derived(model?.fields ?? []);

  /** The properties the form does not render, and why. */
  const skipped = $derived(model?.skipped ?? []);

  /** The description of the chosen class. */
  const classDescription = $derived(
    options.find((option) => option.systemKey === classKey)?.description ?? null
  );

  /** The invalid fields, in the order of the form. */
  const invalidFields = $derived(
    Object.keys(errors).map((key) => ({
      key,
      label:
        key === 'title'
          ? t('node.titleLabel')
          : key === 'description'
            ? t('node.descriptionLabel')
            : (fields.find((field) => field.systemKey === key)?.label ?? key)
    }))
  );

  /** The message of the error of a field, when it has one. */
  function errorOf(key: string): string | null {
    const message = errors[key];
    if (message === undefined) {
      return null;
    }
    return t(message.key, message.params);
  }

  /**
   * A fresh form every time the dialog opens.
   *
   * The effect reads `open` and nothing else: the ontology may arrive while
   * the dialog is open, and that must not wipe what the user typed.
   */
  $effect(() => {
    if (!open) {
      return;
    }

    classKey = '';
    title = '';
    description = '';
    values = {};
    errors = {};
    failure = null;
  });

  /** The first class of the ontology, when the user has not picked one. */
  $effect(() => {
    if (classKey === '' && options.length > 0) {
      classKey = options[0].systemKey;
    }
  });

  /** The default value of every attribute of the chosen class. */
  $effect(() => {
    const current = model;
    const initial: FormValues = {};

    for (const field of current?.fields ?? []) {
      initial[field.systemKey] = initialFieldValue(field);
    }

    values = initial;
  });

  /** Sets the raw value of one attribute. */
  function setValue(key: string, value: string | boolean): void {
    values[key] = value;
  }

  /** The raw value of one attribute, as a string. */
  function stringValue(key: string): string {
    const value = values[key];
    return typeof value === 'string' ? value : '';
  }

  /** The id of the input of one attribute. */
  function fieldId(field: AttributeField): string {
    return `node-attr-${uid}-${field.systemKey}`;
  }

  /** The id of the error message of one attribute. */
  function fieldErrorId(field: AttributeField): string {
    return `${fieldId(field)}-error`;
  }

  /** The id of the help text of one attribute. */
  function fieldHelpId(field: AttributeField): string {
    return `${fieldId(field)}-help`;
  }

  /** The ids the input of one field is described by. */
  function describedBy(field: AttributeField): string | undefined {
    const ids: string[] = [];

    if (field.description !== null) {
      ids.push(fieldHelpId(field));
    }

    if (errors[field.systemKey] !== undefined) {
      ids.push(fieldErrorId(field));
    }

    return ids.length === 0 ? undefined : ids.join(' ');
  }

  /** Sends the form. */
  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    failure = null;

    const current = model;
    if (current === null) {
      return;
    }

    const result = validateNodeForm(current, values, { title, description });
    errors = { ...result.errors };

    if (!result.valid) {
      focusFirstInvalid();
      return;
    }

    submitting = true;

    let created: CreatedNode;
    try {
      created = await createNode(api, {
        typeKey: current.classKey,
        title: title.trim(),
        description: description.trim() === '' ? undefined : description.trim(),
        attributes: result.attributes
      });
    } catch (caught) {
      // The API answers with an envelope: the code and the message are what
      // the user sees. The form keeps what the user typed.
      failure = describeFailure(caught, t);
      submitting = false;
      return;
    }

    submitting = false;
    oncreated?.(created);
    onclose();
  }

  /** Moves the focus to the first field that is not valid. */
  function focusFirstInvalid(): void {
    const first = invalidFields[0];
    if (first === undefined) {
      return;
    }

    focusField(first.key);
  }

  /** Moves the focus to one field of the form. */
  function focusField(key: string): void {
    const id =
      key === 'title'
        ? titleId
        : key === 'description'
          ? descriptionId
          : `node-attr-${uid}-${key}`;

    document.getElementById(id)?.focus();
  }
</script>

<ModalDialog {open} title={t('node.newNodeTitle')} {onclose} describedby={introId}>
  <p id={introId} class="text-sm text-ink-muted">
    <RichText text={t('node.createIntro')} />
  </p>

  {#if ontology === null && ontologyError !== null}
    <p role="alert" class="mt-4 rounded-md border border-negative/30 bg-negative/5 p-3 text-sm">
      <span class="font-mono">{ontologyError.code}</span> — {ontologyError.message}
    </p>
  {:else if ontology === null}
    <p role="status" class="mt-4 text-sm text-ink-muted">{t('node.loadingOntology')}</p>
  {:else if options.length === 0}
    <p class="mt-4 text-sm text-ink-muted">
      {t('node.noActiveClass')}
    </p>
  {:else}
    <form class="mt-4 space-y-5" onsubmit={submit} novalidate>
      <div>
        <label for={classId} class="block text-sm font-medium text-ink">
          {t('node.ontologyClass')}
        </label>
        <select
          id={classId}
          class="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
          aria-describedby={classDescription === null ? undefined : classDescriptionId}
          value={classKey}
          onchange={(event) => {
            classKey = event.currentTarget.value;
          }}
        >
          {#each options as option (option.systemKey)}
            <option value={option.systemKey}>{option.label}</option>
          {/each}
        </select>
        {#if classDescription !== null}
          <p id={classDescriptionId} class="mt-1 text-xs text-ink-muted">{classDescription}</p>
        {/if}
      </div>

      <div>
        <label for={titleId} class="block text-sm font-medium text-ink">
          {t('node.titleLabel')} <span class="font-normal text-ink-muted">{t('common.required')}</span>
        </label>
        <input
          id={titleId}
          type="text"
          data-autofocus
          required
          minlength="3"
          maxlength="255"
          aria-required="true"
          aria-invalid={errors['title'] === undefined ? undefined : 'true'}
          aria-describedby={errors['title'] === undefined ? undefined : `${titleId}-error`}
          class="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
          value={title}
          oninput={(event) => {
            title = event.currentTarget.value;
          }}
        />
        {#if errors['title'] !== undefined}
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
          aria-invalid={errors['description'] === undefined ? undefined : 'true'}
          class="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
          value={description}
          oninput={(event) => {
            description = event.currentTarget.value;
          }}
        ></textarea>
        {#if errors['description'] !== undefined}
          <p id={`${descriptionId}-error`} class="mt-1 text-sm text-negative">
            {errorOf('description')}
          </p>
        {/if}
      </div>

      {#if fields.length > 0}
        <fieldset class="space-y-4">
          <legend class="text-sm font-semibold tracking-tight">
            {t('node.attributesOf', { label: model?.label ?? '' })}
          </legend>

          {#each fields as field (field.systemKey)}
            <div>
              {#if field.datatype === 'boolean'}
                <label for={fieldId(field)} class="flex items-center gap-2 text-sm font-medium text-ink">
                  <input
                    id={fieldId(field)}
                    type="checkbox"
                    class="size-4 rounded border-line-strong"
                    checked={values[field.systemKey] === true}
                    aria-required={field.isRequired ? 'true' : undefined}
                    aria-invalid={errors[field.systemKey] === undefined ? undefined : 'true'}
                    aria-describedby={describedBy(field)}
                    onchange={(event) => {
                      setValue(field.systemKey, event.currentTarget.checked);
                    }}
                  />
                  {field.label}
                  {#if field.isRequired}
                    <span class="text-xs font-normal text-ink-muted">{t('common.required')}</span>
                  {/if}
                </label>
              {:else}
                <label for={fieldId(field)} class="block text-sm font-medium text-ink">
                  {field.label}
                  {#if field.isRequired}
                    <span class="text-xs font-normal text-ink-muted">{t('common.required')}</span>
                  {/if}
                </label>

                {#if field.datatype === 'enum'}
                  <select
                    id={fieldId(field)}
                    class="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
                    aria-required={field.isRequired ? 'true' : undefined}
                    aria-invalid={errors[field.systemKey] === undefined ? undefined : 'true'}
                    aria-describedby={describedBy(field)}
                    value={stringValue(field.systemKey)}
                    onchange={(event) => {
                      setValue(field.systemKey, event.currentTarget.value);
                    }}
                  >
                    <option value="">{t('common.emptyValue')}</option>
                    {#each field.allowedValues ?? [] as allowed (allowed)}
                      <option value={allowed}>{allowed}</option>
                    {/each}
                  </select>
                {:else if field.datatype === 'number'}
                  <input
                    id={fieldId(field)}
                    type="number"
                    step="any"
                    aria-required={field.isRequired ? 'true' : undefined}
                    aria-invalid={errors[field.systemKey] === undefined ? undefined : 'true'}
                    aria-describedby={describedBy(field)}
                    class="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
                    value={stringValue(field.systemKey)}
                    oninput={(event) => {
                      setValue(field.systemKey, event.currentTarget.value);
                    }}
                  />
                {:else if field.datatype === 'date'}
                  <input
                    id={fieldId(field)}
                    type="date"
                    aria-required={field.isRequired ? 'true' : undefined}
                    aria-invalid={errors[field.systemKey] === undefined ? undefined : 'true'}
                    aria-describedby={describedBy(field)}
                    class="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
                    value={stringValue(field.systemKey)}
                    oninput={(event) => {
                      setValue(field.systemKey, event.currentTarget.value);
                    }}
                  />
                {:else}
                  <input
                    id={fieldId(field)}
                    type="text"
                    aria-required={field.isRequired ? 'true' : undefined}
                    aria-invalid={errors[field.systemKey] === undefined ? undefined : 'true'}
                    aria-describedby={describedBy(field)}
                    class="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
                    value={stringValue(field.systemKey)}
                    oninput={(event) => {
                      setValue(field.systemKey, event.currentTarget.value);
                    }}
                  />
                {/if}
              {/if}

              {#if field.description !== null}
                <p id={fieldHelpId(field)} class="mt-1 text-xs text-ink-muted">{field.description}</p>
              {/if}

              {#if errors[field.systemKey] !== undefined}
                <p id={fieldErrorId(field)} class="mt-1 text-sm text-negative">
                  {errorOf(field.systemKey)}
                </p>
              {/if}
            </div>
          {/each}
        </fieldset>
      {:else}
        <p class="text-sm text-ink-muted">
          {t('node.noActiveAttributes')}
        </p>
      {/if}

      {#if skipped.length > 0}
        <div class="rounded-md border border-line bg-surface-muted p-3 text-sm">
          <p class="font-medium">{t('node.notShownHeading')}</p>
          <ul class="mt-1 list-disc pl-5 text-ink-muted">
            {#each skipped as property (property.systemKey)}
              <li>
                <span class="font-mono text-xs">{property.systemKey}</span> —
                {t('node.skippedExplanation', { label: property.label })}
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if invalidFields.length > 0}
        <div role="alert" class="rounded-md border border-negative/30 bg-negative/5 p-3 text-sm">
          <p class="font-semibold">
            {invalidFields.length === 1
              ? t('node.formProblem', { count: formatNumber(locale.locale, invalidFields.length) })
              : t('node.formProblems', { count: formatNumber(locale.locale, invalidFields.length) })}
          </p>
          <ul class="mt-1 list-disc pl-5">
            {#each invalidFields as field (field.key)}
              <li>
                <a
                  href={`#${field.key === 'title' ? titleId : field.key === 'description' ? descriptionId : `node-attr-${uid}-${field.key}`}`}
                  class="underline"
                  onclick={(event) => {
                    event.preventDefault();
                    focusField(field.key);
                  }}
                >
                  {field.label}: {errorOf(field.key)}
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if failure !== null}
        <div role="alert" class="rounded-md border border-negative/30 bg-negative/5 p-3 text-sm">
          <p class="font-mono font-semibold text-negative">{failure.code}</p>
          <p class="mt-1 text-ink">{failure.message}</p>
          <p class="mt-1 text-xs text-ink-muted">
            {t('node.formKept')}
          </p>
        </div>
      {/if}

      <div class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          class="rounded-md bg-brand-900 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting}
        >
          {submitting ? t('node.creating') : t('node.createSubmit')}
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
