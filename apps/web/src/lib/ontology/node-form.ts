/**
 * The node form, built from the active ontology (FR-06).
 *
 * The form is **not** hard-coded: the fields of a node are the active
 * datatype properties of the class the user picked, and the API stores them
 * as they are — the server does **not** validate them. This module is
 * therefore the validator: it decides which field exists, what kind of
 * input it needs, whether it is required and what its value must look like.
 *
 * Everything here is pure: no fetch, no DOM. The component renders what this
 * module says and the tests exercise it directly.
 */

import type {
  DatatypeKind,
  DatatypePropertyDto,
  OntologyResponseDto,
  ObjectPropertyDto
} from '$lib/api/types';

/**
 * The node's own fields.
 *
 * They are **top-level** in the API contract (`title`, `description`), not
 * attributes: an ontology property that re-declares one of them is skipped,
 * because rendering both would ask the user for the same value twice.
 */
export const FIXED_NODE_FIELDS = ['title', 'description'] as const;

/** One of the node's own fields. */
export type FixedNodeField = (typeof FIXED_NODE_FIELDS)[number];

/** The shortest title the API accepts (`CreateNodeSchema`). */
export const TITLE_MIN_LENGTH = 3;

/** The longest title the API accepts (`CreateNodeSchema`). */
export const TITLE_MAX_LENGTH = 255;

/** `true` when the ontology property re-declares one of the node's own fields. */
export function isFixedNodeField(systemKey: string): boolean {
  return (FIXED_NODE_FIELDS as readonly string[]).includes(systemKey);
}

/**
 * The name of a metamodel element.
 *
 * `displayNames` is a locale map: `en` wins, otherwise the first entry that
 * carries a name. The fallback is the system key, which is always there.
 */
export function displayNameOf(
  displayNames: Record<string, string> | null | undefined,
  fallback: string
): string {
  if (!displayNames) {
    return fallback;
  }

  const english = displayNames['en'];
  if (typeof english === 'string' && english.trim() !== '') {
    return english;
  }

  for (const value of Object.values(displayNames)) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  return fallback;
}

/** A class of the ontology, ready to be offered in a picker. */
export interface ClassOption {
  /** The `systemKey` — the `typeKey` of the node. */
  readonly systemKey: string;
  /** The name shown to the user. */
  readonly label: string;
  /** The description of the class, when it has one. */
  readonly description: string | null;
}

/** The active classes of the ontology, ordered by name. */
export function classOptions(ontology: OntologyResponseDto | null): ClassOption[] {
  if (ontology === null) {
    return [];
  }

  return ontology.classes
    .map((cls) => ({
      systemKey: cls.systemKey,
      label: displayNameOf(cls.displayNames, cls.systemKey),
      description: descriptionOf(cls.descriptions)
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

/** The first description of a locale map, or `null`. */
export function descriptionOf(descriptions: Record<string, string> | null | undefined): string | null {
  if (!descriptions) {
    return null;
  }

  const english = descriptions['en'];
  if (typeof english === 'string' && english.trim() !== '') {
    return english;
  }

  for (const value of Object.values(descriptions)) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  return null;
}

/**
 * One attribute field of the form.
 *
 * It is the projection of an active datatype property: the key it is stored
 * under, the scalar kind that drives the input and the value, whether it is
 * required and what it starts with.
 */
export interface AttributeField {
  /** The key of the value in the `attributes` object. */
  readonly systemKey: string;
  /** The label of the field. */
  readonly label: string;
  /** The help text of the field, when the ontology has one. */
  readonly description: string | null;
  /** The scalar kind — it drives the input and the coercion. */
  readonly datatype: DatatypeKind;
  /** `true` when the ontology declares the attribute mandatory. */
  readonly isRequired: boolean;
  /** The value the field starts with. */
  readonly defaultValue: unknown;
  /** The enum domain; `null` for every other datatype. */
  readonly allowedValues: readonly string[] | null;
}

/**
 * An ontology property the form does **not** render.
 *
 * Only one reason exists today: the property re-declares one of the node's
 * own fields. The form says so — a silent omission would look like a bug.
 */
export interface SkippedProperty {
  /** The key of the property that was skipped. */
  readonly systemKey: string;
  /** The label of the property. */
  readonly label: string;
  /** Why the property was skipped. */
  readonly reason: 'fixed-field';
}

/** The model of the node form for one class. */
export interface NodeFormModel {
  /** The class the form builds. */
  readonly classKey: string;
  /** The name of the class. */
  readonly label: string;
  /** The attribute fields, in a stable order. */
  readonly fields: readonly AttributeField[];
  /** The properties that were skipped, and why. */
  readonly skipped: readonly SkippedProperty[];
}

/**
 * Builds the form of one class.
 *
 * The fields are the active datatype properties whose `domainClassKey` is the
 * class; the ones that re-declares `title` or `description` are skipped and
 * reported.
 */
export function buildNodeForm(
  ontology: OntologyResponseDto | null,
  classKey: string
): NodeFormModel {
  const cls = ontology?.classes.find((candidate) => candidate.systemKey === classKey) ?? null;
  const properties = (ontology?.datatypeProperties ?? []).filter(
    (property) => property.domainClassKey === classKey
  );

  const fields: AttributeField[] = [];
  const skipped: SkippedProperty[] = [];

  for (const property of [...properties].sort((left, right) =>
    left.systemKey.localeCompare(right.systemKey)
  )) {
    const label = displayNameOf(property.displayNames, property.systemKey);

    if (isFixedNodeField(property.systemKey)) {
      skipped.push({ systemKey: property.systemKey, label, reason: 'fixed-field' });
      continue;
    }

    fields.push(toAttributeField(property));
  }

  return {
    classKey,
    label: cls === null ? classKey : displayNameOf(cls.displayNames, classKey),
    fields,
    skipped
  };
}

/** Projects an ontology property onto an attribute field. */
function toAttributeField(property: DatatypePropertyDto): AttributeField {
  return {
    systemKey: property.systemKey,
    label: displayNameOf(property.displayNames, property.systemKey),
    description: descriptionOf(property.descriptions),
    datatype: property.datatype,
    isRequired: property.isRequired,
    defaultValue: property.defaultValue,
    allowedValues: Array.isArray(property.allowedValues) ? [...property.allowedValues] : null
  };
}

/**
 * The value a field starts with.
 *
 * The form keeps the raw input of the user as a string (that is what the
 * DOM gives) — except for a checkbox, which is a boolean from the start.
 */
export function initialFieldValue(field: AttributeField): string | boolean {
  if (field.datatype === 'boolean') {
    return field.defaultValue === true;
  }

  if (field.defaultValue === undefined || field.defaultValue === null) {
    return '';
  }

  if (field.datatype === 'date') {
    return toDateInputValue(field.defaultValue);
  }

  return String(field.defaultValue);
}

/**
 * The value of a date default in the format of `<input type="date">`.
 *
 * Anything that is not a date is dropped: the field starts empty rather than
 * with a value the browser would refuse.
 */
export function toDateInputValue(value: unknown): string {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    return '';
  }

  const text = value instanceof Date ? value.toISOString() : value;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (iso !== null) {
    return iso[1];
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
}

/** The result of coercing a raw input into the value of an attribute. */
export type CoercionResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string };

/**
 * Coerces the raw input of a field into the value that is stored.
 *
 * The API stores the attributes as JSONB without looking at them, so this
 * is the only place where the kind of a value is enforced.
 */
export function coerceAttributeValue(field: AttributeField, raw: unknown): CoercionResult {
  switch (field.datatype) {
    case 'string': {
      if (typeof raw !== 'string') {
        return { ok: false, message: 'This attribute must be a text.' };
      }
      return { ok: true, value: raw.trim() };
    }

    case 'number': {
      if (typeof raw === 'number') {
        return Number.isFinite(raw)
          ? { ok: true, value: raw }
          : { ok: false, message: 'This attribute must be a number.' };
      }

      if (typeof raw !== 'string' || raw.trim() === '') {
        return { ok: false, message: 'This attribute must be a number.' };
      }

      const parsed = Number(raw.trim());
      if (!Number.isFinite(parsed)) {
        return { ok: false, message: 'This attribute must be a number.' };
      }
      return { ok: true, value: parsed };
    }

    case 'boolean': {
      if (typeof raw === 'boolean') {
        return { ok: true, value: raw };
      }
      if (raw === 'true' || raw === 'false') {
        return { ok: true, value: raw === 'true' };
      }
      return { ok: false, message: 'This attribute must be true or false.' };
    }

    case 'date': {
      if (typeof raw !== 'string' || !isDateInput(raw)) {
        return { ok: false, message: 'This attribute must be a date (YYYY-MM-DD).' };
      }
      return { ok: true, value: raw };
    }

    case 'enum': {
      const allowed = field.allowedValues ?? [];
      if (typeof raw !== 'string' || !allowed.includes(raw)) {
        return {
          ok: false,
          message:
            allowed.length === 0
              ? 'This attribute has no allowed value.'
              : `This attribute must be one of: ${allowed.join(', ')}.`
        };
      }
      return { ok: true, value: raw };
    }

    default: {
      return { ok: false, message: 'This attribute has an unknown kind.' };
    }
  }
}

/** `true` when the text is a real `YYYY-MM-DD` date. */
export function isDateInput(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }

  const [year, month, day] = text.split('-').map((part) => Number(part));
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** The raw value of a field, as the form keeps it. */
export type RawFieldValue = string | boolean;

/** The values of the whole form. */
export type FormValues = Record<string, RawFieldValue>;

/** The outcome of the validation of the form. */
export interface FormValidation {
  /** The messages of the invalid fields, keyed by the field key. */
  readonly errors: Readonly<Record<string, string>>;
  /** The attributes to send, keyed by the `systemKey` of the property. */
  readonly attributes: Readonly<Record<string, unknown>>;
  /** `true` when the form may be sent. */
  readonly valid: boolean;
}

/**
 * Validates the node form and builds the attributes of the node.
 *
 * The fixed fields are checked against the API's own contract (the title is
 * 3 to 255 characters); the attributes are checked against the kind the
 * ontology declares. An attribute that is empty and optional is left out of
 * the payload — an absent attribute and an empty one are not the same thing.
 */
export function validateNodeForm(
  model: NodeFormModel,
  values: FormValues,
  fixed: { title: string; description: string }
): FormValidation {
  const errors: Record<string, string> = {};

  const title = fixed.title.trim();
  if (title.length < TITLE_MIN_LENGTH) {
    errors['title'] = `The title must be at least ${TITLE_MIN_LENGTH} characters.`;
  } else if (title.length > TITLE_MAX_LENGTH) {
    errors['title'] = `The title must be at most ${TITLE_MAX_LENGTH} characters.`;
  }

  const attributes: Record<string, unknown> = {};

  for (const field of model.fields) {
    const raw = values[field.systemKey];
    const isEmpty =
      raw === undefined ||
      raw === '' ||
      (typeof raw === 'string' && raw.trim() === '');

    if (isEmpty) {
      if (field.isRequired) {
        errors[field.systemKey] = 'This attribute is required.';
      }
      continue;
    }

    const coerced = coerceAttributeValue(field, raw);
    if (!coerced.ok) {
      errors[field.systemKey] = coerced.message;
      continue;
    }

    // A boolean that is not required and is false carries no information:
    // it is the absence of the attribute, not the value `false`.
    if (field.datatype === 'boolean' && coerced.value === false && !field.isRequired) {
      continue;
    }

    attributes[field.systemKey] = coerced.value;
  }

  return { errors, attributes, valid: Object.keys(errors).length === 0 };
}

/**
 * The relation of the ontology that fits a source class (FR-08).
 *
 * The API enforces the domain/range rule of a relation when the relation
 * key resolves to an active object property. The form therefore offers only
 * the relations whose domain is the class of the source node — a form that
 * offers an invalid relation teaches the user to fail.
 *
 * A **symmetric** relation is the one exception the API makes: it accepts
 * both directions, so a relation whose *range* is the class of the source is
 * valid too.
 */
export function relationsForSource(
  ontology: OntologyResponseDto | null,
  sourceClassKey: string
): ObjectPropertyDto[] {
  if (ontology === null) {
    return [];
  }

  return ontology.objectProperties
    .filter(
      (property) =>
        property.domainClassKey === sourceClassKey ||
        (property.isSymmetric && property.rangeClassKey === sourceClassKey)
    )
    .sort((left, right) => left.systemKey.localeCompare(right.systemKey));
}

/**
 * `true` when the relation accepts the pair of classes.
 *
 * This mirrors the rule of the API (`ObjectProperty.accepts`): the same-type
 * pair is refused unless the relation allows a self relation, a symmetric
 * relation accepts both directions and a directional one only its own.
 *
 * The server re-checks the rule: this is a courtesy to the user, never the
 * authority.
 */
export function relationAccepts(
  property: ObjectPropertyDto,
  sourceClassKey: string,
  targetClassKey: string
): boolean {
  if (!property.allowsSelfRelation && sourceClassKey === targetClassKey) {
    return false;
  }

  if (property.isSymmetric) {
    return (
      (sourceClassKey === property.domainClassKey && targetClassKey === property.rangeClassKey) ||
      (sourceClassKey === property.rangeClassKey && targetClassKey === property.domainClassKey)
    );
  }

  return sourceClassKey === property.domainClassKey && targetClassKey === property.rangeClassKey;
}
