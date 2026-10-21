/**
 * The language of the tests.
 *
 * The components read the language of the interface from the Svelte
 * context, exactly as they do in the application: a test that renders a
 * screen must provide it, or the screen refuses to render.
 *
 * The same is true of the state of the **panels**: the navigation, the
 * inspector and the root picker read it from the context, and the harness
 * provides the default state — the state of a reader who has never folded
 * anything.
 *
 * The tests speak the **default** language of the interface — Spanish —
 * because that is the copy the user reads.
 */

import { LocaleState, type Locale } from '$lib/i18n';
import { LOCALE_CONTEXT_KEY, PANELS_CONTEXT_KEY } from '$lib/state/context';
import {
  DEFAULT_PANEL_PREFERENCES,
  PanelsState,
  type PanelPreferences
} from '$lib/state/panels.svelte';

/** The language of the tests: the default of the interface. */
export const TEST_LOCALE: Locale = 'es';

/**
 * The state of the panels of a test.
 *
 * The default is the state of the interface: the inspector is folded, the
 * panel of the root picker is folded and the navigation is a column.
 */
export function panelsContext(preferences: Partial<PanelPreferences> = {}): PanelsState {
  return new PanelsState({ ...DEFAULT_PANEL_PREFERENCES, ...preferences });
}

/** The context of a screen that speaks the default language. */
export function localeContext(locale: Locale = TEST_LOCALE): Map<unknown, unknown> {
  return new Map<unknown, unknown>([
    [LOCALE_CONTEXT_KEY, new LocaleState(locale)],
    [PANELS_CONTEXT_KEY, panelsContext()]
  ]);
}

/**
 * The context of a screen: the state of the application and the language.
 *
 * The language is added to the entries that are already there, so a test
 * does not have to know the key of the locale. The state of the panels is
 * added too — unless the test brought its own.
 */
export function contextWithLocale(
  entries: Iterable<[unknown, unknown]>,
  locale: Locale = TEST_LOCALE
): Map<unknown, unknown> {
  const context = new Map<unknown, unknown>(entries);
  context.set(LOCALE_CONTEXT_KEY, new LocaleState(locale));

  if (!context.has(PANELS_CONTEXT_KEY)) {
    context.set(PANELS_CONTEXT_KEY, panelsContext());
  }

  return context;
}
