import { env } from '$env/dynamic/public';
import { DEFAULT_API_BASE_URL, normalizeApiBaseUrl } from '$lib/config/api-base-url';
import { LOCALE_COOKIE_NAME, resolveLocale } from '$lib/i18n';
import { DEFAULT_PANEL_PREFERENCES } from '$lib/state/panels.svelte';
import type { LayoutServerLoad } from './$types';

/**
 * Runtime configuration is read from the environment **on the server** so the
 * container image can be re-pointed at another API without a rebuild. The
 * value is handed to the browser through the layout data.
 *
 * The language of the interface comes from the cookie of the visitor: the
 * server renders the document in the language the visitor asked for, so
 * there is no flash of the wrong one and the first render of the client
 * matches the one of the server.
 */
export const load: LayoutServerLoad = ({ cookies, locals }) => {
  const configured = env.PUBLIC_API_BASE_URL;
  const apiBaseUrl = normalizeApiBaseUrl(configured);

  if (
    configured &&
    configured.trim() !== '' &&
    apiBaseUrl === DEFAULT_API_BASE_URL &&
    configured.trim() !== DEFAULT_API_BASE_URL
  ) {
    console.warn(
      `[vozlab/web] Ignoring invalid PUBLIC_API_BASE_URL "${configured}"; falling back to ${DEFAULT_API_BASE_URL}.`
    );
  }

  return {
    apiBaseUrl,
    locale: resolveLocale(cookies.get(LOCALE_COOKIE_NAME)),
    // The state of the panels: the `handle` hook read it from the cookie of
    // the visitor, and the document is rendered already folded.
    panels: locals.panels ?? DEFAULT_PANEL_PREFERENCES
  };
};
