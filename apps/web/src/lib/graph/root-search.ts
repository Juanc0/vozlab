/**
 * The search of the **root picker**.
 *
 * The list of the newest nodes of the workspace is long, and the reader
 * knows the title of the node they are looking for: the search filters the
 * list while they type.
 *
 * The match is **case- and accent-insensitive** — «problema» finds
 * «Problema», «Problema» and «PROBLEMA» — and it is done in the **language
 * of the interface**, so the rules of the language are the ones of the
 * reader and not the ones of the machine.
 *
 * The module is pure: no DOM, no state. It is the same module the tests
 * read.
 */

/** The marks that carry the accent of a letter. */
const COMBINING_MARKS = /\p{M}/gu;

/**
 * The form of a text the search compares.
 *
 * The accents are removed and the case is folded with the rules of the
 * language of the interface.
 */
export function normalizeForSearch(value: string, locale: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLocaleLowerCase(locale);
}

/**
 * Whether a title answers to a query.
 *
 * An **empty** query answers everything: a search that finds nothing when
 * nothing was written is a search that is broken.
 */
export function matchesTitle(title: string, query: string, locale: string): boolean {
  const needle = normalizeForSearch(query, locale).trim();

  if (needle === '') {
    return true;
  }

  return normalizeForSearch(title, locale).includes(needle);
}

/** The nodes whose title answers to a query. */
export function filterNodesByTitle<T extends { title: string }>(
  nodes: readonly T[],
  query: string,
  locale: string
): T[] {
  return nodes.filter((node) => matchesTitle(node.title, query, locale));
}
