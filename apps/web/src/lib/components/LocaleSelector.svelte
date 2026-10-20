<script lang="ts">
  /**
   * The selector of the language.
   *
   * It sits in the sidebar, next to the selector of the workspace: the two
   * pick what the visitor sees, and both are preferences of the tab.
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

<div class="space-y-1.5">
  <label
    for="locale-select"
    class="block text-xs font-semibold tracking-wide text-ink-muted uppercase"
  >
    {t('locale.label')}
  </label>

  <select
    id="locale-select"
    class="w-full rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink"
    value={locale.locale}
    onchange={handleChange}
  >
    {#each LOCALES as option (option)}
      <option value={option}>{names[option]}</option>
    {/each}
  </select>
</div>
