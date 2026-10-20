/**
 * The server hook of the PWA.
 *
 * It does **one** thing: it rewrites the language the document announces.
 *
 * The template of the application (`src/app.html`) ships `lang="es"` — the
 * default of the interface. The cookie of the visitor (`vozlab_locale`) says
 * which language the document is really written in, and the hook puts that
 * language in the `<html>` element of the rendered document.
 *
 * The rewrite happens **on the server**, before the document reaches the
 * browser: a screen reader reads the text with the voice of the right
 * language from the very first byte, and the client never has to correct
 * the document after the fact.
 */

import type { Handle } from '@sveltejs/kit';
import { LOCALE_COOKIE_NAME, resolveLocale } from '$lib/i18n';

export const handle: Handle = async ({ event, resolve }) => {
  const locale = resolveLocale(event.cookies.get(LOCALE_COOKIE_NAME));

  return resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replace(/<html lang="[^"]*"/, () => `<html lang="${locale}"`)
  });
};
