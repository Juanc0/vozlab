/**
 * The types of the dictionaries and the helpers that read them.
 *
 * The Spanish dictionary (`$lib/i18n/locales/es`) is the **source of
 * truth**: it holds the shape of the interface copy and the default copy
 * itself. The English dictionary declares the same shape
 * (`Dictionary<typeof es>`), so a missing key, a misspelled key or a
 * leftover key is a **compile error** — the two dictionaries cannot drift.
 *
 * The keys are the **dotted paths** of the nested object
 * (`login.title`, `graph.canvas.bound`, …). The nested object is what makes
 * the dictionary readable; the dotted paths are what the code uses.
 */

import { es } from './locales/es';

/** The locales the interface speaks. */
export const LOCALES = ['es', 'en'] as const;

/** One of the locales of the interface. */
export type Locale = (typeof LOCALES)[number];

/** The locale of the interface when nothing says otherwise. */
export const DEFAULT_LOCALE: Locale = 'es';

/**
 * A dictionary with the same shape as the reference one, with every string
 * widened to `string`.
 *
 * The widening is what makes the **values** free while the **shape** stays
 * strict: `en.ts` can say anything, but it must say it in exactly the keys
 * of `es.ts`.
 */
export type Dictionary<T> = {
  [K in keyof T]: T[K] extends string ? string : Dictionary<T[K]>;
};

/**
 * The dotted paths of a nested object.
 *
 * A leaf is its own key; an object is the union of the paths of its
 * properties, prefixed with the name of the property.
 */
export type DeepKeys<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${DeepKeys<T[K]>}`;
}[keyof T & string];

/** Every key of the interface — the union of the paths of `es.ts`. */
export type TranslationKey = DeepKeys<typeof es>;

/** The values that are put into a copy that carries placeholders. */
export type TranslationParams = Readonly<Record<string, string | number>>;

/** A dictionary whose keys are the dotted paths. */
export type FlatDictionary = Readonly<Record<TranslationKey, string>>;

/**
 * A message of the interface: the key of its copy and its values.
 *
 * The pure modules of the app (the validators) answer with a **message** and
 * not with a sentence: the copy lives in the dictionary and the screen
 * renders it with `t()`. This is what keeps a validator free of the
 * language of the interface.
 */
export interface Message {
  /** The key of the copy in the dictionary. */
  readonly key: TranslationKey;
  /** The values that are put into the placeholders of the copy. */
  readonly params?: TranslationParams;
}

/** The shape of the function that reads the dictionary. */
export type Translate = (key: TranslationKey, params?: TranslationParams) => string;

/**
 * Flattens a nested dictionary into its dotted paths.
 *
 * The nested shape is what a human reads; the flat shape is what the code
 * reads (`t('login.title')`).
 */
export function flatten(dictionary: unknown): FlatDictionary {
  const flat: Record<string, string> = {};
  walk(dictionary, '', flat);
  return flat as FlatDictionary;
}

/** Walks a nested dictionary and writes its leaves into `into`. */
function walk(node: unknown, prefix: string, into: Record<string, string>): void {
  if (typeof node === 'string') {
    into[prefix] = node;
    return;
  }

  if (typeof node !== 'object' || node === null) {
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    walk(value, prefix === '' ? key : `${prefix}.${key}`, into);
  }
}

/**
 * Replaces the `{placeholder}` of a copy with the values it is given.
 *
 * A placeholder without a value is left as it is: a copy that shows
 * `{count}` is a bug the reader must see, not a silent empty.
 */
export function interpolate(template: string, params?: TranslationParams): string {
  if (params === undefined) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * Formats a number with the conventions of the locale.
 *
 * The thousand separator and the decimal mark follow the locale: `1.234,5`
 * in Spanish, `1,234.5` in English.
 *
 * The locale is a **string** and not the union of the locales of the
 * interface: the pure modules of the graph read the language of the reader
 * as it is — `es-MX` is a language too — and `Intl` knows it.
 */
export function formatNumber(locale: string, value: number): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** A piece of a copy that carries an emphasis. */
export interface RichSegment {
  /** The text of the piece. */
  readonly text: string;
  /** `true` when the piece is in bold (`**…**`). */
  readonly strong: boolean;
  /** `true` when the piece is in code (`` `…` ``). */
  readonly code: boolean;
}

/**
 * Splits a copy into its pieces, with the kind of each one.
 *
 * The markers are the contract of the dictionaries: `**…**` is the bold and
 * `` `…` `` is the code. A marker that is not closed is left as plain text
 * — the reader must see the copy, not an empty piece.
 */
export function richSegments(template: string): RichSegment[] {
  const segments: RichSegment[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = pattern.exec(template);

  while (match !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: template.slice(lastIndex, match.index),
        strong: false,
        code: false
      });
    }

    if (match[1] !== undefined) {
      segments.push({ text: match[1], strong: true, code: false });
    } else {
      segments.push({ text: match[2] ?? '', strong: false, code: true });
    }

    lastIndex = match.index + match[0].length;
    match = pattern.exec(template);
  }

  if (lastIndex < template.length) {
    segments.push({ text: template.slice(lastIndex), strong: false, code: false });
  }

  return segments;
}

/**
 * Formats an instant with the conventions of the locale.
 *
 * A value that is not a date is returned as it is: the reader must see what
 * the API sent, not an empty string.
 */
export function formatDate(locale: string, value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date);
}
