import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AppShell from '$lib/components/AppShell.svelte';
import { localeContext } from './harness/locale';

describe('AppShell', () => {
  it('renders the landmarks a screen reader needs, and the bar is not one of them', () => {
    render(AppShell, { props: {}, context: localeContext() });

    // The bar is gone: the mark and the name live in the navigation column.
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('offers a skip link to the main content', () => {
    render(AppShell, { props: {}, context: localeContext() });

    const skipLink = screen.getByRole('link', { name: /saltar al contenido/i });
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });


});
