/**
 * The server hook of the PWA.
 *
 * It does **two** things, and both of them are about the first paint:
 *
 * 1. it rewrites the language the document announces;
 * 2. it reads the state of the **panels** — the navigation, the inspector
 *    and the root picker — from the cookie of the visitor.
 *
 * The template of the application (`src/app.html`) ships `lang="es"` — the
 * default of the interface. The cookie of the visitor (`vozlab_locale`) says
 * which language the document is really written in, and the hook puts that
 * language in the `<html>` element of the rendered document.
 *
 * The rewrite happens **on the server**, before the document reaches the
 * browser: a screen reader reads the text with the voice of the right
 * language from the very first byte, and the client never has to correct the
 * document after the fact.
 *
 * The panels are read the same way: the cookie `vozlab_panels` says which
 * panels the reader left folded, and the document is rendered already folded
 * — a navigation that opens and closes again after the hydration is a
 * flicker, and the reader's preference deserves a first paint that is
 * already the truth.
 */

import type { Handle } from '@sveltejs/kit';
import { LOCALE_COOKIE_NAME, resolveLocale } from '$lib/i18n';
import { PANELS_COOKIE_NAME, parsePanelPreferences } from '$lib/state/panels.svelte';

export const handle: Handle = async ({ event, resolve }) => {
  const locale = resolveLocale(event.cookies.get(LOCALE_COOKIE_NAME));

  // The state of the panels travels to the layout, which hands it to the
  // state of the application: the first paint is already the state the
  // reader left behind.
  event.locals.panels = parsePanelPreferences(event.cookies.get(PANELS_COOKIE_NAME));

  return resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replace(/<html lang="[^"]*"/, () => `<html lang="${locale}"`)
  });
};
