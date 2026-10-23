import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import {
  LOCALE_COOKIE_NAME,
  LocaleState,
  dictionaries,
  resolveLocale
} from '$lib/i18n';
import { handle } from '../src/hooks.server';
import { load } from '../src/routes/+layout.server';
import LocaleHarness from './harness/LocaleHarness.svelte';
import { contextWithLocale, localeContext } from './harness/locale';
import { governanceHarness } from './harness/governance';
import {
  API_CLIENT_CONTEXT_KEY,
  SESSION_CONTEXT_KEY,
  WORKSPACE_CONTEXT_KEY
} from '$lib/state/context';

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

// The column of the navigation reads the route to mark the current one.
const { pageState } = vi.hoisted(() => ({
  pageState: { url: new URL('http://localhost:5173/') }
}));
vi.mock('$app/state', () => ({ page: pageState }));

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

// The environment of the runtime is read by the layout load; the test
// does not care about it.
vi.mock('$env/dynamic/public', () => ({ env: {} }));

/** The document the server renders, with the language the cookie says. */
async function renderDocument(cookie: string | undefined): Promise<string> {
  const response = await handle({
    event: { cookies: { get: () => cookie }, locals: {} },
    resolve: async (_event: unknown, options?: { transformPageChunk?: (chunk: { html: string; done: boolean }) => string | undefined }) => {
      const html = '<!doctype html><html lang="es"><head></head><body></body></html>';
      const transformed = await options?.transformPageChunk?.({ html, done: true });
      return new Response(transformed ?? html);
    }
  } as never);

  return response.text();
}

/** The locale the server reads from the cookie of the visitor. */
function serverLocale(cookie: string | undefined): string {
  const result = load({
    cookies: { get: () => cookie },
    locals: {}
  } as never) as { locale: string };

  return result.locale;
}

describe('the language of the interface', () => {
  it('is Spanish when there is no cookie', () => {
    expect(resolveLocale(undefined)).toBe('es');
    expect(resolveLocale(null)).toBe('es');
    expect(serverLocale(undefined)).toBe('es');
  });

  it('is the one the cookie says', () => {
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('es')).toBe('es');
    expect(serverLocale('en')).toBe('en');
  });

  it('falls back to Spanish when the cookie says something else', () => {
    // A cookie of an older version, a hand-edited one: the interface must
    // come up in a language, never in none.
    expect(resolveLocale('fr')).toBe('es');
    expect(serverLocale('fr')).toBe('es');
  });

  it('is written in the `lang` attribute of the document', async () => {
    expect(await renderDocument(undefined)).toContain('<html lang="es">');
    expect(await renderDocument('en')).toContain('<html lang="en">');
  });
});

describe('the selector of the language', () => {
  function renderHarness(): void {
    const { client, session, workspace } = governanceHarness();

    render(LocaleHarness, {
      context: contextWithLocale([
        [SESSION_CONTEXT_KEY, session],
        [WORKSPACE_CONTEXT_KEY, workspace],
        [API_CLIENT_CONTEXT_KEY, client]
      ])
    });
  }

  it('is a labelled control with the options in their own language', () => {
    renderHarness();

    const select = screen.getByLabelText('Idioma') as HTMLSelectElement;

    expect(select).toBeInTheDocument();
    expect(Array.from(select.options).map((option) => option.textContent?.trim())).toEqual([
      'Español',
      'English'
    ]);
  });

  it('switches the visible text of the page', async () => {
    renderHarness();

    // The shell speaks Spanish by default.
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toBeInTheDocument();
    expect(
      screen.getByText('VozLab — cliente de co-creación para el grafo de conocimiento.')
    ).toBeInTheDocument();

    const select = screen.getByLabelText('Idioma') as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: 'en' } });

    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();
    expect(
      screen.getByText('VozLab — co-creation client for the knowledge graph.')
    ).toBeInTheDocument();

    // And back to Spanish.
    await fireEvent.change(select, { target: { value: 'es' } });

    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toBeInTheDocument();
  });

  it('changes the `lang` attribute of the document', async () => {
    renderHarness();

    const select = screen.getByLabelText('Idioma') as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: 'en' } });

    // A screen reader reads the text with the voice of the right language.
    expect(document.documentElement.lang).toBe('en');
  });

  it('keeps the choice in the cookie, and the server reads it back', async () => {
    renderHarness();

    const select = screen.getByLabelText('Idioma') as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: 'en' } });

    // The preference is a cookie, never the storage of the browser.
    expect(document.cookie).toContain(`${LOCALE_COOKIE_NAME}=en`);
    expect(window.localStorage.length).toBe(0);

    // The next full load renders in the language the visitor asked for.
    expect(serverLocale('en')).toBe('en');
    expect(await renderDocument('en')).toContain('<html lang="en">');
  });
});

describe('the state of the language', () => {
  it('reads the copy of the language it is in', () => {
    const locale = new LocaleState('es');
    expect(locale.t('login.heading')).toBe(dictionaries.es['login.heading']);

    locale.setLocale('en');
    expect(locale.t('login.heading')).toBe(dictionaries.en['login.heading']);
  });

  it('is Spanish by default', () => {
    expect(new LocaleState().locale).toBe('es');
  });
});
