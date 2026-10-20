/**
 * The correction a user proposes on a node or on a relation (FR-10).
 *
 * The API applies a proposal with a **whitelist**:
 *
 * - a node (`DrizzleNodeRepository.applyDelta`): `title`, `description` and
 *   `attributes`;
 * - a relation (`DrizzleEdgeRepository.applyDelta`): `relationKey` and
 *   `attributes`.
 *
 * A field the API ignores would be a proposal that silently does nothing, so
 * the form offers exactly these fields — and only the ones that **change**:
 * an unchanged field in the delta would claim a change that is not one.
 *
 * The attributes are JSONB and the API **merges** them into the attributes of
 * the target (`{ ...existing, ...delta }`): a proposal can change an
 * attribute and it can add one, but it can neither remove one nor rename
 * one. The form says so instead of pretending otherwise.
 *
 * Everything here is pure: no fetch, no DOM. The component renders what this
 * module says and the tests exercise it directly.
 */

import { formatDeltaValue } from './delta';
import type { EdgeDto, NodeDto, SubgraphEdgeDto } from '$lib/api/types';

/** The target of a correction: a node or a relation. */
export type CorrectionTarget =
  | { readonly kind: 'node'; readonly node: NodeDto }
  | { readonly kind: 'edge'; readonly edge: SubgraphEdgeDto };

/** The state of the target as it is today. */
export type CorrectionSnapshot =
  | {
      readonly kind: 'NODE';
      readonly title: string;
      readonly description: string | null;
      readonly attributes: Readonly<Record<string, unknown>>;
    }
  | {
      readonly kind: 'EDGE';
      readonly relationKey: string;
      readonly attributes: Readonly<Record<string, unknown>>;
    };

/** The state of a node, as the correction form sees it. */
export function nodeSnapshot(node: NodeDto): CorrectionSnapshot {
  return {
    kind: 'NODE',
    title: node.title,
    description: node.description,
    attributes: node.attributes ?? {}
  };
}

/** The state of a relation, as the correction form sees it. */
export function edgeSnapshot(edge: EdgeDto): CorrectionSnapshot {
  return {
    kind: 'EDGE',
    relationKey: edge.relationKey,
    attributes: edge.attributes ?? {}
  };
}

/** The kinds of value an attribute row can carry. */
export type AttributeValueType = 'text' | 'number' | 'checkbox';

/** The value types the form offers, in the order it offers them. */
export const ATTRIBUTE_VALUE_TYPES: readonly AttributeValueType[] = ['text', 'number', 'checkbox'];

/** The label of a value type, as the picker shows it. */
export const ATTRIBUTE_VALUE_TYPE_LABELS: Readonly<Record<AttributeValueType, string>> = {
  text: 'Text',
  number: 'Number',
  checkbox: 'Checkbox'
};

/** The shortest title the API accepts for a node (`CreateNodeSchema`). */
export const CORRECTION_TITLE_MIN_LENGTH = 3;

/** The longest title the API accepts for a node (`CreateNodeSchema`). */
export const CORRECTION_TITLE_MAX_LENGTH = 255;

/** The shortest relation key the API accepts (`CreateEdgeSchema`). */
export const CORRECTION_RELATION_KEY_MIN_LENGTH = 1;

/** The longest relation key the API accepts (`CreateEdgeSchema`). */
export const CORRECTION_RELATION_KEY_MAX_LENGTH = 100;

/**
 * The longest justification the form accepts.
 *
 * The API does not bound the justification — `CreateProposalSchema` takes a
 * plain string and the column is a `text` — so this is the bound of the
 * **form**, not of the server.
 */
export const CORRECTION_JUSTIFICATION_MAX_LENGTH = 5000;

/** One row of the attribute editor. */
export interface AttributeRow {
  /** The id of the row — stable, so the editor keeps the focus where it is. */
  id: string;
  /** The key of the attribute. */
  key: string;
  /** The declared type of the value. */
  type: AttributeValueType;
  /** The raw text of the row (the `text` and the `number` rows). */
  text: string;
  /** The state of the checkbox (the `checkbox` rows). */
  checked: boolean;
  /** The value the target carries today; `undefined` when the row is new. */
  current: unknown;
  /** `true` when the target already carries this attribute. */
  exists: boolean;
  /**
   * `false` when the form cannot propose a value for this attribute.
   *
   * The attributes are JSONB: a value that is not a text, a number or a
   * boolean cannot be expressed by the editor, and rewriting it as a text
   * would corrupt it silently.
   */
  editable: boolean;
}

/** What the user typed. */
export type CorrectionDraft =
  | {
      readonly kind: 'NODE';
      readonly title: string;
      readonly description: string;
      readonly rows: readonly AttributeRow[];
      readonly justification: string;
    }
  | {
      readonly kind: 'EDGE';
      readonly relationKey: string;
      readonly rows: readonly AttributeRow[];
      readonly justification: string;
    };

/** One field of the diff: what it is now and what the proposal would make it. */
export interface FieldDiff {
  /** The name of the field: `title`, `description`, `relationKey` or `attributes.<key>`. */
  readonly field: string;
  /** The name of the field, as the user reads it. */
  readonly label: string;
  /** The value the target carries today. */
  readonly current: string;
  /** The value the proposal would set. */
  readonly proposed: string;
  /** `true` when the proposal changes this field. */
  readonly changed: boolean;
}

/** A field the form refuses to send. */
export interface InvalidField {
  /**
   * The key of the field.
   *
   * A field of the target is named after itself (`title`, `description`,
   * `relationKey`, `justification`); an attribute row is named
   * `attributes.<row id>`, with the `:key` suffix when the **key** of the
   * row is the problem.
   */
  readonly key: string;
  /** The name of the field, for the summary of the errors. */
  readonly label: string;
  /** Why the field is not valid. */
  readonly message: string;
}

/** The outcome of the validation of the form. */
export interface CorrectionBuild {
  /**
   * The `proposedChanges` payload.
   *
   * It carries **only** the fields the API applies for the kind of the
   * target, and **only** the ones that change.
   */
  readonly proposedChanges: Record<string, unknown>;
  /** The diff: the current value and the proposed one, field by field. */
  readonly diff: readonly FieldDiff[];
  /** The fields the proposal changes. */
  readonly changed: readonly string[];
  /** The fields that are not valid. */
  readonly invalid: readonly InvalidField[];
  /** `true` when the proposal changes at least one field. */
  readonly hasChanges: boolean;
  /** `true` when the form may be sent. */
  readonly valid: boolean;
}

/** The key of an attribute row in the invalid fields. */
export function attributeFieldKey(rowId: string): string {
  return `attributes.${rowId}`;
}

/** The key of the **key** of an attribute row in the invalid fields. */
export function attributeKeyFieldKey(rowId: string): string {
  return `${attributeFieldKey(rowId)}:key`;
}

/** `true` when the value is one the editor can propose. */
export function isEditableValue(value: unknown): boolean {
  return (
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  );
}

/** The type of a value, as the editor shows it. */
export function valueTypeOf(value: unknown): AttributeValueType {
  if (typeof value === 'number') {
    return 'number';
  }
  if (typeof value === 'boolean') {
    return 'checkbox';
  }
  return 'text';
}

/**
 * The rows of the editor for the attributes of the target.
 *
 * The rows are sorted by key, so the editor is stable between two opens.
 */
export function initialAttributeRows(
  attributes: Readonly<Record<string, unknown>>,
  newId: () => string
): AttributeRow[] {
  return Object.keys(attributes)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => attributeRow(attributes[key], key, newId()));
}

/** The row of an attribute the target already carries. */
function attributeRow(current: unknown, key: string, id: string): AttributeRow {
  const editable = isEditableValue(current);

  return {
    id,
    key,
    type: valueTypeOf(current),
    text: editable ? String(current) : formatDeltaValue(current),
    checked: current === true,
    current,
    exists: true,
    editable
  };
}

/** Adds an empty row at the end of the editor. */
export function appendAttributeRow(
  rows: readonly AttributeRow[],
  newId: () => string
): AttributeRow[] {
  return [
    ...rows,
    {
      id: newId(),
      key: '',
      type: 'text',
      text: '',
      checked: false,
      current: undefined,
      exists: false,
      editable: true
    }
  ];
}

/**
 * Changes the declared type of a row.
 *
 * The value of the row is re-read in the new type: a boolean that becomes a
 * text is `true`, a number that becomes a text is `3`. A value that the new
 * type cannot hold (a text that becomes a number) keeps what the user typed
 * — the coercion refuses it and the form says why.
 */
export function retypeAttributeRow(row: AttributeRow, type: AttributeValueType): AttributeRow {
  if (row.type === type) {
    return row;
  }

  const next: AttributeRow = { ...row, type };

  if (type === 'checkbox') {
    next.checked = row.current === true;
    next.text = '';
    return next;
  }

  next.checked = false;

  if (row.current !== undefined && row.current !== null && typeof row.current !== 'object') {
    next.text = String(row.current);
  }

  return next;
}

/** The outcome of the coercion of a row. */
export type RowCoercion =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string };

/**
 * Coerces the raw input of a row into the value that is proposed.
 *
 * The value of the row is `undefined` when the row carries no value: a text
 * that is empty, or a number that is empty. A row without a value is not
 * sent.
 */
export function coerceAttributeRow(row: AttributeRow): RowCoercion {
  switch (row.type) {
    case 'text': {
      const text = row.text.trim();
      return text === '' ? { ok: true, value: undefined } : { ok: true, value: text };
    }

    case 'number': {
      const text = row.text.trim();
      if (text === '') {
        return { ok: true, value: undefined };
      }
      const parsed = Number(text);
      if (!Number.isFinite(parsed)) {
        return { ok: false, message: 'This attribute must be a number.' };
      }
      return { ok: true, value: parsed };
    }

    case 'checkbox': {
      return { ok: true, value: row.checked };
    }

    default: {
      return { ok: false, message: 'This attribute has an unknown kind.' };
    }
  }
}

/**
 * Builds the delta of the proposal and the diff that shows it.
 *
 * The delta carries only the fields the API applies for the kind of the
 * target, and only the ones that change. The diff lists **every** field the
 * proposal touches — the changed ones and the untouched ones — because a
 * proposal nobody can read is a proposal nobody can judge.
 */
export function buildCorrection(
  snapshot: CorrectionSnapshot,
  draft: CorrectionDraft
): CorrectionBuild {
  const invalid: InvalidField[] = [];
  const proposedChanges: Record<string, unknown> = {};
  const diff: FieldDiff[] = [];

  if (snapshot.kind === 'NODE' && draft.kind === 'NODE') {
    buildNodeFields(snapshot, draft, proposedChanges, diff, invalid);
  } else if (snapshot.kind === 'EDGE' && draft.kind === 'EDGE') {
    buildEdgeFields(snapshot, draft, proposedChanges, diff, invalid);
  }

  // The justification is a field of the request, not of the delta.
  if (draft.justification.length > CORRECTION_JUSTIFICATION_MAX_LENGTH) {
    invalid.push({
      key: 'justification',
      label: 'Justification',
      message: `The justification must be at most ${CORRECTION_JUSTIFICATION_MAX_LENGTH} characters.`
    });
  }

  const attributes = buildAttributes(snapshot.attributes, draft.rows, invalid);

  if (Object.keys(attributes).length > 0) {
    proposedChanges['attributes'] = attributes;
  }

  // The diff of the attributes: the state the target will be in once the
  // delta is merged into it.
  const merged: Record<string, unknown> = { ...snapshot.attributes, ...attributes };

  for (const key of Object.keys(merged).sort((left, right) => left.localeCompare(right))) {
    const current = snapshot.attributes[key];
    const proposed = merged[key];

    diff.push({
      field: `attributes.${key}`,
      label: key,
      current: formatDeltaValue(current),
      proposed: formatProposedValue(current, proposed),
      changed: !sameValue(current, proposed)
    });
  }

  const changed = diff.filter((entry) => entry.changed).map((entry) => entry.field);

  return {
    proposedChanges,
    diff,
    changed,
    invalid,
    hasChanges: Object.keys(proposedChanges).length > 0,
    valid: invalid.length === 0 && Object.keys(proposedChanges).length > 0
  };
}

/** The fields of a node: the title and the description. */
function buildNodeFields(
  snapshot: Extract<CorrectionSnapshot, { kind: 'NODE' }>,
  draft: Extract<CorrectionDraft, { kind: 'NODE' }>,
  proposedChanges: Record<string, unknown>,
  diff: FieldDiff[],
  invalid: InvalidField[]
): void {
  const title = draft.title.trim();
  const titleValid =
    title.length >= CORRECTION_TITLE_MIN_LENGTH &&
    title.length <= CORRECTION_TITLE_MAX_LENGTH;

  if (!titleValid) {
    invalid.push({
      key: 'title',
      label: 'Title',
      message: `The title must be between ${CORRECTION_TITLE_MIN_LENGTH} and ${CORRECTION_TITLE_MAX_LENGTH} characters.`
    });
  }

  const titleChanged = title !== snapshot.title;

  diff.push({
    field: 'title',
    label: 'Title',
    current: formatDeltaValue(snapshot.title),
    proposed: title,
    changed: titleChanged
  });

  if (titleChanged && titleValid) {
    proposedChanges['title'] = title;
  }

  // A description that is empty and a description that is missing mean the
  // same thing: the node has no description.
  const description = draft.description.trim();
  const descriptionChanged = (snapshot.description ?? '') !== description;

  diff.push({
    field: 'description',
    label: 'Description',
    current: formatDeltaValue(snapshot.description),
    proposed: description === '' ? '(empty)' : description,
    changed: descriptionChanged
  });

  if (descriptionChanged) {
    // The API reads the description with `??`: an empty string clears the
    // text, a missing one would keep it.
    proposedChanges['description'] = description;
  }
}

/** The fields of a relation: the relation key. */
function buildEdgeFields(
  snapshot: Extract<CorrectionSnapshot, { kind: 'EDGE' }>,
  draft: Extract<CorrectionDraft, { kind: 'EDGE' }>,
  proposedChanges: Record<string, unknown>,
  diff: FieldDiff[],
  invalid: InvalidField[]
): void {
  const relationKey = draft.relationKey.trim();
  const relationKeyValid =
    relationKey.length >= CORRECTION_RELATION_KEY_MIN_LENGTH &&
    relationKey.length <= CORRECTION_RELATION_KEY_MAX_LENGTH;

  if (!relationKeyValid) {
    invalid.push({
      key: 'relationKey',
      label: 'Relation key',
      message: `The relation key must be between ${CORRECTION_RELATION_KEY_MIN_LENGTH} and ${CORRECTION_RELATION_KEY_MAX_LENGTH} characters.`
    });
  }

  const changed = relationKey !== snapshot.relationKey;

  diff.push({
    field: 'relationKey',
    label: 'Relation key',
    current: formatDeltaValue(snapshot.relationKey),
    proposed: relationKey,
    changed
  });

  if (changed && relationKeyValid) {
    proposedChanges['relationKey'] = relationKey;
  }
}

/**
 * The attributes of the delta.
 *
 * Only the attributes that **change** are in it: an attribute the proposal
 * leaves as it is would claim a change that is not one.
 */
function buildAttributes(
  existing: Readonly<Record<string, unknown>>,
  rows: readonly AttributeRow[],
  invalid: InvalidField[]
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  const seen = new Set<string>();

  for (const row of rows) {
    const key = row.key.trim();

    if (key === '') {
      // A blank row carries nothing.
      continue;
    }

    if (!row.editable) {
      // The value is not one the editor can propose: the row is left alone.
      continue;
    }

    if (seen.has(key)) {
      // Two rows for the same attribute: the editor of an attribute the
      // target already carries is the row that is prefilled with it.
      invalid.push({
        key: attributeKeyFieldKey(row.id),
        label: `The attribute “${key}”`,
        message: 'Two rows carry the same key.'
      });
      continue;
    }

    seen.add(key);

    const exists = Object.prototype.hasOwnProperty.call(existing, key);

    const coerced = coerceAttributeRow(row);

    if (!coerced.ok) {
      invalid.push({
        key: attributeFieldKey(row.id),
        label: `The attribute “${key}”`,
        message: coerced.message
      });
      continue;
    }

    if (coerced.value === undefined) {
      if (exists) {
        // The API merges the attributes: it cannot remove one.
        invalid.push({
          key: attributeFieldKey(row.id),
          label: `The attribute “${key}”`,
          message:
            'An existing attribute cannot be emptied: the API merges the attributes, it cannot remove one.'
        });
      }
      continue;
    }

    if (exists && sameValue(existing[key], coerced.value)) {
      // Unchanged: it is not part of the delta.
      continue;
    }

    attributes[key] = coerced.value;
  }

  return attributes;
}

/** `true` when two values are the same for the diff. */
function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (typeof left === 'object' || typeof right === 'object') {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Renders a proposed value for the diff.
 *
 * The type is added when it differs from the type of the current value: a
 * boolean `true` that becomes the text `true` is a change, and the reader
 * must see it.
 */
function formatProposedValue(current: unknown, proposed: unknown): string {
  const text = formatDeltaValue(proposed);

  if (typeof current === typeof proposed) {
    return text;
  }

  return `${text} (${typeName(proposed)})`;
}

/** The name of the type of a value. */
function typeName(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'list';
  }
  if (typeof value === 'object') {
    return 'object';
  }
  if (typeof value === 'boolean') {
    return 'checkbox';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  return 'text';
}
