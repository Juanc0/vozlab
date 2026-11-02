/**
 * The language of the tests.
 *
 * The components read the language of the interface from the Svelte
 * context, exactly as they do in the application: a test that renders a
 * screen must provide it, or the screen refuses to render.
 *
 * The tests speak the **default** language of the interface — Spanish —
 * because that is the copy the user reads.
 */

import { LocaleState, type Locale } from '$lib/i18n';
import { LOCALE_CONTEXT_KEY } from '$lib/state/context';

/** The language of the tests: the default of the interface. */
export const TEST_LOCALE: Locale = 'es';

/** The context of a screen that speaks the default language. */
export function localeContext(locale: Locale = TEST_LOCALE): Map<unknown, unknown> {
  return new Map<unknown, unknown>([[LOCALE_CONTEXT_KEY, new LocaleState(locale)]]);
}

/**
 * The context of a screen: the state of the application and the language.
 *
 * The language is added to the entries that are already there, so a test
 * does not have to know the key of the locale.
 */
export function contextWithLocale(
  entries: Iterable<[unknown, unknown]>,
  locale: Locale = TEST_LOCALE
): Map<unknown, unknown> {
  const context = new Map<unknown, unknown>(entries);
  context.set(LOCALE_CONTEXT_KEY, new LocaleState(locale));
  return context;
}
