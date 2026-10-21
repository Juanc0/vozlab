import { describe, expect, it } from 'vitest';
import { en, es } from '$lib/i18n';

/** The copy of a dictionary, flattened to its dotted paths. */
function flat(node: unknown, prefix = '', into: Record<string, string> = {}): Record<string, string> {
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value === 'string') {
      into[path] = value;
    } else {
      flat(value, path, into);
    }
  }
  return into;
}

/**
 * The copy that is the same in the two languages.
 *
 * They are the names of the languages (each one is written in its own
 * language), the dash of an empty value and the **names of the engines** of
 * the comparison: they are proper nouns, and a proper noun is not
 * translated. Everything else is translated.
 */
const IDENTICAL: readonly string[] = [
  'common.emptyValue',
  'locale.es',
  'locale.en',
  'engines.panelDagreName',
  'engines.panelFcoseName',
  'engines.panelSigmaName'
];

describe('the two dictionaries', () => {
  it('have exactly the same keys', () => {
    // The compiler already enforces it (`en.ts` is declared as
    // `Dictionary<typeof es>`): the test says it out loud.
    const spanish = flat(es);
    const english = flat(en);

    expect(Object.keys(english).sort()).toEqual(Object.keys(spanish).sort());
  });

  it('have no empty value', () => {
    for (const [key, value] of Object.entries(flat(es))) {
      expect(value.trim(), `${key} is empty`).not.toBe('');
    }
  });

  it('translate every copy that has a Spanish one', () => {
    const spanish = flat(es);
    const english = flat(en);

    const untranslated = Object.keys(spanish).filter(
      (key) => spanish[key] === english[key] && !IDENTICAL.includes(key)
    );

    expect(untranslated).toEqual([]);
  });
});
