<script lang="ts">
  /**
   * The selector of the language.
   *
   * It lives in the chrome of the shell: the language changes the whole
   * interface, including the screens that have no navigation (the sign-in
   * and the join), so it does not belong in the navigation column.
   *
   * The **options are written in their own language** — "Español" and
   * "English" — and not in the language of the interface: a person who does
   * not read the current language must still find theirs.
   *
   * The choice is kept in a cookie (`vozlab_locale`), so the next full load
   * renders the document in that language. No reload is triggered: the
   * session lives in memory and a reload would cost the visitor their
   * sign-in.
   */
  import { LOCALES, type Locale } from '$lib/i18n';
  import { getLocaleState } from '$lib/state/context';

  const locale = getLocaleState();
  const t = locale.t;

  /** The name of every language, in that language. */
  const names: Readonly<Record<Locale, string>> = $derived({
    es: t('locale.es'),
    en: t('locale.en')
  });

  function handleChange(event: Event): void {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }
    locale.setLocale(select.value as Locale);
  }
</script>

<!--
  The control carries its own name for the screen reader: the bar is a
  line of chrome and a visible label would be a second sentence about the
  interface.
-->
<select
  id="locale-select"
  aria-label={t('locale.label')}
  class="field w-auto py-0"
  value={locale.locale}
  onchange={handleChange}
>
  {#each LOCALES as option (option)}
    <option value={option}>{names[option]}</option>
  {/each}
</select>
