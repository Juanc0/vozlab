import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AppShell from '$lib/components/AppShell.svelte';
import { localeContext } from './harness/locale';

describe('AppShell', () => {
  it('renders the landmarks a screen reader needs', () => {
    render(AppShell, { props: { }, context: localeContext() });

    // The bar of the shell is gone: the page has a main region and a footer,
    // and no banner over them.
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('offers a skip link to the main content', () => {
    render(AppShell, { props: { }, context: localeContext() });

    const skipLink = screen.getByRole('link', { name: /saltar al contenido/i });
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('keeps the way into a narrow navigation over the page', () => {
    render(AppShell, { props: { navigation: true }, context: localeContext() });

    // It is a button over the page and not a row of chrome: below `lg` the
    // navigation is a drawer, and the drawer needs a way in.
    expect(screen.getByRole('button', { name: /abrir el menú|menú/i })).toBeInTheDocument();
  });
});
