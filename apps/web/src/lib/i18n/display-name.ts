/**
 * The name of a thing, in the language of the reader.
 *
 * The API does not negotiate the language: it sends the **whole map** of the
 * display names of a class or of a relation
 * (`{"en": "Problem", "es": "Problema"}`) and the client picks the name of
 * its own language.
 *
 * The chain is short and it always ends in something:
 *
 * 1. the **exact locale** (`es-MX`);
 * 2. its **base language** (`es`);
 * 3. the **fallback** — the key of the system (`Problem`, `RELATES_TO`).
 *
 * A name that is missing, empty or only whitespace falls through to the
 * next step: a blank name is not a name. The result is never an empty
 * string, because the fallback is the key of the system.
 *
 * The module is pure: no DOM, no state, no API.
 */

/**
 * The name of a class or of a relation, in the language of the reader.
 *
 * @param names The map of the display names, by language.
 * @param locale The language of the interface (`es`, `en`, `es-MX`, …).
 * @param fallback The key of the system — the last resort.
 */
export function displayName(
  names: Record<string, string>,
  locale: string,
  fallback: string
): string {
  const exact = readName(names, locale);

  if (exact !== null) {
    return exact;
  }

  // `es-MX` falls back to `es`; `es` falls back to itself (already read).
  const base = locale.split('-')[0] ?? '';

  if (base !== '' && base !== locale) {
    const baseName = readName(names, base);

    if (baseName !== null) {
      return baseName;
    }
  }

  return fallback;
}

/**
 * The name of a language, or `null` when there is none.
 *
 * A name that is missing, empty or only whitespace is not a name: it is
 * `null`, and the caller falls through to the next step of the chain.
 */
function readName(names: Record<string, string>, locale: string): string | null {
  const name = names[locale];

  if (typeof name !== 'string') {
    return null;
  }

  return name.trim() === '' ? null : name;
}
