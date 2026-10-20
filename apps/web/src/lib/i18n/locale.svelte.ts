/**
 * The locale of the interface.
 *
 * The state lives in the Svelte context, next to the session and the
 * workspace — **not** in a module-level singleton: on the server a
 * singleton would leak the language of one visitor into the answer of
 * another one.
 *
 * The preference is kept in a **cookie** (`vozlab_locale`), not in
 * `localStorage` and not in `sessionStorage`:
 *
 * - the cookie travels to the server, so the document is rendered in the
 *   right language and there is no flash of the wrong one;
 * - the cookie is not a secret: the language is a preference, and a
 *   preference belongs to the browser, not to the session.
 */

import { browser } from '$app/environment';
import {
  DEFAULT_LOCALE,
  LOCALES,
  flatten,
  interpolate,
  type FlatDictionary,
  type Locale,
  type TranslationKey,
  type TranslationParams,
  type Translate
} from './dictionary';
import { en } from './locales/en';
import { es } from './locales/es';

/** The name of the cookie that carries the language of the visitor. */
export const LOCALE_COOKIE_NAME = 'vozlab_locale';

/** How long the preference of the language is kept. */
const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** The dictionaries, indexed by the locale and flattened to their paths. */
export const dictionaries: Readonly<Record<Locale, FlatDictionary>> = {
  es: flatten(es),
  en: flatten(en)
};

/** `true` when `value` is one of the locales of the interface. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * The locale of a cookie value.
 *
 * An unknown value — a cookie of an older version, a hand-edited one, a
 * truncated one — falls back to the default: the interface must come up in
 * a language, never in none.
 */
export function resolveLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Writes the preference of the language in the cookie.
 *
 * The cookie is **not** `HttpOnly`: the browser writes it when the visitor
 * picks a language, and the server reads it to render the document.
 */
export function writeLocaleCookie(locale: Locale): void {
  if (!browser) {
    return;
  }

  document.cookie =
    `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

/**
 * The language of the interface.
 *
 * The instance is created per request on the server and per tab in the
 * browser; it is handed to the tree through the Svelte context API.
 */
export class LocaleState {
  /** The language of the interface. */
  locale = $state<Locale>(DEFAULT_LOCALE);

  constructor(initial: Locale = DEFAULT_LOCALE) {
    this.locale = initial;
  }

  /**
   * The copy of the interface.
   *
   * The function reads the locale when it is **called**, so a copy that is
   * captured once (in the script of a component) still follows the change
   * of the language.
   */
  t = $derived.by(
    (): Translate =>
      (key: TranslationKey, params?: TranslationParams): string =>
        interpolate(dictionaries[this.locale][key], params)
  );

  /**
   * Changes the language of the interface.
   *
   * The state changes **and** the preference is written in the cookie, so
   * the next full load renders in the same language. No reload is
   * triggered: the session lives in memory and a reload would cost the
   * visitor their sign-in.
   */
  setLocale(locale: Locale): void {
    this.locale = locale;

    if (!browser) {
      return;
    }

    // The document announces the language it is written in: a screen reader
    // reads the text with the voice of the right language.
    document.documentElement.lang = locale;
    writeLocaleCookie(locale);
  }
}
