/**
 * The public surface of the internationalisation.
 *
 * The interface speaks **Spanish by default** and English on demand. The
 * Spanish dictionary is the source of truth of the shape and of the copy;
 * the English dictionary has exactly the same shape.
 */

export {
  DEFAULT_LOCALE,
  LOCALES,
  flatten,
  formatDate,
  formatNumber,
  interpolate,
  richSegments,
  type DeepKeys,
  type Dictionary,
  type FlatDictionary,
  type Locale,
  type Message,
  type RichSegment,
  type Translate,
  type TranslationKey,
  type TranslationParams
} from './dictionary';
export {
  LocaleState,
  LOCALE_COOKIE_NAME,
  dictionaries,
  isLocale,
  resolveLocale,
  writeLocaleCookie
} from './locale.svelte';
export { displayName } from './display-name';
export {
  statusDictionaries,
  statusLabel,
  type StatusDictionary,
  type StatusLabels,
  type StatusScope,
  type StatusValue
} from './statuses';
export { en } from './locales/en';
export { es } from './locales/es';
