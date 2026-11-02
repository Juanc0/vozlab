import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AppShell from '$lib/components/AppShell.svelte';
import { localeContext } from './harness/locale';

describe('AppShell', () => {
  it('renders the landmarks a screen reader needs', () => {
    render(AppShell, { props: { title: 'VozLab' }, context: localeContext() });

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('offers a skip link to the main content', () => {
    render(AppShell, { props: { title: 'VozLab' }, context: localeContext() });

    const skipLink = screen.getByRole('link', { name: /saltar al contenido/i });
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('shows the product name', () => {
    render(AppShell, { props: { title: 'VozLab' }, context: localeContext() });

    expect(screen.getByText('VozLab')).toBeInTheDocument();
  });
});
